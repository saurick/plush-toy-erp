import assert from "node:assert/strict";
import { execFile as execFileWithCallback } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  APPLY_RETIRED_MESSAGE,
  applyPlan,
  assertLocalBackendURL,
  buildInputTemplate,
  buildPlan,
  buildTimestampRunId,
  INPUT_TEMPLATE_SCOPE,
  parseCliArgs,
  sanitizeRunId,
} from "./operational-fact-simulated-closure.mjs";

const scriptPath = fileURLToPath(
  new URL("./operational-fact-simulated-closure.mjs", import.meta.url),
);
const execFile = promisify(execFileWithCallback);

function buildLocalPlan(overrides = {}) {
  return buildPlan({
    ...parseCliArgs([
      "--customer-id",
      "4",
      "--product-id",
      "1",
      "--material-id",
      "5",
      "--unit-id",
      "2",
      "--warehouse-id",
      "3",
      "--run-id",
      "write-guard",
    ]),
    ...overrides,
  });
}

test("operational fact report plan remains simulated and explicitly non-applicable", () => {
  const plan = buildLocalPlan({ runId: "DEMO-RUN" });

  assert.equal(plan.scope, "Operational Facts");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.customerAcceptanceRequiredForClosure, false);
  assert.equal(plan.applySupported, false);
  assert.equal(plan.applyRetiredReason, APPLY_RETIRED_MESSAGE);
  assert.deepEqual(plan.ids, {
    customerId: 4,
    productId: 1,
    unitId: 2,
    warehouseId: 3,
    materialId: 5,
  });
  assert.match(plan.records.productionReceipt.fact_no, /^SIM-YOYOOSUN-OPFACT-/u);
  assert.equal(plan.records.productionReceipt.fact_type, "FINISHED_GOODS_RECEIPT");
  assert.equal(plan.records.outsourcingIssue.fact_type, "MATERIAL_ISSUE");
  assert.equal(plan.records.financeSettle.fact_type, "RECEIVABLE");
  assert.equal(plan.records.financeCancel.fact_type, "INVOICE");
  assert.equal(plan.records.productionDraftSample.fact_type, "REWORK");
  assert.equal(plan.records.shipment.customer_id, 4);
  assert.equal(plan.records.financeSettle.counterparty_id, 4);
});

test("operational fact report plan only links source documents when both order ids exist", () => {
  const plan = buildLocalPlan({ salesOrderId: 77, salesOrderItemId: 88 });

  assert.equal(plan.records.outsourcingIssue.source_type, "SALES_ORDER");
  assert.equal(plan.records.outsourcingIssue.source_id, 77);
  assert.equal(plan.records.productionReceipt.source_type, "SALES_ORDER");
  assert.equal(plan.records.productionReceipt.source_id, 77);
  assert.equal(plan.records.stockReservationRelease.sales_order_id, 77);
  assert.equal(plan.records.stockReservationRelease.sales_order_item_id, 88);
  assert.equal(plan.records.shipment.sales_order_id, 77);
  assert.equal(plan.records.shipmentItem.sales_order_item_id, 88);
  assert.throws(
    () => buildLocalPlan({ salesOrderId: 77 }),
    /salesOrderId and salesOrderItemId must be provided together/u,
  );
});

test("operational fact report plan keeps source-derived reservation fields out of requests", () => {
  const options = parseCliArgs([
    "--customer-id",
    "4",
    "--customer-name",
    "【试用】华南礼品客户 01",
    "--product-id",
    "1",
    "--product-sku-id",
    "11",
    "--material-id",
    "5",
    "--unit-id",
    "2",
    "--warehouse-id",
    "3",
    "--supplier-id",
    "9",
    "--supplier-name",
    "【试用】面料供应商 01",
    "--payable-status",
    "settled",
    "--reconciliation-status",
    "cancelled",
    "--receivable-status",
    "draft",
    "--invoice-status",
    "posted",
    "--run-id",
    "sku-payable",
  ]);
  const plan = buildPlan(options);

  assert.equal(plan.ids.productSkuId, 11);
  assert.equal(plan.records.productionReceipt.product_sku_id, 11);
  assert.equal(plan.records.stockReservationRelease.product_id, undefined);
  assert.equal(plan.records.stockReservationRelease.product_sku_id, undefined);
  assert.equal(plan.records.stockReservationRelease.unit_id, undefined);
  assert.equal(plan.records.shipmentItem.product_sku_id, 11);
  assert.equal(plan.records.financePayable.target_status, "SETTLED");
  assert.equal(plan.records.financeReconciliation.target_status, "CANCELLED");
  assert.equal(plan.records.financeSettle.target_status, "DRAFT");
  assert.equal(plan.records.financeCancel.target_status, "POSTED");
});

test("operational fact report CLI refuses real import flags and credentialed URLs", () => {
  assert.throws(
    () => parseCliArgs(["--real-import"]),
    /refuses real import/u,
  );
  assert.throws(
    () =>
      parseCliArgs([
        "--backend-url",
        "http://demo:secret@127.0.0.1:8300",
      ]),
    /backend URL must not contain username or password/u,
  );
});

test("loopback URL validator remains exact for callers that inspect report targets", () => {
  assert.equal(
    assertLocalBackendURL("http://LOCALHOST:8300/base/?ignored=1#hash"),
    "http://localhost:8300/base",
  );
  assert.equal(
    assertLocalBackendURL("http://127.0.0.1:8300/"),
    "http://127.0.0.1:8300",
  );
  assert.throws(
    () => assertLocalBackendURL("http://127.0.0.1.example.com:8300"),
    /external backend/u,
  );
});

test("standalone apply is retired before report or network side effects", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "opfact-retired-"));
  await rm(out, { recursive: true, force: true });

  await assert.rejects(
    () => execFile(process.execPath, [scriptPath, "--apply", "--out", out]),
    (error) => {
      assert.match(error.stderr, new RegExp(APPLY_RETIRED_MESSAGE, "u"));
      return true;
    },
  );
  await assert.rejects(() => access(out), /ENOENT/u);
});

test("exported apply is retired before reading inputs or calling dependencies", async () => {
  let dependencyCalls = 0;
  await assert.rejects(
    () =>
      applyPlan(
        new Proxy(
          {},
          {
            get() {
              dependencyCalls += 1;
              throw new Error("plan must not be read");
            },
          },
        ),
        {},
        {
          fetchImpl: async () => {
            dependencyCalls += 1;
            throw new Error("network must not run");
          },
        },
      ),
    new RegExp(APPLY_RETIRED_MESSAGE, "u"),
  );
  assert.equal(dependencyCalls, 0);
});

test("operational fact report plan requires positive ids", () => {
  assert.throws(
    () =>
      buildPlan({
        backendURL: "http://127.0.0.1:8300",
        runId: "T",
        customerId: 1,
        productId: 1,
        materialId: 1,
        unitId: 1,
      }),
    /warehouseId must be a positive integer/u,
  );
});

test("operational fact report plan normalizes run ids", () => {
  assert.equal(sanitizeRunId("  a/b c  "), "A-B-C");
  assert.equal(
    buildTimestampRunId(new Date("2026-06-08T12:34:56.789Z")),
    "20260608T123456Z",
  );
});

test("operational fact input template is no-write and has no apply command", () => {
  const template = buildInputTemplate({
    out: "output/custom/opfact",
    runId: "demo run",
  });

  assert.equal(template.scope, INPUT_TEMPLATE_SCOPE);
  assert.equal(template.simulatedOnly, true);
  assert.equal(template.realCustomerImport, false);
  assert.equal(template.writesReports, false);
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.downstreamReportOnlyWritesReports, true);
  assert.equal(template.downstreamApplyWritesDatabase, false);
  assert.equal(template.applySupported, false);
  assert.equal(template.applyRetiredReason, APPLY_RETIRED_MESSAGE);
  assert.deepEqual(template.requiredApplyInputs, []);
  assert.equal(Object.hasOwn(template.commands, "applySimulated"), false);
  assert.match(template.commands.printInputTemplate, /--print-input-template/u);
  assert.match(template.commands.reportOnly, /--customer-id <active_customer_id>/u);
  assert.match(template.boundary, /does not write reports/u);
});

test("input template CLI needs no ids and writes no reports", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "opfact-template-"));
  await rm(out, { recursive: true, force: true });
  const { stdout } = await execFile(process.execPath, [
    scriptPath,
    "--print-input-template",
    "--out",
    out,
  ]);
  const template = JSON.parse(stdout);

  assert.equal(template.scope, INPUT_TEMPLATE_SCOPE);
  assert.equal(template.applySupported, false);
  assert.deepEqual(template.requiredApplyInputs, []);
  await assert.rejects(() => access(out), /ENOENT/u);
});

test("report-only CLI still writes an explicitly non-applicable report", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "opfact-report-"));
  const { stdout } = await execFile(process.execPath, [
    scriptPath,
    "--customer-id",
    "4",
    "--product-id",
    "1",
    "--material-id",
    "5",
    "--unit-id",
    "2",
    "--warehouse-id",
    "3",
    "--run-id",
    "report-only",
    "--out",
    out,
  ]);
  assert.match(stdout, /report-only complete/u);
  const report = JSON.parse(
    await readFile(
      path.join(out, "operational-fact-simulated-closure-report.json"),
      "utf8",
    ),
  );
  assert.equal(report.mode, "report-only");
  assert.equal(report.plan.applySupported, false);
  assert.deepEqual(report.steps, []);
  await rm(out, { recursive: true, force: true });
});

test("parseCliArgs rejects apply even when combined with input-template mode", () => {
  assert.throws(
    () => parseCliArgs(["--print-input-template", "--apply"]),
    new RegExp(APPLY_RETIRED_MESSAGE, "u"),
  );
});
