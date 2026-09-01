#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";

import {
  loadYoyoosunCredentialContract,
  selectYoyoosunCredentialTarget,
} from "./credential-contract.mjs";

const command = process.argv[2];

function printHelp() {
  process.stdout.write([
    "用法:",
    "  bash deployments/yoyoosun/scripts/run-smoke.sh \\",
    "    --endpoint https://erp.example.invalid \\",
    "    --backend-url http://127.0.0.1:8300 \\",
    "    --release-version <40-character-lowercase-git-sha> \\",
    "    --migration-version <14-digit-atlas-version> \\",
    "    --deployment-target <demo-133|customer-test-133> \\",
    "    --environment <demo-133|customer-test-133> \\",
    "    --report output/yoyoosun-smoke.json \\",
    "    --admin-username admin \\",
    "    --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD \\",
    "    --credential-operation-id <lowercase-uuid-v4> \\",
    "    --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD \\",
    "    --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE \\",
    "    --customer-config-revision yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1 \\",
    "    --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN",
    "",
    "Input template only:",
    "  bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template",
    "",
    "说明:",
    "  两个 target 都验证固定 admin；只有 demo-133 读取并认证合同精确列出的 10 个 UAT 账号，",
    "  也只有 demo-133 读取可选 SMS 手机号。customer-test-133 禁止 UAT/SMS 参数及读取。",
    "  带管理员 token 时会独立真实生成最小 PDF；只有同时提供 revision 才读回 effective session。",
    "  两项均不创建业务事实，报告不保存密码、token、手机号或原始 profile。",
    "",
  ].join("\n"));
}

function printInputTemplate() {
  const template = {
    scope: "yoyoosun-run-smoke-input-template",
    customer: "yoyoosun",
    deploymentTargets: ["demo-133", "customer-test-133"],
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
      "14-digit Atlas migration version",
      "deployment target and identical environment",
      "smoke report path",
      "optional backend URL without username/password",
      "credential contract admin username and password environment variable name when backend URL is provided",
      "credential rotation lowercase UUID v4 when backend URL is provided",
      "demo-133 only: UAT password and SMS phone environment variable names",
      "customer config revision when active revision readback is required",
      "admin token env name when customer config readback or PDF proof is required",
    ],
    checks: [
      "web-healthz",
      "web-readyz",
      "runtime-identity release-v1 before authentication",
      "server-healthz when --backend-url is provided",
      "server-readyz when --backend-url is provided",
      "login-page",
      "mobile-role-route",
      "credential-login-matrix (demo: admin + 10 UAT identities; customer-test: admin only)",
      "auth-sms-capabilities (provider/enabled/not-mock)",
      "customer-config-effective-session when --customer-config-revision is provided",
      "template-pdf-render when --admin-token-env supplies an admin token",
    ],
    commands: [
      "CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://demo.example.invalid --backend-url https://api.demo.example.invalid --release-version <40-character-lowercase-git-sha> --migration-version <14-digit-atlas-version> --credential-operation-id <lowercase-uuid-v4> --deployment-target demo-133 --environment demo-133 --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --admin-username admin --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE --customer-config-revision yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1 --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN",
      "bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://test.example.invalid --backend-url https://api.test.example.invalid --release-version <40-character-lowercase-git-sha> --migration-version <14-digit-atlas-version> --credential-operation-id <lowercase-uuid-v4> --deployment-target customer-test-133 --environment customer-test-133 --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --admin-username admin --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
    ],
    requiredReadbackEvidence: [
      "check name=auth-sms-capabilities, target=jsonrpc:auth.capabilities, expectedMode=provider, enabled=true, mockDelivery=false, responseBodyStored=false",
      "check name=runtime-identity binds release-v1, target database, exact 40-character release SHA and exact 14-digit migration; HTTP 200 and proof=matched-v1; responseBodyStored=false",
      "check name=credential-login-matrix binds deploymentTarget, commandTarget, targetIdentity and database; demo totalAuthenticated=11, customer-test totalAuthenticated=1",
      "credential-login-matrix binds a positive adminAuthVersion and the lowercase UUID v4 credential rotation operation id",
      "check name=customer-config-effective-session",
      "target=jsonrpc:customer_config.get_effective_session",
      "expectedRevision matches the activated customer config revision",
      "tokenSourceEnv is recorded",
      "responseBodyStored=false",
      "template-pdf-render returns HTTP 200 with application/pdf, starts with %PDF, and records only contentType/sha256/sizeBytes with responseBodyStored=false",
      "report backendEndpointAlias matches the release executor report backendEndpointAlias",
    ],
    boundary: "This template does not call endpoints, read secrets, call customer_config, write smoke-test-report.json, write database rows, import business data, or prove active revision readback. Real proof requires running the target-bound smoke command. customer-test-133 never reads, authenticates or modifies non-admin credentials and its receipt contains no dataset, UAT or SMS fields.",
  };
  process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
}

function credentialContract(file, deploymentTarget) {
  const target = selectYoyoosunCredentialTarget(
    loadYoyoosunCredentialContract({ contractPath: file }),
    deploymentTarget,
  );
  const demo = target.deploymentTarget === "demo-133";
  process.stdout.write([
    target.admin.username,
    target.admin.fixedTestPassword,
    target.admin.environmentVariable,
    target.admin.credentialSource,
    demo ? target.nonAdmin.credential.fixedTestPassword : "-",
    demo ? target.nonAdmin.credential.environmentVariable : "-",
    demo ? target.nonAdmin.credential.credentialSource : "-",
    demo ? target.nonAdmin.usernames.join(",") : "-",
    target.schemaVersion,
    demo ? target.sms.identity.environmentVariable : "-",
    target.deploymentTarget,
    target.commandTarget,
    target.database,
    demo ? target.datasetVersion : "-",
    target.targetIdentity,
    target.sha256,
    target.nonAdmin.policy,
    target.sms.policy,
  ].join("\t") + "\n");
}

function credentialIsolationEnvs(file) {
  const target = selectYoyoosunCredentialTarget(
    loadYoyoosunCredentialContract({ contractPath: file }),
    "demo-133",
  );
  const values = [
    target.nonAdmin.credential.environmentVariable,
    target.sms.identity.environmentVariable,
  ];
  if (!values.every((value) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value))) {
    process.exit(1);
  }
  process.stdout.write(`${values.join("\t")}\n`);
}

function runtimeIdentityDigest(database, release, migration) {
  if (
    !/^plush_erp_[a-z0-9_]+$/u.test(String(database ?? "")) ||
    !/^[a-f0-9]{40}$/u.test(String(release ?? "")) ||
    !/^\d{14}$/u.test(String(migration ?? ""))
  ) {
    process.exit(1);
  }
  process.stdout.write(
    crypto
      .createHash("sha256")
      .update(["release-v1", database, release, migration].join("\n"))
      .digest("hex"),
  );
}

function runtimeIdentityProof(file, httpCode) {
  const proofs = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .map((line) =>
      line.match(/^x-erp-runtime-identity-proof\s*:\s*(\S+)\s*$/iu)?.[1]
        ?.trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const valid =
    String(httpCode ?? "") === "200" &&
    proofs.length > 0 &&
    proofs.every((proof) => proof === "matched-v1");
  if (!valid) process.exit(1);
  process.stdout.write("matched-v1");
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
    credentialContract(process.argv[3], process.argv[4]);
    break;
  case "credential-isolation-envs":
    credentialIsolationEnvs(process.argv[3]);
    break;
  case "runtime-identity-digest":
    runtimeIdentityDigest(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case "runtime-identity-proof":
    runtimeIdentityProof(process.argv[3], process.argv[4]);
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
