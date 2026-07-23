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

export const PRE_PUSH_RECEIPT_CONTRACT = "plush.pre-push-full-receipt/v1";
export const PRE_PUSH_RECEIPT_TTL_MS = 30 * 60 * 1000;
export const PRE_PUSH_ENVIRONMENT_CONTRACT = "plush.pre-push-environment/v2";
export const PRE_PUSH_GATE_CONTRACT = "plush.full-gate-tree/v1";
export const PRE_PUSH_SIGNATURE_CONTRACT = "hmac-sha256/v1";

const ZERO_SHA = "0000000000000000000000000000000000000000";
const CLOCK_SKEW_MS = 30_000;
const STATE_DIRECTORY = "plush-qa/pre-push";
const FORBIDDEN_ENVIRONMENT = Object.freeze([
  "QA_BASE_RANGE",
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
  } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: inherit ? undefined : "utf8",
    maxBuffer: 32 * 1024 * 1024,
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
      "head_changed_during_full",
      `before=${before.head} after=${after.head}`,
    );
  }
  if (before.tree !== after.tree) {
    throw new ReceiptError(
      "tree_changed_during_full",
      `before=${before.tree} after=${after.tree}`,
    );
  }
  assertCleanSnapshot(after, "worktree_changed_during_full");
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
  const output = runGit(root, ["ls-remote", "--refs", remoteName, ...unique], {
    reason: "remote_ref_query_failed",
  });
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

function toolFingerprint(command, args = ["--version"]) {
  const result = commandResult(command, args, { timeout: 5_000 });
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

  const gitExecPath = commandResult("git", ["--exec-path"], {
    cwd: root,
    env,
    timeout: 5_000,
  });
  if (gitExecPath.error || gitExecPath.status !== 0) return value;

  const injectedPrefix = gitExecPath.stdout.trim();
  if (!injectedPrefix) return value;
  const entries = value.split(path.delimiter);
  while (entries[0] === injectedPrefix) entries.shift();
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
      toolFingerprint("govulncheck", ["-version"]),
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

export function gateContractFingerprint(root, head) {
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
    profile: "full",
    gates: GATE_PROFILES.full,
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

function readReceipt(receiptPath) {
  if (!existsSync(receiptPath)) {
    throw new ReceiptError(
      "receipt_missing",
      "run=bash scripts/qa/prepare-push.sh",
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
  gateSha256 = "",
  environmentSha256 = "",
}) {
  validateReceiptSignature(receipt, readSigningKey(state));
  if (receipt?.contract !== PRE_PUSH_RECEIPT_CONTRACT) {
    throw new ReceiptError("receipt_contract_mismatch");
  }
  if (receipt?.gate?.profile !== "full") {
    throw new ReceiptError("receipt_profile_mismatch");
  }
  if (receipt?.gate?.contract !== PRE_PUSH_GATE_CONTRACT) {
    throw new ReceiptError("receipt_gate_contract_mismatch");
  }
  const gateSha = gateSha256 || gateContractFingerprint(root, snapshot.head);
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
  gateSha256 = "",
  environmentSha256 = "",
}) {
  const unsigned = {
    contract: PRE_PUSH_RECEIPT_CONTRACT,
    issuedAtMs,
    expiresAtMs: issuedAtMs + PRE_PUSH_RECEIPT_TTL_MS,
    repository: expectedRepositoryIdentity(root, snapshot, state),
    push: pushPlan,
    gate: {
      profile: "full",
      contract: PRE_PUSH_GATE_CONTRACT,
      sha256: gateSha256 || gateContractFingerprint(root, snapshot.head),
    },
    environment: {
      contract: PRE_PUSH_ENVIRONMENT_CONTRACT,
      sha256: environmentSha256 || environmentFingerprint(root, environment),
    },
  };
  return signReceipt(unsigned, readSigningKey(state, { create: true }));
}

function parsePrepareOptions(root, args) {
  const options = { remoteName: "", refspecs: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
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

export function preparePush(root, options, { env = process.env } = {}) {
  const state = resolveReceiptState(root);
  const releaseLock = acquireReceiptLock(state, "prepare");
  let receiptCandidate = "";
  try {
    removeReceipt(state.receiptPath);
    assertNoForbiddenEnvironment(env);
    readSigningKey(state, { create: true });
    const before = readRepositorySnapshot(root);
    assertCleanSnapshot(before);
    const initialPlan = resolvePreparationPlan(root, options);
    const initialGateContract = gateContractFingerprint(root, before.head);
    const initialEnvironment = environmentFingerprint(root, env);

    console.log(
      `[qa:prepare-push] 运行 full（HEAD=${before.head.slice(0, 12)} aggregate_range=${initialPlan.aggregateRange}）`,
    );
    runCommand("bash", [path.join(root, "scripts/qa/full.sh")], {
      cwd: root,
      env: { ...env, QA_BASE_RANGE: initialPlan.aggregateRange },
      inherit: true,
      reason: "full_gate_failed",
    });

    const after = readRepositorySnapshot(root);
    assertSnapshotUnchanged(before, after);
    const finalEnvironment = environmentFingerprint(root, env);
    if (finalEnvironment !== initialEnvironment) {
      throw new ReceiptError("environment_changed_during_full");
    }
    const finalPlan = resolvePreparationPlan(root, options);
    if (stableStringify(initialPlan) !== stableStringify(finalPlan)) {
      throw new ReceiptError("remote_changed_during_full");
    }
    const receipt = makeReceipt({
      root,
      state,
      snapshot: after,
      pushPlan: finalPlan,
      environment: env,
      gateSha256: initialGateContract,
      environmentSha256: finalEnvironment,
    });
    receiptCandidate = writePrivateTemporaryFile(
      state.receiptPath,
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
      gateSha256: initialGateContract,
      environmentSha256: finalEnvironment,
    });
    publishPrivateFile(receiptCandidate, state.receiptPath);
    receiptCandidate = "";
    console.log(
      `[qa:prepare-push] status=complete profile=full head=${after.head} aggregate_range=${finalPlan.aggregateRange} ttl_seconds=${PRE_PUSH_RECEIPT_TTL_MS / 1000}`,
    );
    return { receipt, state };
  } catch (error) {
    removeReceipt(state.receiptPath);
    throw error;
  } finally {
    if (receiptCandidate && existsSync(receiptCandidate)) {
      unlinkSync(receiptCandidate);
    }
    releaseLock();
  }
}

function runLivePushChecks(root, pushPlan, env) {
  for (const ref of pushPlan.refs) {
    console.log(
      `[pre-push] 校验真实 push ref: ${ref.localRef} -> ${ref.remoteRef}`,
    );
    runCommand("git", ["log", "--check", "--format=", ref.range], {
      cwd: root,
      inherit: true,
      reason: "git_log_check_failed",
    });
    runCommand("bash", [path.join(root, "scripts/qa/secrets.sh")], {
      cwd: root,
      env: {
        ...env,
        QA_BASE_RANGE: ref.range,
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

  const state = resolveReceiptState(root);
  const releaseLock = acquireReceiptLock(state, "verify");
  try {
    const before = readRepositorySnapshot(root);
    assertCleanSnapshot(before);
    const pushPlan = resolveHookPlan(
      root,
      options.remoteName,
      options.remoteLocation,
      records,
    );
    const receipt = readReceipt(state.receiptPath);
    const gateSha256 = gateContractFingerprint(root, before.head);
    const environmentSha256 = environmentFingerprint(root, env);
    validateReceipt({
      receipt,
      root,
      state,
      snapshot: before,
      pushPlan: {
        remoteName: pushPlan.remoteName,
        remoteUrlSha256: pushPlan.remoteUrlSha256,
        refs: pushPlan.refs,
        aggregateRange: pushPlan.aggregateRange,
      },
      now,
      environment: env,
      gateSha256,
      environmentSha256,
    });

    runLivePushChecks(root, pushPlan, env);

    const after = readRepositorySnapshot(root);
    assertSnapshotUnchanged(before, after);
    validateReceipt({
      receipt: readReceipt(state.receiptPath),
      root,
      state,
      snapshot: after,
      pushPlan: {
        remoteName: pushPlan.remoteName,
        remoteUrlSha256: pushPlan.remoteUrlSha256,
        refs: pushPlan.refs,
        aggregateRange: pushPlan.aggregateRange,
      },
      now: Date.now(),
      environment: env,
      gateSha256,
      environmentSha256: environmentFingerprint(root, env),
    });
    console.log(
      `[pre-push] status=complete coverage=receipt+live-range-secrets ranges=${pushPlan.refs.length} aggregate_range=${pushPlan.aggregateRange}`,
    );
    return { status: "complete", pushPlan, receipt };
  } finally {
    releaseLock();
  }
}

function printHelp() {
  console.log(`用法:
  bash scripts/qa/prepare-push.sh [--remote <name>] [--ref <local-ref>:<remote-ref>]...

说明:
  prepare 在建立真实 git push 连接前，对 clean HEAD 执行一次 full 并在 Git common dir
  签发短期本地回执。普通当前分支可不传参数；多 ref 或非默认目标必须逐项传 --ref。
  pre-push hook 只读取固定回执位置，不接受调用者提供回执路径、token 或跳过环境变量。`);
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
