import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CI_RESOURCE_TEST_LANES,
  CI_RESOURCE_TEST_LANE_SCHEMA,
  ciResourceTestLaneCommandFingerprint,
  loadCiResourceTestLaneSet,
  validateCiResourceTestLaneCatalog,
  validateCiResourceTestLaneSet,
} from "./ci-resource-test-lane.mjs";
import {
  BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES,
  bootstrapProductionAdminTestLaneCases,
} from "../deploy/bootstrap-production-admin.test-cases.mjs";
import { validateBootstrapProductionAdminTestRegistry } from "../deploy/bootstrap-production-admin.test-support.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const resourceLaneSource = readFileSync(
  new URL("./ci-resource-test-lane.mjs", import.meta.url),
  "utf8",
);
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

async function digestValue(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

async function receipt(lane, index) {
  const definition = CI_RESOURCE_TEST_LANES[lane];
  const cases = bootstrapProductionAdminTestLaneCases(lane);
  const durationMs = index + 100;
  const startedAt = new Date(1_700_000_000_000 + index * 1_000).toISOString();
  const finishedAt = new Date(Date.parse(startedAt) + durationMs).toISOString();
  return {
    schemaVersion: CI_RESOURCE_TEST_LANE_SCHEMA,
    lane,
    status: "passed",
    repository: expected.repository,
    gitSha: expected.gitSha,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: { id: "12", iid: "7", source: "push" },
    job: { id: String(index + 20), name: definition.job },
    commandFingerprint: ciResourceTestLaneCommandFingerprint(lane, repoRoot),
    plan: {
      planSha256: expected.planSha256,
      rangeSha256: expected.rangeSha256,
      range: expected.range,
    },
    testFile: definition.testFile,
    caseIds: cases.map(({ id }) => id),
    caseCount: cases.length,
    scenarioCount: cases.reduce(
      (total, definition) => total + definition.scenarioCount,
      0,
    ),
    caseDigest: await digestValue(cases),
    startedAt,
    finishedAt,
    durationMs,
    summary: {
      tests: cases.length,
      pass: cases.length,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    },
    cleanup: {
      preexistingEntryCount: 8,
      newEntryCount: 0,
      testCleanupGreen: true,
      finalInventoryPreserved: true,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsRawLogs: false,
    },
  };
}

async function receipts() {
  return Promise.all(Object.keys(CI_RESOURCE_TEST_LANES).map(receipt));
}

test("resource lane registry covers 39 cases and 86 scenarios exactly once", () => {
  assert.deepEqual(Object.keys(CI_RESOURCE_TEST_LANES), [
    "contract",
    "runtime",
  ]);
  assert.deepEqual(validateBootstrapProductionAdminTestRegistry(), {
    caseCount: 39,
    scenarioCount: 86,
  });
  const catalog = validateCiResourceTestLaneCatalog();
  assert.equal(catalog.ok, true);
  assert.equal(catalog.caseCount, 39);
  assert.equal(catalog.scenarioCount, 86);
  assert.deepEqual(catalog.duplicateIds, []);
  assert.equal(BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES.length, 39);
  assert.deepEqual(
    bootstrapProductionAdminTestLaneCases("contract").map(({ id }) => id),
    BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES.filter(
      ({ lane }) => lane === "contract",
    ).map(({ id }) => id),
  );
  assert.equal(bootstrapProductionAdminTestLaneCases("contract").length, 21);
  assert.equal(bootstrapProductionAdminTestLaneCases("runtime").length, 18);
});

test("resource lane plan range accepts only canonical two-dot or three-dot history", () => {
  assert.equal(
    resourceLaneSource.includes(
      "const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\\^)\\.\\.\\.?HEAD$/u;",
    ),
    true,
  );
  assert.equal(
    resourceLaneSource.includes(
      "const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\\^)\\.\\.?HEAD$/u;",
    ),
    false,
  );
});

test("resource fan-in rejects missing, duplicate, skipped, drifted, dirty and extra lane evidence", async (t) => {
  const values = await receipts();
  assert.equal(
    validateCiResourceTestLaneSet(values, expected, { root: repoRoot }).size,
    2,
  );
  assert.throws(
    () =>
      validateCiResourceTestLaneSet(values.slice(1), expected, {
        root: repoRoot,
      }),
    /every lane/u,
  );

  const duplicate = structuredClone(values);
  duplicate[1] = structuredClone(duplicate[0]);
  assert.throws(
    () =>
      validateCiResourceTestLaneSet(duplicate, expected, { root: repoRoot }),
    /invalid/u,
  );

  const skipped = structuredClone(values);
  skipped[0].summary.pass -= 1;
  skipped[0].summary.skipped = 1;
  assert.throws(
    () => validateCiResourceTestLaneSet(skipped, expected, { root: repoRoot }),
    /invalid/u,
  );

  const drifted = structuredClone(values);
  drifted[0].caseIds = drifted[0].caseIds.slice(1);
  drifted[0].caseCount -= 1;
  assert.throws(
    () => validateCiResourceTestLaneSet(drifted, expected, { root: repoRoot }),
    /invalid/u,
  );

  const dirty = structuredClone(values);
  dirty[0].cleanup.newEntryCount = 1;
  dirty[0].cleanup.testCleanupGreen = false;
  assert.throws(
    () => validateCiResourceTestLaneSet(dirty, expected, { root: repoRoot }),
    /invalid/u,
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "plush-resource-lanes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const value of values) {
    await writeFile(
      path.join(root, `${value.lane}.json`),
      `${JSON.stringify(value)}\n`,
      { mode: 0o600 },
    );
  }
  const loaded = loadCiResourceTestLaneSet({
    root: repoRoot,
    directory: root,
    expected,
  });
  assert.equal(loaded.laneCount, 2);
  assert.equal(loaded.caseCount, 39);
  assert.equal(loaded.scenarioCount, 86);
  assert.equal(loaded.summary.pass, 39);
  assert.equal(loaded.summary.skipped, 0);

  await writeFile(path.join(root, "extra.json"), "{}\n", { mode: 0o600 });
  assert.throws(
    () =>
      loadCiResourceTestLaneSet({
        root: repoRoot,
        directory: root,
        expected,
      }),
    /ambiguous/u,
  );
});
