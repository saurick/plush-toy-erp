import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";

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
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| backupId | backup-20260616 |
| backupTime | 2026-06-16T12:00:00+08:00 |
| backupPurpose | pre-migration |
| databaseBackupHash | sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc |
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
        releaseVersion: overrides.releaseVersion ?? "20260616T1200-test",
        backupId: "backup-20260616",
        verifiedAt: "2026-06-16T04:00:00Z",
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
        summary: { total: 3, passed: 3, failed: 0 },
        checks: [
          { name: "server-healthz", status: "pass" },
          { name: "server-readyz", status: "pass" },
          { name: "web-healthz", status: "pass" },
        ],
        redaction: { containsSecrets: false, containsRawCustomerRows: false },
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
| releaseConclusion | customer-trial-approved |
| deploymentOperator | deployment-operator |
| evidenceReviewer | reviewer |
| customerOrBusinessConfirmation | trial-scope-confirmed |

- [x] pre-migration backup evidence verified
- [x] known limitations reviewed
`,
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
  assert.equal(result.requiredFiles.length, 6);
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
