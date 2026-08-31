import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CI_QUALITY_SHARDS,
  CI_QUALITY_SHARD_SCHEMA,
  cleanupQualityPostgresContainer,
  hasCompleteSourceArchiveLightEvidence,
  qualityPostgresContainerState,
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
    assert.equal(value.job, `quality_${shard}`);
    assert.ok(Object.isFrozen(value));
    assert.ok(Object.isFrozen(value.command));
    assert.ok(Object.isFrozen(value.stages));
  }
});

test("browser-bearing shards materialize and clean the verified runtime", () => {
  assert.match(
    source,
    /materializePlaywrightRuntime\(\{ root, env: childEnv \}\)/u,
  );
  assert.match(
    source,
    /cleanupPlaywrightRuntime\(\{ root, env: childEnv \}\)/u,
  );
  assert.match(source, /playwrightRuntimeCleanup/u);
  assert.match(source, /runtimeCleanupRequired = true/u);
  assert.match(source, /process[.]once\("SIGTERM"/u);
  assert.match(source, /Chromium sandbox path has stale residue/u);
  assert.match(
    source,
    /sandboxCleanupBlocksRuntime[\s\S]+sandboxCleanupRequired &&[\s\S]+invariants[.]chromiumSandboxCleanup !== "passed"[\s\S]+runtimeCleanupRequired && !sandboxCleanupBlocksRuntime/u,
  );
  assert.doesNotMatch(source, /"playwright", "install", "chromium"/u);
  assert.match(
    source,
    /laneDefinition[?][.]resources[.]chromium \|\| shard === "browser"/u,
  );
});

test("browser validates the exact Web build before dependency or privileged setup", () => {
  assert.match(
    source,
    /function verifyBrowserWebBuild[\s\S]+const buildReceiptDirectory[\s\S]+validateCiQualityWorkloadLaneReceipt\([\s\S]+const webBuildSha256 = hashDirectory\(webBuild\)[\s\S]+browser shard Web build artifact identity mismatch/u,
  );
  const initialValidationIndex = source.indexOf(
    "initialBrowserWebBuildSha256 = verifyBrowserWebBuild(",
  );
  const dependencyIndex = source.indexOf(
    'await runOwnedProcess(\n        "pnpm"',
  );
  const stableValidationIndex = source.indexOf(
    "const stableWebBuildSha256 = verifyBrowserWebBuild(",
  );
  const runtimeIndex = source.indexOf(
    "const chromium = await materializeChromium",
  );
  const sandboxIndex = source.indexOf("await installChromiumSandbox");
  assert.ok(initialValidationIndex > 0);
  assert.ok(initialValidationIndex < dependencyIndex);
  assert.ok(dependencyIndex < stableValidationIndex);
  assert.ok(stableValidationIndex < runtimeIndex);
  assert.ok(stableValidationIndex < sandboxIndex);
  assert.match(source, /browser shard Web build changed during setup/u);
});

test("PostgreSQL resource ownership and cleanup fail closed", () => {
  const identity = {
    root: "/repo",
    name: "plush-ci-postgres-12-34",
    pipelineId: "12",
    jobId: "34",
  };
  const result = (status, stdout = "") => ({
    status,
    stdout,
    stderr: "",
    error: null,
  });
  assert.equal(
    qualityPostgresContainerState({
      ...identity,
      spawnSyncFn: () => result(0),
    }),
    "absent",
  );
  assert.throws(
    () =>
      qualityPostgresContainerState({
        ...identity,
        spawnSyncFn: () => result(1),
      }),
    /control-plane readback/u,
  );

  const foreignCalls = [];
  assert.throws(
    () =>
      cleanupQualityPostgresContainer({
        ...identity,
        spawnSyncFn(command, args) {
          foreignCalls.push([command, ...args]);
          return foreignCalls.length === 1
            ? result(0, `${identity.name}\n`)
            : result(0);
        },
      }),
    /ownership mismatch/u,
  );
  assert.equal(
    foreignCalls.some((call) => call.includes("rm")),
    false,
  );

  const ownedResponses = [
    result(0, `${identity.name}\n`),
    result(0, `${identity.name}\n`),
    result(0),
    result(0),
  ];
  const ownedCalls = [];
  assert.equal(
    cleanupQualityPostgresContainer({
      ...identity,
      spawnSyncFn(command, args) {
        ownedCalls.push([command, ...args]);
        return ownedResponses.shift();
      },
    }),
    "passed",
  );
  assert.equal(ownedResponses.length, 0);
  assert.equal(ownedCalls.filter((call) => call.includes("rm")).length, 1);
});

test("Node, Web and Chromium lanes install cached Web dependencies offline", () => {
  assert.match(
    source,
    /shard === "node" \|\|\s+shard === "browser" \|\|\s+laneDefinition[?][.]resources[.]pnpm === true \|\|\s+laneDefinition[?][.]resources[.]chromium === true/u,
  );
  assert.match(
    source,
    /\["--dir", "web", "install", "--frozen-lockfile", "--offline"\]/u,
  );
  assert.match(
    source,
    /shard === "web" && lane === "build"[\s\S]+rmSync\(path[.]join\(root, "web", "build"\)[\s\S]+recursive: true[\s\S]+force: true/u,
  );
});

test("Web and Server internal lanes fan in behind the two canonical shards", () => {
  assert.match(source, /loadCiQualityWorkloadLaneSet/u);
  assert.match(source, /QA_CI_WEB_LANES = "verified"/u);
  assert.match(source, /QA_CI_SERVER_LANES = "verified"/u);
  assert.match(source, /validateCiQualityWorkloadLaneReceipt/u);
  assert.match(source, /workload-lanes[\s\S]+web[\s\S]+build[.]json/u);
  assert.doesNotMatch(source, /\["server", "browser"\][.]includes\(shard\)/u);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "web_validation"), false);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "web_build"), false);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "server_core"), false);
  assert.equal(Object.hasOwn(CI_QUALITY_SHARDS, "server_critical"), false);
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
