import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  createTransactionClient,
  prepareTransactionFixture,
} from "./transaction-real-backend-fixture.mjs";
import {
  login,
  navigate,
  closePage,
  settleRPCPage,
  selectRow,
  selectOption,
  pageAction,
  modal,
  clickRPC,
  openDesktopTaskRow,
  dropRealResponse,
  faultEvidence,
  captureFailure,
} from "./transaction-browser-ui.mjs";
import { warehouseOptionFromRecord } from "../../web/src/erp/utils/referenceSelectOptions.mjs";
import { BUSINESS_ROUTE_PATHS } from "../../web/src/erp/utils/masterDataOrderView.mjs";
import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  financeBusinessSourceActionConfig,
} from "../../web/src/erp/utils/financeBusinessSourceAction.mjs";
import { RpcErrorCode as CODE } from "../../web/src/common/consts/errorCodes.generated.js";
import { DEV_FLOW_STATE_CATALOG } from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";
import { buildManualAcceptanceBusinessChainContract } from "./manual-acceptance-business-chain-contract.mjs";
import { PurchaseSourceActions } from "../../web/src/common/consts/purchaseSourceActions.mjs";
import { PermissionCode } from "../../web/src/common/consts/permissions.generated.mjs";
import { assertPurchaseSourcePricesOmitted, verifyPurchaseSourceRevocation } from "./purchase-source-permissions-browser.mjs";
import { assertPurchaseRelatedSourceEvidence, runPurchaseRelatedSourcePermissions } from "./purchase-related-source-permissions-browser.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("playwright/test");
export const PURCHASE_CHAIN_MAIN_STEPS = Object.freeze([
  "purchase_order:starts_process:purchase_approval",
  "purchase_approval:creates_task:purchase_task",
  "purchase_task:calls_domain_command:purchase_approval",
  "purchase_approval:creates_fact_draft:purchase_receipt",
  "purchase_receipt:creates_fact_draft:purchase_quality",
  "purchase_quality:posts_fact:purchase_accepted",
  "purchase_accepted:posts_fact:purchase_lot",
  "purchase_lot:creates_fact_draft:purchase_payable_draft",
  "purchase_payable_draft:posts_fact:purchase_payable",
]);

export function assertPurchaseChainBrowserEvidence(report) {
  assert.equal(report.status, "passed");
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.assetErrors ?? [], []);
  assert.deepEqual(report.unexpectedRPC, []);
  assert.deepEqual(
    report.steps.map((s) => s.key),
    PURCHASE_CHAIN_MAIN_STEPS,
  );
  const actions = [
    ["purchase", "execute_material_supply_purchase_order_submit"],
    ["purchase", "execute_material_supply_purchase_order_submit"],
    ["boss", "complete_task_action"],
    ["warehouse", "create_purchase_receipt_from_purchase_order"],
    ["warehouse", "create_purchase_receipt_from_purchase_order"],
    ["quality", "pass_quality_inspection"],
    ["warehouse", "post_purchase_receipt"],
    ["finance", "create_payable_from_purchase_receipt"],
    ["finance", "post_finance_fact"],
  ];
  for (const [index, step] of report.steps.entries()) {
    assert.equal(step.passed, true);
    assert.ok(step.requestIDs.length > 0);
    assert.equal(step.role, actions[index][0]);
    assert.ok(
      step.requestIDs.every((id) =>
        report.browserRPC.some(
          (call) =>
            call.requestID === id &&
            call.role === step.role &&
            call.method === actions[index][1] &&
            call.code === 0,
        ),
      ),
    );
    assert.ok(step.readback && typeof step.readback === "object");
  }
  for (const role of ["purchase", "boss", "warehouse", "quality", "finance"])
    assert.ok(
      report.browserRPC.some((c) => c.role === role && c.code === 0),
      `missing role ${role}`,
    );
  assert.ok(report.orderID > 0 && report.receiptID > 0 && report.payableID > 0);
  assert.equal(report.readback.receiptOrderID, report.orderID);
  assert.equal(report.readback.payableReceiptID, report.receiptID);
  assert.equal(report.readback.payableAmount, 35);
  assert.equal(report.readback.payableStatus, "POSTED");
  assert.equal(report.readback.inventoryQuantity, 10);
  assert.equal(report.readback.inventoryTransactions, 1);
  assert.equal(report.readback.payableCount, 1);
  assert.equal(report.sourcePermissions?.length, 2);
  assertPurchaseRelatedSourceEvidence(report.relatedSourcePermissions, report.browserRPC);
  for (const [role, permission] of [["quality", PermissionCode.PURCHASE_RECEIPT_READ], ["finance", PermissionCode.PURCHASE_RETURN_READ]]) {
    const proof = report.sourcePermissions.find((entry) => entry.role === role);
    assert.equal(proof?.permission, permission);
    assert.equal(proof?.screenshot, `source-permission-${role}.png`);
    for (const key of ["modalClosed", "actionHidden", "reasonVisible", "deniedWithoutWrite", "restored", "staleValuesCleared"])
      assert.equal(proof[key], true, `${role}: ${key}`);
  }
  for (const key of [
    "approvalNoFacts",
    "qualityNoInventory",
    "draftNotPosted",
    "inboundReplayExact",
    "payableReplayExact",
    "postReplayExact",
    "permissionDeniedUnchanged",
    "qualityGate",
    "pricingSnapshotVerified",
    "responseRecovered",
    "sourcePricesProtected",
    "sourcePermissionsRevokedAndRestored",
  ])
    assert.equal(report.checks[key], true, key);
  assert.ok(report.flows[0].transportFault.injected);
  assert.equal(report.flows[0].transportFault.backendCode, 0);
}

export async function runPurchaseChainBrowser(environment) {
  const options = {
    ...environment,
    fourK: true,
    outputDir: path.join(environment.outputDir, "purchase-chain"),
  };
  const client = createTransactionClient(options);
  const report = {
    status: "running",
    steps: [],
    flows: [{ key: "desktop_purchase_chain", passed: false }],
    checks: {},
    pageErrors: [],
    browserRPC: [],
    expectedFailures: [],
    databaseName: options.databaseName,
    definitionSnapshot: buildManualAcceptanceBusinessChainContract({
      catalog: DEV_FLOW_STATE_CATALOG,
    }).definitionSnapshot,
    fixtureBoundary:
      "模拟主数据与采购草稿由正式 API 准备；采购保存、提交、审批、收货、质检、入库、应付创建和过账由各岗位真实浏览器执行。",
    scope: "desktop_purchase_chain",
  };
  const sessions = new Map();
  let browser, activePage;
  await fs.mkdir(options.outputDir, { recursive: true });
  try {
    report.identity = await client.verify();
    const fixture = await prepareTransactionFixture(client, {
      ...options,
      purchaseDraftOnly: true,
    });
    report.frontendIdentity = await client.verifyFrontend();
    const { order, warehouse } = fixture;
    report.orderID = order.id;
    const pageFor = async (role) => {
      if (!sessions.has(role))
        sessions.set(role, await login(browser, options, role, report));
      activePage = sessions.get(role).page;
      return activePage;
    };
    const facts = () =>
      client.query(
        `SELECT json_build_object('inventory',(SELECT count(*) FROM inventory_txns),'finance',(SELECT count(*) FROM finance_facts),'receipts',(SELECT count(*) FROM purchase_receipts),'quality',(SELECT count(*) FROM quality_inspections))`,
      );
    const orderRow = () =>
      client.query(
        `SELECT row_to_json(p) FROM purchase_orders p WHERE id=${order.id}`,
      );
    const snapshot = () =>
      client.query(
        `SELECT json_build_object('receipts',(SELECT json_agg(p ORDER BY id) FROM purchase_receipts p),'items',(SELECT json_agg(p ORDER BY id) FROM purchase_receipt_items p),'inventory',(SELECT json_agg(p ORDER BY id) FROM inventory_txns p),'balances',(SELECT json_agg(p ORDER BY id) FROM inventory_balances p),'finance',(SELECT json_agg(p ORDER BY id) FROM finance_facts p),'returns',(SELECT json_agg(p ORDER BY id) FROM purchase_returns p),'adjustments',(SELECT json_agg(p ORDER BY id) FROM purchase_receipt_adjustments p),'dispositions',(SELECT json_agg(p ORDER BY id) FROM purchase_rejection_dispositions p))`,
      );
    const failed = async (role, domain, method, params, code) => {
      const before = snapshot();
      const result = await client.raw(role, domain, method, params);
      assert.equal(result.code, code, `${method}: ${result.message}`);
      assert.deepEqual(snapshot(), before);
      report.expectedFailures.push({ role, domain, method, code });
    };
    const open = async (role, route, id, checkbox = false, refresh = false) => {
      const page = await pageFor(role);
      const target = `${options.baseURL}${route}`;
      if (page.url() !== target || refresh) await navigate(page, target);
      else await settleRPCPage(page);
      if (checkbox) {
        const search = page
          .locator(".erp-business-operation-panel input[placeholder]")
          .first();
        await search.fill(order.purchase_order_no);
        await search.press("Enter");
        await page
          .locator(`.ant-table-row[data-row-key="${id}"]:visible`)
          .getByRole("checkbox")
          .check();
      } else await selectRow(page, id);
      return page;
    };
    const capture = async (index, role, methods, readback) => {
      await settleRPCPage(activePage);
      const calls = report.browserRPC.filter(
        (c) => c.role === role && methods.includes(c.method) && c.code === 0,
      );
      assert.ok(
        calls.length > 0,
        `missing browser execution ${methods.join(",")}`,
      );
      const screenshot = `step-${index + 1}.png`;
      await activePage.screenshot({
        path: path.join(options.outputDir, screenshot),
        fullPage: false,
      });
      report.steps.push({
        key: PURCHASE_CHAIN_MAIN_STEPS[index],
        passed: true,
        role,
        requestIDs: calls.map((c) => c.requestID),
        readback,
        screenshot,
      });
    };
    const popup = (page, method) =>
      clickRPC(page, method, () =>
        page
          .locator(".ant-popover:visible")
          .getByRole("button", { name: "确认", exact: true })
          .click(),
      );
    browser = await chromium.launch({ headless: true });
    let page = await open(
      "purchase",
      BUSINESS_ROUTE_PATHS.purchaseOrders,
      order.id,
      true,
    );
    await pageAction(page, "编辑");
    const editor = page.getByRole("region", {
      name: "编辑采购订单",
      exact: true,
    });
    await editor
      .getByRole("textbox", { name: "备注", exact: true })
      .fill("模拟采购链岗位实测");
    await clickRPC(page, "save_purchase_order_with_items", () =>
      editor.getByRole("button", { name: "保存草稿", exact: true }).click(),
    );
    if (await editor.isVisible())
      await editor
        .getByRole("button", { name: "返回列表", exact: true })
        .click();
    page = await open(
      "purchase",
      BUSINESS_ROUTE_PATHS.purchaseOrders,
      order.id,
      true,
    );
    const beforeApproval = facts();
    await clickRPC(page, "execute_material_supply_purchase_order_submit", () =>
      pageAction(page, "提交订单"),
    );
    assert.equal(orderRow().lifecycle_status, "submitted");
    await capture(
      0,
      "purchase",
      ["execute_material_supply_purchase_order_submit"],
      orderRow(),
    );
    const { tasks } = await client.rpc("admin", "workflow", "list_tasks", {
      source_type: "purchase_order",
      source_id: order.id,
      limit: 100,
    });
    const task = tasks.find(
      (t) => t.task_status_key === "ready" && t.process_instance_id > 0,
    );
    assert.equal(task?.owner_role_key, "boss");
    await capture(
      1,
      "purchase",
      ["execute_material_supply_purchase_order_submit"],
      {
        taskID: task.id,
        owner: task.owner_role_key,
        status: task.task_status_key,
        processID: task.process_instance_id,
      },
    );
    await failed(
      "warehouse",
      "workflow",
      "complete_task_action",
      {
        task_id: task.id,
        expected_version: task.version,
        action_key: "complete",
        reason: "越权验证",
        idempotency_key: `${fixture.prefix}:denied`,
      },
      CODE.PERMISSION_DENIED,
    );
    page = await pageFor("boss");
    await navigate(page, `${options.baseURL}/erp/task-board`);
    await page
      .getByPlaceholder("订单 / 产品 / 物料 / 款号", { exact: true })
      .fill(order.purchase_order_no);
    await page
      .getByPlaceholder("订单 / 产品 / 物料 / 款号", { exact: true })
      .press("Enter");
    await openDesktopTaskRow(page, task, order.purchase_order_no);
    const panel = page.locator(".erp-task-action-drawer:visible");
    await panel
      .getByRole("button", { name: "选择处理方式", exact: true })
      .click();
    await panel.getByRole("radio").filter({ hasText: "审批通过" }).click();
    await panel.locator("textarea").fill("模拟核对采购价格和数量后通过");
    await panel
      .getByRole("button", { name: "核对并确认", exact: true })
      .click();
    await clickRPC(page, "complete_task_action", () =>
      panel
        .locator("button:visible")
        .filter({ hasText: /^确认通过$/u })
        .click(),
    );
    await expect(
      panel.getByText("办理结果已确认", { exact: true }),
    ).toBeVisible();
    assert.equal(orderRow().lifecycle_status, "approved");
    assert.deepEqual(facts(), beforeApproval);
    report.checks.approvalNoFacts = true;
    await capture(2, "boss", ["complete_task_action"], {
      order: orderRow(),
      facts: facts(),
    });

    page = await open(
      "warehouse",
      BUSINESS_ROUTE_PATHS.purchaseOrders,
      order.id,
      true,
    );
    await pageAction(page, "登记到货");
    const arrival = await modal(page, "登记采购到货");
    await arrival
      .getByLabel("入库单号", { exact: true })
      .fill(`${fixture.prefix}-CHAIN-IN`);
    await selectOption(
      page,
      arrival.getByRole("combobox", { name: "第1条入库仓库", exact: true }),
      warehouseOptionFromRecord(warehouse).label,
    );
    await arrival
      .getByRole("spinbutton", { name: "第1条实点数量", exact: true })
      .fill("10");
    await arrival
      .getByRole("spinbutton", { name: "第1条标示数量", exact: true })
      .fill("10");
    await arrival
      .getByRole("textbox", { name: "第1条批次号", exact: true })
      .fill(`${fixture.prefix}-CHAIN-LOT`);
    const created = await clickRPC(
      page,
      "create_purchase_receipt_from_purchase_order",
      () =>
        arrival
          .getByRole("button", { name: "保存到货并送检", exact: true })
          .click(),
    );
    await expect(arrival).toBeHidden();
    const receipt = created.purchase_receipt;
    assertPurchaseSourcePricesOmitted(receipt);
    assert.ok(receipt.items.length > 0 && receipt.items[0].quantity);
    report.receiptID = receipt.id;
    const item = client.query(
      `SELECT row_to_json(p) FROM purchase_receipt_items p WHERE receipt_id=${receipt.id}`,
    );
    assert.equal(Number(item.quantity), 10);
    const sourceItem = client.query(
      `SELECT row_to_json(p) FROM purchase_order_items p WHERE id=${item.purchase_order_item_id}`,
    );
    assert.equal(sourceItem.purchase_order_id, order.id);
    const stock = () =>
      client.query(
        `SELECT json_build_object('quantity',COALESCE((SELECT sum(quantity) FROM inventory_balances WHERE lot_id=${item.lot_id}),0),'transactions',(SELECT count(*) FROM inventory_txns WHERE lot_id=${item.lot_id}))`,
      );
    assert.deepEqual(stock(), { quantity: 0, transactions: 0 });
    await capture(
      3,
      "warehouse",
      ["create_purchase_receipt_from_purchase_order"],
      { receiptID: receipt.id, item, sourceItem },
    );
    const inspection = client.query(
      `SELECT row_to_json(p) FROM quality_inspections p WHERE purchase_receipt_id=${receipt.id}`,
    );
    assert.equal(inspection.status, "SUBMITTED");
    await capture(
      4,
      "warehouse",
      ["create_purchase_receipt_from_purchase_order"],
      {
        inspectionID: inspection.id,
        status: inspection.status,
        stock: stock(),
      },
    );
    await failed(
      "warehouse",
      "purchase",
      "post_purchase_receipt",
      { id: receipt.id },
      CODE.BUSINESS_RULE_VIOLATION,
    );
    report.checks.qualityGate = true;
    page = await open(
      "quality",
      "/erp/production/quality-inspections",
      inspection.id,
    );
    const qualityReceipt = await client.rpc("quality", "purchase", "get_purchase_receipt", { id: receipt.id });
    assertPurchaseSourcePricesOmitted(qualityReceipt);
    assert.ok(qualityReceipt.purchase_receipt.items.length > 0);
    report.sourcePermissions = [await verifyPurchaseSourceRevocation({
      client, page, role: "quality", action: PurchaseSourceActions.quality,
      permission: PermissionCode.PURCHASE_RECEIPT_READ,
      button: "补建来料质检", title: "生成来料质检草稿", formPage: true, failed, outputDir: options.outputDir,
      params: { inspection_no: `${fixture.prefix}-DENIED-QI`, purchase_receipt_id: receipt.id, purchase_receipt_item_id: item.id },
    })];
    page = await open("quality", BUSINESS_ROUTE_PATHS.qualityInspections, inspection.id);
    await pageAction(page, "判定合格");
    const quality = await modal(page, "判定合格");
    const checks = quality.getByLabel("检查结果", { exact: true });
    assert.equal(await checks.count(), 3);
    for (let i = 0; i < 3; i++) {
      await selectOption(page, checks.nth(i), "符合");
      await selectOption(
        page,
        quality.getByLabel("检查范围", { exact: true }).nth(i),
        "全检",
      );
      await quality
        .getByLabel("实际情况", { exact: true })
        .nth(i)
        .fill("模拟逐项检验符合采购约定");
    }
    await quality
      .getByRole("radio", { name: "0%（未发现不良）", exact: true })
      .check();
    await quality
      .getByLabel("判定备注", { exact: true })
      .fill("模拟采购链来料合格");
    await clickRPC(page, "pass_quality_inspection", () =>
      quality.getByRole("button", { name: "确认合格", exact: true }).click(),
    );
    await expect(quality).toBeHidden();
    assert.deepEqual(stock(), { quantity: 0, transactions: 0 });
    report.checks.qualityNoInventory = true;
    await capture(5, "quality", ["pass_quality_inspection"], {
      inspectionID: inspection.id,
      status: client.query(
        `SELECT to_json(status) FROM quality_inspections WHERE id=${inspection.id}`,
      ),
      stock: stock(),
    });
    page = await open("warehouse", "/erp/warehouse/inbound", receipt.id);
    await pageAction(page, "确认材料入库");
    await popup(page, "post_purchase_receipt");
    assert.deepEqual(stock(), { quantity: 10, transactions: 1 });
    const posted = snapshot();
    await client.rpc("warehouse", "purchase", "post_purchase_receipt", {
      id: receipt.id,
    });
    assert.deepEqual(snapshot(), posted);
    report.checks.inboundReplayExact = true;
    await capture(6, "warehouse", ["post_purchase_receipt"], {
      receiptID: receipt.id,
      stock: stock(),
    });

    page = await open("finance", "/erp/warehouse/inbound", receipt.id);
    report.sourcePermissions.push(await verifyPurchaseSourceRevocation({
      client, page, role: "finance", action: PurchaseSourceActions.payable,
      permission: PermissionCode.PURCHASE_RETURN_READ,
      button: "生成应付", title: "从采购入库生成应付", failed, outputDir: options.outputDir,
      selectionID: receipt.id,
      params: { fact_no: `${fixture.prefix}-DENIED-AP`, purchase_receipt_id: receipt.id, idempotency_key: `${fixture.prefix}-denied-ap` },
    }));
    report.checks.sourcePricesProtected = true;
    report.checks.sourcePermissionsRevokedAndRestored = true;
    page = await open("finance", BUSINESS_ROUTE_PATHS.purchaseReceipts, receipt.id);
    await pageAction(page, "生成应付");
    const payableForm = await modal(page, "从采购入库生成应付");
    await expect(
      payableForm.getByLabel("发生时间", { exact: true }),
    ).toHaveCount(0);
    await payableForm
      .getByLabel("业务编号", { exact: true })
      .fill(`${fixture.prefix}-CHAIN-AP`);
    const save = payableForm.getByRole("button", {
      name: "生成应付草稿",
      exact: true,
    });
    const fault = await dropRealResponse(
      page,
      options,
      "operational_fact",
      "create_payable_from_purchase_receipt",
    );
    await save.click();
    await expect.poll(() => Boolean(fault.state.captured)).toBe(true);
    await fault.remove();
    report.flows[0].transportFault = faultEvidence(fault.state);
    assert.equal(
      fault.state.backendCode,
      0,
      "source payable must succeed before response loss is counted as recovery evidence",
    );
    const payableSourceType = financeBusinessSourceActionConfig(
      FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE,
    ).sourceType;
    const payableRows = () =>
      client.query(
        `SELECT COALESCE(json_agg(p ORDER BY id),'[]') FROM finance_facts p WHERE source_type='${payableSourceType}' AND source_id=${receipt.id}`,
      );
    const drafts = payableRows();
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].status, "DRAFT");
    assert.equal(Number(drafts[0].amount), 35);
    assert.equal(drafts[0].currency, "CNY");
    assert.equal(
      new Date(drafts[0].occurred_at).getTime(),
      receipt.received_at * 1000,
    );
    assert.equal(drafts[0].payment_term_days, orderRow().payment_term_days);
    report.payableID = drafts[0].id;
    report.checks.draftNotPosted = true;
    await expect(save).toBeEnabled();
    await clickRPC(page, "create_payable_from_purchase_receipt", () =>
      save.click(),
    );
    await expect(payableForm).toBeHidden();
    assert.deepEqual(payableRows(), drafts);
    await client.rpc(
      "finance",
      "operational_fact",
      "create_payable_from_purchase_receipt",
      fault.state.params,
    );
    assert.deepEqual(payableRows(), drafts);
    await failed(
      "finance",
      "operational_fact",
      "create_payable_from_purchase_receipt",
      { ...fault.state.params, note: "同键修改应拒绝" },
      CODE.IDEMPOTENCY_CONFLICT,
    );
    await failed(
      "warehouse",
      "operational_fact",
      "post_finance_fact",
      { id: report.payableID, expected_version: drafts[0].version },
      CODE.PERMISSION_DENIED,
    );
    report.checks.payableReplayExact =
      report.checks.responseRecovered =
      report.checks.permissionDeniedUnchanged =
        true;
    // Source pricing and settlement values must actually be present in the frozen draft.
    assert.equal(Number(sourceItem.unit_price), 3.5);
    assert.ok(orderRow().payment_method);
    assert.ok(Number.isInteger(orderRow().payment_term_days));
    report.checks.pricingSnapshotVerified = true;
    await capture(7, "finance", ["create_payable_from_purchase_receipt"], {
      payable: drafts[0],
      sourceItem,
      orderPaymentMethod: orderRow().payment_method,
      orderPaymentTermDays: orderRow().payment_term_days,
    });
    page = await open(
      "finance",
      BUSINESS_ROUTE_PATHS.payables,
      report.payableID,
    );
    await page
      .locator(
        'button[data-business-action-key="finance-fact-confirm"]:visible',
      )
      .click();
    await popup(page, "post_finance_fact");
    const finished = payableRows();
    assert.equal(finished[0].status, "POSTED");
    const afterPost = snapshot();
    await client.rpc("finance", "operational_fact", "post_finance_fact", {
      id: report.payableID,
      expected_version: drafts[0].version,
    });
    assert.deepEqual(snapshot(), afterPost);
    report.checks.postReplayExact = true;
    await capture(8, "finance", ["post_finance_fact"], {
      payable: finished[0],
      stock: stock(),
    });
    report.readback = {
      receiptOrderID: sourceItem.purchase_order_id,
      payableReceiptID: finished[0].source_id,
      payableAmount: Number(finished[0].amount),
      payableStatus: finished[0].status,
      inventoryQuantity: stock().quantity,
      inventoryTransactions: stock().transactions,
      payableCount: finished.length,
    };
    report.flows[0].passed = true;
    await runPurchaseRelatedSourcePermissions({ client, options, report, fixture, receipt, inspection, open, failed, snapshot });
    for (const { page: owned, context } of sessions.values())
      await closePage(owned, context);
    sessions.clear();
    report.fixtureRPC = client.calls;
    const expectedDenied = new Set(report.relatedSourcePermissions.flatMap((proof) => proof.deniedRequestIDs));
    report.unexpectedRPC = report.browserRPC.filter((c) => c.code !== 0 && !(c.code === CODE.PERMISSION_DENIED && expectedDenied.has(c.requestID)));
    report.status = "passed";
    assertPurchaseChainBrowserEvidence(report);
  } catch (error) {
    report.status = "failed";
    report.error = error.stack;
    if (activePage) await captureFailure(activePage, options, report, error);
  } finally {
    for (const { page, context } of sessions.values()) {
      try {
        await closePage(page, context);
      } catch (error) {
        report.status = "failed";
        report.cleanupError = error.message;
      }
    }
    if (browser) await browser.close();
    report.fixtureRPC = client.calls;
    report.finishedAt = new Date().toISOString();
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
  assert.deepEqual(process.argv.slice(2, 3), ["--environment"]);
  const report = await runPurchaseChainBrowser(
    JSON.parse(await fs.readFile(process.argv[3], "utf8")),
  );
  console.log(
    `[purchase-chain] ${report.status}; steps=${report.steps.length}`,
  );
  if (report.status !== "passed") process.exitCode = 1;
}
