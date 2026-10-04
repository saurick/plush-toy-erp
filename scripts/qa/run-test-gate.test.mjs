import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("test gate accepts one bounded deadline and rejects invalid values", () => {
  const args = ["--kind", "node", "--label", "local"];
  assert.equal(parseArgs([...args, "--", "node"]).timeoutMs, 0);
  assert.equal(parseArgs([...args, "--timeout-ms", "120000", "--", "node"]).timeoutMs, 120000);
  for (const value of ["0", "-1", "1.5", "Infinity", "3600001", "01"]) {
    assert.throws(() => parseArgs([...args, "--timeout-ms", value, "--", "node"]), /must be an integer/u);
  }
  assert.throws(
    () => parseArgs([...args, "--timeout-ms", "1", "--timeout-ms", "2", "--", "node"]),
    /provided only once/u,
  );
});

test("test gate deadline terminates a blocked command and its owned descendant", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-test-deadline-"));
  const pidFile = path.join(root, "owned-pids.json");
  try {
    const childFile = path.join(root, "child.mjs");
    writeFileSync(childFile, `import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'inherit'});
writeFileSync(process.argv[2], JSON.stringify([process.pid, descendant.pid]));
while (true) {}
`);
    const result = spawnSync(process.execPath, [
      new URL("./run-test-gate.mjs", import.meta.url).pathname,
      "--kind", "node", "--label", "blocked", "--output-mode", "summary", "--timeout-ms", "500", "--",
      process.execPath, childFile, pidFile,
    ], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /test command timed out after 500ms/u);
    assert.doesNotMatch(result.stdout + result.stderr, /status=complete/u);
    const pids = JSON.parse(readFileSync(pidFile, "utf8"));
    for (const pid of pids) {
      const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
      assert(state.status === 1 || /^Z/u.test(state.stdout.trim()), `owned process ${pid} still running: ${state.stdout}`);
    }
  } finally {
    if (existsSync(pidFile)) {
      const [pid] = JSON.parse(readFileSync(pidFile, "utf8"));
      try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("test gate deadline preserves normal summary validation and launch errors", () => {
  const args = [
    new URL("./run-test-gate.mjs", import.meta.url).pathname,
    "--kind", "node", "--label", "local", "--output-mode", "summary", "--timeout-ms", "2000", "--",
  ];
  const passed = spawnSync(process.execPath, [
    ...args, process.execPath, "-e", `console.log(${JSON.stringify(passingNodeSummary)})`,
  ], { encoding: "utf8" });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /status=complete tests=1 pass=1 fail=0 skipped=0/u);
  const failed = spawnSync(process.execPath, [...args, "/plush-missing-test-command"], { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /ENOENT/u);
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

test("summary mode identifies a failed Go test without emitting its captured body", () => {
  const events = [
    { Action: "run", Package: "example.invalid/storage", Test: "TestBucketReady" },
    { Action: "output", Package: "example.invalid/storage", Test: "TestBucketReady", Output: "private fixture body\n" },
    { Action: "fail", Package: "example.invalid/storage", Test: "TestBucketReady" },
  ];
  const childScript = `console.log(${JSON.stringify(events.map((event) => JSON.stringify(event)).join("\n"))}); process.exit(1);`;
  const result = spawnSync(process.execPath, [
    new URL("./run-test-gate.mjs", import.meta.url).pathname,
    "--kind", "go", "--label", "storage", "--output-mode", "summary", "--",
    process.execPath, "--eval", childScript,
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /run=1 pass=0 fail=1 skip=0/u);
  assert.match(result.stderr, /failedTests=\["example.invalid\/storage:TestBucketReady"\]/u);
  assert.doesNotMatch(result.stdout + result.stderr, /private fixture body/u);
});

test("summary mode identifies a failed Node test without emitting its captured body", () => {
  const output = [
    "TAP version 13",
    "not ok 1 - Vite ownership probe",
    "  ---",
    "  error: private fixture body",
    "  ...",
    "1..1",
    "# tests 1", "# pass 0", "# fail 1", "# cancelled 0", "# skipped 0", "# todo 0",
  ].join("\n");
  const childScript = `console.log(${JSON.stringify(output)}); process.exit(1);`;
  const result = spawnSync(process.execPath, [
    new URL("./run-test-gate.mjs", import.meta.url).pathname,
    "--kind", "node", "--label", "web-all", "--output-mode", "summary", "--",
    process.execPath, "--eval", childScript,
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tests=1 pass=0 fail=1 cancelled=0 skipped=0 todo=0/u);
  assert.match(result.stderr, /failedTests=\["Vite ownership probe"\]/u);
  assert.doesNotMatch(result.stdout + result.stderr, /private fixture body/u);
});
