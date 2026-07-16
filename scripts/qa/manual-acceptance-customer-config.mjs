#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  LOCAL_DEV_TARGET,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceTargetAttestation,
  manualAcceptanceTargetConfirmation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { buildRuntimePreviewManifest } from "./customer-config-runtime-manifest.mjs";
import { buildLocalTestApplyRuntimeManifest } from "./customer-config-runtime-manifest.mjs";

export const CUSTOMER_CONFIG_DATA_VERSION =
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION;
export const CUSTOMER_CONFIG_RUN_ID = CURRENT_MANUAL_ACCEPTANCE_RUN_ID;
export const CUSTOMER_CONFIG_CUSTOMER_KEY = "yoyoosun";
export const CUSTOMER_CONFIG_PRODUCT_VERSION =
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION;
export const CUSTOMER_CONFIG_REVISION = CUSTOMER_TRIAL_133_CONFIG_REVISION;
export const CUSTOMER_CONFIG_APPLY_PURPOSE =
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE;
export const DEFAULT_PREVIEW_MANIFEST =
  "output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json";
export const DEFAULT_OUT_DIR =
  "output/qa/manual-acceptance-dataset/customer-config";

const CUSTOMER_CONFIG_HASH_VERSION = 1;
const TRIAL_MANIFEST_FILE = "customer-trial-133-manifest.json";
const REPORT_FILE = "customer-trial-133-report.json";
const FORMAL_RELEASE_CREDENTIAL_KEYS = Object.freeze([
  "CUSTOMER_CONFIG_ADMIN_TOKEN",
  "CUSTOMER_CONFIG_ADMIN_USERNAME",
  "CUSTOMER_CONFIG_ADMIN_PASSWORD",
  "CUSTOMER_CONFIG_VERIFY_TOKEN",
]);

export const CUSTOMER_CONFIG_USAGE = `manual-acceptance customer-config helper

Report only (default; no network call):
  node scripts/qa/manual-acceptance-customer-config.mjs

Apply through the registered SSH tunnel and the standard JSON-RPC boundary:
  MANUAL_ACCEPTANCE_TARGET_CONFIRM='<exact target confirmation>' \\
  MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON='<target attestation JSON>' \\
  MANUAL_ACCEPTANCE_ADMIN_USERNAME='admin' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<independent admin password>' \\
  MANUAL_ACCEPTANCE_PASSWORD='<different demo-role password>' \\
    node scripts/qa/manual-acceptance-customer-config.mjs --apply

Options:
  --apply                    Execute validate, publish, transition check, activate and readback.
  --preview-manifest <path>  Preview-only yoyoosun runtime manifest source.
  --out <dir>                Report directory outside deployments evidence.
  --backend-url <url>        Dedicated local backend or registered customer-trial-133 SSH tunnel.
  --target <target>          local-dev or customer-trial-133.
  --database-name <name>     Exact fresh acceptance database identity.
  --data-version <version>   Must be ${CUSTOMER_CONFIG_DATA_VERSION}.
  --run-id <id>              Must be ${CUSTOMER_CONFIG_RUN_ID}.
  --help                     Print this help.

This is a simulated local/trial configuration path. It does not use formal
release evidence, the formal release executor, direct database writes, or
Workflow / Fact writes, and it never proves release readiness.`;

export class ManualAcceptanceCustomerConfigError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "ManualAcceptanceCustomerConfigError";
    this.exitCode = exitCode;
  }
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function requiredText(value, name) {
  const text = optionalText(value);
  if (!text) {
    throw new ManualAcceptanceCustomerConfigError(`${name} is required`, 2);
  }
  return text;
}

function requireExact(value, expected, name) {
  if (value !== expected) {
    throw new ManualAcceptanceCustomerConfigError(
      `${name} must be ${expected}`,
      2,
    );
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalJSON(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJSON(item)).join(",")}]`;
  }
  if (Boolean(value) && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function currentYoyoosunPreviewManifest() {
  return buildRuntimePreviewManifest(yoyoosunCustomerPackage);
}

function relativeRepoPath(repoRoot, absolutePath, name) {
  const relative = path.relative(repoRoot, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ManualAcceptanceCustomerConfigError(
      `${name} must stay inside the repository`,
      2,
    );
  }
  return relative.split(path.sep).join("/");
}

function resolveRepoPath(repoRoot, value, name) {
  return path.resolve(repoRoot, requiredText(value, name));
}

function assertNotDeploymentEvidence(repoRoot, absolutePath, name) {
  const deploymentsRoot = path.resolve(repoRoot, "deployments");
  if (
    absolutePath === deploymentsRoot ||
    absolutePath.startsWith(`${deploymentsRoot}${path.sep}`)
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      `${name} must not use deployments or formal release evidence paths`,
      2,
    );
  }
}

export function parseManualAcceptanceCustomerConfigArgs(argv) {
  const options = {
    apply: false,
    help: false,
    previewManifest: DEFAULT_PREVIEW_MANIFEST,
    out: DEFAULT_OUT_DIR,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    target: CUSTOMER_TRIAL_133_TARGET,
    databaseName: CUSTOMER_TRIAL_133_DATABASE,
    dataVersion: CUSTOMER_CONFIG_DATA_VERSION,
    runId: CUSTOMER_CONFIG_RUN_ID,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new ManualAcceptanceCustomerConfigError(
        `unexpected argument ${token}`,
        2,
      );
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || String(value).startsWith("--")) {
      throw new ManualAcceptanceCustomerConfigError(
        `missing value for --${key}`,
        2,
      );
    }
    switch (key) {
      case "preview-manifest":
        options.previewManifest = value;
        break;
      case "out":
        options.out = value;
        break;
      case "backend-url":
        options.backendURL = value;
        break;
      case "target":
        options.target = value;
        break;
      case "database-name":
        options.databaseName = value;
        break;
      case "data-version":
        options.dataVersion = value;
        break;
      case "run-id":
        options.runId = value;
        break;
      default:
        throw new ManualAcceptanceCustomerConfigError(
          `unknown option --${key}`,
          2,
        );
    }
  }
  return options;
}

function assertPreviewManifest(preview) {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
    throw new ManualAcceptanceCustomerConfigError(
      "preview manifest must be an object",
      2,
    );
  }
  if (
    preview.customer_key !== CUSTOMER_CONFIG_CUSTOMER_KEY ||
    preview.compiled_snapshot?.customer?.key !== CUSTOMER_CONFIG_CUSTOMER_KEY
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "preview manifest must belong to yoyoosun",
      2,
    );
  }
  if (
    preview.manifest_status !== "preview_only" ||
    preview.publishable !== false ||
    preview.runtime_enabled !== false ||
    preview.compiled_snapshot?.package?.status === "release_ready"
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "source must remain a preview-only, non-release-ready manifest",
      2,
    );
  }
  if (
    !preview.compiled_snapshot ||
    typeof preview.compiled_snapshot !== "object" ||
    Array.isArray(preview.compiled_snapshot) ||
    !Array.isArray(preview.compiled_snapshot.pages) ||
    preview.compiled_snapshot.pages.length === 0
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "preview manifest compiled_snapshot/pages are required",
      2,
    );
  }
  for (const key of [
    "module_states",
    "role_profiles",
    "access_entitlements",
    "work_pools",
    "work_pool_memberships",
  ]) {
    if (!Array.isArray(preview[key]) || preview[key].length === 0) {
      throw new ManualAcceptanceCustomerConfigError(
        `preview manifest ${key} must not be empty`,
        2,
      );
    }
  }
  for (const key of ["applyPurpose", "datasetVersion", "target"]) {
    if (Object.hasOwn(preview.compiled_snapshot, key)) {
      throw new ManualAcceptanceCustomerConfigError(
        `preview manifest must not already contain trial marker ${key}`,
        2,
      );
    }
  }
  const expected = currentYoyoosunPreviewManifest();
  if (sha256(canonicalJSON(preview)) !== sha256(canonicalJSON(expected))) {
    throw new ManualAcceptanceCustomerConfigError(
      "preview manifest must exactly match the current tracked yoyoosun runtime projection",
      2,
    );
  }
}

export function buildCustomerTrial133Manifest(
  preview,
  {
    target = CUSTOMER_TRIAL_133_TARGET,
    dataVersion = CUSTOMER_CONFIG_DATA_VERSION,
    runId = CUSTOMER_CONFIG_RUN_ID,
  } = {},
) {
  requireExact(target, CUSTOMER_TRIAL_133_TARGET, "target");
  requireExact(dataVersion, CUSTOMER_CONFIG_DATA_VERSION, "dataVersion");
  requireExact(runId, CUSTOMER_CONFIG_RUN_ID, "runId");
  assertPreviewManifest(preview);
  const manifest = structuredClone(preview);
  manifest.manifest_status = "runtime_compile_ready";
  manifest.runtime_enabled = true;
  manifest.publishable = true;
  manifest.revision = CUSTOMER_CONFIG_REVISION;
  manifest.product_version = CUSTOMER_CONFIG_PRODUCT_VERSION;
  manifest.compiled_snapshot = {
    ...manifest.compiled_snapshot,
    applyPurpose: CUSTOMER_CONFIG_APPLY_PURPOSE,
    datasetVersion: CUSTOMER_CONFIG_DATA_VERSION,
    target: CUSTOMER_TRIAL_133_TARGET,
  };
  return manifest;
}

export function buildLocalManualAcceptanceManifest(preview) {
  assertPreviewManifest(preview);
  const manifest = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);
  if (
    manifest.revision !== LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION ||
    manifest.product_version !==
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION ||
    manifest.compiled_snapshot?.applyPurpose !==
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE ||
    manifest.compiled_snapshot?.datasetVersion !== undefined ||
    manifest.compiled_snapshot?.target !== undefined
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "local-test manifest does not match the current registered acceptance identity",
      2,
    );
  }
  return manifest;
}

function assertCurrentCustomerTrialManifestIdentity(manifest) {
  if (
    manifest?.customer_key !== CUSTOMER_CONFIG_CUSTOMER_KEY ||
    manifest?.revision !== CUSTOMER_CONFIG_REVISION ||
    manifest?.product_version !== CUSTOMER_CONFIG_PRODUCT_VERSION ||
    manifest?.compiled_snapshot?.applyPurpose !==
      CUSTOMER_CONFIG_APPLY_PURPOSE ||
    manifest?.compiled_snapshot?.datasetVersion !==
      CUSTOMER_CONFIG_DATA_VERSION ||
    manifest?.compiled_snapshot?.target !== CUSTOMER_TRIAL_133_TARGET
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "customer-trial-133 manifest must match the current registered v5 identity",
      2,
    );
  }
}

function assertCurrentManualAcceptanceManifestIdentity(manifest, policy) {
  if (policy.target === CUSTOMER_TRIAL_133_TARGET) {
    assertCurrentCustomerTrialManifestIdentity(manifest);
    return;
  }
  const expected = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);
  if (
    policy.target !== LOCAL_DEV_TARGET ||
    manifest?.customer_key !== CUSTOMER_CONFIG_CUSTOMER_KEY ||
    manifest?.revision !== LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION ||
    manifest?.product_version !==
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION ||
    manifest?.compiled_snapshot?.applyPurpose !==
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE ||
    manifest?.compiled_snapshot?.datasetVersion !== undefined ||
    manifest?.compiled_snapshot?.target !== undefined ||
    sha256(canonicalJSON(manifest)) !== sha256(canonicalJSON(expected))
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "local-test manifest must exactly match the current tracked customer package",
      2,
    );
  }
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

async function rpcCall({
  backendURL,
  domain,
  method,
  params,
  token,
  fetchImpl,
  requestID,
}) {
  const response = await fetchImpl(rpcURL(backendURL, domain), {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `manual-acceptance-customer-config-${requestID}`,
      method,
      params,
    }),
  });
  if (response.redirected === true) {
    throw new ManualAcceptanceCustomerConfigError(
      `${domain}.${method} refused a redirected response`,
    );
  }
  if (!response.ok) {
    throw new ManualAcceptanceCustomerConfigError(
      `${domain}.${method} HTTP ${response.status}`,
    );
  }
  let json;
  try {
    json = await response.json();
  } catch {
    throw new ManualAcceptanceCustomerConfigError(
      `${domain}.${method} returned invalid JSON`,
    );
  }
  if (json?.result?.code !== 0) {
    throw new ManualAcceptanceCustomerConfigError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message || "unknown"}`,
    );
  }
  return json.result.data || {};
}

function requireIndependentAdminCredential(env) {
  const conflicting = FORMAL_RELEASE_CREDENTIAL_KEYS.filter((key) =>
    optionalText(env[key]),
  );
  if (conflicting.length > 0) {
    throw new ManualAcceptanceCustomerConfigError(
      `formal release credentials are not accepted: ${conflicting.join(", ")}`,
      2,
    );
  }
  const username = requiredText(
    env.MANUAL_ACCEPTANCE_ADMIN_USERNAME,
    "MANUAL_ACCEPTANCE_ADMIN_USERNAME",
  );
  const password = requiredText(
    env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  const demoPassword = requiredText(
    env.MANUAL_ACCEPTANCE_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD for independence verification",
  );
  if (password === demoPassword) {
    throw new ManualAcceptanceCustomerConfigError(
      "manual acceptance admin and demo-role passwords must be different",
      2,
    );
  }
  return { username, password };
}

function normalizeHash(value, name) {
  const hash = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new ManualAcceptanceCustomerConfigError(
      `${name} must be a SHA-256 hex digest`,
    );
  }
  return hash;
}

function requireValidationIdentity(data, manifest) {
  const validation = data?.validation;
  const configHash = normalizeHash(
    validation?.config_hash,
    "validate_customer_config config_hash",
  );
  if (
    validation?.customer_key !== manifest.customer_key ||
    validation?.revision !== manifest.revision ||
    Number(validation?.config_hash_version) !== CUSTOMER_CONFIG_HASH_VERSION ||
    validation?.compiled_snapshot_ok !== true
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "validate_customer_config response does not prove the trial manifest identity",
    );
  }
  return {
    customerKey: manifest.customer_key,
    revision: manifest.revision,
    productVersion: manifest.product_version,
    configHash,
    configHashVersion: CUSTOMER_CONFIG_HASH_VERSION,
  };
}

function requireRevisionIdentity(
  data,
  manifest,
  identity,
  operation,
  statuses,
) {
  const revision = data?.revision;
  if (
    revision?.customer_key !== manifest.customer_key ||
    revision?.revision !== manifest.revision ||
    revision?.product_version !== identity.productVersion ||
    normalizeHash(revision?.config_hash, `${operation} config_hash`) !==
      identity.configHash ||
    Number(revision?.config_hash_version) !== identity.configHashVersion ||
    !statuses.includes(revision?.status)
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      `${operation} response does not match revision/productVersion/hash/status`,
    );
  }
  return revision;
}

function requireTransition(data, manifest, identity, expectedActiveRevision) {
  const transition = data?.transition;
  const blockers = transition?.blockers;
  if (
    !transition ||
    transition.action !== "activate" ||
    transition.customer_key !== manifest.customer_key ||
    transition.target_revision !== manifest.revision ||
    normalizeHash(
      transition.target_config_hash,
      "check_customer_config_transition target_config_hash",
    ) !== identity.configHash ||
    transition.target_product_version !== identity.productVersion ||
    transition.expected_active_revision !== expectedActiveRevision ||
    typeof transition.observed_active_revision !== "string" ||
    typeof transition.allowed !== "boolean" ||
    !Array.isArray(blockers) ||
    blockers.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.code !== "string" ||
        item.code.trim() === "",
    )
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "check_customer_config_transition response does not prove hash/productVersion/CAS identity",
    );
  }
  return transition;
}

function requireEffectiveSession(data, manifest, identity) {
  const session = data?.session;
  const expectedDatasetVersion =
    optionalText(manifest.compiled_snapshot.datasetVersion) || "";
  const expectedTarget = optionalText(manifest.compiled_snapshot.target) || "";
  const pages = Array.isArray(session?.pages)
    ? [...session.pages].map((item) => String(item)).sort()
    : [];
  const manifestPages = [...manifest.compiled_snapshot.pages]
    .map((item) => String(item))
    .sort();
  const sessionFields = Object.keys(session?.fieldPolicies || {}).sort();
  const manifestFields = Object.keys(
    manifest.compiled_snapshot.fieldPolicies || {},
  ).sort();
  if (
    !session ||
    session.customer?.key !== manifest.customer_key ||
    session.configRevision !== manifest.revision ||
    session.configProductVersion !== manifest.product_version ||
    session.configApplyPurpose !== manifest.compiled_snapshot.applyPurpose ||
    typeof session.configDatasetVersion !== "string" ||
    session.configDatasetVersion.trim() !== expectedDatasetVersion ||
    typeof session.configTarget !== "string" ||
    session.configTarget.trim() !== expectedTarget ||
    normalizeHash(session.configHash, "get_effective_session configHash") !==
      identity.configHash ||
    Number(session.configHashVersion) !== identity.configHashVersion ||
    session.source !== "active_customer_config_revision" ||
    JSON.stringify(pages) !== JSON.stringify(manifestPages) ||
    JSON.stringify(sessionFields) !== JSON.stringify(manifestFields)
  ) {
    throw new ManualAcceptanceCustomerConfigError(
      "get_effective_session response does not prove the activated trial manifest",
    );
  }
  return {
    method: "get_effective_session",
    customerKey: session.customer.key,
    configRevision: session.configRevision,
    configHash: identity.configHash,
    configHashVersion: identity.configHashVersion,
    configProductVersion: session.configProductVersion,
    configApplyPurpose: session.configApplyPurpose,
    configDatasetVersion: session.configDatasetVersion,
    configTarget: session.configTarget,
    source: session.source,
    pageCount: pages.length,
    actionCount: Array.isArray(session.actions) ? session.actions.length : 0,
    workPoolCount: Array.isArray(session.workPools)
      ? session.workPools.length
      : 0,
    fieldPolicySurfaceCount: sessionFields.length,
  };
}

export async function applyManualAcceptanceCustomerConfig({
  manifest,
  policy,
  env,
  fetchImpl = fetch,
}) {
  const resolvedPolicy = resolveManualAcceptanceTarget(policy);
  requireExact(
    resolvedPolicy.dataVersion,
    CUSTOMER_CONFIG_DATA_VERSION,
    "policy.dataVersion",
  );
  requireExact(resolvedPolicy.runId, CUSTOMER_CONFIG_RUN_ID, "policy.runId");
  assertCurrentManualAcceptanceManifestIdentity(manifest, resolvedPolicy);
  const operations = [];
  let sequence = 0;
  const call = (input) =>
    rpcCall({
      ...input,
      backendURL: resolvedPolicy.backendURL,
      fetchImpl,
      requestID: `${++sequence}-${input.method}`,
    });
  try {
    assertManualAcceptanceMutationTarget(resolvedPolicy, {
      confirmation: env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    });
    let attestation;
    if (resolvedPolicy.target === CUSTOMER_TRIAL_133_TARGET) {
      attestation = assertManualAcceptanceTargetAttestation({
        policy: resolvedPolicy,
        attestation: env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
      });
    } else if (optionalText(env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON)) {
      throw new ManualAcceptanceCustomerConfigError(
        "local-dev customer config apply must not use a remote target attestation",
        2,
      );
    }
    const credential = requireIndependentAdminCredential(env);
    await assertManualAcceptanceRuntimeIdentityPrecondition({
      policy: resolvedPolicy,
      attestation,
      fetchImpl,
    });
    const login = await call({
      domain: "auth",
      method: "admin_login",
      params: {
        username: credential.username,
        password: credential.password,
      },
    });
    const token = optionalText(login.access_token || login.token);
    if (!token || login.is_super_admin !== true || login.disabled === true) {
      throw new ManualAcceptanceCustomerConfigError(
        "manual acceptance config writer must authenticate as an enabled super admin",
      );
    }

    const validationData = await call({
      domain: "customer_config",
      method: "validate_customer_config",
      params: manifest,
      token,
    });
    const identity = requireValidationIdentity(validationData, manifest);
    operations.push({
      method: "validate_customer_config",
      status: "verified",
      revision: identity.revision,
      configHash: identity.configHash,
    });

    const publishData = await call({
      domain: "customer_config",
      method: "publish_customer_config",
      params: manifest,
      token,
    });
    const published = requireRevisionIdentity(
      publishData,
      manifest,
      identity,
      "publish_customer_config",
      ["published", "active", "superseded"],
    );
    operations.push({
      method: "publish_customer_config",
      status: published.status,
      revision: published.revision,
      configHash: identity.configHash,
    });

    const transitionParams = {
      action: "activate",
      customer_key: manifest.customer_key,
      target_revision: manifest.revision,
      expected_config_hash: identity.configHash,
      expected_product_version: identity.productVersion,
    };
    let transition = requireTransition(
      await call({
        domain: "customer_config",
        method: "check_customer_config_transition",
        params: { ...transitionParams, expected_active_revision: "" },
        token,
      }),
      manifest,
      identity,
      "",
    );
    let transitionAttempts = 1;
    const observedActiveRevision = transition.observed_active_revision.trim();
    if (observedActiveRevision) {
      transition = requireTransition(
        await call({
          domain: "customer_config",
          method: "check_customer_config_transition",
          params: {
            ...transitionParams,
            expected_active_revision: observedActiveRevision,
          },
          token,
        }),
        manifest,
        identity,
        observedActiveRevision,
      );
      transitionAttempts += 1;
      if (transition.observed_active_revision !== observedActiveRevision) {
        throw new ManualAcceptanceCustomerConfigError(
          "active revision changed during customer config CAS preflight",
        );
      }
    }
    const blockerCodes = transition.blockers.map((item) => item.code.trim());
    if (!transition.allowed || blockerCodes.length > 0) {
      throw new ManualAcceptanceCustomerConfigError(
        `customer config activation blocked: ${blockerCodes.join(",") || "unknown_blocker"}`,
      );
    }
    operations.push({
      method: "check_customer_config_transition",
      status: "allowed",
      attempts: transitionAttempts,
      expectedActiveRevision: transition.expected_active_revision,
      observedActiveRevision: transition.observed_active_revision,
      configHash: identity.configHash,
    });

    const activateData = await call({
      domain: "customer_config",
      method: "activate_customer_config",
      params: {
        customer_key: manifest.customer_key,
        revision: manifest.revision,
        expected_config_hash: identity.configHash,
        expected_product_version: identity.productVersion,
        expected_active_revision: transition.observed_active_revision,
      },
      token,
    });
    const activated = requireRevisionIdentity(
      activateData,
      manifest,
      identity,
      "activate_customer_config",
      ["active"],
    );
    operations.push({
      method: "activate_customer_config",
      status: activated.status,
      revision: activated.revision,
      configHash: identity.configHash,
    });

    const sessionData = await call({
      domain: "customer_config",
      method: "get_effective_session",
      params: { customer_key: manifest.customer_key },
      token,
    });
    const effectiveSession = requireEffectiveSession(
      sessionData,
      manifest,
      identity,
    );
    operations.push({
      method: "get_effective_session",
      status: "verified",
      revision: effectiveSession.configRevision,
      configHash: identity.configHash,
    });
    return {
      identity,
      operations,
      effectiveSession,
      attestation: attestation
        ? {
            target: attestation.target,
            origin: attestation.origin,
            environment: attestation.environment,
            release: attestation.release,
            migration: attestation.migration,
            debugMutationsDisabled: true,
          }
        : null,
      adminCredential: {
        mode: "manual-acceptance-username-password",
        superAdminVerified: true,
        independentFromDemoPassword: true,
        formalReleaseCredentialAccepted: false,
      },
    };
  } catch (error) {
    error.completedOperations = [...operations];
    throw error;
  }
}

export async function applyCustomerTrial133Config(input) {
  return applyManualAcceptanceCustomerConfig(input);
}

function reportBoundary() {
  return {
    simulatedCustomerTrialOnly: true,
    releaseReady: false,
    releaseEvidenceUsed: false,
    formalReleaseExecutorUsed: false,
    directDatabaseWrites: false,
    workflowWrites: false,
    factWrites: false,
    sourceManifestRequiredPreviewOnly: true,
    note: "runtime_compile_ready is only the standard customer_config protocol shape for this explicitly marked trial manifest; it is not release readiness or customer signoff.",
  };
}

function plannedOperations() {
  return [
    "validate_customer_config",
    "publish_customer_config",
    "check_customer_config_transition",
    "activate_customer_config",
    "get_effective_session",
  ];
}

export async function runManualAcceptanceCustomerConfig({
  argv = [],
  env = process.env,
  fetchImpl = fetch,
  repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url))),
  now = () => new Date(),
} = {}) {
  const options = parseManualAcceptanceCustomerConfigArgs(argv);
  if (options.help) return { help: true, usage: CUSTOMER_CONFIG_USAGE };
  if (![LOCAL_DEV_TARGET, CUSTOMER_TRIAL_133_TARGET].includes(options.target)) {
    throw new ManualAcceptanceCustomerConfigError(
      `target must be ${LOCAL_DEV_TARGET} or ${CUSTOMER_TRIAL_133_TARGET}`,
      2,
    );
  }
  requireExact(
    options.dataVersion,
    CUSTOMER_CONFIG_DATA_VERSION,
    "dataVersion",
  );
  requireExact(options.runId, CUSTOMER_CONFIG_RUN_ID, "runId");
  const policy = resolveManualAcceptanceTarget({
    backendURL: options.backendURL,
    target: options.target,
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    dataVersion: options.dataVersion,
    runId: options.runId,
    databaseName: options.databaseName,
  });
  const previewPath = resolveRepoPath(
    repoRoot,
    options.previewManifest,
    "preview manifest",
  );
  const outDir = resolveRepoPath(repoRoot, options.out, "out");
  relativeRepoPath(repoRoot, previewPath, "preview manifest");
  relativeRepoPath(repoRoot, outDir, "out");
  assertNotDeploymentEvidence(repoRoot, previewPath, "preview manifest");
  assertNotDeploymentEvidence(repoRoot, outDir, "out");
  const previewRaw = await readFile(previewPath, "utf8");
  let preview;
  try {
    preview = JSON.parse(previewRaw);
  } catch {
    throw new ManualAcceptanceCustomerConfigError(
      "preview manifest is not valid JSON",
      2,
    );
  }
  const manifest =
    policy.target === CUSTOMER_TRIAL_133_TARGET
      ? buildCustomerTrial133Manifest(preview, policy)
      : buildLocalManualAcceptanceManifest(preview);
  const manifestRaw = jsonText(manifest);
  const manifestSha256 = sha256(manifestRaw);
  const manifestPath = path.join(
    outDir,
    policy.target === CUSTOMER_TRIAL_133_TARGET
      ? TRIAL_MANIFEST_FILE
      : "local-test-manifest.json",
  );
  const reportPath = path.join(
    outDir,
    policy.target === CUSTOMER_TRIAL_133_TARGET
      ? REPORT_FILE
      : "local-test-report.json",
  );
  await mkdir(outDir, { recursive: true });
  await writeFile(manifestPath, manifestRaw, "utf8");

  const baseReport = {
    schemaVersion: "manual-acceptance-customer-config-report/v1",
    status: options.apply ? "applying" : "planned",
    mode: options.apply
      ? policy.target === CUSTOMER_TRIAL_133_TARGET
        ? "customer-trial-test-apply"
        : "local-test-apply"
      : "report-only",
    generatedAt: now().toISOString(),
    target: policy.target,
    origin: policy.origin,
    databaseName: policy.databaseName,
    transport: policy.transport,
    customerKey: CUSTOMER_CONFIG_CUSTOMER_KEY,
    datasetKey: policy.datasetKey,
    dataVersion: policy.dataVersion,
    runId: policy.runId,
    source: {
      previewManifest: relativeRepoPath(
        repoRoot,
        previewPath,
        "preview manifest",
      ),
      previewManifestSha256: sha256(previewRaw),
      previewManifestStatus: preview.manifest_status,
      previewPackageStatus: preview.compiled_snapshot?.package?.status || null,
    },
    manifest: {
      path: relativeRepoPath(repoRoot, manifestPath, "trial manifest"),
      revision: manifest.revision,
      productVersion: manifest.product_version,
      manifestSha256,
      applyPurpose: manifest.compiled_snapshot.applyPurpose,
      datasetVersion: manifest.compiled_snapshot.datasetVersion,
      target: manifest.compiled_snapshot.target,
      manifestStatus: manifest.manifest_status,
    },
    requiredConfirmation: manualAcceptanceTargetConfirmation(policy),
    plannedOperations: plannedOperations(),
    operations: [],
    identity: null,
    effectiveSession: null,
    attestation: {
      requiredForApply: policy.target === CUSTOMER_TRIAL_133_TARGET,
      verified: false,
    },
    adminCredential: {
      requiredForApply: true,
      mode: "manual-acceptance-username-password",
      independentFromDemoPassword: false,
      formalReleaseCredentialAccepted: false,
    },
    boundary: reportBoundary(),
  };

  if (!options.apply) {
    await writeFile(reportPath, jsonText(baseReport), "utf8");
    return {
      options,
      policy,
      manifest,
      report: baseReport,
      manifestPath,
      reportPath,
    };
  }

  try {
    const applied = await applyManualAcceptanceCustomerConfig({
      manifest,
      policy,
      env,
      fetchImpl,
    });
    const report = {
      ...baseReport,
      status: "completed",
      completedAt: now().toISOString(),
      operations: applied.operations,
      identity: applied.identity,
      effectiveSession: applied.effectiveSession,
      attestation: {
        requiredForApply: policy.target === CUSTOMER_TRIAL_133_TARGET,
        verified: applied.attestation !== null,
        ...(applied.attestation || {}),
      },
      adminCredential: {
        requiredForApply: true,
        ...applied.adminCredential,
      },
    };
    await writeFile(reportPath, jsonText(report), "utf8");
    return { options, policy, manifest, report, manifestPath, reportPath };
  } catch (error) {
    const report = {
      ...baseReport,
      status: "failed",
      failedAt: now().toISOString(),
      operations: error.completedOperations || [],
      failure: {
        name: error?.name || "Error",
        message: error?.message || String(error),
      },
    };
    await writeFile(reportPath, jsonText(report), "utf8");
    error.reportPath = reportPath;
    throw error;
  }
}

async function main() {
  const result = await runManualAcceptanceCustomerConfig({
    argv: process.argv.slice(2),
  });
  if (result.help) {
    process.stdout.write(`${result.usage}\n`);
    return;
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        status: result.report.status,
        target: result.report.target,
        dataVersion: result.report.dataVersion,
        runId: result.report.runId,
        revision: result.manifest.revision,
        productVersion: result.manifest.product_version,
        manifestSha256: result.report.manifest.manifestSha256,
        configHash: result.report.identity?.configHash || null,
        manifest: result.report.manifest.path,
        report: path.relative(
          path.resolve(fileURLToPath(new URL("../..", import.meta.url))),
          result.reportPath,
        ),
        releaseReady: false,
      },
      null,
      2,
    )}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    const report = error?.reportPath ? ` report=${error.reportPath}` : "";
    process.stderr.write(`${error?.message || error}${report}\n`);
    process.exitCode = Number(error?.exitCode) || 1;
  });
}
