#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CUSTOMER = "yoyoosun";
const POPULATED_UPGRADE_AUDIT_VERSION = "20260714055504";
const CUSTOMER_CONFIG_CUTOVER_AUDIT_VERSION = "20260714055825";
const CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE =
  "customer-config-manifest-evidence.json";

export const REQUIRED_FILES = {
  release: "release-evidence.md",
  preflight: "production-preflight-report.txt",
  imageDigests: "image-digests.txt",
  backup: "backup-evidence.md",
  backupRestore: "backup-restore-report.json",
  migration: "migration-status.txt",
  smoke: "smoke-test-report.json",
  rollbackPlan: "rollback-forward-fix-plan.md",
  rollbackRehearsal: "rollback-rehearsal-report.json",
  signoff: "release-signoff-checklist.md",
};

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
  const options = { customer: DEFAULT_CUSTOMER };
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
  node scripts/deploy/release-evidence-gate.mjs --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> [--customer yoyoosun] [--json]

Purpose:
  Validate a filled yoyoosun release evidence directory before customer trial or delivery.
  This checks metadata, pre-migration backup evidence, migration status, smoke report and sign-off fields.
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
  const label = escapeRegExp(fieldName);
  const tablePattern = new RegExp(
    `^\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|`,
    "mi",
  );
  const tableMatch = content.match(tablePattern);
  if (tableMatch) {
    return tableMatch[1].trim();
  }

  const linePattern = new RegExp(
    `^(?:[-*]\\s*)?${label}\\s*[:：]\\s*(.+)$`,
    "mi",
  );
  const lineMatch = content.match(linePattern);
  return lineMatch ? lineMatch[1].trim() : "";
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
  requireMarkdownFields(
    content,
    REQUIRED_FILES.release,
    [
      "customerCode",
      "releaseVersion",
      "environment",
      "gitCommit",
      "serverImageDigest",
      "webImageDigest",
      "migrationBefore",
      "migrationAfter",
      "backupId",
    ],
    errors,
  );
  const gitCommit = findMarkdownField(content, "gitCommit");
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
    /^[a-f0-9]{7,40}$/i.test(gitCommit),
    `${REQUIRED_FILES.release} gitCommit must be a git hash`,
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

function validatePreflightReport(content, errors) {
  assert(
    /\[production-preflight\]\s+ok:\s+env 必需变量齐全/.test(content),
    `${REQUIRED_FILES.preflight} must include env required keys check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+生产 secret、镜像 tag、debug、后端端口和 PostgreSQL \/ Jaeger 暴露边界通过/.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must include production secret/image/debug/exposure boundary check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+Compose、低配部署边界和 migration 脚本通过/.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must include compose and low-spec deployment boundary check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+Compose 运行服务存在/.test(content),
    `${REQUIRED_FILES.preflight} must include runtime Compose services check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+yoyoosun SMS 运行合同已绑定:\s+mode=provider\s+contract_sha256=[a-f0-9]{64}/i.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must bind the yoyoosun provider runtime contract`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+运行态 SMS 模式匹配合同:\s+mode=provider/.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must prove runtime SMS mode=provider`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+auth\.capabilities 已读回 provider\/enabled\/not-mock/.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must prove provider auth.capabilities readback`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+运行态 ERP_PDF_WARMUP=async/.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must include runtime ERP_PDF_WARMUP=async check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+运行态 Chromium \/ chromium-common 版本与 Docker exact pin 一致:\s+\S+/.test(
      content,
    ),
    `${REQUIRED_FILES.preflight} must include runtime Chromium/chromium-common exact pin check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+ok:\s+healthz \/ readyz 通过/.test(content),
    `${REQUIRED_FILES.preflight} must include runtime healthz/readyz check`,
    errors,
  );
  assert(
    /\[production-preflight\]\s+all checks passed/.test(content),
    `${REQUIRED_FILES.preflight} must include all checks passed`,
    errors,
  );
  assert(
    !/example 模式仅检查结构|--example/i.test(content),
    `${REQUIRED_FILES.preflight} must not be an example-mode preflight`,
    errors,
  );
  assert(
    !/\[production-preflight\]\s+(ERROR|WARN):/i.test(content),
    `${REQUIRED_FILES.preflight} must not include ERROR or WARN output`,
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

function validateBackupEvidence(content, errors) {
  requireMarkdownFields(
    content,
    REQUIRED_FILES.backup,
    [
      "releaseVersion",
      "environment",
      "backupId",
      "backupTime",
      "backupPurpose",
      "databaseBackupSize",
      "databaseBackupHash",
      "migrationVersion",
      "storageLocationAlias",
      "restoreTestStatus",
      "smokeQueryStatus",
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
    "releaseVersion",
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
    rollbackRehearsalContent,
    signoffContent,
    repoRoot,
    absoluteDir,
  },
  errors,
) {
  const releaseVersion = findMarkdownField(releaseContent, "releaseVersion");
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
  const backupReleaseVersion = findMarkdownField(
    backupContent,
    "releaseVersion",
  );
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
  const backupRestoreReport = parseJsonEvidence(
    REQUIRED_FILES.backupRestore,
    backupRestoreContent,
    errors,
  );
  const smokeReport = parseJsonEvidence(
    REQUIRED_FILES.smoke,
    smokeContent,
    errors,
  );
  const rollbackRehearsalReport = parseJsonEvidence(
    REQUIRED_FILES.rollbackRehearsal,
    rollbackRehearsalContent,
    errors,
  );

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
      backupRestoreReport.releaseVersion === releaseVersion,
      `${REQUIRED_FILES.backupRestore} releaseVersion must match ${REQUIRED_FILES.release}`,
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
      findKeyValueField(commandSummaryContent, "releaseVersion") ===
        releaseVersion,
      `${REQUIRED_FILES.backupRestore} artifacts.commandSummary releaseVersion must match ${REQUIRED_FILES.release}`,
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
      smokeReport.releaseVersion === releaseVersion,
      `${REQUIRED_FILES.smoke} releaseVersion must match ${REQUIRED_FILES.release}`,
      errors,
    );
    assert(
      smokeReport.environment === releaseEnvironment,
      `${REQUIRED_FILES.smoke} environment must match ${REQUIRED_FILES.release}`,
      errors,
    );
  }

  if (rollbackRehearsalReport) {
    assert(
      rollbackRehearsalReport.releaseVersion === releaseVersion,
      `${REQUIRED_FILES.rollbackRehearsal} releaseVersion must match ${REQUIRED_FILES.release}`,
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
    if (customerConfigSmokeCheck) {
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
    backupReleaseVersion === releaseVersion,
    `${REQUIRED_FILES.backup} releaseVersion must match ${REQUIRED_FILES.release}`,
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
  assert(
    findMarkdownField(signoffContent, "releaseVersion") === releaseVersion,
    `${REQUIRED_FILES.signoff} releaseVersion must match ${REQUIRED_FILES.release}`,
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

function validateSmokeReport(content, errors, absoluteDir) {
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
    isMeaningful(report.releaseVersion),
    `${REQUIRED_FILES.smoke} releaseVersion is missing or placeholder`,
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
  const pdfChecks = checks.filter(
    (check) => check?.name === "template-pdf-render",
  );
  assert(
    pdfChecks.length === 1,
    `${REQUIRED_FILES.smoke} must include exactly one template-pdf-render check`,
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
    authSMSChecks.length === 1,
    `${REQUIRED_FILES.smoke} must include exactly one auth-sms-capabilities check`,
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
  const customerConfigCheck = findCustomerConfigEffectiveSessionCheck(report);
  if (customerConfigCheck) {
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
    "releaseVersion",
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
      "releaseVersion",
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
  customer = DEFAULT_CUSTOMER,
  repoRoot = process.cwd(),
} = {}) {
  const errors = [];

  assert(
    customer === DEFAULT_CUSTOMER,
    `Only ${DEFAULT_CUSTOMER} is supported by this gate today`,
    errors,
  );
  assert(Boolean(evidenceDir), "--evidence-dir is required", errors);

  const absoluteDir = evidenceDir ? path.resolve(repoRoot, evidenceDir) : "";
  assert(
    Boolean(absoluteDir) && fs.existsSync(absoluteDir),
    `evidence dir not found: ${evidenceDir}`,
    errors,
  );

  if (errors.length === 0) {
    for (const relativePath of Object.values(REQUIRED_FILES)) {
      assert(
        fs.existsSync(path.join(absoluteDir, relativePath)),
        `Missing ${relativePath}`,
        errors,
      );
    }
  }

  if (errors.length === 0) {
    const releaseContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.release),
    );
    const preflightContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.preflight),
    );
    const imageDigestsContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.imageDigests),
    );
    const backupContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.backup),
    );
    const backupRestoreContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.backupRestore),
    );
    const migrationContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.migration),
    );
    const smokeContent = readText(path.join(absoluteDir, REQUIRED_FILES.smoke));
    const rollbackPlanContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.rollbackPlan),
    );
    const rollbackRehearsalContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.rollbackRehearsal),
    );
    const signoffContent = readText(
      path.join(absoluteDir, REQUIRED_FILES.signoff),
    );

    for (const [fileName, content] of [
      [REQUIRED_FILES.release, releaseContent],
      [REQUIRED_FILES.preflight, preflightContent],
      [REQUIRED_FILES.imageDigests, imageDigestsContent],
      [REQUIRED_FILES.backup, backupContent],
      [REQUIRED_FILES.backupRestore, backupRestoreContent],
      [REQUIRED_FILES.migration, migrationContent],
      [REQUIRED_FILES.smoke, smokeContent],
      [REQUIRED_FILES.rollbackPlan, rollbackPlanContent],
      [REQUIRED_FILES.rollbackRehearsal, rollbackRehearsalContent],
      [REQUIRED_FILES.signoff, signoffContent],
    ]) {
      validateNoSecrets(fileName, content, errors);
    }

    validateReleaseEvidence(releaseContent, errors);
    validatePreflightReport(preflightContent, errors);
    validateImageDigests(imageDigestsContent, errors);
    validateBackupEvidence(backupContent, errors);
    validateBackupRestoreReport(backupRestoreContent, errors, absoluteDir);
    validateMigrationStatus(migrationContent, errors);
    validateSmokeReport(smokeContent, errors, absoluteDir);
    validateRollbackPlan(rollbackPlanContent, errors);
    validateRollbackRehearsalReport(rollbackRehearsalContent, errors);
    validateSignoff(signoffContent, errors);
    validateEvidenceConsistency(
      {
        releaseContent,
        imageDigestsContent,
        backupContent,
        backupRestoreContent,
        migrationContent,
        smokeContent,
        rollbackRehearsalContent,
        signoffContent,
        repoRoot,
        absoluteDir,
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
    evidenceDir: absoluteDir,
    requiredFiles: Object.values(REQUIRED_FILES),
    scope: RELEASE_EVIDENCE_GATE_SCOPE,
  };
}

function formatText(result) {
  const lines = [
    `release evidence gate ok: customer=${result.customer}, evidenceDir=${result.evidenceDir}`,
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
