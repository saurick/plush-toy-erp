import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPnpmAuditEnvironment,
  classifyPnpmAuditResult,
  evaluatePnpmAuditThreshold,
  PNPM_AUDIT_RETRY_POLICY,
  runPnpmAudit,
} from "./pnpm-audit-retry.mjs";

function report(severities = {}) {
  const advisories = {};
  let index = 0;
  for (const [severity, count] of Object.entries(severities)) {
    for (let item = 0; item < count; item += 1) {
      index += 1;
      advisories[`advisory-${index}`] = {
        github_advisory_id: `GHSA-test-${index}`,
        module_name: `module-${index}`,
        severity,
      };
    }
  }
  return {
    actions: [],
    advisories,
    metadata: {
      vulnerabilities: {
        info: severities.info || 0,
        low: severities.low || 0,
        moderate: severities.moderate || 0,
        high: severities.high || 0,
        critical: severities.critical || 0,
      },
    },
    muted: [],
  };
}

test("a valid status-one low or moderate report is not retried", async () => {
  const auditReport = report({ low: 2, moderate: 1 });
  let attempts = 0;
  let sleeps = 0;
  const result = await runPnpmAudit({
    execute: async () => {
      attempts += 1;
      return { status: 1, stdout: JSON.stringify(auditReport), stderr: "" };
    },
    sleep: async () => {
      sleeps += 1;
    },
  });

  assert.equal(attempts, 1);
  assert.equal(sleeps, 0);
  assert.deepEqual(result, auditReport);
  assert.deepEqual(evaluatePnpmAuditThreshold(result), {
    ok: true,
    high: 0,
    critical: 0,
    violations: [],
  });
});

test("a valid high severity report blocks without retrying", async () => {
  const auditReport = report({ high: 1 });
  let attempts = 0;
  const result = await runPnpmAudit({
    execute: async () => {
      attempts += 1;
      return { status: 1, stdout: JSON.stringify(auditReport), stderr: "" };
    },
    sleep: async () => assert.fail("a vulnerability report must not retry"),
  });

  assert.equal(attempts, 1);
  assert.deepEqual(evaluatePnpmAuditThreshold(result), {
    ok: false,
    high: 1,
    critical: 0,
    violations: [{ id: "GHSA-test-1", module: "module-1", severity: "high" }],
  });
});

test("a transient network error retries once and returns the next report", async () => {
  const auditReport = report();
  const results = [
    {
      status: 1,
      stdout: JSON.stringify({
        error: {
          code: "ERR_PNPM_META_FETCH_FAIL",
          message: "ERR_SOCKET_TIMEOUT while requesting audit endpoint",
        },
      }),
      stderr: "",
    },
    { status: 0, stdout: JSON.stringify(auditReport), stderr: "" },
  ];
  const retries = [];
  const sleeps = [];
  const networkModes = [];

  await assert.doesNotReject(async () => {
    const result = await runPnpmAudit({
      environment: { HTTPS_PROXY: "http://configured-proxy.invalid:7890" },
      execute: async ({ networkMode }) => {
        networkModes.push(networkMode);
        return results.shift();
      },
      onRetry: (value) => retries.push(value),
      sleep: async (delay) => sleeps.push(delay),
    });
    assert.deepEqual(result, auditReport);
  });
  assert.deepEqual(retries, [
    {
      attempt: 1,
      maxAttempts: 2,
      nextNetworkMode: "configured_proxy",
      reason: "ERR_SOCKET_TIMEOUT",
      retryDelayMs: 5_000,
    },
  ]);
  assert.deepEqual(sleeps, [5_000]);
  assert.deepEqual(networkModes, ["direct", "configured_proxy"]);
});

test("direct audit mode removes proxy settings without exposing them", () => {
  const directEnvironment = buildPnpmAuditEnvironment({
    environment: {
      PATH: "/usr/bin",
      HTTPS_PROXY: "http://configured-proxy.invalid:7890",
      npm_config_https_proxy: "http://npm-proxy.invalid:7890",
    },
    networkMode: "direct",
  });
  assert.equal(directEnvironment.PATH, "/usr/bin");
  assert.equal(directEnvironment.HTTPS_PROXY, undefined);
  assert.equal(directEnvironment.npm_config_proxy, "");
  assert.equal(directEnvironment.npm_config_https_proxy, "");

  const proxyEnvironment = buildPnpmAuditEnvironment({
    environment: { HTTPS_PROXY: "http://configured-proxy.invalid:7890" },
    networkMode: "configured_proxy",
  });
  assert.equal(
    proxyEnvironment.HTTPS_PROXY,
    "http://configured-proxy.invalid:7890",
  );
});

test("HTTP 503 is transient while malformed output fails closed", () => {
  assert.deepEqual(
    classifyPnpmAuditResult({
      status: 1,
      stdout: "",
      stderr: "audit endpoint returned HTTP 503",
    }),
    { kind: "transient", reason: "retryable_http_status" },
  );
  assert.deepEqual(
    classifyPnpmAuditResult({
      status: 1,
      stdout: JSON.stringify({ message: "invalid audit response" }),
      stderr: "",
    }),
    { kind: "failure", reason: "non_retryable_command_failure" },
  );
});

test("two transient failures stop and redact the final diagnostic", async () => {
  let attempts = 0;
  let retries = 0;
  let sleeps = 0;
  const execute = async () => {
    attempts += 1;
    return {
      status: 1,
      stdout: "",
      stderr:
        "ERR_SOCKET_TIMEOUT Authorization: Bearer audit-secret https://user:pass@registry.npmjs.org/?token=audit-token",
    };
  };
  let error;
  try {
    await runPnpmAudit({
      execute,
      onRetry: () => {
        retries += 1;
      },
      sleep: async () => {
        sleeps += 1;
      },
    });
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof Error);
  assert.match(error.message, /attempts=2/u);
  assert.match(error.message, /reason=ERR_SOCKET_TIMEOUT/u);
  assert.doesNotMatch(error.message, /audit-secret|audit-token|user:pass/u);
  assert.equal(attempts, 2);
  assert.equal(retries, 1);
  assert.equal(sleeps, 1);
});

test("the audit retry count and time budget are fixed", () => {
  assert.deepEqual(PNPM_AUDIT_RETRY_POLICY, {
    maxAttempts: 2,
    attemptTimeoutMs: 100_000,
    retryDelayMs: 5_000,
    totalTimeoutMs: 205_000,
  });
});
