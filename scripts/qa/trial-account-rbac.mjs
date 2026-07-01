#!/usr/bin/env node

import process from "node:process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultBackendURL = "http://127.0.0.1:8300";
const authRPCPath = "/rpc/auth";
const preflightScope = "trial-account-rbac-preflight-report";
const repoRoot = path.resolve(import.meta.dirname, "..", "..");
export const expectedAccounts = [
  ["demo_boss", "boss", "mobile.boss.access"],
  ["demo_sales", "sales", "mobile.sales.access"],
  ["demo_purchase", "purchase", "mobile.purchase.access"],
  ["demo_production", "production", "mobile.production.access"],
  ["demo_warehouse", "warehouse", "mobile.warehouse.access"],
  ["demo_quality", "quality", "mobile.quality.access"],
  ["demo_finance", "finance", "mobile.finance.access"],
  ["demo_pmc", "pmc", "mobile.pmc.access"],
  ["demo_engineering", "engineering", "mobile.engineering.access"],
  ["demo_admin", "admin", ""],
];

const staticProjectionSourcePaths = Object.freeze({
  seedGo: "server/internal/data/admin_role_demo_seed.go",
  rbacGo: "server/internal/biz/rbac.go",
  appRegistry: "web/src/erp/config/appRegistry.mjs",
  mobileRolePermissions: "web/src/erp/utils/mobileRolePermissions.mjs",
  trialBrowserSmoke: "web/scripts/trialDemoAccountBrowserSmoke.mjs",
  scriptsReadme: "scripts/README.md",
  webReadme: "web/README.md",
  serverConfigDoc: "server/docs/config.md",
});

export const expectedTrialRoleProjections = Object.freeze(
  expectedAccounts.map(([username, roleKey, mobilePermission]) => ({
    username,
    roleKey,
    mobilePermission: mobilePermission || null,
    mobilePath: mobilePermission ? `/m/${roleKey}/tasks` : null,
  })),
);

const usage = `用法:
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' node scripts/qa/trial-account-rbac.mjs
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' node scripts/qa/trial-account-rbac.mjs --report output/trial-account-rbac/report.json
  node scripts/qa/trial-account-rbac.mjs --print-input-template
  node scripts/qa/trial-account-rbac.mjs --preflight-report output/trial-account-rbac/preflight.json

环境变量:
  TRIAL_ACCOUNT_PASSWORD      试用 / 演示账号密码；优先级高于 ERP_ROLE_DEMO_PASSWORD
  ERP_ROLE_DEMO_PASSWORD      兼容 scripts/seed-role-demo-admins.sh 的密码来源
  TRIAL_ACCOUNT_BACKEND_URL   后端地址，默认 ${defaultBackendURL}

作用:
  只读验证 10 个 demo_* 账号能通过真实 /rpc/auth admin_login + me，并核对:
  - 单一预期角色
  - 对应 mobile.<role>.access
  - 无 debug.* 权限
  - 非 super admin
  - 未禁用

只读前置:
  --print-input-template 只打印本地运行所需输入和命令模板，不读密码、不登录、不调用后端、不写报告、不写数据库。
  --preflight-report <path> 只写本地前置检查报告，不读密码、不登录、不调用 JSON-RPC、不写数据库。
`;

const printUsage = () => {
  process.stdout.write(`${usage}\n`);
};

const normalizeBaseURL = (raw) => {
  const value = String(raw || defaultBackendURL).trim();
  const url = new URL(value);
  if (url.username || url.password) {
    throw new Error("backend URL must not contain username or password");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
};

const rpcURLFor = (backendURL) =>
  new URL(authRPCPath, `${backendURL}/`).toString();

const healthURLFor = (backendURL) =>
  new URL("/healthz", `${backendURL}/`).toString();

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

export const collectAccountFailures = (admin, spec) => {
  const [, expectedRole, expectedMobilePermission] = spec;
  const roleKeys = readRoleKeys(admin);
  const permissionKeys = readPermissionKeys(admin);
  const mobilePermissions = permissionKeys
    .filter((item) => item.startsWith("mobile."))
    .sort();
  const debugPermissions = permissionKeys
    .filter((item) => item.startsWith("debug."))
    .sort();

  const failures = [];
  if (roleKeys.length !== 1 || roleKeys[0] !== expectedRole) {
    failures.push(
      `expected single role ${expectedRole}, got ${roleKeys.join(",") || "-"}`,
    );
  }
  if (expectedMobilePermission) {
    if (
      mobilePermissions.length !== 1 ||
      mobilePermissions[0] !== expectedMobilePermission
    ) {
      failures.push(
        `expected single mobile permission ${expectedMobilePermission}, got ${mobilePermissions.join(",") || "-"}`,
      );
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
  return { failures, roleKeys, mobilePermissions, debugPermissions };
};

export const buildInputTemplate = () => ({
  scope: "trial-account-rbac-input-template",
  writesReport: false,
  writesDatabase: false,
  callsBackend: false,
  callsAuthRPC: false,
  callsMeRPC: false,
  readsPassword: false,
  startsBrowser: false,
  startsDevServer: false,
  secretInputs: ["TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD"],
  optionalInputs: ["TRIAL_ACCOUNT_BACKEND_URL"],
  optionalOutputs: [
    "output/trial-account-rbac/preflight.json when --preflight-report is used",
    "output/trial-account-rbac/report.json when the real run is executed with --report",
  ],
  defaultBackendURL,
  expectedAccounts: expectedAccounts.map(
    ([username, roleKey, mobilePermission]) => ({
      username,
      roleKey,
      mobilePermission: mobilePermission || null,
    }),
  ),
  commands: [
    "PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --preflight-report output/trial-account-rbac/preflight.json",
    "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs",
    "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --report output/trial-account-rbac/report.json",
    "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
  ],
  requiredRealEvidence: [
    "admin_login + me succeeds for every expected demo account",
    "each role account has exactly one expected role and one matching mobile.<role>.access permission",
    "demo_admin has no mobile.* permission",
    "no checked trial account has debug.* permission, is_super_admin=true, or disabled=true",
    "optional --report output is sanitized and must not contain passwords, access tokens, or raw Authorization headers",
  ],
  boundary:
    "This template does not read passwords, call /rpc/auth, call me, start Vite, start a browser, write reports, write databases, or prove login, RBAC, customer config active revision, menu projection, or browser smoke until a local backend and demo password are provided. The preflight report checks backend health, whether a password env is present, and whether static role projection sources still agree.",
});

export { normalizeBaseURL };

export const buildVerificationReport = ({ backendURL, rows }) => ({
  scope: "trial-account-rbac-verification-report",
  generatedAt: new Date().toISOString(),
  backendEndpointAlias: backendURL,
  writesDatabase: false,
  checkedAccounts: rows.map((row) => ({
    username: row.username,
    roles: row.roles,
    mobile: row.mobile,
    debugPermissionCount: row.debug,
    isSuperAdmin: row.super,
    disabled: row.disabled,
  })),
  summary: {
    totalAccounts: rows.length,
    passedAccounts: rows.length,
    failedAccounts: 0,
  },
  redaction: {
    storesPassword: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
  },
});

const defaultReadStaticSource = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

const buildSourceMap = (readText) =>
  Object.fromEntries(
    Object.entries(staticProjectionSourcePaths).map(([key, relativePath]) => {
      try {
        return [
          key,
          {
            path: relativePath,
            text: readText(relativePath),
            error: "",
          },
        ];
      } catch (error) {
        return [
          key,
          {
            path: relativePath,
            text: "",
            error: String(error?.message || error),
          },
        ];
      }
    }),
  );

export const buildStaticProjectionReport = ({
  readText = defaultReadStaticSource,
} = {}) => {
  const sources = buildSourceMap(readText);
  const includes = (sourceKey, token) =>
    Boolean(token && sources[sourceKey]?.text.includes(token));
  const sourceFailures = Object.entries(sources)
    .filter(([, source]) => source.error)
    .map(([key, source]) => `${key}:${source.path}`);

  const roleRows = expectedTrialRoleProjections.map((projection) => {
    const checks = {
      seedAccount: includes("seedGo", projection.username),
      browserDesktopAccount: includes(
        "trialBrowserSmoke",
        `username: '${projection.username}'`,
      ),
      scriptsReadmeAccount: includes("scriptsReadme", projection.username),
      serverConfigAccount: includes("serverConfigDoc", projection.username),
    };

    if (projection.mobilePermission) {
      Object.assign(checks, {
        rbacPermission: includes("rbacGo", projection.mobilePermission),
        frontendMobilePermission: includes(
          "mobileRolePermissions",
          `${projection.roleKey}: '${projection.mobilePermission}'`,
        ),
        appRegistryRole: includes(
          "appRegistry",
          `roleKey: '${projection.roleKey}'`,
        ),
        browserMobileAccount: includes(
          "trialBrowserSmoke",
          `['${projection.username}', '${projection.roleKey}']`,
        ),
        webReadmeMobilePath: includes("webReadme", projection.mobilePath),
      });
    } else {
      Object.assign(checks, {
        adminHasNoExpectedMobilePermission: true,
        browserMobileDenied: includes("trialBrowserSmoke", "expectSuccess: false"),
      });
    }

    return {
      ...projection,
      checks,
      passed: Object.values(checks).every(Boolean),
    };
  });

  const roleFailures = roleRows.flatMap((row) =>
    Object.entries(row.checks)
      .filter(([, passed]) => !passed)
      .map(([check]) => `${row.username}:${check}`),
  );
  const blockers = [
    ...sourceFailures.map((item) => `missing-static-source:${item}`),
    ...roleFailures.map((item) => `static-role-projection-drift:${item}`),
  ];

  return {
    scope: "trial-account-rbac-static-projection",
    sources: Object.fromEntries(
      Object.entries(sources).map(([key, source]) => [
        key,
        {
          path: source.path,
          readable: !source.error,
          error: source.error,
        },
      ]),
    ),
    roleRows,
    summary: {
      expectedAccountCount: expectedTrialRoleProjections.length,
      expectedMobileAccountCount: expectedTrialRoleProjections.filter(
        (item) => item.mobilePermission,
      ).length,
      expectedDesktopAdminCount: expectedTrialRoleProjections.filter(
        (item) => !item.mobilePermission,
      ).length,
      passedRows: roleRows.filter((row) => row.passed).length,
      failedRows: roleRows.filter((row) => !row.passed).length,
    },
    ok: blockers.length === 0,
    blockers,
  };
};

const probeURL = async (url, { timeoutMs = 3000 } = {}) => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      ok: response.ok || response.status === 302 || response.status === 304,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      error:
        error?.name === "AbortError"
          ? "timeout"
          : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
};

export const buildPreflightReport = async ({
  env = process.env,
  probe = probeURL,
  readText = defaultReadStaticSource,
} = {}) => {
  const backendURL = normalizeBaseURL(env.TRIAL_ACCOUNT_BACKEND_URL);
  const backendHealthURL = healthURLFor(backendURL);
  const passwordEnvNames = ["TRIAL_ACCOUNT_PASSWORD", "ERP_ROLE_DEMO_PASSWORD"];
  const presentPasswordEnvNames = passwordEnvNames.filter((name) =>
    Boolean(String(env[name] || "").trim()),
  );
  const backendHealth = await probe(backendHealthURL);
  const staticProjection = buildStaticProjectionReport({ readText });
  const blockers = [];
  if (presentPasswordEnvNames.length === 0) {
    blockers.push("missing-trial-account-password-env");
  }
  if (!backendHealth.ok) {
    blockers.push("backend-health-unreachable");
  }
  if (!staticProjection.ok) {
    blockers.push("static-role-projection-drift");
  }

  return {
    scope: preflightScope,
    generatedAt: new Date().toISOString(),
    writesReport: true,
    writesDatabase: false,
    callsJSONRPC: false,
    callsAuthRPC: false,
    callsMeRPC: false,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    backendEndpointAlias: backendURL,
    backendHealthURL,
    backendHealth,
    passwordEnvPresent: presentPasswordEnvNames.length > 0,
    presentPasswordEnvNames,
    expectedAccountCount: expectedAccounts.length,
    expectedMobileAccountCount: expectedAccounts.filter((item) => item[2])
      .length,
    expectedDesktopAdminCount: expectedAccounts.filter((item) => !item[2])
      .length,
    staticProjection,
    readyForRealRBACCheck: blockers.length === 0,
    blockers,
    nextCommand: blockers.length
      ? "Resolve blockers, then rerun this preflight before the real RBAC check."
      : "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --report output/trial-account-rbac/report.json",
  };
};

const writeReport = ({ reportPath, report }) => {
  const absolutePath = path.resolve(reportPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
  return absolutePath;
};

const resolveRepoOutputPath = (raw) => {
  const value = String(raw || "").trim();
  if (!value) {
    throw new Error("--preflight-report 需要一个输出路径");
  }
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--preflight-report must stay inside the repository");
  }
  return resolved;
};

const writeJSONReport = ({ reportPath, report }) => {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(`${reportPath}.tmp`, reportPath);
};

const verifyAccount = async ({ rpcURL, password, spec }) => {
  const [username] = spec;
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
  const { failures, roleKeys, mobilePermissions, debugPermissions } =
    collectAccountFailures(admin, spec);
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
  if (args.includes("-h") || args.includes("--help")) {
    printUsage();
    return;
  }
  let reportPath = "";
  let preflightReportPath = "";
  if (args[0] === "--print-input-template") {
    if (args.length > 1) {
      process.stderr.write(
        `[qa:trial-account-rbac] 不支持的参数: ${args.slice(1).join(" ")}\n\n${usage}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(buildInputTemplate(), null, 2)}\n`);
    return;
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--preflight-report") {
      const rawPath = String(args[index + 1] || "").trim();
      if (!rawPath || rawPath.startsWith("-")) {
        process.stderr.write(
          `[qa:trial-account-rbac] --preflight-report 需要一个输出路径\n\n${usage}\n`,
        );
        process.exitCode = 1;
        return;
      }
      preflightReportPath = resolveRepoOutputPath(rawPath);
      index += 1;
      continue;
    }
    if (arg === "--report") {
      reportPath = String(args[index + 1] || "").trim();
      if (!reportPath || reportPath.startsWith("-")) {
        process.stderr.write(
          `[qa:trial-account-rbac] --report 需要一个输出路径\n\n${usage}\n`,
        );
        process.exitCode = 1;
        return;
      }
      index += 1;
      continue;
    }
    process.stderr.write(
      `[qa:trial-account-rbac] 不支持的参数: ${arg}\n\n${usage}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (preflightReportPath) {
    const report = await buildPreflightReport();
    writeJSONReport({ reportPath: preflightReportPath, report });
    process.stdout.write(
      `[qa:trial-account-rbac] 已写入前置检查报告：${path.relative(
        repoRoot,
        preflightReportPath,
      )} ready=${report.readyForRealRBACCheck}\n`,
    );
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
  if (reportPath) {
    const absoluteReportPath = writeReport({
      reportPath,
      report: buildVerificationReport({ backendURL, rows }),
    });
    process.stdout.write(
      `[qa:trial-account-rbac] 已写入脱敏报告：${absoluteReportPath}\n`,
    );
  }
  process.stdout.write(
    `[qa:trial-account-rbac] 通过，已验证 ${rows.length} 个 demo 账号。backend=${backendURL}\n`,
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `[qa:trial-account-rbac][fatal] ${error?.stack || error?.message || error}\n`,
    );
    process.exitCode = 1;
  });
}
