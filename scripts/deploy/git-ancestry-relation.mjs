import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

export const GIT_ANCESTRY_RELATION_CONTRACT =
  "plush.git-ancestry-relation/v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const RELATION_ACTION = Object.freeze({
  current: ["current", "exact_sha_current"],
  ahead: ["promote", "candidate_descends_from_current"],
  behind: ["rollback", "candidate_is_ancestor_of_current"],
  diverged: ["blocked", "git_histories_diverged"],
  unknown: ["blocked", "git_ancestry_unavailable"],
});

function runGit(runCommand, repoRoot, args) {
  const result = runCommand("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error || !Number.isInteger(result.status)) return null;
  return result.status;
}

function resultFor(currentGitSha, candidateGitSha, relation) {
  const [actionClass, actionReason] = RELATION_ACTION[relation] || [];
  return validateGitAncestryRelation({
    schemaVersion: GIT_ANCESTRY_RELATION_CONTRACT,
    currentGitSha,
    candidateGitSha,
    relation,
    actionClass,
    actionReason,
  });
}

export function validateGitAncestryRelation(value) {
  const expected = RELATION_ACTION[value?.relation];
  if (
    value?.schemaVersion !== GIT_ANCESTRY_RELATION_CONTRACT ||
    !SHA_PATTERN.test(String(value?.currentGitSha || "")) ||
    !SHA_PATTERN.test(String(value?.candidateGitSha || "")) ||
    !expected ||
    value?.actionClass !== expected[0] ||
    value?.actionReason !== expected[1] ||
    (value.relation === "current" &&
      value.currentGitSha !== value.candidateGitSha)
  ) {
    throw new Error("Git ancestry relation contract is invalid");
  }
  return value;
}

export function classifyGitAncestryRelation(
  { repoRoot, currentGitSha, candidateGitSha },
  { runCommand = spawnSync } = {},
) {
  if (
    !SHA_PATTERN.test(String(currentGitSha || "")) ||
    !SHA_PATTERN.test(String(candidateGitSha || ""))
  ) {
    throw new Error("Git ancestry requires two exact commit SHAs");
  }
  const root = realpathSync(repoRoot);
  for (const gitSha of [currentGitSha, candidateGitSha]) {
    if (
      runGit(runCommand, root, ["cat-file", "-e", `${gitSha}^{commit}`]) !== 0
    ) {
      return resultFor(currentGitSha, candidateGitSha, "unknown");
    }
  }
  if (currentGitSha === candidateGitSha) {
    return resultFor(currentGitSha, candidateGitSha, "current");
  }

  const currentIsAncestor = runGit(runCommand, root, [
    "merge-base",
    "--is-ancestor",
    currentGitSha,
    candidateGitSha,
  ]);
  const candidateIsAncestor = runGit(runCommand, root, [
    "merge-base",
    "--is-ancestor",
    candidateGitSha,
    currentGitSha,
  ]);
  if (
    ![0, 1].includes(currentIsAncestor) ||
    ![0, 1].includes(candidateIsAncestor) ||
    (currentIsAncestor === 0 && candidateIsAncestor === 0)
  ) {
    return resultFor(currentGitSha, candidateGitSha, "unknown");
  }
  if (currentIsAncestor === 0) {
    return resultFor(currentGitSha, candidateGitSha, "ahead");
  }
  if (candidateIsAncestor === 0) {
    return resultFor(currentGitSha, candidateGitSha, "behind");
  }
  return resultFor(currentGitSha, candidateGitSha, "diverged");
}

export function gitActionRelationMatches(value, actionClass) {
  const relation = validateGitAncestryRelation(value);
  return relation.actionClass === actionClass;
}
