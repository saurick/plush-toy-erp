import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CI_QUALITY_SHARDS,
  CI_QUALITY_SHARD_SCHEMA,
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
  const stages = Object.values(CI_QUALITY_SHARDS).flatMap((value) => value.stages);
  assert.equal(new Set(stages).size, stages.length);
  assert.deepEqual(new Set(stages), new Set([
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
  ]));
  for (const [shard, value] of Object.entries(CI_QUALITY_SHARDS)) {
    assert.equal(value.job, `quality_${shard}`);
    assert.ok(Object.isFrozen(value));
    assert.ok(Object.isFrozen(value.command));
    assert.ok(Object.isFrozen(value.stages));
  }
});

test("browser-bearing shards materialize and clean the verified runtime", () => {
  assert.match(source, /materializePlaywrightRuntime\(\{ root, env: childEnv \}\)/u);
  assert.match(source, /cleanupPlaywrightRuntime\(\{ root, env: childEnv \}\)/u);
  assert.match(source, /playwrightRuntimeCleanup/u);
  assert.match(source, /runtimeMaterialized = true/u);
  assert.doesNotMatch(
    source,
    /"playwright", "install", "chromium"/u,
  );
  assert.match(
    source,
    /\["server", "browser"\][.]includes\(shard\)/u,
  );
});

test("Node and Web shards install the cached Web dependencies offline", () => {
  assert.match(source, /\["node", "web"\][.]includes\(shard\)/u);
  assert.match(
    source,
    /\["--dir", "web", "install", "--frozen-lockfile", "--offline"\]/u,
  );
});
