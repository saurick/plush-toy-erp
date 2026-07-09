#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CUSTOMER = "yoyoosun";
const DEFAULT_RUNBOOK = "deployments/yoyoosun/runbooks/03-rollback.md";
const VALID_REHEARSAL_TYPES = new Set(["rollback", "forward-fix", "rollback-forward-fix"]);
const PASS_STATUSES = new Set(["pass", "passed", "ok"]);
const PLACEHOLDER_PATTERN = /^(|待填写|todo|tbd|n\/a|unknown|replace.*|<.*>|-+)$/i;

function parseArgs(argv) {
  const options = {
    customer: DEFAULT_CUSTOMER,
    rollbackRunbook: DEFAULT_RUNBOOK,
    evidenceReviewStatus: "passed",
    steps: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      options.customer = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--environment") {
      options.environment = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--release-version") {
      options.releaseVersion = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--rehearsal-type") {
      options.rehearsalType = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--trigger-scenario") {
      options.triggerScenario = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--rollback-target-release") {
      options.rollbackTargetRelease = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--rollback-runbook") {
      options.rollbackRunbook = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--step") {
      options.steps.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--post-smoke-report") {
      options.postSmokeReport = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--customer-config-revision") {
      options.customerConfigRevision = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--evidence-review-status") {
      options.evidenceReviewStatus = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (options.evidenceDir && !options.out) {
    options.out = path.join(options.evidenceDir, "rollback-rehearsal-report.json");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/deploy/rollback-rehearsal-report.mjs \\
    --environment customer-trial \\
    --release-version 20260629T1200 \\
    --rehearsal-type rollback-forward-fix \\
    --trigger-scenario "smoke failed after activation" \\
    --rollback-target-release previous-stable-release \\
    --step "identify rollback target=pass" \\
    --step "verify rollback command path=pass" \\
    --step "verify forward-fix owner path=pass" \\
    --post-smoke-report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json \\
    --customer-config-revision yoyoosun-customer-package-v4.runtime-manifest-v1 \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>

Purpose:
  Build a sanitized rollback-rehearsal-report.json from actual rehearsal steps and a non-empty passing post-smoke report.
  This script does not execute rollback, restore backups, run migrations, or call the backend.`);
}

function isMeaningful(value) {
  const normalized = String(value ?? "").trim();
  if (/待填写|todo|tbd|replace-|<[^>]+>/i.test(normalized)) {
    return false;
  }
  return !PLACEHOLDER_PATTERN.test(normalized);
}

function isPassStatus(value) {
  return PASS_STATUSES.has(String(value ?? "").trim().toLowerCase());
}

function hasSecretLikeValue(value) {
  const normalized = String(value ?? "");
  return (
    /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(normalized) ||
    /AKIA[0-9A-Z]{16}/.test(normalized) ||
    /ghp_[A-Za-z0-9_]{30,}/.test(normalized) ||
    /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i.test(normalized)
  );
}

function parseStep(rawStep) {
  const value = String(rawStep ?? "");
  const separatorIndex = value.lastIndexOf("=");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`Invalid --step format: ${value}. Expected "name=pass"`);
  }
  return {
    name: value.slice(0, separatorIndex).trim(),
    status: value.slice(separatorIndex + 1).trim(),
  };
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`);
  }
}

function resolvePostSmokeReportPath(options) {
  const smokeReportPath = String(options.postSmokeReport ?? "").trim();
  if (path.isAbsolute(smokeReportPath)) {
    throw new Error("postSmokeReport must be a relative path");
  }
  if (path.basename(smokeReportPath) !== "smoke-test-report.json") {
    throw new Error("postSmokeReport must point to smoke-test-report.json");
  }

  const outDir = path.dirname(path.resolve(options.out));
  const expectedPath = path.join(outDir, "smoke-test-report.json");
  const cwdResolvedPath = path.resolve(smokeReportPath);
  const outDirResolvedPath = path.resolve(outDir, smokeReportPath);

  if (cwdResolvedPath === expectedPath) {
    return cwdResolvedPath;
  }
  if (outDirResolvedPath === expectedPath) {
    return outDirResolvedPath;
  }

  throw new Error("postSmokeReport must point to smoke-test-report.json in the same output directory");
}

function validateSmokeReport(smokeReport, smokeReportPath, options = {}) {
  if (smokeReport.customerCode && smokeReport.customerCode !== DEFAULT_CUSTOMER) {
    throw new Error(`post smoke report customerCode must be ${DEFAULT_CUSTOMER}`);
  }
  const checks = Array.isArray(smokeReport.checks) ? smokeReport.checks : [];
  if (checks.length === 0) {
    throw new Error("post smoke report checks must not be empty");
  }
  for (const [index, check] of checks.entries()) {
    if (!isMeaningful(check?.name)) {
      throw new Error(`post smoke report checks[${index}].name is missing`);
    }
    const target = String(check?.target ?? "").trim();
    if (!isMeaningful(target)) {
      throw new Error(`post smoke report checks[${index}].target is missing`);
    }
    if (/^(https?:\/\/|\/)/i.test(target) && !/^[1-5]\d{2}$/.test(String(check?.httpCode ?? "").trim())) {
      throw new Error(`post smoke report checks[${index}].httpCode must be a 100-599 HTTP status for URL targets`);
    }
    if (!isPassStatus(check?.status)) {
      throw new Error(`post smoke report checks[${index}].status must be pass`);
    }
  }
  if (Number(smokeReport.summary?.total) !== checks.length) {
    throw new Error("post smoke report summary.total must equal checks length");
  }
  if (Number(smokeReport.summary?.passed) !== checks.length) {
    throw new Error("post smoke report summary.passed must equal checks length");
  }
  if (Number(smokeReport.summary?.failed) !== 0) {
    throw new Error("post smoke report summary.failed must be 0");
  }
  if (smokeReport.redaction?.containsSecrets !== false) {
    throw new Error("post smoke report must declare containsSecrets=false");
  }
  if (smokeReport.redaction?.containsRawCustomerRows !== false) {
    throw new Error("post smoke report must declare containsRawCustomerRows=false");
  }
  if (hasSecretLikeValue(JSON.stringify(smokeReport))) {
    throw new Error(`post smoke report contains secret-like value: ${smokeReportPath}`);
  }
  if (isMeaningful(options.customerConfigRevision)) {
    const check = checks.find(
      (item) =>
        item?.name === "customer-config-effective-session" ||
        item?.target === "jsonrpc:customer_config.get_effective_session",
    );
    if (!check) {
      throw new Error("post smoke report must include customer-config-effective-session when customerConfigRevision is provided");
    }
    if (check.target !== "jsonrpc:customer_config.get_effective_session") {
      throw new Error("customer-config-effective-session target must be jsonrpc:customer_config.get_effective_session");
    }
    if (check.expectedRevision !== options.customerConfigRevision) {
      throw new Error("customer-config-effective-session expectedRevision must match customerConfigRevision");
    }
    if (!isMeaningful(check.tokenSourceEnv)) {
      throw new Error("customer-config-effective-session tokenSourceEnv must be recorded");
    }
    if (check.responseBodyStored !== false) {
      throw new Error("customer-config-effective-session responseBodyStored must be false");
    }
  }
}

function buildReport(options, now = new Date()) {
  const requiredFields = [
    "customer",
    "environment",
    "releaseVersion",
    "rehearsalType",
    "triggerScenario",
    "rollbackTargetRelease",
    "rollbackRunbook",
    "postSmokeReport",
    "out",
  ];
  for (const field of requiredFields) {
    if (!isMeaningful(options[field])) {
      throw new Error(`${field} is required and must not be a placeholder`);
    }
    if (hasSecretLikeValue(options[field])) {
      throw new Error(`${field} must not contain secrets or full DSN`);
    }
  }
  if (options.customer !== DEFAULT_CUSTOMER) {
    throw new Error(`customer must be ${DEFAULT_CUSTOMER}`);
  }
  if (!VALID_REHEARSAL_TYPES.has(String(options.rehearsalType).toLowerCase())) {
    throw new Error(`rehearsalType must be one of: ${[...VALID_REHEARSAL_TYPES].join(", ")}`);
  }
  if (options.customerConfigRevision !== undefined && !isMeaningful(options.customerConfigRevision)) {
    throw new Error("customerConfigRevision must be provided and must not be a placeholder");
  }

  const steps = options.steps.map(parseStep);
  if (steps.length === 0) {
    throw new Error("at least one --step is required");
  }
  for (const [index, step] of steps.entries()) {
    if (!isMeaningful(step.name)) {
      throw new Error(`steps[${index}].name is missing or placeholder`);
    }
    if (!isPassStatus(step.status)) {
      throw new Error(`steps[${index}].status must be pass`);
    }
  }

  const resolvedSmokeReportPath = resolvePostSmokeReportPath(options);
  const smokeReport = loadJson(resolvedSmokeReportPath);
  validateSmokeReport(smokeReport, resolvedSmokeReportPath, {
    customerConfigRevision: options.customerConfigRevision,
  });

  return {
    customerCode: DEFAULT_CUSTOMER,
    environment: options.environment,
    releaseVersion: options.releaseVersion,
    rehearsedAt: now.toISOString(),
    rehearsalType: String(options.rehearsalType).toLowerCase(),
    triggerScenario: options.triggerScenario,
    rollbackTargetRelease: options.rollbackTargetRelease,
    rollbackRunbook: options.rollbackRunbook,
    steps,
    postCheck: {
      smokeStatus: "passed",
      smokeReport: options.postSmokeReport,
      smokeCheckCount: smokeReport.checks.length,
      evidenceReviewStatus: options.evidenceReviewStatus,
      customerConfigEffectiveSession:
        isMeaningful(options.customerConfigRevision)
          ? {
              status: "verified",
              expectedRevision: options.customerConfigRevision,
              target: "jsonrpc:customer_config.get_effective_session",
            }
          : null,
    },
    summary: {
      rehearsalCompleted: true,
      rollbackPathStatus: "passed",
    },
    redaction: {
      containsSecrets: false,
      containsRawCustomerRows: false,
      containsFullDsn: false,
    },
  };
}

function writeReport(report, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    if (options.evidenceDir && !fs.existsSync(options.evidenceDir)) {
      throw new Error(`evidenceDir must already exist: ${options.evidenceDir}`);
    }
    const report = buildReport(options);
    writeReport(report, options.out);
    console.log(`[rollback-rehearsal-report] report: ${options.out}`);
  } catch (error) {
    console.error(`[rollback-rehearsal-report] ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  buildReport,
  parseArgs,
  parseStep,
  validateSmokeReport,
};
