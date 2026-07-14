import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectGitChangedFiles,
  normalizeHistoryRange,
  resolveDefaultRange,
  validateGitRange,
} from "./git-range.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function withRepository(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-git-range-"));
  try {
    git(root, ["init", "-q"]);
    await writeFile(path.join(root, "base.txt"), "base\n", "utf8");
    git(root, ["add", "base.txt"]);
    git(root, [
      "-c",
      "user.name=Gate Test",
      "-c",
      "user.email=gate@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "base",
    ]);
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("git range rejects missing and unsafe revisions", async () => {
  await withRepository(async (root) => {
    assert.throws(
      () => validateGitRange(root, "refs/heads/definitely-missing...HEAD"),
      /git rev-list failed/u,
    );
    assert.throws(() => validateGitRange(root, "--all"), /unsafe revision/u);
    assert.throws(
      () => validateGitRange(root, "HEAD --all"),
      /unsafe revision/u,
    );
  });
});

test("git range is NUL-safe for spaces and keeps staged/worktree changes", async () => {
  await withRepository(async (root) => {
    await mkdir(path.join(root, "dir with spaces"));
    await writeFile(
      path.join(root, "dir with spaces", "staged file.txt"),
      "staged\n",
      "utf8",
    );
    await writeFile(path.join(root, "base.txt"), "changed\n", "utf8");
    git(root, ["add", "dir with spaces/staged file.txt"]);

    assert.deepEqual(collectGitChangedFiles({ root }), [
      "base.txt",
      "dir with spaces/staged file.txt",
    ]);
  });
});

test("three-dot history range normalizes to merge-base..head", async () => {
  await withRepository(async (root) => {
    const base = git(root, ["rev-parse", "HEAD"]);
    await writeFile(path.join(root, "next.txt"), "next\n", "utf8");
    git(root, ["add", "next.txt"]);
    git(root, [
      "-c",
      "user.name=Gate Test",
      "-c",
      "user.email=gate@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "next",
    ]);

    assert.equal(normalizeHistoryRange(root, `${base}...HEAD`), `${base}..HEAD`);
  });
});

test("configured but unavailable upstream fails closed instead of scanning only HEAD~1", async () => {
  await withRepository(async (root) => {
    const branch = git(root, ["branch", "--show-current"]);
    git(root, ["remote", "add", "origin", path.join(root, "missing-remote.git")]);
    git(root, ["config", `branch.${branch}.remote`, "origin"]);
    git(root, ["config", `branch.${branch}.merge`, "refs/heads/main"]);

    assert.throws(
      () => resolveDefaultRange(root),
      /configured upstream.*unavailable/u,
    );
  });
});
