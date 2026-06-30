import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const gateCli = path.join(repoRoot, "scripts/deploy/release-evidence-gate.mjs");

function writeValidEvidence(dir, overrides = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "release-evidence.md"),
    `# yoyoosun Release Evidence

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | ${overrides.releaseVersion ?? "20260616T1200-test"} |
| environment | customer-trial |
| gitCommit | abc1234 |
| serverImageDigest | sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
| webImageDigest | sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb |
| migrationBefore | 20260601000000 |
| migrationAfter | 20260616000000 |
| backupId | backup-20260616 |
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
    `serverImage=registry.example.invalid/plush/server:20260616T1200-test
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260616T1200-test
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseVersion | ${overrides.backupReleaseVersion ?? overrides.releaseVersion ?? "20260616T1200-test"} |
| environment | ${overrides.backupEnvironment ?? "customer-trial"} |
| backupId | backup-20260616 |
| backupTime | 2026-06-16T12:00:00+08:00 |
| backupPurpose | pre-migration |
| migrationVersion | ${overrides.backupMigrationVersion ?? "20260601000000"} |
| databaseBackupSize | ${overrides.databaseBackupSize ?? "123456"} |
| databaseBackupHash | sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd |
| storageLocationAlias | controlled-backup-store |
| restoreTestStatus | ${overrides.restoreTestStatus ?? "verified-on-staging"} |
| smokeQueryStatus | ${overrides.smokeQueryStatus ?? "pass"} |
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-restore-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: overrides.releaseVersion ?? "20260616T1200-test",
        backupId: "backup-20260616",
        verifiedAt: "2026-06-16T04:00:00Z",
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
          restoreMigrationVersion: "20260616000000",
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
    "backupId=backup-20260616\nstorageLocationAlias=controlled-backup-store\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status-before-apply.txt"),
    "Current Version: 20260601000000\nPending Files: 1\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status.txt"),
    "Current Version: 20260616000000\nPending Files: 0\n",
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/command-summary.txt"),
    `backupId=backup-20260616
releaseVersion=${overrides.releaseVersion ?? "20260616T1200-test"}
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke queries
`,
  );
  fs.writeFileSync(
    path.join(dir, "migration-status.txt"),
    `Migration Status: OK
Current Version: 20260616000000
Pending Files: 0
`,
  );
  fs.writeFileSync(
    path.join(dir, "smoke-test-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: overrides.smokeReleaseVersion ?? "20260616T1200-test",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias: "https://api.example.invalid",
        summary: { total: 3, passed: 3, failed: 0 },
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
| rollbackDecision | ${overrides.rollbackDecision ?? "rollback-or-forward-fix-ready"} |
| rollbackTrigger | smoke failed / migration failed / business confirmation rejected |
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
        releaseVersion: overrides.releaseVersion ?? "20260616T1200-test",
        rehearsedAt: "2026-06-16T05:00:00Z",
        rehearsalType: "rollback-forward-fix",
        triggerScenario: "smoke failed after activation",
        rollbackTargetRelease: "previous-stable-release",
        rollbackRunbook: "deployments/yoyoosun/runbooks/03-rollback.md",
        steps: [
          { name: "identify rollback target", status: "pass" },
          { name: "verify rollback command path", status: "pass" },
          { name: "verify forward-fix owner path", status: "pass" },
        ],
        postCheck: {
          smokeStatus: "passed",
          smokeReport: "deployments/yoyoosun/evidence/releases/2026-06-16/smoke-test-report.json",
          smokeCheckCount: 3,
          evidenceReviewStatus: "passed",
        },
        summary: {
          rehearsalCompleted: true,
          rollbackPathStatus: "passed",
        },
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
| releaseVersion | ${overrides.releaseVersion ?? "20260616T1200-test"} |
| environment | customer-trial |
| backupId | backup-20260616 |
| releaseConclusion | customer-trial-approved |
| deploymentOperator | deployment-operator |
| evidenceReviewer | reviewer |
| customerOrBusinessConfirmation | trial-scope-confirmed |

- [x] pre-migration backup evidence verified
- [x] known limitations reviewed
`,
  );
}

function writeCustomerConfigManifestEvidence(dir, revision = "yoyoosun-customer-package-v1.runtime-manifest-v1") {
  fs.writeFileSync(
    path.join(dir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision,
        productVersion: "2026.06.test",
        manifestSha256: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        reviewStatus: "approved",
        reviewer: "release-reviewer",
        generatedAt: "2026-06-16T04:00:00Z",
        redaction: {
          containsSecrets: false,
          containsRawCustomerRows: false,
          containsRawCustomerFiles: false,
        },
        noRawFileUpload: true,
        noDirectDatabaseWrite: true,
        noBusinessDataImport: true,
        noWorkflowFactRuntimeWrite: true,
      },
      null,
      2,
    ),
  );
}

test("release evidence gate accepts filled yoyoosun evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const result = validateReleaseEvidenceGate({
    repoRoot: root,
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
  });

  assert.equal(result.customer, "yoyoosun");
  assert.equal(result.requiredFiles.length, 10);
  assert.equal(result.scope.evidenceOnly, true);
  assert.match(result.scope.readyMeaning, /filled release evidence directory/);
  assert.ok(
    result.scope.notProvenByThisGate.includes("target smoke was run by this gate"),
  );
});

test("release evidence gate CLI supports JSON and text scope output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-cli-"));
  const relativeEvidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-16";
  const evidenceDir = path.join(root, relativeEvidenceDir);
  writeValidEvidence(evidenceDir);

  const jsonResult = spawnSync(
    process.execPath,
    [gateCli, "--evidence-dir", relativeEvidenceDir, "--json"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(jsonResult.status, 0, `${jsonResult.stdout}\n${jsonResult.stderr}`);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.equal(parsed.scope.evidenceOnly, true);
  assert.match(parsed.scope.readyMeaning, /consistency, redaction, and placeholder checks/);
  assert.ok(
    parsed.scope.notProvenByThisGate.includes(
      "backup restore rehearsal was performed by this gate",
    ),
  );

  const textResult = spawnSync(
    process.execPath,
    [gateCli, "--evidence-dir", relativeEvidenceDir],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(textResult.status, 0, `${textResult.stdout}\n${textResult.stderr}`);
  assert.match(textResult.stdout, /ready means: filled release evidence directory/);
  assert.match(textResult.stdout, /not proven by this gate:/);
  assert.match(textResult.stdout, /target environment release was executed by this gate/);
});

test("release evidence gate rejects invalid release git commit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-git-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const releasePath = path.join(evidenceDir, "release-evidence.md");
  const release = fs.readFileSync(releasePath, "utf8").replace("| gitCommit | abc1234 |", "| gitCommit | main |");
  fs.writeFileSync(releasePath, release);

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /release-evidence\.md gitCommit must be a git hash/,
  );
});

test("release evidence gate rejects invalid release image digest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-image-digest-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const releasePath = path.join(evidenceDir, "release-evidence.md");
  const release = fs
    .readFileSync(releasePath, "utf8")
    .replace(
      "| serverImageDigest | sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |",
      "| serverImageDigest | server:latest |",
    );
  fs.writeFileSync(releasePath, release);

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /release-evidence\.md serverImageDigest must be sha256:<64-hex>/,
  );
});

test("release evidence gate rejects missing production preflight report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-preflight-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);
  fs.unlinkSync(path.join(evidenceDir, "production-preflight-report.txt"));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /Missing production-preflight-report\.txt/,
  );
});

test("release evidence gate rejects example-mode production preflight report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-preflight-example-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);
  fs.writeFileSync(
    path.join(evidenceDir, "production-preflight-report.txt"),
    `[production-preflight] ok: env 必需变量齐全
[production-preflight] ok: example 模式仅检查结构，不作为生产放行
[production-preflight] all checks passed
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /must include production secret\/image\/debug\/exposure boundary check|must not be an example-mode preflight/,
  );
});

test("release evidence gate rejects missing image digest artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-image-digest-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);
  fs.unlinkSync(path.join(evidenceDir, "image-digests.txt"));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /Missing image-digests\.txt/,
  );
});

test("release evidence gate rejects image digest artifact mismatch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-image-digest-mismatch-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "image-digests.txt"),
    `serverImage=registry.example.invalid/plush/server:other
serverImageDigest=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
webImage=registry.example.invalid/plush/web:20260616T1200-test
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /image-digests\.txt serverImageDigest must match release-evidence\.md/,
  );
});

test("release evidence gate rejects credentialed image refs in digest artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-image-ref-credential-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "image-digests.txt"),
    `serverImage=https://deploy:secret@registry.example.invalid/plush/server:20260616T1200-test
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260616T1200-test
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /image-digests\.txt contains a credentialed URL/,
  );
});

test("release evidence gate rejects placeholders and failed smoke", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { releaseVersion: "<release-version>", smokeReleaseVersion: "<release-version>" });

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.summary.failed = 1;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /placeholder field: releaseVersion|summary\.failed must be 0/,
  );
});

test("release evidence gate rejects empty smoke checks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-empty-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.summary = { total: 0, passed: 0, failed: 0 };
  smoke.checks = [];
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json checks must not be empty/,
  );
});

test("release evidence gate rejects non-pass smoke check", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-check-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.summary = { total: 3, passed: 3, failed: 0 };
  smoke.checks[1].status = "skipped";
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json checks\[1\]\.status must be pass/,
  );
});

test("release evidence gate rejects untraceable smoke check target", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-target-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  delete smoke.checks[1].target;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json checks\[1\]\.target is missing/,
  );
});

test("release evidence gate rejects URL smoke check without HTTP status", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-http-code-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  delete smoke.checks[1].httpCode;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json checks\[1\]\.httpCode must be a 100-599 HTTP status for URL targets/,
  );
});

test("release evidence gate rejects smoke report without endpoint alias", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-endpoint-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  delete smoke.endpointAlias;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json endpointAlias is missing or placeholder/,
  );
});

test("release evidence gate rejects credentialed smoke endpoint aliases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-endpoint-credential-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.endpointAlias = "https://deploy:secret@erp.example.invalid";
  smoke.backendEndpointAlias = "https://deploy:secret@api.example.invalid";
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json contains a credentialed URL|smoke-test-report\.json endpointAlias must not contain URL credentials|smoke-test-report\.json backendEndpointAlias must not contain URL credentials/,
  );
});

test("release evidence gate rejects credentialed smoke check target", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-smoke-target-credential-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.checks[0].target = "https://deploy:secret@erp.example.invalid/healthz";
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json contains a credentialed URL|smoke-test-report\.json checks\[0\]\.target must not contain URL credentials/,
  );
});

test("release evidence gate rejects missing restore rehearsal success", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.summary.restoreCompleted = false;
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /summary\.restoreCompleted must be true/,
  );
});

test("release evidence gate rejects invalid backup evidence time", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-time-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const backupPath = path.join(evidenceDir, "backup-evidence.md");
  const backup = fs
    .readFileSync(backupPath, "utf8")
    .replace("| backupTime | 2026-06-16T12:00:00+08:00 |", "| backupTime | 2026/06/16 12:00 |");
  fs.writeFileSync(backupPath, backup);

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-evidence\.md backupTime must be an ISO timestamp/,
  );
});

test("release evidence gate rejects invalid backup evidence size", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-size-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { databaseBackupSize: "0" });

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-evidence\.md databaseBackupSize must be a positive number/,
  );
});

test("release evidence gate rejects failed backup evidence verification statuses", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-status-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { restoreTestStatus: "failed", smokeQueryStatus: "skipped" });

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-evidence\.md restoreTestStatus must show a passed restore verification|backup-evidence\.md smokeQueryStatus must show a passed smoke query/,
  );
});

test("release evidence gate rejects missing restore target context", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-target-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  delete restoreReport.restoreTarget;
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json restoreTarget is missing or placeholder/,
  );
});

test("release evidence gate rejects invalid backup restore hash", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-hash-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.backup.databaseBackupHash = "todo";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json backup\.databaseBackupHash must be sha256/,
  );
});

test("release evidence gate rejects missing backup restore artifact path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-artifact-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.unlinkSync(path.join(evidenceDir, "artifacts/command-summary.txt"));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.commandSummary file not found in evidence dir/,
  );
});

test("release evidence gate rejects backup restore artifact path outside evidence dir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-artifact-outside-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.artifacts.commandSummary = "../command-summary.txt";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.commandSummary must stay inside evidence dir/,
  );
});

test("release evidence gate rejects missing pre-apply migration artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-pre-apply-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.unlinkSync(path.join(evidenceDir, "artifacts/migration-status-before-apply.txt"));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.preMigrationStatus file not found in evidence dir/,
  );
});

test("release evidence gate rejects mismatched restore migration before apply", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-before-migration-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.restore.migrationBeforeApply = "20260501000000";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json restore\.migrationBeforeApply must match release-evidence\.md migrationBefore/,
  );
});

test("release evidence gate rejects mismatched pre-apply migration status content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-before-status-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/migration-status-before-apply.txt"),
    "Current Version: 20260501000000\nPending Files: 1\n",
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.preMigrationStatus Current Version must match release-evidence\.md migrationBefore/,
  );
});

test("release evidence gate rejects mismatched post-apply migration artifact content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-after-status-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/migration-status.txt"),
    "Current Version: 20260615000000\nPending Files: 0\n",
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.migrationStatus Current Version must match release-evidence\.md migrationAfter/,
  );
});

test("release evidence gate rejects pending post-apply migration artifact content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-after-pending-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/migration-status.txt"),
    "Current Version: 20260616000000\nPending Files: 1\n",
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.migrationStatus Pending Files must be 0/,
  );
});

test("release evidence gate rejects full DSN inside backup restore artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-artifact-dsn-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/command-summary.txt"),
    "pg_dump postgres://deploy:secret-password@db.internal/plush -> restore\n",
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.commandSummary file must not contain a full DSN|backup-restore-report\.json artifacts\.commandSummary contains a forbidden secret-like pattern/,
  );
});

test("release evidence gate rejects mismatched command summary identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-command-summary-id-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/command-summary.txt"),
    `backupId=backup-other
releaseVersion=20260616T1200-test
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.commandSummary backupId must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched command summary restore target", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-command-summary-target-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/command-summary.txt"),
    `backupId=backup-20260616
releaseVersion=20260616T1200-test
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:other:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.commandSummary restoreTarget must match backup-restore-report\.json/,
  );
});

test("release evidence gate rejects command summary without migration or smoke steps", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-command-summary-steps-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "artifacts/command-summary.txt"),
    `backupId=backup-20260616
releaseVersion=20260616T1200-test
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json artifacts\.commandSummary steps must mention atlas|backup-restore-report\.json artifacts\.commandSummary steps must mention smoke/,
  );
});

test("release evidence gate rejects pending restore migrations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-pending-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.restore.pendingFiles = "1";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json restore\.pendingFiles must be 0/,
  );
});

test("release evidence gate rejects mismatched migration status current version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-migration-version-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  fs.writeFileSync(
    path.join(evidenceDir, "migration-status.txt"),
    `Migration Status: OK
Current Version: 20260615000000
Pending Files: 0
`,
  );

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /migration-status\.txt Current Version must match release-evidence\.md migrationAfter/,
  );
});

test("release evidence gate rejects mismatched restore migration version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-restore-migration-version-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.restore.restoreMigrationVersion = "20260615000000";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json restore\.restoreMigrationVersion must match release-evidence\.md migrationAfter/,
  );
});

test("release evidence gate rejects mismatched release versions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-version-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.releaseVersion = "20260617T1200-other";
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json releaseVersion must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched backup evidence release version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-version-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { backupReleaseVersion: "20260617T1200-other" });

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-evidence\.md releaseVersion must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched backup ids", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.backupId = "backup-other";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json backupId must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched backup migration version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-migration-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { backupMigrationVersion: "20260616000000" });

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-evidence\.md migrationVersion must match release-evidence\.md migrationBefore/,
  );
});

test("release evidence gate rejects mismatched backup hashes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-hash-mismatch-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const restorePath = path.join(evidenceDir, "backup-restore-report.json");
  const restoreReport = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  restoreReport.backup.databaseBackupHash = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  fs.writeFileSync(restorePath, JSON.stringify(restoreReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-restore-report\.json backup\.databaseBackupHash must match backup-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched evidence environments", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-environment-mismatch-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.environment = "staging-other";
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /smoke-test-report\.json environment must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched backup evidence environment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-backup-environment-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { backupEnvironment: "staging-other" });

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /backup-evidence\.md environment must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched rollback rehearsal release version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-version-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const reportPath = path.join(evidenceDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.releaseVersion = "20260617T1200-other";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /rollback-rehearsal-report\.json releaseVersion must match release-evidence\.md/,
  );
});

test("release evidence gate rejects mismatched signoff release version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-signoff-version-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const signoffPath = path.join(evidenceDir, "release-signoff-checklist.md");
  const signoff = fs
    .readFileSync(signoffPath, "utf8")
    .replace("| releaseVersion | 20260616T1200-test |", "| releaseVersion | 20260617T1200-other |");
  fs.writeFileSync(signoffPath, signoff);

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /release-signoff-checklist\.md releaseVersion must match release-evidence\.md/,
  );
});

test("release evidence gate rejects missing rollback plan", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);
  fs.unlinkSync(path.join(evidenceDir, "rollback-forward-fix-plan.md"));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /Missing rollback-forward-fix-plan\.md/,
  );
});

test("release evidence gate rejects placeholder rollback plan", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-placeholder-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir, { rollbackDecision: "todo" });

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /rollback-forward-fix-plan\.md missing or placeholder field: rollbackDecision|rollbackDecision must be/,
  );
});

test("release evidence gate rejects missing rollback rehearsal report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-rehearsal-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);
  fs.unlinkSync(path.join(evidenceDir, "rollback-rehearsal-report.json"));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /Missing rollback-rehearsal-report\.json/,
  );
});

test("release evidence gate rejects failed rollback rehearsal step", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-rehearsal-failed-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const reportPath = path.join(evidenceDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.steps[1].status = "skipped";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /rollback-rehearsal-report\.json steps\[1\]\.status must be pass/,
  );
});

test("release evidence gate rejects rollback rehearsal without traceable post smoke report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-smoke-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const reportPath = path.join(evidenceDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  delete report.postCheck.smokeReport;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /rollback-rehearsal-report\.json postCheck\.smokeReport is missing or placeholder/,
  );
});

test("release evidence gate rejects rollback rehearsal smoke count mismatch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-smoke-count-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const reportPath = path.join(evidenceDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.postCheck.smokeCheckCount = 1;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /rollback-rehearsal-report\.json postCheck\.smokeCheckCount must match smoke-test-report\.json checks length/,
  );
});

test("release evidence gate rejects rollback rehearsal smoke report outside current evidence dir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-smoke-path-bad-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const reportPath = path.join(evidenceDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.postCheck.smokeReport = "deployments/yoyoosun/evidence/releases/2026-06-15/smoke-test-report.json";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /rollback-rehearsal-report\.json postCheck\.smokeReport must point to smoke-test-report\.json in the same evidence dir/,
  );
});

test("release evidence gate requires rollback rehearsal effective session when smoke has customer config check", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-gate-rollback-effective-session-missing-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-16");
  writeValidEvidence(evidenceDir);

  const smokePath = path.join(evidenceDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.checks.push({
    name: "customer-config-effective-session",
    status: "pass",
    target: "jsonrpc:customer_config.get_effective_session",
    expectedRevision: "yoyoosun-customer-package-v1.runtime-manifest-v1",
    tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
    responseBodyStored: false,
  });
  smoke.summary = { total: smoke.checks.length, passed: smoke.checks.length, failed: 0 };
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  const reportPath = path.join(evidenceDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.postCheck.smokeCheckCount = smoke.checks.length;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /postCheck\.customerConfigEffectiveSession\.status must be verified/,
  );

  const updatedReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  updatedReport.postCheck.customerConfigEffectiveSession = {
    status: "verified",
    expectedRevision: "yoyoosun-customer-package-v1.runtime-manifest-v1",
    target: "jsonrpc:customer_config.get_effective_session",
  };
  fs.writeFileSync(reportPath, JSON.stringify(updatedReport, null, 2));

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /customer-config-manifest-evidence\.json is required when smoke-test-report\.json contains customer-config-effective-session/,
  );

  writeCustomerConfigManifestEvidence(evidenceDir, "different-runtime-manifest");

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
      }),
    /customer-config-manifest-evidence\.json revision must match smoke-test-report\.json customer-config-effective-session expectedRevision/,
  );

  writeCustomerConfigManifestEvidence(evidenceDir);

  assert.doesNotThrow(() =>
    validateReleaseEvidenceGate({
      repoRoot: root,
      evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-16",
    }),
  );
});
