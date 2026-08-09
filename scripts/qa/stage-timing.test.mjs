import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

function runSubstep(exitCode) {
  return spawnSync(
    "bash",
    [
      "-c",
      'set -euo pipefail; source scripts/qa/lib/stage-timing.sh; qa_run_substep strict web production_build bash -c "exit $1"',
      "stage-timing-test",
      String(exitCode),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function runParallel({ fail = false } = {}) {
  const script = [
    "set -euo pipefail",
    "source scripts/qa/lib/stage-timing.sh",
    'fixture_one() { : > "$QA_PARALLEL_FIXTURE/one"; for _ in $(seq 1 100); do [[ -e "$QA_PARALLEL_FIXTURE/two" ]] && return 0; sleep 0.01; done; return 9; }',
    `fixture_two() { : > "$QA_PARALLEL_FIXTURE/two"; for _ in $(seq 1 100); do [[ -e "$QA_PARALLEL_FIXTURE/one" ]] && ${fail ? "return 7" : "return 0"}; sleep 0.01; done; return 8; }`,
    "qa_run_parallel_stages full shared fixture_one web fixture_two",
  ].join("; ");
  const fixture = mkdtempSync(path.join(tmpdir(), "qa-parallel-stage-"));
  try {
    return spawnSync("bash", ["-c", script], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, QA_PARALLEL_FIXTURE: fixture },
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("stage timing helper records pass and preserves command failure", () => {
  const passed = runStage(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(
    passed.stdout,
    /^\[qa:stage\] gate=full id=fixture status=running$/mu,
  );
  assert.match(
    passed.stdout,
    /^\[qa:stage\] gate=full id=fixture status=passed durationMs=\d+$/mu,
  );

  const failed = runStage(7);
  assert.equal(failed.status, 7, failed.stderr);
  assert.match(
    failed.stdout,
    /^\[qa:stage\] gate=full id=fixture status=running$/mu,
  );
  assert.match(
    failed.stdout,
    /^\[qa:stage\] gate=full id=fixture status=failed durationMs=\d+$/mu,
  );
});

test("substep timing helper emits bounded identity and preserves failure", () => {
  const passed = runSubstep(0);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(
    passed.stdout,
    /^\[qa:substep\] gate=strict stage=web id=production_build status=running$/mu,
  );
  assert.match(
    passed.stdout,
    /^\[qa:substep\] gate=strict stage=web id=production_build status=passed durationMs=\d+$/mu,
  );

  const failed = runSubstep(9);
  assert.equal(failed.status, 9, failed.stderr);
  assert.match(
    failed.stdout,
    /^\[qa:substep\] gate=strict stage=web id=production_build status=failed durationMs=\d+$/mu,
  );
  assert.doesNotMatch(failed.stdout, /bash|scripts|\/Users|environment/iu);
});

test("parallel stage helper overlaps registered stages and preserves failure", () => {
  const passed = runParallel();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(
    passed.stdout,
    /^\[qa:parallel\] gate=full ids=shared,web status=running$/mu,
  );
  assert.match(
    passed.stdout,
    /^\[qa:parallel\] gate=full ids=shared,web status=passed durationMs=\d+$/mu,
  );
  for (const stage of ["shared", "web"]) {
    assert.match(
      passed.stdout,
      new RegExp(
        `^\\[qa:stage\\] gate=full id=${stage} status=passed durationMs=\\d+$`,
        "mu",
      ),
    );
  }

  const failed = runParallel({ fail: true });
  assert.equal(failed.status, 7);
  assert.match(
    failed.stdout,
    /^\[qa:parallel\] gate=full ids=shared,web status=failed durationMs=\d+$/mu,
  );
  assert.match(
    failed.stdout,
    /^\[qa:stage\] gate=full id=web status=failed durationMs=\d+$/mu,
  );
});
