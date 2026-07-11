import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/collect-evidence.sh",
);

function runScript(args = []) {
  return spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("collect evidence help is runnable", () => {
  const result = runScript(["--help"]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /--release-version <version>/);
  assert.match(result.stdout, /不采集 secret/);
});

test("collect evidence draft includes backup restore artifact placeholders compatible with gate shape", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-evidence-"));
  const output = path.join(
    root,
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  );

  const result = runScript([
    "--release-version",
    "20260629T1200-draft",
    "--output",
    output,
  ]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const relativePath of [
    "release-evidence.md",
    "production-preflight-report.txt",
    "image-digests.txt",
    "backup-evidence.md",
    "migration-status-before-apply.txt",
    "migration-status.txt",
    "command-summary.txt",
    "backup-restore-report.json",
    "smoke-test-report.json",
    "rollback-forward-fix-plan.md",
    "rollback-rehearsal-report.json",
    "release-signoff-checklist.md",
  ]) {
    assert.ok(
      fs.existsSync(path.join(output, relativePath)),
      `missing ${relativePath}`,
    );
  }

  const report = JSON.parse(
    fs.readFileSync(path.join(output, "backup-restore-report.json"), "utf8"),
  );
  assert.deepEqual(report.artifacts, {
    backupEvidence: "backup-evidence.md",
    preMigrationStatus: "migration-status-before-apply.txt",
    migrationStatus: "migration-status.txt",
    commandSummary: "command-summary.txt",
  });
  assert.equal(
    report.backup.migrationVersion,
    "待填写，必须等于 release-evidence.md migrationBefore",
  );
  assert.equal(
    report.restore.migrationBeforeApply,
    "待填写，必须等于 release-evidence.md migrationBefore",
  );
  const preflightReport = fs.readFileSync(
    path.join(output, "production-preflight-report.txt"),
    "utf8",
  );
  assert.match(
    preflightReport,
    new RegExp(
      `--out "?${output.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/production-preflight-report\\.txt"?`,
    ),
  );
  assert.match(preflightReport, /--runtime/);
  assert.doesNotMatch(preflightReport, /"\$output_dir/);

  assert.throws(
    () =>
      validateReleaseEvidenceGate({
        repoRoot: root,
        evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
      }),
    (error) => {
      assert.match(error.message, /release evidence gate failed/);
      assert.doesNotMatch(
        error.message,
        /artifacts\.[A-Za-z]+ file not found in evidence dir/,
      );
      assert.doesNotMatch(
        error.message,
        /artifacts\.[A-Za-z]+ must stay inside evidence dir/,
      );
      return true;
    },
  );
});
