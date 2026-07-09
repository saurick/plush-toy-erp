import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { validateCustomerConfigActivationGate } from "./customer-config-activation-gate.mjs";

const scriptPath = path.resolve(new URL("customer-config-activation-gate.mjs", import.meta.url).pathname);

function runActivationGate(root, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function writeRuntimeManifest(root) {
  const manifestPath = path.join(root, "output/customers/yoyoosun/customer-config-runtime-manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(buildRuntimeManifest(yoyoosunCustomerPackage), null, 2));
  return "output/customers/yoyoosun/customer-config-runtime-manifest.json";
}

function manifestSha256(root, manifest) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, manifest)))
    .digest("hex");
}

function writeManifestEvidence(root, evidenceDir, manifest, overrides = {}) {
  fs.writeFileSync(
    path.join(root, evidenceDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
        manifestSha256: `sha256:${manifestSha256(root, manifest)}`,
        reviewStatus: overrides.reviewStatus ?? "approved",
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsRawCustomerFiles: false,
        },
      },
      null,
      2,
    ),
  );
}

function writeReleaseEvidence(dir, overrides = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "release-evidence.md"),
    `# yoyoosun Release Evidence

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | ${overrides.releaseVersion ?? "20260628T2100-config-runtime"} |
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
[production-preflight] all checks passed
`,
  );
  fs.writeFileSync(
    path.join(dir, "image-digests.txt"),
    `serverImage=registry.example.invalid/plush/server:20260628T2100-config-runtime
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260628T2100-config-runtime
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260628T2100-config-runtime |
| environment | customer-trial |
| backupId | backup-20260628 |
| backupTime | 2026-06-28T21:00:00+08:00 |
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
        releaseVersion: "20260628T2100-config-runtime",
        backupId: "backup-20260628",
        verifiedAt: "2026-06-28T13:00:00Z",
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
          databaseBackupHash: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
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
          restoreCompleted: overrides.restoreCompleted ?? true,
          migrationStatus: "ok",
          smokeQueryStatus: "passed",
        },
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "artifacts/backup-evidence.md"), "backupId=backup-20260628\n");
  fs.writeFileSync(path.join(dir, "artifacts/migration-status-before-apply.txt"), "Current Version: 20260601000000\nPending Files: 1\n");
  fs.writeFileSync(path.join(dir, "artifacts/migration-status.txt"), "Current Version: 20260628123354\nPending Files: 0\n");
  fs.writeFileSync(
    path.join(dir, "artifacts/command-summary.txt"),
    `backupId=backup-20260628
releaseVersion=${overrides.releaseVersion ?? "20260628T2100-config-runtime"}
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
        releaseVersion: "20260628T2100-config-runtime",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias: "https://api.example.invalid",
        summary: { total: 3, passed: 3, failed: overrides.smokeFailed ?? 0 },
        checks: [
          { name: "server-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
          { name: "server-readyz", status: "pass", target: "https://erp.example.invalid/readyz", httpCode: "200" },
          { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/", httpCode: "200" },
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
        releaseVersion: "20260628T2100-config-runtime",
        rehearsedAt: "2026-06-28T13:30:00Z",
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
          smokeReport: "deployments/yoyoosun/evidence/releases/2026-06-28/smoke-test-report.json",
          smokeCheckCount: 3,
          evidenceReviewStatus: "passed",
        },
        summary: { rehearsalCompleted: true, rollbackPathStatus: "passed" },
        redaction: { containsSecrets: false, containsRawCustomerRows: false, containsFullDsn: false },
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
| releaseVersion | ${overrides.releaseVersion ?? "20260628T2100-config-runtime"} |
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

test("customer config activation gate accepts manifest with filled release evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-"));
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);

  const result = validateCustomerConfigActivationGate({
    repoRoot: root,
    manifest,
    evidenceDir,
  });

  assert.equal(result.customer, "yoyoosun");
  assert.equal(result.revision, "yoyoosun-customer-package-v4.runtime-manifest-v1");
  assert.equal(result.scope.evidenceOnly, true);
});

test("customer config activation gate CLI JSON reports ok success scope", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-json-ok-"));
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);

  const result = runActivationGate(root, [
    "--manifest",
    manifest,
    "--evidence-dir",
    evidenceDir,
    "--json",
  ]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.customer, "yoyoosun");
  assert.equal(payload.scope.evidenceOnly, true);
  assert.match(
    payload.scope.notProvenByThisGate.join("\n"),
    /customer config revision was activated/,
  );
});

test("customer config activation gate rejects missing restore rehearsal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-restore-"));
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir), { restoreCompleted: false });
  writeManifestEvidence(root, evidenceDir, manifest);

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /summary\.restoreCompleted must be true/,
  );
});

test("customer config activation gate CLI JSON failure includes release evidence closeout next actions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-json-fail-"));
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  const absoluteEvidenceDir = path.join(root, evidenceDir);
  writeReleaseEvidence(absoluteEvidenceDir);
  writeManifestEvidence(root, evidenceDir, manifest);
  fs.unlinkSync(path.join(absoluteEvidenceDir, "production-preflight-report.txt"));

  const result = runActivationGate(root, [
    "--manifest",
    manifest,
    "--evidence-dir",
    evidenceDir,
    "--json",
  ]);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /customer config activation gate failed/);
  assert.equal(payload.scope.evidenceOnly, true);
  assert.equal(payload.releaseEvidenceStatus.status, "incomplete");
  assert(
    payload.releaseEvidenceStatus.closeoutNextActions.some(
      (action) =>
        action.id === "production-preflight" &&
        action.commands.some((command) => command.includes("production-preflight.sh")),
    ),
  );
});

test("customer config activation gate rejects invalid manifest payload", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-manifest-"));
  const manifest = writeRuntimeManifest(root);
  const absoluteManifest = path.join(root, manifest);
  const payload = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  payload.compiled_snapshot.secret = "bad";
  fs.writeFileSync(absoluteManifest, JSON.stringify(payload, null, 2));
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /must not embed raw rows, secrets, SQL or executable code payloads/,
  );
});

test("customer config activation gate rejects missing manifest fingerprint evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-fingerprint-"));
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /Missing customer-config-manifest-evidence\.json/,
  );
});

test("customer config activation gate rejects stale manifest fingerprint", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-config-activation-gate-stale-"));
  const manifest = writeRuntimeManifest(root);
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-28";
  writeReleaseEvidence(path.join(root, evidenceDir));
  writeManifestEvidence(root, evidenceDir, manifest);
  const payload = JSON.parse(fs.readFileSync(path.join(root, manifest), "utf8"));
  payload.product_version = "local-customer-package";
  payload.compiled_snapshot.customer.name = "stale-hash";
  fs.writeFileSync(path.join(root, manifest), JSON.stringify(payload, null, 2));

  assert.throws(
    () =>
      validateCustomerConfigActivationGate({
        repoRoot: root,
        manifest,
        evidenceDir,
      }),
    /manifestSha256 must match current manifest/,
  );
});
