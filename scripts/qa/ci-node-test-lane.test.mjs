import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CI_NODE_TEST_LANES,
  CI_NODE_TEST_LANE_SCHEMA,
  ciNodeTestLaneCommandFingerprint,
  expectedCiNodeTestLaneFiles,
  loadCiNodeTestLaneSet,
  validateCiNodeTestLaneCatalog,
  validateCiNodeTestLaneSet,
} from "./ci-node-test-lane.mjs";
import { catalogNodeTests } from "./run-node-tests.mjs";
import { EXPLICIT_ONLY_NODE_TESTS } from "./node-test-groups.mjs";
import {
  PRODUCTION_PREFLIGHT_TEST_LANES,
  productionPreflightLaneForIndex,
} from "../deploy/production-preflight-test-lane.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const expected = Object.freeze({
  repository: "saurick/plush-toy-erp",
  gitSha: sha,
  pipelineId: "12",
  pipelineIid: "7",
  pipelineSource: "push",
  planSha256: digest,
  rangeSha256: "c".repeat(64),
  range: `${sha}..HEAD`,
});

function receipt(lane, index) {
  const definition = CI_NODE_TEST_LANES[lane];
  const durationMs = index + 100;
  const startedAt = new Date(1_700_000_000_000 + index * 1_000).toISOString();
  const finishedAt = new Date(Date.parse(startedAt) + durationMs).toISOString();
  const profileTimings = definition.profiles.map((profile, profileIndex) => ({
    profile,
    durationMs: index + profileIndex + 1,
    tests: index + profileIndex + 1,
  }));
  const tests = profileTimings.reduce(
    (total, timing) => total + timing.tests,
    0,
  );
  return {
    schemaVersion: CI_NODE_TEST_LANE_SCHEMA,
    lane,
    status: "passed",
    repository: expected.repository,
    gitSha: expected.gitSha,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: { id: "12", iid: "7", source: "push" },
    job: { id: String(index + 20), name: definition.job },
    commandFingerprint: ciNodeTestLaneCommandFingerprint(lane),
    plan: {
      planSha256: expected.planSha256,
      rangeSha256: expected.rangeSha256,
      range: expected.range,
    },
    profiles: [...definition.profiles],
    testFiles: [...expectedCiNodeTestLaneFiles(lane)],
    testFileCount: expectedCiNodeTestLaneFiles(lane).length,
    testPartition: definition.testPartition || null,
    startedAt,
    finishedAt,
    durationMs,
    profileTimings,
    summary: {
      tests,
      pass: tests,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsRawLogs: false,
    },
  };
}

function receipts() {
  return Object.keys(CI_NODE_TEST_LANES).map(receipt);
}

test("Node lane catalog covers parallel_safe with one controlled preflight partition", () => {
  assert.deepEqual(Object.keys(CI_NODE_TEST_LANES), [
    "core",
    "release_preflight_a",
    "release_preflight_b",
    "release_a",
    "release_b",
    "release_c",
  ]);
  assert.deepEqual(CI_NODE_TEST_LANES.core.profiles, [
    "fast",
    "database",
    "browser",
  ]);
  for (const lane of [
    "release_preflight_a",
    "release_preflight_b",
    "release_a",
    "release_b",
    "release_c",
  ]) {
    assert.deepEqual(CI_NODE_TEST_LANES[lane].profiles, ["release"]);
  }
  for (const lane of ["release_preflight_a", "release_preflight_b"]) {
    assert.deepEqual(expectedCiNodeTestLaneFiles(lane), [
      "scripts/deploy/production-preflight.test.mjs",
    ]);
  }
  assert.equal(expectedCiNodeTestLaneFiles("release_a").length, 30);
  assert.equal(expectedCiNodeTestLaneFiles("release_b").length, 30);
  assert.equal(expectedCiNodeTestLaneFiles("release_c").length, 28);
  assert.ok(
    expectedCiNodeTestLaneFiles("release_a").includes(
      "scripts/qa/pre-push-receipt.test.mjs",
    ),
  );
  assert.ok(
    expectedCiNodeTestLaneFiles("release_b").includes(
      "scripts/deploy/migrate-online.test.mjs",
    ),
  );
  assert.ok(
    expectedCiNodeTestLaneFiles("release_b").includes(
      "scripts/deploy/run-smoke-script.test.mjs",
    ),
  );
  assert.deepEqual(
    [
      ...expectedCiNodeTestLaneFiles("release_preflight_a"),
      ...expectedCiNodeTestLaneFiles("release_a"),
      ...expectedCiNodeTestLaneFiles("release_b"),
      ...expectedCiNodeTestLaneFiles("release_c"),
    ].sort(),
    [...catalogNodeTests("release")].sort(),
  );

  const catalog = validateCiNodeTestLaneCatalog();
  assert.equal(catalog.ok, true);
  assert.deepEqual(catalog.duplicates, []);
  assert.deepEqual(catalog.partitioned, [
    "scripts/deploy/production-preflight.test.mjs",
  ]);
  assert.deepEqual(
    catalog.actual,
    [...catalogNodeTests("parallel_safe")].sort(),
  );
  assert.equal(
    EXPLICIT_ONLY_NODE_TESTS.some((file) => catalog.actual.includes(file)),
    false,
  );
  assert.equal(
    catalog.actual.includes(
      "scripts/deploy/bootstrap-production-admin.test.mjs",
    ),
    false,
  );
});

test("production preflight partitions alternate every top-level test deterministically", () => {
  assert.deepEqual(PRODUCTION_PREFLIGHT_TEST_LANES, ["a", "b"]);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) =>
      productionPreflightLaneForIndex(index),
    ),
    ["a", "b", "a", "b", "a", "b", "a", "b"],
  );
  assert.throws(() => productionPreflightLaneForIndex(-1), /non-negative/u);
});

test("Node fan-in rejects missing, duplicate, skipped, drifted and extra lane evidence", async (t) => {
  const values = receipts();
  assert.equal(
    validateCiNodeTestLaneSet(values, expected).size,
    Object.keys(CI_NODE_TEST_LANES).length,
  );
  assert.throws(
    () => validateCiNodeTestLaneSet(values.slice(1), expected),
    /every lane/u,
  );

  const duplicate = structuredClone(values);
  duplicate[1] = structuredClone(duplicate[0]);
  assert.throws(
    () => validateCiNodeTestLaneSet(duplicate, expected),
    /invalid/u,
  );

  const skipped = structuredClone(values);
  skipped[0].summary.pass -= 1;
  skipped[0].summary.skipped = 1;
  assert.throws(() => validateCiNodeTestLaneSet(skipped, expected), /invalid/u);

  const invalidDuration = structuredClone(values);
  invalidDuration[0].durationMs = -1;
  assert.throws(
    () => validateCiNodeTestLaneSet(invalidDuration, expected),
    /invalid/u,
  );

  const drifted = structuredClone(values);
  drifted[0].testFiles = drifted[0].testFiles.slice(1);
  drifted[0].testFileCount -= 1;
  assert.throws(() => validateCiNodeTestLaneSet(drifted, expected), /invalid/u);

  const root = await mkdtemp(path.join(os.tmpdir(), "plush-node-lanes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const value of values) {
    await writeFile(
      path.join(root, `${value.lane}.json`),
      `${JSON.stringify(value)}\n`,
      { mode: 0o600 },
    );
  }
  const loaded = loadCiNodeTestLaneSet({
    root: path.dirname(root),
    directory: path.basename(root),
    expected,
  });
  assert.equal(loaded.laneCount, Object.keys(CI_NODE_TEST_LANES).length);
  assert.equal(
    loaded.testFileCount,
    catalogNodeTests("parallel_safe").length + 1,
  );
  assert.equal(loaded.summary.fail, 0);
  assert.equal(loaded.summary.skipped, 0);

  await writeFile(path.join(root, "extra.json"), "{}\n", { mode: 0o600 });
  assert.throws(
    () =>
      loadCiNodeTestLaneSet({
        root: path.dirname(root),
        directory: path.basename(root),
        expected,
      }),
    /ambiguous/u,
  );
});
