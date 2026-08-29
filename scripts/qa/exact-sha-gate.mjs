#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";
import {
  buildCustomerConfigEvidence,
  buildMigrationEvidence,
} from "../deploy/release-artifact-bundle.mjs";
import {
  GATE_PROFILES,
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
} from "./gate-profiles.mjs";
import {
  refreshedTimeSensitiveCheck,
  STRICT_RECEIPT_SCHEMA,
  validateStrictReceiptEvidence,
  validateStrictReceiptIdentity,
} from "./strict-receipt-identity.mjs";

export const EXACT_SHA_GATE_CONTRACT = STRICT_RECEIPT_SCHEMA;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/u;
const TERMINAL_STATUSES = new Set(["passed", "failed"]);
const EXTRA_FINGERPRINT_FILES = Object.freeze([
  ".n-node-version",
  "server/go.mod",
  "server/go.sum",
  "web/package.json",
  "web/pnpm-lock.yaml",
  "scripts/qa/strict-receipt-identity.mjs",
  "scripts/qa/strict-receipt-identity.test.mjs",
  "scripts/qa/ci-quality-shard.mjs",
  "scripts/qa/ci-quality-shard.test.mjs",
  "scripts/qa/ci-quality-aggregate.mjs",
  "scripts/qa/ci-quality-aggregate.test.mjs",
  "scripts/deploy/gitlab-strict-terminal-reuse.mjs",
  "scripts/deploy/gitlab-strict-terminal-reuse.test.mjs",
  "scripts/deploy/gitlab-release-candidate.mjs",
  "scripts/deploy/gitlab-release-candidate.test.mjs",
]);
const WORKFLOW_FINGERPRINT_FILES = Object.freeze([
  ".gitlab-ci.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
]);
const TOOLCHAIN_FINGERPRINT_FILES = Object.freeze([
  ".n-node-version",
  "server/go.mod",
  "server/go.sum",
  "web/package.json",
  "web/pnpm-lock.yaml",
  "server/Dockerfile",
  "web/Dockerfile",
]);
const DEPENDENCY_LOCK_FILES = Object.freeze([
  "server/go.sum",
  "web/pnpm-lock.yaml",
]);
const TIME_SENSITIVE_VALIDITY_MS = 24 * 60 * 60 * 1000;

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(root, command, args, { acceptedStatuses = [0] } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || !acceptedStatuses.includes(result.status)) {
    const detail = String(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new Error(
      `${command} ${args[0] || ""} failed${detail ? `: ${detail}` : ""}`,
    );
  }
  return String(result.stdout || "");
}

function runBuffer(root, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args[0] || ""} failed`);
  }
  return result.stdout;
}

function runGit(root, args, options) {
  return run(root, "git", args, options);
}

function assertSha(value) {
  if (!SHA_PATTERN.test(String(value || ""))) {
    throw new Error("exact SHA must be a 40-character lowercase commit SHA");
  }
}

function assertSafeRef(value) {
  if (
    !value ||
    typeof value !== "string" ||
    value.startsWith("-") ||
    /\s|\0/u.test(value)
  ) {
    throw new Error("main ref is unsafe");
  }
}

function readTreeEntry(root, sha, file) {
  const raw = runGit(root, ["ls-tree", "-z", sha, "--", file]);
  const match = raw.match(/^(\d{6}) ([^ ]+) ([0-9a-f]{40})\t([^\0]+)\0$/u);
  if (!match || match[4] !== file) {
    throw new Error(`strict fingerprint file is missing: ${file}`);
  }
  if (match[2] !== "blob" || !/^100(?:644|755)$/u.test(match[1])) {
    throw new Error(`strict fingerprint path is not a regular file: ${file}`);
  }
  return {
    file,
    mode: match[1],
    object: match[3],
  };
}

export function strictFingerprint(root, sha) {
  assertSha(sha);
  runGit(root, ["rev-parse", "--verify", `${sha}^{commit}`]);
  const executableFiles = new Set(PROFILE_REQUIRED_EXECUTABLES.strict);
  const files = [
    ...new Set([...PROFILE_REQUIRED_FILES.strict, ...EXTRA_FINGERPRINT_FILES]),
  ]
    .sort()
    .map((file) => {
      const entry = readTreeEntry(root, sha, file);
      if (executableFiles.has(file) && entry.mode !== "100755") {
        throw new Error(`strict fingerprint executable lost mode: ${file}`);
      }
      return entry;
    });
  return sha256(
    stableStringify({
      contract: EXACT_SHA_GATE_CONTRACT,
      profile: "strict",
      gates: GATE_PROFILES.strict,
      files,
    }),
  );
}

function committedFilesFingerprint(root, sha, label, files) {
  return sha256(
    stableStringify({
      label,
      files: [...files].sort().map((file) => readTreeEntry(root, sha, file)),
    }),
  );
}

function repositoryIdentity(env = process.env) {
  const fromEnvironment = String(
    env.CI_PROJECT_PATH || env.GITHUB_REPOSITORY || "",
  );
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(fromEnvironment)) {
    return fromEnvironment;
  }
  return "local/repository";
}

export function buildStrictReceiptIdentity(root, sha, env = process.env) {
  assertSha(sha);
  const migration = buildMigrationEvidence({ repoRoot: root, commit: sha });
  const customer = buildCustomerConfigEvidence({
    repoRoot: root,
    commit: sha,
    customer: "yoyoosun",
  });
  return validateStrictReceiptIdentity({
    repository: repositoryIdentity(env),
    gitSha: sha,
    sourceArchiveSha256: sha256(
      runBuffer(root, "git", ["archive", "--format=tar", sha]),
    ),
    policyFingerprint: strictFingerprint(root, sha),
    workflowFingerprint: committedFilesFingerprint(
      root,
      sha,
      "delivery-workflows",
      WORKFLOW_FINGERPRINT_FILES,
    ),
    toolchainFingerprint: committedFilesFingerprint(
      root,
      sha,
      "toolchain",
      TOOLCHAIN_FINGERPRINT_FILES,
    ),
    migrationSequenceSha256: migration.sequenceSha256,
    dependencyLockFingerprint: committedFilesFingerprint(
      root,
      sha,
      "dependency-locks",
      DEPENDENCY_LOCK_FILES,
    ),
    customerConfigFingerprint: customer.sourceSha256,
  });
}

function assertCleanExactHead(root, sha) {
  const head = runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  if (head !== sha) {
    throw new Error(`HEAD does not match requested exact SHA: head=${head}`);
  }
  const status = runGit(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status) {
    throw new Error("exact-SHA strict requires a clean worktree");
  }
}

function assertMainReachable(root, sha, mainRef) {
  assertSafeRef(mainRef);
  runGit(root, ["rev-parse", "--verify", `${mainRef}^{commit}`]);
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", sha, mainRef],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`exact SHA is not reachable from ${mainRef}`);
  }
}

export function buildExactShaPlan(
  root,
  { sha, mainRef = "origin/main", env = process.env } = {},
) {
  assertSha(sha);
  assertCleanExactHead(root, sha);
  assertMainReachable(root, sha, mainRef);
  const identity = buildStrictReceiptIdentity(root, sha, env);
  const fingerprint = identity.policyFingerprint;
  const terminalPath = path.join(
    root,
    "output",
    "qa",
    "exact-sha",
    sha,
    `${fingerprint}.json`,
  );
  const receiptPath = path.join(
    root,
    "output",
    "qa",
    "exact-sha",
    sha,
    `${fingerprint}.receipt.json`,
  );
  return {
    contract: EXACT_SHA_GATE_CONTRACT,
    profile: "strict",
    gitSha: sha,
    mainRef,
    fingerprint,
    identity,
    terminalPath,
    receiptPath,
    receiptRelativePath: path
      .relative(root, receiptPath)
      .replaceAll(path.sep, "/"),
  };
}

function assertPlainTerminalFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("exact-SHA terminal must be a plain file");
  }
}

function readReceiptEvidence(plan) {
  if (!existsSync(plan.receiptPath)) {
    throw new Error("exact-SHA strict receipt is missing");
  }
  assertPlainTerminalFile(plan.receiptPath);
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(plan.receiptPath, "utf8"));
  } catch {
    throw new Error("exact-SHA strict receipt is invalid JSON");
  }
  if (
    receipt?.schemaVersion !== "dev-workbench-receipt/v1" ||
    receipt?.gate !== "strict" ||
    receipt?.profile !== "strict" ||
    receipt?.gitCommit !== plan.gitSha ||
    !TERMINAL_STATUSES.has(receipt?.status)
  ) {
    throw new Error("exact-SHA strict receipt contract mismatch");
  }
  return {
    status: receipt.status,
    sha256: sha256File(plan.receiptPath),
    checks: receipt?.metrics?.categoryCounts || {},
  };
}

export function buildExactShaProvenance(
  env = process.env,
  conclusion = "success",
) {
  let provenance;
  if (env.GITLAB_CI === "true") {
    const repository = String(env.CI_PROJECT_PATH || "");
    const refName = String(env.CI_COMMIT_REF_NAME || "");
    const refPrefix = env.CI_COMMIT_TAG ? "refs/tags" : "refs/heads";
    provenance = {
      source: "gitlab-ci",
      repository,
      workflowRef: `${repository}/.gitlab-ci.yml@${refPrefix}/${refName}`,
      runId: String(env.CI_PIPELINE_ID || ""),
      runAttempt: String(env.CI_PIPELINE_IID || ""),
      job: String(env.CI_JOB_NAME || ""),
      eventName: String(env.CI_PIPELINE_SOURCE || ""),
      ref: `${refPrefix}/${refName}`,
      refName,
      headRepository: repository,
      conclusion,
    };
  } else if (env.GITHUB_ACTIONS === "true") {
    provenance = {
      source: "github-actions",
      repository: String(env.GITHUB_REPOSITORY || ""),
      workflowRef: String(env.GITHUB_WORKFLOW_REF || ""),
      runId: String(env.GITHUB_RUN_ID || ""),
      runAttempt: String(env.GITHUB_RUN_ATTEMPT || ""),
      job: String(env.GITHUB_JOB || ""),
      eventName: String(env.GITHUB_EVENT_NAME || ""),
      ref: String(env.GITHUB_REF || ""),
      refName: String(env.GITHUB_REF_NAME || ""),
      headRepository: String(
        env.GITHUB_HEAD_REPOSITORY || env.GITHUB_REPOSITORY || "",
      ),
      conclusion,
    };
  } else {
    return Object.freeze({ source: "local" });
  }
  if (
    !["github-actions", "gitlab-ci"].includes(provenance.source) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(provenance.repository) ||
    !provenance.workflowRef ||
    !/^\d+$/u.test(provenance.runId) ||
    !/^\d+$/u.test(provenance.runAttempt) ||
    !/^[A-Za-z0-9_.-]+$/u.test(provenance.job) ||
    !provenance.eventName ||
    !provenance.ref ||
    !provenance.refName ||
    provenance.headRepository !== provenance.repository ||
    !["success", "failure"].includes(provenance.conclusion)
  ) {
    throw new Error("CI provenance is incomplete");
  }
  return Object.freeze(provenance);
}

function assertTerminalProvenance(provenance) {
  if (provenance?.source === "local") return;
  if (
    !["github-actions", "gitlab-ci"].includes(provenance?.source) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(
      String(provenance.repository || ""),
    ) ||
    !String(provenance.workflowRef || "") ||
    !/^\d+$/u.test(String(provenance.runId || "")) ||
    !/^\d+$/u.test(String(provenance.runAttempt || "")) ||
    !/^[A-Za-z0-9_.-]+$/u.test(String(provenance.job || "")) ||
    !String(provenance.eventName || "") ||
    !String(provenance.ref || "") ||
    !String(provenance.refName || "") ||
    provenance.headRepository !== provenance.repository ||
    !["success", "failure"].includes(provenance.conclusion)
  ) {
    throw new Error("exact-SHA terminal provenance mismatch");
  }
}

export function readExactShaTerminal(plan) {
  if (!existsSync(plan.terminalPath)) return null;
  assertPlainTerminalFile(plan.terminalPath);
  let terminal;
  try {
    terminal = JSON.parse(readFileSync(plan.terminalPath, "utf8"));
  } catch {
    throw new Error("exact-SHA terminal is invalid JSON");
  }
  if (
    terminal?.contract !== EXACT_SHA_GATE_CONTRACT ||
    terminal?.profile !== "strict" ||
    terminal?.gitSha !== plan.gitSha ||
    terminal?.fingerprint !== plan.fingerprint ||
    !TERMINAL_STATUSES.has(terminal?.status) ||
    !Number.isInteger(terminal?.exitCode) ||
    terminal.exitCode < 0 ||
    terminal.exitCode > 255 ||
    (terminal.status === "passed" && terminal.exitCode !== 0) ||
    (terminal.status === "failed" && terminal.exitCode === 0) ||
    !FINGERPRINT_PATTERN.test(String(terminal?.fingerprint || "")) ||
    terminal?.receipt?.path !== plan.receiptRelativePath ||
    !FINGERPRINT_PATTERN.test(String(terminal?.receipt?.sha256 || "")) ||
    stableStringify(terminal?.identity) !== stableStringify(plan.identity)
  ) {
    throw new Error("exact-SHA terminal contract mismatch");
  }
  assertTerminalProvenance(terminal.provenance);
  validateStrictReceiptIdentity(terminal.identity);
  const receipt = readReceiptEvidence(plan);
  if (
    receipt.status !== terminal.status ||
    receipt.sha256 !== terminal.receipt.sha256
  ) {
    throw new Error("exact-SHA terminal receipt integrity mismatch");
  }
  if (terminal.status === "passed") validateStrictReceiptEvidence(terminal);
  return terminal;
}

function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
    const directory = openSync(path.dirname(file), "r");
    fsyncSync(directory);
    closeSync(directory);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function terminalFromReceipt(
  plan,
  { exitCode, startedAt, finishedAt, env = process.env },
) {
  const receiptEvidence = readReceiptEvidence(plan);
  const terminalStatus = exitCode === 0 ? "passed" : "failed";
  if (receiptEvidence.status !== terminalStatus) {
    throw new Error("exact-SHA strict result and receipt status differ");
  }
  const terminal = {
    contract: EXACT_SHA_GATE_CONTRACT,
    profile: "strict",
    gitSha: plan.gitSha,
    mainRef: plan.mainRef,
    fingerprint: plan.fingerprint,
    identity: plan.identity,
    status: terminalStatus,
    exitCode,
    startedAt,
    finishedAt,
    receipt: {
      path: plan.receiptRelativePath,
      sha256: receiptEvidence.sha256,
    },
    checks: receiptEvidence.checks,
    timeSensitiveChecks: {
      vulnerabilityDatabase: {
        status: terminalStatus === "passed" ? "passed" : "failed",
        checkedAt: startedAt,
        validUntil: new Date(
          Date.parse(startedAt) + TIME_SENSITIVE_VALIDITY_MS,
        ).toISOString(),
      },
    },
    provenance: buildExactShaProvenance(
      env,
      terminalStatus === "passed" ? "success" : "failure",
    ),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
  if (terminalStatus === "passed") validateStrictReceiptEvidence(terminal);
  atomicWriteJson(plan.terminalPath, terminal);
  return terminal;
}

export function finalizeExactShaGateFromReceipt(
  root,
  options,
  { now = () => new Date(), env = process.env, startedAt = "" } = {},
) {
  const plan = buildExactShaPlan(root, { ...options, env });
  const existing = readExactShaTerminal(plan);
  if (existing) return { plan, terminal: existing, reused: true };
  assertCleanExactHead(root, plan.gitSha);
  const finished = now();
  const finishedAt = finished.toISOString();
  const effectiveStartedAt = startedAt || finishedAt;
  if (
    Number.isNaN(Date.parse(effectiveStartedAt)) ||
    Date.parse(effectiveStartedAt) > Date.parse(finishedAt)
  ) {
    throw new Error("aggregated exact-SHA start time is invalid");
  }
  const terminal = terminalFromReceipt(plan, {
    exitCode: 0,
    startedAt: effectiveStartedAt,
    finishedAt,
    env,
  });
  console.log(
    `[qa:exact-sha] status=terminal result=${terminal.status} sha=${plan.gitSha} fingerprint=${plan.fingerprint} source=aggregate`,
  );
  return { plan, terminal, reused: false };
}

export function runExactShaGate(
  root,
  options,
  {
    runStrict = ({ receiptPath }) =>
      spawnSync(
        process.execPath,
        [
          path.join(root, "scripts/qa/run-gate-with-receipt.mjs"),
          "--gate",
          "strict",
          "--out",
          receiptPath,
        ],
        { cwd: root, env: process.env, stdio: "inherit" },
      ),
    now = () => new Date(),
    env = process.env,
  } = {},
) {
  const plan = buildExactShaPlan(root, { ...options, env });
  const existing = readExactShaTerminal(plan);
  if (existing) {
    console.log(
      `[qa:exact-sha] status=reused result=${existing.status} sha=${plan.gitSha} fingerprint=${plan.fingerprint}`,
    );
    return { plan, terminal: existing, reused: true };
  }

  const startedAt = now().toISOString();
  const result = runStrict(plan);
  if (result?.error) throw result.error;
  const exitCode = Number.isInteger(result?.status) ? result.status : 1;
  assertCleanExactHead(root, plan.gitSha);
  const terminal = terminalFromReceipt(plan, {
    exitCode,
    startedAt,
    finishedAt: now().toISOString(),
    env,
  });
  console.log(
    `[qa:exact-sha] status=terminal result=${terminal.status} sha=${plan.gitSha} fingerprint=${plan.fingerprint}`,
  );
  return { plan, terminal, reused: false };
}

export function refreshExactShaTimeSensitiveCheck(
  root,
  { sha, mainRef = "origin/main", key },
  {
    runCheck = () =>
      spawnSync("bash", ["scripts/qa/govulncheck.sh"], {
        cwd: root,
        env: { ...process.env, GOVULNCHECK_STRICT: "1" },
        stdio: "inherit",
      }),
    now = () => new Date(),
    env = process.env,
  } = {},
) {
  if (key !== "vulnerabilityDatabase") {
    throw new Error("unsupported time-sensitive strict check");
  }
  const plan = buildExactShaPlan(root, { sha, mainRef, env });
  const terminal = readExactShaTerminal(plan);
  if (!terminal || terminal.status !== "passed") {
    throw new Error("passed exact-SHA terminal is required for refresh");
  }
  const result = runCheck();
  if (result?.error) throw result.error;
  if (result?.status !== 0)
    throw new Error("time-sensitive strict check failed");
  assertCleanExactHead(root, sha);
  const checkedAt = now().toISOString();
  const refreshed = refreshedTimeSensitiveCheck({
    terminal,
    key,
    checkedAt,
    validForMs: TIME_SENSITIVE_VALIDITY_MS,
    provenance: buildExactShaProvenance(env, "success"),
  });
  atomicWriteJson(plan.terminalPath, refreshed);
  return { plan, terminal: refreshed };
}

function parseArgs(argv) {
  const options = {
    sha: "",
    mainRef: "origin/main",
    run: false,
    json: false,
    refreshCheck: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run") {
      options.run = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--refresh-check") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--refresh-check requires a value");
      }
      options.refreshCheck = value;
      index += 1;
      continue;
    }
    if (arg === "--sha" || arg === "--main-ref") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[arg === "--sha" ? "sha" : "mainRef"] = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/exact-sha-gate.mjs --sha <40-char-sha> [--main-ref origin/main] [--json]
  node scripts/qa/exact-sha-gate.mjs --sha <40-char-sha> [--main-ref origin/main] --run
  node scripts/qa/exact-sha-gate.mjs --sha <40-char-sha> [--main-ref origin/main] --refresh-check vulnerabilityDatabase

Without --run the command prints the strict fingerprint and fixed terminal path.
With --run it executes strict only when that fingerprint has no terminal. Passed
and failed terminals are both final for the same fingerprint; change the commit
instead of automatically rebuilding the same SHA.`);
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }
  const root = path.resolve(import.meta.dirname, "../..");
  const options = { sha: parsed.sha, mainRef: parsed.mainRef };
  if (parsed.refreshCheck) {
    const result = refreshExactShaTimeSensitiveCheck(root, {
      ...options,
      key: parsed.refreshCheck,
    });
    console.log(
      parsed.json
        ? JSON.stringify({
            status: "passed",
            refreshed: parsed.refreshCheck,
            gitSha: result.terminal.gitSha,
          })
        : `[qa:exact-sha] status=refreshed check=${parsed.refreshCheck} sha=${result.terminal.gitSha}`,
    );
    return;
  }
  if (!parsed.run) {
    const plan = buildExactShaPlan(root, options);
    const existing = readExactShaTerminal(plan);
    const output = {
      ...plan,
      terminalPath: path.relative(root, plan.terminalPath),
      receiptPath: path.relative(root, plan.receiptPath),
      existingStatus: existing?.status || "missing",
    };
    console.log(
      parsed.json
        ? JSON.stringify(output, null, 2)
        : `[qa:exact-sha] sha=${output.gitSha} fingerprint=${output.fingerprint} terminal=${output.terminalPath} existing=${output.existingStatus}`,
    );
    return;
  }
  const result = runExactShaGate(root, options);
  process.exitCode = result.terminal.exitCode;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[qa:exact-sha] status=blocked reason=${error.message}`);
    process.exitCode = 2;
  }
}
