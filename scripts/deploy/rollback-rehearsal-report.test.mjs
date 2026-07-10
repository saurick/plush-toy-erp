import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildReport, parseArgs } from "./rollback-rehearsal-report.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/deploy/rollback-rehearsal-report.mjs");

function writeSmokeReport(root, overrides = {}) {
  const filePath = path.join(root, "smoke-test-report.json");
  const report = {
    customerCode: "yoyoosun",
    generatedAt: "2026-06-29T12:00:00Z",
    endpointAlias: "https://erp.example.invalid",
    summary: { total: 2, passed: 2, failed: 0 },
    checks: [
      { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
      { name: "login-page", status: "pass", target: "https://erp.example.invalid/admin-login", httpCode: "200" },
    ],
    redaction: { containsSecrets: false, containsRawCustomerRows: false },
    ...overrides,
  };
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

function writeCustomerConfigSmokeReport(root, overrides = {}) {
  return writeSmokeReport(root, {
    summary: { total: 3, passed: 3, failed: 0 },
    checks: [
      { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
      { name: "login-page", status: "pass", target: "https://erp.example.invalid/admin-login", httpCode: "200" },
      {
        name: "customer-config-effective-session",
        status: "pass",
        target: "jsonrpc:customer_config.get_effective_session",
        expectedRevision: "yoyoosun-customer-package-v6.runtime-manifest-v1",
        tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
        responseBodyStored: false,
      },
    ],
    ...overrides,
  });
}

function baseOptions(root, overrides = {}) {
  if (!fs.existsSync(path.join(root, "smoke-test-report.json"))) {
    writeSmokeReport(root);
  }
  const postSmokeReport = overrides.postSmokeReport ?? "smoke-test-report.json";
  return {
    customer: "yoyoosun",
    environment: "customer-trial",
    releaseVersion: "20260629T1200-test",
    rehearsalType: "rollback-forward-fix",
    triggerScenario: "smoke failed after activation",
    rollbackTargetRelease: "previous-stable-release",
    rollbackRunbook: "deployments/yoyoosun/runbooks/03-rollback.md",
    steps: [
      "identify rollback target=pass",
      "verify rollback command path=pass",
      "verify forward-fix owner path=pass",
    ],
    postSmokeReport,
    evidenceReviewStatus: "passed",
    out: path.join(root, "rollback-rehearsal-report.json"),
    ...overrides,
  };
}

test("rollback rehearsal report help is runnable", () => {
  const result = spawnSync("node", [scriptPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /rollback-rehearsal-report\.json/);
  assert.match(result.stdout, /does not execute rollback/);
});

test("parseArgs supports required rollback rehearsal report inputs", () => {
  const options = parseArgs([
    "--environment",
    "customer-trial",
    "--release-version",
    "20260629T1200-test",
    "--rehearsal-type",
    "rollback-forward-fix",
    "--trigger-scenario",
    "smoke failed",
    "--rollback-target-release",
    "previous-stable-release",
    "--step",
    "identify rollback target=pass",
    "--post-smoke-report",
    "output/smoke.json",
    "--out",
    "output/rollback-rehearsal-report.json",
  ]);

  assert.equal(options.customer, "yoyoosun");
  assert.equal(options.rollbackRunbook, "deployments/yoyoosun/runbooks/03-rollback.md");
  assert.deepEqual(options.steps, ["identify rollback target=pass"]);
});

test("parseArgs derives output path from evidence dir", () => {
  const options = parseArgs([
    "--environment",
    "customer-trial",
    "--release-version",
    "20260629T1200-test",
    "--rehearsal-type",
    "rollback-forward-fix",
    "--trigger-scenario",
    "smoke failed",
    "--rollback-target-release",
    "previous-stable-release",
    "--step",
    "identify rollback target=pass",
    "--post-smoke-report",
    "smoke-test-report.json",
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  ]);

  assert.equal(
    options.out,
    "deployments/yoyoosun/evidence/releases/2026-06-29/rollback-rehearsal-report.json",
  );
});

test("buildReport accepts passing steps and non-empty passing post-smoke report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));
  const report = buildReport(baseOptions(root), new Date("2026-06-29T12:30:00Z"));

  assert.equal(report.customerCode, "yoyoosun");
  assert.equal(report.rehearsedAt, "2026-06-29T12:30:00.000Z");
  assert.equal(report.rehearsalType, "rollback-forward-fix");
  assert.equal(report.steps.length, 3);
  assert.equal(report.postCheck.smokeStatus, "passed");
  assert.equal(report.postCheck.smokeCheckCount, 2);
  assert.equal(report.postCheck.customerConfigEffectiveSession, null);
  assert.equal(report.summary.rehearsalCompleted, true);
  assert.equal(report.summary.rollbackPathStatus, "passed");
  assert.equal(report.redaction.containsSecrets, false);
});

test("buildReport accepts customer config post-smoke effective session proof", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));
  writeCustomerConfigSmokeReport(root);
  const report = buildReport(
    baseOptions(root, {
      customerConfigRevision: "yoyoosun-customer-package-v6.runtime-manifest-v1",
    }),
    new Date("2026-06-29T12:30:00Z"),
  );

  assert.equal(report.postCheck.smokeStatus, "passed");
  assert.equal(report.postCheck.smokeCheckCount, 3);
  assert.deepEqual(report.postCheck.customerConfigEffectiveSession, {
    status: "verified",
    expectedRevision: "yoyoosun-customer-package-v6.runtime-manifest-v1",
    target: "jsonrpc:customer_config.get_effective_session",
  });
});

test("buildReport requires matching customer config post-smoke proof when requested", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));

  assert.throws(
    () =>
      buildReport(
        baseOptions(root, {
          customerConfigRevision: "<customer-config-revision>",
        }),
      ),
    /customerConfigRevision must be provided and must not be a placeholder/,
  );

  assert.throws(
    () =>
      buildReport(
        baseOptions(root, {
          customerConfigRevision: "yoyoosun-customer-package-v6.runtime-manifest-v1",
        }),
      ),
    /must include customer-config-effective-session/,
  );

  writeCustomerConfigSmokeReport(root, {
    checks: [
      { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
      { name: "login-page", status: "pass", target: "https://erp.example.invalid/admin-login", httpCode: "200" },
      {
        name: "customer-config-effective-session",
        status: "pass",
        target: "jsonrpc:customer_config.get_effective_session",
        expectedRevision: "wrong-revision",
        tokenSourceEnv: "CUSTOMER_CONFIG_ADMIN_TOKEN",
        responseBodyStored: false,
      },
    ],
  });

  assert.throws(
    () =>
      buildReport(
        baseOptions(root, {
          customerConfigRevision: "yoyoosun-customer-package-v6.runtime-manifest-v1",
        }),
      ),
    /expectedRevision must match customerConfigRevision/,
  );
});

test("buildReport rejects failed rehearsal steps", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));

  assert.throws(
    () => buildReport(baseOptions(root, { steps: ["identify rollback target=failed"] })),
    /steps\[0\]\.status must be pass/,
  );
});

test("buildReport rejects empty or failed smoke reports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));
  writeSmokeReport(root, {
    summary: { total: 0, passed: 0, failed: 0 },
    checks: [],
  });

  assert.throws(
    () => buildReport(baseOptions(root)),
    /post smoke report checks must not be empty/,
  );

  writeSmokeReport(root, {
    summary: { total: 2, passed: 1, failed: 1 },
    checks: [
      { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
      { name: "login-page", status: "fail", target: "https://erp.example.invalid/admin-login", httpCode: "500" },
    ],
  });

  assert.throws(
    () => buildReport(baseOptions(root)),
    /post smoke report checks\[1\]\.status must be pass/,
  );
});

test("buildReport rejects smoke reports without traceable target or HTTP status", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));
  writeSmokeReport(root, {
    checks: [
      { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
      { name: "login-page", status: "pass", httpCode: "200" },
    ],
  });

  assert.throws(
    () => buildReport(baseOptions(root)),
    /post smoke report checks\[1\]\.target is missing/,
  );

  writeSmokeReport(root, {
    checks: [
      { name: "web-healthz", status: "pass", target: "https://erp.example.invalid/healthz", httpCode: "200" },
      { name: "login-page", status: "pass", target: "https://erp.example.invalid/admin-login" },
    ],
  });

  assert.throws(
    () => buildReport(baseOptions(root)),
    /post smoke report checks\[1\]\.httpCode must be a 100-599 HTTP status for URL targets/,
  );
});

test("buildReport rejects post-smoke paths that release gate cannot bind", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));
  writeSmokeReport(root);

  assert.throws(
    () => buildReport(baseOptions(root, { postSmokeReport: path.join(root, "smoke-test-report.json") })),
    /postSmokeReport must be a relative path/,
  );

  assert.throws(
    () => buildReport(baseOptions(root, { postSmokeReport: "output/yoyoosun-smoke.json" })),
    /postSmokeReport must point to smoke-test-report\.json/,
  );

  assert.throws(
    () => buildReport(baseOptions(root, { postSmokeReport: "../smoke-test-report.json" })),
    /postSmokeReport must point to smoke-test-report\.json in the same output directory/,
  );
});

test("CLI writes rollback rehearsal report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-"));
  const outPath = path.join(root, "rollback-rehearsal-report.json");
  writeCustomerConfigSmokeReport(root);
  const result = spawnSync(
    "node",
    [
      scriptPath,
      "--environment",
      "customer-trial",
      "--release-version",
      "20260629T1200-test",
      "--rehearsal-type",
      "rollback-forward-fix",
      "--trigger-scenario",
      "smoke failed after activation",
      "--rollback-target-release",
      "previous-stable-release",
      "--step",
      "identify rollback target=pass",
      "--step",
      "verify rollback command path=pass",
      "--post-smoke-report",
      "smoke-test-report.json",
      "--customer-config-revision",
      "yoyoosun-customer-package-v6.runtime-manifest-v1",
      "--out",
      outPath,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(report.customerCode, "yoyoosun");
  assert.equal(report.postCheck.smokeStatus, "passed");
  assert.equal(
    report.postCheck.customerConfigEffectiveSession.expectedRevision,
    "yoyoosun-customer-package-v6.runtime-manifest-v1",
  );
});

test("CLI writes rollback rehearsal report into evidence dir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-rehearsal-report-evidence-dir-"));
  writeSmokeReport(root);
  const result = spawnSync(
    "node",
    [
      scriptPath,
      "--environment",
      "customer-trial",
      "--release-version",
      "20260629T1200-test",
      "--rehearsal-type",
      "rollback-forward-fix",
      "--trigger-scenario",
      "smoke failed after activation",
      "--rollback-target-release",
      "previous-stable-release",
      "--step",
      "identify rollback target=pass",
      "--step",
      "verify rollback command path=pass",
      "--post-smoke-report",
      "smoke-test-report.json",
      "--evidence-dir",
      root,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const outPath = path.join(root, "rollback-rehearsal-report.json");
  const report = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(report.postCheck.smokeReport, "smoke-test-report.json");
  assert.equal(report.postCheck.smokeCheckCount, 2);
});

test("CLI rejects missing evidence dir before writing report", () => {
  const result = spawnSync(
    "node",
    [
      scriptPath,
      "--environment",
      "customer-trial",
      "--release-version",
      "20260629T1200-test",
      "--rehearsal-type",
      "rollback-forward-fix",
      "--trigger-scenario",
      "smoke failed after activation",
      "--rollback-target-release",
      "previous-stable-release",
      "--step",
      "identify rollback target=pass",
      "--post-smoke-report",
      "smoke-test-report.json",
      "--evidence-dir",
      "deployments/yoyoosun/evidence/releases/not-created",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /evidenceDir must already exist/);
});
