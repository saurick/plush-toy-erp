#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUT_DIR = "output/qa/purchase-receipt-real-write-e2e";
const INPUT_TEMPLATE_SCOPE = "purchase-receipt-real-write-e2e-input-template";
const PREFLIGHT_REPORT_SCOPE = "purchase-receipt-real-write-e2e-preflight-report";
const DEFAULT_PURCHASE_RECEIPT_PG_DB_URL =
  "postgres://postgres:purchase-receipt-local-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable";
const ALLOWED_POSTGRES_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "purchase-receipt-postgres",
  "plush-toy-erp-purchase-receipt-postgres",
  "host.docker.internal",
]);

const usage = `用法:
  node scripts/qa/purchase-receipt-real-write-e2e.mjs [--out <dir>] [--with-postgres]
  node scripts/qa/purchase-receipt-real-write-e2e.mjs --print-input-template
  node scripts/qa/purchase-receipt-real-write-e2e.mjs --preflight-report <path> [--out <dir>] [--with-postgres]

作用:
  固定采购入库真实写入链路验收入口，默认运行 JSON-RPC 服务层真实写入测试。
  可选 --with-postgres 追加本地 PostgreSQL 防呆测试。
  --print-input-template 只打印输入模板和边界，不运行测试、不写报告。
  --preflight-report 只写本地前置检查报告，不运行 Go test、不连接 PostgreSQL。

边界:
  - 不连接生产或目标环境
  - 不执行真实客户导入
  - 不改 schema / migration / RBAC / Workflow / Fact 规则
  - PostgreSQL 路径复用 scripts/purchase-receipt-pg.sh 的本地 host/dbname 防呆
`;

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT_DIR,
    withPostgres: false,
    help: false,
    printInputTemplate: false,
    preflightReport: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--out requires a value");
      }
      options.out = value;
      index += 1;
      continue;
    }
    if (arg === "--with-postgres") {
      options.withPostgres = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--print-input-template") {
      options.printInputTemplate = true;
      continue;
    }
    if (arg === "--preflight-report") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--preflight-report requires a value");
      }
      options.preflightReport = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return options;
}

export function buildInputTemplate() {
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    writesReports: false,
    runsGoTests: false,
    writesTestDatabase: false,
    writesProductionDatabase: false,
    callsBackend: false,
    realCustomerImport: false,
    changesRuntime: false,
    downstreamWritesReports: true,
    downstreamRunsGoTests: true,
    downstreamWritesTestDatabase: true,
    defaultOut: DEFAULT_OUT_DIR,
    optionalInputs: [
      "--out <dir>",
      "--with-postgres",
      "PURCHASE_RECEIPT_PG_DB_URL when using --with-postgres through scripts/purchase-receipt-pg.sh",
    ],
    commands: [
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --print-input-template",
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --preflight-report output/qa/purchase-receipt-real-write-e2e/preflight.json",
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --out output/qa/purchase-receipt-real-write-e2e",
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --with-postgres --out output/qa/purchase-receipt-real-write-e2e",
    ],
    coverage: [
      "JSON-RPC purchase receipt service-layer write chain",
      "optional local PostgreSQL guard path",
      "post/cancel idempotency and permission denied paths",
    ],
    boundary:
      "This template only prints prerequisites and commands. It does not run Go tests, invoke make targets, connect to PostgreSQL, call a backend, import customer data, write reports, or write database rows. The preflight report writes a local sanitized JSON readiness report only. The real command runs local service-layer tests and writes a local report; --with-postgres is guarded by scripts/purchase-receipt-pg.sh and must stay local/test only.",
  };
}

function resolveRepoOutputPath(raw, flagName = "--preflight-report") {
  const resolved = path.resolve(ROOT_DIR, raw);
  const relative = path.relative(ROOT_DIR, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${flagName} must stay inside repo: ${raw}`);
  }
  return resolved;
}

function fileContains(filePath, pattern) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return pattern.test(fs.readFileSync(filePath, "utf8"));
}

function commandVersion(command, args, runtime = {}) {
  const spawn = runtime.spawnSync || spawnSync;
  const result = spawn(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: "pipe",
    env: runtime.env || process.env,
  });
  return {
    available: result.status === 0,
    exitCode: result.status,
    version: result.status === 0 ? String(result.stdout || result.stderr).trim().split("\n")[0] : "",
  };
}

function resolvePostgresTarget(env = process.env) {
  const raw = env.PURCHASE_RECEIPT_PG_DB_URL || DEFAULT_PURCHASE_RECEIPT_PG_DB_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return {
      valid: false,
      error: "invalid-postgres-url",
      scheme: "",
      host: "",
      port: null,
      database: "",
      allowedHost: false,
      safeTarget: "",
      dbNameLooksTestOnly: false,
      urlValueStored: false,
    };
  }

  const scheme = parsed.protocol.replace(/:$/, "");
  const host = parsed.hostname || "";
  const database = parsed.pathname.replace(/^\//, "");
  const port = parsed.port ? Number(parsed.port) : 5432;
  const allowedHost = ALLOWED_POSTGRES_HOSTS.has(host);
  const dbNameLooksTestOnly =
    database.toLowerCase().includes("purchase_receipt") || database.toLowerCase().includes("test");
  return {
    valid: ["postgres", "postgresql"].includes(scheme) && allowedHost && Boolean(database),
    error: "",
    scheme,
    host,
    port,
    database,
    allowedHost,
    safeTarget: host && database ? `${host}:${port}/${database}` : "",
    dbNameLooksTestOnly,
    urlValueStored: false,
  };
}

function probePostgresReadiness(target, runtime = {}) {
  if (!target.valid) {
    return {
      checked: false,
      commandAvailable: false,
      reachable: false,
      exitCode: null,
      output: "",
    };
  }
  const spawn = runtime.spawnSync || spawnSync;
  const result = spawn("pg_isready", ["-h", target.host, "-p", String(target.port)], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: "pipe",
    env: runtime.env || process.env,
  });
  return {
    checked: true,
    commandAvailable: result.error?.code !== "ENOENT",
    reachable: result.status === 0,
    exitCode: result.status,
    output: String(result.stdout || result.stderr || "").trim(),
  };
}

export function buildPreflightReport(options = {}, runtime = {}) {
  const outDir = path.resolve(ROOT_DIR, options.out || DEFAULT_OUT_DIR);
  const serverDir = path.join(ROOT_DIR, "server");
  const serviceTestFile = path.join(serverDir, "internal/service/jsonrpc_purchase_test.go");
  const goModPath = path.join(serverDir, "go.mod");
  const makefilePath = path.join(serverDir, "Makefile");
  const postgresGuardScript = path.join(ROOT_DIR, "scripts/purchase-receipt-pg.sh");
  const env = runtime.env || process.env;
  const go = commandVersion("go", ["version"], runtime);
  const requiredServiceTests = [
    "TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact",
    "TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions",
  ].map((name) => ({
    name,
    exists: fileContains(serviceTestFile, new RegExp(`func\\s+${name}\\s*\\(`)),
  }));
  const makeTargetExists = fileContains(makefilePath, /^purchase_receipt_pg_test:/m);
  const postgresGuardExists = fs.existsSync(postgresGuardScript);
  const postgresTarget = resolvePostgresTarget(env);
  const postgresReachability = options.withPostgres
    ? probePostgresReadiness(postgresTarget, runtime)
    : {
        checked: false,
        commandAvailable: false,
        reachable: false,
        exitCode: null,
        output: "",
      };
  const blockers = [];

  if (!fs.existsSync(serverDir)) {
    blockers.push("missing-server-dir");
  }
  if (!fs.existsSync(goModPath)) {
    blockers.push("missing-server-go-mod");
  }
  if (!go.available) {
    blockers.push("missing-go-binary");
  }
  if (!fs.existsSync(serviceTestFile)) {
    blockers.push("missing-service-test-file");
  }
  for (const item of requiredServiceTests) {
    if (!item.exists) {
      blockers.push(`missing-service-test-anchor:${item.name}`);
    }
  }
  if (options.withPostgres && !postgresGuardExists) {
    blockers.push("missing-postgres-guard-script");
  }
  if (options.withPostgres && !makeTargetExists) {
    blockers.push("missing-purchase-receipt-pg-test-target");
  }
  if (options.withPostgres && !postgresTarget.valid) {
    blockers.push(postgresTarget.error || "invalid-postgres-target");
  }
  if (options.withPostgres && !postgresTarget.allowedHost) {
    blockers.push("postgres-target-host-not-local");
  }
  if (options.withPostgres && !postgresTarget.dbNameLooksTestOnly) {
    blockers.push("postgres-target-db-not-test-named");
  }
  if (options.withPostgres && !postgresReachability.commandAvailable) {
    blockers.push("missing-pg-isready");
  }
  if (options.withPostgres && postgresReachability.commandAvailable && !postgresReachability.reachable) {
    blockers.push("postgres-not-ready");
  }

  const serviceReady =
    fs.existsSync(serverDir) &&
    fs.existsSync(goModPath) &&
    go.available &&
    fs.existsSync(serviceTestFile) &&
    requiredServiceTests.every((item) => item.exists);
  const postgresReady =
    !options.withPostgres ||
    (postgresGuardExists &&
      makeTargetExists &&
      postgresTarget.valid &&
      postgresTarget.allowedHost &&
      postgresTarget.dbNameLooksTestOnly &&
      postgresReachability.commandAvailable &&
      postgresReachability.reachable);

  return {
    scope: PREFLIGHT_REPORT_SCOPE,
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    writesPreflightReport: true,
    writesE2EReport: false,
    runsGoTests: false,
    invokesMakeTargets: false,
    connectsPostgres: false,
    writesTestDatabase: false,
    writesProductionDatabase: false,
    callsBackend: false,
    realCustomerImport: false,
    changesRuntime: false,
    storesDbUrlValue: false,
    out: path.relative(ROOT_DIR, outDir),
    withPostgres: Boolean(options.withPostgres),
    serviceLayer: {
      readyForLocalServiceE2E: serviceReady,
      cwd: "server",
      command:
        "go test ./internal/service -run TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact|TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions -count=1",
      go,
      serverDirExists: fs.existsSync(serverDir),
      goModExists: fs.existsSync(goModPath),
      testFileExists: fs.existsSync(serviceTestFile),
      requiredServiceTests,
    },
    postgresGuard: {
      requested: Boolean(options.withPostgres),
      readyForRequestedPostgresMode: postgresReady,
      guardScriptExists: postgresGuardExists,
      makeTargetExists,
      dbUrlEnvPresent: Boolean(env.PURCHASE_RECEIPT_PG_DB_URL),
      dbUrlValueStored: false,
      defaultGuardedByScript: true,
      target: {
        valid: postgresTarget.valid,
        scheme: postgresTarget.scheme,
        host: postgresTarget.host,
        port: postgresTarget.port,
        database: postgresTarget.database,
        safeTarget: postgresTarget.safeTarget,
        allowedHost: postgresTarget.allowedHost,
        dbNameLooksTestOnly: postgresTarget.dbNameLooksTestOnly,
        urlValueStored: false,
      },
      readiness: postgresReachability,
    },
    readyForRequestedCommand: serviceReady && postgresReady,
    blockers,
    nextCommands: [
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --preflight-report output/qa/purchase-receipt-real-write-e2e/preflight.json",
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --out output/qa/purchase-receipt-real-write-e2e",
      "PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --with-postgres --out output/qa/purchase-receipt-real-write-e2e",
    ],
    boundary:
      "This preflight writes only a sanitized local JSON report. It does not run Go tests, invoke make, connect to PostgreSQL with credentials, call a backend, write database rows, import customer data, or prove the purchase receipt fact chain passed. When --with-postgres is requested it only runs pg_isready against the sanitized local host and port.",
  };
}

function writeJsonReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function sanitizeCommandOutput(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "<redacted-postgres-url>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, "Bearer <redacted-token>")
    .replace(/access_token["']?\s*[:=]\s*["'][^"']+["']/gi, 'access_token="<redacted-token>"')
    .replace(/Authorization["']?\s*[:=]\s*["'][^"']+["']/gi, 'Authorization="<redacted-authorization>"');
}

function runCommand({ key, title, cwd, command }) {
  const startedAt = new Date().toISOString();
  const child = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
  return {
    key,
    title,
    cwd: path.relative(ROOT_DIR, cwd) || ".",
    command: command.join(" "),
    status: child.status === 0 ? "PASS" : "FAIL",
    exitCode: child.status,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdout: sanitizeCommandOutput(child.stdout),
    stderr: sanitizeCommandOutput(child.stderr),
  };
}

function createReport(options, runs) {
  const failed = runs.filter((run) => run.status === "FAIL");
  const skipped = runs.filter((run) => run.status === "SKIPPED");
  return {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    scenario: "purchase-receipt-real-write-e2e",
    out: options.out,
    withPostgres: options.withPostgres,
    writesTestDatabase: true,
    writesProductionDatabase: false,
    realCustomerImport: false,
    changesRuntime: false,
    coverage: [
      "create_purchase_receipt_draft",
      "add_purchase_receipt_item",
      "post_purchase_receipt",
      "get_purchase_receipt",
      "list_purchase_receipts",
      "dashboard_stats inbound projection",
      "cancel_purchase_receipt reversal",
      "permission denied paths",
      "invalid line failure path",
      "repeat post/cancel idempotency",
    ],
    boundaries: [
      "purchase receipt writes inventory facts through InventoryUsecase",
      "workflow task done is not treated as purchase_receipt posted",
      "business_record_id is rejected by the new purchase API",
      "PostgreSQL mode is local/test only and guarded by purchase-receipt-pg.sh",
    ],
    runs,
    summary: {
      total: runs.length,
      passed: runs.filter((run) => run.status === "PASS").length,
      failed: failed.length,
      skipped: skipped.length,
      status: failed.length === 0 ? "PASS" : "FAIL",
    },
  };
}

function renderMarkdown(report) {
  const rows = report.runs
    .map((run) => `| ${run.title} | ${run.status} | \`${run.command}\` | ${run.cwd} |`)
    .join("\n");
  const coverage = report.coverage.map((item) => `- ${item}`).join("\n");
  const boundaries = report.boundaries.map((item) => `- ${item}`).join("\n");
  return `# 采购入库真实写入 E2E / Purchase Receipt Real Write E2E

## 摘要

| 项目 | 结果 |
| --- | --- |
| scenario | ${report.scenario} |
| status | ${report.summary.status} |
| writesTestDatabase | ${report.writesTestDatabase} |
| writesProductionDatabase | ${report.writesProductionDatabase} |
| realCustomerImport | ${report.realCustomerImport} |
| withPostgres | ${report.withPostgres} |

## 覆盖范围

${coverage}

## 边界

${boundaries}

## 命令结果

| 步骤 | 状态 | 命令 | cwd |
| --- | --- | --- | --- |
${rows}
`;
}

function writeReport(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "purchase-receipt-real-write-e2e.json");
  const mdPath = path.join(outDir, "purchase-receipt-real-write-e2e.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

export function runPurchaseReceiptRealWriteE2E(options) {
  const outDir = path.resolve(ROOT_DIR, options.out || DEFAULT_OUT_DIR);
  const serverDir = path.join(ROOT_DIR, "server");
  const runs = [
    runCommand({
      key: "jsonrpc-purchase-receipt",
      title: "JSON-RPC 采购入库真实写入链路",
      cwd: serverDir,
      command: [
        "go",
        "test",
        "./internal/service",
        "-run",
        "TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact|TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions",
        "-count=1",
      ],
    }),
  ];

  if (options.withPostgres) {
    runs.push(
      runCommand({
        key: "postgres-purchase-receipt",
        title: "PostgreSQL 采购入库事实防呆测试",
        cwd: serverDir,
        command: ["make", "purchase_receipt_pg_test"],
      }),
    );
  } else {
    runs.push({
      key: "postgres-purchase-receipt",
      title: "PostgreSQL 采购入库事实防呆测试",
      cwd: "server",
      command: "make purchase_receipt_pg_test",
      status: "SKIPPED",
      exitCode: null,
      startedAt: null,
      finishedAt: null,
      stdout: "",
      stderr: "pass --with-postgres to run the local PostgreSQL guarded test",
    });
  }

  const report = createReport({ ...options, out: outDir }, runs);
  const output = writeReport(report, outDir);
  return { outDir, report, ...output };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    }
    if (options.printInputTemplate) {
      process.stdout.write(`${JSON.stringify(buildInputTemplate(), null, 2)}\n`);
      process.exit(0);
    }
    if (options.preflightReport) {
      const reportPath = resolveRepoOutputPath(options.preflightReport);
      const report = buildPreflightReport(options);
      writeJsonReport(report, reportPath);
      process.stdout.write(
        `[qa:purchase-receipt-real-write-e2e] preflight ready=${report.readyForRequestedCommand}. json=${reportPath}\n`,
      );
      process.exit(0);
    }
    const result = runPurchaseReceiptRealWriteE2E(options);
    process.stdout.write(
      `[qa:purchase-receipt-real-write-e2e] ${result.report.summary.status}. json=${result.jsonPath} md=${result.mdPath}\n`,
    );
    if (result.report.summary.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(
      `[qa:purchase-receipt-real-write-e2e][fatal] ${error?.stack || error?.message || error}\n`,
    );
    process.exit(1);
  }
}
