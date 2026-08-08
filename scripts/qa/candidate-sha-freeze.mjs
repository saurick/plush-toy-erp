#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateStrictReceiptEvidence } from "./strict-receipt-identity.mjs";

export const CANDIDATE_SHA_FREEZE_CONTRACT = "plush.candidate-sha-freeze/v1";
export const CANDIDATE_SHA_FREEZE_SCENARIOS = Object.freeze([
  "dev-version-center-tabs-pagination-desktop",
  "dev-version-center-tabs-pagination-mobile-dark",
]);
export const CANDIDATE_SHA_FREEZE_TESTS = Object.freeze([
  "scripts/qa/strict-receipt-identity.test.mjs",
  "scripts/qa/exact-sha-gate.test.mjs",
  "scripts/qa/ci-workflow.test.mjs",
  "scripts/qa/release-workflow.test.mjs",
  "scripts/qa/dev-workbench-production-boundary.test.mjs",
  "scripts/deploy/github-strict-terminal-reuse.test.mjs",
  "scripts/deploy/target-release-cache.test.mjs",
  "scripts/deploy/promotion-executor.test.mjs",
  "scripts/deploy/rollback-executor.test.mjs",
  "scripts/deploy/target-preflight.test.mjs",
  "web/dev-server/devDeliveryBridgePlugin.test.mjs",
  "web/src/dev-workbench/config/devDelivery.test.mjs",
  "web/src/dev-workbench/styles/dev-version-center.test.mjs",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/u;

function runChecked(runCommand, command, args, options, label) {
  const startedAt = Date.now();
  const result = runCommand(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const detail = String(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
  }
  return Math.max(0, Date.now() - startedAt);
}

function assertPlainJsonFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) {
    throw new Error("candidate freeze strict terminal is invalid");
  }
}

export function validateCandidateFreezeTerminal(terminal, gitSha) {
  if (
    !SHA_PATTERN.test(String(gitSha || "")) ||
    terminal?.contract !== "plush.exact-sha-strict/v3" ||
    terminal?.gitSha !== gitSha ||
    terminal?.status !== "passed" ||
    terminal?.exitCode !== 0 ||
    !FINGERPRINT_PATTERN.test(String(terminal?.fingerprint || ""))
  ) {
    throw new Error("candidate freeze requires a passed exact-SHA terminal");
  }
  validateStrictReceiptEvidence(terminal);
  return terminal;
}

export function buildCandidateFreezePlan(root) {
  return Object.freeze([
    Object.freeze({
      id: "contract_matrix",
      label: "候选 SHA 复用、失败与边界合同",
      command: process.execPath,
      args: Object.freeze(["--test", ...CANDIDATE_SHA_FREEZE_TESTS]),
      env: Object.freeze({}),
    }),
    Object.freeze({
      id: "workbench_light_dark",
      label: "效能工作台浅色与深色真实浏览器",
      command: "pnpm",
      args: Object.freeze(["--dir", "web", "style:l1"]),
      env: Object.freeze({
        STYLE_L1_SCENARIOS: CANDIDATE_SHA_FREEZE_SCENARIOS.join(","),
      }),
    }),
  ]).map((step) => Object.freeze({ ...step, cwd: root }));
}

function assertCleanExactHead(root, gitSha, runCommand) {
  const head = runCommand("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
    cwd: root,
    encoding: "utf8",
  });
  const status = runCommand(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  );
  if (
    head.error ||
    head.status !== 0 ||
    String(head.stdout || "").trim() !== gitSha ||
    status.error ||
    status.status !== 0 ||
    String(status.stdout || "") !== ""
  ) {
    throw new Error("candidate freeze requires a clean exact HEAD");
  }
}

function writeJsonAtomic(file, value) {
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

export function runCandidateShaFreeze(
  root,
  { gitSha, terminalPath, outPath },
  { runCommand = spawnSync, now = () => new Date().toISOString() } = {},
) {
  const repositoryRoot = realpathSync(root);
  assertCleanExactHead(repositoryRoot, gitSha, runCommand);
  const terminalFile = realpathSync(terminalPath);
  assertPlainJsonFile(terminalFile);
  const terminal = validateCandidateFreezeTerminal(
    JSON.parse(readFileSync(terminalFile, "utf8")),
    gitSha,
  );
  const startedAt = now();
  const steps = buildCandidateFreezePlan(repositoryRoot).map((step) => ({
    id: step.id,
    label: step.label,
    status: "passed",
    durationMs: runChecked(
      runCommand,
      step.command,
      step.args,
      {
        cwd: step.cwd,
        env: { ...process.env, ...step.env },
        stdio: "inherit",
      },
      step.label,
    ),
  }));
  assertCleanExactHead(repositoryRoot, gitSha, runCommand);
  const receipt = Object.freeze({
    schemaVersion: CANDIDATE_SHA_FREEZE_CONTRACT,
    status: "passed",
    gitSha,
    strict: {
      fingerprint: terminal.fingerprint,
      sourceArchiveSha256: terminal.identity.sourceArchiveSha256,
      receiptSha256: terminal.receipt.sha256,
    },
    coverage: {
      newShaComplete: true,
      sameShaReuse: true,
      failureReceipt: true,
      recentActionAndDeploymentSeparated: true,
      publicExactShaReadback: true,
      productionBuildDevOnlyIsolation: true,
      workbenchLightAndDark: true,
    },
    scenarios: CANDIDATE_SHA_FREEZE_SCENARIOS,
    steps,
    startedAt,
    finishedAt: now(),
  });
  const outputRoot = path.join(
    repositoryRoot,
    "output",
    "qa",
    "candidate-freeze",
  );
  const output = path.resolve(
    outPath || path.join(outputRoot, `${gitSha}.json`),
  );
  if (!output.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(
      "candidate freeze output must remain in output/qa/candidate-freeze",
    );
  }
  writeJsonAtomic(output, receipt);
  return Object.freeze({ receipt, output });
}

function parseArgs(argv) {
  const options = { gitSha: "", terminalPath: "", outPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (["--sha", "--terminal", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[
        arg === "--sha"
          ? "gitSha"
          : arg === "--terminal"
            ? "terminalPath"
            : "outPath"
      ] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  if (!options.gitSha || !options.terminalPath) {
    throw new Error("--sha and --terminal are required");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  node scripts/qa/candidate-sha-freeze.mjs --sha <40-char-sha> --terminal <strict-terminal.json> [--out <receipt.json>]

Runs the fixed P0 contract matrix plus the version-center light/dark browser
scenarios. It requires an already-passed exact-SHA strict terminal and a clean
HEAD; it does not replace CI, Release, target promotion or public readback.`);
    return;
  }
  const root = path.resolve(import.meta.dirname, "../..");
  const result = runCandidateShaFreeze(root, options);
  console.log(
    `[qa:candidate-freeze] status=passed sha=${result.receipt.gitSha} receipt=${path.relative(root, result.output)}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(
      `[qa:candidate-freeze] status=failed reason=${error.message}`,
    );
    process.exitCode = 1;
  }
}
