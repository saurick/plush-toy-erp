import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildInputTemplate,
  buildPreflightReport,
} from "./purchase-receipt-real-write-e2e.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(ROOT_DIR, "scripts/qa/purchase-receipt-real-write-e2e.mjs");

const buildSpawnMock = ({ pgReady = true } = {}) => (command, args) => {
  if (command === "go") {
    return {
      status: 0,
      stdout: "go version go1.26.1 darwin/arm64\n",
      stderr: "",
    };
  }
  if (command === "pg_isready") {
    return pgReady
      ? {
          status: 0,
          stdout: `${args[1]}:${args[3]} - accepting connections\n`,
          stderr: "",
        }
      : {
          status: 2,
          stdout: `${args[1]}:${args[3]} - no response\n`,
          stderr: "",
        };
  }
  return { status: 127, stdout: "", stderr: "not mocked" };
};

test("purchase receipt real-write e2e input template is no-write and keeps downstream write boundary visible", () => {
  const template = buildInputTemplate();

  assert.equal(template.scope, "purchase-receipt-real-write-e2e-input-template");
  assert.equal(template.writesReports, false);
  assert.equal(template.runsGoTests, false);
  assert.equal(template.writesTestDatabase, false);
  assert.equal(template.writesProductionDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.realCustomerImport, false);
  assert.equal(template.downstreamWritesReports, true);
  assert.equal(template.downstreamRunsGoTests, true);
  assert.equal(template.downstreamWritesTestDatabase, true);
  assert.match(
    template.commands.join("\n"),
    /purchase-receipt-real-write-e2e\.mjs --print-input-template/,
  );
  assert.match(template.commands.join("\n"), /--preflight-report/);
  assert.match(template.commands.join("\n"), /--with-postgres/);
  assert.match(template.boundary, /does not run Go tests/);
  assert.match(template.boundary, /preflight report writes a local sanitized JSON readiness report only/);
  assert.match(template.boundary, /local\/test only/);
});

test("purchase receipt real-write e2e CLI input template does not write reports", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "purchase-receipt-template-"));
  fs.rmSync(out, { recursive: true, force: true });

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--print-input-template",
      "--out",
      out,
      "--with-postgres",
    ],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(out), false);
  const template = JSON.parse(result.stdout);
  assert.equal(template.scope, "purchase-receipt-real-write-e2e-input-template");
  assert.equal(template.writesReports, false);
  assert.equal(template.runsGoTests, false);
  assert.equal(template.writesTestDatabase, false);
});

test("purchase receipt real-write e2e preflight report is local no-write and checks anchors", () => {
  const report = buildPreflightReport({
    out: "output/qa/purchase-receipt-real-write-e2e",
    withPostgres: false,
  });

  assert.equal(report.scope, "purchase-receipt-real-write-e2e-preflight-report");
  assert.equal(report.writesPreflightReport, true);
  assert.equal(report.writesE2EReport, false);
  assert.equal(report.runsGoTests, false);
  assert.equal(report.invokesMakeTargets, false);
  assert.equal(report.connectsPostgres, false);
  assert.equal(report.writesTestDatabase, false);
  assert.equal(report.writesProductionDatabase, false);
  assert.equal(report.callsBackend, false);
  assert.equal(report.realCustomerImport, false);
  assert.equal(report.storesDbUrlValue, false);
  assert.equal(report.serviceLayer.goModExists, true);
  assert.equal(report.serviceLayer.testFileExists, true);
  assert.equal(
    report.serviceLayer.requiredServiceTests.every((item) => item.exists),
    true,
  );
  assert.equal(report.postgresGuard.requested, false);
  assert.equal(report.postgresGuard.guardScriptExists, true);
  assert.equal(report.postgresGuard.makeTargetExists, true);
  assert.match(report.boundary, /does not run Go tests/);
  assert.match(report.boundary, /does not .*connect to PostgreSQL/);
});

test("purchase receipt real-write e2e preflight requires pg_isready when postgres mode is requested", () => {
  const secretDsn =
    "postgres://postgres:super-secret-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable";
  const report = buildPreflightReport(
    {
      out: "output/qa/purchase-receipt-real-write-e2e",
      withPostgres: true,
    },
    {
      env: {
        ...process.env,
        PURCHASE_RECEIPT_PG_DB_URL: secretDsn,
      },
      spawnSync: buildSpawnMock({ pgReady: true }),
    },
  );

  assert.equal(report.readyForRequestedCommand, true);
  assert.equal(report.postgresGuard.readyForRequestedPostgresMode, true);
  assert.equal(report.postgresGuard.target.safeTarget, "127.0.0.1:55432/plush_erp_purchase_receipt_test");
  assert.equal(report.postgresGuard.target.urlValueStored, false);
  assert.equal(report.postgresGuard.readiness.checked, true);
  assert.equal(report.postgresGuard.readiness.reachable, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(JSON.stringify(report).includes("super-secret-password"), false);
  assert.equal(JSON.stringify(report).includes(secretDsn), false);
});

test("purchase receipt real-write e2e preflight blocks postgres mode when local database is not reachable", () => {
  const report = buildPreflightReport(
    {
      out: "output/qa/purchase-receipt-real-write-e2e",
      withPostgres: true,
    },
    {
      env: {
        ...process.env,
        PURCHASE_RECEIPT_PG_DB_URL:
          "postgres://postgres:local-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable",
      },
      spawnSync: buildSpawnMock({ pgReady: false }),
    },
  );

  assert.equal(report.readyForRequestedCommand, false);
  assert.equal(report.postgresGuard.readyForRequestedPostgresMode, false);
  assert.equal(report.postgresGuard.readiness.checked, true);
  assert.equal(report.postgresGuard.readiness.reachable, false);
  assert.equal(report.blockers.includes("postgres-not-ready"), true);
  assert.equal(JSON.stringify(report).includes("local-password"), false);
});

test("purchase receipt real-write e2e CLI preflight writes sanitized report", () => {
  const reportPath =
    "output/qa/purchase-receipt-real-write-e2e-test-preflight/preflight.json";
  const absoluteReportPath = path.join(ROOT_DIR, reportPath);
  fs.rmSync(path.dirname(absoluteReportPath), { recursive: true, force: true });

  const secretDsn =
    "postgres://postgres:super-secret-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable";
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--with-postgres",
      "--preflight-report",
      reportPath,
    ],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        PURCHASE_RECEIPT_PG_DB_URL: secretDsn,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(absoluteReportPath), true);
  const raw = fs.readFileSync(absoluteReportPath, "utf8");
  assert.equal(raw.includes("super-secret-password"), false);
  assert.equal(raw.includes(secretDsn), false);
  const report = JSON.parse(raw);
  assert.equal(report.scope, "purchase-receipt-real-write-e2e-preflight-report");
  assert.equal(report.withPostgres, true);
  assert.equal(report.postgresGuard.requested, true);
  assert.equal(report.postgresGuard.dbUrlEnvPresent, true);
  assert.equal(report.postgresGuard.dbUrlValueStored, false);
  assert.equal(report.runsGoTests, false);
  assert.equal(report.connectsPostgres, false);
  assert.equal(report.writesTestDatabase, false);
});

test("purchase receipt real-write e2e CLI preflight refuses report outside repo", () => {
  const out = path.join(os.tmpdir(), "purchase-receipt-preflight-outside.json");
  fs.rmSync(out, { force: true });

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--preflight-report",
      out,
    ],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--preflight-report must stay inside repo/);
  assert.equal(fs.existsSync(out), false);
});
