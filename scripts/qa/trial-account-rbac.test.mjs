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
  assert.equal(template.expectedAccounts.length, 10);
  assert(
    template.expectedAccounts.some(
      (item) =>
        item.username === "demo_sales" &&
        item.roleKey === "sales" &&
        item.mobilePermission === "mobile.sales.access",
    ),
  );
  assert(
    template.expectedAccounts.some(
      (item) =>
        item.username === "demo_admin" &&
        item.roleKey === "admin" &&
        item.mobilePermission === null,
    ),
  );
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
    /smoke:trial-demo-browser/,
  );
  assert.match(template.requiredRealEvidence.join("\n"), /admin_login \+ me/);
  assert.match(template.boundary, /does not read passwords/);
  assert.match(template.boundary, /write reports/);
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

  assert.equal(report.scope, "trial-account-rbac-preflight-report");
  assert.equal(report.writesReport, true);
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
  assert.equal(report.readyForRealRBACCheck, false);
  assert(report.blockers.includes("missing-trial-account-password-env"));
  assert(report.blockers.includes("backend-health-unreachable"));
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
        item.roleKey === "engineering" &&
        item.mobilePermission === "mobile.engineering.access" &&
        item.mobilePath === "/m/engineering/tasks" &&
        item.passed,
    ),
  );
  assert(
    report.roleRows.some(
      (item) =>
        item.username === "demo_admin" &&
        item.roleKey === "admin" &&
        item.mobilePermission === null &&
        item.checks.adminHasNoExpectedMobilePermission &&
        item.checks.browserMobileDenied &&
        item.passed,
    ),
  );
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
  assert.equal(report.passwordEnvPresent, true);
  assert.deepEqual(report.presentPasswordEnvNames, ["TRIAL_ACCOUNT_PASSWORD"]);
  assert.equal(report.readyForRealRBACCheck, false);
  assert(report.blockers.includes("backend-health-unreachable"));
  assert.doesNotMatch(
    reportText,
    /should-not-be-stored|Bearer|access_token|Authorization:/i,
  );
});

test("trial account RBAC verification report is sanitized", () => {
  const report = buildVerificationReport({
    backendURL: "http://127.0.0.1:8300",
    rows: [
      {
        username: "demo_sales",
        roles: "sales",
        mobile: "mobile.sales.access",
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
  assert.doesNotMatch(
    JSON.stringify(report),
    /Bearer|access_token|local-demo-password|replace-with-password/i,
  );
});
