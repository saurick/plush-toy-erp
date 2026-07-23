import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

test("pre-push wrapper clears repository-local Git environment before QA", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-pre-push-wrapper-"));
  try {
    git(root, ["init", "-q"]);
    git(root, ["config", "user.name", "Sentinel Owner"]);
    git(root, ["config", "user.email", "sentinel@example.invalid"]);
    git(root, ["config", "core.bare", "false"]);

    mkdirSync(path.join(root, ".githooks"), { recursive: true });
    mkdirSync(path.join(root, "scripts/git-hooks"), { recursive: true });
    copyFileSync(
      path.join(ROOT, ".githooks/pre-push"),
      path.join(root, ".githooks/pre-push"),
    );
    writeFileSync(
      path.join(root, "scripts/git-hooks/pre-push.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
if env | grep -Eq '^(GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_INDEX_FILE)='; then
  echo "repository-local Git environment leaked into QA" >&2
  exit 3
fi
mkdir fixture
git -C fixture init -q
git -C fixture config user.name "Fixture Owner"
git -C fixture config user.email "fixture@example.invalid"
git -C fixture config core.bare true
`,
      "utf8",
    );
    chmodSync(path.join(root, ".githooks/pre-push"), 0o755);
    chmodSync(path.join(root, "scripts/git-hooks/pre-push.sh"), 0o755);

    const result = spawnSync("bash", [".githooks/pre-push", "origin"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_DIR: path.join(root, ".git"),
        GIT_WORK_TREE: root,
        GIT_COMMON_DIR: path.join(root, ".git"),
        GIT_INDEX_FILE: path.join(root, ".git/index"),
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(git(root, ["config", "--local", "core.bare"]), "false");
    assert.equal(git(root, ["config", "--local", "user.name"]), "Sentinel Owner");
    assert.equal(
      git(root, ["config", "--local", "user.email"]),
      "sentinel@example.invalid",
    );
    assert.equal(git(path.join(root, "fixture"), ["config", "core.bare"]), "true");
    assert.equal(
      git(path.join(root, "fixture"), ["config", "user.name"]),
      "Fixture Owner",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-push delegates the real stdin contract without reopening full", () => {
  const hook = readFileSync(
    path.join(ROOT, "scripts/git-hooks/pre-push.sh"),
    "utf8",
  );
  const receipt = readFileSync(
    path.join(ROOT, "scripts/qa/pre-push-receipt.mjs"),
    "utf8",
  );

  assert.match(hook, /pre-push-receipt\.mjs" "\$\{args\[@\]\}"/u);
  assert.match(hook, /args=\(verify-hook --remote "\$remote_name"\)/u);
  assert.doesNotMatch(hook, /scripts\/qa\/full\.sh/u);
  assert.doesNotMatch(hook, /SKIP_PRE_PUSH/u);
  assert.match(receipt, /readFileSync\(0, "utf8"\)/u);
  assert.match(receipt, /git", \["log", "--check", "--format=", ref\.range\]/u);
  assert.match(receipt, /SECRETS_STRICT: "1"/u);
  assert.match(receipt, /receipt\+live-range-secrets/u);
});
