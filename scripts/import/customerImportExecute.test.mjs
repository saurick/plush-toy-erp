import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildExecutionPlan, parseCliArgs } from "./customerImportExecute.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const executeCli = path.join(testDir, "customerImportExecute.mjs");
const dryRunCli = path.join(testDir, "customerImportDryRun.mjs");
const sourceFixture = path.join(
  testDir,
  "fixtures/customers/yoyoosun/source-snapshot.sample.json",
);
const existingFixture = path.join(
  testDir,
  "fixtures/customers/yoyoosun/existing-v1.sample.json",
);
const approvalFixture = path.join(
  testDir,
  "fixtures/customers/yoyoosun/import-approval.sample.json",
);

test("help 输出可运行", () => {
  const result = runExecuteCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Customer import execution loader/);
  assert.match(result.stdout, /--execute/);
});

test("parseCliArgs 支持必需路径和 execute", () => {
  const options = parseCliArgs([
    "--dry-run-package",
    "dry",
    "--approval=approval.json",
    "--backup-evidence",
    "backup.txt",
    "--out",
    "out",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--execute",
  ]);
  assert.equal(options.dryRunPackage, "dry");
  assert.equal(options.approval, "approval.json");
  assert.equal(options.backupEvidence, "backup.txt");
  assert.equal(options.out, "out");
  assert.equal(options.backendURL, "http://127.0.0.1:8300");
  assert.equal(options.execute, true);
});

test("默认只生成执行报告，不调用真实后端", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(backupEvidence, "sample backup evidence\n", "utf8");
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const result = runExecuteCli([
    "--dry-run-package",
    dryRunDir,
    "--approval",
    approvalFixture,
    "--backup-evidence",
    backupEvidence,
    "--out",
    outDir,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /executed: false/);

  const report = JSON.parse(
    await readFile(path.join(outDir, "import-execution-report.json"), "utf8"),
  );
  assert.equal(report.executed, false);
  assert.equal(report.operationCount, 1);
  assert.equal(report.operations[0].targetModel, "customers");
  assert.equal(report.operations[0].method, "create_customer");
  assert.equal(report.noDirectDatabaseWrite, true);
  await rm(tempDir, { recursive: true, force: true });
});

test("缺少备份证据时拒绝", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const result = runExecuteCli([
    "--dry-run-package",
    dryRunDir,
    "--approval",
    approvalFixture,
    "--backup-evidence",
    path.join(tempDir, "missing-backup.txt"),
    "--out",
    path.join(tempDir, "out"),
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup evidence not found/);
  await rm(tempDir, { recursive: true, force: true });
});

test("buildExecutionPlan 拒绝 forbidden source approval", () => {
  const candidates = [
    {
      sourceReference: "workflow.json:row14/src-workflow-done-forbidden",
      targetModel: "sales_orders",
      actionCandidate: "create",
      targetFields: { orderNo: "SO-WORKFLOW", customerId: 1 },
    },
  ];
  const approval = {
    customerKey: "yoyoosun",
    approvedAt: "2026-06-08T00:00:00.000Z",
    approvedBy: "tester",
    realImportApproved: true,
    allowRemainingReviewItems: true,
    items: [
      {
        sourceId: "src-workflow-done-forbidden",
        targetModel: "sales_orders",
        action: "create",
      },
    ],
  };
  assert.throws(
    () =>
      buildExecutionPlan({
        candidates,
        summary: { blockerCount: 0 },
        approval,
        forbidden: [
          {
            sourceReference: "workflow.json:row14/src-workflow-done-forbidden",
          },
        ],
        unresolved: [],
      }),
    /forbidden auto-import evidence/,
  );
});

test("buildExecutionPlan 拒绝 block unresolved source approval", () => {
  const candidates = [
    {
      sourceReference: "orders.json:row7/src-sales-order-no-customer",
      targetModel: "sales_orders",
      actionCandidate: "create",
      targetFields: { orderNo: "SO-NO-CUSTOMER", customerId: 1 },
    },
  ];
  const approval = {
    customerKey: "yoyoosun",
    approvedAt: "2026-06-08T00:00:00.000Z",
    approvedBy: "tester",
    realImportApproved: true,
    allowRemainingReviewItems: true,
    items: [
      {
        sourceId: "src-sales-order-no-customer",
        targetModel: "sales_orders",
        action: "create",
      },
    ],
  };
  assert.throws(
    () =>
      buildExecutionPlan({
        candidates,
        summary: { blockerCount: 0 },
        approval,
        forbidden: [],
        unresolved: [
          {
            sourceReference: "orders.json:row7/src-sales-order-no-customer",
            severity: "block",
          },
        ],
      }),
    /block unresolved item/,
  );
});

test("execute 模式没有确认短语时拒绝", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(backupEvidence, "sample backup evidence\n", "utf8");
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const result = runExecuteCli([
    "--dry-run-package",
    dryRunDir,
    "--approval",
    approvalFixture,
    "--backup-evidence",
    backupEvidence,
    "--out",
    outDir,
    "--backend-url",
    "http://127.0.0.1:1",
    "--execute",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /CUSTOMER_IMPORT_CONFIRM=EXECUTE_YOYOOSUN_IMPORT/,
  );
  await rm(tempDir, { recursive: true, force: true });
});

function runDryRunCli(outDir) {
  return spawnSync(
    process.execPath,
    [
      dryRunCli,
      "--source",
      sourceFixture,
      "--existing",
      existingFixture,
      "--out",
      outDir,
      "--format",
      "json,md",
    ],
    { encoding: "utf8" },
  );
}

function runExecuteCli(args) {
  return spawnSync(process.execPath, [executeCli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CUSTOMER_IMPORT_CONFIRM: "",
      CUSTOMER_IMPORT_ADMIN_TOKEN: "",
      CUSTOMER_IMPORT_ADMIN_USERNAME: "",
      CUSTOMER_IMPORT_ADMIN_PASSWORD: "",
    },
  });
}
