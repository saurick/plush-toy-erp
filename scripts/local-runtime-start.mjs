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
import { readRuntimeBuildInputs } from "./local-runtime-build-inputs.mjs";
import { checkLocalDatabaseMigrations } from "./local-runtime-preflight.mjs";
import { isDevPortAvailable, loadDevPorts } from "./dev-ports.mjs";
import {
  formatRuntimeLogLine,
  presentRuntimeConsole,
  writeRuntimeProgress,
} from "./local-runtime-console.mjs";
import {
  createDevDatabaseMigrationRuntime,
  executeCommand,
  redactDatabaseMigrationDiagnostic,
} from "../web/dev-server/devDatabaseMigrationRuntime.mjs";
import {
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
} from "./qa/dev-database-migration-operation-store.mjs";

import {
  acquireWorkspaceRuntimeLock,
  readWorkspaceRuntimeStatus,
} from "./local-runtime-control.mjs";

const SOURCE_CHANGE_RETRY_LIMIT = 5;

function workspaceRuntimeSourceUnstableError(retryLimit) {
  const unstable = new Error(
    `工作区在连续 ${retryLimit + 1} 次构建与切换验证期间仍有后端代码或运行配置写入；当前已验证后端保持运行，但无法证明最新后端代码已启动，请等待相关修改完成后重试`,
  );
  unstable.code = "WORKSPACE_RUNTIME_SOURCE_UNSTABLE";
  return unstable;
}

export async function startWorkspaceRuntime(
  root,
  {
    preflight = checkLocalDatabaseMigrations,
    build = buildRuntimeBundle,
    execute = executeCommand,
    progress = writeRuntimeProgress,
    createRuntime = createDevDatabaseMigrationRuntime,
    ports = loadDevPorts,
    source = readRuntimeSource,
    buildInputs = readRuntimeBuildInputs,
    sourceChangeRetryLimit = SOURCE_CHANGE_RETRY_LIMIT,
    ensure = false,
    inspect = readWorkspaceRuntimeStatus,
    startSource = "终端",
    forceBackendBuild = false,
    isPortAvailable = isDevPortAvailable,
    signal,
  } = {},
) {
  const operationId = randomUUID();
  const startedAt = Date.now();
  const store = resolveDatabaseMigrationOperationStore(root);
  await acquireWorkspaceRuntimeLock(store, operationId, { progress, signal });
  try {
    signal?.throwIfAborted();
    const run = (command, args, options = {}) =>
      execute(command, args, {
        ...options,
        signal:
          signal && options.signal
            ? AbortSignal.any([signal, options.signal])
            : signal || options.signal,
      });
    const httpPort = ports(root).http;
    const reuseListener = async () => {
      if (!ensure || (await isPortAvailable(httpPort))) return null;
      const status = await inspect(root, { checkDatabase: false });
      if (!status.owned)
        throw new Error(
          status.issue || "端口占用者无法确认为本工作区后端；未停止任何服务",
        );
      if (status.state !== "running") return null;
      progress(
        `复用健康后端 PID=${status.pid}；${status.sourceCurrent && status.buildCurrent !== false ? "当前后端代码已生效" : "工作区已有后端变化，执行 make dev_restart 生效"}`,
      );
      return {
        reused: true,
        bundleId: status.bundleId,
        sourceCurrent: status.sourceCurrent,
        buildCurrent: status.buildCurrent,
      };
    };
    // Pending migrations and failed builds must leave the running backend intact.
    let candidateId = operationId;
    let sourceChangeRetries = 0;
    let started = false;
    let runtime;
    while (true) {
      signal?.throwIfAborted();
      progress(
        `正在检查工作区数据库规则与迁移；后端端口=${httpPort}，启动来源=${startSource}`,
      );
      await preflight({ signal, execFile: run });
      signal?.throwIfAborted();
      if (!started) {
        const reused = await reuseListener();
        if (reused) return reused;
      }
      let candidate;
      try {
        candidate = await build(root, candidateId, run, progress, {
          workspaceVerification: "backend",
          scope: "backend",
          forceBackendBuild,
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
      signal?.throwIfAborted();
      if (!started) {
        const reused = await reuseListener();
        if (reused) {
          if (!candidate.reusedBundle)
            rmSync(runtimeBundleDirectory(root, candidate.id), {
              recursive: true,
              force: true,
            });
          return reused;
        }
      }
      signal?.throwIfAborted();
      progress("候选构建完成，正在切换后端并验证 health / ready / business");
      // Once cutover starts, finish its validation before allowing another
      // restart to enter; cancellation must not leave an unverified service.
      runtime ||= createRuntime(root, `http://127.0.0.1:${httpPort}`, {
        openConsole: false,
      });
      let result;
      try {
        result = await runtime.restart(operationId, candidate.id, {
          startSource,
          onProgress: progress,
        });
      } catch (error) {
        if (error.runtimeCutoverStarted && runtime.restorePrevious) {
          progress("候选运行验证未通过，正在核对并恢复之前已验证的后端");
          try {
            const restored = await runtime.restorePrevious(operationId, {
              startSource: "重启恢复",
              onProgress: progress,
            });
            if (restored)
              progress(
                "已恢复之前的后端；当前工作区代码未生效，请检查本次错误",
              );
          } catch {
            progress(
              "原版本恢复未通过检查；业务保持阻断，请在迁移恢复页检查状态",
            );
          }
        }
        throw error;
      }
      started = true;
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
      const buildCurrent =
        !candidate.components?.backend ||
        (currentSource &&
          (await buildInputs(root, currentSource, run)).backend ===
            candidate.components.backend.fingerprint);
      if (
        currentBackendFingerprint === candidateBackendFingerprint &&
        buildCurrent
      ) {
        return {
          ...result,
          reusedBuild: Boolean(candidate.reusedBuild),
          sourceFingerprint: candidate.sourceFingerprint,
          backendSourceFingerprint: candidateBackendFingerprint,
          durationMs: Date.now() - startedAt,
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
    try {
      releaseDatabaseMigrationExecutionLock(store, operationId);
    } catch (error) {
      error.code = "WORKSPACE_RUNTIME_RESTART_LOCK_RELEASE_FAILED";
      throw error;
    }
  }
}

export async function runWorkspaceRuntimeCLI(
  argv,
  {
    root = path.resolve(import.meta.dirname, ".."),
    start = startWorkspaceRuntime,
    present = presentRuntimeConsole,
    interactive = Boolean(process.stdout.isTTY),
    write = console.log,
    signals = process,
  } = {},
) {
  for (const arg of argv) {
    if (
      ![
        "--ensure",
        "--restart",
        "--rebuild",
        "--background",
        "--source=frontend",
      ].includes(arg)
    )
      throw new Error(`不支持的参数：${arg}`);
  }
  if (
    argv.includes("--ensure") &&
    (argv.includes("--restart") || argv.includes("--rebuild"))
  )
    throw new Error("确保运行和重启参数不能同时使用");
  const controller = new AbortController();
  const cancel = () => {
    if (controller.signal.aborted) return;
    write(
      "[local-runtime] 正在取消本次重启；先结束构建子任务，已开始的服务切换会完成核验后释放锁",
    );
    controller.abort();
  };
  const handledSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of handledSignals) signals.on(signal, cancel);
  let result;
  try {
    result = await start(root, {
      ensure: argv.includes("--ensure"),
      forceBackendBuild: argv.includes("--rebuild"),
      startSource: argv.includes("--source=frontend")
        ? "前端启动"
        : process.env.CODEX_THREAD_ID || process.env.CODEX_CI
          ? "Codex"
          : "终端",
      signal: controller.signal,
      progress: (message) => writeRuntimeProgress(message, write),
    });
    controller.signal.throwIfAborted();
  } catch (error) {
    if (
      controller.signal.aborted &&
      error.code !== "WORKSPACE_RUNTIME_RESTART_LOCK_RELEASE_FAILED"
    ) {
      const cancelled = new Error(
        "已取消本次重启；本轮子任务及执行锁已完成清理，可检查服务状态后重试",
      );
      cancelled.code = "WORKSPACE_RUNTIME_RESTART_CANCELLED";
      throw cancelled;
    }
    if (error.runtimeLogFile)
      write(
        `[local-runtime] 本次失败启动的日志：${path.join(root, error.runtimeLogFile)}`,
      );
    if (error.diagnostic) {
      write("[local-runtime] 启动失败诊断：");
      for (const line of redactDatabaseMigrationDiagnostic(error.diagnostic)
        .trim()
        .split("\n"))
        write(formatRuntimeLogLine(line, { color: interactive }));
    }
    throw error;
  } finally {
    for (const signal of handledSignals) signals.off(signal, cancel);
  }
  if (!result.reused) {
    write(
      `[local-runtime] started bundle=${result.bundleId} migration=${result.activeVersion} health=passed ready=passed business=passed；当前后端源码已生效${result.reusedBuild ? "，已跳过编译" : ""}${Number.isFinite(result.durationMs) ? `；总耗时 ${(result.durationMs / 1000).toFixed(1)} 秒` : ""}`,
    );
  }
  // Log viewing starts after the migration/restart lock has been released.
  await present(root, {
    interactive,
    background: argv.includes("--background"),
  }).catch((error) => {
    write(
      `[local-runtime] 后端启动流程已完成，但日志查看不可用：${error.message}；可执行 make dev_logs`,
    );
  });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  runWorkspaceRuntimeCLI(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode =
      error.code === "WORKSPACE_RUNTIME_RESTART_CANCELLED" ? 130 : 1;
  });
}
