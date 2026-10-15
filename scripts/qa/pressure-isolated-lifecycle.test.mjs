import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyPressureBuildSource, pressureBuildSourceFingerprint, pressureLifecyclePlan, pressureNetworkConfig, runPressureLifecycle, updatePressureProgress } from "./pressure-isolated-lifecycle.mjs";

test("lifecycle defaults to a read-only plan without credentials or resource creation", () => {
  const stdout = execFileSync(process.execPath, ["scripts/qa/pressure-isolated-lifecycle.mjs"], { encoding: "utf8" });
  const plan = JSON.parse(stdout);
  assert.equal(plan.simulatedOnly, true); assert.equal(plan.mainDurationMs, 600000);
  assert.equal(plan.databaseProfile, "capacity"); assert.equal(plan.poolSize, 262);
  assert.ok(plan.steps.includes("dispose owned resources"));
  assert.doesNotMatch(stdout, /postgres:\/\/|access_token|password=/u);
});
test("unknown profiles fail before creating any runtime resources", async () => {
  assert.throws(() => pressureLifecyclePlan("shared-development"));
  await assert.rejects(runPressureLifecycle({ profile: "production" }), /profile/u);
});
test("build identity compares source and temporary snapshots while ignoring generated runtime folders", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "plush-pressure-fingerprint-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  mkdirSync(path.join(source, "bin"), { recursive: true });
  writeFileSync(path.join(source, "main.go"), "package main\n");
  const fingerprint = pressureBuildSourceFingerprint(source);
  writeFileSync(path.join(source, "bin", "ignored.go"), "ignored\n");
  assert.equal(pressureBuildSourceFingerprint(source), fingerprint);
  writeFileSync(path.join(source, "main.go"), "package changed\n");
  assert.notEqual(pressureBuildSourceFingerprint(source), fingerprint);
});
test("candidate source copies from a temporary checkout without including local runtime files", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "plush-pressure-copy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "tmp", "checkout", "server"), snapshot = path.join(directory, "snapshot");
  mkdirSync(path.join(source, "tmp"), { recursive: true });
  writeFileSync(path.join(source, "main.go"), "package main\n");
  writeFileSync(path.join(source, "migration.sql"), "SELECT 1;\n");
  writeFileSync(path.join(source, "atlas.sum"), "migration checksum\n");
  writeFileSync(path.join(source, "atlas.hcl"), "migration config\n");
  writeFileSync(path.join(source, "tmp", "ignored.go"), "runtime\n");
  writeFileSync(path.join(source, ".env.local"), "private\n");
  writeFileSync(path.join(source, "config.local.yaml"), "private\n");
  copyPressureBuildSource(source, snapshot);
  assert.equal(readFileSync(path.join(snapshot, "main.go"), "utf8"), "package main\n");
  for (const name of ["tmp", ".env.local", "config.local.yaml"]) assert.equal(existsSync(path.join(snapshot, name)), false);
  assert.equal(pressureBuildSourceFingerprint(snapshot), pressureBuildSourceFingerprint(source));
  for (const name of ["migration.sql", "atlas.sum", "atlas.hcl"]) {
    assert.equal(readFileSync(path.join(snapshot, name), "utf8"), readFileSync(path.join(source, name), "utf8"));
    const fingerprint = pressureBuildSourceFingerprint(source);
    writeFileSync(path.join(source, name), "changed\n");
    assert.notEqual(pressureBuildSourceFingerprint(source), fingerprint);
  }
});
test("public progress keeps fixed phases, bounded counts and cleanup separate from business acceptance", () => {
  let progress = updatePressureProgress(null, { step: "build", status: "started", secret: "private" });
  progress = updatePressureProgress(progress, { step: "build", status: "completed" });
  progress = updatePressureProgress(progress, { step: "engineering-data", status: "started" });
  progress = updatePressureProgress(progress, { step: "orders", completed: 20, total: 42 });
  assert.equal(progress.phase, "engineering-data"); assert.equal(progress.total, 42);
  assert.deepEqual(progress.completedSteps, ["build"]); assert.equal(progress.secret, undefined);
  progress = updatePressureProgress(progress, { step: "cleanup", status: "completed", passed: false });
  assert.equal(progress.status, "failed");
});

test("data scale changes background volume without changing the working pool or timing", () => {
  const baseline = pressureLifecyclePlan("quick", "baseline"), growth = pressureLifecyclePlan("quick", "growth");
  assert.equal(growth.poolSize, baseline.poolSize);
  assert.equal(growth.mainDurationMs, baseline.mainDurationMs);
  assert.ok(growth.historyOrders > baseline.historyOrders);
  assert.ok(growth.readTargets.workflowTasks > baseline.readTargets.workflowTasks);
  assert.throws(() => pressureLifecyclePlan("quick", "arbitrary"));
});

test("an explicit fixture subnet is limited to a small aligned private network", () => {
  assert.deepEqual(pressureNetworkConfig(), []);
  assert.ok(pressureNetworkConfig("10.254.241.0/28").includes("        - subnet: 10.254.241.0/28"));
  for (const value of ["0.0.0.0/0", "10.0.0.0/8", "10.0.0.1/28", "10.999.0.0/28", "8.8.8.0/28", "10.0.0.0/28\nsecret: value"])
    assert.throws(() => pressureNetworkConfig(value));
});
