import assert from "node:assert/strict";
import { execFile as execFileWithCallback } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  applyPlan,
  assertLocalBackendURL,
  buildInputTemplate,
  buildPlan,
  buildTimestampRunId,
  INPUT_TEMPLATE_SCOPE,
  parseCliArgs,
  requireMutationRecord,
  sanitizeRunId,
} from "./operational-fact-simulated-closure.mjs";

const scriptPath = fileURLToPath(
  new URL("./operational-fact-simulated-closure.mjs", import.meta.url),
);
const execFile = promisify(execFileWithCallback);
const TEST_ADMIN_PASSWORD = "local-admin-password";

test("operational mutations require a positive id and exact status", () => {
  assert.throws(
    () =>
      requireMutationRecord(
        { status: "POSTED" },
        "production create",
        "POSTED",
      ),
    /missing positive record id/u,
  );
  assert.throws(
    () =>
      requireMutationRecord(
        { id: 1, status: "DRAFT" },
        "production post",
        "POSTED",
      ),
    /expected status POSTED, got DRAFT/u,
  );
  assert.equal(
    requireMutationRecord(
      { id: 1, status: "POSTED" },
      "production post",
      "POSTED",
    ).id,
    1,
  );
});

function jsonRpcResponse(data) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { result: { code: 0, message: "ok", data } };
    },
  };
}

function buildPreflightFetch({
  environment = "dev",
  session = {
    customer: { key: "yoyoosun" },
    source: "active_customer_config_revision",
    configRevision: "yoyoosun-customer-package-v7.runtime-manifest-v1",
    modules: {
      production: "enabled",
      outsourcing_orders: "enabled",
      inventory: "enabled",
      shipments: "enabled",
      finance: "enabled",
    },
  },
} = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({
        url,
        method: body.method,
        params: body.params,
        authorization: options.headers.Authorization,
      });
      if (body.method === "admin_login") {
        if (body.params.username !== "admin") {
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                result: {
                  code: 40304,
                  message: "guard account is not super administrator",
                },
              };
            },
          };
        }
        return jsonRpcResponse({ access_token: "runtime-admin-token" });
      }
      if (body.method === "capabilities") {
        assert.equal(
          options.headers.Authorization,
          "Bearer runtime-admin-token",
        );
        return jsonRpcResponse({ environment });
      }
      if (body.method === "get_effective_session") {
        return jsonRpcResponse({ session });
      }
      throw new Error(`business write started unexpectedly: ${body.method}`);
    },
  };
}

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

const TEST_TOKENS = Object.freeze({
  pmc: "pmc-token",
  purchase: "purchase-token",
  warehouse: "warehouse-token",
  finance: "finance-token",
});

test("operational fact simulated closure plan marks data as simulated and excludes customer acceptance blocker", () => {
  const options = parseCliArgs([
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
    "demo run",
  ]);
  const plan = buildPlan(options);

  assert.equal(plan.scope, "Operational Facts");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.customerAcceptanceRequiredForClosure, false);
  assert.deepEqual(plan.ids, {
    customerId: 4,
    productId: 1,
    unitId: 2,
    warehouseId: 3,
    materialId: 5,
  });
  assert.match(
    plan.records.productionReceipt.fact_no,
    /^SIM-YOYOOSUN-OPFACT-/u,
  );
  assert.equal(
    plan.records.productionReceipt.fact_type,
    "FINISHED_GOODS_RECEIPT",
  );
  assert.equal(plan.records.outsourcingIssue.fact_type, "MATERIAL_ISSUE");
  assert.equal(plan.records.outsourcingIssue.source_type, undefined);
  assert.equal(plan.records.outsourcingIssue.source_id, undefined);
  assert.equal(plan.records.financeSettle.fact_type, "RECEIVABLE");
  assert.equal(plan.records.financeCancel.fact_type, "INVOICE");
  assert.equal(plan.records.productionDraftSample.fact_type, "REWORK");
  assert.equal(plan.records.shipment.customer_id, 4);
  assert.equal(plan.records.financeSettle.counterparty_id, 4);
  assert.match(plan.records.shipment.note, /试用/u);
});

test("operational fact simulated closure only links outsourcing to a real sales order source", () => {
  const plan = buildLocalPlan({
    salesOrderId: 77,
    salesOrderItemId: 88,
  });

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

test("operational fact simulated closure can target SKU inventory grain and payable status", () => {
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
  assert.equal(plan.ids.supplierId, 9);
  assert.equal(
    plan.records.shipment.customer_snapshot,
    "【试用】华南礼品客户 01",
  );
  assert.equal(
    plan.records.outsourcingIssue.supplier_name,
    "【试用】面料供应商 01",
  );
  assert.equal(plan.records.productionReceipt.product_sku_id, 11);
  assert.equal(plan.records.outsourcingIssue.subject_type, "MATERIAL");
  assert.equal(plan.records.outsourcingIssue.subject_id, 5);
  assert.equal(plan.records.outsourcingIssue.product_sku_id, undefined);
  assert.equal(plan.records.stockReservationRelease.product_sku_id, 11);
  assert.equal(plan.records.shipmentItem.product_sku_id, 11);
  assert.equal(plan.records.financePayable.fact_type, "PAYABLE");
  assert.equal(plan.records.financePayable.counterparty_id, 9);
  assert.equal(plan.records.financePayable.target_status, "SETTLED");
  assert.equal(plan.records.financeReconciliation.target_status, "CANCELLED");
  assert.equal(plan.records.financeSettle.target_status, "DRAFT");
  assert.equal(plan.records.financeCancel.target_status, "POSTED");
});

test("operational fact simulated closure refuses real import style flags", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "--customer-id",
        "1",
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
        "--customer-id",
        "1",
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

test("operational fact simulated closure normalizes and accepts only explicit loopback hosts", () => {
  assert.equal(
    assertLocalBackendURL("http://LOCALHOST:8300/base/?ignored=1#hash"),
    "http://localhost:8300/base",
  );
  assert.equal(
    assertLocalBackendURL("http://127.0.0.1:8300/"),
    "http://127.0.0.1:8300",
  );
  assert.equal(
    assertLocalBackendURL("http://[::1]:8300/"),
    "http://[::1]:8300",
  );
  assert.throws(
    () => assertLocalBackendURL("http://127.0.0.1.example.com:8300"),
    /external backend/u,
  );
});

test("operational fact simulated closure standalone apply rejects an external backend before login", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "opfact-external-"));
  await assert.rejects(
    () =>
      execFile(
        process.execPath,
        [
          scriptPath,
          "--apply",
          "--backend-url",
          "https://erp.example.com/runtime?source=manual",
          "--customer-id",
          "1",
          "--product-id",
          "1",
          "--material-id",
          "1",
          "--unit-id",
          "1",
          "--warehouse-id",
          "1",
          "--out",
          out,
        ],
        {
          env: {
            ...process.env,
            OPERATIONAL_FACT_SIM_CONFIRM: "APPLY_SIMULATED_OPERATIONAL_FACTS",
            OPERATIONAL_FACT_SIM_PASSWORD: "unused-local-demo-password",
          },
        },
      ),
    (error) => {
      assert.match(error.stderr, /refuse simulated operational fact writes/u);
      return true;
    },
  );
  await rm(out, { recursive: true, force: true });
});

test("operational fact simulated closure standalone apply requires a separate admin guard credential", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "opfact-admin-credential-"));
  await assert.rejects(
    () =>
      execFile(
        process.execPath,
        [
          scriptPath,
          "--apply",
          "--backend-url",
          "http://127.0.0.1:1",
          "--customer-id",
          "1",
          "--product-id",
          "1",
          "--material-id",
          "1",
          "--unit-id",
          "1",
          "--warehouse-id",
          "1",
          "--out",
          out,
        ],
        {
          env: {
            ...process.env,
            OPERATIONAL_FACT_SIM_CONFIRM: "APPLY_SIMULATED_OPERATIONAL_FACTS",
            OPERATIONAL_FACT_SIM_ADMIN_PASSWORD: "",
            OPERATIONAL_FACT_SIM_PASSWORD: "unused-local-demo-password",
          },
        },
      ),
    (error) => {
      assert.match(
        error.stderr,
        /apply requires OPERATIONAL_FACT_SIM_ADMIN_PASSWORD/u,
      );
      assert.doesNotMatch(error.stderr, /unused-local-demo-password/u);
      return true;
    },
  );
  await rm(out, { recursive: true, force: true });
});

test("operational fact simulated closure exported apply rejects an external backend before RPC", async () => {
  const plan = buildLocalPlan({
    backendURL: "https://erp.example.com/base?x=1",
  });
  let rpcCalls = 0;

  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        fetchImpl: async () => {
          rpcCalls += 1;
          throw new Error("must not call an external backend");
        },
      }),
    /refuse simulated operational fact writes to external backend/u,
  );
  assert.equal(rpcCalls, 0);
});

test("operational fact simulated closure exported apply requires a separate admin guard credential before RPC", async () => {
  const plan = buildLocalPlan();
  let rpcCalls = 0;

  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        fetchImpl: async () => {
          rpcCalls += 1;
          throw new Error("RPC must not run without the admin credential");
        },
      }),
    /OPERATIONAL_FACT_SIM_ADMIN_PASSWORD is required/u,
  );
  assert.equal(rpcCalls, 0);
});

test("operational fact runtime guard authenticates admin instead of a demo role", async () => {
  const plan = buildLocalPlan();
  const mock = buildPreflightFetch({ environment: "production" });

  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: mock.fetchImpl,
      }),
    /environment=production/u,
  );

  const loginCalls = mock.calls.filter((call) => call.method === "admin_login");
  assert.deepEqual(
    loginCalls.map((call) => call.params.username),
    ["admin"],
  );
  assert.equal(loginCalls[0].params.password, TEST_ADMIN_PASSWORD);
  assert.equal(
    mock.calls.find((call) => call.method === "capabilities")?.authorization,
    "Bearer runtime-admin-token",
  );
});

test("operational batch runs reuse one admin session but recheck runtime", async () => {
  const authSession = {};
  const mock = buildPreflightFetch({ environment: "production" });

  for (const runId of ["SESSION-ONE", "SESSION-TWO"]) {
    const plan = buildLocalPlan({ runId });
    await assert.rejects(
      () =>
        applyPlan(plan, TEST_TOKENS, {
          adminPassword: TEST_ADMIN_PASSWORD,
          authSession,
          fetchImpl: mock.fetchImpl,
        }),
      /environment=production/u,
    );
  }
  assert.equal(
    mock.calls.filter((call) => call.method === "admin_login").length,
    1,
  );
  assert.equal(
    mock.calls.filter((call) => call.method === "capabilities").length,
    2,
  );
});

test("operational fact exported apply rejects redirected runtime responses", async () => {
  const plan = buildLocalPlan();
  let rpcCalls = 0;
  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: async () => {
          rpcCalls += 1;
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
  assert.equal(rpcCalls, 1);
});

test("operational fact simulated closure exported apply rejects non-local runtime before writes", async () => {
  const plan = buildLocalPlan();
  const mock = buildPreflightFetch({ environment: "production" });

  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: mock.fetchImpl,
      }),
    /environment=production/u,
  );
  assert.deepEqual(
    mock.calls.map((call) => call.method),
    ["admin_login", "capabilities"],
  );
});

test("operational fact simulated closure exported apply requires the active yoyoosun revision before writes", async () => {
  const plan = buildLocalPlan();
  const mock = buildPreflightFetch({
    session: {
      customer: { key: "yoyoosun" },
      source: "active_customer_config_revision",
      configRevision: "",
    },
  });

  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: mock.fetchImpl,
      }),
    /active yoyoosun customer configuration revision is not current/u,
  );
  assert.deepEqual(
    mock.calls.map((call) => call.method),
    ["admin_login", "capabilities", "get_effective_session"],
  );
  assert.equal(
    mock.calls.some((call) => call.url.includes("/rpc/operational_fact")),
    false,
  );
});

test("operational fact simulated closure rejects disabled downstream modules before writes", async () => {
  const plan = buildLocalPlan();
  const mock = buildPreflightFetch({
    session: {
      customer: { key: "yoyoosun" },
      source: "active_customer_config_revision",
      configRevision: "yoyoosun-r1",
      modules: {
        production: "enabled",
        outsourcing_orders: "enabled",
        inventory: "enabled",
        shipments: "enabled",
        finance: "read_only",
      },
    },
  });

  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: mock.fetchImpl,
      }),
    /required modules are not enabled: finance/u,
  );
  assert.equal(
    mock.calls.some((call) => call.url.includes("/rpc/operational_fact")),
    false,
  );
});

test("operational fact simulated closure refuses an existing deterministic run before writes", async () => {
  const plan = buildLocalPlan();
  const methods = [];
  await assert.rejects(
    () =>
      applyPlan(plan, TEST_TOKENS, {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: async (_url, options) => {
          const body = JSON.parse(options.body);
          methods.push(body.method);
          if (body.method === "admin_login") {
            assert.equal(body.params.username, "admin");
            return jsonRpcResponse({ access_token: "runtime-admin-token" });
          }
          if (body.method === "capabilities") {
            return jsonRpcResponse({ environment: "local" });
          }
          if (body.method === "get_effective_session") {
            return jsonRpcResponse({
              session: {
                customer: { key: "yoyoosun" },
                source: "active_customer_config_revision",
                configRevision: "yoyoosun-r1",
                modules: {
                  production: "enabled",
                  outsourcing_orders: "enabled",
                  inventory: "enabled",
                  shipments: "enabled",
                  finance: "enabled",
                },
              },
            });
          }
          if (body.method === "list_production_facts") {
            return jsonRpcResponse({ production_facts: [{ id: 1 }], total: 1 });
          }
          throw new Error(`unexpected method ${body.method}`);
        },
      }),
    /already contains operational records/u,
  );
  assert(!methods.includes("create_production_fact"));
});

test("operational fact simulated closure requires positive ids", () => {
  assert.throws(
    () =>
      buildPlan({
        backendURL: "http://127.0.0.1:8300",
        runId: "T",
        customerId: 1,
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
  assert.match(
    template.commands.reportOnly,
    /--product-id <active_product_id>/u,
  );
  assert.match(
    template.commands.reportOnly,
    /--customer-id <active_customer_id>/u,
  );
  assert.match(
    template.commands.applySimulated,
    /OPERATIONAL_FACT_SIM_CONFIRM/u,
  );
  assert.match(
    template.commands.applySimulated,
    /OPERATIONAL_FACT_SIM_ADMIN_PASSWORD/u,
  );
  assert.equal(template.runtimeGuardAccount, "admin");
  assert.equal(Object.hasOwn(template.roleAccounts, "admin"), false);
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
  assert.equal(
    template.requiredReportInputs.includes("--product-id <active_product_id>"),
    true,
  );
  assert.equal(
    template.requiredReportInputs.includes(
      "--customer-id <active_customer_id>",
    ),
    true,
  );
  await assert.rejects(() => access(out), /ENOENT/u);
});

test("operational fact simulated closure input template cannot be combined with apply", () => {
  assert.throws(
    () => parseCliArgs(["--print-input-template", "--apply"]),
    /cannot be combined/u,
  );
});
