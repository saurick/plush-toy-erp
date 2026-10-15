import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStrictReceiptReuse,
  refreshedTimeSensitiveCheck,
  STRICT_RECEIPT_SCHEMA,
  validateStrictReceiptEvidence,
} from "./strict-receipt-identity.mjs";

const hash = (digit) => digit.repeat(64);
const identity = Object.freeze({
  repository: "owner/repository",
  gitSha: "a".repeat(40),
  sourceArchiveSha256: hash("1"),
  policyFingerprint: hash("2"),
  workflowFingerprint: hash("3"),
  toolchainFingerprint: hash("4"),
  migrationSequenceSha256: hash("5"),
  dependencyLockFingerprint: hash("6"),
  customerConfigFingerprint: hash("7"),
});
const passed = Object.freeze({ executed: 2, passed: 2, failed: 0, skipped: 0 });

function terminal(overrides = {}) {
  return {
    contract: STRICT_RECEIPT_SCHEMA,
    profile: "strict",
    status: "passed",
    exitCode: 0,
    identity,
    checks: {
      web: passed,
      server: passed,
      database: passed,
      browser: passed,
      security: passed,
    },
    timeSensitiveChecks: {
      vulnerabilityDatabase: {
        status: "passed",
        checkedAt: "2026-08-09T00:00:00.000Z",
        validUntil: "2026-08-10T00:00:00.000Z",
      },
    },
    ...overrides,
  };
}

const trust = Object.freeze({
  repository: true,
  protectedDefaultBranch: true,
  workflow: true,
  artifactDigest: true,
  run: true,
  job: true,
});

test("same exact identity and trusted provenance can reuse strict", () => {
  const result = evaluateStrictReceiptReuse({
    terminal: terminal(),
    expectedIdentity: identity,
    trust,
    now: Date.parse("2026-08-09T12:00:00.000Z"),
  });
  assert.deepEqual(result, {
    reusable: true,
    reason: "exact_identity",
    refreshChecks: [],
  });
});

for (const field of [
  "gitSha",
  "sourceArchiveSha256",
  "policyFingerprint",
  "workflowFingerprint",
  "toolchainFingerprint",
  "migrationSequenceSha256",
  "dependencyLockFingerprint",
  "customerConfigFingerprint",
]) {
  test(`${field} drift invalidates deterministic strict reuse`, () => {
    const expectedIdentity = {
      ...identity,
      [field]: field === "gitSha" ? "b".repeat(40) : hash("8"),
    };
    const result = evaluateStrictReceiptReuse({
      terminal: terminal(),
      expectedIdentity,
      trust,
    });
    assert.equal(result.reusable, false);
    assert.match(result.reason, new RegExp(field, "u"));
  });
}

test("untrusted PR, fork, non-default branch, run, job or artifact is rejected", () => {
  for (const field of Object.keys(trust)) {
    const result = evaluateStrictReceiptReuse({
      terminal: terminal(),
      expectedIdentity: identity,
      trust: { ...trust, [field]: false },
    });
    assert.deepEqual(result, {
      reusable: false,
      reason: "untrusted_provenance",
      refreshChecks: [],
    });
  }
});

test("failed, missing, unbalanced and skipped category evidence is rejected", () => {
  for (const invalid of [
    { status: "failed", exitCode: 1 },
    { checks: { ...terminal().checks, web: { ...passed, skipped: 1 } } },
    {
      checks: {
        ...terminal().checks,
        web: { ...passed, passed: 1, failed: 1 },
      },
    },
    { checks: { ...terminal().checks, web: undefined } },
  ]) {
    assert.throws(() => validateStrictReceiptEvidence(terminal(invalid)));
  }
});

test("expired time-sensitive evidence refreshes only the expired check", () => {
  const result = evaluateStrictReceiptReuse({
    terminal: terminal(),
    expectedIdentity: identity,
    trust,
    now: Date.parse("2026-08-10T00:00:00.000Z"),
  });
  assert.equal(result.reusable, true);
  assert.deepEqual(result.refreshChecks, ["vulnerabilityDatabase"]);
  const refreshed = refreshedTimeSensitiveCheck({
    terminal: terminal(),
    key: "vulnerabilityDatabase",
    checkedAt: "2026-08-10T01:00:00.000Z",
    validForMs: 86_400_000,
    provenance: { source: "github-actions", runId: "123" },
  });
  assert.equal(
    refreshed.timeSensitiveChecks.vulnerabilityDatabase.validUntil,
    "2026-08-11T01:00:00.000Z",
  );
});
