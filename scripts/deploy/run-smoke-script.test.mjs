import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/run-smoke.sh",
);
const credentialContract = JSON.parse(
  fs.readFileSync(
    path.join(
      repoRoot,
      "deployments/yoyoosun/env/credential.contract.json",
    ),
    "utf8",
  ),
);
const credentialArgs = [
  "--admin-username",
  credentialContract.credentials.admin.username,
  "--admin-password-env",
  credentialContract.credentials.admin.environmentVariable,
  "--demo-password-env",
  credentialContract.credentials.demo.environmentVariable,
  "--sms-phone-env",
  credentialContract.smsLoginIdentity.environmentVariable,
];
const credentialEnv = {
  [credentialContract.credentials.admin.environmentVariable]:
    "test-admin-password-unique",
  [credentialContract.credentials.demo.environmentVariable]:
    "test-demo-password-unique",
  [credentialContract.smsLoginIdentity.environmentVariable]: "13800138000",
};
const releaseSha = "a".repeat(40);

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
output_file=""
write_out=""
request_data=""
if [[ -n "\${FAKE_CURL_ARGV_OUT:-}" ]]; then
  printf '%s\n' "$*" >>"$FAKE_CURL_ARGV_OUT"
fi
if [[ -n "\${MANUAL_ACCEPTANCE_ADMIN_PASSWORD+x}" || -n "\${MANUAL_ACCEPTANCE_PASSWORD+x}" || -n "\${MANUAL_ACCEPTANCE_SMS_PHONE+x}" || -n "\${CUSTOMER_CONFIG_ADMIN_TOKEN+x}" ]]; then
  printf 'secret-env-leak\n' >>"\${FAKE_CURL_ARGV_OUT:-/dev/null}"
fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      output_file="\${2:-}"
      shift 2
      ;;
    -w)
      write_out="\${2:-}"
      shift 2
      ;;
    -d)
      request_data="\${2:-}"
      shift 2
      ;;
    --data-binary)
      request_data="\${2:-}"
      if [[ "$request_data" == @* ]]; then
        request_data="$(<"\${request_data#@}")"
      fi
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
case "$url" in
  */healthz|*/readyz|*/admin-login|*/m/warehouse/tasks)
    [[ -z "$write_out" ]] || printf '200'
    ;;
  */rpc/customer_config)
    response='{"jsonrpc":"2.0","id":"customer-config-smoke","result":{"code":0,"data":{"session":{"configRevision":"yoyoosun-customer-package-v7.runtime-manifest-v1","source":"active_customer_config_revision","pages":["global-dashboard"],"fieldPolicies":{"customers.default":{},"suppliers.default":{},"sales_orders.default":{}}}}}}'
    [[ -z "$output_file" ]] && printf '%s\n' "$response" || printf '%s\n' "$response" >"$output_file"
    ;;
  */rpc/auth)
    if [[ "$request_data" == *'"method":"admin_login"'* ]]; then
      username="$(printf '%s' "$request_data" | sed -E 's/.*"username":"([^"]+)".*/\\1/')"
      if [[ -n "\${FAKE_LOGIN_FAIL_USERNAME:-}" && "$username" == "$FAKE_LOGIN_FAIL_USERNAME" ]]; then
        response='{"jsonrpc":"2.0","id":"credential-login-smoke","result":{"code":401,"message":"login rejected"}}'
      else
        is_super_admin=false
        [[ "$username" != "admin" ]] || is_super_admin=true
        phone=""
        [[ "$username" != "admin" ]] || phone="\${FAKE_ADMIN_PHONE:-13800138000}"
        response_id="\${FAKE_LOGIN_RESPONSE_ID:-credential-login-smoke}"
        token_key="\${FAKE_LOGIN_TOKEN_KEY:-access_token}"
        response="$(printf '{\"jsonrpc\":\"2.0\",\"id\":\"%s\",\"result\":{\"code\":0,\"data\":{\"username\":\"%s\",\"phone\":\"%s\",\"is_super_admin\":%s,\"%s\":\"unique-token-%s\"}}}' "$response_id" "$username" "$phone" "$is_super_admin" "$token_key" "$username")"
      fi
      [[ -z "$output_file" ]] && printf '%s\n' "$response" || printf '%s\n' "$response" >"$output_file"
    else
      cat <<'JSON'
{"jsonrpc":"2.0","id":"auth-capabilities-smoke","result":{"code":0,"data":{"sms_login":{"enabled":true,"mode":"provider","mock_delivery":false,"disabled_reason":""}}}}
JSON
    fi
    ;;
  */templates/render-pdf)
    if [[ -n "\${FAKE_PDF_PAYLOAD_OUT:-}" ]]; then
      printf '%s' "$request_data" >"$FAKE_PDF_PAYLOAD_OUT"
    fi
    if [[ "\${FAKE_PDF_MODE:-ok}" == "ok" ]]; then
      [[ -z "$output_file" ]] || printf '%%PDF-1.4\nrelease-smoke\n%%%%EOF\n' >"$output_file"
      [[ -z "$write_out" ]] || printf '200|application/pdf'
    else
      [[ -z "$output_file" ]] || printf '<html>not a pdf</html>' >"$output_file"
      [[ -z "$write_out" ]] || printf '200|application/pdf'
    fi
    ;;
  *)
    [[ -z "$write_out" ]] || printf '404'
    ;;
esac
`,
    "utf8",
  );
  fs.chmodSync(curlPath, 0o755);
  return binDir;
}

test("run smoke help is runnable", () => {
  const result = runScript(["--help"]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /--release-version/);
  assert.match(result.stdout, /--environment/);
  assert.match(result.stdout, /--admin-password-env/);
  assert.match(result.stdout, /--demo-password-env/);
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
  assert(
    template.checks.includes(
      "customer-config-effective-session when --customer-config-revision is provided",
    ),
  );
  assert(
    template.checks.includes(
      "template-pdf-render when --customer-config-revision and an admin token are provided",
    ),
  );
  assert(
    template.checks.some((item) => item.startsWith("credential-login-matrix")),
  );
  assert(
    template.requiredReadbackEvidence.some((item) =>
      item.includes("totalAuthenticated=11"),
    ),
  );
  assert(
    template.requiredReadbackEvidence.includes(
      "target=jsonrpc:customer_config.get_effective_session",
    ),
  );
  assert(
    template.requiredReadbackEvidence.some((item) =>
      item.includes("HTTP 200 with application/pdf"),
    ),
  );
  assert.match(
    template.commands.join("\n"),
    /--customer-config-revision yoyoosun-customer-package-v7\.runtime-manifest-v1/,
  );
  assert.match(
    template.commands.join("\n"),
    /--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN/,
  );
  assert.match(template.boundary, /does not call endpoints/);
  assert.match(template.boundary, /does not .*write smoke-test-report\.json/);
  assert.match(template.boundary, /does not .*prove active revision readback/);
  assert.equal(fs.existsSync(reportPath), false);
});

test("run smoke writes release-gate compatible report", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-report-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const fakeCurlBin = createFakeCurlBin(root);
  const tempDir = path.join(root, "tmp");
  fs.mkdirSync(tempDir);
  const endpoint = "http://127.0.0.1:19090";
  const backendUrl = "http://127.0.0.1:18300";
  const pdfPayloadPath = path.join(root, "pdf-request.json");

  const result = await runScriptAsync(
    [
      "--endpoint",
      endpoint,
      "--backend-url",
      backendUrl,
      "--release-version",
      releaseSha,
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
      "--customer-config-revision",
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
      "--admin-token-env",
      "SMOKE_ADMIN_TOKEN",
      ...credentialArgs,
    ],
    {
      env: {
        PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
        SMOKE_ADMIN_TOKEN: "test-token",
        ...credentialEnv,
        FAKE_PDF_PAYLOAD_OUT: pdfPayloadPath,
        FAKE_CURL_ARGV_OUT: path.join(root, "curl-argv.txt"),
        TMPDIR: tempDir,
      },
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.customerCode, "yoyoosun");
  assert.equal(report.releaseVersion, releaseSha);
  assert.equal(report.environment, "customer-trial");
  assert.equal(report.operatorRole, "deployment-operator");
  assert.equal(report.endpointAlias, endpoint);
  assert.equal(report.backendEndpointAlias, backendUrl);
  assert.equal(report.summary.total, report.checks.length);
  assert.equal(report.summary.passed, report.checks.length);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.checks.length, 9);
  assert.ok(report.checks.some((check) => check.name === "server-healthz"));
  assert.ok(report.checks.some((check) => check.name === "server-readyz"));
  assert.ok(report.checks.some((check) => check.name === "mobile-role-route"));
  const authCheck = report.checks.find(
    (check) => check.name === "auth-sms-capabilities",
  );
  assert.equal(authCheck.target, "jsonrpc:auth.capabilities");
  assert.equal(authCheck.expectedMode, "provider");
  assert.equal(authCheck.enabled, true);
  assert.equal(authCheck.mode, "provider");
  assert.equal(authCheck.mockDelivery, false);
  assert.equal(authCheck.responseBodyStored, false);
  const credentialCheck = report.checks.find(
    (check) => check.name === "credential-login-matrix",
  );
  assert.equal(credentialCheck.target, "jsonrpc:auth.admin_login");
  assert.equal(credentialCheck.adminUsername, "admin");
  assert.equal(credentialCheck.adminAuthenticated, true);
  assert.equal(credentialCheck.adminSuperAdmin, true);
  assert.equal(credentialCheck.phoneConfigured, true);
  assert.equal(credentialCheck.phoneBound, true);
  assert.equal(credentialCheck.demoExpected, 10);
  assert.equal(credentialCheck.demoAuthenticated, 10);
  assert.equal(credentialCheck.totalExpected, 11);
  assert.equal(credentialCheck.totalAuthenticated, 11);
  assert.equal(credentialCheck.uniqueTokensObserved, true);
  assert.deepEqual(credentialCheck.usernames, [
    credentialContract.credentials.admin.username,
    ...credentialContract.credentials.demo.usernames,
  ]);
  assert.equal(
    credentialCheck.adminPasswordSource,
    "credential-contract",
  );
  assert.equal(
    credentialCheck.demoPasswordSource,
    "credential-contract",
  );
  assert.equal(credentialCheck.responseBodyStored, false);
  assert.match(credentialCheck.credentialContractSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    credentialCheck.smsPhoneSourceEnv,
    credentialContract.smsLoginIdentity.environmentVariable,
  );
  assert.equal(credentialCheck.adminAuthVersion, null);
  for (const check of report.checks) {
    assert.match(check.status, /^pass$/);
    if (check.target.startsWith("http://")) {
      assert.match(check.target, /^http:\/\/127\.0\.0\.1:/);
      assert.match(String(check.httpCode), /^(200|302|401|403)$/);
    }
  }
  const customerConfigCheck = report.checks.find(
    (check) => check.name === "customer-config-effective-session",
  );
  assert.equal(
    customerConfigCheck.target,
    "jsonrpc:customer_config.get_effective_session",
  );
  assert.equal(
    customerConfigCheck.expectedRevision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );
  assert.equal(customerConfigCheck.tokenSourceEnv, "SMOKE_ADMIN_TOKEN");
  assert.equal(customerConfigCheck.responseBodyStored, false);
  const pdfCheck = report.checks.find(
    (check) => check.name === "template-pdf-render",
  );
  assert.equal(pdfCheck.target, "/templates/render-pdf");
  assert.equal(pdfCheck.httpCode, "200");
  assert.equal(pdfCheck.contentType, "application/pdf");
  assert.match(pdfCheck.sha256, /^[a-f0-9]{64}$/);
  assert(pdfCheck.sizeBytes > 4);
  assert.equal(pdfCheck.tokenSourceEnv, "SMOKE_ADMIN_TOKEN");
  assert.equal(pdfCheck.responseBodyStored, false);
  const pdfPayload = JSON.parse(fs.readFileSync(pdfPayloadPath, "utf8"));
  assert.equal(pdfPayload.template_key, "material-purchase-contract");
  assert.equal(Object.hasOwn(pdfPayload, "customer_key"), false);
  assert.equal(Object.hasOwn(pdfPayload, "base_url"), false);
  assert.doesNotMatch(
    JSON.stringify(report),
    /test-token|test-admin-password|test-demo-password|13800138000|unique-token|access_token|%PDF|release-smoke/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "curl-argv.txt"), "utf8"),
    /test-token|test-admin-password|test-demo-password|13800138000|unique-token|secret-env-leak/,
  );
  assert.deepEqual(fs.readdirSync(tempDir), []);
  assert.equal(report.redaction.containsSecrets, false);
  assert.equal(report.redaction.containsRawCustomerRows, false);
});

test("run smoke fails authenticated release smoke for a non-PDF response", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-pdf-fail-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const tempDir = path.join(root, "tmp");
  fs.mkdirSync(tempDir);
  const fakeCurlBin = createFakeCurlBin(root);

  const result = await runScriptAsync(
    [
      "--endpoint",
      "http://127.0.0.1:19092",
      "--backend-url",
      "http://127.0.0.1:18302",
      "--release-version",
      releaseSha,
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
      "--customer-config-revision",
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
      "--admin-token-env",
      "SMOKE_ADMIN_TOKEN",
      ...credentialArgs,
    ],
    {
      env: {
        PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
        SMOKE_ADMIN_TOKEN: "test-token",
        ...credentialEnv,
        FAKE_PDF_MODE: "bad-signature",
        TMPDIR: tempDir,
      },
    },
  );

  assert.notEqual(result.status, 0);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const pdfCheck = report.checks.find(
    (check) => check.name === "template-pdf-render",
  );
  assert.equal(pdfCheck.status, "fail");
  assert.equal(pdfCheck.httpCode, "200");
  assert.equal(pdfCheck.contentType, "application/pdf");
  assert.equal(pdfCheck.sha256, "");
  assert.equal(pdfCheck.sizeBytes, 0);
  assert.equal(pdfCheck.responseBodyStored, false);
  assert.equal(report.summary.failed, 1);
  assert.doesNotMatch(JSON.stringify(report), /test-token|not a pdf/);
  assert.deepEqual(fs.readdirSync(tempDir), []);
});

test("run smoke fails when one contracted demo credential cannot log in", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-login-fail-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const fakeCurlBin = createFakeCurlBin(root);

  const result = await runScriptAsync(
    [
      "--endpoint",
      "http://127.0.0.1:19093",
      "--backend-url",
      "http://127.0.0.1:18303",
      "--release-version",
      releaseSha,
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
      ...credentialArgs,
    ],
    {
      env: {
        PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
        ...credentialEnv,
        FAKE_LOGIN_FAIL_USERNAME: "demo_quality",
      },
    },
  );

  assert.notEqual(result.status, 0);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const credentialCheck = report.checks.find(
    (check) => check.name === "credential-login-matrix",
  );
  assert.equal(credentialCheck.status, "fail");
  assert.equal(credentialCheck.adminAuthenticated, true);
  assert.equal(credentialCheck.phoneBound, true);
  assert.equal(credentialCheck.demoAuthenticated, 9);
  assert.equal(credentialCheck.totalAuthenticated, 10);
  assert.equal(credentialCheck.uniqueTokensObserved, false);
  assert.equal(credentialCheck.responseBodyStored, false);
  assert.equal(report.summary.failed, 1);
  assert.doesNotMatch(
    JSON.stringify(report),
    /test-admin-password|test-demo-password|fresh-token|access_token|login rejected/,
  );
});

for (const [name, fakeEnv, authenticated] of [
  ["mismatched admin phone", { FAKE_ADMIN_PHONE: "13900139000" }, 10],
  ["mismatched JSON-RPC id", { FAKE_LOGIN_RESPONSE_ID: "wrong-id" }, 0],
  ["legacy token alias", { FAKE_LOGIN_TOKEN_KEY: "token" }, 0],
]) {
  test(`run smoke rejects ${name} without storing raw login response`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-login-contract-"));
    const reportPath = path.join(root, "smoke-test-report.json");
    const fakeCurlBin = createFakeCurlBin(root);
    const result = await runScriptAsync(
      [
        "--endpoint",
        "http://127.0.0.1:19095",
        "--backend-url",
        "http://127.0.0.1:18305",
        "--release-version",
        releaseSha,
        "--environment",
        "customer-trial",
        "--report",
        reportPath,
        ...credentialArgs,
      ],
      {
        env: {
          PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
          ...credentialEnv,
          ...fakeEnv,
        },
      },
    );
    assert.notEqual(result.status, 0);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const check = report.checks.find(
      (candidate) => candidate.name === "credential-login-matrix",
    );
    assert.equal(check.status, "fail");
    assert.equal(check.adminAuthenticated, false);
    assert.equal(check.phoneBound, false);
    assert.equal(check.totalAuthenticated, authenticated);
    assert.equal(check.uniqueTokensObserved, false);
    assert.doesNotMatch(
      JSON.stringify(report),
      /13800138000|13900139000|unique-token|access_token|"token"/,
    );
  });
}

test("run smoke ignores conflicting password env and uses the registered contract credentials", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-smoke-same-password-"));
  const reportPath = path.join(root, "smoke-test-report.json");
  const fakeCurlBin = createFakeCurlBin(root);
  const sharedPassword = "same-password-is-not-allowed";

  const result = await runScriptAsync(
    [
      "--endpoint",
      "http://127.0.0.1:19094",
      "--backend-url",
      "http://127.0.0.1:18304",
      "--release-version",
      releaseSha,
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
      ...credentialArgs,
    ],
    {
      env: {
        PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
        [credentialContract.credentials.admin.environmentVariable]:
          sharedPassword,
        [credentialContract.credentials.demo.environmentVariable]:
          sharedPassword,
      },
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const check = report.checks.find((item) => item.name === "credential-login-matrix");
  assert.equal(check.status, "pass");
  assert.equal(check.phoneConfigured, false);
  assert.equal(check.phoneBound, false);
  assert.equal(check.adminPasswordSource, "credential-contract");
  assert.equal(check.demoPasswordSource, "credential-contract");
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
      releaseSha,
      "--environment",
      "customer-trial",
      "--report",
      reportPath,
    ],
    { env: { PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}` } },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.endpointAlias, endpoint);
  assert.equal(report.backendEndpointAlias, undefined);
  assert.equal(report.checks.length, 4);
  assert.deepEqual(
    report.checks.map((check) => check.name),
    [
      "web-healthz",
      "login-page",
      "mobile-role-route",
      "auth-sms-capabilities",
    ],
  );
  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.passed, 4);
  assert.equal(report.summary.failed, 0);
});

test("run smoke rejects credentialed endpoint URL before writing report", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "run-smoke-credentialed-endpoint-"),
  );
  const reportPath = path.join(root, "smoke-test-report.json");

  const result = runScript([
    "--endpoint",
    "https://deploy:secret@erp.example.invalid",
    "--release-version",
    releaseSha,
    "--environment",
    "customer-trial",
    "--report",
    reportPath,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stdout + result.stderr,
    /--endpoint must not contain username or password/,
  );
  assert.equal(fs.existsSync(reportPath), false);
});

test("run smoke rejects credentialed backend URL before writing report", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "run-smoke-credentialed-backend-"),
  );
  const reportPath = path.join(root, "smoke-test-report.json");

  const result = runScript([
    "--endpoint",
    "https://erp.example.invalid",
    "--backend-url",
    "https://deploy:secret@api.example.invalid",
    "--release-version",
    releaseSha,
    "--environment",
    "customer-trial",
    "--report",
    reportPath,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stdout + result.stderr,
    /--backend-url must not contain username or password/,
  );
  assert.equal(fs.existsSync(reportPath), false);
});
