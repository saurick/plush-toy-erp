import assert from "node:assert/strict";
import { execFile as execFileWithCallback } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
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

test("operational fact simulated closure plan marks data as simulated and excludes customer acceptance blocker", () => {
  const options = parseCliArgs([
    "--product-id",
    "1",
    "--unit-id",
    "2",
    "--warehouse-id",
    "3",
    "--run-id",
    "demo run",
  ]);
  const plan = buildPlan(options);

  assert.equal(plan.scope, "Operational Facts");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.customerAcceptanceRequiredForClosure, false);
  assert.deepEqual(plan.ids, {
    productId: 1,
    unitId: 2,
    warehouseId: 3,
  });
  assert.match(plan.records.productionReceipt.fact_no, /^SIM-YOYOOSUN-OPFACT-/u);
  assert.equal(plan.records.productionReceipt.fact_type, "FINISHED_GOODS_RECEIPT");
  assert.equal(plan.records.outsourcingIssue.fact_type, "MATERIAL_ISSUE");
  assert.equal(plan.records.financeSettle.fact_type, "RECEIVABLE");
  assert.equal(plan.records.financeCancel.fact_type, "INVOICE");
});

test("operational fact simulated closure refuses real import style flags", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "--product-id",
        "1",
        "--unit-id",
        "1",
        "--warehouse-id",
        "1",
        "--real-import",
      ]),
    /refuses real import/u,
  );
});

test("operational fact simulated closure rejects credentialed backend URL", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "--backend-url",
        "http://demo:secret@127.0.0.1:8300",
        "--product-id",
        "1",
        "--unit-id",
        "1",
        "--warehouse-id",
        "1",
      ]),
    /backend URL must not contain username or password/u,
  );
});

test("operational fact simulated closure requires positive ids", () => {
  assert.throws(
    () =>
      buildPlan({
        backendURL: "http://127.0.0.1:8300",
        runId: "T",
        productId: 1,
        unitId: 1,
      }),
    /warehouseId must be a positive integer/u,
  );
});

test("operational fact simulated closure normalizes run ids", () => {
  assert.equal(sanitizeRunId("  a/b c  "), "A-B-C");
  assert.equal(
    buildTimestampRunId(new Date("2026-06-08T12:34:56.789Z")),
    "20260608T123456Z",
  );
});

test("operational fact simulated closure input template is no-write", () => {
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
  assert.equal(template.downstreamApplyWritesDatabase, true);
  assert.match(template.commands.printInputTemplate, /--print-input-template/u);
  assert.match(template.commands.reportOnly, /--product-id <active_product_id>/u);
  assert.match(template.commands.applySimulated, /OPERATIONAL_FACT_SIM_CONFIRM/u);
  assert.match(template.boundary, /does not write reports/u);
});

test("operational fact simulated closure CLI input template does not require IDs or write reports", async () => {
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
  assert.equal(template.writesReports, false);
  assert.equal(template.requiredReportInputs.includes("--product-id <active_product_id>"), true);
  await assert.rejects(() => access(out), /ENOENT/u);
});

test("operational fact simulated closure input template cannot be combined with apply", () => {
  assert.throws(
    () => parseCliArgs(["--print-input-template", "--apply"]),
    /cannot be combined/u,
  );
});
