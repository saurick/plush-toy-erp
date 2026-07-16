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
import {
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  manualAcceptanceTargetConfirmation,
} from "./manual-acceptance-target-policy.mjs";

function record(id, fields = {}) {
  return { id, ...fields };
}

function ok(data = {}) {
  return {
    ok: true,
    json: async () => ({ result: { code: 0, message: "ok", data } }),
  };
}

function customerTrial133Attestation(overrides = {}) {
  return {
    target: CUSTOMER_TRIAL_133_TARGET,
    origin: CUSTOMER_TRIAL_133_ORIGIN,
    customerKey: "yoyoosun",
    environment: "prod",
    release: "929ec0b3a563bec0796274d033a97277519bcb51",
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

test("retirement CLI keeps local dry-run default and permits only the registered trial tunnel", () => {
  const parsed = parseManualAcceptanceRetireArgs(["--run-id", "LOCAL-UAT"]);
  assert.equal(parsed.apply, false);
  assert.equal(parsed.backendURL, "http://127.0.0.1:8300");
  assert.equal(parsed.target, "local-dev");
  assert.equal(parsed.dataVersion, "LOCAL-UAT");

  const remote = parseManualAcceptanceRetireArgs([
    "--target",
    CUSTOMER_TRIAL_133_TARGET,
    "--backend-url",
    CUSTOMER_TRIAL_133_ORIGIN,
    "--data-version",
    "2026.07.15-v1",
    "--run-id",
    "20260715-V1",
  ]);
  assert.equal(remote.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(remote.backendURL, CUSTOMER_TRIAL_133_ORIGIN);
  assert.equal(remote.dataVersion, "2026.07.15-v1");

  assert.throws(
    () =>
      parseManualAcceptanceRetireArgs([
        "--backend-url",
        "https://example.invalid",
        "--run-id",
        "REMOTE",
      ]),
    /refuse external backend|registered SSH tunnel origin/u,
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

test("customer-trial-133 retirement apply requires the target-bound confirmation before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
  });
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      retireManualAcceptanceSourceData(plan, {
        apply: true,
        retireConfirm: MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE,
        targetAttestation: customerTrial133Attestation(),
        password: "must-not-be-used",
        adminPassword: "must-not-be-used",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run");
        },
      }),
    /external apply requires MANUAL_ACCEPTANCE_TARGET_CONFIRM/u,
  );
  assert.equal(fetchCalls, 0);
});

test("customer-trial-133 retirement rejects unsafe out-of-band debug attestation before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
  });
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      retireManualAcceptanceSourceData(plan, {
        apply: true,
        retireConfirm: MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE,
        targetConfirmation: manualAcceptanceTargetConfirmation(plan),
        targetAttestation: customerTrial133Attestation({
          debug: {
            ...customerTrial133Attestation().debug,
            cleanupAllowed: true,
          },
        }),
        password: "must-not-be-used",
        adminPassword: "must-not-be-used",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run");
        },
      }),
    /requires debug seed, cleanup, and business clear disabled/u,
  );
  assert.equal(fetchCalls, 0);
});

test("local retirement rejects remote attestation before login", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: "RETIRE-LOCAL-ATTEST",
  });
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      retireManualAcceptanceSourceData(plan, {
        targetAttestation: customerTrial133Attestation(),
        password: "must-not-be-used",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run");
        },
      }),
    /out-of-band target attestation is only valid for customer-trial-133/u,
  );
  assert.equal(fetchCalls, 0);
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
    /refuse external backend|registered SSH tunnel origin/u,
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
    /active customer configuration is not the current runtime source/u,
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

test("customer-trial-133 retirement uses prod attestation, normalized remote runtime, and business lifecycle RPC only", async () => {
  const plan = buildManualAcceptanceSourceDataPlan({
    target: CUSTOMER_TRIAL_133_TARGET,
    backendURL: CUSTOMER_TRIAL_133_ORIGIN,
    dataVersion: "2026.07.15-v1",
    runId: "20260715-V1",
  });
  const calls = [];
  let customerReads = 0;
  const emptyLists = {
    sales_orders: [],
    purchase_orders: [],
    outsourcing_orders: [],
    bom_versions: [],
    product_skus: [],
    processes: [],
    materials: [],
    products: [],
    suppliers: [],
  };
  const fetchImpl = async (url, init) => {
    if (!init.body) {
      calls.push({
        url,
        domain: "runtime-identity",
        method: "probe",
        authorization: "",
      });
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
    const domain = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    const body = JSON.parse(init.body);
    const authorization = init.headers.Authorization || "";
    calls.push({ url, domain, method: body.method, authorization });
    assert.equal(init.redirect, "error");
    if (body.method === "admin_login") {
      assert.equal(Object.hasOwn(body.params, "customer_key"), false);
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
          configRevision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
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
        databaseName: "plush_erp_uat_20260715",
        seedEnabled: false,
        seedAllowed: false,
        cleanupEnabled: false,
        cleanupAllowed: false,
        businessDataClearEnabled: false,
        businessDataClearAllowed: false,
      });
    }
    if (body.method === "list_customers") {
      customerReads += 1;
      return ok({
        ...emptyLists,
        customers: [
          record(101, {
            code: `${plan.prefix}-CUS-001`,
            is_active: customerReads === 1,
          }),
        ],
      });
    }
    if (body.method.startsWith("list_")) {
      return ok({ ...emptyLists, customers: [] });
    }
    if (body.method === "set_customer_active") {
      assert.equal(body.params.id, 101);
      assert.equal(body.params.active, false);
      assert.equal(authorization, "Bearer token-admin");
      return ok({ customer: record(101, { is_active: false }) });
    }
    throw new Error(`unexpected method ${domain}.${body.method}`);
  };

  const report = await retireManualAcceptanceSourceData(plan, {
    apply: true,
    retireConfirm: MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE,
    targetConfirmation: manualAcceptanceTargetConfirmation(plan),
    targetAttestation: customerTrial133Attestation(),
    password: "role-password",
    adminPassword: "admin-password",
    fetchImpl,
  });

  assert.equal(report.target, CUSTOMER_TRIAL_133_TARGET);
  assert.equal(report.datasetKey, MANUAL_ACCEPTANCE_DATASET_KEY);
  assert.equal(report.dataVersion, "2026.07.15-v1");
  assert.equal(report.runId, "20260715-V1");
  assert.equal(report.summary.totalActions, 1);
  assert.deepEqual(report.executed, [
    {
      datasetKey: "customers",
      key: `${plan.prefix}-CUS-001`,
      method: "set_customer_active",
    },
  ]);
  assert.equal(report.postApplySummary.totalActions, 0);
  assert.deepEqual(report.runtime.targetAttestation, {
    source: "out-of-band",
    release: "929ec0b3a563bec0796274d033a97277519bcb51",
    migration: "20260714165115",
  });
  assert.equal(calls[0].method, "probe");
  assert.equal(calls.some((call) => call.method === "capabilities"), true);
  assert.equal(
    calls.some((call) => /delete|truncate|clear/iu.test(call.method)),
    false,
  );
  assert(
    calls.every((call) => new URL(call.url).origin === CUSTOMER_TRIAL_133_ORIGIN),
  );
});
