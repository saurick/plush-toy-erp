import assert from "node:assert/strict";
import test from "node:test";

import {
  RECEIPT_GATE_COMMANDS,
  RECEIPT_GATE_STAGE_IDS,
  evaluateReceiptGateRun,
  hasCompleteGateStageTimings,
  parseGateStageTimings,
} from "./run-gate-with-receipt.mjs";

test("gate receipt runner exposes only the three registered repository gates", () => {
  assert.deepEqual(RECEIPT_GATE_COMMANDS, {
    fast: ["bash", "scripts/qa/fast.sh"],
    full: ["bash", "scripts/qa/full.sh"],
    strict: ["bash", "scripts/qa/strict.sh"],
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
    assert.deepEqual(
      evaluateReceiptGateRun({ childStatus: 0, summary }),
      { exitCode: 2, status: "failed" },
    );
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
  const metrics = parseGateStageTimings(lines.join("\n"), "full");
  assert.equal(metrics.stageTimings.length, RECEIPT_GATE_STAGE_IDS.full.length);
  assert.equal(metrics.bottleneckStageId, "govulncheck");
  assert.equal(metrics.measuredStageDurationMs, 2_800);
  assert.equal(hasCompleteGateStageTimings("full", metrics.stageTimings), true);
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
