#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const EVIDENCE_FILE = "customer-config-manifest-evidence.json";
const REVIEW_STATUS = "approved";

const USAGE = `Customer config manifest evidence generator

Usage:
  node scripts/deploy/customer-config-manifest-evidence.mjs \\
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    --reviewer <reviewer-name>

With release executor report cross-check:
  node scripts/deploy/customer-config-manifest-evidence.mjs \\
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \\
    --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    --reviewer <reviewer-name>

This writes customer-config-manifest-evidence.json into an existing release
evidence directory. It validates the manifest shape, computes its sha256, and
records a sanitized approval record. It does not call the backend, upload raw
customer files, run migration, import business data, or write Workflow / Fact
runtime state.`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv) {
  const options = { customer: DEFAULT_CUSTOMER, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
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
      case "reviewer":
        options.reviewer = value;
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function assertMeaningful(value, message) {
  if (!String(value || "").trim()) {
    throw new CliError(message, 2);
  }
}

function validateReleaseReport(report, manifest, manifestSha256) {
  if (report.customerKey !== manifest.customer_key) {
    throw new CliError("release report customerKey does not match manifest");
  }
  if (report.revision !== manifest.revision) {
    throw new CliError("release report revision does not match manifest");
  }
  if (report.manifestSha256 !== manifestSha256) {
    throw new CliError("release report manifestSha256 does not match manifest");
  }
}

export async function buildCustomerConfigManifestEvidence(options, runtime = {}) {
  const repoRoot = runtime.repoRoot || process.cwd();
  requireOption(options, "manifest");
  requireOption(options, "evidenceDir");
  requireOption(options, "reviewer");
  assertMeaningful(options.reviewer, "--reviewer must not be empty");
  if ((options.customer || DEFAULT_CUSTOMER) !== DEFAULT_CUSTOMER) {
    throw new CliError(`Only ${DEFAULT_CUSTOMER} is supported by this evidence generator today`);
  }

  const evidenceDir = path.resolve(repoRoot, options.evidenceDir);
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    throw new CliError(`evidence dir must already exist: ${options.evidenceDir}`);
  }

  const manifestPath = path.resolve(repoRoot, options.manifest);
  if (!fs.existsSync(manifestPath)) {
    throw new CliError(`manifest not found: ${options.manifest}`);
  }
  const manifest = await readJson(manifestPath);
  validateRuntimeManifest(manifest);
  const manifestSha256 = `sha256:${sha256File(manifestPath)}`;

  let releaseReportPath = "";
  if (options.releaseReport) {
    releaseReportPath = path.resolve(repoRoot, options.releaseReport);
    if (!fs.existsSync(releaseReportPath)) {
      throw new CliError(`release report not found: ${options.releaseReport}`);
    }
    validateReleaseReport(await readJson(releaseReportPath), manifest, manifestSha256);
  }

  return {
    customerKey: manifest.customer_key,
    revision: manifest.revision,
    productVersion: manifest.product_version,
    manifestSha256,
    manifestPath,
    releaseReport: releaseReportPath,
    reviewStatus: REVIEW_STATUS,
    reviewer: String(options.reviewer).trim(),
    generatedAt: new Date().toISOString(),
    redaction: {
      containsSecrets: false,
      containsRawCustomerRows: false,
      containsRawCustomerFiles: false,
    },
    noRawFileUpload: true,
    noDirectDatabaseWrite: true,
    noBusinessDataImport: true,
    noWorkflowFactRuntimeWrite: true,
  };
}

export async function writeCustomerConfigManifestEvidence(options, runtime = {}) {
  const repoRoot = runtime.repoRoot || process.cwd();
  const evidence = await buildCustomerConfigManifestEvidence(options, runtime);
  const evidencePath = path.join(
    path.resolve(repoRoot, options.evidenceDir),
    EVIDENCE_FILE,
  );
  await writeJson(evidencePath, evidence);
  return {
    evidence,
    evidencePath,
  };
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const result = await writeCustomerConfigManifestEvidence(options);
  console.log(`customer config manifest evidence: ${result.evidencePath}`);
  console.log(`revision: ${result.evidence.revision}`);
  console.log(`manifestSha256: ${result.evidence.manifestSha256}`);
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

export { CliError, EVIDENCE_FILE, REVIEW_STATUS, USAGE };
