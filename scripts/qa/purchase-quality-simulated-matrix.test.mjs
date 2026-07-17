import assert from "node:assert/strict";
import { execFile as execFileWithCallback } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  applyPlan,
  buildPlan,
  parseArgs,
} from "./purchase-quality-simulated-matrix.mjs";

const TEST_ADMIN_PASSWORD = "local-admin-password";
const scriptPath = fileURLToPath(
  new URL("./purchase-quality-simulated-matrix.mjs", import.meta.url),
);
const execFile = promisify(execFileWithCallback);

function testPlan(runId = "RUNTIME-SAFETY") {
  return buildPlan({
    backendURL: "http://127.0.0.1:8300",
    runId,
    supplierId: 1,
    materialId: 2,
    unitId: 3,
    warehouseId: 4,
  });
}

function ok(data = {}) {
  return {
    ok: true,
    json: async () => ({ result: { code: 0, message: "ok", data } }),
  };
}

test("buildPlan creates a simulated multi-status purchase and quality matrix", () => {
  const plan = buildPlan({
    backendURL: "http://127.0.0.1:8300",
    runId: "TARGET-20260710",
    supplierId: 1,
    supplierName: "【试用】面料供应商 01",
    materialId: 2,
    materialName: "【试用】短毛绒材料 01",
    unitId: 3,
    warehouseId: 4,
  });
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.match(plan.prefix, /^SIM-YOYOOSUN-PQ-/u);
  assert.equal(plan.names.supplier, "【试用】面料供应商 01");
  assert.equal(plan.names.material, "【试用】短毛绒材料 01");
  assert.deepEqual(plan.orderStatuses, [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "CLOSED",
    "CANCELED",
  ]);
  assert.deepEqual(
    plan.receiptScenarios.map((item) => item.key),
    [
      "DRAFT",
      "SUBMITTED",
      "PASSED_POSTED",
      "REJECTED",
      "INSPECTION_CANCELLED",
      "RECEIPT_CANCELLED",
    ],
  );
});

test("parseArgs rejects incomplete identifiers and unsafe run ids", () => {
  const parsed = parseArgs([
    "--supplier-id",
    "1",
    "--material-id",
    "2",
    "--unit-id",
    "3",
    "--warehouse-id",
    "4",
    "--run-id",
    "target run",
  ]);
  assert.equal(parsed.runId, "TARGET-RUN");
  assert.throws(
    () => buildPlan({ ...parsed, materialId: 0 }),
    /materialId must be a positive integer/u,
  );
});

test("standalone apply parsing rejects every external backend and accepts normalized loopback URLs", () => {
  for (const backendURL of [
    "https://example.invalid",
    "http://192.168.0.133:8300",
    "http://127.0.0.1.example.invalid:8300",
  ]) {
    assert.throws(
      () => parseArgs(["--apply", "--backend-url", backendURL]),
      /local-only/u,
    );
  }

  assert.equal(
    parseArgs([
      "--apply",
      "--backend-url",
      "HTTP://LOCALHOST:8300/path/?unsafe=1#fragment",
    ]).backendURL,
    "http://localhost:8300/path",
  );
  assert.equal(
    parseArgs(["--apply", "--backend-url", "http://[::1]:8300/"]).backendURL,
    "http://[::1]:8300",
  );
});

test("standalone apply requires a separate admin guard credential before login", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "pq-admin-credential-"));
  await assert.rejects(
    () =>
      execFile(
        process.execPath,
        [
          scriptPath,
          "--apply",
          "--backend-url",
          "http://127.0.0.1:1",
          "--supplier-id",
          "1",
          "--material-id",
          "2",
          "--unit-id",
          "3",
          "--warehouse-id",
          "4",
          "--out",
          out,
        ],
        {
          env: {
            ...process.env,
            PURCHASE_QUALITY_SIM_CONFIRM:
              "APPLY_SIMULATED_PURCHASE_QUALITY_MATRIX",
            PURCHASE_QUALITY_SIM_ADMIN_PASSWORD: "",
            PURCHASE_QUALITY_SIM_PASSWORD: "unused-local-demo-password",
          },
        },
      ),
    (error) => {
      assert.match(
        error.stderr,
        /apply requires PURCHASE_QUALITY_SIM_ADMIN_PASSWORD/u,
      );
      assert.doesNotMatch(error.stderr, /unused-local-demo-password/u);
      return true;
    },
  );
  await rm(out, { recursive: true, force: true });
});

test("direct apply rejects an externally constructed plan before login", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyPlan(
        {
          ...testPlan("DIRECT-EXTERNAL"),
          backendURL: "https://example.invalid",
        },
        "local-demo-password",
        {
          fetchImpl: async () => {
            fetchCalls += 1;
            throw new Error("fetch must not run for an external backend");
          },
        },
      ),
    /local-only/u,
  );
  assert.equal(fetchCalls, 0);
});

test("direct apply requires a separate admin guard credential before login", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyPlan(testPlan("MISSING-ADMIN-CREDENTIAL"), "local-demo-password", {
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("login must not run without the admin credential");
        },
      }),
    /PURCHASE_QUALITY_SIM_ADMIN_PASSWORD is required/u,
  );
  assert.equal(fetchCalls, 0);
});

test("direct apply rejects redirected login responses before runtime reads", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      applyPlan(testPlan("REDIRECT-GUARD"), "local-demo-password", {
        adminPassword: TEST_ADMIN_PASSWORD,
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

test("direct apply rejects non-local runtime before any business write", async () => {
  const calls = [];
  await assert.rejects(
    () =>
      applyPlan(testPlan("PROD-RUNTIME"), "local-demo-password", {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          calls.push({
            method: body.method,
            params: body.params,
            authorization: init.headers.Authorization,
          });
          if (body.method === "admin_login") {
            return ok({ access_token: `token-${body.params.username}` });
          }
          if (body.method === "capabilities") {
            return ok({ environment: "production" });
          }
          throw new Error(`unexpected method ${body.method}`);
        },
      }),
    /environment=production/u,
  );
  const methods = calls.map((call) => call.method);
  assert.equal(methods.filter((method) => method === "admin_login").length, 5);
  const loginCalls = calls.filter((call) => call.method === "admin_login");
  assert.equal(loginCalls[0].params.username, "admin");
  assert.equal(loginCalls[0].params.password, TEST_ADMIN_PASSWORD);
  assert.equal(
    loginCalls.some((call) => call.params.username === "demo_admin"),
    false,
  );
  for (const roleLogin of loginCalls.slice(1)) {
    assert.equal(roleLogin.params.password, "local-demo-password");
  }
  assert.equal(
    calls.find((call) => call.method === "capabilities")?.authorization,
    "Bearer token-admin",
  );
  assert(methods.includes("capabilities"));
  assert(!methods.includes("save_purchase_order_with_items"));
  assert(!methods.includes("create_purchase_receipt_with_items"));
});

test("purchase and quality batch runs reuse one authenticated session but recheck runtime", async () => {
  const calls = [];
  const authSession = {};
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method);
    if (body.method === "admin_login") {
      return ok({ access_token: `token-${body.params.username}` });
    }
    if (body.method === "capabilities") {
      return ok({ environment: "production" });
    }
    throw new Error(`unexpected method ${body.method}`);
  };

  for (const runId of ["SESSION-ONE", "SESSION-TWO"]) {
    await assert.rejects(
      () =>
        applyPlan(testPlan(runId), "local-demo-password", {
          adminPassword: TEST_ADMIN_PASSWORD,
          authSession,
          fetchImpl,
        }),
      /environment=production/u,
    );
  }
  assert.equal(calls.filter((method) => method === "admin_login").length, 5);
  assert.equal(calls.filter((method) => method === "capabilities").length, 2);
});

test("direct apply requires an active yoyoosun config revision before any business write", async () => {
  for (const session of [
    {
      customer: { key: "other-customer" },
      source: "active_customer_config_revision",
      configRevision: "other-r1",
    },
    {
      customer: { key: "yoyoosun" },
      source: "fallback",
      configRevision: "yoyoosun-r1",
    },
    {
      customer: { key: "yoyoosun" },
      source: "active_customer_config_revision",
      configRevision: "",
    },
  ]) {
    const methods = [];
    await assert.rejects(
      () =>
        applyPlan(testPlan("BAD-REVISION"), "local-demo-password", {
          adminPassword: TEST_ADMIN_PASSWORD,
          fetchImpl: async (_url, init) => {
            const body = JSON.parse(init.body);
            methods.push(body.method);
            if (body.method === "admin_login") {
              return ok({ access_token: `token-${body.params.username}` });
            }
            if (body.method === "capabilities") {
              return ok({ environment: "local" });
            }
            if (body.method === "get_effective_session") {
              return ok({ session });
            }
            throw new Error(`unexpected method ${body.method}`);
          },
        }),
      /active customer configuration is not current/u,
    );
    assert(!methods.includes("save_purchase_order_with_items"));
    assert(!methods.includes("create_purchase_receipt_with_items"));
  }
});

test("purchase and quality mutations reject malformed success payloads", async () => {
  const methods = [];
  await assert.rejects(
    () =>
      applyPlan(testPlan("MALFORMED-SUCCESS"), "local-demo-password", {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          methods.push(body.method);
          if (body.method === "admin_login") {
            return ok({ access_token: `token-${body.params.username}` });
          }
          if (body.method === "capabilities") {
            return ok({ environment: "local" });
          }
          if (body.method === "get_effective_session") {
            return ok({
              session: {
                customer: { key: "yoyoosun" },
                source: "active_customer_config_revision",
                configRevision: "yoyoosun-r1",
                modules: {
                  purchase_orders: "enabled",
                  purchase_receipts: "enabled",
                  quality_inspections: "enabled",
                  inventory: "enabled",
                },
              },
            });
          }
          if (
            ["list_purchase_orders", "list_purchase_receipts"].includes(
              body.method,
            )
          ) {
            return ok({
              [body.method === "list_purchase_orders"
                ? "purchase_orders"
                : "purchase_receipts"]: [],
              total: 0,
            });
          }
          if (body.method === "save_purchase_order_with_items") {
            return ok({});
          }
          throw new Error(`unexpected method ${body.method}`);
        },
      }),
    /response missing purchase_order\.id/u,
  );
  assert(!methods.includes("create_purchase_receipt_with_items"));
});

test("purchase and quality apply rejects disabled downstream modules before writes", async () => {
  const methods = [];
  await assert.rejects(
    () =>
      applyPlan(testPlan("DISABLED-FINISH"), "local-demo-password", {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          methods.push(body.method);
          if (body.method === "admin_login") {
            return ok({ access_token: `token-${body.params.username}` });
          }
          if (body.method === "capabilities") {
            return ok({ environment: "local" });
          }
          if (body.method === "get_effective_session") {
            return ok({
              session: {
                customer: { key: "yoyoosun" },
                source: "active_customer_config_revision",
                configRevision: "yoyoosun-r1",
                modules: {
                  purchase_orders: "enabled",
                  purchase_receipts: "enabled",
                  quality_inspections: "read_only",
                  inventory: "enabled",
                },
              },
            });
          }
          throw new Error(`unexpected method ${body.method}`);
        },
      }),
    /required modules are not enabled: quality_inspections/u,
  );
  assert(!methods.includes("save_purchase_order_with_items"));
});

test("purchase and quality apply refuses an existing deterministic run before writes", async () => {
  const methods = [];
  await assert.rejects(
    () =>
      applyPlan(testPlan("EXISTING-RUN"), "local-demo-password", {
        adminPassword: TEST_ADMIN_PASSWORD,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          methods.push(body.method);
          if (body.method === "admin_login") {
            return ok({ access_token: `token-${body.params.username}` });
          }
          if (body.method === "capabilities") {
            return ok({ environment: "local" });
          }
          if (body.method === "get_effective_session") {
            return ok({
              session: {
                customer: { key: "yoyoosun" },
                source: "active_customer_config_revision",
                configRevision: "yoyoosun-r1",
                modules: {
                  purchase_orders: "enabled",
                  purchase_receipts: "enabled",
                  quality_inspections: "enabled",
                  inventory: "enabled",
                },
              },
            });
          }
          if (body.method === "list_purchase_orders") {
            return ok({ purchase_orders: [{ id: 1 }], total: 1 });
          }
          throw new Error(`unexpected method ${body.method}`);
        },
      }),
    /already contains purchase or quality records/u,
  );
  assert(!methods.includes("save_purchase_order_with_items"));
});

test("page-visible simulated records use trial wording instead of developer wording", () => {
  const source = readFileSync(
    new URL("./purchase-quality-simulated-matrix.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /【试用】模拟采购供应商/u);
  assert.match(source, /模拟试用数据，请勿用于正式业务/u);
  assert.doesNotMatch(source, /【手工测试】|甲方员工|测试人员/u);
});

test("receipt-created inspections start submitted, add a real draft, and include both cancellation paths", async () => {
  const plan = buildPlan({
    backendURL: "http://127.0.0.1:8300",
    runId: "LOCAL-UAT-20260711-R3-PQ-01",
    supplierId: 1,
    materialId: 2,
    unitId: 3,
    warehouseId: 4,
  });
  const calls = [];
  let orderId = 100;
  let receiptId = 200;
  const orderItemByOrderId = new Map();
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method, params: body.params });
    let data = {};
    if (body.method === "admin_login") {
      data = { access_token: `token-${body.params.username}` };
    } else if (body.method === "capabilities") {
      data = { environment: "dev" };
    } else if (body.method === "get_effective_session") {
      data = {
        session: {
          customer: { key: "yoyoosun" },
          source: "active_customer_config_revision",
          configRevision: "yoyoosun-r1",
          modules: {
            purchase_orders: "enabled",
            purchase_receipts: "enabled",
            quality_inspections: "enabled",
            inventory: "enabled",
          },
        },
      };
    } else if (body.method === "save_purchase_order_with_items") {
      orderId += 1;
      const orderItem = { id: orderId + 1000 };
      orderItemByOrderId.set(orderId, orderItem);
      data = {
        purchase_order: { id: orderId, lifecycle_status: "draft" },
        purchase_order_items: [orderItem],
      };
    } else if (
      [
        "submit_purchase_order",
        "approve_purchase_order",
        "close_purchase_order",
        "cancel_purchase_order",
      ].includes(body.method)
    ) {
      const statuses = {
        submit_purchase_order: "submitted",
        approve_purchase_order: "approved",
        close_purchase_order: "closed",
        cancel_purchase_order: "canceled",
      };
      data = {
        purchase_order: {
          id: body.params.id,
          lifecycle_status: statuses[body.method],
        },
      };
    } else if (
      [
        "create_purchase_receipt_with_items",
        "create_purchase_receipt_from_purchase_order",
      ].includes(body.method)
    ) {
      receiptId += 1;
      const purchaseOrderItemId = body.params.purchase_order_id
        ? orderItemByOrderId.get(body.params.purchase_order_id)?.id
        : undefined;
      data = {
        purchase_receipt: {
          id: receiptId,
          status: "DRAFT",
          items: [
            {
              id: receiptId + 500,
              lot_id: receiptId + 750,
              purchase_order_item_id: purchaseOrderItemId,
            },
          ],
          quality_inspections: [
            {
              id: receiptId + 1000,
              status: "SUBMITTED",
              inventory_lot_id: receiptId + 750,
            },
          ],
        },
      };
    } else if (body.method === "create_quality_inspection_draft") {
      data = {
        quality_inspection: {
          id: receiptId + 2000,
          status: "DRAFT",
        },
      };
    } else if (
      [
        "submit_quality_inspection",
        "pass_quality_inspection",
        "reject_quality_inspection",
        "cancel_quality_inspection",
      ].includes(body.method)
    ) {
      const statuses = {
        submit_quality_inspection: "SUBMITTED",
        pass_quality_inspection: "PASSED",
        reject_quality_inspection: "REJECTED",
        cancel_quality_inspection: "CANCELLED",
      };
      data = {
        quality_inspection: {
          id: body.params.id,
          status: statuses[body.method],
        },
      };
    } else if (
      ["post_purchase_receipt", "cancel_purchase_receipt"].includes(body.method)
    ) {
      data = {
        purchase_receipt: {
          id: body.params.id,
          status:
            body.method === "post_purchase_receipt" ? "POSTED" : "CANCELLED",
        },
      };
    }
    return {
      ok: true,
      json: async () => ({
        result: { code: 0, message: "ok", data },
      }),
    };
  };

  const steps = await applyPlan(plan, "local-demo-password", {
    adminPassword: TEST_ADMIN_PASSWORD,
    fetchImpl,
  });

  const methods = calls.map((item) => item.method);
  assert(
    methods.indexOf("capabilities") <
      methods.indexOf("save_purchase_order_with_items"),
  );
  assert(
    methods.indexOf("get_effective_session") <
      methods.indexOf("save_purchase_order_with_items"),
  );
  assert.equal(
    methods.filter((method) => method === "create_purchase_receipt_with_items")
      .length,
    5,
  );
  assert.equal(
    methods.filter(
      (method) => method === "create_purchase_receipt_from_purchase_order",
    ).length,
    1,
  );
  for (const call of calls.filter((item) =>
    [
      "create_purchase_receipt_with_items",
      "create_purchase_receipt_from_purchase_order",
    ].includes(item.method),
  )) {
    assert(String(call.params.receipt_no).length <= 64);
    for (const item of call.params.items || []) {
      assert(String(item.lot_no).length <= 64);
    }
  }
  const linkedReceipt = steps.find(
    (item) =>
      item.target === "purchase_receipt_quality" && item.linkedToPurchaseOrder,
  );
  assert(linkedReceipt?.purchaseOrderId > 0);
  assert(linkedReceipt?.purchaseOrderItemId > 0);
  assert(linkedReceipt?.lotId > 0);
  assert.equal(linkedReceipt.receiptStatus, "POSTED");
  assert.equal(linkedReceipt.inspectionStatus, "PASSED");
  const passedDecision = calls.find(
    (call) => call.method === "pass_quality_inspection",
  );
  assert.equal(passedDecision?.params.defect_rate_operator, "APPROX");
  assert.equal(passedDecision?.params.defect_rate_percent, "5");
  assert.equal(typeof passedDecision?.params.defect_rate_percent, "string");
  const rejectedDecision = calls.find(
    (call) => call.method === "reject_quality_inspection",
  );
  assert.equal(rejectedDecision?.params.defect_rate_operator, "GT");
  assert.equal(rejectedDecision?.params.defect_rate_percent, "50");
  assert.equal(typeof rejectedDecision?.params.defect_rate_percent, "string");
  assert.equal(
    methods.filter((method) => method === "create_quality_inspection_draft")
      .length,
    1,
  );
  assert.equal(
    methods.filter((method) => method === "submit_quality_inspection").length,
    0,
  );
  assert.equal(
    methods.filter((method) => method === "cancel_quality_inspection").length,
    1,
  );
  assert.equal(
    methods.filter((method) => method === "cancel_purchase_receipt").length,
    1,
  );
  const draftStep = steps.find(
    (item) =>
      item.target === "purchase_receipt_quality" && item.scenario === "DRAFT",
  );
  assert.equal(draftStep?.inspectionStatus, "DRAFT");
  assert.notEqual(draftStep?.inspectionId, draftStep?.autoInspectionId);
});
