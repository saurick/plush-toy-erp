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
  GATE_PROFILES,
  PROFILE_REQUIRED_EXECUTABLES,
  PROFILE_REQUIRED_FILES,
} from "./gate-profiles.mjs";

export const EXACT_SHA_GATE_CONTRACT = "plush.exact-sha-strict/v2";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/u;
const TERMINAL_STATUSES = new Set(["passed", "failed"]);
const EXTRA_FINGERPRINT_FILES = Object.freeze([
  ".n-node-version",
  "server/go.mod",
  "server/go.sum",
  "web/package.json",
  "web/pnpm-lock.yaml",
]);

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
  const match = raw.match(
    /^(\d{6}) ([^ ]+) ([0-9a-f]{40})\t([^\0]+)\0$/u,
  );
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
    ...new Set([
      ...PROFILE_REQUIRED_FILES.strict,
      ...EXTRA_FINGERPRINT_FILES,
    ]),
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
      gitSha: sha,
      profile: "strict",
      gates: GATE_PROFILES.strict,
      files,
    }),
  );
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
  { sha, mainRef = "origin/main" } = {},
) {
  assertSha(sha);
  assertCleanExactHead(root, sha);
  assertMainReachable(root, sha, mainRef);
  const fingerprint = strictFingerprint(root, sha);
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
    terminalPath,
    receiptPath,
    receiptRelativePath: path.relative(root, receiptPath).replaceAll(path.sep, "/"),
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
  };
}

export function buildExactShaProvenance(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true") {
    return Object.freeze({ source: "local" });
  }
  const provenance = {
    source: "github-actions",
    repository: String(env.GITHUB_REPOSITORY || ""),
    workflowRef: String(env.GITHUB_WORKFLOW_REF || ""),
    runId: String(env.GITHUB_RUN_ID || ""),
    runAttempt: String(env.GITHUB_RUN_ATTEMPT || ""),
    job: String(env.GITHUB_JOB || ""),
  };
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(provenance.repository) ||
    !provenance.workflowRef ||
    !/^\d+$/u.test(provenance.runId) ||
    !/^\d+$/u.test(provenance.runAttempt) ||
    !/^[A-Za-z0-9_.-]+$/u.test(provenance.job)
  ) {
    throw new Error("GitHub Actions provenance is incomplete");
  }
  return Object.freeze(provenance);
}

function assertTerminalProvenance(provenance) {
  if (provenance?.source === "local") return;
  if (
    provenance?.source !== "github-actions" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(
      String(provenance.repository || ""),
    ) ||
    !String(provenance.workflowRef || "") ||
    !/^\d+$/u.test(String(provenance.runId || "")) ||
    !/^\d+$/u.test(String(provenance.runAttempt || "")) ||
    !/^[A-Za-z0-9_.-]+$/u.test(String(provenance.job || ""))
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
    !FINGERPRINT_PATTERN.test(String(terminal?.receipt?.sha256 || ""))
  ) {
    throw new Error("exact-SHA terminal contract mismatch");
  }
  assertTerminalProvenance(terminal.provenance);
  const receipt = readReceiptEvidence(plan);
  if (
    receipt.status !== terminal.status ||
    receipt.sha256 !== terminal.receipt.sha256
  ) {
    throw new Error("exact-SHA terminal receipt integrity mismatch");
  }
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
  } = {},
) {
  const plan = buildExactShaPlan(root, options);
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
    status: terminalStatus,
    exitCode,
    startedAt,
    finishedAt: now().toISOString(),
    receipt: {
      path: plan.receiptRelativePath,
      sha256: receiptEvidence.sha256,
    },
    provenance: buildExactShaProvenance(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
  atomicWriteJson(plan.terminalPath, terminal);
  console.log(
    `[qa:exact-sha] status=terminal result=${terminal.status} sha=${plan.gitSha} fingerprint=${plan.fingerprint}`,
  );
  return { plan, terminal, reused: false };
}

function parseArgs(argv) {
  const options = { sha: "", mainRef: "origin/main", run: false, json: false };
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
