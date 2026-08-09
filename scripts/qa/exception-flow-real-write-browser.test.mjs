import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExceptionFlowEvidenceContract,
  exceptionFlowConfirmation,
  normalizeLoopbackOrigin,
  parseExceptionFlowArgs,
  resolveExceptionFlowReportPath,
  staleRetryReceipt,
} from "./exception-flow-real-write-browser.mjs";

const DATABASE_NAME = "plush_erp_acceptance_79da_contract_browser_actions_dev";
const BACKEND_URL = "http://127.0.0.1:8323";
const REPORT =
  "output/qa/manual-acceptance/contracts/exception-flow-browser.json";
const CONFIRMATION = exceptionFlowConfirmation({
  backendURL: BACKEND_URL,
  databaseName: DATABASE_NAME,
});

function validArgs(...extra) {
  return [
    "--base-url",
    "http://localhost:15214/",
    "--backend-url",
    BACKEND_URL,
    "--database-name",
    DATABASE_NAME,
    "--report",
    REPORT,
    ...extra,
  ];
}

function validEnv(extra = {}) {
  return {
    MANUAL_ACCEPTANCE_DEMO_PASSWORD: "unit-test-only-password",
    EXCEPTION_FLOW_BROWSER_CONFIRM: CONFIRMATION,
    ...extra,
  };
}

test("exception-flow browser runner accepts only an explicitly confirmed isolated target", () => {
  const options = parseExceptionFlowArgs(validArgs(), validEnv());
  assert.equal(options.baseURL, "http://localhost:15214");
  assert.equal(options.backendURL, BACKEND_URL);
  assert.equal(options.databaseName, DATABASE_NAME);
  assert.equal(options.password, "unit-test-only-password");
  assert.equal(options.reportPath, resolveExceptionFlowReportPath(REPORT));
  assert.equal(
    CONFIRMATION,
    `RUN_ISOLATED_EXCEPTION_FLOW_BROWSER_ACTIONS:${DATABASE_NAME}:${BACKEND_URL}`,
  );
});

test("exception-flow browser runner rejects non-loopback and credential-bearing origins", () => {
  for (const value of [
    "https://example.invalid",
    "http://user:secret@127.0.0.1:8323",
    "file:///tmp/backend",
    "http://127.0.0.1:8323/path",
  ]) {
    assert.throws(
      () => normalizeLoopbackOrigin(value, "origin"),
      /loopback|credential-free|http or https|path, query, or hash/u,
    );
  }
});

test("exception-flow browser runner rejects the shared backend and non-action databases", () => {
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        validArgs().map((value) =>
          value === BACKEND_URL ? "http://127.0.0.1:8300" : value,
        ),
        validEnv({
          EXCEPTION_FLOW_BROWSER_CONFIRM: `RUN_ISOLATED_EXCEPTION_FLOW_BROWSER_ACTIONS:${DATABASE_NAME}:http://127.0.0.1:8300`,
        }),
      ),
    /shared\/default backend port 8300/u,
  );
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        validArgs().map((value) =>
          value === DATABASE_NAME
            ? "plush_erp_acceptance_local_fixture_dev"
            : value,
        ),
        validEnv(),
      ),
    /dedicated browser_actions acceptance database/u,
  );
});

test("exception-flow browser runner binds confirmation to exact database and backend", () => {
  for (const confirmation of [
    "",
    "yes",
    CONFIRMATION.replace(DATABASE_NAME, `${DATABASE_NAME}_other`),
    CONFIRMATION.replace(":8323", ":8324"),
  ]) {
    assert.throws(
      () =>
        parseExceptionFlowArgs(
          validArgs(),
          validEnv({ EXCEPTION_FLOW_BROWSER_CONFIRM: confirmation }),
        ),
      /EXCEPTION_FLOW_BROWSER_CONFIRM must equal/u,
    );
  }
});

test("exception-flow browser runner keeps reports inside the acceptance evidence root", () => {
  for (const report of [
    "../outside.json",
    "output/qa/outside.json",
    "output/qa/manual-acceptance/contracts/report.txt",
  ]) {
    assert.throws(
      () => resolveExceptionFlowReportPath(report),
      /JSON file under output\/qa\/manual-acceptance/u,
    );
  }
});

test("exception-flow browser runner fails closed on incomplete or unsupported arguments", () => {
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        ["--base-url", "http://localhost:15214"],
        validEnv(),
      ),
    /required/u,
  );
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        [...validArgs(), "--unknown", "value"],
        validEnv(),
      ),
    /unsupported argument/u,
  );
  assert.throws(
    () =>
      parseExceptionFlowArgs(
        validArgs(),
        validEnv({ MANUAL_ACCEPTANCE_DEMO_PASSWORD: "" }),
      ),
    /MANUAL_ACCEPTANCE_DEMO_PASSWORD is required/u,
  );
});

function validEvidenceReport() {
  return {
    flows: Array.from({ length: 3 }, (_, index) => ({
      key: `flow-${index + 1}`,
      passed: true,
      retry: {
        code: 40920,
        result: "duplicate_or_stale_rejected",
      },
    })),
    negativePermissions: Array.from({ length: 3 }, () => ({
      code: 40304,
      result: "server_rejected",
    })),
    simulatedTransportFaults: Array.from({ length: 3 }, () => ({
      injected: true,
      backendResultCode: 0,
      transportFault: "response_dropped_after_backend_completed",
    })),
  };
}

test("exception-flow browser runner requires the exact stale-write error code", () => {
  assert.deepEqual(
    staleRetryReceipt(
      { status: 200, json: { result: { code: 40920 } } },
      "inventory",
      "cancel_inventory_operation",
    ),
    {
      service: "inventory",
      method: "cancel_inventory_operation",
      httpStatus: 200,
      code: 40920,
      result: "duplicate_or_stale_rejected",
    },
  );
  for (const code of [0, 40304, 40910, null]) {
    assert.throws(
      () =>
        staleRetryReceipt(
          { status: 200, json: { result: { code } } },
          "inventory",
          "cancel_inventory_operation",
        ),
      /STALE_WRITE_CONFLICT/u,
    );
  }
});

test("exception-flow browser report contract fails closed on incomplete evidence", () => {
  assert.equal(
    assertExceptionFlowEvidenceContract(validEvidenceReport()),
    true,
  );

  for (const mutate of [
    (report) => report.flows.pop(),
    (report) => {
      report.flows[0].retry.code = 40910;
    },
    (report) => {
      report.negativePermissions[0].code = 0;
    },
    (report) => {
      report.simulatedTransportFaults[0].backendResultCode = 500;
    },
  ]) {
    const report = validEvidenceReport();
    mutate(report);
    assert.throws(() => assertExceptionFlowEvidenceContract(report));
  }
});
