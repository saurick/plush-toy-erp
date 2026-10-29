import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { RpcErrorCode as CODE } from "../../web/src/common/consts/errorCodes.generated.js";
import {
  assignTransactionWarehouseScopes,
  createTransactionClient,
  prepareTransactionFixture,
} from "./transaction-real-backend-fixture.mjs";
import { approvePurchaseOrderThroughProcess } from "./purchase-order-approval-process.mjs";
import { runPartialReceiving, assertPartialReceivingEvidence } from "./transaction-receiving-partial-browser.mjs";
import { correctQualityThroughBrowser } from "./transaction-quality-correction-browser.mjs";
import { warehouseOptionFromRecord } from "../../web/src/erp/utils/referenceSelectOptions.mjs";
import { BUSINESS_ROUTE_PATHS } from "../../web/src/erp/utils/masterDataOrderView.mjs";
import {
  login,
  navigate,
  closePage,
  businessURL,
  selectRow,
  pageAction,
  modal,
  selectOption,
  dropRealResponse,
  faultEvidence,
  captureFailure,
  clickRPC,
  assertMobileLayout,
  openMobileSourceTask,
} from "./transaction-browser-ui.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("playwright/test");
export const RECEIVING_FLOW_KEYS = Object.freeze(
  ["arrival_count", "purchase_return", "outsourcing_return_quality"].flatMap(
    (key) => ["desktop", "mobile"].map((surface) => `${surface}_${key}`),
  ),
);
export function assertReceivingEvidence(report) {
  assert.deepEqual(
    report.flows.map(({ key }) => key),
    RECEIVING_FLOW_KEYS,
  );
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.unexpectedRPC, []);
  assertPartialReceivingEvidence(report.partialReceiving);
  assert.ok(report.browserRPC.length > 0);
  for (const flow of report.flows) {
    for (const key of [
      "passed",
      "invalidUnchanged",
      "forbiddenUnchanged",
      "replayExact",
      "changedIntentRejected",
      "responseRecovered",
      "ledgerVerified",
      "sourceVerified",
      "backendInvalidUnchanged",
    ])
      assert.equal(flow[key], true, `${flow.key}.${key}`);
    assert.ok(Number.isSafeInteger(flow.sourceID) && flow.sourceID > 0);
    assert.ok(flow.transportFaults.length > 0);
    for (const fault of flow.transportFaults) {
      assert.equal(fault.injected, true);
      assert.equal(fault.backendCode, 0);
      assert.ok(fault.requestID);
    }
    if (flow.key.endsWith("arrival_count")) {
      assert.equal(flow.packages, 2);
      assert.equal(flow.qualityGate, true);
    } else if (flow.key.endsWith("purchase_return")) {
      assert.equal(flow.reversalRestored, true);
      assert.equal(flow.cancelReplayExact, true);
      assert.equal(flow.registrationSurface, "desktop");
      assert.equal(flow.postSurface, "desktop");
      assert.equal(flow.reversalSurface, "desktop");
      if (flow.key.startsWith("mobile_")) assert.equal(flow.completedTaskReadOnly, true);
    } else {
      assert.equal(flow.correctionPreservesEvidence, true);
      assert.equal(flow.dependentCancelBlocked, true);
      assert.equal(flow.correctionCreatedInBrowser, true);
      assert.equal(flow.correctionReasonRequired, true);
      assert.equal(flow.correctionReplayAfterDecisionExact, true);
    }
  }
}

async function run(options) {
  options = {
    ...options,
    fourK: true,
    outputDir: path.join(options.outputDir, "receiving"),
  };
  await fs.mkdir(options.outputDir, { recursive: true });
  const client = createTransactionClient(options);
  const report = {
    status: "running",
    flows: [],
    pageErrors: [],
    browserRPC: [],
    expectedFailures: [],
    databaseName: options.databaseName,
    simulatedOnly: true,
  };
  let browser, activePage;
  const sessions = new Map();
  try {
    report.identity = await client.verify();
    for (const role of [
      "admin",
      "purchase",
      "warehouse",
      "quality",
      "sales",
      "boss",
      "finance",
      "engineering",
    ])
      await client.login(role);
    const prefix = `SIM-E2E-${options.runID.toUpperCase()}`;
    let fixture;
    if (
      !client.query(
        `SELECT to_json(count(*)) FROM customers WHERE code='${prefix}-CUS'`,
      )
    )
      fixture = await prepareTransactionFixture(client, options);
    else {
      const { suppliers } = await client.rpc(
        "admin",
        "masterdata",
        "list_suppliers",
        { limit: 100 },
      );
      const { materials } = await client.rpc(
        "admin",
        "masterdata",
        "list_materials",
        { limit: 100 },
      );
      const { warehouses } = await client.rpc(
        "admin",
        "masterdata",
        "list_warehouses",
        { limit: 100 },
      );
      const receiptID = client.query(
        `SELECT to_json(id) FROM purchase_receipts WHERE receipt_no='${prefix}-PR'`,
      );
      const { purchase_receipt: receipt } = await client.rpc(
        "warehouse",
        "purchase",
        "get_purchase_receipt",
        { id: receiptID },
      );
      const { customers } = await client.rpc("admin", "masterdata", "list_customers", { limit: 100 });
      fixture = {
        prefix,
        customer: customers.find((row) => row.code === `${prefix}-CUS`),
        supplier: suppliers.find((row) => row.code === `${prefix}-SUP`),
        material: materials.find(
          (row) => row.id === receipt.items[0].material_id,
        ),
        warehouse: warehouses.find(
          (row) => row.id === receipt.items[0].warehouse_id,
        ),
      };
      assert.ok(fixture.supplier && fixture.material && fixture.warehouse);
    }
    report.frontendIdentity = await client.verifyFrontend();
    browser = await chromium.launch({ headless: true });
    const pageFor = async (role, mobile) => {
      const key = `${role}:${mobile}`;
      if (!sessions.has(key))
        sessions.set(
          key,
          await login(browser, { ...options, mobile }, role, report),
        );
      activePage = sessions.get(key).page;
      return activePage;
    };
    const open = async (role, mobile, route, id, checkbox = false, taskSource = null) => {
      const page = await pageFor(role, mobile);
      const routePath =
        {
          "purchase/orders": BUSINESS_ROUTE_PATHS.purchaseOrders,
          "production/processing-contracts":
            BUSINESS_ROUTE_PATHS.processingContracts,
        }[route] || route;
      const target = new URL(
        businessURL(
          { ...options, mobile },
          role,
          routePath.replace(/^\/erp\//u, ""),
        ),
      );
      if (route === "production/quality-inspections")
        target.searchParams.set("quality_inspection_id", id);
      if (mobile) {
        const source = {
          "purchase/orders": ["purchase_order", ["handoff_purchase_arrival"]],
          "warehouse/inbound": ["purchase_receipt", ["handoff_receipt_inbound"]],
          "production/processing-contracts": ["outsourcing_order", ["handoff_outsourcing_return"]],
          "production/quality-inspections": ["quality_inspection", ["handoff_receipt_quality", "handoff_outsourcing_quality", "handoff_production_quality"]],
        }[route];
        assert.ok(source, `missing mobile source task expectation for ${route}`);
        const task = await openMobileSourceTask(page, { ...options, mobile }, client, role, taskSource?.type || source[0], taskSource?.id || id, taskSource?.groups || source[1]);
        (report.mobileBusinessEntries ??= []).push({ taskID: task.id, sourceType: task.source_type, sourceID: task.source_id, taskGroup: task.task_group });
        await expect(page.getByTestId("mobile-task-business-source")).toHaveAttribute("data-record-id", String(id));
        return page;
      }
      await navigate(page, target.href);
      await assertMobileLayout(page, { ...options, mobile });
      if (checkbox)
        await page
          .locator(`.ant-table-row[data-row-key="${id}"]:visible`)
          .getByRole("checkbox")
          .check();
      else await selectRow(page, id);
      return page;
    };
    const snapshot = (table, where) => {
      if (
        table === "purchase_receipts" &&
        /^purchase_order_id=\d+$/u.test(where)
      )
        where = `id IN (SELECT receipt_id FROM purchase_receipt_items WHERE purchase_order_item_id IN (SELECT id FROM purchase_order_items WHERE ${where}))`;
      return client.query(
        `SELECT to_json(COALESCE(json_agg(t ORDER BY id),'[]'::json)) FROM ${table} t WHERE ${where}`,
      );
    };
    const stock = (lotID) =>
      client.query(
        `SELECT json_build_object('balance',COALESCE((SELECT sum(quantity) FROM inventory_balances WHERE lot_id=${lotID}),0),'net',COALESCE((SELECT sum(quantity*direction) FROM inventory_txns WHERE lot_id=${lotID}),0),'txns',(SELECT count(*) FROM inventory_txns WHERE lot_id=${lotID}),'lot',(SELECT status FROM inventory_lots WHERE id=${lotID}))`,
      );
    const facts = () =>
      client.query(
        `SELECT json_build_object(${["purchase_receipts", "purchase_receipt_items", "purchase_returns", "purchase_return_items", "inventory_lots", "inventory_balances", "inventory_txns", "quality_inspections", "outsourcing_facts"].map((table) => `'${table}',(SELECT md5(COALESCE(json_agg(r ORDER BY id)::text,'[]')) FROM ${table} r)`).join(",")})`,
      );
    const rejected = async (actor, domain, method, params, code) => {
      const before = facts();
      const response = await client.raw(actor, domain, method, params);
      assert.equal(
        response.code,
        code,
        `${actor}:${method}: ${response.message}`,
      );
      assert.deepEqual(
        facts(),
        before,
        `${method} rejection changed business facts`,
      );
      report.expectedFailures.push({
        actor,
        domain,
        method,
        code,
        factsUnchanged: true,
      });
    };
    const lost = async (page, domain, method, action, flow) => {
      const fault = await dropRealResponse(page, options, domain, method);
      await action();
      await expect.poll(() => Boolean(fault.state.captured)).toBe(true);
      await fault.remove();
      flow.transportFaults.push(faultEvidence(fault.state));
      (flow.transportRequests ??= []).push({
        method,
        params: fault.state.params,
      });
      assert.equal(
        fault.state.backendCode,
        0,
        `${method} failed before response loss: ${JSON.stringify(fault.state.params)}`,
      );
      return fault.state.params;
    };
    const auditForm = async (dialog, flow, name) => {
      const fields = await dialog.locator("label[for]").evaluateAll((labels) =>
        labels.map((label) => {
          const id = label.htmlFor;
          const controls = [...document.querySelectorAll("[id]")].filter(
            (node) => node.id === id,
          );
          return {
            label: label.textContent,
            id,
            matches: controls.length,
            sameForm:
              controls.length === 1 &&
              controls[0].closest("form") === label.closest("form"),
          };
        }),
      );
      (flow.formFields ??= []).push({ name, fields });
      assert.ok(fields.length > 0);
      assert.deepEqual(
        fields.filter((field) => field.matches !== 1 || !field.sameForm),
        [],
        `${name} field labels must identify their own unique controls`,
      );
    };
    const screenshot = async (page, key) => {
      await expect(
        page.locator(".ant-form-item-has-error:visible"),
      ).toHaveCount(0);
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".ant-message-notice")].every(
          (node) => node.getClientRects().length === 0,
        ),
      );
      return page.screenshot({
        path: path.join(options.outputDir, `${key}.png`),
        fullPage: false,
      });
    };
    const popup = (page, method, label = "确认") =>
      clickRPC(page, method, () =>
        page
          .locator(".ant-popover:visible")
          .getByRole("button", { name: label, exact: true })
          .click(),
      );
    const decide = async (id, mobile, reject = false, kind = "INCOMING") => {
      const { quality_inspection: inspection } = await client.rpc(
        "quality",
        "quality",
        "get_quality_inspection",
        { id },
      );
      assert.equal(inspection.inspection_type, kind);
      assert.ok(["INCOMING", "OUTSOURCING_RETURN"].includes(kind));
      const page = await open(
        "quality",
        mobile,
        "production/quality-inspections",
        id,
      );
      await pageAction(page, reject ? "判定不合格" : "判定合格");
      const dialog = await modal(page, reject ? "判定不合格" : "判定合格");
      const results = dialog.getByLabel("检查结果", { exact: true });
      const count = await results.count();
      assert.equal(
        count,
        kind === "INCOMING" ? 3 : 1,
        `${kind} must use its formal decision form`,
      );
      for (let i = 0; i < count; i++) {
        await selectOption(
          page,
          results.nth(i),
          reject && i === 0 ? "异常" : "符合",
        );
        await selectOption(
          page,
          dialog.getByLabel("检查范围", { exact: true }).nth(i),
          "全检",
        );
        await dialog
          .getByLabel("实际情况", { exact: true })
          .nth(i)
          .fill(
            reject && i === 0 ? "模拟尺寸超差 0.5 cm" : "模拟逐项复核符合约定",
          );
      }
      await dialog
        .getByRole("radio", {
          name: reject ? "自定义" : "0%（未发现不良）",
          exact: true,
        })
        .check();
      if (reject) {
        await dialog
          .getByRole("spinbutton", { name: "自定义不良比例", exact: true })
          .fill("10");
      }
      const decisionNote = reject
        ? "模拟回货尺寸不符，保留原判定"
        : kind === "INCOMING"
          ? "模拟来料逐项检验符合约定"
          : "模拟量具复核后符合委外约定";
      await dialog.getByLabel("判定备注", { exact: true }).fill(decisionNote);
      const result = await clickRPC(
        page,
        reject ? "reject_quality_inspection" : "pass_quality_inspection",
        () =>
          dialog
            .getByRole("button", {
              name: reject ? "确认不合格" : "确认合格",
              exact: true,
            })
            .click(),
      );
      await expect(dialog).toBeHidden();
      assert.equal(result.quality_inspection.decision_note, decisionNote);
      assert.equal(
        Number(result.quality_inspection.defect_rate_percent),
        reject ? 10 : 0,
      );
      (report.decisions ??= []).push({
        id,
        kind,
        checkFields: count,
        decisionNote,
        defectRate: reject ? 10 : 0,
        status: result.quality_inspection.status,
      });
      return result.quality_inspection;
    };
    const newFlow = (kind, mobile) => {
      const flow = {
        key: `${mobile ? "mobile" : "desktop"}_${kind}`,
        transportFaults: [],
      };
      report.flows.push(flow);
      return flow;
    };
    for (const mobile of [false, true]) {
      const flow = newFlow("arrival_count", mobile),
        prefix = `${fixture.prefix}-${mobile ? "MA" : "DA"}`;
      const { purchase_order: order } = await client.rpc(
        "purchase",
        "purchase_order",
        "save_purchase_order_with_items",
        {
          purchase_order_no: `${prefix}-PO`,
          supplier_id: fixture.supplier.id,
          supplier_snapshot: {
            code: fixture.supplier.code,
            name: fixture.supplier.name,
          },
          purchase_date: new Date().toISOString().slice(0, 10),
          currency: "CNY",
          items: [
            {
              line_no: 1,
              material_id: fixture.material.id,
              unit_id: fixture.material.default_unit_id,
              purchased_quantity: "10",
              unit_price: "3.5",
              amount: "35",
            },
          ],
        },
      );
      await approvePurchaseOrderThroughProcess({
        purchaseOrder: order,
        customerKey: "yoyoosun",
        idempotencyPrefix: prefix,
        invoke: ({ actor, domain, method, params }) =>
          client.rpc(actor, domain, method, params),
      });
      flow.sourceID = order.id;
      const page = await open(
        "warehouse",
        mobile,
        "purchase/orders",
        order.id,
        true,
      );
      await pageAction(page, "登记到货");
      const dialog = await modal(page, "登记采购到货");
      const submit = dialog.getByRole("button", {
        name: "保存到货并送检",
        exact: true,
      });
      await expect(submit).toBeEnabled();
      const no = dialog.getByLabel("入库单号", { exact: true });
      await no.fill(`${prefix}-IN`);
      const before = snapshot(
        "purchase_receipts",
        `purchase_order_id=${order.id}`,
      );
      const callsBefore = report.browserRPC.filter(
        (call) => call.method === "create_purchase_receipt_from_purchase_order",
      ).length;
      await submit.click();
      await expect(
        dialog.getByText("请填写本次实际收到的数量", { exact: true }),
      ).toBeVisible();
      assert.equal(
        report.browserRPC.filter(
          (call) =>
            call.method === "create_purchase_receipt_from_purchase_order",
        ).length,
        callsBefore,
      );
      assert.deepEqual(
        snapshot("purchase_receipts", `purchase_order_id=${order.id}`),
        before,
      );
      flow.invalidUnchanged = true;
      await selectOption(
        page,
        dialog.getByRole("combobox", { name: "第1条入库仓库", exact: true }),
        warehouseOptionFromRecord(fixture.warehouse).label,
      );
      await dialog
        .getByRole("spinbutton", { name: "第1条实点数量", exact: true })
        .fill("4");
      await dialog
        .getByRole("spinbutton", { name: "第1条标示数量", exact: true })
        .fill("5");
      await dialog
        .getByRole("textbox", { name: "第1条批次号", exact: true })
        .fill(`${prefix}-ROLL1`);
      await dialog.getByRole("button", { name: /增加一卷 \/ 包/u }).click();
      await dialog
        .getByRole("spinbutton", { name: "第2条实点数量", exact: true })
        .fill("3");
      await dialog
        .getByRole("spinbutton", { name: "第2条标示数量", exact: true })
        .fill("3");
      await dialog
        .getByRole("textbox", { name: "第2条批次号", exact: true })
        .fill(`${prefix}-ROLL2`);
      await expect(dialog.getByText(/比标示少.*1/u)).toBeVisible();
      await auditForm(dialog, flow, "arrival-count");
      await screenshot(page, `${flow.key}-counted`);
      const params = await lost(
        page,
        "purchase",
        "create_purchase_receipt_from_purchase_order",
        () => submit.click(),
        flow,
      );
      await expect(submit).toBeEnabled();
      await expect(no).toHaveValue(`${prefix}-IN`);
      const rows = snapshot(
        "purchase_receipts",
        `purchase_order_id=${order.id}`,
      );
      assert.equal(rows.length, 1);
      const receiptID = rows[0].id;
      const items = snapshot(
        "purchase_receipt_items",
        `receipt_id=${receiptID}`,
      );
      assert.equal(items.length, 2);
      assert.deepEqual(
        items.map((item) => Number(item.quantity)),
        [4, 3],
      );
      assert.deepEqual(
        items.map((item) => Number(item.declared_quantity)),
        [5, 3],
      );
      assert.equal(new Set(items.map((item) => item.lot_id)).size, 2);
      assert.ok(
        items.every(
          (item) =>
            item.material_id === fixture.material.id &&
            item.warehouse_id === fixture.warehouse.id &&
            item.unit_id === fixture.material.default_unit_id,
        ),
      );
      const unchanged = () => ({
        headers: snapshot("purchase_receipts", `purchase_order_id=${order.id}`),
        items: snapshot("purchase_receipt_items", `receipt_id=${receiptID}`),
        inspections: snapshot(
          "quality_inspections",
          `purchase_receipt_id=${receiptID}`,
        ),
        stocks: items.map((item) => stock(item.lot_id)),
      });
      const committed = unchanged();
      await rejected(
        "sales",
        "purchase",
        "create_purchase_receipt_from_purchase_order",
        params,
        CODE.PERMISSION_DENIED,
      );
      assert.deepEqual(unchanged(), committed);
      flow.forbiddenUnchanged = true;
      await rejected(
        "warehouse",
        "purchase",
        "create_purchase_receipt_from_purchase_order",
        { ...params, note: "模拟同键改变内容" },
        CODE.IDEMPOTENCY_CONFLICT,
      );
      assert.deepEqual(unchanged(), committed);
      flow.changedIntentRejected = true;
      await rejected(
        "warehouse",
        "purchase",
        "create_purchase_receipt_from_purchase_order",
        {
          ...params,
          receipt_no: `${prefix}-INVALID`,
          idempotency_key: `${prefix}:invalid`,
          items: params.items.map((item, index) => ({
            ...item,
            quantity: index ? item.quantity : "0",
          })),
        },
        CODE.INVALID_PARAM,
      );
      flow.backendInvalidUnchanged = true;
      await clickRPC(page, "create_purchase_receipt_from_purchase_order", () =>
        submit.click(),
      );
      await expect(dialog).toBeHidden();
      assert.deepEqual(unchanged(), committed);
      flow.replayExact = flow.responseRecovered = true;
      await rejected(
        "warehouse",
        "purchase",
        "post_purchase_receipt",
        { id: receiptID },
        CODE.BUSINESS_RULE_VIOLATION,
      );
      assert.deepEqual(unchanged(), committed);
      for (const inspection of committed.inspections)
        assert.equal((await decide(inspection.id, mobile)).status, "PASSED");
      const warehouse = await open(
        "warehouse",
        mobile,
        "warehouse/inbound",
        receiptID,
      );
      await pageAction(warehouse, "确认材料入库");
      await popup(warehouse, "post_purchase_receipt");
      for (const item of items)
        assert.deepEqual(stock(item.lot_id), {
          balance: Number(item.quantity),
          net: Number(item.quantity),
          txns: 1,
          lot: "ACTIVE",
        });
      flow.database = { counted: committed, posted: unchanged() };
      flow.packages = 2;
      flow.receiptID = receiptID;
      flow.qualityGate =
        flow.sourceVerified =
        flow.ledgerVerified =
        flow.passed =
          true;
      await screenshot(warehouse, flow.key);
    }
    for (const mobile of [false, true]) {
      const flow = newFlow("purchase_return", mobile);
      const arrival = report.flows.find(
        (entry) =>
          entry.key === `${mobile ? "mobile" : "desktop"}_arrival_count`,
      );
      const receiptID = arrival.receiptID,
        items = snapshot("purchase_receipt_items", `receipt_id=${receiptID}`),
        source = items[0];
      flow.sourceID = receiptID;
      if (mobile) {
        const completed = await open("warehouse", true, "warehouse/inbound", receiptID);
        for (const label of ["生成采购退货", "确认材料入库", "取消入库"])
          await expect(completed.getByRole("button", { name: label, exact: true })).toHaveCount(0);
        flow.completedTaskReadOnly = true;
      }
      const page = await open(
        "warehouse",
        false,
        "warehouse/inbound",
        receiptID,
      );
      Object.assign(flow, { registrationSurface: "desktop", postSurface: "desktop", reversalSurface: "desktop" });
      await pageAction(page, "生成采购退货");
      const dialog = await modal(page, "从入库单生成采购退货");
      const submit = dialog.getByRole("button", {
        name: "生成退货草稿",
        exact: true,
      });
      const count = report.browserRPC.filter(
        (call) => call.method === "create_purchase_return_from_receipt",
      ).length;
      await submit.click();
      await expect(
        dialog.getByText("请填写数量", { exact: true }),
      ).toBeVisible();
      assert.equal(
        report.browserRPC.filter(
          (call) => call.method === "create_purchase_return_from_receipt",
        ).length,
        count,
      );
      assert.deepEqual(
        snapshot("purchase_returns", `purchase_receipt_id=${receiptID}`),
        [],
      );
      flow.invalidUnchanged = true;
      await dialog.getByLabel("退货数量", { exact: true }).fill("2");
      const profile = await client.rpc("warehouse", "auth", "me");
      assert.ok(
        !profile.permissions.includes("field.procurement_commercial.read"),
      );
      await auditForm(dialog, flow, "purchase-return");
      await screenshot(page, `${flow.key}-draft`);
      const params = await lost(
        page,
        "purchase",
        "create_purchase_return_from_receipt",
        () => submit.click(),
        flow,
      );
      await expect(submit).toBeEnabled();
      const returns = snapshot(
        "purchase_returns",
        `purchase_receipt_id=${receiptID}`,
      );
      assert.equal(returns.length, 1);
      const id = returns[0].id;
      const derived = snapshot("purchase_return_items", `return_id=${id}`);
      assert.equal(derived.length, 1);
      for (const key of ["material_id", "warehouse_id", "lot_id", "unit_id"])
        assert.equal(derived[0][key], source[key]);
      assert.equal(derived[0].purchase_receipt_item_id, source.id);
      assert.equal(Number(derived[0].quantity), 2);
      assert.equal(Number(derived[0].unit_price), 3.5);
      assert.equal(Number(derived[0].amount), 7);
      const state = () => ({
        headers: snapshot(
          "purchase_returns",
          `purchase_receipt_id=${receiptID}`,
        ),
        items: snapshot("purchase_return_items", `return_id=${id}`),
        stock: stock(source.lot_id),
      });
      const draft = state();
      await rejected(
        "sales",
        "purchase",
        "post_purchase_return",
        { id },
        CODE.PERMISSION_DENIED,
      );
      assert.deepEqual(state(), draft);
      flow.forbiddenUnchanged = true;
      await rejected(
        "warehouse",
        "purchase",
        "create_purchase_return_from_receipt",
        {
          ...params,
          items: params.items.map((item) => ({
            ...item,
            unit_price: "0.01",
            amount: "0.02",
          })),
        },
        CODE.INVALID_PARAM,
      );
      assert.deepEqual(state(), draft);
      await rejected(
        "warehouse",
        "purchase",
        "create_purchase_return_from_receipt",
        { ...params, note: "模拟改变退货意图" },
        CODE.IDEMPOTENCY_CONFLICT,
      );
      assert.deepEqual(state(), draft);
      flow.changedIntentRejected = true;
      await rejected(
        "warehouse",
        "purchase",
        "create_purchase_return_from_receipt",
        {
          ...params,
          return_no: `${fixture.prefix}-${mobile ? "MR" : "DR"}-INVALID`,
          idempotency_key: `${fixture.prefix}:${flow.key}:invalid`,
          items: params.items.map((item) => ({ ...item, quantity: "0" })),
        },
        CODE.INVALID_PARAM,
      );
      flow.backendInvalidUnchanged = true;
      const visibleReturn = await clickRPC(
        page,
        "create_purchase_return_from_receipt",
        () => submit.click(),
      );
      assert.equal(
        visibleReturn.purchase_return.items[0].unit_price,
        undefined,
      );
      assert.equal(visibleReturn.purchase_return.items[0].amount, undefined);
      assert.equal(returns[0].supplier_name, fixture.supplier.name);
      flow.commercialFieldsRedacted = true;
      await expect(dialog).toBeHidden();
      assert.deepEqual(state(), draft);
      flow.replayExact = flow.responseRecovered = flow.sourceVerified = true;
      const records = await modal(
        page,
        `退货与调整记录 · ${arrival.key.startsWith("mobile") ? fixture.prefix + "-MA-IN" : fixture.prefix + "-DA-IN"}`,
      );
      const row = records.locator(`.ant-table-row[data-row-key="${id}"]`);
      await row.getByRole("button", { name: "确认", exact: true }).click();
      await lost(
        page,
        "purchase",
        "post_purchase_return",
        () =>
          page
            .locator(".ant-popover:visible")
            .getByRole("button", { name: "确认", exact: true })
            .click(),
        flow,
      );
      await expect(row.getByText("已过账", { exact: true })).toBeVisible();
      assert.deepEqual(stock(source.lot_id), {
        balance: 2,
        net: 2,
        txns: 2,
        lot: "ACTIVE",
      });
      const posted = state();
      await client.rpc("warehouse", "purchase", "post_purchase_return", { id });
      assert.deepEqual(state(), posted);
      await row
        .getByRole("button", { name: "取消并恢复库存", exact: true })
        .click();
      await popup(page, "cancel_purchase_return", "确认取消");
      assert.deepEqual(stock(source.lot_id), {
        balance: 4,
        net: 4,
        txns: 3,
        lot: "ACTIVE",
      });
      const cancelled = state();
      await client.rpc("warehouse", "purchase", "cancel_purchase_return", {
        id,
      });
      assert.deepEqual(state(), cancelled);
      await rejected(
        "warehouse",
        "purchase",
        "post_purchase_return",
        { id },
        CODE.INVALID_PARAM,
      );
      assert.deepEqual(state(), cancelled);
      flow.database = { draft, posted, cancelled };
      flow.reversalRestored =
        flow.cancelReplayExact =
        flow.ledgerVerified =
        flow.passed =
          true;
      await records
        .locator(".ant-table-body,.ant-table-content")
        .evaluateAll((nodes) =>
          nodes.forEach((node) => node.scrollTo({ left: 0 })),
        );
      await screenshot(page, flow.key);
      await records.getByRole("button", { name: "关闭", exact: true }).click();
    }
    const { products } = await client.rpc(
      "admin",
      "masterdata",
      "list_products",
      { limit: 100 },
    );
    const { processes } = await client.rpc(
      "admin",
      "masterdata",
      "list_processes",
      { limit: 100 },
    );
    const product = products.find(
        (row) => row.is_active && row.default_unit_id,
      ),
      process = processes.find(
        (row) => row.is_active && row.outsourcing_enabled,
      );
    assert.ok(product && process);
    const { warehouses } = await client.rpc(
      "admin",
      "masterdata",
      "list_warehouses",
      { limit: 100 },
    );
    const returnWarehouse = warehouses.find(
      (row) => row.is_active && row.type === "FINISHED_GOODS",
    );
    assert.ok(returnWarehouse);
    await assignTransactionWarehouseScopes(client, [
      fixture.warehouse.id,
      returnWarehouse.id,
    ]);
    for (const mobile of [false, true]) {
      const flow = newFlow("outsourcing_return_quality", mobile),
        prefix = `${fixture.prefix}-${mobile ? "MQ" : "DQ"}`;
      const saved = await client.rpc(
        "purchase",
        "outsourcing_order",
        "save_outsourcing_order_with_items",
        {
          outsourcing_order_no: `${prefix}-OUT`,
          supplier_id: fixture.supplier.id,
          currency: "CNY",
          order_date: new Date().toISOString().slice(0, 10),
          expected_return_date: new Date(Date.now() + 86400000)
            .toISOString()
            .slice(0, 10),
          supplier_snapshot: {
            name: fixture.supplier.name,
            contact_name: "模拟加工联系人",
            contact_phone: "0769-00000000",
            address: "模拟加工地址",
          },
          contract_party_snapshot: {
            buyerCompany: "模拟工厂",
            buyerContact: "模拟采购",
            buyerPhone: "0769-00000000",
            buyerAddress: "模拟收货地址",
          },
          items: [
            {
              line_no: 1,
              subject_type: "PRODUCT",
              product_id: product.id,
              process_id: process.id,
              unit_id: product.default_unit_id,
              outsourcing_quantity: "5",
              processing_item: "模拟委外成品加工",
              unit_price: "1",
              amount: "5",
            },
          ],
        },
      );
      let order = saved.outsourcing_order;
      for (const method of [
        "submit_outsourcing_order",
        "confirm_outsourcing_order",
      ])
        order = (
          await client.rpc("purchase", "outsourcing_order", method, {
            id: order.id,
            expected_version: order.version,
            idempotency_key: `${prefix}:${method}`,
          })
        ).outsourcing_order;
      const line = saved.outsourcing_order_items[0];
      const page = await open(
        "warehouse",
        mobile,
        "production/processing-contracts",
        order.id,
      );
      let detail;
      if (mobile) {
        const actions = page.getByTestId("mobile-outsourcing-task-actions");
        await expect(actions).toBeVisible();
        await expect(page.getByRole("button", { name: "查看完整单据", exact: true })).toHaveCount(0);
        await actions.getByRole("button", { name: "登记回货", exact: true }).click();
      } else {
        await pageAction(page, "查看详情");
        detail = await modal(page, "加工合同详情");
        await detail.getByRole("button", { name: "登记回货", exact: true }).click();
      }
      const returnDialog = page.getByRole("dialog", {
        name: "登记回货",
        exact: true,
      });
      await expect(returnDialog).toBeVisible();
      await expect(
        returnDialog.getByLabel("本次办理数量", { exact: true }),
      ).toHaveValue("5");
      const readPopupGeometry = () =>
        page.evaluate(() => {
          const describe = (node) => {
            const box = node.getBoundingClientRect(),
              style = getComputedStyle(node);
            return {
              class: node.className,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              zIndex: style.zIndex,
              position: style.position,
              overflow: style.overflow,
              transform: style.transform,
              display: style.display,
            };
          };
          return {
            focus: document.activeElement?.outerHTML,
            viewport: [innerWidth, innerHeight],
            modals: [
              ...document.querySelectorAll(".ant-modal-wrap,.ant-modal"),
            ].map(describe),
            popups: [...document.querySelectorAll(".ant-select-dropdown")].map(
              describe,
            ),
          };
        });
      await returnDialog
        .getByLabel("仓库", { exact: true })
        .locator(
          "xpath=ancestor::div[contains(@class,'ant-select-selector')][1]",
        )
        .click();
      const warehouseChoice = page
        .locator(".ant-select-dropdown:visible")
        .getByText(warehouseOptionFromRecord(returnWarehouse).label, {
          exact: true,
        });
      await expect(warehouseChoice).toBeVisible();
      flow.popupBefore = await readPopupGeometry();
      await screenshot(page, `${flow.key}-warehouse-popup`);
      try {
        await warehouseChoice.click();
      } catch (error) {
        flow.popupAfter = await readPopupGeometry();
        throw error;
      }
      await returnDialog
        .getByRole("radio", { name: "填写新批次号", exact: true })
        .check();
      await returnDialog
        .getByLabel("新批次号", { exact: true })
        .fill(`${prefix}-LOT`);
      await returnDialog.getByLabel("本次办理数量", { exact: true }).fill("2");
      await auditForm(returnDialog, flow, "outsourcing-return");
      await returnDialog
        .getByLabel("备注", { exact: true })
        .fill(`${prefix} 模拟回货备注`);
      await screenshot(page, `${flow.key}-return-draft`);
      const { outsourcing_fact: fact } = await clickRPC(
        page,
        "create_outsourcing_return_receipt_from_order",
        () =>
          returnDialog
            .getByRole("button", { name: "确认登记回货", exact: true })
            .click(),
      );
      await expect(returnDialog).toBeHidden();
      assert.ok(fact?.lot_id);
      assert.equal(fact.note, `${prefix} 模拟回货备注`);
      const lot = { id: fact.lot_id };
      assert.equal(fact.source_type, "OUTSOURCING_ORDER");
      assert.equal(fact.source_id, order.id);
      assert.equal(fact.source_line_id, line.id);
      assert.equal(stock(lot.id).txns, 0);
      if (detail) await detail.getByRole("button", { name: "关闭", exact: true }).click();
      else await expect(page.getByRole("dialog", { name: "加工合同详情", exact: true })).toHaveCount(0);
      await rejected(
        "quality",
        "quality",
        "create_quality_inspection_from_outsourcing_return",
        { fact_id: fact.id, inspection_no: `${prefix}-EARLY` },
        CODE.BUSINESS_RULE_VIOLATION,
      );
      flow.backendInvalidUnchanged = true;
      await pageAction(page, "委外记录");
      let records = await modal(
        page,
        `委外记录 · ${order.outsourcing_order_no}`,
      );
      await records
        .locator(`.ant-table-row[data-row-key="${fact.id}"]`)
        .getByRole("radio")
        .check();
      await clickRPC(page, "post_outsourcing_fact", () =>
        records.getByRole("button", { name: "过账", exact: true }).click(),
      );
      assert.deepEqual(stock(lot.id), {
        balance: 2,
        net: 2,
        txns: 1,
        lot: "ACTIVE",
      });
      await records.getByRole("button", { name: "关闭", exact: true }).click();
      const quality = await open(
        "quality",
        mobile,
        "production/processing-contracts",
        order.id,
        false,
        { type: "outsourcing_fact", id: fact.id, groups: ["handoff_outsourcing_quality_request"] },
      );
      await pageAction(quality, "委外记录");
      records = await modal(
        quality,
        `委外记录 · ${order.outsourcing_order_no}`,
      );
      await records
        .locator(`.ant-table-row[data-row-key="${fact.id}"]`)
        .getByRole("radio")
        .check();
      await records
        .getByRole("button", { name: "发起质检", exact: true })
        .click();
      const dialog = await modal(quality, "发起委外回货质检"),
        submit = dialog.getByRole("button", {
          name: "生成质检草稿",
          exact: true,
        });
      const number = dialog.getByLabel("质检单号（自动）", { exact: true });
      await number.clear();
      const before = report.browserRPC.filter(
        (call) =>
          call.method === "create_quality_inspection_from_outsourcing_return",
      ).length;
      await submit.click();
      await expect(
        dialog.getByText("请填写质检单号", { exact: true }),
      ).toBeVisible();
      assert.equal(
        report.browserRPC.filter(
          (call) =>
            call.method === "create_quality_inspection_from_outsourcing_return",
        ).length,
        before,
      );
      assert.deepEqual(
        snapshot(
          "quality_inspections",
          `source_type='OUTSOURCING_FACT' AND source_id=${fact.id}`,
        ),
        [],
      );
      flow.invalidUnchanged = true;
      await number.fill(`${prefix}-QI`);
      await auditForm(dialog, flow, "outsourcing-return-quality");
      await dialog
        .getByLabel("送检备注", { exact: true })
        .fill(`${prefix} 模拟回货送检`);
      await screenshot(quality, `${flow.key}-inspection-draft`);
      const params = await lost(
        quality,
        "quality",
        "create_quality_inspection_from_outsourcing_return",
        () => submit.click(),
        flow,
      );
      await expect(dialog).toBeHidden();
      const inspections = snapshot(
        "quality_inspections",
        `source_type='OUTSOURCING_FACT' AND source_id=${fact.id}`,
      );
      assert.equal(inspections.length, 1);
      const inspection = inspections[0];
      assert.equal(inspection.decision_note, `${prefix} 模拟回货送检`);
      flow.sourceID = fact.id;
      for (const [key, value] of Object.entries({
        source_type: "OUTSOURCING_FACT",
        source_id: fact.id,
        subject_type: "PRODUCT",
        subject_id: product.id,
        inventory_lot_id: lot.id,
        warehouse_id: returnWarehouse.id,
        inspection_type: "OUTSOURCING_RETURN",
        status: "DRAFT",
      }))
        assert.equal(inspection[key], value, key);
      const { quality_inspection: sourceInspection } = await client.rpc(
        "quality",
        "quality",
        "get_quality_inspection",
        { id: inspection.id },
      );
      assert.equal(sourceInspection.unit_id, product.default_unit_id);
      const state = () => ({
        inspections: snapshot(
          "quality_inspections",
          `source_type='OUTSOURCING_FACT' AND source_id=${fact.id}`,
        ),
        facts: snapshot("outsourcing_facts", `id=${fact.id}`),
        stock: stock(lot.id),
      });
      const draft = state();
      await rejected(
        "sales",
        "quality",
        "create_quality_inspection_from_outsourcing_return",
        params,
        CODE.PERMISSION_DENIED,
      );
      assert.deepEqual(state(), draft);
      flow.forbiddenUnchanged = true;
      assert.equal(
        (
          await client.rpc(
            "quality",
            "quality",
            "create_quality_inspection_from_outsourcing_return",
            params,
          )
        ).quality_inspection.id,
        inspection.id,
      );
      assert.deepEqual(state(), draft);
      await rejected(
        "quality",
        "quality",
        "create_quality_inspection_from_outsourcing_return",
        { ...params, inspection_no: `${prefix}-OTHER` },
        CODE.RESOURCE_CONFLICT,
      );
      assert.deepEqual(state(), draft);
      flow.changedIntentRejected =
        flow.replayExact =
        flow.responseRecovered =
        flow.sourceVerified =
          true;
      await records
        .locator(`.ant-table-row[data-row-key="${fact.id}"]`)
        .getByRole("radio")
        .check();
      await expect(
        records.getByRole("button", { name: "已发起质检", exact: true }),
      ).toBeDisabled();
      await records
        .getByRole("button", { name: "继续质检", exact: true })
        .click();
      if (mobile) {
        await expect(quality.getByTestId("mobile-task-fact-form")).toHaveAttribute("data-source-type", "quality_inspection");
        await expect(quality.getByTestId("mobile-task-fact-form")).toHaveAttribute("data-source-id", String(inspection.id));
      } else await quality.waitForURL((url) => url.pathname.endsWith("/production/quality-inspections") && url.searchParams.get("quality_inspection_id") === String(inspection.id));
      if (mobile) await expect(quality.getByTestId("mobile-task-business-source")).toHaveAttribute("data-record-id", String(inspection.id));
      await pageAction(quality, "提交质检");
      await popup(quality, "submit_quality_inspection");
      await decide(inspection.id, mobile, true, "OUTSOURCING_RETURN");
      await screenshot(quality, `${flow.key}-rejected`);
      const rejectedState = state();
      assert.equal(rejectedState.stock.lot, "REJECTED");
      assert.equal(rejectedState.stock.txns, 1);
      await rejected(
        "warehouse",
        "operational_fact",
        "cancel_outsourcing_fact",
        {
          id: fact.id,
          expected_version: draft.facts[0].version,
          reason: "模拟拒收后不能直接撤销",
        },
        CODE.BUSINESS_RULE_VIOLATION,
      );
      assert.deepEqual(state(), rejectedState);
      flow.dependentCancelBlocked = true;
      const correctionResult = await correctQualityThroughBrowser(quality, { ...options, mobile }, report, {
        request: {
          id: inspection.id,
          correction_inspection_no: `${prefix}-RECHECK`,
          reason: "模拟量具复核，保留原判定",
        },
        readState: state,
        key: flow.key,
      });
      const correction = correctionResult.inspection;
      flow.transportFaults.push(correctionResult.transportFault);
      flow.correctionCreatedInBrowser = flow.correctionReasonRequired = true;
      assert.equal(correction.correction_of_inspection_id, inspection.id);
      assert.equal(stock(lot.id).lot, "HOLD");
      await decide(correction.id, mobile, false, "OUTSOURCING_RETURN");
      const completed = state();
      await client.rpc("quality", "quality", "correct_quality_inspection_result", { id: inspection.id, correction_inspection_no: `${prefix}-RECHECK`, reason: "模拟量具复核，保留原判定" });
      assert.deepEqual(state(), completed, "a completed correction still replays its immutable original intent");
      flow.correctionReplayAfterDecisionExact = true;
      assert.equal(completed.inspections.length, 2);
      assert.equal(completed.inspections[0].status, "REJECTED");
      assert.ok(completed.inspections[0].superseded_at);
      assert.equal(Number(completed.inspections[0].defect_rate_percent), 10);
      assert.equal(
        completed.inspections[0].decision_note,
        rejectedState.inspections[0].decision_note,
      );
      assert.deepEqual(
        completed.inspections[0].check_items,
        rejectedState.inspections[0].check_items,
      );
      assert.equal(completed.inspections[1].status, "PASSED");
      assert.deepEqual(completed.facts, draft.facts);
      assert.deepEqual(completed.stock, {
        balance: 2,
        net: 2,
        txns: 1,
        lot: "ACTIVE",
      });
      flow.database = { draft, rejected: rejectedState, completed };
      flow.correctionPreservesEvidence =
        flow.ledgerVerified =
        flow.passed =
          true;
      await screenshot(activePage, flow.key);
    }
    await runPartialReceiving({ client, fixture, options, report, open, pageFor, snapshot, stock, rejected, lost, decide, popup, screenshot, expect, auditForm });
    for (const { page, context } of sessions.values())
      await closePage(page, context);
    sessions.clear();
    report.unexpectedRPC = report.browserRPC.filter(
      (call) => call.http !== 200 || call.code !== 0,
    );
    report.fixtureRPC = client.calls;
    assertReceivingEvidence(report);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack;
    if (activePage) await captureFailure(activePage, options, report, error);
    throw error;
  } finally {
    await browser?.close();
    report.fixtureRPC = client.calls;
    await fs.writeFile(
      path.join(options.outputDir, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  return report;
}
if (
  process.argv[1] &&
  pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url
) {
  assert.equal(process.argv[2], "--environment");
  assert.equal(process.argv.length, 4);
  await run(JSON.parse(await fs.readFile(process.argv[3], "utf8")));
}
