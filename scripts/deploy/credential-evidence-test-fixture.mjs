import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const contractRaw = fs.readFileSync(
  path.join(repoRoot, "deployments/yoyoosun/env/credential.contract.json"),
);
const contract = JSON.parse(contractRaw.toString("utf8"));
const contractSha256 = crypto
  .createHash("sha256")
  .update(contractRaw)
  .digest("hex");
const fixtureRelease = "abc1234000000000000000000000000000000000";

function markdownField(content, name) {
  return content.match(new RegExp(`^\\|\\s*${name}\\s*\\|\\s*([^|]+?)\\s*\\|$`, "mu"))?.[1]?.trim();
}

export function writeCredentialEvidenceTestFixture(
  dir,
  customerRevision = "yoyoosun-customer-package-v7.runtime-manifest-v1",
) {
  const releasePath = path.join(dir, "release-evidence.md");
  const originalRelease = fs.readFileSync(releasePath, "utf8");
  const migrationVersion = markdownField(originalRelease, "migrationAfter");
  fs.writeFileSync(
    releasePath,
    originalRelease.replace(
      /^(\|\s*gitCommit\s*\|\s*)[^|]+?(\s*\|)$/mu,
      `$1${fixtureRelease}$2`,
    ),
  );

  const smokePath = path.join(dir, "smoke-test-report.json");
  const smoke = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  smoke.checks = smoke.checks.filter(
    (check) => check?.name !== "credential-login-matrix",
  );
  smoke.checks.push({
    name: "credential-login-matrix",
    status: "pass",
    target: "jsonrpc:auth.admin_login",
    credentialContractSchema: contract.schemaVersion,
    credentialContractSha256: contractSha256,
    credentialTarget: contract.target.key,
    credentialDatabase: contract.target.database,
    credentialDatasetVersion: contract.target.datasetVersion,
    adminUsername: contract.credentials.admin.username,
    adminAuthenticated: true,
    adminSuperAdmin: true,
    phoneConfigured: false,
    phoneBound: false,
    adminAuthVersion: 2,
    demoExpected: 10,
    demoAuthenticated: 10,
    totalExpected: 11,
    totalAuthenticated: 11,
    uniqueTokensObserved: true,
    usernames: [
      contract.credentials.admin.username,
      ...contract.credentials.demo.usernames,
    ],
    adminPasswordSource: "credential-contract",
    demoPasswordSource: "credential-contract",
    smsPhoneSourceEnv: contract.smsLoginIdentity.environmentVariable,
    responseBodyStored: false,
  });
  smoke.summary.total = smoke.checks.length;
  smoke.summary.passed = smoke.checks.length;
  fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2));

  const rollbackPath = path.join(dir, "rollback-rehearsal-report.json");
  const rollback = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
  rollback.postCheck.smokeCheckCount = smoke.checks.length;
  fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));

  const accounts = [
    contract.credentials.admin.username,
    ...contract.credentials.demo.usernames,
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
        generatedAt: "2026-06-28T13:20:00Z",
        operationId: "123e4567-e89b-42d3-a456-426614174000",
        target: contract.target.key,
        datasetVersion: contract.target.datasetVersion,
        migrationVersion,
        customerRevision,
        release: fixtureRelease,
        adminAccounts: 1,
        demoAccounts: 10,
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
