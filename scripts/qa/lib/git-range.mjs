import { execFileSync } from "node:child_process";

function commandFailure(error, args) {
  const detail = String(error?.stderr || error?.message || "git command failed")
    .trim()
    .split("\n")[0];
  return new Error(`[qa:git-range] git ${args[0]} failed: ${detail}`);
}

export function runGit(root, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: options.encoding ?? "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw commandFailure(error, args);
  }
}

export function assertSafeRevisionExpression(range) {
  if (!range || typeof range !== "string") {
    throw new Error("[qa:git-range] range is required");
  }
  if (/\s|\0/u.test(range) || range.startsWith("-")) {
    throw new Error(`[qa:git-range] unsafe revision expression: ${range}`);
  }
  return range;
}

export function validateGitRange(root, range) {
  assertSafeRevisionExpression(range);
  runGit(root, ["rev-list", "--count", range, "--"]);
  return range;
}

export function resolveDefaultRange(root) {
  let upstream = "";
  try {
    upstream = runGit(root, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]).trim();
  } catch (error) {
    let branch = "";
    try {
      branch = runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
    } catch {
      // Detached HEAD without an explicit QA_BASE_RANGE may use the local fallback below.
    }
    if (branch) {
      let configuredRemote = "";
      let configuredMerge = "";
      try {
        configuredRemote = runGit(root, ["config", "--get", `branch.${branch}.remote`]).trim();
        configuredMerge = runGit(root, ["config", "--get", `branch.${branch}.merge`]).trim();
      } catch {
        // No configured upstream: a local-only branch may use the previous commit.
      }
      if (configuredRemote && configuredMerge) {
        throw new Error(
          `[qa:git-range] configured upstream for ${branch} is unavailable; fetch ${configuredRemote} before running the gate: ${error.message}`,
        );
      }
    }
  }

  if (upstream) return validateGitRange(root, `${upstream}...HEAD`);

  try {
    runGit(root, ["rev-parse", "--verify", "HEAD~1^{commit}"]);
    return validateGitRange(root, "HEAD~1...HEAD");
  } catch {
    return "";
  }
}

export function normalizeHistoryRange(root, range) {
  validateGitRange(root, range);
  const threeDot = range.match(/^(.+)\.\.\.(.+)$/u);
  if (!threeDot) return range;

  const [, left, right] = threeDot;
  const mergeBase = runGit(root, ["merge-base", left, right]).trim();
  if (!mergeBase) {
    throw new Error(`[qa:git-range] no merge base for ${range}`);
  }
  return `${mergeBase}..${right}`;
}

export function readNullDelimited(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return text.split("\0").filter(Boolean);
}

export function gitDiffFiles(root, args) {
  return readNullDelimited(
    runGit(root, ["diff", "--name-only", "-z", ...args, "--"], {
      encoding: null,
    }),
  );
}

export function collectGitChangedFiles({
  root,
  range = "",
  includeWorktree = true,
  includeStaged = true,
  includeUntracked = false,
  diffFilter = "ACMRD",
} = {}) {
  if (!root) throw new Error("[qa:git-range] root is required");
  const files = [];
  const filterArg = `--diff-filter=${diffFilter}`;

  if (range) {
    validateGitRange(root, range);
    files.push(...gitDiffFiles(root, [filterArg, range]));
  }
  if (includeWorktree) {
    files.push(...gitDiffFiles(root, [filterArg]));
  }
  if (includeStaged) {
    files.push(...gitDiffFiles(root, ["--cached", filterArg]));
  }
  if (includeUntracked) {
    files.push(
      ...readNullDelimited(
        runGit(
          root,
          ["ls-files", "--others", "--exclude-standard", "-z", "--"],
          { encoding: null },
        ),
      ),
    );
  }

  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}
