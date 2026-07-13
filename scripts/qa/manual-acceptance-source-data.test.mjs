import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SOURCE_DATA_SCALE,
  applyManualAcceptanceSourceData,
  buildSalesOrderLineReferences,
  buildManualAcceptanceSourceDataPlan,
  planBOMItemReconciliation,
  parseManualAcceptanceSourceDataArgs,
  requireLifecycleMutationStatus,
  runManualAcceptanceSourceDataCli,
  sanitizeManualAcceptanceRunId,
  statusCounts,
  verifyManualAcceptanceSourceData,
} from "./manual-acceptance-source-data.mjs";

const forbiddenVisibleCopy =
  /\b(?:workflow|fact|json-rpc|rbac|usecase|schema|api|debugrunid|raw id)\b|甲方/iu;

function ok(data = {}) {
  return {
    ok: true,
    json: async () => ({ result: { code: 0, message: "ok", data } }),
  };
}

function visibleStrings(value, key = "") {
  if (value == null) return [];
  if (typeof value === "string") {
    return ["targetStatus", "subject_type"].includes(key) ? [] : [value];
  }
  if (Array.isArray(value))
    return value.flatMap((item) => visibleStrings(item, key));
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([childKey, item]) =>
      visibleStrings(item, childKey),
    );
  }
  return [];
}

test("manual acceptance source plan reaches every agreed pagination threshold", () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "LOCAL-UAT",
    backendURL: "http://127.0.0.1:8300",
  });

  assert.equal(plan.prefix, "SIM-YOYOOSUN-UAT-LOCAL-UAT");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.directSQL, false);
  assert.equal(plan.allowExternalBaseURL, false);
  assert.equal(
    plan.records.customers.length,
    DEFAULT_SOURCE_DATA_SCALE.customers,
  );
  assert.equal(
    plan.records.suppliers.length,
    DEFAULT_SOURCE_DATA_SCALE.suppliers,
  );
  assert.equal(
    plan.records.materials.length,
    DEFAULT_SOURCE_DATA_SCALE.materials,
  );
  assert.equal(
    plan.records.products.length,
    DEFAULT_SOURCE_DATA_SCALE.products,
  );
  assert.equal(
    plan.records.products.flatMap((item) => item.skus).length,
    DEFAULT_SOURCE_DATA_SCALE.products *
      DEFAULT_SOURCE_DATA_SCALE.skusPerProduct,
  );
  assert.equal(
    plan.records.processes.length,
    DEFAULT_SOURCE_DATA_SCALE.processes,
  );
  assert.equal(
    plan.records.salesOrders.length,
    DEFAULT_SOURCE_DATA_SCALE.salesOrders,
  );
  assert.equal(
    plan.records.purchaseOrders.length,
    DEFAULT_SOURCE_DATA_SCALE.purchaseOrders,
  );
  assert.equal(
    plan.records.outsourcingOrders.length,
    DEFAULT_SOURCE_DATA_SCALE.outsourcingOrders,
  );
  assert.equal(
    plan.records.bomVersions.length,
    DEFAULT_SOURCE_DATA_SCALE.bomVersions,
  );
  assert.ok(plan.records.customers.some((item) => item.contacts.length === 0));
  assert.ok(plan.records.customers.some((item) => item.contacts.length === 1));
  assert.ok(plan.records.customers.some((item) => item.contacts.length === 2));
  assert.ok(plan.records.suppliers.some((item) => item.contacts.length === 0));
  assert.ok(plan.records.suppliers.some((item) => item.contacts.length === 1));
  assert.ok(plan.records.suppliers.some((item) => item.contacts.length === 2));

  for (const key of ["salesOrders", "purchaseOrders", "outsourcingOrders"]) {
    assert.ok(
      plan.records[key].some((item) => item.items.length === 25),
      `${key} needs a 25-line boundary sample`,
    );
    assert.ok(
      plan.records[key].some((item) => item.items.length === 8),
      `${key} needs an 8-line boundary sample`,
    );
  }
  assert.ok(
    plan.records.salesOrders.some(
      (item) => item.targetStatus === "ACTIVE" && item.items.length === 25,
    ),
    "sales orders need an active 25-line source for linked shipment testing",
  );
  assert.ok(plan.records.bomVersions.some((item) => item.items.length === 25));
});

test("manual acceptance source plan covers supported business lifecycle states", () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "STATE-MATRIX" });
  const states = (records) =>
    [...new Set(records.map((item) => item.targetStatus))].sort();

  assert.deepEqual(states(plan.records.salesOrders), [
    "ACTIVE",
    "CANCELED",
    "CLOSED",
    "DRAFT",
    "SUBMITTED",
  ]);
  assert.deepEqual(states(plan.records.purchaseOrders), [
    "APPROVED",
    "CANCELED",
    "CLOSED",
    "DRAFT",
    "SUBMITTED",
  ]);
  assert.deepEqual(states(plan.records.outsourcingOrders), [
    "CANCELED",
    "CLOSED",
    "CONFIRMED",
    "DRAFT",
    "SUBMITTED",
  ]);
  assert.deepEqual(states(plan.records.bomVersions), [
    "ACTIVE",
    "ARCHIVED",
    "DRAFT",
  ]);

  const inactiveCounts = {
    customers: plan.records.customers.filter((item) => item.isActive === false)
      .length,
    suppliers: plan.records.suppliers.filter((item) => item.isActive === false)
      .length,
    materials: plan.records.materials.filter((item) => item.isActive === false)
      .length,
    products: plan.records.products.filter((item) => item.isActive === false)
      .length,
    processes: plan.records.processes.filter((item) => item.isActive === false)
      .length,
  };
  assert.deepEqual(inactiveCounts, {
    customers: 5,
    suppliers: 5,
    materials: 6,
    products: 2,
    processes: 3,
  });
  assert.deepEqual(
    [
      ...new Set(plan.records.suppliers.map((item) => item.supplier_type)),
    ].sort(),
    ["material", "mixed", "outsourcing"],
  );
});

test("status counts preserve inactive false values", () => {
  assert.deepEqual(
    statusCounts(
      [{ is_active: true }, { is_active: false }, { is_active: false }],
      "is_active",
    ),
    { TRUE: 1, FALSE: 2 },
  );
});

test("business-visible fixture copy uses trial-user wording without developer jargon", () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "COPY-CHECK" });
  for (const text of visibleStrings(plan.records)) {
    assert.doesNotMatch(text, forbiddenVisibleCopy);
  }
  assert.match(plan.records.customers[0].name, /^【试用】/u);
  assert.match(plan.records.suppliers[0].name, /^【试用】/u);
  assert.match(plan.records.materials[0].name, /^【试用】/u);
  assert.match(plan.records.products[0].name, /^【试用】/u);
});

test("CLI remains report-only by default and refuses implicit external targets", async () => {
  const parsed = parseManualAcceptanceSourceDataArgs([
    "--run-id",
    "LOCAL-UAT",
    "--json",
  ]);
  assert.equal(parsed.apply, false);
  assert.equal(parsed.verify, false);

  const reportOnly = await runManualAcceptanceSourceDataCli([
    "--run-id",
    "LOCAL-UAT",
    "--json",
  ]);
  assert.equal(reportOnly.exitCode, 0);
  assert.equal(reportOnly.plan.simulatedOnly, true);

  await assert.rejects(
    () =>
      runManualAcceptanceSourceDataCli([
        "--backend-url",
        "https://example.invalid",
        "--run-id",
        "EXTERNAL",
      ]),
    /refuse external backend/u,
  );
});

test("apply requires the exact simulation confirmation before any backend call", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "CONFIRM-CHECK" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(plan, {
          password: "local-demo-password",
          fetchImpl: async () => {
            fetchCalls += 1;
            throw new Error("fetch should not run");
          },
        }),
      /apply requires MANUAL_ACCEPTANCE_SIM_CONFIRM/u,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    if (previous === undefined)
      delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
    else process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM = previous;
  }
});

test("direct source apply rejects an external plan before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "DIRECT-EXTERNAL",
    backendURL: "https://example.invalid",
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceSourceData(plan, {
        password: "local-demo-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run for an external plan");
        },
      }),
    /refuse external backend/u,
  );
  assert.equal(fetchCalls, 0);
});

test("direct source verification rejects an external plan before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "VERIFY-EXTERNAL",
    backendURL: "https://example.invalid",
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      verifyManualAcceptanceSourceData(plan, {
        password: "local-demo-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run for external verification");
        },
      }),
    /refuse external backend/u,
  );
  assert.equal(fetchCalls, 0);
});

test("source verification requires a separate local super-admin credential before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "VERIFY-ADMIN" });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      verifyManualAcceptanceSourceData(plan, {
        password: "local-demo-password",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run without the admin credential");
        },
      }),
    /MANUAL_ACCEPTANCE_ADMIN_PASSWORD is required/u,
  );
  assert.equal(fetchCalls, 0);
});

test("source apply rejects redirected login responses before runtime reads", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "REDIRECT" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(plan, {
          password: "local-demo-password",
          adminPassword: "local-admin-password",
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
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM = previous;
    }
  }
});

test("source apply requires a non-empty active yoyoosun revision before data writes", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "EMPTY-REVISION" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
  const methods = [];
  const loginPasswords = new Map();
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(plan, {
          password: "local-demo-password",
          adminPassword: "local-admin-password",
          fetchImpl: async (_url, init) => {
            const body = JSON.parse(init.body);
            methods.push(body.method);
            if (body.method === "admin_login") {
              loginPasswords.set(body.params.username, body.params.password);
              return ok({
                access_token: `token-${body.params.username}`,
                is_super_admin: body.params.username === "admin",
              });
            }
            if (body.method === "capabilities") {
              return ok({ environment: "local" });
            }
            if (body.method === "get_effective_session") {
              return ok({
                session: {
                  customer: { key: "yoyoosun" },
                  source: "active_customer_config_revision",
                  configRevision: "",
                },
              });
            }
            throw new Error(`unexpected method ${body.method}`);
          },
        }),
      /active customer configuration is not the current runtime source/u,
    );
    assert(!methods.includes("list_customers"));
    assert(!methods.includes("save_customer_with_contacts"));
    assert.equal(loginPasswords.get("admin"), "local-admin-password");
    assert.equal(loginPasswords.get("demo_sales"), "local-demo-password");
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM = previous;
    }
  }
});

test("source apply rejects a disabled required module before data reads or writes", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "MODULE-OFF" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
  const methods = [];
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(plan, {
          password: "local-demo-password",
          adminPassword: "local-admin-password",
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
              return ok({ environment: "local" });
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
                    outsourcing_orders: "enabled",
                    material_bom: "disabled",
                  },
                },
              });
            }
            throw new Error(`unexpected method ${body.method}`);
          },
        }),
      /required modules are not enabled: material_bom/u,
    );
    assert(!methods.includes("list_customers"));
    assert(!methods.includes("save_customer_with_contacts"));
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM = previous;
    }
  }
});

test("run id and scale guards reject unsafe or incomplete datasets", () => {
  assert.equal(sanitizeManualAcceptanceRunId(" local uat "), "LOCAL-UAT");
  assert.throws(() => sanitizeManualAcceptanceRunId("x".repeat(25)), /1-24/u);
  assert.throws(
    () =>
      buildManualAcceptanceSourceDataPlan({
        runId: "SMALL",
        scale: { ...DEFAULT_SOURCE_DATA_SCALE, customers: 5 },
      }),
    /scale\.customers must be at least 6/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceSourceDataPlan({
        runId: "BAD-BOM",
        scale: { ...DEFAULT_SOURCE_DATA_SCALE, bomVersions: 44 },
      }),
    /divisible by 3/u,
  );
});

test("lifecycle mutations reject malformed or stale success payloads", () => {
  const input = {
    resultKey: "sales_order",
    domain: "sales_order",
    id: 42,
    method: "submit_sales_order",
    expectedStatus: "SUBMITTED",
  };

  assert.throws(
    () => requireLifecycleMutationStatus({ ...input, data: {} }),
    /response missing sales_order/u,
  );
  assert.throws(
    () =>
      requireLifecycleMutationStatus({
        ...input,
        data: { sales_order: { id: 42 } },
      }),
    /response missing lifecycle status/u,
  );
  assert.throws(
    () =>
      requireLifecycleMutationStatus({
        ...input,
        data: {
          sales_order: { id: 42, lifecycle_status: "DRAFT" },
        },
      }),
    /expected SUBMITTED, got DRAFT/u,
  );
  assert.equal(
    requireLifecycleMutationStatus({
      ...input,
      data: {
        sales_order: { id: 42, lifecycle_status: "submitted" },
      },
    }),
    "SUBMITTED",
  );
});

test("persisted sales order lines retain exact IDs for linked reservations and shipments", () => {
  const input = {
    orderNo: "SIM-SO-001",
    plannedItems: [
      {
        line_no: 1,
        productRef: "P-1",
        skuRef: "SKU-1",
        product_name_snapshot: "【试用】产品 1",
        color_snapshot: "米白",
        ordered_quantity: "120",
      },
    ],
    actualItems: [
      {
        id: 901,
        line_no: 1,
        product_id: 101,
        product_sku_id: 201,
        unit_id: 301,
        product_name_snapshot: "【试用】产品 1",
        color_snapshot: "米白",
        ordered_quantity: "120",
      },
    ],
    productIds: new Map([["P-1", 101]]),
    skuIds: new Map([["SKU-1", 201]]),
    unitId: 301,
  };

  assert.deepEqual(buildSalesOrderLineReferences(input), [
    {
      salesOrderItemId: 901,
      lineNo: 1,
      productId: 101,
      productSkuId: 201,
      unitId: 301,
      productName: "【试用】产品 1",
      color: "米白",
      quantity: "120",
    },
  ]);
  assert.throws(
    () =>
      buildSalesOrderLineReferences({
        ...input,
        actualItems: [{ ...input.actualItems[0], product_sku_id: 999 }],
      }),
    /does not match its persisted product, SKU, or unit reference/u,
  );
});

test("partial draft BOMs resume missing lines while settled BOMs fail closed", () => {
  const input = {
    version: "BOM-TRIAL-V1",
    status: "DRAFT",
    plannedItems: [
      {
        materialRef: "M-1",
        quantity: "1.2",
        loss_rate: "0.03",
        position: "面料",
      },
      {
        materialRef: "M-2",
        quantity: "2",
        loss_rate: "0",
        position: "填充",
      },
    ],
    actualItems: [
      {
        id: 11,
        material_id: 101,
        unit_id: 301,
        quantity: "1.20",
        loss_rate: "0.030",
        position: "面料",
      },
    ],
    materialIds: new Map([
      ["M-1", 101],
      ["M-2", 102],
    ]),
    unitId: 301,
  };

  const result = planBOMItemReconciliation(input);
  assert.equal(result.actualCount, 1);
  assert.deepEqual(result.missing, [input.plannedItems[1]]);
  assert.throws(
    () => planBOMItemReconciliation({ ...input, status: "ACTIVE" }),
    /ACTIVE but is missing 1 BOM lines/u,
  );
  assert.throws(
    () =>
      planBOMItemReconciliation({
        ...input,
        actualItems: [{ ...input.actualItems[0], quantity: "9" }],
      }),
    /persisted BOM line differs/u,
  );
});
