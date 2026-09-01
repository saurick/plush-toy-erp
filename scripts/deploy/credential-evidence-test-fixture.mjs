import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  loadYoyoosunCredentialContract,
  selectYoyoosunCredentialTarget,
} from "../../deployments/yoyoosun/scripts/credential-contract.mjs";
import { MANUAL_ACCEPTANCE_CORE_CONTRACT } from "../qa/manual-acceptance-core-contract.mjs";

const fixtureRelease = "abc1234000000000000000000000000000000000";
const credentialOperationId = "00000000-0000-4000-8000-000000000001";
const currentDemoCustomerRevision =
  MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configRevision;

function markdownField(content, name) {
  return content
    .match(new RegExp(`^\\|\\s*${name}\\s*\\|\\s*([^|]+?)\\s*\\|$`, "mu"))?.[1]
    ?.trim();
}

export function writeCredentialEvidenceTestFixture(
  dir,
  customerRevision = currentDemoCustomerRevision,
  deploymentTarget = "demo-133",
) {
  const target = selectYoyoosunCredentialTarget(
    loadYoyoosunCredentialContract(),
    deploymentTarget,
  );
  const demo = deploymentTarget === "demo-133";
  const releasePath = path.join(dir, "release-evidence.md");
  const originalRelease = fs.readFileSync(releasePath, "utf8");
  const migrationVersion = markdownField(originalRelease, "migrationAfter");
  fs.writeFileSync(
    releasePath,
    originalRelease
      .replace(
        /^(\|\s*gitCommit\s*\|\s*)[^|]+?(\s*\|)$/mu,
        `$1${fixtureRelease}$2`,
      )
      .replace(
        /^(\|\s*environment\s*\|\s*)[^|]+?(\s*\|)$/mu,
        `$1${deploymentTarget}$2`,
      ),
  );

  for (const fileName of ["backup-evidence.md", "release-signoff-checklist.md"]) {
    const filePath = path.join(dir, fileName);
    const content = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(
      filePath,
      content.replace(
        /^(\|\s*environment\s*\|\s*)[^|]+?(\s*\|)$/mu,
        `$1${deploymentTarget}$2`,
      ),
    );
  }
  for (const fileName of [
    "backup-restore-report.json",
    "rollback-rehearsal-report.json",
  ]) {
    const filePath = path.join(dir, fileName);
    const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
    report.environment = deploymentTarget;
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  }

  const smokePath = path.join(dir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.deploymentTarget = deploymentTarget;
  smoke.environment = deploymentTarget;
  smoke.releaseVersion = fixtureRelease;
  smoke.generatedAt = "2026-06-28T13:21:00Z";
  smoke.checks = smoke.checks.filter(
    (check) =>
      check?.name !== "credential-login-matrix" &&
      check?.name !== "runtime-identity",
  );
  smoke.checks.unshift({
    name: "runtime-identity",
    status: "pass",
    target: "/readyz/runtime-identity",
    httpCode: "200",
    scope: "release-v1",
    database: target.database,
    releaseVersion: fixtureRelease,
    migrationVersion,
    expectedDigestSha256: crypto
      .createHash("sha256")
      .update(
        ["release-v1", target.database, fixtureRelease, migrationVersion].join(
          "\n",
        ),
      )
      .digest("hex"),
    proof: "matched-v1",
    responseBodyStored: false,
  });
  smoke.checks.push({
    name: "credential-login-matrix",
    status: "pass",
    target: "jsonrpc:auth.admin_login",
    credentialContractSchema: target.schemaVersion,
    credentialContractSha256: target.sha256,
    deploymentTarget: target.deploymentTarget,
    commandTarget: target.commandTarget,
    targetIdentity: target.targetIdentity,
    database: target.database,
    ...(demo ? { datasetVersion: target.datasetVersion } : {}),
    adminUsername: target.admin.username,
    adminAuthenticated: true,
    adminSuperAdmin: true,
    adminAuthVersion: 2,
    credentialOperationId,
    nonAdminPolicy: target.nonAdmin.policy,
    loginScope: demo ? "admin-plus-uat" : "admin-only",
    nonAdminExpected: target.nonAdmin.usernames.length,
    nonAdminAuthenticated: target.nonAdmin.usernames.length,
    totalExpected: target.nonAdmin.usernames.length + 1,
    totalAuthenticated: target.nonAdmin.usernames.length + 1,
    uniqueTokensObserved: true,
    usernames: [
      target.admin.username,
      ...target.nonAdmin.usernames,
    ],
    adminPasswordSource: target.admin.credentialSource,
    ...(demo
      ? {
          uatPasswordSource: target.nonAdmin.credential.credentialSource,
          smsPhoneSourceEnv: target.sms.identity.environmentVariable,
          phoneConfigured: false,
          phoneBound: false,
        }
      : {}),
    responseBodyStored: false,
  });
  smoke.summary.total = smoke.checks.length;
  smoke.summary.passed = smoke.checks.length;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  const rollbackPath = path.join(dir, "rollback-rehearsal-report.json");
  const rollback = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
  rollback.postCheck.smokeCheckCount = smoke.checks.length;
  if (
    !smoke.checks.some(
      (check) => check?.name === "customer-config-effective-session",
    )
  ) {
    delete rollback.postCheck.customerConfigEffectiveSession;
  }
  fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));

  const accounts = [
    target.admin.username,
    ...target.nonAdmin.usernames,
  ].map((username, index) => ({
    username,
    authVersion: index + 2,
    revokedSessions: index === 0 ? 1 : 0,
    phoneBound: false,
  }));
  fs.writeFileSync(
    path.join(dir, "credential-rotation-report.json"),
    JSON.stringify(
      {
        schemaVersion:
          "plush.manual-acceptance-credential-rotation-receipt/v1",
        generatedAt: "2026-06-28T13:20:00Z",
        operationId: credentialOperationId,
        deploymentTarget: target.deploymentTarget,
        target: target.commandTarget,
        targetIdentity: target.targetIdentity,
        database: target.database,
        ...(demo ? { datasetVersion: target.datasetVersion } : {}),
        migrationVersion,
        ...(demo ? { customerRevision } : {}),
        release: fixtureRelease,
        rollbackPoint: {
          backupAlias: `pre-credential-rotation-${fixtureRelease.slice(0, 12)}-${credentialOperationId}`,
          backupSha256: "a".repeat(64),
          backupSizeBytes: 1024,
          restoreChecked: true,
        },
        adminAccounts: 1,
        accountKind: demo ? "customer-uat" : "customer-test-admin-only",
        roleAccounts: target.nonAdmin.usernames.length,
        nonAdminPolicy: target.nonAdmin.policy,
        nonAdminAccounts: demo ? target.nonAdmin.usernames.length : 4,
        ...(demo ? {} : { nonAdminAccountsPreserved: true }),
        revokedSessions: 1,
        authVersionIncremented: true,
        auditSource: "manual_acceptance_password_rotation",
        phoneBound: false,
        accounts,
        replayed: false,
      },
      null,
      2,
    ),
  );
}
