import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertScenarioServerCompatibility,
  captureScenarioGeneration,
  finishScenarioGeneration,
  readScenarioGeneration,
  readScenarioGenerationSource,
  SCENARIO_GENERATION_ROOT,
} from "./scenario-generation-snapshot.mjs";

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "scenario-snapshot-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      encoding: "utf8",
    }).trim();
  git("init", "-q");
  write(".gitignore", "output/\n.env\n*.local.yaml\n");
  write("scripts/qa/scenario-demo-data.mjs", "export const amount = 1;\n");
  write("server/internal/biz/order.go", "package biz\n");
  write("server/go.mod", "module snapshot-fixture\n");
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "-qm",
    "fixture",
  );
  const commit = git("rev-parse", "HEAD");
  const plan = (targetEnvironment = "local-development") => ({
    sourceFingerprint: readScenarioGenerationSource(root).fingerprint,
    repository: { commit, dirty: true, fingerprint: "a".repeat(64) },
    planDigest: "b".repeat(64),
    targetEnvironment,
    target: { targetFingerprint: "c".repeat(64) },
    backendURL:
      targetEnvironment === "local-development"
        ? "http://127.0.0.1:8300"
        : "https://demo.yoyoosun.net",
    databaseName:
      targetEnvironment === "local-development"
        ? "plush_erp"
        : "plush_erp_demo_v1",
    release: commit,
    migrationVersion: "20261107000000",
    runtime: { configRevision: "fixture" },
    sourceScaleProfile: "volume",
    canonicalPlan: {
      semanticPlan: {
        datasetKey: "simulated",
        dateAnchorUtc: "2026-11-14",
        stages: ["source"],
      },
    },
  });
  return { root, write, git, commit, plan };
}

test("snapshot captures uncommitted and untracked code, excludes private files, and deduplicates across targets", (t) => {
  const f = fixture(t);
  f.write("scripts/qa/scenario-demo-data.mjs", "export const amount = 2;\n");
  f.write("scripts/qa/new-helper.mjs", "export const label = 'uncommitted';\n");
  f.write("server/.env", "PASSWORD=must-not-copy\n");
  f.write("server/configs/dev/config.local.yaml", "password: must-not-copy\n");
  f.write("config/credentials.json", '{"password":"must-not-copy"}');
  const first = captureScenarioGeneration({
    projectRoot: f.root,
    plan: f.plan(),
    now: new Date("2026-11-14T02:00:00.000Z"),
  });
  const second = captureScenarioGeneration({
    projectRoot: f.root,
    plan: f.plan("customer-trial-133"),
    now: new Date("2026-11-14T02:01:00.000Z"),
  });
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.notEqual(first.parametersFingerprint, second.parametersFingerprint);
  assert.notEqual(first.id, second.id);
  assert.match(first.batchId, /^20261114T020000000Z_[a-f0-9]{12}$/u);
  const codeRoot = path.join(f.root, SCENARIO_GENERATION_ROOT, "code");
  assert.equal(fs.readdirSync(codeRoot).length, 1);
  const archive = path.join(codeRoot, first.sourceFingerprint, "source.tar.gz");
  const restored = path.join(f.root, "restored");
  fs.mkdirSync(restored);
  execFileSync("tar", ["-xzf", archive, "-C", restored]);
  assert.equal(
    fs.readFileSync(
      path.join(restored, "scripts/qa/scenario-demo-data.mjs"),
      "utf8",
    ),
    "export const amount = 2;\n",
  );
  assert.equal(
    fs.existsSync(path.join(restored, "scripts/qa/new-helper.mjs")),
    true,
  );
  for (const file of [
    "server/.env",
    "server/configs/dev/config.local.yaml",
    "config/credentials.json",
  ])
    assert.equal(fs.existsSync(path.join(restored, file)), false);
  assert.equal(readScenarioGeneration(f.root, first.id).status, "running");
  assert.equal(
    finishScenarioGeneration(
      f.root,
      first.id,
      "passed",
      new Date("2026-11-14T02:02:00.000Z"),
    ).status,
    "passed",
  );
  assert.equal(fs.statSync(archive).mode % 512, 0o600);
});

test("content identity changes without commits and source drift never receives a passed receipt", (t) => {
  const f = fixture(t);
  const before = f.plan();
  f.write("scripts/qa/new-helper.mjs", "export const changed = true;\n");
  assert.notEqual(f.plan().sourceFingerprint, before.sourceFingerprint);
  assert.throws(
    () => captureScenarioGeneration({ projectRoot: f.root, plan: before }),
    /发生变化/u,
  );
  const receipt = captureScenarioGeneration({
    projectRoot: f.root,
    plan: f.plan(),
  });
  f.write("scripts/qa/new-helper.mjs", "export const changed = false;\n");
  assert.throws(
    () => finishScenarioGeneration(f.root, receipt.id, "passed"),
    /发生变化/u,
  );
  assert.equal(
    finishScenarioGeneration(f.root, receipt.id, "not_proven").status,
    "not_proven",
  );
  assert.equal(f.git("rev-parse", "HEAD"), f.commit);
});

test("corrupt parameters or code archive fail closed, and execution IDs cannot overwrite existing runs", (t) => {
  const f = fixture(t);
  const receipt = captureScenarioGeneration({
    projectRoot: f.root,
    plan: f.plan(),
  });
  assert.throws(
    () =>
      captureScenarioGeneration({
        projectRoot: f.root,
        plan: f.plan(),
        executionId: receipt.id,
      }),
    /EEXIST/u,
  );
  assert.throws(
    () => readScenarioGeneration(f.root, "../escape"),
    /id is invalid/u,
  );
  const parameters = path.join(
    f.root,
    SCENARIO_GENERATION_ROOT,
    "runs",
    receipt.id,
    "parameters.json",
  );
  const original = fs.readFileSync(parameters);
  fs.writeFileSync(parameters, "{}");
  assert.throws(() => readScenarioGeneration(f.root, receipt.id), /integrity/u);
  fs.writeFileSync(parameters, original);
  fs.writeFileSync(
    path.join(
      f.root,
      SCENARIO_GENERATION_ROOT,
      "code",
      receipt.sourceFingerprint,
      "source.tar.gz",
    ),
    "corrupt",
  );
  assert.throws(
    () => captureScenarioGeneration({ projectRoot: f.root, plan: f.plan() }),
    /integrity/u,
  );
});

test("snapshot refuses source links and links in the snapshot destination", (t) => {
  const f = fixture(t);
  fs.symlinkSync("/etc/hosts", path.join(f.root, "scripts/qa/linked.mjs"));
  assert.throws(() => readScenarioGenerationSource(f.root), /regular file/u);
  fs.unlinkSync(path.join(f.root, "scripts/qa/linked.mjs"));
  const source = f.plan();
  fs.mkdirSync(path.join(f.root, "elsewhere"));
  fs.symlinkSync(path.join(f.root, "elsewhere"), path.join(f.root, "output"));
  assert.throws(
    () => captureScenarioGeneration({ projectRoot: f.root, plan: source }),
    /symbolic links/u,
  );
  assert.deepEqual(fs.readdirSync(path.join(f.root, "elsewhere")), []);
});

test("remote compatibility accepts dirty generator code and rejects undeployed backend changes including new files", (t) => {
  const f = fixture(t);
  f.write("scripts/qa/scenario-demo-data.mjs", "export const amount = 3;\n");
  assert.doesNotThrow(() =>
    assertScenarioServerCompatibility(f.root, f.commit),
  );
  f.write("server/internal/biz/order_test.go", "package biz\n");
  assert.doesNotThrow(() =>
    assertScenarioServerCompatibility(f.root, f.commit),
  );
  f.write(
    "server/internal/biz/order.go",
    "package biz\nconst NewRule = true\n",
  );
  assert.throws(
    () => assertScenarioServerCompatibility(f.root, f.commit),
    /请先发布/u,
  );
  f.write("server/internal/biz/order.go", "package biz\n");
  f.write("server/internal/biz/new.go", "package biz\n");
  assert.throws(
    () => assertScenarioServerCompatibility(f.root, f.commit),
    /请先发布/u,
  );
  assert.throws(
    () => assertScenarioServerCompatibility(f.root, "f".repeat(40)),
    /同步已部署/u,
  );
  assert.equal(readScenarioGeneration(f.root, randomUUID()), null);
});
