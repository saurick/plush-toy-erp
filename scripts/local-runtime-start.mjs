#!/usr/bin/env node
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import {
  buildRuntimeBundle,
  readRuntimeSource,
  runtimeBundleDirectory,
  WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE,
} from "./local-runtime-bundle.mjs";
import { checkLocalDatabaseMigrations } from "./local-runtime-preflight.mjs";
import { loadDevPorts } from "./dev-ports.mjs";
import {
  createDevDatabaseMigrationRuntime,
  executeCommand,
} from "../web/dev-server/devDatabaseMigrationRuntime.mjs";
import {
  acquireDatabaseMigrationExecutionLock,
  readDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
} from "./qa/dev-database-migration-operation-store.mjs";

const WORKSPACE_RUNTIME_RESTART_PURPOSE = "workspace-runtime-restart";
const RESTART_LOCK_WAIT_TIMEOUT_MS = 120_000;
const RESTART_LOCK_WAIT_INTERVAL_MS = 250;
const SOURCE_CHANGE_RETRY_LIMIT = 5;

function migrationOperationBusyError(error) {
  const blocked = new Error(
    "当前有数据库迁移或迁移页后端恢复正在执行；本次工作区后端重启未开始，请等待该操作完成后重试",
  );
  blocked.code = error?.code || "DATABASE_MIGRATION_LOCKED";
  return blocked;
}

function workspaceRuntimeSourceUnstableError(retryLimit) {
  const unstable = new Error(
    `工作区在连续 ${retryLimit + 1} 次构建与切换验证期间仍有后端代码或运行配置写入；当前已验证后端保持运行，但无法证明最新后端代码已启动，请等待相关修改完成后重试`,
  );
  unstable.code = "WORKSPACE_RUNTIME_SOURCE_UNSTABLE";
  return unstable;
}

export async function acquireWorkspaceRuntimeRestartLock(
  store,
  operationId,
  {
    acquire = acquireDatabaseMigrationExecutionLock,
    read = readDatabaseMigrationExecutionLock,
    releaseWait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    clock = () => Date.now(),
    timeoutMs = RESTART_LOCK_WAIT_TIMEOUT_MS,
    intervalMs = RESTART_LOCK_WAIT_INTERVAL_MS,
    progress = () => {},
  } = {},
) {
  const startedAt = clock();
  let waiting = false;
  while (true) {
    try {
      acquire(store, operationId, {
        purpose: WORKSPACE_RUNTIME_RESTART_PURPOSE,
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
      if (current?.purpose !== WORKSPACE_RUNTIME_RESTART_PURPOSE) {
        throw migrationOperationBusyError(error);
      }
      if (!waiting) {
        waiting = true;
        progress("检测到另一条工作区后端重启，等待其安全完成后继续");
      }
      if (clock() - startedAt >= timeoutMs) {
        const timeout = new Error(
          `另一条工作区后端重启超过 ${Math.ceil(timeoutMs / 1000)} 秒仍未完成；本次未停止当前后端，请检查正在运行的重启终端`,
        );
        timeout.code = "WORKSPACE_RUNTIME_RESTART_WAIT_TIMEOUT";
        throw timeout;
      }
      await releaseWait(intervalMs);
    }
  }
}

export async function startWorkspaceRuntime(
  root,
  {
    preflight = checkLocalDatabaseMigrations,
    build = buildRuntimeBundle,
    execute = executeCommand,
    progress = (message) => console.log(`[local-runtime] ${message}`),
    createRuntime = createDevDatabaseMigrationRuntime,
    ports = loadDevPorts,
    source = readRuntimeSource,
    sourceChangeRetryLimit = SOURCE_CHANGE_RETRY_LIMIT,
  } = {},
) {
  const operationId = randomUUID();
  const store = resolveDatabaseMigrationOperationStore(root);
  await acquireWorkspaceRuntimeRestartLock(store, operationId, { progress });
  try {
    // Pending migrations and failed builds must leave the running backend intact.
    let candidateId = operationId;
    let sourceChangeRetries = 0;
    const runtime = createRuntime(root, `http://127.0.0.1:${ports(root).http}`);
    while (true) {
      await preflight();
      let candidate;
      try {
        candidate = await build(root, candidateId, execute, progress, {
          workspaceVerification: "backend",
        });
      } catch (error) {
        if (error?.code !== WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE) throw error;
        rmSync(runtimeBundleDirectory(root, candidateId), {
          recursive: true,
          force: true,
        });
        if (sourceChangeRetries >= sourceChangeRetryLimit) {
          throw workspaceRuntimeSourceUnstableError(sourceChangeRetryLimit);
        }
        sourceChangeRetries += 1;
        progress(
          `检测到构建期间后端代码或运行配置更新，已丢弃旧候选并重新读取最新代码（第 ${sourceChangeRetries}/${sourceChangeRetryLimit} 次重试）`,
        );
        candidateId = randomUUID();
        continue;
      }
      progress(
        "候选构建完成，正在切换后端并验证 health / ready / business",
      );
      const result = await runtime.restart(operationId, candidate.id);
      progress("后端切换与业务验证通过，正在复核最新后端源码");
      let currentSource;
      try {
        currentSource = await source(root);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const candidateBackendFingerprint =
        candidate.backendSourceFingerprint || candidate.sourceFingerprint;
      const currentBackendFingerprint =
        currentSource?.backendFingerprint || currentSource?.fingerprint;
      if (currentBackendFingerprint === candidateBackendFingerprint) {
        return {
          ...result,
          sourceFingerprint: candidate.sourceFingerprint,
          backendSourceFingerprint: candidateBackendFingerprint,
        };
      }
      if (sourceChangeRetries >= sourceChangeRetryLimit) {
        throw workspaceRuntimeSourceUnstableError(sourceChangeRetryLimit);
      }
      sourceChangeRetries += 1;
      progress(
        `检测到后端切换验证期间后端代码或运行配置再次更新，继续构建最新代码（第 ${sourceChangeRetries}/${sourceChangeRetryLimit} 次重试）`,
      );
      candidateId = randomUUID();
    }
  } finally {
    releaseDatabaseMigrationExecutionLock(store, operationId);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  startWorkspaceRuntime(path.resolve(import.meta.dirname, ".."))
    .then((result) => {
      console.log(
        `[local-runtime] started workspace-source=${result.sourceFingerprint} backend-source=${result.backendSourceFingerprint} bundle=${result.bundleId} migration=${result.activeVersion} health=passed ready=passed business=passed`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
