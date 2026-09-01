import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CI_BROWSER_QUALITY_LANES,
  CI_BROWSER_QUALITY_SCENARIOS,
  CI_QUALITY_STAGE_LANE_SCHEMA,
  CI_SERVER_QUALITY_LANES,
  CI_WEB_QUALITY_LANES,
  ciQualityStageLaneCommandFingerprint,
  createCiQualityLaneTerminationController,
  loadCiQualityStageLaneSet,
  parseCiBrowserScenarioTimings,
  validateCiBrowserQualityLaneRegistry,
  validateCiQualityStageLaneReceipt,
} from "./ci-quality-stage-lane.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const laneSource = readFileSync(
  new URL("./ci-quality-stage-lane.mjs", import.meta.url),
  "utf8",
);
const managedAuxPortSources = [
  "../../web/scripts/realLoginSmokeShared.mjs",
  "../../web/scripts/purchaseContractRealLoginSmoke.mjs",
  "../../web/scripts/processingContractRealLoginSmoke.mjs",
  "../../web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs",
  "../../web/scripts/mobileAuthLoginRouteSmoke.mjs",
  "../../web/scripts/trialDemoAccountBrowserSmoke.mjs",
  "../../web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs",
].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));
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
  assert.match(laneSource, /detached: process[.]platform !== "win32"/u);
  assert.match(laneSource, /process[.]kill\(-child[.]pid, signal\)/u);
  assert.match(
    laneSource,
    /failure \|\|= new Error\(`quality lane interrupted by \$\{termination[.]signal\}`\)/u,
  );
});

function registry(shard) {
  if (shard === "web") return CI_WEB_QUALITY_LANES;
  if (shard === "server") return CI_SERVER_QUALITY_LANES;
  return CI_BROWSER_QUALITY_LANES;
}

function receipt(shard, lane, index) {
  const definition = registry(shard)[lane];
  const durationMs = 100 + index;
  const startedAt = new Date(1_700_000_000_000 + index * 1_000).toISOString();
  const tests =
    shard === "browser"
      ? definition.browserScenarios.length +
        (definition.productionBoundary ? 1 : 0)
      : definition.requiresTests
        ? 10 + index
        : 0;
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
      chromiumSandboxCleanup: definition.chromium ? "passed" : "not-applicable",
      playwrightRuntimeCleanup: definition.chromium
        ? "passed"
        : "not-applicable",
      browserRuntimeCleanup: shard === "browser" ? "passed" : "not-applicable",
      browserLaneLockCleanup: shard === "browser" ? "passed" : "not-applicable",
      browserPortCleanup: shard === "browser" ? "passed" : "not-applicable",
      webBuildReceipt: definition.consumesWebBuild
        ? "passed"
        : "not-applicable",
      webBuildReadOnly: definition.consumesWebBuild
        ? "passed"
        : "not-applicable",
    },
    webBuildSha256:
      (shard === "web" && lane === "build") || shard === "browser"
        ? "d".repeat(64)
        : null,
    browser:
      shard === "browser"
        ? {
            scenarios: [...definition.browserScenarios],
            scenarioTimings: definition.browserScenarios.map((id) => ({
              id,
              status: "passed",
              durationMs: 5 + index,
              attempts: 1,
            })),
            productionBoundary: definition.productionBoundary,
            boundaryDurationMs: definition.productionBoundary ? 10 : null,
            portOffset: definition.portOffset,
            retries: 0,
          }
        : null,
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

test("Web, Server and Browser internal lane catalogs partition canonical work once", () => {
  assert.deepEqual(Object.keys(CI_WEB_QUALITY_LANES), ["checks", "build"]);
  assert.deepEqual(Object.keys(CI_SERVER_QUALITY_LANES), [
    "core",
    "critical_postgres",
  ]);
  assert.deepEqual(Object.keys(CI_BROWSER_QUALITY_LANES), [
    "boundary_entry_print",
    "dev_overview_mobile",
    "dev_detail",
  ]);
  assert.deepEqual(
    Object.values(CI_WEB_QUALITY_LANES).flatMap(({ substeps }) => substeps),
    [
      "eslint",
      "stylelint",
      "web_test",
      "production_build",
      "production_boundary",
    ],
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
  assert.equal(validateCiBrowserQualityLaneRegistry(), true);
  assert.deepEqual(
    Object.values(CI_BROWSER_QUALITY_LANES)
      .flatMap(({ browserScenarios }) => browserScenarios)
      .sort(),
    [...CI_BROWSER_QUALITY_SCENARIOS].sort(),
  );
  assert.equal(
    Object.values(CI_BROWSER_QUALITY_LANES).filter(
      ({ productionBoundary }) => productionBoundary,
    ).length,
    1,
  );
  const existingManagedOffsets = managedAuxPortSources.map((source) => {
    const matches = [
      ...source.matchAll(/resolveDevAuxPort\([\s\S]{0,160}?,\s*(\d+),/gu),
    ];
    assert.equal(matches.length, 1);
    return Number(matches[0][1]);
  });
  const browserLaneOffsets = Object.values(CI_BROWSER_QUALITY_LANES).map(
    ({ portOffset }) => portOffset,
  );
  assert.deepEqual(
    browserLaneOffsets.filter((offset) =>
      existingManagedOffsets.includes(offset),
    ),
    [],
  );
  assert.throws(
    () =>
      validateCiBrowserQualityLaneRegistry({
        ...CI_BROWSER_QUALITY_LANES,
        dev_detail: {
          ...CI_BROWSER_QUALITY_LANES.dev_detail,
          browserScenarios: [
            ...CI_BROWSER_QUALITY_LANES.dev_detail.browserScenarios,
          ].reverse(),
        },
      }),
    /incomplete or ambiguous/u,
  );
});

test("Browser scenario evidence is exact, single-attempt and duplicate closed", () => {
  const output = [
    "[style:l1:scenario] id=root-redirect-desktop status=passed durationMs=12 attempts=1",
    "[style:l1:scenario] id=root-redirect-mobile status=passed durationMs=9 attempts=1",
  ].join("\n");
  assert.deepEqual(
    parseCiBrowserScenarioTimings(output, [
      "root-redirect-desktop",
      "root-redirect-mobile",
    ]).map(({ id, attempts }) => ({ id, attempts })),
    [
      { id: "root-redirect-desktop", attempts: 1 },
      { id: "root-redirect-mobile", attempts: 1 },
    ],
  );
  assert.throws(
    () =>
      parseCiBrowserScenarioTimings(
        `${output}\n[style:l1:scenario] id=root-redirect-mobile status=passed durationMs=10 attempts=1`,
        ["root-redirect-desktop", "root-redirect-mobile"],
      ),
    /ambiguous/u,
  );
  assert.throws(
    () =>
      parseCiBrowserScenarioTimings(
        "[style:l1:scenario] id=root-redirect-desktop status=passed durationMs=12 attempts=2",
        ["root-redirect-desktop"],
      ),
    /ambiguous/u,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(`quality lane ${signal} targets only its active owned process group`, () => {
    const processRef = new EventEmitter();
    const calls = [];
    const child = { pid: 4242, exitCode: null, signalCode: null };
    const termination = createCiQualityLaneTerminationController({
      processRef,
      signalChildGroup: (value, valueSignal) => {
        calls.push({ child: value, signal: valueSignal });
        return true;
      },
    });
    termination.attach(child);
    processRef.emit(signal);
    processRef.emit(signal);
    processRef.emit(signal === "SIGTERM" ? "SIGINT" : "SIGTERM");
    assert.equal(termination.signal, signal);
    assert.deepEqual(calls, [{ child, signal }]);
    termination.detach(child);
    termination.dispose();
    assert.equal(processRef.listenerCount("SIGTERM"), 0);
    assert.equal(processRef.listenerCount("SIGINT"), 0);
  });
}

test("quality lane interruption received before spawn terminates the next owned child", () => {
  const processRef = new EventEmitter();
  const calls = [];
  const child = { pid: 5252, exitCode: null, signalCode: null };
  const termination = createCiQualityLaneTerminationController({
    processRef,
    signalChildGroup: (value, signal) => {
      calls.push({ child: value, signal });
      return true;
    },
  });
  processRef.emit("SIGTERM");
  termination.attach(child);
  assert.deepEqual(calls, [{ child, signal: "SIGTERM" }]);
  termination.detach(child);
  termination.dispose();
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
  const browser = receipt("browser", "dev_detail", 2);
  browser.invariants.browserPortCleanup = "failed";
  assert.throws(
    () =>
      validateCiQualityStageLaneReceipt(browser, {
        shard: "browser",
        lane: "dev_detail",
        expected,
      }),
    /invalid/u,
  );
});

test("fan-in accepts every lane exactly once and rejects extra artifacts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-quality-lanes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const shard of ["web", "server", "browser"]) {
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
    assert.equal(aggregate.laneCount, Object.keys(registry(shard)).length);
    assert.equal(aggregate.jobs.length, Object.keys(registry(shard)).length);
    assert.equal(aggregate.summary.failed, 0);
    assert.equal(aggregate.summary.skipped, 0);
    if (shard === "web") {
      assert.deepEqual(
        aggregate.stageTimings.map(({ id }) => id),
        ["web"],
      );
      assert.equal(aggregate.webBuildSha256, "d".repeat(64));
    } else if (shard === "server") {
      assert.deepEqual(
        aggregate.stageTimings.map(({ id }) => id),
        ["environment_profile", "server", "critical_postgres"],
      );
      assert.equal(aggregate.cleanup.database, "passed");
    } else {
      assert.deepEqual(
        aggregate.stageTimings.map(({ id }) => id),
        ["browser"],
      );
      assert.equal(aggregate.browser.scenarioCount, 10);
      assert.equal(aggregate.browser.productionBoundaryCount, 1);
      assert.equal(aggregate.browser.retries, 0);
      assert.equal(aggregate.cleanup.chromiumSandbox, "passed");
      assert.equal(aggregate.cleanup.playwrightRuntime, "passed");
      assert.equal(aggregate.cleanup.browserRuntime, "passed");
      assert.equal(aggregate.cleanup.browserLaneLock, "passed");
      assert.equal(aggregate.cleanup.browserPort, "passed");
      assert.equal(aggregate.webBuildSha256, "d".repeat(64));
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
