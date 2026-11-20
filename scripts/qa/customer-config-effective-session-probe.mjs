#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const defaultBackendURL = "http://127.0.0.1:8300";
const defaultCustomer = "yoyoosun";
const rpcPath = "/rpc/customer_config";

const usage = `用法:
  node scripts/qa/customer-config-effective-session-probe.mjs --json
  node scripts/qa/customer-config-effective-session-probe.mjs --json --report output/customers/yoyoosun/customer-config-effective-session-probe/current.json

选项:
  --backend-url <url>  后端地址，默认 ${defaultBackendURL}
  --customer <key>     客户 key，默认 ${defaultCustomer}
  --json               输出 JSON
  --report <path>      写本地 no-write 报告；不得写入 deployments/**

边界:
  该探针只做无 Authorization 的 get_effective_session 只读请求，用来确认后端可达和未登录 / 缺真实凭据边界。
  它不读取 token、不登录、不调用 publish / activate / rollback、不写数据库、不证明 active revision 已读回。`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseArgs(argv) {
  const options = {
    backendURL: process.env.CUSTOMER_CONFIG_PROBE_BACKEND_URL || defaultBackendURL,
    customer: process.env.CUSTOMER_CONFIG_PROBE_CUSTOMER || defaultCustomer,
    json: false,
    report: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--backend-url") {
      options.backendURL = next || "";
      index += 1;
      continue;
    }
    if (arg === "--customer") {
      options.customer = next || "";
      index += 1;
      continue;
    }
    if (arg === "--report") {
      options.report = next || "";
      index += 1;
      continue;
    }
    throw new CliError(`Unknown argument: ${arg}`, 2);
  }

  options.backendURL = normalizeBackendURL(options.backendURL);
  options.customer = normalizeCustomerKey(options.customer);
  if (options.report) {
    options.report = resolveReportPath(options.report);
  }
  return options;
}

export function normalizeBackendURL(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    throw new CliError("backend URL is required", 2);
  }
  const url = new URL(value);
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain username or password", 2);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeCustomerKey(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(value)) {
    throw new CliError("customer key must use lowercase letters, numbers, _ or -", 2);
  }
  return value;
}

function resolveReportPath(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    throw new CliError("report path is required", 2);
  }
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new CliError("report path must stay inside the repository", 2);
  }
  const deploymentsRoot = path.resolve(repoRoot, "deployments");
  if (resolved === deploymentsRoot || resolved.startsWith(`${deploymentsRoot}${path.sep}`)) {
    throw new CliError("report path must not be inside deployments evidence", 2);
  }
  return resolved;
}

function healthURLFor(backendURL) {
  return new URL("/healthz", `${backendURL}/`).toString();
}

function rpcURLFor(backendURL) {
  return new URL(rpcPath, `${backendURL}/`).toString();
}

async function fetchHealth(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(2500),
    });
    return {
      url,
      ok: response.ok,
      status: response.status,
      error: "",
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      error: error.message,
    };
  }
}

async function probeEffectiveSession({ backendURL, customer, fetchImpl }) {
  const url = rpcURLFor(backendURL);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `customer-config-effective-session-probe-${Date.now()}`,
        method: "get_effective_session",
        params: { customer_key: customer },
      }),
      signal: AbortSignal.timeout(2500),
    });
    const json = await response.json().catch(() => ({}));
    const result = json?.result || {};
    const session = result?.data?.session || result?.data || {};
    const resultCode = Number(result?.code ?? -1);
    const authenticated = resultCode === 0;
    const unauthenticated =
      resultCode === 40302 || String(result?.message || "").includes("未登录");

    return {
      url,
      method: "get_effective_session",
      httpStatus: response.status,
      resultCode,
      message: String(result?.message || ""),
      status: authenticated
        ? "unexpected_authenticated_without_authorization_header"
        : unauthenticated
          ? "auth_required"
          : "not_verified",
      authenticated,
      unauthenticated,
      source: session?.source || "",
      configRevision: session?.configRevision || session?.config_revision || "",
      pageCount: Array.isArray(session?.pages) ? session.pages.length : 0,
      fieldPolicySurfaceCount:
        session?.fieldPolicies && typeof session.fieldPolicies === "object"
          ? Object.keys(session.fieldPolicies).length
          : 0,
    };
  } catch (error) {
    return {
      url,
      method: "get_effective_session",
      httpStatus: 0,
      resultCode: null,
      message: error.message,
      status: "request_failed",
      authenticated: false,
      unauthenticated: false,
      source: "",
      configRevision: "",
      pageCount: 0,
      fieldPolicySurfaceCount: 0,
    };
  }
}

export async function buildEffectiveSessionProbeReport(options, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const backendURL = normalizeBackendURL(options?.backendURL || defaultBackendURL);
  const customer = normalizeCustomerKey(options?.customer || defaultCustomer);
  const health = await fetchHealth(healthURLFor(backendURL), fetchImpl);
  const effectiveSessionProbe = await probeEffectiveSession({
    backendURL,
    customer,
    fetchImpl,
  });
  const blockers = [];
  if (!health.ok) {
    blockers.push("backend-health-not-ok");
  }
  if (effectiveSessionProbe.unauthenticated) {
    blockers.push("missing-authenticated-admin-session");
  } else if (!effectiveSessionProbe.authenticated) {
    blockers.push("effective-session-readback-not-verified");
  } else {
    blockers.push("unexpected-no-auth-effective-session-success");
  }

  return {
    scope: "customer-config-effective-session-local-probe",
    generatedAt: new Date().toISOString(),
    customer,
    backendURLAlias: backendURL,
    readOnly: true,
    writesDatabase: false,
    writesReport: Boolean(options?.report),
    callsJSONRPC: true,
    usesAuthorizationHeader: false,
    readsSecrets: false,
    health,
    effectiveSessionProbe,
    activeRevisionVerified: false,
    expectedUnauthenticatedBoundary: effectiveSessionProbe.unauthenticated,
    blockers,
    notProvenByThisProbe: [
      "real admin login",
      "backend RBAC authorization",
      "active customer config revision source",
      "ordinary account menu projection",
      "desktop browser effective session diagnostic",
      "mobile task entry access",
      "target environment release evidence",
    ],
    nextCommand:
      "Provide a real local demo password/token through the existing trial-account-rbac, trialDemoAccountBrowserSmoke, mobileWorkflowRuntimeBrowserSmoke, or customer-config-release-execute flows; do not treat this no-auth probe as active revision proof.",
  };
}

async function writeJSONReport(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

function printTextReport(report) {
  const lines = [
    `[customer-config-effective-session-probe] backend=${report.backendURLAlias}`,
    `[customer-config-effective-session-probe] health=${report.health.ok ? "ok" : "not-ok"} status=${report.health.status}`,
    `[customer-config-effective-session-probe] get_effective_session=${report.effectiveSessionProbe.status} code=${report.effectiveSessionProbe.resultCode ?? "-"}`,
    `[customer-config-effective-session-probe] activeRevisionVerified=${report.activeRevisionVerified}`,
    `[customer-config-effective-session-probe] blockers=${report.blockers.join(",") || "-"}`,
    `[customer-config-effective-session-probe] next=${report.nextCommand}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] || "").href;

if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    }
    const report = await buildEffectiveSessionProbeReport(options);
    if (options.report) {
      await writeJSONReport(options.report, report);
      process.stderr.write(
        `[customer-config-effective-session-probe] report written: ${path.relative(
          repoRoot,
          options.report,
        )}\n`,
      );
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printTextReport(report);
    }
  } catch (error) {
    process.stderr.write(`[customer-config-effective-session-probe] ${error.message}\n`);
    process.exit(error.exitCode || 1);
  }
}
