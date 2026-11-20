import assert from "node:assert/strict";
import test from "node:test";

import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

function summary({ tests, pass, fail, cancelled = 0, skipped, todo = 0 }) {
  return [
    `# tests ${tests}`,
    `# pass ${pass}`,
    `# fail ${fail}`,
    `# cancelled ${cancelled}`,
    `# skipped ${skipped}`,
    `# todo ${todo}`,
  ].join("\n");
}

test("Node summary proof accepts a non-empty all-pass run", () => {
  const result = verifyNodeTestSummary(
    summary({ tests: 2, pass: 2, fail: 0, skipped: 0 }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    { tests: result.tests, pass: result.pass, fail: result.fail, skipped: result.skipped },
    { tests: 2, pass: 2, fail: 0, skipped: 0 },
  );
});

test("Node summary proof rejects skipped tests", () => {
  const result = verifyNodeTestSummary(
    summary({ tests: 2, pass: 1, fail: 0, skipped: 1 }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.skipped, 1);
});

test("Node summary proof rejects zero-run output", () => {
  const result = verifyNodeTestSummary(
    summary({ tests: 0, pass: 0, fail: 0, skipped: 0 }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.tests, 0);
});

test("Node summary proof rejects a missing summary", () => {
  const result = verifyNodeTestSummary("# skipped 0\n");
  assert.equal(result.ok, false);
  assert(result.missing.includes("tests"));
  assert(result.missing.includes("pass"));
  assert(result.missing.includes("fail"));
});

test("Node summary proof rejects failed, cancelled, and todo tests", () => {
  for (const output of [
    summary({ tests: 1, pass: 0, fail: 1, skipped: 0 }),
    summary({ tests: 1, pass: 0, fail: 0, cancelled: 1, skipped: 0 }),
    summary({ tests: 1, pass: 0, fail: 0, skipped: 0, todo: 1 }),
  ]) {
    assert.equal(verifyNodeTestSummary(output).ok, false);
  }
});

test("Node summary proof accepts the default spec reporter summary", () => {
  const result = verifyNodeTestSummary(
    [
      "ℹ tests 1",
      "ℹ pass 1",
      "ℹ fail 0",
      "ℹ cancelled 0",
      "ℹ skipped 0",
      "ℹ todo 0",
    ].join("\n"),
  );
  assert.equal(result.ok, true);
});

test("Node summary proof rejects duplicate summaries that could hide an earlier skip", () => {
  const result = verifyNodeTestSummary(
    [
      summary({ tests: 1, pass: 0, fail: 0, skipped: 1 }),
      summary({ tests: 1, pass: 1, fail: 0, skipped: 0 }),
    ].join("\n"),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicate, [
    "tests",
    "pass",
    "fail",
    "cancelled",
    "skipped",
    "todo",
  ]);
});
