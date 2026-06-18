#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUT_DIR = "output/qa/purchase-receipt-real-write-e2e";

const usage = `用法:
  node scripts/qa/purchase-receipt-real-write-e2e.mjs [--out <dir>] [--with-postgres]

作用:
  固定采购入库真实写入链路验收入口，默认运行 JSON-RPC 服务层真实写入测试。
  可选 --with-postgres 追加本地 PostgreSQL 防呆测试。

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
    throw new Error(`unsupported argument: ${arg}`);
  }

  return options;
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
    stdout: child.stdout,
    stderr: child.stderr,
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
