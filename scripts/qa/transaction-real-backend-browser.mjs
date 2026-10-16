#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { browserRPCURL } from "./browser-write-target.mjs";
import { resolveMobileActionLabel } from "../../web/src/erp/mobile/utils/mobileRoleTaskModel.mjs";
import {
  createTransactionClient,
  prepareTransactionFixture,
  prepareTransactionPurchase,
  prepareTransactionReceivable,
  prepareTransactionSalesOrder,
} from "./transaction-real-backend-fixture.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const { expect } = require("playwright/test");

export const TRANSACTION_FLOW_KEYS = Object.freeze([
  "quality",
  "inventory",
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
  assert.equal(
    report.mobileTasks?.length,
    16,
    "all mobile approval and execution steps must run",
  );
  assert.ok(report.mobileTasks.every(({ confirmed }) => confirmed === true));
  assert.equal(
    new Set(report.mobileTasks.map(({ taskID }) => taskID)).size,
    16,
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
    assert.deepEqual(roles.sort(), ["boss", "finance"]);
}

function businessURL(options, role, route) {
  return `${options.baseURL}${options.mobile ? `/m/${role}/handle/${route}` : `/erp/${route}`}`;
}

function flowKey(options, key) {
  return `${options.mobile ? "mobile_" : ""}${key}`;
}

async function assertMobileLayout(page, options) {
  if (!options.mobile) return;
  await expect(
    page.locator('[data-mobile-business-page="true"]'),
  ).toBeVisible();
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    touch: navigator.maxTouchPoints,
  }));
  assert.equal(metrics.width, 390);
  assert.ok(metrics.touch > 0);
  assert.ok(
    metrics.document <= metrics.width + 1,
    `mobile document overflow: ${JSON.stringify(metrics)}`,
  );
}

async function selectOption(page, control, label) {
  await control
    .locator("xpath=ancestor::div[contains(@class,'ant-select-selector')][1]")
    .click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(label, { exact: true })
    .click();
}
async function selectRow(page, id) {
  const row = page.locator(`.ant-table-row[data-row-key="${id}"]:visible`);
  await expect(row).toHaveCount(1);
  const radio = row.getByRole("radio");
  await radio.check();
  await expect(radio).toBeChecked();
}
async function pageAction(page, label) {
  const direct = page.locator("button:visible").filter({ hasText: label });
  if (await direct.isVisible()) return direct.click();
  await page
    .getByRole("button", { name: /^更多操作(?:，共 \d+ 项)?$/u })
    .click();
  await expect(direct).toHaveCount(1);
  await direct.click();
}
async function modal(page, title) {
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText(title, { exact: true }) });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function navigate(page, url) {
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.pendingRPC.size).toBe(0);
  await Promise.all([...page.rpcResponses]);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
async function closePage(page, context) {
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.pendingRPC.size).toBe(0);
  await context.unrouteAll({ behavior: "wait" });
  await Promise.all([...page.rpcResponses]);
  await context.close();
}
async function clickRPC(page, method, action, code = 0) {
  const pending = page.waitForResponse(
    (response) => {
      if (!response.url().includes("/rpc/")) return false;
      return response.request().postDataJSON()?.method === method;
    },
    { timeout: 30000 },
  );
  const [response] = await Promise.all([pending, action()]);
  assert.equal(response.status(), 200);
  const { result } = await response.json();
  assert.equal(result?.code, code, `${method}: ${result?.message}`);
  return result.data;
}
async function login(browser, options, role, report) {
  const context = await browser.newContext({
    viewport: options.mobile
      ? { width: 390, height: 844 }
      : { width: 1600, height: 1000 },
    isMobile: Boolean(options.mobile),
    hasTouch: Boolean(options.mobile),
    deviceScaleFactor: 1,
  });
  // The authenticated proxy probe proves that Vite forwards to this isolated backend.
  const page = await context.newPage();
  page.rpcResponses = new Set();
  page.pendingRPC = new Set();
  page.expectedRPCFailures = new Map();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) =>
    report.pageErrors.push({ role, message: error.message }),
  );
  page.on("request", (request) => {
    if (request.url().includes("/rpc/")) page.pendingRPC.add(request);
  });
  page.on("requestfailed", (request) => {
    page.pendingRPC.delete(request);
    if (!request.url().includes("/rpc/")) return;
    const { method, params } = request.postDataJSON();
    const injected = page.expectedRPCFailures.get(method);
    if (
      injected?.injected &&
      injected.backendCode === 0 &&
      JSON.stringify(injected.params) === JSON.stringify(params)
    )
      return;
    report.pageErrors.push({
      role,
      method,
      message: "Unexpected RPC transport failure",
      failure: request.failure(),
    });
  });
  page.on("requestfinished", (request) => {
    if (!request.url().includes("/rpc/")) return;
    const collected = (async () => {
      try {
        const response = await request.response();
        const body = request.postDataJSON();
        const data = await response.json();
        report.browserRPC.push({
          role,
          surface: options.mobile ? "mobile" : "desktop",
          method: body.method,
          code: data.result?.code,
          http: response.status(),
          requestID: response.headers()["x-request-id"],
        });
      } catch (error) {
        report.pageErrors.push({
          role,
          message: `Unreadable RPC response: ${error.message}`,
          method: request.postDataJSON()?.method,
          failure: request.failure(),
        });
      } finally {
        page.pendingRPC.delete(request);
      }
    })();
    page.rpcResponses.add(collected);
    void collected.finally(() => page.rpcResponses.delete(collected));
  });
  await navigate(page, `${options.baseURL}/admin-login`);
  if (options.mobile)
    await page
      .locator(".ant-segmented-item")
      .filter({ hasText: "手机版" })
      .click();
  await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
  await page.getByLabel("密码", { exact: true }).fill(options.rolePassword);
  const legalStatus = page.waitForResponse(
    (response) =>
      response.url().includes("/rpc/") &&
      response.request().postDataJSON()?.method === "legal_notice_status",
  );
  const effectiveSession = page
    .waitForResponse(
      (response) =>
        response.url().includes("/rpc/") &&
        response.request().postDataJSON()?.method === "get_effective_session",
    )
    .then((response) => response.json());
  const mobileTaskList = options.mobile
    ? page
        .waitForResponse(
          (response) =>
            response.url().includes("/rpc/") &&
            response.request().postDataJSON()?.method === "list_role_tasks",
        )
        .then(async (response) => {
          assert.equal(response.status(), 200);
          const body = await response.json();
          assert.equal(body.result?.code, 0);
        })
    : null;
  await clickRPC(page, "admin_login", () =>
    page.getByRole("button", { name: /登\s*录/u }).click(),
  );
  await page.waitForURL((url) => !url.pathname.includes("admin-login"));
  const acknowledge = page.getByTestId("legal-notice-acknowledge");
  const legal = (await (await legalStatus).json()).result;
  assert.equal(legal.code, 0);
  if (!legal.data.acknowledged) {
    await expect(acknowledge).toBeVisible();
    await clickRPC(page, "acknowledge_legal_notice", () => acknowledge.click());
  }
  await expect(page.getByTestId("legal-notice-gate")).toBeHidden();
  const effective = (await effectiveSession).result;
  assert.equal(effective.code, 0);
  assert.equal(
    effective.data.session.source,
    "active_customer_config_revision",
  );
  if (options.mobile) {
    await expect(page).toHaveURL(`${options.baseURL}/m/${role}/tasks`);
    await mobileTaskList;
    await page.waitForLoadState("networkidle");
    await expect.poll(() => page.pendingRPC.size).toBe(0);
    await page.getByTestId("mobile-role-nav-tasks").click();
    await expect(page.getByTestId("mobile-role-task-list")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.waitForLoadState("networkidle");
    await expect.poll(() => page.pendingRPC.size).toBe(0);
    await Promise.all([...page.rpcResponses]);
  }
  return { page, context };
}
async function captureFailure(page, options, report, error) {
  report.failures ??= [];
  const failure = {
    error: error?.stack,
    url: page.url(),
    pendingRPC: [...page.pendingRPC].map((request) => ({
      method: request.postDataJSON()?.method,
      timing: request.timing(),
    })),
    visibleText: (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 20000),
  };
  report.failures.push(failure);
  await page
    .screenshot({
      path: path.join(
        options.outputDir,
        `failure-${report.failures.length}.png`,
      ),
      fullPage: true,
    })
    .catch(() => {});
  report.visibleText = (
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  ).slice(0, 20000);
  report.buttons = await page.locator("button:visible").evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent,
      role: node.getAttribute("role"),
      label: node.getAttribute("aria-label"),
    })),
  );
}
async function dropRealResponse(page, options, domain, method) {
  const state = { method, injected: false, backendCode: null };
  page.expectedRPCFailures.set(method, state);
  const pattern = `**/rpc/${domain}`;
  const handler = async (route) => {
    if (state.injected || route.request().postDataJSON()?.method !== method)
      return route.fallback();
    const response = await route.fetch({
      url: browserRPCURL(options.backendURL, route.request().url()),
      maxRedirects: 0,
    });
    const body = await response.json();
    state.params = route.request().postDataJSON().params;
    state.backendCode = body.result?.code;
    state.requestID = response.headers()["x-request-id"];
    state.injected = true;
    await route.abort("failed");
  };
  await page.route(pattern, handler);
  return { state, remove: () => page.unroute(pattern, handler) };
}

function faultEvidence({ method, injected, backendCode, requestID }) {
  return { method, injected, backendCode, requestID };
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
  const { page, context } = await login(browser, options, role, report);
  try {
    if (options.mobile) {
      const taskCard = page.locator(`[data-mobile-task-id="${task.id}"]`);
      await expect(taskCard).toHaveCount(1);
      await taskCard
        .locator("button.erp-task-card__open")
        .tap({ position: { x: 16, y: 16 } });
      const detail = page.getByTestId("mobile-task-detail-screen");
      await expect(detail).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "进入单据办理", exact: true }),
      ).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "处理任务", exact: true }),
      ).toBeVisible();
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
      assert.ok(entryLayout.buttons[0].bottom <= entryLayout.buttons[1].y);
      await page.screenshot({
        path: path.join(
          options.outputDir,
          `mobile-task-entry-${role}-${payment.id}.png`,
        ),
      });
      await detail
        .getByRole("button", { name: "处理任务", exact: true })
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
      await submit.click();
      await expect(
        action.getByText(`${reasonLabel}为必填项`, { exact: true }),
      ).toBeVisible();
      const before = (
        await client.rpc(role, "workflow", "get_task", { task_id: task.id })
      ).task;
      assert.equal(before.task_status_key, "ready");
      assert.equal(before.version, task.version);
      const reasonInput = action.getByRole("textbox", {
        name: reasonLabel,
        exact: true,
      });
      await expect(reasonInput).toBeFocused();
      await expect(reasonInput).toHaveAttribute("aria-invalid", "true");
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
    const card = page
      .locator(".erp-task-board-card")
      .filter({ hasText: payment.payment_no });
    await expect(card).toHaveCount(1);
    await card.locator("button.erp-task-card__open").press("Enter");
    const drawer = page.locator(".erp-task-action-drawer:visible");
    await drawer
      .getByRole("button", { name: "选择处理方式", exact: true })
      .click();
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
  const key = flowKey(
    options,
    scenario.key || `finance_${direction.toLowerCase()}`,
  );
  const { page, context } = await login(browser, options, "finance", report);
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
    await navigate(page, businessURL(options, "finance", "finance/payments"));
    await assertMobileLayout(page, options);
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
        receipt ? "销售订单" : "采购订单",
      );
      await selectOption(
        page,
        dialog.getByLabel("订单 / 合同", { exact: true }),
        `${receipt ? fixture.salesOrder.order_no : fixture.order.purchase_order_no} · CNY`,
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
      .fill(advance ? "20" : "35");
    const created = (
      await clickRPC(page, "create_finance_payment", () => submit.click())
    ).payment;
    assert.equal(created.status, "DRAFT");
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
    await navigate(page, businessURL(options, "finance", "finance/payments"));
    await selectRow(page, created.id);
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
    assert.equal(posted.distinctActors, true);
    assert.equal(posted.posted, true);
    assert.equal(posted.allocations, advance ? 0 : 1);
    assert.equal(posted.netAllocated, advance ? 0 : 35);
    const readback = (
      await client.rpc("finance", "operational_fact", "get_finance_payment", {
        id: created.id,
      })
    ).payment;
    assert.equal(Number(readback.available_amount), advance ? 20 : 0);
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
    if (scenario.refund) {
      for (const amount of [7.25, 20]) {
        await navigate(
          page,
          businessURL(options, "finance", "finance/payments"),
        );
        await selectRow(page, created.id);
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
      await navigate(page, businessURL(options, "finance", "finance/payments"));
      await selectRow(page, created.id);
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
    await closePage(page, context);
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
  await assertMobileLayout(page, options);
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
  await navigate(page, businessURL(options, "finance", "finance/payments"));
  await selectRow(page, refund.id);
  const lost = await dropRealResponse(
    page,
    options,
    "customer_config",
    "execute_finance_payment_post",
  );
  await pageAction(page, "确认实际收付");
  await expect(
    page.getByText("已重新读取实际收付结果", { exact: true }),
  ).toBeVisible();
  assert.equal(lost.state.backendCode, 0);
  await lost.remove();
  const posted = (
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
  if (amount === 20) {
    await navigate(page, businessURL(options, "finance", "finance/payments"));
    await selectRow(page, source.id);
    const refundAction = page
      .locator("button:visible")
      .filter({ hasText: "登记实际退款" });
    if (!(await refundAction.isVisible()))
      await page
        .getByRole("button", { name: /^更多操作(?:，共 \d+ 项)?$/u })
        .click();
    await expect(refundAction).toBeDisabled();
    await navigate(page, businessURL(options, "finance", "finance/payments"));
    await selectRow(page, refund.id);
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
  await assertMobileLayout(page, options);
  report.flows.push({
    key,
    passed: true,
    paymentID: refund.id,
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

async function qualityFlow(browser, options, client, fixture, report) {
  const { page, context } = await login(browser, options, "quality", report);
  const { rpc, raw, query } = client;
  const id = fixture.inspection.id;
  const lotID = fixture.receipt.items[0].lot_id;
  const ledger = () =>
    query(
      `SELECT json_build_object('lot',(SELECT status FROM inventory_lots WHERE id=${lotID}),'txns',(SELECT count(*) FROM inventory_txns WHERE lot_id=${lotID}),'inspections',(SELECT json_agg(json_build_object('id',id,'status',status,'result',result,'check_items',check_items,'defect_rate_percent',defect_rate_percent,'superseded',superseded_at IS NOT NULL) ORDER BY id) FROM quality_inspections WHERE inventory_lot_id=${lotID}))`,
    );
  try {
    await navigate(
      page,
      businessURL(options, "quality", "production/quality-inspections"),
    );
    await assertMobileLayout(page, options);
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
    const { quality_inspection: recheck } = await rpc(
      "quality",
      "quality",
      "correct_quality_inspection_result",
      correction,
    );
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

    await navigate(page, page.url());
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
    report.flows.push({
      key: flowKey(options, "quality"),
      passed: true,
      originalID: id,
      recheckID: recheck.id,
      rejected: rejectedLedger,
      corrected: held,
      passedReadback: ready,
      correctionSurface: "formal API; current page has no correction action",
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

async function inventoryFlow(browser, options, client, fixture, report) {
  const { page, context } = await login(browser, options, "warehouse", report);
  const lotID = fixture.receipt.items[0].lot_id;
  const ledger = () =>
    client.query(
      `SELECT json_build_object('balance',COALESCE((SELECT quantity FROM inventory_balances WHERE lot_id=${lotID}),0),'txns',(SELECT count(*) FROM inventory_txns WHERE lot_id=${lotID}),'net',COALESCE((SELECT sum(quantity*direction) FROM inventory_txns WHERE lot_id=${lotID}),0))`,
    );
  try {
    await navigate(
      page,
      businessURL(options, "warehouse", "warehouse/inbound"),
    );
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
    await navigate(
      page,
      businessURL(options, "warehouse", "warehouse/inventory"),
    );
    const balanceID = client.query(
      `SELECT to_json(id) FROM inventory_balances WHERE lot_id=${lotID}`,
    );
    const row = page.locator(
      `.ant-table-row[data-row-key="balances-${balanceID}"]:visible`,
    );
    await expect(row).toHaveCount(1);
    await row.getByRole("radio").check();
    await expect(row.getByRole("radio")).toBeChecked();
    await page.getByRole("button", { name: /盘\s*点/u }).click();
    const dialog = await modal(page, "登记库存盘点");
    const submit = dialog.getByRole("button", {
      name: "生成盘点作业",
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
    const receipt = page.locator(".erp-inventory-operation-receipt");
    await receipt.getByRole("button", { name: /^过\s*账$/u }).click();
    const result = await clickRPC(page, "post_inventory_operation", () =>
      page
        .locator(".ant-popover:visible")
        .getByRole("button", { name: "确认过账", exact: true })
        .click(),
    );
    assert.equal(result.inventory_operation.status, "POSTED");
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
    await closePage(page, context);
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
        "quality",
        "warehouse",
        "finance",
        "boss",
        "sales",
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
    await qualityFlow(browser, options, client, fixture, report);
    await inventoryFlow(browser, options, client, fixture, report);
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
