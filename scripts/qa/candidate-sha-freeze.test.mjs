import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCandidateFreezePlan,
  CANDIDATE_SHA_FREEZE_SCENARIOS,
  CANDIDATE_SHA_FREEZE_TESTS,
  validateCandidateFreezeTerminal,
} from "./candidate-sha-freeze.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);

function passedTerminal() {
  const counts = { executed: 2, passed: 2, failed: 0, skipped: 0 };
  return {
    contract: "plush.exact-sha-strict/v3",
    gitSha: SHA,
    profile: "strict",
    status: "passed",
    exitCode: 0,
    fingerprint: HASH,
    identity: {
      repository: "saurick/plush-toy-erp",
      gitSha: SHA,
      sourceArchiveSha256: HASH,
      policyFingerprint: HASH,
      workflowFingerprint: HASH,
      toolchainFingerprint: HASH,
      migrationSequenceSha256: HASH,
      dependencyLockFingerprint: HASH,
      customerConfigFingerprint: HASH,
    },
    checks: {
      web: counts,
      server: counts,
      database: counts,
      browser: counts,
      security: counts,
    },
    timeSensitiveChecks: {
      vulnerabilityDatabase: {
        status: "passed",
        checkedAt: "2026-08-09T00:00:00.000Z",
        validUntil: "2026-08-10T00:00:00.000Z",
      },
    },
    receipt: { sha256: HASH },
  };
}

test("candidate freeze binds a passed strict terminal to the exact SHA", () => {
  assert.equal(
    validateCandidateFreezeTerminal(passedTerminal(), SHA).gitSha,
    SHA,
  );
  assert.throws(
    () =>
      validateCandidateFreezeTerminal(
        { ...passedTerminal(), status: "failed", exitCode: 1 },
        SHA,
      ),
    /passed exact-SHA/u,
  );
  assert.throws(
    () => validateCandidateFreezeTerminal(passedTerminal(), "c".repeat(40)),
    /passed exact-SHA/u,
  );
});

test("candidate freeze runs one fixed contract matrix and both workbench themes", () => {
  const plan = buildCandidateFreezePlan("/repo");
  assert.deepEqual(
    plan.map((step) => step.id),
    ["contract_matrix", "workbench_light_dark"],
  );
  assert.deepEqual(
    plan[1].env.STYLE_L1_SCENARIOS.split(","),
    CANDIDATE_SHA_FREEZE_SCENARIOS,
  );
  assert.equal(
    CANDIDATE_SHA_FREEZE_TESTS.includes(
      "scripts/deploy/github-strict-terminal-reuse.test.mjs",
    ),
    true,
  );
  assert.equal(
    CANDIDATE_SHA_FREEZE_TESTS.includes(
      "scripts/qa/dev-workbench-production-boundary.test.mjs",
    ),
    true,
  );
});
