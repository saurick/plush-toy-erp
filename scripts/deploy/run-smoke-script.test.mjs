import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "deployments/yoyoosun/scripts/run-smoke.sh");

function runScript(args = []) {
  return spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function runScriptAsync(args = [], { env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", [scriptPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function createFakeCurlBin(root) {
  const binDir = path.join(root, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const curlPath = path.join(binDir, "curl");
  fs.writeFileSync(
    curlPath,
    `#!/usr/bin/env bash
set -euo pipefail
url="\${@: -1}"
case "$url" in
  */healthz|*/readyz|*/admin-login|*/m/warehouse/tasks)
    printf '200'
    ;;
  */rpc/customer_config)
    cat <<'JSON'
{"result":{"code":0,"data":{"session":{"configRevision":"yoyoosun-customer-package-v5.runtime-manifest-v1","source":"active_customer_config_revision","pages":["global-dashboard"],"fieldPolicies":{"customers.default":{},"suppliers.default":{},"sales_orders.default":{}}}}}}
JSON
    ;;
  *)
    printf '404'
    ;;
esac
`,
    "utf8"
  );
  fs.chmodSync(curlPath, 0o755);
  return binDir;
}

test("run smoke help is runnable", () => {
  const result = runScript(["--help"]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /--release-version/);
  assert.match(result.stdout, /--environment/);
  assert.match(result.stdout, /--print-input-template/);
});

test("run smoke input template is no-write and does not require endpoint", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-template-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const result = runScript(["--print-input-template"]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const template = JSON.parse(result.stdout);
  assert.equal(template.scope, "yoyoosun-run-smoke-input-template");
  assert.equal(template.writesReport, false);
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsEndpoint, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.callsCustomerConfig, false);
  assert.equal(template.readsAdminToken, false);
  assert(template.checks.includes("customer-config-effective-session when --customer-config-revision is provided"));
  assert(template.requiredReadbackEvidence.includes("target=jsonrpc:customer_config.get_effective_session"));
  assert.match(template.commands.join("\n"), /--customer-config-revision yoyoosun-customer-package-v5\.runtime-manifest-v1/);
  assert.match(template.commands.join("\n"), /--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN/);
  assert.match(template.boundary, /does not call endpoints/);
  assert.match(template.boundary, /does not .*write smoke-test-report\.json/);
  assert.match(template.boundary, /does not .*prove active revision readback/);
  assert.equal(fs.existsSync(reportPath), false);
});

test("run smoke writes release-gate compatible report", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-report-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const fakeCurlBin = createFakeCurlBin(root);
  const endpoint = "http://127.0.0.1:19090";
  const backendUrl = "http://127.0.0.1:18300";

  const result = await runScriptAsync(
    [
      "--endpoint",
      endpoint,
      "--backend-url",
      backendUrl,
      "--release-version",
      "20260629T1200-smoke",
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
      "--customer-config-revision",
      "yoyoosun-customer-package-v5.runtime-manifest-v1",
      "--admin-token-env",
      "SMOKE_ADMIN_TOKEN",
    ],
    { env: { PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`, SMOKE_ADMIN_TOKEN: "test-token" } }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.customerCode, "yoyoosun");
  assert.equal(report.releaseVersion, "20260629T1200-smoke");
  assert.equal(report.environment, "customer-trial");
  assert.equal(report.operatorRole, "deployment-operator");
  assert.equal(report.endpointAlias, endpoint);
  assert.equal(report.backendEndpointAlias, backendUrl);
  assert.equal(report.summary.total, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.checks.length, 6);
  assert.ok(report.checks.some((check) => check.name === "server-healthz"));
  assert.ok(report.checks.some((check) => check.name === "server-readyz"));
  assert.ok(report.checks.some((check) => check.name === "mobile-role-route"));
  for (const check of report.checks) {
    assert.match(check.status, /^pass$/);
    if (check.target.startsWith("http://")) {
      assert.match(check.target, /^http:\/\/127\.0\.0\.1:/);
      assert.match(String(check.httpCode), /^(200|302|401|403)$/);
    }
  }
  const customerConfigCheck = report.checks.find((check) => check.name === "customer-config-effective-session");
  assert.equal(customerConfigCheck.target, "jsonrpc:customer_config.get_effective_session");
  assert.equal(customerConfigCheck.expectedRevision, "yoyoosun-customer-package-v5.runtime-manifest-v1");
  assert.equal(customerConfigCheck.tokenSourceEnv, "SMOKE_ADMIN_TOKEN");
  assert.equal(customerConfigCheck.responseBodyStored, false);
  assert.equal(report.redaction.containsSecrets, false);
  assert.equal(report.redaction.containsRawCustomerRows, false);
});

test("run smoke keeps backend checks optional", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-web-only-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const fakeCurlBin = createFakeCurlBin(root);
  const endpoint = "http://127.0.0.1:19091";

  const result = await runScriptAsync(
    [
      "--endpoint",
      endpoint,
      "--release-version",
      "20260629T1200-smoke-web-only",
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
    ],
    { env: { PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}` } }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.endpointAlias, endpoint);
  assert.equal(report.backendEndpointAlias, undefined);
  assert.equal(report.checks.length, 3);
  assert.deepEqual(
    report.checks.map((check) => check.name),
    ["web-healthz", "login-page", "mobile-role-route"],
  );
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.passed, 3);
  assert.equal(report.summary.failed, 0);
});

test("run smoke rejects credentialed endpoint URL before writing report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-credentialed-endpoint-"));
  const reportPath = path.join(root, "smoke-test-report.json");

  const result = runScript([
    "--endpoint",
    "https://deploy:secret@erp.example.invalid",
    "--release-version",
    "20260629T1200-smoke",
    "--environment",
    "customer-trial",
    "--report",
    reportPath,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /--endpoint must not contain username or password/);
  assert.equal(fs.existsSync(reportPath), false);
});

test("run smoke rejects credentialed backend URL before writing report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-credentialed-backend-"));
  const reportPath = path.join(root, "smoke-test-report.json");

  const result = runScript([
    "--endpoint",
    "https://erp.example.invalid",
    "--backend-url",
    "https://deploy:secret@api.example.invalid",
    "--release-version",
    "20260629T1200-smoke",
    "--environment",
    "customer-trial",
    "--report",
    reportPath,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /--backend-url must not contain username or password/);
  assert.equal(fs.existsSync(reportPath), false);
});
