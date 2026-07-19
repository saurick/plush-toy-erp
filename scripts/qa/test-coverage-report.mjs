#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildRepositoryFingerprint,
  readRepositoryIdentity,
} from "./lib/repository-identity.mjs";

export const SCHEMA_VERSION = "plush-test-coverage-report/v1";
export const OUTPUT_RELATIVE_PATH = "output/qa/coverage/latest.json";
export const FIELD_LINKAGE_RELATIVE_PATH =
  "output/qa/coverage/field-linkage.latest.json";

export const COVERAGE_POLICY = Object.freeze({
  businessContracts: Object.freeze({
    note: "适用业务合同与关键业务场景目标覆盖率为 100%。",
    scope: "适用业务合同与关键业务场景",
    targetPercent: 100,
    enforcement: "evidence-required",
  }),
  changedBusinessLogic: Object.freeze({
    note: "本轮新增或修改的关键业务逻辑代码目标为 lines / statements >= 90%、branches >= 85%。",
    scope: "本轮新增或修改的关键业务逻辑代码",
    linesMinimumPercent: 90,
    branchesMinimumPercent: 85,
    enforcement: "only-when-change-scoped-coverage-is-collected",
  }),
  repositoryBaseline: Object.freeze({
    note: "仓库整体 Go/Web 在首次可靠 baseline 前只采集不设硬门禁，之后才可 ratchet。",
    go: "collect-only-until-reliable-baseline",
    web: "collect-only-until-reliable-baseline",
    ratchetAfterReliableBaseline: true,
  }),
  requiredGates: Object.freeze({
    note: "本轮受影响且要求执行的 T0-T8 必须 100% executed 且 100% passed。",
    scope: "本轮受影响且要求执行的 T0-T8",
    executedTargetPercent: 100,
    passedTargetPercent: 100,
    incomplete: Object.freeze([
      "failed",
      "skipped",
      "blocked",
      "partial",
      "missing",
      "stale",
      "not_collected",
      "0-tests-executed",
    ]),
  }),
  runtimeAcceptance: Object.freeze({
    note: "本轮承诺的 PostgreSQL / browser / readiness / target / UAT 必须 100% 完成，并按环境分别取证。",
    scope: "本轮承诺的运行态与验收项",
    targetPercent: 100,
    evidence: "environment-specific",
  }),
});

export const BUSINESS_DOMAINS = Object.freeze([
  Object.freeze({ key: "master-data", label: "MasterData" }),
  Object.freeze({ key: "source-documents", label: "Source Documents" }),
  Object.freeze({ key: "fact-inventory", label: "Fact / Inventory" }),
  Object.freeze({ key: "fact-purchase", label: "Fact / Purchase" }),
  Object.freeze({ key: "fact-quality", label: "Fact / Quality" }),
  Object.freeze({ key: "fact-production", label: "Fact / Production" }),
  Object.freeze({ key: "fact-outsourcing", label: "Fact / Outsourcing" }),
  Object.freeze({ key: "fact-shipment", label: "Fact / Shipment" }),
  Object.freeze({ key: "fact-finance", label: "Fact / Finance" }),
  Object.freeze({ key: "workflow", label: "Workflow" }),
  Object.freeze({ key: "rbac-api", label: "RBAC / API" }),
  Object.freeze({ key: "frontend", label: "Frontend" }),
  Object.freeze({ key: "print", label: "Print" }),
  Object.freeze({ key: "import", label: "Import" }),
]);

export const GATE_LEVELS = Object.freeze(
  Array.from({ length: 9 }, (_, index) => `T${index}`),
);

export const GATE_LABELS = Object.freeze({
  T0: "T0 现场与静态",
  T1: "T1 文档与边界",
  T2: "T2 Schema / Migration",
  T3: "T3 Usecase / Repo / Core",
  T4: "T4 API / RBAC / JSON-RPC",
  T5: "T5 Frontend / Page",
  T6: "T6 Config / Seed / Import",
  T7: "T7 Business Integration / E2E",
  T8: "T8 Release / Deploy",
});

export const ACCEPTANCE_KEYS = Object.freeze([
  "postgres",
  "browser",
  "readiness",
  "targetEnvironment",
  "uat",
]);

const DOMAIN_ALIASES = new Map(
  [
    ["masterdata", "master-data"],
    ["master-data", "master-data"],
    ["source-document", "source-documents"],
    ["source-documents", "source-documents"],
    ["sourcedocuments", "source-documents"],
    ["inventory", "fact-inventory"],
    ["fact-inventory", "fact-inventory"],
    ["fact.inventory", "fact-inventory"],
    ["purchase", "fact-purchase"],
    ["fact-purchase", "fact-purchase"],
    ["fact.purchase", "fact-purchase"],
    ["quality", "fact-quality"],
    ["fact-quality", "fact-quality"],
    ["fact.quality", "fact-quality"],
    ["production", "fact-production"],
    ["fact-production", "fact-production"],
    ["fact.production", "fact-production"],
    ["outsourcing", "fact-outsourcing"],
    ["fact-outsourcing", "fact-outsourcing"],
    ["fact.outsourcing", "fact-outsourcing"],
    ["shipment", "fact-shipment"],
    ["fact-shipment", "fact-shipment"],
    ["fact.shipment", "fact-shipment"],
    ["finance", "fact-finance"],
    ["fact-finance", "fact-finance"],
    ["fact.finance", "fact-finance"],
    ["workflow", "workflow"],
    ["rbac-api", "rbac-api"],
    ["rbac/api", "rbac-api"],
    ["api-rbac", "rbac-api"],
    ["frontend", "frontend"],
    ["frontend-ui", "frontend"],
    ["ui", "frontend"],
    ["print", "print"],
    ["import", "import"],
  ].map(([alias, key]) => [alias, key]),
);

const COUNT_ALIASES = Object.freeze({
  passed: ["passed", "pass", "passedCount", "passedCases", "passedTests"],
  failed: ["failed", "fail", "failedCount", "failedCases", "failedTests"],
  skipped: ["skipped", "skip", "skippedCount", "skippedCases", "skippedTests"],
  todo: ["todo", "todoCount", "todoCases", "todoTests"],
  cancelled: [
    "cancelled",
    "canceled",
    "cancelledCount",
    "canceledCount",
    "cancelledCases",
    "cancelledTests",
  ],
  blocked: ["blocked", "blockedCount", "blockedCases", "blockedTests"],
  executed: ["executed", "executedCount", "tests", "totalExecuted"],
  missing: ["missing", "missingCount", "missingCases", "missingTests"],
  requiredCount: [
    "requiredCount",
    "applicableCount",
    "totalRequired",
    "totalCases",
    "totalTests",
  ],
});

const EXECUTION_STATUSES = new Set([
  "passed",
  "failed",
  "blocked",
  "skipped",
  "missing",
  "stale",
  "not_collected",
  "collected",
  "partial",
  "not_applicable",
]);

const PRESERVED_INCOMPLETE_EXECUTION_STATUSES = new Set([
  "missing",
  "stale",
  "not_collected",
  "collected",
  "partial",
]);

const CODE_COVERAGE_STATUSES = new Set([
  "collected",
  "failed",
  "blocked",
  "skipped",
  "missing",
  "stale",
  "not_collected",
  "partial",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function integerCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function roundedPercent(covered, total) {
  return Number(((covered / total) * 100).toFixed(2));
}

function metricFromCounts(covered, total, label) {
  integerCount(covered, `${label}.covered`);
  integerCount(total, `${label}.total`);
  if (covered > total) throw new Error(`${label}.covered cannot exceed total`);
  if (total === 0) return null;
  return { covered, total, percent: roundedPercent(covered, total) };
}

function metricFromPercent(percent, label) {
  const numeric = Number(percent);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(`${label}.percent must be between 0 and 100`);
  }
  return { percent: Number(numeric.toFixed(2)) };
}

export function normalizeCoverageMetrics(input) {
  if (!isPlainObject(input)) return {};
  const output = {};
  for (const key of ["statements", "lines", "branches", "functions"]) {
    const metric = input[key];
    if (!isPlainObject(metric)) continue;
    if (Number.isInteger(metric.covered) && Number.isInteger(metric.total)) {
      const normalized = metricFromCounts(metric.covered, metric.total, key);
      if (normalized) output[key] = normalized;
      continue;
    }
    if (finiteNonNegative(metric.percent) && metric.percent <= 100) {
      output[key] = metricFromPercent(metric.percent, key);
    }
  }
  return output;
}

export function repositoryFingerprint(
  commit,
  porcelainOutput,
  trackedDiffOutput = Buffer.alloc(0),
  untrackedEntries = [],
) {
  return buildRepositoryFingerprint({
    commit,
    porcelainBytes: porcelainOutput,
    trackedDiffBytes: trackedDiffOutput,
    untrackedEntries,
  });
}

export function repositoryStateFromGitOutput(
  commitOutput,
  porcelainOutput,
  trackedDiffOutput = Buffer.alloc(0),
  untrackedEntries = [],
) {
  const commit = Buffer.isBuffer(commitOutput)
    ? commitOutput.toString("utf8").trim()
    : String(commitOutput).trim();
  const statusBytes = Buffer.isBuffer(porcelainOutput)
    ? porcelainOutput
    : Buffer.from(String(porcelainOutput), "utf8");
  return {
    commit,
    dirty: statusBytes.length > 0,
    fingerprint: repositoryFingerprint(
      commit,
      statusBytes,
      trackedDiffOutput,
      untrackedEntries,
    ),
  };
}

export async function collectRepositoryState(projectRoot) {
  return readRepositoryIdentity(projectRoot);
}

export function parseGoCoverprofile(content) {
  const lines = String(content)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return {
      status: "missing",
      note: "Go coverprofile 为空，覆盖率未采集。",
    };
  }
  if (!/^mode:\s+(?:set|count|atomic)$/u.test(lines[0])) {
    throw new Error("invalid Go coverprofile mode header");
  }

  let total = 0;
  let covered = 0;
  for (const [index, line] of lines.slice(1).entries()) {
    const match = line.match(/^.+:\d+\.\d+,\d+\.\d+\s+(\d+)\s+(\d+)$/u);
    if (!match)
      throw new Error(`invalid Go coverprofile record at line ${index + 2}`);
    const statements = Number(match[1]);
    const count = Number(match[2]);
    total += statements;
    if (count > 0) covered += statements;
  }
  if (total === 0) {
    return {
      status: "missing",
      note: "Go coverprofile 没有可执行 statement；不能用 0% 代替未采集。",
    };
  }
  return {
    status: "collected",
    metrics: { statements: metricFromCounts(covered, total, "statements") },
    note: "已采集 coverprofile 输入 package scope 的 Go statement coverage；不是仓库整体基线，且 coverprofile 本身不证明测试无失败或跳过。",
  };
}

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, "");
}

function parseNodeTestSummary(content) {
  const keys = ["tests", "pass", "fail", "cancelled", "skipped", "todo"];
  const values = Object.fromEntries(keys.map((key) => [key, null]));
  const occurrences = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const rawLine of stripAnsi(content).split(/\r?\n/u)) {
    const match = rawLine
      .trim()
      .match(/^(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)$/u);
    if (!match) continue;
    occurrences[match[1]] += 1;
    values[match[1]] = Number(match[2]);
  }
  const missing = keys.filter((key) => values[key] === null);
  const duplicate = keys.filter((key) => occurrences[key] > 1);
  if (missing.length > 0 || duplicate.length > 0) {
    return { status: "invalid", ...values, missing, duplicate };
  }
  const executed = values.tests;
  if (executed === 0) return { status: "missing", executed, ...values };
  if (values.fail > 0 || values.cancelled > 0) {
    return { status: "failed", executed, ...values };
  }
  if (values.skipped > 0 || values.todo > 0) {
    return { status: "skipped", executed, ...values };
  }
  if (values.pass !== executed) {
    return { status: "invalid", executed, ...values };
  }
  return { status: "passed", executed, ...values };
}

export function parseNodeNativeCoverage(content) {
  const normalized = stripAnsi(content);
  const lines = normalized
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^(?:#|ℹ)\s*/u, ""));
  const starts = lines
    .map((line, index) => (line === "start of coverage report" ? index : -1))
    .filter((index) => index >= 0);
  const ends = lines
    .map((line, index) => (line === "end of coverage report" ? index : -1))
    .filter((index) => index >= 0);
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) {
    throw new Error("Node coverage requires one complete start/end report");
  }

  const allFilesRows = lines
    .slice(starts[0] + 1, ends[0])
    .map((line) =>
      line.match(
        /^all files\s*\|\s*([0-9]+(?:\.[0-9]+)?|-)\s*\|\s*([0-9]+(?:\.[0-9]+)?|-)\s*\|\s*([0-9]+(?:\.[0-9]+)?|-)(?:\s*\||$)/iu,
      ),
    )
    .filter(Boolean);
  if (allFilesRows.length !== 1) {
    throw new Error("Node coverage requires exactly one all files row");
  }

  const summary = parseNodeTestSummary(normalized);
  if (summary.status === "invalid") {
    throw new Error("Node coverage requires one complete test summary");
  }
  if (summary.status === "missing") {
    return {
      status: "missing",
      testExecution: summary,
      note: "Node 报告为 0 tests executed，不能标记为已通过或已采集。",
    };
  }

  const [, linesPercent, branchesPercent, functionsPercent] = allFilesRows[0];
  if ([linesPercent, branchesPercent, functionsPercent].includes("-")) {
    return {
      status: "missing",
      testExecution: summary,
      note: "Node coverage 没有 all files 百分比，覆盖率未采集。",
    };
  }
  const result = {
    status: summary.status === "passed" ? "collected" : summary.status,
    metrics: {
      lines: metricFromPercent(linesPercent, "lines"),
      branches: metricFromPercent(branchesPercent, "branches"),
      functions: metricFromPercent(functionsPercent, "functions"),
    },
    testExecution: summary,
    note:
      summary.status === "passed"
        ? "已采集本轮 Node test 实际加载模块的 all files coverage，且本输入的测试摘要无失败、跳过或 0 tests；这不是完整 Web source baseline。"
        : "已采集 Node coverage，但测试摘要不完整，不能作为通过证据。",
  };
  return result;
}

function metricCountsFromIstanbul(payload) {
  const counts = {
    statements: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
  };
  for (const fileCoverage of Object.values(payload)) {
    if (!isPlainObject(fileCoverage)) continue;
    const statementCounts = isPlainObject(fileCoverage.s) ? fileCoverage.s : {};
    const lineCounts = new Map();
    for (const [statementId, rawCount] of Object.entries(statementCounts)) {
      const count = Number(rawCount);
      if (!finiteNonNegative(count)) continue;
      counts.statements.total += 1;
      if (count > 0) counts.statements.covered += 1;
      const line = fileCoverage.statementMap?.[statementId]?.start?.line;
      if (Number.isInteger(line) && line > 0) {
        lineCounts.set(line, Math.max(lineCounts.get(line) || 0, count));
      }
    }
    counts.lines.total += lineCounts.size;
    counts.lines.covered += [...lineCounts.values()].filter(
      (count) => count > 0,
    ).length;

    const functionCounts = isPlainObject(fileCoverage.f)
      ? Object.values(fileCoverage.f)
      : [];
    counts.functions.total += functionCounts.length;
    counts.functions.covered += functionCounts.filter(
      (count) => finiteNonNegative(Number(count)) && Number(count) > 0,
    ).length;

    const branchCounts = isPlainObject(fileCoverage.b)
      ? Object.values(fileCoverage.b).flatMap((value) =>
          Array.isArray(value) ? value : [],
        )
      : [];
    counts.branches.total += branchCounts.length;
    counts.branches.covered += branchCounts.filter(
      (count) => finiteNonNegative(Number(count)) && Number(count) > 0,
    ).length;
  }
  return counts;
}

function metricsFromCoverageSummary(total) {
  if (!isPlainObject(total)) return {};
  const metrics = {};
  for (const key of ["statements", "lines", "branches", "functions"]) {
    const metric = total[key];
    if (!isPlainObject(metric)) continue;
    const covered = Number(metric.covered);
    const count = Number(metric.total);
    if (!Number.isInteger(covered) || !Number.isInteger(count)) continue;
    const normalized = metricFromCounts(covered, count, key);
    if (normalized) metrics[key] = normalized;
  }
  return metrics;
}

export function parseWebCoverageJson(content) {
  let payload;
  try {
    payload = JSON.parse(String(content));
  } catch {
    throw new Error("invalid Web coverage JSON");
  }
  if (!isPlainObject(payload))
    throw new Error("unsupported Web coverage JSON shape");

  let metrics = metricsFromCoverageSummary(payload.total);
  if (Object.keys(metrics).length === 0) {
    const counts = metricCountsFromIstanbul(payload);
    metrics = Object.fromEntries(
      Object.entries(counts)
        .map(([key, value]) => [
          key,
          metricFromCounts(value.covered, value.total, key),
        ])
        .filter(([, metric]) => Boolean(metric)),
    );
  }
  if (Object.keys(metrics).length === 0) {
    return {
      status: "missing",
      note: "Web coverage JSON 没有可计数指标；不能用 0% 代替未采集。",
    };
  }
  return {
    status: "collected",
    metrics,
    note: "已导入 Web coverage JSON 的制品 scope；未证明完整 Web source baseline，且该制品不包含可验证的测试通过/跳过摘要。",
  };
}

export function parseWebCoverage(content) {
  const text = String(content);
  if (/start of coverage report/u.test(stripAnsi(text))) {
    return parseNodeNativeCoverage(text);
  }
  return parseWebCoverageJson(text);
}

function countValue(value, label) {
  if (typeof value === "number") return integerCount(value, label);
  if (typeof value === "string" && /^\d+$/u.test(value)) {
    return integerCount(Number(value), label);
  }
  throw new Error(`${label} must be a number or decimal digit string`);
}

function sourceCount(source, aliases) {
  const values = [];
  for (const alias of aliases) {
    if (Object.hasOwn(source, alias)) {
      values.push(countValue(source[alias], alias));
    }
  }
  if (values.length === 0) return null;
  const [first] = values;
  if (values.some((value) => value !== first)) {
    throw new Error("count aliases must agree");
  }
  return first;
}

function executionSources(input) {
  return [input, input.counts, input.summary].filter(isPlainObject);
}

function executionCount(input, key) {
  const values = [];
  for (const source of executionSources(input)) {
    const value = sourceCount(source, COUNT_ALIASES[key]);
    if (value !== null) values.push(value);
  }
  if (values.length === 0) return null;
  const [first] = values;
  if (values.some((value) => value !== first)) {
    throw new Error("count sources must agree");
  }
  return first;
}

export function normalizeExecutionRecord(
  input,
  { allowNotApplicable = false } = {},
) {
  if (!isPlainObject(input)) {
    return {
      status: "missing",
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      missing: 0,
      total: 0,
      note: "未采集。",
      evidence: [],
    };
  }
  let passed;
  let failed;
  let skipped;
  let blocked;
  let executed;
  let requiredCount;
  let explicitMissing;
  try {
    passed = executionCount(input, "passed") ?? 0;
    const reportedFailed = executionCount(input, "failed") ?? 0;
    const cancelled = executionCount(input, "cancelled") ?? 0;
    failed = integerCount(reportedFailed + cancelled, "failed + cancelled");
    const reportedSkipped = executionCount(input, "skipped") ?? 0;
    const todo = executionCount(input, "todo") ?? 0;
    skipped = integerCount(reportedSkipped + todo, "skipped + todo");
    blocked = executionCount(input, "blocked") ?? 0;
    const derivedExecuted = passed + failed + skipped;
    executed = executionCount(input, "executed") ?? derivedExecuted;
    requiredCount = executionCount(input, "requiredCount");
    explicitMissing = executionCount(input, "missing");
  } catch {
    return {
      status: "failed",
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      missing: 0,
      total: 0,
      note: "执行计数格式无效，不能作为通过证据。",
      evidence: [],
    };
  }
  const derivedExecuted = passed + failed + skipped;
  const required = typeof input.required === "boolean" ? input.required : null;
  const missing =
    explicitMissing ??
    (requiredCount !== null
      ? Math.max(requiredCount - executed - blocked, 0)
      : 0);
  const total = requiredCount ?? executed + missing + blocked;
  const hasExplicitStatus = Object.hasOwn(input, "status");
  const explicitStatus = hasExplicitStatus
    ? typeof input.status === "string"
      ? input.status
      : ""
    : "";
  const requiredCountsConflict =
    requiredCount !== null && executed + missing + blocked > requiredCount;
  const notApplicableCountsValid =
    required === false &&
    executed === 0 &&
    passed === 0 &&
    failed === 0 &&
    skipped === 0 &&
    blocked === 0 &&
    missing === 0 &&
    total === 0;

  let status = "missing";
  let note = "未采集。";
  if (
    executed < derivedExecuted ||
    passed > executed ||
    requiredCountsConflict ||
    !Number.isSafeInteger(total)
  ) {
    status = "failed";
    note = "执行计数不一致，不能作为通过证据。";
  } else if (explicitStatus === "failed" || failed > 0) {
    status = "failed";
    note = "存在失败测试。";
  } else if (explicitStatus === "blocked" || blocked > 0) {
    status = "blocked";
    note = "存在阻塞项。";
  } else if (explicitStatus === "skipped" || skipped > 0) {
    status = "skipped";
    note = "存在跳过测试。";
  } else if (hasExplicitStatus && !EXECUTION_STATUSES.has(explicitStatus)) {
    status = "failed";
    note = "执行状态不受支持，不能作为通过证据。";
  } else if (hasExplicitStatus && explicitStatus === "not_applicable") {
    if (allowNotApplicable && notApplicableCountsValid) {
      status = "not_applicable";
      note = "本轮未受影响，无需执行。";
    } else if (!allowNotApplicable && notApplicableCountsValid) {
      status = "missing";
      note = "not_applicable 只允许用于本轮非必需的 T0-T8 gate。";
    } else {
      status = "failed";
      note = "not_applicable 要求 gate 非必需且所有计数为 0。";
    }
  } else if (
    !hasExplicitStatus &&
    allowNotApplicable &&
    notApplicableCountsValid
  ) {
    status = "not_applicable";
    note = "本轮未受影响，无需执行。";
  } else if (
    hasExplicitStatus &&
    PRESERVED_INCOMPLETE_EXECUTION_STATUSES.has(explicitStatus)
  ) {
    status = explicitStatus;
    note =
      explicitStatus === "partial"
        ? "执行或通过证据不完整。"
        : `制品显式状态为 ${explicitStatus}，不能标记为通过。`;
  } else if (executed === 0) {
    status = "missing";
    note = "0 tests executed，不能标记为通过。";
  } else if (
    missing > 0 ||
    passed !== executed ||
    (requiredCount !== null && executed < requiredCount)
  ) {
    status = "partial";
    note = "执行或通过证据不完整。";
  } else {
    status = "passed";
    note = "已执行项目全部通过，且无失败、跳过或阻塞。";
  }

  const output = {
    status,
    passed,
    failed,
    skipped,
    blocked,
    executed,
    missing,
    total,
    note,
    evidence: [],
  };
  if (required !== null) output.required = required;
  if (requiredCount !== null) output.requiredCount = requiredCount;
  return output;
}

export function evaluateArtifactFreshness(artifact, repository) {
  const identity = artifact?.repository;
  if (
    !isPlainObject(identity) ||
    typeof identity.commit !== "string" ||
    typeof identity.dirty !== "boolean" ||
    typeof identity.fingerprint !== "string"
  ) {
    return {
      status: "stale",
      note: "制品缺少完整 repository identity，不能绑定当前代码。",
    };
  }
  if (
    identity.commit !== repository.commit ||
    identity.dirty !== repository.dirty ||
    identity.fingerprint !== repository.fingerprint
  ) {
    return {
      status: "stale",
      note: "制品 repository identity 与当前代码不一致。",
    };
  }
  return { status: "current", note: "制品已绑定当前 repository identity。" };
}

export function evidencePath(projectRoot, inputPath) {
  const absolute = path.resolve(projectRoot, inputPath);
  const relative = path.relative(projectRoot, absolute);
  if (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  ) {
    return relative.split(path.sep).join("/");
  }
  return path.basename(absolute);
}

function normalizeDomainKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-");
  return DOMAIN_ALIASES.get(normalized) || "";
}

function sectionEntries(section, identityKeys) {
  if (Array.isArray(section)) {
    return section.map((entry) => {
      const key = identityKeys.map((name) => entry?.[name]).find(Boolean);
      return [key, entry];
    });
  }
  if (!isPlainObject(section)) return [];
  return Object.entries(section);
}

function artifactTimestamp(artifact) {
  const value = Date.parse(artifact?.generatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function withEvidence(record, evidence, note = record.note) {
  return { ...record, note, evidence: [evidence] };
}

function staleRecord(evidence, note) {
  return {
    status: "stale",
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    executed: 0,
    missing: 0,
    total: 0,
    note,
    evidence: [evidence],
  };
}

function pickCandidate(candidates) {
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    if (left.current !== right.current)
      return Number(right.current) - Number(left.current);
    if (left.priority !== right.priority) return right.priority - left.priority;
    if (left.generatedAt !== right.generatedAt)
      return right.generatedAt - left.generatedAt;
    return left.evidence.localeCompare(right.evidence);
  })[0];
}

function normalizeArtifactCoverage(entry, evidence, freshness) {
  if (freshness.status !== "current") {
    return {
      status: "stale",
      note: freshness.note,
      evidence: [evidence],
    };
  }
  const metrics = normalizeCoverageMetrics(entry?.metrics || entry);
  if (Object.keys(metrics).length === 0) {
    return {
      status: "missing",
      note: "制品没有可验证 coverage metrics。",
      evidence: [evidence],
    };
  }
  const hasExplicitStatus = Object.hasOwn(entry, "status");
  const explicitStatus = hasExplicitStatus
    ? typeof entry.status === "string"
      ? entry.status
      : ""
    : "";
  let status = !hasExplicitStatus
    ? "collected"
    : CODE_COVERAGE_STATUSES.has(explicitStatus)
      ? explicitStatus
      : "failed";
  const testExecution = isPlainObject(entry?.testExecution)
    ? normalizeExecutionRecord(entry.testExecution)
    : null;
  if (testExecution && testExecution.status !== "passed") {
    if (testExecution.status === "failed") {
      status = "failed";
    } else if (testExecution.status === "blocked" && status !== "failed") {
      status = "blocked";
    } else if (
      testExecution.status === "skipped" &&
      !["failed", "blocked"].includes(status)
    ) {
      status = "skipped";
    } else if (status === "collected") {
      status =
        testExecution.status === "collected" ? "partial" : testExecution.status;
    }
  }
  const output = {
    status,
    metrics,
    note:
      status === "collected"
        ? "已从当前 repository identity 制品采集 coverage；未据此推断 gate 通过。"
        : testExecution && testExecution.status !== "passed"
          ? "制品包含 coverage，但 testExecution 证据不完整。"
          : hasExplicitStatus && !CODE_COVERAGE_STATUSES.has(explicitStatus)
            ? "coverage 状态不受支持，不能作为已采集证据。"
            : "制品包含 coverage，但其显式状态不完整。",
    evidence: [evidence],
  };
  if (testExecution) output.testExecution = testExecution;
  return output;
}

function businessCoverageStatus(domains) {
  const statuses = domains.map((domain) => domain.status);
  const applicable = statuses.filter((status) => status !== "not_applicable");
  if (applicable.every((status) => status === "missing")) return "missing";
  for (const status of ["failed", "blocked", "skipped"]) {
    if (statuses.includes(status)) return status;
  }
  if (
    applicable.every((status) => status === "stale" || status === "missing")
  ) {
    return "stale";
  }
  if (
    statuses.every((status) => ["passed", "not_applicable"].includes(status))
  ) {
    return "passed";
  }
  return "partial";
}

function businessCoverageSummary(domains) {
  const counters = Object.fromEntries(
    [
      "total",
      "executed",
      "passed",
      "failed",
      "skipped",
      "blocked",
      "missing",
    ].map((key) => [
      key,
      domains.reduce(
        (sum, domain) =>
          sum +
          (Number.isInteger(domain[key]) && domain[key] >= 0 ? domain[key] : 0),
        0,
      ),
    ]),
  );
  return {
    status: businessCoverageStatus(domains),
    applicableCount: domains.length,
    passedDomainCount: domains.filter((domain) => domain.status === "passed")
      .length,
    missingDomainCount: domains.filter((domain) =>
      ["missing", "stale"].includes(domain.status),
    ).length,
    incompleteDomainCount: domains.filter(
      (domain) => domain.status !== "passed",
    ).length,
    ...counters,
    domains,
  };
}

function emptyExecutionRecord() {
  return normalizeExecutionRecord(null);
}

function acceptanceKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const aliases = {
    postgres: "postgres",
    postgresql: "postgres",
    browser: "browser",
    readiness: "readiness",
    targetenvironment: "targetEnvironment",
    "target-environment": "targetEnvironment",
    target: "targetEnvironment",
    uat: "uat",
  };
  return aliases[normalized] || "";
}

function fieldLinkageFrontendRecord(artifact, evidence, freshness) {
  const recognizedSource =
    evidence === FIELD_LINKAGE_RELATIVE_PATH ||
    artifact?.command === "node scripts/qa/erp-field-linkage.mjs";
  if (!recognizedSource || !isPlainObject(artifact?.summary)) return null;
  if (freshness.status !== "current") {
    return staleRecord(evidence, freshness.note);
  }

  const summary = artifact.summary;
  let required;
  let passed;
  let failed;
  let skipped;
  let missing;
  try {
    required = countValue(summary.totalScenarios, "totalScenarios");
    passed = countValue(summary.passedScenarios, "passedScenarios");
    failed = countValue(summary.failedScenarios, "failedScenarios");
    skipped = countValue(summary.skippedScenarios, "skippedScenarios");
    missing = countValue(summary.missingScenarios, "missingScenarios");
  } catch {
    return {
      status: "failed",
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      missing: 0,
      total: 0,
      note: "字段联动专项 summary 不完整或计数格式无效，不能作为 Frontend 通过证据。",
      evidence: [evidence],
    };
  }
  if (
    passed > required ||
    failed > required ||
    skipped > required ||
    missing > required
  ) {
    return {
      status: "failed",
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      missing: required > 0 ? required : 0,
      total: required > 0 ? required : 0,
      note: "字段联动专项 summary 不完整，不能作为 Frontend 通过证据。",
      evidence: [evidence],
    };
  }
  let executed;
  try {
    executed = integerCount(
      passed + failed + skipped,
      "field linkage executed",
    );
  } catch {
    return {
      status: "failed",
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      missing: 0,
      total: 0,
      note: "字段联动专项场景计数溢出，不能作为 Frontend 通过证据。",
      evidence: [evidence],
    };
  }
  let accounted;
  try {
    accounted = integerCount(
      executed + missing,
      "field linkage executed + missing",
    );
  } catch {
    return {
      status: "failed",
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      missing: 0,
      total: 0,
      note: "字段联动专项场景计数溢出，不能作为 Frontend 通过证据。",
      evidence: [evidence],
    };
  }
  if (accounted !== required) {
    return {
      status: "failed",
      passed,
      failed,
      skipped,
      blocked: 0,
      executed,
      missing,
      total: required,
      note: "字段联动专项场景计数与总数不一致，不能作为 Frontend 通过证据。",
      evidence: [evidence],
    };
  }
  const record = normalizeExecutionRecord({
    requiredCount: required,
    executed,
    passed,
    failed,
    skipped,
    blocked: 0,
    missing,
  });
  return {
    ...record,
    note: "字段联动专项（含打印链路），不代表整个 Frontend。",
    evidence: [evidence],
  };
}

export function assembleCoverageReport({
  generatedAt,
  repository,
  artifacts = [],
  goCoverageCandidates = [],
  webCoverageCandidates = [],
  inputArtifacts = [],
}) {
  const domainCandidates = new Map(
    BUSINESS_DOMAINS.map(({ key }) => [key, []]),
  );
  const gateCandidates = new Map(GATE_LEVELS.map((level) => [level, []]));
  const acceptanceCandidates = new Map(ACCEPTANCE_KEYS.map((key) => [key, []]));
  const artifactCodeCandidates = { go: [], web: [] };

  for (const source of artifacts) {
    const { artifact, evidence, freshness } = source;
    const current = freshness.status === "current";
    const generatedAtValue = artifactTimestamp(artifact);
    const base = {
      priority: 1,
      current,
      generatedAt: generatedAtValue,
      evidence,
    };

    const domainSection =
      artifact.businessCoverage?.domains || artifact.domains;
    const domainEntries = sectionEntries(domainSection, [
      "key",
      "domain",
      "id",
      "name",
    ]);
    let hasFrontendDomain = false;
    for (const [rawKey, entry] of domainEntries) {
      const key = normalizeDomainKey(rawKey);
      if (!key || !isPlainObject(entry)) continue;
      if (key === "frontend") hasFrontendDomain = true;
      const record = current
        ? withEvidence(normalizeExecutionRecord(entry), evidence)
        : staleRecord(evidence, freshness.note);
      domainCandidates.get(key).push({ ...base, record });
    }
    if (!hasFrontendDomain) {
      const fieldLinkageRecord = fieldLinkageFrontendRecord(
        artifact,
        evidence,
        freshness,
      );
      if (fieldLinkageRecord) {
        domainCandidates
          .get("frontend")
          .push({ ...base, record: fieldLinkageRecord });
      }
    }

    for (const [rawLevel, entry] of sectionEntries(artifact.gates, [
      "level",
      "key",
      "id",
    ])) {
      const level = String(rawLevel || "").toUpperCase();
      if (!gateCandidates.has(level) || !isPlainObject(entry)) continue;
      const record = current
        ? withEvidence(
            normalizeExecutionRecord(entry, { allowNotApplicable: true }),
            evidence,
          )
        : staleRecord(evidence, freshness.note);
      gateCandidates.get(level).push({ ...base, record });
    }

    for (const [rawKey, entry] of sectionEntries(artifact.acceptance, [
      "key",
      "id",
    ])) {
      const key = acceptanceKey(rawKey);
      if (!key || !isPlainObject(entry)) continue;
      const record = current
        ? withEvidence(normalizeExecutionRecord(entry), evidence)
        : staleRecord(evidence, freshness.note);
      acceptanceCandidates.get(key).push({ ...base, record });
    }

    for (const key of ["go", "web"]) {
      const entry = artifact.codeCoverage?.[key];
      if (!isPlainObject(entry)) continue;
      artifactCodeCandidates[key].push({
        ...base,
        record: normalizeArtifactCoverage(entry, evidence, freshness),
      });
    }
  }

  const domains = BUSINESS_DOMAINS.map(({ key, label }) => {
    const selected = pickCandidate(domainCandidates.get(key));
    return { key, label, ...(selected?.record || emptyExecutionRecord()) };
  });
  const gates = GATE_LEVELS.map((key) => {
    const selected = pickCandidate(gateCandidates.get(key));
    return {
      key,
      label: GATE_LABELS[key],
      ...(selected?.record || emptyExecutionRecord()),
    };
  });
  const acceptance = Object.fromEntries(
    ACCEPTANCE_KEYS.map((key) => {
      const selected = pickCandidate(acceptanceCandidates.get(key));
      return [key, selected?.record || emptyExecutionRecord()];
    }),
  );

  function selectedCoverage(explicitCandidates, artifactCandidates) {
    const selected = pickCandidate([
      ...artifactCandidates,
      ...explicitCandidates.map((candidate) => ({
        ...candidate,
        priority: 2,
        generatedAt: Number.MAX_SAFE_INTEGER,
      })),
    ]);
    return (
      selected?.record || {
        status: "missing",
        note: "未采集。",
        evidence: [],
      }
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    policy: COVERAGE_POLICY,
    repository: { ...repository },
    codeCoverage: {
      go: selectedCoverage(goCoverageCandidates, artifactCodeCandidates.go),
      web: selectedCoverage(webCoverageCandidates, artifactCodeCandidates.web),
    },
    businessCoverage: businessCoverageSummary(domains),
    gates,
    acceptance,
    inputArtifacts,
  };
}

export function resolveGeneratedAt(
  explicit,
  env = process.env,
  now = () => new Date(),
) {
  if (explicit) {
    const date = new Date(explicit);
    if (!Number.isFinite(date.getTime()))
      throw new Error("--generated-at must be a valid date");
    return date.toISOString();
  }
  if (env.SOURCE_DATE_EPOCH !== undefined) {
    const seconds = Number(env.SOURCE_DATE_EPOCH);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error("SOURCE_DATE_EPOCH must be a non-negative number");
    }
    return new Date(seconds * 1000).toISOString();
  }
  return now().toISOString();
}

export function parseArgs(argv) {
  const options = {
    write: false,
    help: false,
    generatedAt: "",
    goCoverprofile: "",
    webCoverage: "",
    artifacts: [],
  };
  const singleValueArgs = new Set([
    "--generated-at",
    "--go-coverprofile",
    "--web-coverage",
    "--web-coverage-json",
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--write") {
      if (options.write) throw new Error("--write may only be specified once");
      options.write = true;
      continue;
    }
    if (arg === "--artifact") {
      const value = argv[++index];
      if (!value || value.startsWith("--"))
        throw new Error("--artifact requires a path");
      options.artifacts.push(value);
      continue;
    }
    if (singleValueArgs.has(arg)) {
      const canonical = arg === "--web-coverage-json" ? "--web-coverage" : arg;
      if (seen.has(canonical))
        throw new Error(`${canonical} may only be specified once`);
      const value = argv[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      seen.add(canonical);
      if (canonical === "--generated-at") options.generatedAt = value;
      if (canonical === "--go-coverprofile") options.goCoverprofile = value;
      if (canonical === "--web-coverage") options.webCoverage = value;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return options;
}

async function discoverArtifactPaths(projectRoot, explicitPaths) {
  const coverageDir = path.join(projectRoot, "output", "qa", "coverage");
  const discovered = [];
  try {
    for (const entry of await readdir(coverageDir, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        entry.name !== "latest.json"
      ) {
        discovered.push(path.join(coverageDir, entry.name));
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const explicit = explicitPaths.map((value) =>
    path.resolve(projectRoot, value),
  );
  return [...new Set([...discovered.sort(), ...explicit])];
}

async function loadArtifact(projectRoot, artifactPath, repository) {
  const evidence = evidencePath(projectRoot, artifactPath);
  let artifact;
  try {
    artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch (error) {
    return {
      input: {
        path: evidence,
        status: error?.code === "ENOENT" ? "missing" : "failed",
        note: error?.code === "ENOENT" ? "制品不存在。" : "制品不是有效 JSON。",
      },
    };
  }
  if (!isPlainObject(artifact)) {
    return {
      input: {
        path: evidence,
        status: "failed",
        note: "制品根节点必须是对象。",
      },
    };
  }
  const freshness = evaluateArtifactFreshness(artifact, repository);
  return {
    artifact: { artifact, evidence, freshness },
    input: {
      path: evidence,
      status: freshness.status === "current" ? "collected" : freshness.status,
      note: freshness.note,
      ...(typeof artifact.schemaVersion === "string"
        ? { schemaVersion: artifact.schemaVersion }
        : {}),
    },
  };
}

async function loadCoverageInput(projectRoot, inputPath, parser) {
  const absolute = path.resolve(projectRoot, inputPath);
  const evidence = evidencePath(projectRoot, absolute);
  try {
    const parsed = parser(await readFile(absolute, "utf8"));
    const record = {
      ...parsed,
      ...(parsed.status === "collected" ? { status: "stale" } : {}),
      freshness: "unbound",
      note:
        parsed.status === "collected"
          ? `${parsed.note} 裸输入未带 repository identity，仅保留指标供诊断，不能作为当前代码证据。`
          : parsed.note,
    };
    return {
      priority: 2,
      current: false,
      generatedAt: Number.MAX_SAFE_INTEGER,
      evidence,
      record: { ...record, evidence: [evidence] },
      input: {
        path: evidence,
        status: record.status,
        freshness: "unbound",
        note: record.note,
      },
    };
  } catch (error) {
    const missing = error?.code === "ENOENT";
    const status = missing ? "missing" : "failed";
    const note = missing ? "输入文件不存在。" : "输入格式无效。";
    return {
      priority: 2,
      current: false,
      generatedAt: Number.MAX_SAFE_INTEGER,
      evidence,
      record: {
        status,
        freshness: "unbound",
        note,
        evidence: [evidence],
      },
      input: { path: evidence, status, freshness: "unbound", note },
    };
  }
}

export async function buildCoverageReport({
  projectRoot,
  repository,
  generatedAt,
  artifactPaths = [],
  goCoverprofile = "",
  webCoverage = "",
}) {
  const loadedArtifacts = await Promise.all(
    artifactPaths.map((artifactPath) =>
      loadArtifact(projectRoot, artifactPath, repository),
    ),
  );
  const goInput = goCoverprofile
    ? await loadCoverageInput(projectRoot, goCoverprofile, parseGoCoverprofile)
    : null;
  const webInput = webCoverage
    ? await loadCoverageInput(projectRoot, webCoverage, parseWebCoverage)
    : null;

  return assembleCoverageReport({
    generatedAt,
    repository,
    artifacts: loadedArtifacts.flatMap((loaded) =>
      loaded.artifact ? [loaded.artifact] : [],
    ),
    goCoverageCandidates: goInput ? [goInput] : [],
    webCoverageCandidates: webInput ? [webInput] : [],
    inputArtifacts: [
      ...loadedArtifacts.map((loaded) => loaded.input),
      ...(goInput ? [goInput.input] : []),
      ...(webInput ? [webInput.input] : []),
    ],
  });
}

export async function writeCoverageReport(projectRoot, report) {
  const outputPath = path.join(projectRoot, OUTPUT_RELATIVE_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

export function usage() {
  return `用法:
  node scripts/qa/test-coverage-report.mjs [--write]
    [--go-coverprofile <file>]
    [--web-coverage <node-coverage-stdout-or-json>]
    [--artifact <json>]...
    [--generated-at <ISO-date>]

默认只聚合 output/qa/coverage/*.json（排除 latest.json）并输出 JSON 到 stdout；
--write 固定写入 ${OUTPUT_RELATIVE_PATH}，不会运行测试。
裸 --go-coverprofile/--web-coverage 不含 repository identity，只作 stale 诊断；
当前代码证据须使用含 repository identity 的 --artifact。`;
}

function findProjectRoot(cwd) {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  }).trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const projectRoot = findProjectRoot(process.cwd());
  const repository = await collectRepositoryState(projectRoot);
  const artifactPaths = await discoverArtifactPaths(
    projectRoot,
    options.artifacts,
  );
  const report = await buildCoverageReport({
    projectRoot,
    repository,
    generatedAt: resolveGeneratedAt(options.generatedAt),
    artifactPaths,
    goCoverprofile: options.goCoverprofile,
    webCoverage: options.webCoverage,
  });
  if (options.write) {
    const outputPath = await writeCoverageReport(projectRoot, report);
    process.stdout.write(`${evidencePath(projectRoot, outputPath)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`[qa:test-coverage-report] ${error.message}\n`);
    process.exitCode = 1;
  });
}
