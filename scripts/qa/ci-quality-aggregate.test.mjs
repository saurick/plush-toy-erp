import assert from "node:assert/strict";
import test from "node:test";

import {
  CI_QUALITY_AGGREGATE_SCHEMA,
  CI_EVIDENCE_MANIFEST_SCHEMA,
  buildObservedQualityPaths,
  hasCompleteCiBrowserCrossShardEvidence,
  hasCompleteCiBrowserLaneEvidence,
  hasCompleteCiNodeLaneEvidence,
  hasCompleteCiResourceLaneEvidence,
  hasCompleteCiServerLaneEvidence,
  hasCompleteCiWebLaneEvidence,
  matchesStrictSourceArchive,
  validateCiQualityShardSet,
} from "./ci-quality-aggregate.mjs";
import {
  CI_QUALITY_SHARDS,
  CI_QUALITY_SHARD_SCHEMA,
} from "./ci-quality-shard.mjs";
import {
  CI_NODE_TEST_LANES,
  expectedCiNodeTestLaneFiles,
} from "./ci-node-test-lane.mjs";
import { CI_RESOURCE_TEST_LANES } from "./ci-resource-test-lane.mjs";
import {
  CI_BROWSER_QUALITY_LANES,
  CI_BROWSER_QUALITY_SCENARIOS,
  CI_SERVER_QUALITY_LANES,
  CI_WEB_QUALITY_LANES,
} from "./ci-quality-stage-lane.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const expected = {
  repository: "saurick/plush-toy-erp",
  gitSha: sha,
  pipelineId: "12",
  pipelineIid: "7",
  pipelineSource: "push",
  planSha256: digest,
  rangeSha256: "c".repeat(64),
  range: `${sha}..HEAD`,
};

function fingerprint(shard, definition) {
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, stable(nested)]),
      );
    }
    return value;
  };
  return import("node:crypto").then(({ createHash }) =>
    createHash("sha256")
      .update(JSON.stringify(stable({ shard, definition })))
      .digest("hex"),
  );
}

async function receipts() {
  const values = [];
  for (const [shard, definition] of Object.entries(CI_QUALITY_SHARDS)) {
    const durationMs = values.length + 10;
    const startedAt = new Date(
      1_700_000_000_000 + values.length * 1_000,
    ).toISOString();
    values.push({
      schemaVersion: CI_QUALITY_SHARD_SCHEMA,
      shard,
      status: "passed",
      repository: expected.repository,
      gitSha: expected.gitSha,
      ref: "refs/heads/main",
      protectedDefaultBranch: true,
      pipeline: { id: "12", iid: "7", source: "push" },
      job: { id: String(values.length + 20), name: definition.job },
      startedAt,
      finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
      durationMs,
      commandFingerprint: await fingerprint(shard, definition),
      plan: {
        planSha256: expected.planSha256,
        rangeSha256: expected.rangeSha256,
        range: expected.range,
      },
      expectedStages: [...definition.stages],
      stageTimings: definition.stages.map((id) => ({
        id,
        status: "passed",
        durationMs: 1,
      })),
      substepTimings: [],
      summary: { executed: 1, passed: 1, failed: 0, skipped: 0 },
      categoryCounts: Object.fromEntries(
        ["web", "server", "database", "browser", "security"].map((key) => [
          key,
          {
            executed: key === "web" && shard === "web" ? 1 : 0,
            passed: key === "web" && shard === "web" ? 1 : 0,
            failed: 0,
            skipped: 0,
          },
        ]),
      ),
      cleanupPassed: true,
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsFullDsn: false,
        containsAbsoluteWorkspacePaths: false,
        containsRawLogs: false,
      },
    });
  }
  return values;
}

test("aggregate contracts keep dynamic Runner evidence in the strict external shape", () => {
  assert.equal(CI_QUALITY_AGGREGATE_SCHEMA, "plush.gitlab-strict-aggregate/v2");
  assert.equal(CI_EVIDENCE_MANIFEST_SCHEMA, "plush.gitlab-ci-evidence/v1");
});

test("aggregate matches the tagged shard archive digest to strict plain SHA-256", () => {
  assert.equal(
    matchesStrictSourceArchive(
      { status: "passed", archiveSha256: `sha256:${digest}` },
      { sourceArchiveSha256: digest },
    ),
    true,
  );
  assert.equal(
    matchesStrictSourceArchive(
      { status: "passed", archiveSha256: digest },
      { sourceArchiveSha256: digest },
    ),
    false,
  );
});

test("aggregate keeps internal Node lanes behind one complete external invariant", () => {
  const jobs = Object.entries(CI_NODE_TEST_LANES).map(
    ([lane, definition], index) => {
      const durationMs = index + 100;
      const startedAt = new Date(
        1_700_000_100_000 + index * 1_000,
      ).toISOString();
      return {
        lane,
        job: definition.job,
        jobId: String(index + 30),
        startedAt,
        finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
        durationMs,
      };
    },
  );
  const value = {
    status: "passed",
    laneCount: Object.keys(CI_NODE_TEST_LANES).length,
    testFileCount: Object.keys(CI_NODE_TEST_LANES).flatMap((lane) =>
      expectedCiNodeTestLaneFiles(lane),
    ).length,
    durationMs: Math.max(...jobs.map((job) => job.durationMs)),
    jobs,
    executed: 400,
    passed: 400,
    failed: 0,
    skipped: 0,
  };
  assert.equal(hasCompleteCiNodeLaneEvidence(value), true);
  assert.equal(
    hasCompleteCiNodeLaneEvidence({
      ...value,
      laneCount: value.laneCount + 1,
    }),
    false,
  );
  assert.equal(
    hasCompleteCiNodeLaneEvidence({ ...value, skipped: 1, passed: 399 }),
    false,
  );
  const driftedJob = structuredClone(value);
  driftedJob.jobs[0].job = "quality_node_other";
  assert.equal(hasCompleteCiNodeLaneEvidence(driftedJob), false);
  const driftedTiming = structuredClone(value);
  driftedTiming.jobs[0].finishedAt = new Date(
    Date.parse(driftedTiming.jobs[0].finishedAt) + 1,
  ).toISOString();
  assert.equal(hasCompleteCiNodeLaneEvidence(driftedTiming), false);
});

test("aggregate keeps internal resource lanes behind one complete external invariant", () => {
  const jobs = Object.entries(CI_RESOURCE_TEST_LANES).map(
    ([lane, definition], index) => {
      const durationMs = index + 100;
      const startedAt = new Date(
        1_700_000_100_000 + index * 1_000,
      ).toISOString();
      return {
        lane,
        job: definition.job,
        jobId: String(index + 30),
        startedAt,
        finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
        durationMs,
      };
    },
  );
  const value = {
    status: "passed",
    laneCount: 2,
    caseCount: 39,
    scenarioCount: 86,
    durationMs: Math.max(...jobs.map((job) => job.durationMs)),
    jobs,
    executed: 39,
    passed: 39,
    failed: 0,
    skipped: 0,
  };
  assert.equal(hasCompleteCiResourceLaneEvidence(value), true);
  assert.equal(
    hasCompleteCiResourceLaneEvidence({ ...value, scenarioCount: 85 }),
    false,
  );
  const driftedTiming = structuredClone(value);
  driftedTiming.jobs[1].finishedAt = new Date(
    Date.parse(driftedTiming.jobs[1].finishedAt) + 1,
  ).toISOString();
  assert.equal(hasCompleteCiResourceLaneEvidence(driftedTiming), false);
});

test("aggregate keeps Web and Server lanes behind complete external invariants", () => {
  for (const [definitions, validate] of [
    [CI_WEB_QUALITY_LANES, hasCompleteCiWebLaneEvidence],
    [CI_SERVER_QUALITY_LANES, hasCompleteCiServerLaneEvidence],
  ]) {
    const jobs = Object.entries(definitions).map(
      ([lane, definition], index) => {
        const durationMs = 100 + index;
        const startedAt = new Date(
          1_700_000_150_000 + index * 1_000,
        ).toISOString();
        return {
          lane,
          job: definition.job,
          jobId: String(index + 40),
          startedAt,
          finishedAt: new Date(
            Date.parse(startedAt) + durationMs,
          ).toISOString(),
          durationMs,
        };
      },
    );
    const value = {
      status: "passed",
      laneCount: jobs.length,
      durationMs: 200,
      jobs,
      executed: 20,
      passed: 20,
      failed: 0,
      skipped: 0,
    };
    assert.equal(validate(value), true);
    assert.equal(validate({ ...value, skipped: 1, passed: 19 }), false);
    const drifted = structuredClone(value);
    drifted.jobs[0].job = "quality_other";
    assert.equal(validate(drifted), false);
  }
});

test("aggregate keeps Browser scenarios and cleanup behind one external invariant", () => {
  const jobs = Object.entries(CI_BROWSER_QUALITY_LANES).map(
    ([lane, definition], index) => {
      const durationMs = 100 + index;
      const startedAt = new Date(
        1_700_000_160_000 + index * 1_000,
      ).toISOString();
      return {
        lane,
        job: definition.job,
        jobId: String(index + 50),
        startedAt,
        finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
        durationMs,
      };
    },
  );
  const value = {
    status: "passed",
    laneCount: jobs.length,
    scenarioCount: CI_BROWSER_QUALITY_SCENARIOS.length,
    productionBoundaryCount: 1,
    retries: 0,
    durationMs: 200,
    jobs,
    executed: CI_BROWSER_QUALITY_SCENARIOS.length + 1,
    passed: CI_BROWSER_QUALITY_SCENARIOS.length + 1,
    failed: 0,
    skipped: 0,
  };
  assert.equal(hasCompleteCiBrowserLaneEvidence(value), true);
  assert.equal(
    hasCompleteCiBrowserLaneEvidence({ ...value, scenarioCount: 9 }),
    false,
  );
  assert.equal(
    hasCompleteCiBrowserLaneEvidence({ ...value, retries: 1 }),
    false,
  );
  assert.equal(
    hasCompleteCiBrowserLaneEvidence({
      ...value,
      executed: value.executed + 1,
      passed: value.passed + 1,
    }),
    false,
  );
  const drifted = structuredClone(value);
  drifted.jobs[0].job = "quality_browser_other";
  assert.equal(hasCompleteCiBrowserLaneEvidence(drifted), false);
});

test("aggregate rejects every Browser cleanup, execution and Web-build identity drift", () => {
  const jobs = Object.entries(CI_BROWSER_QUALITY_LANES).map(
    ([lane, definition], index) => {
      const startedAt = new Date(
        1_700_000_170_000 + index * 1_000,
      ).toISOString();
      const durationMs = 100 + index;
      return {
        lane,
        job: definition.job,
        jobId: String(index + 60),
        startedAt,
        finishedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
        durationMs,
      };
    },
  );
  const webBuildSha256 = "d".repeat(64);
  const browser = {
    invariants: {
      browserLanes: {
        status: "passed",
        laneCount: jobs.length,
        scenarioCount: CI_BROWSER_QUALITY_SCENARIOS.length,
        productionBoundaryCount: 1,
        retries: 0,
        durationMs: 200,
        jobs,
        executed: CI_BROWSER_QUALITY_SCENARIOS.length + 1,
        passed: CI_BROWSER_QUALITY_SCENARIOS.length + 1,
        failed: 0,
        skipped: 0,
      },
      chromiumSandboxCleanup: "passed",
      playwrightRuntimeCleanup: "passed",
      browserRuntimeCleanup: "passed",
      browserLaneLockCleanup: "passed",
      browserPortCleanup: "passed",
      browserWebBuildReadOnly: "passed",
      webBuildSha256,
    },
  };
  const web = { invariants: { webBuildSha256 } };
  assert.equal(hasCompleteCiBrowserCrossShardEvidence(browser, web), true);
  for (const key of [
    "chromiumSandboxCleanup",
    "playwrightRuntimeCleanup",
    "browserRuntimeCleanup",
    "browserLaneLockCleanup",
    "browserPortCleanup",
    "browserWebBuildReadOnly",
  ]) {
    const drifted = structuredClone(browser);
    drifted.invariants[key] = "failed";
    assert.equal(
      hasCompleteCiBrowserCrossShardEvidence(drifted, web),
      false,
      key,
    );
  }
  for (const [key, value] of [
    ["executed", CI_BROWSER_QUALITY_SCENARIOS.length],
    ["passed", CI_BROWSER_QUALITY_SCENARIOS.length],
    ["scenarioCount", CI_BROWSER_QUALITY_SCENARIOS.length - 1],
    ["productionBoundaryCount", 0],
    ["retries", 1],
  ]) {
    const drifted = structuredClone(browser);
    drifted.invariants.browserLanes[key] = value;
    assert.equal(
      hasCompleteCiBrowserCrossShardEvidence(drifted, web),
      false,
      key,
    );
  }
  assert.equal(
    hasCompleteCiBrowserCrossShardEvidence(browser, {
      invariants: { webBuildSha256: "e".repeat(64) },
    }),
    false,
  );
  assert.equal(
    hasCompleteCiBrowserCrossShardEvidence(browser, {
      invariants: { webBuildSha256: "not-a-digest" },
    }),
    false,
  );
});

test("aggregate models every internal fan-in and lets Browser start from Web build", () => {
  const origin = 1_700_000_200_000;
  const stamp = (offset) => new Date(origin + offset).toISOString();
  const byShard = new Map(
    ["static", "server", "resource", "security"].map((shard, index) => [
      shard,
      {
        job: { name: `quality_${shard}` },
        startedAt: stamp(index * 10),
        finishedAt: stamp(index * 10 + 50),
      },
    ]),
  );
  byShard.set("web", {
    job: { name: "quality_web" },
    startedAt: stamp(0),
    finishedAt: stamp(100),
  });
  byShard.set("browser", {
    job: { name: "quality_browser" },
    startedAt: stamp(110),
    finishedAt: stamp(200),
  });
  byShard.set("node", {
    job: { name: "quality_node" },
    startedAt: stamp(170),
    finishedAt: stamp(210),
  });
  byShard.set("resource", {
    job: { name: "quality_resource" },
    startedAt: stamp(140),
    finishedAt: stamp(170),
  });
  byShard.set("server", {
    job: { name: "quality_server" },
    startedAt: stamp(160),
    finishedAt: stamp(180),
  });
  const lanes = [
    {
      lane: "core",
      job: "quality_node_core",
      startedAt: stamp(0),
      finishedAt: stamp(150),
      durationMs: 150,
    },
    {
      lane: "release_preflight",
      job: "quality_node_release_preflight",
      startedAt: stamp(10),
      finishedAt: stamp(130),
      durationMs: 120,
    },
    {
      lane: "release_a",
      job: "quality_node_release_a",
      startedAt: stamp(8),
      finishedAt: stamp(165),
      durationMs: 157,
    },
    {
      lane: "release_b",
      job: "quality_node_release_b",
      startedAt: stamp(12),
      finishedAt: stamp(155),
      durationMs: 143,
    },
  ];
  const resourceLanes = [
    {
      lane: "contract",
      job: "quality_resource_contract",
      startedAt: stamp(20),
      finishedAt: stamp(120),
      durationMs: 100,
    },
    {
      lane: "runtime",
      job: "quality_resource_runtime",
      startedAt: stamp(30),
      finishedAt: stamp(130),
      durationMs: 100,
    },
  ];
  const webLanes = [
    {
      lane: "checks",
      job: "quality_web_checks",
      startedAt: stamp(0),
      finishedAt: stamp(90),
      durationMs: 90,
    },
    {
      lane: "build",
      job: "quality_web_build",
      startedAt: stamp(5),
      finishedAt: stamp(80),
      durationMs: 75,
    },
  ];
  const serverLanes = [
    {
      lane: "schema",
      job: "quality_server_schema",
      startedAt: stamp(5),
      finishedAt: stamp(60),
      durationMs: 55,
    },
    {
      lane: "upgrade",
      job: "quality_server_upgrade",
      startedAt: stamp(3),
      finishedAt: stamp(120),
      durationMs: 117,
    },
    {
      lane: "test_build",
      job: "quality_server_test_build",
      startedAt: stamp(0),
      finishedAt: stamp(155),
      durationMs: 155,
    },
    {
      lane: "critical_postgres",
      job: "quality_server_critical_postgres",
      startedAt: stamp(10),
      finishedAt: stamp(145),
      durationMs: 135,
    },
  ];
  const browserLanes = [
    {
      lane: "boundary_entry_print",
      job: "quality_browser_boundary_entry_print",
      startedAt: stamp(82),
      finishedAt: stamp(135),
      durationMs: 53,
    },
  ];
  const paths = buildObservedQualityPaths(
    byShard,
    lanes,
    resourceLanes,
    webLanes,
    serverLanes,
    browserLanes,
  );
  const nodePath = paths.find((path) => path.id === "node");
  const webPath = paths.find((path) => path.id === "web");
  const webBrowserPath = paths.find((path) => path.id === "web_browser");
  const serverPath = paths.find((path) => path.id === "server");
  const resourcePath = paths.find((path) => path.id === "resource");
  assert.deepEqual(nodePath.jobs, ["quality_node_release_a", "quality_node"]);
  assert.equal(nodePath.durationMs, 202);
  assert.deepEqual(webPath.jobs, ["quality_web_checks", "quality_web"]);
  assert.equal(webPath.durationMs, 100);
  assert.deepEqual(webBrowserPath.jobs, [
    "quality_web_build",
    "quality_browser_boundary_entry_print",
    "quality_browser",
  ]);
  assert.equal(webBrowserPath.durationMs, 195);
  assert.deepEqual(serverPath.jobs, [
    "quality_server_test_build",
    "quality_server",
  ]);
  assert.equal(serverPath.durationMs, 180);
  assert.deepEqual(resourcePath.jobs, [
    "quality_resource_runtime",
    "quality_resource",
  ]);
  assert.equal(resourcePath.durationMs, 140);
});

test("aggregate rejects missing, duplicate and failed shards", async () => {
  const values = await receipts();
  assert.equal(validateCiQualityShardSet(values, expected).size, 7);
  const invalidTiming = structuredClone(values);
  invalidTiming[0].durationMs += 1;
  assert.throws(
    () => validateCiQualityShardSet(invalidTiming, expected),
    /invalid/u,
  );
  assert.throws(
    () => validateCiQualityShardSet(values.slice(1), expected),
    /every shard/u,
  );
  const failed = structuredClone(values);
  failed[0].status = "failed";
  assert.throws(() => validateCiQualityShardSet(failed, expected), /invalid/u);
  const duplicate = structuredClone(values);
  duplicate[1] = structuredClone(duplicate[0]);
  assert.throws(
    () => validateCiQualityShardSet(duplicate, expected),
    /invalid/u,
  );
});
