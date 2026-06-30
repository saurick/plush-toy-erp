#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CUSTOMER = "yoyoosun";

const REQUIRED_FILES = [
  "README.md",
  "env/.env.example",
  "env/secrets.required.md",
  "env/server.config.example.yaml",
  "env/web.config.example.json",
  "compose/docker-compose.example.yml",
  "compose/docker-compose.override.example.yml",
  "compose/nginx.example.conf",
  "runbooks/00-overview.md",
  "runbooks/01-first-deploy.md",
  "runbooks/02-upgrade.md",
  "runbooks/03-rollback.md",
  "runbooks/04-backup-restore.md",
  "runbooks/05-migration.md",
  "runbooks/06-import-apply.md",
  "runbooks/07-incident-response.md",
  "runbooks/08-daily-ops.md",
  "checklists/pre-deploy-checklist.md",
  "checklists/post-deploy-checklist.md",
  "checklists/smoke-test-checklist.md",
  "checklists/security-checklist.md",
  "checklists/backup-restore-checklist.md",
  "checklists/upgrade-checklist.md",
  "checklists/rollback-checklist.md",
  "checklists/weekly-inspection-checklist.md",
  "checklists/monthly-inspection-checklist.md",
  "evidence/README.md",
  "evidence/releases/README.md",
  "evidence/releases/release-evidence-template.md",
  "evidence/releases/release-signoff-checklist-template.md",
  "evidence/releases/rollback-forward-fix-plan-template.md",
  "evidence/migrations/migration-evidence-template.md",
  "evidence/backups/backup-evidence-template.md",
  "evidence/smoke/smoke-test-report.example.json",
  "reports/README.md",
  "scripts/README.md",
  "scripts/verify-env.sh",
  "scripts/run-smoke.sh",
  "scripts/collect-evidence.sh",
  "scripts/verify-backup-restore.sh",
  "scripts/run-backup-restore-rehearsal.sh",
];

const REQUIRED_ENV_KEYS = [
  "PROJECT_SLUG",
  "APP_IMAGE",
  "WEB_IMAGE",
  "TZ",
  "POSTGRES_DSN",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_DATA_DIR",
  "TRACE_ENDPOINT",
  "WEB_API_ORIGIN",
  "APP_JWT_SECRET",
  "APP_ADMIN_USERNAME",
  "ERP_DEBUG_ENV",
  "ERP_DEBUG_SEED_ENABLED",
  "ERP_DEBUG_CLEANUP_ENABLED",
  "ERP_DEBUG_CLEANUP_SCOPE",
];

const FORBIDDEN_PATH_PATTERNS = [
  /(^|\/)\.env($|[./_-])/,
  /\.env\.(production|prod|customer|customer-trial|local)$/i,
  /\.(pem|key|p12|pfx|sql|dump|bak|backup|tar|tgz|gz|zip)$/i,
  /\.(xlsx|xls|pdf|jpg|jpeg|png)$/i,
  /(^|\/)(node_modules|dist|coverage|tmp|cache)(\/|$)/,
];

const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /postgres:\/\/[^:\s]+:(?!change-this|<|replace-|example)[^@\s]*(password|secret|token|prod)[^@\s]*@/i,
  /(APP_JWT_SECRET|POSTGRES_PASSWORD|APP_ADMIN_PASSWORD)\s*=\s*(?!change-this|<|replace-|example)(?=.{16,})[^\s#]+/i,
];

function parseArgs(argv) {
  const options = { customer: DEFAULT_CUSTOMER };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      options.customer = argv[index + 1];
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
  node scripts/deploy/deployment-package-lint.mjs [--customer yoyoosun]

Purpose:
  Validate a customer private deployment package without reading real secrets.
`);
}

function walkFiles(rootDir) {
  const results = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }

  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        results.push(absolute);
      }
    }
  };

  visit(rootDir);
  return results;
}

function normalizeRelative(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

export function findForbiddenFiles(packageDir) {
  return walkFiles(packageDir)
    .map((file) => normalizeRelative(packageDir, file))
    .filter((relativePath) => {
      if (relativePath === "env/.env.example") {
        return false;
      }
      return FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
    });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function hasCredentialedUrl(value) {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]+@/i.test(String(value ?? "").trim());
}

function validateEnvExample(packageDir, errors) {
  const envPath = path.join(packageDir, "env/.env.example");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = readText(envPath);
  for (const key of REQUIRED_ENV_KEYS) {
    assert(new RegExp(`^${key}=`, "m").test(content), `env/.env.example missing ${key}`, errors);
  }
  assert(/ERP_DEBUG_ENV=prod/m.test(content), "env/.env.example must set ERP_DEBUG_ENV=prod", errors);
  assert(
    /ERP_DEBUG_SEED_ENABLED=false/m.test(content),
    "env/.env.example must disable ERP_DEBUG_SEED_ENABLED",
    errors,
  );
  assert(
    /ERP_DEBUG_CLEANUP_ENABLED=false/m.test(content),
    "env/.env.example must disable ERP_DEBUG_CLEANUP_ENABLED",
    errors,
  );
}

function validateCompose(packageDir, errors) {
  const composePath = path.join(packageDir, "compose/docker-compose.example.yml");
  if (!fs.existsSync(composePath)) {
    return;
  }
  const content = readText(composePath);
  assert(/healthcheck:/m.test(content), "compose example must include healthcheck", errors);
  assert(/restart:\s+always/m.test(content), "compose example must include restart policy", errors);
  assert(/web-desktop:/m.test(content), "compose example must use single web-desktop entry", errors);
  assert(!/web-mobile-/m.test(content), "compose example must not restore old web-mobile services", errors);
}

function validateContent(packageDir, errors) {
  for (const file of walkFiles(packageDir)) {
    const relativePath = normalizeRelative(packageDir, file);
    if (/\.(json|md|mjs|sh|ya?ml|conf|example)$|\.env\.example$/.test(relativePath)) {
      const content = readText(file);
      for (const pattern of SECRET_CONTENT_PATTERNS) {
        assert(!pattern.test(content), `${relativePath} contains a forbidden secret-like pattern`, errors);
      }
    }
  }
}

function validateReleaseEvidenceTemplate(packageDir, errors) {
  const templatePath = path.join(packageDir, "evidence/releases/release-evidence-template.md");
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  const basicSection = content.match(/## 基本信息[\s\S]*?(?=\n## )/)?.[0] || "";
  for (const field of [
    "customerCode",
    "releaseVersion",
    "environment",
    "gitCommit",
    "serverImageDigest",
    "webImageDigest",
    "migrationBefore",
    "migrationAfter",
    "backupId",
  ]) {
    assert(
      new RegExp(`\\|\\s*${field}\\s*\\|`, "m").test(basicSection),
      `release evidence template basic info missing ${field}`,
      errors,
    );
  }
  for (const evidenceFile of [
    "production-preflight-report.txt",
    "image-digests.txt",
    "backup-evidence.md",
    "migration-status-before-apply.txt",
    "migration-status.txt",
    "smoke-test-report.json",
    "backup-restore-report.json",
    "rollback-rehearsal-report.json",
    "command-summary.txt",
  ]) {
    assert(content.includes(evidenceFile), `release evidence template missing ${evidenceFile}`, errors);
  }
  for (const artifactField of [
    "artifacts.backupEvidence",
    "artifacts.preMigrationStatus",
    "artifacts.migrationStatus",
    "artifacts.commandSummary",
  ]) {
    assert(content.includes(artifactField), `release evidence template missing ${artifactField}`, errors);
  }
}

function validateBackupEvidenceTemplate(packageDir, errors) {
  const templatePath = path.join(packageDir, "evidence/backups/backup-evidence-template.md");
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "backupId",
    "backupTime",
    "backupPurpose",
    "environment",
    "releaseVersion",
    "migrationVersion",
    "databaseBackupSize",
    "databaseBackupHash",
    "storageLocationAlias",
    "restoreTestStatus",
    "restoreMigrationVersion",
    "smokeQueryStatus",
    "verifiedAt",
  ]) {
    assert(
      new RegExp(`\\|\\s*${field}\\s*\\|`, "m").test(content),
      `backup evidence template missing ${field}`,
      errors,
    );
  }
  assert(
    /不要记录真实下载链接、access key、dump 内容或附件原件/.test(content),
    "backup evidence template must state secret and dump redaction boundary",
    errors,
  );
}

function validateMigrationEvidenceTemplate(packageDir, errors) {
  const templatePath = path.join(packageDir, "evidence/migrations/migration-evidence-template.md");
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "releaseVersion",
    "gitCommit",
    "environment",
    "startedAt",
    "finishedAt",
    "migrationBefore",
    "migrationAfter",
    "currentVersion",
    "pendingFiles",
    "dirtyState",
    "backupId",
  ]) {
    assert(
      new RegExp(`\\|\\s*${field}\\s*\\|`, "m").test(content),
      `migration evidence template missing ${field}`,
      errors,
    );
  }
  for (const gateLine of ["Current Version:", "Pending Files:"]) {
    assert(content.includes(gateLine), `migration evidence template missing ${gateLine}`, errors);
  }
  assert(
    /不要记录完整 DSN、密码、migration SQL 全文、客户业务数据明细或 raw rows/.test(content),
    "migration evidence template must state DSN, SQL, secret and raw rows redaction boundary",
    errors,
  );
}

function validateReleaseSignoffTemplate(packageDir, errors) {
  const templatePath = path.join(packageDir, "evidence/releases/release-signoff-checklist-template.md");
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "releaseVersion",
    "environment",
    "backupId",
    "releaseConclusion",
    "deploymentOperator",
    "evidenceReviewer",
    "customerOrBusinessConfirmation",
  ]) {
    assert(
      new RegExp(`\\|\\s*${field}\\s*\\|`, "m").test(content),
      `release signoff template missing ${field}`,
      errors,
    );
  }
  for (const value of ["customer-trial-approved", "internal-only", "rollback-or-forward-fix"]) {
    assert(content.includes(value), `release signoff template missing ${value}`, errors);
  }
  for (const checklistItem of [
    "pre-migration backup evidence verified",
    "known limitations reviewed",
    "migration status recorded and reviewed",
    "smoke report reviewed",
    "customer-visible scope reviewed",
  ]) {
    assert(content.includes(checklistItem), `release signoff template missing ${checklistItem}`, errors);
  }
  assert(
    /不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图/.test(content),
    "release signoff template must state secret, backup, DSN, raw rows and screenshot redaction boundary",
    errors,
  );
}

function validateRollbackForwardFixPlanTemplate(packageDir, errors) {
  const templatePath = path.join(packageDir, "evidence/releases/rollback-forward-fix-plan-template.md");
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "rollbackDecision",
    "rollbackTrigger",
    "rollbackTargetRelease",
    "rollbackRunbook",
    "forwardFixOwner",
    "verificationAfterRollback",
  ]) {
    assert(
      new RegExp(`\\|\\s*${field}\\s*\\|`, "m").test(content),
      `rollback forward-fix template missing ${field}`,
      errors,
    );
  }
  for (const value of ["rollback-ready", "forward-fix-ready", "rollback-or-forward-fix-ready"]) {
    assert(content.includes(value), `rollback forward-fix template missing ${value}`, errors);
  }
  for (const checklistItem of [
    "rollback target identified",
    "forward-fix owner assigned",
    "post-action smoke scope defined",
  ]) {
    assert(content.includes(checklistItem), `rollback forward-fix template missing ${checklistItem}`, errors);
  }
  assert(
    /deployments\/yoyoosun\/runbooks\/03-rollback\.md/.test(content),
    "rollback forward-fix template must point to rollback runbook",
    errors,
  );
  assert(
    /不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图/.test(content),
    "rollback forward-fix template must state secret, backup, DSN, raw rows and screenshot redaction boundary",
    errors,
  );
}

function validateSmokeReportExample(packageDir, errors) {
  const examplePath = path.join(packageDir, "evidence/smoke/smoke-test-report.example.json");
  if (!fs.existsSync(examplePath)) {
    return;
  }
  let report;
  try {
    report = JSON.parse(readText(examplePath));
  } catch (error) {
    errors.push(`smoke test report example must be valid JSON: ${error.message}`);
    return;
  }
  assert(report.customerCode === DEFAULT_CUSTOMER, `smoke test report example customerCode must be ${DEFAULT_CUSTOMER}`, errors);
  for (const field of ["environment", "releaseVersion", "generatedAt", "operatorRole", "endpointAlias"]) {
    assert(Boolean(String(report[field] ?? "").trim()), `smoke test report example missing ${field}`, errors);
  }
  assert(
    !hasCredentialedUrl(report.endpointAlias),
    "smoke test report example endpointAlias must not contain URL credentials",
    errors,
  );
  if (report.backendEndpointAlias !== undefined) {
    assert(
      !hasCredentialedUrl(report.backendEndpointAlias),
      "smoke test report example backendEndpointAlias must not contain URL credentials",
      errors,
    );
  }
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const total = Number(report.summary?.total ?? 0);
  const passed = Number(report.summary?.passed ?? 0);
  const failed = Number(report.summary?.failed ?? 0);
  assert(checks.length > 0, "smoke test report example checks must not be empty", errors);
  assert(total === checks.length, "smoke test report example summary.total must match checks length", errors);
  assert(passed === checks.length, "smoke test report example summary.passed must match checks length", errors);
  assert(failed === 0, "smoke test report example summary.failed must be 0", errors);
  for (const [index, check] of checks.entries()) {
    assert(Boolean(String(check?.name ?? "").trim()), `smoke test report example checks[${index}].name is missing`, errors);
    assert(
      /^(pass|passed|ok)$/i.test(String(check?.status ?? "").trim()),
      `smoke test report example checks[${index}].status must be pass`,
      errors,
    );
    assert(Boolean(String(check?.target ?? "").trim()), `smoke test report example checks[${index}].target is missing`, errors);
    assert(
      !hasCredentialedUrl(check?.target),
      `smoke test report example checks[${index}].target must not contain URL credentials`,
      errors,
    );
    if (/^(https?:\/\/|\/)/i.test(String(check?.target ?? "").trim())) {
      assert(
        /^[1-5]\d{2}$/.test(String(check?.httpCode ?? "").trim()),
        `smoke test report example checks[${index}].httpCode must be a 100-599 HTTP status for URL targets`,
        errors,
      );
    }
  }
  assert(report.redaction?.containsSecrets === false, "smoke test report example must declare containsSecrets=false", errors);
  assert(
    report.redaction?.containsRawCustomerRows === false,
    "smoke test report example must declare containsRawCustomerRows=false",
    errors,
  );
}

export function validateDeploymentPackage({ repoRoot = process.cwd(), customer = DEFAULT_CUSTOMER } = {}) {
  const packageDir = path.join(repoRoot, "deployments", customer);
  const errors = [];

  assert(fs.existsSync(packageDir), `deployments/${customer} must exist`, errors);

  for (const relativePath of REQUIRED_FILES) {
    assert(fs.existsSync(path.join(packageDir, relativePath)), `Missing deployments/${customer}/${relativePath}`, errors);
  }

  for (const relativePath of findForbiddenFiles(packageDir)) {
    errors.push(`Forbidden file in deployments/${customer}: ${relativePath}`);
  }

  validateEnvExample(packageDir, errors);
  validateCompose(packageDir, errors);
  validateContent(packageDir, errors);
  validateReleaseEvidenceTemplate(packageDir, errors);
  validateBackupEvidenceTemplate(packageDir, errors);
  validateMigrationEvidenceTemplate(packageDir, errors);
  validateReleaseSignoffTemplate(packageDir, errors);
  validateRollbackForwardFixPlanTemplate(packageDir, errors);
  validateSmokeReportExample(packageDir, errors);

  if (errors.length > 0) {
    const error = new Error(`deployment package lint failed:\n- ${errors.join("\n- ")}`);
    error.errors = errors;
    throw error;
  }

  return {
    customer,
    packageDir,
    requiredFiles: REQUIRED_FILES.length,
    checkedFiles: walkFiles(packageDir).length,
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
    const result = validateDeploymentPackage({ customer: options.customer });
    console.log(
      `deployment package lint ok: customer=${result.customer}, required=${result.requiredFiles}, files=${result.checkedFiles}`,
    );
  } catch (error) {
    console.error(`[deployment-package-lint] ${error.message}`);
    process.exit(1);
  }
}
