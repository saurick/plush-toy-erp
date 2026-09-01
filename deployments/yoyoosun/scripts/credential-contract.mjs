import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getDeploymentTarget,
  loadDeploymentTargetRegistry,
} from "../../../scripts/deploy/deployment-targets.mjs";

export const YOYOOSUN_CREDENTIAL_TARGETS = Object.freeze([
  "demo-133",
  "customer-test-133",
]);

const ADMIN_KEYS = Object.freeze([
  "credentialSource",
  "environmentVariable",
  "fixedTestPassword",
  "username",
]);
const DEMO_TARGET_KEYS = Object.freeze([
  "adminCredential",
  "commandTarget",
  "database",
  "datasetVersion",
  "deploymentTarget",
  "nonAdminCredential",
  "nonAdminPolicy",
  "smsLoginPolicy",
  "targetIdentity",
]);
const TEST_TARGET_KEYS = Object.freeze([
  "adminCredential",
  "commandTarget",
  "database",
  "deploymentTarget",
  "nonAdminPolicy",
  "smsLoginPolicy",
  "targetIdentity",
]);
const EXPECTED_UAT_USERNAMES = Object.freeze([
  "uat_boss",
  "uat_sales",
  "uat_purchase",
  "uat_production",
  "uat_warehouse",
  "uat_quality",
  "uat_finance",
  "uat_pmc",
  "uat_engineering",
  "uat_admin",
]);

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

function exactArray(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function envKey(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(String(value || ""));
}

function username(value) {
  return /^[A-Za-z0-9_]+$/u.test(String(value || ""));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function defaultYoyoosunCredentialContractPath() {
  return fileURLToPath(
    new URL("../env/credential.contract.json", import.meta.url),
  );
}

export function loadYoyoosunCredentialContract({
  contractPath = defaultYoyoosunCredentialContractPath(),
  registry = loadDeploymentTargetRegistry(),
} = {}) {
  const bytes = fs.readFileSync(contractPath);
  const contract = JSON.parse(bytes.toString("utf8"));
  const demo = contract?.targets?.["demo-133"];
  const customerTest = contract?.targets?.["customer-test-133"];
  const admin = contract?.credentials?.admin;
  const uat = contract?.credentials?.uat;
  const sms = contract?.smsLoginIdentity;
  const demoRegistry = getDeploymentTarget("demo-133", registry);
  const customerTestRegistry = getDeploymentTarget(
    "customer-test-133",
    registry,
  );

  const valid =
    exactKeys(contract, [
      "credentials",
      "customerCode",
      "policy",
      "redaction",
      "schemaVersion",
      "smsLoginIdentity",
      "targets",
    ]) &&
    contract.schemaVersion === "yoyoosun-credential-contract/v5" &&
    contract.customerCode === "yoyoosun" &&
    exactKeys(contract.targets, YOYOOSUN_CREDENTIAL_TARGETS) &&
    exactKeys(demo, DEMO_TARGET_KEYS) &&
    demo.deploymentTarget === "demo-133" &&
    demo.commandTarget === "customer-trial-133" &&
    demo.database === demoRegistry.database.name &&
    demo.datasetVersion === "2026.08.15-v6" &&
    demo.targetIdentity === `customer-trial-133:${demo.datasetVersion}` &&
    demo.adminCredential === "admin" &&
    demo.nonAdminPolicy === "rotate" &&
    demo.nonAdminCredential === "uat" &&
    demo.smsLoginPolicy === "bind-when-configured" &&
    demoRegistry.key === demo.deploymentTarget &&
    demoRegistry.customer === contract.customerCode &&
    demoRegistry.trialTarget === demo.commandTarget &&
    exactKeys(customerTest, TEST_TARGET_KEYS) &&
    customerTest.deploymentTarget === "customer-test-133" &&
    customerTest.commandTarget === "customer-test-133" &&
    customerTest.database === customerTestRegistry.database.name &&
    customerTest.targetIdentity ===
      "deployment-target:customer-test-133:clean-acceptance" &&
    customerTest.adminCredential === "admin" &&
    customerTest.nonAdminPolicy === "preserve" &&
    customerTest.smsLoginPolicy === "not-managed" &&
    customerTestRegistry.key === customerTest.deploymentTarget &&
    customerTestRegistry.customer === contract.customerCode &&
    customerTestRegistry.trialTarget === "none" &&
    exactKeys(contract.credentials, ["admin", "uat"]) &&
    exactKeys(admin, ADMIN_KEYS) &&
    admin.username === "admin" &&
    admin.environmentVariable === "MANUAL_ACCEPTANCE_ADMIN_PASSWORD" &&
    admin.credentialSource === "contract-fixed-test" &&
    admin.fixedTestPassword === "adminadmin" &&
    exactKeys(uat, [
      "credentialSource",
      "environmentVariable",
      "fixedTestPassword",
      "usernames",
    ]) &&
    exactArray(uat.usernames, EXPECTED_UAT_USERNAMES) &&
    uat.usernames.every(
      (value) => username(value) && value.startsWith("uat_"),
    ) &&
    !uat.usernames.includes(admin.username) &&
    uat.environmentVariable === "MANUAL_ACCEPTANCE_UAT_PASSWORD" &&
    uat.credentialSource === "contract-fixed-test" &&
    uat.fixedTestPassword === "12345678" &&
    admin.fixedTestPassword !== uat.fixedTestPassword &&
    exactKeys(contract.policy, [
      "demoUsesFixedPublicTestNonAdminCredential",
      "deploymentTargetsUseFixedPublicTestAdminCredential",
      "passwordsMustDiffer",
      "registeredSimplePasswordTargets",
      "requireCredentialLoginMatrixBeforeCutover",
      "revokeExistingSessionsOnRotation",
      "rotateAfterCreateRestorePromotionOrRollback",
    ]) &&
    contract.policy.passwordsMustDiffer === true &&
    exactArray(contract.policy.registeredSimplePasswordTargets, [
      "local-dev",
      "demo-133",
      "customer-test-133",
    ]) &&
    contract.policy.deploymentTargetsUseFixedPublicTestAdminCredential ===
      true &&
    contract.policy.demoUsesFixedPublicTestNonAdminCredential === true &&
    contract.policy.rotateAfterCreateRestorePromotionOrRollback === true &&
    contract.policy.revokeExistingSessionsOnRotation === true &&
    contract.policy.requireCredentialLoginMatrixBeforeCutover === true &&
    exactKeys(sms, [
      "environmentVariable",
      "keychain",
      "phoneRequiredWhenProviderEnabled",
      "username",
      "verifyPhoneIdentityWhenConfigured",
    ]) &&
    sms.username === admin.username &&
    envKey(sms.environmentVariable) &&
    sms.environmentVariable === "MANUAL_ACCEPTANCE_SMS_PHONE" &&
    sms.phoneRequiredWhenProviderEnabled === false &&
    sms.verifyPhoneIdentityWhenConfigured === true &&
    exactKeys(sms.keychain, ["account", "service"]) &&
    sms.keychain.service === "plush-toy-erp-yoyoosun-sms-phone" &&
    sms.keychain.account === "customer-trial-133:admin" &&
    exactKeys(contract.redaction, [
      "containsSecrets",
      "contractContainsPublicTestPasswords",
      "storePasswords",
      "storePhoneNumber",
      "storeRawProfiles",
      "storeTokens",
    ]) &&
    contract.redaction.containsSecrets === false &&
    contract.redaction.contractContainsPublicTestPasswords === true &&
    contract.redaction.storePasswords === false &&
    contract.redaction.storeTokens === false &&
    contract.redaction.storePhoneNumber === false &&
    contract.redaction.storeRawProfiles === false;

  if (!valid) throw new Error("invalid yoyoosun credential contract");
  return deepFreeze({
    contract,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
}

export function selectYoyoosunCredentialTarget(
  loaded,
  deploymentTarget,
) {
  if (
    !plainObject(loaded) ||
    !plainObject(loaded.contract) ||
    !YOYOOSUN_CREDENTIAL_TARGETS.includes(deploymentTarget)
  ) {
    throw new Error("unsupported yoyoosun credential target");
  }
  const { contract, sha256 } = loaded;
  const target = contract.targets[deploymentTarget];
  const demo = deploymentTarget === "demo-133";
  return deepFreeze({
    schemaVersion: contract.schemaVersion,
    sha256,
    customerCode: contract.customerCode,
    deploymentTarget: target.deploymentTarget,
    commandTarget: target.commandTarget,
    targetIdentity: target.targetIdentity,
    database: target.database,
    ...(demo ? { datasetVersion: target.datasetVersion } : {}),
    admin: contract.credentials.admin,
    nonAdmin: demo
      ? {
          policy: target.nonAdminPolicy,
          usernames: contract.credentials.uat.usernames,
          credential: contract.credentials.uat,
        }
      : { policy: target.nonAdminPolicy, usernames: [] },
    sms: demo
      ? { policy: target.smsLoginPolicy, identity: contract.smsLoginIdentity }
      : { policy: target.smsLoginPolicy },
  });
}
