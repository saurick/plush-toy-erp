#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  defaultAPIOrigin,
  evaluateMigrationStatus,
  isLoopbackAPIOrigin,
  normalizeAPIOrigin,
} from "./local-runtime-preflight-core.mjs";

export {
  evaluateMigrationStatus,
  isLoopbackAPIOrigin,
  normalizeAPIOrigin,
} from "./local-runtime-preflight-core.mjs";

const execFileAsync = promisify(execFileCallback);
const repoRoot = path.resolve(import.meta.dirname, "..");
const serverRoot = path.join(repoRoot, "server");
const expectedHealthBodies = Object.freeze({
  healthz: "ok",
  readyz: "ready",
});

function writeLine(runtime, message) {
  const writer =
    runtime.writeLine || ((line) => process.stdout.write(`${line}\n`));
  writer(message);
}

function commandFailureDetails(error) {
  const output = [error?.stdout, error?.stderr]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!output) return "";
  return output.length > 4000 ? `${output.slice(0, 4000)}\n...` : output;
}

async function runCommand(
  command,
  args,
  options,
  runtime,
  failureMessage,
  { includeOutput = false } = {},
) {
  const execFile = runtime.execFile || execFileAsync;
  try {
    return await execFile(command, args, options);
  } catch (error) {
    const details = includeOutput ? commandFailureDetails(error) : "";
    throw new Error(details ? `${failureMessage}\n${details}` : failureMessage);
  }
}

export async function checkLocalDatabaseMigrations(runtime = {}) {
  await runCommand(
    "bash",
    [path.join(repoRoot, "scripts/qa/db-guard.sh")],
    {
      cwd: repoRoot,
      env: { ...process.env, SKIP_DB_GUARD: "" },
      maxBuffer: 4 * 1024 * 1024,
    },
    runtime,
    "工作区 schema 与 versioned migration 不一致；请先修复 db-guard 报告的问题",
    { includeOutput: true },
  );
  writeLine(runtime, "[local-preflight] 工作区 schema/migration 守卫通过");

  const dbURLResult = await runCommand(
    "go",
    ["run", "./cmd/dburl", "-conf", "./configs/dev/config.yaml"],
    {
      cwd: serverRoot,
      env: process.env,
      maxBuffer: 1024 * 1024,
    },
    runtime,
    "无法解析本地开发数据库配置；请检查 config.local.yaml 或 POSTGRES_DSN",
  );
  const databaseURL = String(dbURLResult.stdout || "").trim();
  if (!databaseURL) {
    throw new Error("本地开发数据库地址为空");
  }

  const atlasResult = await runCommand(
    "atlas",
    [
      "migrate",
      "status",
      "--dir",
      "file://internal/data/model/migrate",
      "--url",
      databaseURL,
      "--format",
      "{{ json . }}",
    ],
    {
      cwd: serverRoot,
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
    },
    runtime,
    "无法读取本地开发数据库 migration 状态；未执行任何 migration",
  );

  let status;
  try {
    status = JSON.parse(String(atlasResult.stdout || ""));
  } catch {
    throw new Error("Atlas migration 状态输出无法识别；未执行任何 migration");
  }

  const result = evaluateMigrationStatus(status);
  if (!result.ok) {
    throw new Error(
      `开发数据库 migration 未到最新版本（applied=${result.appliedFiles}/${result.availableFiles}, pending=${result.pendingFiles}）；请先审查迁移，启动预检不会自动 apply`,
    );
  }

  writeLine(
    runtime,
    `[local-preflight] 开发数据库 migration 已是最新版本（${result.currentVersion}，${result.appliedFiles}/${result.availableFiles}）`,
  );
  return result;
}

async function fetchEndpoint(url, expectedBody, runtime) {
  const fetchImpl = runtime.fetch || globalThis.fetch;
  const timeoutMs = runtime.endpointTimeoutMs || 10_000;
  const retryIntervalMs = runtime.retryIntervalMs || 250;
  const sleep =
    runtime.sleep ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unreachable";

  while (Date.now() <= deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(2_000, timeoutMs),
    );
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: "text/plain" },
      });
      const body = String(await response.text()).trim();
      if (response.ok && body === expectedBody) {
        return { status: response.status, body };
      }
      lastStatus = `HTTP ${response.status}`;
    } catch {
      lastStatus = "unreachable";
    } finally {
      clearTimeout(timeout);
    }

    if (Date.now() <= deadline) {
      await sleep(retryIntervalMs);
    }
  }

  throw new Error(`${url} 未就绪（${lastStatus}）`);
}

export async function checkBackendReadiness(apiOrigin, runtime = {}) {
  const normalizedOrigin = normalizeAPIOrigin(apiOrigin);
  for (const [endpoint, expectedBody] of Object.entries(expectedHealthBodies)) {
    const url = new URL(`/${endpoint}`, `${normalizedOrigin}/`).toString();
    await fetchEndpoint(url, expectedBody, runtime);
    writeLine(runtime, `[local-preflight] 后端 ${endpoint} 通过：${url}`);
  }
  return { apiOrigin: normalizedOrigin, ready: true };
}

export async function runWebRuntimePreflight(
  { apiOrigin = defaultAPIOrigin, frontendOnly = false } = {},
  runtime = {},
) {
  const normalizedOrigin = normalizeAPIOrigin(apiOrigin);
  if (frontendOnly) {
    writeLine(
      runtime,
      "[local-preflight] 前端降级模式：已显式跳过数据库与后端检查；登录/RPC 不可作为有效验证证据",
    );
    return { complete: false, frontendOnly: true, apiOrigin: normalizedOrigin };
  }

  const checkDatabase = runtime.checkDatabase || checkLocalDatabaseMigrations;
  const checkBackend = runtime.checkBackend || checkBackendReadiness;
  if (isLoopbackAPIOrigin(normalizedOrigin)) {
    await checkDatabase(runtime);
  } else {
    writeLine(
      runtime,
      `[local-preflight] 使用外部后端 ${normalizedOrigin}；本地不读取其数据库，migration 由目标环境发布门禁证明`,
    );
  }
  await checkBackend(normalizedOrigin, runtime);
  return { complete: true, frontendOnly: false, apiOrigin: normalizedOrigin };
}

function parseArgs(argv) {
  const options = {
    mode: "database",
    apiOrigin: process.env.API_ORIGIN || defaultAPIOrigin,
    frontendOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--mode") {
      options.mode = next || "";
      index += 1;
    } else if (arg === "--api-origin") {
      options.apiOrigin = next || "";
      index += 1;
    } else if (arg === "--frontend-only") {
      options.frontendOnly = true;
    } else if (arg !== "--") {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (!["database", "web"].includes(options.mode)) {
    throw new Error(`未知 preflight mode：${options.mode}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "database") {
    await checkLocalDatabaseMigrations();
    return;
  }
  await runWebRuntimePreflight(options);
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`[local-preflight] ${error.message}\n`);
    process.exit(1);
  });
}
