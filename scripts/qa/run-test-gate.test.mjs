import assert from "node:assert/strict";
import test from "node:test";

import {
  emitCapturedOutput,
  evaluateTestGate,
  formatIncompleteSummary,
  parseArgs,
} from "./run-test-gate.mjs";

const passingNodeSummary = [
  "# tests 1",
  "# pass 1",
  "# fail 0",
  "# cancelled 0",
  "# skipped 0",
  "# todo 0",
].join("\n");

test("test gate preserves child failure before summary proof", () => {
  assert.deepEqual(
    evaluateTestGate({ kind: "node", status: 7, stdout: passingNodeSummary }),
    {
      ok: false,
      reason: "child-exit",
      exitCode: 7,
      result: {
        ok: true,
        tests: 1,
        pass: 1,
        fail: 0,
        cancelled: 0,
        skipped: 0,
        todo: 0,
        missing: [],
        duplicate: [],
      },
    },
  );
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

test("test gate propagates an exact Go partition exclusion", () => {
  const stdout = [
    JSON.stringify({ Action: "run", Test: "TestOrdinaryFlow" }),
    JSON.stringify({ Action: "pass", Test: "TestOrdinaryFlow" }),
    JSON.stringify({ Action: "run", Test: "TestCriticalPostgresFlow" }),
    JSON.stringify({ Action: "skip", Test: "TestCriticalPostgresFlow" }),
  ].join("\n");
  const outcome = evaluateTestGate({
    kind: "go",
    status: 0,
    stdout,
    excludedSkipPattern: "^TestCriticalPostgresFlow$",
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(
    {
      run: outcome.result.run,
      pass: outcome.result.pass,
      skip: outcome.result.skip,
      excluded: outcome.result.excluded,
    },
    { run: 1, pass: 1, skip: 0, excluded: 1 },
  );
});

test("test gate keeps unknown Go skips fail-closed", () => {
  const stdout = [
    JSON.stringify({ Action: "run", Test: "TestOrdinaryFlow" }),
    JSON.stringify({ Action: "pass", Test: "TestOrdinaryFlow" }),
    JSON.stringify({ Action: "run", Test: "TestUnexpectedSkip" }),
    JSON.stringify({ Action: "skip", Test: "TestUnexpectedSkip" }),
  ].join("\n");
  const outcome = evaluateTestGate({
    kind: "go",
    status: 0,
    stdout,
    excludedSkipPattern: "^TestCriticalPostgresFlow$",
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.result.skippedTests, ["TestUnexpectedSkip"]);
});

test("test gate accepts one valid Go exclusion option and rejects unsafe variants", () => {
  const parsed = parseArgs([
    "--kind",
    "go",
    "--label",
    "server-all",
    "--exclude-skip-pattern",
    "^TestCriticalPostgresFlow$",
    "--",
    "go",
    "test",
  ]);
  assert.equal(parsed.excludedSkipPattern, "^TestCriticalPostgresFlow$");
  assert.throws(
    () =>
      parseArgs([
        "--kind",
        "node",
        "--label",
        "web-all",
        "--exclude-skip-pattern",
        "^TestWeb$",
        "--",
        "node",
      ]),
    /supported only for --kind go/u,
  );
  assert.throws(
    () =>
      parseArgs([
        "--kind",
        "go",
        "--label",
        "server-all",
        "--exclude-skip-pattern",
        "^TestOne$",
        "--exclude-skip-pattern",
        "^TestTwo$",
        "--",
        "go",
      ]),
    /provided only once/u,
  );
  assert.throws(
    () =>
      parseArgs([
        "--kind",
        "go",
        "--label",
        "server-all",
        "--exclude-skip-pattern",
        "[",
        "--",
        "go",
      ]),
    /valid regex/u,
  );
});

test("test gate accepts only one declared output mode", () => {
  const parsed = parseArgs([
    "--kind",
    "node",
    "--label",
    "web-all",
    "--output-mode",
    "summary",
    "--",
    "node",
    "--test",
  ]);
  assert.equal(parsed.outputMode, "summary");
  assert.throws(
    () =>
      parseArgs([
        "--kind",
        "node",
        "--label",
        "web-all",
        "--output-mode",
        "summary",
        "--output-mode",
        "full",
        "--",
        "node",
      ]),
    /provided only once/u,
  );
  assert.throws(
    () =>
      parseArgs([
        "--kind",
        "node",
        "--label",
        "web-all",
        "--output-mode",
        "quiet",
        "--",
        "node",
      ]),
    /must be full or summary/u,
  );
});

test("test gate awaits captured stdout before emitting stderr", async () => {
  const writes = [];
  let releaseStdout;
  const stdoutPending = new Promise((resolve) => {
    releaseStdout = resolve;
  });
  const emission = emitCapturedOutput(
    { stdout: "stdout payload", stderr: "stderr payload" },
    async (stream, content) => {
      writes.push([stream, content]);
      if (content === "stdout payload") await stdoutPending;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [[process.stdout, "stdout payload"]]);
  releaseStdout();
  await emission;
  assert.deepEqual(writes, [
    [process.stdout, "stdout payload"],
    [process.stderr, "stderr payload"],
  ]);
  await assert.rejects(
    emitCapturedOutput({ stdout: "payload" }, async () => {
      throw new Error("write failed");
    }),
    /write failed/u,
  );
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
      excluded: 2,
      unresolvedTests: [],
    }),
    "run=4 pass=3 fail=0 skip=1 excluded=2 unresolved=0",
  );
});
