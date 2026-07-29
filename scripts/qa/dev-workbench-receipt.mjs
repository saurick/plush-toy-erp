import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const DEV_WORKBENCH_RECEIPT_SCHEMA = "dev-workbench-receipt/v1";
export const DEV_WORKBENCH_RECEIPT_GATES = Object.freeze([
  "fast",
  "full",
  "strict",
  "browser",
  "collaboration-e2e",
  "stability",
  "release-rehearsal",
  "target-release",
]);
export const DEV_WORKBENCH_RECEIPT_STATUSES = Object.freeze([
  "passed",
  "failed",
  "blocked",
  "skipped",
]);

const forbiddenReceiptText =
  /(?:postgres(?:ql)?:\/\/|authorization\s*:|bearer\s+|password\s*=|token\s*=|\/Users\/[^/]+\/projects\/plush-toy-erp-customer-|sk-[a-z0-9_-]+)/iu;
const RECEIPT_KEYS = Object.freeze([
  "artifactDigests",
  "artifacts",
  "comparisonRange",
  "databaseRunIdentity",
  "durationMs",
  "environmentFingerprint",
  "executed",
  "failed",
  "finishedAt",
  "gate",
  "gitCommit",
  "invariants",
  "metrics",
  "notProven",
  "passed",
  "profile",
  "schemaVersion",
  "skipped",
  "startedAt",
  "status",
  "treeState",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

export function getDevWorkbenchGitContext(repoRoot) {
  const gitCommit = run(
    "git",
    ["rev-parse", "--verify", "HEAD^{commit}"],
    repoRoot,
  );
  const status = run(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    repoRoot,
  );
  const upstream = run(
    "git",
    ["rev-parse", "--verify", "@{upstream}^{commit}"],
    repoRoot,
  );
  const base = upstream
    ? run("git", ["merge-base", gitCommit, upstream], repoRoot)
    : "";
  return {
    comparisonRange:
      base && base !== gitCommit ? `${base}..${gitCommit}` : "",
    gitCommit,
    treeState: status ? "dirty" : "clean",
  };
}

export function getEnvironmentFingerprint(repoRoot) {
  const packageManager = run("pnpm", ["--version"], repoRoot);
  const goVersion = run("go", ["version"], repoRoot);
  return sha256(
    JSON.stringify({
      arch: process.arch,
      goVersion,
      node: process.version,
      packageManager,
      platform: process.platform,
      release: os.release(),
    }),
  );
}

function normalizeCount(value, label) {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return count;
}

function normalizeStringList(values = [], label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return values.map((value) => {
    const normalized = String(value || "").trim();
    if (!normalized || forbiddenReceiptText.test(normalized)) {
      throw new Error(`${label} contains unsafe text`);
    }
    return normalized;
  });
}

function normalizeObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const serialized = JSON.stringify(value);
  if (forbiddenReceiptText.test(serialized)) {
    throw new Error(`${label} contains sensitive data`);
  }
  return value;
}

export function summarizeGateOutput(output = "") {
  const summary = { executed: 0, passed: 0, failed: 0, skipped: 0 };
  for (const match of String(output).matchAll(
    /\[qa:test-gate\][^\n]*status=complete[^\n]*(?:tests=(\d+)\s+pass=(\d+)\s+fail=(\d+)\s+skipped=(\d+)|run=(\d+)\s+pass=(\d+)\s+fail=(\d+)\s+skip=(\d+))/gu,
  )) {
    const counts = (match[1] ? match.slice(1, 5) : match.slice(5, 9)).map(
      Number,
    );
    summary.executed += counts[0];
    summary.passed += counts[1];
    summary.failed += counts[2];
    summary.skipped += counts[3];
  }
  return Object.freeze(summary);
}

function resolveArtifact(repoRoot, artifactPath) {
  const absolutePath = path.resolve(repoRoot, artifactPath);
  const relativePath = path.relative(repoRoot, absolutePath);
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("plush-toy-erp-customer-")
  ) {
    throw new Error(`artifact must stay inside the product repository`);
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`artifact is missing: ${relativePath}`);
  }
  return Object.freeze({
    digest: `sha256:${sha256(readFileSync(absolutePath))}`,
    path: relativePath.split(path.sep).join("/"),
  });
}

export function buildDevWorkbenchReceipt({
  artifactPaths = [],
  databaseRunIdentity = "",
  durationMs,
  finishedAt,
  gate,
  gitContext,
  metrics = {},
  notProven = [],
  profile = "",
  repoRoot,
  startedAt,
  status,
  summary = {},
  invariants = [],
}) {
  if (!DEV_WORKBENCH_RECEIPT_GATES.includes(gate)) {
    throw new Error(`unknown receipt gate: ${gate}`);
  }
  if (!DEV_WORKBENCH_RECEIPT_STATUSES.includes(status)) {
    throw new Error(`unknown receipt status: ${status}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(gitContext?.gitCommit || "")) {
    throw new Error("receipt requires a 40-character git commit");
  }
  if (!new Set(["clean", "dirty"]).has(gitContext?.treeState)) {
    throw new Error("receipt requires clean or dirty treeState");
  }
  if (
    databaseRunIdentity &&
    !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(databaseRunIdentity)
  ) {
    throw new Error("databaseRunIdentity must be a non-secret run identity");
  }

  const counts = {
    executed: normalizeCount(summary.executed, "executed"),
    passed: normalizeCount(summary.passed, "passed"),
    failed: normalizeCount(summary.failed, "failed"),
    skipped: normalizeCount(summary.skipped, "skipped"),
  };
  if (counts.passed + counts.failed + counts.skipped > counts.executed) {
    throw new Error("receipt result counts exceed executed");
  }
  if (
    status === "passed" &&
    (counts.executed === 0 ||
      counts.failed > 0 ||
      counts.skipped > 0 ||
      counts.passed !== counts.executed)
  ) {
    throw new Error("passed receipt requires non-zero all-passed execution");
  }
  if (status === "failed" && counts.failed === 0) {
    counts.failed = 1;
    counts.executed = Math.max(counts.executed, 1);
  }

  const artifacts = artifactPaths.map((item) =>
    resolveArtifact(repoRoot, item),
  );
  const receipt = {
    schemaVersion: DEV_WORKBENCH_RECEIPT_SCHEMA,
    gate,
    profile: String(profile || ""),
    status,
    gitCommit: gitContext.gitCommit,
    treeState: gitContext.treeState,
    comparisonRange: String(gitContext.comparisonRange || ""),
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: normalizeCount(durationMs, "durationMs"),
    executed: counts.executed,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    environmentFingerprint: getEnvironmentFingerprint(repoRoot),
    databaseRunIdentity,
    artifactDigests: Object.fromEntries(
      artifacts.map((artifact) => [artifact.path, artifact.digest]),
    ),
    metrics: normalizeObject(metrics, "metrics"),
    invariants: normalizeStringList(invariants, "invariants"),
    artifacts: artifacts.map((artifact) => artifact.path),
    notProven: normalizeStringList(notProven, "notProven"),
  };
  const serialized = JSON.stringify(receipt);
  if (forbiddenReceiptText.test(serialized)) {
    throw new Error("receipt contains sensitive data");
  }
  return Object.freeze(receipt);
}

export function validateDevWorkbenchReceipt(receipt) {
  if (!receipt || receipt.schemaVersion !== DEV_WORKBENCH_RECEIPT_SCHEMA) {
    throw new Error("unsupported dev workbench receipt schema");
  }
  if (Array.isArray(receipt) || typeof receipt !== "object") {
    throw new Error("receipt must be an object");
  }
  const actualKeys = Object.keys(receipt).sort();
  if (
    actualKeys.length !== RECEIPT_KEYS.length ||
    actualKeys.some((key, index) => key !== RECEIPT_KEYS[index])
  ) {
    throw new Error("receipt fields do not match the v1 contract");
  }
  const serialized = JSON.stringify(receipt);
  if (forbiddenReceiptText.test(serialized)) {
    throw new Error("receipt contains sensitive data");
  }
  if (!/^[0-9a-f]{64}$/u.test(receipt.environmentFingerprint || "")) {
    throw new Error("receipt environment fingerprint is invalid");
  }
  const startedAt = Date.parse(receipt.startedAt);
  const finishedAt = Date.parse(receipt.finishedAt);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(finishedAt) ||
    finishedAt < startedAt
  ) {
    throw new Error("receipt timestamps are invalid");
  }
  if (typeof receipt.profile !== "string") {
    throw new Error("receipt profile must be a string");
  }
  if (
    typeof receipt.comparisonRange !== "string" ||
    forbiddenReceiptText.test(receipt.comparisonRange)
  ) {
    throw new Error("receipt comparison range is invalid");
  }
  if (
    !Array.isArray(receipt.artifacts) ||
    receipt.artifacts.some(
      (artifact) =>
        typeof artifact !== "string" ||
        !artifact ||
        path.isAbsolute(artifact) ||
        artifact.split("/").includes(".."),
    )
  ) {
    throw new Error("receipt artifact paths are invalid");
  }
  if (
    !receipt.artifactDigests ||
    typeof receipt.artifactDigests !== "object" ||
    Array.isArray(receipt.artifactDigests)
  ) {
    throw new Error("receipt artifact digests are invalid");
  }
  const artifactKeys = Object.keys(receipt.artifactDigests).sort();
  const artifactPaths = [...receipt.artifacts].sort();
  if (
    artifactKeys.length !== artifactPaths.length ||
    artifactKeys.some((key, index) => key !== artifactPaths[index]) ||
    artifactKeys.some(
      (key) => !/^sha256:[0-9a-f]{64}$/u.test(receipt.artifactDigests[key]),
    )
  ) {
    throw new Error("receipt artifacts and digests do not match");
  }
  buildDevWorkbenchReceipt({
    artifactPaths: [],
    databaseRunIdentity: receipt.databaseRunIdentity,
    durationMs: receipt.durationMs,
    finishedAt: receipt.finishedAt,
    gate: receipt.gate,
    gitContext: {
      comparisonRange: receipt.comparisonRange,
      gitCommit: receipt.gitCommit,
      treeState: receipt.treeState,
    },
    metrics: receipt.metrics,
    notProven: receipt.notProven,
    profile: receipt.profile,
    repoRoot: path.resolve(import.meta.dirname, "../.."),
    startedAt: receipt.startedAt,
    status: receipt.status,
    summary: {
      executed: receipt.executed,
      passed: receipt.passed,
      failed: receipt.failed,
      skipped: receipt.skipped,
    },
    invariants: receipt.invariants,
  });
  return receipt;
}

export function writeDevWorkbenchReceipt(outPath, receipt) {
  const absolutePath = path.resolve(outPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, absolutePath);
  return absolutePath;
}

export function defaultDevWorkbenchNotProven(gate) {
  if (gate === "target-release") return ["customer UAT", "customer sign-off"];
  if (gate === "release-rehearsal") {
    return ["target environment release", "customer UAT", "customer sign-off"];
  }
  return [
    "target environment release",
    "customer UAT",
    "customer sign-off",
  ];
}

function runCLI(argv) {
  if (argv.length !== 2 || argv[0] !== "validate") {
    throw new Error(
      "usage: dev-workbench-receipt.mjs validate <receipt.json>",
    );
  }
  const receiptPath = path.resolve(argv[1]);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  validateDevWorkbenchReceipt(receipt);
  process.stdout.write(
    `[dev-workbench-receipt] status=valid gate=${receipt.gate} receipt=${receiptPath}\n`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    runCLI(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[dev-workbench-receipt] ${error.message}\n`);
    process.exit(1);
  }
}
