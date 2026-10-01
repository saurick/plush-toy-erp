#!/usr/bin/env node
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { loadDevPorts } from "./dev-ports.mjs";
import { findListenerPids, readProcessCwd } from "./dev-process-inspection.mjs";
import {
  readActiveRuntimeBundle,
  readRuntimeSource,
  runtimeServerVersion,
  verifyLocalRuntimeIdentity,
} from "./local-runtime-bundle.mjs";
import { readRuntimeBuildInputs } from "./local-runtime-build-inputs.mjs";
import { checkLocalDatabaseMigrations } from "./local-runtime-preflight.mjs";
import {
  acquireDatabaseMigrationExecutionLock,
  readDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
} from "./qa/dev-database-migration-operation-store.mjs";

const exec = promisify(execFile);
const WORKSPACE_RUNTIME_PURPOSES = new Set([
  "workspace-runtime-restart",
  "workspace-runtime-stop",
]);
const RESTART_LOCK_WAIT_TIMEOUT_MS = 120_000;
const RESTART_LOCK_WAIT_INTERVAL_MS = 250;

function restartOwnerAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function migrationOperationBusyError(error) {
  const blocked = new Error(
    "当前有数据库迁移或迁移页后端恢复正在执行；本次工作区后端操作未开始，请等待该操作完成后重试",
  );
  blocked.code = error?.code || "DATABASE_MIGRATION_LOCKED";
  return blocked;
}

export async function acquireWorkspaceRuntimeLock(
  store,
  operationId,
  {
    purpose = "workspace-runtime-restart",
    acquire = acquireDatabaseMigrationExecutionLock,
    read = readDatabaseMigrationExecutionLock,
    releaseWait = (milliseconds) => delay(milliseconds, undefined, { signal }),
    clock = () => Date.now(),
    timeoutMs = RESTART_LOCK_WAIT_TIMEOUT_MS,
    intervalMs = RESTART_LOCK_WAIT_INTERVAL_MS,
    progress = () => {},
    processAlive = restartOwnerAlive,
    signal,
  } = {},
) {
  const startedAt = clock();
  let waiting = false;
  while (true) {
    signal?.throwIfAborted();
    try {
      acquire(store, operationId, {
        purpose,
      });
      return { waited: waiting };
    } catch (error) {
      if (error?.code !== "DATABASE_MIGRATION_LOCKED") throw error;
      let current;
      try {
        current = read(store);
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        throw readError;
      }
      // The previous restart may finish between the failed create and this
      // read. Retry acquisition instead of misclassifying the released lock.
      if (!current) continue;
      if (!WORKSPACE_RUNTIME_PURPOSES.has(current?.purpose)) {
        throw migrationOperationBusyError(error);
      }
      if (!processAlive(current.pid)) {
        const interrupted = new Error(
          `之前的后端操作进程 PID=${current.pid} 已退出，但执行锁仍在；请在迁移恢复页刷新状态、核对中断结果后重试；本次未停止当前后端`,
        );
        interrupted.code = "WORKSPACE_RUNTIME_RESTART_INTERRUPTED";
        throw interrupted;
      }
      if (!waiting) {
        waiting = true;
        progress(
          `另一条后端启停命令正在执行（操作进程 PID=${current.pid}）；排队等待该命令完成后继续本次重启`,
        );
      }
      if (clock() - startedAt >= timeoutMs) {
        const timeout = new Error(
          `另一条工作区后端操作超过 ${Math.ceil(timeoutMs / 1000)} 秒仍未完成；本次未停止当前后端，请检查正在运行的重启终端`,
        );
        timeout.code = "WORKSPACE_RUNTIME_RESTART_WAIT_TIMEOUT";
        throw timeout;
      }
      await releaseWait(intervalMs);
    }
  }
}

export async function stopRuntimeListeners(
  root,
  operationId,
  {
    execute = exec,
    ports = loadDevPorts,
    readLock = readDatabaseMigrationExecutionLock,
  } = {},
) {
  const store = resolveDatabaseMigrationOperationStore(root);
  const lock = readLock(store);
  if (!lock || lock.operationId !== operationId || lock.pid !== process.pid) {
    throw new Error("停止后端需要当前进程持有对应操作锁；未停止任何服务");
  }
  return execute(
    "bash",
    [
      path.join(root, "scripts/dev-listener-stop.sh"),
      root,
      String(ports(root).http),
    ],
    {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
}

export async function stopWorkspaceRuntime(
  root,
  {
    signal,
    progress = (line) => console.log(`[local-runtime] ${line}`),
    stop = stopRuntimeListeners,
  } = {},
) {
  const operationId = randomUUID();
  const store = resolveDatabaseMigrationOperationStore(root);
  await acquireWorkspaceRuntimeLock(store, operationId, {
    purpose: "workspace-runtime-stop",
    signal,
    progress,
  });
  try {
    signal?.throwIfAborted();
    // Complete an initiated stop before releasing the lock, even on Ctrl+C.
    await stop(root, operationId);
    progress("后端已停止；日志终端继续等待下一次启动。再次启动使用 make run。");
  } finally {
    releaseDatabaseMigrationExecutionLock(store, operationId);
  }
}

export async function readWorkspaceRuntimeStatus(
  root,
  {
    ports = loadDevPorts,
    listeners = findListenerPids,
    cwd = readProcessCwd,
    active = readActiveRuntimeBundle,
    source = readRuntimeSource,
    buildInputs = readRuntimeBuildInputs,
    fetchImpl = fetch,
    preflight = checkLocalDatabaseMigrations,
    checkDatabase = true,
    checkBuild = true,
  } = {},
) {
  const port = ports(root).http;
  const store = path.join(
    root,
    "output/dev-workbench/database-migration-operations",
  );
  const status = {
    state: "stopped",
    port,
    lock: readDatabaseMigrationExecutionLock(store),
    database: "unchecked",
    sourceCurrent: null,
    buildCurrent: null,
  };
  let bundle;
  try {
    bundle = active(root);
  } catch {
    status.artifactIssue = "现有制品完整性检查未通过";
  }
  if (bundle)
    Object.assign(status, {
      bundleId: bundle.id,
      version: runtimeServerVersion(bundle),
      migrationVersion: bundle.migrationVersion,
      startedAt: bundle.runtime?.startedAt,
      startSource: bundle.runtime?.startSource,
    });
  const pids = await listeners(port);
  if (pids.length) {
    status.state = "unavailable";
    status.pid = pids[0];
    status.owned =
      pids.length === 1 &&
      bundle?.runtime?.pid === pids[0] &&
      (await cwd(pids[0])) === path.join(bundle.directory, "source/server");
    if (!status.owned)
      status.issue = "端口占用者无法确认为当前已验证后端；未停止任何服务";
    else {
      const origin = `http://127.0.0.1:${port}`;
      try {
        for (const endpoint of ["healthz", "readyz"]) {
          const response = await fetchImpl(`${origin}/${endpoint}`, {
            signal: AbortSignal.timeout(5000),
            redirect: "manual",
          });
          if (
            !response.ok ||
            (await response.text()).trim() !==
              (endpoint === "healthz" ? "ok" : "ready")
          )
            throw new Error("后端健康或就绪检查未通过");
        }
        await verifyLocalRuntimeIdentity(
          bundle,
          origin,
          "plush_erp",
          fetchImpl,
        );
        status.state = "running";
      } catch {
        status.issue = "后端健康、就绪或运行身份检查未通过";
      }
    }
  }
  if (checkDatabase) {
    try {
      await preflight({ writeLine: () => {} });
      status.database = "passed";
    } catch {
      status.database = "blocked";
      status.databaseIssue = "数据库或工作区迁移预检未通过；请查看迁移恢复页";
    }
  }
  if (bundle) {
    try {
      const current = await source(root);
      status.sourceCurrent =
        current.backendFingerprint === bundle.backendSourceFingerprint;
      if (checkBuild)
        status.buildCurrent =
          (await buildInputs(root, current)).backend ===
          bundle.components?.backend?.fingerprint;
    } catch {
      status.sourceCurrent = false;
      status.buildCurrent = false;
    }
  }
  return status;
}

export function reportWorkspaceRuntimeStatus(status, write = console.log) {
  const labels = {
    running: "运行中",
    stopped: "已停止",
    unavailable: "未就绪",
  };
  write(
    `[local-runtime] 后端${labels[status.state]}；端口=${status.port}${status.pid ? ` PID=${status.pid}` : ""}`,
  );
  if (status.bundleId) {
    write(
      `[local-runtime] 运行版本=${status.version}；启动时间=${status.startedAt ? new Date(status.startedAt).toLocaleString("zh-CN", { hour12: false }) : "未知"}；来源=${status.startSource || "未记录"}`,
    );
    write(
      `[local-runtime] 当前后端源码${status.sourceCurrent && status.buildCurrent !== false ? "已生效" : "尚未证明生效，执行 make dev_restart 加载当前代码"}；migration=${status.migrationVersion}`,
    );
  }
  if (status.database !== "unchecked")
    write(
      `[local-runtime] 数据库预检=${status.database === "passed" ? "通过" : "未通过，请打开迁移恢复页"}`,
    );
  if (status.lock)
    write(
      `[local-runtime] 当前操作=${status.lock.purpose}；PID=${status.lock.pid}；开始时间=${status.lock.acquiredAt}`,
    );
  for (const issue of [
    status.issue,
    status.artifactIssue,
    status.databaseIssue,
  ])
    if (issue) write(`[local-runtime] ${issue}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv.includes("--status")) {
    readWorkspaceRuntimeStatus(path.resolve(import.meta.dirname, ".."))
      .then((status) => reportWorkspaceRuntimeStatus(status))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  } else {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      process.on(signal, cancel);
    stopWorkspaceRuntime(path.resolve(import.meta.dirname, ".."), {
      signal: controller.signal,
    })
      .catch((error) => {
        console.error(
          controller.signal.aborted
            ? "已取消停止操作；可执行 make dev_status 查看服务状态"
            : error.message,
        );
        process.exitCode = controller.signal.aborted ? 130 : 1;
      })
      .finally(() => {
        for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
          process.off(signal, cancel);
      });
  }
}
