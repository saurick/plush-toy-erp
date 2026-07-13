import assert from "node:assert/strict";
import test from "node:test";

import {
  MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE,
  assertManualAcceptanceRetirementComplete,
  buildManualAcceptanceRetirementActions,
  parseManualAcceptanceRetireArgs,
  retireManualAcceptanceSourceData,
} from "./manual-acceptance-source-retire.mjs";
import { buildManualAcceptanceSourceDataPlan } from "./manual-acceptance-source-data.mjs";

function record(id, fields = {}) {
  return { id, ...fields };
}

function ok(data = {}) {
  return {
    ok: true,
    json: async () => ({ result: { code: 0, message: "ok", data } }),
  };
}

test("retirement plan uses only lifecycle actions and master-data deactivation", () => {
  const actions = buildManualAcceptanceRetirementActions({
    salesOrders: [
      record(1, { order_no: "SO-1", lifecycle_status: "DRAFT" }),
      record(2, { order_no: "SO-2", lifecycle_status: "ACTIVE" }),
      record(3, { order_no: "SO-3", lifecycle_status: "CLOSED" }),
    ],
    purchaseOrders: [
      record(4, { purchase_order_no: "PO-1", lifecycle_status: "APPROVED" }),
      record(5, { purchase_order_no: "PO-2", lifecycle_status: "CANCELLED" }),
    ],
    outsourcingOrders: [
      record(6, {
        outsourcing_order_no: "OS-1",
        lifecycle_status: "SUBMITTED",
      }),
    ],
    bomVersions: [
      record(7, { version: "BOM-1", status: "DRAFT" }),
      record(8, { version: "BOM-2", status: "ARCHIVED" }),
    ],
    productSkus: [record(9, { sku_code: "SKU-1", is_active: true })],
    products: [record(10, { code: "P-1", is_active: false })],
    materials: [record(11, { code: "M-1", is_active: true })],
    processes: [record(12, { code: "PROC-1", is_active: true })],
    suppliers: [record(13, { code: "SUP-1", is_active: true })],
    customers: [record(14, { code: "C-1", is_active: true })],
  });

  assert.equal(actions.length, 10);
  assert.deepEqual(
    actions.slice(0, 5).map((item) => item.method),
    [
      "cancel_sales_order",
      "cancel_sales_order",
      "cancel_purchase_order",
      "cancel_outsourcing_order",
      "archive_bom_version",
    ],
  );
  assert(actions.slice(5).every((item) => item.params.active === false));
  assert(actions.every((item) => !/delete|truncate|clear/iu.test(item.method)));
});

test("retirement plan is empty after records are already terminal or inactive", () => {
  const actions = buildManualAcceptanceRetirementActions({
    salesOrders: [record(1, { lifecycle_status: "CANCELLED" })],
    purchaseOrders: [record(2, { lifecycle_status: "CLOSED" })],
    outsourcingOrders: [record(3, { lifecycle_status: "CANCELED" })],
    bomVersions: [record(4, { status: "ARCHIVED" })],
    productSkus: [record(5, { is_active: false })],
    products: [record(6, { is_active: false })],
    materials: [record(7, { is_active: false })],
    processes: [record(8, { is_active: false })],
    suppliers: [record(9, { is_active: false })],
    customers: [record(10, { is_active: false })],
  });

  assert.deepEqual(actions, []);
  assert.equal(
    assertManualAcceptanceRetirementComplete({
      salesOrders: [record(1, { lifecycle_status: "CANCELED" })],
      productSkus: [record(2, { is_active: false })],
    }),
    true,
  );
  assert.throws(
    () =>
      assertManualAcceptanceRetirementComplete({
        customers: [record(3, { is_active: true })],
      }),
    /found 1 records still active or non-terminal/u,
  );
});

test("retirement CLI is local-only and dry-run by default", () => {
  const parsed = parseManualAcceptanceRetireArgs(["--run-id", "LOCAL-UAT"]);
  assert.equal(parsed.apply, false);
  assert.equal(parsed.backendURL, "http://127.0.0.1:8300");
  assert.throws(
    () =>
      parseManualAcceptanceRetireArgs([
        "--backend-url",
        "https://example.invalid",
        "--run-id",
        "REMOTE",
      ]),
    /local-only/u,
  );
});

test("retirement apply requires exact confirmation before login or reads", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "RETIRE-CONFIRM" });
  const previous = process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM;
  delete process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM;
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        retireManualAcceptanceSourceData(plan, {
          apply: true,
          password: "local-demo-password",
          fetchImpl: async () => {
            fetchCalls += 1;
            throw new Error("fetch should not run");
          },
        }),
      new RegExp(MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE, "u"),
    );
    assert.equal(fetchCalls, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM = previous;
    }
  }
});

test("direct retirement rejects an external plan before login", async () => {
  const plan = {
    ...buildManualAcceptanceSourceDataPlan({ runId: "RETIRE-EXTERNAL" }),
    backendURL: "https://example.invalid",
  };
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      retireManualAcceptanceSourceData(plan, {
        password: "local-demo-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run for an external plan");
        },
      }),
    /local-only/u,
  );
  assert.equal(fetchCalls, 0);
});

test("retirement rejects redirected login responses before dataset reads", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "RETIRE-REDIRECT",
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      retireManualAcceptanceSourceData(plan, {
        password: "local-demo-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          return {
            ok: true,
            status: 200,
            redirected: true,
            json: async () => ({ result: { code: 0, data: {} } }),
          };
        },
      }),
    /redirected response/u,
  );
  assert(fetchCalls > 0);
});

test("retirement requires a non-empty active yoyoosun revision before reads", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "RETIRE-EMPTY-REVISION",
  });
  const methods = [];
  await assert.rejects(
    () =>
      retireManualAcceptanceSourceData(plan, {
        password: "local-demo-password",
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          methods.push(body.method);
          if (body.method === "admin_login") {
            return ok({
              access_token: `token-${body.params.username}`,
              is_super_admin: body.params.username === "admin",
            });
          }
          if (body.method === "capabilities") {
            return ok({ environment: "dev" });
          }
          if (body.method === "get_effective_session") {
            return ok({
              session: {
                customer: { key: "yoyoosun" },
                source: "active_customer_config_revision",
                configRevision: " ",
              },
            });
          }
          throw new Error(`unexpected method ${body.method}`);
        },
      }),
    /active customer configuration is not current/u,
  );
  assert(!methods.includes("list_sales_orders"));
});

test("retirement rejects a disabled required module before dataset reads", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "RETIRE-MODULE-OFF",
  });
  const previous = process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM =
    MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE;
  const methods = [];
  try {
    await assert.rejects(
      () =>
        retireManualAcceptanceSourceData(plan, {
          password: "local-demo-password",
          fetchImpl: async (_url, init) => {
            const body = JSON.parse(init.body);
            methods.push(body.method);
            if (body.method === "admin_login") {
              return ok({
                access_token: `token-${body.params.username}`,
                is_super_admin: body.params.username === "admin",
              });
            }
            if (body.method === "capabilities") {
              return ok({ environment: "dev" });
            }
            if (body.method === "get_effective_session") {
              return ok({
                session: {
                  customer: { key: "yoyoosun" },
                  source: "active_customer_config_revision",
                  configRevision: "revision-1",
                  modules: {
                    customers: "enabled",
                    suppliers: "enabled",
                    products: "enabled",
                    materials: "enabled",
                    processes: "enabled",
                    sales_orders: "enabled",
                    purchase_orders: "enabled",
                    outsourcing_orders: "disabled",
                    material_bom: "enabled",
                  },
                },
              });
            }
            throw new Error(`unexpected method ${body.method}`);
          },
        }),
      /required modules are not enabled: outsourcing_orders/u,
    );
    assert(!methods.includes("list_sales_orders"));
    assert(!methods.includes("list_customers"));
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM = previous;
    }
  }
});
