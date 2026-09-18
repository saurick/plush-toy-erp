#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadYoyoosunCredentialContract,
  selectYoyoosunCredentialTarget,
} from "../../deployments/yoyoosun/scripts/credential-contract.mjs";
import { MANUAL_ACCEPTANCE_CORE_CONTRACT } from "../qa/manual-acceptance-core-contract.mjs";
import {
  RELEASE_EVIDENCE_CONTRACT,
  RELEASE_EVIDENCE_FILES,
  RELEASE_EVIDENCE_PROFILES,
  PRODUCTION_PREFLIGHT_CHECKS,
  normalizeReleaseEvidenceProfile,
  releaseEvidenceContractFromMarkdown,
  releaseEvidenceFieldFromMarkdown,
  releaseEvidenceRequiredFiles,
  releaseEvidenceProfileSatisfies,
} from "./release-evidence-contract.mjs";
import { getDeploymentTarget } from "./deployment-targets.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const POPULATED_UPGRADE_AUDIT_VERSION = "20260714055504";
const CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION = "20260714055825";
const CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE =
  "customer-config-manifest-evidence.json";
const CREDENTIAL_ROTATION_RECEIPT_SCHEMA =
  "plush.manual-acceptance-credential-rotation-receipt/v1";
const CREDENTIAL_ROLLBACK_POINT_KEYS = Object.freeze([
  "backupAlias",
  "backupSha256",
  "backupSizeBytes",
  "restoreChecked",
]);
const CREDENTIAL_ROTATION_ACCOUNT_KEYS = Object.freeze([
  "authVersion",
  "phoneBound",
  "revokedSessions",
  "username",
]);
const CREDENTIAL_ROTATION_DEMO_KEYS = Object.freeze([
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
  "productCommit",
  "replayed",
  "revokedSessions",
  "roleAccounts",
  "rollbackPoint",
  "schemaVersion",
  "target",
  "targetIdentity",
]);
const CREDENTIAL_ROTATION_CUSTOMER_TEST_KEYS = Object.freeze([
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
  "productCommit",
  "replayed",
  "revokedSessions",
  "roleAccounts",
  "rollbackPoint",
  "schemaVersion",
  "target",
  "targetIdentity",
]);
export const REQUIRED_FILES = RELEASE_EVIDENCE_FILES;

const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /postgres:\/\/[^:\s]+:[^@\s]+@/i,
  /(APP_JWT_SECRET|POSTGRES_PASSWORD|APP_ADMIN_PASSWORD)\s*=\s*(?!change-this|<|replace-|example)(?=.{12,})[^\s#]+/i,
];

const PLACEHOLDER_PATTERN =
  /^(|待填写|todo|tbd|n\/a|unknown|replace.*|<.*>|-+)$/i;

const RELEASE_EVIDENCE_GATE_SCOPE = {
  evidenceOnly: true,
  readyMeaning:
    "filled release evidence directory passed consistency, redaction, and placeholder checks",
  notProvenByThisGate: [
    "target environment release was executed by this gate",
    "target migration was applied by this gate",
    "target smoke was run by this gate",
    "backup restore rehearsal was performed by this gate",
    "rollback or forward-fix rehearsal was performed by this gate",
    "customer config revision was activated or rolled back by this gate",
  ],
};

function parseArgs(argv) {
  const options = {
    customer: DEFAULT_CUSTOMER,
    profile: RELEASE_EVIDENCE_PROFILES.BASE_RELEASE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--customer") {
      options.customer = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--deployment-target") {
      options.deploymentTarget = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      options.profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/deploy/release-evidence-gate.mjs --deployment-target <demo-133|customer-test-133> --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> [--profile <base-release|customer-trial-acceptance>] [--customer yoyoosun] [--json]

Purpose:
  Validate a filled yoyoosun release evidence directory.
  base-release checks the release safety baseline. customer-trial-acceptance additionally
  requires credential rotation, role login, SMS, PDF and customer config readback evidence.
  It does not execute release, migration, smoke, restore, rollback or customer config activation.
`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isMeaningful(value) {
  const normalized = String(value ?? "").trim();
  if (/待填写|todo|tbd|replace-|<[^>]+>/i.test(normalized)) {
    return false;
  }
  return !PLACEHOLDER_PATTERN.test(normalized);
}

function hasFullDsn(value) {
  return /(postgres(?:ql)?:\/\/|mysql:\/\/|mongodb(?:\+srv)?:\/\/|:\/\/[^:\s]+:[^@\s]+@)/i.test(
    String(value ?? ""),
  );
}

function hasCredentialedUrl(value) {
  return /[a-z][a-z0-9+.-]*:\/\/[^/?#\s]*:[^/?#@\s]+@/i.test(
    String(value ?? ""),
  );
}

function normalizeSha256(value) {
  return String(value ?? "")
    .trim()
    .replace(/^sha256:/i, "")
    .toLowerCase();
}

function runtimeIdentityDigest(database, release, migration) {
  return crypto
    .createHash("sha256")
    .update(["release-v1", database, release, migration].join("\n"))
    .digest("hex");
}

function isIsoTimestamp(value) {
  const normalized = String(value ?? "");
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      normalized,
    ) && Number.isFinite(Date.parse(normalized))
  );
}

function requireMeaningfulJsonField(report, fileName, fieldPath, errors) {
  const value = fieldPath
    .split(".")
    .reduce((current, key) => current?.[key], report);
  assert(
    isMeaningful(value),
    `${fileName} ${fieldPath} is missing or placeholder`,
    errors,
  );
  return value;
}

function validateEvidenceArtifactPath({
  report,
  fileName,
  fieldPath,
  absoluteDir,
  errors,
}) {
  const value = requireMeaningfulJsonField(report, fileName, fieldPath, errors);
  const artifactPath = String(value ?? "").trim();
  const resolved = path.resolve(absoluteDir, artifactPath);
  const relativeToEvidence = path.relative(absoluteDir, resolved);

  assert(
    !path.isAbsolute(artifactPath),
    `${fileName} ${fieldPath} must be relative to evidence dir`,
    errors,
  );
  assert(
    !hasFullDsn(artifactPath),
    `${fileName} ${fieldPath} must not contain a full DSN`,
    errors,
  );
  assert(
    Boolean(relativeToEvidence) &&
      !relativeToEvidence.startsWith("..") &&
      !path.isAbsolute(relativeToEvidence),
    `${fileName} ${fieldPath} must stay inside evidence dir`,
    errors,
  );
  assert(
    fs.existsSync(resolved),
    `${fileName} ${fieldPath} file not found in evidence dir: ${artifactPath}`,
    errors,
  );
  if (fs.existsSync(resolved)) {
    const artifactContent = readText(resolved);
    validateNoSecrets(`${fileName} ${fieldPath}`, artifactContent, errors);
    assert(
      !hasFullDsn(artifactContent),
      `${fileName} ${fieldPath} file must not contain a full DSN`,
      errors,
    );
  }
}

function readEvidenceArtifactText({ report, fieldPath, absoluteDir }) {
  const artifactPath = String(
    fieldPath.split(".").reduce((current, key) => current?.[key], report) ?? "",
  ).trim();
  const resolved = path.resolve(absoluteDir, artifactPath);
  const relativeToEvidence = path.relative(absoluteDir, resolved);
  if (
    !artifactPath ||
    path.isAbsolute(artifactPath) ||
    relativeToEvidence.startsWith("..") ||
    path.isAbsolute(relativeToEvidence) ||
    !fs.existsSync(resolved)
  ) {
    return "";
  }
  return readText(resolved);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMarkdownField(content, fieldName) {
  return releaseEvidenceFieldFromMarkdown(content, fieldName);
}

function findKeyValueField(content, fieldName) {
  const label = escapeRegExp(fieldName);
  const linePattern = new RegExp(`^${label}=([^\\n]+)$`, "mi");
  const lineMatch = content.match(linePattern);
  return lineMatch ? lineMatch[1].trim() : "";
}

function requireMarkdownFields(content, fileName, fields, errors) {
  for (const field of fields) {
    const value = findMarkdownField(content, field);
    assert(
      isMeaningful(value),
      `${fileName} missing or placeholder field: ${field}`,
      errors,
    );
  }
}

function validateNoSecrets(fileName, content, errors) {
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    assert(
      !pattern.test(content),
      `${fileName} contains a forbidden secret-like pattern`,
      errors,
    );
  }
  assert(
    !hasCredentialedUrl(content),
    `${fileName} contains a credentialed URL`,
    errors,
  );
}

function validateReleaseEvidence(content, errors) {
  const evidenceContract = releaseEvidenceContractFromMarkdown(content);
  assert(
    evidenceContract === RELEASE_EVIDENCE_CONTRACT,
    evidenceContract
      ? `${REQUIRED_FILES.release} evidenceContract ${evidenceContract} is unsupported; expected ${RELEASE_EVIDENCE_CONTRACT}`
      : `${REQUIRED_FILES.release} must declare evidenceContract ${RELEASE_EVIDENCE_CONTRACT}`,
    errors,
  );
  requireMarkdownFields(
    content,
    REQUIRED_FILES.release,
    [
      "customerCode",
      "releaseId",
      "environment",
      "productCommit",
      "serverImageDigest",
      "webImageDigest",
      "migrationBefore",
      "migrationAfter",
      "backupId",
    ],
    errors,
  );
  const productCommit = findMarkdownField(content, "productCommit");
  const serverImageDigest = findMarkdownField(content, "serverImageDigest");
  const webImageDigest = findMarkdownField(content, "webImageDigest");
  const migrationBefore = findMarkdownField(content, "migrationBefore");
  const migrationAfter = findMarkdownField(content, "migrationAfter");
  assert(
    findMarkdownField(content, "customerCode") === DEFAULT_CUSTOMER,
    `${REQUIRED_FILES.release} customerCode must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
  assert(
    /^[a-f0-9]{40}$/u.test(productCommit),
    `${REQUIRED_FILES.release} productCommit must be a full 40-character lowercase Git commit`,
    errors,
  );
  assert(
    /^sha256:[a-f0-9]{64}$/i.test(serverImageDigest),
    `${REQUIRED_FILES.release} serverImageDigest must be sha256:<64-hex>`,
    errors,
  );
  assert(
    /^sha256:[a-f0-9]{64}$/i.test(webImageDigest),
    `${REQUIRED_FILES.release} webImageDigest must be sha256:<64-hex>`,
    errors,
  );
  assert(
    /^\d{14}$/u.test(migrationBefore),
    `${REQUIRED_FILES.release} migrationBefore must be a 14-digit Atlas version`,
    errors,
  );
  assert(
    /^\d{14}$/u.test(migrationAfter),
    `${REQUIRED_FILES.release} migrationAfter must be a 14-digit Atlas version`,
    errors,
  );
  if (/^\d{14}$/u.test(migrationBefore) && /^\d{14}$/u.test(migrationAfter)) {
    assert(
      migrationBefore <= migrationAfter,
      `${REQUIRED_FILES.release} migrationBefore must not be newer than migrationAfter`,
      errors,
    );
  }
}

function validatePreflightReport(
  content,
  errors,
  { deploymentTarget, productCommit, profile },
) {
  const report = parseJsonEvidence(REQUIRED_FILES.preflight, content, errors);
  if (!report) return;
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const passedCheckIds = new Set(
    checks
      .filter((check) => check?.status === "passed")
      .map((check) => check?.id),
  );
  const requiredChecks = [
    PRODUCTION_PREFLIGHT_CHECKS.ENV_REQUIRED_KEYS,
    PRODUCTION_PREFLIGHT_CHECKS.PRODUCTION_BOUNDARIES,
    PRODUCTION_PREFLIGHT_CHECKS.COMPOSE_AND_MIGRATION,
    PRODUCTION_PREFLIGHT_CHECKS.COMPOSE_RUNTIME_SERVICES,
    PRODUCTION_PREFLIGHT_CHECKS.RUNTIME_HEALTH_READY,
  ];
  if (profile === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE) {
    requiredChecks.push(
      PRODUCTION_PREFLIGHT_CHECKS.SMS_PROVIDER_RUNTIME,
      PRODUCTION_PREFLIGHT_CHECKS.PDF_RUNTIME,
      PRODUCTION_PREFLIGHT_CHECKS.CHROMIUM_RUNTIME,
    );
  }
  assert(
    report.evidenceContract === RELEASE_EVIDENCE_CONTRACT &&
      report.kind === "production-preflight",
    `${REQUIRED_FILES.preflight} must use the current production-preflight evidence contract`,
    errors,
  );
  assert(
    report.mode === "runtime-env",
    `${REQUIRED_FILES.preflight} must come from runtime-env mode`,
    errors,
  );
  assert(
    releaseEvidenceProfileSatisfies(report.profile, profile),
    `${REQUIRED_FILES.preflight} profile must match ${profile}`,
    errors,
  );
  assert(
    report.deploymentTarget === deploymentTarget,
    `${REQUIRED_FILES.preflight} deploymentTarget must match ${deploymentTarget}`,
    errors,
  );
  assert(
    report.productCommit === productCommit,
    `${REQUIRED_FILES.preflight} productCommit must match ${REQUIRED_FILES.release}`,
    errors,
  );
  for (const checkId of requiredChecks) {
    assert(
      passedCheckIds.has(checkId),
      `${REQUIRED_FILES.preflight} missing passed check: ${checkId}`,
      errors,
    );
  }
  assert(
    Number(report.summary?.total) === checks.length &&
      Number(report.summary?.passed) === checks.length &&
      Number(report.summary?.failed) === 0,
    `${REQUIRED_FILES.preflight} summary must match an all-passed checks list`,
    errors,
  );
  assert(
    report.redaction?.containsSecrets === false &&
      report.redaction?.containsRawCustomerRows === false &&
      report.redaction?.containsFullDsn === false,
    `${REQUIRED_FILES.preflight} must declare a redacted receipt`,
    errors,
  );
}

function validateImageDigests(content, errors) {
  validateNoSecrets(REQUIRED_FILES.imageDigests, content, errors);
  const serverImageDigest = findKeyValueField(content, "serverImageDigest");
  const webImageDigest = findKeyValueField(content, "webImageDigest");
  assert(
    /^sha256:[a-f0-9]{64}$/i.test(serverImageDigest),
    `${REQUIRED_FILES.imageDigests} serverImageDigest must be sha256:<64-hex>`,
    errors,
  );
  assert(
    /^sha256:[a-f0-9]{64}$/i.test(webImageDigest),
    `${REQUIRED_FILES.imageDigests} webImageDigest must be sha256:<64-hex>`,
    errors,
  );
}

function validateBackupEvidence(content, errors, requireRestore = true) {
  requireMarkdownFields(
    content,
    REQUIRED_FILES.backup,
    [
      "releaseId",
      "environment",
      "backupId",
      "backupTime",
      "backupPurpose",
      "databaseBackupSize",
      "databaseBackupHash",
      "migrationVersion",
      "storageLocationAlias",
      ...(requireRestore ? ["restoreTestStatus", "smokeQueryStatus"] : []),
    ],
    errors,
  );
  const purpose = findMarkdownField(content, "backupPurpose");
  const backupTime = findMarkdownField(content, "backupTime");
  const databaseBackupSize = findMarkdownField(content, "databaseBackupSize");
  const restoreTestStatus = findMarkdownField(content, "restoreTestStatus");
  const smokeQueryStatus = findMarkdownField(content, "smokeQueryStatus");
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(
      backupTime,
    ),
    `${REQUIRED_FILES.backup} backupTime must be an ISO timestamp`,
    errors,
  );
  assert(
    /(pre-migration|pre-deploy|发布前|migration 前)/i.test(purpose),
    `${REQUIRED_FILES.backup} backupPurpose must explicitly be pre-migration or pre-deploy`,
    errors,
  );
  assert(
    Number(databaseBackupSize) > 0,
    `${REQUIRED_FILES.backup} databaseBackupSize must be a positive number`,
    errors,
  );
  assert(
    /^(sha256:)?[a-f0-9]{64}$/i.test(
      findMarkdownField(content, "databaseBackupHash"),
    ),
    `${REQUIRED_FILES.backup} databaseBackupHash must be sha256`,
    errors,
  );
  if (!requireRestore) return;
  assert(
    /pass|success|verified|ok/i.test(restoreTestStatus),
    `${REQUIRED_FILES.backup} restoreTestStatus must show a passed restore verification`,
    errors,
  );
  assert(
    /pass|success|verified|ok/i.test(smokeQueryStatus),
    `${REQUIRED_FILES.backup} smokeQueryStatus must show a passed smoke query`,
    errors,
  );
}

function validateBackupRestoreReport(content, errors, absoluteDir) {
  let report;
  try {
    report = JSON.parse(content);
  } catch (error) {
    errors.push(
      `${REQUIRED_FILES.backupRestore} must be valid JSON: ${error.message}`,
    );
    return;
  }

  assert(
    report.customerCode === DEFAULT_CUSTOMER,
    `${REQUIRED_FILES.backupRestore} customerCode must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
  assert(
    isMeaningful(report.backupId),
    `${REQUIRED_FILES.backupRestore} backupId is missing`,
    errors,
  );
  for (const fieldPath of [
    "environment",
    "releaseId",
    "verifiedAt",
    "sourceAlias",
    "restoreTarget",
    "backup.storageLocationAlias",
    "backup.migrationVersion",
    "restore.restoreTestStatus",
    "restore.migrationBeforeApply",
    "restore.restoreMigrationVersion",
    "smoke.smokeQueryStatus",
  ]) {
    requireMeaningfulJsonField(
      report,
      REQUIRED_FILES.backupRestore,
      fieldPath,
      errors,
    );
  }
  for (const fieldPath of [
    "artifacts.backupEvidence",
    "artifacts.preMigrationStatus",
    "artifacts.migrationStatus",
    "artifacts.commandSummary",
  ]) {
    validateEvidenceArtifactPath({
      report,
      fileName: REQUIRED_FILES.backupRestore,
      fieldPath,
      absoluteDir,
      errors,
    });
  }
  assert(
    /^\d{4}-\d{2}-\d{2}T/.test(String(report.verifiedAt ?? "")),
    `${REQUIRED_FILES.backupRestore} verifiedAt must be an ISO timestamp`,
    errors,
  );
  assert(
    !hasFullDsn(report.sourceAlias),
    `${REQUIRED_FILES.backupRestore} sourceAlias must not contain a full DSN`,
    errors,
  );
  assert(
    !hasFullDsn(report.restoreTarget),
    `${REQUIRED_FILES.backupRestore} restoreTarget must not contain a full DSN`,
    errors,
  );
  assert(
    Number(report.backup?.databaseBackupSize) > 0,
    `${REQUIRED_FILES.backupRestore} backup.databaseBackupSize must be a positive number`,
    errors,
  );
  assert(
    /^(sha256:)?[a-f0-9]{64}$/i.test(
      String(report.backup?.databaseBackupHash ?? "").trim(),
    ),
    `${REQUIRED_FILES.backupRestore} backup.databaseBackupHash must be sha256`,
    errors,
  );
  assert(
    /pass|success|verified|ok/i.test(
      String(report.restore?.restoreTestStatus ?? ""),
    ),
    `${REQUIRED_FILES.backupRestore} restore.restoreTestStatus must show a passed restore rehearsal`,
    errors,
  );
  assert(
    String(report.restore?.restoreMigrationVersion ?? "")
      .trim()
      .toLowerCase() !== "unknown",
    `${REQUIRED_FILES.backupRestore} restore.restoreMigrationVersion must not be unknown`,
    errors,
  );
  assert(
    String(report.restore?.pendingFiles ?? "").trim() === "0",
    `${REQUIRED_FILES.backupRestore} restore.pendingFiles must be 0`,
    errors,
  );
  assert(
    report.smoke?.smokeQueryStatus === "passed",
    `${REQUIRED_FILES.backupRestore} smoke.smokeQueryStatus must be passed`,
    errors,
  );
  assert(
    Number(report.smoke?.publicTableCount) > 0,
    `${REQUIRED_FILES.backupRestore} smoke.publicTableCount must be a positive number`,
    errors,
  );
  assert(
    report.summary?.backupCreated === true,
    `${REQUIRED_FILES.backupRestore} summary.backupCreated must be true`,
    errors,
  );
  assert(
    report.summary?.restoreCompleted === true,
    `${REQUIRED_FILES.backupRestore} summary.restoreCompleted must be true`,
    errors,
  );
  assert(
    report.summary?.migrationStatus === "ok",
    `${REQUIRED_FILES.backupRestore} summary.migrationStatus must be ok`,
    errors,
  );
  assert(
    report.summary?.smokeQueryStatus === "passed",
    `${REQUIRED_FILES.backupRestore} summary.smokeQueryStatus must be passed`,
    errors,
  );
  assert(
    report.redaction?.containsSecrets === false,
    `${REQUIRED_FILES.backupRestore} must declare containsSecrets=false`,
    errors,
  );
  assert(
    report.redaction?.containsRawCustomerRows === false,
    `${REQUIRED_FILES.backupRestore} must declare containsRawCustomerRows=false`,
    errors,
  );
  assert(
    report.redaction?.containsDumpContent === false,
    `${REQUIRED_FILES.backupRestore} must declare containsDumpContent=false`,
    errors,
  );
  assert(
    report.redaction?.containsFullDsn === false,
    `${REQUIRED_FILES.backupRestore} must declare containsFullDsn=false`,
    errors,
  );
}

function crossesMigrationVersion(before, after, version) {
  return (
    /^\d{14}$/u.test(before) &&
    /^\d{14}$/u.test(after) &&
    before < version &&
    after >= version
  );
}

function parseJsonEvidence(fileName, content, errors) {
  try {
    return JSON.parse(content);
  } catch (error) {
    errors.push(`${fileName} must be valid JSON: ${error.message}`);
    return null;
  }
}

function loadDemoCustomerRevision(credentialTarget, errors) {
  const contract = MANUAL_ACCEPTANCE_CORE_CONTRACT;
  const target = contract?.customerTrial133;
  assert(
    target?.target === credentialTarget.commandTarget &&
      target?.deploymentTarget === credentialTarget.deploymentTarget &&
      target?.databaseName === credentialTarget.database &&
      contract?.dataVersion === credentialTarget.datasetVersion,
    "manual acceptance contract demo target identity must match credential.contract.json",
    errors,
  );
  assert(
    isMeaningful(target?.configRevision),
    "manual acceptance contract demo configRevision is missing",
    errors,
  );
  return String(target?.configRevision ?? "").trim();
}

function parseMigrationStatus(content) {
  const currentVersion =
    content.match(/Current Version:\s*([^\s]+)/i)?.[1]?.trim() || "";
  const pendingFiles =
    content.match(/Pending Files:\s*(\d+)/i)?.[1]?.trim() || "";
  return { currentVersion, pendingFiles };
}

function findCustomerConfigEffectiveSessionCheck(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return checks.find(
    (check) =>
      check?.name === "customer-config-effective-session" ||
      check?.target === "jsonrpc:customer_config.get_effective_session",
  );
}

function validateCustomerConfigManifestEvidence({
  absoluteDir,
  customerConfigCheck,
  errors,
}) {
  if (!customerConfigCheck) {
    return;
  }
  const evidencePath = path.join(
    absoluteDir,
    CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE,
  );
  assert(
    fs.existsSync(evidencePath),
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} is required when ${REQUIRED_FILES.smoke} contains customer-config-effective-session`,
    errors,
  );
  if (!fs.existsSync(evidencePath)) {
    return;
  }
  const evidence = parseJsonEvidence(
    CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE,
    readText(evidencePath),
    errors,
  );
  if (!evidence) {
    return;
  }
  assert(
    evidence.customerKey === DEFAULT_CUSTOMER,
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} customerKey must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
  assert(
    evidence.revision === customerConfigCheck.expectedRevision,
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} revision must match ${REQUIRED_FILES.smoke} customer-config-effective-session expectedRevision`,
    errors,
  );
  assert(
    /^sha256:[a-f0-9]{64}$/i.test(String(evidence.manifestSha256 ?? "").trim()),
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} manifestSha256 must be sha256:<64-hex>`,
    errors,
  );
  assert(
    evidence.reviewStatus === "approved",
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} reviewStatus must be approved`,
    errors,
  );
  assert(
    evidence.redaction?.containsSecrets === false,
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} must declare containsSecrets=false`,
    errors,
  );
  assert(
    evidence.redaction?.containsRawCustomerRows === false,
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} must declare containsRawCustomerRows=false`,
    errors,
  );
  assert(
    evidence.redaction?.containsRawCustomerFiles === false,
    `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} must declare containsRawCustomerFiles=false`,
    errors,
  );
}

function validateRollbackSmokeReportPath({
  report,
  repoRoot,
  absoluteDir,
  errors,
}) {
  const smokeReportPath = String(report?.postCheck?.smokeReport ?? "").trim();
  const expectedSmokePath = path.resolve(absoluteDir, REQUIRED_FILES.smoke);
  const repoRelativeSmokePath = path.resolve(repoRoot, smokeReportPath);
  const evidenceRelativeSmokePath = path.resolve(absoluteDir, smokeReportPath);

  assert(
    !path.isAbsolute(smokeReportPath),
    `${REQUIRED_FILES.rollbackRehearsal} postCheck.smokeReport must be a relative path`,
    errors,
  );
  assert(
    !hasFullDsn(smokeReportPath),
    `${REQUIRED_FILES.rollbackRehearsal} postCheck.smokeReport must not contain a full DSN`,
    errors,
  );
  assert(
    repoRelativeSmokePath === expectedSmokePath ||
      evidenceRelativeSmokePath === expectedSmokePath,
    `${REQUIRED_FILES.rollbackRehearsal} postCheck.smokeReport must point to ${REQUIRED_FILES.smoke} in the same evidence dir`,
    errors,
  );
}

function validateEvidenceConsistency(
  {
    releaseContent,
    imageDigestsContent,
    backupContent,
    backupRestoreContent,
    migrationContent,
    smokeContent,
    credentialRotationContent,
    rollbackRehearsalContent,
    signoffContent,
    repoRoot,
    absoluteDir,
    credentialTarget,
    demoCustomerRevision,
    profile,
  },
  errors,
) {
  const releaseId = findMarkdownField(releaseContent, "releaseId");
  const releaseEnvironment = findMarkdownField(releaseContent, "environment");
  const releaseBackupId = findMarkdownField(releaseContent, "backupId");
  const releaseServerImageDigest = findMarkdownField(
    releaseContent,
    "serverImageDigest",
  );
  const releaseWebImageDigest = findMarkdownField(
    releaseContent,
    "webImageDigest",
  );
  const artifactServerImageDigest = findKeyValueField(
    imageDigestsContent,
    "serverImageDigest",
  );
  const artifactWebImageDigest = findKeyValueField(
    imageDigestsContent,
    "webImageDigest",
  );
  const migrationBefore = findMarkdownField(releaseContent, "migrationBefore");
  const migrationAfter = findMarkdownField(releaseContent, "migrationAfter");
  const productCommit = findMarkdownField(releaseContent, "productCommit");
  const backupReleaseId = findMarkdownField(backupContent, "releaseId");
  const backupEnvironment = findMarkdownField(backupContent, "environment");
  const backupId = findMarkdownField(backupContent, "backupId");
  const backupMigrationVersion = findMarkdownField(
    backupContent,
    "migrationVersion",
  );
  const backupHash = normalizeSha256(
    findMarkdownField(backupContent, "databaseBackupHash"),
  );
  const migrationStatus = parseMigrationStatus(migrationContent);
  const backupRestoreReport = backupRestoreContent
    ? parseJsonEvidence(
        REQUIRED_FILES.backupRestore,
        backupRestoreContent,
        errors,
      )
    : null;
  const smokeReport = parseJsonEvidence(
    REQUIRED_FILES.smoke,
    smokeContent,
    errors,
  );
  const rollbackRehearsalReport = rollbackRehearsalContent
    ? parseJsonEvidence(
        REQUIRED_FILES.rollbackRehearsal,
        rollbackRehearsalContent,
        errors,
      )
    : null;
  const credentialRotationReport = credentialRotationContent
    ? parseJsonEvidence(
        REQUIRED_FILES.credentialRotation,
        credentialRotationContent,
        errors,
      )
    : null;

  if (credentialRotationReport) {
    assert(
      credentialRotationReport.deploymentTarget ===
        credentialTarget.deploymentTarget &&
        credentialRotationReport.target === credentialTarget.commandTarget &&
        credentialRotationReport.targetIdentity ===
          credentialTarget.targetIdentity &&
        credentialRotationReport.database === credentialTarget.database,
      `${REQUIRED_FILES.credentialRotation} target identity must match selected deployment target`,
      errors,
    );
    assert(
      credentialRotationReport.productCommit === productCommit,
      `${REQUIRED_FILES.credentialRotation} productCommit must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      credentialRotationReport.migrationVersion === migrationAfter,
      `${REQUIRED_FILES.credentialRotation} migrationVersion must match ${REQUIRED_FILES.release} migrationAfter`,
      errors,
    );
    if (credentialTarget.deploymentTarget === "demo-133") {
      assert(
        credentialRotationReport.customerRevision === demoCustomerRevision,
        `${REQUIRED_FILES.credentialRotation} customerRevision must match the current manual acceptance configRevision`,
        errors,
      );
      const customerConfigSmokeCheck =
        findCustomerConfigEffectiveSessionCheck(smokeReport);
      if (customerConfigSmokeCheck) {
        assert(
          credentialRotationReport.customerRevision ===
            customerConfigSmokeCheck.expectedRevision,
          `${REQUIRED_FILES.credentialRotation} customerRevision must match ${REQUIRED_FILES.smoke} customer-config-effective-session expectedRevision`,
          errors,
        );
      }
    }
    const smokeCredentialCheck = Array.isArray(smokeReport?.checks)
      ? smokeReport.checks.find(
          (check) => check?.name === "credential-login-matrix",
        )
      : undefined;
    const rotationAdmin = Array.isArray(credentialRotationReport.accounts)
      ? credentialRotationReport.accounts.find(
          (account) => account?.username === credentialTarget.admin.username,
        )
      : undefined;
    assert(
      smokeCredentialCheck?.credentialOperationId ===
        credentialRotationReport.operationId,
      `${REQUIRED_FILES.smoke} credentialOperationId must match ${REQUIRED_FILES.credentialRotation} operationId`,
      errors,
    );
    assert(
      smokeCredentialCheck?.adminAuthVersion === rotationAdmin?.authVersion,
      `${REQUIRED_FILES.smoke} adminAuthVersion must match ${REQUIRED_FILES.credentialRotation} admin receipt exactly`,
      errors,
    );
    assert(
      isIsoTimestamp(smokeReport?.generatedAt) &&
        isIsoTimestamp(credentialRotationReport.generatedAt) &&
        Date.parse(smokeReport.generatedAt) >=
          Date.parse(credentialRotationReport.generatedAt),
      `${REQUIRED_FILES.smoke} generatedAt must not be earlier than ${REQUIRED_FILES.credentialRotation} generatedAt`,
      errors,
    );
  }

  if (backupRestoreReport) {
    const preMigrationStatus = parseMigrationStatus(
      readEvidenceArtifactText({
        report: backupRestoreReport,
        fieldPath: "artifacts.preMigrationStatus",
        absoluteDir,
      }),
    );
    const restoreMigrationStatus = parseMigrationStatus(
      readEvidenceArtifactText({
        report: backupRestoreReport,
        fieldPath: "artifacts.migrationStatus",
        absoluteDir,
      }),
    );
    const commandSummaryContent = readEvidenceArtifactText({
      report: backupRestoreReport,
      fieldPath: "artifacts.commandSummary",
      absoluteDir,
    });
    const commandSummarySteps = findKeyValueField(
      commandSummaryContent,
      "steps",
    );
    assert(
      backupRestoreReport.releaseId === releaseId,
      `${REQUIRED_FILES.backupRestore} releaseId must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      backupRestoreReport.environment === releaseEnvironment,
      `${REQUIRED_FILES.backupRestore} environment must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      backupRestoreReport.backupId === releaseBackupId,
      `${REQUIRED_FILES.backupRestore} backupId must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      normalizeSha256(backupRestoreReport.backup?.databaseBackupHash) ===
        backupHash,
      `${REQUIRED_FILES.backupRestore} backup.databaseBackupHash must match ${REQUIRED_FILES.backup}`,
      errors,
    );
    assert(
      backupRestoreReport.backup?.migrationVersion === migrationBefore,
      `${REQUIRED_FILES.backupRestore} backup.migrationVersion must match ${REQUIRED_FILES.release} migrationBefore`,
      errors,
    );
    assert(
      backupRestoreReport.restore?.migrationBeforeApply === migrationBefore,
      `${REQUIRED_FILES.backupRestore} restore.migrationBeforeApply must match ${REQUIRED_FILES.release} migrationBefore`,
      errors,
    );
    assert(
      preMigrationStatus.currentVersion === migrationBefore,
      `${REQUIRED_FILES.backupRestore} artifacts.preMigrationStatus Current Version must match ${REQUIRED_FILES.release} migrationBefore`,
      errors,
    );
    assert(
      backupRestoreReport.restore?.restoreMigrationVersion === migrationAfter,
      `${REQUIRED_FILES.backupRestore} restore.restoreMigrationVersion must match ${REQUIRED_FILES.release} migrationAfter`,
      errors,
    );
    assert(
      restoreMigrationStatus.currentVersion === migrationAfter,
      `${REQUIRED_FILES.backupRestore} artifacts.migrationStatus Current Version must match ${REQUIRED_FILES.release} migrationAfter`,
      errors,
    );
    assert(
      restoreMigrationStatus.pendingFiles === "0",
      `${REQUIRED_FILES.backupRestore} artifacts.migrationStatus Pending Files must be 0`,
      errors,
    );
    assert(
      findKeyValueField(commandSummaryContent, "backupId") === releaseBackupId,
      `${REQUIRED_FILES.backupRestore} artifacts.commandSummary backupId must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      findKeyValueField(commandSummaryContent, "releaseId") === releaseId,
      `${REQUIRED_FILES.backupRestore} artifacts.commandSummary releaseId must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      findKeyValueField(commandSummaryContent, "sourceAlias") ===
        backupRestoreReport.sourceAlias,
      `${REQUIRED_FILES.backupRestore} artifacts.commandSummary sourceAlias must match ${REQUIRED_FILES.backupRestore}`,
      errors,
    );
    assert(
      findKeyValueField(commandSummaryContent, "restoreTarget") ===
        backupRestoreReport.restoreTarget,
      `${REQUIRED_FILES.backupRestore} artifacts.commandSummary restoreTarget must match ${REQUIRED_FILES.backupRestore}`,
      errors,
    );
    for (const stepName of ["pg_dump", "restore", "atlas", "smoke"]) {
      assert(
        new RegExp(stepName, "i").test(commandSummarySteps),
        `${REQUIRED_FILES.backupRestore} artifacts.commandSummary steps must mention ${stepName}`,
        errors,
      );
    }
    if (
      crossesMigrationVersion(
        migrationBefore,
        migrationAfter,
        POPULATED_UPGRADE_AUDIT_VERSION,
      )
    ) {
      assert(
        findMarkdownField(backupContent, "populatedUpgradeAuditStatus") ===
          "passed",
        `${REQUIRED_FILES.backup} populatedUpgradeAuditStatus must be passed when crossing ${POPULATED_UPGRADE_AUDIT_VERSION}`,
        errors,
      );
      assert(
        backupRestoreReport.restore?.populatedUpgradeAuditStatus === "passed",
        `${REQUIRED_FILES.backupRestore} restore.populatedUpgradeAuditStatus must be passed when crossing ${POPULATED_UPGRADE_AUDIT_VERSION}`,
        errors,
      );
      assert(
        backupRestoreReport.summary?.populatedUpgradeAuditStatus === "passed",
        `${REQUIRED_FILES.backupRestore} summary.populatedUpgradeAuditStatus must be passed when crossing ${POPULATED_UPGRADE_AUDIT_VERSION}`,
        errors,
      );
      assert(
        findKeyValueField(
          commandSummaryContent,
          "populatedUpgradeAuditStatus",
        ) === "passed",
        `${REQUIRED_FILES.backupRestore} artifacts.commandSummary populatedUpgradeAuditStatus must be passed when crossing ${POPULATED_UPGRADE_AUDIT_VERSION}`,
        errors,
      );
      assert(
        /populated upgrade read-only audit/iu.test(commandSummarySteps),
        `${REQUIRED_FILES.backupRestore} artifacts.commandSummary steps must mention populated upgrade read-only audit when crossing ${POPULATED_UPGRADE_AUDIT_VERSION}`,
        errors,
      );
    }
    if (
      crossesMigrationVersion(
        migrationBefore,
        migrationAfter,
        CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION,
      )
    ) {
      assert(
        findMarkdownField(backupContent, "customerConfigCutoverAuditStatus") ===
          "passed",
        `${REQUIRED_FILES.backup} customerConfigCutoverAuditStatus must be passed when crossing ${CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION}`,
        errors,
      );
      assert(
        backupRestoreReport.restore?.customerConfigCutoverAuditStatus ===
          "passed",
        `${REQUIRED_FILES.backupRestore} restore.customerConfigCutoverAuditStatus must be passed when crossing ${CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION}`,
        errors,
      );
      assert(
        backupRestoreReport.summary?.customerConfigCutoverAuditStatus ===
          "passed",
        `${REQUIRED_FILES.backupRestore} summary.customerConfigCutoverAuditStatus must be passed when crossing ${CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION}`,
        errors,
      );
      assert(
        findKeyValueField(
          commandSummaryContent,
          "customerConfigCutoverAuditStatus",
        ) === "passed",
        `${REQUIRED_FILES.backupRestore} artifacts.commandSummary customerConfigCutoverAuditStatus must be passed when crossing ${CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION}`,
        errors,
      );
      assert(
        /customer config cutover read-only audit/iu.test(commandSummarySteps),
        `${REQUIRED_FILES.backupRestore} artifacts.commandSummary steps must mention customer config cutover read-only audit when crossing ${CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION}`,
        errors,
      );
    }
  }

  if (smokeReport) {
    assert(
      smokeReport.productCommit === productCommit,
      `${REQUIRED_FILES.smoke} productCommit must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      smokeReport.environment === releaseEnvironment,
      `${REQUIRED_FILES.smoke} environment must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      smokeReport.deploymentTarget === credentialTarget.deploymentTarget &&
        smokeReport.environment === credentialTarget.deploymentTarget,
      `${REQUIRED_FILES.smoke} deploymentTarget/environment must match selected deployment target`,
      errors,
    );
    const runtimeIdentityCheck = Array.isArray(smokeReport.checks)
      ? smokeReport.checks.find((check) => check?.name === "runtime-identity")
      : undefined;
    assert(
      runtimeIdentityCheck?.releaseVersion === productCommit &&
        runtimeIdentityCheck?.migrationVersion === migrationAfter,
      `${REQUIRED_FILES.smoke} runtime-identity releaseVersion/migrationVersion must match productCommit/migrationAfter`,
      errors,
    );
  }

  if (rollbackRehearsalReport) {
    assert(
      rollbackRehearsalReport.releaseId === releaseId,
      `${REQUIRED_FILES.rollbackRehearsal} releaseId must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      rollbackRehearsalReport.environment === releaseEnvironment,
      `${REQUIRED_FILES.rollbackRehearsal} environment must match ${REQUIRED_FILES.release}`,
      errors,
    );
    validateRollbackSmokeReportPath({
      report: rollbackRehearsalReport,
      repoRoot,
      absoluteDir,
      errors,
    });
    const smokeCheckCount = Array.isArray(smokeReport?.checks)
      ? smokeReport.checks.length
      : 0;
    assert(
      Number(rollbackRehearsalReport.postCheck?.smokeCheckCount) ===
        smokeCheckCount,
      `${REQUIRED_FILES.rollbackRehearsal} postCheck.smokeCheckCount must match ${REQUIRED_FILES.smoke} checks length`,
      errors,
    );
    const customerConfigSmokeCheck =
      findCustomerConfigEffectiveSessionCheck(smokeReport);
    if (
      profile === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE &&
      customerConfigSmokeCheck
    ) {
      const rollbackEffectiveSession =
        rollbackRehearsalReport.postCheck?.customerConfigEffectiveSession;
      assert(
        rollbackEffectiveSession?.status === "verified",
        `${REQUIRED_FILES.rollbackRehearsal} postCheck.customerConfigEffectiveSession.status must be verified when ${REQUIRED_FILES.smoke} contains customer-config-effective-session`,
        errors,
      );
      assert(
        rollbackEffectiveSession?.target ===
          "jsonrpc:customer_config.get_effective_session",
        `${REQUIRED_FILES.rollbackRehearsal} postCheck.customerConfigEffectiveSession.target must be jsonrpc:customer_config.get_effective_session`,
        errors,
      );
      assert(
        rollbackEffectiveSession?.expectedRevision ===
          customerConfigSmokeCheck.expectedRevision,
        `${REQUIRED_FILES.rollbackRehearsal} postCheck.customerConfigEffectiveSession.expectedRevision must match ${REQUIRED_FILES.smoke}`,
        errors,
      );
    }
  }

  assert(
    normalizeSha256(artifactServerImageDigest) ===
      normalizeSha256(releaseServerImageDigest),
    `${REQUIRED_FILES.imageDigests} serverImageDigest must match ${REQUIRED_FILES.release}`,
    errors,
  );
  assert(
    normalizeSha256(artifactWebImageDigest) ===
      normalizeSha256(releaseWebImageDigest),
    `${REQUIRED_FILES.imageDigests} webImageDigest must match ${REQUIRED_FILES.release}`,
    errors,
  );
  assert(
    backupReleaseId === releaseId,
    `${REQUIRED_FILES.backup} releaseId must match ${REQUIRED_FILES.release}`,
    errors,
  );
  assert(
    backupEnvironment === releaseEnvironment,
    `${REQUIRED_FILES.backup} environment must match ${REQUIRED_FILES.release}`,
    errors,
  );
  assert(
    backupId === releaseBackupId,
    `${REQUIRED_FILES.backup} backupId must match ${REQUIRED_FILES.release}`,
    errors,
  );
  assert(
    backupMigrationVersion === migrationBefore,
    `${REQUIRED_FILES.backup} migrationVersion must match ${REQUIRED_FILES.release} migrationBefore`,
    errors,
  );
  assert(
    migrationStatus.currentVersion === migrationAfter,
    `${REQUIRED_FILES.migration} Current Version must match ${REQUIRED_FILES.release} migrationAfter`,
    errors,
  );
  assert(
    migrationStatus.pendingFiles === "0",
    `${REQUIRED_FILES.migration} Pending Files must be 0`,
    errors,
  );
  if (signoffContent) {
    assert(
      findMarkdownField(signoffContent, "releaseId") === releaseId,
      `${REQUIRED_FILES.signoff} releaseId must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      findMarkdownField(signoffContent, "environment") === releaseEnvironment,
      `${REQUIRED_FILES.signoff} environment must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      findMarkdownField(signoffContent, "backupId") === releaseBackupId,
      `${REQUIRED_FILES.signoff} backupId must match ${REQUIRED_FILES.release}`,
      errors,
    );
  }
}

function validateMigrationStatus(content, errors) {
  assert(
    /Current Version:\s*\S+/i.test(content),
    `${REQUIRED_FILES.migration} must include Current Version`,
    errors,
  );
  assert(
    /Pending Files:\s*\d+/i.test(content),
    `${REQUIRED_FILES.migration} must include Pending Files`,
    errors,
  );
  assert(
    !/(dirty|failed|panic|fatal|error)/i.test(content),
    `${REQUIRED_FILES.migration} contains failure text`,
    errors,
  );
}

function validateSmokeReport(
  content,
  errors,
  absoluteDir,
  targetContext,
  profile,
) {
  let report;
  try {
    report = JSON.parse(content);
  } catch (error) {
    errors.push(`${REQUIRED_FILES.smoke} must be valid JSON: ${error.message}`);
    return;
  }

  assert(
    report.customerCode === DEFAULT_CUSTOMER,
    `${REQUIRED_FILES.smoke} customerCode must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
  assert(
    report.deploymentTarget === targetContext.deploymentTarget &&
      report.environment === targetContext.deploymentTarget,
    `${REQUIRED_FILES.smoke} deploymentTarget/environment must match ${targetContext.deploymentTarget}`,
    errors,
  );
  assert(
    /^[0-9a-f]{40}$/u.test(String(report.productCommit ?? "")),
    `${REQUIRED_FILES.smoke} productCommit must be a full 40-character Git commit`,
    errors,
  );
  assert(
    isIsoTimestamp(report.generatedAt),
    `${REQUIRED_FILES.smoke} generatedAt must be an ISO timestamp`,
    errors,
  );
  assert(
    isMeaningful(report.endpointAlias),
    `${REQUIRED_FILES.smoke} endpointAlias is missing or placeholder`,
    errors,
  );
  if (isMeaningful(report.endpointAlias)) {
    assert(
      !hasCredentialedUrl(report.endpointAlias),
      `${REQUIRED_FILES.smoke} endpointAlias must not contain URL credentials`,
      errors,
    );
  }
  if (isMeaningful(report.backendEndpointAlias)) {
    assert(
      !hasCredentialedUrl(report.backendEndpointAlias),
      `${REQUIRED_FILES.smoke} backendEndpointAlias must not contain URL credentials`,
      errors,
    );
  }
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const total = Number(report.summary?.total ?? 0);
  const passed = Number(report.summary?.passed ?? 0);
  const failed = Number(report.summary?.failed ?? 0);
  assert(
    checks.length > 0,
    `${REQUIRED_FILES.smoke} checks must not be empty`,
    errors,
  );
  assert(
    total === checks.length,
    `${REQUIRED_FILES.smoke} summary.total must match checks length`,
    errors,
  );
  assert(
    passed === checks.length,
    `${REQUIRED_FILES.smoke} summary.passed must match checks length`,
    errors,
  );
  assert(
    failed === 0,
    `${REQUIRED_FILES.smoke} summary.failed must be 0`,
    errors,
  );
  for (const [index, check] of checks.entries()) {
    assert(
      isMeaningful(check?.name),
      `${REQUIRED_FILES.smoke} checks[${index}].name is missing`,
      errors,
    );
    const target = String(check?.target ?? "").trim();
    assert(
      isMeaningful(target),
      `${REQUIRED_FILES.smoke} checks[${index}].target is missing`,
      errors,
    );
    assert(
      !hasCredentialedUrl(target),
      `${REQUIRED_FILES.smoke} checks[${index}].target must not contain URL credentials`,
      errors,
    );
    if (/^(https?:\/\/|\/)/i.test(target)) {
      assert(
        /^[1-5]\d{2}$/.test(String(check?.httpCode ?? "").trim()),
        `${REQUIRED_FILES.smoke} checks[${index}].httpCode must be a 100-599 HTTP status for URL targets`,
        errors,
      );
    }
    assert(
      /^(pass|passed|ok)$/i.test(String(check?.status || "").trim()),
      `${REQUIRED_FILES.smoke} checks[${index}].status must be pass`,
      errors,
    );
  }
  const runtimeIdentityChecks = checks.filter(
    (check) => check?.name === "runtime-identity",
  );
  assert(
    runtimeIdentityChecks.length === 1,
    `${REQUIRED_FILES.smoke} must include exactly one runtime-identity check`,
    errors,
  );
  const runtimeIdentityCheck = runtimeIdentityChecks[0];
  if (runtimeIdentityCheck) {
    const expectedRuntimeIdentityDigest = runtimeIdentityDigest(
      targetContext.database,
      report.productCommit,
      runtimeIdentityCheck.migrationVersion,
    );
    assert(
      runtimeIdentityCheck.target === "/readyz/runtime-identity" &&
        String(runtimeIdentityCheck.httpCode ?? "") === "200" &&
        runtimeIdentityCheck.scope === "release-v1" &&
        runtimeIdentityCheck.database === targetContext.database &&
        runtimeIdentityCheck.releaseVersion === report.productCommit &&
        /^\d{14}$/u.test(String(runtimeIdentityCheck.migrationVersion ?? "")) &&
        /^[a-f0-9]{64}$/u.test(
          String(runtimeIdentityCheck.expectedDigestSha256 ?? ""),
        ) &&
        runtimeIdentityCheck.expectedDigestSha256 ===
          expectedRuntimeIdentityDigest &&
        runtimeIdentityCheck.proof === "matched-v1" &&
        runtimeIdentityCheck.responseBodyStored === false,
      `${REQUIRED_FILES.smoke} runtime-identity must prove release-v1 target database/release/migration with HTTP 200 and matched-v1`,
      errors,
    );
  }
  const pdfChecks = checks.filter(
    (check) => check?.name === "template-pdf-render",
  );
  const acceptanceProfile =
    profile === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE;
  assert(
    acceptanceProfile ? pdfChecks.length === 1 : pdfChecks.length <= 1,
    acceptanceProfile
      ? `${REQUIRED_FILES.smoke} must include exactly one template-pdf-render check for customer trial acceptance`
      : `${REQUIRED_FILES.smoke} must not contain duplicate template-pdf-render checks`,
    errors,
  );
  const pdfCheck = pdfChecks[0];
  if (pdfCheck) {
    assert(
      pdfCheck.target === "/templates/render-pdf",
      `${REQUIRED_FILES.smoke} template-pdf-render target must be /templates/render-pdf`,
      errors,
    );
    assert(
      String(pdfCheck.httpCode ?? "").trim() === "200",
      `${REQUIRED_FILES.smoke} template-pdf-render httpCode must be 200`,
      errors,
    );
    assert(
      String(pdfCheck.contentType ?? "")
        .trim()
        .toLowerCase() === "application/pdf",
      `${REQUIRED_FILES.smoke} template-pdf-render contentType must be application/pdf`,
      errors,
    );
    assert(
      /^[a-f0-9]{64}$/i.test(String(pdfCheck.sha256 ?? "").trim()),
      `${REQUIRED_FILES.smoke} template-pdf-render sha256 must be 64-hex`,
      errors,
    );
    const pdfSizeBytes = Number(pdfCheck.sizeBytes);
    assert(
      Number.isSafeInteger(pdfSizeBytes) && pdfSizeBytes > 0,
      `${REQUIRED_FILES.smoke} template-pdf-render sizeBytes must be a positive integer`,
      errors,
    );
    assert(
      pdfCheck.responseBodyStored === false,
      `${REQUIRED_FILES.smoke} template-pdf-render responseBodyStored must be false`,
      errors,
    );
  }
  const authSMSChecks = checks.filter(
    (check) => check?.name === "auth-sms-capabilities",
  );
  assert(
    acceptanceProfile ? authSMSChecks.length === 1 : authSMSChecks.length <= 1,
    acceptanceProfile
      ? `${REQUIRED_FILES.smoke} must include exactly one auth-sms-capabilities check for customer trial acceptance`
      : `${REQUIRED_FILES.smoke} must not contain duplicate auth-sms-capabilities checks`,
    errors,
  );
  const authSMSCheck = authSMSChecks[0];
  if (authSMSCheck) {
    assert(
      authSMSCheck.target === "jsonrpc:auth.capabilities",
      `${REQUIRED_FILES.smoke} auth-sms-capabilities target must be jsonrpc:auth.capabilities`,
      errors,
    );
    assert(
      authSMSCheck.expectedMode === "provider" &&
        authSMSCheck.mode === "provider" &&
        authSMSCheck.enabled === true &&
        authSMSCheck.mockDelivery === false,
      `${REQUIRED_FILES.smoke} auth-sms-capabilities must prove provider/enabled/not-mock`,
      errors,
    );
    assert(
      authSMSCheck.responseBodyStored === false,
      `${REQUIRED_FILES.smoke} auth-sms-capabilities responseBodyStored must be false`,
      errors,
    );
  }
  const credentialChecks = checks.filter(
    (check) => check?.name === "credential-login-matrix",
  );
  assert(
    acceptanceProfile
      ? credentialChecks.length === 1
      : credentialChecks.length <= 1,
    acceptanceProfile
      ? `${REQUIRED_FILES.smoke} must include exactly one credential-login-matrix check for customer trial acceptance`
      : `${REQUIRED_FILES.smoke} must not contain duplicate credential-login-matrix checks`,
    errors,
  );
  const credentialCheck = credentialChecks[0];
  if (credentialCheck && acceptanceProfile) {
    const requiredUsernames = [
      targetContext.admin.username,
      ...targetContext.nonAdmin.usernames,
    ];
    const demo = targetContext.deploymentTarget === "demo-133";
    assert(
      credentialCheck.target === "jsonrpc:auth.admin_login",
      `${REQUIRED_FILES.smoke} credential-login-matrix target must be jsonrpc:auth.admin_login`,
      errors,
    );
    assert(
      credentialCheck.adminUsername === targetContext.admin.username &&
        credentialCheck.adminAuthenticated === true &&
        credentialCheck.adminSuperAdmin === true,
      `${REQUIRED_FILES.smoke} credential-login-matrix must prove the selected target admin identity`,
      errors,
    );
    assert(
      Number(credentialCheck.nonAdminExpected) ===
        targetContext.nonAdmin.usernames.length &&
        Number(credentialCheck.nonAdminAuthenticated) ===
          targetContext.nonAdmin.usernames.length &&
        Number(credentialCheck.totalExpected) === requiredUsernames.length &&
        Number(credentialCheck.totalAuthenticated) ===
          requiredUsernames.length &&
        credentialCheck.loginScope === (demo ? "admin-plus-uat" : "admin-only"),
      `${REQUIRED_FILES.smoke} credential-login-matrix counts/scope must match the selected target`,
      errors,
    );
    assert(
      credentialCheck.uniqueTokensObserved === true,
      `${REQUIRED_FILES.smoke} credential-login-matrix uniqueTokensObserved must be true`,
      errors,
    );
    const usernames = Array.isArray(credentialCheck.usernames)
      ? credentialCheck.usernames
      : [];
    assert(
      usernames.length === requiredUsernames.length &&
        new Set(usernames).size === requiredUsernames.length &&
        requiredUsernames.every((username) => usernames.includes(username)),
      `${REQUIRED_FILES.smoke} credential-login-matrix usernames must match the selected target identities`,
      errors,
    );
    assert(
      credentialCheck.adminPasswordSource ===
        targetContext.admin.credentialSource &&
        credentialCheck.nonAdminPolicy === targetContext.nonAdmin.policy &&
        (demo
          ? credentialCheck.uatPasswordSource ===
              targetContext.nonAdmin.credential.credentialSource &&
            credentialCheck.smsPhoneSourceEnv ===
              targetContext.sms.identity.environmentVariable &&
            typeof credentialCheck.phoneConfigured === "boolean" &&
            credentialCheck.phoneBound === credentialCheck.phoneConfigured
          : !Object.keys(credentialCheck).some((key) =>
              /(dataset|uat|sms|phone)/iu.test(key),
            )),
      `${REQUIRED_FILES.smoke} credential-login-matrix credential sources must match the credential contract`,
      errors,
    );
    assert(
      credentialCheck.credentialContractSchema ===
        targetContext.schemaVersion &&
        credentialCheck.credentialContractSha256 === targetContext.sha256 &&
        credentialCheck.deploymentTarget === targetContext.deploymentTarget &&
        credentialCheck.commandTarget === targetContext.commandTarget &&
        credentialCheck.targetIdentity === targetContext.targetIdentity &&
        credentialCheck.database === targetContext.database &&
        (demo
          ? credentialCheck.datasetVersion === targetContext.datasetVersion
          : !("datasetVersion" in credentialCheck)),
      `${REQUIRED_FILES.smoke} credential-login-matrix contract schema/hash/target identity must match credential.contract.json`,
      errors,
    );
    assert(
      Number.isSafeInteger(credentialCheck.adminAuthVersion) &&
        credentialCheck.adminAuthVersion > 0,
      `${REQUIRED_FILES.smoke} credential-login-matrix adminAuthVersion must be a positive integer`,
      errors,
    );
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        String(credentialCheck.credentialOperationId ?? ""),
      ),
      `${REQUIRED_FILES.smoke} credential-login-matrix credentialOperationId must be a lowercase UUID v4`,
      errors,
    );
    assert(
      credentialCheck.responseBodyStored === false,
      `${REQUIRED_FILES.smoke} credential-login-matrix responseBodyStored must be false`,
      errors,
    );
  }
  const customerConfigChecks = checks.filter(
    (check) =>
      check?.name === "customer-config-effective-session" ||
      check?.target === "jsonrpc:customer_config.get_effective_session",
  );
  assert(
    customerConfigChecks.length <= 1,
    `${REQUIRED_FILES.smoke} must not contain duplicate customer-config-effective-session checks`,
    errors,
  );
  if (acceptanceProfile && targetContext.deploymentTarget === "demo-133") {
    assert(
      customerConfigChecks.length === 1,
      `${REQUIRED_FILES.smoke} must include exactly one customer-config-effective-session check for demo-133`,
      errors,
    );
  }
  const customerConfigCheck = customerConfigChecks[0];
  if (customerConfigCheck && acceptanceProfile) {
    assert(
      customerConfigCheck.target ===
        "jsonrpc:customer_config.get_effective_session",
      `${REQUIRED_FILES.smoke} customer-config-effective-session target must be jsonrpc:customer_config.get_effective_session`,
      errors,
    );
    assert(
      isMeaningful(customerConfigCheck.expectedRevision),
      `${REQUIRED_FILES.smoke} customer-config-effective-session expectedRevision is missing`,
      errors,
    );
    assert(
      isMeaningful(customerConfigCheck.tokenSourceEnv),
      `${REQUIRED_FILES.smoke} customer-config-effective-session tokenSourceEnv is missing`,
      errors,
    );
    assert(
      customerConfigCheck.responseBodyStored === false,
      `${REQUIRED_FILES.smoke} customer-config-effective-session responseBodyStored must be false`,
      errors,
    );
    validateCustomerConfigManifestEvidence({
      absoluteDir,
      customerConfigCheck,
      errors,
    });
  }
  assert(
    report.redaction?.containsSecrets === false,
    `${REQUIRED_FILES.smoke} must declare containsSecrets=false`,
    errors,
  );
  assert(
    report.redaction?.containsRawCustomerRows === false,
    `${REQUIRED_FILES.smoke} must declare containsRawCustomerRows=false`,
    errors,
  );
}

function validateCredentialRotationReport(
  content,
  errors,
  credentialTarget,
  demoCustomerRevision,
) {
  const report = parseJsonEvidence(
    REQUIRED_FILES.credentialRotation,
    content,
    errors,
  );
  if (!report) return;
  const forbiddenKeys = [];
  const absolutePaths = [];
  const visit = (value, pathPrefix = "") => {
    if (typeof value === "string") {
      if (value.startsWith("/")) absolutePaths.push(pathPrefix);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${pathPrefix}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (key !== "phoneBound" && /(password|secret|token|phone)/iu.test(key)) {
        forbiddenKeys.push(fieldPath);
      }
      visit(child, fieldPath);
    }
  };
  visit(report);
  assert(
    forbiddenKeys.length === 0,
    `${REQUIRED_FILES.credentialRotation} must not contain password/secret/token/phone fields`,
    errors,
  );
  assert(
    absolutePaths.length === 0,
    `${REQUIRED_FILES.credentialRotation} must not contain absolute paths`,
    errors,
  );
  const demo = credentialTarget.deploymentTarget === "demo-133";
  assert(
    hasExactKeys(
      report,
      demo
        ? CREDENTIAL_ROTATION_DEMO_KEYS
        : CREDENTIAL_ROTATION_CUSTOMER_TEST_KEYS,
    ),
    `${REQUIRED_FILES.credentialRotation} must use the exact target-specific receipt shape`,
    errors,
  );
  assert(
    report.deploymentTarget === credentialTarget.deploymentTarget &&
      report.target === credentialTarget.commandTarget &&
      report.targetIdentity === credentialTarget.targetIdentity &&
      report.database === credentialTarget.database &&
      report.nonAdminPolicy === credentialTarget.nonAdmin.policy &&
      (demo
        ? report.datasetVersion === credentialTarget.datasetVersion &&
          !("nonAdminAccountsPreserved" in report)
        : !("datasetVersion" in report) &&
          !("customerRevision" in report) &&
          report.nonAdminAccountsPreserved === true),
    `${REQUIRED_FILES.credentialRotation} target identity/policy must match credential.contract.json`,
    errors,
  );
  if (demo) {
    assert(
      report.customerRevision === demoCustomerRevision,
      `${REQUIRED_FILES.credentialRotation} customerRevision must match the current manual acceptance configRevision`,
      errors,
    );
  }
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      String(report.operationId ?? ""),
    ),
    `${REQUIRED_FILES.credentialRotation} operationId must be a lowercase UUID v4`,
    errors,
  );
  assert(
    report.schemaVersion === CREDENTIAL_ROTATION_RECEIPT_SCHEMA &&
      hasExactKeys(report.rollbackPoint, CREDENTIAL_ROLLBACK_POINT_KEYS) &&
      report.rollbackPoint.backupAlias ===
        `pre-credential-rotation-${String(report.productCommit ?? "").slice(0, 12)}-${report.operationId}` &&
      /^[a-f0-9]{64}$/u.test(String(report.rollbackPoint.backupSha256 ?? "")) &&
      Number.isSafeInteger(report.rollbackPoint.backupSizeBytes) &&
      report.rollbackPoint.backupSizeBytes > 0 &&
      report.rollbackPoint.restoreChecked === true,
    `${REQUIRED_FILES.credentialRotation} must bind an exact restore-checked operation rollback point`,
    errors,
  );
  assert(
    isIsoTimestamp(report.generatedAt),
    `${REQUIRED_FILES.credentialRotation} generatedAt must be an ISO timestamp`,
    errors,
  );
  assert(
    /^[0-9a-f]{40}$/u.test(String(report.productCommit ?? "")),
    `${REQUIRED_FILES.credentialRotation} productCommit must be a full 40-character Git commit`,
    errors,
  );
  assert(
    isMeaningful(report.migrationVersion) &&
      Number.isSafeInteger(report.revokedSessions) &&
      report.revokedSessions >= 0,
    `${REQUIRED_FILES.credentialRotation} must contain migrationVersion and a non-negative revokedSessions count`,
    errors,
  );
  assert(
    Number(report.adminAccounts) === 1 &&
      report.accountKind ===
        (demo ? "customer-uat" : "customer-test-admin-only") &&
      Number(report.roleAccounts) ===
        credentialTarget.nonAdmin.usernames.length &&
      (demo
        ? Number(report.nonAdminAccounts) ===
          credentialTarget.nonAdmin.usernames.length
        : Number.isSafeInteger(report.nonAdminAccounts) &&
          report.nonAdminAccounts >= 0),
    `${REQUIRED_FILES.credentialRotation} account counts/kind must match the selected target`,
    errors,
  );
  assert(
    report.authVersionIncremented === true &&
      report.auditSource === "manual_acceptance_password_rotation" &&
      typeof report.replayed === "boolean",
    `${REQUIRED_FILES.credentialRotation} must prove authVersionIncremented, auditSource, and replayed`,
    errors,
  );
  const accounts = Array.isArray(report.accounts) ? report.accounts : [];
  const requiredUsernames = [
    credentialTarget.admin.username,
    ...credentialTarget.nonAdmin.usernames,
  ];
  assert(
    accounts.length === requiredUsernames.length &&
      new Set(accounts.map((account) => account?.username)).size ===
        requiredUsernames.length &&
      requiredUsernames.every((username) =>
        accounts.some((account) => account?.username === username),
      ),
    `${REQUIRED_FILES.credentialRotation} accounts must contain the selected target identities exactly once`,
    errors,
  );
  assert(
    accounts.every((account) =>
      hasExactKeys(account, CREDENTIAL_ROTATION_ACCOUNT_KEYS),
    ),
    `${REQUIRED_FILES.credentialRotation} accounts must use the exact redacted shape`,
    errors,
  );
  assert(
    accounts.every(
      (account) =>
        Number.isSafeInteger(account?.authVersion) && account.authVersion > 1,
    ),
    `${REQUIRED_FILES.credentialRotation} every account authVersion must be greater than 1`,
    errors,
  );
  assert(
    typeof report.phoneBound === "boolean" &&
      (!demo ? report.phoneBound === false : true),
    `${REQUIRED_FILES.credentialRotation} phoneBound must be boolean`,
    errors,
  );
  assert(
    accounts.every(
      (account) =>
        account?.phoneBound ===
        (report.phoneBound &&
          account?.username === credentialTarget.admin.username),
    ),
    `${REQUIRED_FILES.credentialRotation} account phoneBound values must follow the optional contracted admin binding`,
    errors,
  );
}

function validateRollbackPlan(content, errors) {
  requireMarkdownFields(
    content,
    REQUIRED_FILES.rollbackPlan,
    [
      "rollbackDecision",
      "rollbackTrigger",
      "rollbackTargetRelease",
      "rollbackRunbook",
      "forwardFixOwner",
      "verificationAfterRollback",
    ],
    errors,
  );
  const decision = findMarkdownField(content, "rollbackDecision");
  assert(
    /^(rollback-ready|forward-fix-ready|rollback-or-forward-fix-ready)$/i.test(
      decision,
    ),
    `${REQUIRED_FILES.rollbackPlan} rollbackDecision must be rollback-ready, forward-fix-ready or rollback-or-forward-fix-ready`,
    errors,
  );
  assert(
    /\[[xX]\]\s+rollback target identified/.test(content),
    `${REQUIRED_FILES.rollbackPlan} must check rollback target identified`,
    errors,
  );
  assert(
    /\[[xX]\]\s+forward-fix owner assigned/.test(content),
    `${REQUIRED_FILES.rollbackPlan} must check forward-fix owner assigned`,
    errors,
  );
  assert(
    /\[[xX]\]\s+post-action smoke scope defined/.test(content),
    `${REQUIRED_FILES.rollbackPlan} must check post-action smoke scope defined`,
    errors,
  );
}

function validateRollbackRehearsalReport(content, errors) {
  let report;
  try {
    report = JSON.parse(content);
  } catch (error) {
    errors.push(
      `${REQUIRED_FILES.rollbackRehearsal} must be valid JSON: ${error.message}`,
    );
    return;
  }

  assert(
    report.customerCode === DEFAULT_CUSTOMER,
    `${REQUIRED_FILES.rollbackRehearsal} customerCode must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
  for (const fieldPath of [
    "environment",
    "releaseId",
    "rehearsedAt",
    "triggerScenario",
    "rollbackTargetRelease",
    "rollbackRunbook",
    "postCheck.smokeStatus",
    "postCheck.smokeReport",
  ]) {
    requireMeaningfulJsonField(
      report,
      REQUIRED_FILES.rollbackRehearsal,
      fieldPath,
      errors,
    );
  }
  assert(
    /^\d{4}-\d{2}-\d{2}T/.test(String(report.rehearsedAt ?? "")),
    `${REQUIRED_FILES.rollbackRehearsal} rehearsedAt must be an ISO timestamp`,
    errors,
  );
  assert(
    /^(rollback|forward-fix|rollback-forward-fix)$/i.test(
      String(report.rehearsalType ?? ""),
    ),
    `${REQUIRED_FILES.rollbackRehearsal} rehearsalType must be rollback, forward-fix or rollback-forward-fix`,
    errors,
  );
  const steps = Array.isArray(report.steps) ? report.steps : [];
  assert(
    steps.length > 0,
    `${REQUIRED_FILES.rollbackRehearsal} steps must not be empty`,
    errors,
  );
  for (const [index, step] of steps.entries()) {
    assert(
      isMeaningful(step?.name),
      `${REQUIRED_FILES.rollbackRehearsal} steps[${index}].name is missing`,
      errors,
    );
    assert(
      /^(pass|passed|ok)$/i.test(String(step?.status ?? "").trim()),
      `${REQUIRED_FILES.rollbackRehearsal} steps[${index}].status must be pass`,
      errors,
    );
  }
  assert(
    /^(pass|passed|ok)$/i.test(
      String(report.postCheck?.smokeStatus ?? "").trim(),
    ),
    `${REQUIRED_FILES.rollbackRehearsal} postCheck.smokeStatus must be pass`,
    errors,
  );
  assert(
    Number(report.postCheck?.smokeCheckCount) > 0,
    `${REQUIRED_FILES.rollbackRehearsal} postCheck.smokeCheckCount must be a positive number`,
    errors,
  );
  assert(
    report.summary?.rehearsalCompleted === true,
    `${REQUIRED_FILES.rollbackRehearsal} summary.rehearsalCompleted must be true`,
    errors,
  );
  assert(
    /^(pass|passed|ok)$/i.test(
      String(report.summary?.rollbackPathStatus ?? "").trim(),
    ),
    `${REQUIRED_FILES.rollbackRehearsal} summary.rollbackPathStatus must be pass`,
    errors,
  );
  assert(
    report.redaction?.containsSecrets === false,
    `${REQUIRED_FILES.rollbackRehearsal} must declare containsSecrets=false`,
    errors,
  );
  assert(
    report.redaction?.containsRawCustomerRows === false,
    `${REQUIRED_FILES.rollbackRehearsal} must declare containsRawCustomerRows=false`,
    errors,
  );
  assert(
    report.redaction?.containsFullDsn === false,
    `${REQUIRED_FILES.rollbackRehearsal} must declare containsFullDsn=false`,
    errors,
  );
}

function validateSignoff(content, errors) {
  requireMarkdownFields(
    content,
    REQUIRED_FILES.signoff,
    [
      "releaseId",
      "environment",
      "backupId",
      "releaseConclusion",
      "deploymentOperator",
      "evidenceReviewer",
      "customerOrBusinessConfirmation",
    ],
    errors,
  );
  const conclusion = findMarkdownField(content, "releaseConclusion");
  assert(
    /^(customer-trial-approved|internal-only|rollback-or-forward-fix)$/.test(
      conclusion,
    ),
    `${REQUIRED_FILES.signoff} releaseConclusion must be customer-trial-approved, internal-only or rollback-or-forward-fix`,
    errors,
  );
  assert(
    /\[[xX]\]\s+pre-migration backup evidence verified/.test(content),
    `${REQUIRED_FILES.signoff} must check pre-migration backup evidence verified`,
    errors,
  );
  assert(
    /\[[xX]\]\s+known limitations reviewed/.test(content),
    `${REQUIRED_FILES.signoff} must check known limitations reviewed`,
    errors,
  );
}

export function validateReleaseEvidenceGate({
  evidenceDir,
  deploymentTarget,
  customer = DEFAULT_CUSTOMER,
  repoRoot = process.cwd(),
  profile = RELEASE_EVIDENCE_PROFILES.BASE_RELEASE,
} = {}) {
  const errors = [];
  let normalizedProfile = RELEASE_EVIDENCE_PROFILES.BASE_RELEASE;
  let targetContext;
  let demoCustomerRevision = "";
  let runtimeIdentity = null;

  try {
    normalizedProfile = normalizeReleaseEvidenceProfile(profile);
  } catch (error) {
    errors.push(error.message);
  }

  assert(
    customer === DEFAULT_CUSTOMER,
    `Only ${DEFAULT_CUSTOMER} is supported by this gate today`,
    errors,
  );
  assert(Boolean(evidenceDir), "--evidence-dir is required", errors);
  assert(
    deploymentTarget === "demo-133" || deploymentTarget === "customer-test-133",
    "--deployment-target must be demo-133 or customer-test-133",
    errors,
  );
  if (errors.length === 0) {
    const target = getDeploymentTarget(deploymentTarget);
    targetContext = {
      deploymentTarget: target.key,
      database: target.database.name,
    };
    if (
      normalizedProfile === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE
    ) {
      targetContext = selectYoyoosunCredentialTarget(
        loadYoyoosunCredentialContract(),
        deploymentTarget,
      );
    }
    if (
      normalizedProfile ===
        RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE &&
      deploymentTarget === "demo-133"
    ) {
      demoCustomerRevision = loadDemoCustomerRevision(targetContext, errors);
    }
  }

  const absoluteDir = evidenceDir ? path.resolve(repoRoot, evidenceDir) : "";
  assert(
    Boolean(absoluteDir) && fs.existsSync(absoluteDir),
    `evidence dir not found: ${evidenceDir}`,
    errors,
  );

  const releasePath = path.join(absoluteDir, REQUIRED_FILES.release);
  const releaseContent =
    absoluteDir && fs.existsSync(releasePath) ? readText(releasePath) : "";
  const requiredFiles = releaseEvidenceRequiredFiles(
    normalizedProfile,
    releaseContent,
  );
  const recoveryRehearsalRequired = requiredFiles.includes(
    REQUIRED_FILES.backupRestore,
  );
  const signoffRequired = requiredFiles.includes(REQUIRED_FILES.signoff);
  if (errors.length === 0) {
    for (const relativePath of requiredFiles) {
      assert(
        fs.existsSync(path.join(absoluteDir, relativePath)),
        `Missing ${relativePath}`,
        errors,
      );
    }
  }

  if (errors.length === 0) {
    const preflightContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.preflight),
    );
    const imageDigestsContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.imageDigests),
    );
    const backupContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.backup),
    );
    const backupRestoreContent = recoveryRehearsalRequired
      ? readText(path.join(absoluteDir, REQUIRED_FILES.backupRestore))
      : "";
    const migrationContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.migration),
    );
    const smokeContent = readText(path.join(absoluteDir, REQUIRED_FILES.smoke));
    const credentialRotationContent =
      normalizedProfile === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE
        ? readText(path.join(absoluteDir, REQUIRED_FILES.credentialRotation))
        : "";
    const rollbackPlanContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.rollbackPlan),
    );
    const rollbackRehearsalContent = recoveryRehearsalRequired
      ? readText(path.join(absoluteDir, REQUIRED_FILES.rollbackRehearsal))
      : "";
    const signoffContent = signoffRequired
      ? readText(path.join(absoluteDir, REQUIRED_FILES.signoff))
      : "";

    const productCommit = findMarkdownField(releaseContent, "productCommit");
    const migrationVersion = findMarkdownField(
      releaseContent,
      "migrationAfter",
    );
    runtimeIdentity = {
      scope: "release-v1",
      database: targetContext.database,
      productCommit,
      migrationVersion,
      expectedDigestSha256: runtimeIdentityDigest(
        targetContext.database,
        productCommit,
        migrationVersion,
      ),
    };

    for (const [fileName, content] of [
      [REQUIRED_FILES.release, releaseContent],
      [REQUIRED_FILES.preflight, preflightContent],
      [REQUIRED_FILES.imageDigests, imageDigestsContent],
      [REQUIRED_FILES.backup, backupContent],
      [REQUIRED_FILES.backupRestore, backupRestoreContent],
      [REQUIRED_FILES.migration, migrationContent],
      [REQUIRED_FILES.smoke, smokeContent],
      ...(credentialRotationContent
        ? [[REQUIRED_FILES.credentialRotation, credentialRotationContent]]
        : []),
      [REQUIRED_FILES.rollbackPlan, rollbackPlanContent],
      [REQUIRED_FILES.rollbackRehearsal, rollbackRehearsalContent],
      [REQUIRED_FILES.signoff, signoffContent],
    ]) {
      validateNoSecrets(fileName, content, errors);
    }

    validateReleaseEvidence(releaseContent, errors);
    assert(
      findMarkdownField(releaseContent, "environment") === deploymentTarget,
      `${REQUIRED_FILES.release} environment must match ${deploymentTarget}`,
      errors,
    );
    validatePreflightReport(preflightContent, errors, {
      deploymentTarget,
      productCommit,
      profile: normalizedProfile,
    });
    validateImageDigests(imageDigestsContent, errors);
    validateBackupEvidence(backupContent, errors, recoveryRehearsalRequired);
    if (recoveryRehearsalRequired)
      validateBackupRestoreReport(backupRestoreContent, errors, absoluteDir);
    validateMigrationStatus(migrationContent, errors);
    validateSmokeReport(
      smokeContent,
      errors,
      absoluteDir,
      targetContext,
      normalizedProfile,
    );
    if (credentialRotationContent) {
      validateCredentialRotationReport(
        credentialRotationContent,
        errors,
        targetContext,
        demoCustomerRevision,
      );
    }
    validateRollbackPlan(rollbackPlanContent, errors);
    if (recoveryRehearsalRequired)
      validateRollbackRehearsalReport(rollbackRehearsalContent, errors);
    if (signoffRequired) validateSignoff(signoffContent, errors);
    validateEvidenceConsistency(
      {
        releaseContent,
        imageDigestsContent,
        backupContent,
        backupRestoreContent,
        migrationContent,
        smokeContent,
        credentialRotationContent,
        rollbackRehearsalContent,
        signoffContent,
        repoRoot,
        absoluteDir,
        credentialTarget: targetContext,
        demoCustomerRevision,
        profile: normalizedProfile,
      },
      errors,
    );
  }

  if (errors.length > 0) {
    const error = new Error(
      `release evidence gate failed:\n- ${errors.join("\n- ")}`,
    );
    error.errors = errors;
    throw error;
  }

  return {
    customer,
    deploymentTarget,
    evidenceDir: absoluteDir,
    evidenceContract: RELEASE_EVIDENCE_CONTRACT,
    profile: normalizedProfile,
    requiredFiles,
    recoveryRehearsalRequired,
    runtimeIdentity,
    scope: RELEASE_EVIDENCE_GATE_SCOPE,
  };
}

function formatText(result) {
  const lines = [
    `release evidence gate ok: customer=${result.customer}, deploymentTarget=${result.deploymentTarget}, evidenceDir=${result.evidenceDir}`,
    `evidenceContract: ${result.evidenceContract}`,
    `profile: ${result.profile}`,
    `ready means: ${result.scope.readyMeaning}`,
    "not proven by this gate:",
  ];
  for (const item of result.scope.notProvenByThisGate) {
    lines.push(`- ${item}`);
  }
  return `${lines.join("\n")}\n`;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = validateReleaseEvidenceGate(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(formatText(result));
    }
  } catch (error) {
    console.error(`[release-evidence-gate] ${error.message}`);
    process.exit(1);
  }
}

export { RELEASE_EVIDENCE_GATE_SCOPE };
