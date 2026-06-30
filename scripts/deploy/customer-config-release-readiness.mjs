#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { validateCustomerConfigActivationGate } from "./customer-config-activation-gate.mjs";
import { buildReleaseEvidenceStatus } from "./release-evidence-status.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";

const USAGE = `Customer config release readiness gate

Usage:
  node scripts/deploy/customer-config-release-readiness.mjs \\
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>

With release executor report:
  node scripts/deploy/customer-config-release-readiness.mjs \\
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json

Post-execution evidence check:
  node scripts/deploy/customer-config-release-readiness.mjs ... \\
    --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \\
    --require-executed

Post-activation evidence check:
  node scripts/deploy/customer-config-release-readiness.mjs ... \\
    --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \\
    --require-executed --require-activated

Post-rollback evidence check:
  node scripts/deploy/customer-config-release-readiness.mjs ... \\
    --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \\
    --require-executed --require-rollback

Machine-readable report:
  node scripts/deploy/customer-config-release-readiness.mjs ... --json

This is an evidence aggregation gate. It validates the runtime manifest,
manifest fingerprint evidence, release evidence, activation gate, optional
release executor report, and post-activation target smoke evidence when
--require-activated or --require-rollback is used. It does not call the backend,
activate a revision, run migration, restore backups, import business data, or
write Workflow / Fact runtime state.`;

const READINESS_SCOPE = {
  evidenceOnly: true,
  readyMeaning:
    "runtime manifest, manifest evidence, release evidence, activation gate, and requested executor evidence passed",
  notProvenByThisGate: [
    "target environment release was executed unless --require-executed is used with an executed report",
    "customer config revision was active unless --require-activated is used with executor and target smoke evidence",
    "customer config revision was rolled back unless --require-rollback is used with executor and target smoke evidence",
    "target migration, backup restore, smoke, and rollback rehearsal were performed by this gate",
    "business data import, Workflow fact posting, inventory, shipment, finance, or quality facts were written",
  ],
};

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv) {
  const options = {
    customer: DEFAULT_CUSTOMER,
    json: false,
    requireExecuted: false,
    requireActivated: false,
    requireRollback: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--require-executed") {
      options.requireExecuted = true;
      continue;
    }
    if (token === "--require-activated") {
      options.requireExecuted = true;
      options.requireActivated = true;
      continue;
    }
    if (token === "--require-rollback") {
      options.requireExecuted = true;
      options.requireRollback = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    switch (key) {
      case "manifest":
        options.manifest = value;
        break;
      case "evidence-dir":
        options.evidenceDir = value;
        break;
      case "release-report":
        options.releaseReport = value;
        break;
      case "customer":
        options.customer = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new CliError(
      `Missing required --${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`,
      2,
    );
  }
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new CliError(`${label} must be valid JSON: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new CliError(message);
  }
}

function validateSafeReportFlags(report) {
  assert(report.noRawFileUpload === true, "release report must declare noRawFileUpload=true");
  assert(report.noDirectDatabaseWrite === true, "release report must declare noDirectDatabaseWrite=true");
  assert(report.noSchemaOrMigrationChange === true, "release report must declare noSchemaOrMigrationChange=true");
  assert(report.noBusinessDataImport === true, "release report must declare noBusinessDataImport=true");
  assert(report.noWorkflowFactRuntimeWrite === true, "release report must declare noWorkflowFactRuntimeWrite=true");
}

function requireNonEmptyString(value, message) {
  assert(typeof value === "string" && value.trim().length > 0, message);
  return value.trim();
}

function sortedKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).sort();
}

function validateEffectiveSessionVerification({ report, manifest }) {
  const verification = report.effectiveSessionVerification;
  assert(
    verification && typeof verification === "object" && !Array.isArray(verification),
    "release report must include effectiveSessionVerification after activation or rollback",
  );
  assert(
    verification.status === "verified",
    "effectiveSessionVerification status must be verified",
  );
  assert(
    verification.method === "get_effective_session",
    "effectiveSessionVerification method must be get_effective_session",
  );
  assert(
    verification.customerKey === manifest.customer_key,
    "effectiveSessionVerification customerKey does not match manifest",
  );
  assert(
    verification.configRevision === manifest.revision,
    "effectiveSessionVerification configRevision does not match manifest",
  );
  assert(
    verification.source === "active_customer_config_revision",
    "effectiveSessionVerification source must be active_customer_config_revision",
  );
  assert(
    Number(verification.pageCount) > 0,
    "effectiveSessionVerification pageCount must be positive",
  );
  assert(
    verification.pagesSubsetOfManifest === true,
    "effectiveSessionVerification pagesSubsetOfManifest must be true",
  );
  const expectedFieldPolicySurfaceCount = sortedKeys(manifest.compiled_snapshot?.fieldPolicies).length;
  assert(
    verification.fieldPolicySurfacesMatchManifest === true,
    "effectiveSessionVerification fieldPolicySurfacesMatchManifest must be true",
  );
  assert(
    Number(verification.fieldPolicySurfaceCount) === expectedFieldPolicySurfaceCount,
    "effectiveSessionVerification fieldPolicySurfaceCount does not match manifest",
  );
  return verification;
}

async function validateTargetSmokeEffectiveSession({ repoRoot, evidenceDir, manifest }) {
  const smokePath = path.resolve(repoRoot, evidenceDir, "smoke-test-report.json");
  if (!fs.existsSync(smokePath)) {
    throw new CliError("smoke-test-report.json is required for target smoke verification");
  }
  const smokeReport = await readJson(smokePath, "smoke-test-report.json");
  const backendEndpointAlias = requireNonEmptyString(
    smokeReport.backendEndpointAlias,
    "smoke-test-report.json backendEndpointAlias is required for target effective session verification",
  );
  const checks = Array.isArray(smokeReport.checks) ? smokeReport.checks : [];
  const check = checks.find(
    (item) =>
      item?.name === "customer-config-effective-session" ||
      item?.target === "jsonrpc:customer_config.get_effective_session",
  );
  assert(
    check && typeof check === "object",
    "smoke-test-report.json must include customer-config-effective-session after activation or rollback",
  );
  assert(
    /^(pass|passed|ok)$/i.test(String(check.status ?? "").trim()),
    "customer-config-effective-session smoke check status must be pass",
  );
  assert(
    check.target === "jsonrpc:customer_config.get_effective_session",
    "customer-config-effective-session smoke check target must be jsonrpc:customer_config.get_effective_session",
  );
  assert(
    check.expectedRevision === manifest.revision,
    "customer-config-effective-session expectedRevision does not match manifest",
  );
  assert(
    typeof check.tokenSourceEnv === "string" && check.tokenSourceEnv.trim().length > 0,
    "customer-config-effective-session tokenSourceEnv must be recorded",
  );
  assert(
    check.responseBodyStored === false,
    "customer-config-effective-session responseBodyStored must be false",
  );
  return {
    status: "verified",
    target: check.target,
    expectedRevision: check.expectedRevision,
    backendEndpointAlias,
    tokenSourceEnv: check.tokenSourceEnv,
    responseBodyStored: check.responseBodyStored,
  };
}

function validateReleaseReport({
  report,
  manifest,
  activationGate,
  options,
  repoRoot,
}) {
  assert(
    report.customerKey === manifest.customer_key,
    "release report customerKey does not match manifest",
  );
  assert(
    report.revision === manifest.revision,
    "release report revision does not match manifest",
  );
  assert(
    report.manifestSha256 === activationGate.manifestSha256,
    "release report manifestSha256 does not match current manifest",
  );
  if (options.evidenceDir) {
    assert(
      !report.evidenceDir ||
        path.resolve(repoRoot, report.evidenceDir) ===
          path.resolve(repoRoot, options.evidenceDir),
      "release report evidenceDir must match current evidence dir when present",
    );
  }
  validateSafeReportFlags(report);
  assert(
    Array.isArray(report.operations) && report.operations.length > 0,
    "release report operations must not be empty",
  );
  if (options.requireExecuted) {
    assert(report.executed === true, "release report executed must be true");
    assert(
      Array.isArray(report.results) && report.results.length > 0,
      "release report results must not be empty when execution is required",
    );
    requireNonEmptyString(
      report.backendEndpointAlias,
      "release report backendEndpointAlias is required when execution is required",
    );
  }
  if (options.requireActivated) {
    assert(report.activate === true, "release report activate must be true");
    assert(
      Array.isArray(report.results) &&
        report.results.some(
          (result) =>
            result.method === "activate_customer_config" &&
            result.resultRevision === manifest.revision &&
            result.resultStatus === "active",
        ),
      "release report must include active activate_customer_config result",
    );
    validateEffectiveSessionVerification({ report, manifest });
  }
  if (options.requireRollback) {
    assert(report.rollback === true, "release report rollback must be true");
    assert(
      Array.isArray(report.results) &&
        report.results.some(
          (result) =>
            result.method === "rollback_customer_config" &&
            result.resultRevision === manifest.revision &&
            result.resultStatus === "active",
        ),
      "release report must include active rollback_customer_config result",
    );
    validateEffectiveSessionVerification({ report, manifest });
  }
  return {
    executed: Boolean(report.executed),
    activate: Boolean(report.activate),
    activateOnly: Boolean(report.activateOnly),
    rollback: Boolean(report.rollback),
    operationCount: report.operations.length,
    resultCount: Array.isArray(report.results) ? report.results.length : 0,
    backendEndpointAlias: report.backendEndpointAlias || "",
    effectiveSessionVerified:
      report.effectiveSessionVerification?.status === "verified",
  };
}

export async function validateCustomerConfigReleaseReadiness(
  options,
  runtime = {},
) {
  options = {
    customer: DEFAULT_CUSTOMER,
    requireExecuted: false,
    requireActivated: false,
    requireRollback: false,
    ...options,
  };
  const repoRoot = runtime.repoRoot || process.cwd();
  requireOption(options, "manifest");
  requireOption(options, "evidenceDir");
  if (options.customer !== DEFAULT_CUSTOMER) {
    throw new CliError(`Only ${DEFAULT_CUSTOMER} is supported by this gate today`);
  }
  if (
    options.requireExecuted ||
    options.requireActivated ||
    options.requireRollback
  ) {
    requireOption(options, "releaseReport");
  }

  const manifestPath = path.resolve(repoRoot, options.manifest);
  if (!fs.existsSync(manifestPath)) {
    throw new CliError(`manifest not found: ${options.manifest}`);
  }
  const manifest = await readJson(manifestPath, "manifest");
  validateRuntimeManifest(manifest);

  let activationGate = null;
  try {
    activationGate = validateCustomerConfigActivationGate({
      customer: options.customer,
      manifest: options.manifest,
      evidenceDir: options.evidenceDir,
      repoRoot,
    });
  } catch (error) {
    try {
      error.releaseEvidenceStatus = buildReleaseEvidenceStatus({
        customer: options.customer,
        evidenceDir: options.evidenceDir,
        repoRoot,
      });
    } catch {
      error.releaseEvidenceStatus = null;
    }
    error.scope = READINESS_SCOPE;
    throw error;
  }

  let releaseReport = null;
  let targetSmokeEffectiveSession = null;
  if (options.releaseReport) {
    const releaseReportPath = path.resolve(repoRoot, options.releaseReport);
    if (!fs.existsSync(releaseReportPath)) {
      throw new CliError(`release report not found: ${options.releaseReport}`);
    }
    releaseReport = validateReleaseReport({
      report: await readJson(releaseReportPath, "release report"),
      manifest,
      activationGate,
      options,
      repoRoot,
    });
  }
  if (options.requireActivated || options.requireRollback) {
    targetSmokeEffectiveSession = await validateTargetSmokeEffectiveSession({
      repoRoot,
      evidenceDir: options.evidenceDir,
      manifest,
    });
    assert(
      releaseReport?.backendEndpointAlias === targetSmokeEffectiveSession.backendEndpointAlias,
      "release report backendEndpointAlias must match target smoke backendEndpointAlias",
    );
  }

  return {
    customer: options.customer,
    revision: manifest.revision,
    manifest: manifestPath,
    manifestSha256: activationGate.manifestSha256,
    evidenceDir: activationGate.evidenceDir,
    manifestEvidence: {
      reviewStatus: activationGate.manifestEvidence?.reviewStatus,
      reviewer: activationGate.manifestEvidence?.reviewer || "",
      redaction: activationGate.manifestEvidence?.redaction || {},
    },
    releaseReport,
    targetSmokeEffectiveSession,
    requireExecuted: Boolean(options.requireExecuted),
    requireActivated: Boolean(options.requireActivated),
    requireRollback: Boolean(options.requireRollback),
    backendTouched: false,
    workflowFactRuntimeTouched: false,
    scope: READINESS_SCOPE,
  };
}

function formatText(result) {
  const lines = [
    `customer config release readiness ok: customer=${result.customer}, revision=${result.revision}, manifestSha256=${result.manifestSha256}, evidenceDir=${result.evidenceDir}`,
    `ready means: ${result.scope.readyMeaning}`,
    "not proven by this gate:",
  ];
  for (const item of result.scope.notProvenByThisGate) {
    lines.push(`- ${item}`);
  }
  if (result.releaseReport) {
    lines.push(
      `release report: executed=${result.releaseReport.executed}, activate=${result.releaseReport.activate}, rollback=${result.releaseReport.rollback}, operationCount=${result.releaseReport.operationCount}, resultCount=${result.releaseReport.resultCount}`,
    );
  }
  if (result.targetSmokeEffectiveSession) {
    lines.push(
      `target smoke effective session: status=${result.targetSmokeEffectiveSession.status}, expectedRevision=${result.targetSmokeEffectiveSession.expectedRevision}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  let result = null;
  try {
    result = await validateCustomerConfigReleaseReadiness(options);
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: error.message,
            errors: Array.isArray(error.errors) ? error.errors : [error.message],
            releaseEvidenceStatus: error.releaseEvidenceStatus || null,
            scope: error.scope || READINESS_SCOPE,
          },
          null,
          2,
        ),
      );
      return 1;
    }
    throw error;
  }
  if (options.json) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } else {
    process.stdout.write(formatText(result));
  }
  return 0;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exitCode = error.exitCode;
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
}

export { CliError, DEFAULT_CUSTOMER, READINESS_SCOPE, USAGE };
