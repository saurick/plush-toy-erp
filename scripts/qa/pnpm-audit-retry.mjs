#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const AUDIT_SEVERITIES = Object.freeze([
  "info",
  "low",
  "moderate",
  "high",
  "critical",
]);

export const PNPM_AUDIT_RETRY_POLICY = Object.freeze({
  maxAttempts: 2,
  attemptTimeoutMs: 100_000,
  retryDelayMs: 5_000,
  totalTimeoutMs: 205_000,
});

const TRANSIENT_AUDIT_FAILURE_PATTERNS = Object.freeze([
  ["ERR_SOCKET_TIMEOUT", /\bERR_SOCKET_TIMEOUT\b/iu],
  ["ETIMEDOUT", /\bETIMEDOUT\b/iu],
  ["ECONNRESET", /\bECONNRESET\b/iu],
  ["ECONNREFUSED", /\bECONNREFUSED\b/iu],
  ["EAI_AGAIN", /\bEAI_AGAIN\b/iu],
  ["ENETUNREACH", /\bENETUNREACH\b/iu],
  ["EHOSTUNREACH", /\bEHOSTUNREACH\b/iu],
  ["UND_ERR_CONNECT_TIMEOUT", /\bUND_ERR_CONNECT_TIMEOUT\b/iu],
  ["UND_ERR_SOCKET", /\bUND_ERR_SOCKET\b/iu],
  ["socket_hang_up", /\bsocket hang up\b/iu],
  ["dns_lookup", /\bgetaddrinfo\b/iu],
  ["fetch_failed", /\b(?:fetch|network request) failed\b/iu],
  [
    "retryable_http_status",
    /(?:\bHTTP\b|\bstatus(?: code)?\b|[-:=])\s*(?:408|425|429|500|502|503|504)\b/iu,
  ],
]);

const AUDIT_PROXY_ENV_KEYS = Object.freeze([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "npm_config_proxy",
  "npm_config_https_proxy",
  "NPM_CONFIG_PROXY",
  "NPM_CONFIG_HTTPS_PROXY",
]);

function hasConfiguredAuditProxy(environment) {
  return AUDIT_PROXY_ENV_KEYS.some(
    (key) => String(environment[key] || "").trim() !== "",
  );
}

function auditNetworkModeForAttempt(attempt, environment) {
  return attempt > 1 && hasConfiguredAuditProxy(environment)
    ? "configured_proxy"
    : "direct";
}

export function buildPnpmAuditEnvironment({
  environment = process.env,
  networkMode = "direct",
} = {}) {
  if (!["direct", "configured_proxy"].includes(networkMode)) {
    throw new Error(`unsupported pnpm audit network mode: ${networkMode}`);
  }

  const auditEnvironment = { ...environment };
  if (networkMode === "direct") {
    for (const key of AUDIT_PROXY_ENV_KEYS) delete auditEnvironment[key];
    // Empty npm config values also override proxy entries from user-level npmrc.
    auditEnvironment.npm_config_proxy = "";
    auditEnvironment.npm_config_https_proxy = "";
  }

  return {
    ...auditEnvironment,
    npm_config_fetch_retries: "1",
    npm_config_fetch_retry_mintimeout: "2000",
    npm_config_fetch_retry_maxtimeout: "10000",
    npm_config_fetch_timeout: "45000",
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPnpmAuditReport(report) {
  if (
    !isRecord(report) ||
    !Array.isArray(report.actions) ||
    !isRecord(report.advisories) ||
    !isRecord(report.metadata) ||
    !isRecord(report.metadata.vulnerabilities) ||
    !Array.isArray(report.muted) ||
    report.error
  ) {
    return false;
  }
  return AUDIT_SEVERITIES.every((severity) => {
    const count = report.metadata.vulnerabilities[severity];
    return Number.isSafeInteger(count) && count >= 0;
  });
}

function hasReportedVulnerabilities(report) {
  return (
    Object.keys(report.advisories).length > 0 &&
    AUDIT_SEVERITIES.some(
      (severity) => report.metadata.vulnerabilities[severity] > 0,
    )
  );
}

function sanitizeAuditFailure(value) {
  return String(value || "")
    .replace(/\b(Bearer|Basic)\s+\S+/giu, "$1 [redacted]")
    .replace(
      /\b(authorization|cookie|password|token|api[_-]?key)\s*[:=]\s*\S+/giu,
      "$1=[redacted]",
    )
    .replace(/(https?:\/\/)[^/@\s]+@/giu, "$1[redacted]@")
    .replace(
      /([?&](?:access_token|auth|key|password|token)=)[^&\s]+/giu,
      "$1[redacted]",
    )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

function auditFailureText(result) {
  return [result.errorCode, result.message, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n");
}

export function classifyPnpmAuditResult(result = {}) {
  let report;
  try {
    report = JSON.parse(String(result.stdout || ""));
  } catch {
    report = null;
  }

  if (
    isPnpmAuditReport(report) &&
    (result.status === 0 ||
      (result.status === 1 && hasReportedVulnerabilities(report)))
  ) {
    return { kind: "report", report };
  }

  if (result.timedOut) {
    return { kind: "transient", reason: "attempt_timeout" };
  }

  const failureText = auditFailureText(result);
  for (const [reason, pattern] of TRANSIENT_AUDIT_FAILURE_PATTERNS) {
    if (pattern.test(failureText)) {
      return { kind: "transient", reason };
    }
  }

  return { kind: "failure", reason: "non_retryable_command_failure" };
}

export function evaluatePnpmAuditThreshold(report) {
  if (!isPnpmAuditReport(report)) {
    throw new Error("pnpm audit report contract is invalid");
  }
  const advisories = Object.values(report.advisories).map((advisory) => ({
    id: String(advisory?.github_advisory_id || advisory?.id || "unknown")
      .replace(/[^A-Za-z0-9_.-]/gu, "_")
      .slice(0, 80),
    module: String(advisory?.module_name || "unknown")
      .replace(/[^A-Za-z0-9@/_.-]/gu, "_")
      .slice(0, 120),
    severity: String(advisory?.severity || "unknown").toLowerCase(),
  }));
  if (
    advisories.some((advisory) => !AUDIT_SEVERITIES.includes(advisory.severity))
  ) {
    throw new Error("pnpm audit advisory severity is invalid");
  }
  const violations = advisories.filter((advisory) =>
    ["high", "critical"].includes(advisory.severity),
  );
  const high = report.metadata.vulnerabilities.high;
  const critical = report.metadata.vulnerabilities.critical;
  return {
    ok: high === 0 && critical === 0 && violations.length === 0,
    high,
    critical,
    violations,
  };
}

async function executePnpmAudit({ environment, networkMode, timeoutMs }) {
  const options = {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: buildPnpmAuditEnvironment({ environment, networkMode }),
    killSignal: "SIGTERM",
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      "pnpm",
      [
        "--dir",
        "web",
        "audit",
        "--prod",
        "--audit-level",
        "high",
        "--registry=https://registry.npmjs.org",
        "--json",
      ],
      options,
    );
    return { status: 0, stdout, stderr };
  } catch (error) {
    return {
      status: Number.isInteger(error.code) ? error.code : null,
      errorCode: typeof error.code === "string" ? error.code : "",
      message: error.message,
      signal: error.signal || "",
      stderr: String(error.stderr || ""),
      stdout: String(error.stdout || ""),
      timedOut: Boolean(error.killed && error.signal === "SIGTERM"),
    };
  }
}

function auditCommandError(result, classification, attempts) {
  const detail = sanitizeAuditFailure(auditFailureText(result)) || "no output";
  const status = result.status ?? "unknown";
  return new Error(
    `pnpm audit failed kind=${classification.kind} reason=${classification.reason} attempts=${attempts} status=${status} detail=${detail}`,
  );
}

export async function runPnpmAudit({
  environment = process.env,
  execute = executePnpmAudit,
  now = Date.now,
  onRetry = ({
    attempt,
    maxAttempts,
    nextNetworkMode,
    reason,
    retryDelayMs,
  }) => {
    process.stderr.write(
      `[qa:dependency-audit] transient_registry_failure=${reason} attempt=${attempt}/${maxAttempts} retry_in_ms=${retryDelayMs} next_network_mode=${nextNetworkMode}\n`,
    );
  },
  policy = PNPM_AUDIT_RETRY_POLICY,
  sleep = wait,
} = {}) {
  const startedAt = now();
  let lastResult = {};
  let lastClassification = {
    kind: "failure",
    reason: "audit_not_started",
  };

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const remainingMs = policy.totalTimeoutMs - (now() - startedAt);
    if (remainingMs <= 0) {
      throw auditCommandError(
        lastResult,
        { kind: "transient", reason: "total_timeout" },
        attempt - 1,
      );
    }

    const networkMode = auditNetworkModeForAttempt(attempt, environment);
    lastResult = await execute({
      environment,
      networkMode,
      timeoutMs: Math.min(policy.attemptTimeoutMs, remainingMs),
    });
    lastClassification = classifyPnpmAuditResult(lastResult);
    if (lastClassification.kind === "report") {
      return lastClassification.report;
    }

    const remainingAfterAttempt = policy.totalTimeoutMs - (now() - startedAt);
    const canRetry =
      lastClassification.kind === "transient" &&
      attempt < policy.maxAttempts &&
      remainingAfterAttempt > policy.retryDelayMs;
    if (!canRetry) {
      throw auditCommandError(lastResult, lastClassification, attempt);
    }

    onRetry({
      attempt,
      maxAttempts: policy.maxAttempts,
      nextNetworkMode: auditNetworkModeForAttempt(attempt + 1, environment),
      reason: lastClassification.reason,
      retryDelayMs: policy.retryDelayMs,
    });
    await sleep(policy.retryDelayMs);
  }

  throw auditCommandError(lastResult, lastClassification, policy.maxAttempts);
}

async function main() {
  const result = evaluatePnpmAuditThreshold(await runPnpmAudit());
  if (!result.ok) {
    for (const advisory of result.violations) {
      process.stderr.write(
        `[qa:dependency-audit] severity=${advisory.severity} advisory=${advisory.id} module=${advisory.module}\n`,
      );
    }
    throw new Error(
      `production dependency audit blocked high=${result.high} critical=${result.critical}`,
    );
  }
  process.stdout.write(
    `[qa:dependency-audit] passed high=${result.high} critical=${result.critical}\n`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `[qa:dependency-audit] ${sanitizeAuditFailure(error.message)}\n`,
    );
    process.exitCode = 1;
  });
}
