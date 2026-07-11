import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { validateCustomerConfigActivationGate } from "./customer-config-activation-gate.mjs";
import {
  parseCliArgs,
  writeCustomerConfigManifestEvidence,
} from "./customer-config-manifest-evidence.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const evidenceCli = path.join(testDir, "customer-config-manifest-evidence.mjs");

function writeRuntimeManifest(root) {
  const manifestPath = path.join(
    root,
    "output/customers/yoyoosun/customer-config-runtime-manifest.json",
  );
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(buildRuntimeManifest(yoyoosunCustomerPackage), null, 2),
  );
  return "output/customers/yoyoosun/customer-config-runtime-manifest.json";
}

function writeReleaseEvidence(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "release-evidence.md"),
    `# yoyoosun Release Evidence

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | 20260628T2300-config-evidence |
| environment | customer-trial |
| gitCommit | abc1234 |
| serverImageDigest | sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
| webImageDigest | sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb |
| migrationBefore | 20260601000000 |
| migrationAfter | 20260628123354 |
| backupId | backup-20260628 |
`,
  );
  fs.writeFileSync(
    path.join(dir, "production-preflight-report.txt"),
    `[production-preflight] ok: env 必需变量齐全
[production-preflight] ok: 生产 secret、镜像 tag、debug、后端端口和 PostgreSQL / Jaeger 暴露边界通过
[production-preflight] ok: Compose、低配部署边界和 migration 脚本通过
[production-preflight] ok: docker compose config -q 通过
[production-preflight] ok: Compose 运行服务存在
[production-preflight] ok: 运行态 ERP_PDF_WARMUP=async
[production-preflight] ok: 运行态 Chromium / chromium-common 版本与 Docker exact pin 一致: 150.0.7871.100-1~deb12u1
[production-preflight] ok: healthz / readyz 通过
[production-preflight] all checks passed
`,
  );
  fs.writeFileSync(
    path.join(dir, "image-digests.txt"),
    `serverImage=registry.example.invalid/plush/server:20260628T2300-config-evidence
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260628T2300-config-evidence
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260628T2300-config-evidence |
| environment | customer-trial |
| backupId | backup-20260628 |
| backupTime | 2026-06-28T23:00:00+08:00 |
| backupPurpose | pre-migration |
| migrationVersion | 20260601000000 |
| databaseBackupSize | 123456 |
| databaseBackupHash | sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd |
| storageLocationAlias | controlled-backup-store |
| restoreTestStatus | verified-on-staging |
| smokeQueryStatus | pass |
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-restore-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260628T2300-config-evidence",
        backupId: "backup-20260628",
        verifiedAt: "2026-06-28T15:00:00Z",
        sourceAlias: "env:SOURCE_POSTGRES_DSN",
        restoreTarget: "temp-postgres-container:postgres:18:removed-after-run",
        artifacts: {
          backupEvidence: "artifacts/backup-evidence.md",
          preMigrationStatus: "artifacts/migration-status-before-apply.txt",
          migrationStatus: "artifacts/migration-status.txt",
          commandSummary: "artifacts/command-summary.txt",
        },
        backup: {
          databaseBackupSize: 123456,
          databaseBackupHash:
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          storageLocationAlias: "controlled-backup-store",
          migrationVersion: "20260601000000",
        },
        restore: {
          restoreTestStatus: "passed-temp-container",
          migrationBeforeApply: "20260601000000",
          restoreMigrationVersion: "20260628123354",
          pendingFiles: "0",
        },
        smoke: {
          smokeQueryStatus: "passed",
          publicTableCount: 12,
          adminUserCount: 2,
          backendHealthStatus: "passed",
          backendReadyStatus: "passed",
          webSmokeStatus: "passed",
        },
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsDumpContent: false,
          containsFullDsn: false,
        },
        summary: {
          backupCreated: true,
          restoreCompleted: true,
          migrationStatus: "ok",
          smokeQueryStatus: "passed",
        },
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "artifacts/backup-evidence.md"),
    "backupId=backup-20260628\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status-before-apply.txt"),
    "Current Version: 20260601000000\nPending Files: 1\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status.txt"),
    "Current Version: 20260628123354\nPending Files: 0\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/command-summary.txt"),
    `backupId=backup-20260628
releaseVersion=20260628T2300-config-evidence
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke
`,
  );
  fs.writeFileSync(
    path.join(dir, "migration-status.txt"),
    `Migration Status: OK
Current Version: 20260628123354
Pending Files: 0
`,
  );
  fs.writeFileSync(
    path.join(dir, "smoke-test-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260628T2300-config-evidence",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias: "https://api.example.invalid",
        summary: { total: 4, passed: 4, failed: 0 },
        checks: [
          {
            name: "server-healthz",
            status: "pass",
            target: "https://erp.example.invalid/healthz",
            httpCode: "200",
          },
          {
            name: "server-readyz",
            status: "pass",
            target: "https://erp.example.invalid/readyz",
            httpCode: "200",
          },
          {
            name: "web-healthz",
            status: "pass",
            target: "https://erp.example.invalid/",
            httpCode: "200",
          },
          {
            name: "template-pdf-render",
            status: "pass",
            target: "/templates/render-pdf",
            httpCode: "200",
            contentType: "application/pdf",
            sha256:
              "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            sizeBytes: 1024,
            responseBodyStored: false,
          },
        ],
        redaction: { containsSecrets: false, containsRawCustomerRows: false },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(dir, "rollback-forward-fix-plan.md"),
    `# yoyoosun Rollback / Forward-fix Plan

| 字段 | 值 |
| --- | --- |
| rollbackDecision | rollback-or-forward-fix-ready |
| rollbackTrigger | smoke failed / migration failed / activation failed |
| rollbackTargetRelease | previous-stable-release |
| rollbackRunbook | deployments/yoyoosun/runbooks/03-rollback.md |
| forwardFixOwner | release-owner |
| verificationAfterRollback | healthz / readyz / web smoke / release evidence review |

- [x] rollback target identified
- [x] forward-fix owner assigned
- [x] post-action smoke scope defined
`,
  );
  fs.writeFileSync(
    path.join(dir, "rollback-rehearsal-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260628T2300-config-evidence",
        rehearsedAt: "2026-06-28T15:30:00Z",
        rehearsalType: "rollback-forward-fix",
        triggerScenario: "activation failed after publish",
        rollbackTargetRelease: "previous-stable-release",
        rollbackRunbook: "deployments/yoyoosun/runbooks/03-rollback.md",
        steps: [
          { name: "identify rollback target", status: "pass" },
          { name: "verify rollback command path", status: "pass" },
          { name: "verify forward-fix owner path", status: "pass" },
        ],
        postCheck: {
          smokeStatus: "passed",
          smokeReport:
            "deployments/yoyoosun/evidence/releases/2026-06-28/smoke-test-report.json",
          smokeCheckCount: 4,
          evidenceReviewStatus: "passed",
        },
        summary: { rehearsalCompleted: true, rollbackPathStatus: "passed" },
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsFullDsn: false,
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(dir, "release-signoff-checklist.md"),
    `# yoyoosun Release Sign-off

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260628T2300-config-evidence |
| environment | customer-trial |
| backupId | backup-20260628 |
| releaseConclusion | internal-only |
| deploymentOperator | deployment-operator |
| evidenceReviewer | reviewer |
| customerOrBusinessConfirmation | config-runtime-scope-confirmed |

- [x] pre-migration backup evidence verified
- [x] known limitations reviewed
`,
  );
}

test("help 输出可运行", () => {
  const result = spawnSync(process.execPath, [evidenceCli, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Customer config manifest evidence generator/);
});

test("parseCliArgs 支持 manifest evidence 参数", () => {
  const options = parseCliArgs([
    "--manifest",
    "manifest.json",
    "--evidence-dir",
    "evidence",
    "--release-report=report.json",
    "--review-status=approved",
    "--reviewer",
    "ops",
  ]);
  assert.equal(options.manifest, "manifest.json");
  assert.equal(options.evidenceDir, "evidence");
  assert.equal(options.releaseReport, "report.json");
  assert.equal(options.reviewStatus, "approved");
  assert.equal(options.reviewer, "ops");
});

test("生成 manifest evidence 后 activation gate 可通过", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  const result = await writeCustomerConfigManifestEvidence(
    {
      manifest,
      evidenceDir,
      reviewStatus: "approved",
      reviewer: "ops-reviewer",
    },
    { repoRoot: root },
  );

  const evidence = JSON.parse(await readFile(result.evidencePath, "utf8"));
  assert.equal(evidence.customerKey, "yoyoosun");
  assert.equal(evidence.reviewStatus, "approved");
  assert.equal(
    evidence.manifestPath,
    "output/customers/yoyoosun/customer-config-runtime-manifest.json",
  );
  assert.equal(path.isAbsolute(evidence.manifestPath), false);
  assert.match(evidence.manifestSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(evidence.redaction.containsSecrets, false);

  const gate = validateCustomerConfigActivationGate({
    repoRoot: root,
    manifest,
    evidenceDir,
  });
  assert.equal(
    gate.revision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );

  await rm(root, { recursive: true, force: true });
});

test("未显式 approved 时生成 draft，不自动通过 activation gate", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  const result = await writeCustomerConfigManifestEvidence(
    {
      manifest,
      evidenceDir,
      reviewer: "ops-reviewer",
    },
    { repoRoot: root },
  );

  const evidence = JSON.parse(await readFile(result.evidencePath, "utf8"));
  assert.equal(evidence.reviewStatus, "draft");
  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /reviewStatus must be approved/,
  );

  await rm(root, { recursive: true, force: true });
});

test("缺少 reviewer 时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  await assert.rejects(
    () =>
      writeCustomerConfigManifestEvidence(
        {
          manifest,
          evidenceDir,
        },
        { repoRoot: root },
      ),
    /Missing required --reviewer/,
  );

  await rm(root, { recursive: true, force: true });
});

test("release evidence 目录不存在时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);

  await assert.rejects(
    () =>
      writeCustomerConfigManifestEvidence(
        {
          manifest,
          evidenceDir: "deployments/yoyoosun/evidence/releases/missing",
          reviewer: "ops-reviewer",
        },
        { repoRoot: root },
      ),
    /evidence dir must already exist/,
  );

  await rm(root, { recursive: true, force: true });
});

test("release report hash 不匹配时拒绝", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "customer-config-manifest-evidence-"),
  );
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  const reportPath = path.join(
    root,
    "output/customers/yoyoosun/customer-config-release/customer-config-release-report.json",
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
        manifestSha256:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
      null,
      2,
    ),
  );

  await assert.rejects(
    () =>
      writeCustomerConfigManifestEvidence(
        {
          manifest,
          evidenceDir,
          releaseReport:
            "output/customers/yoyoosun/customer-config-release/customer-config-release-report.json",
          reviewer: "ops-reviewer",
        },
        { repoRoot: root },
      ),
    /release report manifestSha256 does not match manifest/,
  );

  await rm(root, { recursive: true, force: true });
});
