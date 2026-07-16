import { createHash } from "node:crypto";

const DEFAULT_LOCAL_BACKEND_URL = "http://127.0.0.1:8300";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const EXPLICIT_LOCAL_ENVIRONMENTS = new Set(["local", "dev"]);
const SAFE_DATA_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/u;
const SAFE_RUN_ID = /^[A-Z0-9][A-Z0-9_-]{0,31}$/u;
const IMMUTABLE_RELEASE_SHA = /^[0-9a-f]{40}$/u;
const ATLAS_MIGRATION_VERSION = /^[0-9]{14}$/u;
const EXACT_LOCAL_ACCEPTANCE_DATABASE =
  /^plush_erp_acceptance_20260716_v5_dev$/u;

export const LOCAL_DEV_TARGET = "local-dev";
export const LOCAL_MANUAL_ACCEPTANCE_DATABASE =
  "plush_erp_acceptance_20260716_v5_dev";
export const CUSTOMER_TRIAL_133_TARGET = "customer-trial-133";
// Customer-trial writes carry administrator credentials and bearer tokens. Keep
// the registered endpoint on loopback so callers must reach 133 through an SSH
// tunnel instead of sending those secrets over plaintext LAN HTTP.
export const CUSTOMER_TRIAL_133_ORIGIN = "http://127.0.0.1:18375";
export const CUSTOMER_TRIAL_133_DATABASE = "plush_erp_uat_20260716_v5";
export const CUSTOMER_TRIAL_133_MIN_MIGRATION = "20260714165115";
export const CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION = "2026.07.16-v5";
export const CURRENT_MANUAL_ACCEPTANCE_RUN_ID = "20260716-V5";
export const LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION =
  "yoyoosun-customer-package-v7.local-1fe1691c03359367.runtime-v1";
export const LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION =
  "local-customer-package-test-apply";
export const LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE = "local_test_apply";
export const CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION =
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION;
export const CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION =
  "customer-trial-133-test-2026.07.16-v5";
export const CUSTOMER_TRIAL_133_CONFIG_REVISION =
  "yoyoosun-customer-trial-133-package-v5.runtime-manifest-v1";
export const CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE =
  "customer_trial_test_apply";
export const MANUAL_ACCEPTANCE_DATASET_KEY = "yoyoosun-manual-acceptance";

export const MANUAL_ACCEPTANCE_TARGET_PROFILES = Object.freeze({
  [CUSTOMER_TRIAL_133_TARGET]: Object.freeze({
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    attestationEnvironment: "prod",
    runtimeEnvironment: "remote",
    databaseName: CUSTOMER_TRIAL_133_DATABASE,
    customerKey: "yoyoosun",
    configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
    configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
    configDatasetVersion: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
    configTarget: CUSTOMER_TRIAL_133_TARGET,
    requireActiveCustomerConfigRevision: true,
    requireDebugMutationsDisabled: true,
  }),
});

export class ManualAcceptanceTargetPolicyError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "ManualAcceptanceTargetPolicyError";
    this.exitCode = exitCode;
  }
}

function registeredCustomerTrialDatasetIdentity(dataVersion, runId) {
  const normalizedDataVersion = requiredIdentity(
    dataVersion,
    "dataVersion",
    SAFE_DATA_VERSION,
    "the current registered manual acceptance data version",
  );
  const normalizedRunId = requiredIdentity(
    runId,
    "runId",
    SAFE_RUN_ID,
    "the current registered manual acceptance run identifier",
  );
  if (
    normalizedDataVersion !== CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION ||
    normalizedRunId !== CURRENT_MANUAL_ACCEPTANCE_RUN_ID
  ) {
    throw new ManualAcceptanceTargetPolicyError(
      `${CUSTOMER_TRIAL_133_TARGET} requires dataVersion=${CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION} and runId=${CURRENT_MANUAL_ACCEPTANCE_RUN_ID}`,
    );
  }
  return { dataVersion: normalizedDataVersion, runId: normalizedRunId };
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function requiredIdentity(value, name, pattern, description) {
  const text = optionalText(value);
  if (!text || !pattern.test(text)) {
    throw new ManualAcceptanceTargetPolicyError(
      `${name} must be ${description}`,
    );
  }
  return text;
}

export function normalizeManualAcceptanceBackendURL(
  value = DEFAULT_LOCAL_BACKEND_URL,
) {
  let url;
  try {
    url = new URL(String(value || DEFAULT_LOCAL_BACKEND_URL).trim());
  } catch {
    throw new ManualAcceptanceTargetPolicyError("backend URL is invalid");
  }
  if (url.username || url.password) {
    throw new ManualAcceptanceTargetPolicyError(
      "backend URL must not contain credentials",
    );
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new ManualAcceptanceTargetPolicyError(
      "backend URL must use http or https",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

export function resolveManualAcceptanceTarget({
  backendURL = DEFAULT_LOCAL_BACKEND_URL,
  target,
  datasetKey = MANUAL_ACCEPTANCE_DATASET_KEY,
  dataVersion,
  runId,
  databaseName,
} = {}) {
  const normalizedBackendURL = normalizeManualAcceptanceBackendURL(backendURL);
  const url = new URL(normalizedBackendURL);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  const requestedTarget = optionalText(target);
  const requestedDatabaseName = optionalText(databaseName);
  if (datasetKey !== MANUAL_ACCEPTANCE_DATASET_KEY) {
    throw new ManualAcceptanceTargetPolicyError(
      `datasetKey must be ${MANUAL_ACCEPTANCE_DATASET_KEY}`,
    );
  }

  if (
    normalizedBackendURL === CUSTOMER_TRIAL_133_ORIGIN &&
    requestedTarget !== CUSTOMER_TRIAL_133_TARGET
  ) {
    throw new ManualAcceptanceTargetPolicyError(
      `${CUSTOMER_TRIAL_133_ORIGIN} is reserved for --target ${CUSTOMER_TRIAL_133_TARGET}`,
    );
  }

  if (
    requestedTarget === CUSTOMER_TRIAL_133_TARGET &&
    normalizedBackendURL === CUSTOMER_TRIAL_133_ORIGIN
  ) {
    const identity = registeredCustomerTrialDatasetIdentity(dataVersion, runId);
    if (
      requestedDatabaseName &&
      requestedDatabaseName !== CUSTOMER_TRIAL_133_DATABASE
    ) {
      throw new ManualAcceptanceTargetPolicyError(
        `${CUSTOMER_TRIAL_133_TARGET} requires databaseName=${CUSTOMER_TRIAL_133_DATABASE}`,
      );
    }
    return Object.freeze({
      target: CUSTOMER_TRIAL_133_TARGET,
      datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
      backendURL: normalizedBackendURL,
      origin: url.origin,
      dataVersion: identity.dataVersion,
      runId: identity.runId,
      external: true,
      transport: "ssh-tunnel",
      databaseName: CUSTOMER_TRIAL_133_DATABASE,
    });
  }

  if (LOCAL_HOSTS.has(hostname)) {
    if (requestedTarget && requestedTarget !== LOCAL_DEV_TARGET) {
      throw new ManualAcceptanceTargetPolicyError(
        `${requestedTarget} must use its registered SSH tunnel origin`,
      );
    }
    if (
      requestedDatabaseName &&
      requestedDatabaseName !== LOCAL_MANUAL_ACCEPTANCE_DATABASE
    ) {
      throw new ManualAcceptanceTargetPolicyError(
        `${LOCAL_DEV_TARGET} requires databaseName=${LOCAL_MANUAL_ACCEPTANCE_DATABASE}`,
      );
    }
    return Object.freeze({
      target: LOCAL_DEV_TARGET,
      datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
      backendURL: normalizedBackendURL,
      origin: url.origin,
      dataVersion: optionalText(dataVersion) || optionalText(runId),
      runId: optionalText(runId),
      external: false,
      ...(requestedDatabaseName ? { databaseName: requestedDatabaseName } : {}),
    });
  }

  if (requestedTarget !== CUSTOMER_TRIAL_133_TARGET) {
    throw new ManualAcceptanceTargetPolicyError(
      `refuse external backend ${url.origin}; ${CUSTOMER_TRIAL_133_TARGET} writes require the registered SSH tunnel origin`,
    );
  }
  if (normalizedBackendURL !== CUSTOMER_TRIAL_133_ORIGIN) {
    throw new ManualAcceptanceTargetPolicyError(
      `${CUSTOMER_TRIAL_133_TARGET} requires registered SSH tunnel origin ${CUSTOMER_TRIAL_133_ORIGIN}`,
    );
  }

  const identity = registeredCustomerTrialDatasetIdentity(dataVersion, runId);
  return Object.freeze({
    target: CUSTOMER_TRIAL_133_TARGET,
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    backendURL: normalizedBackendURL,
    origin: url.origin,
    dataVersion: identity.dataVersion,
    runId: identity.runId,
    external: true,
    databaseName: CUSTOMER_TRIAL_133_DATABASE,
  });
}

export function manualAcceptanceTargetConfirmation(policy) {
  const resolved = resolveManualAcceptanceTarget(policy);
  if (!resolved.external) {
    if (!resolved.databaseName) return undefined;
    return `APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:${resolved.target}:${resolved.dataVersion}:${resolved.runId}:${resolved.databaseName}`;
  }
  return `APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:${resolved.target}:${resolved.dataVersion}:${resolved.runId}`;
}

export function assertManualAcceptanceMutationTarget(
  policy,
  { confirmation } = {},
) {
  const resolved = resolveManualAcceptanceTarget(policy);
  if (!resolved.external && !resolved.databaseName) {
    throw new ManualAcceptanceTargetPolicyError(
      "local manual acceptance apply requires an explicit dedicated databaseName",
    );
  }
  if (!resolved.external && new URL(resolved.backendURL).port === "8300") {
    throw new ManualAcceptanceTargetPolicyError(
      "local manual acceptance apply must use an isolated non-8300 backend",
    );
  }
  const expected = manualAcceptanceTargetConfirmation(resolved);
  if (confirmation !== expected) {
    const scope = resolved.external ? "external" : resolved.target;
    throw new ManualAcceptanceTargetPolicyError(
      `${scope} apply requires MANUAL_ACCEPTANCE_TARGET_CONFIRM=${expected}`,
    );
  }
  return resolved;
}

export function assertManualAcceptanceDatabaseIdentity({
  policy,
  capabilities,
} = {}) {
  const resolved = resolveManualAcceptanceTarget(policy);
  const expectedDatabaseName =
    resolved.databaseName ||
    MANUAL_ACCEPTANCE_TARGET_PROFILES[resolved.target]?.databaseName;
  if (!expectedDatabaseName) {
    throw new ManualAcceptanceTargetPolicyError(
      "local manual acceptance apply requires an explicit dedicated databaseName",
    );
  }
  const actualDatabaseName = optionalText(capabilities?.databaseName);
  if (actualDatabaseName !== expectedDatabaseName) {
    throw new ManualAcceptanceTargetPolicyError(
      `refuse writes: runtime databaseName=${actualDatabaseName || "unknown"}, expected ${expectedDatabaseName}`,
    );
  }
  return Object.freeze({
    resolved,
    databaseName: actualDatabaseName,
  });
}

const REMOTE_DEBUG_FALSE_FIELDS = Object.freeze([
  "seedEnabled",
  "seedAllowed",
  "cleanupEnabled",
  "cleanupAllowed",
  "businessDataClearEnabled",
  "businessDataClearAllowed",
]);
const REMOTE_ATTESTATION_FIELDS = Object.freeze([
  "target",
  "origin",
  "customerKey",
  "environment",
  "release",
  "migration",
  "debug",
]);

function assertExactObjectKeys(value, allowedKeys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ManualAcceptanceTargetPolicyError(`${name} must be an object`);
  }
  const unexpected = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpected.length > 0) {
    throw new ManualAcceptanceTargetPolicyError(
      `${name} contains unexpected fields: ${unexpected.join(", ")}`,
    );
  }
}

export function parseManualAcceptanceTargetAttestation(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "object") return structuredClone(value);
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("attestation must be an object");
    }
    return parsed;
  } catch (error) {
    throw new ManualAcceptanceTargetPolicyError(
      `MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON is invalid: ${error?.message || error}`,
    );
  }
}

export function assertManualAcceptanceTargetAttestation({
  policy,
  attestation,
} = {}) {
  const resolved = resolveManualAcceptanceTarget(policy);
  if (resolved.target !== CUSTOMER_TRIAL_133_TARGET) {
    throw new ManualAcceptanceTargetPolicyError(
      "out-of-band target attestation is only valid for customer-trial-133",
    );
  }
  const value = parseManualAcceptanceTargetAttestation(attestation);
  if (!value) {
    throw new ManualAcceptanceTargetPolicyError(
      "customer-trial-133 target attestation is required when live capabilities are unavailable",
    );
  }
  assertExactObjectKeys(
    value,
    REMOTE_ATTESTATION_FIELDS,
    "customer-trial-133 attestation",
  );
  const profile = MANUAL_ACCEPTANCE_TARGET_PROFILES[resolved.target];
  if (
    value.target !== resolved.target ||
    value.origin !== resolved.origin ||
    value.customerKey !== "yoyoosun" ||
    value.environment !== profile.attestationEnvironment
  ) {
    throw new ManualAcceptanceTargetPolicyError(
      "customer-trial-133 attestation target/origin/customer/environment mismatch",
    );
  }
  const release = requiredIdentity(
    value.release,
    "attestation.release",
    IMMUTABLE_RELEASE_SHA,
    "a lowercase 40-character immutable Git commit SHA",
  );
  const migration = requiredIdentity(
    value.migration,
    "attestation.migration",
    ATLAS_MIGRATION_VERSION,
    "a 14-digit Atlas migration version",
  );
  if (migration < CUSTOMER_TRIAL_133_MIN_MIGRATION) {
    throw new ManualAcceptanceTargetPolicyError(
      `attestation.migration must be at least ${CUSTOMER_TRIAL_133_MIN_MIGRATION}`,
    );
  }
  const debug = value.debug;
  assertExactObjectKeys(
    debug,
    REMOTE_DEBUG_FALSE_FIELDS,
    "customer-trial-133 attestation.debug",
  );
  const unsafeDebugFields = REMOTE_DEBUG_FALSE_FIELDS.filter(
    (key) => debug?.[key] !== false,
  );
  if (unsafeDebugFields.length > 0) {
    throw new ManualAcceptanceTargetPolicyError(
      `customer-trial-133 attestation requires debug seed, cleanup, and business clear disabled; unsafe fields: ${unsafeDebugFields.join(", ")}`,
    );
  }
  return Object.freeze({
    target: value.target,
    origin: value.origin,
    customerKey: value.customerKey,
    environment: value.environment,
    release,
    migration,
    debug: Object.freeze(
      Object.fromEntries(REMOTE_DEBUG_FALSE_FIELDS.map((key) => [key, false])),
    ),
  });
}

export function manualAcceptanceRuntimeCapabilitiesFromAttestation({
  policy,
  attestation,
} = {}) {
  const checked = assertManualAcceptanceTargetAttestation({
    policy,
    attestation,
  });
  const profile = MANUAL_ACCEPTANCE_TARGET_PROFILES[checked.target];
  return Object.freeze({
    databaseName: profile.databaseName,
    environment: profile.runtimeEnvironment,
    ...checked.debug,
  });
}

export async function assertManualAcceptanceRuntimeIdentityPrecondition({
  policy,
  attestation,
  fetchImpl = fetch,
} = {}) {
  const resolved = resolveManualAcceptanceTarget(policy);
  let checkedAttestation;
  if (resolved.external) {
    checkedAttestation = assertManualAcceptanceTargetAttestation({
      policy: resolved,
      attestation,
    });
  } else if (attestation) {
    throw new ManualAcceptanceTargetPolicyError(
      "runtime target attestation is only valid for customer-trial-133",
    );
  }
  const scope = resolved.external ? "release-v1" : "database-v1";
  const identityFields = [
    scope,
    requiredIdentity(
      resolved.databaseName,
      "runtime databaseName",
      resolved.external
        ? /^plush_erp_uat_[a-z0-9_]+$/u
        : EXACT_LOCAL_ACCEPTANCE_DATABASE,
      "the registered acceptance database identity",
    ),
  ];
  if (checkedAttestation) {
    identityFields.push(
      checkedAttestation.release,
      checkedAttestation.migration,
    );
  }
  const expectedDigest = createHash("sha256")
    .update(identityFields.join("\n"))
    .digest("hex");
  const response = await fetchImpl(
    new URL("/readyz/runtime-identity", `${resolved.backendURL}/`).toString(),
    {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "text/plain",
        "X-ERP-Runtime-Identity-Scope": scope,
        "X-ERP-Expected-Runtime-Identity-SHA256": expectedDigest,
      },
    },
  );
  let body = "";
  try {
    body = String(await response.text()).trim();
  } catch {
    body = "";
  }
  if (
    response.redirected === true ||
    !response.ok ||
    body !== "runtime identity matched" ||
    response.headers?.get?.("X-ERP-Runtime-Identity-Proof") !== "matched-v1"
  ) {
    throw new ManualAcceptanceTargetPolicyError(
      `runtime identity precondition failed before authentication (HTTP ${response.status})`,
    );
  }
  return Object.freeze({
    resolved,
    databaseName: resolved.databaseName,
    release: checkedAttestation?.release,
    migration: checkedAttestation?.migration,
    proof: "matched-v1",
  });
}

export function assertManualAcceptanceCapabilitiesPolicy({
  policy,
  capabilities,
} = {}) {
  const resolved = resolveManualAcceptanceTarget(policy);
  const environment = optionalText(capabilities?.environment);

  if (resolved.target === LOCAL_DEV_TARGET) {
    if (EXPLICIT_LOCAL_ENVIRONMENTS.has(environment)) {
      return Object.freeze({ resolved, environment });
    }
    if (environment === "sql") {
      const unsafeDebugFields = REMOTE_DEBUG_FALSE_FIELDS.filter(
        (key) => capabilities?.[key] !== false,
      );
      if (unsafeDebugFields.length === 0) {
        return Object.freeze({
          resolved,
          environment,
          debugMutationsDisabled: true,
        });
      }
      throw new ManualAcceptanceTargetPolicyError(
        `local-dev environment=sql requires every debug mutation disabled; unsafe fields: ${unsafeDebugFields.join(", ")}`,
      );
    }
    {
      throw new ManualAcceptanceTargetPolicyError(
        `refuse manual acceptance writes in environment=${environment || "unknown"}`,
      );
    }
  }

  const profile = MANUAL_ACCEPTANCE_TARGET_PROFILES[resolved.target];
  if (environment !== profile.runtimeEnvironment) {
    throw new ManualAcceptanceTargetPolicyError(
      `${resolved.target} requires runtime environment=${profile.runtimeEnvironment}, got ${environment || "unknown"}`,
    );
  }
  const unsafeDebugFields = REMOTE_DEBUG_FALSE_FIELDS.filter(
    (key) => capabilities?.[key] !== false,
  );
  if (unsafeDebugFields.length > 0) {
    throw new ManualAcceptanceTargetPolicyError(
      `${resolved.target} requires debug seed, cleanup, and business clear disabled; unsafe fields: ${unsafeDebugFields.join(", ")}`,
    );
  }
  return Object.freeze({ resolved, environment });
}

export function assertManualAcceptanceRuntimePolicy({
  policy,
  capabilities,
  session,
  requiredModules = [],
  customerKey = "yoyoosun",
} = {}) {
  const { resolved, environment } = assertManualAcceptanceCapabilitiesPolicy({
    policy,
    capabilities,
  });

  const configRevision = optionalText(
    session?.configRevision || session?.config_revision,
  );
  if (
    session?.customer?.key !== customerKey ||
    session?.source !== "active_customer_config_revision" ||
    !configRevision
  ) {
    throw new ManualAcceptanceTargetPolicyError(
      `refuse writes: ${customerKey} active customer configuration is not the current runtime source`,
    );
  }
  const modules = session.modules || {};
  const unavailableModules = requiredModules.filter(
    (key) => modules[key] !== "enabled",
  );
  if (unavailableModules.length > 0) {
    throw new ManualAcceptanceTargetPolicyError(
      `refuse writes: required modules are not enabled: ${unavailableModules.join(", ")}`,
    );
  }

  const configProductVersion = optionalText(
    session?.configProductVersion || session?.config_product_version,
  );
  const configApplyPurpose = optionalText(
    session?.configApplyPurpose || session?.config_apply_purpose,
  );
  const configDatasetVersion = optionalText(
    session?.configDatasetVersion || session?.config_dataset_version,
  );
  const configTarget = optionalText(
    session?.configTarget || session?.config_target,
  );
  if (resolved.target === CUSTOMER_TRIAL_133_TARGET) {
    const profile = MANUAL_ACCEPTANCE_TARGET_PROFILES[resolved.target];
    if (
      configRevision !== profile.configRevision ||
      configProductVersion !== profile.configProductVersion ||
      configApplyPurpose !== profile.configApplyPurpose ||
      configDatasetVersion !== profile.configDatasetVersion ||
      configTarget !== profile.configTarget
    ) {
      throw new ManualAcceptanceTargetPolicyError(
        "refuse writes: active customer-trial configuration identity does not match the registered dataset",
      );
    }
  } else if (
    configRevision !== LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION ||
    configProductVersion !== LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION ||
    configApplyPurpose !== LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE ||
    configDatasetVersion !== undefined ||
    configTarget !== undefined
  ) {
    throw new ManualAcceptanceTargetPolicyError(
      "refuse writes: active local-test configuration identity does not match the current tracked customer package",
    );
  }

  return Object.freeze({
    target: resolved.target,
    origin: resolved.origin,
    datasetKey: resolved.datasetKey,
    dataVersion: resolved.dataVersion,
    runId: resolved.runId,
    environment,
    customerKey: session.customer.key,
    configRevision,
    configProductVersion,
    configApplyPurpose,
    configDatasetVersion,
    configTarget,
    source: session.source,
    requiredModules: [...requiredModules],
    ...(resolved.target === CUSTOMER_TRIAL_133_TARGET
      ? { debugMutationsDisabled: true }
      : {}),
  });
}
