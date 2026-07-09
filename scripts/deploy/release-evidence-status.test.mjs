import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildReleaseEvidenceStatus, parseCliArgs } from "./release-evidence-status.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/deploy/release-evidence-status.mjs");
const collectEvidencePath = path.join(repoRoot, "deployments/yoyoosun/scripts/collect-evidence.sh");

function runStatus(args = [], options = {}) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
  });
}

function writeDraftEvidence(root) {
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-29";
  const absoluteDir = path.join(root, evidenceDir);
  const result = spawnSync(
    "bash",
    [
      collectEvidencePath,
      "--release-version",
      "20260629T1200-draft",
      "--output",
      absoluteDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return { evidenceDir, absoluteDir };
}

function writeGatePassingEvidence(root) {
  const evidenceDir = "deployments/yoyoosun/evidence/releases/2026-06-16";
  const absoluteDir = path.join(root, evidenceDir);
  fs.mkdirSync(path.join(absoluteDir, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(absoluteDir, "release-evidence.md"),
    `# yoyoosun Release Evidence

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | 20260616T1200-test |
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
    path.join(absoluteDir, "production-preflight-report.txt"),
    `[production-preflight] ok: env 必需变量齐全
[production-preflight] ok: 生产 secret、镜像 tag、debug、后端端口和 PostgreSQL / Jaeger 暴露边界通过
[production-preflight] ok: Compose、低配部署边界和 migration 脚本通过
[production-preflight] ok: docker compose config -q 通过
[production-preflight] all checks passed
`,
  );
  fs.writeFileSync(
    path.join(absoluteDir, "image-digests.txt"),
    `serverImage=registry.example.invalid/plush/server:20260616T1200-test
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260616T1200-test
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`,
  );
  fs.writeFileSync(
    path.join(absoluteDir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260616T1200-test |
| environment | customer-trial |
| backupId | backup-20260616 |
| backupTime | 2026-06-16T12:00:00+08:00 |
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
    path.join(absoluteDir, "artifacts/backup-evidence.md"),
    "backupId=backup-20260616\nstorageLocationAlias=controlled-backup-store\n",
  );
  fs.writeFileSync(
    path.join(absoluteDir, "artifacts/migration-status-before-apply.txt"),
    "Current Version: 20260601000000\nPending Files: 1\n",
  );
  fs.writeFileSync(
    path.join(absoluteDir, "migration-status-before-apply.txt"),
    "Current Version: 20260601000000\nPending Files: 1\n",
  );
  fs.writeFileSync(
    path.join(absoluteDir, "artifacts/migration-status.txt"),
    "Current Version: 20260616000000\nPending Files: 0\n",
  );
  fs.writeFileSync(
    path.join(absoluteDir, "artifacts/command-summary.txt"),
    `backupId=backup-20260616
releaseVersion=20260616T1200-test
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke queries
`,
  );
  fs.writeFileSync(
    path.join(absoluteDir, "command-summary.txt"),
    `backupId=backup-20260616
releaseVersion=20260616T1200-test
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke queries
`,
  );
  fs.writeFileSync(
    path.join(absoluteDir, "backup-restore-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260616T1200-test",
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
  fs.writeFileSync(
    path.join(absoluteDir, "migration-status.txt"),
    "Migration Status: OK\nCurrent Version: 20260616000000\nPending Files: 0\n",
  );
  fs.writeFileSync(
    path.join(absoluteDir, "smoke-test-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260616T1200-test",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias: "https://api.example.invalid",
        summary: { total: 4, passed: 4, failed: 0 },
        checks: [
          { name: "server-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
          { name: "server-readyz", status: "pass", target: "https://erp.example.invalid/readyz", httpCode: "200" },
          { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/", httpCode: "200" },
          {
            name: "customer-config-effective-session",
            status: "pass",
            target: "jsonrpc:customer_config.get_effective_session",
            expectedRevision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
            tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
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
    path.join(absoluteDir, "rollback-forward-fix-plan.md"),
    `# yoyoosun Rollback / Forward-fix Plan

| 字段 | 值 |
| --- | --- |
| rollbackDecision | rollback-or-forward-fix-ready |
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
    path.join(absoluteDir, "rollback-rehearsal-report.json"),
    JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: "customer-trial",
        releaseVersion: "20260616T1200-test",
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
          smokeReport: evidenceDir + "/smoke-test-report.json",
          smokeCheckCount: 4,
          evidenceReviewStatus: "passed",
          customerConfigEffectiveSession: {
            status: "verified",
            target: "jsonrpc:customer_config.get_effective_session",
            expectedRevision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
            tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
            responseBodyStored: false,
          },
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
    path.join(absoluteDir, "release-signoff-checklist.md"),
    `# yoyoosun Release Sign-off

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260616T1200-test |
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
  return { evidenceDir, absoluteDir };
}

function writeCustomerConfigManifestEvidence(absoluteDir) {
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
        manifestSha256: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        reviewStatus: "approved",
        reviewer: "release-reviewer",
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

function writeCredentialedImageDigestsEvidence(absoluteDir) {
  const imageDigestsPath = path.join(absoluteDir, "image-digests.txt");
  const credentialedImageDigests = `serverImage=https://deploy:secret@registry.example.invalid/plush/server:20260616T1200-test
serverImageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
webImage=registry.example.invalid/plush/web:20260616T1200-test
webImageDigest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`;
  fs.writeFileSync(imageDigestsPath, credentialedImageDigests);
  return { imageDigestsPath, credentialedImageDigests };
}

test("parseCliArgs supports status options", () => {
  assert.deepEqual(
    parseCliArgs([
      "--evidence-dir",
      "deployments/yoyoosun/evidence/releases/2026-06-29",
      "--json",
      "--fail-on-not-ready",
    ]),
    {
      customer: "yoyoosun",
      evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
      json: true,
      failOnNotReady: true,
      help: false,
    },
  );
});

test("release evidence status reports missing evidence directory without throwing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-missing-"));
  const status = buildReleaseEvidenceStatus({
    repoRoot: root,
    evidenceDir: "deployments/yoyoosun/evidence/releases/missing",
  });

  assert.equal(status.status, "missing");
  assert.equal(status.ready, false);
  assert.equal(status.readOnly, true);
  assert.equal(status.scope.evidenceOnly, true);
  assert.match(status.scope.readyMeaning, /release evidence gate passed/);
  assert.ok(
    status.scope.notProvenByThisHelper.includes("target environment release was executed"),
  );
  assert.equal(status.directoryExists, false);
  assert.equal(status.missingFiles.length, status.requiredFileCount);
  assert.equal(status.closeoutChecklist.length, 6);
  assert.deepEqual(
    status.closeoutChecklist.map((item) => item.status),
    ["missing", "missing", "missing", "missing", "missing", "missing"],
  );
  assert.deepEqual(status.closeoutSummary, {
    total: 6,
    missing: 6,
    presentUnverified: 0,
    attention: 0,
    gateVerified: 0,
    blockers: 6,
    ready: false,
  });
  assert.equal(status.closeoutGateSummary.length, 6);
  assert(
    status.closeoutGateSummary.every(
      (item) => item.errorCount === 0 && item.warningCount === 0,
    ),
  );
  assert.deepEqual(
    status.closeoutChecklist.find((item) => item.id === "target-smoke").missingFiles,
    ["smoke-test-report.json"],
  );
  assert.match(status.nextCommands[0], /collect-evidence\.sh/);
});

test("release evidence status reports gate-verified closeout checklist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-checklist-ready-"));
  const { evidenceDir, absoluteDir } = writeGatePassingEvidence(root);
  writeCustomerConfigManifestEvidence(absoluteDir);

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "ready");
  assert.equal(status.ready, true);
  assert.equal(status.gateReady, true);
  assert.equal(status.closeoutChecklist.length, 7);
  assert.deepEqual(
    status.closeoutChecklist.map((item) => item.status),
    [
      "gate-verified",
      "gate-verified",
      "gate-verified",
      "gate-verified",
      "gate-verified",
      "gate-verified",
      "gate-verified",
    ],
  );
  assert.deepEqual(status.closeoutSummary, {
    total: 7,
    missing: 0,
    presentUnverified: 0,
    attention: 0,
    gateVerified: 7,
    blockers: 0,
    ready: true,
  });
  assert.equal(status.closeoutGateSummary.length, 7);
  assert(
    status.closeoutGateSummary.every(
      (item) => item.errorCount === 0 && item.warningCount === 0,
    ),
  );
  assert.deepEqual(status.closeoutNextActions, []);
  const customerConfig = status.closeoutChecklist.find(
    (item) => item.id === "customer-config-effective-session",
  );
  assert.deepEqual(customerConfig.files, [
    "customer-config-manifest-evidence.json",
    "smoke-test-report.json",
    "rollback-rehearsal-report.json",
  ]);
});

test("release evidence status exposes credentialed image digest gate errors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-image-secret-"));
  const { evidenceDir, absoluteDir } = writeGatePassingEvidence(root);
  const { imageDigestsPath, credentialedImageDigests } =
    writeCredentialedImageDigestsEvidence(absoluteDir);

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "draft");
  assert.equal(status.ready, false);
  assert.equal(status.gateReady, false);
  assert.match(status.gate.errors.join("\n"), /image-digests\.txt contains a credentialed URL/);
  const immutableVersion = status.closeoutChecklist.find(
    (item) => item.id === "immutable-version",
  );
  assert.equal(immutableVersion.status, "present-unverified");
  assert.deepEqual(immutableVersion.missingFiles, []);
  const immutableGate = status.closeoutGateSummary.find(
    (item) => item.id === "immutable-version",
  );
  assert.equal(immutableGate.errorCount >= 1, true);
  assert.match(
    immutableGate.sampleErrors.join("\n"),
    /image-digests\.txt contains a credentialed URL/,
  );
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), credentialedImageDigests);
});

test("release evidence status JSON redacts credentialed image digest values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-json-image-secret-"));
  const { evidenceDir, absoluteDir } = writeGatePassingEvidence(root);
  const { imageDigestsPath, credentialedImageDigests } =
    writeCredentialedImageDigestsEvidence(absoluteDir);

  const jsonResult = runStatus(["--evidence-dir", evidenceDir, "--json"], { cwd: root });

  assert.equal(jsonResult.status, 0, `${jsonResult.stdout}\n${jsonResult.stderr}`);
  assert.doesNotMatch(jsonResult.stdout, /deploy:secret/);
  assert.doesNotMatch(jsonResult.stdout, /secret@registry/);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.ready, false);
  assert.match(parsed.gate.errors.join("\n"), /image-digests\.txt contains a credentialed URL/);
  const immutableGate = parsed.closeoutGateSummary.find(
    (item) => item.id === "immutable-version",
  );
  assert.match(
    immutableGate.sampleErrors.join("\n"),
    /image-digests\.txt contains a credentialed URL/,
  );
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), credentialedImageDigests);
});

test("release evidence status reports draft evidence gate errors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-draft-"));
  const { evidenceDir } = writeDraftEvidence(root);
  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "draft");
  assert.equal(status.ready, false);
  assert.equal(status.directoryExists, true);
  assert.equal(status.missingFiles.length, 0);
  assert.ok(status.gate.errorCount > 0);
  assert.match(status.gate.errors.join("\n"), /placeholder|待填写|release evidence gate/i);
  const immutableGate = status.closeoutGateSummary.find(
    (item) => item.id === "immutable-version",
  );
  assert.equal(immutableGate.errorCount >= 1, true);
  assert.match(immutableGate.sampleErrors.join("\n"), /release-evidence\.md|image-digests\.txt/);
  const preflightGate = status.closeoutGateSummary.find(
    (item) => item.id === "production-preflight",
  );
  assert.equal(preflightGate.errorCount >= 1, true);
  assert.match(preflightGate.sampleErrors.join("\n"), /production-preflight-report\.txt/);
  const backupGate = status.closeoutGateSummary.find(
    (item) => item.id === "backup-restore-rehearsal",
  );
  assert.equal(backupGate.errorCount >= 1, true);
  assert.match(backupGate.sampleErrors.join("\n"), /backup-evidence\.md|backup-restore-report\.json/);
  assert.match(status.nextCommands.at(-1), /release-evidence-gate\.mjs/);
  assert.deepEqual(
    status.closeoutNextActions.map((item) => item.id),
    [
      "immutable-version",
      "production-preflight",
      "backup-restore-rehearsal",
      "target-smoke",
      "rollback-forward-fix",
      "release-signoff",
    ],
  );
  const immutableVersion = status.closeoutNextActions.find(
    (item) => item.id === "immutable-version",
  );
  assert.match(immutableVersion.commands.join("\n"), /immutable-version-evidence\.mjs/);
  assert.match(immutableVersion.commands.join("\n"), /--migration-before <migration-before>/);
  assert.match(immutableVersion.manualChecks.join("\n"), /gitCommit/);
  const productionPreflight = status.closeoutNextActions.find(
    (item) => item.id === "production-preflight",
  );
  assert.match(productionPreflight.commands.join("\n"), /production-preflight\.sh/);
  assert.match(productionPreflight.manualChecks.join("\n"), /real runtime \.env/);
  const backupRestore = status.closeoutNextActions.find(
    (item) => item.id === "backup-restore-rehearsal",
  );
  assert.match(backupRestore.commands.join("\n"), /run-backup-restore-rehearsal\.sh/);
  assert.match(backupRestore.commands.join("\n"), /--backup-purpose pre-migration/);
  const targetSmoke = status.closeoutNextActions.find((item) => item.id === "target-smoke");
  assert.match(targetSmoke.commands.join("\n"), /run-smoke\.sh/);
  const rollback = status.closeoutNextActions.find((item) => item.id === "rollback-forward-fix");
  assert.match(rollback.commands.join("\n"), /rollback-rehearsal-report\.mjs/);
  const signoff = status.closeoutNextActions.find((item) => item.id === "release-signoff");
  assert.match(signoff.manualChecks.join("\n"), /release-signoff-checklist\.md/);
});

test("release evidence status reports incomplete evidence artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-incomplete-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.unlinkSync(path.join(absoluteDir, "smoke-test-report.json"));

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "incomplete");
  assert.equal(status.ready, false);
  assert.deepEqual(status.missingFiles, ["smoke-test-report.json"]);
  const nextCommands = status.nextCommands.join("\n");
  assert.match(nextCommands, /run-smoke\.sh/);
  assert.match(nextCommands, /--report deployments\/yoyoosun\/evidence\/releases\/2026-06-29\/smoke-test-report\.json/);
  assert.doesNotMatch(nextCommands, /run-smoke\.sh[^\n]+--out/);
});

test("release evidence status suggests customer config smoke when manifest evidence exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-config-smoke-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
        manifestSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reviewStatus: "approved",
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
  fs.unlinkSync(path.join(absoluteDir, "smoke-test-report.json"));

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "incomplete");
  assert.equal(status.ready, false);
  assert.equal(status.customerConfigManifestEvidence.exists, true);
  assert.equal(
    status.customerConfigManifestEvidence.revision,
    "yoyoosun-customer-package-v4.runtime-manifest-v1",
  );
  const nextCommands = status.nextCommands.join("\n");
  assert.match(nextCommands, /run-smoke\.sh/);
  assert.match(nextCommands, /--backend-url <backend-endpoint>/);
  assert.match(nextCommands, /--customer-config-revision yoyoosun-customer-package-v4\.runtime-manifest-v1/);
  assert.match(nextCommands, /--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN/);
  assert.match(nextCommands, /--report deployments\/yoyoosun\/evidence\/releases\/2026-06-29\/smoke-test-report\.json/);
  const customerConfigAction = status.closeoutNextActions.find(
    (item) => item.id === "customer-config-effective-session",
  );
  assert.match(customerConfigAction.commands.join("\n"), /run-smoke\.sh/);
  assert.match(
    customerConfigAction.commands.join("\n"),
    /--customer-config-revision yoyoosun-customer-package-v4\.runtime-manifest-v1/,
  );
  assert.match(customerConfigAction.commands.join("\n"), /rollback-rehearsal-report\.mjs/);
});

test("release evidence status suggests customer config smoke when smoke exists without effective session check", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-config-smoke-existing-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
        manifestSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reviewStatus: "approved",
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

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "draft");
  assert.equal(status.customerConfigManifestEvidence.exists, true);
  assert.equal(status.customerConfigSmokeEvidence.exists, true);
  assert.equal(status.customerConfigSmokeEvidence.hasCustomerConfigCheck, false);
  assert.match(
    status.warnings.join("\n"),
    /smoke-test-report\.json does not contain customer-config-effective-session/,
  );
  const nextCommands = status.nextCommands.join("\n");
  assert.match(nextCommands, /run-smoke\.sh/);
  assert.match(nextCommands, /--backend-url <backend-endpoint>/);
  assert.match(nextCommands, /--customer-config-revision yoyoosun-customer-package-v4\.runtime-manifest-v1/);
  assert.match(nextCommands, /--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN/);
  assert.match(nextCommands, /--report deployments\/yoyoosun\/evidence\/releases\/2026-06-29\/smoke-test-report\.json/);
});

test("release evidence status warns when customer config manifest evidence cannot provide revision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-config-warning-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    "{ invalid json",
  );
  fs.unlinkSync(path.join(absoluteDir, "smoke-test-report.json"));

  const invalidStatus = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });
  assert.equal(invalidStatus.status, "incomplete");
  assert.equal(invalidStatus.customerConfigManifestEvidence.exists, true);
  assert.match(invalidStatus.customerConfigManifestEvidence.parseError, /JSON/);
  assert.match(invalidStatus.warnings.join("\n"), /not valid JSON/);
  assert.match(
    invalidStatus.nextCommands.join("\n"),
    /customer-config-manifest-evidence\.mjs --manifest output\/customers\/yoyoosun\/customer-config-runtime-manifest\.json/,
  );
  assert.doesNotMatch(
    invalidStatus.nextCommands.join("\n"),
    /--customer-config-revision/,
  );

  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        manifestSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reviewStatus: "approved",
      },
      null,
      2,
    ),
  );

  const missingRevisionStatus = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });
  assert.equal(missingRevisionStatus.status, "incomplete");
  assert.match(missingRevisionStatus.warnings.join("\n"), /missing revision/);
  assert.match(
    missingRevisionStatus.nextCommands.join("\n"),
    /customer-config-manifest-evidence\.mjs --manifest output\/customers\/yoyoosun\/customer-config-runtime-manifest\.json/,
  );
});

test("release evidence status cross-checks customer config smoke and manifest evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-config-cross-check-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  const smokePath = path.join(absoluteDir, "smoke-test-report.json");
  const smokeReport = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smokeReport.backendEndpointAlias = "target-backend";
  smokeReport.checks.push({
    name: "customer-config-effective-session",
    status: "pass",
    target: "jsonrpc:customer_config.get_effective_session",
    expectedRevision: "yoyoosun-customer-package-v4.runtime-manifest-v1",
    tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
    responseBodyStored: false,
  });
  smokeReport.summary.total = smokeReport.checks.length;
  smokeReport.summary.passed = smokeReport.checks.length;
  smokeReport.summary.failed = 0;
  fs.writeFileSync(smokePath, `${JSON.stringify(smokeReport, null, 2)}\n`);

  const missingManifestStatus = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });
  assert.equal(missingManifestStatus.customerConfigSmokeEvidence.hasCustomerConfigCheck, true);
  assert.equal(
    missingManifestStatus.customerConfigSmokeEvidence.expectedRevision,
    "yoyoosun-customer-package-v4.runtime-manifest-v1",
  );
  assert.match(
    missingManifestStatus.warnings.join("\n"),
    /customer-config-effective-session.*customer-config-manifest-evidence\.json is missing/,
  );
  assert.match(
    missingManifestStatus.nextCommands.join("\n"),
    /customer-config-manifest-evidence\.mjs --manifest output\/customers\/yoyoosun\/customer-config-runtime-manifest\.json/,
  );

  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    JSON.stringify(
      {
        customerKey: "yoyoosun",
        revision: "different-runtime-manifest",
        manifestSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reviewStatus: "approved",
      },
      null,
      2,
    ),
  );

  const mismatchedStatus = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });
  assert.match(
    mismatchedStatus.warnings.join("\n"),
    /revision different-runtime-manifest does not match smoke-test-report\.json expectedRevision yoyoosun-customer-package-v4\.runtime-manifest-v1/,
  );
  assert.match(
    mismatchedStatus.nextCommands.join("\n"),
    /customer-config-manifest-evidence\.mjs --manifest output\/customers\/yoyoosun\/customer-config-runtime-manifest\.json/,
  );
});

test("release evidence status is not ready when gate passes with warnings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-attention-"));
  const { evidenceDir, absoluteDir } = writeGatePassingEvidence(root);
  const smokePath = path.join(absoluteDir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.checks = smoke.checks.filter((check) => check.name !== "customer-config-effective-session");
  smoke.summary = { total: smoke.checks.length, passed: smoke.checks.length, failed: 0 };
  fs.writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
  const reportPath = path.join(absoluteDir, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.postCheck.smokeCheckCount = smoke.checks.length;
  delete report.postCheck.customerConfigEffectiveSession;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    path.join(absoluteDir, "customer-config-manifest-evidence.json"),
    "{ invalid json",
  );

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.gate.passed, true);
  assert.equal(status.gateReady, true);
  assert.equal(status.status, "attention");
  assert.equal(status.ready, false);
  assert.match(
    status.warnings.join("\n"),
    /customer-config-manifest-evidence\.json is not valid JSON/,
  );

  const failResult = runStatus(["--evidence-dir", evidenceDir, "--fail-on-not-ready"], {
    cwd: root,
  });
  assert.equal(failResult.status, 1);
  assert.match(failResult.stdout, /release evidence status: attention/);
  assert.match(failResult.stdout, /warnings:/);
});

test("release evidence status suggests restore rehearsal for missing supporting artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-supporting-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.unlinkSync(path.join(absoluteDir, "migration-status-before-apply.txt"));
  fs.unlinkSync(path.join(absoluteDir, "command-summary.txt"));

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "incomplete");
  assert.equal(status.ready, false);
  assert.deepEqual(status.missingFiles, [
    "migration-status-before-apply.txt",
    "command-summary.txt",
  ]);
  const nextCommands = status.nextCommands.join("\n");
  assert.match(nextCommands, /run-backup-restore-rehearsal\.sh/);
  assert.match(nextCommands, /--backup-purpose pre-migration/);
  assert.match(nextCommands, /--evidence-dir deployments\/yoyoosun\/evidence\/releases\/2026-06-29/);
});

test("release evidence status suggests templates for missing plan and signoff artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-templates-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.unlinkSync(path.join(absoluteDir, "rollback-forward-fix-plan.md"));
  fs.unlinkSync(path.join(absoluteDir, "release-signoff-checklist.md"));

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "incomplete");
  assert.equal(status.ready, false);
  assert.deepEqual(status.missingFiles, [
    "rollback-forward-fix-plan.md",
    "release-signoff-checklist.md",
  ]);
  const nextCommands = status.nextCommands.join("\n");
  assert.match(
    nextCommands,
    /cp deployments\/yoyoosun\/evidence\/releases\/rollback-forward-fix-plan-template\.md deployments\/yoyoosun\/evidence\/releases\/2026-06-29\/rollback-forward-fix-plan\.md/,
  );
  assert.match(
    nextCommands,
    /cp deployments\/yoyoosun\/evidence\/releases\/release-signoff-checklist-template\.md deployments\/yoyoosun\/evidence\/releases\/2026-06-29\/release-signoff-checklist\.md/,
  );
});

test("release evidence status suggests release template for missing release evidence file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-release-template-"));
  const { evidenceDir, absoluteDir } = writeDraftEvidence(root);
  fs.unlinkSync(path.join(absoluteDir, "release-evidence.md"));

  const status = buildReleaseEvidenceStatus({ repoRoot: root, evidenceDir });

  assert.equal(status.status, "incomplete");
  assert.equal(status.ready, false);
  assert.deepEqual(status.missingFiles, ["release-evidence.md"]);
  const nextCommands = status.nextCommands.join("\n");
  assert.match(
    nextCommands,
    /cp deployments\/yoyoosun\/evidence\/releases\/release-evidence-template\.md deployments\/yoyoosun\/evidence\/releases\/2026-06-29\/release-evidence\.md/,
  );
});

test("release evidence status CLI supports JSON and fail-on-not-ready", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-cli-"));
  const { evidenceDir } = writeDraftEvidence(root);

  const jsonResult = runStatus(["--evidence-dir", evidenceDir, "--json"], { cwd: root });
  assert.equal(jsonResult.status, 0, `${jsonResult.stdout}\n${jsonResult.stderr}`);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.ready, false);

  const failResult = runStatus(["--evidence-dir", evidenceDir, "--fail-on-not-ready"], { cwd: root });
  assert.equal(failResult.status, 1);
  assert.match(failResult.stdout, /release evidence status: draft/);
  assert.match(failResult.stdout, /ready means: release evidence gate passed/);
  assert.match(failResult.stdout, /not proven by this helper:/);
  assert.match(failResult.stdout, /target migration was applied/);
  assert.match(failResult.stdout, /closeout: 0\/6 gate-verified; blockers=6/);
  assert.match(failResult.stdout, /closeout evidence checklist:/);
  assert.match(failResult.stdout, /immutable-version: present-unverified/);
  assert.match(failResult.stdout, /closeout gate summary:/);
  assert.match(failResult.stdout, /immutable-version: errors=\d+, warnings=0/);
  assert.match(failResult.stdout, /error: release-evidence\.md/);
  assert.match(failResult.stdout, /closeout next actions:/);
  assert.match(failResult.stdout, /production-preflight: present-unverified/);
  assert.match(failResult.stdout, /command: bash scripts\/deploy\/production-preflight\.sh/);
});

test("release evidence status CLI can fail not-ready while keeping JSON output machine-readable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-cli-json-fail-"));
  const { evidenceDir, absoluteDir } = writeGatePassingEvidence(root);
  const { imageDigestsPath, credentialedImageDigests } =
    writeCredentialedImageDigestsEvidence(absoluteDir);

  const result = runStatus(["--evidence-dir", evidenceDir, "--json", "--fail-on-not-ready"], {
    cwd: root,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /release evidence status:/);
  assert.doesNotMatch(result.stdout, /deploy:secret/);
  assert.doesNotMatch(result.stdout, /secret@registry/);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.ready, false);
  assert.equal(parsed.readOnly, true);
  assert.equal(parsed.gateReady, false);
  assert.match(parsed.gate.errors.join("\n"), /image-digests\.txt contains a credentialed URL/);
  const immutableGate = parsed.closeoutGateSummary.find(
    (item) => item.id === "immutable-version",
  );
  assert.match(
    immutableGate.sampleErrors.join("\n"),
    /image-digests\.txt contains a credentialed URL/,
  );
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), credentialedImageDigests);
});

test("release evidence status CLI exposes credentialed image digest gate errors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-status-cli-image-secret-"));
  const { evidenceDir, absoluteDir } = writeGatePassingEvidence(root);
  const { imageDigestsPath, credentialedImageDigests } =
    writeCredentialedImageDigestsEvidence(absoluteDir);

  const failResult = runStatus(["--evidence-dir", evidenceDir, "--fail-on-not-ready"], {
    cwd: root,
  });

  assert.equal(failResult.status, 1);
  assert.match(failResult.stdout, /release evidence status: draft/);
  assert.match(failResult.stdout, /gate: failed \(\d+\)/);
  assert.match(failResult.stdout, /gate errors:/);
  assert.match(failResult.stdout, /image-digests\.txt contains a credentialed URL/);
  assert.match(failResult.stdout, /closeout evidence checklist:/);
  assert.match(failResult.stdout, /immutable-version: present-unverified/);
  assert.match(failResult.stdout, /closeout gate summary:/);
  assert.match(failResult.stdout, /immutable-version: errors=\d+, warnings=0/);
  assert.match(
    failResult.stdout,
    /error: image-digests\.txt contains a credentialed URL/,
  );
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), credentialedImageDigests);
});
