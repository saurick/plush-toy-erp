#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CUSTOMER = "yoyoosun";

const REQUIRED_FILES = {
  release: "release-evidence.md",
  backup: "backup-evidence.md",
  migration: "migration-status.txt",
  smoke: "smoke-test-report.json",
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

const PLACEHOLDER_PATTERN = /^(|待填写|todo|tbd|n\/a|unknown|replace.*|<.*>|-+)$/i;

function parseArgs(argv) {
  const options = { customer: DEFAULT_CUSTOMER };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
  node scripts/deploy/release-evidence-gate.mjs --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> [--customer yoyoosun]

Purpose:
  Validate a filled yoyoosun release evidence directory before customer trial or delivery.
  This checks metadata, pre-migration backup evidence, migration status, smoke report and sign-off fields.
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMarkdownField(content, fieldName) {
  const label = escapeRegExp(fieldName);
  const tablePattern = new RegExp(`^\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|`, "mi");
  const tableMatch = content.match(tablePattern);
  if (tableMatch) {
    return tableMatch[1].trim();
  }

  const linePattern = new RegExp(`^(?:[-*]\\s*)?${label}\\s*[:：]\\s*(.+)$`, "mi");
  const lineMatch = content.match(linePattern);
  return lineMatch ? lineMatch[1].trim() : "";
}

function requireMarkdownFields(content, fileName, fields, errors) {
  for (const field of fields) {
    const value = findMarkdownField(content, field);
    assert(isMeaningful(value), `${fileName} missing or placeholder field: ${field}`, errors);
  }
}

function validateNoSecrets(fileName, content, errors) {
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    assert(!pattern.test(content), `${fileName} contains a forbidden secret-like pattern`, errors);
  }
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
  assert(
    findMarkdownField(content, "customerCode") === DEFAULT_CUSTOMER,
    `${REQUIRED_FILES.release} customerCode must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
}

function validateBackupEvidence(content, errors) {
  requireMarkdownFields(
    content,
    REQUIRED_FILES.backup,
    [
      "backupId",
      "backupTime",
      "backupPurpose",
      "databaseBackupHash",
      "storageLocationAlias",
      "restoreTestStatus",
      "smokeQueryStatus",
    ],
    errors,
  );
  const purpose = findMarkdownField(content, "backupPurpose");
  assert(
    /(pre-migration|pre-deploy|发布前|migration 前)/i.test(purpose),
    `${REQUIRED_FILES.backup} backupPurpose must explicitly be pre-migration or pre-deploy`,
    errors,
  );
}

function validateMigrationStatus(content, errors) {
  assert(
    /(Migration Status:\s*OK|Pending Files:\s*0|Already at latest|Current Version:)/i.test(content),
    `${REQUIRED_FILES.migration} must include sanitized migration status output`,
    errors,
  );
  assert(!/(dirty|failed|panic|fatal|error)/i.test(content), `${REQUIRED_FILES.migration} contains failure text`, errors);
}

function validateSmokeReport(content, errors) {
  let report;
  try {
    report = JSON.parse(content);
  } catch (error) {
    errors.push(`${REQUIRED_FILES.smoke} must be valid JSON: ${error.message}`);
    return;
  }

  assert(report.customerCode === DEFAULT_CUSTOMER, `${REQUIRED_FILES.smoke} customerCode must be ${DEFAULT_CUSTOMER}`, errors);
  assert(isMeaningful(report.releaseVersion), `${REQUIRED_FILES.smoke} releaseVersion is missing or placeholder`, errors);
  assert(Number(report.summary?.failed ?? 0) === 0, `${REQUIRED_FILES.smoke} summary.failed must be 0`, errors);
  assert(report.redaction?.containsSecrets === false, `${REQUIRED_FILES.smoke} must declare containsSecrets=false`, errors);
  assert(
    report.redaction?.containsRawCustomerRows === false,
    `${REQUIRED_FILES.smoke} must declare containsRawCustomerRows=false`,
    errors,
  );
}

function validateSignoff(content, errors) {
  requireMarkdownFields(
    content,
    REQUIRED_FILES.signoff,
    ["releaseConclusion", "deploymentOperator", "evidenceReviewer", "customerOrBusinessConfirmation"],
    errors,
  );
  const conclusion = findMarkdownField(content, "releaseConclusion");
  assert(
    /^(customer-trial-approved|internal-only|rollback-or-forward-fix)$/.test(conclusion),
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

  assert(customer === DEFAULT_CUSTOMER, `Only ${DEFAULT_CUSTOMER} is supported by this gate today`, errors);
  assert(Boolean(evidenceDir), "--evidence-dir is required", errors);

  const absoluteDir = evidenceDir ? path.resolve(repoRoot, evidenceDir) : "";
  assert(Boolean(absoluteDir) && fs.existsSync(absoluteDir), `evidence dir not found: ${evidenceDir}`, errors);

  if (errors.length === 0) {
    for (const relativePath of Object.values(REQUIRED_FILES)) {
      assert(fs.existsSync(path.join(absoluteDir, relativePath)), `Missing ${relativePath}`, errors);
    }
  }

  if (errors.length === 0) {
    const releaseContent = readText(path.join(absoluteDir, REQUIRED_FILES.release));
    const backupContent = readText(path.join(absoluteDir, REQUIRED_FILES.backup));
    const migrationContent = readText(path.join(absoluteDir, REQUIRED_FILES.migration));
    const smokeContent = readText(path.join(absoluteDir, REQUIRED_FILES.smoke));
    const signoffContent = readText(path.join(absoluteDir, REQUIRED_FILES.signoff));

    for (const [fileName, content] of [
      [REQUIRED_FILES.release, releaseContent],
      [REQUIRED_FILES.backup, backupContent],
      [REQUIRED_FILES.migration, migrationContent],
      [REQUIRED_FILES.smoke, smokeContent],
      [REQUIRED_FILES.signoff, signoffContent],
    ]) {
      validateNoSecrets(fileName, content, errors);
    }

    validateReleaseEvidence(releaseContent, errors);
    validateBackupEvidence(backupContent, errors);
    validateMigrationStatus(migrationContent, errors);
    validateSmokeReport(smokeContent, errors);
    validateSignoff(signoffContent, errors);
  }

  if (errors.length > 0) {
    const error = new Error(`release evidence gate failed:\n- ${errors.join("\n- ")}`);
    error.errors = errors;
    throw error;
  }

  return {
    customer,
    evidenceDir: absoluteDir,
    requiredFiles: Object.values(REQUIRED_FILES),
  };
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
    console.log(`release evidence gate ok: customer=${result.customer}, evidenceDir=${result.evidenceDir}`);
  } catch (error) {
    console.error(`[release-evidence-gate] ${error.message}`);
    process.exit(1);
  }
}
