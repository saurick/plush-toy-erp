import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import {
  buildPreflightReport,
  buildStaticProjectionReport,
  buildVerificationReport,
  buildInputTemplate,
  collectAccountFailures,
  expectedTrialRoleProjections,
  normalizeBaseURL,
} from "./trial-account-rbac.mjs";

const salesSpec = ["demo_sales", "sales", "mobile.sales.access"];
const adminSpec = ["demo_admin", "admin", ""];
const scriptPath = path.resolve(import.meta.dirname, "trial-account-rbac.mjs");
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

test("trial account RBAC shape requires one expected role and mobile permission", () => {
  assert.deepEqual(
    collectAccountFailures(
      {
        roles: [{ role_key: "sales" }],
        permissions: [{ permission_key: "mobile.sales.access" }],
        menus: [{ path: "/erp/dashboard" }],
        is_super_admin: false,
        disabled: false,
      },
      salesSpec,
    ).failures,
    [],
  );

  assert.match(
    collectAccountFailures(
      {
        roles: [{ role_key: "sales" }, { role_key: "admin" }],
        permissions: [{ permission_key: "mobile.sales.access" }],
      },
      salesSpec,
    ).failures.join("\n"),
    /expected single role sales/,
  );

  assert.match(
    collectAccountFailures(
      {
        roles: [{ role_key: "sales" }],
        permissions: [
          { permission_key: "mobile.sales.access" },
          { permission_key: "mobile.purchase.access" },
        ],
      },
      salesSpec,
    ).failures.join("\n"),
    /expected single mobile permission mobile\.sales\.access/,
  );
});

test("trial account RBAC shape rejects admin mobile, debug, super admin, and disabled flags", () => {
  const failures = collectAccountFailures(
    {
      roles: [{ role_key: "admin" }],
      permissions: [
        { permission_key: "mobile.sales.access" },
        { permission_key: "debug.seed" },
      ],
      menus: [{ path: "/erp/system/permissions" }],
      is_super_admin: true,
      disabled: true,
    },
    adminSpec,
  ).failures.join("\n");

  assert.match(failures, /unexpected mobile permissions mobile\.sales\.access/);
  assert.match(failures, /unexpected debug permissions debug\.seed/);
  assert.match(failures, /is_super_admin=true/);
  assert.match(failures, /disabled=true/);
});

test("trial account RBAC shape requires desktop menus and guards the boss dashboards", () => {
  const bossSpec = ["demo_boss", "boss", "mobile.boss.access"];
  const baseAdmin = {
    roles: [{ role_key: "boss" }],
    permissions: [{ permission_key: "mobile.boss.access" }],
    is_super_admin: false,
    disabled: false,
  };

  assert.match(
    collectAccountFailures({ ...baseAdmin, menus: [] }, bossSpec).failures.join(
      "\n",
    ),
    /no recognized desktop menu/,
  );
  assert.match(
    collectAccountFailures(
      {
        ...baseAdmin,
        menus: [{ path: "/erp/dashboard" }],
      },
      bossSpec,
    ).failures.join("\n"),
    /boss missing desktop menu \/erp\/business-dashboard/,
  );
  assert.deepEqual(
    collectAccountFailures(
      {
        ...baseAdmin,
        menus: [
          { path: "/erp/dashboard" },
          { path: "/erp/business-dashboard" },
        ],
      },
      bossSpec,
    ).failures,
    [],
  );
});

test("trial account RBAC backend URL rejects embedded credentials", () => {
  assert.equal(
    normalizeBaseURL("http://127.0.0.1:8300/"),
    "http://127.0.0.1:8300",
  );
  assert.throws(
    () => normalizeBaseURL("http://demo:secret@127.0.0.1:8300"),
    /backend URL must not contain username or password/,
  );
});

test("trial account RBAC input template is no-write and lists required demo roles", () => {
  const template = buildInputTemplate();
  const serialized = JSON.stringify(template);

  assert.equal(template.scope, "trial-account-rbac-input-template");
  assert.equal(template.writesReport, false);
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.callsAuthRPC, false);
  assert.equal(template.callsMeRPC, false);
  assert.equal(template.readsPassword, false);
  assert.equal(template.startsBrowser, false);
  assert.equal(template.startsDevServer, false);
  assert.deepEqual(template.secretInputs, [
    "TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD",
  ]);
  assert.match(template.optionalOutputs.join("\n"), /--report/);
  assert.match(template.optionalOutputs.join("\n"), /--preflight-report/);
  assert.match(
    template.optionalOutputs.join("\n"),
    /trial-demo-account-browser-smoke\/preflight\.json/,
  );
  assert.match(
    template.optionalOutputs.join("\n"),
    /trial-demo-account-browser-smoke\/report\.json/,
  );
  assert.equal(template.expectedAccountSummaries.length, 10);
  assert(
    template.expectedAccountSummaries.some(
      (item) =>
        item.username === "demo_sales" &&
        item.role === "业务" &&
        item.mobileTaskEntry === "业务岗位任务端" &&
        item.mobileAccessExpected === true,
    ),
  );
  assert(
    template.expectedAccountSummaries.some(
      (item) =>
        item.username === "demo_admin" &&
        item.role === "后台管理员" &&
        item.mobileTaskEntry === "不开放岗位任务端" &&
        item.mobileAccessExpected === false,
    ),
  );
  assert.doesNotMatch(serialized, /"roleKey"/);
  assert.doesNotMatch(serialized, /"mobilePermission"/);
  assert.doesNotMatch(serialized, /"mobilePath"/);
  assert.doesNotMatch(serialized, /mobile\.[a-z]+\.access/);
  assert.doesNotMatch(serialized, /\/m\/[a-z]+\/tasks/);
  assert.match(
    template.commands.join("\n"),
    /--preflight-report output\/trial-account-rbac\/preflight\.json/,
  );
  assert.match(
    template.commands.join("\n"),
    /--report output\/trial-account-rbac\/report\.json/,
  );
  assert.match(
    template.commands.join("\n"),
    /trialDemoAccountBrowserSmoke\.mjs --preflight-report output\/trial-demo-account-browser-smoke\/preflight\.json/,
  );
  assert.match(
    template.commands.join("\n"),
    /trialDemoAccountBrowserSmoke\.mjs --report output\/trial-demo-account-browser-smoke\/report\.json/,
  );
  assert.match(template.commands.join("\n"), /smoke:trial-demo-browser/);
  assert.equal(
    template.browserSmokeEvidencePlan.scope,
    "trial-demo-account-browser-smoke-evidence-plan",
  );
  assert.equal(template.browserSmokeEvidencePlan.requiresPassword, true);
  assert.equal(template.browserSmokeEvidencePlan.requiresLocalBackend, true);
  assert.equal(template.browserSmokeEvidencePlan.requiresFrontendRuntime, true);
  assert(
    template.realRBACCheckRequires.includes(
      "trial account password env is present",
    ),
  );
  assert(
    template.notProvenByThisTemplate.includes(
      "auth.me role and permission payload",
    ),
  );
  assert(template.notProvenByThisTemplate.includes("desktop menu projection"));
  assert(
    template.notProvenByThisTemplate.includes(
      "target environment release evidence",
    ),
  );
  assert.equal(
    template.browserSmokeEvidencePlan.realSmokeReportPath,
    "output/trial-demo-account-browser-smoke/report.json",
  );
  assert.deepEqual(
    template.browserSmokeEvidencePlan.effectiveSessionDiagnostic
      .acceptedProjectionModes,
    ["local_dev_customer_config_diagnostic"],
  );
  assert.match(
    template.browserSmokeEvidencePlan.effectiveSessionDiagnostic.forbiddenFields.join(
      "\n",
    ),
    /accessToken|authorizationHeader|configHash|rawId|password|token/,
  );
  assert.match(
    template.browserSmokeEvidencePlan.boundary,
    /RBAC script proves auth role\/permission shape only/,
  );
  assert.match(template.requiredRealEvidence.join("\n"), /admin_login \+ me/);
  assert.match(
    template.requiredRealEvidence.join("\n"),
    /effective session diagnostic readback/,
  );
  assert.match(template.boundary, /does not read passwords/);
  assert.match(template.boundary, /write reports/);
  assert.match(template.boundary, /mobile task access/);
  assert.match(template.boundary, /effective session diagnostic readback/);
  assert.match(template.boundary, /static role projection sources still agree/);
});

test("trial account RBAC preflight report is no-login and records blockers", async () => {
  const report = await buildPreflightReport({
    env: {
      TRIAL_ACCOUNT_PASSWORD: "",
      ERP_ROLE_DEMO_PASSWORD: "",
      TRIAL_ACCOUNT_BACKEND_URL: "http://127.0.0.1:8300",
    },
    probe: async () => ({
      ok: false,
      status: 0,
      elapsedMs: 1,
      error: "fetch failed",
    }),
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.scope, "trial-account-rbac-preflight-report");
  assert.equal(report.writesReport, true);
  assert.equal(report.preflightOnly, true);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.callsJSONRPC, false);
  assert.equal(report.callsAuthRPC, false);
  assert.equal(report.callsMeRPC, false);
  assert.equal(report.readsPasswordValue, false);
  assert.equal(report.storesPasswordValue, false);
  assert.equal(report.storesAccessToken, false);
  assert.equal(report.storesAuthorizationHeader, false);
  assert.equal(report.backendEndpointAlias, "http://127.0.0.1:8300");
  assert.equal(report.backendHealthURL, "http://127.0.0.1:8300/healthz");
  assert.equal(report.passwordEnvPresent, false);
  assert.equal(report.expectedAccountCount, 10);
  assert.equal(report.expectedMobileAccountCount, 9);
  assert.equal(report.expectedDesktopAdminCount, 1);
  assert.equal(report.staticProjection.ok, true);
  assert.equal(report.staticProjection.summary.expectedAccountCount, 10);
  assert(
    report.realRBACCheckRequires.includes(
      "demo accounts exist in the target backend",
    ),
  );
  assert(report.notProvenByThisPreflight.includes("real admin_login"));
  assert(
    report.notProvenByThisPreflight.includes(
      "auth.me role and permission payload",
    ),
  );
  assert(report.notProvenByThisPreflight.includes("mobile task entry access"));
  assert(
    report.notProvenByThisPreflight.includes(
      "target environment release evidence",
    ),
  );
  assert.equal(report.readyForRealRBACCheck, false);
  assert(report.blockers.includes("missing-trial-account-password-env"));
  assert(report.blockers.includes("backend-health-unreachable"));
  assert.match(
    report.suggestedRealRBACCommand,
    /TRIAL_ACCOUNT_PASSWORD='<local-demo-password>'/,
  );
  assert.match(
    report.suggestedRealRBACCommand,
    /TRIAL_ACCOUNT_BACKEND_URL='http:\/\/127\.0\.0\.1:8300'/,
  );
  assert.match(
    report.suggestedRealRBACCommand,
    /trial-account-rbac\.mjs --report output\/trial-account-rbac\/report\.json/,
  );
  assert.doesNotMatch(serialized, /"roleKey"/);
  assert.doesNotMatch(serialized, /"mobilePermission"/);
  assert.doesNotMatch(serialized, /"mobilePath"/);
  assert.doesNotMatch(serialized, /mobile\.[a-z]+\.access/);
  assert.doesNotMatch(serialized, /\/m\/[a-z]+\/tasks/);
});

test("trial account RBAC static projection covers current seed, RBAC, mobile entry, smoke, and docs", () => {
  const report = buildStaticProjectionReport();

  assert.equal(report.scope, "trial-account-rbac-static-projection");
  assert.equal(report.ok, true);
  assert.equal(report.blockers.length, 0);
  assert.equal(
    report.summary.expectedAccountCount,
    expectedTrialRoleProjections.length,
  );
  assert.equal(report.summary.expectedMobileAccountCount, 9);
  assert.equal(report.summary.expectedDesktopAdminCount, 1);
  assert.equal(report.summary.failedRows, 0);
  assert(
    report.roleRows.some(
      (item) =>
        item.username === "demo_engineering" &&
        item.role === "工程" &&
        item.mobileTaskEntry === "工程岗位任务端" &&
        item.mobileAccessExpected === true &&
        item.passed,
    ),
  );
  assert(
    report.roleRows.some(
      (item) =>
        item.username === "demo_admin" &&
        item.role === "后台管理员" &&
        item.mobileTaskEntry === "不开放岗位任务端" &&
        item.mobileAccessExpected === false &&
        item.checks.adminHasNoExpectedMobilePermission &&
        item.checks.browserMobileDenied &&
        item.passed,
    ),
  );
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"roleKey"/);
  assert.doesNotMatch(serialized, /"mobilePermission"/);
  assert.doesNotMatch(serialized, /"mobilePath"/);
  assert.doesNotMatch(serialized, /mobile\.[a-z]+\.access/);
  assert.doesNotMatch(serialized, /\/m\/[a-z]+\/tasks/);
});

test("trial account RBAC docs keep preflight and real evidence boundary", () => {
  const docs = [
    [
      "scripts README",
      readFileSync(path.join(repoRoot, "scripts/README.md"), "utf8"),
    ],
    [
      "automation test strategy",
      readFileSync(
        path.join(repoRoot, "docs/product/自动化测试策略.md"),
        "utf8",
      ),
    ],
    [
      "yoyoosun trial runbook",
      readFileSync(
        path.join(repoRoot, "docs/customers/yoyoosun/试用环境执行手册.md"),
        "utf8",
      ),
    ],
  ];

  for (const [context, source] of docs) {
    assert.match(
      source,
      /trial-account-rbac\.mjs[\s\S]{0,160}--preflight-report/u,
      `${context} must document trial account RBAC preflight command`,
    );
    assert.match(
      source,
      /preflightOnly=true/u,
      `${context} must identify trial account RBAC preflight-only evidence`,
    );
    assert.match(
      source,
      /不调用 `admin_login \/ me`/u,
      `${context} must keep no-login boundary`,
    );
    assert.match(
      source,
      /不证明真实 RBAC/u,
      `${context} must not overstate RBAC proof`,
    );
  }
});

test("trial account RBAC preflight blocks static role projection drift", async () => {
  const report = await buildPreflightReport({
    env: {
      TRIAL_ACCOUNT_PASSWORD: "placeholder-secret",
      ERP_ROLE_DEMO_PASSWORD: "",
      TRIAL_ACCOUNT_BACKEND_URL: "http://127.0.0.1:8300",
    },
    probe: async () => ({
      ok: true,
      status: 200,
      elapsedMs: 1,
      error: "",
    }),
    readText: () => "",
  });

  assert.equal(report.staticProjection.ok, false);
  assert.equal(report.staticProjection.summary.failedRows, 10);
  assert(report.blockers.includes("static-role-projection-drift"));
  assert.equal(report.readyForRealRBACCheck, false);
});

test("trial account RBAC CLI preflight writes sanitized report", () => {
  const reportPath = path.join(
    repoRoot,
    "output/trial-account-rbac/preflight-test.json",
  );
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--preflight-report",
      "output/trial-account-rbac/preflight-test.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TRIAL_ACCOUNT_PASSWORD: "should-not-be-stored",
        ERP_ROLE_DEMO_PASSWORD: "",
        TRIAL_ACCOUNT_BACKEND_URL: "http://127.0.0.1:1",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已写入前置检查报告/);
  const reportText = readFileSync(reportPath, "utf8");
  const report = JSON.parse(reportText);

  assert.equal(report.scope, "trial-account-rbac-preflight-report");
  assert.equal(report.preflightOnly, true);
  assert.equal(report.passwordEnvPresent, true);
  assert(report.realRBACCheckRequires.includes("backend health is reachable"));
  assert(
    report.notProvenByThisPreflight.includes("backend RBAC authorization"),
  );
  assert(
    report.notProvenByThisPreflight.includes("customer config active revision"),
  );
  assert.deepEqual(report.presentPasswordEnvNames, ["TRIAL_ACCOUNT_PASSWORD"]);
  assert.equal(report.readyForRealRBACCheck, false);
  assert(report.blockers.includes("backend-health-unreachable"));
  assert.match(
    report.suggestedRealRBACCommand,
    /TRIAL_ACCOUNT_BACKEND_URL='http:\/\/127\.0\.0\.1:1'/,
  );
  assert.match(
    report.suggestedRealRBACCommand,
    /TRIAL_ACCOUNT_PASSWORD='<local-demo-password>'/,
  );
  assert.doesNotMatch(
    reportText,
    /should-not-be-stored|Bearer|access_token|Authorization:/i,
  );
  assert.doesNotMatch(reportText, /"roleKey"/);
  assert.doesNotMatch(reportText, /"mobilePermission"/);
  assert.doesNotMatch(reportText, /"mobilePath"/);
  assert.doesNotMatch(reportText, /mobile\.[a-z]+\.access/);
  assert.doesNotMatch(reportText, /\/m\/[a-z]+\/tasks/);
});

test("trial account RBAC verification report is sanitized", () => {
  const report = buildVerificationReport({
    backendURL: "http://127.0.0.1:8300",
    rows: [
      {
        username: "demo_sales",
        roles: "sales",
        mobile: "mobile.sales.access",
        desktopAccessVerified: true,
        debug: 0,
        super: false,
        disabled: false,
      },
    ],
  });

  assert.equal(report.scope, "trial-account-rbac-verification-report");
  assert.equal(report.writesDatabase, false);
  assert.equal(report.backendEndpointAlias, "http://127.0.0.1:8300");
  assert.deepEqual(report.summary, {
    totalAccounts: 1,
    passedAccounts: 1,
    failedAccounts: 0,
  });
  assert.deepEqual(report.redaction, {
    storesPassword: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
  });
  assert.equal(report.checkedAccounts[0].username, "demo_sales");
  assert.equal(report.checkedAccounts[0].role, "业务");
  assert.equal(report.checkedAccounts[0].mobileTaskEntry, "业务岗位任务端");
  assert.equal(report.checkedAccounts[0].mobileAccessVerified, true);
  assert.equal(report.checkedAccounts[0].desktopAccessVerified, true);
  assert.doesNotMatch(
    JSON.stringify(report),
    /Bearer|access_token|local-demo-password|replace-with-password/i,
  );
  assert.doesNotMatch(JSON.stringify(report), /"roles"/);
  assert.doesNotMatch(JSON.stringify(report), /"mobile"/);
  assert.doesNotMatch(JSON.stringify(report), /mobile\.sales\.access/);
  assert.doesNotMatch(JSON.stringify(report), /"sales"/);
});
