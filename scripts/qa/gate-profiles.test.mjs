import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  GATE_PROFILES,
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
  assertProfileHierarchy,
  validateProfileIndexTransition,
  validateProfileFiles,
  validateWebPackageTestContract,
} from "./gate-profiles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

test("gate profiles prove strict is a full superset and full is a fast superset", () => {
  assert.doesNotThrow(() => assertProfileHierarchy());
  assert(GATE_PROFILES.full.length > GATE_PROFILES.fast.length);
  assert(GATE_PROFILES.strict.length > GATE_PROFILES.full.length);
  assert(GATE_PROFILES.strict.includes("yamllint-strict"));
  assert(PROFILE_REQUIRED_FILES.strict.includes("scripts/qa/yamllint.sh"));
  assert(PROFILE_REQUIRED_EXECUTABLES.strict.includes("scripts/qa/yamllint.sh"));
  assert(PROFILE_REQUIRED_FILES.full.includes("scripts/purchase-return-pg.sh"));
  assert(
    PROFILE_REQUIRED_EXECUTABLES.full.includes("scripts/purchase-return-pg.sh"),
  );
});

test("all current required files exist for every profile", () => {
  for (const profile of ["fast", "full", "strict"]) {
    assert.deepEqual(validateProfileFiles(profile, ROOT), {
      ok: true,
      missing: [],
      invalidType: [],
      invalidContent: [],
      nonExecutable: [],
      profile,
    });
  }
});

test("full and strict require a real web test script", () => {
  assert(GATE_PROFILES.full.includes("web-test"));
  assert(GATE_PROFILES.strict.includes("web-test"));
  assert.equal(
    validateWebPackageTestContract(
      JSON.stringify({ scripts: { test: "node --test" } }),
    ),
    true,
  );
  for (const source of [
    "{}",
    JSON.stringify({ scripts: {} }),
    JSON.stringify({ scripts: { test: "" } }),
    "not-json",
  ]) {
    assert.equal(validateWebPackageTestContract(source), false, source);
  }
});

test("a deleted required test fails closed", () => {
  const emptyRoot = mkdtempSync(path.join(os.tmpdir(), "plush-gate-required-"));
  try {
    const result = validateProfileFiles("fast", emptyRoot);
    assert.equal(result.ok, false);
    assert(result.missing.includes("scripts/qa/critical-postgres-gate.test.mjs"));
    assert(result.missing.includes("scripts/qa/secrets.test.mjs"));
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test("profile required files remain cumulative", () => {
  assert(
    PROFILE_REQUIRED_FILES.fast.every((file) => PROFILE_REQUIRED_FILES.full.includes(file)),
  );
  assert(
    PROFILE_REQUIRED_FILES.full.every((file) => PROFILE_REQUIRED_FILES.strict.includes(file)),
  );
  assert(
    PROFILE_REQUIRED_EXECUTABLES.fast.every((file) =>
      PROFILE_REQUIRED_EXECUTABLES.full.includes(file),
    ),
  );
  assert(
    PROFILE_REQUIRED_EXECUTABLES.full.every((file) =>
      PROFILE_REQUIRED_EXECUTABLES.strict.includes(file),
    ),
  );
});

test("a present but non-executable required hook fails closed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-gate-mode-"));
  try {
    const hook = path.join(root, "scripts/git-hooks/pre-push.sh");
    mkdirSync(path.dirname(hook), { recursive: true });
    writeFileSync(hook, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(hook, 0o644);

    const result = validateProfileFiles("fast", root);
    assert.equal(result.ok, false);
    assert(result.nonExecutable.includes("scripts/git-hooks/pre-push.sh"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit tree validation does not trust a restored worktree file", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-gate-tree-"));
  try {
    git(root, ["init", "-q"]);
    const hook = path.join(root, ".githooks/pre-push");
    mkdirSync(path.dirname(hook), { recursive: true });
    writeFileSync(hook, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(hook, 0o755);
    git(root, ["add", ".githooks/pre-push"]);
    git(root, [
      "-c",
      "user.name=Gate Test",
      "-c",
      "user.email=gate@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "baseline",
    ]);

    const result = validateProfileFiles("fast", root, {
      source: "tree",
      ref: "HEAD",
    });
    assert.equal(result.ok, false);
    assert(!result.missing.includes(".githooks/pre-push"));
    assert(result.missing.includes("scripts/qa/critical-postgres-gate.test.mjs"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("index transition rejects required deletion, mode loss, and symlink typechange", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-gate-index-"));
  try {
    git(root, ["init", "-q"]);
    const hook = path.join(root, ".githooks/pre-push");
    mkdirSync(path.dirname(hook), { recursive: true });
    writeFileSync(hook, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(hook, 0o755);
    git(root, ["add", ".githooks/pre-push"]);
    git(root, [
      "-c",
      "user.name=Gate Test",
      "-c",
      "user.email=gate@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "baseline",
    ]);

    git(root, ["rm", "--cached", ".githooks/pre-push"]);
    let result = validateProfileIndexTransition("fast", root);
    assert(result.missing.includes(".githooks/pre-push"));

    git(root, ["add", ".githooks/pre-push"]);
    git(root, ["update-index", "--chmod=-x", ".githooks/pre-push"]);
    result = validateProfileIndexTransition("fast", root);
    assert(result.nonExecutable.includes(".githooks/pre-push"));

    assert(result.missing.includes(".github/workflows/ci.yml"));
    const workflow = path.join(root, ".github/workflows/ci.yml");
    mkdirSync(path.dirname(workflow), { recursive: true });
    writeFileSync(workflow, "name: fixture\n", "utf8");
    git(root, ["add", ".github/workflows/ci.yml"]);
    result = validateProfileIndexTransition("fast", root);
    assert.equal(result.missing.includes(".github/workflows/ci.yml"), false);

    rmSync(hook);
    symlinkSync("pre-push-target", hook);
    git(root, ["add", ".githooks/pre-push"]);
    result = validateProfileIndexTransition("fast", root);
    assert(result.invalidType.includes(".githooks/pre-push"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
