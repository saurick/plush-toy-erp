#!/usr/bin/env node

import process from "node:process";

const defaultBackendURL = "http://127.0.0.1:8300";
const authRPCPath = "/rpc/auth";
const expectedAccounts = [
  ["demo_boss", "boss", "mobile.boss.access"],
  ["demo_sales", "sales", "mobile.sales.access"],
  ["demo_purchase", "purchase", "mobile.purchase.access"],
  ["demo_production", "production", "mobile.production.access"],
  ["demo_warehouse", "warehouse", "mobile.warehouse.access"],
  ["demo_quality", "quality", "mobile.quality.access"],
  ["demo_finance", "finance", "mobile.finance.access"],
  ["demo_pmc", "pmc", "mobile.pmc.access"],
  ["demo_admin", "admin", ""],
];

const usage = `用法:
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' node scripts/qa/trial-account-rbac.mjs

环境变量:
  TRIAL_ACCOUNT_PASSWORD      试用 / 演示账号密码；优先级高于 ERP_ROLE_DEMO_PASSWORD
  ERP_ROLE_DEMO_PASSWORD      兼容 scripts/seed-role-demo-admins.sh 的密码来源
  TRIAL_ACCOUNT_BACKEND_URL   后端地址，默认 ${defaultBackendURL}

作用:
  只读验证 9 个 demo_* 账号能通过真实 /rpc/auth admin_login + me，并核对:
  - 单一预期角色
  - 对应 mobile.<role>.access
  - 无 debug.* 权限
  - 非 super admin
  - 未禁用
`;

const printUsage = () => {
  process.stdout.write(`${usage}\n`);
};

const normalizeBaseURL = (raw) => {
  const value = String(raw || defaultBackendURL).trim();
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
};

const rpcURLFor = (backendURL) =>
  new URL(authRPCPath, `${backendURL}/`).toString();

const rpcCall = async ({ rpcURL, method, params, token }) => {
  const response = await fetch(rpcURL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `trial-account-rbac-${method}-${Date.now()}`,
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`${method} HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new Error(
      `${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
};

const readPermissionKeys = (admin) =>
  (admin?.permissions || [])
    .map((item) =>
      typeof item === "string" ? item : item?.permission_key || item?.key || "",
    )
    .filter(Boolean);

const readRoleKeys = (admin) =>
  (admin?.roles || [])
    .map((item) => item?.role_key || item?.key || "")
    .filter(Boolean);

const verifyAccount = async ({ rpcURL, password, spec }) => {
  const [username, expectedRole, expectedMobilePermission] = spec;
  const loginData = await rpcCall({
    rpcURL,
    method: "admin_login",
    params: { username, password },
  });
  const token = loginData.access_token || loginData.token;
  if (!token) {
    throw new Error(`${username}: login response missing access token`);
  }

  const meData = await rpcCall({
    rpcURL,
    method: "me",
    params: {},
    token,
  });
  const admin = meData.admin || meData.user || meData;
  const roleKeys = readRoleKeys(admin);
  const permissionKeys = readPermissionKeys(admin);
  const mobilePermissions = permissionKeys
    .filter((item) => item.startsWith("mobile."))
    .sort();
  const debugPermissions = permissionKeys
    .filter((item) => item.startsWith("debug."))
    .sort();

  const failures = [];
  if (!roleKeys.includes(expectedRole)) {
    failures.push(`missing role ${expectedRole}`);
  }
  if (expectedMobilePermission) {
    if (!mobilePermissions.includes(expectedMobilePermission)) {
      failures.push(`missing mobile permission ${expectedMobilePermission}`);
    }
  } else if (mobilePermissions.length > 0) {
    failures.push(
      `unexpected mobile permissions ${mobilePermissions.join(",")}`,
    );
  }
  if (debugPermissions.length > 0) {
    failures.push(`unexpected debug permissions ${debugPermissions.join(",")}`);
  }
  if (admin.is_super_admin) {
    failures.push("is_super_admin=true");
  }
  if (admin.disabled) {
    failures.push("disabled=true");
  }
  if (failures.length > 0) {
    throw new Error(`${username}: ${failures.join("; ")}`);
  }

  return {
    username,
    roles: roleKeys.join(","),
    mobile: mobilePermissions.join(",") || "-",
    debug: debugPermissions.length,
    super: Boolean(admin.is_super_admin),
    disabled: Boolean(admin.disabled),
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === "-h" || args[0] === "--help") {
    printUsage();
    return;
  }
  if (args.length > 0) {
    process.stderr.write(
      `[qa:trial-account-rbac] 不支持的参数: ${args.join(" ")}\n\n${usage}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const password = String(
    process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD ||
      "",
  ).trim();
  if (!password) {
    process.stderr.write(
      "[qa:trial-account-rbac] 缺少账号密码：请设置 TRIAL_ACCOUNT_PASSWORD 或 ERP_ROLE_DEMO_PASSWORD\n",
    );
    process.exitCode = 1;
    return;
  }

  const backendURL = normalizeBaseURL(process.env.TRIAL_ACCOUNT_BACKEND_URL);
  const rpcURL = rpcURLFor(backendURL);
  const rows = [];
  for (const spec of expectedAccounts) {
    rows.push(await verifyAccount({ rpcURL, password, spec }));
  }

  console.table(rows);
  process.stdout.write(
    `[qa:trial-account-rbac] 通过，已验证 ${rows.length} 个 demo 账号。backend=${backendURL}\n`,
  );
};

main().catch((error) => {
  process.stderr.write(
    `[qa:trial-account-rbac][fatal] ${error?.stack || error?.message || error}\n`,
  );
  process.exitCode = 1;
});
