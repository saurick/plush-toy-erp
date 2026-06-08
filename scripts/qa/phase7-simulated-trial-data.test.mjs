import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CONFIRM_PHRASE,
  SIMULATION_PREFIX,
  assertDatasetBoundary,
  buildSimulatedDataset,
  parseCliArgs,
  runPhase7SimulatedTrialData,
} from "./phase7-simulated-trial-data.mjs";

test("phase7 simulated dataset is explicitly simulated and excludes fact domains", () => {
  const dataset = buildSimulatedDataset({ productId: 1, unitId: 2 });

  assert.equal(dataset.simulatedOnly, true);
  assert.equal(dataset.realCustomerImport, false);
  assert.equal(dataset.simulationPrefix, SIMULATION_PREFIX);
  assert.equal(dataset.records.salesOrderItem.product_id, 1);
  assert.equal(dataset.records.salesOrderItem.unit_id, 2);
  assert.equal(dataset.records.supplier.supplier_type, "material");
  assertDatasetBoundary(dataset);
  assert.deepEqual(
    Object.keys(dataset.records).filter((key) =>
      /shipment|inventory|stock|finance|invoice|payment/u.test(key),
    ),
    [],
  );
});

test("phase7 CLI refuses real import style flags", () => {
  assert.throws(
    () => parseCliArgs(["--execute"]),
    /refuses real import style flag/u,
  );
  assert.throws(
    () => parseCliArgs(["--real-import"]),
    /refuses real import style flag/u,
  );
});

test("phase7 report-only mode writes a simulated report without backend calls", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "phase7-sim-"));
  try {
    const report = await runPhase7SimulatedTrialData({
      ...parseCliArgs(["--out", out]),
    });
    const saved = JSON.parse(
      await readFile(
        path.join(out, "phase7-simulated-trial-report.json"),
        "utf8",
      ),
    );
    assert.equal(report.mode, "report-only");
    assert.equal(saved.simulatedOnly, true);
    assert.equal(saved.realCustomerImport, false);
    assert.equal(saved.noSchemaOrMigrationChange, true);
    assert.equal(saved.noShipmentInventoryFinanceFacts, true);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("phase7 apply requires explicit simulated confirmation", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "phase7-sim-"));
  const previousConfirm = process.env.PHASE7_SIM_CONFIRM;
  delete process.env.PHASE7_SIM_CONFIRM;
  try {
    await assert.rejects(
      () =>
        runPhase7SimulatedTrialData(
          parseCliArgs([
            "--apply",
            "--out",
            out,
            "--product-id",
            "1",
            "--unit-id",
            "2",
          ]),
        ),
      /PHASE7_SIM_CONFIRM/u,
    );
  } finally {
    if (previousConfirm === undefined) {
      delete process.env.PHASE7_SIM_CONFIRM;
    } else {
      process.env.PHASE7_SIM_CONFIRM = previousConfirm;
    }
    await rm(out, { recursive: true, force: true });
  }
});

test("phase7 apply uses only V1 masterdata and sales_order RPC methods", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "phase7-sim-"));
  const previousConfirm = process.env.PHASE7_SIM_CONFIRM;
  const previousToken = process.env.PHASE7_SIM_ADMIN_TOKEN;
  process.env.PHASE7_SIM_CONFIRM = CONFIRM_PHRASE;
  process.env.PHASE7_SIM_ADMIN_TOKEN = "test-token";
  const calls = [];
  const counters = {
    customer: 10,
    supplier: 20,
    customerContact: 30,
    supplierContact: 31,
    salesOrder: 40,
    salesOrderItem: 50,
  };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: body.method, params: body.params });
    const dataByMethod = {
      list_customers: { customers: [] },
      create_customer: { customer: { id: counters.customer } },
      list_suppliers: { suppliers: [] },
      create_supplier: { supplier: { id: counters.supplier } },
      list_contacts_by_owner: { contacts: [] },
      create_contact:
        body.params.owner_type === "CUSTOMER"
          ? { contact: { id: counters.customerContact } }
          : { contact: { id: counters.supplierContact } },
      list_sales_orders: { sales_orders: [] },
      create_sales_order: { sales_order: { id: counters.salesOrder } },
      list_sales_order_items: { sales_order_items: [] },
      add_sales_order_item: {
        sales_order_item: { id: counters.salesOrderItem },
      },
    };
    return {
      ok: true,
      json: async () => ({
        result: { code: 0, data: dataByMethod[body.method] || {} },
      }),
    };
  };
  try {
    const report = await runPhase7SimulatedTrialData(
      parseCliArgs([
        "--apply",
        "--out",
        out,
        "--product-id",
        "1",
        "--unit-id",
        "2",
      ]),
      { fetchImpl },
    );
    assert.equal(report.mode, "apply-simulated-data");
    assert.deepEqual(
      calls.map((call) => call.method),
      [
        "list_customers",
        "create_customer",
        "list_suppliers",
        "create_supplier",
        "list_contacts_by_owner",
        "create_contact",
        "list_contacts_by_owner",
        "create_contact",
        "list_sales_orders",
        "create_sales_order",
        "list_sales_order_items",
        "add_sales_order_item",
      ],
    );
    assert.equal(
      calls.some((call) =>
        /ship|shipment|inventory|stock|finance|invoice|payment/u.test(
          call.method,
        ),
      ),
      false,
    );
    assert.equal(calls.at(-1).params.product_id, 1);
    assert.equal(calls.at(-1).params.unit_id, 2);
  } finally {
    if (previousConfirm === undefined) {
      delete process.env.PHASE7_SIM_CONFIRM;
    } else {
      process.env.PHASE7_SIM_CONFIRM = previousConfirm;
    }
    if (previousToken === undefined) {
      delete process.env.PHASE7_SIM_ADMIN_TOKEN;
    } else {
      process.env.PHASE7_SIM_ADMIN_TOKEN = previousToken;
    }
    await rm(out, { recursive: true, force: true });
  }
});
