import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classifyGitAncestryRelation,
  gitActionRelationMatches,
  validateGitAncestryRelation,
} from "./git-ancestry-relation.mjs";

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function commit(repo, name, content) {
  writeFileSync(path.join(repo, name), content);
  git(repo, "add", name);
  git(
    repo,
    "-c",
    "user.name=Codex Test",
    "-c",
    "user.email=codex@example.invalid",
    "commit",
    "-m",
    name,
  );
  return git(repo, "rev-parse", "HEAD");
}

function fixture(t) {
  const repo = mkdtempSync(path.join(os.tmpdir(), "plush-git-relation-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "--quiet");
  const base = commit(repo, "base.txt", "base\n");
  const ahead = commit(repo, "ahead.txt", "ahead\n");
  git(repo, "checkout", "--quiet", "--detach", base);
  const branch = commit(repo, "branch.txt", "branch\n");
  return { repo, base, ahead, branch };
}

test("Git relation classifies current, ahead, behind and diverged", (t) => {
  const { repo, base, ahead, branch } = fixture(t);
  const current = classifyGitAncestryRelation({
    repoRoot: repo,
    currentGitSha: base,
    candidateGitSha: base,
  });
  const promote = classifyGitAncestryRelation({
    repoRoot: repo,
    currentGitSha: base,
    candidateGitSha: ahead,
  });
  const rollback = classifyGitAncestryRelation({
    repoRoot: repo,
    currentGitSha: ahead,
    candidateGitSha: base,
  });
  const diverged = classifyGitAncestryRelation({
    repoRoot: repo,
    currentGitSha: ahead,
    candidateGitSha: branch,
  });

  assert.equal(current.relation, "current");
  assert.equal(current.actionClass, "current");
  assert.equal(promote.relation, "ahead");
  assert.equal(promote.actionClass, "promote");
  assert.equal(rollback.relation, "behind");
  assert.equal(rollback.actionClass, "rollback");
  assert.equal(diverged.relation, "diverged");
  assert.equal(diverged.actionClass, "blocked");
  assert.equal(gitActionRelationMatches(promote, "promote"), true);
  assert.equal(gitActionRelationMatches(rollback, "promote"), false);
});

test("Git relation fails closed when a commit or ancestry result is unavailable", (t) => {
  const { repo, base } = fixture(t);
  const missing = "f".repeat(40);
  const unavailable = classifyGitAncestryRelation({
    repoRoot: repo,
    currentGitSha: base,
    candidateGitSha: missing,
  });
  assert.equal(unavailable.relation, "unknown");
  assert.equal(unavailable.actionReason, "git_ancestry_unavailable");
  assert.throws(
    () =>
      validateGitAncestryRelation({
        ...unavailable,
        actionClass: "promote",
      }),
    /contract is invalid/u,
  );
  assert.throws(
    () =>
      classifyGitAncestryRelation({
        repoRoot: repo,
        currentGitSha: "short",
        candidateGitSha: base,
      }),
    /two exact commit SHAs/u,
  );
});
