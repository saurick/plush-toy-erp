#!/usr/bin/env node

import fs from "node:fs";

const command = process.argv[2];

function printHelp() {
  process.stdout.write([
    "用法:",
    "  bash deployments/yoyoosun/scripts/rotate-credentials-133.sh \\",
    "    --ssh-target simon@192.168.0.133 \\",
    "    --expected-release <40-character-lowercase-git-sha> \\",
    "    --expected-migration <14-digit-atlas-version> \\",
    "    --operation-id <unique-operation-id> \\",
    "    --backup-file </absolute/remote/pre-rotation.dump> \\",
    "    --backup-sha256 <64-hex> \\",
    "    --report <local-redacted-receipt.json> \\",
    "    --confirm 'ROTATE_YOYOOSUN_CREDENTIALS_133:<release>:<migration>:<operation-id>'",
    "",
    "说明:",
    "  只在发布工作站运行。admin 与 uat_* 岗位账号只使用",
    "  credential.contract.json 登记的固定测试密码；短信手机号仅在对应",
    "  Keychain alias 已人工录入时读取。",
    "  三项值只经 SSH stdin 临时注入一次性 Compose 容器，不进入服务器 steady env",
    "  或脱敏 receipt。执行前必须提供已存在且 hash 匹配的远端备份。",
    "",
  ].join("\n"));
}

function credentialContract(file) {
  const contract = JSON.parse(fs.readFileSync(file, "utf8"));
  const admin = contract?.credentials?.admin;
  const uat = contract?.credentials?.uat;
  const phone = contract?.smsLoginIdentity?.keychain;
  const text = (value) => typeof value === "string" && value.length > 0 && !/[\t\r\n]/u.test(value);
  const expectedUATUsernames = [
    "uat_boss", "uat_sales", "uat_purchase", "uat_production", "uat_warehouse",
    "uat_quality", "uat_finance", "uat_pmc", "uat_engineering", "uat_admin",
  ];
  if (
    contract?.schemaVersion !== "yoyoosun-credential-contract/v4" ||
    contract?.target?.key !== "customer-trial-133" ||
    contract?.target?.deploymentTarget !== "demo-133" ||
    contract?.target?.database !== "plush_erp_demo_v1" ||
    contract?.target?.datasetVersion !== "2026.08.15-v6" ||
    admin?.username !== "admin" || admin?.environmentVariable !== "MANUAL_ACCEPTANCE_ADMIN_PASSWORD" ||
    admin?.credentialSource !== "contract-fixed-test" || admin?.fixedTestPassword !== "adminadmin" ||
    uat?.environmentVariable !== "MANUAL_ACCEPTANCE_UAT_PASSWORD" ||
    uat?.credentialSource !== "contract-fixed-test" || uat?.fixedTestPassword !== "12345678" ||
    JSON.stringify(uat?.usernames) !== JSON.stringify(expectedUATUsernames) ||
    !text(phone?.service) || !text(phone?.account) ||
    JSON.stringify(contract?.policy?.registeredSimplePasswordTargets) !== JSON.stringify(["local-dev", "customer-trial-133"]) ||
    contract?.policy?.customerTrialUsesFixedPublicTestCredentials !== true ||
    contract?.policy?.passwordsMustDiffer !== true ||
    contract.policy.rotateAfterCreateRestoreOrRollback !== true ||
    contract.policy.revokeExistingSessionsOnRotation !== true ||
    contract.policy.requireCredentialLoginMatrixBeforeCutover !== true ||
    contract?.smsLoginIdentity?.phoneRequiredWhenProviderEnabled !== false ||
    contract.smsLoginIdentity.verifyPhoneIdentityWhenConfigured !== true ||
    contract?.redaction?.containsSecrets !== false ||
    contract.redaction.contractContainsPublicTestPasswords !== true ||
    contract.redaction.storePasswords !== false ||
    contract.redaction.storeTokens !== false ||
    contract.redaction.storePhoneNumber !== false ||
    contract.redaction.storeRawProfiles !== false
  ) throw new Error("invalid yoyoosun credential contract");
  process.stdout.write([
    admin.fixedTestPassword,
    uat.fixedTestPassword,
    phone.service,
    phone.account,
  ].join("\t") + "\n");
}

function validateReport(file, release, migration, operationId, phoneExpectedRaw) {
  const phoneExpected = phoneExpectedRaw === "true";
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const accounts = Array.isArray(report.accounts) ? report.accounts : [];
  const valid =
    report.target === "customer-trial-133" &&
    report.datasetVersion === "2026.08.15-v6" &&
    report.release === release &&
    report.migrationVersion === migration &&
    report.operationId === operationId &&
    report.adminAccounts === 1 &&
    report.accountKind === "customer-uat" &&
    report.roleAccounts === 10 &&
    report.authVersionIncremented === true &&
    report.phoneBound === phoneExpected &&
    report.auditSource === "manual_acceptance_password_rotation" &&
    accounts.length === 11 &&
    new Set(accounts.map((item) => item?.username)).size === 11 &&
    accounts.every((item) => Number.isSafeInteger(item?.authVersion) && item.authVersion > 1) &&
    accounts.every((item) => item?.phoneBound === (phoneExpected && item?.username === "admin")) &&
    accounts.filter((item) => item?.username !== "admin").every((item) => /^uat_/u.test(item?.username || ""));
  if (!valid) throw new Error("credential rotation receipt is incomplete");
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (/(?:password|access[_-]?token|phone)$/iu.test(key) && key !== "phoneBound") {
        throw new Error("credential rotation receipt contains forbidden sensitive fields");
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
    credentialContract(process.argv[3]);
    break;
  case "validate-report":
    validateReport(...process.argv.slice(3));
    break;
  default:
    process.exit(2);
}
