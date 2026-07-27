import assert from "node:assert/strict";
import test from "node:test";

import {
  RECEIPT_GATE_COMMANDS,
  evaluateReceiptGateRun,
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
