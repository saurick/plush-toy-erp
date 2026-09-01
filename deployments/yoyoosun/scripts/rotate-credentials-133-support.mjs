#!/usr/bin/env node

import fs from "node:fs";

import {
  getDeploymentTarget,
  loadDeploymentTargetRegistry,
} from "../../../scripts/deploy/deployment-targets.mjs";
import {
  loadYoyoosunCredentialContract,
  selectYoyoosunCredentialTarget,
} from "./credential-contract.mjs";
import { MANUAL_ACCEPTANCE_CORE_CONTRACT } from "../../../scripts/qa/manual-acceptance-core-contract.mjs";

const command = process.argv[2];
const rotationAccountKeys = Object.freeze([
  "authVersion",
  "phoneBound",
  "revokedSessions",
  "username",
]);
const rollbackPointKeys = Object.freeze([
  "backupAlias",
  "backupSha256",
  "backupSizeBytes",
  "restoreChecked",
]);
const credentialRotationReceiptContract =
  "plush.manual-acceptance-credential-rotation-receipt/v1";
const demoReceiptKeys = Object.freeze([
  "accountKind",
  "accounts",
  "adminAccounts",
  "auditSource",
  "authVersionIncremented",
  "customerRevision",
  "database",
  "datasetVersion",
  "deploymentTarget",
  "generatedAt",
  "migrationVersion",
  "nonAdminAccounts",
  "nonAdminPolicy",
  "operationId",
  "phoneBound",
  "release",
  "replayed",
  "revokedSessions",
  "roleAccounts",
  "rollbackPoint",
  "schemaVersion",
  "target",
  "targetIdentity",
]);
const customerTestReceiptKeys = Object.freeze([
  "accountKind",
  "accounts",
  "adminAccounts",
  "auditSource",
  "authVersionIncremented",
  "database",
  "deploymentTarget",
  "generatedAt",
  "migrationVersion",
  "nonAdminAccounts",
  "nonAdminAccountsPreserved",
  "nonAdminPolicy",
  "operationId",
  "phoneBound",
  "release",
  "replayed",
  "revokedSessions",
  "roleAccounts",
  "rollbackPoint",
  "schemaVersion",
  "target",
  "targetIdentity",
]);

function printHelp() {
  process.stdout.write([
    "用法:",
    "  bash deployments/yoyoosun/scripts/rotate-credentials-133.sh \\",
    "    --deployment-target <demo-133|customer-test-133> \\",
    "    --ssh-target simon@192.168.0.133 \\",
    "    --expected-release <40-character-lowercase-git-sha> \\",
    "    --expected-migration <14-digit-atlas-version> \\",
    "    --operation-id <lowercase-uuid-v4> \\",
    "    --report <local-redacted-receipt.json> \\",
    "    --confirm 'ROTATE_YOYOOSUN_CREDENTIALS_133:<deployment-target>:<release>:<migration>:<operation-id>'",
    "",
    "说明:",
    "  两个 deployment target 的稳定 admin 使用同一份固定测试凭据合同。",
    "  demo-133 另外轮换合同精确列出的 uat_* 账号并可绑定已登记 SMS 身份；",
    "  customer-test-133 只轮换 admin，非管理员账号必须保持不变。",
    "  凭据仅经 SSH stdin 注入一次性 Compose 容器，脱敏回执不保存密码、token、手机号或 hash。",
    "  轮换闭包会在 mutation 前创建并 restore-check operation-bound 专用备份；回执只保留 alias/hash/size。",
    "",
  ].join("\n"));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function rfc3339Nano(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function printCredentialContract(file, deploymentTarget) {
  const target = selectYoyoosunCredentialTarget(
    loadYoyoosunCredentialContract({ contractPath: file }),
    deploymentTarget,
  );
  const demo = target.deploymentTarget === "demo-133";
  process.stdout.write(
    [
      target.admin.fixedTestPassword,
      demo ? target.nonAdmin.credential.fixedTestPassword : "-",
      demo ? target.sms.identity.keychain.service : "-",
      demo ? target.sms.identity.keychain.account : "-",
    ].join("\t") + "\n",
  );
}

function printTargetConfig(file, deploymentTarget) {
  const registry = loadDeploymentTargetRegistry();
  const targetContract = selectYoyoosunCredentialTarget(
    loadYoyoosunCredentialContract({ contractPath: file, registry }),
    deploymentTarget,
  );
  const target = getDeploymentTarget(deploymentTarget, registry);
  process.stdout.write(
    [
      target.key,
      targetContract.commandTarget,
      targetContract.datasetVersion || "-",
      targetContract.targetIdentity,
      target.database.name,
      target.filesystem.root,
      target.filesystem.current,
      target.filesystem.runtimeEnv,
      target.compose.projectName,
      target.compose.directory,
      target.compose.baseFile,
      target.compose.overrideFile,
      target.compose.postgresService,
      target.compose.serverService,
      `${target.ssh.user}@${target.ssh.host}`,
      String(target.ssh.port),
    ].join("\t") + "\n",
  );
}

function validateReport(
  file,
  contractFile,
  deploymentTarget,
  release,
  migration,
  operationId,
  phoneExpectedRaw,
) {
  const target = selectYoyoosunCredentialTarget(
    loadYoyoosunCredentialContract({ contractPath: contractFile }),
    deploymentTarget,
  );
  const phoneExpected = phoneExpectedRaw === "true";
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const accounts = Array.isArray(report.accounts) ? report.accounts : [];
  const demo = deploymentTarget === "demo-133";
  const expectedUsernames = [target.admin.username, ...target.nonAdmin.usernames];
  const actualUsernames = accounts.map((item) => item?.username).sort();
  const expectedReceiptKeys = demo
    ? demoReceiptKeys
    : customerTestReceiptKeys;
  const manualAcceptanceTarget =
    MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133;
  const revokedSessions = accounts.reduce(
    (total, item) => total + (Number.isSafeInteger(item?.revokedSessions) ? item.revokedSessions : 0),
    0,
  );
  const valid =
    exactKeys(report, expectedReceiptKeys) &&
    report.schemaVersion === credentialRotationReceiptContract &&
    rfc3339Nano(report.generatedAt) &&
    typeof report.replayed === "boolean" &&
    report.deploymentTarget === deploymentTarget &&
    report.target === target.commandTarget &&
    report.targetIdentity === target.targetIdentity &&
    report.database === target.database &&
    report.release === release &&
    report.migrationVersion === migration &&
    report.operationId === operationId &&
    exactKeys(report.rollbackPoint, rollbackPointKeys) &&
    report.rollbackPoint.backupAlias ===
      `pre-credential-rotation-${release.slice(0, 12)}-${operationId}` &&
    /^[a-f0-9]{64}$/u.test(report.rollbackPoint.backupSha256) &&
    Number.isSafeInteger(report.rollbackPoint.backupSizeBytes) &&
    report.rollbackPoint.backupSizeBytes > 0 &&
    report.rollbackPoint.restoreChecked === true &&
    report.adminAccounts === 1 &&
    report.accountKind ===
      (demo ? "customer-uat" : "customer-test-admin-only") &&
    report.roleAccounts === target.nonAdmin.usernames.length &&
    report.nonAdminPolicy === target.nonAdmin.policy &&
    Number.isSafeInteger(report.nonAdminAccounts) &&
    report.nonAdminAccounts >= 0 &&
    (demo
      ? report.nonAdminAccounts === target.nonAdmin.usernames.length &&
        !("nonAdminAccountsPreserved" in report)
      : report.nonAdminAccountsPreserved === true) &&
    (demo
      ? report.datasetVersion === target.datasetVersion &&
        manualAcceptanceTarget?.target === target.commandTarget &&
        manualAcceptanceTarget?.deploymentTarget === target.deploymentTarget &&
        manualAcceptanceTarget?.databaseName === target.database &&
        MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion === target.datasetVersion &&
        report.customerRevision === manualAcceptanceTarget.configRevision
      : !("datasetVersion" in report) &&
        !("customerRevision" in report)) &&
    report.authVersionIncremented === true &&
    report.revokedSessions === revokedSessions &&
    report.phoneBound === (demo && phoneExpected) &&
    report.auditSource === "manual_acceptance_password_rotation" &&
    accounts.length === expectedUsernames.length &&
    new Set(actualUsernames).size === expectedUsernames.length &&
    JSON.stringify(actualUsernames) ===
      JSON.stringify([...expectedUsernames].sort()) &&
    accounts.every(
      (item) =>
        exactKeys(item, rotationAccountKeys) &&
        Number.isSafeInteger(item?.authVersion) &&
        item.authVersion > 1 &&
        Number.isSafeInteger(item?.revokedSessions) &&
        item.revokedSessions >= 0,
    ) &&
    accounts.every(
      (item) =>
        item?.phoneBound ===
        (demo && phoneExpected && item?.username === "admin"),
    );
  if (!valid) throw new Error("credential rotation receipt is incomplete");
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === "string") {
      if (value.startsWith("/")) {
        throw new Error(
          "credential rotation receipt contains an absolute path",
        );
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        /(?:password|access[_-]?token|phone)$/iu.test(key) &&
        key !== "phoneBound"
      ) {
        throw new Error(
          "credential rotation receipt contains forbidden sensitive fields",
        );
      }
      visit(child);
    }
  };
  visit(report);
  if (/\b1[3-9][0-9]{9}\b/u.test(JSON.stringify(report))) {
    throw new Error("credential rotation receipt contains a phone number");
  }
}

switch (command) {
  case "help":
    printHelp();
    break;
  case "credential-contract":
    printCredentialContract(process.argv[3], process.argv[4]);
    break;
  case "target-config":
    printTargetConfig(process.argv[3], process.argv[4]);
    break;
  case "validate-report":
    validateReport(...process.argv.slice(3));
    break;
  default:
    process.exit(2);
}
