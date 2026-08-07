import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function runStage(exitCode) {
  return spawnSync(
    "bash",
    [
      "-c",
      'set -euo pipefail; source scripts/qa/lib/stage-timing.sh; qa_run_stage full fixture bash -c "exit $1"',
      "stage-timing-test",
      String(exitCode),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

test("stage timing helper records pass and preserves command failure", () => {
  const passed = runStage(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(
    passed.stdout,
    /^\[qa:stage\] gate=full id=fixture status=passed durationMs=\d+$/mu,
  );

  const failed = runStage(7);
  assert.equal(failed.status, 7, failed.stderr);
  assert.match(
    failed.stdout,
    /^\[qa:stage\] gate=full id=fixture status=failed durationMs=\d+$/mu,
  );
});
