import assert from "node:assert/strict";
import path from "node:path";
import { captureFlowFieldPage } from "./transaction-flow-fields-browser.mjs";
import { createRequire } from "node:module";
import { prepareTransactionProductionSource, prepareTransactionSourceTask, prepareTransactionProductOutsourcingContract } from "./transaction-real-backend-fixture.mjs";
import {
  businessURL,
  flowKey,
  openMobileTaskCard,
  openMobileSourceTask,
  openDesktopTaskRow,
  assertMobileLayout,
  selectOption,
  selectRow,
  pageAction,
  modal,
  navigate,
  settleRPCPage,
  closePage,
  clickRPC,
  login,
  captureFailure,
  dropRealResponse,
  faultEvidence,
} from "./transaction-browser-ui.mjs";
import { BUSINESS_ROUTE_PATHS } from "../../web/src/erp/utils/masterDataOrderView.mjs";
import {
  PRODUCTION_WIP_ROUTE_CODE,
  PRODUCTION_WIP_ACTION as WIP,
} from "../../web/src/erp/utils/productionWipModel.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { expect } = require("playwright/test");

const ACTION_LABEL = {
  [WIP.ASSIGN_EXECUTION]: "安排加工",
  [WIP.START_OPERATION]: "开始工序",
  [WIP.COMPLETE_OPERATION]: "登记本厂完工",
  [WIP.RECEIVE_OUTSOURCING_RETURN]: "登记外发回仓",
  [WIP.TRANSFER_TO_NEXT_OPERATION]: "移交下道工序",
  [WIP.CONFIRM_PACKAGING_MATERIAL]: "确认包材要求",
};

export const PRODUCTION_BROWSER_ACTIONS = Object.freeze([
  ["production", "FABRIC_PROCESSING", WIP.ASSIGN_EXECUTION],
  ["warehouse", "FABRIC_PROCESSING", WIP.START_OPERATION],
  ["warehouse", "FABRIC_PROCESSING", WIP.RECEIVE_OUTSOURCING_RETURN],
  ["production", "FABRIC_PROCESSING", WIP.TRANSFER_TO_NEXT_OPERATION],
  ["production", "SEWING", WIP.ASSIGN_EXECUTION],
  ["production", "SEWING", WIP.START_OPERATION],
  ["production", "SEWING", WIP.COMPLETE_OPERATION],
  ["production", "SEWING", WIP.TRANSFER_TO_NEXT_OPERATION],
  ["production", "HANDWORK", WIP.ASSIGN_EXECUTION],
  ["production", "HANDWORK", WIP.START_OPERATION],
  ["production", "HANDWORK", WIP.COMPLETE_OPERATION],
  ["warehouse", "HANDWORK", WIP.TRANSFER_TO_NEXT_OPERATION],
  ["sales", "PACKAGING", WIP.CONFIRM_PACKAGING_MATERIAL],
  ["production", "PACKAGING", WIP.ASSIGN_EXECUTION],
  ["warehouse", "PACKAGING", WIP.START_OPERATION],
  ["warehouse", "PACKAGING", WIP.COMPLETE_OPERATION],
]);

export function assertProductionShipmentEvidence(report) {
  for (const prefix of ["", "mobile_"]) {
    const production = report.flows.find(
      ({ key }) => key === `${prefix}production`,
    );
    const shipment = report.flows.find(
      ({ key }) => key === `${prefix}shipment`,
    );
    assert.ok(
      production && shipment,
      "both production and shipment must execute on each surface",
    );
    assert.ok(
      Number.isSafeInteger(production.productionOrderID) &&
        production.productionOrderID > 0,
    );
    assert.ok(
      Number.isSafeInteger(production.receiptID) && production.receiptID > 0,
    );
    assert.equal(production.actions.length, 21);
    if (prefix) assert.equal(production.taskSourceMismatchBlocked, true);
    assert.ok(production.actions.every(({ confirmed }) => confirmed === true));
    const processing = production.actions.filter(
      ({ action }) => action !== "PASS_QUALITY",
    );
    assert.deepEqual(
      processing.map(({ role, operation, action }) => [
        role,
        operation,
        action,
      ]),
      PRODUCTION_BROWSER_ACTIONS,
    );
    const quality = production.actions.filter(
      ({ action }) => action === "PASS_QUALITY",
    );
    assert.deepEqual(
      quality.map(({ gate }) => gate),
      ["CUT_PIECE", "SHELL", "FINISHED_GOODS", "NEEDLE", "SAMPLING"],
    );
    assert.ok(
      quality.every(
        ({ role, inspectionID }) =>
          role === "quality" &&
          Number.isSafeInteger(inspectionID) &&
          inspectionID > 0,
      ),
    );
    assert.equal(
      new Set(quality.map(({ inspectionID }) => inspectionID)).size,
      5,
    );
    assert.ok(production.stock.quantity > 0);
    assert.deepEqual(production.stock, {
      quantity: production.stock.quantity,
      net: production.stock.quantity,
      txns: 1,
    });
    assert.deepEqual(
      production.fulfillment.map(({ stage }) => stage),
      [
        "handwork_completed",
        "finished_goods_inbound",
        "finished_quality_passed",
        "packaging_completed",
      ],
    );
    assert.deepEqual(
      production.fulfillment.map(({ stock }) => stock),
      [
        { quantity: 0, net: 0, txns: 0 },
        ...Array.from({ length: 3 }, () => ({
          quantity: production.stock.quantity,
          net: production.stock.quantity,
          txns: 1,
        })),
      ],
    );
    assert.deepEqual(
      production.fulfillment.slice(1).map(({ readiness }) => readiness),
      [
        {
          pendingInspection: production.stock.quantity,
          pendingPackaging: 0,
          ready: 0,
        },
        {
          pendingInspection: 0,
          pendingPackaging: production.stock.quantity,
          ready: 0,
        },
        {
          pendingInspection: 0,
          pendingPackaging: 0,
          ready: production.stock.quantity,
        },
      ],
    );
    for (const stage of production.fulfillment.slice(1)) {
      assert.deepEqual(stage.visibleReadiness, stage.readiness, 'the actual inventory surface must show the same fulfillment quantities');
      assert.ok(Number.isSafeInteger(stage.inventoryRecordID) && stage.inventoryRecordID > 0);
    }
    assert.equal(production.qualityBlockedTransfer, true);
    assert.equal(shipment.productionOrderID, production.productionOrderID);
    assert.ok(
      Number.isSafeInteger(shipment.shipmentID) && shipment.shipmentID > 0,
    );
    assert.ok(
      Number.isSafeInteger(shipment.approvalTaskID) &&
        shipment.approvalTaskID > 0,
    );
    assert.equal(shipment.approvalSurface, prefix ? "mobile" : "desktop");
    assert.deepEqual(shipment.restored, {
      quantity: production.stock.quantity,
      net: production.stock.quantity,
      txns: 3,
    });
  }
}

async function confirmPopup(page, method) {
  const popup = page.locator(".ant-popover:visible");
  await expect(popup).toHaveCount(1);
  return clickRPC(page, method, () =>
    popup.getByRole("button", { name: "确认", exact: true }).click(),
  );
}

async function searchReference(page, control, keyword, referenceType) {
  await settleRPCPage(page);
  await control.locator("xpath=ancestor::div[contains(@class,'ant-select-selector')][1]").click();
  await settleRPCPage(page);
  const searched = page.waitForResponse((response) => {
    if (!response.url().includes("/rpc/")) return false;
    const request = response.request().postDataJSON();
    return request.method === "list_production_order_reference_options" &&
      request.params.reference_type === referenceType &&
      request.params.keyword === keyword && request.params.offset === 0;
  });
  await control.fill(keyword);
  const response = await searched;
  assert.equal(response.status(), 200);
  const { result } = await response.json();
  assert.equal(result.code, 0);
  const matches = result.data.options.filter((option) => option.selectable !== false && option.label.includes(keyword));
  assert.equal(matches.length, 1, "reference search must resolve one actual backend option");
  await settleRPCPage(page);
  const listboxID = await control.getAttribute("aria-controls");
  assert.ok(listboxID);
  const option = page.locator(`[id=${JSON.stringify(listboxID)}]`)
    .locator("xpath=ancestor::div[contains(@class,'ant-select-dropdown')][1]")
    .getByText(matches[0].label, { exact: true });
  await expect(option).toHaveCount(1);
  await option.click();
  await settleRPCPage(page);
}

export async function productionShipmentFlow(
  browser,
  options,
  client,
  fixture,
  report,
  scenario = {},
) {
  const source = await prepareTransactionProductionSource(
    client,
    options,
    scenario.key ? { ...fixture, prefix: `${fixture.prefix}-${scenario.key}` } : fixture,
  );
  const outsourced = new Map();
  for (const code of scenario.outsourcingOperations || []) outsourced.set(code, await prepareTransactionProductOutsourcingContract(client, source, code));
  const sessions = new Map();
  let activePage;
  const getPage = async (role) => {
    if (!sessions.has(role))
      sessions.set(
        role,
        await login(
          browser,
          { ...options, fourK: !options.mobile },
          role,
          report,
        ),
      );
    activePage = sessions.get(role).page;
    return activePage;
  };
  const open = async (role, canonicalPath) => {
    const page = await getPage(role);
    if (options.mobile) {
      const url = new URL(canonicalPath, options.baseURL);
      const sourceTask = async (type, id, groups) => {
        await openMobileSourceTask(page, options, client, role, type, id, groups);
        return page;
      };
      if (url.pathname === BUSINESS_ROUTE_PATHS.processingContracts) return sourceTask('outsourcing_order', source.contract.id, ['handoff_outsourcing_issue']);
      if (url.pathname === BUSINESS_ROUTE_PATHS.qualityInspections) return sourceTask('quality_inspection', Number(url.searchParams.get('quality_inspection_id')), ['handoff_production_quality']);
      if (url.pathname === BUSINESS_ROUTE_PATHS.productionProgress) return sourceTask('production_fact', receipt.id, ['handoff_production_inbound']);
      if (url.pathname === BUSINESS_ROUTE_PATHS.inventory) {
        await sourceTask('production_fact', receipt.id, ['handoff_production_inbound']);
        await page.getByRole('button', { name: '核对已入库批次', exact: true }).click();
        await expect(page.getByTestId('mobile-task-fact-form')).toHaveAttribute('data-handler-mode', 'inventory');
        return page;
      }
      if (url.pathname === BUSINESS_ROUTE_PATHS.shipments && shipment) return sourceTask('shipment', shipment.id, ['handoff_shipment_execute']);
      const createPlan = url.pathname === BUSINESS_ROUTE_PATHS.productionOrders && !production;
      const type = createPlan || url.pathname === BUSINESS_ROUTE_PATHS.shipments ? 'sales_order' : 'production_order';
      const id = type === 'sales_order' ? source.salesOrder.id : production.id;
      await prepareTransactionSourceTask(client, role, type, id, source.prefix);
      await sourceTask(type, id, ['business_followup']);
      if (type === 'sales_order') {
        await page.getByRole('button', { name: createPlan ? '办理关联生产计划' : '办理关联出货', exact: true }).click();
        await expect(page.getByTestId('mobile-task-fact-form')).toHaveAttribute('data-handler-mode', url.pathname === BUSINESS_ROUTE_PATHS.inventory ? 'inventory' : createPlan ? 'production_plan' : 'shipment');
      }
      return page;
    }
    await navigate(
      page,
      businessURL(options, role, canonicalPath.replace(/^\/erp\//u, "")),
    );
    await assertMobileLayout(page, options);
    return page;
  };
  const inventory = () =>
    client.query(
      `SELECT json_build_object('quantity',COALESCE((SELECT sum(quantity) FROM inventory_balances WHERE subject_type='PRODUCT' AND product_sku_id=${source.salesItem.product_sku_id}),0),'net',COALESCE((SELECT sum(quantity*direction) FROM inventory_txns WHERE subject_type='PRODUCT' AND product_sku_id=${source.salesItem.product_sku_id}),0),'txns',(SELECT count(*) FROM inventory_txns WHERE subject_type='PRODUCT' AND product_sku_id=${source.salesItem.product_sku_id}))`,
    );
  const readWip = () =>
    client.rpc("production", "production_wip", "get_production_wip", {
      production_order_id: production.id,
    });
  const batchFor = (state, code) => {
    const operation = state.production_order_operations.find(
      (item) => item.operation_code === code,
    );
    assert.ok(operation, `missing ${code} operation`);
    const rows = state.production_wip_batches.filter(
      (item) =>
        item.production_order_operation_id === operation.id &&
        item.flow_type === "NORMAL" &&
        item.status !== "CANCELLED",
    );
    assert.equal(
      rows.length,
      1,
      `${code} must have exactly one active normal batch`,
    );
    assert.equal(Number(rows[0].quantity), source.quantity);
    return { operation, batch: rows[0] };
  };
  let production, receipt, shipment;
  const actions = [];
  const returnFaults = [];
  const fulfillment = [];
  const progress = {
    surface: options.mobile ? "mobile" : "desktop",
    prefix: source.prefix,
    actions,
  };
  (report.productionProgress ??= []).push(progress);
  const materialBalance = () =>
    client.query(
      `SELECT to_json(COALESCE(sum(quantity),0)) FROM inventory_balances WHERE lot_id=${fixture.receipt.items[0].lot_id}`,
    );
  const initialMaterial = materialBalance();
  const materialTxnCount = () =>
    client.query(
      `SELECT to_json(count(*)) FROM inventory_txns WHERE lot_id=${fixture.receipt.items[0].lot_id}`,
    );
  const initialMaterialTxns = materialTxnCount();
  assert.ok(initialMaterial >= source.quantity);
  try {
    let page = await open("pmc", BUSINESS_ROUTE_PATHS.productionOrders);
    await pageAction(page, /^新建生产订单$/u);
    const form = page.getByRole("region", {
      name: "新建生产订单",
      exact: true,
    });
    await expect(form).toBeVisible();
    await form
      .getByLabel("生产单号", { exact: true })
      .fill(`${source.prefix}-MO`);
    if (options.mobile) {
      const beforeWrites = report.browserRPC.filter((call) => call.method === "create_production_order").length;
      await searchReference(page, form.getByLabel("销售订单行（可选）", { exact: true }), `${fixture.prefix}-DP-SO`, "sales_order_item");
      await form.getByLabel("计划数量", { exact: true }).fill(String(source.quantity));
      await form.getByRole("button", { name: "创建草稿", exact: true }).click();
      await expect(page.getByText("请使用当前任务关联的销售订单行，保留填写内容后重新核对", { exact: true })).toBeVisible();
      assert.equal(report.browserRPC.filter((call) => call.method === "create_production_order").length, beforeWrites);
      assert.equal(client.query(`SELECT to_json(count(*)) FROM production_orders WHERE order_no='${source.prefix}-MO'`), 0);
      const product = form.getByLabel("产品", { exact: true }).locator("xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' ant-select ')][1]");
      await product.hover();
      await product.locator('.ant-select-clear').click();
      await expect(product.locator('.ant-select-selection-item')).toHaveCount(0);
      progress.taskSourceMismatchBlocked = true;
    }
    await searchReference(
      page,
      form.getByLabel("销售订单行（可选）", { exact: true }),
      source.salesOrder.order_no,
      "sales_order_item",
    );
    await searchReference(
      page,
      form.getByLabel("BOM 版本（可选）", { exact: true }),
      source.bom.version,
      "active_bom",
    );
    await form.getByLabel("计划数量", { exact: true }).fill("0");
    const beforeInvalid = client.query(
      `SELECT to_json(count(*)) FROM production_orders WHERE order_no='${source.prefix}-MO'`,
    );
    await form.getByRole("button", { name: "创建草稿", exact: true }).click();
    await expect(
      form.getByText("计划数量必须大于 0", { exact: true }),
    ).toBeVisible();
    assert.equal(
      client.query(
        `SELECT to_json(count(*)) FROM production_orders WHERE order_no='${source.prefix}-MO'`,
      ),
      beforeInvalid,
    );
    await form
      .getByLabel("计划数量", { exact: true })
      .fill(String(source.quantity));
    let aggregate = await clickRPC(page, "create_production_order", () =>
      form.getByRole("button", { name: "创建草稿", exact: true }).click(),
    );
    production = aggregate.production_order;
    assert.equal(production.status, "DRAFT");
    assert.equal(aggregate.production_order_items.length, 1);
    assert.equal(aggregate.production_order_items[0].sales_order_item_id, source.salesItem.id);
    assert.equal(
      aggregate.production_order_items[0].route_code,
      PRODUCTION_WIP_ROUTE_CODE,
    );
    await expect(form).toBeHidden();
    await selectRow(page, production.id);
    await pageAction(page, /^发布$/u);
    const release = await modal(page, "确认发布生产订单？");
    aggregate = await clickRPC(page, "release_production_order", () =>
      release.getByRole("button", { name: "确认发布", exact: true }).click(),
    );
    production = aggregate.production_order;
    assert.equal(production.status, "RELEASED");
    progress.productionOrderID = production.id;
    assert.deepEqual(inventory(), { quantity: 0, net: 0, txns: 0 });
    const requirements = await client.rpc(
      "production",
      "operational_fact",
      "list_production_order_material_requirements",
      { production_order_id: production.id },
    );
    assert.equal(requirements.material_requirements.length, 1);
    const requirement = requirements.material_requirements[0];
    assert.equal(Number(requirement.planned_quantity), source.quantity);
    assert.equal(requirement.bom_header_id, source.bom.id);
    const releasedWip = await readWip();
    const firstBatch = batchFor(releasedWip, "FABRIC_PROCESSING").batch;
    assert.equal(
      (
        await client.raw(
          "finance",
          "production_wip",
          "execute_production_wip_action",
          {
            action: WIP.START_OPERATION,
            production_order_id: production.id,
            production_wip_batch_id: firstBatch.id,
            expected_version: firstBatch.version,
            idempotency_key: `${source.prefix}:forbidden-start`,
          },
        )
      ).code,
      40304,
    );
    assert.deepEqual(await readWip(), releasedWip);

    // The confirmed upstream processing contract is a fixture; its issue and every WIP transition use product UI.
    page = await open("warehouse", BUSINESS_ROUTE_PATHS.processingContracts);
    await selectRow(page, source.contract.id);
    if (options.mobile) {
      const actions = page.getByTestId("mobile-outsourcing-task-actions");
      await expect(actions).toBeVisible();
      await expect(page.getByRole("button", { name: "查看完整单据", exact: true })).toHaveCount(0);
      await actions.getByRole("button", { name: "委外发料", exact: true }).click();
    } else {
      await pageAction(page, "查看详情");
      const contractDetail = page.locator(".ant-modal:visible").filter({ hasText: source.contract.outsourcing_order_no });
      await expect(contractDetail).toHaveCount(1);
      await contractDetail.getByRole("button", { name: "委外发料", exact: true }).click();
    }
    const issueDialog = page.getByRole("dialog", {
      name: "委外发料",
      exact: true,
    });
    await expect(issueDialog).toBeVisible();
    const warehouseProfile = await client.rpc("warehouse", "auth", "me");
    const { session: warehouseSession } = await client.rpc(
      "warehouse",
      "customer_config",
      "get_effective_session",
      { customer_key: "yoyoosun" },
    );
    progress.materialIssueAccess = {
      customerKey: warehouseSession.customer.key,
      module: warehouseSession.modules.outsourcing_orders,
      capability: warehouseProfile.permissions.includes(
        "outsourcing.material_issue.create",
      ),
      entitlement: warehouseSession.actions.includes(
        "outsourcing.material_issue.create",
      ),
      pricePermission: warehouseProfile.permissions.includes(
        "field.procurement_commercial.read",
      ),
    };
    assert.equal(progress.materialIssueAccess.customerKey, "yoyoosun");
    assert.equal(progress.materialIssueAccess.module, "enabled");
    assert.equal(progress.materialIssueAccess.capability, true);
    assert.equal(progress.materialIssueAccess.entitlement, true);
    assert.equal(progress.materialIssueAccess.pricePermission, false);
    page.on("request", (request) => {
      if (!request.url().includes("/rpc/operational_fact")) return;
      const body = request.postDataJSON();
      if (body.method !== "create_outsourcing_material_issue_from_order")
        return;
      progress.materialIssueRequest = {
        customerKey: body.params.customer_key,
        warehouseID: body.params.warehouse_id,
        lotID: body.params.lot_id,
      };
    });
    await expect(
      issueDialog.getByLabel("发生时间", { exact: true }),
    ).not.toHaveValue("");
    await selectOption(
      page,
      issueDialog.getByLabel("仓库", { exact: true }),
      new RegExp(source.warehouse.name, "u"),
    );
    const materialLotNo = client.query(
      `SELECT to_json(lot_no) FROM inventory_lots WHERE id=${fixture.receipt.items[0].lot_id}`,
    );
    await selectOption(
      page,
      issueDialog.getByLabel("材料批次", { exact: true }),
      new RegExp(materialLotNo, "u"),
    );
    await issueDialog
      .getByLabel("本次办理数量", { exact: true })
      .fill(String(source.quantity));
    const issued = (
      await clickRPC(
        page,
        "create_outsourcing_material_issue_from_order",
        async () => {
          await issueDialog
            .getByRole("button", { name: "确认委外发料", exact: true })
            .click();
          const rejected = page.locator(".ant-message-error");
          await Promise.race([
            expect(issueDialog).toBeHidden({ timeout: 30000 }),
            rejected
              .waitFor({ state: "visible", timeout: 30000 })
              .then(async () => {
                throw new Error(
                  `委外发料页面拒绝提交: ${await rejected.innerText()}`,
                );
              }),
          ]);
        },
      )
    ).outsourcing_fact;
    assert.equal(issued.status, "DRAFT");
    assert.equal(
      materialBalance(),
      initialMaterial,
      "an issue draft must not consume material",
    );
    await expect(issueDialog).toBeHidden();
    page = await open("warehouse", BUSINESS_ROUTE_PATHS.processingContracts);
    await selectRow(page, source.contract.id);
    await pageAction(page, "委外记录");
    const records = await modal(
      page,
      `委外记录 · ${source.contract.outsourcing_order_no}`,
    );
    await records
      .locator(`tr[data-row-key="${issued.id}"]`)
      .getByRole("radio")
      .check();
    assert.equal(
      (
        await clickRPC(page, "post_outsourcing_fact", () =>
          records.getByRole("button", { name: "过账", exact: true }).click(),
        )
      ).outsourcing_fact.status,
      "POSTED",
    );
    assert.equal(materialBalance(), initialMaterial - source.quantity);
    assert.equal(materialTxnCount(), initialMaterialTxns + 1);

    const openWip = async (role, batchID) => {
      const p = await open(
        role,
        `${BUSINESS_ROUTE_PATHS.productionOrders}?production_order_id=${production.id}`,
      );
      await selectRow(p, production.id);
      await pageAction(p, /^工序办理$/u);
      const dialog = await modal(p, "生产工序办理");
      const row = dialog.locator(`tr[data-row-key="${batchID}"]`);
      await row.getByRole("radio").check();
      await expect(row.getByRole("radio")).toBeChecked();
      return { page: p, dialog };
    };
    const actWip = async (role, code, action, configure) => {
      const state = await readWip();
      const { batch } = batchFor(state, code);
      const current = await openWip(role, batch.id);
      let label = ACTION_LABEL[action];
      if (action === WIP.START_OPERATION && code === "FABRIC_PROCESSING")
        label = "确认外发裁片";
      if (action === WIP.START_OPERATION && code === "PACKAGING")
        label = "查货完成，开始包装";
      if (action === WIP.COMPLETE_OPERATION && code === "PACKAGING")
        label = "完成包装";
      if (action === WIP.TRANSFER_TO_NEXT_OPERATION && code === "HANDWORK")
        label = "安排查货包装";
      if (action === WIP.CONFIRM_PACKAGING_MATERIAL) {
        await expect(
          current.dialog.getByRole("button", {
            name: "查货完成，开始包装",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          current.dialog.getByRole("button", { name: "安排加工", exact: true }),
        ).toHaveCount(0);
      }
      await current.dialog
        .getByRole("button", { name: label, exact: true })
        .click();
      await configure?.(current.page, current.dialog, state, batch);
      let params;
      const observer = (request) => {
        if (
          request.url().includes("/rpc/production_wip") &&
          request.postDataJSON()?.method === "execute_production_wip_action"
        )
          params = request.postDataJSON().params;
      };
      current.page.on("request", observer);
      let next;
      try {
        const submit = current.dialog.getByRole("button", { name: "确认办理", exact: true });
        if (scenario.dropReturnResponse && outsourced.has(code) && action === WIP.RECEIVE_OUTSOURCING_RETURN) {
          const lost = await dropRealResponse(current.page, options, "production_wip", "execute_production_wip_action");
          await submit.click();
          await expect.poll(() => lost.state.injected).toBe(true);
          assert.equal(lost.state.backendCode, 0);
          await expect(current.page.locator('.ant-message-error')).toBeVisible();
          await lost.remove();
          await expect(submit).toBeEnabled();
          const beforeRetry = await readWip();
          next = await clickRPC(current.page, "execute_production_wip_action", () => submit.click());
          assert.deepEqual(params, lost.state.params, "unknown-result retry must keep the exact request");
          assert.deepEqual(next, beforeRetry, "retry must replay the stored WIP receipt");
          returnFaults.push(faultEvidence(lost.state));
        } else next = await clickRPC(current.page, "execute_production_wip_action", () => submit.click());
      } finally {
        current.page.off("request", observer);
      }
      assert.equal(params.action, action);
      if (action === WIP.CONFIRM_PACKAGING_MATERIAL) {
        assert.equal(
          params.production_order_item_id,
          batch.production_order_item_id,
        );
        assert.equal(Object.hasOwn(params, "production_wip_batch_id"), false);
      } else assert.equal(params.production_wip_batch_id, batch.id);
      const beforeReplay = inventory();
      if (outsourced.has(code)) {
        assert.equal((await client.raw("finance", "production_wip", "execute_production_wip_action", params)).code, 40304);
        assert.deepEqual(await readWip(), next);
      }
      await client.rpc(
        role,
        "production_wip",
        "execute_production_wip_action",
        params,
      );
      assert.deepEqual(
        inventory(),
        beforeReplay,
        "replaying WIP must not add inventory",
      );
      assert.deepEqual(
        await readWip(),
        next,
        "WIP replay must retain the exact aggregate",
      );
      actions.push({
        role,
        operation: code,
        action,
        batchID: batch.id,
        confirmed: true,
      });
      return next;
    };
    const passStage = async (batchID) => {
      const { quality_inspections: rows, total } = await client.rpc(
        "quality",
        "quality",
        "list_production_stage_quality_inspections",
        { production_wip_batch_id: batchID, limit: 100 },
      );
      assert.equal(total, rows.length);
      const active = rows.filter((row) =>
        ["DRAFT", "SUBMITTED"].includes(row.status),
      );
      assert.equal(active.length, 1);
      const inspection = active[0];
      assert.equal(inspection.inspection_type, "PRODUCTION_STAGE");
      assert.equal(inspection.production_wip_batch_id, batchID);
      const p = await open(
        "quality",
        `${BUSINESS_ROUTE_PATHS.qualityInspections}?quality_inspection_id=${inspection.id}`,
      );
      await selectRow(p, inspection.id);
      const focused = options.mobile ? await modal(p, "办理本次质检") : null;
      if (inspection.status === "DRAFT") {
        const submitted = options.mobile
          ? await clickRPC(p, "submit_quality_inspection", () => focused.getByRole("button", { name: "提交质检", exact: true }).click())
          : (await pageAction(p, "提交质检"), await confirmPopup(p, "submit_quality_inspection"));
        assert.equal(
          submitted.quality_inspection.status,
          "SUBMITTED",
        );
      }
      const before = inventory();
      if (options.mobile) await focused.getByRole("button", { name: "判定合格", exact: true }).click();
      else await pageAction(p, "判定合格");
      const decision = await modal(p, "判定合格");
      // Production gates use a source-bound decision, while IQC owns the incoming checklist.
      await expect(
        decision.getByLabel("检查结果", { exact: true }),
      ).toHaveCount(0);
      await selectOption(
        p,
        decision.getByLabel("判定结果", { exact: true }),
        "合格",
      );
      const inspectionDate = new Date().toISOString().slice(0, 10);
      await decision.getByLabel("检验日期", { exact: true }).click();
      await p
        .locator(`.ant-picker-dropdown:visible td[title="${inspectionDate}"]`)
        .click();
      const decisionNote = `模拟 ${inspection.gate_code} 实检符合本批来源约定`;
      await decision.getByLabel("判定备注", { exact: true }).fill(decisionNote);
      await decision
        .getByRole("radio", { name: "0%（未发现不良）", exact: true })
        .check();
      const passed = (
        await clickRPC(p, "pass_quality_inspection", () =>
          decision
            .getByRole("button", { name: "确认合格", exact: true })
            .click(),
        )
      ).quality_inspection;
      assert.equal(passed.status, "PASSED");
      assert.equal(passed.result, "PASS");
      assert.equal(passed.decision_note, decisionNote);
      assert.equal(passed.gate_code, inspection.gate_code);
      assert.equal(passed.production_wip_batch_id, batchID);
      assert.ok(passed.inspected_at > 0);
      assert.equal(Number(passed.defect_rate_percent), 0);
      assert.deepEqual(
        inventory(),
        before,
        "quality decisions do not write the inventory ledger",
      );
      actions.push({
        role: "quality",
        action: "PASS_QUALITY",
        gate: inspection.gate_code,
        inspectionID: inspection.id,
        confirmed: true,
      });
      await expect(decision).toBeHidden();
    };
    let state = await readWip();
    let current = batchFor(state, "FABRIC_PROCESSING");
    assert.equal(current.operation.inhouse_allowed, false);
    await actWip(
      "production",
      "FABRIC_PROCESSING",
      WIP.ASSIGN_EXECUTION,
      async (p, dialog) => {
        await dialog
          .getByRole("radio", { name: "外发加工", exact: true })
          .check();
        const material = dialog.getByLabel("本次外发的材料", { exact: true });
        await selectOption(p, material, new RegExp(source.material.name, "u"));
        await selectOption(
          p,
          dialog.getByLabel("布料加工合同", { exact: true }),
          new RegExp(source.contract.outsourcing_order_no, "u"),
        );
        await selectOption(
          p,
          dialog.getByLabel(
            `${source.material.code} / ${source.material.name}`,
            { exact: true },
          ),
          new RegExp(source.material.name, "u"),
        );
      },
    );
    await actWip("warehouse", "FABRIC_PROCESSING", WIP.START_OPERATION);
    await actWip(
      "warehouse",
      "FABRIC_PROCESSING",
      WIP.RECEIVE_OUTSOURCING_RETURN,
      async (p, dialog) => {
        const submit = dialog.getByRole("button", {
          name: "确认办理",
          exact: true,
        });
        await submit.click();
        await expect(
          dialog.getByText("请填写仓库实点数量", { exact: true }),
        ).toBeVisible();
        await dialog.getByLabel("仓库实点数量", { exact: true }).fill("1");
        await submit.click();
        await expect(
          dialog.getByText("实点数量与本批次不一致，请先核对，暂不能整批送检", {
            exact: true,
          }),
        ).toBeVisible();
        await dialog
          .getByLabel("仓库实点数量", { exact: true })
          .fill(String(source.quantity));
      },
    );
    for (const code of ["FABRIC_PROCESSING", "SEWING", "HANDWORK"]) {
      if (code !== "FABRIC_PROCESSING") {
        const external = outsourced.get(code);
        await actWip(
          "production",
          code,
          WIP.ASSIGN_EXECUTION,
          async (p, dialog) => {
            await dialog.getByRole("radio", { name: external ? "外发加工" : "本厂生产", exact: true }).check();
            if (external) await selectOption(p, dialog.getByLabel("关联加工合同明细", { exact: true }), new RegExp(external.contract.outsourcing_order_no, "u"));
          },
        );
        await actWip("production", code, WIP.START_OPERATION);
        if (external) {
          const beforeReturn = await readWip();
          assert.equal(batchFor(beforeReturn, code).batch.status, "OUTSOURCED");
          await actWip("warehouse", code, WIP.RECEIVE_OUTSOURCING_RETURN, async (p, dialog) => {
            const beforeInvalid = await readWip();
            await dialog.getByLabel("仓库实点数量", { exact: true }).fill("1");
            await dialog.getByRole("button", { name: "确认办理", exact: true }).click();
            await expect(dialog.getByText("实点数量与本批次不一致，请先核对，暂不能整批送检", { exact: true })).toBeVisible();
            assert.deepEqual(await readWip(), beforeInvalid);
            await dialog.getByLabel("仓库实点数量", { exact: true }).fill(String(source.quantity));
          });
        } else await actWip("production", code, WIP.COMPLETE_OPERATION);
      }
      state = await readWip();
      current = batchFor(state, code);
      assert.equal(current.batch.status, "WAITING_QUALITY");
      const gateCount = current.operation.required_quality_gates.length;
      assert.equal(gateCount, code === "HANDWORK" ? 3 : 1);
      if (code !== "HANDWORK") {
        const beforeGate = await readWip();
        const target = beforeGate.production_order_operations.find(
          (operation) => operation.step_no > current.operation.step_no,
        );
        assert.ok(target);
        assert.equal(
          (
            await client.raw(
              "production",
              "production_wip",
              "execute_production_wip_action",
              {
                action: WIP.TRANSFER_TO_NEXT_OPERATION,
                production_order_id: production.id,
                production_wip_batch_id: current.batch.id,
                target_operation_id: target.id,
                quantity: String(source.quantity),
                expected_version: current.batch.version,
                idempotency_key: `${source.prefix}:${code}:blocked-transfer`,
              },
            )
          ).code,
          40010,
        );
        assert.deepEqual(
          await readWip(),
          beforeGate,
          "a pending quality gate must preserve all WIP state",
        );
      }
      assert.deepEqual(inventory(), { quantity: 0, net: 0, txns: 0 });
      if (code === "SEWING" && scenario.onShellRejected) {
        await scenario.onShellRejected({ browser, options, client, report, open, readWip, batch: current.batch, source, production, inventory });
        return;
      }
      if (code !== "HANDWORK") {
        for (let gate = 0; gate < gateCount; gate++)
          await passStage(current.batch.id);
        current = batchFor(await readWip(), code);
        assert.equal(current.batch.status, "ACCEPTED");
        await actWip("production", code, WIP.TRANSFER_TO_NEXT_OPERATION);
      }
    }
    fulfillment.push({ stage: "handwork_completed", stock: inventory() });

    page = await open(
      "warehouse",
      `${BUSINESS_ROUTE_PATHS.productionOrders}?production_order_id=${production.id}`,
    );
    await selectRow(page, production.id);
    await pageAction(page, "登记成品收仓");
    const completion = await modal(page, "登记成品收仓");
    await expect(
      completion.getByLabel("完工时间", { exact: true }),
    ).not.toHaveValue("");
    await expect(
      completion.getByLabel("本次完工数量", { exact: true }),
    ).toHaveValue(String(source.quantity));
    await selectOption(
      page,
      completion.getByLabel("拟入库仓库", { exact: true }),
      new RegExp(source.finishedWarehouse.name, "u"),
    );
    await completion
      .getByRole("radio", { name: "填写新批次号", exact: true })
      .check();
    await completion
      .getByLabel("新批次号", { exact: true })
      .fill(`${source.prefix}-FG`);
    await completion.getByLabel("本次完工数量", { exact: true }).fill("3");
    const beforeInvalidCompletion = client.query(
      `SELECT to_json(count(*)) FROM production_facts WHERE source_type='PRODUCTION_ORDER' AND source_id=${production.id} AND fact_type='FINISHED_GOODS_RECEIPT'`,
    );
    await completion
      .getByRole("button", { name: "生成待入库草稿", exact: true })
      .click();
    await expect(
      completion.getByText(
        "本次数量不能超过所选手工成品批次扣减已入库和待入库后的剩余数量",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(
      client.query(
        `SELECT to_json(count(*)) FROM production_facts WHERE source_type='PRODUCTION_ORDER' AND source_id=${production.id} AND fact_type='FINISHED_GOODS_RECEIPT'`,
      ),
      beforeInvalidCompletion,
    );
    await completion
      .getByLabel("本次完工数量", { exact: true })
      .fill(String(source.quantity));
    const lostCompletion = await dropRealResponse(
      page,
      options,
      "operational_fact",
      "create_production_completion_from_order",
    );
    await completion
      .getByRole("button", { name: "生成待入库草稿", exact: true })
      .click();
    await expect(completion).toBeHidden();
    await lostCompletion.remove();
    assert.equal(lostCompletion.state.backendCode, 0);
    await expect(
      page.getByText("已重新读取并确认成品收仓草稿，请核对并确认成品入库", {
        exact: true,
      }),
    ).toBeVisible();
    receipt = (
      await client.rpc(
        "warehouse",
        "operational_fact",
        "list_production_facts",
        {
          source_id: production.id,
          source_type: "PRODUCTION_ORDER",
          fact_type: "FINISHED_GOODS_RECEIPT",
          limit: 100,
        },
      )
    ).production_facts[0];
    assert.ok(receipt);
    assert.equal(receipt.status, "DRAFT");
    assert.deepEqual(inventory(), { quantity: 0, net: 0, txns: 0 });
    const completionRows = () =>
      client.query(
        `SELECT to_json(count(*)) FROM production_facts WHERE source_type='PRODUCTION_ORDER' AND source_id=${production.id} AND fact_type='FINISHED_GOODS_RECEIPT'`,
      );
    assert.equal(completionRows(), 1);
    await client.rpc(
      "warehouse",
      "operational_fact",
      "create_production_completion_from_order",
      lostCompletion.state.params,
    );
    assert.equal(completionRows(), 1);
    assert.equal(
      (
        await client.raw(
          "production",
          "operational_fact",
          "post_production_fact",
          { id: receipt.id, expected_version: receipt.version },
        )
      ).code,
      40304,
    );
    page = await open("warehouse", BUSINESS_ROUTE_PATHS.productionProgress);
    await selectRow(page, receipt.id);
    const taskReview = options.mobile ? page.getByRole("dialog", { name: "核对本次生产记录", exact: true }) : null;
    if (taskReview) {
      await expect(taskReview).toBeVisible();
      await expect(taskReview).toContainText(receipt.fact_no);
      await expect(taskReview.getByRole("button", { name: "确认成品入库", exact: true })).toHaveCount(1);
      receipt = (await clickRPC(page, "post_production_fact", () => taskReview.getByRole("button", { name: "确认成品入库", exact: true }).click())).production_fact;
      await expect(taskReview).toBeHidden();
    } else {
      await pageAction(page, "确认成品入库");
      receipt = (await confirmPopup(page, "post_production_fact")).production_fact;
    }
    assert.equal(receipt.status, "POSTED");
    assert.deepEqual(inventory(), {
      quantity: source.quantity,
      net: source.quantity,
      txns: 1,
    });
    const assertReadiness = async (
      pendingInspection,
      pendingPackaging,
      ready,
    ) => {
      const { inventory_balances: balances, total } = await client.rpc(
        "warehouse",
        "inventory",
        "list_inventory_balances",
        {
          subject_type: "PRODUCT",
          subject_id: source.salesItem.product_id,
          product_sku_id: source.salesItem.product_sku_id,
          warehouse_id: source.finishedWarehouse.id,
          limit: 100,
        },
      );
      assert.equal(total, 1);
      assert.equal(balances.length, 1);
      assert.equal(balances[0].lot_id, receipt.lot_id);
      assert.equal(Number(balances[0].quantity), source.quantity);
      assert.equal(
        Number(balances[0].pending_inspection_quantity),
        pendingInspection,
      );
      assert.equal(
        Number(balances[0].pending_packaging_quantity),
        pendingPackaging,
      );
      assert.equal(Number(balances[0].ready_to_ship_quantity), ready);
      return { readiness: { pendingInspection, pendingPackaging, ready }, inventoryRecordID: balances[0].id };
    };
    const recordFulfillment = async (
      stage,
      pendingInspection,
      pendingPackaging,
      ready,
    ) => {
      const { readiness, inventoryRecordID } = await assertReadiness(
        pendingInspection,
        pendingPackaging,
        ready,
      );
      const p = await open("warehouse", BUSINESS_ROUTE_PATHS.inventory);
      const visibleReadiness = {};
      const quantities = [
        ['pendingInspection', '待成品检验', pendingInspection],
        ['pendingPackaging', '待查货包装', pendingPackaging],
        ['ready', '可发货数量', ready],
      ];
      if (options.mobile) {
        const sourceCard = p.getByTestId('mobile-task-business-source');
        await expect(sourceCard).toHaveCount(1);
        await expect(sourceCard).toHaveAttribute('data-record-id', String(inventoryRecordID));
        await expect(sourceCard).toContainText(`${source.prefix}-FG`);
        for (const [key, label, expected] of quantities) {
          const field = sourceCard.locator('.ant-descriptions-row').filter({ has: p.locator('.ant-descriptions-item-label').getByText(label, { exact: true }) });
          await expect(field).toHaveCount(1);
          await field.scrollIntoViewIfNeeded();
          await expect(field.locator('.ant-descriptions-item-content')).toHaveText(String(expected));
          visibleReadiness[key] = Number((await field.locator('.ant-descriptions-item-content').textContent()).trim());
        }
        await settleRPCPage(p);
      } else {
        const row = p
          .locator("tr.ant-table-row")
          .filter({ hasText: `${source.prefix}-FG` });
        await expect(row).toHaveCount(1);
        const headers = (
          await p.locator(".ant-table-thead:visible th").allTextContents()
        ).map((text) => text.trim());
        const cells = await row.locator("td").allTextContents();
        for (const [key, label, expected] of quantities) {
          const index = headers.indexOf(label);
          assert.ok(index >= 0, `missing readiness column: ${label}`);
          assert.equal(
            Number(cells[index].trim()),
            expected,
            `${stage}: ${label}`,
          );
          visibleReadiness[key] = Number(cells[index].trim());
        }
      }
      const key = `${flowKey(options, "production")}-${stage}`;
      const screenshot = options.mobile
        ? path.join(options.outputDir, `${key}.png`)
        : (await captureFlowFieldPage(p, options.outputDir, key)).screenshot;
      if (options.mobile)
        await p.screenshot({ path: screenshot, fullPage: false });
      fulfillment.push({ stage, stock: inventory(), readiness, visibleReadiness, inventoryRecordID, screenshot });
    };
    await recordFulfillment("finished_goods_inbound", source.quantity, 0, 0);
    const beforeQuality = await readWip();
    const handwork = batchFor(beforeQuality, "HANDWORK").batch;
    const packaging = beforeQuality.production_order_operations.find(
      ({ operation_code }) => operation_code === "PACKAGING",
    );
    assert.equal(handwork.status, "WAITING_QUALITY");
    assert.equal(
      (
        await client.raw(
          "warehouse",
          "production_wip",
          "execute_production_wip_action",
          {
            action: WIP.TRANSFER_TO_NEXT_OPERATION,
            production_order_id: production.id,
            production_wip_batch_id: handwork.id,
            target_operation_id: packaging.id,
            finished_goods_receipt_id: receipt.id,
            quantity: String(source.quantity),
            expected_version: handwork.version,
            idempotency_key: `${source.prefix}:quality-blocks-packing`,
          },
        )
      ).code,
      40010,
    );
    assert.deepEqual(await readWip(), beforeQuality);
    assert.deepEqual(inventory(), {
      quantity: source.quantity,
      net: source.quantity,
      txns: 1,
    });
    for (let gate = 0; gate < 3; gate++) {
      await passStage(handwork.id);
      await assertReadiness(
        gate < 2 ? source.quantity : 0,
        gate < 2 ? 0 : source.quantity,
        0,
      );
    }
    assert.equal(
      batchFor(await readWip(), "HANDWORK").batch.status,
      "ACCEPTED",
    );
    await recordFulfillment("finished_quality_passed", 0, source.quantity, 0);
    await actWip(
      "warehouse",
      "HANDWORK",
      WIP.TRANSFER_TO_NEXT_OPERATION,
      async (p, dialog) => {
        await selectOption(
          p,
          dialog.getByLabel("成品入库单", { exact: true }),
          new RegExp(receipt.fact_no, "u"),
        );
        await dialog
          .getByLabel("本次移交数量", { exact: true })
          .fill(String(source.quantity));
      },
    );
    await actWip(
      "sales",
      "PACKAGING",
      WIP.CONFIRM_PACKAGING_MATERIAL,
      async (p, dialog) => {
        await dialog
          .getByLabel("包装版本", { exact: true })
          .fill(`${source.prefix}-PACK`);
      },
    );
    const packingBeforeAssignment = await readWip();
    const packingBatch = batchFor(packingBeforeAssignment, "PACKAGING").batch;
    const warehousePacking = await openWip("warehouse", packingBatch.id);
    for (const label of ["安排加工", "拆分批次", "取消批次"]) {
      await expect(
        warehousePacking.dialog.getByRole("button", {
          name: label,
          exact: true,
        }),
      ).toHaveCount(0);
    }
    assert.equal(
      (
        await client.raw(
          "warehouse",
          "production_wip",
          "execute_production_wip_action",
          {
            action: WIP.ASSIGN_EXECUTION,
            production_order_id: production.id,
            production_wip_batch_id: packingBatch.id,
            expected_version: packingBatch.version,
            execution_mode: "IN_HOUSE",
            idempotency_key: `${source.prefix}:forbidden-packing-assignment`,
          },
        )
      ).code,
      40304,
    );
    assert.deepEqual(await readWip(), packingBeforeAssignment);
    await actWip(
      "production",
      "PACKAGING",
      WIP.ASSIGN_EXECUTION,
      async (p, dialog) => {
        await dialog
          .getByRole("radio", { name: "本厂生产", exact: true })
          .check();
      },
    );
    await actWip("warehouse", "PACKAGING", WIP.START_OPERATION);
    await actWip("warehouse", "PACKAGING", WIP.COMPLETE_OPERATION);
    assert.equal(
      batchFor(await readWip(), "PACKAGING").batch.status,
      "ACCEPTED",
    );
    await recordFulfillment("packaging_completed", 0, 0, source.quantity);
    assert.deepEqual(
      inventory(),
      { quantity: source.quantity, net: source.quantity, txns: 1 },
      "packing completion must not receive the same stock twice",
    );
    assert.equal(
      materialBalance(),
      initialMaterial - source.quantity,
      "WIP replay and packing must not consume material twice",
    );
    assert.equal(materialTxnCount(), initialMaterialTxns + 1);
    report.flows.push({
      key: flowKey(options, scenario.key || "production"),
      passed: true,
      outsourcingOperations: [...outsourced.keys()],
      transportFaults: returnFaults,
      outsourcingContracts: [...outsourced.values()].map(({ contract, item }) => ({ id: contract.id, itemID: item.id })),
      productionOrderID: production.id,
      receiptID: receipt.id,
      taskSourceMismatchBlocked: options.mobile ? progress.taskSourceMismatchBlocked : undefined,
      stock: inventory(),
      actions,
      fulfillment,
      qualityBlockedTransfer: true,
      transportFault: faultEvidence(lostCompletion.state),
    });
    await page.screenshot({
      path: path.join(
        options.outputDir,
        `${flowKey(options, scenario.key || "production")}.png`,
      ),
      fullPage: true,
    });

    if (scenario.skipShipment) return { source, production, receipt, actions };
    page = await open("sales", BUSINESS_ROUTE_PATHS.shipments);
    await pageAction(page, /^新建出货单$/u);
    const shipping = page.getByRole("region", {
      name: "新建出货单",
      exact: true,
    });
    await expect(shipping).toBeVisible();
    await expect(
      shipping.getByLabel("销售订单", { exact: true }),
    ).toBeDisabled();
    await shipping
      .getByRole("button", { name: "从销售订单导入", exact: true })
      .click();
    const picker = await modal(page, "从销售订单导入出货明细");
    const sourceSearch = picker.getByPlaceholder("搜索订单", { exact: true });
    await sourceSearch.fill(source.salesOrder.order_no);
    await sourceSearch.press("Enter");
    await picker
      .locator(`tr[data-row-key="${source.salesItem.id}"]`)
      .getByRole("checkbox")
      .check();
    await picker.getByRole("button", { name: "导入", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(
      shipping
        .getByLabel("销售订单", { exact: true })
        .locator(
          "xpath=ancestor::div[contains(@class,'ant-select')][contains(@class,'ant-select-single')][1]",
        ),
    ).toContainText(source.salesOrder.order_no);
    await selectOption(
      page,
      shipping.getByLabel("仓库", { exact: true }),
      new RegExp(source.finishedWarehouse.name, "u"),
    );
    await selectOption(
      page,
      shipping.getByLabel("批次", { exact: true }),
      `${source.prefix}-FG / 可用`,
    );
    await shipping
      .getByLabel("数量", { exact: true })
      .fill(String(source.quantity));
    shipment = (
      await clickRPC(page, "create_shipment_with_items", () =>
        shipping.getByRole("button", { name: "保存", exact: true }).click(),
      )
    ).shipment;
    assert.equal(shipment.status, "DRAFT");
    assert.equal(shipment.sales_order_id, source.salesOrder.id);
    assert.equal(shipment.items.length, 1);
    assert.equal(shipment.items[0].sales_order_item_id, source.salesItem.id);
    assert.equal(
      shipment.items[0].product_sku_id,
      source.salesItem.product_sku_id,
    );
    assert.equal(shipment.items[0].warehouse_id, source.finishedWarehouse.id);
    assert.equal(shipment.items[0].lot_id, receipt.lot_id);
    assert.equal(Number(shipment.items[0].quantity), source.quantity);
    await expect(shipping).toBeHidden();
    assert.deepEqual(inventory(), {
      quantity: source.quantity,
      net: source.quantity,
      txns: 1,
    });
    await selectRow(page, shipment.id);
    await expect(
      page.locator('[data-business-action-key="shipment-ship"]'),
    ).toBeDisabled();
    await pageAction(page, "核对出货审批");
    const releasePopup = page.locator(".ant-popover:visible");
    await clickRPC(page, "start_finished_goods_delivery_process", () =>
      releasePopup
        .getByRole("button", { name: "提交放行", exact: true })
        .click(),
    );
    const { tasks } = await client.rpc("finance", "workflow", "list_tasks", {
      source_type: "shipment",
      source_id: shipment.id,
      task_group: "shipment_finance_approval",
      limit: 100,
    });
    assert.equal(tasks.length, 1);
    const approval = tasks[0];
    assert.equal(approval.task_status_key, "ready");
    const finance = await getPage("finance");
    if (options.mobile) {
      await finance.getByTestId("mobile-role-nav-tasks").click();
      await openMobileTaskCard(finance, approval.id);
      await finance
        .getByTestId("mobile-task-detail-screen")
        .getByRole("button", { name: "选择处理方式", exact: true })
        .click();
      const action = finance.getByTestId("mobile-task-action-screen");
      await action
        .getByRole("radio", { name: "审批通过", exact: true })
        .check();
      await action
        .getByRole("textbox", { name: "审批意见", exact: true })
        .fill("模拟核对出货来源、数量与收款条件");
      await clickRPC(finance, "complete_task_action", () =>
        action
          .getByRole("button", { name: "确认审批通过", exact: true })
          .click(),
      );
      await expect(
        finance.getByTestId("mobile-task-receipt-screen"),
      ).toBeVisible();
    } else {
      await navigate(finance, `${options.baseURL}/erp/task-board`);
      const search = finance.getByPlaceholder("订单 / 产品 / 物料 / 款号", {
        exact: true,
      });
      await search.fill(shipment.shipment_no);
      await search.press("Enter");
      await openDesktopTaskRow(finance, approval, shipment.shipment_no);
      const drawer = finance.locator(".erp-task-action-drawer:visible");
      await drawer
        .getByRole("button", { name: "选择处理方式", exact: true })
        .click();
      await drawer.getByRole("radio").filter({ hasText: "审批通过" }).click();
      await drawer.locator("textarea").fill("模拟核对出货来源、数量与收款条件");
      await drawer
        .getByRole("button", { name: "核对并确认", exact: true })
        .click();
      await clickRPC(finance, "complete_task_action", () =>
        drawer
          .locator("button:visible")
          .filter({ hasText: /^确认通过$/u })
          .click(),
      );
    }
    const approvedTask = (
      await client.rpc("finance", "workflow", "get_task", {
        task_id: approval.id,
      })
    ).task;
    assert.equal(approvedTask.task_status_key, "done");
    assert.equal(approvedTask.version, approval.version + 1);
    shipment = (
      await client.rpc("sales", "operational_fact", "get_shipment", {
        id: shipment.id,
      })
    ).shipment;
    assert.equal(shipment.status, "DRAFT");
    assert.equal(shipment.finance_release_status, "APPROVED");
    assert.deepEqual(inventory(), {
      quantity: source.quantity,
      net: source.quantity,
      txns: 1,
    });
    assert.equal(
      (
        await client.raw(
          "finance",
          "operational_fact",
          "create_receivable_from_shipment",
          {
            shipment_id: shipment.id,
            fact_no: `${source.prefix}-EARLY`,
            idempotency_key: `${source.prefix}:early-ar`,
          },
        )
      ).code,
      40010,
    );
    page = await open("sales", BUSINESS_ROUTE_PATHS.shipments);
    await selectRow(page, shipment.id);
    const lostShipment = await dropRealResponse(
      page,
      options,
      "operational_fact",
      "ship_shipment",
    );
    await pageAction(page, "确认出货");
    const confirm = page.locator(".ant-popover:visible");
    await confirm.getByRole("button", { name: "确认", exact: true }).click();
    await expect
      .poll(() => inventory())
      .toEqual({ quantity: 0, net: 0, txns: 2 });
    await lostShipment.remove();
    assert.equal(lostShipment.state.backendCode, 0);
    shipment = (
      await client.rpc("sales", "operational_fact", "get_shipment", {
        id: shipment.id,
      })
    ).shipment;
    assert.equal(shipment.status, "SHIPPED");
    await client.rpc(
      "sales",
      "operational_fact",
      "ship_shipment",
      lostShipment.state.params,
    );
    assert.deepEqual(inventory(), { quantity: 0, net: 0, txns: 2 });
    await open("sales", BUSINESS_ROUTE_PATHS.shipments);
    await selectRow(page, shipment.id);
    await pageAction(page, "撤销已出货");
    shipment = (await confirmPopup(page, "cancel_shipment")).shipment;
    assert.equal(shipment.status, "CANCELLED");
    assert.deepEqual(inventory(), {
      quantity: source.quantity,
      net: source.quantity,
      txns: 3,
    });
    report.flows.push({
      key: flowKey(options, "shipment"),
      passed: true,
      shipmentID: shipment.id,
      productionOrderID: production.id,
      approvalTaskID: approval.id,
      approvalSurface: options.mobile ? "mobile" : "desktop",
      restored: inventory(),
      transportFault: faultEvidence(lostShipment.state),
    });
    await page.screenshot({
      path: path.join(options.outputDir, `${flowKey(options, "shipment")}.png`),
      fullPage: true,
    });
  } catch (error) {
    if (activePage) await captureFailure(activePage, options, report, error);
    throw error;
  } finally {
    for (const { page, context } of sessions.values())
      await closePage(page, context);
  }
}
