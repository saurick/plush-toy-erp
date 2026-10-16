import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getDeploymentTarget } from "./deployment-targets.mjs";
import { RELEASE_EVIDENCE_CONTRACT } from "./release-evidence-contract.mjs";
import {
  PRODUCTION_PREFLIGHT_CHECKS,
  buildProductionPreflightReceipt,
} from "./production-preflight-receipt.mjs";

const DEFAULT_PRODUCT_COMMIT = "abc1234000000000000000000000000000000000";

export function writeBaseReleaseEvidenceTestFixture(
  dir,
  {
    deploymentTarget = "demo-133",
    releaseId = "20260628T2300-config-test",
    productCommit = DEFAULT_PRODUCT_COMMIT,
    migrationBefore = "20260601000000",
    migrationAfter = "20260628123354",
    recoveryProcedureChanged = true,
    backupId = "backup-20260628",
    restoreCompleted = true,
    smokeFailed = 0,
    customerConfigRevision = "",
    backendEndpointAlias = "https://api.example.invalid",
  } = {},
) {
  const target = getDeploymentTarget(deploymentTarget);
  const backupHash = "d".repeat(64);
  const serverDigest = `sha256:${"a".repeat(64)}`;
  const webDigest = `sha256:${"b".repeat(64)}`;
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "release-evidence.md"),
    `# yoyoosun Release Evidence

| 字段 | 值 |
| --- | --- |
| evidenceContract | ${RELEASE_EVIDENCE_CONTRACT} |
| customerCode | yoyoosun |
| releaseId | ${releaseId} |
| environment | ${deploymentTarget} |
| productCommit | ${productCommit} |
| serverImageDigest | ${serverDigest} |
| webImageDigest | ${webDigest} |
| migrationBefore | ${migrationBefore} |
| migrationAfter | ${migrationAfter} |
| recoveryProcedureChanged | ${recoveryProcedureChanged} |
| backupId | ${backupId} |
`,
  );
  fs.writeFileSync(
    path.join(dir, "production-preflight-report.json"),
    `${JSON.stringify(
      buildProductionPreflightReceipt({
        deploymentTarget,
        mode: "runtime-env",
        productCommit,
        generatedAt: "2026-06-28T13:00:00Z",
        checks: [
          PRODUCTION_PREFLIGHT_CHECKS.ENV_REQUIRED_KEYS,
          PRODUCTION_PREFLIGHT_CHECKS.PRODUCTION_BOUNDARIES,
          PRODUCTION_PREFLIGHT_CHECKS.COMPOSE_AND_MIGRATION,
          PRODUCTION_PREFLIGHT_CHECKS.COMPOSE_RUNTIME_SERVICES,
          PRODUCTION_PREFLIGHT_CHECKS.RUNTIME_HEALTH_READY,
        ],
      }),
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(dir, "image-digests.txt"),
    `serverImage=registry.example.invalid/plush/server:${releaseId}
serverImageDigest=${serverDigest}
webImage=registry.example.invalid/plush/web:${releaseId}
webImageDigest=${webDigest}
`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-evidence.md"),
    `# yoyoosun Backup Evidence

| 字段 | 值 |
| --- | --- |
| releaseId | ${releaseId} |
| environment | ${deploymentTarget} |
| backupId | ${backupId} |
| backupTime | 2026-06-28T21:00:00+08:00 |
| backupPurpose | pre-migration |
| migrationVersion | ${migrationBefore} |
| databaseBackupSize | 123456 |
| databaseBackupHash | sha256:${backupHash} |
| storageLocationAlias | controlled-backup-store |
| restoreTestStatus | verified-on-staging |
| smokeQueryStatus | pass |
`,
  );

  fs.writeFileSync(
    path.join(dir, "artifacts/backup-evidence.md"),
    `backupId=${backupId}\nstorageLocationAlias=controlled-backup-store\n`,
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status-before-apply.txt"),
    `Current Version: ${migrationBefore}\nPending Files: 1\n`,
  );
  fs.writeFileSync(
    path.join(dir, "artifacts/migration-status.txt"),
    `Current Version: ${migrationAfter}\nPending Files: 0\n`,
  );
  const commandSummary = `backupId=${backupId}
releaseId=${releaseId}
sourceAlias=env:SOURCE_POSTGRES_DSN
restoreTarget=temp-postgres-container:postgres:18:removed-after-run
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke queries
`;
  fs.writeFileSync(
    path.join(dir, "artifacts/command-summary.txt"),
    commandSummary,
  );
  fs.writeFileSync(path.join(dir, "command-summary.txt"), commandSummary);
  fs.writeFileSync(
    path.join(dir, "migration-status-before-apply.txt"),
    `Current Version: ${migrationBefore}\nPending Files: 1\n`,
  );
  fs.writeFileSync(
    path.join(dir, "migration-status.txt"),
    `Migration Status: OK\nCurrent Version: ${migrationAfter}\nPending Files: 0\n`,
  );
  fs.writeFileSync(
    path.join(dir, "backup-restore-report.json"),
    `${JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: deploymentTarget,
        releaseId,
        backupId,
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
          databaseBackupHash: backupHash,
          storageLocationAlias: "controlled-backup-store",
          migrationVersion: migrationBefore,
        },
        restore: {
          restoreTestStatus: "passed-temp-container",
          migrationBeforeApply: migrationBefore,
          restoreMigrationVersion: migrationAfter,
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
          restoreCompleted,
          migrationStatus: "ok",
          smokeQueryStatus: "passed",
        },
      },
      null,
      2,
    )}\n`,
  );

  const runtimeIdentity = {
    name: "runtime-identity",
    status: "pass",
    target: "/readyz/runtime-identity",
    httpCode: "200",
    scope: "release-v1",
    database: target.database.name,
    releaseVersion: productCommit,
    migrationVersion: migrationAfter,
    expectedDigestSha256: crypto
      .createHash("sha256")
      .update(
        [
          "release-v1",
          target.database.name,
          productCommit,
          migrationAfter,
        ].join("\n"),
      )
      .digest("hex"),
    proof: "matched-v1",
    responseBodyStored: false,
  };
  const checks = [
    runtimeIdentity,
    {
      name: "server-healthz",
      status: smokeFailed ? "fail" : "pass",
      target: `${backendEndpointAlias}/healthz`,
      httpCode: smokeFailed ? "500" : "200",
    },
    {
      name: "server-readyz",
      status: "pass",
      target: `${backendEndpointAlias}/readyz`,
      httpCode: "200",
    },
    {
      name: "web-healthz",
      status: "pass",
      target: "https://erp.example.invalid/healthz",
      httpCode: "200",
    },
  ];
  if (customerConfigRevision) {
    checks.push({
      name: "customer-config-effective-session",
      status: "pass",
      target: "jsonrpc:customer_config.get_effective_session",
      expectedRevision: customerConfigRevision,
      tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
      responseBodyStored: false,
    });
  }
  fs.writeFileSync(
    path.join(dir, "smoke-test-report.json"),
    `${JSON.stringify(
      {
        customerCode: "yoyoosun",
        deploymentTarget,
        environment: deploymentTarget,
        productCommit,
        generatedAt: "2026-06-28T13:21:00Z",
        endpointAlias: "https://erp.example.invalid",
        backendEndpointAlias,
        summary: {
          total: checks.length,
          passed: checks.length - Number(Boolean(smokeFailed)),
          failed: Number(Boolean(smokeFailed)),
        },
        checks,
        redaction: { containsSecrets: false, containsRawCustomerRows: false },
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(dir, "rollback-forward-fix-plan.md"),
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
    path.join(dir, "rollback-rehearsal-report.json"),
    `${JSON.stringify(
      {
        customerCode: "yoyoosun",
        environment: deploymentTarget,
        releaseId,
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
          smokeStatus: smokeFailed ? "failed" : "passed",
          smokeReport: "smoke-test-report.json",
          smokeCheckCount: checks.length,
          evidenceReviewStatus: "passed",
          ...(customerConfigRevision
            ? {
                customerConfigEffectiveSession: {
                  status: "verified",
                  expectedRevision: customerConfigRevision,
                  target: "jsonrpc:customer_config.get_effective_session",
                },
              }
            : {}),
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
    )}\n`,
  );
  fs.writeFileSync(
    path.join(dir, "release-signoff-checklist.md"),
    `# yoyoosun Release Sign-off

| 字段 | 值 |
| --- | --- |
| releaseId | ${releaseId} |
| environment | ${deploymentTarget} |
| backupId | ${backupId} |
| releaseConclusion | internal-only |
| deploymentOperator | deployment-operator |
| evidenceReviewer | reviewer |
| customerOrBusinessConfirmation | not-required-internal-only |

- [x] pre-migration backup evidence verified
- [x] known limitations reviewed
`,
  );

  return { productCommit, migrationAfter, releaseId };
}
