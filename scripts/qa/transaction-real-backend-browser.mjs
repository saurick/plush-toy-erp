#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  businessURL,
  flowKey,
  openMobileTaskCard,
  openMobileTaskList,
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
import { resolveMobileActionLabel } from "../../web/src/erp/mobile/utils/mobileRoleTaskModel.mjs";
import { workflowTaskActionRequiresReason } from "../../web/src/erp/utils/workflowTaskActionContract.mjs";
import { waitForFiniteAnimations } from "../../web/scripts/style-l1/browserReadiness.mjs";
import { correctQualityThroughBrowser } from "./transaction-quality-correction-browser.mjs";
import { assertRequestCancellationEvidence, runRequestCancellationBrowser } from './transaction-request-cancellation-browser.mjs';
import {
  captureTransactionFlowFields,
  captureTransactionFieldResults,
  assertFlowFieldAuditEvidence,
} from "./transaction-flow-fields-browser.mjs";
import {
  productionShipmentFlow,
  assertProductionShipmentEvidence,
} from "./transaction-production-shipment-browser.mjs";
import {
  createTransactionClient,
  prepareTransactionFixture,
  prepareTransactionPurchase,
  prepareTransactionReceivable,
  prepareTransactionSalesOrder,
  postTransactionInventoryCount,
} from "./transaction-real-backend-fixture.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const { expect } = require("playwright/test");

export const TRANSACTION_FLOW_KEYS = Object.freeze([
  "quality",
  "inventory",
  "production",
  "shipment",
  "mobile_production",
  "mobile_shipment",
  "finance_disbursement",
  "finance_receipt",
  "finance_receivable",
  "refund_customer",
  "refund_customer_full",
  "refund_source_customer",
  "refund_supplier",
  "refund_supplier_full",
  "refund_source_supplier",
  "mobile_quality",
  "mobile_inventory",
  "mobile_finance_disbursement",
  "mobile_finance_receivable",
  "mobile_refund_customer",
  "mobile_refund_customer_full",
  "mobile_refund_source_customer",
  "mobile_refund_supplier",
  "mobile_refund_supplier_full",
  "mobile_refund_source_supplier",
]);

export function assertTransactionBrowserReport(report) {
  assertRequestCancellationEvidence(report.requestCancellation);
  assertFlowFieldAuditEvidence(report.fieldAudit);
  assert.equal(report.fieldResults.optionalColumnsRestored, true);
  assert.equal(report.fieldResults.detailsPreserved, true);
  assert.deepEqual(
    report.fieldResults.exports.map(({ key }) => key),
    ["quality", "payments"],
  );
  assert.deepEqual(
    report.fieldResults.pages.map(({ key }) => key),
    [
      "quality-populated",
      "quality-all-columns",
      "quality-restored",
      "payments-populated",
      "payments-all-columns",
      "payments-restored",
      "payment-details",
      "inventory-populated",
    ],
  );
  assert.deepEqual(
    report.flows.map(({ key }) => key),
    TRANSACTION_FLOW_KEYS,
  );
  assert.ok(report.flows.every(({ passed }) => passed === true));
  assert.ok(
    report.browserRPC.length > 0,
    "zero browser RPC execution is not a pass",
  );
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(
    report.browserRPC.filter((call) => call.code !== 0 || call.http !== 200),
    [],
  );
  for (const flow of report.flows.filter(({ key }) => key.endsWith('inventory'))) {
    assert.equal(flow.draftSurface, 'desktop browser');
    assert.equal(flow.postSurface, 'desktop browser');
    if (flow.key === 'mobile_inventory') {
      assert.equal(flow.completedInboundReadOnly, true);
      assert.equal(flow.mobileAdjustmentUnavailable, true);
    }
  }
  for (const flow of report.flows.filter(({ key }) => /^(?:mobile_)?(?:finance_|refund_)/u.test(key))) {
    const mobile = flow.key.startsWith('mobile_');
    assert.equal(flow.registrationSurface, 'desktop browser');
    assert.equal(flow.postSurface, 'desktop browser');
    assert.equal(flow.approvalSurface, mobile ? 'mobile task' : 'desktop browser');
    assert.equal(flow.reversalSurface, 'desktop browser');
    if (mobile) assert.equal(flow.completedTaskReadOnly, true);
  }
  for (const flow of report.flows.filter(
    ({ key }) => !key.endsWith("quality"),
  )) {
    assert.equal(flow.transportFault.injected, true);
    assert.equal(
      flow.transportFault.backendCode,
      0,
      "fault injection must follow a real successful backend mutation",
    );
  }
  for (const flow of report.flows.filter(({ key }) => key.endsWith("quality"))) {
    assert.equal(flow.correctionSurface, "real browser");
    assert.equal(flow.correctionCreatedInBrowser, true);
    assert.equal(flow.correctionReasonRequired, true);
    assert.equal(flow.correctionReplayAfterDecisionExact, true);
    assert.equal(flow.transportFaults.length, 1);
    assert.equal(flow.transportFaults[0].method, "correct_quality_inspection_result");
    assert.equal(flow.transportFaults[0].injected, true);
    assert.equal(flow.transportFaults[0].backendCode, 0);
    assert.ok(flow.transportFaults[0].requestID);
  }
  assert.equal(
    report.mobileTasks?.length,
    8,
    "all mobile payment approvals must run",
  );
  assert.ok(report.mobileTasks.every(({ confirmed }) => confirmed === true));
  assert.equal(
    new Set(report.mobileTasks.map(({ taskID }) => taskID)).size,
    8,
  );
  const payments = new Map();
  for (const { paymentID, role, taskID } of report.mobileTasks) {
    assert.ok(Number.isSafeInteger(taskID) && taskID > 0);
    assert.ok(Number.isSafeInteger(paymentID) && paymentID > 0);
    const roles = payments.get(paymentID) ?? [];
    roles.push(role);
    payments.set(paymentID, roles);
  }
  assert.equal(payments.size, 8);
  for (const roles of payments.values())
    assert.deepEqual(roles, ["boss"]);
  assert.equal(report.mobileDesktopTasks?.length, 8);
  assert.equal(new Set(report.mobileDesktopTasks.map(item => item.taskID)).size, 8);
  assert.deepEqual(report.mobileDesktopTasks.map(item => item.paymentID).sort((a, b) => a - b), [...payments.keys()].sort((a, b) => a - b));
  for (const item of report.mobileDesktopTasks) {
    assert.equal(item.role, 'finance');
    assert.equal(item.unchanged, true);
    assert.ok(Number.isSafeInteger(item.taskID) && item.taskID > 0);
  }
  assertProductionShipmentEvidence(report);
}

async function verifyMobileDesktopTask(page, options, client, task) {
  const role = task.owner_role_key;
  assert.equal(task.task_status_key, 'ready');
  await openMobileTaskList(page, options, role);
  await page.getByLabel('任务状态', { exact: true }).getByText('待办', { exact: true }).click();
  await page.getByRole('searchbox').fill(task.source_no);
  await page.getByRole('searchbox').press('Enter');
  await openMobileTaskCard(page, task.id);
  await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '查看办理资料', exact: true }).click();
  const review = page.getByTestId('mobile-task-desktop-review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('请在电脑办理');
  await expect(review.getByRole('button', { name: /确认完成|过账|核销|确认实际收付/u })).toHaveCount(0);
  const { task: current } = await client.rpc(role, 'workflow', 'get_task', { task_id: task.id });
  assert.equal(current.version, task.version);
  assert.equal(current.task_status_key, 'ready');
  await page.screenshot({ path: path.join(options.outputDir, `mobile-desktop-required-${task.id}.png`), fullPage: true });
}

export async function completePaymentTask(
  browser,
  options,
  client,
  payment,
  role,
  report,
) {
  const { tasks } = await client.rpc(role, "workflow", "list_tasks", {
    source_type: "finance_payment",
    source_id: payment.id,
    limit: 50,
  });
  const task = tasks.find(
    (item) => item.owner_role_key === role && item.task_status_key === "ready",
  );
  assert.ok(task, `${role} must have an active task for this payment`);
  if (options.mobile && role === 'finance') {
    const phone = await login(browser, options, role, report);
    try { await verifyMobileDesktopTask(phone.page, options, client, task); }
    finally { await closePage(phone.page, phone.context); }
    (report.mobileDesktopTasks ??= []).push({ taskID: task.id, paymentID: payment.id, role, unchanged: true });
  }
  const taskOptions = { ...options, mobile: options.mobile && role === 'boss' };
  const { page, context } = await login(browser, taskOptions, role, report);
  try {
    if (taskOptions.mobile) {
      await navigate(page, `${options.baseURL}/m/${role}/tasks`);
      const search = page.getByRole("searchbox");
      await search.fill(payment.payment_no);
      await search.press("Enter");
      await openMobileTaskCard(page, task.id);
      const detail = page.getByTestId("mobile-task-detail-screen");
      await expect(detail).toBeVisible();
      await expect(
        detail.getByTestId("mobile-task-attachment-action"),
      ).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "选择处理方式", exact: true }),
      ).toBeVisible();
      await settleRPCPage(page);
      await waitForFiniteAnimations(page, { selector: ".mobile-role-action-bar" });
      const entryLayout = await detail.evaluate((element) => ({
        width: window.innerWidth,
        height: window.innerHeight,
        document: document.documentElement.scrollWidth,
        buttons: [
          ...element.querySelectorAll(".mobile-role-action-bar button"),
        ].map((button) => {
          const box = button.getBoundingClientRect();
          return {
            label: button.textContent.trim(),
            x: box.x,
            y: box.y,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        }),
      }));
      assert.equal(entryLayout.width, 390);
      assert.ok(entryLayout.document <= entryLayout.width + 1);
      assert.equal(entryLayout.buttons.length, 2);
      assert.ok(
        entryLayout.buttons.every(
          (button) =>
            button.height >= 44 &&
            button.x >= 0 &&
            button.right <= entryLayout.width &&
            button.y >= 0 &&
            button.bottom <= entryLayout.height,
        ),
      );
      assert.equal(entryLayout.buttons[0].label, "添加附件");
      assert.equal(entryLayout.buttons[1].label, "选择处理方式");
      const [attachmentButton, processButton] = entryLayout.buttons;
      assert.equal(attachmentButton.y, processButton.y, JSON.stringify(entryLayout));
      assert.equal(attachmentButton.height, processButton.height, JSON.stringify(entryLayout));
      assert.ok(processButton.width > attachmentButton.width, JSON.stringify(entryLayout));
      assert.ok(attachmentButton.width <= entryLayout.width / 2);
      assert.equal(attachmentButton.x, 12);
      assert.equal(processButton.right, entryLayout.width - 12);
      assert.equal(processButton.x - attachmentButton.right, 8, JSON.stringify(entryLayout));
      await page.screenshot({
        path: path.join(
          options.outputDir,
          `mobile-task-entry-${role}-${payment.id}.png`,
        ),
      });
      await detail
        .getByRole("button", { name: "选择处理方式", exact: true })
        .click();
      const action = page.getByTestId("mobile-task-action-screen");
      await expect(action).toBeVisible();
      const label =
        role === "boss" ? "审批通过" : resolveMobileActionLabel("done");
      const choice = action.getByRole("radio", { name: label, exact: true });
      if (await choice.count()) await choice.check();
      else
        await expect(
          action
            .getByTestId("mobile-task-single-action-summary")
            .getByText(label, { exact: true }),
        ).toBeVisible();
      const submit = action.getByRole("button", {
        name: `确认${label}`,
        exact: true,
      });
      const reasonLabel = role === "boss" ? "审批意见" : "完成反馈";
      const reasonRequired = workflowTaskActionRequiresReason(task, 'complete');
      if (reasonRequired) {
        await submit.click();
        await expect(action.getByText(`${reasonLabel}为必填项`, { exact: true })).toBeVisible();
      }
      const before = (
        await client.rpc(role, "workflow", "get_task", { task_id: task.id })
      ).task;
      assert.equal(before.task_status_key, "ready");
      assert.equal(before.version, task.version);
      const reasonInput = action.getByRole("textbox", {
        name: reasonLabel,
        exact: true,
      });
      if (reasonRequired) {
        await expect(reasonInput).toBeFocused();
        await expect(reasonInput).toHaveAttribute("aria-invalid", "true");
      }
      await reasonInput.fill("模拟手机核对收付款来源与审批结果");
      await clickRPC(page, "complete_task_action", () => submit.click());
      await expect(
        page.getByTestId("mobile-task-receipt-screen"),
      ).toBeVisible();
      const completed = (
        await client.rpc(role, "workflow", "get_task", { task_id: task.id })
      ).task;
      assert.equal(completed.task_status_key, "done");
      assert.equal(completed.version, task.version + 1);
      report.mobileTasks.push({
        role,
        taskID: task.id,
        paymentID: payment.id,
        confirmed: true,
        entryLayout,
      });
      await page.screenshot({
        path: path.join(
          options.outputDir,
          `mobile-task-${role}-${payment.id}.png`,
        ),
        fullPage: true,
      });
      return;
    }
    await navigate(page, `${options.baseURL}/erp/task-board`);
    const search = page.getByPlaceholder("订单 / 产品 / 物料 / 款号", {
      exact: true,
    });
    await search.fill(payment.payment_no);
    await search.press("Enter");
    await openDesktopTaskRow(page, task, payment.payment_no);
    const drawer = page.locator(".erp-task-action-drawer:visible");
    await drawer
      .getByRole("button", { name: "任务办理", exact: true })
      .click();
    if (role === "finance") {
      await expect(drawer.getByTestId("mobile-task-fact-form")).toBeVisible();
      await pageAction(drawer, "任务协作");
    }
    await drawer
      .getByRole("radio")
      .filter({ hasText: role === "boss" ? "审批通过" : "处理完成" })
      .click();
    if (role === "boss")
      await drawer.locator("textarea").fill("模拟核对收付款来源和金额");
    await drawer
      .getByRole("button", { name: "核对并确认", exact: true })
      .click();
    await clickRPC(page, "complete_task_action", () =>
      drawer
        .locator("button:visible")
        .filter({ hasText: role === "boss" ? /^确认通过$/u : /^确认完成$/u })
        .click(),
    );
    const { task: completed } = await client.rpc(role, "workflow", "get_task", {
      task_id: task.id,
    });
    assert.equal(completed.task_status_key, "done");
    assert.equal(completed.version, task.version + 1);
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  } finally {
    await closePage(page, context);
  }
}

async function openFinancePayment(page, options, client, paymentID) {
  if (options.mobile) {
    const { tasks } = await client.rpc('finance', 'workflow', 'list_tasks', { source_type: 'finance_payment', source_id: paymentID, limit: 100 });
    const own = tasks.filter((task) => task.owner_role_key === 'finance');
    assert.equal(own.length, 1);
    await openMobileSourceTask(page, options, client, 'finance', 'finance_payment', paymentID, [own[0].task_group]);
  } else await navigate(page, businessURL(options, 'finance', 'finance/payments'));
  await selectRow(page, paymentID);
}

async function verifyCompletedPaymentTask(browser, options, client, paymentID, report) {
  const { page, context } = await login(browser, options, 'finance', report);
  try {
    const { tasks } = await client.rpc('finance', 'workflow', 'list_tasks', { source_type: 'finance_payment', source_id: paymentID, limit: 100 });
    const own = tasks.filter(task => task.owner_role_key === 'finance');
    assert.equal(own.length, 1);
    assert.equal(own[0].task_status_key, 'done');
    await openMobileTaskList(page, options, 'finance');
    await page.getByLabel('任务状态', { exact: true }).getByText('已办', { exact: true }).click();
    await page.getByRole('searchbox').fill(own[0].source_no);
    await page.getByRole('searchbox').press('Enter');
    await openMobileTaskCard(page, own[0].id);
    await expect(page.getByTestId('mobile-task-detail-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(确认实际收付|选择应收 \/ 应付核销|冲销收付款|登记实际退款)$/u })).toHaveCount(0);
  } finally { await closePage(page, context); }
}

export async function financeFlow(
  browser,
  options,
  client,
  fixture,
  report,
  direction,
  scenario = {},
) {
  const advance =
    (scenario.kind || (direction === "RECEIPT" ? "ADVANCE" : "SETTLEMENT")) ===
    "ADVANCE";
  const receipt = direction === "RECEIPT";
  const advanceAmount = scenario.amount ?? 20;
  const advanceSourceType = receipt ? "sales_order" : scenario.sourceType || "purchase_order";
  const advanceSource = receipt ? fixture.salesOrder : scenario.source || fixture.order;
  if (advance) assert.ok(["sales_order", "purchase_order", "outsourcing_order"].includes(advanceSourceType));
  const key = flowKey(
    options,
    scenario.key || `finance_${direction.toLowerCase()}`,
  );
  const entrySession = await login(browser, { ...options, mobile: false }, "finance", report);
  let page = entrySession.page;
  const followupOptions = { ...options, mobile: false };
  const paymentNo = `${fixture.prefix}-${scenario.suffix || (advance ? "RECEIPT" : "PAYMENT")}`;
  let fact = scenario.fact;
  if (!advance && !fact) {
    fact = (
      await client.rpc(
        "finance",
        "operational_fact",
        "create_payable_from_purchase_receipt",
        {
          purchase_receipt_id: fixture.receipt.id,
          fact_no: `${fixture.prefix}-AP`,
          idempotency_key: `${fixture.prefix}:ap`,
        },
      )
    ).finance_fact;
    fact = (
      await client.rpc("finance", "operational_fact", "post_finance_fact", {
        id: fact.id,
        expected_version: fact.version,
      })
    ).finance_fact;
    assert.equal(fact.status, "POSTED");
    assert.equal(Number(fact.amount), 35);
  }
  const paymentRow = (id) =>
    client.query(
      `SELECT json_build_object('status',status,'version',version,'direction',direction,'kind',kind,'amount',amount,'distinctActors',approved_by<>created_by,'posted',posted_at IS NOT NULL,'reversed',reversed_at IS NOT NULL,'allocations',(SELECT count(*) FROM finance_allocations WHERE payment_id=${id}),'netAllocated',(SELECT COALESCE(sum(CASE WHEN reversal_of_allocation_id IS NULL THEN amount ELSE -amount END),0) FROM finance_allocations WHERE payment_id=${id})) FROM finance_payments WHERE id=${id}`,
    );
  try {
    await navigate(page, businessURL(followupOptions, "finance", "finance/payments"));
    await page.getByRole("button", { name: "登记收付款", exact: true }).click();
    const dialog = page.getByRole("region", {
      name: "登记收付款",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    if (advance)
      await selectOption(
        page,
        dialog.getByLabel("款项用途", { exact: true }),
        "订单预收 / 预付（首款、分期款、发货前尾款）",
      );
    await selectOption(
      page,
      dialog.getByLabel("收付款方向", { exact: true }),
      receipt ? "收款" : "付款",
    );
    await selectOption(
      page,
      dialog.getByLabel(receipt ? "客户" : "供应商", { exact: true }),
      new RegExp(receipt ? fixture.customer.name : fixture.supplier.name, "u"),
    );
    if (advance) {
      await selectOption(
        page,
        dialog.getByLabel("关联单据", { exact: true }),
        receipt ? "销售订单" : advanceSourceType === "outsourcing_order" ? "委外合同" : "采购订单",
      );
      await selectOption(
        page,
        dialog.getByLabel("订单 / 合同", { exact: true }),
        `${receipt ? advanceSource.order_no : advanceSourceType === "outsourcing_order" ? advanceSource.outsourcing_order_no : advanceSource.purchase_order_no} · CNY`,
      );
    } else
      await selectOption(
        page,
        dialog.getByLabel("币种", { exact: true }),
        "人民币（CNY）",
      );
    await dialog.getByLabel("收付款单号", { exact: true }).fill(paymentNo);
    await dialog.getByLabel("实收 / 实付金额", { exact: true }).fill("0");
    await dialog
      .getByLabel("收付款账户摘要", { exact: true })
      .fill("模拟银行账户");
    await dialog
      .getByLabel("业务凭据", { exact: true })
      .fill("模拟流水，不代表实际资金");
    const submit = dialog.getByRole("button", {
      name: "创建收付款记录",
      exact: true,
    });
    await submit.click();
    await expect(
      dialog.getByText("金额必须大于 0，最多六位小数", { exact: true }),
    ).toBeVisible();
    assert.equal(
      client.query(
        `SELECT to_json(count(*)) FROM finance_payments WHERE payment_no='${paymentNo}'`,
      ),
      0,
    );
    await dialog
      .getByLabel("实收 / 实付金额", { exact: true })
      .fill(String(advance ? advanceAmount : 35));
    const created = (
      await clickRPC(page, "create_finance_payment", () => submit.click())
    ).payment;
    assert.equal(created.status, "DRAFT");
    assert.equal(created.counterparty_id, receipt ? fixture.customer.id : fixture.supplier.id);
    assert.equal(created.direction, direction);
    assert.equal(created.kind, advance ? 'ADVANCE' : 'SETTLEMENT');
    if (advance) {
      assert.equal(created.source_type, advanceSourceType);
      assert.equal(created.source_id, advanceSource.id);
    }
    await expect(dialog).toBeHidden();
    await completePaymentTask(
      browser,
      options,
      client,
      created,
      "boss",
      report,
    );
    assert.equal(paymentRow(created.id).status, "APPROVED");
    await completePaymentTask(
      browser,
      options,
      client,
      created,
      "finance",
      report,
    );
    assert.equal(
      paymentRow(created.id).status,
      "APPROVED",
      "task completion must not post funds",
    );
    assert.equal(paymentRow(created.id).posted, false);
    await openFinancePayment(page, followupOptions, client, created.id);
    if (!advance) {
      await pageAction(page, "选择应收 / 应付核销");
      const allocation = await modal(page, "选择核销记录");
      const amount = allocation.locator(
        'input[inputmode="decimal"]:not([disabled])',
      );
      await expect(amount).toHaveCount(1);
      await amount.fill("36");
      await allocation
        .getByRole("button", { name: "过账并核销", exact: true })
        .click();
      await expect(
        page.getByText(`${fact.fact_no}的本次核销金额超过未核销金额`, {
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(paymentRow(created.id).status, "APPROVED");
      assert.equal(paymentRow(created.id).allocations, 0);
      await amount.fill("35");
    }
    const lost = await dropRealResponse(
      page,
      options,
      "customer_config",
      "execute_finance_payment_post",
    );
    if (advance) await pageAction(page, "确认实际收付");
    else
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "过账并核销", exact: true })
        .click();
    await expect(
      page.getByText(
        advance ? "已重新读取实际收付结果" : "已重新读取收付款过账与核销结果",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(lost.state.backendCode, 0);
    await lost.remove();
    const posted = paymentRow(created.id);
    assert.equal(posted.status, "POSTED");
    assert.equal(posted.kind, advance ? "ADVANCE" : "SETTLEMENT");
    assert.equal(posted.direction, direction);
    assert.equal(Number(posted.amount), advance ? advanceAmount : 35);
    assert.equal(posted.distinctActors, true);
    assert.equal(posted.posted, true);
    assert.equal(posted.allocations, advance ? 0 : 1);
    assert.equal(posted.netAllocated, advance ? 0 : 35);
    const readback = (
      await client.rpc("finance", "operational_fact", "get_finance_payment", {
        id: created.id,
      })
    ).payment;
    assert.equal(Number(readback.available_amount), advance ? advanceAmount : 0);
    if (fact)
      assert.equal(
        client.query(
          `SELECT to_json(status) FROM finance_facts WHERE id=${fact.id}`,
        ),
        "SETTLED",
      );
    await client.rpc(
      "finance",
      "customer_config",
      "execute_finance_payment_post",
      lost.state.params,
    );
    assert.deepEqual(
      paymentRow(created.id),
      posted,
      "lost response replay must not double post or allocate",
    );
    if (options.mobile) await verifyCompletedPaymentTask(browser, options, client, created.id, report);
    if (scenario.refund) {
      for (const amount of [7.25, 20]) {
        await openFinancePayment(page, followupOptions, client, created.id);
        await refundFlow(
          browser,
          options,
          client,
          fixture,
          report,
          created,
          page,
          amount,
        );
      }
      const restored = (
        await client.rpc("finance", "operational_fact", "get_finance_payment", {
          id: created.id,
        })
      ).payment;
      assert.equal(Number(restored.available_amount), 20);
      assert.equal(Number(restored.refunded_amount), 0);
      assert.deepEqual(
        paymentRow(created.id),
        { ...posted, version: posted.version + 4 },
        "refund posting and reversal each advance the original payment version",
      );
      await openFinancePayment(page, followupOptions, client, created.id);
    }
    const beforeReverse = paymentRow(created.id);
    const reason = "模拟冲销恢复余额";
    assert.equal(
      (
        await client.raw(
          "sales",
          "operational_fact",
          "reverse_finance_payment",
          { id: created.id, expected_version: beforeReverse.version, reason },
        )
      ).code,
      40304,
    );
    assert.deepEqual(paymentRow(created.id), beforeReverse);
    await pageAction(page, "冲销收付款");
    const reverse = await modal(page, "冲销收付款");
    await reverse.getByLabel("冲销原因", { exact: true }).fill(reason);
    await clickRPC(page, "reverse_finance_payment", () =>
      reverse.getByRole("button", { name: "确认冲销", exact: true }).click(),
    );
    const reversed = paymentRow(created.id);
    assert.equal(reversed.status, "REVERSED");
    assert.equal(reversed.reversed, true);
    assert.equal(reversed.allocations, advance ? 0 : 2);
    assert.equal(reversed.netAllocated, 0);
    const reversedReadback = (
      await client.rpc("finance", "operational_fact", "get_finance_payment", {
        id: created.id,
      })
    ).payment;
    assert.equal(
      Number(reversedReadback.available_amount),
      0,
      "a reversed payment must expose no reusable funds",
    );
    if (fact) {
      const reopened = (
        await client.rpc("finance", "operational_fact", "list_finance_facts", {
          fact_type: fact.fact_type,
          keyword: fact.fact_no,
          limit: 100,
        })
      ).finance_facts.find(({ id }) => id === fact.id);
      assert.ok(reopened, "the reversed payable remains readable");
      assert.equal(reopened.status, "POSTED");
      assert.equal(Number(reopened.outstanding_amount), 35);
    }
    await client.rpc("finance", "operational_fact", "reverse_finance_payment", {
      id: created.id,
      expected_version: beforeReverse.version,
      reason,
    });
    assert.deepEqual(paymentRow(created.id), reversed);
    assert.equal(
      (
        await client.raw(
          "finance",
          "operational_fact",
          "reverse_finance_payment",
          {
            id: created.id,
            expected_version: beforeReverse.version,
            reason: "另一笔冲销意图",
          },
        )
      ).code,
      40920,
    );
    assert.deepEqual(paymentRow(created.id), reversed);
    report.flows.push({
      key,
      passed: true,
      paymentID: created.id,
      registrationSurface: 'desktop browser',
      postSurface: 'desktop browser',
      approvalSurface: options.mobile ? 'mobile task' : 'desktop browser',
      reversalSurface: 'desktop browser',
      ...(options.mobile ? { completedTaskReadOnly: true } : {}),
      posted,
      reversed,
      transportFault: faultEvidence(lost.state),
    });
    await page.screenshot({
      path: path.join(options.outputDir, `${key}.png`),
      fullPage: true,
    });
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  } finally {
    await closePage(entrySession.page, entrySession.context);
  }
}

async function refundFlow(
  browser,
  options,
  client,
  fixture,
  report,
  source,
  page,
  amount,
) {
  const party = source.direction === "RECEIPT" ? "customer" : "supplier";
  const key = flowKey(
    options,
    `refund_${party}${amount === 20 ? "_full" : ""}`,
  );
  const paymentNo = `${fixture.prefix}-RF-${party.toUpperCase()}-${amount === 20 ? "FULL" : "PART"}`;
  const sourceReadback = async () =>
    (
      await client.rpc("finance", "operational_fact", "get_finance_payment", {
        id: source.id,
      })
    ).payment;
  const refundRows = () =>
    client.query(
      `SELECT json_build_object('rows',count(*),'posted',count(*) FILTER (WHERE status='POSTED'),'amount',COALESCE(sum(amount) FILTER (WHERE status='POSTED'),0)) FROM finance_payments WHERE refund_of_payment_id=${source.id} AND payment_no='${paymentNo}'`,
    );
  await pageAction(page, "登记实际退款");
  const form = page.getByRole("region", { name: "登记收付款", exact: true });
  await expect(form).toBeVisible();
  await expect(form.getByLabel("款项用途", { exact: true })).toBeDisabled();
  await expect(form.getByLabel("收付款方向", { exact: true })).toBeDisabled();
  await expect(
    form.getByLabel(party === "customer" ? "客户" : "供应商", { exact: true }),
  ).toBeDisabled();
  await expect(form.getByLabel("退款原因", { exact: true })).toHaveValue("");
  await form.getByLabel("收付款单号", { exact: true }).fill(paymentNo);
  await expect(form.getByLabel("收付款单号", { exact: true })).toHaveValue(
    paymentNo,
  );
  await form.getByLabel("实收 / 实付金额", { exact: true }).fill("21");
  await form.getByLabel("收付款账户摘要", { exact: true }).fill("模拟退款账户");
  await form.getByLabel("业务凭据", { exact: true }).fill("模拟独立退款流水");
  const submit = form.getByRole("button", {
    name: "创建收付款记录",
    exact: true,
  });
  const writes = () =>
    report.browserRPC.filter(
      ({ method }) => method === "create_finance_payment",
    ).length;
  const before = writes();
  await expect(form.getByLabel("退款原因", { exact: true })).toHaveValue("");
  await submit.click();
  await expect(form.getByText("请填写退款原因", { exact: true })).toBeVisible();
  await expect(
    form.getByText("退款金额不能超过原款可用余额", { exact: true }),
  ).toBeVisible();
  assert.equal(writes(), before);
  assert.deepEqual(refundRows(), { rows: 0, posted: 0, amount: 0 });
  await assertMobileLayout(page, { ...options, mobile: false });
  await page.screenshot({
    path: path.join(options.outputDir, `${key}-validation.png`),
    fullPage: true,
  });
  await form
    .getByLabel("退款原因", { exact: true })
    .fill("模拟取消部分订单退款");
  await form
    .getByLabel("实收 / 实付金额", { exact: true })
    .fill(String(amount));
  const refund = (
    await clickRPC(page, "create_finance_payment", () => submit.click())
  ).payment;
  await expect(form).toBeHidden();
  assert.equal(refund.kind, "REFUND");
  assert.equal(
    refund.direction,
    source.direction === "RECEIPT" ? "DISBURSEMENT" : "RECEIPT",
  );
  assert.equal(refund.refund_of_payment_id, source.id);
  assert.equal(refund.counterparty_id, source.counterparty_id);
  assert.equal(refund.currency, source.currency);
  assert.equal(refund.status, "DRAFT");
  assert.equal(Number((await sourceReadback()).available_amount), 20);
  await completePaymentTask(browser, options, client, refund, "boss", report);
  await completePaymentTask(
    browser,
    options,
    client,
    refund,
    "finance",
    report,
  );
  const approved = (
    await client.rpc("finance", "operational_fact", "get_finance_payment", {
      id: refund.id,
    })
  ).payment;
  assert.equal(approved.status, "APPROVED");
  assert.notEqual(approved.approved_by, approved.created_by);
  assert.deepEqual(refundRows(), { rows: 1, posted: 0, amount: 0 });
  assert.equal(
    Number((await sourceReadback()).available_amount),
    20,
    "approval must not refund money",
  );
  let lost;
  let posted;
  const postPage = page;
  const postOptions = { ...options, mobile: false };
  await openFinancePayment(postPage, postOptions, client, refund.id);
  lost = await dropRealResponse(
    postPage,
    options,
    "customer_config",
    "execute_finance_payment_post",
  );
  await pageAction(postPage, "确认实际收付");
  await expect(
    postPage.getByText("已重新读取实际收付结果", { exact: true }),
  ).toBeVisible();
  assert.equal(lost.state.backendCode, 0);
  await lost.remove();
  posted = (
    await client.rpc("finance", "operational_fact", "get_finance_payment", {
      id: refund.id,
    })
  ).payment;
  assert.equal(posted.status, "POSTED");
  assert.equal(
    Number(posted.available_amount),
    0,
    "refund must never become reusable funds",
  );
  const original = await sourceReadback();
  assert.equal(Number(original.refunded_amount), amount);
  assert.equal(Number(original.available_amount), 20 - amount);
  assert.deepEqual(refundRows(), { rows: 1, posted: 1, amount });
  await client.rpc(
    "finance",
    "customer_config",
    "execute_finance_payment_post",
    lost.state.params,
  );
  assert.deepEqual(
    await sourceReadback(),
    original,
    "refund replay cannot debit the source twice",
  );
  assert.deepEqual(refundRows(), { rows: 1, posted: 1, amount });
  if (options.mobile) await verifyCompletedPaymentTask(browser, options, client, refund.id, report);
  const followupOptions = { ...options, mobile: false };
  await openFinancePayment(page, followupOptions, client, refund.id);
  if (amount === 20) {
    await openFinancePayment(page, followupOptions, client, source.id);
    const refundAction = page
      .locator("button:visible")
      .filter({ hasText: "登记实际退款" });
    if (!(await refundAction.isVisible()))
      await page
        .getByRole("button", { name: /^更多操作(?:，共 \d+ 项)?$/u })
        .click();
    await expect(refundAction).toBeDisabled();
    await openFinancePayment(page, followupOptions, client, refund.id);
  }
  const reverseParams = {
    id: refund.id,
    expected_version: posted.version,
    reason: "模拟银行退款撤回",
  };
  assert.equal(
    (
      await client.raw(
        "sales",
        "operational_fact",
        "reverse_finance_payment",
        reverseParams,
      )
    ).code,
    40304,
  );
  assert.deepEqual(refundRows(), { rows: 1, posted: 1, amount });
  await pageAction(page, "冲销收付款");
  const reverse = await modal(page, "冲销收付款");
  await reverse
    .getByLabel("冲销原因", { exact: true })
    .fill(reverseParams.reason);
  await clickRPC(page, "reverse_finance_payment", () =>
    reverse.getByRole("button", { name: "确认冲销", exact: true }).click(),
  );
  const restored = await sourceReadback();
  assert.equal(Number(restored.available_amount), 20);
  assert.equal(Number(restored.refunded_amount), 0);
  assert.deepEqual(refundRows(), { rows: 1, posted: 0, amount: 0 });
  assert.equal(
    client.query(
      `SELECT to_json(count(*)) FROM finance_allocations WHERE payment_id=${refund.id}`,
    ),
    0,
  );
  await client.rpc(
    "finance",
    "operational_fact",
    "reverse_finance_payment",
    reverseParams,
  );
  assert.deepEqual(await sourceReadback(), restored);
  assert.equal(
    (
      await client.raw(
        "finance",
        "operational_fact",
        "reverse_finance_payment",
        { ...reverseParams, reason: "另一笔退款冲销意图" },
      )
    ).code,
    40920,
  );
  assert.deepEqual(await sourceReadback(), restored);
  await assertMobileLayout(page, { ...options, mobile: false });
  report.flows.push({
    key,
    passed: true,
    paymentID: refund.id,
    registrationSurface: 'desktop browser',
    postSurface: 'desktop browser',
    approvalSurface: options.mobile ? 'mobile task' : 'desktop browser',
    reversalSurface: 'desktop browser',
    ...(options.mobile ? { completedTaskReadOnly: true } : {}),
    sourcePaymentID: source.id,
    direction: refund.direction,
    postedBalance: { refunded: amount, available: 20 - amount },
    restored: {
      refunded: Number(restored.refunded_amount),
      available: Number(restored.available_amount),
    },
    transportFault: faultEvidence(lost.state),
  });
  await page.screenshot({
    path: path.join(options.outputDir, `${key}.png`),
    fullPage: true,
  });
}

export async function qualityFlow(browser, options, client, fixture, report) {
  const { page, context } = await login(browser, { ...options, fourK: true }, "quality", report);
  const { rpc, raw, query } = client;
  const id = fixture.inspection.id;
  const lotID = fixture.receipt.items[0].lot_id;
  const ledger = () =>
    query(
      `SELECT json_build_object('lot',(SELECT status FROM inventory_lots WHERE id=${lotID}),'txns',(SELECT count(*) FROM inventory_txns WHERE lot_id=${lotID}),'inspections',(SELECT json_agg(json_build_object('id',id,'status',status,'result',result,'check_items',check_items,'defect_rate_percent',defect_rate_percent,'superseded',superseded_at IS NOT NULL) ORDER BY id) FROM quality_inspections WHERE inventory_lot_id=${lotID}))`,
    );
  try {
    if (options.mobile) await openMobileSourceTask(page, options, client, 'quality', 'quality_inspection', id, ['handoff_receipt_quality']);
    else await navigate(page, businessURL(options, "quality", "production/quality-inspections"));
    await assertMobileLayout(page, { ...options, mobile: false });
    await selectRow(page, id);
    await pageAction(page, "判定不合格");
    const dialog = await modal(page, "判定不合格");
    await dialog.getByRole("textbox", { name: /检查项目 1$/u }).fill("尺寸");
    await selectOption(
      page,
      dialog.getByLabel("检查结果", { exact: true }).first(),
      "异常",
    );
    await dialog
      .getByLabel("要求 / 依据", { exact: true })
      .first()
      .fill("模拟确认样 10 cm");
    await dialog
      .getByLabel("实际情况", { exact: true })
      .first()
      .fill("测量 10.5 cm");
    await selectOption(
      page,
      dialog.getByLabel("检查范围", { exact: true }).first(),
      "全检",
    );
    for (const index of [1, 2]) {
      await selectOption(
        page,
        dialog.getByLabel("检查结果", { exact: true }).nth(index),
        "符合",
      );
      await selectOption(
        page,
        dialog.getByLabel("检查范围", { exact: true }).nth(index),
        "全检",
      );
      await dialog
        .getByLabel("实际情况", { exact: true })
        .nth(index)
        .fill("与模拟采购约定一致");
    }
    await dialog.getByRole("radio", { name: "自定义", exact: true }).check();
    const percentage = dialog.getByRole("spinbutton", {
      name: "自定义不良比例",
      exact: true,
    });
    await percentage.fill("100.01");
    const beforeInvalid = report.browserRPC.filter(
      (call) => call.method === "reject_quality_inspection",
    ).length;
    await dialog
      .getByRole("button", { name: "确认不合格", exact: true })
      .click();
    await expect(
      dialog.getByText("估算不良比例须在 0% 到 100% 之间", { exact: true }),
    ).toBeVisible();
    assert.equal(
      report.browserRPC.filter(
        (call) => call.method === "reject_quality_inspection",
      ).length,
      beforeInvalid,
    );
    assert.equal(ledger().inspections[0].status, "SUBMITTED");
    await percentage.fill("12.50");
    await dialog.getByLabel("判定备注", { exact: true }).fill("模拟尺寸不合格");
    const rejected = (
      await clickRPC(page, "reject_quality_inspection", () =>
        dialog.getByRole("button", { name: "确认不合格", exact: true }).click(),
      )
    ).quality_inspection;
    assert.equal(rejected.status, "REJECTED");
    assert.equal(Number(rejected.defect_rate_percent), 12.5);
    await expect(dialog).toBeHidden();
    const rejectedLedger = ledger();
    assert.equal(rejectedLedger.lot, "REJECTED");
    assert.equal(rejectedLedger.txns, 0);
    assert.equal(
      rejectedLedger.inspections[0].check_items[0].observation,
      "测量 10.5 cm",
    );

    const correction = {
      id,
      correction_inspection_no: `${fixture.prefix}-RECHECK`,
      reason: "模拟量具校准错误，保留原判定并复检",
    };
    assert.equal(
      (
        await raw(
          "sales",
          "quality",
          "correct_quality_inspection_result",
          correction,
        )
      ).code,
      40304,
    );
    assert.deepEqual(
      ledger(),
      rejectedLedger,
      "permission rejection must not change evidence",
    );
    const correctionResult = await correctQualityThroughBrowser(page, options, report, { request: correction, readState: ledger, key: flowKey(options, "quality") });
    const recheck = correctionResult.inspection;
    assert.equal(recheck.status, "SUBMITTED");
    assert.equal(recheck.correction_of_inspection_id, id);
    const held = ledger();
    assert.equal(held.lot, "HOLD");
    assert.equal(held.txns, 0);
    assert.equal(held.inspections[0].superseded, true);
    assert.deepEqual(
      held.inspections[0].check_items,
      rejectedLedger.inspections[0].check_items,
    );
    const replay = await rpc(
      "quality",
      "quality",
      "correct_quality_inspection_result",
      correction,
    );
    assert.equal(replay.quality_inspection.id, recheck.id);
    assert.deepEqual(
      ledger(),
      held,
      "correction replay must not append evidence twice",
    );

    if (options.mobile) await openMobileSourceTask(page, options, client, 'quality', 'quality_inspection', recheck.id, ['handoff_receipt_quality']);
    else await navigate(page, page.url());
    await selectRow(page, recheck.id);
    await pageAction(page, "判定合格");
    const pass = await modal(page, "判定合格");
    await pass.getByRole("textbox", { name: /检查项目 1$/u }).fill("尺寸复检");
    for (const index of [0, 1, 2]) {
      await selectOption(
        page,
        pass.getByLabel("检查结果", { exact: true }).nth(index),
        "符合",
      );
      await selectOption(
        page,
        pass.getByLabel("检查范围", { exact: true }).nth(index),
        "全检",
      );
      await pass
        .getByLabel("实际情况", { exact: true })
        .nth(index)
        .fill("复检符合模拟采购约定");
    }
    await pass
      .getByLabel("实际情况", { exact: true })
      .first()
      .fill("校准后 10 cm");
    await pass
      .getByRole("radio", { name: "0%（未发现不良）", exact: true })
      .check();
    const passed = (
      await clickRPC(page, "pass_quality_inspection", () =>
        pass.getByRole("button", { name: "确认合格", exact: true }).click(),
      )
    ).quality_inspection;
    assert.equal(passed.status, "PASSED");
    const ready = ledger();
    assert.equal(ready.lot, "ACTIVE");
    assert.equal(ready.txns, 0, "quality must not post inventory");
    assert.equal(ready.inspections.length, 2);
    await rpc("quality", "quality", "correct_quality_inspection_result", correction);
    assert.deepEqual(ledger(), ready, "completed correction replay must preserve the new verdict and ledger");
    report.flows.push({
      key: flowKey(options, "quality"),
      passed: true,
      originalID: id,
      recheckID: recheck.id,
      rejected: rejectedLedger,
      corrected: held,
      passedReadback: ready,
      correctionSurface: "real browser",
      correctionCreatedInBrowser: true,
      correctionReasonRequired: correctionResult.reasonRequired,
      correctionReplayAfterDecisionExact: true,
      transportFaults: [correctionResult.transportFault],
    });
    await page.screenshot({
      path: path.join(options.outputDir, `${flowKey(options, "quality")}.png`),
      fullPage: true,
    });
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  } finally {
    await closePage(page, context);
  }
}

export async function inventoryFlow(browser, options, client, fixture, report) {
  const entrySession = await login(browser, options, "warehouse", report);
  let { page } = entrySession;
  let preparationSession;
  const lotID = fixture.receipt.items[0].lot_id;
  const ledger = () =>
    client.query(
      `SELECT json_build_object('balance',COALESCE((SELECT quantity FROM inventory_balances WHERE lot_id=${lotID}),0),'txns',(SELECT count(*) FROM inventory_txns WHERE lot_id=${lotID}),'net',COALESCE((SELECT sum(quantity*direction) FROM inventory_txns WHERE lot_id=${lotID}),0))`,
    );
  try {
    if (options.mobile) await openMobileSourceTask(page, options, client, 'warehouse', 'purchase_receipt', fixture.receipt.id, ['handoff_receipt_inbound']);
    else await navigate(page, businessURL(options, "warehouse", "warehouse/inbound"));
    await assertMobileLayout(page, options);
    await selectRow(page, fixture.receipt.id);
    await pageAction(page, "确认材料入库");
    const posted = await clickRPC(page, "post_purchase_receipt", () =>
      page
        .locator(".ant-popover:visible")
        .getByRole("button", { name: "确认", exact: true })
        .click(),
    );
    assert.equal(posted.purchase_receipt.status, "POSTED");
    assert.deepEqual(ledger(), { balance: 10, txns: 1, net: 10 });
    if (options.mobile) {
      await page.getByRole('button', { name: '核对已入库批次', exact: true }).click();
      await expect(page.getByTestId('mobile-task-fact-form')).toHaveAttribute('data-handler-mode', 'inventory');
    } else await navigate(page, businessURL(options, "warehouse", "warehouse/inventory"));
    const balanceID = client.query(
      `SELECT to_json(id) FROM inventory_balances WHERE lot_id=${lotID}`,
    );
    if (options.mobile) {
      await selectRow(page, balanceID);
      await expect(page.getByRole("button", { name: /^盘\s*点$/u })).toHaveCount(0);
      // A completed inbound task only exposes its stock readback. Prepare the
      // new count on desktop; mobile can review the source and desktop-only boundary.
      preparationSession = await login(browser, { ...options, mobile: false }, "warehouse", report);
      page = preparationSession.page;
      await navigate(page, businessURL({ ...options, mobile: false }, "warehouse", "warehouse/inventory"));
    }
    const row = page.locator(`.ant-table-row[data-row-key="balances-${balanceID}"]:visible`);
    await expect(row).toHaveCount(1);
    await row.getByRole("checkbox").check();
    await expect(row.getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: /盘\s*点/u }).click();
    const dialog = await modal(page, "登记库存盘点");
    const submit = dialog.getByRole("button", {
      name: "提交盘点复核",
      exact: true,
    });
    const countWrites = () =>
      report.browserRPC.filter(
        (call) => call.method === "create_inventory_operation",
      ).length;
    const before = countWrites();
    await submit.click();
    await expect(
      dialog.getByText("请填写作业单号", { exact: true }),
    ).toBeVisible();
    assert.equal(countWrites(), before);
    await dialog
      .getByLabel("作业单号", { exact: true })
      .fill(`${fixture.prefix}-COUNT`);
    await dialog
      .getByLabel("业务原因", { exact: true })
      .fill("模拟复核实盘差异");
    await dialog.getByLabel("实盘数量", { exact: true }).fill("-1");
    await submit.click();
    await expect(
      dialog.getByText("实盘数量必须是非负数", { exact: true }),
    ).toBeVisible();
    assert.equal(countWrites(), before);
    await dialog.getByLabel("实盘数量", { exact: true }).fill("8");
    const lost = await dropRealResponse(
      page,
      options,
      "inventory",
      "create_inventory_operation",
    );
    await submit.click();
    await expect(
      page.getByText("提交结果暂时无法确认，请保持填写内容不变后重试", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(lost.state.backendCode, 0);
    await lost.remove();
    await expect(dialog.getByLabel("实盘数量", { exact: true })).toHaveValue(
      "8",
    );
    const created = (
      await clickRPC(page, "create_inventory_operation", () => submit.click())
    ).inventory_operation;
    assert.equal(created.status, "DRAFT");
    assert.equal(created.items.length, 1);
    assert.deepEqual(ledger(), { balance: 10, txns: 1, net: 10 });
    let receipt = page.locator(".erp-inventory-operation-receipt");
    await expect(receipt).toContainText("待审批");
    await expect(receipt.getByRole("button", { name: /^过\s*账$/u })).toHaveCount(0);
    await postTransactionInventoryCount(client, created, fixture.prefix, {
      post: false,
      beforeExecution: options.mobile ? async (task) => {
        await verifyMobileDesktopTask(entrySession.page, options, client, task);
        assert.deepEqual(ledger(), { balance: 10, txns: 1, net: 10 });
      } : undefined,
    });
    assert.deepEqual(ledger(), { balance: 10, txns: 1, net: 10 });
    await clickRPC(page, "get_inventory_operation", () => receipt.getByRole("button", { name: "重新读取", exact: true }).click());
    await receipt.getByRole("button", { name: /^过\s*账$/u }).click();
    const result = await clickRPC(page, "execute_inventory_adjustment_post", () =>
      page
        .locator(".ant-popover:visible")
        .getByRole("button", { name: "确认过账", exact: true })
        .click(),
    );
    assert.equal(result.source_readback.status, "POSTED");
    assert.deepEqual(ledger(), { balance: 8, txns: 2, net: 8 });
    await receipt
      .getByRole("button", { name: "核对并取消", exact: true })
      .click();
    const cancel = await modal(page, "取消库存作业");
    await cancel
      .getByPlaceholder("请填写取消原因", { exact: true })
      .fill("模拟盘点撤销，恢复原库存");
    const reversed = await clickRPC(page, "cancel_inventory_operation", () =>
      cancel.getByRole("button", { name: "确认取消", exact: true }).click(),
    );
    assert.equal(reversed.inventory_operation.status, "CANCELLED");
    assert.deepEqual(ledger(), { balance: 10, txns: 3, net: 10 });
    assert.equal(
      client.query(
        `SELECT to_json(count(*)) FROM inventory_operations WHERE operation_no='${fixture.prefix}-COUNT'`,
      ),
      1,
    );
    report.flows.push({
      key: flowKey(options, "inventory"),
      passed: true,
      operationID: created.id,
      draftSurface: 'desktop browser',
      postSurface: 'desktop browser',
      ...(options.mobile ? { completedInboundReadOnly: true, mobileAdjustmentUnavailable: true } : {}),
      transportFault: faultEvidence(lost.state),
      final: ledger(),
    });
    await page.screenshot({
      path: path.join(
        options.outputDir,
        `${flowKey(options, "inventory")}.png`,
      ),
      fullPage: true,
    });
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  } finally {
    if (preparationSession) await closePage(preparationSession.page, preparationSession.context);
    await closePage(entrySession.page, entrySession.context);
  }
}

export async function runTransactionBrowser(options, preparedFixture) {
  const client = createTransactionClient(options);
  const report = {
    status: "running",
    flows: [],
    browserRPC: [],
    pageErrors: [],
    mobileTasks: [],
    databaseName: options.databaseName,
  };
  await fs.mkdir(options.outputDir, { recursive: true });
  let browser;
  try {
    report.identity = await client.verify();
    let fixture = preparedFixture;
    if (fixture)
      for (const role of [
        "admin",
        "purchase",
        "quality",
        "warehouse",
        "finance",
        "boss",
        "sales",
        "production",
        "pmc",
        "engineering",
      ])
        await client.login(role);
    else fixture = await prepareTransactionFixture(client, options);
    fixture.salesOrder ??= await prepareTransactionSalesOrder(
      client,
      options,
      fixture,
    );
    const desktopReceivable = await prepareTransactionReceivable(
      client,
      fixture,
    );
    report.frontendIdentity = await client.verifyFrontend();
    browser = await chromium.launch({ headless: true });
    await captureTransactionFlowFields(browser, options, client, report);
    await qualityFlow(browser, options, client, fixture, report);
    await inventoryFlow(browser, options, client, fixture, report);
    for (const mobile of [false, true])
      await productionShipmentFlow(
        browser,
        { ...options, mobile },
        client,
        fixture,
        report,
      );
    fixture.salesOrder ??= await prepareTransactionSalesOrder(
      client,
      options,
      fixture,
    );
    await financeFlow(
      browser,
      options,
      client,
      fixture,
      report,
      "DISBURSEMENT",
    );
    await financeFlow(browser, options, client, fixture, report, "RECEIPT");
    for (const mobile of [false, true]) {
      const surfaceOptions = { ...options, mobile };
      let source = fixture;
      if (mobile) {
        source = await prepareTransactionPurchase(
          client,
          { ...options, runID: `${options.runID}m` },
          fixture.configHash,
        );
        await qualityFlow(browser, surfaceOptions, client, source, report);
        await inventoryFlow(browser, surfaceOptions, client, source, report);
        source.salesOrder = await prepareTransactionSalesOrder(
          client,
          options,
          source,
        );
        await financeFlow(
          browser,
          surfaceOptions,
          client,
          source,
          report,
          "DISBURSEMENT",
        );
      }
      const receivable = mobile
        ? await prepareTransactionReceivable(client, source)
        : desktopReceivable;
      report.receivableSources ??= [];
      report.receivableSources.push({
        surface: mobile ? "mobile" : "desktop",
        shipmentID: receivable.shipment.id,
        shipmentStatus: receivable.shipment.status,
        factID: receivable.fact.id,
        amount: Number(receivable.fact.amount),
        stockOperationID: receivable.stockOperation.id,
      });
      await financeFlow(
        browser,
        surfaceOptions,
        client,
        source,
        report,
        "RECEIPT",
        {
          key: "finance_receivable",
          suffix: "AR-SETTLE",
          kind: "SETTLEMENT",
          fact: receivable.fact,
        },
      );
      for (const [direction, party] of [
        ["RECEIPT", "customer"],
        ["DISBURSEMENT", "supplier"],
      ]) {
        await financeFlow(
          browser,
          surfaceOptions,
          client,
          source,
          report,
          direction,
          {
            key: `refund_source_${party}`,
            suffix: `ADV-${party.toUpperCase()}`,
            kind: "ADVANCE",
            refund: true,
          },
        );
      }
    }
    await captureTransactionFieldResults(browser, options, client, report);
    const cancellationFixture = await prepareTransactionPurchase(
      client,
      { ...options, runID: `${options.runID}c` },
      fixture.configHash,
    );
    cancellationFixture.salesOrder = await prepareTransactionSalesOrder(client, options, cancellationFixture);
    await runRequestCancellationBrowser(browser, options, client, cancellationFixture, report);
    assertTransactionBrowserReport(report);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack;
    if (browser)
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          await page
            .screenshot({
              path: path.join(options.outputDir, "failure.png"),
              fullPage: true,
            })
            .catch(() => {});
          report.visibleText = (
            await page
              .locator("body")
              .innerText()
              .catch(() => "")
          ).slice(0, 16000);
        }
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
  const args = process.argv.slice(2);
  assert.equal(
    args[0],
    "--environment",
    "pass a private isolated environment JSON file",
  );
  assert.equal(args.length, 2);
  const options = JSON.parse(await fs.readFile(args[1], "utf8"));
  const report = await runTransactionBrowser(options);
  process.stdout.write(
    `transaction browser: ${report.status}, ${report.flows.length} flows\n`,
  );
}
