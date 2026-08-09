import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { PassThrough, Writable } from "node:stream";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RECEIPT_GATE_COMMANDS,
  RECEIPT_GATE_PARALLEL_STAGE_IDS,
  RECEIPT_GATE_STAGE_IDS,
  evaluateReceiptGateRun,
  hasCompleteGateParallelTiming,
  hasCompleteGateStageTimings,
  parseGateParallelEvent,
  parseGateStageEvent,
  parseGateStageTimings,
  parseGateSubstepEvent,
  parseGateTimingSubstepEvent,
  summarizeGateCategories,
  runReceiptGate,
} from "./run-gate-with-receipt.mjs";

test("gate receipt runner exposes only the three registered repository gates", () => {
  assert.deepEqual(RECEIPT_GATE_COMMANDS, {
    fast: ["bash", "scripts/qa/fast.sh"],
    full: ["bash", "scripts/qa/full.sh"],
    strict: ["bash", "scripts/qa/strict.sh"],
  });
});

test("strict receipt records Web, Server, database, browser and security counts", () => {
  const output = [
    "[qa:test-gate] label=web-all status=complete tests=2170 pass=2170 fail=0 skipped=0",
    "[qa:test-gate] label=server-all status=complete run=3387 pass=3387 fail=0 skip=0",
  ].join("\n");
  const stageTimings = [
    { id: "server", status: "passed", durationMs: 10 },
    { id: "browser", status: "passed", durationMs: 10 },
    { id: "secrets", status: "passed", durationMs: 10 },
    { id: "govulncheck", status: "passed", durationMs: 10 },
  ];
  assert.deepEqual(summarizeGateCategories(output, "strict", stageTimings), {
    web: { executed: 2170, passed: 2170, failed: 0, skipped: 0 },
    server: { executed: 3387, passed: 3387, failed: 0, skipped: 0 },
    database: { executed: 2, passed: 2, failed: 0, skipped: 0 },
    browser: { executed: 4, passed: 4, failed: 0, skipped: 0 },
    security: { executed: 2, passed: 2, failed: 0, skipped: 0 },
  });
});

test("gate receipt runner requires non-zero all-passed and zero-skipped proof", () => {
  assert.deepEqual(
    evaluateReceiptGateRun({
      childStatus: 0,
      summary: { executed: 2, passed: 2, failed: 0, skipped: 0 },
    }),
    { exitCode: 0, status: "passed" },
  );
  for (const summary of [
    { executed: 0, passed: 0, failed: 0, skipped: 0 },
    { executed: 2, passed: 1, failed: 0, skipped: 1 },
    { executed: 2, passed: 1, failed: 1, skipped: 0 },
  ]) {
    assert.deepEqual(evaluateReceiptGateRun({ childStatus: 0, summary }), {
      exitCode: 2,
      status: "failed",
    });
  }
});

test("gate receipt runner preserves child failure", () => {
  assert.deepEqual(
    evaluateReceiptGateRun({
      childStatus: 7,
      summary: { executed: 1, passed: 0, failed: 1, skipped: 0 },
    }),
    { exitCode: 7, status: "failed" },
  );
});

test("gate receipt runner fails closed when repository identity changes", () => {
  assert.deepEqual(
    evaluateReceiptGateRun({
      childStatus: 0,
      identityMatches: false,
      summary: { executed: 2, passed: 2, failed: 0, skipped: 0 },
    }),
    { exitCode: 2, status: "failed" },
  );
});

test("gate receipt runner parses bounded stage timings and bottleneck", () => {
  const lines = RECEIPT_GATE_STAGE_IDS.full.map(
    (stage, index) =>
      `[qa:stage] gate=full id=${stage} status=passed durationMs=${String(
        (index + 1) * 100,
      )}`,
  );
  lines.push(
    `[qa:parallel] gate=full ids=${RECEIPT_GATE_PARALLEL_STAGE_IDS.join(",")} status=passed durationMs=650`,
  );
  const metrics = parseGateStageTimings(lines.join("\n"), "full");
  assert.equal(metrics.stageTimings.length, RECEIPT_GATE_STAGE_IDS.full.length);
  assert.equal(metrics.bottleneckStageId, "govulncheck");
  assert.equal(metrics.measuredStageDurationMs, 3_600);
  assert.equal(metrics.observedCriticalPathDurationMs, 3_150);
  assert.equal(metrics.parallelStageGroups.length, 1);
  assert.equal(hasCompleteGateStageTimings("full", metrics.stageTimings), true);
  assert.equal(
    hasCompleteGateParallelTiming("full", metrics.parallelStageGroups),
    true,
  );
  assert.deepEqual(
    evaluateReceiptGateRun({
      childStatus: 0,
      stageTimingComplete: false,
      summary: { executed: 2, passed: 2, failed: 0, skipped: 0 },
    }),
    { exitCode: 2, status: "failed" },
  );
  assert.throws(
    () => parseGateStageTimings(`${lines[0]}\n${lines[0]}`, "full"),
    /duplicate/u,
  );
});

test("gate receipt runner exposes running stage events without treating them as terminal evidence", () => {
  assert.deepEqual(
    parseGateStageEvent(
      "[qa:stage] gate=strict id=environment_profile status=running",
    ),
    {
      gate: "strict",
      id: "environment_profile",
      label: "环境与工具链准备",
      status: "running",
      durationMs: null,
    },
  );
  assert.equal(
    parseGateStageEvent(
      "[qa:stage] gate=strict id=environment_profile status=running durationMs=1",
    ),
    null,
  );
  assert.equal(
    parseGateStageEvent("[qa:stage] gate=strict id=future_stage status=running")
      .label,
    "未登记阶段",
  );
});

test("gate receipt runner parses only fixed bounded Web substep events", () => {
  assert.deepEqual(
    parseGateSubstepEvent(
      "[qa:substep] gate=strict stage=web id=production_build status=failed durationMs=12",
    ),
    {
      gate: "strict",
      stage: "web",
      id: "production_build",
      label: "Web 生产构建",
      status: "failed",
      durationMs: 12,
    },
  );
  assert.deepEqual(
    parseGateSubstepEvent(
      "[qa:substep] gate=full stage=web id=web_test status=running",
    ),
    {
      gate: "full",
      stage: "web",
      id: "web_test",
      label: "Web 自动化测试",
      status: "running",
      durationMs: null,
    },
  );
  for (const line of [
    "[qa:substep] gate=strict stage=web id=arbitrary status=failed durationMs=1",
    "[qa:substep] gate=strict stage=server id=production_build status=failed durationMs=1",
    "[qa:substep] gate=strict stage=web id=production_build status=running durationMs=1",
    "[qa:substep] gate=strict stage=web id=production_build status=failed",
  ]) {
    assert.equal(parseGateSubstepEvent(line), null);
  }

  assert.deepEqual(
    parseGateTimingSubstepEvent(
      "[qa:substep] gate=strict stage=shared id=node_tests status=passed durationMs=321",
    ),
    {
      gate: "strict",
      stage: "shared",
      id: "node_tests",
      label: "Scripts Node 合同测试",
      status: "passed",
      durationMs: 321,
    },
  );
  assert.equal(
    parseGateSubstepEvent(
      "[qa:substep] gate=strict stage=shared id=node_tests status=passed durationMs=321",
    ),
    null,
  );

  const stageOutput = [
    "[qa:substep] gate=full stage=web id=eslint status=passed durationMs=1",
    ...RECEIPT_GATE_STAGE_IDS.full.map(
      (stage) => `[qa:stage] gate=full id=${stage} status=passed durationMs=1`,
    ),
  ].join("\n");
  assert.equal(
    parseGateStageTimings(stageOutput, "full").stageTimings.length,
    RECEIPT_GATE_STAGE_IDS.full.length,
  );
});

test("gate receipt runner accepts only the fixed independent parallel group", () => {
  assert.deepEqual(
    parseGateParallelEvent(
      "[qa:parallel] gate=strict ids=shared,web,server status=passed durationMs=4321",
    ),
    {
      gate: "strict",
      stageIds: ["shared", "web", "server"],
      status: "passed",
      durationMs: 4321,
    },
  );
  assert.equal(
    parseGateParallelEvent(
      "[qa:parallel] gate=strict ids=web,shared,server status=passed durationMs=1",
    ),
    null,
  );
});

test("gate receipt runner streams one formal execution and writes its receipt", async (t) => {
  const outPath = path.join(
    os.tmpdir(),
    `plush-run-gate-${process.pid}-${Date.now()}.json`,
  );
  t.after(() => rm(outPath, { force: true }));
  const sink = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    setImmediate(() => {
      for (const [index, stage] of RECEIPT_GATE_STAGE_IDS.full.entries()) {
        child.stdout.write(`[qa:stage] gate=full id=${stage} status=running\n`);
        child.stdout.write(
          `[qa:stage] gate=full id=${stage} status=passed durationMs=${String(index + 1)}\n`,
        );
      }
      child.stdout.write(
        "[qa:parallel] gate=full ids=shared,web,server status=passed durationMs=5\n",
      );
      child.stdout.write(
        "[qa:test-gate] status=complete tests=2 pass=2 fail=0 skipped=0\n",
      );
      child.stdout.end();
      child.stderr.end();
      child.emit("close", 0, null);
    });
    return child;
  };
  const result = await runReceiptGate({
    gate: "full",
    outPath,
    spawnProcess,
    stdout: sink,
    stderr: sink,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.receipt.status, "passed");
  assert.equal(
    result.receipt.metrics.stageTimings.length,
    RECEIPT_GATE_STAGE_IDS.full.length,
  );
  assert.equal(result.receipt.metrics.parallelStageGroups.length, 1);
  const written = JSON.parse(await readFile(outPath, "utf8"));
  assert.equal(written.gate, "full");
  assert.equal(written.executed, 2);
});
