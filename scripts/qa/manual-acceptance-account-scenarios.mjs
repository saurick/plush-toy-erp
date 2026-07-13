#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const CUSTOMER_KEY = "yoyoosun";
const BUSINESS_ADMIN_USERNAME = "demo_admin";
const GUARD_ADMIN_USERNAME = "admin";
const CONFIRM_PHRASE = "APPLY_SIMULATED_ACCOUNT_SCENARIOS";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SAFE_ENVIRONMENTS = new Set(["local", "dev"]);
const MANAGED_ROLE_KEYS = new Set(["sales", "purchase"]);

export const FORMAL_DEMO_ACCOUNTS = Object.freeze([
  "demo_boss",
  "demo_sales",
  "demo_purchase",
  "demo_production",
  "demo_warehouse",
  "demo_quality",
  "demo_finance",
  "demo_pmc",
  "demo_engineering",
  "demo_admin",
]);

export const MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS = Object.freeze([
  Object.freeze({
    key: "disabled-account",
    username: "demo_uat_disabled",
    title: "已停用账号",
    instruction: "核对停用后的账号不能进入系统，已有业务资料仍然保留。",
    roleKeys: Object.freeze(["sales"]),
    positions: Object.freeze(["业务"]),
    disabled: true,
  }),
  Object.freeze({
    key: "multi-position-account",
    username: "demo_uat_sales_purchase",
    title: "业务与采购兼任账号",
    instruction: "核对兼任人员登录后可以看到业务和采购两类入口。",
    roleKeys: Object.freeze(["sales", "purchase"]),
    positions: Object.freeze(["业务", "采购"]),
    disabled: false,
  }),
  Object.freeze({
    key: "no-business-entry-account",
    username: "demo_uat_no_entry",
    title: "未分配岗位账号",
    instruction: "核对尚未分配岗位的人员登录后不显示业务入口。",
    roleKeys: Object.freeze([]),
    positions: Object.freeze([]),
    disabled: false,
  }),
]);

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function requiredText(value, name) {
  const text = optionalText(value);
  if (!text) throw new CliError(`${name} is required`);
  return text;
}

export function normalizeAccountScenarioBackendURL(value) {
  let url;
  try {
    url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  } catch {
    throw new CliError("backend URL is invalid", 2);
  }
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain credentials", 2);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new CliError("backend URL must use http or https", 2);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new CliError(
      `refuse account scenario writes outside this computer: ${url.origin}`,
      2,
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

function normalizeRoleKeys(roles, context) {
  if (!Array.isArray(roles)) {
    throw new CliError(`${context} response missing roles`);
  }
  const keys = roles.map((role, index) => {
    if (!role || typeof role !== "object" || Array.isArray(role)) {
      throw new CliError(`${context} roles[${index}] is malformed`);
    }
    return requiredText(role.role_key, `${context} roles[${index}].role_key`);
  });
  return [...new Set(keys)].sort();
}

export function requireAdminAccountRecord(value, context = "admin") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError(`${context} response missing admin account`);
  }
  const id = Number(value.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new CliError(`${context} response missing admin id`);
  }
  const username = requiredText(value.username, `${context}.username`);
  if (typeof value.disabled !== "boolean") {
    throw new CliError(`${context} response missing disabled status`);
  }
  if (typeof value.is_super_admin !== "boolean") {
    throw new CliError(`${context} response missing super-admin status`);
  }
  return {
    id,
    username,
    phone: String(value.phone ?? "").trim(),
    disabled: value.disabled,
    isSuperAdmin: value.is_super_admin,
    roleKeys: normalizeRoleKeys(value.roles, context),
  };
}

function sameStringList(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function scenarioRoleKeys(scenario) {
  return [...scenario.roleKeys].sort();
}

function assertOwnedScenarioAccount(account, scenario) {
  if (account.username !== scenario.username) {
    throw new CliError(
      `${scenario.title}: returned username does not match the requested account`,
    );
  }
  if (account.isSuperAdmin || account.phone) {
    throw new CliError(
      `${scenario.title}: same-name account cannot be safely identified as a simulated acceptance account`,
    );
  }
  const unmanagedRole = account.roleKeys.find(
    (roleKey) => !MANAGED_ROLE_KEYS.has(roleKey),
  );
  if (unmanagedRole) {
    throw new CliError(
      `${scenario.title}: same-name account has an unrelated position and will not be changed`,
    );
  }
}

function assertScenarioState(account, scenario) {
  assertOwnedScenarioAccount(account, scenario);
  const expectedRoleKeys = scenarioRoleKeys(scenario);
  if (!sameStringList(account.roleKeys, expectedRoleKeys)) {
    throw new CliError(
      `${scenario.title}: returned positions were not updated`,
    );
  }
  if (account.disabled !== scenario.disabled) {
    throw new CliError(
      `${scenario.title}: returned account status was not updated`,
    );
  }
}

function assertPasswordResetAccount(account, beforeReset, scenario) {
  assertScenarioState(account, scenario);
  if (account.id !== beforeReset.id) {
    throw new CliError(
      `${scenario.title}: password reset returned another account`,
    );
  }
}

function accountSnapshot(account) {
  return {
    id: account.id,
    username: account.username,
    disabled: account.disabled,
    isSuperAdmin: account.isSuperAdmin,
    roleKeys: account.roleKeys,
  };
}

function buildFormalAccountSnapshots(accounts) {
  const byUsername = new Map(
    accounts.map((account) => [account.username, account]),
  );
  return FORMAL_DEMO_ACCOUNTS.map((username) => {
    const account = byUsername.get(username);
    if (!account) {
      throw new CliError(
        `required formal demo account is missing: ${username}`,
      );
    }
    return accountSnapshot(account);
  });
}

function assertFormalAccountsUnchanged(before, afterAccounts) {
  const afterByUsername = new Map(
    afterAccounts.map((account) => [
      account.username,
      accountSnapshot(account),
    ]),
  );
  for (const snapshot of before) {
    const after = afterByUsername.get(snapshot.username);
    if (!after || JSON.stringify(after) !== JSON.stringify(snapshot)) {
      throw new CliError(
        `formal demo account changed while preparing acceptance scenarios: ${snapshot.username}`,
      );
    }
  }
}

export function buildManualAcceptanceAccountScenarioPlan({
  backendURL = DEFAULT_BACKEND_URL,
} = {}) {
  return {
    mode: "report-only",
    backendURL: normalizeAccountScenarioBackendURL(backendURL),
    loginAccount: BUSINESS_ADMIN_USERNAME,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    protectedAccounts: [...FORMAL_DEMO_ACCOUNTS],
    scenarios: MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.map((scenario) => ({
      key: scenario.key,
      username: scenario.username,
      title: scenario.title,
      instruction: scenario.instruction,
      positions: [...scenario.positions],
      roleKeys: [...scenario.roleKeys],
      disabled: scenario.disabled,
    })),
  };
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

let requestSequence = 0;

async function rpcCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl = fetch,
}) {
  const targetURL = rpcURL(backendURL, domain);
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
      id: `manual-acceptance-accounts-${++requestSequence}`,
      method,
      params:
        domain === "customer_config"
          ? { customer_key: CUSTOMER_KEY, ...params }
          : params,
    }),
  });
  if (response?.redirected) {
    throw new CliError(`${domain}.${method} refused redirected response`);
  }
  if (response?.url) {
    const expected = new URL(targetURL);
    const actual = new URL(response.url);
    if (
      actual.origin !== expected.origin ||
      actual.pathname !== expected.pathname
    ) {
      throw new CliError(
        `${domain}.${method} response came from an unexpected URL`,
      );
    }
  }
  if (!response?.ok) {
    throw new CliError(
      `${domain}.${method} HTTP ${response?.status ?? "unknown"}`,
    );
  }
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code ?? "unknown"} message=${json?.result?.message ?? "unknown"}`,
    );
  }
  return json.result.data || {};
}

async function loginAdmin({
  backendURL,
  username,
  password,
  requireSuperAdmin = false,
  fetchImpl,
}) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  const profile = requireAdminAccountRecord(data, `${username} login`);
  if (profile.username !== username) {
    throw new CliError(`${username} login returned another account`);
  }
  if (requireSuperAdmin && !profile.isSuperAdmin) {
    throw new CliError(`${username} must be the local super admin`);
  }
  const token = optionalText(data.access_token || data.token);
  if (!token) throw new CliError(`${username} login response missing token`);
  return { token, profile };
}

async function assertSafeRuntime({
  backendURL,
  guardToken,
  sessionToken,
  fetchImpl,
}) {
  const capabilities = await rpcCall({
    backendURL,
    domain: "debug",
    method: "capabilities",
    token: guardToken,
    fetchImpl,
  });
  const environment = String(capabilities.environment || "")
    .trim()
    .toLowerCase();
  if (!SAFE_ENVIRONMENTS.has(environment)) {
    throw new CliError(
      `refuse account scenario writes in environment=${environment || "unknown"}`,
    );
  }
  const sessionData = await rpcCall({
    backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: sessionToken,
    fetchImpl,
  });
  const session = sessionData.session || {};
  const revision = optionalText(
    session.configRevision || session.config_revision,
  );
  if (
    session?.customer?.key !== CUSTOMER_KEY ||
    session.source !== "active_customer_config_revision" ||
    !revision
  ) {
    throw new CliError(
      "refuse account scenario writes: active yoyoosun configuration revision is unavailable",
    );
  }
  return {
    environment,
    customerKey: CUSTOMER_KEY,
    source: session.source,
    configRevision: revision,
  };
}

async function listAdmins({ backendURL, token, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "admin",
    method: "list",
    token,
    fetchImpl,
  });
  if (!Array.isArray(data.admins)) {
    throw new CliError("admin.list response missing admins");
  }
  return data.admins.map((admin, index) =>
    requireAdminAccountRecord(admin, `admin.list admins[${index}]`),
  );
}

async function mutateAdmin({
  backendURL,
  token,
  fetchImpl,
  method,
  params,
  context,
}) {
  const data = await rpcCall({
    backendURL,
    domain: "admin",
    method,
    params,
    token,
    fetchImpl,
  });
  return requireAdminAccountRecord(data.admin, context);
}

export async function applyManualAcceptanceAccountScenarios(
  plan,
  { password, adminPassword, fetchImpl = fetch } = {},
) {
  const safePlan = buildManualAcceptanceAccountScenarioPlan({
    backendURL: plan?.backendURL,
  });
  if (process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(
      `apply requires MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=${CONFIRM_PHRASE}`,
      2,
    );
  }
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  if (effectivePassword.length < 6) {
    throw new CliError(
      "account password must contain at least 6 characters",
      2,
    );
  }
  const effectiveAdminPassword = requiredText(
    adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );

  const { token: guardToken } = await loginAdmin({
    backendURL: safePlan.backendURL,
    username: GUARD_ADMIN_USERNAME,
    password: effectiveAdminPassword,
    requireSuperAdmin: true,
    fetchImpl,
  });
  const { token, profile } = await loginAdmin({
    backendURL: safePlan.backendURL,
    username: BUSINESS_ADMIN_USERNAME,
    password: effectivePassword,
    fetchImpl,
  });
  const runtime = await assertSafeRuntime({
    backendURL: safePlan.backendURL,
    guardToken,
    sessionToken: token,
    fetchImpl,
  });
  const beforeAccounts = await listAdmins({
    backendURL: safePlan.backendURL,
    token,
    fetchImpl,
  });
  const formalBefore = buildFormalAccountSnapshots(beforeAccounts);
  const beforeByUsername = new Map(
    beforeAccounts.map((account) => [account.username, account]),
  );

  for (const scenario of MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS) {
    const existing = beforeByUsername.get(scenario.username);
    if (existing) assertOwnedScenarioAccount(existing, scenario);
  }

  const actions = [];
  for (const scenario of MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS) {
    const expectedRoleKeys = scenarioRoleKeys(scenario);
    let account = beforeByUsername.get(scenario.username);
    let created = false;
    if (!account) {
      account = await mutateAdmin({
        backendURL: safePlan.backendURL,
        token,
        fetchImpl,
        method: "create",
        params: {
          username: scenario.username,
          password: effectivePassword,
          phone: "",
          role_keys: expectedRoleKeys,
        },
        context: `admin.create ${scenario.username}`,
      });
      assertOwnedScenarioAccount(account, scenario);
      if (
        !sameStringList(account.roleKeys, expectedRoleKeys) ||
        account.disabled
      ) {
        throw new CliError(
          `${scenario.title}: create response did not match the request`,
        );
      }
      created = true;
      actions.push({ username: scenario.username, action: "created" });
    }

    if (!sameStringList(account.roleKeys, expectedRoleKeys)) {
      account = await mutateAdmin({
        backendURL: safePlan.backendURL,
        token,
        fetchImpl,
        method: "set_roles",
        params: { id: account.id, role_keys: expectedRoleKeys },
        context: `admin.set_roles ${scenario.username}`,
      });
      assertOwnedScenarioAccount(account, scenario);
      if (!sameStringList(account.roleKeys, expectedRoleKeys)) {
        throw new CliError(`${scenario.title}: positions were not updated`);
      }
      actions.push({
        username: scenario.username,
        action: "positions-updated",
      });
    }

    if (account.disabled !== scenario.disabled) {
      account = await mutateAdmin({
        backendURL: safePlan.backendURL,
        token,
        fetchImpl,
        method: "set_disabled",
        params: { id: account.id, disabled: scenario.disabled },
        context: `admin.set_disabled ${scenario.username}`,
      });
      assertScenarioState(account, scenario);
      actions.push({ username: scenario.username, action: "status-updated" });
    } else {
      assertScenarioState(account, scenario);
    }

    if (
      !created &&
      !actions.some((item) => item.username === scenario.username)
    ) {
      actions.push({ username: scenario.username, action: "unchanged" });
    }

    const beforePasswordReset = account;
    account = await mutateAdmin({
      backendURL: safePlan.backendURL,
      token,
      fetchImpl,
      method: "reset_password",
      params: { id: account.id, password: effectivePassword },
      context: `admin.reset_password ${scenario.username}`,
    });
    assertPasswordResetAccount(account, beforePasswordReset, scenario);
    actions.push({
      username: scenario.username,
      action: "password-reset",
    });
  }

  const afterAccounts = await listAdmins({
    backendURL: safePlan.backendURL,
    token,
    fetchImpl,
  });
  assertFormalAccountsUnchanged(formalBefore, afterAccounts);
  const afterByUsername = new Map(
    afterAccounts.map((account) => [account.username, account]),
  );
  const scenarios = MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.map((scenario) => {
    const account = afterByUsername.get(scenario.username);
    if (!account)
      throw new CliError(`${scenario.title}: account is missing after apply`);
    assertScenarioState(account, scenario);
    return {
      key: scenario.key,
      username: scenario.username,
      title: scenario.title,
      instruction: scenario.instruction,
      positions: [...scenario.positions],
      roleKeys: account.roleKeys,
      disabled: account.disabled,
      id: account.id,
      passwordReset: actions.some(
        (item) =>
          item.username === scenario.username &&
          item.action === "password-reset",
      ),
    };
  });
  const summary = {
    created: actions.filter((item) => item.action === "created").length,
    positionsUpdated: actions.filter(
      (item) => item.action === "positions-updated",
    ).length,
    statusUpdated: actions.filter((item) => item.action === "status-updated")
      .length,
    passwordReset: actions.filter((item) => item.action === "password-reset")
      .length,
    unchanged: actions.filter((item) => item.action === "unchanged").length,
  };

  return {
    mode: "apply",
    generatedAt: new Date().toISOString(),
    backendURL: safePlan.backendURL,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    loginAccount: accountSnapshot(profile),
    runtime,
    protectedAccounts: formalBefore,
    scenarios,
    actions,
    summary,
    ready: true,
  };
}

export function parseManualAcceptanceAccountScenarioArgs(argv) {
  const options = {
    backendURL: DEFAULT_BACKEND_URL,
    apply: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") options.apply = true;
    else if (token === "--json") options.json = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--backend-url") {
      options.backendURL = requiredText(argv[++index], "--backend-url");
    } else {
      throw new CliError(`unknown option ${token}`, 2);
    }
  }
  options.backendURL = normalizeAccountScenarioBackendURL(options.backendURL);
  return options;
}

function usage() {
  return `试用账号场景 / Manual Acceptance Account Scenarios

只读查看：
  node scripts/qa/manual-acceptance-account-scenarios.mjs --json

写入本机开发环境：
  MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-super-admin-password>' \\
    node scripts/qa/manual-acceptance-account-scenarios.mjs --apply --json

本入口保留现有十个正式试用账号，只准备“已停用”“业务与采购兼任”
和“未分配岗位”三个补充验收账号。`;
}

export async function runManualAcceptanceAccountScenarioCli(argv, deps = {}) {
  const options = parseManualAcceptanceAccountScenarioArgs(argv);
  if (options.help) return { text: `${usage()}\n`, exitCode: 0 };
  const plan = buildManualAcceptanceAccountScenarioPlan(options);
  const report = options.apply
    ? await applyManualAcceptanceAccountScenarios(plan, deps)
    : plan;
  return {
    text: `${JSON.stringify(report, null, options.json ? 2 : 0)}\n`,
    exitCode: 0,
    plan,
    report,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  runManualAcceptanceAccountScenarioCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error?.message || error}\n`);
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    });
}

export { CONFIRM_PHRASE as MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE };
