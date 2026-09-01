import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CI_QUALITY_STAGE_LANE_SCHEMA,
  CI_SERVER_QUALITY_LANES,
  CI_WEB_QUALITY_LANES,
  ciQualityStageLaneCommandFingerprint,
  loadCiQualityStageLaneSet,
  validateCiQualityStageLaneReceipt,
} from "./ci-quality-stage-lane.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const laneSource = readFileSync(
  new URL("./ci-quality-stage-lane.mjs", import.meta.url),
  "utf8",
);
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

test("Server Chromium lane uses only the digest-pinned sandbox helper", () => {
  assert.match(
    laneSource,
    /"\/usr\/local\/sbin\/plush-chromium-sandbox",\n {10}"install"/u,
  );
  assert.match(
    laneSource,
    /"\/usr\/local\/sbin\/plush-chromium-sandbox",\n {10}"remove"/u,
  );
  assert.doesNotMatch(laneSource, /"install",\n {10}"-o",\n {10}"root"/u);
});

function registry(shard) {
  return shard === "web" ? CI_WEB_QUALITY_LANES : CI_SERVER_QUALITY_LANES;
}

function receipt(shard, lane, index) {
  const definition = registry(shard)[lane];
  const durationMs = 100 + index;
  const startedAt = new Date(1_700_000_000_000 + index * 1_000).toISOString();
  const tests = definition.requiresTests ? 10 + index : 0;
  return {
    schemaVersion: CI_QUALITY_STAGE_LANE_SCHEMA,
    shard,
    lane,
    status: "passed",
    repository: expected.repository,
    gitSha: expected.gitSha,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: { id: "12", iid: "7", source: "push" },
    job: { id: String(index + 20), name: definition.job },
    commandFingerprint: ciQualityStageLaneCommandFingerprint(shard, lane),
    plan: {
      planSha256: expected.planSha256,
      rangeSha256: expected.rangeSha256,
      range: expected.range,
    },
    expectedStages: [...definition.stages],
    stageTimings: definition.stages.map((id) => ({
      id,
      status: "passed",
      durationMs: 20 + index,
    })),
    substepTimings: definition.substeps.map((id) => ({
      stage: "web",
      id,
      status: "passed",
      durationMs: 2 + index,
    })),
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
    durationMs,
    summary: { executed: tests, passed: tests, failed: 0, skipped: 0 },
    categoryCounts: Object.fromEntries(
      ["web", "server", "database", "browser", "security"].map((key) => [
        key,
        { executed: 0, passed: 0, failed: 0, skipped: 0 },
      ]),
    ),
    invariants: {
      makeData: definition.makeData ? "passed" : "not-applicable",
      databaseCleanup: definition.postgres ? "passed" : "not-applicable",
      chromiumSandboxCleanup: definition.chromium
        ? "passed"
        : "not-applicable",
      playwrightRuntimeCleanup: definition.chromium
        ? "passed"
        : "not-applicable",
    },
    webBuildSha256:
      shard === "web" && lane === "build" ? "d".repeat(64) : null,
    cleanupPassed: true,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawLogs: false,
    },
  };
}

test("Web and Server internal lane catalogs partition the canonical stages once", () => {
  assert.deepEqual(Object.keys(CI_WEB_QUALITY_LANES), ["checks", "build"]);
  assert.deepEqual(Object.keys(CI_SERVER_QUALITY_LANES), [
    "core",
    "critical_postgres",
  ]);
  assert.deepEqual(
    Object.values(CI_WEB_QUALITY_LANES).flatMap(({ substeps }) => substeps),
    ["eslint", "stylelint", "web_test", "production_build", "production_boundary"],
  );
  assert.deepEqual(
    Object.values(CI_SERVER_QUALITY_LANES).flatMap(({ stages }) => stages),
    ["environment_profile", "server", "critical_postgres"],
  );
  assert.equal(CI_WEB_QUALITY_LANES.checks.requiresTests, true);
  assert.equal(CI_WEB_QUALITY_LANES.build.requiresTests, false);
  assert.equal(CI_SERVER_QUALITY_LANES.core.postgres, true);
  assert.equal(CI_SERVER_QUALITY_LANES.core.makeData, true);
  assert.equal(CI_SERVER_QUALITY_LANES.core.chromium, true);
  assert.equal(CI_SERVER_QUALITY_LANES.critical_postgres.postgres, true);
  assert.equal(CI_SERVER_QUALITY_LANES.critical_postgres.makeData, false);
  assert.equal(CI_SERVER_QUALITY_LANES.critical_postgres.chromium, false);
});

test("lane plan range accepts only canonical two-dot or three-dot history", () => {
  assert.equal(
    laneSource.includes(
      "const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\\^)\\.\\.\\.?HEAD$/u;",
    ),
    true,
  );
  assert.equal(
    laneSource.includes(
      "const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\\^)\\.\\.?HEAD$/u;",
    ),
    false,
  );
});

test("lane receipts reject skipped, drifted and incomplete cleanup evidence", () => {
  const value = receipt("server", "core", 1);
  assert.equal(
    validateCiQualityStageLaneReceipt(value, {
      shard: "server",
      lane: "core",
      expected,
    }),
    value,
  );
  const skipped = structuredClone(value);
  skipped.summary.passed -= 1;
  skipped.summary.skipped = 1;
  assert.throws(
    () =>
      validateCiQualityStageLaneReceipt(skipped, {
        shard: "server",
        lane: "core",
        expected,
      }),
    /invalid/u,
  );
  const drifted = structuredClone(value);
  drifted.expectedStages = ["server"];
  assert.throws(
    () =>
      validateCiQualityStageLaneReceipt(drifted, {
        shard: "server",
        lane: "core",
        expected,
      }),
    /invalid/u,
  );
  const dirty = structuredClone(value);
  dirty.cleanupPassed = false;
  assert.throws(
    () =>
      validateCiQualityStageLaneReceipt(dirty, {
        shard: "server",
        lane: "core",
        expected,
      }),
    /invalid/u,
  );
});

test("fan-in accepts every lane exactly once and rejects extra artifacts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-quality-lanes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const shard of ["web", "server"]) {
    const directory = path.join(root, shard);
    await mkdir(directory);
    let index = 0;
    for (const lane of Object.keys(registry(shard))) {
      await writeFile(
        path.join(directory, `${lane}.json`),
        `${JSON.stringify(receipt(shard, lane, index))}\n`,
        { mode: 0o600 },
      );
      index += 1;
    }
    const aggregate = loadCiQualityStageLaneSet({
      root,
      shard,
      directory,
      expected,
    });
    assert.equal(aggregate.laneCount, 2);
    assert.equal(aggregate.jobs.length, 2);
    assert.equal(aggregate.summary.failed, 0);
    assert.equal(aggregate.summary.skipped, 0);
    if (shard === "web") {
      assert.deepEqual(aggregate.stageTimings.map(({ id }) => id), ["web"]);
      assert.equal(aggregate.webBuildSha256, "d".repeat(64));
    } else {
      assert.deepEqual(
        aggregate.stageTimings.map(({ id }) => id),
        ["environment_profile", "server", "critical_postgres"],
      );
      assert.equal(aggregate.cleanup.database, "passed");
    }
    await writeFile(path.join(directory, "extra.json"), "{}\n", {
      mode: 0o600,
    });
    assert.throws(
      () =>
        loadCiQualityStageLaneSet({
          root,
          shard,
          directory,
          expected,
        }),
      /ambiguous/u,
    );
  }
});
