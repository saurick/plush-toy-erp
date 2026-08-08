import { createHash } from "node:crypto";

export const STRICT_RECEIPT_SCHEMA = "plush.exact-sha-strict/v3";
export const STRICT_RECEIPT_CATEGORY_KEYS = Object.freeze([
  "web",
  "server",
  "database",
  "browser",
  "security",
]);
export const TIME_SENSITIVE_CHECK_KEYS = Object.freeze([
  "vulnerabilityDatabase",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function assertFingerprint(value, label) {
  if (!SHA256_PATTERN.test(String(value || ""))) {
    throw new Error(`${label} is invalid`);
  }
}

function validateCounts(counts, key) {
  const values = ["executed", "passed", "failed", "skipped"];
  if (
    !counts ||
    typeof counts !== "object" ||
    Array.isArray(counts) ||
    Object.keys(counts).sort().join(",") !== values.sort().join(",")
  ) {
    throw new Error(`strict receipt ${key} counts are invalid`);
  }
  for (const field of values) {
    if (!Number.isSafeInteger(counts[field]) || counts[field] < 0) {
      throw new Error(`strict receipt ${key}.${field} is invalid`);
    }
  }
  if (counts.passed + counts.failed + counts.skipped !== counts.executed) {
    throw new Error(`strict receipt ${key} counts do not balance`);
  }
  return counts;
}

function validateFreshness(check, key) {
  if (
    !check ||
    check.status !== "passed" ||
    Number.isNaN(Date.parse(check.checkedAt)) ||
    Number.isNaN(Date.parse(check.validUntil)) ||
    Date.parse(check.validUntil) <= Date.parse(check.checkedAt)
  ) {
    throw new Error(`strict receipt freshness ${key} is invalid`);
  }
  return check;
}

export function validateStrictReceiptIdentity(identity) {
  if (
    !identity ||
    !REPOSITORY_PATTERN.test(String(identity.repository || "")) ||
    !SHA_PATTERN.test(String(identity.gitSha || ""))
  ) {
    throw new Error("strict receipt repository or exact SHA is invalid");
  }
  for (const field of [
    "sourceArchiveSha256",
    "policyFingerprint",
    "workflowFingerprint",
    "toolchainFingerprint",
    "migrationSequenceSha256",
    "dependencyLockFingerprint",
    "customerConfigFingerprint",
  ]) {
    assertFingerprint(identity[field], `strict receipt ${field}`);
  }
  return identity;
}

export function validateStrictReceiptEvidence(terminal) {
  if (
    terminal?.contract !== STRICT_RECEIPT_SCHEMA ||
    terminal?.profile !== "strict" ||
    terminal?.status !== "passed" ||
    terminal?.exitCode !== 0
  ) {
    throw new Error("strict receipt terminal did not pass");
  }
  validateStrictReceiptIdentity(terminal.identity);
  if (
    !terminal.checks ||
    Object.keys(terminal.checks).sort().join(",") !==
      [...STRICT_RECEIPT_CATEGORY_KEYS].sort().join(",")
  ) {
    throw new Error("strict receipt category set is invalid");
  }
  for (const key of STRICT_RECEIPT_CATEGORY_KEYS) {
    const counts = validateCounts(terminal.checks[key], key);
    if (
      counts.executed === 0 ||
      counts.failed !== 0 ||
      counts.skipped !== 0 ||
      counts.passed !== counts.executed
    ) {
      throw new Error(`strict receipt ${key} does not prove an all-passed run`);
    }
  }
  if (
    !terminal.timeSensitiveChecks ||
    Object.keys(terminal.timeSensitiveChecks).sort().join(",") !==
      [...TIME_SENSITIVE_CHECK_KEYS].sort().join(",")
  ) {
    throw new Error("strict receipt freshness set is invalid");
  }
  for (const key of TIME_SENSITIVE_CHECK_KEYS) {
    validateFreshness(terminal.timeSensitiveChecks[key], key);
  }
  return terminal;
}

export function evaluateStrictReceiptReuse({
  terminal,
  expectedIdentity,
  trust,
  now = Date.now(),
}) {
  validateStrictReceiptEvidence(terminal);
  validateStrictReceiptIdentity(expectedIdentity);
  const mismatches = [];
  for (const key of Object.keys(expectedIdentity)) {
    if (terminal.identity[key] !== expectedIdentity[key]) mismatches.push(key);
  }
  if (mismatches.length > 0) {
    return Object.freeze({
      reusable: false,
      reason: `identity_mismatch:${mismatches.join(",")}`,
      refreshChecks: Object.freeze([]),
    });
  }
  if (
    trust?.repository !== true ||
    trust?.protectedDefaultBranch !== true ||
    trust?.workflow !== true ||
    trust?.artifactDigest !== true ||
    trust?.run !== true ||
    trust?.job !== true
  ) {
    return Object.freeze({
      reusable: false,
      reason: "untrusted_provenance",
      refreshChecks: Object.freeze([]),
    });
  }
  const refreshChecks = TIME_SENSITIVE_CHECK_KEYS.filter(
    (key) => Date.parse(terminal.timeSensitiveChecks[key].validUntil) <= now,
  );
  return Object.freeze({
    reusable: true,
    reason:
      refreshChecks.length > 0 ? "time_sensitive_refresh" : "exact_identity",
    refreshChecks: Object.freeze(refreshChecks),
  });
}

export function refreshedTimeSensitiveCheck({
  terminal,
  key,
  checkedAt,
  validForMs,
  provenance,
}) {
  validateStrictReceiptEvidence(terminal);
  if (!TIME_SENSITIVE_CHECK_KEYS.includes(key)) {
    throw new Error("unsupported time-sensitive strict check");
  }
  const checkedEpoch = Date.parse(checkedAt);
  if (
    Number.isNaN(checkedEpoch) ||
    !Number.isSafeInteger(validForMs) ||
    validForMs <= 0
  ) {
    throw new Error("time-sensitive strict refresh window is invalid");
  }
  return Object.freeze({
    ...terminal,
    timeSensitiveChecks: Object.freeze({
      ...terminal.timeSensitiveChecks,
      [key]: Object.freeze({
        status: "passed",
        checkedAt: new Date(checkedEpoch).toISOString(),
        validUntil: new Date(checkedEpoch + validForMs).toISOString(),
        provenance,
      }),
    }),
  });
}
