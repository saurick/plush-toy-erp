import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTestGate, formatIncompleteSummary } from "./run-test-gate.mjs";

const passingNodeSummary = [
  "# tests 1",
  "# pass 1",
  "# fail 0",
  "# cancelled 0",
  "# skipped 0",
  "# todo 0",
].join("\n");

test("test gate preserves child failure before summary proof", () => {
  assert.deepEqual(evaluateTestGate({ kind: "node", status: 7, stdout: passingNodeSummary }), {
    ok: false,
    reason: "child-exit",
    exitCode: 7,
  });
});

test("test gate accepts a successful Node summary", () => {
  const outcome = evaluateTestGate({ kind: "node", status: 0, stdout: passingNodeSummary });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result.tests, 1);
});

test("test gate rejects successful commands without a test summary", () => {
  const outcome = evaluateTestGate({ kind: "node", status: 0, stdout: "command completed\n" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "invalid-summary");
});

test("test gate rejects Go package-only output with zero executed tests", () => {
  const outcome = evaluateTestGate({
    kind: "go",
    status: 0,
    stdout: [
      JSON.stringify({ Action: "start", Package: "example.invalid/pkg" }),
      JSON.stringify({ Action: "pass", Package: "example.invalid/pkg" }),
    ].join("\n"),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.result.run, 0);
});

test("test gate formats incomplete summaries with the actual failure counts", () => {
  assert.equal(
    formatIncompleteSummary("node", {
      tests: 4,
      pass: 3,
      fail: 0,
      cancelled: 0,
      skipped: 1,
      todo: 0,
    }),
    "tests=4 pass=3 fail=0 cancelled=0 skipped=1 todo=0",
  );
  assert.equal(
    formatIncompleteSummary("go", {
      run: 4,
      pass: 3,
      fail: 0,
      skip: 1,
      unresolvedTests: [],
    }),
    "run=4 pass=3 fail=0 skip=1 unresolved=0",
  );
});
