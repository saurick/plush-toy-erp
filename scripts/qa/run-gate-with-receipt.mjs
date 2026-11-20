#!/usr/bin/env node
import { spawn } from "node:child_process";
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
    "server",
    "resource_sensitive_node",
    "critical_postgres",
    "browser",
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
    "server",
    "resource_sensitive_node",
    "critical_postgres",
    "browser",
    "govulncheck",
  ]),
});
export const RECEIPT_GATE_STAGE_LABELS = Object.freeze({
  environment_profile: "环境与工具链准备",
  shared: "共享基础检查",
  secrets: "敏感信息扫描",
  web: "Web 测试与生产构建",
  server: "隔离数据库、迁移与 Server 测试",
  resource_sensitive_node: "资源敏感发布合同",
  critical_postgres: "关键 PostgreSQL 合同",
  browser: "真实浏览器回归",
  govulncheck: "Go 漏洞扫描",
  strict_profile: "严格门禁配置",
  shellcheck: "Shell 静态检查",
  shfmt: "Shell 格式检查",
  yamllint: "YAML 静态检查",
});
export const RECEIPT_GATE_WEB_SUBSTEP_LABELS = Object.freeze({
  eslint: "JavaScript 静态检查",
  stylelint: "样式静态检查",
  web_test: "Web 自动化测试",
  production_build: "Web 生产构建",
  production_boundary: "DEV 与生产隔离检查",
});
export const RECEIPT_GATE_SHARED_SUBSTEP_LABELS = Object.freeze({
  repository_guards: "仓库与生成物守卫",
  node_tests: "Scripts Node 合同测试",
  script_boundaries: "脚本与私有化边界",
  customer_config: "客户配置合同",
});
export const RECEIPT_GATE_PARALLEL_STAGE_IDS = Object.freeze([
  "shared",
  "web",
  "server",
]);
const RECEIPT_GATE_SUBSTEP_LABELS = Object.freeze({
  shared: RECEIPT_GATE_SHARED_SUBSTEP_LABELS,
  web: RECEIPT_GATE_WEB_SUBSTEP_LABELS,
});
const MAX_CAPTURE_BYTES = 512 * 1024 * 1024;

export function parseGateStageEvent(line) {
  const match =
    /^\[qa:stage\] gate=(full|strict) id=([a-z][a-z0-9_]{1,63}) status=(running|passed|failed)(?: durationMs=(\d+))?$/u.exec(
      String(line || "").trim(),
    );
  if (!match) return null;
  const terminal = match[3] !== "running";
  if (
    (terminal && match[4] === undefined) ||
    (!terminal && match[4] !== undefined)
  ) {
    return null;
  }
  const durationMs = terminal ? Number(match[4]) : null;
  if (
    durationMs !== null &&
    (!Number.isSafeInteger(durationMs) || durationMs < 0)
  ) {
    return null;
  }
  return Object.freeze({
    gate: match[1],
    id: match[2],
    label: RECEIPT_GATE_STAGE_LABELS[match[2]] || "未登记阶段",
    status: match[3],
    durationMs,
  });
}

export function parseGateTimingSubstepEvent(line) {
  const match =
    /^\[qa:substep\] gate=(full|strict) stage=([a-z][a-z0-9_]{1,63}) id=([a-z][a-z0-9_]{1,63}) status=(running|passed|failed)(?: durationMs=(\d+))?$/u.exec(
      String(line || "").trim(),
    );
  const labels = RECEIPT_GATE_SUBSTEP_LABELS[match?.[2]];
  if (!match || !labels || !Object.hasOwn(labels, match[3])) {
    return null;
  }
  const terminal = match[4] !== "running";
  if (
    (terminal && match[5] === undefined) ||
    (!terminal && match[5] !== undefined)
  ) {
    return null;
  }
  const durationMs = terminal ? Number(match[5]) : null;
  if (
    durationMs !== null &&
    (!Number.isSafeInteger(durationMs) || durationMs < 0)
  ) {
    return null;
  }
  return Object.freeze({
    gate: match[1],
    stage: match[2],
    id: match[3],
    label: labels[match[3]],
    status: match[4],
    durationMs,
  });
}

export function parseGateSubstepEvent(line) {
  const event = parseGateTimingSubstepEvent(line);
  return event?.stage === "web" ? event : null;
}

export function parseGateParallelEvent(line) {
  const match =
    /^\[qa:parallel\] gate=(full|strict) ids=([a-z][a-z0-9_]{1,63}(?:,[a-z][a-z0-9_]{1,63})+) status=(running|passed|failed)(?: durationMs=(\d+))?$/u.exec(
      String(line || "").trim(),
    );
  if (!match) return null;
  const stageIds = match[2].split(",");
  if (stageIds.join(",") !== RECEIPT_GATE_PARALLEL_STAGE_IDS.join(",")) {
    return null;
  }
  const terminal = match[3] !== "running";
  if (
    (terminal && match[4] === undefined) ||
    (!terminal && match[4] !== undefined)
  ) {
    return null;
  }
  const durationMs = terminal ? Number(match[4]) : null;
  if (
    durationMs !== null &&
    (!Number.isSafeInteger(durationMs) || durationMs < 0)
  ) {
    return null;
  }
  return Object.freeze({
    gate: match[1],
    stageIds: Object.freeze(stageIds),
    status: match[3],
    durationMs,
  });
}

export function parseGateStageTimings(output, gate) {
  if (!Object.hasOwn(RECEIPT_GATE_STAGE_IDS, gate)) {
    return Object.freeze({
      stageTimings: Object.freeze([]),
      substepTimings: Object.freeze([]),
      parallelStageGroups: Object.freeze([]),
      measuredStageDurationMs: 0,
      observedCriticalPathDurationMs: 0,
      bottleneckStageId: "",
    });
  }
  const stageTimings = [];
  const substepTimings = [];
  const parallelStageGroups = [];
  const seenStages = new Set();
  const seenSubsteps = new Set();
  for (const line of String(output).split(/\r?\n/u)) {
    const event = parseGateStageEvent(line);
    if (event && event.gate === gate && event.status !== "running") {
      if (seenStages.has(event.id)) {
        throw new Error(`duplicate QA stage timing: ${event.id}`);
      }
      seenStages.add(event.id);
      stageTimings.push(
        Object.freeze({
          id: event.id,
          label: event.label,
          status: event.status,
          durationMs: event.durationMs,
        }),
      );
    }
    const substep = parseGateTimingSubstepEvent(line);
    if (substep && substep.gate === gate && substep.status !== "running") {
      const key = `${substep.stage}:${substep.id}`;
      if (seenSubsteps.has(key)) {
        throw new Error(`duplicate QA substep timing: ${key}`);
      }
      seenSubsteps.add(key);
      substepTimings.push(
        Object.freeze({
          stage: substep.stage,
          id: substep.id,
          label: substep.label,
          status: substep.status,
          durationMs: substep.durationMs,
        }),
      );
    }
    const parallel = parseGateParallelEvent(line);
    if (parallel && parallel.gate === gate && parallel.status !== "running") {
      if (parallelStageGroups.length > 0) {
        throw new Error("duplicate QA parallel stage timing");
      }
      parallelStageGroups.push(
        Object.freeze({
          stageIds: parallel.stageIds,
          status: parallel.status,
          durationMs: parallel.durationMs,
        }),
      );
    }
  }
  const bottleneck = [...stageTimings].sort(
    (left, right) => right.durationMs - left.durationMs,
  )[0];
  const measuredStageDurationMs = stageTimings.reduce(
    (total, stage) => total + stage.durationMs,
    0,
  );
  const parallelStageIds = new Set(
    parallelStageGroups.flatMap((group) => group.stageIds),
  );
  const observedCriticalPathDurationMs =
    parallelStageGroups.length === 0
      ? measuredStageDurationMs
      : stageTimings
          .filter((stage) => !parallelStageIds.has(stage.id))
          .reduce((total, stage) => total + stage.durationMs, 0) +
        parallelStageGroups.reduce(
          (total, group) => total + group.durationMs,
          0,
        );
  return Object.freeze({
    stageTimings: Object.freeze(stageTimings),
    substepTimings: Object.freeze(substepTimings),
    parallelStageGroups: Object.freeze(parallelStageGroups),
    measuredStageDurationMs,
    observedCriticalPathDurationMs,
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

export function hasCompleteGateParallelTiming(gate, parallelStageGroups) {
  if (gate === "fast") return true;
  return (
    Array.isArray(parallelStageGroups) &&
    parallelStageGroups.length === 1 &&
    parallelStageGroups[0].status === "passed" &&
    parallelStageGroups[0].stageIds.join(",") ===
      RECEIPT_GATE_PARALLEL_STAGE_IDS.join(",")
  );
}

function balancedCounts(executed, passed, failed = 0, skipped = 0) {
  return Object.freeze({ executed, passed, failed, skipped });
}

function stageCounts(stageTimings, id, executedWhenPassed) {
  const stage = stageTimings.find((item) => item.id === id);
  if (!stage) return balancedCounts(0, 0, 0, 0);
  return stage.status === "passed"
    ? balancedCounts(executedWhenPassed, executedWhenPassed, 0, 0)
    : balancedCounts(1, 0, 1, 0);
}

function addCounts(...counts) {
  return balancedCounts(
    counts.reduce((total, item) => total + item.executed, 0),
    counts.reduce((total, item) => total + item.passed, 0),
    counts.reduce((total, item) => total + item.failed, 0),
    counts.reduce((total, item) => total + item.skipped, 0),
  );
}

export function summarizeGateCategories(output, gate, stageTimings) {
  const byLabel = new Map();
  for (const match of String(output).matchAll(
    /\[qa:test-gate\]\s+label=([^\s]+)[^\n]*status=complete[^\n]*(?:tests=(\d+)\s+pass=(\d+)\s+fail=(\d+)\s+skipped=(\d+)|run=(\d+)\s+pass=(\d+)\s+fail=(\d+)\s+skip=(\d+))/gu,
  )) {
    const counts = (match[2] ? match.slice(2, 6) : match.slice(6, 10)).map(
      Number,
    );
    byLabel.set(match[1], balancedCounts(...counts));
  }
  const browserChecks = gate === "strict" ? 4 : 2;
  return Object.freeze({
    web: byLabel.get("web-all") || balancedCounts(0, 0, 0, 0),
    server: byLabel.get("server-all") || balancedCounts(0, 0, 0, 0),
    database: addCounts(
      stageCounts(stageTimings, "server", 1),
      stageCounts(stageTimings, "critical_postgres", 1),
    ),
    browser: stageCounts(stageTimings, "browser", browserChecks),
    security: (() => {
      const secrets = stageCounts(stageTimings, "secrets", 1);
      const vulnerability = stageCounts(stageTimings, "govulncheck", 1);
      return balancedCounts(
        secrets.executed + vulnerability.executed,
        secrets.passed + vulnerability.passed,
        secrets.failed + vulnerability.failed,
        0,
      );
    })(),
  });
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
  parallelTimingComplete = true,
  stageTimingComplete = true,
  summary,
}) {
  const childPassed = !childError && childStatus === 0;
  const proofComplete =
    childPassed &&
    identityMatches &&
    parallelTimingComplete &&
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

export async function runReceiptGate({
  gate,
  outPath = "",
  repoRoot = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
  spawnProcess = spawn,
  stdout = process.stdout,
  stderr = process.stderr,
  onChild,
} = {}) {
  if (!Object.hasOwn(RECEIPT_GATE_COMMANDS, gate)) {
    throw new Error("gate must be fast, full or strict");
  }
  const [command, ...args] = RECEIPT_GATE_COMMANDS[gate];
  const receiptOutPath =
    outPath ||
    path.join(
      repoRoot,
      "output",
      "dev-workbench",
      "receipts",
      `${gate}-latest.json`,
    );
  const expectedRepository = await readRepositoryIdentity(repoRoot);
  const gitContext = getDevWorkbenchGitContext(repoRoot);
  const startedAt = Date.now();
  const child = spawnProcess(command, args, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!child || typeof child.once !== "function") {
    throw new Error("gate child process is unavailable");
  }
  onChild?.(child);

  const captured = [];
  let capturedBytes = 0;
  let captureOverflow = false;
  const consume = (chunk, target) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    target?.write?.(buffer);
    if (
      !captureOverflow &&
      capturedBytes + buffer.length <= MAX_CAPTURE_BYTES
    ) {
      captured.push(buffer);
      capturedBytes += buffer.length;
    } else {
      captureOverflow = true;
    }
  };
  child.stdout?.on?.("data", (chunk) => consume(chunk, stdout));
  child.stderr?.on?.("data", (chunk) => consume(chunk, stderr));
  const childResult = await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once("error", (error) => finish({ status: null, signal: "", error }));
    child.once("close", (status, signal) =>
      finish({ status, signal: signal || "", error: null }),
    );
  });

  const gateOutput = Buffer.concat(captured).toString("utf8");
  const summary = summarizeGateOutput(gateOutput);
  const stageMetrics = parseGateStageTimings(gateOutput, gate);
  const categoryCounts = summarizeGateCategories(
    gateOutput,
    gate,
    stageMetrics.stageTimings,
  );
  const stageTimingComplete = hasCompleteGateStageTimings(
    gate,
    stageMetrics.stageTimings,
  );
  const parallelTimingComplete = hasCompleteGateParallelTiming(
    gate,
    stageMetrics.parallelStageGroups,
  );
  const currentRepository = await readRepositoryIdentity(repoRoot);
  const identityMatches = repositoryIdentitiesEqual(
    expectedRepository,
    currentRepository,
  );
  const outcome = evaluateReceiptGateRun({
    childError:
      childResult.error ||
      (captureOverflow
        ? new Error("gate output exceeded capture limit")
        : null),
    childStatus: childResult.status,
    identityMatches,
    parallelTimingComplete,
    stageTimingComplete,
    summary,
  });
  const notProven = defaultDevWorkbenchNotProven(gate);
  if (!identityMatches) {
    notProven.push("repository identity changed during gate");
  }
  if (!stageTimingComplete) {
    notProven.push("required stage timing evidence is incomplete");
  }
  if (!parallelTimingComplete) {
    notProven.push("required parallel stage timing evidence is incomplete");
  }
  if (captureOverflow) {
    notProven.push("gate output exceeded the bounded receipt capture");
  }
  if (childResult.signal) {
    notProven.push("gate process ended after an external signal");
  }
  const receipt = buildDevWorkbenchReceipt({
    artifactPaths: [],
    durationMs: Date.now() - startedAt,
    finishedAt: Date.now(),
    gate,
    gitContext,
    metrics:
      gate === "fast" ? {} : Object.freeze({ ...stageMetrics, categoryCounts }),
    notProven,
    profile: gate,
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
      ...(parallelTimingComplete
        ? [
            "independent shared, Web and Server stages ran as one observed group",
          ]
        : []),
    ],
  });
  const writtenPath = writeDevWorkbenchReceipt(receiptOutPath, receipt);
  stderr?.write?.(
    `[run-gate-with-receipt] gate=${gate} status=${receipt.status} receipt=${path.relative(repoRoot, writtenPath)}\n`,
  );
  return Object.freeze({
    childSignal: childResult.signal,
    exitCode: outcome.exitCode,
    receipt,
    writtenPath,
  });
}

async function runCLI(argv) {
  const options = parseArgs(argv);
  let child = null;
  let interruptedSignal = "";
  const interrupt = (signal) => {
    interruptedSignal ||= signal;
    try {
      child?.kill?.(signal);
    } catch {
      // The process group may already be terminating.
    }
  };
  const onSigterm = () => interrupt("SIGTERM");
  const onSigint = () => interrupt("SIGINT");
  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);
  try {
    const result = await runReceiptGate({
      gate: options.gate,
      outPath: options.out,
      onChild: (value) => {
        child = value;
      },
    });
    process.exitCode = interruptedSignal
      ? interruptedSignal === "SIGINT"
        ? 130
        : 143
      : result.exitCode;
  } finally {
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("SIGINT", onSigint);
  }
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
