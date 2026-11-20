import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runGit } from "./lib/git-range.mjs";

export const CI_TRUST_SCHEMA = "plush.gitlab-ci-trust/v2";
// This checkpoint's reachable history was scanned with both policy files below.
const MAIN_HISTORY_CHECKPOINT = "3988143c51397f8d450c781e1d4536e5067fa6a4";
const GITLEAKS_VERSION = "8.30.1";
const POLICY_FILES = [".gitleaks.toml", ".gitleaksignore"];
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function commit(root, sha) {
  if (!SHA_PATTERN.test(sha) || runGit(root, ["rev-parse", "--verify", `${sha}^{commit}`]).trim() !== sha) {
    throw new Error("history scan requires an exact commit SHA");
  }
  return sha;
}

export function resolveHistoryScan(root, { gitSha, source, mrBaseSha, checkpoint = MAIN_HISTORY_CHECKPOINT }) {
  const head = commit(root, gitSha);
  const mr = source === "merge_request_event";
  if (!mr && source !== "push" && source !== "web") {
    throw new Error("unsupported history scan pipeline source");
  }
  const policyCommit = commit(root, mr ? mrBaseSha : checkpoint);
  const base = runGit(root, ["merge-base", policyCommit, head]).trim();
  if (!mr && base !== policyCommit) {
    throw new Error("main history does not contain the audited scan checkpoint");
  }
  const [configBlob, ignoreBlob] = POLICY_FILES.map((file) => {
    const [mode, type, object] = runGit(root, ["ls-tree", "-z", policyCommit, "--", file]).split(/\s+/u);
    if (mode !== "100644" || type !== "blob" || !SHA_PATTERN.test(object)) {
      throw new Error(`invalid trusted scan policy file: ${file}`);
    }
    return object;
  });
  return { range: `${base}..${head}`, policyCommit, configBlob, ignoreBlob };
}

export function assertHistoryScanEvidence(value, expected) {
  if (!value || value.gitleaksVersion !== GITLEAKS_VERSION || value.status !== "passed" ||
      Object.entries(expected).some(([key, item]) => value[key] !== item)) {
    throw new Error("history scan evidence does not cover the expected range and policy");
  }
}

export function scanGitLabHistory(root, context) {
  const scan = resolveHistoryScan(root, context);
  const directory = mkdtempSync(path.join(os.tmpdir(), "plush-ci-history-"));
  try {
    const gitDir = runGit(root, ["rev-parse", "--absolute-git-dir"]).trim();
    const version = execFileSync("gitleaks", ["version"], { cwd: directory, encoding: "utf8", timeout: 5_000 }).trim();
    if (version !== GITLEAKS_VERSION) throw new Error("unexpected Gitleaks version");
    const [config, ignore] = POLICY_FILES.map((file, index) => {
      const target = path.join(directory, file);
      writeFileSync(target, runGit(root, ["cat-file", "blob", [scan.configBlob, scan.ignoreBlob][index]]), { mode: 0o600 });
      return target;
    });
    // Gitleaks also loads .gitleaksignore from its source directory. Use only the
    // Git directory so neither the candidate ignore file nor cwd can add exclusions.
    execFileSync("gitleaks", ["git", "--config", config, "--gitleaks-ignore-path", ignore,
      "--ignore-gitleaks-allow", "--log-opts", `--full-history --diff-merges=first-parent ${scan.range}`,
      "--no-banner", "--redact=100", gitDir], {
      cwd: directory,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" },
      stdio: ["ignore", "ignore", "inherit"],
      timeout: 120_000,
    });
    return { ...scan, gitleaksVersion: version, status: "passed" };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = path.resolve(import.meta.dirname, "../..");
    console.log(JSON.stringify(scanGitLabHistory(root, {
      gitSha: process.env.CI_COMMIT_SHA,
      source: process.env.CI_PIPELINE_SOURCE,
      mrBaseSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
    })));
  } catch (error) {
    console.error(`[ci-history-scan] blocked: ${error.status ? `Gitleaks exit ${error.status}` : error.message}`);
    process.exitCode = 1;
  }
}
