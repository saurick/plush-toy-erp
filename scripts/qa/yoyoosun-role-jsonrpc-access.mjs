#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_REPORT_PATH = path.resolve(
  REPO_ROOT,
  "output/qa/yoyoosun-role-jsonrpc-access/report.json",
);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const PERMISSION_DENIED_CODE = 40304;

const workflowReadProbe = Object.freeze({
  domain: "workflow",
  method: "list_tasks",
  params: Object.freeze({ limit: 1, offset: 0 }),
  totalField: "total",
});
const deniedWorkflowCreateProbe = Object.freeze({
  domain: "workflow",
  method: "create_task",
  params: Object.freeze({}),
  safety:
    "permission is checked before required task fields; an unexpected grant reaches invalid-param without creating a task",
});

export const YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX = Object.freeze([
  Object.freeze({
    roleKey: "boss",
    username: "demo_boss",
    read: workflowReadProbe,
    deniedMutation: deniedWorkflowCreateProbe,
  }),
  Object.freeze({
    roleKey: "sales",
    username: "demo_sales",
    read: Object.freeze({
      domain: "production_order",
      method: "list_production_orders",
      params: Object.freeze({ limit: 1, offset: 0 }),
      totalField: "total",
    }),
    deniedMutation: Object.freeze({
      domain: "production_order",
      method: "create_production_order",
      params: Object.freeze({}),
      safety:
        "an unexpected grant reaches required draft validation without creating an order",
    }),
  }),
  Object.freeze({
    roleKey: "purchase",
    username: "demo_purchase",
    read: Object.freeze({
      domain: "purchase_order",
      method: "list_purchase_orders",
      params: Object.freeze({ limit: 1, offset: 0 }),
      totalField: "total",
    }),
    deniedMutation: Object.freeze({
      domain: "purchase_order",
      method: "approve_purchase_order",
      params: Object.freeze({ id: 0 }),
      safety:
        "an unexpected grant targets no positive purchase-order id and cannot approve a record",
    }),
  }),
  Object.freeze({
    roleKey: "production",
    username: "demo_production",
    read: workflowReadProbe,
    deniedMutation: deniedWorkflowCreateProbe,
  }),
  Object.freeze({
    roleKey: "warehouse",
    username: "demo_warehouse",
    read: workflowReadProbe,
    deniedMutation: deniedWorkflowCreateProbe,
  }),
  Object.freeze({
    roleKey: "quality",
    username: "demo_quality",
    read: workflowReadProbe,
    deniedMutation: deniedWorkflowCreateProbe,
  }),
  Object.freeze({
    roleKey: "finance",
    username: "demo_finance",
    read: workflowReadProbe,
    deniedMutation: deniedWorkflowCreateProbe,
  }),
  Object.freeze({
    roleKey: "pmc",
    username: "demo_pmc",
    read: Object.freeze({
      domain: "operational_fact",
      method: "list_production_facts",
      params: Object.freeze({ limit: 1, offset: 0 }),
      totalField: "total",
    }),
    deniedMutation: Object.freeze({
      domain: "operational_fact",
      method: "create_production_material_issue_from_order",
      params: Object.freeze({}),
      safety:
        "permission is checked before source and quantity fields; an unexpected grant reaches invalid-param without creating a fact",
    }),
  }),
  Object.freeze({
    roleKey: "engineering",
    username: "demo_engineering",
    read: workflowReadProbe,
    deniedMutation: deniedWorkflowCreateProbe,
  }),
]);

class AccessAuditError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "AccessAuditError";
    this.exitCode = exitCode;
  }
}

export function normalizeRoleAccessBackendURL(value = DEFAULT_BACKEND_URL) {
  let url;
  try {
    url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  } catch {
    throw new AccessAuditError("backend URL is invalid", 2);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new AccessAuditError(
      `role access audit only accepts a local backend: ${url.origin}`,
      2,
    );
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new AccessAuditError("backend URL must use http or https", 2);
  }
  if (url.username || url.password) {
    throw new AccessAuditError("backend URL must not contain credentials", 2);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new AccessAuditError(
      "backend URL must be an origin without path, query, or hash",
      2,
    );
  }
  return url.origin;
}

export function buildYoyoosunRoleJSONRPCAccessPlan({
  backendURL = DEFAULT_BACKEND_URL,
} = {}) {
  return {
    scope: "yoyoosun-role-jsonrpc-access-plan",
    customerKey: "yoyoosun",
    backendURL: normalizeRoleAccessBackendURL(backendURL),
    accountCount: YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX.length,
    expectedPermissionDeniedCode: PERMISSION_DENIED_CODE,
    callsRealLogin: true,
    callsReadRPC: true,
    callsDeniedMutationRPC: true,
    expectedBusinessWrites: 0,
    authenticationSessionWritesExpected: true,
    storesPassword: false,
    storesAccessToken: false,
    accounts: YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX.map((entry) => ({
      roleKey: entry.roleKey,
      username: entry.username,
      read: { ...entry.read, params: { ...entry.read.params } },
      deniedMutation: {
        ...entry.deniedMutation,
        params: { ...entry.deniedMutation.params },
      },
    })),
    boundary:
      "Each account performs one authorized read, one permission-denied mutation probe, and the same read again. The before/after total must stay equal. Login/session lifecycle writes are not business writes.",
  };
}

let requestSequence = 0;

async function rpcCall({
  backendURL,
  domain,
  method,
  params = {},
  token = "",
  fetchImpl = fetch,
}) {
  const targetURL = new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
  const response = await fetchImpl(targetURL, {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `yoyoosun-role-access-${++requestSequence}`,
      method,
      params,
    }),
  });
  if (!response?.ok) {
    throw new AccessAuditError(
      `${domain}.${method} HTTP ${response?.status ?? "unknown"}`,
    );
  }
  const payload = await response.json();
  const result = payload?.result;
  if (!result || !Number.isSafeInteger(Number(result.code))) {
    throw new AccessAuditError(
      `${domain}.${method} returned malformed JSON-RPC`,
    );
  }
  return result;
}

function requireSuccessfulRead(result, entry, phase) {
  if (Number(result.code) !== 0) {
    throw new AccessAuditError(
      `${entry.username} ${phase} read ${entry.read.domain}.${entry.read.method} code=${result.code} message=${result.message || "unknown"}`,
    );
  }
  const total = Number(result.data?.[entry.read.totalField]);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new AccessAuditError(
      `${entry.username} ${phase} read missing non-negative ${entry.read.totalField}`,
    );
  }
  return total;
}

function loginRoleKeys(data) {
  return Array.isArray(data?.roles)
    ? data.roles
        .map((role) => String(role?.role_key || "").trim())
        .filter(Boolean)
    : [];
}

async function loginAccount({ backendURL, entry, password, fetchImpl }) {
  const result = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username: entry.username, password },
    fetchImpl,
  });
  if (Number(result.code) !== 0) {
    throw new AccessAuditError(
      `${entry.username} login code=${result.code} message=${result.message || "unknown"}`,
    );
  }
  const data = result.data || {};
  if (data.username !== entry.username) {
    throw new AccessAuditError(
      `${entry.username} login returned another account`,
    );
  }
  if (data.is_super_admin === true) {
    throw new AccessAuditError(`${entry.username} must not be super admin`);
  }
  if (!loginRoleKeys(data).includes(entry.roleKey)) {
    throw new AccessAuditError(
      `${entry.username} login does not contain role ${entry.roleKey}`,
    );
  }
  const token = String(data.access_token || "").trim();
  if (!token) {
    throw new AccessAuditError(`${entry.username} login missing access token`);
  }
  return token;
}

export async function runYoyoosunRoleJSONRPCAccessAudit({
  backendURL = DEFAULT_BACKEND_URL,
  password,
  fetchImpl = fetch,
} = {}) {
  const resolvedBackendURL = normalizeRoleAccessBackendURL(backendURL);
  const resolvedPassword = String(
    password ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD ||
      "",
  ).trim();
  if (!resolvedPassword) {
    throw new AccessAuditError(
      "TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD is required",
      2,
    );
  }

  const accounts = [];
  for (const entry of YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX) {
    const token = await loginAccount({
      backendURL: resolvedBackendURL,
      entry,
      password: resolvedPassword,
      fetchImpl,
    });
    const beforeResult = await rpcCall({
      backendURL: resolvedBackendURL,
      ...entry.read,
      token,
      fetchImpl,
    });
    const beforeTotal = requireSuccessfulRead(beforeResult, entry, "before");
    const deniedResult = await rpcCall({
      backendURL: resolvedBackendURL,
      ...entry.deniedMutation,
      token,
      fetchImpl,
    });
    assert.equal(
      Number(deniedResult.code),
      PERMISSION_DENIED_CODE,
      `${entry.username} ${entry.deniedMutation.domain}.${entry.deniedMutation.method} must be permission denied`,
    );
    const afterResult = await rpcCall({
      backendURL: resolvedBackendURL,
      ...entry.read,
      token,
      fetchImpl,
    });
    const afterTotal = requireSuccessfulRead(afterResult, entry, "after");
    assert.equal(
      afterTotal,
      beforeTotal,
      `${entry.username} denied mutation changed ${entry.read.domain}.${entry.read.method} total`,
    );
    accounts.push({
      roleKey: entry.roleKey,
      username: entry.username,
      authorizedRead: `${entry.read.domain}.${entry.read.method}`,
      deniedMutation: `${entry.deniedMutation.domain}.${entry.deniedMutation.method}`,
      permissionDeniedCode: Number(deniedResult.code),
      beforeTotal,
      afterTotal,
      businessWriteObserved: false,
    });
  }

  return {
    scope: "yoyoosun-role-jsonrpc-access-report",
    generatedAt: new Date().toISOString(),
    customerKey: "yoyoosun",
    backendURL: resolvedBackendURL,
    accountCount: accounts.length,
    expectedBusinessWrites: 0,
    authenticationSessionWritesExpected: true,
    storesPassword: false,
    storesAccessToken: false,
    accounts,
    passed: accounts.length === YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX.length,
  };
}

function parseArgs(argv) {
  const options = {
    backendURL: DEFAULT_BACKEND_URL,
    reportPath: DEFAULT_REPORT_PATH,
    printPlan: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--print-plan") {
      options.printPlan = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new AccessAuditError(`${token} requires a value`, 2);
    }
    index += 1;
    if (token === "--backend-url") {
      options.backendURL = value;
      continue;
    }
    if (token === "--report") {
      const resolved = path.resolve(REPO_ROOT, value);
      const root = path.resolve(REPO_ROOT, "output/qa");
      const relative = path.relative(root, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new AccessAuditError("--report must stay under output/qa", 2);
      }
      options.reportPath = resolved;
      continue;
    }
    throw new AccessAuditError(`unsupported argument: ${token}`, 2);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.printPlan) {
    process.stdout.write(
      `${JSON.stringify(
        buildYoyoosunRoleJSONRPCAccessPlan({
          backendURL: options.backendURL,
        }),
        null,
        2,
      )}\n`,
    );
    return;
  }
  const report = await runYoyoosunRoleJSONRPCAccessAudit({
    backendURL: options.backendURL,
  });
  await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
  await fs.writeFile(
    options.reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(
    `[yoyoosun-role-jsonrpc-access] passed accounts=${report.accountCount} report=${path.relative(REPO_ROOT, options.reportPath)}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[yoyoosun-role-jsonrpc-access][fatal] ${error?.stack || error}\n`,
    );
    process.exitCode = error?.exitCode || 1;
  });
}
