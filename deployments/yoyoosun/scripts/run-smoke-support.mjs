#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";

const command = process.argv[2];

function printHelp() {
  process.stdout.write([
    "用法:",
    "  bash deployments/yoyoosun/scripts/run-smoke.sh \\",
    "    --endpoint https://erp.example.invalid \\",
    "    --backend-url http://127.0.0.1:8300 \\",
    "    --release-version <40-character-lowercase-git-sha> \\",
    "    --environment customer-trial \\",
    "    --report output/yoyoosun-smoke.json \\",
    "    --admin-username admin \\",
    "    --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD \\",
    "    --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD \\",
    "    --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE \\",
    "    --customer-config-revision yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1 \\",
    "    --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN",
    "",
    "Input template only:",
    "  bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template",
    "",
    "说明:",
    "  做轻量 health / route / auth capabilities / credential login matrix / customer_config effective session smoke；",
    "  带管理员 token 时还会真实生成最小 PDF，不创建业务事实。133 的 admin 与 UAT 密码",
    "  固定从凭据合同读取，环境变量只保留调用参数兼容且不能覆盖合同值；",
    "  短信手机号只有人工录入对应环境变量时才校验。报告不保存密码、token、手机号或原始 profile。",
    "",
  ].join("\n"));
}

function printInputTemplate() {
  const template = {
    scope: "yoyoosun-run-smoke-input-template",
    customer: "yoyoosun",
    writesReport: false,
    writesDatabase: false,
    callsEndpoint: false,
    callsBackend: false,
    callsCustomerConfig: false,
    readsAdminToken: false,
    secretInputs: [
      "CUSTOMER_CONFIG_ADMIN_TOKEN or the environment variable named by --admin-token-env",
      "optional SMS phone from the environment variable named by --sms-phone-env",
    ],
    requiredInputs: [
      "public ERP endpoint without username/password",
      "release version",
      "environment",
      "smoke report path",
      "optional backend URL without username/password",
      "credential contract admin username and password environment variable names when backend URL is provided",
      "customer config revision when active revision readback is required",
      "admin token env name when customer config readback is required",
    ],
    checks: [
      "web-healthz",
      "web-readyz",
      "server-healthz when --backend-url is provided",
      "server-readyz when --backend-url is provided",
      "login-page",
      "mobile-role-route",
      "credential-login-matrix (admin + 10 uat identities and 11 unique tokens; exact admin phone binding only when configured)",
      "auth-sms-capabilities (provider/enabled/not-mock)",
      "customer-config-effective-session when --customer-config-revision is provided",
      "template-pdf-render when --customer-config-revision and an admin token are provided",
    ],
    commands: [
      "bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --backend-url https://api.example.invalid --release-version <release-version> --environment customer-trial --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --admin-username admin --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE",
      "CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --backend-url https://api.example.invalid --release-version <release-version> --environment customer-trial --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --admin-username admin --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE --customer-config-revision yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1 --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN",
    ],
    requiredReadbackEvidence: [
      "check name=auth-sms-capabilities, target=jsonrpc:auth.capabilities, expectedMode=provider, enabled=true, mockDelivery=false, responseBodyStored=false",
      "check name=credential-login-matrix, target=jsonrpc:auth.admin_login, totalAuthenticated=11, uniqueTokensObserved=true, phoneConfigured=false or phoneBound=true, responseBodyStored=false",
      "check name=customer-config-effective-session",
      "target=jsonrpc:customer_config.get_effective_session",
      "expectedRevision matches the activated customer config revision",
      "tokenSourceEnv is recorded",
      "responseBodyStored=false",
      "template-pdf-render returns HTTP 200 with application/pdf, starts with %PDF, and records only contentType/sha256/sizeBytes with responseBodyStored=false",
      "report backendEndpointAlias matches the release executor report backendEndpointAlias",
    ],
    boundary: "This template does not call endpoints, read secrets, call customer_config, write smoke-test-report.json, write database rows, import business data, or prove active revision readback. Real proof requires running the smoke command against the target backend with the fixed credential contract plus an admin token env when customer configuration readback is requested; the report stores only aggregate login evidence, usernames, source labels, env keys, and redacted customer-config evidence.",
  };
  process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
}

function credentialContract(file) {
  const contractBytes = fs.readFileSync(file);
  const contract = JSON.parse(contractBytes.toString("utf8"));
  const admin = contract?.credentials?.admin;
  const uat = contract?.credentials?.uat;
  const sms = contract?.smsLoginIdentity;
  const envKey = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const username = /^[A-Za-z0-9_]+$/;
  const expectedUATUsernames = [
    "uat_boss", "uat_sales", "uat_purchase", "uat_production", "uat_warehouse",
    "uat_quality", "uat_finance", "uat_pmc", "uat_engineering", "uat_admin",
  ];
  const valid =
    contract?.schemaVersion === "yoyoosun-credential-contract/v4" &&
    contract?.customerCode === "yoyoosun" &&
    contract?.target?.key === "customer-trial-133" &&
    contract?.target?.deploymentTarget === "demo-133" &&
    contract?.target?.database === "plush_erp_demo_v1" &&
    contract?.target?.datasetVersion === "2026.08.15-v6" &&
    username.test(admin?.username || "") &&
    admin?.environmentVariable === "MANUAL_ACCEPTANCE_ADMIN_PASSWORD" &&
    admin?.credentialSource === "contract-fixed-test" &&
    admin?.fixedTestPassword === "adminadmin" &&
    uat?.environmentVariable === "MANUAL_ACCEPTANCE_UAT_PASSWORD" &&
    uat?.credentialSource === "contract-fixed-test" &&
    uat?.fixedTestPassword === "12345678" &&
    JSON.stringify(uat?.usernames) === JSON.stringify(expectedUATUsernames) &&
    uat.usernames.every((value) => username.test(value) && value.startsWith("uat_")) &&
    !uat.usernames.includes(admin.username) &&
    sms?.username === admin.username &&
    envKey.test(sms?.environmentVariable || "") &&
    sms?.phoneRequiredWhenProviderEnabled === false &&
    sms?.verifyPhoneIdentityWhenConfigured === true &&
    sms?.keychain?.service === "plush-toy-erp-yoyoosun-sms-phone" &&
    sms?.keychain?.account === "customer-trial-133:admin" &&
    contract?.policy?.passwordsMustDiffer === true &&
    JSON.stringify(contract?.policy?.registeredSimplePasswordTargets) === JSON.stringify(["local-dev", "customer-trial-133"]) &&
    contract.policy.customerTrialUsesFixedPublicTestCredentials === true &&
    contract.policy.rotateAfterCreateRestoreOrRollback === true &&
    contract.policy.revokeExistingSessionsOnRotation === true &&
    contract.policy.requireCredentialLoginMatrixBeforeCutover === true &&
    contract?.redaction?.containsSecrets === false &&
    contract.redaction.contractContainsPublicTestPasswords === true &&
    contract.redaction.storePasswords === false &&
    contract.redaction.storeTokens === false &&
    contract.redaction.storePhoneNumber === false &&
    contract.redaction.storeRawProfiles === false;
  if (!valid) throw new Error("invalid yoyoosun credential contract");
  process.stdout.write([
    admin.username,
    admin.fixedTestPassword,
    admin.environmentVariable,
    admin.credentialSource,
    uat.fixedTestPassword,
    uat.environmentVariable,
    uat.credentialSource,
    uat.usernames.join(","),
    contract.schemaVersion,
    sms.environmentVariable,
    contract.target.key,
    contract.target.database,
    contract.target.datasetVersion,
    crypto.createHash("sha256").update(contractBytes).digest("hex"),
  ].join("\t") + "\n");
}

function validateAuthCapabilities() {
  try {
    const parsed = JSON.parse(process.env.SMOKE_RESPONSE || "");
    const sms = parsed?.result?.data?.sms_login;
    const valid = parsed?.jsonrpc === "2.0" &&
      parsed?.id === "auth-capabilities-smoke" &&
      parsed?.result?.code === 0 &&
      sms?.enabled === true &&
      sms?.mode === "provider" &&
      sms?.mock_delivery === false;
    process.exit(valid ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

function sha256(file) {
  process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
}

switch (command) {
  case "help":
    printHelp();
    break;
  case "input-template":
    printInputTemplate();
    break;
  case "credential-contract":
    credentialContract(process.argv[3]);
    break;
  case "auth-capabilities":
    validateAuthCapabilities();
    break;
  case "sha256":
    sha256(process.argv[3]);
    break;
  default:
    process.exit(2);
}
