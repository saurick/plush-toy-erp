import {
  RELEASE_EVIDENCE_CONTRACT,
  RELEASE_EVIDENCE_PROFILES,
  PRODUCTION_PREFLIGHT_CHECKS,
  normalizeReleaseEvidenceProfile,
} from "./release-evidence-contract.mjs";

export { PRODUCTION_PREFLIGHT_CHECKS };

const KNOWN_CHECKS = new Set(Object.values(PRODUCTION_PREFLIGHT_CHECKS));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function buildProductionPreflightReceipt({
  deploymentTarget,
  mode,
  profile = RELEASE_EVIDENCE_PROFILES.BASE_RELEASE,
  productCommit = "",
  checks,
  generatedAt = new Date().toISOString(),
}) {
  const normalizedChecks = [...new Set(checks || [])];
  const normalizedProfile = normalizeReleaseEvidenceProfile(profile);
  assert(deploymentTarget, "deploymentTarget is required");
  assert(mode === "runtime-env" || mode === "example", "invalid mode");
  assert(
    normalizedChecks.length > 0 &&
      normalizedChecks.every((id) => KNOWN_CHECKS.has(id)),
    "checks must contain only known production preflight check ids",
  );
  if (productCommit) {
    assert(
      /^[0-9a-f]{40}$/u.test(productCommit),
      "productCommit must be a full 40-character lowercase Git commit",
    );
  }

  return {
    evidenceContract: RELEASE_EVIDENCE_CONTRACT,
    kind: "production-preflight",
    generatedAt,
    deploymentTarget,
    mode,
    profile: normalizedProfile,
    productCommit: productCommit || null,
    checks: normalizedChecks.map((id) => ({ id, status: "passed" })),
    summary: {
      total: normalizedChecks.length,
      passed: normalizedChecks.length,
      failed: 0,
    },
    redaction: {
      containsSecrets: false,
      containsRawCustomerRows: false,
      containsFullDsn: false,
    },
  };
}
