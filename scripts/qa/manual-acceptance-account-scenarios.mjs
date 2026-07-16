#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_DEV_TARGET,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import { yoyoosunRoleFlowMatrix } from "../../config/customers/yoyoosun/roleFlowMatrix.mjs";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const CUSTOMER_KEY = "yoyoosun";
const BUSINESS_ADMIN_USERNAME = "demo_admin";
const GUARD_ADMIN_USERNAME = "admin";
const CONFIRM_PHRASE = "APPLY_SIMULATED_ACCOUNT_SCENARIOS";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ACCOUNT_DATA_VERSION = "2026.07.15-v3";
const ACCOUNT_RUN_ID = "20260715-V3";
const MANAGED_ROLE_KEYS = new Set(["sales", "purchase"]);
const MAX_AUDIT_MINIMUM = 200;

export const MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE = Object.freeze(
  yoyoosunRoleFlowMatrix.roles.map((profile) =>
    Object.freeze({
      roleKey: profile.roleKey,
      capabilityKeys: Object.freeze(
        [...new Set(profile.capabilityKeys)].sort(),
      ),
    }),
  ),
);

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
    disabledReason: "验收时暂时停用",
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

function normalizeAuditMinimum(value = 0) {
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > MAX_AUDIT_MINIMUM
  ) {
    throw new CliError(
      `--audit-minimum must be an integer between 0 and ${MAX_AUDIT_MINIMUM}`,
      2,
    );
  }
  return number;
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

function normalizePermissionKeys(values, context) {
  if (!Array.isArray(values)) {
    throw new CliError(`${context} response missing permissions`);
  }
  const keys = values.map((value, index) =>
    requiredText(value, `${context} permissions[${index}]`),
  );
  return [...new Set(keys)].sort();
}

function requireAdminRoleRecord(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError(`${context} response missing role`);
  }
  const roleKey = requiredText(value.role_key, `${context}.role_key`);
  const version = Number(value.version);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new CliError(`${context} response missing role version`);
  }
  if (typeof value.disabled !== "boolean") {
    throw new CliError(`${context} response missing role status`);
  }
  const roleType = requiredText(value.role_type, `${context}.role_type`);
  const permissionsEditable =
    value.permissions_editable_by_current_admin ?? value.permissions_editable;
  if (typeof permissionsEditable !== "boolean") {
    throw new CliError(`${context} response missing permission edit status`);
  }
  return {
    roleKey,
    roleType,
    version,
    disabled: value.disabled,
    permissionsEditable,
    permissionKeys: normalizePermissionKeys(value.permissions, context),
  };
}

function requirePermissionOption(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError(`${context} response missing permission`);
  }
  const permissionKey = requiredText(
    value.permission_key,
    `${context}.permission_key`,
  );
  const permissionClass = requiredText(value.class, `${context}.class`);
  if (
    typeof value.assignable !== "boolean" ||
    typeof value.non_production_only !== "boolean"
  ) {
    throw new CliError(`${context} response missing permission metadata`);
  }
  return {
    permissionKey,
    permissionClass,
    assignable: value.assignable,
    nonProductionOnly: value.non_production_only,
  };
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
  const rawAccountStatus = optionalText(value.account_status);
  const accountStatusFromDisabled =
    typeof value.disabled === "boolean"
      ? value.disabled
        ? "suspended"
        : "active"
      : "";
  const accountStatus = rawAccountStatus || accountStatusFromDisabled;
  if (!new Set(["active", "suspended", "revoked"]).has(accountStatus)) {
    throw new CliError(`${context} response missing valid account status`);
  }
  const disabled = accountStatus !== "active";
  if (
    typeof value.disabled === "boolean" &&
    value.disabled !== disabled
  ) {
    throw new CliError(`${context} response contains conflicting account status`);
  }
  if (typeof value.is_super_admin !== "boolean") {
    throw new CliError(`${context} response missing super-admin status`);
  }
  return {
    id,
    username,
    phone: String(value.phone ?? "").trim(),
    accountStatus,
    disabled,
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
  if (account.accountStatus === "revoked") {
    throw new CliError(
      `${scenario.title}: same-name account has been revoked and will not be changed`,
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
    accountStatus: account.accountStatus,
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
  auditMinimum = 0,
  target,
  dataVersion = ACCOUNT_DATA_VERSION,
  runId = ACCOUNT_RUN_ID,
} = {}) {
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: normalizeAccountScenarioBackendURL(backendURL),
    target,
    dataVersion,
    runId,
  });
  return {
    mode: "report-only",
    backendURL: targetPolicy.backendURL,
    target: targetPolicy.target,
    datasetKey: targetPolicy.datasetKey,
    dataVersion: targetPolicy.dataVersion,
    runId: targetPolicy.runId,
    external: targetPolicy.external,
    loginAccount: BUSINESS_ADMIN_USERNAME,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    auditMinimum: normalizeAuditMinimum(auditMinimum),
    roleCapabilityBaseline: MANUAL_ACCEPTANCE_ROLE_CAPABILITY_BASELINE.map(
      (item) => ({
        roleKey: item.roleKey,
        capabilityKeys: [...item.capabilityKeys],
      }),
    ),
    protectedAccounts: [...FORMAL_DEMO_ACCOUNTS],
    scenarios: MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.map((scenario) => ({
      key: scenario.key,
      username: scenario.username,
      title: scenario.title,
      instruction: scenario.instruction,
      disabledReason: scenario.disabledReason || "",
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
  policy,
  guardToken,
  sessionToken,
  fetchImpl,
}) {
  const backendURL = policy.backendURL;
  const capabilities = await rpcCall({
    backendURL,
    domain: "debug",
    method: "capabilities",
    token: guardToken,
    fetchImpl,
  });
  const sessionData = await rpcCall({
    backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: sessionToken,
    fetchImpl,
  });
  const session = sessionData.session || {};
  return assertManualAcceptanceRuntimePolicy({
    policy,
    capabilities,
    session,
    requiredModules: [],
    customerKey: CUSTOMER_KEY,
  });
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

async function readRoleControlPlane({ backendURL, token, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "admin",
    method: "rbac_options",
    token,
    fetchImpl,
  });
  if (!Array.isArray(data.roles) || !Array.isArray(data.permissions)) {
    throw new CliError("admin.rbac_options response is incomplete");
  }
  const roles = new Map();
  for (const [index, value] of data.roles.entries()) {
    const role = requireAdminRoleRecord(
      value,
      `admin.rbac_options roles[${index}]`,
    );
    if (roles.has(role.roleKey)) {
      throw new CliError(`admin.rbac_options returned duplicate role ${role.roleKey}`);
    }
    roles.set(role.roleKey, role);
  }
  const permissions = new Map();
  for (const [index, value] of data.permissions.entries()) {
    const permission = requirePermissionOption(
      value,
      `admin.rbac_options permissions[${index}]`,
    );
    if (permissions.has(permission.permissionKey)) {
      throw new CliError(
        `admin.rbac_options returned duplicate permission ${permission.permissionKey}`,
      );
    }
    permissions.set(permission.permissionKey, permission);
  }
  return { roles, permissions };
}

function preflightRoleCapabilityBaseline(controlPlane, baseline) {
  const roleKeys = new Set();
  return baseline.map((expected) => {
    if (roleKeys.has(expected.roleKey)) {
      throw new CliError(`验收权限基线包含重复岗位 ${expected.roleKey}`);
    }
    roleKeys.add(expected.roleKey);
    const role = controlPlane.roles.get(expected.roleKey);
    if (
      !role ||
      role.disabled ||
      role.roleType !== "business_default" ||
      !role.permissionsEditable
    ) {
      throw new CliError(
        `岗位 ${expected.roleKey} 当前不是可维护的预设业务岗位`,
      );
    }
    const desired = [
      ...new Set([...role.permissionKeys, ...expected.capabilityKeys]),
    ].sort();
    for (const key of desired) {
      const permission = controlPlane.permissions.get(key);
      if (
        !permission ||
        !permission.assignable ||
        permission.permissionClass !== "business" ||
        permission.nonProductionOnly
      ) {
        throw new CliError(`岗位 ${role.roleKey} 包含不可用于验收的权限 ${key}`);
      }
    }
    return {
      role,
      desired,
      missing: expected.capabilityKeys.filter(
        (key) => !role.permissionKeys.includes(key),
      ),
    };
  });
}

async function alignAcceptanceRoleCapabilities({
  backendURL,
  token,
  fetchImpl,
  baseline,
  allowMutation = true,
}) {
  const controlPlane = await readRoleControlPlane({
    backendURL,
    token,
    fetchImpl,
  });
  const planned = preflightRoleCapabilityBaseline(controlPlane, baseline);
  const actions = [];
  for (const item of planned) {
    let { role } = item;
    const { desired, missing } = item;
    if (missing.length === 0) {
      actions.push({ roleKey: role.roleKey, action: "unchanged", added: [] });
      continue;
    }
    if (!allowMutation) {
      throw new CliError(
        `岗位 ${role.roleKey} 缺少验收所需权限 ${missing.join(", ")}；远端账号准备不修改岗位权限`,
        2,
      );
    }
    const updatedData = await rpcCall({
      backendURL,
      domain: "admin",
      method: "set_role_permissions",
      params: {
        role_key: role.roleKey,
        permission_keys: desired,
        expected_version: role.version,
      },
      token,
      fetchImpl,
    });
    const updated = requireAdminRoleRecord(
      updatedData.role,
      `admin.set_role_permissions ${role.roleKey}`,
    );
    if (
      updated.roleKey !== role.roleKey ||
      updated.version <= role.version ||
      desired.some((key) => !updated.permissionKeys.includes(key))
    ) {
      throw new CliError(`岗位 ${role.roleKey} 权限补齐结果不完整`);
    }
    role = updated;
    actions.push({ roleKey: role.roleKey, action: "updated", added: missing });
  }
  const readback = await readRoleControlPlane({
    backendURL,
    token,
    fetchImpl,
  });
  for (const item of planned) {
    const role = readback.roles.get(item.role.roleKey);
    if (
      !role ||
      role.disabled ||
      role.roleType !== "business_default" ||
      item.desired.some((key) => !role.permissionKeys.includes(key))
    ) {
      throw new CliError(`岗位 ${item.role.roleKey} 最终权限读回不完整`);
    }
  }
  return {
    source: "yoyoosun-role-flow-matrix",
    mode: allowMutation ? "reconcile" : "verify-only",
    updated: actions.filter((item) => item.action === "updated").length,
    unchanged: actions.filter((item) => item.action === "unchanged").length,
    actions,
  };
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

async function readAuditTotal({ backendURL, token, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "admin",
    method: "audit_logs",
    params: { limit: 1, offset: 0 },
    token,
    fetchImpl,
  });
  const total = Number(data.total);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new CliError("admin.audit_logs response missing total");
  }
  return total;
}

async function fillAuditEvidence({
  backendURL,
  token,
  fetchImpl,
  account,
  minimum,
  total,
}) {
  const expectedRoleKeys = ["sales"];
  let current = account;
  let currentTotal = total;
  let mutations = 0;
  const mutationLimit = Math.max(4, (minimum - total + 2) * 2);
  while (currentTotal < minimum && mutations < mutationLimit) {
    const nextRoleKeys = current.roleKeys.length > 0 ? [] : expectedRoleKeys;
    current = await mutateAdmin({
      backendURL,
      token,
      fetchImpl,
      method: "set_roles",
      params: { id: current.id, role_keys: nextRoleKeys },
      context: `admin.set_roles audit sample ${current.username}`,
    });
    if (!current.disabled || current.isSuperAdmin || current.phone) {
      throw new CliError(
        "已停用账号在准备审计样例时出现了不安全的状态变化",
      );
    }
    const nextTotal = await readAuditTotal({
      backendURL,
      token,
      fetchImpl,
    });
    if (nextTotal <= currentTotal) {
      throw new CliError("账号岗位变更没有生成可读的审计记录");
    }
    currentTotal = nextTotal;
    mutations += 1;
  }
  if (!sameStringList(current.roleKeys, expectedRoleKeys)) {
    current = await mutateAdmin({
      backendURL,
      token,
      fetchImpl,
      method: "set_roles",
      params: { id: current.id, role_keys: expectedRoleKeys },
      context: `admin.set_roles restore ${current.username}`,
    });
    currentTotal = await readAuditTotal({
      backendURL,
      token,
      fetchImpl,
    });
    mutations += 1;
  }
  if (currentTotal < minimum) {
    throw new CliError(
      `审计记录只有 ${currentTotal} 条，未达到 ${minimum} 条验收要求`,
    );
  }
  const disabledScenario = MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.find(
    (scenario) => scenario.key === "disabled-account",
  );
  assertScenarioState(current, disabledScenario);
  return { account: current, total: currentTotal, mutations };
}

export async function applyManualAcceptanceAccountScenarios(
  plan,
  {
    password,
    adminPassword,
    confirmPhrase = process.env.MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM,
    targetConfirmation = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation = process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
  } = {},
) {
  const safePlan = buildManualAcceptanceAccountScenarioPlan({
    backendURL: plan?.backendURL,
    auditMinimum: plan?.auditMinimum,
    target: plan?.target,
    dataVersion: plan?.dataVersion,
    runId: plan?.runId,
  });
  const resolvedTarget = assertManualAcceptanceMutationTarget(safePlan, {
    confirmation: targetConfirmation,
  });
  const parsedTargetAttestation =
    parseManualAcceptanceTargetAttestation(targetAttestation);
  if (resolvedTarget.external) {
    assertManualAcceptanceTargetAttestation({
      policy: safePlan,
      attestation: parsedTargetAttestation,
    });
  } else if (parsedTargetAttestation) {
    throw new CliError(
      "target attestation is only valid for customer-trial-133",
      2,
    );
  }
  if (confirmPhrase !== CONFIRM_PHRASE) {
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
  if ([...effectivePassword].length < 8 || [...effectivePassword].length > 20) {
    throw new CliError("account password must contain 8-20 characters", 2);
  }
  const effectiveAdminPassword = requiredText(
    adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );

  if (resolvedTarget.external) {
    await assertManualAcceptanceRuntimeIdentityPrecondition({
      policy: safePlan,
      attestation: parsedTargetAttestation,
      fetchImpl,
    });
  }

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
    policy: safePlan,
    guardToken,
    sessionToken: token,
    fetchImpl,
  });
  const roleCapabilityBaseline = await alignAcceptanceRoleCapabilities({
    backendURL: safePlan.backendURL,
    token,
    fetchImpl,
    baseline: safePlan.roleCapabilityBaseline,
    allowMutation: !resolvedTarget.external,
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
  const auditBefore =
    safePlan.auditMinimum > 0
      ? await readAuditTotal({
          backendURL: safePlan.backendURL,
          token,
          fetchImpl,
        })
      : null;

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
        params: {
          id: account.id,
          disabled: scenario.disabled,
          reason: scenario.disabled ? scenario.disabledReason : "",
        },
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

  let auditAfter = auditBefore;
  let auditFillMutations = 0;
  if (safePlan.auditMinimum > 0) {
    auditAfter = await readAuditTotal({
      backendURL: safePlan.backendURL,
      token,
      fetchImpl,
    });
    if (auditAfter < safePlan.auditMinimum) {
      const disabledScenario = MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.find(
        (scenario) => scenario.key === "disabled-account",
      );
      const currentAccounts = await listAdmins({
        backendURL: safePlan.backendURL,
        token,
        fetchImpl,
      });
      const disabledAccount = currentAccounts.find(
        (account) => account.username === disabledScenario.username,
      );
      if (!disabledAccount) {
        throw new CliError("已停用账号不存在，不能准备审计样例");
      }
      assertScenarioState(disabledAccount, disabledScenario);
      const filled = await fillAuditEvidence({
        backendURL: safePlan.backendURL,
        token,
        fetchImpl,
        account: disabledAccount,
        minimum: safePlan.auditMinimum,
        total: auditAfter,
      });
      auditAfter = filled.total;
      auditFillMutations = filled.mutations;
    }
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
    target: safePlan.target,
    datasetKey: safePlan.datasetKey,
    dataVersion: safePlan.dataVersion,
    runId: safePlan.runId,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    loginAccount: accountSnapshot(profile),
    runtime,
    targetAttestation: parsedTargetAttestation
      ? {
          source: "out-of-band",
          release: parsedTargetAttestation.release,
          migration: parsedTargetAttestation.migration,
        }
      : null,
    roleCapabilityBaseline,
    protectedAccounts: formalBefore,
    scenarios,
    actions,
    summary,
    audit:
      safePlan.auditMinimum > 0
        ? {
            minimum: safePlan.auditMinimum,
            before: auditBefore,
            after: auditAfter,
            added: auditAfter - auditBefore,
            fillMutations: auditFillMutations,
          }
        : null,
    ready: true,
  };
}

export function parseManualAcceptanceAccountScenarioArgs(argv) {
  const options = {
    backendURL: DEFAULT_BACKEND_URL,
    apply: false,
    auditMinimum: 0,
    target: "",
    dataVersion: ACCOUNT_DATA_VERSION,
    runId: ACCOUNT_RUN_ID,
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
    } else if (token === "--audit-minimum") {
      options.auditMinimum = normalizeAuditMinimum(
        requiredText(argv[++index], "--audit-minimum"),
      );
    } else if (token === "--target") {
      options.target = requiredText(argv[++index], "--target");
    } else if (token === "--data-version") {
      options.dataVersion = requiredText(argv[++index], "--data-version");
    } else if (token === "--run-id") {
      options.runId = requiredText(argv[++index], "--run-id");
    } else {
      throw new CliError(`unknown option ${token}`, 2);
    }
  }
  options.backendURL = normalizeAccountScenarioBackendURL(options.backendURL);
  if (
    options.target &&
    !new Set([LOCAL_DEV_TARGET, CUSTOMER_TRIAL_133_TARGET]).has(options.target)
  ) {
    throw new CliError(
      `--target must be ${LOCAL_DEV_TARGET} or ${CUSTOMER_TRIAL_133_TARGET}`,
      2,
    );
  }
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
    node scripts/qa/manual-acceptance-account-scenarios.mjs --apply --audit-minimum 30 --json

本入口保留现有十个正式试用账号，只准备“已停用”“业务与采购兼任”
和“未分配岗位”三个补充验收账号。密码必须为 8 到 20 位。

133 试用环境必须通过 127.0.0.1:18375 SSH 隧道，并显式提供：
  --target customer-trial-133 --data-version 2026.07.15-v3 --run-id 20260715-V3
同时设置绑定目标的 MANUAL_ACCEPTANCE_TARGET_CONFIRM 与
MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON。远端只核对岗位权限，不修改岗位权限。`;
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
