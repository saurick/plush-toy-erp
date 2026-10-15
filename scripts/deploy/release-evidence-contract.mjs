import contract from "./release-evidence-contract.json" with { type: "json" };

export const RELEASE_EVIDENCE_CONTRACT = contract.evidenceContract;

export const RELEASE_EVIDENCE_PROFILES = Object.freeze(contract.profiles);
export const PRODUCTION_PREFLIGHT_CHECKS = Object.freeze(
  contract.preflightChecks,
);

export const RELEASE_EVIDENCE_FILES = Object.freeze({
  release: "release-evidence.md",
  preflight: "production-preflight-report.json",
  imageDigests: "image-digests.txt",
  backup: "backup-evidence.md",
  backupRestore: "backup-restore-report.json",
  migration: "migration-status.txt",
  smoke: "smoke-test-report.json",
  credentialRotation: "credential-rotation-report.json",
  rollbackPlan: "rollback-forward-fix-plan.md",
  rollbackRehearsal: "rollback-rehearsal-report.json",
  signoff: "release-signoff-checklist.md",
});

const BASE_RELEASE_FILE_KEYS = Object.freeze([
  "release",
  "preflight",
  "imageDigests",
  "backup",
  "migration",
  "smoke",
  "rollbackPlan",
]);

const CUSTOMER_TRIAL_ACCEPTANCE_FILE_KEYS = Object.freeze([
  ...BASE_RELEASE_FILE_KEYS,
  "backupRestore",
  "rollbackRehearsal",
  "signoff",
  "credentialRotation",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeReleaseEvidenceProfile(value) {
  const profile = String(
    value || RELEASE_EVIDENCE_PROFILES.BASE_RELEASE,
  ).trim();
  if (!Object.values(RELEASE_EVIDENCE_PROFILES).includes(profile)) {
    throw new Error(
      `release evidence profile must be ${Object.values(RELEASE_EVIDENCE_PROFILES).join(" or ")}`,
    );
  }
  return profile;
}

export function requiresRecoveryRehearsal(profile, releaseContent = "") {
  if (
    normalizeReleaseEvidenceProfile(profile) ===
    RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE
  )
    return true;
  const before = releaseEvidenceFieldFromMarkdown(
    releaseContent,
    "migrationBefore",
  );
  const after = releaseEvidenceFieldFromMarkdown(
    releaseContent,
    "migrationAfter",
  );
  return (
    !/^\d{14}$/u.test(before) ||
    before !== after ||
    releaseEvidenceFieldFromMarkdown(
      releaseContent,
      "recoveryProcedureChanged",
    ) !== "false"
  );
}

export function releaseEvidenceRequiredFileKeys(profile, releaseContent = "") {
  const normalized = normalizeReleaseEvidenceProfile(profile);
  return normalized === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE
    ? [...CUSTOMER_TRIAL_ACCEPTANCE_FILE_KEYS]
    : [
        ...BASE_RELEASE_FILE_KEYS,
        ...(requiresRecoveryRehearsal(normalized, releaseContent)
          ? ["backupRestore", "rollbackRehearsal"]
          : []),
      ];
}

export function releaseEvidenceRequiredFiles(profile, releaseContent = "") {
  return releaseEvidenceRequiredFileKeys(profile, releaseContent).map(
    (key) => RELEASE_EVIDENCE_FILES[key],
  );
}

export function releaseEvidenceProfileSatisfies(actual, required) {
  return (
    Object.values(RELEASE_EVIDENCE_PROFILES).includes(actual) &&
    (actual === required ||
      (actual === RELEASE_EVIDENCE_PROFILES.CUSTOMER_TRIAL_ACCEPTANCE &&
        required === RELEASE_EVIDENCE_PROFILES.BASE_RELEASE))
  );
}

export function releaseEvidenceFieldFromMarkdown(content, field) {
  const label = escapeRegExp(field);
  const tableMatch = String(content ?? "").match(
    new RegExp(`^\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|`, "mi"),
  );
  if (tableMatch) return tableMatch[1].trim();

  const lineMatch = String(content ?? "").match(
    new RegExp(`^(?:[-*]\\s*)?${label}\\s*[:：]\\s*(.+)$`, "mi"),
  );
  return lineMatch ? lineMatch[1].trim() : "";
}

export function releaseEvidenceContractFromMarkdown(content) {
  return releaseEvidenceFieldFromMarkdown(content, "evidenceContract");
}

export function classifyReleaseEvidenceContract(content) {
  const declared = releaseEvidenceContractFromMarkdown(content);
  if (!declared) {
    return {
      status: "legacy",
      current: RELEASE_EVIDENCE_CONTRACT,
      declared: null,
    };
  }
  return {
    status: declared === RELEASE_EVIDENCE_CONTRACT ? "current" : "unsupported",
    current: RELEASE_EVIDENCE_CONTRACT,
    declared,
  };
}
