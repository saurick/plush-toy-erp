#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildDevWorkbenchReceipt,
  defaultDevWorkbenchNotProven,
  getDevWorkbenchGitContext,
  summarizeGateOutput,
  writeDevWorkbenchReceipt,
} from "./dev-workbench-receipt.mjs";

export const RECEIPT_GATE_COMMANDS = Object.freeze({
  fast: Object.freeze(["bash", "scripts/qa/fast.sh"]),
  full: Object.freeze(["bash", "scripts/qa/full.sh"]),
  strict: Object.freeze(["bash", "scripts/qa/strict.sh"]),
});

function parseArgs(argv) {
  const options = { gate: "", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--gate" || arg === "--out") {
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!RECEIPT_GATE_COMMANDS[options.gate]) {
    throw new Error("--gate must be fast, full or strict");
  }
  return options;
}

export function evaluateReceiptGateRun({ childStatus, childError, summary }) {
  const childPassed = !childError && childStatus === 0;
  const proofComplete =
    childPassed &&
    summary.executed > 0 &&
    summary.passed === summary.executed &&
    summary.failed === 0 &&
    summary.skipped === 0;
  return Object.freeze({
    exitCode: proofComplete ? 0 : childStatus || 2,
    status: proofComplete ? "passed" : "failed",
  });
}

function runCLI(argv) {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const options = parseArgs(argv);
  const [command, ...args] = RECEIPT_GATE_COMMANDS[options.gate];
  const outPath =
    options.out ||
    path.join(
      repoRoot,
      "output",
      "dev-workbench",
      "receipts",
      `${options.gate}-latest.json`,
    );
  const startedAt = Date.now();
  const child = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");

  const summary = summarizeGateOutput(
    `${child.stdout || ""}\n${child.stderr || ""}`,
  );
  const outcome = evaluateReceiptGateRun({
    childError: child.error,
    childStatus: child.status,
    summary,
  });
  const receipt = buildDevWorkbenchReceipt({
    artifactPaths: [],
    durationMs: Date.now() - startedAt,
    finishedAt: Date.now(),
    gate: options.gate,
    gitContext: getDevWorkbenchGitContext(repoRoot),
    metrics: {},
    notProven: defaultDevWorkbenchNotProven(options.gate),
    profile: options.gate,
    repoRoot,
    startedAt,
    status: outcome.status,
    summary,
    invariants: [],
  });
  const writtenPath = writeDevWorkbenchReceipt(outPath, receipt);
  process.stderr.write(
    `[run-gate-with-receipt] gate=${options.gate} status=${receipt.status} receipt=${path.relative(repoRoot, writtenPath)}\n`,
  );
  process.exitCode = outcome.exitCode;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    runCLI(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[run-gate-with-receipt] ${error.message}\n`);
    process.exit(1);
  }
}
