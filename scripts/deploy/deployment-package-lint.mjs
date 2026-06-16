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
  "evidence/migrations/migration-evidence-template.md",
  "evidence/backups/backup-evidence-template.md",
  "evidence/smoke/smoke-test-report.example.json",
  "reports/README.md",
  "scripts/README.md",
  "scripts/verify-env.sh",
  "scripts/run-smoke.sh",
  "scripts/collect-evidence.sh",
  "scripts/verify-backup-restore.sh",
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
