import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { projectDevQualityGateServerEvidence } from "../../web/dev-server/devQualityGatePlugin.mjs";
import {
  buildQualityGateServerDag,
  buildQualityGateServerTiming,
} from "../../web/src/dev-workbench/config/devQualityGates.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SHA = "a".repeat(40);

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function providerTiming(jobNames) {
  return {
    schemaVersion: "plush.delivery-pipeline-timings/v1",
    runs: [
      {
        id: 501,
        attempt: 1,
        workflow: "ci",
        event: "push",
        status: "completed",
        conclusion: "success",
        gitSha: SHA,
        createdAt: "2026-09-02T00:00:00.000Z",
        finishedAt: "2026-09-02T00:05:00.000Z",
        queueMs: 1_000,
        durationMs: 300_000,
        url: "https://gitlab.example.test/pipelines/501",
        jobs: jobNames.map((name, index) => ({
          id: index + 1,
          name,
          status: "completed",
          conclusion: "success",
          durationMs: (index + 1) * 1_000,
        })),
      },
    ],
  };
}

function providerTopology(jobNames) {
  return {
    schemaVersion: "plush.delivery-pipeline-topology/v1",
    gitSha: SHA,
    jobs: jobNames.map((name, index) => ({
      name,
      stage: index === jobNames.length - 1 ? "gate" : "quality",
      needs: index === 0 ? [] : [jobNames[index - 1]],
    })),
  };
}

test("DEV quality gate projects provider jobs without a synchronized frontend catalog", () => {
  const jobNames = ["setup-renamed", "quality_new_lane", "CI Gate"];
  const evidence = projectDevQualityGateServerEvidence(
    providerTiming(jobNames),
    { commit: SHA, dirty: false },
    providerTopology(jobNames),
  );
  const timing = buildQualityGateServerTiming(evidence);
  const dag = buildQualityGateServerDag(evidence);

  assert.equal(evidence.status, "passed");
  assert.equal(evidence.coversWorkingTree, true);
  assert.deepEqual(
    evidence.jobs.map((job) => job.name),
    jobNames,
  );
  assert.deepEqual(
    timing.flowJobs.map((job) => job.name),
    jobNames,
  );
  assert(timing.flowJobs.every((job) => job.observed === true));
  assert(timing.flowJobs.every((job) => !("localStageIds" in job)));
  assert.equal(evidence.topology.status, "available");
  assert.equal(dag.nodeCount, jobNames.length);
  assert.equal(dag.edgeCount, jobNames.length - 1);
  assert.match(dag.chart, /quality_new_lane/u);
  assert.deepEqual(
    evidence.jobs.map(({ name, role, group }) => ({ name, role, group })),
    [
      { name: "setup-renamed", role: "execution", group: "other" },
      { name: "quality_new_lane", role: "execution", group: "other" },
      { name: "CI Gate", role: "terminal", group: "pipeline" },
    ],
  );
  assert.doesNotMatch(
    timing.flowJobs.map((job) => String(job.id)).join(","),
    /expected-server-job/u,
  );
});

test("DEV quality gate has no second CI job topology source", () => {
  assert.equal(
    existsSync(
      path.join(
        ROOT,
        "web/src/dev-workbench/config/devQualityGateServerPipeline.mjs",
      ),
    ),
    false,
  );

  const plugin = read("web/dev-server/devQualityGatePlugin.mjs");
  const provider = read("scripts/deploy/gitlab-delivery-provider.mjs");
  const config = read("web/src/dev-workbench/config/devQualityGates.mjs");
  const page = read("web/src/dev-workbench/pages/DevQualityGatesPage.jsx");

  assert.doesNotMatch(
    plugin,
    /SERVER_CI_JOB_NAMES|devQualityGateServerPipeline/u,
  );
  assert.match(
    plugin,
    /listPipelineTimings\(\{[\s\S]*?limit: SERVER_CI_HISTORY_LIMIT,[\s\S]*?source: 'push'/u,
  );
  assert.match(
    plugin,
    /timings\.runs\.some\(\(run\) => run\.gitSha === repository\.commit\)[\s\S]*?sha: repository\.commit/u,
  );
  assert.match(plugin, /readPipelineTopology\(\{[\s\S]*?repository\.commit/u);
  assert.match(provider, /content_ref: sha/u);
  assert.match(provider, /\/ci\/lint\?/u);
  assert.match(provider, /include_jobs/u);
  assert.doesNotMatch(
    config,
    /SERVER_CI_JOB_CATALOG|localStageIds|devQualityGateServerPipeline/u,
  );
  assert.doesNotMatch(
    page,
    /SERVER_CI_JOB_CATALOG|localStageIds|CI 7 分片|七个固定分片/u,
  );
});
