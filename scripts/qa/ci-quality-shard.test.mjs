import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CI_QUALITY_SHARDS,
  CI_QUALITY_SHARD_SCHEMA,
  hasCompleteSourceArchiveLightEvidence,
} from "./ci-quality-shard.mjs";

const source = readFileSync(
  new URL("./ci-quality-shard.mjs", import.meta.url),
  "utf8",
);

test("quality shard catalog covers the strict stage set exactly once", () => {
  assert.equal(CI_QUALITY_SHARD_SCHEMA, "plush.ci-quality-shard/v1");
  assert.deepEqual(Object.keys(CI_QUALITY_SHARDS), [
    "static",
    "node",
    "web",
    "server",
    "resource",
    "browser",
    "security",
  ]);
  const stages = Object.values(CI_QUALITY_SHARDS).flatMap(
    (value) => value.stages,
  );
  assert.equal(new Set(stages).size, stages.length);
  assert.deepEqual(
    new Set(stages),
    new Set([
      "strict_profile",
      "shellcheck",
      "shfmt",
      "yamllint",
      "environment_profile",
      "shared",
      "secrets",
      "web",
      "server",
      "resource_sensitive_node",
      "critical_postgres",
      "browser",
      "govulncheck",
    ]),
  );
  for (const [shard, value] of Object.entries(CI_QUALITY_SHARDS)) {
    assert.equal(
      value.job,
      shard === "browser" ? "quality_browser 2/2" : `quality_${shard}`,
    );
    assert.ok(Object.isFrozen(value));
    assert.ok(Object.isFrozen(value.command));
    assert.ok(Object.isFrozen(value.stages));
  }
});

test("Browser canonical shard only fans in isolated lane receipts", () => {
  assert.match(source, /formatCiQualityStageLaneAggregate/u);
  assert.match(source, /browserLanes: shard === "browser"/u);
  assert.match(source, /browserRuntimeCleanup/u);
  assert.match(source, /browserLaneLockCleanup/u);
  assert.match(source, /browserPortCleanup/u);
  assert.match(source, /browserWebBuildReadOnly/u);
  assert.doesNotMatch(source, /materializePlaywrightRuntime/u);
  assert.doesNotMatch(source, /cleanupPlaywrightRuntime/u);
  assert.doesNotMatch(source, /plush-chromium-sandbox/u);
  assert.doesNotMatch(source, /"playwright", "install", "chromium"/u);
});

test("only the Node canonical shard installs cached Web dependencies", () => {
  assert.match(source, /if \(shard === "node"\)/u);
  assert.match(
    source,
    /\["--dir", "web", "install", "--frozen-lockfile", "--offline"\]/u,
  );
});

test("Web, Server and Browser canonical shards fan in internal lanes without rerunning resources", () => {
  assert.match(source, /loadCiQualityStageLaneSet/u);
  assert.match(source, /QA_CI_WEB_LANES = "verified"/u);
  assert.match(source, /QA_CI_SERVER_LANES = "verified"/u);
  assert.match(source, /directory: `output\/ci\/\$\{shard\}-lanes`/u);
  assert.match(source, /webLanes: shard === "web"/u);
  assert.match(source, /serverLanes: shard === "server"/u);
  assert.match(source, /browserLanes: shard === "browser"/u);
  assert.doesNotMatch(source, /plush-ci-postgres-/u);
});

test("Browser propagates only the verified shared Web build digest", () => {
  assert.match(source, /invariants[.]webBuildSha256 = lanes[.]webBuildSha256/u);
  assert.match(source, /invariants[.]browserWebBuildReadOnly = "passed"/u);
  assert.doesNotMatch(source, /output[\/]ci[\/]shards[\/]web[.]json/u);
});

test("Node shard fans in internal lanes while preserving one external shard", () => {
  assert.match(source, /loadCiNodeTestLaneSet/u);
  assert.match(source, /QA_CI_NODE_LANES = "verified"/u);
  assert.match(source, /directory: "output\/ci\/node-lanes"/u);
  assert.match(source, /nodeLanes: shard === "node"/u);
  assert.match(source, /laneCount: lanes\.laneCount/u);
  assert.match(source, /testFileCount: lanes\.testFileCount/u);
  assert.match(source, /jobs: lanes\.jobs/u);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "node_core"), false);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "node_release"), false);
});

test("resource shard fans in two serial lanes while preserving one external shard", () => {
  assert.match(source, /loadCiResourceTestLaneSet/u);
  assert.match(source, /QA_CI_RESOURCE_LANES = "verified"/u);
  assert.match(source, /directory: "output\/ci\/resource-lanes"/u);
  assert.match(source, /resourceLanes: shard === "resource"/u);
  assert.match(source, /caseCount: lanes\.caseCount/u);
  assert.match(source, /scenarioCount: lanes\.scenarioCount/u);
  assert.match(source, /jobs: lanes\.jobs/u);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "resource_contract"), false);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "resource_runtime"), false);
});

test("Node shard accepts only the tagged source-archive SHA-256 contract", () => {
  const gitSha = "a".repeat(40);
  const evidence = {
    lightCheckPassed: true,
    repositoryBoundary: { passed: true },
    commit: gitSha,
    head: gitSha,
    refIsHead: true,
    customer: "yoyoosun",
    archiveSha256: `sha256:${"b".repeat(64)}`,
  };
  assert.equal(
    hasCompleteSourceArchiveLightEvidence(evidence, {
      gitSha,
      customer: "yoyoosun",
    }),
    true,
  );
  assert.equal(
    hasCompleteSourceArchiveLightEvidence(
      { ...evidence, archiveSha256: "b".repeat(64) },
      { gitSha, customer: "yoyoosun" },
    ),
    false,
  );
});
