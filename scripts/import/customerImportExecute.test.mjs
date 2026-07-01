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
    "--recovery-plan",
    "recovery.json",
    "--out",
    "out",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--execute",
  ]);
  assert.equal(options.dryRunPackage, "dry");
  assert.equal(options.approval, "approval.json");
  assert.equal(options.backupEvidence, "backup.txt");
  assert.equal(options.recoveryPlan, "recovery.json");
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
  assert.deepEqual(report.operations[0].moduleKeys, ["customers"]);
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
    moduleStates: {
      sales_orders: "enabled",
    },
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
    moduleStates: {
      sales_orders: "enabled",
    },
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

test("buildExecutionPlan 要求 approval 声明目标模块状态", () => {
  const candidates = [
    {
      sourceReference: "customers.json:row1/src-customer-create",
      targetModel: "customers",
      actionCandidate: "create",
      targetFields: { name: "永绅玩具" },
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
        sourceId: "src-customer-create",
        targetModel: "customers",
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
        unresolved: [],
      }),
    /approval\.moduleStates must declare enabled module states/,
  );
});

test("buildExecutionPlan 按 moduleStates 阻止 read_only 模块导入", () => {
  const candidates = [
    {
      sourceReference: "orders.json:row1/src-sales-order-create",
      targetModel: "sales_orders",
      actionCandidate: "create",
      targetFields: { orderNo: "SO-READONLY", customerId: 1 },
    },
  ];
  const approval = {
    customerKey: "yoyoosun",
    approvedAt: "2026-06-08T00:00:00.000Z",
    approvedBy: "tester",
    realImportApproved: true,
    allowRemainingReviewItems: true,
    moduleStates: {
      sales_orders: "read_only",
    },
    items: [
      {
        sourceId: "src-sales-order-create",
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
        unresolved: [],
      }),
    /module sales_orders is read_only; import execution requires enabled module/,
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

test("execute 模式拒绝 fixture approval", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(backupEvidence, "sample backup evidence\n", "utf8");
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const result = runExecuteCli(
    [
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
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot use fixture or sample approval/);
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝 sample backup evidence", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeFile(backupEvidence, "sample backup evidence\n", "utf8");
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  await writeReviewedDryRunReport(dryRunDir);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup evidence contains fixture, sample/);
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝 fixture dry-run package", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeTargetBackupEvidence(backupEvidence);
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dry-run report contains fixture, sample/);
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝 sample approval content", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(
    approvalPath,
    await readFile(approvalFixture, "utf8"),
    "utf8",
  );
  await writeFile(
    backupEvidence,
    renderTargetBackupEvidence(),
    "utf8",
  );
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approval contains fixture, sample/);
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式缺少 recovery plan 时拒绝", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeTargetBackupEvidence(backupEvidence);
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  await writeReviewedDryRunReport(dryRunDir);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required --recovery-plan/);
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝 placeholder recovery plan", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  const recoveryPlan = path.join(tempDir, "reviewed-import-recovery-plan.json");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeTargetBackupEvidence(backupEvidence);
  await writeFile(
    recoveryPlan,
    JSON.stringify(
      {
        ...buildReviewedRecoveryPlan(),
        rollbackTarget: "todo",
      },
      null,
      2,
    ),
    "utf8",
  );
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  await writeReviewedDryRunReport(dryRunDir);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--recovery-plan",
      recoveryPlan,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /recovery plan contains fixture, sample, or placeholder text|recoveryPlan\.rollbackTarget must be reviewed/);
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝缺少 hash 的 backup evidence", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  const recoveryPlan = path.join(tempDir, "reviewed-import-recovery-plan.json");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeFile(
    backupEvidence,
    renderTargetBackupEvidence().replace(
      "databaseBackupHash=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
      "",
    ),
    "utf8",
  );
  await writeFile(
    recoveryPlan,
    JSON.stringify(buildReviewedRecoveryPlan(), null, 2),
    "utf8",
  );
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  await writeReviewedDryRunReport(dryRunDir);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--recovery-plan",
      recoveryPlan,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /backupEvidence\.databaseBackupHash must be reviewed/,
  );
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝 recovery plan 引用其他备份", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  const recoveryPlan = path.join(tempDir, "reviewed-import-recovery-plan.json");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeTargetBackupEvidence(backupEvidence);
  await writeFile(
    recoveryPlan,
    JSON.stringify(
      {
        ...buildReviewedRecoveryPlan(),
        backupEvidence: "backup-other",
      },
      null,
      2,
    ),
    "utf8",
  );
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  await writeReviewedDryRunReport(dryRunDir);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--recovery-plan",
      recoveryPlan,
      "--out",
      outDir,
      "--backend-url",
      "http://127.0.0.1:1",
      "--execute",
    ],
    { CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT" },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /recoveryPlan\.backupEvidence must match backupEvidence\.backupId/,
  );
  await rm(tempDir, { recursive: true, force: true });
});

test("execute 模式拒绝带账号密码的 backend URL", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "customer-import-execute-"),
  );
  const dryRunDir = path.join(tempDir, "dry-run");
  const outDir = path.join(tempDir, "out");
  const approvalPath = path.join(tempDir, "reviewed-import-approval.json");
  const backupEvidence = path.join(tempDir, "backup.txt");
  const recoveryPlan = path.join(tempDir, "reviewed-import-recovery-plan.json");
  await writeFile(
    approvalPath,
    JSON.stringify(buildReviewedApproval(), null, 2),
    "utf8",
  );
  await writeTargetBackupEvidence(backupEvidence);
  await writeFile(
    recoveryPlan,
    JSON.stringify(buildReviewedRecoveryPlan(), null, 2),
    "utf8",
  );
  const dryRun = runDryRunCli(dryRunDir);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  await writeReviewedDryRunReport(dryRunDir);

  const result = runExecuteCli(
    [
      "--dry-run-package",
      dryRunDir,
      "--approval",
      approvalPath,
      "--backup-evidence",
      backupEvidence,
      "--recovery-plan",
      recoveryPlan,
      "--out",
      outDir,
      "--backend-url",
      "http://operator:secret@127.0.0.1:1",
      "--execute",
    ],
    {
      CUSTOMER_IMPORT_CONFIRM: "EXECUTE_YOYOOSUN_IMPORT",
      CUSTOMER_IMPORT_ADMIN_TOKEN: "test-admin-token",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /backend URL must not contain username or password/,
  );
  await rm(tempDir, { recursive: true, force: true });
});

function buildReviewedApproval() {
  return {
    customerKey: "yoyoosun",
    approvedAt: "2026-06-28T00:00:00.000Z",
    approvedBy: "data-reviewer",
    realImportApproved: true,
    allowRemainingReviewItems: true,
    moduleStates: {
      customers: "enabled",
      suppliers: "enabled",
      sales_orders: "enabled",
    },
    items: [
      {
        sourceId: "src-customer-create",
        targetModel: "customers",
        action: "create",
        decision: "approved_for_customer_loader_report",
        params: {
          note: "reviewed import approval",
        },
      },
    ],
  };
}

function renderTargetBackupEvidence() {
  return [
    "backupId=backup-20260628-001",
    "releaseVersion=2026.06.28-import-gate",
    "databaseSnapshot=plush_erp_before_import",
    "backupTime=2026-06-28T01:00:00+08:00",
    "databaseBackupSize=123456",
    "databaseBackupHash=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "operator=ops",
  ].join("\n");
}

function buildReviewedRecoveryPlan() {
  return {
    customerKey: "yoyoosun",
    approvedAt: "2026-06-28T01:00:00.000Z",
    approvedBy: "data-reviewer",
    recoveryPlanApproved: true,
    rollbackOrForwardFixOwner: "import-owner",
    backupEvidence: "backup-20260628-001",
    rollbackTarget: "restore database snapshot backup-20260628-001",
    forwardFixPath: "stop import, triage failed source rows, rerun reviewed dry-run package",
    failureTriggers: [
      "JSON-RPC create or update returns non-zero business code",
      "post-import smoke or row count verification fails",
    ],
    postRecoveryVerification: [
      "healthz and readyz pass",
      "reviewed import execution report matches approved operation count",
    ],
    redaction: {
      containsSecrets: false,
      containsRawCustomerRows: false,
    },
  };
}

async function writeTargetBackupEvidence(filePath) {
  await writeFile(filePath, renderTargetBackupEvidence(), "utf8");
}

async function writeReviewedDryRunReport(dryRunDir) {
  await writeFile(
    path.join(dryRunDir, "dry-run-report.md"),
    [
      "# Yoyoosun Customer Import Dry-run Report",
      "",
      "## Inputs",
      "",
      "- Source snapshot: `output/customers/yoyoosun/reviewed-source-snapshot.json`",
      "- Existing snapshot: `output/customers/yoyoosun/reviewed-existing-v1.json`",
      "",
      "## Review",
      "",
      "Reviewed customer dry-run evidence for controlled execution.",
    ].join("\n"),
    "utf8",
  );
}

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

function runExecuteCli(args, env = {}) {
  return spawnSync(process.execPath, [executeCli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CUSTOMER_IMPORT_CONFIRM: "",
      CUSTOMER_IMPORT_ADMIN_TOKEN: "",
      CUSTOMER_IMPORT_ADMIN_USERNAME: "",
      CUSTOMER_IMPORT_ADMIN_PASSWORD: "",
      ...env,
    },
  });
}
