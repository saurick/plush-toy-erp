import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CI_QUALITY_WORKLOAD_LANES,
  CI_QUALITY_WORKLOAD_LANE_SCHEMA,
  ciQualityWorkloadLaneCommandFingerprint,
  hasCompleteCiQualityWorkloadLaneEvidence,
  loadCiQualityWorkloadLaneSet,
  parseCompletedTestGates,
  validateCiQualityWorkloadLaneSet,
} from "./ci-quality-workload-lane.mjs";

const sha = "a".repeat(40);
const expected = Object.freeze({
  repository: "saurick/plush-toy-erp",
  gitSha: sha,
  pipelineId: "12",
  pipelineIid: "7",
  pipelineSource: "push",
  planSha256: "b".repeat(64),
  rangeSha256: "c".repeat(64),
  range: `${sha}..HEAD`,
});

function receipt(workload, lane, index = 0) {
  const definition = CI_QUALITY_WORKLOAD_LANES[workload][lane];
  const startedAt = new Date(1_700_000_000_000 + index * 1_000).toISOString();
  const durationMs = 100 + index;
  const testGates = definition.testGates.map((label) => ({
    label,
    executed: 5,
    passed: 5,
    failed: 0,
    skipped: 0,
  }));
  const executed = definition.stages.length + testGates.length * 5;
  return {
    schemaVersion: CI_QUALITY_WORKLOAD_LANE_SCHEMA,
    shard: workload,
    workload,
    lane,
    status: "passed",
    repository: expected.repository,
    gitSha: expected.gitSha,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: { id: "12", iid: "7", source: "push" },
    job: { id: String(30 + index), name: definition.job },
    commandFingerprint: ciQualityWorkloadLaneCommandFingerprint(workload, lane),
    plan: {
      planSha256: expected.planSha256,
      rangeSha256: expected.rangeSha256,
      range: expected.range,
    },
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
    durationMs,
    expectedStages: [...definition.stages],
    stageTimings: definition.stages.map((id) => ({
      id,
      status: "passed",
      durationMs: 10,
    })),
    substepTimings: definition.substeps.map((id) => ({
      stage: "web",
      id,
      status: "passed",
      durationMs: 10,
    })),
    testGates,
    summary: { executed, passed: executed, failed: 0, skipped: 0 },
    invariants: {
      makeData: definition.resources.makeData ? "passed" : "not-applicable",
      databaseCleanup: definition.resources.postgres
        ? "passed"
        : "not-applicable",
      chromiumSandboxCleanup: definition.resources.chromium
        ? "passed"
        : "not-applicable",
      playwrightRuntimeCleanup: definition.resources.chromium
        ? "passed"
        : "not-applicable",
      webBuildSha256:
        workload === "web" && lane === "build" ? "d".repeat(64) : null,
      criticalPostgresRegistrySha256:
        workload === "server" ? "e".repeat(64) : null,
    },
    cleanupPassed: true,
    failure: null,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawLogs: false,
    },
  };
}

test("workload lane registry is exact and keeps the seven-shard internals isolated", () => {
  assert.deepEqual(Object.keys(CI_QUALITY_WORKLOAD_LANES.web), [
    "validation",
    "build",
  ]);
  assert.deepEqual(Object.keys(CI_QUALITY_WORKLOAD_LANES.server), [
    "core",
    "critical",
  ]);
  assert.deepEqual(
    Object.values(CI_QUALITY_WORKLOAD_LANES.web).flatMap(
      (definition) => definition.substeps,
    ),
    [
      "eslint",
      "stylelint",
      "web_test",
      "production_build",
      "production_boundary",
    ],
  );
  assert.equal(CI_QUALITY_WORKLOAD_LANES.server.core.resources.chromium, true);
  assert.equal(
    CI_QUALITY_WORKLOAD_LANES.server.critical.resources.chromium,
    false,
  );
  assert.equal(CI_QUALITY_WORKLOAD_LANES.server.core.resources.postgres, true);
  assert.equal(
    CI_QUALITY_WORKLOAD_LANES.server.critical.resources.postgres,
    true,
  );
});

test("workload lane receipts fail closed on skip, identity and duplicate drift", () => {
  for (const workload of ["web", "server"]) {
    const values = Object.keys(CI_QUALITY_WORKLOAD_LANES[workload]).map(
      (lane, index) => receipt(workload, lane, index),
    );
    assert.equal(
      validateCiQualityWorkloadLaneSet(values, expected, workload).size,
      2,
    );
    const skipped = structuredClone(values);
    skipped[0].summary = {
      ...skipped[0].summary,
      passed: skipped[0].summary.passed - 1,
      skipped: 1,
    };
    assert.throws(
      () => validateCiQualityWorkloadLaneSet(skipped, expected, workload),
      /invalid/u,
    );
    const duplicate = structuredClone(values);
    duplicate[1] = structuredClone(duplicate[0]);
    assert.throws(
      () => validateCiQualityWorkloadLaneSet(duplicate, expected, workload),
      /duplicate/u,
    );
  }
});

test("workload lane loader rejects missing and extra artifacts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "plush-workload-lanes-"));
  try {
    const directory = path.join(root, "output/ci/workload-lanes/web");
    mkdirSync(directory, { recursive: true });
    for (const [index, lane] of ["validation", "build"].entries()) {
      writeFileSync(
        path.join(directory, `${lane}.json`),
        `${JSON.stringify(receipt("web", lane, index))}\n`,
      );
    }
    const aggregate = loadCiQualityWorkloadLaneSet({
      root,
      expected,
      workload: "web",
    });
    assert.equal(
      hasCompleteCiQualityWorkloadLaneEvidence(aggregate, "web"),
      true,
    );
    for (const mutate of [
      (value) => value.stageIds.reverse(),
      (value) => {
        value.summary.skipped = 1;
        value.summary.passed -= 1;
      },
      (value) => {
        value.cleanup[0].database = "passed";
      },
      (value) => {
        value.testGates[0].skipped = 1;
        value.testGates[0].passed -= 1;
      },
    ]) {
      const drifted = structuredClone(aggregate);
      mutate(drifted);
      assert.equal(
        hasCompleteCiQualityWorkloadLaneEvidence(drifted, "web"),
        false,
      );
    }
    writeFileSync(path.join(directory, "extra.json"), "{}\n");
    assert.throws(
      () => loadCiQualityWorkloadLaneSet({ root, expected, workload: "web" }),
      /ambiguous/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("completed test-gate parser preserves normalized all-pass evidence only", () => {
  assert.deepEqual(
    parseCompletedTestGates(
      "[qa:test-gate] label=web-all status=complete tests=9 pass=9 fail=0 skipped=0\n",
    ),
    [
      {
        label: "web-all",
        executed: 9,
        passed: 9,
        failed: 0,
        skipped: 0,
      },
    ],
  );
});
