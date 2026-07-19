import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SOURCE_DATA_SCALE,
  MANUAL_ACCEPTANCE_CORE_UNIT_CODE,
  MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES,
  applyManualAcceptanceSourceData,
  assertPersistedSourceRecord,
  buildOutsourcingOrderLineReferences,
  buildPurchaseOrderLineReferences,
  buildSalesOrderLineReferences,
  buildManualAcceptanceSourceDataPlan,
  buildSourceDrivenFactReferences,
  planBOMItemReconciliation,
  parseManualAcceptanceSourceDataArgs,
  requireLifecycleMutationStatus,
  runManualAcceptanceSourceDataCli,
  resolveManualAcceptanceCoreReferences,
  sanitizeManualAcceptanceRunId,
  statusCounts,
  verifyManualAcceptanceSourceData,
} from "./manual-acceptance-source-data.mjs";
import { buildSourceDrivenFactPlan } from "./manual-acceptance-source-driven-facts.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
  CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
  CUSTOMER_TRIAL_133_CONFIG_REVISION,
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

const LOCAL_ACCEPTANCE_BACKEND_URL = "http://127.0.0.1:8310";
const LOCAL_ACCEPTANCE_DATABASE = "plush_erp_acceptance_20260716_v5_dev";
const forbiddenVisibleCopy =
  /\b(?:workflow|fact|json-rpc|rbac|usecase|schema|api|debugrunid|raw id)\b|甲方/iu;

function buildLocalSourceMutationPlan(overrides = {}) {
  return buildManualAcceptanceSourceDataPlan({
    backendURL: LOCAL_ACCEPTANCE_BACKEND_URL,
    databaseName: LOCAL_ACCEPTANCE_DATABASE,
    ...overrides,
  });
}

function localSourceMutationOptions(plan, overrides = {}) {
  return {
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    ...overrides,
  };
}

function localCapabilities(overrides = {}) {
  return {
    environment: "local",
    databaseName: LOCAL_ACCEPTANCE_DATABASE,
    ...overrides,
  };
}

function localSession(overrides = {}) {
  return {
    customer: { key: "yoyoosun" },
    source: "active_customer_config_revision",
    configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
    configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
    configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
    ...overrides,
  };
}

function ok(data = {}) {
  return {
    ok: true,
    json: async () => ({ result: { code: 0, message: "ok", data } }),
  };
}

function runtimeIdentityResponse() {
  return {
    ok: true,
    status: 200,
    redirected: false,
    headers: {
      get: (name) =>
        name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null,
    },
    async text() {
      return "runtime identity matched";
    },
  };
}

function customerTrial133Attestation(overrides = {}) {
  return {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "20c96d38a7b9e6d4f3c2b1a09876543210fedcba",
    migration: "20260714165115",
    debug: {
      seedEnabled: false,
      seedAllowed: false,
      cleanupEnabled: false,
      cleanupAllowed: false,
      businessDataClearEnabled: false,
      businessDataClearAllowed: false,
    },
    ...overrides,
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

test("core references use exact stable business codes instead of environment order", () => {
  const references = resolveManualAcceptanceCoreReferences({
    units: [
      { id: 99, code: "OTHER-UNIT" },
      { id: 11, code: MANUAL_ACCEPTANCE_CORE_UNIT_CODE },
    ],
    warehouses: [
      { id: 99, code: "OTHER-WH" },
      { id: 14, code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.workInProcess },
      { id: 12, code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.product },
      { id: 13, code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.qualityHold },
      { id: 11, code: MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.material },
    ],
  });

  assert.equal(references.unit.id, 11);
  assert.equal(references.warehouse.id, 11);
  assert.deepEqual(
    references.warehouses.map((item) => item.id),
    [11, 12, 13, 14],
  );
  assert.throws(
    () =>
      resolveManualAcceptanceCoreReferences({
        units: [{ id: 1, code: "OTHER-UNIT" }],
        warehouses: [],
      }),
    new RegExp(MANUAL_ACCEPTANCE_CORE_UNIT_CODE, "u"),
  );
});

test("manual acceptance source plan reaches every agreed pagination threshold", () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "LOCAL-UAT",
    backendURL: "http://127.0.0.1:8300",
  });

  assert.equal(plan.prefix, "YS-CS");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.directSQL, false);
  assert.equal(plan.target, "local-dev");
  assert.equal(plan.datasetKey, MANUAL_ACCEPTANCE_DATASET_KEY);
  assert.equal(plan.dataVersion, "LOCAL-UAT");
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

test("current V5 plans use short yoyoosun-style visible business numbers", () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  });
  assert.equal(plan.prefix, "YS5");
  assert.equal(plan.records.customers[0].code, "YS5-KH-001");
  assert.equal(plan.records.suppliers[0].code, "YS5-GYS-001");
  assert.equal(plan.records.materials[0].code, "YS5-WL-001");
  assert.equal(plan.records.products[0].code, "YS5-CP-001");
  assert.equal(plan.records.products[0].skus[0].sku_code, "YS5-GG-001-01");
  assert.equal(plan.records.processes[0].code, "YS5-GX-001");
  assert.equal(plan.records.salesOrders[0].order_no, "YS5-XD-001");
  assert.equal(plan.records.purchaseOrders[0].purchase_order_no, "YS5-CG-001");
  assert.equal(
    plan.records.outsourcingOrders[0].outsourcing_order_no,
    "YS5-WW-001",
  );
  assert.match(plan.records.bomVersions[0].version, /^YS5-BOM-/u);
});

test("versioned source plans use a stable date anchor and semantic digest across targets", () => {
  const common = {
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  };
  const localPlan = buildManualAcceptanceSourceDataPlan(common);
  const remotePlan = buildManualAcceptanceSourceDataPlan({
    ...common,
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
  });

  assert.equal(localPlan.anchorDate, "2026-07-16");
  assert.equal(remotePlan.anchorDate, localPlan.anchorDate);
  assert.equal(remotePlan.semanticDigest, localPlan.semanticDigest);
  assert.equal(localPlan.semanticDigest.length, 64);
  assert.deepEqual(remotePlan.records, localPlan.records);
  assert.equal(
    localPlan.records.products.every(
      (product) =>
        product.customer_style_no === undefined &&
        product.skus.every((sku) => sku.barcode === undefined),
    ),
    true,
  );

  const nextVersion = buildManualAcceptanceSourceDataPlan({
    runId: "20260717-V6",
    dataVersion: "2026.07.17-v6",
  });
  assert.notEqual(nextVersion.semanticDigest, localPlan.semanticDigest);

  const changed = buildManualAcceptanceSourceDataPlan({
    ...common,
    anchorDate: "2026-07-18",
  });
  assert.notEqual(changed.semanticDigest, localPlan.semanticDigest);
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

test("persisted source content comparison normalizes dates and decimals but rejects drift", () => {
  const expected = {
    order_no: "SIM-ORDER-001",
    order_date: "2026-07-15",
    ordered_quantity: "12.000",
    snapshot: { name: "试用客户", simulated_only: true },
    optional_note: undefined,
  };
  const actual = {
    order_no: "SIM-ORDER-001",
    order_date: Date.parse("2026-07-15T00:00:00.000Z") / 1000,
    ordered_quantity: "12",
    snapshot: { simulated_only: true, name: "试用客户" },
    optional_note: null,
  };
  assert.doesNotThrow(() =>
    assertPersistedSourceRecord({
      label: "sales_order SIM-ORDER-001",
      expected,
      actual,
      fields: [
        "order_no",
        "order_date",
        "ordered_quantity",
        "snapshot",
        "optional_note",
      ],
      dateFields: ["order_date"],
      decimalFields: ["ordered_quantity"],
    }),
  );
  assert.throws(
    () =>
      assertPersistedSourceRecord({
        label: "sales_order SIM-ORDER-001",
        expected,
        actual: { ...actual, snapshot: { name: "被人工改动" } },
        fields: ["snapshot"],
      }),
    /snapshot differs from dataVersion planned content/u,
  );
});

test("business-visible fixture copy uses trial-user wording without developer jargon", () => {
  const plan = buildManualAcceptanceSourceDataPlan({ runId: "COPY-CHECK" });
  for (const text of visibleStrings(plan.records)) {
    assert.doesNotMatch(text, forbiddenVisibleCopy);
  }
  assert.equal(plan.records.customers[0].name, "东莞美悦礼品");
  assert.equal(plan.records.suppliers[0].name, "嘉顺布行");
  assert.equal(plan.records.materials[0].name, "米白短毛绒");
  assert.equal(plan.records.products[0].name, "云朵小熊");
  assert.equal(plan.records.products[0].style_no, "27001#");
  assert.equal(plan.records.products[0].skus[0].sku_name, "米白·小号");
  assert.equal(
    plan.records.products[0].skus[0].customer_sku,
    "27001#-米白-小号",
  );
  assert.equal(plan.records.products[0].skus[0].packaging_version, "单只装");
  assert.equal(plan.records.processes[0].name, "裁片");
  assert.equal(plan.records.salesOrders[0].note, "分两批交货");
  assert.deepEqual(Object.keys(plan.records.salesOrders[0].contact_snapshot), [
    "name",
  ]);
  assert.equal(
    [...plan.records.customers, ...plan.records.suppliers].every(
      (party) =>
        party.tax_no === undefined &&
        party.contacts.every(
          (contact) =>
            contact.mobile === undefined &&
            contact.phone === undefined &&
            contact.email === undefined,
        ),
    ),
    true,
  );
  assert.equal(
    plan.records.products.every(
      (product) =>
        product.customer_style_no === undefined &&
        product.skus.every(
          (sku) =>
            sku.barcode === undefined &&
            !/\bV\d+\b/iu.test(sku.packaging_version),
        ),
    ),
    true,
  );

  const productByRef = new Map(
    plan.records.products.map((product) => [product.code, product]),
  );
  for (const order of plan.records.salesOrders) {
    for (const item of order.items) {
      const product = productByRef.get(item.productRef);
      assert.equal(item.product_code_snapshot, product.style_no);
      assert.equal(item.product_name_snapshot, product.name);
      assert.doesNotMatch(item.product_code_snapshot, /^(?:SIM|TEST)-/u);
    }
  }
  for (const order of plan.records.purchaseOrders) {
    for (const item of order.items) {
      const sourceOrder = plan.records.salesOrders.find(
        (candidate) =>
          candidate.customer_order_no === item.product_order_no_snapshot,
      );
      assert.ok(sourceOrder);
      assert.equal(
        sourceOrder.items.some(
          (sourceItem) =>
            sourceItem.product_code_snapshot === item.product_no_snapshot &&
            sourceItem.product_name_snapshot === item.product_name_snapshot,
        ),
        true,
      );
      assert.doesNotMatch(item.product_no_snapshot, /^(?:SIM|TEST)-/u);
    }
  }
  for (const order of plan.records.outsourcingOrders) {
    const sourceOrder = plan.records.salesOrders.find(
      (candidate) => candidate.customer_order_no === order.source_order_no,
    );
    assert.ok(sourceOrder);
    assert.equal(order.source_order_no, sourceOrder.customer_order_no);
    for (const item of order.items.filter(
      (candidate) => candidate.subject_type === "PRODUCT",
    )) {
      const product = productByRef.get(item.productRef);
      assert.equal(item.product_no_snapshot, product.style_no);
      assert.equal(item.product_name_snapshot, product.name);
      assert.equal(
        item.product_order_no_snapshot,
        sourceOrder.customer_order_no,
      );
      assert.doesNotMatch(item.product_no_snapshot, /^(?:SIM|TEST)-/u);
    }
  }
  assert.ok(
    !visibleStrings(plan.records).some((text) => text.includes("【试用】")),
  );
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

test("CLI help points only to the dedicated current local acceptance database", async () => {
  const help = await runManualAcceptanceSourceDataCli(["--help"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.text, /http:\/\/127\.0\.0\.1:8310/u);
  assert.match(
    help.text,
    /--database-name plush_erp_acceptance_20260716_v5_dev/u,
  );
  assert.match(help.text, /--data-version 2026\.07\.16-v5/u);
  assert.match(help.text, /--run-id 20260716-V5/u);
  assert.doesNotMatch(help.text, /127\.0\.0\.1:8300/u);
});

test("apply requires the exact simulation confirmation before any backend call", async () => {
  const plan = buildLocalSourceMutationPlan({ runId: "CONFIRM-CHECK" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(
          plan,
          localSourceMutationOptions(plan, {
            password: "local-demo-password",
            fetchImpl: async () => {
              fetchCalls += 1;
              throw new Error("fetch should not run");
            },
          }),
        ),
      /apply requires MANUAL_ACCEPTANCE_SIM_CONFIRM/u,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    if (previous === undefined)
      delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
    else process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM = previous;
  }
});

test("local source mutation fails closed without the dedicated database identity", async () => {
  const missingDatabasePlan = buildManualAcceptanceSourceDataPlan({
    runId: "MISSING-DATABASE",
    backendURL: LOCAL_ACCEPTANCE_BACKEND_URL,
  });
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceSourceData(missingDatabasePlan, {
        confirmPhrase: "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA",
        password: "must-not-be-used",
        adminPassword: "must-not-be-used",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run");
        },
      }),
    /explicit dedicated databaseName/u,
  );
  assert.equal(fetchCalls, 0);

  assert.throws(
    () =>
      buildManualAcceptanceSourceDataPlan({
        runId: "WRONG-DATABASE",
        backendURL: LOCAL_ACCEPTANCE_BACKEND_URL,
        databaseName: "plush_erp",
      }),
    /requires databaseName=plush_erp_acceptance_20260716_v5_dev/u,
  );
});

test("customer-trial-133 source apply accepts only the registered attested runtime before the first data mutation", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  });
  const methods = [];
  const fetchImpl = async (_url, init) => {
    if (!init.body) {
      methods.push("runtime_identity");
      return {
        ok: true,
        status: 200,
        redirected: false,
        headers: {
          get: (name) =>
            name === "X-ERP-Runtime-Identity-Proof" ? "matched-v1" : null,
        },
        async text() {
          return "runtime identity matched";
        },
      };
    }
    const body = JSON.parse(init.body);
    methods.push(body.method);
    if (body.method === "admin_login") {
      return ok({
        access_token: `token-${body.params.username}`,
        is_super_admin: body.params.username === "admin",
      });
    }
    if (body.method === "get_effective_session") {
      return ok({
        session: {
          customer: { key: "yoyoosun" },
          source: "active_customer_config_revision",
          configRevision: CUSTOMER_TRIAL_133_CONFIG_REVISION,
          configProductVersion: CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
          configApplyPurpose: CUSTOMER_TRIAL_133_CONFIG_APPLY_PURPOSE,
          configDatasetVersion: CUSTOMER_TRIAL_133_CONFIG_DATA_VERSION,
          configTarget: CUSTOMER_TRIAL_133_TARGET,
          modules: Object.fromEntries(
            [
              "customers",
              "suppliers",
              "products",
              "materials",
              "processes",
              "sales_orders",
              "purchase_orders",
              "outsourcing_orders",
              "material_bom",
            ].map((key) => [key, "enabled"]),
          ),
        },
      });
    }
    if (body.method === "capabilities") {
      return ok({
        environment: "remote",
        databaseName: CUSTOMER_TRIAL_133_DATABASE,
        seedEnabled: false,
        seedAllowed: false,
        cleanupEnabled: false,
        cleanupAllowed: false,
        businessDataClearEnabled: false,
        businessDataClearAllowed: false,
      });
    }
    if (body.method === "list_customers") {
      throw new Error("stop after remote preflight");
    }
    throw new Error(`unexpected method ${body.method}`);
  };

  await assert.rejects(
    () =>
      applyManualAcceptanceSourceData(plan, {
        password: "role-password",
        adminPassword: "admin-password",
        confirmPhrase: "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA",
        targetConfirmation: manualAcceptanceTargetConfirmation(plan),
        targetAttestation: customerTrial133Attestation(),
        fetchImpl,
      }),
    /stop after remote preflight/u,
  );
  assert.equal(methods[0], "runtime_identity");
  assert.equal(methods.includes("capabilities"), true);
  assert.equal(methods.includes("get_effective_session"), true);
  assert.equal(
    methods.some((method) =>
      /^(?:save_|create_|submit_|approve_|confirm_|close_|cancel_|activate_|archive_|set_)/u.test(
        method,
      ),
    ),
    false,
  );
});

test("direct source apply rejects an external plan before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "DIRECT-EXTERNAL",
  });
  plan.backendURL = "https://example.invalid";
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
    /registered external origin|refuse external backend/u,
  );
  assert.equal(fetchCalls, 0);
});

test("direct source verification rejects an external plan before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "VERIFY-EXTERNAL",
  });
  plan.backendURL = "https://example.invalid";
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
    /registered external origin|refuse external backend/u,
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
  const plan = buildLocalSourceMutationPlan({ runId: "REDIRECT" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
  let fetchCalls = 0;
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(
          plan,
          localSourceMutationOptions(plan, {
            password: "local-demo-password",
            adminPassword: "local-admin-password",
            fetchImpl: async (_url, init) => {
              fetchCalls += 1;
              if (!init.body) return runtimeIdentityResponse();
              return {
                ok: true,
                status: 200,
                redirected: true,
                json: async () => ({ result: { code: 0, data: {} } }),
              };
            },
          }),
        ),
      /redirected response/u,
    );
    assert.equal(fetchCalls, 2);
  } finally {
    if (previous === undefined) {
      delete process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
    } else {
      process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM = previous;
    }
  }
});

test("source apply requires a non-empty active yoyoosun revision before data writes", async () => {
  const plan = buildLocalSourceMutationPlan({ runId: "EMPTY-REVISION" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
  const methods = [];
  const loginPasswords = new Map();
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(
          plan,
          localSourceMutationOptions(plan, {
            password: "local-demo-password",
            adminPassword: "local-admin-password",
            fetchImpl: async (_url, init) => {
              if (!init.body) {
                methods.push("runtime_identity");
                return runtimeIdentityResponse();
              }
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
                return ok(localCapabilities());
              }
              if (body.method === "get_effective_session") {
                return ok({
                  session: localSession({
                    configRevision: "",
                  }),
                });
              }
              throw new Error(`unexpected method ${body.method}`);
            },
          }),
        ),
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
  const plan = buildLocalSourceMutationPlan({ runId: "MODULE-OFF" });
  const previous = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM;
  process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM =
    "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
  const methods = [];
  try {
    await assert.rejects(
      () =>
        applyManualAcceptanceSourceData(
          plan,
          localSourceMutationOptions(plan, {
            password: "local-demo-password",
            adminPassword: "local-admin-password",
            fetchImpl: async (_url, init) => {
              if (!init.body) {
                methods.push("runtime_identity");
                return runtimeIdentityResponse();
              }
              const body = JSON.parse(init.body);
              methods.push(body.method);
              if (body.method === "admin_login") {
                return ok({
                  access_token: `token-${body.params.username}`,
                  is_super_admin: body.params.username === "admin",
                });
              }
              if (body.method === "capabilities") {
                return ok(localCapabilities());
              }
              if (body.method === "get_effective_session") {
                return ok({
                  session: localSession({
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
                  }),
                });
              }
              throw new Error(`unexpected method ${body.method}`);
            },
          }),
        ),
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

test("persisted outsourcing lines retain exact formal source references", () => {
  const input = {
    orderNo: "SIM-OS-001",
    plannedItems: [
      {
        line_no: 1,
        subject_type: "PRODUCT",
        productRef: "P-1",
        processRef: "PROC-1",
      },
    ],
    actualItems: [
      {
        id: 902,
        line_no: 1,
        subject_type: "PRODUCT",
        product_id: 101,
        product_sku_id: 201,
        material_id: null,
        process_id: 401,
        unit_id: 301,
        outsourcing_quantity: "112",
        line_status: "open",
      },
    ],
    productIds: new Map([["P-1", 101]]),
    materialIds: new Map(),
    processIds: new Map([["PROC-1", 401]]),
    unitId: 301,
  };

  assert.deepEqual(buildOutsourcingOrderLineReferences(input), [
    {
      outsourcingOrderItemId: 902,
      lineNo: 1,
      subjectType: "PRODUCT",
      subjectId: 101,
      productId: 101,
      productSkuId: 201,
      processId: 401,
      unitId: 301,
      quantity: "112",
    },
  ]);
  assert.throws(
    () =>
      buildOutsourcingOrderLineReferences({
        ...input,
        actualItems: [{ ...input.actualItems[0], line_status: "closed" }],
      }),
    /open-line reference/u,
  );
});

test("persisted purchase lines retain exact formal source references", () => {
  const input = {
    orderNo: "SIM-PO-001",
    plannedItems: [
      {
        line_no: 1,
        materialRef: "M-1",
      },
    ],
    actualItems: [
      {
        id: 903,
        line_no: 1,
        material_id: 501,
        unit_id: 301,
        purchased_quantity: "500",
        unit_price: "12.5",
        amount: "6250",
        line_status: "open",
      },
    ],
    materialIds: new Map([["M-1", 501]]),
    unitId: 301,
  };

  assert.deepEqual(buildPurchaseOrderLineReferences(input), [
    {
      purchaseOrderItemId: 903,
      lineNo: 1,
      materialId: 501,
      unitId: 301,
      quantity: "500",
      unitPrice: "12.5",
      amount: "6250",
    },
  ]);
  assert.throws(
    () =>
      buildPurchaseOrderLineReferences({
        ...input,
        actualItems: [{ ...input.actualItems[0], line_status: "closed" }],
      }),
    /open-line reference/u,
  );
});

test("source report exposes read-back candidates but blocks every Fact phase missing a formal lot or receipt", () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "20260715-V1",
    dataVersion: "2026.07.15-v1",
  });
  const activeBOMPlans = new Map(
    plan.records.bomVersions
      .filter((record) => record.targetStatus === "ACTIVE")
      .map((record) => [record.productRef, record]),
  );
  const salesPlan = plan.records.salesOrders.find(
    (record) =>
      record.targetStatus === "ACTIVE" &&
      record.items.some((item) => activeBOMPlans.has(item.productRef)),
  );
  const salesLinePlan = salesPlan.items.find((item) =>
    activeBOMPlans.has(item.productRef),
  );
  const bomPlan = activeBOMPlans.get(salesLinePlan.productRef);
  const outsourcingPlan = plan.records.outsourcingOrders.find(
    (record) => record.targetStatus === "CONFIRMED",
  );
  const purchasePlan = plan.records.purchaseOrders.find(
    (record) => record.targetStatus === "APPROVED",
  );
  const salesOrder = {
    id: 1001,
    lifecycle_status: "ACTIVE",
    payment_term_days: salesPlan.payment_term_days,
  };
  const outsourcingOrder = { id: 2001, lifecycle_status: "CONFIRMED" };
  const purchaseOrder = { id: 2501, lifecycle_status: "APPROVED" };
  const sourceDocuments = {
    sales: new Map([[salesPlan.order_no, salesOrder]]),
    salesOrderItems: new Map([
      [
        salesOrder.id,
        [
          {
            salesOrderItemId: 1002,
            lineNo: salesLinePlan.line_no,
            productId: 1003,
            productSkuId: 1004,
            unitId: 1005,
            quantity: "129",
          },
        ],
      ],
    ]),
    outsourcing: new Map([
      [outsourcingPlan.outsourcing_order_no, outsourcingOrder],
    ]),
    outsourcingOrderItems: new Map([
      [
        outsourcingOrder.id,
        [
          {
            outsourcingOrderItemId: 2002,
            lineNo: 1,
            subjectType: "PRODUCT",
            subjectId: 1003,
            productId: 1003,
            processId: 2003,
            unitId: 1005,
            quantity: "112",
          },
        ],
      ],
    ]),
    purchase: new Map([[purchasePlan.purchase_order_no, purchaseOrder]]),
    purchaseOrderItems: new Map([
      [
        purchaseOrder.id,
        [
          {
            purchaseOrderItemId: 2502,
            lineNo: 1,
            materialId: 3003,
            unitId: 1005,
            quantity: "500",
            unitPrice: "12.5",
            amount: "6250",
          },
        ],
      ],
    ]),
  };
  const bomVersions = new Map([
    [
      bomPlan.version,
      {
        id: 3001,
        status: "ACTIVE",
        items: [
          {
            id: 3002,
            material_id: 3003,
            unit_id: 1005,
            quantity: "0.2",
            loss_rate: "0",
          },
        ],
      },
    ],
  ]);
  const refs = {
    customers: new Map([
      [
        salesPlan.customerRef,
        { id: 5001, code: salesPlan.customerRef, name: "【试用】验收客户" },
      ],
    ]),
    suppliers: new Map([
      [
        purchasePlan.supplierRef,
        { id: 5002, code: purchasePlan.supplierRef, name: "嘉顺布行" },
      ],
    ]),
    warehouses: [
      { id: 4002, code: "WH-B", name: "试用仓库 B" },
      { id: 4001, code: "WH-A", name: "试用仓库 A" },
    ],
  };

  const sourceDrivenFacts = buildSourceDrivenFactReferences({
    plan,
    refs,
    sourceDocuments,
    bomVersions,
  });
  assert.deepEqual(
    {
      datasetKey: sourceDrivenFacts.datasetKey,
      dataVersion: sourceDrivenFacts.dataVersion,
      runId: sourceDrivenFacts.runId,
    },
    {
      datasetKey: plan.datasetKey,
      dataVersion: plan.dataVersion,
      runId: plan.runId,
    },
  );
  assert.equal(sourceDrivenFacts.sourceCandidates.production.item.id, 1002);
  assert.equal(
    sourceDrivenFacts.sourceCandidates.production.item.orderedQuantity,
    "129",
  );
  assert.equal(sourceDrivenFacts.sourceCandidates.sales.order.customerId, 5001);
  assert.equal(
    sourceDrivenFacts.sourceCandidates.sales.order.paymentTermDays,
    salesPlan.payment_term_days,
  );
  assert.equal(
    sourceDrivenFacts.sourceCandidates.outsourcing.item.quantity,
    "112",
  );
  assert.deepEqual(
    sourceDrivenFacts.sourceCandidates.warehouses.map((item) => item.code),
    ["WH-A", "WH-B"],
  );
  assert.equal(Object.hasOwn(sourceDrivenFacts, "production"), false);
  assert.match(sourceDrivenFacts.phaseReadiness.production.reason, /lot/u);
  assert.match(sourceDrivenFacts.phaseReadiness.purchase.reason, /receipt/u);

  const factPlan = buildSourceDrivenFactPlan({
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    target: plan.target,
    backendURL: plan.backendURL,
    referenceRecords: { sourceDrivenFacts },
  });
  assert.equal(factPlan.readyForPreflight, false);
  assert.deepEqual(
    factPlan.blocked.map((item) => item.phase),
    ["production", "outsourcing", "sales"],
  );
  assert.equal(factPlan.phases.purchase.status, "unsupported");
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
