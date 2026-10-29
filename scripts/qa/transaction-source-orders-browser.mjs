import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { RpcErrorCode as CODE } from "../../web/src/common/consts/errorCodes.generated.js";
import { createTransactionClient, prepareTransactionFixture } from "./transaction-real-backend-fixture.mjs";
import { BUSINESS_ROUTE_PATHS } from "../../web/src/erp/utils/masterDataOrderView.mjs";
import { resolveMobileActionLabel } from "../../web/src/erp/mobile/utils/mobileRoleTaskModel.mjs";
import { getEngineeringMaterialTaskContext } from "../../web/src/erp/utils/engineeringMaterialTask.mjs";
import { advanceSalesOrderLifecycleThroughProcess } from "./manual-acceptance-source-data.mjs";
import { prepareManualAcceptanceEngineering } from "./manual-acceptance-engineering-data.mjs";
import { login, navigate, closePage, settleRPCPage, businessURL, selectRow, pageAction, openDesktopTaskRow, openMobileTaskCard, openMobileSourceTask, dropRealResponse, faultEvidence, captureFailure, clickRPC } from "./transaction-browser-ui.mjs";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { chromium, expect } = require("playwright/test");
export const SOURCE_ORDER_FLOW_KEYS = Object.freeze(["sales", "purchase", "outsourcing"].flatMap(key => ["desktop", "mobile"].map(surface => `${surface}_${key}`)));
const configs = {
  sales: { role: "sales", domain: "sales_order", table: "sales_orders", itemTable: "sales_order_items", no: "order_no", date: "order_date", title: "编辑销售订单", quantity: "ordered_quantity", submitted: "submitted", approved: "active", start: "start_sales_order_acceptance_process", execute: "execute_sales_order_acceptance_submit", submit: "提交订单" },
  purchase: { role: "purchase", domain: "purchase_order", table: "purchase_orders", itemTable: "purchase_order_items", no: "purchase_order_no", date: "purchase_date", title: "编辑采购订单", quantity: "purchased_quantity", submitted: "submitted", approved: "approved", start: "start_material_supply_purchase_order_process", execute: "execute_material_supply_purchase_order_submit", submit: "提交订单" },
  outsourcing: { role: "purchase", domain: "outsourcing_order", table: "outsourcing_orders", itemTable: "outsourcing_order_items", no: "outsourcing_order_no", date: "order_date", title: "编辑加工合同", quantity: "outsourcing_quantity", submitted: "submitted", approved: "confirmed", submit: "提交合同", execute: "submit_outsourcing_order" },
};
const factTables = ["inventory_txns", "inventory_balances", "inventory_lots", "inventory_operations", "inventory_operation_items", "stock_reservations", "purchase_receipts", "purchase_receipt_items", "purchase_returns", "purchase_return_items", "purchase_receipt_adjustments", "purchase_receipt_adjustment_items", "outsourcing_facts", "quality_inspections", "finance_facts", "finance_payments", "finance_allocations", "finance_credit_notes", "production_facts", "production_wip_batches", "production_wip_events", "production_order_operations", "production_packaging_confirmations", "shipments", "shipment_items"];

export function assertSourceOrderEvidence(report) {
  assert.deepEqual(report.flows.map(flow => flow.key), SOURCE_ORDER_FLOW_KEYS);
  assert.deepEqual(report.pageErrors, []);
  assert.ok(report.browserRPC.length > 0);
  assert.deepEqual(Object.keys(report.factsBefore).sort(), [...factTables].sort());
  assert.deepEqual(report.factsAfter, report.factsBefore);
  for (const flow of report.flows) {
    assert.equal(flow.authoringSurface, 'desktop');
    if (flow.key.startsWith('mobile_')) assert.equal(flow.mobileAuthoringUnavailable, true);
    for (const field of ["passed", "draftCAS", "conflictMessageShownOnce", "forbiddenUnchanged", "invalidQuantityUnchanged", "saveRecovered", "saveKeptBusinessValues", "submitRecovered", "replayExact", "changedIntentRejected", "factsUnchanged", "frozenAfterSubmit", "terminalGuard"]) assert.equal(flow[field], true, `${flow.key}.${field}`);
    assert.ok(Number.isSafeInteger(flow.sourceID) && flow.sourceID > 0);
    for (const fault of [flow.saveFault, flow.submitFault]) {
      assert.equal(fault.injected, true);
      assert.equal(fault.backendCode, 0);
      assert.ok(fault.requestID);
    }
    if (!flow.key.endsWith("outsourcing")) {
      assert.equal(flow.blockResume, true);
      assert.equal(flow.rejectionSettled, true);
      assert.equal(flow.approvalPermissionDenied, true);
      assert.equal(flow.reasonRequired, true);
    } else {
      assert.equal(flow.incompleteCloseBlocked, true);
      assert.equal(flow.confirmed, true);
    }
  }
  assert.equal(report.unexpectedRPC.length, 0);
  const expected = report.expectedFailures.filter(entry => entry.browser);
  assert.equal(expected.length, SOURCE_ORDER_FLOW_KEYS.length);
  for (const entry of expected) {
    assert.equal(report.browserRPC.filter(call => call.role === entry.actor && call.method === entry.method && call.code === entry.code).length, expected.filter(other => other.actor === entry.actor && other.method === entry.method && other.code === entry.code).length);
  }
  assert.deepEqual(report.engineering.map(entry => entry.surface), ["desktop", "mobile"]);
  assert.ok(report.engineering.every(entry => entry.preparationSurface === "desktop"));
  for (const entry of report.engineering) {
    for (const key of ["passed", "staleSourceRejected", "permissionDenied", "rejectReasonRequired", "rejectedResubmitted", "approvalOrdered", "financeRecovered", "replayExact", "changedReviewRejected", "purchaseSourceVerified", "factsUnchanged"]) assert.equal(entry[key], true, `engineering.${entry.surface}.${key}`);
    assert.equal(entry.purchaseOrders, 1);
    assert.equal(entry.financeFault.injected, true);
    assert.equal(entry.financeFault.backendCode, 0);
    assert.ok(entry.financeFault.requestID);
  }
}

async function run(options) {
  const client = createTransactionClient(options);
  const report = { status: "running", flows: [], engineering: [], pageErrors: [], browserRPC: [], expectedFailures: [], databaseName: options.databaseName };
  options = { ...options, fourK: true, outputDir: path.join(options.outputDir, "source-orders") };
  await fs.mkdir(options.outputDir, { recursive: true });
  let browser;
  const sessions = new Map();
  let activePage;
  try {
    report.identity = await client.verify();
    for (const actor of ["admin", "sales", "purchase", "warehouse", "boss", "finance", "engineering"]) await client.login(actor);
    report.frontendIdentity = await client.verifyFrontend();
    const prefix = `SIM-E2E-${options.runID.toUpperCase()}`;
    if (!client.query(`SELECT to_json(count(*)) FROM customers WHERE code='${prefix}-CUS'`)) await prepareTransactionFixture(client, options);
    const customer = client.query(`SELECT row_to_json(r) FROM (SELECT id,name FROM customers WHERE code='${prefix}-CUS') r`);
    const supplier = client.query(`SELECT row_to_json(r) FROM (SELECT id,name FROM suppliers WHERE code='${prefix}-SUP') r`);
    const material = client.query("SELECT row_to_json(r) FROM (SELECT id,default_unit_id FROM materials WHERE is_active AND default_unit_id IS NOT NULL ORDER BY id LIMIT 1) r");
    const product = client.query("SELECT row_to_json(r) FROM (SELECT id,default_unit_id FROM products WHERE is_active AND default_unit_id IS NOT NULL ORDER BY id LIMIT 1) r");
    const process = client.query("SELECT row_to_json(r) FROM (SELECT id FROM processes WHERE is_active AND outsourcing_enabled ORDER BY id LIMIT 1) r");
    assert.ok(customer?.id && supplier?.id && material?.id && product?.id && process?.id);
    const facts = () => client.query(`SELECT json_build_object(${factTables.map(table => `'${table}',(SELECT md5(COALESCE(json_agg(r ORDER BY r.id)::text,'[]')) FROM ${table} r)`).join(",")})`);
    const beforeFacts = facts();
    report.factsBefore = beforeFacts;
    browser = await chromium.launch({ headless: true });
    const getPage = async (role, mobile) => {
      const key = `${role}:${mobile}`;
      if (!sessions.has(key)) sessions.set(key, await login(browser, { ...options, mobile }, role, report));
      activePage = sessions.get(key).page;
      return activePage;
    };
    const snapshot = (config, id) => client.query(`SELECT json_build_object('header',(SELECT row_to_json(h) FROM ${config.table} h WHERE h.id=${id}),'items',(SELECT json_agg(i ORDER BY i.id) FROM ${config.itemTable} i WHERE i.${config.domain}_id=${id}))`);
    const read = async (config, id) => (await client.rpc(config.role, config.domain, `get_${config.domain}`, { id }))[config.domain];
    const expectFailure = async (actor, domain, method, params, code) => {
      const result = await client.raw(actor, domain, method, params);
      assert.equal(result.code, code, `${actor}:${method}: ${result.message}`);
      report.expectedFailures.push({ actor, domain, method, code });
    };
    const prepare = async (kind, label) => {
      const config = configs[kind];
      const params = { [config.no]: `${prefix}-${label}`, [config.date]: new Date().toISOString().slice(0, 10), currency: "CNY", payment_method: "银行转账", payment_term_days: 0, note: "模拟接单采购委外验证", items: [{ line_no: 1, unit_id: kind === "sales" ? product.default_unit_id : material.default_unit_id, [config.quantity]: "2", unit_price: "3.5", amount: "7" }] };
      if (kind === "sales") Object.assign(params, { customer_id: customer.id, customer_snapshot: { name: customer.name }, tax_mode: "NONE", freight_terms: "INCLUDED" }), Object.assign(params.items[0], { product_id: product.id });
      else Object.assign(params, { supplier_id: supplier.id, supplier_snapshot: { name: supplier.name } }), Object.assign(params.items[0], kind === "purchase" ? { material_id: material.id } : { subject_type: "MATERIAL", material_id: material.id, process_id: process.id });
      if (kind === "outsourcing") {
        delete params.payment_method;
        params.expected_return_date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        params.supplier_snapshot = { name: supplier.name, contact_name: "模拟加工联系人", contact_phone: "0769-00000000", address: "模拟加工地址" };
        params.contract_party_snapshot = { buyerCompany: "模拟工厂", buyerContact: "模拟采购", buyerPhone: "0769-00000000", buyerAddress: "模拟收货地址" };
        params.items[0].processing_item = "模拟材料加工";
      }
      const saved = await client.rpc(config.role, config.domain, `save_${config.domain}_with_items`, params);
      const order = saved[config.domain];
      assert.equal(order.lifecycle_status, "draft");
      const items = saved[`${config.domain}_items`];
      assert.equal(items.length, 1);
      return { config, order, params: { ...params, id: order.id, expected_version: order.version, items: params.items.map((item, index) => ({ ...item, id: items[index].id })) } };
    };
    const sourceFollowups = new Map();
    const prepareFollowup = async (sourceType, sourceID, role) => {
      const key = `${sourceType}:${sourceID}:${role}`;
      if (!sourceFollowups.has(key)) {
        const { task } = await client.rpc("admin", "workflow", "create_followup_task", {
          source_type: sourceType, source_id: sourceID, owner_role_key: role,
          task_name: "模拟核对来源单据", description: "模拟从岗位任务进入实际业务单据办理",
          due_at: Math.floor(Date.now() / 1000) + 3600, priority: 0, idempotency_key: `${prefix}:followup:${key}`,
        });
        assert.equal(task.source_type, sourceType);
        assert.equal(task.source_id, sourceID);
        sourceFollowups.set(key, task.id);
      }
    };
    const openSource = async (config, order) => {
      const page = await getPage(config.role, false);
      const route = BUSINESS_ROUTE_PATHS[config.domain === "sales_order" ? "salesOrders" : config.domain === "purchase_order" ? "purchaseOrders" : "processingContracts"].replace(/^\/erp\//u, "");
      await navigate(page, businessURL({ ...options, mobile: false }, config.role, route));
      const search = page.locator('.erp-business-operation-panel input[placeholder]').first();
      await search.fill(order[config.no]);
      await search.press("Enter");
      if (config.domain === "purchase_order") {
        const choice = page.locator(`.ant-table-row[data-row-key="${order.id}"]:visible`).getByRole("checkbox");
        await expect(choice).toHaveCount(1);
        await choice.check();
        await expect(choice).toBeChecked();
      } else await selectRow(page, order.id);
      return page;
    };
    const formAction = (form, name) => form.getByRole("button", { name, exact: true });
    const closeReceipt = async page => {
      const receipt = page.locator('.ant-modal:visible');
      if (await receipt.count()) await receipt.getByRole("button", { name: /知道了|关闭|确定|完成/u }).last().click();
    };
    const contractAction = async (page, action) => {
      await pageAction(page, action === "submit" ? "提交合同" : "确认下单");
      const confirmation = page.locator(".ant-modal-confirm:visible").filter({ hasText: action === "submit" ? "确认提交加工合同" : "确认下单" });
      await expect(confirmation).toHaveCount(1);
      const button = confirmation.getByRole("button", { name: action === "submit" ? "确认提交" : "确认下单", exact: true });
      await expect(button).toBeEnabled();
      await button.click();
    };
    const taskAction = async (task, orderNo, mobile, action, required = false) => {
      const access = await client.rpc(task.owner_role_key, "workflow", "explain_action_access", { task_id: task.id, action_key: action });
      assert.equal(access.action.allowed, true);
      assert.equal(access.source_access.allowed, true);
      (report.actionAccess ??= []).push({ taskID: task.id, action, mobile, access });
      const page = await getPage(task.owner_role_key, mobile);
      if (mobile) {
        await navigate(page, `${options.baseURL}/m/${task.owner_role_key}/tasks`);
        const taskSearch = page.getByRole("searchbox");
        await taskSearch.fill(orderNo);
        await taskSearch.press("Enter");
        await openMobileTaskCard(page, task.id);
        const processButton = page.getByTestId("mobile-task-detail-screen").getByRole("button", { name: "选择处理方式", exact: true });
        await expect(processButton).toHaveCount(1);
        await expect(processButton).toBeEnabled();
        if (action === "block") await page.screenshot({ path: path.join(options.outputDir, `mobile-${orderNo}-actions.png`), fullPage: false });
        await processButton.click();
        const panel = page.getByTestId("mobile-task-action-screen");
        const label = action === "complete" ? "审批通过" : resolveMobileActionLabel(action);
        const choice = panel.getByRole("radio", { name: label, exact: true });
        if (await choice.count()) await choice.check();
        else await expect(panel.getByTestId("mobile-task-single-action-summary").getByText(label, { exact: true })).toBeVisible();
        const submit = panel.getByRole("button", { name: `确认${label}`, exact: true });
        if (required) {
          const previous = await client.rpc(task.owner_role_key, "workflow", "get_task", { task_id: task.id });
          const count = report.browserRPC.filter(call => call.method === "complete_task_action").length;
          await submit.click();
          await expect(panel.locator('[aria-invalid="true"]')).toHaveCount(1);
          assert.deepEqual(await client.rpc(task.owner_role_key, "workflow", "get_task", { task_id: task.id }), previous);
          assert.equal(report.browserRPC.filter(call => call.method === "complete_task_action").length, count);
        }
        await panel.locator("textarea").fill(`模拟${action}，核对来源与后续责任`);
        await clickRPC(page, `${action === "complete" ? "complete" : action}_task_action`, () => submit.click());
        await expect(page.getByTestId("mobile-task-receipt-screen")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expect.poll(() => page.pendingRPC.size).toBe(0);
        await page.screenshot({ path: path.join(options.outputDir, `mobile-${orderNo}-${action}.png`), fullPage: false });
        const back = page.getByTestId("mobile-task-receipt-screen")
          .locator(".mobile-task-flow-header")
          .getByRole("button", { name: "返回任务列表", exact: true });
        await expect(back).toHaveCount(1);
        await back.click();
        await expect(page.getByTestId("mobile-role-task-list")).toBeVisible();
      } else {
        await navigate(page, `${options.baseURL}/erp/task-board`);
        const search = page.getByPlaceholder("订单 / 产品 / 物料 / 款号", { exact: true });
        await search.fill(orderNo);
        await search.press("Enter");
        await openDesktopTaskRow(page, task, orderNo);
        const panel = page.locator(".erp-task-action-drawer:visible");
        await panel.getByRole("button", { name: "任务办理", exact: true }).click();
        await panel.getByRole("radio").filter({ hasText: { complete: "审批通过", reject: "审批退回", block: "标记阻塞", resume: "解除阻塞" }[action] }).click();
        if (required) {
          await expect(panel.getByRole("button", { name: "核对并确认", exact: true })).toBeDisabled();
          assert.equal((await client.rpc(task.owner_role_key, "workflow", "get_task", { task_id: task.id })).task.version, task.version);
        }
        await panel.locator("textarea").fill(`模拟${action}，核对来源与后续责任`);
        await panel.getByRole("button", { name: "核对并确认", exact: true }).click();
        const button = { complete: "确认通过", reject: "确认退回", block: "提交阻塞", resume: "确认恢复待处理" }[action];
        const submit = panel.locator("button:visible").filter({ hasText: new RegExp(`^${button}$`, "u") });
        await expect(submit).toHaveCount(1);
        await expect(submit).toBeEnabled();
        await clickRPC(page, `${action === "complete" ? "complete" : action}_task_action`, async () => {
          await submit.click();
          await page.waitForLoadState("networkidle");
          (report.submissionMessages ??= []).push({ taskID: task.id, action, messages: await page.locator('.ant-message-notice-content').allTextContents() });
        });
        const receipt = panel.getByRole('region', { name: '办理结果', exact: true });
        await expect(receipt).toBeVisible();
        await expect(receipt).toContainText(`模拟${action}，核对来源与后续责任`);
        await page.screenshot({ path: path.join(options.outputDir, `desktop-${orderNo}-${action}.png`), fullPage: false });
      }
      const updated = (await client.rpc(task.owner_role_key, "workflow", "get_task", { task_id: task.id })).task;
      assert.equal(updated.task_status_key, { complete: "done", reject: "rejected", block: "blocked", resume: "ready" }[action]);
      assert.equal(updated.version, task.version + 1);
      return updated;
    };
    for (const kind of ["sales", "purchase", "outsourcing"]) for (const mobile of [false, true]) {
      const flow = { key: `${mobile ? "mobile" : "desktop"}_${kind}`, authoringSurface: "desktop" };
      const fixture = await prepare(kind, `${mobile ? "M" : "D"}-${kind.toUpperCase()}`);
      const { config, params } = fixture;
      let order = fixture.order;
      flow.sourceID = order.id;
      report.flows.push(flow);
      const initial = snapshot(config, order.id);
      await expectFailure("warehouse", config.domain, `save_${config.domain}_with_items`, { ...params, note: "禁止越权覆盖" }, CODE.PERMISSION_DENIED);
      assert.deepEqual(snapshot(config, order.id), initial);
      flow.forbiddenUnchanged = true;
      await expectFailure(config.role, config.domain, `save_${config.domain}_with_items`, { ...params, note: "非法明细不得落库", items: params.items.map(item => ({ ...item, [config.quantity]: "-1" })) }, CODE.INVALID_PARAM);
      assert.deepEqual(snapshot(config, order.id), initial);
      flow.invalidQuantityUnchanged = true;
      if (mobile) {
        const phone = await getPage(config.role, true);
        await prepareFollowup(config.domain, order.id, config.role);
        await openMobileSourceTask(phone, { ...options, mobile: true }, client, config.role, config.domain, order.id, ['business_followup']);
        await expect(phone.getByRole('button', { name: /^(编辑|保存草稿|提交订单|提交合同)$/u })).toHaveCount(0);
        flow.mobileAuthoringUnavailable = true;
      }
      let page = await openSource(config, order);
      await pageAction(page, "编辑");
      let form = page.getByRole("region", { name: config.title, exact: true });
      await expect(form).toBeVisible();
      await expect(form).toHaveAttribute("aria-busy", "false");
      (report.controlAudit ??= []).push({ key: flow.key, fields: await form.locator("textarea").evaluateAll(nodes => nodes.map(node => ({ id: node.id, labels: [...node.labels].map(label => label.textContent), duplicateIDs: document.querySelectorAll(`#${CSS.escape(node.id)}`).length, ariaLabel: node.getAttribute('aria-label'), inert: Boolean(node.closest('[inert]')) }))) });
      const note = form.getByRole("textbox", { name: "备注", exact: true });
      await note.fill("模拟本地未保存内容");
      await page.screenshot({ path: path.join(options.outputDir, `${flow.key}-edit.png`), fullPage: false });
      const remote = await client.rpc(config.role, config.domain, `save_${config.domain}_with_items`, { ...params, note: "模拟另一次正式更新" });
      const winner = snapshot(config, order.id);
      await clickRPC(page, `save_${config.domain}_with_items`, () => formAction(form, "保存草稿").click(), CODE.RESOURCE_VERSION_CONFLICT);
      report.expectedFailures.push({ actor: config.role, domain: config.domain, method: `save_${config.domain}_with_items`, code: CODE.RESOURCE_VERSION_CONFLICT, browser: true });
      const conflictAlert = page.locator(".erp-feedback-message [role=alert]");
      await expect(conflictAlert).toHaveCount(1);
      await expect(conflictAlert).toBeVisible();
      await expect(conflictAlert).toContainText("更新");
      await expect(conflictAlert).toContainText("核对最新单据");
      flow.conflictMessage = await conflictAlert.innerText();
      flow.conflictMessageShownOnce = true;
      await expect(form).toBeVisible();
      await expect(note).toHaveValue("模拟本地未保存内容");
      assert.deepEqual(snapshot(config, order.id), winner);
      await formAction(form, "返回列表").click();
      const discard = page.locator('.ant-modal-confirm:visible');
      await discard.getByRole("button", { name: /放弃|离开/u }).click();
      await expect(form).toBeHidden();
      flow.draftCAS = true;
      flow.draftVersions = { initial: initial.header.version, conflict: winner.header.version };
      order = remote[config.domain];
      page = await openSource(config, order);
      await pageAction(page, "编辑");
      form = page.getByRole("region", { name: config.title, exact: true });
      await expect(form.getByRole("textbox", { name: "备注", exact: true })).toHaveValue("模拟另一次正式更新");
      await form.getByRole("textbox", { name: "备注", exact: true }).fill("模拟丢失响应后已确认保存");
      const saveFault = await dropRealResponse(page, options, config.domain, `save_${config.domain}_with_items`);
      await formAction(form, "保存草稿").click();
      await expect.poll(() => Boolean(saveFault.state.captured)).toBe(true);
      await saveFault.remove();
      flow.saveFault = faultEvidence(saveFault.state);
      assert.equal(snapshot(config, order.id).header.note, "模拟丢失响应后已确认保存");
      assert.equal(snapshot(config, order.id).header.version, order.version + 1);
      const recoveredSave = snapshot(config, order.id);
      const valuesOf = (record, keys) => Object.fromEntries(keys.map(key => [key, record[key]]));
      const headerKeys = ["id", config.no, config.date, "currency", "payment_term_days", kind === "sales" ? "customer_id" : "supplier_id"];
      headerKeys.push(...(kind === "sales" ? ["payment_method", "tax_mode", "freight_terms"] : kind === "purchase" ? ["payment_method"] : ["expected_return_date"]));
      const lineKeys = ["id", "line_no", "product_id", "material_id", "process_id", "unit_id", config.quantity, "unit_price", "amount"];
      assert.deepEqual(valuesOf(recoveredSave.header, headerKeys), valuesOf(winner.header, headerKeys));
      assert.deepEqual(recoveredSave.items.map(item => valuesOf(item, lineKeys)), winner.items.map(item => valuesOf(item, lineKeys)));
      flow.saveKeptBusinessValues = true;
      flow.draftVersions.recovered = snapshot(config, order.id).header.version;
      await expect(form).toHaveAttribute("aria-busy", "false");
      await expect(form.getByRole("textbox", { name: "备注", exact: true })).toHaveValue("模拟丢失响应后已确认保存");
      await formAction(form, "返回列表").click();
      await page.locator('.ant-modal-confirm:visible').getByRole("button", { name: "放弃修改", exact: true }).click();
      await expect(form).toBeHidden();
      order = await read(config, order.id);
      page = await openSource(config, order);
      await pageAction(page, "编辑");
      form = page.getByRole("region", { name: config.title, exact: true });
      await expect(form.getByRole("textbox", { name: "备注", exact: true })).toHaveValue("模拟丢失响应后已确认保存");
      await formAction(form, "返回列表").click();
      await expect(form).toBeHidden();
      flow.saveRecovered = true;
      const submitFault = await dropRealResponse(page, options, kind === "outsourcing" ? config.domain : "customer_config", config.execute);
      const submitRequests = [];
      const collect = request => { if (request.url().includes('/rpc/')) { const body = request.postDataJSON(); if ([config.start, config.execute].includes(body.method)) submitRequests.push(body); } };
      page.on("request", collect);
      if (kind === "outsourcing") await contractAction(page, "submit");
      else await pageAction(page, config.submit);
      await expect.poll(() => Boolean(submitFault.state.captured)).toBe(true);
      await submitFault.remove();
      page.off("request", collect);
      flow.submitFault = faultEvidence(submitFault.state);
      assert.equal((await read(config, order.id)).lifecycle_status, config.submitted);
      await page.reload();
      await page.waitForLoadState("networkidle");
      flow.submitRecovered = true;
      const frozen = snapshot(config, order.id);
      const beforeReplay = facts();
      const replayDomain = kind === "outsourcing" ? config.domain : "customer_config";
      await client.rpc(config.role, replayDomain, config.execute, submitFault.state.params);
      assert.deepEqual(snapshot(config, order.id), frozen);
      assert.deepEqual(facts(), beforeReplay);
      flow.replayExact = true;
      const alternative = await prepare(kind, `${mobile ? "M" : "D"}-${kind.toUpperCase()}-REJECT`);
      if (kind === "outsourcing") {
        await expectFailure(config.role, replayDomain, config.execute, { ...submitFault.state.params, expected_version: submitFault.state.params.expected_version + 1 }, CODE.IDEMPOTENCY_CONFLICT);
      } else {
        const started = submitRequests.find(body => body.method === config.start);
        assert.ok(started);
        await expectFailure(config.role, "customer_config", config.start, { ...started.params, correlation_key: `${prefix}:${flow.key}:different-intent` }, CODE.IDEMPOTENCY_CONFLICT);
        assert.equal(client.query(`SELECT to_json(count(*)) FROM process_instances WHERE business_ref_type='${config.domain}' AND business_ref_id=${order.id}`), 1);
      }
      flow.changedIntentRejected = true;
      await expectFailure(config.role, config.domain, `save_${config.domain}_with_items`, { ...params, expected_version: frozen.header.version, note: "提交后不得修改" }, CODE.BUSINESS_RULE_VIOLATION);
      assert.deepEqual(snapshot(config, order.id), frozen);
      flow.frozenAfterSubmit = true;
      if (kind !== "outsourcing") {
        const task = (await client.rpc("admin", "workflow", "list_tasks", { source_type: config.domain, source_id: order.id, limit: 100 })).tasks.find(task => task.task_status_key === "ready");
        assert.ok(task?.owner_role_key);
        const forbidden = { task_id: task.id, expected_version: task.version, idempotency_key: `${prefix}:${flow.key}:forbidden`, action_key: "complete", reason: "越权审批必须拒绝" };
        const taskBefore = await client.rpc("admin", "workflow", "get_task", { task_id: task.id });
        await expectFailure("warehouse", "workflow", "complete_task_action", forbidden, CODE.PERMISSION_DENIED);
        assert.deepEqual(await client.rpc("admin", "workflow", "get_task", { task_id: task.id }), taskBefore);
        assert.deepEqual(snapshot(config, order.id), frozen);
        flow.approvalPermissionDenied = true;
        const blocked = await taskAction(task, order[config.no], mobile, "block", true);
        const resumed = await taskAction(blocked, order[config.no], mobile, "resume");
        assert.equal((await read(config, order.id)).lifecycle_status, config.submitted);
        await taskAction(resumed, order[config.no], mobile, "complete", true);
        assert.equal((await read(config, order.id)).lifecycle_status, config.approved);
        flow.blockResume = flow.reasonRequired = true;
        const rejectPage = await openSource(config, alternative.order);
        await clickRPC(rejectPage, config.execute, () => pageAction(rejectPage, config.submit));
        await closeReceipt(rejectPage);
        const rejectTask = (await client.rpc("admin", "workflow", "list_tasks", { source_type: config.domain, source_id: alternative.order.id, limit: 100 })).tasks.find(task => task.task_status_key === "ready");
        assert.ok(rejectTask);
        await taskAction(rejectTask, alternative.order[config.no], mobile, "reject", true);
        const rejected = snapshot(config, alternative.order.id);
        assert.equal(rejected.header.lifecycle_status, "canceled");
        assert.ok(rejected.items.every(item => item.line_status === "canceled"));
        const process = client.query(`SELECT row_to_json(r) FROM (SELECT status,resolution_kind FROM process_instances WHERE business_ref_type='${config.domain}' AND business_ref_id=${alternative.order.id}) r`);
        assert.deepEqual(process, { status: "completed", resolution_kind: "rejected" });
        await expectFailure(config.role, "customer_config", config.start, { [kind === "sales" ? "sales_order_id" : "purchase_order_id"]: alternative.order.id, customer_key: "yoyoosun", business_ref_no: alternative.order[config.no], idempotency_key: `${prefix}:${flow.key}:terminal` }, CODE.BUSINESS_RULE_VIOLATION);
        assert.deepEqual(snapshot(config, alternative.order.id), rejected);
        flow.rejectionSettled = flow.terminalGuard = true;
      } else {
        page = await openSource(config, order);
        await clickRPC(page, "confirm_outsourcing_order", () => contractAction(page, "confirm"));
        assert.equal((await read(config, order.id)).lifecycle_status, "confirmed");
        flow.confirmed = true;
        const confirmed = snapshot(config, order.id);
        await expectFailure(config.role, config.domain, "close_outsourcing_order", { id: order.id, expected_version: confirmed.header.version, idempotency_key: `${prefix}:${flow.key}:incomplete-close`, close_mode: "normal" }, CODE.BUSINESS_RULE_VIOLATION);
        assert.deepEqual(snapshot(config, order.id), confirmed);
        flow.incompleteCloseBlocked = true;
        await expectFailure("warehouse", config.domain, "cancel_outsourcing_order", { id: order.id, expected_version: confirmed.header.version, idempotency_key: `${prefix}:${flow.key}:forbidden-cancel`, reason: "越权取消" }, CODE.PERMISSION_DENIED);
        assert.deepEqual(snapshot(config, order.id), confirmed);
        const cancel = { id: order.id, expected_version: confirmed.header.version, idempotency_key: `${prefix}:${flow.key}:cancel`, reason: "模拟取消无事实的未履行合同" };
        await client.rpc(config.role, config.domain, "cancel_outsourcing_order", cancel);
        const canceled = snapshot(config, order.id);
        assert.equal(canceled.header.lifecycle_status, "canceled");
        await client.rpc(config.role, config.domain, "cancel_outsourcing_order", cancel);
        assert.deepEqual(snapshot(config, order.id), canceled);
        await expectFailure(config.role, config.domain, "confirm_outsourcing_order", { id: order.id, expected_version: canceled.header.version, idempotency_key: `${prefix}:${flow.key}:terminal` }, CODE.BUSINESS_RULE_VIOLATION);
        assert.deepEqual(snapshot(config, order.id), canceled);
        flow.terminalGuard = true;
      }
      flow.factsUnchanged = true;
      assert.deepEqual(facts(), beforeFacts);
      await activePage.screenshot({ path: path.join(options.outputDir, `${flow.key}.png`), fullPage: false });
      flow.passed = true;
    }
    for (const mobile of [false, true]) {
      const surface = mobile ? "mobile" : "desktop";
      const entry = { surface, preparationSurface: "desktop" };
      report.engineering.push(entry);
      const label = `${prefix}-${mobile ? "M" : "D"}-ENGINEERING`;
      const { material: engineeringMaterial } = await client.rpc("admin", "masterdata", "create_material", { code: `${label}-MAT`, name: "模拟用料审批材料", default_unit_id: material.default_unit_id, supplier_id: supplier.id });
      const { product: engineeringProduct } = await client.rpc("admin", "masterdata", "create_product", { code: `${label}-PROD`, name: "模拟用料审批产品", default_unit_id: material.default_unit_id });
      let bom = (await client.rpc("engineering", "bom", "save_bom_with_items", { product_id: engineeringProduct.id, version: `${label}-BOM`, items: [{ material_id: engineeringMaterial.id, unit_id: material.default_unit_id, quantity: "1", loss_rate: "0", position: "模拟面料" }] })).bom_version;
      bom = (await client.rpc("engineering", "bom", "activate_bom_version", { id: bom.id })).bom_version;
      const { sales_order: source } = await client.rpc("sales", "sales_order", "save_sales_order_with_items", { order_no: `${label}-SO`, order_date: new Date().toISOString().slice(0, 10), customer_id: customer.id, currency: "CNY", payment_method: "银行转账", payment_term_days: 0, tax_mode: "NONE", freight_terms: "INCLUDED", items: [{ line_no: 1, product_id: engineeringProduct.id, unit_id: material.default_unit_id, ordered_quantity: "2", unit_price: "3.5", amount: "7" }] });
      await advanceSalesOrderLifecycleThroughProcess({ plan: { backendURL: options.backendURL, runId: options.runID }, record: { order_no: source.order_no, targetStatus: "ACTIVE" }, item: source, token: client.roleTokens().admin, roleTokens: client.roleTokens(), fetchImpl: fetch, report: { steps: [] } });
      await prepareManualAcceptanceEngineering({ plan: { prefix: "SIM-E2E", productionCandidates: [{ salesOrder: { id: source.id, orderNo: source.order_no } }] }, sourceReport: { referenceRecords: { products: [engineeringProduct], bomVersions: [{ id: bom.id, version: bom.version, productId: engineeringProduct.id, status: "ACTIVE" }] } }, materialMode: "preview", rpc: ({ actor, domain, method, params }) => client.rpc(actor, domain, method, params) });
      const getRequest = () => client.rpc("engineering", "sales_order", "get_engineering_material_request", { sales_order_id: source.id });
      const preview = await getRequest();
      assert.equal(preview.status, "SUBMITTED");
      const countRequests = () => client.query(`SELECT to_json(count(*)) FROM engineering_material_requests WHERE sales_order_id=${source.id}`);
      assert.equal(countRequests(), 1);
      await expectFailure("engineering", "sales_order", "submit_engineering_material_request", { sales_order_id: source.id, expected_version: preview.source_order_version, expected_source_hash: "0".repeat(64) }, CODE.RESOURCE_VERSION_CONFLICT);
      assert.equal(countRequests(), 1);
      entry.staleSourceRejected = true;
      const openMaterial = async actor => {
        const page = await getPage(actor, mobile && actor !== "engineering");
        if (mobile && actor !== "engineering") {
          const current = await getRequest();
          const group = actor === "boss" ? "engineering_material_boss_review" : "engineering_material_finance_review";
          const { tasks } = await client.rpc(actor, "workflow", "list_tasks", {
            source_type: "engineering_material_request", source_id: current.id, limit: 100,
          });
          const candidates = tasks.filter(task => task.task_group === group && task.owner_role_key === actor && getEngineeringMaterialTaskContext(task)?.requestID === current.id);
          assert.equal(candidates.length, 1, "engineering approval must use its authoritative source task");
          const [task] = candidates;
          (entry.approvalTasks ??= []).push({ actor, taskID: task.id, requestID: current.id, group: task.task_group, status: task.task_status_key });
          await navigate(page, `${options.baseURL}/m/${actor}/tasks`);
          const actionScreen = page.getByTestId("mobile-task-action-screen");
          if (await actionScreen.isVisible()) await actionScreen.getByRole("button", { name: "返回任务详情", exact: true }).click();
          const receipt = page.getByTestId("mobile-task-receipt-screen");
          if (await receipt.isVisible()) await receipt.getByRole("button", { name: "返回任务列表", exact: true }).first().click();
          else if (await page.getByTestId("mobile-task-detail-screen").isVisible()) await page.getByTestId("mobile-task-detail-screen").getByRole("button", { name: "返回任务列表", exact: true }).click();
          await page.getByTestId("mobile-role-nav-tasks").click();
          await page.getByLabel("任务状态", { exact: true }).getByText(["done", "withdrawn", "cancelled"].includes(task.task_status_key) ? "已办" : "待办", { exact: true }).click();
          await page.getByRole("searchbox").fill(source.order_no);
          await page.getByRole("searchbox").press("Enter");
          await openMobileTaskCard(page, task.id);
          const detail = page.getByTestId("mobile-task-detail-screen");
          await expect(detail).toBeVisible();
          if (task.task_status_key !== "ready") {
            await detail.getByRole("button", { name: "查看材料汇总", exact: true }).click();
            const dialog = page.locator('.erp-material-summary-modal:visible');
            await expect(dialog).toBeVisible();
            return { page, dialog, readonlyTask: true };
          }
          await detail.getByRole("button", { name: "处理任务", exact: true }).click();
          const dialog = page.getByTestId("mobile-task-action-screen");
          await expect(dialog.locator('.erp-material-task-action__footer')).toBeVisible();
          return { page, dialog, taskForm: true };
        }
        await navigate(page, businessURL({ ...options, mobile: false }, actor, BUSINESS_ROUTE_PATHS.salesOrders.replace(/^\/erp\//u, "")));
        const search = page.locator('.erp-business-operation-panel input[placeholder]').first();
        await search.fill(source.order_no);
        await search.press("Enter");
        await selectRow(page, source.id);
        await pageAction(page, actor === "engineering" ? "提交用料汇总" : "审核用料汇总");
        const dialog = page.locator('.erp-material-summary-modal:visible');
        await expect(dialog).toBeVisible();
        return { page, dialog };
      };
      const closeMaterial = async ui => {
        if (ui.readonlyTask) {
          await ui.dialog.locator('.ant-modal-close').click();
          return;
        }
        if (!ui.taskForm) {
          await ui.dialog.getByRole("button", { name: "关闭", exact: true }).click();
          return;
        }
        const receipt = ui.page.getByTestId("mobile-task-receipt-screen");
        if (await receipt.isVisible()) await receipt.getByRole("button", { name: "返回任务列表", exact: true }).first().click();
        else {
          await ui.page.getByTestId("mobile-task-action-screen").getByRole("button", { name: "返回任务详情", exact: true }).click();
          await ui.page.getByTestId("mobile-task-detail-screen").getByRole("button", { name: "返回任务列表", exact: true }).click();
        }
        await expect(ui.page.getByTestId("mobile-role-task-list")).toBeVisible();
      };
      const reviewButton = async (ui, decision) => {
        if (ui.taskForm) await ui.dialog.getByRole("radio", { name: decision === "reject" ? "退回工程" : "审批通过", exact: true }).check();
        return ui.dialog.getByRole("button", { name: decision === "reject" ? ui.taskForm ? "确认退回工程" : "退回工程" : ui.taskForm ? "确认通过，交财务" : "审核通过，交财务", exact: true });
      };
      let ui;
      let request = await getRequest();
      assert.equal(request.status, "SUBMITTED");
      const submitted = structuredClone(request);
      await expectFailure("finance", "sales_order", "boss_review_engineering_material_request", { id: request.id, expected_version: request.version, action: "BOSS_APPROVE" }, CODE.PERMISSION_DENIED);
      await expectFailure("finance", "sales_order", "finance_review_engineering_material_request", { id: request.id, expected_version: request.version, action: "FINANCE_APPROVE" }, CODE.BUSINESS_RULE_VIOLATION);
      assert.deepEqual(await getRequest(), submitted);
      entry.permissionDenied = entry.approvalOrdered = true;
      ui = await openMaterial("boss");
      const beforeReject = report.browserRPC.filter(call => call.method === "boss_review_engineering_material_request").length;
      const reject = await reviewButton(ui, "reject");
      await reject.click();
      await expect(ui.dialog.getByText("请填写退回原因", { exact: true })).toBeVisible();
      assert.equal(report.browserRPC.filter(call => call.method === "boss_review_engineering_material_request").length, beforeReject);
      assert.equal((await getRequest()).status, "SUBMITTED");
      await ui.dialog.locator("textarea").fill("模拟退回：补充用料核对说明");
      await clickRPC(ui.page, "boss_review_engineering_material_request", () => reject.click());
      await closeMaterial(ui);
      assert.equal((await getRequest()).status, "REJECTED");
      entry.rejectReasonRequired = true;
      await prepareManualAcceptanceEngineering({ plan: { prefix: "SIM-E2E", productionCandidates: [{ salesOrder: { id: source.id, orderNo: source.order_no } }] }, sourceReport: { referenceRecords: { products: [engineeringProduct], bomVersions: [{ id: bom.id, version: bom.version, productId: engineeringProduct.id, status: "ACTIVE" }] } }, materialMode: "preview", rpc: ({ actor, domain, method, params }) => client.rpc(actor, domain, method, params) });
      request = await getRequest();
      assert.equal(request.status, "SUBMITTED");
      assert.notEqual(request.id, submitted.id);
      assert.equal(countRequests(), 2);
      entry.rejectedResubmitted = true;
      ui = await openMaterial("boss");
      const approve = await reviewButton(ui, "approve");
      await clickRPC(ui.page, "boss_review_engineering_material_request", () => approve.click());
      await closeMaterial(ui);
      assert.equal((await getRequest()).status, "BOSS_APPROVED");
      const purchasesBefore = client.query("SELECT to_json(count(*)) FROM purchase_orders");
      ui = await openMaterial("finance");
      const fault = await dropRealResponse(ui.page, options, "sales_order", "finance_review_engineering_material_request");
      await ui.dialog.getByRole("button", { name: "批准并生成采购订单", exact: true }).click();
      await expect.poll(() => Boolean(fault.state.captured)).toBe(true);
      await fault.remove();
      entry.financeFault = faultEvidence(fault.state);
      if (!ui.taskForm) await expect(ui.dialog.getByRole("button", { name: "关闭", exact: true })).toBeEnabled();
      await closeMaterial(ui);
      ui = await openMaterial("finance");
      const approved = await getRequest();
      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.purchase_orders.length, 1);
      assert.equal(client.query("SELECT to_json(count(*)) FROM purchase_orders"), purchasesBefore + 1);
      const generatedID = approved.purchase_orders[0].id;
      assert.ok(Number.isSafeInteger(generatedID) && generatedID > 0);
      const generated = snapshot(configs.purchase, generatedID);
      assert.equal(generated.header.engineering_material_request_id, approved.id);
      assert.equal(generated.header.supplier_id, supplier.id);
      assert.equal(generated.header.lifecycle_status, "approved");
      assert.equal(generated.items.length, 1);
      assert.equal(generated.items[0].material_id, engineeringMaterial.id);
      assert.equal(generated.items[0].unit_id, material.default_unit_id);
      assert.equal(Number(generated.items[0].purchased_quantity), 2);
      assert.equal(generated.items[0].unit_price, null);
      assert.equal(generated.items[0].amount, null);
      entry.purchaseSourceVerified = true;
      await expect(ui.dialog.getByRole("button", { name: "批准并生成采购订单", exact: true })).toHaveCount(0);
      const purchaseSnapshot = client.query("SELECT to_json(md5(json_agg(p ORDER BY id)::text)) FROM purchase_orders p");
      await client.rpc("finance", "sales_order", "finance_review_engineering_material_request", fault.state.params);
      assert.deepEqual(await getRequest(), approved);
      assert.equal(client.query("SELECT to_json(md5(json_agg(p ORDER BY id)::text)) FROM purchase_orders p"), purchaseSnapshot);
      await expectFailure("finance", "sales_order", "finance_review_engineering_material_request", { ...fault.state.params, note: "模拟同一审批回执改变意见" }, CODE.RESOURCE_VERSION_CONFLICT);
      assert.deepEqual(snapshot(configs.purchase, generatedID), generated);
      assert.deepEqual(await getRequest(), approved);
      entry.changedReviewRejected = true;
      entry.purchaseOrders = 1;
      entry.financeRecovered = entry.replayExact = true;
      await settleRPCPage(ui.page);
      await ui.page.screenshot({ path: path.join(options.outputDir, `${surface}_engineering.png`), fullPage: false, animations: "disabled" });
      await closeMaterial(ui);
      assert.deepEqual(facts(), beforeFacts);
      entry.factsUnchanged = entry.passed = true;
    }
    for (const { page, context } of sessions.values()) await closePage(page, context);
    sessions.clear();
    report.unexpectedRPC = report.browserRPC.filter(call => call.http !== 200 || (call.code !== 0 && !report.expectedFailures.some(expected => expected.browser && expected.method === call.method && expected.code === call.code && expected.actor === call.role)));
    report.fixtureRPC = client.calls;
    report.factsAfter = facts();
    assertSourceOrderEvidence(report);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack;
    if (activePage) await captureFailure(activePage, options, report, error);
    throw error;
  } finally {
    await browser?.close();
    report.fixtureRPC = client.calls;
    await fs.writeFile(path.join(options.outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}

if (process.argv[1] && pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv[2], "--environment");
  assert.equal(process.argv.length, 4);
  await run(JSON.parse(await fs.readFile(process.argv[3], "utf8")));
}
