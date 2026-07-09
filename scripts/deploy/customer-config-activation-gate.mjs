#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeManifest } from "../qa/customer-config-runtime-manifest.mjs";
import { validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";
import { buildReleaseEvidenceStatus } from "./release-evidence-status.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const MANIFEST_EVIDENCE_FILE = "customer-config-manifest-evidence.json";
export const ACTIVATION_GATE_SCOPE = {
  evidenceOnly: true,
  readyMeaning:
    "runtime manifest, manifest evidence, and release evidence passed before customer config activation",
  notProvenByThisGate: [
    "customer config revision was activated",
    "target environment release was executed",
    "target migration, backup restore, smoke, and rollback rehearsal were performed by this gate",
    "business data import, Workflow fact posting, inventory, shipment, finance, or quality facts were written",
  ],
};

function parseArgs(argv) {
  const options = { customer: DEFAULT_CUSTOMER };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      options.customer = argv[index + 1];
      index += 1;
    } else if (arg === "--manifest") {
      options.manifest = argv[index + 1];
      index += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = argv[index + 1];
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/deploy/customer-config-activation-gate.mjs \\
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    [--customer yoyoosun] \\
    [--json]

Purpose:
  Validate customer config activation prerequisites before a compiled revision is
  activated for trial or delivery. This checks both the runtime manifest shape
  and the filled release evidence directory, including
  customer-config-manifest-evidence.json binding the evidence to the manifest
  sha256. It does not call the backend, activate a revision, run migration,
  restore backups, or import business data.`);
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function readJson(filePath, label, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label} must be valid JSON: ${error.message}`);
    return null;
  }
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function validateManifestEvidence({
  evidenceDir,
  manifestPayload,
  manifestSha256,
  customer,
  errors,
}) {
  const evidencePath = path.join(evidenceDir, MANIFEST_EVIDENCE_FILE);
  assert(
    fs.existsSync(evidencePath),
    `Missing ${MANIFEST_EVIDENCE_FILE}`,
    errors,
  );
  if (!fs.existsSync(evidencePath)) {
    return null;
  }
  const evidence = readJson(evidencePath, MANIFEST_EVIDENCE_FILE, errors);
  if (!evidence) {
    return null;
  }
  assert(evidence.customerKey === customer, `${MANIFEST_EVIDENCE_FILE} customerKey must be ${customer}`, errors);
  assert(
    evidence.revision === manifestPayload.revision,
    `${MANIFEST_EVIDENCE_FILE} revision must match manifest revision`,
    errors,
  );
  assert(
    evidence.manifestSha256 === `sha256:${manifestSha256}`,
    `${MANIFEST_EVIDENCE_FILE} manifestSha256 must match current manifest`,
    errors,
  );
  assert(
    evidence.reviewStatus === "approved",
    `${MANIFEST_EVIDENCE_FILE} reviewStatus must be approved`,
    errors,
  );
  assert(
    evidence.redaction?.containsSecrets === false,
    `${MANIFEST_EVIDENCE_FILE} must declare containsSecrets=false`,
    errors,
  );
  assert(
    evidence.redaction?.containsRawCustomerRows === false,
    `${MANIFEST_EVIDENCE_FILE} must declare containsRawCustomerRows=false`,
    errors,
  );
  assert(
    evidence.redaction?.containsRawCustomerFiles === false,
    `${MANIFEST_EVIDENCE_FILE} must declare containsRawCustomerFiles=false`,
    errors,
  );
  return evidence;
}

export function validateCustomerConfigActivationGate({
  customer = DEFAULT_CUSTOMER,
  manifest,
  evidenceDir,
  repoRoot = process.cwd(),
} = {}) {
  const errors = [];
  assert(customer === DEFAULT_CUSTOMER, `Only ${DEFAULT_CUSTOMER} is supported by this gate today`, errors);
  assert(Boolean(manifest), "--manifest is required", errors);
  assert(Boolean(evidenceDir), "--evidence-dir is required", errors);

  const absoluteManifest = manifest ? path.resolve(repoRoot, manifest) : "";
  assert(Boolean(absoluteManifest) && fs.existsSync(absoluteManifest), `manifest not found: ${manifest}`, errors);

  let manifestPayload = null;
  let manifestSha256 = "";
  if (errors.length === 0) {
    manifestPayload = readJson(absoluteManifest, "manifest", errors);
    manifestSha256 = sha256File(absoluteManifest);
  }

  if (manifestPayload) {
    try {
      validateRuntimeManifest(manifestPayload);
    } catch (error) {
      errors.push(error.message);
    }
    assert(
      manifestPayload.customer_key === customer,
      `manifest customer_key must match customer ${customer}`,
      errors,
    );
    assert(
      manifestPayload.revision === "yoyoosun-customer-package-v4.runtime-manifest-v1",
      "manifest revision must be yoyoosun-customer-package-v4.runtime-manifest-v1",
      errors,
    );
  }

  let releaseGateResult = null;
  const absoluteEvidenceDir = evidenceDir ? path.resolve(repoRoot, evidenceDir) : "";
  if (evidenceDir) {
    try {
      releaseGateResult = validateReleaseEvidenceGate({
        customer,
        evidenceDir,
        repoRoot,
      });
    } catch (error) {
      if (Array.isArray(error.errors)) {
        errors.push(...error.errors);
      } else {
        errors.push(error.message);
      }
    }
  }
  let manifestEvidence = null;
  if (manifestPayload && absoluteEvidenceDir && fs.existsSync(absoluteEvidenceDir)) {
    manifestEvidence = validateManifestEvidence({
      evidenceDir: absoluteEvidenceDir,
      manifestPayload,
      manifestSha256,
      customer,
      errors,
    });
  }

  if (errors.length > 0) {
    const error = new Error(`customer config activation gate failed:\n- ${errors.join("\n- ")}`);
    error.errors = errors;
    error.scope = ACTIVATION_GATE_SCOPE;
    if (evidenceDir) {
      try {
        error.releaseEvidenceStatus = buildReleaseEvidenceStatus({
          customer,
          evidenceDir,
          repoRoot,
        });
      } catch (statusError) {
        error.releaseEvidenceStatus = {
          status: "unavailable",
          ready: false,
          errors: [statusError.message],
        };
      }
    }
    throw error;
  }

  return {
    customer,
    manifest: absoluteManifest,
    manifestSha256: `sha256:${manifestSha256}`,
    manifestEvidence,
    revision: manifestPayload.revision,
    evidenceDir: releaseGateResult.evidenceDir,
    scope: ACTIVATION_GATE_SCOPE,
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
    const result = validateCustomerConfigActivationGate(options);
    if (options.json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      process.exit(0);
    }
    console.log(
      `customer config activation gate ok: customer=${result.customer}, revision=${result.revision}, manifestSha256=${result.manifestSha256}, evidenceDir=${result.evidenceDir}`,
    );
  } catch (error) {
    if (error?.json || process.argv.includes("--json")) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: error.message,
            errors: error.errors ?? [error.message],
            releaseEvidenceStatus: error.releaseEvidenceStatus ?? null,
            scope: error.scope ?? ACTIVATION_GATE_SCOPE,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    console.error(`[customer-config-activation-gate] ${error.message}`);
    process.exit(1);
  }
}
