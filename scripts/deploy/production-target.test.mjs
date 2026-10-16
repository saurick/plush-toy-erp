import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_DEPLOYMENT_TARGET_KEYS,
  getDeploymentTarget,
  loadDeploymentTargetRegistry,
} from "./deployment-targets.mjs";
import { prepareDatabaseRebuild } from "./database-rebuild-controller.mjs";
import { buildRemoteTargetInitializationPreflightScript } from "./target-initialization-preflight.mjs";
import { buildRemoteTargetPreflightScript } from "./target-preflight.mjs";
import { validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);

test("production has isolated resources and is excluded from default deployment targets", () => {
  const target = getDeploymentTarget("production-133");
  assert.equal(target.purpose, "customer-production");
  assert.equal(target.trialTarget, "none");
  assert.equal(target.publicEntry.endpoint, "https://erp.yoyoosun.net");
  assert.equal(target.database.name, "plush_erp_production");
  assert.equal(target.runtime.postgres.bindAddress, "127.0.0.1");
  assert.equal(target.runtime.app.bindAddress, "127.0.0.1");
  assert.deepEqual(DEFAULT_DEPLOYMENT_TARGET_KEYS, [
    "demo-133",
    "customer-test-133",
  ]);
  const targets = loadDeploymentTargetRegistry().targets;
  assert.equal(new Set(targets.map((item) => item.filesystem.root)).size, 3);
  assert.equal(new Set(targets.map((item) => item.database.name)).size, 3);
});

test("production rebuild fails before a release read, preflight or operation write", () => {
  const root = mkdtempSync(path.join(tmpdir(), "production-rebuild-boundary-"));
  const store = path.join(root, "must-not-exist");
  try {
    assert.throws(
      () =>
        prepareDatabaseRebuild(
          {
            repoRoot,
            operationStore: store,
            targetKey: "production-133",
            releaseManifestPath: path.join(root, "missing-manifest.json"),
            idempotencyKey: "production-rebuild-must-fail",
          },
          {
            runPreflight() {
              assert.fail("production must not run rebuild preflight");
            },
          },
        ),
      /production database rebuild is forbidden/u,
    );
    assert.equal(existsSync(store), false);
    const lowLevel = spawnSync(
      "bash",
      [
        "scripts/deploy/remote-database-rebuild.sh",
        "rebuild-database",
        "production-133",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(lowLevel.status, 0);
    assert.match(lowLevel.stderr, /unsupported target/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("production initialization reports missing recovery prerequisites without Docker or target writes", () => {
  const script = buildRemoteTargetInitializationPreflightScript(
    getDeploymentTarget("production-133"),
  );
  const fakeHost = `
hostname() { printf 'r740xd\\n'; }
id() { printf 'root\\n'; }
docker() { if [[ "$*" == *'--format'* ]]; then printf 'linux/amd64\\n'; fi; }
ss() { :; }
df() { printf 'Available\\n42949672960\\n'; }
command() { if [[ "$1" == -v && "$2" == age ]]; then return 1; fi; builtin command "$@"; }
`;
  const result = spawnSync("bash", ["-s"], {
    input: fakeHost + script,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /STATUS=blocked/u);
  assert.match(result.stdout, /initialization_production_backup_unprepared/u);
  assert.match(result.stdout, /initialization_production_offsite_unproven/u);
  const runtime = buildRemoteTargetPreflightScript(
    getDeploymentTarget("production-133"),
  );
  assert.equal(spawnSync("bash", ["-n"], { input: runtime }).status, 0);
  assert.match(runtime, /public_endpoint=https:\/\/erp\.yoyoosun\.net/u);
  assert.match(runtime, /capacity_path="\$root"/u);
});

test("production evidence never enters the fixed test credential profile", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "production-evidence-boundary-"),
  );
  try {
    const output = path.join(root, "rejected");
    const result = spawnSync(
      "node",
      [
        "scripts/deploy/collect-evidence.mjs",
        "--deployment-target",
        "production-133",
        "--profile",
        "customer-trial-acceptance",
        "--release-id",
        "production-candidate",
        "--output",
        output,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not use fixed test credentials/u);
    assert.equal(existsSync(output), false);
    assert.throws(
      () =>
        validateReleaseEvidenceGate({
          evidenceDir: root,
          deploymentTarget: "production-133",
          profile: "customer-trial-acceptance",
        }),
      /fixed test credential/u,
    );
    const accepted = spawnSync(
      "node",
      [
        "scripts/deploy/collect-evidence.mjs",
        "--deployment-target",
        "production-133",
        "--release-id",
        "production-candidate",
        "--output",
        path.join(root, "base"),
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(
      existsSync(path.join(root, "base", "credential-rotation-report.json")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("customer env sample validation is source-bound and completes without a here-string pipeline", () => {
  const result = spawnSync(
    "bash",
    [
      path.join(repoRoot, "deployments/yoyoosun/scripts/verify-env.sh"),
      "--example",
    ],
    { cwd: tmpdir(), encoding: "utf8", timeout: 5_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /verify-env.*ok/u);
});
