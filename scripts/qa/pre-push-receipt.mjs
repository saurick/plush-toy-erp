import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  GATE_PROFILES,
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
  validateWebPackageTestContract,
} from "./gate-profiles.mjs";
import {
  buildAffectedPlan,
  selectPrePushProfile,
} from "./affected.mjs";
import { collectGitChangedFiles } from "./lib/git-range.mjs";

export const PRE_PUSH_RECEIPT_CONTRACT = "plush.pre-push-receipt/v6";
export const PRE_PUSH_RECEIPT_TTL_MS = 30 * 60 * 1000;
export const PRE_PUSH_ENVIRONMENT_CONTRACT = "plush.pre-push-environment/v2";
export const PRE_PUSH_GATE_CONTRACT = "plush.pre-push-gate-tree/v5";
export const PRE_PUSH_SIGNATURE_CONTRACT = "hmac-sha256/v1";
export const REMOTE_REF_QUERY_TIMEOUT_MS = 20_000;
export const REVIEW_PUSH_BASE_REF = "refs/heads/main";
export const REVIEW_PUSH_LOCAL_REF = "refs/heads/main";
export const REVIEW_PUSH_REMOTE_REF = "refs/heads/review/gpt";

const ZERO_SHA = "0000000000000000000000000000000000000000";
const REVIEW_PUSH_CONTRACT = "plush.review-push/v1";
const LIVE_PUSH_CHECKS_CONTRACT = "plush.live-push-checks/v1";
const SERVER_CI_REQUIRED_CONTRACT = "plush.server-ci-required/v1";
const CANONICAL_GITLAB_REMOTE = "origin";
const CANONICAL_GITLAB_REF = "refs/heads/main";
const CLOCK_SKEW_MS = 30_000;
const REMOTE_REF_QUERY_RETRY_DELAYS_MS = Object.freeze([250, 750]);
const RETRYABLE_REMOTE_REF_QUERY_PATTERN =
  /(?:timed out|ETIMEDOUT|connection (?:closed|refused|reset)|network is unreachable|could not resolve host(?:name)?|temporary failure in name resolution)/iu;
const STATE_DIRECTORY = "plush-qa/pre-push";
const FORBIDDEN_ENVIRONMENT = Object.freeze([
  "QA_BASE_RANGE",
  "QA_DB_GUARD_RANGE",
  "QA_GATE_COVERAGE_RECEIPT",
  "QA_GATE_ORCHESTRATOR",
  "SKIP_PRE_PUSH",
  "SKIP_DB_GUARD",
  "SKIP_ERROR_CODE_SYNC",
  "SKIP_ERROR_CODE_GUARD",
  "ERROR_CODE_GUARD_STAGED_ONLY",
  "SKIP_SECRETS_SCAN",
  "SECRETS_STAGED_ONLY",
  "SKIP_GOVULNCHECK",
  "STRICT_SKIP_SHELLCHECK",
  "STRICT_SKIP_SHFMT",
  "STRICT_SKIP_GOVULNCHECK",
]);
const ENVIRONMENT_KEYS = Object.freeze([
  "PATH",
  "NODE_OPTIONS",
  "PNPM_HOME",
  "COREPACK_HOME",
  "COREPACK_NPM_REGISTRY",
  "GOFLAGS",
  "GOTOOLCHAIN",
  "GOPROXY",
  "GONOSUMDB",
  "GOSUMDB",
  "GOPRIVATE",
  "CGO_ENABLED",
  "CC",
  "CXX",
  "PURCHASE_RECEIPT_PG_DB_URL",
  "POPULATED_UPGRADE_DATABASE_URL",
  "ERP_PDF_CHROME_PATH",
  "CHROME_DEVEL_SANDBOX",
  "QA_BROWSER_SCENARIOS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
]);
const DEPENDENCY_METADATA_FILES = Object.freeze([
  "web/node_modules/.modules.yaml",
  "web/node_modules/.pnpm/lock.yaml",
  "web/node_modules/.pnpm-workspace-state-v1.json",
]);

class ReceiptError extends Error {
  constructor(reason, detail = "", exitCode = 2) {
    super(detail || reason);
    this.reason = reason;
    this.detail = detail;
    this.exitCode = exitCode;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function commandResult(
  command,
  args,
  { cwd, env = process.env, input, timeout } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  return {
    error: result.error,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runCommand(
  command,
  args,
  {
    cwd,
    env = process.env,
    input,
    inherit = false,
    reason = "command_failed",
    acceptedStatuses = [0],
    timeout,
  } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: inherit ? undefined : "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    stdio: inherit ? "inherit" : input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  if (result.error || !acceptedStatuses.includes(result.status)) {
    const detail = String(result.stderr || result.stdout || result.error?.message || "")
      .trim()
      .split("\n")[0];
    throw new ReceiptError(
      reason,
      `${command} ${args[0] || ""} failed${detail ? `: ${detail}` : ""}`,
      result.status || 1,
    );
  }
  return inherit ? "" : result.stdout || "";
}

function runGit(root, args, options = {}) {
  return runCommand("git", args, {
    cwd: root,
    reason: options.reason || "git_command_failed",
    acceptedStatuses: options.acceptedStatuses,
    timeout: options.timeout,
  });
}

function optionalGit(root, args) {
  const result = commandResult("git", args, { cwd: root });
  if (result.error || result.status !== 0) return "";
  return result.stdout.trim();
}

function assertSafeRef(root, ref, label) {
  if (
    !ref ||
    typeof ref !== "string" ||
    /\s|\0/u.test(ref) ||
    ref.startsWith("-") ||
    !ref.startsWith("refs/")
  ) {
    throw new ReceiptError("unsafe_ref", `${label}=${ref || "(empty)"}`);
  }
  const result = commandResult("git", ["check-ref-format", ref], { cwd: root });
  if (result.error || result.status !== 0) {
    throw new ReceiptError("unsafe_ref", `${label}=${ref}`);
  }
}

function assertCommitSha(value, label, { allowZero = false } = {}) {
  if (!/^[0-9a-f]{40}$/u.test(value) || (!allowZero && value === ZERO_SHA)) {
    throw new ReceiptError("invalid_push_sha", `${label}=${value || "(empty)"}`);
  }
}

function assertNoForbiddenEnvironment(env = process.env) {
  for (const key of FORBIDDEN_ENVIRONMENT) {
    if (env[key] !== undefined && env[key] !== "" && env[key] !== "0") {
      throw new ReceiptError("forbidden_environment", `variable=${key}`);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (
      value !== undefined &&
      value !== "" &&
      value !== "0" &&
      (/^(?:SKIP_|STRICT_SKIP_)/u.test(key) ||
        /^PRE_PUSH_RECEIPT_/u.test(key))
    ) {
      throw new ReceiptError("forbidden_environment", `variable=${key}`);
    }
  }
  if (env.STYLE_L1_BASE_URL) {
    throw new ReceiptError("forbidden_environment", "variable=STYLE_L1_BASE_URL");
  }
}

function readRepositorySnapshot(root) {
  const head = runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  const tree = runGit(root, ["rev-parse", "--verify", "HEAD^{tree}"]).trim();
  const status = runGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  return { head, tree, clean: status.length === 0, status };
}

function assertCleanSnapshot(snapshot, reason = "dirty_worktree") {
  if (!snapshot.clean) {
    const files = snapshot.status
      .split("\0")
      .filter(Boolean)
      .slice(0, 8)
      .join(" | ");
    throw new ReceiptError(reason, files ? `files=${files}` : "");
  }
}

function assertSnapshotUnchanged(before, after) {
  if (before.head !== after.head) {
    throw new ReceiptError(
      "head_changed_during_gate",
      `before=${before.head} after=${after.head}`,
    );
  }
  if (before.tree !== after.tree) {
    throw new ReceiptError(
      "tree_changed_during_gate",
      `before=${before.tree} after=${after.tree}`,
    );
  }
  assertCleanSnapshot(after, "worktree_changed_during_gate");
}

function normalizeRemoteLocation(root, location) {
  const value = String(location || "").trim();
  if (!value) return "";
  if (/^file:\/\//u.test(value)) {
    try {
      return fileURLToPath(value);
    } catch {
      return value;
    }
  }
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  ) {
    const absolute = path.resolve(root, value);
    return existsSync(absolute) ? realpathSync(absolute) : absolute;
  }
  return value;
}

function resolveRemoteLocation(root, remoteName, suppliedLocation = "") {
  const configured = runGit(root, ["remote", "get-url", "--push", remoteName]).trim();
  const effective = suppliedLocation || configured;
  const normalized = normalizeRemoteLocation(root, effective);
  return { sha256: sha256(normalized) };
}

function parseRefspec(root, value) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new ReceiptError(
      "invalid_refspec",
      `expected=<local-ref>:<remote-ref> value=${value}`,
    );
  }
  const localRef = value.slice(0, separator);
  const remoteRef = value.slice(separator + 1);
  assertSafeRef(root, localRef, "local_ref");
  assertSafeRef(root, remoteRef, "remote_ref");
  return { localRef, remoteRef };
}

function resolveDefaultPreparation(root, requestedRemote = "") {
  const branch = optionalGit(root, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  if (!branch) {
    throw new ReceiptError(
      "detached_head_requires_refspec",
      "use --ref <local-ref>:<remote-ref>",
    );
  }

  const branchRemote = optionalGit(root, [
    "config",
    "--get",
    `branch.${branch}.remote`,
  ]);
  const remoteName =
    requestedRemote ||
    optionalGit(root, ["config", "--get", `branch.${branch}.pushRemote`]) ||
    optionalGit(root, ["config", "--get", "remote.pushDefault"]) ||
    (branchRemote && branchRemote !== "." ? branchRemote : "") ||
    "origin";
  const configuredMerge = optionalGit(root, [
    "config",
    "--get",
    `branch.${branch}.merge`,
  ]);
  const remoteRef =
    configuredMerge && (!requestedRemote || remoteName === branchRemote)
      ? configuredMerge
      : `refs/heads/${branch}`;
  const localRef = `refs/heads/${branch}`;
  assertSafeRef(root, localRef, "local_ref");
  assertSafeRef(root, remoteRef, "remote_ref");
  return { remoteName, refspecs: [{ localRef, remoteRef }] };
}

function readRemoteRefs(root, remoteName, remoteRefs) {
  const unique = [...new Set(remoteRefs)].sort();
  const output = runRemoteRefQueryWithRetry(root, [
    "ls-remote",
    "--refs",
    remoteName,
    ...unique,
  ]);
  const refs = new Map();
  for (const line of output.split("\n").filter(Boolean)) {
    const [sha, ref, extra] = line.trim().split(/\s+/u);
    if (!sha || !ref || extra) {
      throw new ReceiptError("invalid_remote_ref_response", "git ls-remote");
    }
    assertCommitSha(sha, "remote_sha");
    if (!unique.includes(ref) || refs.has(ref)) {
      throw new ReceiptError("invalid_remote_ref_response", `remote_ref=${ref}`);
    }
    refs.set(ref, sha);
  }
  return refs;
}

function waitForRemoteRefQueryRetry(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

export function runRemoteRefQueryWithRetry(
  root,
  args,
  { runner = runGit, wait = waitForRemoteRefQueryRetry } = {},
) {
  for (
    let attempt = 0;
    attempt <= REMOTE_REF_QUERY_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    try {
      return runner(root, args, {
        reason: "remote_ref_query_failed",
        timeout: REMOTE_REF_QUERY_TIMEOUT_MS,
      });
    } catch (error) {
      const retryable =
        error?.reason === "remote_ref_query_failed" &&
        RETRYABLE_REMOTE_REF_QUERY_PATTERN.test(String(error?.detail || ""));
      if (!retryable || attempt === REMOTE_REF_QUERY_RETRY_DELAYS_MS.length) {
        throw error;
      }
      wait(REMOTE_REF_QUERY_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new ReceiptError("remote_ref_query_failed");
}

function sortPushRefs(refs) {
  return [...refs].sort((left, right) =>
    `${left.remoteRef}\0${left.localRef}`.localeCompare(
      `${right.remoteRef}\0${right.localRef}`,
    ),
  );
}

function computeAggregateRange(root, head, refs) {
  if (refs.length === 0) return "";
  if (refs.some((ref) => ref.remoteSha === ZERO_SHA)) {
    const emptyTree = runGit(root, ["hash-object", "-t", "tree", "/dev/null"]).trim();
    return `${emptyTree}..${head}`;
  }
  const bases = [...new Set(refs.map((ref) => ref.remoteSha))];
  const mergeBase = runGit(
    root,
    ["merge-base", "--octopus", ...bases, head],
    { reason: "no_aggregate_merge_base" },
  ).trim();
  if (!mergeBase) {
    throw new ReceiptError("no_aggregate_merge_base");
  }
  return `${mergeBase}..${head}`;
}

function conservativeDatabaseGuard(pushPlan) {
  return Object.freeze({
    mode: "aggregate-push-range",
    range: pushPlan.aggregateRange,
    baseRef: "",
    baseSha: "",
    sourceRemote: "",
    sourceRemoteUrlSha256: "",
  });
}

function resolveDatabaseGuard(root, pushPlan) {
  const conservative = conservativeDatabaseGuard(pushPlan);
  if (pushPlan.refs.length !== 1) return conservative;

  const [ref] = pushPlan.refs;
  if (
    ref.remoteSha !== ZERO_SHA ||
    ref.localRef !== ref.remoteRef ||
    !ref.localRef.startsWith("refs/heads/")
  ) {
    return conservative;
  }

  const branch = ref.localRef.slice("refs/heads/".length);
  const configuredRemote = optionalGit(root, [
    "config",
    "--get",
    `branch.${branch}.remote`,
  ]);
  const configuredMerge = optionalGit(root, [
    "config",
    "--get",
    `branch.${branch}.merge`,
  ]);
  if (
    !configuredRemote ||
    configuredRemote === "." ||
    configuredRemote === pushPlan.remoteName ||
    configuredMerge !== ref.localRef
  ) {
    return conservative;
  }

  const upstreamRef = optionalGit(root, [
    "for-each-ref",
    "--format=%(upstream)",
    ref.localRef,
  ]);
  if (!upstreamRef) {
    throw new ReceiptError(
      "database_guard_upstream_missing",
      `branch=${branch} remote=${configuredRemote}`,
    );
  }
  assertSafeRef(root, upstreamRef, "database_guard_upstream_ref");
  const upstreamSha = optionalGit(root, [
    "rev-parse",
    "--verify",
    `${upstreamRef}^{commit}`,
  ]);
  try {
    assertCommitSha(upstreamSha, "database_guard_upstream_sha");
  } catch {
    throw new ReceiptError(
      "database_guard_upstream_missing",
      `ref=${upstreamRef}`,
    );
  }
  const ancestor = commandResult(
    "git",
    ["merge-base", "--is-ancestor", upstreamSha, ref.localSha],
    { cwd: root },
  );
  if (ancestor.error || ancestor.status !== 0) {
    throw new ReceiptError(
      "database_guard_upstream_not_ancestor",
      `ref=${upstreamRef} sha=${upstreamSha} head=${ref.localSha}`,
    );
  }
  const sourceRemote = resolveRemoteLocation(root, configuredRemote);
  return Object.freeze({
    mode: "tracked-upstream",
    range: `${upstreamSha}..${ref.localSha}`,
    baseRef: upstreamRef,
    baseSha: upstreamSha,
    sourceRemote: configuredRemote,
    sourceRemoteUrlSha256: sourceRemote.sha256,
  });
}

function resolveLivePushChecks(pushPlan, databaseGuard) {
  const trackedUpstreamMirror =
    pushPlan.refs.length === 1 && databaseGuard?.mode === "tracked-upstream";
  return Object.freeze({
    contract: LIVE_PUSH_CHECKS_CONTRACT,
    refs: Object.freeze(
      pushPlan.refs.map((ref) => {
        const useTrackedUpstream =
          trackedUpstreamMirror &&
          ref.remoteSha === ZERO_SHA &&
          ref.localRef === ref.remoteRef &&
          ref.localRef.startsWith("refs/heads/");
        return Object.freeze({
          localRef: ref.localRef,
          remoteRef: ref.remoteRef,
          gitLogMode: useTrackedUpstream ? "tracked-upstream" : "push-range",
          gitLogRange: useTrackedUpstream ? databaseGuard.range : ref.range,
          gitLogBaseRef: useTrackedUpstream ? databaseGuard.baseRef : "",
          gitLogBaseSha: useTrackedUpstream ? databaseGuard.baseSha : "",
          secretsRange: ref.range,
        });
      }),
    ),
  });
}

function buildPushPlan({
  root,
  remoteName,
  remoteLocation = "",
  refspecs,
  remoteRefs,
}) {
  const snapshot = readRepositorySnapshot(root);
  const refs = refspecs.map(({ localRef, remoteRef }) => {
    const localSha = runGit(root, [
      "rev-parse",
      "--verify",
      `${localRef}^{commit}`,
    ]).trim();
    assertCommitSha(localSha, "local_sha");
    if (localSha !== snapshot.head) {
      throw new ReceiptError(
        "non_head_ref",
        `local_ref=${localRef} local_sha=${localSha} head_sha=${snapshot.head}`,
      );
    }
    const remoteSha = remoteRefs.get(remoteRef) || ZERO_SHA;
    return {
      localRef,
      localSha,
      remoteRef,
      remoteSha,
      range: remoteSha === ZERO_SHA ? localSha : `${remoteSha}..${localSha}`,
    };
  });
  const sortedRefs = sortPushRefs(refs);
  const remote = resolveRemoteLocation(root, remoteName, remoteLocation);
  return {
    remoteName,
    remoteUrlSha256: remote.sha256,
    refs: sortedRefs,
    aggregateRange: computeAggregateRange(root, snapshot.head, sortedRefs),
  };
}

function resolvePreparationPlan(root, options) {
  const defaults =
    options.refspecs.length === 0
      ? resolveDefaultPreparation(root, options.remoteName)
      : { remoteName: options.remoteName || "origin", refspecs: options.refspecs };
  const remoteName = options.remoteName || defaults.remoteName;
  if (
    defaults.refspecs.some(
      ({ remoteRef }) => remoteRef === REVIEW_PUSH_REMOTE_REF,
    )
  ) {
    throw new ReceiptError(
      "review_ref_requires_review_mode",
      "rerun=bash scripts/qa/prepare-push.sh --review",
    );
  }
  resolveRemoteLocation(root, remoteName);
  const remoteRefs = readRemoteRefs(
    root,
    remoteName,
    defaults.refspecs.map((ref) => ref.remoteRef),
  );
  return buildPushPlan({
    root,
    remoteName,
    refspecs: defaults.refspecs,
    remoteRefs,
  });
}

function assertReviewAncestor(root, ancestor, head, reason, remoteName) {
  const available = commandResult(
    "git",
    ["cat-file", "-e", `${ancestor}^{commit}`],
    { cwd: root },
  );
  if (available.error || available.status !== 0) {
    throw new ReceiptError(
      reason,
      `sha=${ancestor} run=git fetch ${remoteName}`,
    );
  }
  const ancestorResult = commandResult(
    "git",
    ["merge-base", "--is-ancestor", ancestor, head],
    { cwd: root },
  );
  if (ancestorResult.error || ancestorResult.status !== 0) {
    throw new ReceiptError(
      reason,
      `sha=${ancestor} head=${head} run=git fetch ${remoteName}`,
    );
  }
}

function buildReviewPushPlan({
  root,
  remoteName,
  remoteLocation = "",
  remoteBaseSha,
  remoteReviewSha = ZERO_SHA,
}) {
  const snapshot = readRepositorySnapshot(root);
  const currentRef = optionalGit(root, [
    "symbolic-ref",
    "--quiet",
    "HEAD",
  ]);
  if (currentRef !== REVIEW_PUSH_LOCAL_REF) {
    throw new ReceiptError(
      "review_push_requires_main",
      `current_ref=${currentRef || "detached"}`,
    );
  }
  const localSha = runGit(root, [
    "rev-parse",
    "--verify",
    `${REVIEW_PUSH_LOCAL_REF}^{commit}`,
  ]).trim();
  assertCommitSha(localSha, "review_local_sha");
  if (localSha !== snapshot.head) {
    throw new ReceiptError(
      "non_head_ref",
      `local_ref=${REVIEW_PUSH_LOCAL_REF} local_sha=${localSha} head_sha=${snapshot.head}`,
    );
  }
  if (!remoteBaseSha) {
    throw new ReceiptError(
      "review_base_missing",
      `remote_ref=${REVIEW_PUSH_BASE_REF}`,
    );
  }
  assertCommitSha(remoteBaseSha, "review_base_sha");
  assertCommitSha(remoteReviewSha, "review_remote_sha", { allowZero: true });
  assertReviewAncestor(
    root,
    remoteBaseSha,
    snapshot.head,
    "review_base_not_ancestor",
    remoteName,
  );
  if (remoteReviewSha !== ZERO_SHA) {
    assertReviewAncestor(
      root,
      remoteReviewSha,
      snapshot.head,
      "review_non_fast_forward",
      remoteName,
    );
  }

  const rangeBaseSha =
    remoteReviewSha === ZERO_SHA ? remoteBaseSha : remoteReviewSha;
  const range = `${rangeBaseSha}..${localSha}`;
  const remote = resolveRemoteLocation(root, remoteName, remoteLocation);
  return {
    remoteName,
    remoteUrlSha256: remote.sha256,
    purpose: "review-only",
    review: {
      contract: REVIEW_PUSH_CONTRACT,
      baseRef: REVIEW_PUSH_BASE_REF,
      baseSha: remoteBaseSha,
      localRef: REVIEW_PUSH_LOCAL_REF,
      remoteRef: REVIEW_PUSH_REMOTE_REF,
      deliveryEligible: false,
    },
    refs: [
      {
        localRef: REVIEW_PUSH_LOCAL_REF,
        localSha,
        remoteRef: REVIEW_PUSH_REMOTE_REF,
        remoteSha: remoteReviewSha,
        range,
      },
    ],
    aggregateRange: range,
  };
}

function resolveReviewPreparationPlan(root, options) {
  const remoteName = options.remoteName || "origin";
  resolveRemoteLocation(root, remoteName);
  const remoteRefs = readRemoteRefs(root, remoteName, [
    REVIEW_PUSH_BASE_REF,
    REVIEW_PUSH_REMOTE_REF,
  ]);
  return buildReviewPushPlan({
    root,
    remoteName,
    remoteBaseSha: remoteRefs.get(REVIEW_PUSH_BASE_REF) || "",
    remoteReviewSha: remoteRefs.get(REVIEW_PUSH_REMOTE_REF) || ZERO_SHA,
  });
}

function affectedPlanEvidence(plan) {
  return {
    changedFiles: plan.changedFiles,
    affectedScopes: plan.affectedScopes,
    maxAffectedScope: plan.maxAffectedScope,
    localGate: plan.localGate,
    commands: plan.commands.map((command) => ({
      id: command.id,
      scope: command.scope,
      cwd: command.cwd,
      bin: command.bin,
      args: command.args,
      reasons: command.reasons,
    })),
    followUps: plan.followUps,
  };
}

function resolveServerCiRequirement(pushPlan, allowServerCi) {
  if (
    allowServerCi !== true ||
    pushPlan.remoteName !== CANONICAL_GITLAB_REMOTE ||
    pushPlan.refs.length !== 1
  ) {
    return null;
  }
  const [ref] = pushPlan.refs;
  if (
    ref.localRef !== CANONICAL_GITLAB_REF ||
    ref.remoteRef !== CANONICAL_GITLAB_REF ||
    ref.remoteSha === ZERO_SHA
  ) {
    return null;
  }
  return Object.freeze({
    contract: SERVER_CI_REQUIRED_CONTRACT,
    provider: "gitlab",
    remoteName: CANONICAL_GITLAB_REMOTE,
    localRef: CANONICAL_GITLAB_REF,
    remoteRef: CANONICAL_GITLAB_REF,
    exactSha: ref.localSha,
    requiredPipeline: "ordinary",
    requiredTerminalJob: "CI Gate",
    requiredBeforeRelease: true,
  });
}

export function resolvePrePushGateDecision(
  root,
  pushPlan,
  { forceFull = false, allowServerCi = false } = {},
) {
  if (!pushPlan?.aggregateRange) {
    throw new ReceiptError("invalid_push_range", "aggregate range is empty");
  }
  const changedFiles = collectGitChangedFiles({
    root,
    range: pushPlan.aggregateRange,
    includeWorktree: false,
    includeStaged: false,
    includeUntracked: false,
  });
  const affectedPlan = buildAffectedPlan(changedFiles, { root });
  const selection = selectPrePushProfile(affectedPlan, { forceFull });
  const databaseGuard = resolveDatabaseGuard(root, pushPlan);
  const liveChecks = resolveLivePushChecks(pushPlan, databaseGuard);
  const serverCiRequired = resolveServerCiRequirement(
    pushPlan,
    allowServerCi && !forceFull,
  );
  const selectedGate = serverCiRequired
    ? {
        ...selection,
        profile: "server-ci",
        requiresFullConfirmation: false,
        requiresManagedDatabase: false,
      }
    : selection;
  return Object.freeze({
    ...selectedGate,
    databaseGuard,
    liveChecks,
    serverCiRequired,
    changedFileCount: changedFiles.length,
    planSha256: sha256(
      stableStringify({
        affectedPlan: affectedPlanEvidence(affectedPlan),
        databaseGuard,
        liveChecks,
        serverCiRequired,
      }),
    ),
  });
}

export function resolveReviewGateDecision(root, pushPlan) {
  const deliveryDecision = resolvePrePushGateDecision(root, pushPlan);
  return Object.freeze({
    ...deliveryDecision,
    profile: "review",
    requiresFullConfirmation: false,
    requiresManagedDatabase: false,
    deliveryRequiresFullConfirmation:
      deliveryDecision.requiresFullConfirmation,
    deliveryRequiresManagedDatabase: deliveryDecision.requiresManagedDatabase,
  });
}

function parsePushInput(root, input) {
  const records = [];
  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = line.split(/\s+/u);
    if (fields.length !== 4) {
      throw new ReceiptError("invalid_push_stdin", `line=${line}`);
    }
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    assertSafeRef(root, remoteRef, "remote_ref");
    assertCommitSha(localSha, "local_sha", { allowZero: true });
    assertCommitSha(remoteSha, "remote_sha", { allowZero: true });
    if (localSha !== ZERO_SHA) assertSafeRef(root, localRef, "local_ref");
    records.push({ localRef, localSha, remoteRef, remoteSha });
  }
  return records;
}

function resolveHookPlan(root, remoteName, remoteLocation, records) {
  const snapshot = readRepositorySnapshot(root);
  const refs = records
    .filter((record) => record.localSha !== ZERO_SHA)
    .map((record) => {
      if (record.localSha !== snapshot.head) {
        throw new ReceiptError(
          "non_head_ref",
          `local_ref=${record.localRef} local_sha=${record.localSha} head_sha=${snapshot.head}`,
        );
      }
      return {
        ...record,
        range:
          record.remoteSha === ZERO_SHA
            ? record.localSha
            : `${record.remoteSha}..${record.localSha}`,
      };
    });
  const sortedRefs = sortPushRefs(refs);
  const remote = resolveRemoteLocation(root, remoteName, remoteLocation);
  return {
    remoteName,
    remoteUrlSha256: remote.sha256,
    refs: sortedRefs,
    aggregateRange: computeAggregateRange(root, snapshot.head, sortedRefs),
  };
}

function isExactReviewPush(records) {
  return (
    records.length === 1 &&
    records[0].localSha !== ZERO_SHA &&
    records[0].localRef === REVIEW_PUSH_LOCAL_REF &&
    records[0].remoteRef === REVIEW_PUSH_REMOTE_REF
  );
}

function resolveReviewHookPlan(
  root,
  remoteName,
  remoteLocation,
  records,
) {
  if (!isExactReviewPush(records)) {
    throw new ReceiptError(
      "invalid_review_push_shape",
      `expected=${REVIEW_PUSH_LOCAL_REF}:${REVIEW_PUSH_REMOTE_REF}`,
    );
  }
  const remoteRefs = readRemoteRefs(root, remoteName, [REVIEW_PUSH_BASE_REF]);
  return buildReviewPushPlan({
    root,
    remoteName,
    remoteLocation,
    remoteBaseSha: remoteRefs.get(REVIEW_PUSH_BASE_REF) || "",
    remoteReviewSha: records[0].remoteSha,
  });
}

function hashFileIfPresent(root, relativePath) {
  const target = path.join(root, relativePath);
  if (!existsSync(target)) return { path: relativePath, state: "missing" };
  const stat = statSync(target);
  if (!stat.isFile()) return { path: relativePath, state: "not-file" };
  return {
    path: relativePath,
    state: "present",
    size: stat.size,
    sha256: sha256(readFileSync(target)),
  };
}

function toolFingerprint(command, args = ["--version"], timeout = 5_000) {
  const result = commandResult(command, args, { timeout });
  const version = `${result.stdout}\n${result.stderr}`
    .trim()
    .split("\n")[0];
  return {
    command,
    available: !result.error && result.status === 0,
    status: result.status,
    version,
  };
}

function normalizedEnvironmentValue(root, env, key) {
  const value = env[key] ?? null;
  if (key !== "PATH" || value === null) return value;

  const entries = value.split(path.delimiter);
  if (entries.length < 2 || !entries[0]) return value;
  const pathWithoutCandidate = entries.slice(1).join(path.delimiter);
  const gitExecPath = commandResult("git", ["--exec-path"], {
    cwd: root,
    env: { ...env, PATH: pathWithoutCandidate },
    timeout: 5_000,
  });
  if (gitExecPath.error || gitExecPath.status !== 0) return value;

  const expectedPrefix = gitExecPath.stdout.trim();
  if (!expectedPrefix) return value;
  const pathIdentity = (candidate) => {
    try {
      return realpathSync(candidate);
    } catch {
      return path.resolve(candidate);
    }
  };
  if (pathIdentity(entries[0]) === pathIdentity(expectedPrefix)) entries.shift();
  return entries.join(path.delimiter);
}

export function environmentFingerprint(root, env = process.env) {
  const environment = Object.fromEntries(
    [
      ...ENVIRONMENT_KEYS,
      ...Object.keys(env).filter((key) => /^npm_config_/iu.test(key)),
    ]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .sort()
      .map((key) => [key, normalizedEnvironmentValue(root, env, key)]),
  );
  const payload = {
    contract: PRE_PUSH_ENVIRONMENT_CONTRACT,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    node: {
      executable: process.execPath,
      version: process.version,
    },
    tools: [
      toolFingerprint("git"),
      toolFingerprint("go", ["version"]),
      toolFingerprint("pnpm"),
      toolFingerprint("gitleaks", ["version"]),
      toolFingerprint("govulncheck", ["-version"], 15_000),
      toolFingerprint("psql"),
      toolFingerprint("atlas", ["version"]),
    ],
    dependencies: DEPENDENCY_METADATA_FILES.map((file) =>
      hashFileIfPresent(root, file),
    ),
    environment,
  };
  return sha256(stableStringify(payload));
}

function readTreeEntries(root, head) {
  const output = runGit(root, ["ls-tree", "-r", "-z", head]);
  const entries = new Map();
  for (const record of output.split("\0").filter(Boolean)) {
    const match = record.match(
      /^(\d{6}) ([^ ]+) ([0-9a-f]{40})\t([\s\S]+)$/u,
    );
    if (!match) {
      throw new ReceiptError("invalid_gate_contract", "invalid_tree_record");
    }
    entries.set(match[4], {
      file: match[4],
      mode: match[1],
      type: match[2],
      object: match[3],
    });
  }
  return entries;
}

export function gateContractFingerprint(root, head, gateDecision) {
  if (
    !gateDecision ||
    !["affected", "full", "review", "server-ci"].includes(gateDecision.profile)
  ) {
    throw new ReceiptError("invalid_gate_decision");
  }
  runGit(root, ["rev-parse", "--verify", `${head}^{commit}`]);
  const entries = readTreeEntries(root, head);
  const requiredFiles = PROFILE_REQUIRED_FILES.full;
  const executableFiles = new Set(PROFILE_REQUIRED_EXECUTABLES.full);
  const failures = [];
  for (const file of requiredFiles) {
    const entry = entries.get(file);
    if (!entry) {
      failures.push(`missing:${file}`);
      continue;
    }
    if (entry.type !== "blob" || !/^100(?:644|755)$/u.test(entry.mode)) {
      failures.push(`type:${file}`);
      continue;
    }
    if (executableFiles.has(file) && entry.mode !== "100755") {
      failures.push(`mode:${file}`);
    }
  }
  let packageContractValid = false;
  try {
    packageContractValid = validateWebPackageTestContract(
      runGit(root, ["show", `${head}:web/package.json`]),
    );
  } catch {
    packageContractValid = false;
  }
  if (!packageContractValid) {
    failures.push("content:web/package.json#scripts.test");
  }
  if (failures.length > 0) {
    throw new ReceiptError("invalid_gate_contract", failures.slice(0, 8).join(","));
  }
  const manifest = {
    contract: PRE_PUSH_GATE_CONTRACT,
    profile: gateDecision.profile,
    recommendedProfile: gateDecision.recommendedProfile,
    planSha256: gateDecision.planSha256,
    databaseGuard: gateDecision.databaseGuard,
    liveChecks: gateDecision.liveChecks,
    serverCiRequired: gateDecision.serverCiRequired,
    gates:
      gateDecision.profile === "full"
        ? GATE_PROFILES.full
        : gateDecision.profile === "review"
          ? ["review-only-plan", "git-log-check", "live-range-secrets"]
          : gateDecision.profile === "server-ci"
            ? [
                "server-ci-required",
                "exact-sha-ci-gate",
                "source-integrity",
                "git-log-check",
                "live-range-secrets",
              ]
            : ["affected-plan", "live-range-secrets"],
    requiredFiles: requiredFiles
      .map((file) => entries.get(file))
      .sort((left, right) => left.file.localeCompare(right.file)),
    requiredExecutables: [...PROFILE_REQUIRED_EXECUTABLES.full].sort(),
  };
  return sha256(stableStringify(manifest));
}

function safeStateDirectory(commonDir) {
  let stateDir = commonDir;
  for (const component of STATE_DIRECTORY.split("/")) {
    if (!component || component === "." || component === "..") {
      throw new ReceiptError("unsafe_receipt_state_path");
    }
    stateDir = path.join(stateDir, component);
    if (existsSync(stateDir)) {
      const stat = lstatSync(stateDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new ReceiptError("unsafe_receipt_state_path", `path=${stateDir}`);
      }
    } else {
      mkdirSync(stateDir, { mode: 0o700 });
    }
    chmodSync(stateDir, 0o700);
  }
  const realStateDir = realpathSync(stateDir);
  const realRelative = path.relative(commonDir, realStateDir);
  if (
    !realRelative ||
    realRelative.startsWith("..") ||
    path.isAbsolute(realRelative)
  ) {
    throw new ReceiptError("unsafe_receipt_state_path", `path=${realStateDir}`);
  }
  chmodSync(realStateDir, 0o700);
  return realStateDir;
}

export function resolveReceiptState(root) {
  const canonicalRoot = realpathSync(root);
  const commonDirRaw = runGit(root, ["rev-parse", "--git-common-dir"]).trim();
  const commonDir = realpathSync(path.resolve(root, commonDirRaw));
  const stateDir = safeStateDirectory(commonDir);
  const worktreeKey = sha256(canonicalRoot);
  return {
    commonDir,
    stateDir,
    worktreeKey,
    receiptPath: path.join(stateDir, `${worktreeKey}.json`),
    reviewReceiptPath: path.join(stateDir, `${worktreeKey}.review.json`),
    keyPath: path.join(stateDir, `${worktreeKey}.key`),
    lockPath: path.join(stateDir, `${worktreeKey}.lock`),
  };
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function acquireReceiptLock(state, purpose, { recoverStale = true } = {}) {
  try {
    mkdirSync(state.lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner;
    let ownerText = "";
    try {
      ownerText = readFileSync(
        path.join(state.lockPath, "owner.json"),
        "utf8",
      ).trim();
      owner = JSON.parse(ownerText);
    } catch {
      ownerText = "unreadable";
    }
    if (
      recoverStale &&
      Number.isSafeInteger(owner?.pid) &&
      owner.pid > 0 &&
      typeof owner?.token === "string" &&
      owner.token.length > 0 &&
      !isProcessAlive(owner.pid)
    ) {
      const stalePath = `${state.lockPath}.stale.${randomUUID()}`;
      try {
        renameSync(state.lockPath, stalePath);
        rmSync(stalePath, { recursive: true, force: true });
      } catch (recoveryError) {
        if (recoveryError?.code !== "ENOENT") throw recoveryError;
      }
      return acquireReceiptLock(state, purpose, { recoverStale: false });
    }
    throw new ReceiptError(
      "receipt_lock_held",
      `owner=${ownerText.slice(0, 240)}`,
    );
  }
  const token = randomUUID();
  writeFileSync(
    path.join(state.lockPath, "owner.json"),
    `${JSON.stringify({ pid: process.pid, purpose, startedAt: new Date().toISOString(), token })}\n`,
    { mode: 0o600 },
  );
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const owner = JSON.parse(
        readFileSync(path.join(state.lockPath, "owner.json"), "utf8"),
      );
      if (owner.token !== token) return;
      rmSync(state.lockPath, { recursive: true, force: true });
    } catch {
      // A missing or replaced lock is kept fail-closed for the next invocation.
    }
  };
}

function removeReceipt(receiptPath) {
  if (existsSync(receiptPath)) unlinkSync(receiptPath);
}

function writePrivateTemporaryFile(target, content) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o600);
    return temporary;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function publishPrivateFile(temporary, target) {
  renameSync(temporary, target);
  chmodSync(target, 0o600);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  fsyncSync(directoryDescriptor);
  closeSync(directoryDescriptor);
}

function atomicWritePrivateFile(target, content) {
  const temporary = writePrivateTemporaryFile(target, content);
  try {
    publishPrivateFile(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function readSigningKey(state, { create = false } = {}) {
  if (!existsSync(state.keyPath)) {
    if (!create) throw new ReceiptError("receipt_signing_key_missing");
    atomicWritePrivateFile(state.keyPath, randomBytes(32));
  }
  const stat = lstatSync(state.keyPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    stat.size !== 32
  ) {
    throw new ReceiptError("unsafe_receipt_signing_key");
  }
  return readFileSync(state.keyPath);
}

function readReceipt(
  receiptPath,
  prepareCommand = "bash scripts/qa/prepare-push.sh",
) {
  if (!existsSync(receiptPath)) {
    throw new ReceiptError(
      "receipt_missing",
      `run=${prepareCommand}`,
    );
  }
  const stat = lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new ReceiptError("unsafe_receipt_file");
  }
  try {
    return JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch {
    throw new ReceiptError("receipt_invalid_json");
  }
}

function unsignedReceipt(receipt) {
  const { signature: _signature, ...payload } = receipt || {};
  return payload;
}

function signReceipt(receipt, key) {
  const payload = unsignedReceipt(receipt);
  return {
    ...payload,
    signature: {
      contract: PRE_PUSH_SIGNATURE_CONTRACT,
      keyId: sha256(key).slice(0, 16),
      value: createHmac("sha256", key)
        .update(stableStringify(payload))
        .digest("hex"),
    },
  };
}

function validateReceiptSignature(receipt, key) {
  if (receipt?.signature?.contract !== PRE_PUSH_SIGNATURE_CONTRACT) {
    throw new ReceiptError("receipt_signature_contract_mismatch");
  }
  if (receipt.signature.keyId !== sha256(key).slice(0, 16)) {
    throw new ReceiptError("receipt_signing_key_mismatch");
  }
  const expected = createHmac("sha256", key)
    .update(stableStringify(unsignedReceipt(receipt)))
    .digest();
  let actual;
  try {
    actual = Buffer.from(receipt.signature.value, "hex");
  } catch {
    throw new ReceiptError("receipt_signature_invalid");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ReceiptError("receipt_signature_invalid");
  }
}

function expectedRepositoryIdentity(root, snapshot, state) {
  return {
    worktreeKey: state.worktreeKey,
    rootSha256: sha256(realpathSync(root)),
    head: snapshot.head,
    tree: snapshot.tree,
  };
}

function validateReceipt({
  receipt,
  root,
  state,
  snapshot,
  pushPlan,
  now = Date.now(),
  environment = process.env,
  gateDecision,
  gateSha256 = "",
  environmentSha256 = "",
}) {
  validateReceiptSignature(receipt, readSigningKey(state));
  if (receipt?.contract !== PRE_PUSH_RECEIPT_CONTRACT) {
    throw new ReceiptError("receipt_contract_mismatch");
  }
  const expectedPurpose =
    gateDecision?.profile === "review" ? "review-only" : "delivery";
  if (receipt?.purpose !== expectedPurpose) {
    throw new ReceiptError("receipt_purpose_mismatch");
  }
  if (
    !gateDecision ||
    receipt?.gate?.profile !== gateDecision.profile ||
    receipt?.gate?.recommendedProfile !== gateDecision.recommendedProfile ||
    receipt?.gate?.planSha256 !== gateDecision.planSha256 ||
    stableStringify(receipt?.gate?.databaseGuard) !==
      stableStringify(gateDecision.databaseGuard) ||
    stableStringify(receipt?.gate?.liveChecks) !==
      stableStringify(gateDecision.liveChecks) ||
    stableStringify(receipt?.gate?.serverCiRequired) !==
      stableStringify(gateDecision.serverCiRequired) ||
    receipt?.gate?.deliveryEligible !== (gateDecision.profile !== "review")
  ) {
    throw new ReceiptError("receipt_profile_mismatch");
  }
  if (receipt?.gate?.contract !== PRE_PUSH_GATE_CONTRACT) {
    throw new ReceiptError("receipt_gate_contract_mismatch");
  }
  const gateSha =
    gateSha256 || gateContractFingerprint(root, snapshot.head, gateDecision);
  if (receipt.gate.sha256 !== gateSha) {
    throw new ReceiptError("receipt_gate_contract_mismatch");
  }
  const repository = expectedRepositoryIdentity(root, snapshot, state);
  if (stableStringify(receipt.repository) !== stableStringify(repository)) {
    throw new ReceiptError("receipt_repository_mismatch");
  }
  if (stableStringify(receipt.push) !== stableStringify(pushPlan)) {
    throw new ReceiptError("receipt_push_range_mismatch");
  }
  if (receipt?.environment?.contract !== PRE_PUSH_ENVIRONMENT_CONTRACT) {
    throw new ReceiptError("receipt_environment_contract_mismatch");
  }
  const currentEnvironment =
    environmentSha256 || environmentFingerprint(root, environment);
  if (receipt.environment.sha256 !== currentEnvironment) {
    throw new ReceiptError("receipt_environment_mismatch");
  }
  if (
    !Number.isInteger(receipt.issuedAtMs) ||
    !Number.isInteger(receipt.expiresAtMs) ||
    receipt.expiresAtMs - receipt.issuedAtMs !== PRE_PUSH_RECEIPT_TTL_MS
  ) {
    throw new ReceiptError("receipt_ttl_contract_mismatch");
  }
  if (receipt.issuedAtMs > now + CLOCK_SKEW_MS) {
    throw new ReceiptError("receipt_from_future");
  }
  if (receipt.expiresAtMs < now) {
    throw new ReceiptError("receipt_expired");
  }
}

function makeReceipt({
  root,
  state,
  snapshot,
  pushPlan,
  issuedAtMs = Date.now(),
  environment = process.env,
  gateDecision,
  gateSha256 = "",
  environmentSha256 = "",
}) {
  if (!gateDecision) throw new ReceiptError("invalid_gate_decision");
  const unsigned = {
    contract: PRE_PUSH_RECEIPT_CONTRACT,
    issuedAtMs,
    expiresAtMs: issuedAtMs + PRE_PUSH_RECEIPT_TTL_MS,
    repository: expectedRepositoryIdentity(root, snapshot, state),
    push: pushPlan,
    purpose: gateDecision.profile === "review" ? "review-only" : "delivery",
    gate: {
      profile: gateDecision.profile,
      recommendedProfile: gateDecision.recommendedProfile,
      planSha256: gateDecision.planSha256,
      databaseGuard: gateDecision.databaseGuard,
      liveChecks: gateDecision.liveChecks,
      serverCiRequired: gateDecision.serverCiRequired,
      deliveryEligible: gateDecision.profile !== "review",
      contract: PRE_PUSH_GATE_CONTRACT,
      sha256:
        gateSha256 ||
        gateContractFingerprint(root, snapshot.head, gateDecision),
    },
    environment: {
      contract: PRE_PUSH_ENVIRONMENT_CONTRACT,
      sha256: environmentSha256 || environmentFingerprint(root, environment),
    },
  };
  return signReceipt(unsigned, readSigningKey(state, { create: true }));
}

function parsePrepareOptions(root, args) {
  const options = {
    forceFull: false,
    reviewOnly: false,
    remoteName: "",
    refspecs: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--full") {
      if (options.forceFull) throw new ReceiptError("duplicate_option", arg);
      options.forceFull = true;
      continue;
    }
    if (arg === "--review") {
      if (options.reviewOnly) throw new ReceiptError("duplicate_option", arg);
      options.reviewOnly = true;
      continue;
    }
    if (arg === "--remote") {
      if (!value) throw new ReceiptError("missing_option_value", arg);
      options.remoteName = value;
      index += 1;
      continue;
    }
    if (arg === "--ref") {
      if (!value) throw new ReceiptError("missing_option_value", arg);
      options.refspecs.push(parseRefspec(root, value));
      index += 1;
      continue;
    }
    throw new ReceiptError("unknown_option", arg);
  }
  if (options.reviewOnly && options.forceFull) {
    throw new ReceiptError(
      "mutually_exclusive_options",
      "options=--review,--full",
    );
  }
  if (options.reviewOnly && options.refspecs.length > 0) {
    throw new ReceiptError(
      "review_ref_is_fixed",
      `refspec=${REVIEW_PUSH_LOCAL_REF}:${REVIEW_PUSH_REMOTE_REF}`,
    );
  }
  return options;
}

function parseHookOptions(args) {
  const options = { remoteName: "", remoteLocation: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--remote") {
      if (!value) throw new ReceiptError("missing_option_value", arg);
      options.remoteName = value;
      index += 1;
      continue;
    }
    if (arg === "--remote-location") {
      if (!value) throw new ReceiptError("missing_option_value", arg);
      options.remoteLocation = value;
      index += 1;
      continue;
    }
    throw new ReceiptError("unknown_option", arg);
  }
  if (!options.remoteName) {
    throw new ReceiptError("missing_option_value", "--remote");
  }
  return options;
}

function usesDefaultServerCiProfile(options) {
  return (
    options.reviewOnly !== true &&
    options.forceFull !== true &&
    !options.remoteName &&
    options.refspecs.length === 0
  );
}

export function resolvePrepareMode(root, options, { env = process.env } = {}) {
  assertNoForbiddenEnvironment(env);
  const snapshot = readRepositorySnapshot(root);
  assertCleanSnapshot(snapshot);
  const pushPlan = options.reviewOnly
    ? resolveReviewPreparationPlan(root, options)
    : resolvePreparationPlan(root, options);
  const gateDecision = options.reviewOnly
    ? resolveReviewGateDecision(root, pushPlan)
    : resolvePrePushGateDecision(root, pushPlan, {
        forceFull: options.forceFull,
        allowServerCi: usesDefaultServerCiProfile(options),
      });
  if (gateDecision.requiresFullConfirmation) {
    throw new ReceiptError(
      "full_confirmation_required",
      `reasons=${gateDecision.reasons.join(",")} rerun=bash scripts/qa/prepare-push.sh --full`,
    );
  }
  return gateDecision.requiresManagedDatabase ? "managed" : "direct";
}

export function preparePush(root, options, { env = process.env } = {}) {
  const state = resolveReceiptState(root);
  const reviewOnly = options.reviewOnly === true;
  const label = reviewOnly ? "qa:prepare-review-push" : "qa:prepare-push";
  const receiptPath = reviewOnly
    ? state.reviewReceiptPath
    : state.receiptPath;
  const resolvePlan = () =>
    reviewOnly
      ? resolveReviewPreparationPlan(root, options)
      : resolvePreparationPlan(root, options);
  const resolveGateDecision = (pushPlan) =>
    reviewOnly
      ? resolveReviewGateDecision(root, pushPlan)
      : resolvePrePushGateDecision(root, pushPlan, {
          forceFull: options.forceFull,
          allowServerCi: usesDefaultServerCiProfile(options),
        });
  const releaseLock = acquireReceiptLock(
    state,
    reviewOnly ? "prepare-review" : "prepare",
  );
  let receiptCandidate = "";
  try {
    assertNoForbiddenEnvironment(env);
    readSigningKey(state, { create: true });
    const before = readRepositorySnapshot(root);
    assertCleanSnapshot(before);
    const initialPlan = resolvePlan();
    const initialGateDecision = resolveGateDecision(initialPlan);
    if (initialGateDecision.requiresFullConfirmation) {
      throw new ReceiptError(
        "full_confirmation_required",
        `reasons=${initialGateDecision.reasons.join(",")} rerun=bash scripts/qa/prepare-push.sh --full`,
      );
    }
    if (
      initialGateDecision.requiresManagedDatabase &&
      !env.DISPOSABLE_DATABASE_BASE_URL
    ) {
      throw new ReceiptError(
        "managed_database_required",
        "rerun=bash scripts/qa/prepare-push.sh",
      );
    }
    const initialGateContract = gateContractFingerprint(
      root,
      before.head,
      initialGateDecision,
    );
    const initialEnvironment = environmentFingerprint(root, env);

    if (existsSync(receiptPath)) {
      try {
        const existingReceipt = readReceipt(receiptPath);
        validateReceipt({
          receipt: existingReceipt,
          root,
          state,
          snapshot: before,
          pushPlan: initialPlan,
          environment: env,
          gateDecision: initialGateDecision,
          gateSha256: initialGateContract,
          environmentSha256: initialEnvironment,
        });
        console.log(
          `[${label}] status=reused profile=${initialGateDecision.profile} head=${before.head} aggregate_range=${initialPlan.aggregateRange} expires_at_ms=${existingReceipt.expiresAtMs}`,
        );
        return { receipt: existingReceipt, state, reused: true };
      } catch (error) {
        const reason =
          error instanceof ReceiptError ? error.reason : "unexpected_error";
        console.log(
          `[${label}] existing_receipt=invalid reason=${reason}; running a fresh ${initialGateDecision.profile} gate`,
        );
        removeReceipt(receiptPath);
      }
    }

    console.log(
      `[${label}] 运行 ${initialGateDecision.profile}（HEAD=${before.head.slice(0, 12)} aggregate_range=${initialPlan.aggregateRange} db_guard_range=${initialGateDecision.databaseGuard.range} files=${initialGateDecision.changedFileCount} recommended_delivery_profile=${initialGateDecision.recommendedProfile}）`,
    );
    if (reviewOnly || initialGateDecision.profile === "server-ci") {
      runLivePushChecks(root, initialPlan, env, {
        label,
        gateDecision: initialGateDecision,
      });
    } else if (initialGateDecision.profile === "full") {
      runCommand(
        "node",
        [
          path.join(root, "scripts/qa/run-gate-with-receipt.mjs"),
          "--gate",
          "full",
          "--out",
          path.join(state.stateDir, `${state.worktreeKey}.full-receipt.json`),
        ],
        {
          cwd: root,
          env: {
            ...env,
            QA_BASE_RANGE: initialPlan.aggregateRange,
            QA_DB_GUARD_RANGE: initialGateDecision.databaseGuard.range,
          },
          inherit: true,
          reason: "full_gate_failed",
        },
      );
    } else {
      runCommand(
        "node",
        [
          path.join(root, "scripts/qa/affected.mjs"),
          "--base",
          initialPlan.aggregateRange,
          "--run",
        ],
        {
          cwd: root,
          env,
          inherit: true,
          reason: "affected_gate_failed",
        },
      );
    }

    const after = readRepositorySnapshot(root);
    assertSnapshotUnchanged(before, after);
    const finalEnvironment = environmentFingerprint(root, env);
    if (finalEnvironment !== initialEnvironment) {
      throw new ReceiptError("environment_changed_during_gate");
    }
    const finalPlan = resolvePlan();
    if (stableStringify(initialPlan) !== stableStringify(finalPlan)) {
      throw new ReceiptError("remote_changed_during_gate");
    }
    const finalGateDecision = resolveGateDecision(finalPlan);
    if (
      stableStringify(initialGateDecision) !==
      stableStringify(finalGateDecision)
    ) {
      throw new ReceiptError("gate_decision_changed_during_gate");
    }
    const receipt = makeReceipt({
      root,
      state,
      snapshot: after,
      pushPlan: finalPlan,
      environment: env,
      gateDecision: finalGateDecision,
      gateSha256: initialGateContract,
      environmentSha256: finalEnvironment,
    });
    receiptCandidate = writePrivateTemporaryFile(
      receiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    const candidateSnapshot = readRepositorySnapshot(root);
    assertSnapshotUnchanged(after, candidateSnapshot);
    validateReceipt({
      receipt: readReceipt(receiptCandidate),
      root,
      state,
      snapshot: candidateSnapshot,
      pushPlan: finalPlan,
      environment: env,
      gateDecision: finalGateDecision,
      gateSha256: initialGateContract,
      environmentSha256: finalEnvironment,
    });
    publishPrivateFile(receiptCandidate, receiptPath);
    receiptCandidate = "";
    console.log(
      `[${label}] status=complete profile=${finalGateDecision.profile} recommended_delivery_profile=${finalGateDecision.recommendedProfile} review_only=${reviewOnly} head=${after.head} aggregate_range=${finalPlan.aggregateRange} db_guard_range=${finalGateDecision.databaseGuard.range} ttl_seconds=${PRE_PUSH_RECEIPT_TTL_MS / 1000}`,
    );
    return { receipt, state, reused: false };
  } catch (error) {
    removeReceipt(receiptPath);
    throw error;
  } finally {
    if (receiptCandidate && existsSync(receiptCandidate)) {
      unlinkSync(receiptCandidate);
    }
    releaseLock();
  }
}

function runLivePushChecks(
  root,
  pushPlan,
  env,
  { label = "pre-push", gateDecision } = {},
) {
  const liveChecks = gateDecision?.liveChecks;
  if (
    liveChecks?.contract !== LIVE_PUSH_CHECKS_CONTRACT ||
    liveChecks.refs?.length !== pushPlan.refs.length
  ) {
    throw new ReceiptError("invalid_live_push_checks");
  }
  for (const [index, ref] of pushPlan.refs.entries()) {
    const check = liveChecks.refs[index];
    if (
      check?.localRef !== ref.localRef ||
      check?.remoteRef !== ref.remoteRef ||
      check?.secretsRange !== ref.range
    ) {
      throw new ReceiptError("invalid_live_push_checks");
    }
    console.log(
      `[${label}] 校验真实 push ref: ${ref.localRef} -> ${ref.remoteRef} git_log_range=${check.gitLogRange} secrets_range=${check.secretsRange}`,
    );
    runCommand("git", ["log", "--check", "--format=", check.gitLogRange], {
      cwd: root,
      inherit: true,
      reason: "git_log_check_failed",
    });
    runCommand("bash", [path.join(root, "scripts/qa/secrets.sh")], {
      cwd: root,
      env: {
        ...env,
        QA_BASE_RANGE: check.secretsRange,
        SECRETS_STRICT: "1",
      },
      inherit: true,
      reason: "push_range_secrets_failed",
    });
  }
}

export function verifyPushHook(
  root,
  options,
  input,
  { env = process.env, now = Date.now() } = {},
) {
  const records = parsePushInput(root, input);
  assertNoForbiddenEnvironment(env);
  if (records.length === 0) {
    console.log("[pre-push] status=complete coverage=no-op-stdin");
    return { status: "no-op" };
  }

  const nonDeletion = records.filter((record) => record.localSha !== ZERO_SHA);
  if (nonDeletion.length === 0) {
    console.log(
      `[pre-push] status=complete coverage=delete-only refs=${records.length}`,
    );
    return { status: "delete-only" };
  }
  if (nonDeletion.length !== records.length) {
    throw new ReceiptError("mixed_delete_update_unsupported");
  }
  const targetsReviewRef = records.some(
    ({ remoteRef }) => remoteRef === REVIEW_PUSH_REMOTE_REF,
  );
  const reviewOnly = isExactReviewPush(records);
  if (targetsReviewRef && !reviewOnly) {
    throw new ReceiptError(
      "invalid_review_push_shape",
      `expected=${REVIEW_PUSH_LOCAL_REF}:${REVIEW_PUSH_REMOTE_REF}`,
    );
  }

  const state = resolveReceiptState(root);
  const releaseLock = acquireReceiptLock(state, "verify");
  try {
    const before = readRepositorySnapshot(root);
    assertCleanSnapshot(before);
    const pushPlan = reviewOnly
      ? resolveReviewHookPlan(
          root,
          options.remoteName,
          options.remoteLocation,
          records,
        )
      : resolveHookPlan(
          root,
          options.remoteName,
          options.remoteLocation,
          records,
        );
    const receiptPath = reviewOnly
      ? state.reviewReceiptPath
      : state.receiptPath;
    const receipt = readReceipt(
      receiptPath,
      reviewOnly
        ? "bash scripts/qa/prepare-push.sh --review"
        : "bash scripts/qa/prepare-push.sh",
    );
    const gateDecision = reviewOnly
      ? resolveReviewGateDecision(root, pushPlan)
      : resolvePrePushGateDecision(root, pushPlan, {
          forceFull: receipt?.gate?.profile === "full",
          allowServerCi: receipt?.gate?.profile === "server-ci",
        });
    const gateSha256 = gateContractFingerprint(
      root,
      before.head,
      gateDecision,
    );
    const environmentSha256 = environmentFingerprint(root, env);
    validateReceipt({
      receipt,
      root,
      state,
      snapshot: before,
      pushPlan,
      now,
      environment: env,
      gateDecision,
      gateSha256,
      environmentSha256,
    });

    runLivePushChecks(root, pushPlan, env, { gateDecision });

    const after = readRepositorySnapshot(root);
    assertSnapshotUnchanged(before, after);
    validateReceipt({
      receipt: readReceipt(receiptPath),
      root,
      state,
      snapshot: after,
      pushPlan,
      now: Date.now(),
      environment: env,
      gateDecision,
      gateSha256,
      environmentSha256: environmentFingerprint(root, env),
    });
    console.log(
      `[pre-push] status=complete coverage=receipt+live-range-secrets review_only=${reviewOnly} ranges=${pushPlan.refs.length} aggregate_range=${pushPlan.aggregateRange}`,
    );
    return { status: "complete", pushPlan, receipt };
  } finally {
    releaseLock();
  }
}

function printHelp() {
  console.log(`用法:
  bash scripts/qa/prepare-push.sh [--remote <name>] [--ref <local-ref>:<remote-ref>]...
  bash scripts/qa/prepare-push.sh --full [--remote <name>] [--ref <local-ref>:<remote-ref>]...
  bash scripts/qa/prepare-push.sh --review [--remote <name>]

说明:
  默认 origin refs/heads/main -> refs/heads/main 普通推送会在连接前校验 clean HEAD/tree、
  真实 remote/ref/range、git log、strict secrets 与 source-integrity，并签发 server-ci
  回执；高成本门禁交由 R640 exact-SHA GitLab CI。回执只授权普通非强制 push；
  release、package promotion 或 protected deploy 必须等待同一 exact SHA 的
  terminal-success CI Gate。显式 --full、--review 与任何非规范目标仍保守处理。
  普通当前分支可不传 remote/ref；多 ref 或非默认目标逐项传 --ref。
  --review 只允许 clean main 以 fast-forward 方式更新远端 review/gpt；它只运行提交
  格式与严格 secrets 检查并记录后续正式推送建议，不运行 affected/full，也不能用于
  main、tag、发布或其他 ref。pre-push hook 只读取固定回执位置，不接受调用者提供
  回执路径、token 或跳过环境变量。`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const root = runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    reason: "not_git_repository",
  }).trim();
  if (command === "--help" || command === "-h" || !command) {
    printHelp();
    return;
  }
  if (command === "prepare") {
    preparePush(root, parsePrepareOptions(root, args));
    return;
  }
  if (command === "prepare-mode") {
    console.log(resolvePrepareMode(root, parsePrepareOptions(root, args)));
    return;
  }
  if (command === "verify-hook") {
    const options = parseHookOptions(args);
    const input = readFileSync(0, "utf8");
    verifyPushHook(root, options, input);
    return;
  }
  throw new ReceiptError("unknown_command", command);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    const reason = error instanceof ReceiptError ? error.reason : "unexpected_error";
    const detail =
      error instanceof ReceiptError
        ? error.detail
        : String(error?.message || error).split("\n")[0];
    console.error(
      `[pre-push-receipt] status=incomplete reason=${reason}${detail ? ` ${detail}` : ""}`,
    );
    process.exitCode =
      error instanceof ReceiptError && Number.isInteger(error.exitCode)
        ? error.exitCode
        : 1;
  }
}
