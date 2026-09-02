import assert from "node:assert/strict";
import test from "node:test";

import { CI_NODE_TEST_LANES } from "./ci-node-test-lane.mjs";
import {
  CI_BROWSER_QUALITY_LANES,
  CI_SERVER_QUALITY_LANES,
  CI_WEB_QUALITY_LANES,
} from "./ci-quality-stage-lane.mjs";
import { CI_QUALITY_SHARDS } from "./ci-quality-shard.mjs";
import {
  CI_JOB_GUIDES,
  CI_JOB_GUIDE_SCHEMA,
  projectCiJobGuides,
} from "./ci-job-guide.mjs";
import { CI_RESOURCE_TEST_LANES } from "./ci-resource-test-lane.mjs";

function jobNames(registry) {
  return Object.values(registry).map(({ job }) => job);
}

test("CI Job guide covers every registered push-CI Job exactly once", () => {
  const expected = [
    "plan",
    "prepare",
    ...jobNames(CI_NODE_TEST_LANES),
    ...jobNames(CI_RESOURCE_TEST_LANES),
    ...jobNames(CI_WEB_QUALITY_LANES),
    ...jobNames(CI_SERVER_QUALITY_LANES),
    ...jobNames(CI_BROWSER_QUALITY_LANES),
    ...jobNames(CI_QUALITY_SHARDS),
    "quality_aggregate",
    "CI Gate",
  ];

  assert.equal(CI_JOB_GUIDE_SCHEMA, "plush.ci-job-guide/v1");
  assert.equal(expected.length, 24);
  assert.equal(new Set(expected).size, expected.length);
  assert.deepEqual(
    CI_JOB_GUIDES.map(({ name }) => name).sort(),
    [...expected].sort(),
  );
  assert(
    CI_JOB_GUIDES.every(
      (guide) =>
        guide.registered === true &&
        guide.checks.length > 0 &&
        Object.isFrozen(guide) &&
        Object.isFrozen(guide.checks),
    ),
  );
  for (const guide of CI_JOB_GUIDES) {
    for (const runtimeField of [
      "needs",
      "status",
      "durationMs",
      "queueMs",
      "history",
    ]) {
      assert.equal(Object.hasOwn(guide, runtimeField), false);
    }
  }
});

test("CI Job guide projection follows actual Job order and fails open only for copy", () => {
  const projected = projectCiJobGuides([
    "quality_node",
    "future_quality_lane",
    "CI Gate",
  ]);

  assert.deepEqual(
    projected.map(({ name }) => name),
    ["quality_node", "future_quality_lane", "CI Gate"],
  );
  assert.equal(projected[0].registered, true);
  assert.equal(projected[1].registered, false);
  assert.match(projected[1].summary, /尚未登记/u);
  assert.equal(projected[2].label, "CI 最终门禁");
  assert(Object.isFrozen(projected));
  assert.throws(
    () => projectCiJobGuides(["quality_node", "quality_node"]),
    /projection is invalid/u,
  );
  assert.throws(() => projectCiJobGuides(["bad\njob"]), /projection is invalid/u);
  assert.throws(
    () => projectCiJobGuides(Array.from({ length: 101 }, (_, index) => `job-${index}`)),
    /projection is invalid/u,
  );
});
