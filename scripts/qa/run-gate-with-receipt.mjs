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
import {
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from "./lib/repository-identity.mjs";

export const RECEIPT_GATE_COMMANDS = Object.freeze({
  fast: Object.freeze(["bash", "scripts/qa/fast.sh"]),
  full: Object.freeze(["bash", "scripts/qa/full.sh"]),
  strict: Object.freeze(["bash", "scripts/qa/strict.sh"]),
});
export const RECEIPT_GATE_STAGE_IDS = Object.freeze({
  full: Object.freeze([
    "environment_profile",
    "shared",
    "secrets",
    "web",
    "browser",
    "server",
    "govulncheck",
  ]),
  strict: Object.freeze([
    "strict_profile",
    "shellcheck",
    "shfmt",
    "yamllint",
    "environment_profile",
    "shared",
    "secrets",
    "web",
    "browser",
    "server",
    "govulncheck",
  ]),
});
const RECEIPT_GATE_STAGE_LABELS = Object.freeze({
  environment_profile: "环境与门禁配置",
  shared: "共享基础检查",
  secrets: "敏感信息扫描",
  web: "Web 测试与构建",
  browser: "浏览器回归",
  server: "服务端与数据库",
  govulncheck: "Go 漏洞扫描",
  strict_profile: "严格门禁配置",
  shellcheck: "Shell 静态检查",
  shfmt: "Shell 格式检查",
  yamllint: "YAML 静态检查",
});

export function parseGateStageTimings(output, gate) {
  if (!Object.hasOwn(RECEIPT_GATE_STAGE_IDS, gate)) {
    return Object.freeze({
      stageTimings: Object.freeze([]),
      measuredStageDurationMs: 0,
      bottleneckStageId: "",
    });
  }
  const stageTimings = [];
  const seen = new Set();
  for (const line of String(output).split(/\r?\n/u)) {
    const match =
      /^\[qa:stage\] gate=(full|strict) id=([a-z][a-z0-9_]{1,63}) status=(passed|failed) durationMs=(\d+)$/u.exec(
        line,
      );
    if (!match || match[1] !== gate) continue;
    if (seen.has(match[2])) {
      throw new Error(`duplicate QA stage timing: ${match[2]}`);
    }
    const durationMs = Number(match[4]);
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
      throw new Error(`invalid QA stage duration: ${match[2]}`);
    }
    seen.add(match[2]);
    stageTimings.push(
      Object.freeze({
        id: match[2],
        label: RECEIPT_GATE_STAGE_LABELS[match[2]] || match[2],
        status: match[3],
        durationMs,
      }),
    );
  }
  const bottleneck = [...stageTimings].sort(
    (left, right) => right.durationMs - left.durationMs,
  )[0];
  return Object.freeze({
    stageTimings: Object.freeze(stageTimings),
    measuredStageDurationMs: stageTimings.reduce(
      (total, stage) => total + stage.durationMs,
      0,
    ),
    bottleneckStageId: bottleneck?.id || "",
  });
}

export function hasCompleteGateStageTimings(gate, stageTimings) {
  if (gate === "fast") return true;
  const expected = RECEIPT_GATE_STAGE_IDS[gate];
  if (!expected || stageTimings.length !== expected.length) return false;
  const actual = new Set(stageTimings.map((stage) => stage.id));
  return (
    expected.every((stage) => actual.has(stage)) &&
    stageTimings.every((stage) => stage.status === "passed")
  );
}

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

export function evaluateReceiptGateRun({
  childStatus,
  childError,
  identityMatches = true,
  stageTimingComplete = true,
  summary,
}) {
  const childPassed = !childError && childStatus === 0;
  const proofComplete =
    childPassed &&
    identityMatches &&
    stageTimingComplete &&
    summary.executed > 0 &&
    summary.passed === summary.executed &&
    summary.failed === 0 &&
    summary.skipped === 0;
  return Object.freeze({
    exitCode: proofComplete ? 0 : childStatus || 2,
    status: proofComplete ? "passed" : "failed",
  });
}

async function runCLI(argv) {
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
  const expectedRepository = await readRepositoryIdentity(repoRoot);
  const gitContext = getDevWorkbenchGitContext(repoRoot);
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

  const gateOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
  const summary = summarizeGateOutput(gateOutput);
  const stageMetrics = parseGateStageTimings(gateOutput, options.gate);
  const stageTimingComplete = hasCompleteGateStageTimings(
    options.gate,
    stageMetrics.stageTimings,
  );
  const currentRepository = await readRepositoryIdentity(repoRoot);
  const identityMatches = repositoryIdentitiesEqual(
    expectedRepository,
    currentRepository,
  );
  const outcome = evaluateReceiptGateRun({
    childError: child.error,
    childStatus: child.status,
    identityMatches,
    stageTimingComplete,
    summary,
  });
  const notProven = defaultDevWorkbenchNotProven(options.gate);
  if (!identityMatches) {
    notProven.push("repository identity changed during gate");
  }
  if (!stageTimingComplete) {
    notProven.push("required stage timing evidence is incomplete");
  }
  const receipt = buildDevWorkbenchReceipt({
    artifactPaths: [],
    durationMs: Date.now() - startedAt,
    finishedAt: Date.now(),
    gate: options.gate,
    gitContext,
    metrics: options.gate === "fast" ? {} : stageMetrics,
    notProven,
    profile: options.gate,
    repoRoot,
    startedAt,
    status: outcome.status,
    summary,
    invariants: [
      ...(identityMatches
        ? ["repository identity remained stable during gate"]
        : []),
      ...(stageTimingComplete
        ? ["all required gate stages emitted timing evidence"]
        : []),
    ],
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
  runCLI(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[run-gate-with-receipt] ${error.message}\n`);
    process.exit(1);
  });
}
