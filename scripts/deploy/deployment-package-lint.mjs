#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromWeb = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const yaml = requireFromWeb("yaml");

const DEFAULT_CUSTOMER = "yoyoosun";

const CANONICAL_COMPOSE = "server/deploy/compose/prod/compose.yml";
const SHARED_SCRIPTS = [
  "collect-evidence.sh",
  "collect-evidence.mjs",
  "run-smoke.sh",
  "run-smoke-support.mjs",
  "run-backup-restore-rehearsal.sh",
  "verify-backup-restore.sh",
];
const UNUSED_CONFIGURATION_FILES = [
  "env/server.config.example.yaml",
  "env/web.config.example.json",
];

const REQUIRED_FILES = [
  "README.md",
  "env/.env.example",
  "env/secrets.required.md",
  "env/runtime.contract.json",
  "env/credential.contract.json",
  "compose/nginx.example.conf",
  "runbooks/00-overview.md",
  "runbooks/01-first-deploy.md",
  "runbooks/02-upgrade.md",
  "runbooks/03-rollback.md",
  "runbooks/04-backup-restore.md",
  "runbooks/05-migration.md",
  "runbooks/07-incident-response.md",
  "runbooks/08-daily-ops.md",
  "checklists/pre-deploy-checklist.md",
  "checklists/post-deploy-checklist.md",
  "checklists/smoke-test-checklist.md",
  "checklists/security-checklist.md",
  "checklists/backup-restore-checklist.md",
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
  "MIGRATION_LOCK_FILE",
  "TRACE_ENDPOINT",
  "WEB_API_ORIGIN",
  "APP_JWT_SECRET",
  "APP_ADMIN_USERNAME",
  "ERP_DEBUG_ENV",
  "ERP_DEBUG_SEED_ENABLED",
  "ERP_DEBUG_CLEANUP_ENABLED",
  "ERP_DEBUG_BUSINESS_CLEAR_ENABLED",
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
      return FORBIDDEN_PATH_PATTERNS.some((pattern) =>
        pattern.test(relativePath),
      );
    });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function isMapping(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function readComposeDocuments(filePath, relativePath, errors, required) {
  const lineCounter = new yaml.LineCounter();
  const reportError = (offset) => {
    const location = Number.isInteger(offset) && lineCounter.linePos(offset);
    const position = location
      ? ` at line ${location.line}, column ${location.col}`
      : "";
    errors.push(
      `${relativePath} must contain valid Compose YAML/JSON${position}`,
    );
  };
  let documents;
  try {
    // 保留出错文档的结构，避免改名配置在解析失败时被当成普通文本。
    documents = yaml.parseAllDocuments(readText(filePath), {
      schema: "core",
      merge: true,
      lineCounter,
      prettyErrors: false,
      logLevel: "error",
    });
  } catch {
    reportError();
    return [];
  }
  return documents.map((document) => {
    const composeStructure =
      yaml.isMap(document.contents) &&
      document.contents.items.some(
        ({ key }) =>
          yaml.isScalar(key) &&
          (["services", "include"].includes(String(key.value)) ||
            key.source === "<<"),
      );
    try {
      if (document.errors.length > 0) throw document.errors[0];
      // 标签承载的结构参与校验；!reset / !override 的实际合并交由 Compose。
      return document.toJS();
    } catch (error) {
      if (required || composeStructure) {
        reportError(error.pos?.[0] ?? document.contents?.range?.[0]);
      }
      return null;
    }
  });
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function validateRunbookCoverage(packageDir, errors) {
  const sections = {
    "runbooks/02-upgrade.md": ["## 升级检查"],
    "runbooks/03-rollback.md": [
      "## 回滚检查",
      "## 代码回滚",
      "## 数据库与附件恢复",
    ],
    "runbooks/08-daily-ops.md": ["## 每周", "## 每月"],
  };
  for (const [relativePath, headings] of Object.entries(sections)) {
    const filePath = path.join(packageDir, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const lines = readText(filePath).split(/\r?\n/);
    for (const heading of headings) {
      assert(
        lines.includes(heading),
        `${relativePath} missing ${heading}`,
        errors,
      );
    }
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
    assert(
      new RegExp(`^${key}=`, "m").test(content),
      `env/.env.example missing ${key}`,
      errors,
    );
  }
  assert(
    /ERP_DEBUG_ENV=prod/m.test(content),
    "env/.env.example must set ERP_DEBUG_ENV=prod",
    errors,
  );
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
  assert(
    /ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false/m.test(content),
    "env/.env.example must disable ERP_DEBUG_BUSINESS_CLEAR_ENABLED",
    errors,
  );
}

function validateDeploymentBoundary(repoRoot, packageDir, errors) {
  for (const relativePath of [
    CANONICAL_COMPOSE,
    ...SHARED_SCRIPTS.map((name) => `scripts/deploy/${name}`),
  ]) {
    assert(
      fs.existsSync(path.join(repoRoot, relativePath)),
      `Missing shared deployment source: ${relativePath}`,
      errors,
    );
  }
  for (const relativePath of [
    ...UNUSED_CONFIGURATION_FILES,
    ...SHARED_SCRIPTS.map((name) => `scripts/${name}`),
  ]) {
    assert(
      !fs.existsSync(path.join(packageDir, relativePath)),
      `${relativePath} must not duplicate shared deployment sources; use ${CANONICAL_COMPOSE} and scripts/deploy`,
      errors,
    );
  }
}

function validateCompose(repoRoot, errors) {
  const composePath = path.join(repoRoot, CANONICAL_COMPOSE);
  if (!fs.existsSync(composePath)) {
    return null;
  }
  const documents = readComposeDocuments(
    composePath,
    CANONICAL_COMPOSE,
    errors,
    true,
  );
  const services = documents.length === 1 && documents[0]?.services;
  assert(
    isMapping(services),
    "canonical compose must define a services mapping",
    errors,
  );
  const content = readText(composePath);
  assert(
    /healthcheck:/m.test(content),
    "canonical compose must include healthcheck",
    errors,
  );
  assert(
    /restart:\s+always/m.test(content),
    "canonical compose must include restart policy",
    errors,
  );
  assert(
    /web-desktop:/m.test(content),
    "canonical compose must use single web-desktop entry",
    errors,
  );
  assert(
    !/web-mobile-/m.test(content),
    "canonical compose must not restore old web-mobile services",
    errors,
  );
  return isMapping(services) ? new Set(Object.keys(services)) : null;
}

function validateCustomerCompose(packageDir, canonicalServices, errors) {
  for (const filePath of walkFiles(packageDir)) {
    const relativePath = normalizeRelative(packageDir, filePath);
    const inComposeDirectory = relativePath.startsWith("compose/");
    const yamlOrJson = /\.(?:ya?ml|json)(?:\.example)?$/iu.test(relativePath);
    if (/^(?:evidence|reports)\//u.test(relativePath)) continue;

    const required = yamlOrJson;
    const documents = readComposeDocuments(
      filePath,
      relativePath,
      errors,
      required,
    );
    for (const document of documents) {
      if (!isMapping(document)) {
        if (inComposeDirectory && required && document != null) {
          errors.push(`${relativePath} must contain a Compose mapping`);
        }
        continue;
      }
      const hasServices = Object.hasOwn(document, "services");
      const hasInclude = Object.hasOwn(document, "include");
      if (!hasServices && !hasInclude) continue;

      assert(
        documents.length === 1,
        `${relativePath} must use a single Compose document`,
        errors,
      );
      assert(
        !hasInclude,
        `${relativePath} must not include another deployment definition; combine overrides with ${CANONICAL_COMPOSE}`,
        errors,
      );
      if (!hasServices) continue;
      if (!isMapping(document.services)) {
        errors.push(`${relativePath} services must be an override mapping`);
        continue;
      }
      for (const [serviceName, service] of Object.entries(document.services)) {
        assert(
          !canonicalServices || canonicalServices.has(serviceName),
          `${relativePath} must only override services declared in ${CANONICAL_COMPOSE}: ${serviceName}`,
          errors,
        );
        if (!isMapping(service)) {
          errors.push(
            `${relativePath} service ${serviceName} must be an override mapping`,
          );
          continue;
        }
        const definitions = ["image", "build", "extends", "provider"].filter(
          (key) => Object.hasOwn(service, key),
        );
        assert(
          definitions.length === 0,
          `${relativePath} service ${serviceName} must not define ${definitions.join("/")}; runtime definitions belong to ${CANONICAL_COMPOSE}, images use its env variables`,
          errors,
        );
      }
    }
  }
}

function validateNginxRouting(packageDir, errors) {
  const configPath = path.join(packageDir, "compose/nginx.example.conf");
  if (!fs.existsSync(configPath)) {
    return;
  }
  const content = readText(configPath);
  assert(
    (content.match(/server_name yoyoosun[.]net;/g) || []).length === 2,
    "nginx example must declare HTTP and HTTPS root-domain servers",
    errors,
  );
  assert(
    (
      content.match(
        /return 302 https:\/\/erp[.]yoyoosun[.]net\$request_uri;/g,
      ) || []
    ).length === 2,
    "nginx example root domain must temporarily redirect to erp with 302",
    errors,
  );
  assert(
    (content.match(/server_name erp[.]yoyoosun[.]net;/g) || []).length === 2,
    "nginx example must declare HTTP and HTTPS erp servers",
    errors,
  );
  assert(
    /client_max_body_size\s+300m;/u.test(content),
    "nginx example must allow the 200 MiB attachment upload envelope",
    errors,
  );
  assert(
    !/server_name[^;]*admin[.]yoyoosun[.]net/u.test(content),
    "nginx example must not restore the retired admin route",
    errors,
  );
}

function validateContent(packageDir, errors) {
  for (const file of walkFiles(packageDir)) {
    const relativePath = normalizeRelative(packageDir, file);
    if (
      /\.(json|md|mjs|sh|ya?ml|conf|example)$|\.env\.example$/.test(
        relativePath,
      )
    ) {
      const content = readText(file);
      for (const pattern of SECRET_CONTENT_PATTERNS) {
        assert(
          !pattern.test(content),
          `${relativePath} contains a forbidden secret-like pattern`,
          errors,
        );
      }
    }
  }
}

function validateReleaseEvidenceTemplate(packageDir, errors) {
  const templatePath = path.join(
    packageDir,
    "evidence/releases/release-evidence-template.md",
  );
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  const basicSection = content.match(/## 基本信息[\s\S]*?(?=\n## )/)?.[0] || "";
  for (const field of [
    "customerCode",
    "releaseId",
    "environment",
    "productCommit",
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
    "production-preflight-report.json",
    "image-digests.txt",
    "backup-evidence.md",
    "migration-status-before-apply.txt",
    "migration-status.txt",
    "smoke-test-report.json",
    "backup-restore-report.json",
    "rollback-rehearsal-report.json",
    "command-summary.txt",
  ]) {
    assert(
      content.includes(evidenceFile),
      `release evidence template missing ${evidenceFile}`,
      errors,
    );
  }
  for (const artifactField of [
    "artifacts.backupEvidence",
    "artifacts.preMigrationStatus",
    "artifacts.migrationStatus",
    "artifacts.commandSummary",
  ]) {
    assert(
      content.includes(artifactField),
      `release evidence template missing ${artifactField}`,
      errors,
    );
  }
}

function validateBackupEvidenceTemplate(packageDir, errors) {
  const templatePath = path.join(
    packageDir,
    "evidence/backups/backup-evidence-template.md",
  );
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "backupId",
    "backupTime",
    "backupPurpose",
    "environment",
    "releaseId",
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
  const templatePath = path.join(
    packageDir,
    "evidence/migrations/migration-evidence-template.md",
  );
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "releaseId",
    "productCommit",
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
    assert(
      content.includes(gateLine),
      `migration evidence template missing ${gateLine}`,
      errors,
    );
  }
  assert(
    /不要记录完整 DSN、密码、migration SQL 全文、客户业务数据明细或 raw rows/.test(
      content,
    ),
    "migration evidence template must state DSN, SQL, secret and raw rows redaction boundary",
    errors,
  );
}

function validateReleaseSignoffTemplate(packageDir, errors) {
  const templatePath = path.join(
    packageDir,
    "evidence/releases/release-signoff-checklist-template.md",
  );
  if (!fs.existsSync(templatePath)) {
    return;
  }
  const content = readText(templatePath);
  for (const field of [
    "releaseId",
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
  for (const value of [
    "customer-trial-approved",
    "internal-only",
    "rollback-or-forward-fix",
  ]) {
    assert(
      content.includes(value),
      `release signoff template missing ${value}`,
      errors,
    );
  }
  for (const checklistItem of [
    "pre-migration backup evidence verified",
    "known limitations reviewed",
    "migration status recorded and reviewed",
    "smoke report reviewed",
    "customer-visible scope reviewed",
  ]) {
    assert(
      content.includes(checklistItem),
      `release signoff template missing ${checklistItem}`,
      errors,
    );
  }
  assert(
    /不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图/.test(
      content,
    ),
    "release signoff template must state secret, backup, DSN, raw rows and screenshot redaction boundary",
    errors,
  );
}

function validateRollbackForwardFixPlanTemplate(packageDir, errors) {
  const templatePath = path.join(
    packageDir,
    "evidence/releases/rollback-forward-fix-plan-template.md",
  );
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
  for (const value of [
    "rollback-ready",
    "forward-fix-ready",
    "rollback-or-forward-fix-ready",
  ]) {
    assert(
      content.includes(value),
      `rollback forward-fix template missing ${value}`,
      errors,
    );
  }
  for (const checklistItem of [
    "rollback target identified",
    "forward-fix owner assigned",
    "post-action smoke scope defined",
  ]) {
    assert(
      content.includes(checklistItem),
      `rollback forward-fix template missing ${checklistItem}`,
      errors,
    );
  }
  assert(
    /deployments\/yoyoosun\/runbooks\/03-rollback\.md/.test(content),
    "rollback forward-fix template must point to rollback runbook",
    errors,
  );
  assert(
    /不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图/.test(
      content,
    ),
    "rollback forward-fix template must state secret, backup, DSN, raw rows and screenshot redaction boundary",
    errors,
  );
}

function validateSmokeReportExample(packageDir, errors) {
  const examplePath = path.join(
    packageDir,
    "evidence/smoke/smoke-test-report.example.json",
  );
  if (!fs.existsSync(examplePath)) {
    return;
  }
  let report;
  try {
    report = JSON.parse(readText(examplePath));
  } catch (error) {
    errors.push(
      `smoke test report example must be valid JSON: ${error.message}`,
    );
    return;
  }
  assert(
    report.customerCode === DEFAULT_CUSTOMER,
    `smoke test report example customerCode must be ${DEFAULT_CUSTOMER}`,
    errors,
  );
  for (const field of [
    "environment",
    "productCommit",
    "generatedAt",
    "operatorRole",
    "endpointAlias",
  ]) {
    assert(
      Boolean(String(report[field] ?? "").trim()),
      `smoke test report example missing ${field}`,
      errors,
    );
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
  assert(
    checks.length > 0,
    "smoke test report example checks must not be empty",
    errors,
  );
  assert(
    total === checks.length,
    "smoke test report example summary.total must match checks length",
    errors,
  );
  assert(
    passed === checks.length,
    "smoke test report example summary.passed must match checks length",
    errors,
  );
  assert(
    failed === 0,
    "smoke test report example summary.failed must be 0",
    errors,
  );
  for (const [index, check] of checks.entries()) {
    assert(
      Boolean(String(check?.name ?? "").trim()),
      `smoke test report example checks[${index}].name is missing`,
      errors,
    );
    assert(
      /^(pass|passed|ok)$/i.test(String(check?.status ?? "").trim()),
      `smoke test report example checks[${index}].status must be pass`,
      errors,
    );
    assert(
      Boolean(String(check?.target ?? "").trim()),
      `smoke test report example checks[${index}].target is missing`,
      errors,
    );
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
  assert(
    report.redaction?.containsSecrets === false,
    "smoke test report example must declare containsSecrets=false",
    errors,
  );
  assert(
    report.redaction?.containsRawCustomerRows === false,
    "smoke test report example must declare containsRawCustomerRows=false",
    errors,
  );
}

export function validateDeploymentPackage({
  repoRoot = process.cwd(),
  customer = DEFAULT_CUSTOMER,
} = {}) {
  const packageDir = path.join(repoRoot, "deployments", customer);
  const errors = [];

  assert(
    fs.existsSync(packageDir),
    `deployments/${customer} must exist`,
    errors,
  );

  for (const relativePath of REQUIRED_FILES) {
    assert(
      fs.existsSync(path.join(packageDir, relativePath)),
      `Missing deployments/${customer}/${relativePath}`,
      errors,
    );
  }

  for (const relativePath of findForbiddenFiles(packageDir)) {
    errors.push(`Forbidden file in deployments/${customer}: ${relativePath}`);
  }

  validateEnvExample(packageDir, errors);
  validateDeploymentBoundary(repoRoot, packageDir, errors);
  const canonicalServices = validateCompose(repoRoot, errors);
  validateCustomerCompose(packageDir, canonicalServices, errors);
  validateNginxRouting(packageDir, errors);
  validateRunbookCoverage(packageDir, errors);
  validateContent(packageDir, errors);
  validateReleaseEvidenceTemplate(packageDir, errors);
  validateBackupEvidenceTemplate(packageDir, errors);
  validateMigrationEvidenceTemplate(packageDir, errors);
  validateReleaseSignoffTemplate(packageDir, errors);
  validateRollbackForwardFixPlanTemplate(packageDir, errors);
  validateSmokeReportExample(packageDir, errors);

  if (errors.length > 0) {
    const error = new Error(
      `deployment package lint failed:\n- ${errors.join("\n- ")}`,
    );
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
