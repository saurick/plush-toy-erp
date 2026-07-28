#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { classifyDatabaseName } from "./database-target.mjs";
import { FORMAL_DEMO_ACCOUNT_PROFILES } from "./manual-acceptance-account-scenarios.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const REPORT_ROOT = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance",
);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const CUSTOMER_KEY = "yoyoosun";
const PERMISSION_DENIED = 40304;
const STALE_WRITE_CONFLICT = 40920;
const PAGE_TIMEOUT_MS = 30_000;
const RPC_TIMEOUT_MS = 20_000;

class AcceptanceError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "AcceptanceError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new AcceptanceError(`${label} is required`, 2);
  return text;
}

export function normalizeLoopbackOrigin(value, label) {
  let url;
  try {
    url = new URL(requiredText(value, label));
  } catch (error) {
    if (error instanceof AcceptanceError) throw error;
    throw new AcceptanceError(`${label} is invalid`, 2);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new AcceptanceError(`${label} must use http or https`, 2);
  }
  if (url.username || url.password || !LOCAL_HOSTS.has(url.hostname)) {
    throw new AcceptanceError(`${label} must be a credential-free loopback origin`, 2);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new AcceptanceError(`${label} must not include a path, query, or hash`, 2);
  }
  return url.origin;
}

export function resolveExceptionFlowReportPath(value) {
  const reportPath = path.resolve(REPO_ROOT, requiredText(value, "--report"));
  const relative = path.relative(REPORT_ROOT, reportPath);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.extname(reportPath) !== ".json"
  ) {
    throw new AcceptanceError(
      "--report must be a JSON file under output/qa/manual-acceptance",
      2,
    );
  }
  return reportPath;
}

export function exceptionFlowConfirmation({
  backendURL,
  databaseName,
} = {}) {
  return `RUN_ISOLATED_EXCEPTION_FLOW_BROWSER_ACTIONS:${databaseName}:${backendURL}`;
}

export function parseExceptionFlowArgs(argv = [], env = process.env) {
  const options = {
    baseURL: "",
    backendURL: "",
    databaseName: "",
    reportPath: "",
    passwordEnv: "MANUAL_ACCEPTANCE_DEMO_PASSWORD",
    confirmationEnv: "EXCEPTION_FLOW_BROWSER_CONFIRM",
    headed: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--headed") {
      options.headed = true;
      continue;
    }
    const [key, inlineValue] = token.startsWith("--")
      ? token.slice(2).split(/=(.*)/su, 2)
      : ["", ""];
    if (!key) throw new AcceptanceError(`unsupported argument: ${token}`, 2);
    const value = inlineValue || argv[index + 1];
    if (!inlineValue) index += 1;
    if (!value || String(value).startsWith("--")) {
      throw new AcceptanceError(`--${key} is missing a value`, 2);
    }
    if (key === "base-url") options.baseURL = normalizeLoopbackOrigin(value, "--base-url");
    else if (key === "backend-url") {
      options.backendURL = normalizeLoopbackOrigin(value, "--backend-url");
    } else if (key === "database-name") options.databaseName = String(value).trim();
    else if (key === "report") options.reportPath = resolveExceptionFlowReportPath(value);
    else if (key === "password-env") options.passwordEnv = String(value).trim();
    else if (key === "confirmation-env") options.confirmationEnv = String(value).trim();
    else throw new AcceptanceError(`unsupported argument: --${key}`, 2);
  }
  if (!options.baseURL || !options.backendURL || !options.reportPath) {
    throw new AcceptanceError(
      "--base-url, --backend-url, --database-name, and --report are required",
      2,
    );
  }
  const databaseTarget = classifyDatabaseName(options.databaseName);
  if (
    databaseTarget.disposable !== true ||
    databaseTarget.profile !== "browser-actions"
  ) {
    throw new AcceptanceError(
      "--database-name must identify a dedicated browser_actions acceptance database ending in _dev",
      2,
    );
  }
  if (new URL(options.backendURL).port === "8300") {
    throw new AcceptanceError("the shared/default backend port 8300 is forbidden", 2);
  }
  const password = requiredText(env[options.passwordEnv], options.passwordEnv);
  const expectedConfirmation = exceptionFlowConfirmation(options);
  if (env[options.confirmationEnv] !== expectedConfirmation) {
    throw new AcceptanceError(
      `${options.confirmationEnv} must equal ${expectedConfirmation}`,
      2,
    );
  }
  return { ...options, password };
}

function accountForRole(roleKey) {
  const profile = FORMAL_DEMO_ACCOUNT_PROFILES.find(
    (item) => item.roleKey === roleKey,
  );
  if (!profile) {
    throw new AcceptanceError(`formal demo account missing for role ${roleKey}`);
  }
  return profile;
}

function rpcErrorCode(json) {
  const candidates = [
    json?.result?.code,
    json?.error?.code,
    json?.error?.data?.code,
    json?.code,
  ];
  return candidates.map(Number).find(Number.isSafeInteger) ?? null;
}

function rpcErrorMessage(json) {
  return String(
    json?.result?.message ||
      json?.error?.message ||
      json?.message ||
      "JSON-RPC request failed",
  );
}

async function browserRpcRaw(page, service, method, params = {}) {
  return page.evaluate(
    async ({ serviceName, methodName, requestParams, timeoutMs }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const token = localStorage.getItem("admin_access_token") || "";
        const response = await fetch(`/rpc/${serviceName}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `browser-readback-${Date.now()}-${Math.random()}`,
            method: methodName,
            params: requestParams,
          }),
          signal: controller.signal,
        });
        return {
          status: response.status,
          json: await response.json(),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      serviceName: service,
      methodName: method,
      requestParams: params,
      timeoutMs: RPC_TIMEOUT_MS,
    },
  );
}

async function browserRpc(page, service, method, params = {}) {
  const response = await browserRpcRaw(page, service, method, params);
  const code = rpcErrorCode(response.json);
  if (response.status < 200 || response.status >= 300 || code !== 0) {
    const error = new AcceptanceError(
      `${service}.${method} failed: HTTP ${response.status}, code=${String(code)}, ${rpcErrorMessage(response.json)}`,
    );
    error.rpcCode = code;
    error.rpcResponse = response;
    throw error;
  }
  return response.json.result?.data || {};
}

async function expectPermissionDenied(page, service, method, params) {
  const response = await browserRpcRaw(page, service, method, params);
  assert.equal(
    rpcErrorCode(response.json),
    PERMISSION_DENIED,
    `${service}.${method} must fail closed with PERMISSION_DENIED`,
  );
  return {
    service,
    method,
    httpStatus: response.status,
    code: PERMISSION_DENIED,
    result: "server_rejected",
  };
}

async function expectRetryRejected(page, service, method, params) {
  const response = await browserRpcRaw(page, service, method, params);
  return staleRetryReceipt(response, service, method);
}

export function staleRetryReceipt(response, service, method) {
  const code = rpcErrorCode(response?.json);
  assert.equal(
    code,
    STALE_WRITE_CONFLICT,
    `${service}.${method} duplicate/stale retry must fail with STALE_WRITE_CONFLICT`,
  );
  return {
    service,
    method,
    httpStatus: response?.status,
    code,
    result: "duplicate_or_stale_rejected",
  };
}

export function assertExceptionFlowEvidenceContract(report) {
  assert.equal(report?.flows?.length, 4, "four exception flows must execute");
  for (const flow of report.flows) {
    assert.equal(flow?.passed, true, `${String(flow?.key)} must pass`);
    assert.equal(
      flow?.retry?.code,
      STALE_WRITE_CONFLICT,
      `${String(flow?.key)} stale retry must be rejected with STALE_WRITE_CONFLICT`,
    );
    assert.equal(flow?.retry?.result, "duplicate_or_stale_rejected");
  }
  assert.equal(
    report?.negativePermissions?.length,
    4,
    "four server permission denials must execute",
  );
  for (const receipt of report.negativePermissions) {
    assert.equal(receipt?.code, PERMISSION_DENIED);
    assert.equal(receipt?.result, "server_rejected");
  }
  assert.equal(
    report?.simulatedTransportFaults?.length,
    4,
    "four lost-response recoveries must execute",
  );
  for (const receipt of report.simulatedTransportFaults) {
    assert.equal(receipt?.injected, true);
    assert.equal(receipt?.backendResultCode, 0);
    assert.equal(
      receipt?.transportFault,
      "response_dropped_after_backend_completed",
    );
  }
  return true;
}

function resultDataFromResponse(response) {
  const code = rpcErrorCode(response?.json);
  if (code !== 0) {
    throw new AcceptanceError(
      `captured mutation failed: code=${String(code)}, ${rpcErrorMessage(response?.json)}`,
    );
  }
  return response.json.result?.data || {};
}

function waitForRpcResponse(page, service, method) {
  return page
    .waitForResponse(
      (response) => {
        const url = new URL(response.url());
        if (url.pathname !== `/rpc/${service}`) return false;
        try {
          return response.request().postDataJSON()?.method === method;
        } catch {
          return false;
        }
      },
      { timeout: PAGE_TIMEOUT_MS },
    )
    .then(async (response) => ({
      status: response.status(),
      json: await response.json(),
    }));
}

async function installLostMutationResponse(page, service, method) {
  const state = {
    service,
    method,
    injected: false,
    backendResultCode: null,
    transportFault: "response_dropped_after_backend_completed",
  };
  const pattern = `**/rpc/${service}`;
  const handler = async (route) => {
    let request;
    try {
      request = route.request().postDataJSON();
    } catch {
      request = null;
    }
    if (state.injected || request?.method !== method) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    state.injected = true;
    state.backendResultCode = rpcErrorCode(json);
    await route.abort("failed");
  };
  await page.route(pattern, handler);
  return {
    state,
    remove: () => page.unroute(pattern, handler),
  };
}

async function login(browser, { baseURL, password, roleKey }) {
  const account = accountForRole(roleKey);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  await page.goto(new URL("/admin-login", `${baseURL}/`).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("账号").fill(account.username);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/admin-login"),
    page.locator('button[type="submit"]').click(),
  ]);
  return { account, context, page };
}

async function goto(page, baseURL, pathname, expectedText) {
  await page.goto(new URL(pathname, `${baseURL}/`).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByText(expectedText, { exact: true }).first().waitFor({
    state: "visible",
  });
}

async function selectRow(page, visibleToken) {
  const row = page
    .locator("tbody tr.ant-table-row")
    .filter({ hasText: visibleToken })
    .first();
  await row.waitFor({ state: "visible" });
  const radio = row.locator(".ant-radio-input");
  if (await radio.isVisible().catch(() => false)) {
    await radio.click();
  } else {
    await row.click();
  }
  await page
    .locator("tbody tr.ant-table-row-selected")
    .filter({ hasText: visibleToken })
    .first()
    .waitFor({ state: "visible" });
  return row;
}

async function confirmPopover(page, title, button = "确认") {
  const popover = page.locator(".ant-popover:visible").filter({ hasText: title });
  await popover.waitFor({ state: "visible" });
  const named = popover.getByRole("button", { name: button, exact: true });
  if (await named.isVisible().catch(() => false)) {
    await named.click();
    return;
  }
  await popover.locator(".ant-popconfirm-buttons .ant-btn-primary").click();
}

async function visibleModal(page, title) {
  const modal = page.locator(".ant-modal:visible").filter({ hasText: title }).last();
  await modal.waitFor({ state: "visible" });
  return modal;
}

async function waitMessage(page, text) {
  await page
    .locator(".ant-message-notice-content")
    .filter({ hasText: text })
    .last()
    .waitFor({ state: "visible" });
}

async function waitRecoveryMessage(page, text, lost) {
  try {
    await waitMessage(page, text);
  } catch (error) {
    const visibleMessages = await page
      .locator(".ant-message-notice-content")
      .allInnerTexts()
      .catch(() => []);
    throw new AcceptanceError(
      `${text} was not shown; transport=${JSON.stringify(lost.state)}; visibleMessages=${JSON.stringify(visibleMessages)}; cause=${String(error?.message || error)}`,
    );
  }
}

async function actOnTaskInBrowser(
  browser,
  options,
  {
    roleKey,
    sourceNo,
    actionTitle,
    confirmLabel,
    successMessage,
    reason = "",
  },
) {
  const session = await login(browser, { ...options, roleKey });
  try {
    await goto(session.page, options.baseURL, "/erp/task-board", "任务看板");
    const search = session.page.getByPlaceholder(
      "搜索任务、单号、来源、处理原因",
    );
    await search.fill(sourceNo);
    await search.press("Enter");
    const card = session.page
      .locator(".erp-task-board-card")
      .filter({ hasText: sourceNo })
      .first();
    await card.waitFor({ state: "visible" });
    await card.dblclick();
    const drawer = session.page.locator(".erp-task-action-drawer:visible");
    await drawer.waitFor({ state: "visible" });
    await drawer
      .getByRole("button", { name: "选择处理方式", exact: true })
      .click();
    await drawer.getByRole("radio").filter({ hasText: actionTitle }).click();
    if (reason) {
      await drawer.locator("textarea").fill(reason);
    }
    await drawer
      .getByRole("button", { name: "核对并确认", exact: true })
      .click();
    const confirmButton = drawer.getByRole("button", {
      name: confirmLabel,
      exact: true,
    });
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click();
    } else {
      await drawer.locator("button").filter({ hasText: confirmLabel }).last().click();
    }
    await waitMessage(session.page, successMessage);
    return {
      roleKey,
      sourceNo,
      action: actionTitle,
      result: "browser_task_action_completed",
    };
  } finally {
    await session.context.close();
  }
}

function summarizeProcess(data) {
  const context = data?.process_context || {};
  const instance = context.process_instance || {};
  const nodes = [
    ...(Array.isArray(context.active_nodes) ? context.active_nodes : []),
    ...(Array.isArray(context.settled_nodes) ? context.settled_nodes : []),
  ];
  return {
    processInstanceID: Number(instance.id || 0),
    status: String(instance.status || ""),
    nodes: nodes.map((node) => ({
      id: Number(node.id || 0),
      nodeKey: String(node.node_key || ""),
      status: String(node.status || ""),
      version: Number(node.version || 0),
      workflowTaskID: Number(node.workflow_task_id || 0) || null,
    })),
  };
}

function findRecord(items, predicate, label) {
  const item = (Array.isArray(items) ? items : []).find(predicate);
  if (!item) throw new AcceptanceError(`${label} fixture is missing`);
  return item;
}

async function verifyRuntimeIdentity({ backendURL, databaseName }) {
  const ready = await fetch(new URL("/readyz", `${backendURL}/`));
  if (!ready.ok || String(await ready.text()).trim() !== "ready") {
    throw new AcceptanceError("isolated action backend is not ready");
  }
  const digest = createHash("sha256")
    .update(`database-v1\n${databaseName}`)
    .digest("hex");
  const response = await fetch(
    new URL("/readyz/runtime-identity", `${backendURL}/`),
    {
      redirect: "error",
      headers: {
        Accept: "text/plain",
        "X-ERP-Runtime-Identity-Scope": "database-v1",
        "X-ERP-Expected-Runtime-Identity-SHA256": digest,
      },
    },
  );
  const body = String(await response.text()).trim();
  if (
    !response.ok ||
    body !== "runtime identity matched" ||
    response.headers.get("X-ERP-Runtime-Identity-Proof") !== "matched-v1"
  ) {
    throw new AcceptanceError("isolated action database runtime identity mismatch");
  }
  return { databaseName, proof: "matched-v1", scope: "database-v1" };
}

async function runSalesReturnFlow(browser, options, report) {
  const negative = await login(browser, { ...options, roleKey: "sales" });
  try {
    const listed = await browserRpc(
      negative.page,
      "operational_fact",
      "list_sales_returns",
      { status: "RECEIVED", limit: 100, offset: 0 },
    );
    const received = findRecord(
      listed.sales_returns,
      (item) => item.status === "RECEIVED",
      "received sales return",
    );
    report.negativePermissions.push(
      await expectPermissionDenied(
        negative.page,
        "operational_fact",
        "reverse_sales_return",
        {
          id: received.id,
          expected_version: received.version,
          reason: "无权角色服务端拒绝验证",
        },
      ),
    );
  } finally {
    await negative.context.close();
  }

  const session = await login(browser, { ...options, roleKey: "warehouse" });
  const flow = {
    key: "sales_return",
    sourceSetup: "existing_isolated_dataset_approved_source",
    browserActions: [],
    readbacks: [],
  };
  try {
    const listed = await browserRpc(
      session.page,
      "operational_fact",
      "list_sales_returns",
      { status: "APPROVED", limit: 100, offset: 0 },
    );
    const source = findRecord(
      listed.sales_returns,
      (item) => item.status === "APPROVED",
      "approved sales return",
    );
    const process = await browserRpc(
      session.page,
      "customer_config",
      "get_sales_return_acceptance_process",
      { customer_key: CUSTOMER_KEY, sales_return_id: source.id },
    );
    flow.source = {
      id: source.id,
      no: source.return_no,
      status: source.status,
      version: source.version,
    };
    flow.processBefore = summarizeProcess(process);
    flow.taskActions = [
      await actOnTaskInBrowser(browser, options, {
        roleKey: "warehouse",
        sourceNo: source.return_no,
        actionTitle: "处理完成",
        confirmLabel: "确认完成",
        successMessage: "任务已处理完成",
      }),
    ];

    await goto(
      session.page,
      options.baseURL,
      "/erp/sales/customer-returns",
      "客户退货 / RMA",
    );
    await selectRow(session.page, source.return_no);
    const lost = await installLostMutationResponse(
      session.page,
      "customer_config",
      "execute_sales_return_receive",
    );
    await session.page.getByRole("button", { name: "确认收货", exact: true }).click();
    await confirmPopover(session.page, "确认已收到客户退货？");
    await waitRecoveryMessage(session.page, "已重新读取客户退货结果", lost);
    await lost.remove();
    assert.equal(lost.state.injected, true);
    assert.equal(lost.state.backendResultCode, 0);
    report.simulatedTransportFaults.push(lost.state);
    flow.browserActions.push("warehouse_receive_click");

    const received = (
      await browserRpc(
        session.page,
        "operational_fact",
        "get_sales_return",
        { id: source.id },
      )
    ).sales_return;
    assert.equal(received.status, "RECEIVED");
    const receiptTxns = await browserRpc(
      session.page,
      "inventory",
      "list_inventory_txns",
      {
        source_type: "SALES_RETURN",
        source_id: source.id,
        limit: 100,
        offset: 0,
      },
    );
    assert.ok(receiptTxns.inventory_txns.length > 0);
    flow.readbacks.push({
      stage: "received",
      status: received.status,
      version: received.version,
      inventoryTxnCount: receiptTxns.inventory_txns.length,
    });

    await session.page
      .getByRole("button", { name: "冲正退货入库", exact: true })
      .click();
    const reverseModal = await visibleModal(session.page, "冲正客户退货入库");
    await reverseModal
      .getByPlaceholder("请填写冲正原因")
      .fill("真实浏览器异常流验收冲正");
    await reverseModal.getByRole("button", { name: "确认冲正", exact: true }).click();
    await waitMessage(session.page, "客户退货入库已冲正");
    flow.browserActions.push("warehouse_reverse_click");

    const reversed = (
      await browserRpc(
        session.page,
        "operational_fact",
        "get_sales_return",
        { id: source.id },
      )
    ).sales_return;
    assert.equal(reversed.status, "REVERSED");
    const reversedTxns = await browserRpc(
      session.page,
      "inventory",
      "list_inventory_txns",
      {
        source_type: "SALES_RETURN",
        source_id: source.id,
        limit: 100,
        offset: 0,
      },
    );
    assert.ok(reversedTxns.inventory_txns.length > receiptTxns.inventory_txns.length);
    flow.readbacks.push({
      stage: "reversed",
      status: reversed.status,
      version: reversed.version,
      inventoryTxnCount: reversedTxns.inventory_txns.length,
    });
    flow.retry = await expectRetryRejected(
      session.page,
      "operational_fact",
      "reverse_sales_return",
      {
        id: source.id,
        expected_version: received.version,
        reason: "重复冲正必须拒绝",
      },
    );
    flow.passed = true;
    return flow;
  } finally {
    await session.context.close();
  }
}

async function runFinancePaymentFlow(browser, options, report) {
  const authorizedLookup = await login(browser, {
    ...options,
    roleKey: "finance",
  });
  let postedFixture;
  try {
    const listed = await browserRpc(
      authorizedLookup.page,
      "operational_fact",
      "list_finance_payments",
      { status: "POSTED", limit: 100, offset: 0 },
    );
    postedFixture = findRecord(
      listed.payments,
      (item) => item.status === "POSTED",
      "posted finance payment",
    );
  } finally {
    await authorizedLookup.context.close();
  }
  const negative = await login(browser, { ...options, roleKey: "sales" });
  try {
    report.negativePermissions.push(
      await expectPermissionDenied(
        negative.page,
        "operational_fact",
        "reverse_finance_payment",
        {
          id: postedFixture.id,
          expected_version: postedFixture.version,
          reason: "无权角色服务端拒绝验证",
        },
      ),
    );
  } finally {
    await negative.context.close();
  }

  const session = await login(browser, { ...options, roleKey: "finance" });
  const flow = {
    key: "finance_payment",
    sourceSetup: "existing_isolated_dataset_approved_source",
    browserActions: [],
    readbacks: [],
  };
  try {
    const listed = await browserRpc(
      session.page,
      "operational_fact",
      "list_finance_payments",
      { status: "APPROVED", limit: 100, offset: 0 },
    );
    const source = findRecord(
      listed.payments,
      (item) => item.status === "APPROVED",
      "approved finance payment",
    );
    const process = await browserRpc(
      session.page,
      "customer_config",
      "get_finance_payment_approval_process",
      { customer_key: CUSTOMER_KEY, finance_payment_id: source.id },
    );
    flow.source = {
      id: source.id,
      no: source.payment_no,
      status: source.status,
      version: source.version,
    };
    flow.processBefore = summarizeProcess(process);
    flow.taskActions = [
      await actOnTaskInBrowser(browser, options, {
        roleKey: "finance",
        sourceNo: source.payment_no,
        actionTitle: "处理完成",
        confirmLabel: "确认完成",
        successMessage: "任务已处理完成",
      }),
    ];

    await goto(
      session.page,
      options.baseURL,
      "/erp/finance/payments",
      "收付款与核销",
    );
    await selectRow(session.page, source.payment_no);
    await session.page
      .getByRole("button", { name: "选择应收 / 应付核销", exact: true })
      .click();
    const allocationModal = await visibleModal(session.page, "选择核销记录");
    await allocationModal
      .locator('input[inputmode="decimal"]:not([disabled])')
      .first()
      .fill("1");
    const lost = await installLostMutationResponse(
      session.page,
      "customer_config",
      "execute_finance_payment_post",
    );
    await allocationModal
      .getByRole("button", { name: "过账并核销", exact: true })
      .click();
    await waitRecoveryMessage(
      session.page,
      "已重新读取收付款过账与核销结果",
      lost,
    );
    await lost.remove();
    assert.equal(lost.state.injected, true);
    assert.equal(lost.state.backendResultCode, 0);
    report.simulatedTransportFaults.push(lost.state);
    flow.browserActions.push("finance_post_and_allocate_click");

    const posted = (
      await browserRpc(
        session.page,
        "operational_fact",
        "get_finance_payment",
        { id: source.id },
      )
    ).payment;
    assert.equal(posted.status, "POSTED");
    assert.ok(Array.isArray(posted.allocations) && posted.allocations.length > 0);
    flow.readbacks.push({
      stage: "posted",
      status: posted.status,
      version: posted.version,
      allocationCount: posted.allocations.length,
    });

    await session.page
      .getByRole("button", { name: "冲销收付款", exact: true })
      .click();
    const reverseModal = await visibleModal(session.page, "冲销收付款");
    await reverseModal.getByLabel("冲销原因").fill("真实浏览器异常流验收冲销");
    await reverseModal.getByRole("button", { name: "确认冲销", exact: true }).click();
    await waitMessage(session.page, "收付款已冲销，原核销金额已恢复");
    flow.browserActions.push("finance_reverse_click");

    const reversed = (
      await browserRpc(
        session.page,
        "operational_fact",
        "get_finance_payment",
        { id: source.id },
      )
    ).payment;
    assert.equal(reversed.status, "REVERSED");
    flow.readbacks.push({
      stage: "reversed",
      status: reversed.status,
      version: reversed.version,
      allocationCount: Array.isArray(reversed.allocations)
        ? reversed.allocations.length
        : 0,
    });
    flow.retry = await expectRetryRejected(
      session.page,
      "operational_fact",
      "reverse_finance_payment",
      {
        id: source.id,
        expected_version: posted.version,
        reason: "重复冲销必须拒绝",
      },
    );
    flow.passed = true;
    return flow;
  } finally {
    await session.context.close();
  }
}

async function approveInventoryTaskInBrowser(browser, options, operationNo) {
  return actOnTaskInBrowser(browser, options, {
    roleKey: "boss",
    sourceNo: operationNo,
    actionTitle: "审批通过",
    confirmLabel: "确认通过",
    successMessage: "审批已通过",
    reason: "真实浏览器异常流验收批准",
  });
}

async function runInventoryAdjustmentFlow(browser, options, report) {
  const session = await login(browser, { ...options, roleKey: "warehouse" });
  const balances = await browserRpc(
    session.page,
    "inventory",
    "list_inventory_balances",
    { limit: 100, offset: 0 },
  );
  const negativeSource = findRecord(
    balances.inventory_balances,
    (item) => Number(item.quantity) > 0,
    "inventory balance for permission boundary",
  );
  const negative = await login(browser, { ...options, roleKey: "sales" });
  try {
    report.negativePermissions.push(
      await expectPermissionDenied(
        negative.page,
        "inventory",
        "create_inventory_operation",
        {
          operation_no: `NEG-INV-${Date.now()}`,
          operation_type: "MANUAL_ADJUSTMENT",
          reason: "无权角色服务端拒绝验证",
          idempotency_key: `negative-inventory-adjustment/${Date.now()}`,
          items: [
            {
              line_no: "1",
              subject_type: negativeSource.subject_type,
              subject_id: negativeSource.subject_id,
              ...(negativeSource.product_sku_id
                ? { product_sku_id: negativeSource.product_sku_id }
                : {}),
              from_warehouse_id: negativeSource.warehouse_id,
              ...(negativeSource.lot_id
                ? { from_lot_id: negativeSource.lot_id }
                : {}),
              unit_id: negativeSource.unit_id,
              adjustment_quantity: "0.100000",
              note: "结构有效的无权请求",
            },
          ],
        },
      ),
    );
  } finally {
    await negative.context.close();
  }

  const operationNo = `BROWSER-INV-ADJ-${Date.now()}`;
  const flow = {
    key: "inventory_adjustment",
    sourceSetup: "browser_selected_real_inventory_balance",
    browserActions: [],
    readbacks: [],
  };
  let operation;
  try {
    await goto(
      session.page,
      options.baseURL,
      "/erp/warehouse/inventory",
      "库存台账",
    );
    const firstRow = session.page.locator("tbody tr.ant-table-row").first();
    await firstRow.waitFor({ state: "visible" });
    await firstRow.click();
    await session.page
      .getByRole("button", { name: "人工调整", exact: true })
      .click();
    const modal = await visibleModal(session.page, "登记人工库存调整");
    await modal.getByLabel("作业单号").fill(operationNo);
    await modal.getByLabel("业务原因").fill("真实浏览器异常流验收");
    await modal
      .getByLabel("调整数量（增加填正数，扣减填负数）")
      .fill("0.100000");
    await modal.getByLabel("明细备注").fill("真实浏览器创建与审批");
    const createResponse = waitForRpcResponse(
      session.page,
      "inventory",
      "create_inventory_operation",
    );
    await modal.getByRole("button", { name: "生成调整作业", exact: true }).click();
    operation = resultDataFromResponse(await createResponse).inventory_operation;
    assert.ok(operation?.id);
    await waitMessage(session.page, "人工库存调整已提交审批");
    const submitted = (
      await browserRpc(
        session.page,
        "inventory",
        "get_inventory_operation",
        { id: operation.id },
      )
    ).inventory_operation;
    assert.equal(submitted.status, "SUBMITTED");
    flow.source = {
      id: operation.id,
      no: operationNo,
      status: submitted.status,
      version: submitted.version,
    };
    flow.browserActions.push("warehouse_create_and_submit_click");
    const processBefore = await browserRpc(
      session.page,
      "customer_config",
      "get_inventory_adjustment_approval_process",
      { customer_key: CUSTOMER_KEY, inventory_operation_id: operation.id },
    );
    flow.processBeforeApproval = summarizeProcess(processBefore);
    await session.context.close();

    const approvalTaskAction = await approveInventoryTaskInBrowser(
      browser,
      options,
      operationNo,
    );
    const executionTaskAction = await actOnTaskInBrowser(browser, options, {
      roleKey: "warehouse",
      sourceNo: operationNo,
      actionTitle: "处理完成",
      confirmLabel: "确认完成",
      successMessage: "任务已处理完成",
    });
    flow.taskActions = [
      approvalTaskAction,
      executionTaskAction,
    ];

    const execution = await login(browser, {
      ...options,
      roleKey: "warehouse",
    });
    try {
      await goto(
        execution.page,
        options.baseURL,
        `/erp/warehouse/inventory?inventory_operation_id=${operation.id}`,
        "库存台账",
      );
      await execution.page
        .getByText(new RegExp(`${operationNo}.*已批准`, "u"))
        .first()
        .waitFor({ state: "visible" });
      const approved = (
        await browserRpc(
          execution.page,
          "inventory",
          "get_inventory_operation",
          { id: operation.id },
        )
      ).inventory_operation;
      assert.equal(approved.status, "APPROVED");
      const sourceLine = approved.items[0];
      const beforeBalances = await browserRpc(
        execution.page,
        "inventory",
        "list_inventory_balances",
        {
          subject_type: sourceLine.subject_type,
          subject_id: sourceLine.subject_id,
          warehouse_id: sourceLine.from_warehouse_id,
          lot_id: sourceLine.from_lot_id,
          limit: 100,
          offset: 0,
        },
      );
      const before = findRecord(
        beforeBalances.inventory_balances,
        (item) =>
          Number(item.warehouse_id) === Number(sourceLine.from_warehouse_id) &&
          Number(item.lot_id || 0) === Number(sourceLine.from_lot_id || 0),
        "inventory adjustment source balance",
      );

      const lost = await installLostMutationResponse(
        execution.page,
        "customer_config",
        "execute_inventory_adjustment_post",
      );
      await execution.page
        .getByRole("button", { name: /^过\s*账$/u })
        .click();
      await confirmPopover(execution.page, "确认过账这张库存作业？", "确认过账");
      await waitRecoveryMessage(
        execution.page,
        "已重新读取库存作业结果",
        lost,
      );
      await lost.remove();
      assert.equal(lost.state.injected, true);
      assert.equal(lost.state.backendResultCode, 0);
      report.simulatedTransportFaults.push(lost.state);
      flow.browserActions.push("warehouse_post_click");

      const posted = (
        await browserRpc(
          execution.page,
          "inventory",
          "get_inventory_operation",
          { id: operation.id },
        )
      ).inventory_operation;
      assert.equal(posted.status, "POSTED");
      const postedTxns = await browserRpc(
        execution.page,
        "inventory",
        "list_inventory_txns",
        {
          source_type: "INVENTORY_OPERATION",
          source_id: operation.id,
          limit: 100,
          offset: 0,
        },
      );
      assert.ok(postedTxns.inventory_txns.length > 0);
      flow.readbacks.push({
        stage: "posted",
        status: posted.status,
        version: posted.version,
        inventoryTxnCount: postedTxns.inventory_txns.length,
      });

      await execution.page
        .getByRole("button", { name: "核对并取消", exact: true })
        .click();
      const cancelModal = await visibleModal(execution.page, "取消库存作业");
      await cancelModal
        .getByPlaceholder("请填写取消原因")
        .fill("真实浏览器异常流验收冲正");
      await cancelModal
        .getByRole("button", { name: "确认取消", exact: true })
        .click();
      await waitMessage(execution.page, "库存作业已取消");
      flow.browserActions.push("warehouse_cancel_and_reverse_click");

      const cancelled = (
        await browserRpc(
          execution.page,
          "inventory",
          "get_inventory_operation",
          { id: operation.id },
        )
      ).inventory_operation;
      assert.equal(cancelled.status, "CANCELLED");
      const afterBalances = await browserRpc(
        execution.page,
        "inventory",
        "list_inventory_balances",
        {
          subject_type: sourceLine.subject_type,
          subject_id: sourceLine.subject_id,
          warehouse_id: sourceLine.from_warehouse_id,
          lot_id: sourceLine.from_lot_id,
          limit: 100,
          offset: 0,
        },
      );
      const after = findRecord(
        afterBalances.inventory_balances,
        (item) =>
          Number(item.warehouse_id) === Number(sourceLine.from_warehouse_id) &&
          Number(item.lot_id || 0) === Number(sourceLine.from_lot_id || 0),
        "cancelled inventory adjustment source balance",
      );
      assert.equal(String(after.quantity), String(before.quantity));
      const reversedTxns = await browserRpc(
        execution.page,
        "inventory",
        "list_inventory_txns",
        {
          source_type: "INVENTORY_OPERATION",
          source_id: operation.id,
          limit: 100,
          offset: 0,
        },
      );
      assert.ok(reversedTxns.inventory_txns.length > postedTxns.inventory_txns.length);
      flow.readbacks.push({
        stage: "cancelled",
        status: cancelled.status,
        version: cancelled.version,
        inventoryTxnCount: reversedTxns.inventory_txns.length,
        balanceRestored: true,
      });
      flow.retry = await expectRetryRejected(
        execution.page,
        "inventory",
        "cancel_inventory_operation",
        {
          id: operation.id,
          expected_version: posted.version,
          reason: "重复取消必须拒绝",
        },
      );
      flow.processAfter = summarizeProcess(
        await browserRpc(
          execution.page,
          "customer_config",
          "get_inventory_adjustment_approval_process",
          { customer_key: CUSTOMER_KEY, inventory_operation_id: operation.id },
        ),
      );
      flow.passed = true;
      return flow;
    } finally {
      await execution.context.close();
    }
  } finally {
    if (!session.context.pages().every((page) => page.isClosed())) {
      await session.context.close().catch(() => {});
    }
  }
}

async function runProductionExceptionFlow(browser, options, report) {
  const session = await login(browser, { ...options, roleKey: "production" });
  const flow = {
    key: "production_exception_over_issue",
    sourceSetup: "existing_isolated_dataset_approved_over_issue_decision",
    browserActions: [],
    readbacks: [],
  };
  let draft;
  try {
    const decisions = await browserRpc(
      session.page,
      "operational_fact",
      "list_production_exceptions",
      { status: "APPROVED", limit: 100, offset: 0 },
    );
    const decision = findRecord(
      decisions.production_exceptions,
      (item) =>
        item.status === "APPROVED" &&
        item.decision_type === "OVER_ISSUE" &&
        Number(item.approved_quantity || 0) > 0,
      "approved over-issue decision",
    );
    const productionOrder = await browserRpc(
      session.page,
      "production_order",
      "get_production_order",
      { production_order_id: decision.production_order_id },
    );
    const productionOrderNo = requiredText(
      productionOrder.production_order?.order_no,
      "production order number",
    );
    const process = await browserRpc(
      session.page,
      "customer_config",
      "get_production_exception_approval_process",
      { customer_key: CUSTOMER_KEY, production_exception_id: decision.id },
    );
    const requirements = await browserRpc(
      session.page,
      "operational_fact",
      "list_production_order_material_requirements",
      {
        customer_key: CUSTOMER_KEY,
        production_order_id: decision.production_order_id,
      },
    );
    const requirement = findRecord(
      requirements.material_requirements,
      (item) =>
        Number(item.id) ===
        Number(decision.production_material_requirement_id),
      "approved over-issue material requirement",
    );
    assert.ok(Number(requirement.remaining_quantity) > 0);
    const balances = await browserRpc(
      session.page,
      "inventory",
      "list_inventory_balances",
      {
        subject_type: "MATERIAL",
        subject_id: requirement.material_id,
        limit: 200,
        offset: 0,
      },
    );
    const sourceBalance = findRecord(
      balances.inventory_balances,
      (item) =>
        Number(item.lot_id || 0) > 0 &&
        Number(item.unit_id || 0) === Number(requirement.unit_id) &&
        Number(item.quantity || 0) >= Number(requirement.remaining_quantity),
      "sufficient material lot balance for approved over-issue",
    );
    const warehouses = await browserRpc(
      session.page,
      "masterdata",
      "list_warehouses",
      { active_only: true, limit: 200, offset: 0 },
    );
    const sourceWarehouse = findRecord(
      warehouses.warehouses,
      (item) => Number(item.id) === Number(sourceBalance.warehouse_id),
      "material issue warehouse",
    );
    const lots = await browserRpc(
      session.page,
      "inventory",
      "list_inventory_lots",
      {
        subject_type: "MATERIAL",
        subject_id: requirement.material_id,
        warehouse_id: sourceBalance.warehouse_id,
        status: "ACTIVE",
        limit: 200,
        offset: 0,
      },
    );
    const sourceLot = findRecord(
      lots.inventory_lots,
      (item) => Number(item.id) === Number(sourceBalance.lot_id),
      "material issue lot",
    );
    flow.source = {
      decisionID: decision.id,
      decisionNo: decision.decision_no,
      decisionStatus: decision.status,
      executionStatus: decision.execution_status,
      productionOrderID: decision.production_order_id,
      productionOrderNo,
      requirementID: requirement.id,
      remainingQuantity: requirement.remaining_quantity,
    };
    flow.inventoryPrecondition = {
      warehouseID: sourceWarehouse.id,
      warehouseCode: sourceWarehouse.code,
      lotID: sourceLot.id,
      lotNo: sourceLot.lot_no,
      availableQuantity: sourceBalance.quantity,
      unitID: sourceBalance.unit_id,
    };
    flow.processBefore = summarizeProcess(process);

    await goto(
      session.page,
      options.baseURL,
      `/erp/production/orders?keyword=${encodeURIComponent(productionOrderNo)}`,
      "生产订单",
    );
    await selectRow(session.page, productionOrderNo);
    await session.page
      .locator("button.ant-btn")
      .filter({ hasText: /^\s*查看\s*$/u })
      .first()
      .click();
    const orderModal = await visibleModal(session.page, "查看生产订单");
    const requirementRow = orderModal
      .locator("tbody tr.ant-table-row")
      .filter({ hasText: requirement.material_code_snapshot })
      .first();
    await requirementRow.waitFor({ state: "visible" });
    await requirementRow
      .getByRole("button", { name: /^领\s*料$/u })
      .click();
    const issueModal = await visibleModal(session.page, "生产领料");
    const warehouseLabel = [sourceWarehouse.name, sourceWarehouse.code]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ");
    const warehouseField = issueModal
      .locator(".ant-form-item")
      .filter({ hasText: "领料仓库" })
      .first();
    const warehouseCombobox = warehouseField.getByRole("combobox");
    await warehouseField
      .locator(".ant-select-selection-item")
      .waitFor({ state: "visible" });
    await warehouseField.locator(".ant-select-selector").click();
    await warehouseCombobox.fill(warehouseLabel);
    await session.page
      .locator(".ant-select-dropdown:visible .ant-select-item-option")
      .filter({ hasText: warehouseLabel })
      .first()
      .waitFor({ state: "visible" });
    await warehouseCombobox.press("ArrowDown");
    await warehouseCombobox.press("Enter");
    await warehouseField
      .locator(".ant-select-selection-item")
      .filter({ hasText: warehouseLabel })
      .waitFor({ state: "visible" });
    const lotField = issueModal
      .locator(".ant-form-item")
      .filter({ hasText: "材料批次" })
      .first();
    const lotCombobox = lotField.getByRole("combobox");
    await lotField.locator(".ant-select-selector").click();
    await lotCombobox.fill(sourceLot.lot_no);
    await session.page
      .locator(".ant-select-dropdown:visible .ant-select-item-option")
      .filter({ hasText: sourceLot.lot_no })
      .first()
      .waitFor({ state: "visible" });
    await lotCombobox.press("ArrowDown");
    await lotCombobox.press("Enter");
    await lotField
      .locator(".ant-select-selection-item")
      .filter({ hasText: sourceLot.lot_no })
      .waitFor({ state: "visible" });
    await issueModal
      .getByLabel("本次领料数量")
      .fill(String(requirement.remaining_quantity));
    await issueModal
      .locator("textarea")
      .fill("真实浏览器消费已批准超领额度");
    const lost = await installLostMutationResponse(
      session.page,
      "operational_fact",
      "create_production_material_issue_from_order",
    );
    await issueModal
      .getByRole("button", { name: "生成领料记录", exact: true })
      .click();
    await waitRecoveryMessage(
      session.page,
      "已重新读取并确认领料草稿，请到生产记录核对并过账",
      lost,
    );
    await lost.remove();
    assert.equal(lost.state.injected, true);
    assert.equal(lost.state.backendResultCode, 0);
    report.simulatedTransportFaults.push(lost.state);
    flow.browserActions.push("production_material_issue_create_click");

    const facts = await browserRpc(
      session.page,
      "operational_fact",
      "list_production_facts",
      {
        source_type: "PRODUCTION_ORDER",
        source_id: decision.production_order_id,
        limit: 100,
        offset: 0,
      },
    );
    draft = findRecord(
      facts.production_facts,
      (item) =>
        item.status === "DRAFT" &&
        item.fact_type === "MATERIAL_ISSUE" &&
        Number(item.source_line_id) === Number(requirement.id),
      "over-issue material issue draft",
    );
    flow.readbacks.push({
      stage: "draft",
      factID: draft.id,
      factNo: draft.fact_no,
      status: draft.status,
      version: draft.version,
      quantity: draft.quantity,
    });

    await goto(
      session.page,
      options.baseURL,
      `/erp/production/progress?source_type=PRODUCTION_ORDER&source_id=${decision.production_order_id}&fact_id=${draft.id}`,
      "生产进度",
    );
    await selectRow(session.page, draft.fact_no);
    await session.page
      .locator("button.erp-business-module-status-action")
      .filter({ hasText: /^\s*过账\s*$/u })
      .click();
    await confirmPopover(session.page, "确认过账？");
    await waitMessage(session.page, "过账已完成");
    flow.browserActions.push("production_fact_post_click");

    const posted = findRecord(
      (
        await browserRpc(
          session.page,
          "operational_fact",
          "list_production_facts",
          {
            source_type: "PRODUCTION_ORDER",
            source_id: decision.production_order_id,
            limit: 100,
            offset: 0,
          },
        )
      ).production_facts,
      (item) => Number(item.id) === Number(draft.id),
      "posted over-issue material issue",
    );
    assert.equal(posted.status, "POSTED");
    const consumed = await browserRpc(
      session.page,
      "operational_fact",
      "list_production_order_material_requirements",
      {
        customer_key: CUSTOMER_KEY,
        production_order_id: decision.production_order_id,
      },
    );
    const consumedRequirement = findRecord(
      consumed.material_requirements,
      (item) => Number(item.id) === Number(requirement.id),
      "consumed over-issue requirement",
    );
    assert.equal(Number(consumedRequirement.remaining_quantity), 0);
    flow.readbacks.push({
      stage: "posted",
      status: posted.status,
      version: posted.version,
      remainingQuantity: consumedRequirement.remaining_quantity,
    });

    const unauthorized = await login(browser, {
      ...options,
      roleKey: "sales",
    });
    try {
      report.negativePermissions.push(
        await expectPermissionDenied(
          unauthorized.page,
          "operational_fact",
          "cancel_production_fact",
          {
            customer_key: CUSTOMER_KEY,
            id: posted.id,
            expected_version: posted.version,
            reason: "无权角色服务端拒绝验证",
          },
        ),
      );
    } finally {
      await unauthorized.context.close();
    }

    await selectRow(session.page, draft.fact_no);
    await session.page
      .locator("button.erp-business-module-status-action")
      .filter({ hasText: /^\s*取消\s*$/u })
      .click();
    const cancelModal = await visibleModal(session.page, "取消已过账业务记录");
    await cancelModal
      .getByPlaceholder("请填写作废或取消的业务原因")
      .fill("真实浏览器异常流验收冲正");
    const cancelResponse = waitForRpcResponse(
      session.page,
      "operational_fact",
      "cancel_production_fact",
    );
    await cancelModal.getByRole("button", { name: "确认取消", exact: true }).click();
    resultDataFromResponse(await cancelResponse);
    await cancelModal.waitFor({ state: "hidden" });
    flow.browserActions.push("production_fact_cancel_and_reverse_click");

    const cancelled = findRecord(
      (
        await browserRpc(
          session.page,
          "operational_fact",
          "list_production_facts",
          {
            source_type: "PRODUCTION_ORDER",
            source_id: decision.production_order_id,
            limit: 100,
            offset: 0,
          },
        )
      ).production_facts,
      (item) => Number(item.id) === Number(draft.id),
      "cancelled over-issue material issue",
    );
    assert.equal(cancelled.status, "CANCELLED");
    const restored = await browserRpc(
      session.page,
      "operational_fact",
      "list_production_order_material_requirements",
      {
        customer_key: CUSTOMER_KEY,
        production_order_id: decision.production_order_id,
      },
    );
    const restoredRequirement = findRecord(
      restored.material_requirements,
      (item) => Number(item.id) === Number(requirement.id),
      "restored over-issue requirement",
    );
    assert.equal(
      String(restoredRequirement.remaining_quantity),
      String(requirement.remaining_quantity),
    );
    flow.readbacks.push({
      stage: "cancelled",
      status: cancelled.status,
      version: cancelled.version,
      remainingQuantity: restoredRequirement.remaining_quantity,
      allowanceRestored: true,
    });
    flow.retry = await expectRetryRejected(
      session.page,
      "operational_fact",
      "cancel_production_fact",
      {
        customer_key: CUSTOMER_KEY,
        id: posted.id,
        expected_version: posted.version,
        reason: "重复取消必须拒绝",
      },
    );
    flow.passed = true;
    return flow;
  } finally {
    await session.context.close();
  }
}

async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function runExceptionFlowRealWriteBrowser(options) {
  const requireFromWeb = createRequire(
    path.join(REPO_ROOT, "web", "package.json"),
  );
  const { chromium } = requireFromWeb("playwright");
  const report = {
    scope: "exception-flow-real-write-browser",
    startedAt: new Date().toISOString(),
    completedAt: null,
    customerKey: CUSTOMER_KEY,
    baseURL: options.baseURL,
    backendURL: options.backendURL,
    databaseName: options.databaseName,
    boundary: {
      realBrowser: true,
      realLocalBackend: true,
      isolatedDatabaseRequired: true,
      authenticationWritesDatabase: true,
      authenticationWriteFields: ["admin_users.last_login_at"],
      clicksBusinessWriteActions: true,
      callsBusinessMutationRPCFromProductUI: true,
      primaryBusinessMutationsViaProductUI: true,
      directBrowserContextMutationRPC: [
        "negative_permission_probes",
        "duplicate_or_stale_retry_probes",
      ],
      businessReadOnly: false,
      mockBusinessResults: false,
      simulatedTransportFaultOnly: true,
      customerUAT: false,
      deploymentEvidence: false,
      passwordStored: false,
      tokenStored: false,
    },
    roleSource: "FORMAL_DEMO_ACCOUNT_PROFILES",
    roles: ["sales", "warehouse", "boss", "finance", "production"].map(
      (roleKey) => ({
        roleKey,
        username: accountForRole(roleKey).username,
      }),
    ),
    runtimeIdentity: null,
    flows: [],
    negativePermissions: [],
    simulatedTransportFaults: [],
    failures: [],
    summary: {
      passed: false,
      passedFlowCount: 0,
      failedFlowCount: 0,
      flowCount: 4,
    },
  };
  let browser;
  try {
    report.runtimeIdentity = await verifyRuntimeIdentity(options);
    browser = await chromium.launch({ headless: !options.headed });
    const runners = [
      runSalesReturnFlow,
      runFinancePaymentFlow,
      runInventoryAdjustmentFlow,
      runProductionExceptionFlow,
    ];
    for (const runner of runners) {
      try {
        report.flows.push(await runner(browser, options, report));
      } catch (error) {
        report.failures.push({
          runner: runner.name,
          message: String(error?.message || error),
        });
        throw error;
      }
    }
    report.summary.passedFlowCount = report.flows.filter(
      (flow) => flow.passed,
    ).length;
    report.summary.failedFlowCount =
      report.summary.flowCount - report.summary.passedFlowCount;
    assertExceptionFlowEvidenceContract(report);
    report.summary.passed = true;
    assert.equal(report.summary.passed, true);
  } finally {
    if (browser) await browser.close();
    report.completedAt = new Date().toISOString();
    report.summary.passedFlowCount = report.flows.filter(
      (flow) => flow.passed,
    ).length;
    report.summary.failedFlowCount =
      report.summary.flowCount - report.summary.passedFlowCount;
    await writeReport(options.reportPath, report);
  }
  return report;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  let options;
  try {
    options = parseExceptionFlowArgs(process.argv.slice(2));
    const report = await runExceptionFlowRealWriteBrowser(options);
    process.stdout.write(
      `[exception-flow-real-write-browser] passed ${report.summary.passedFlowCount}/${report.summary.flowCount}; report=${path.relative(REPO_ROOT, options.reportPath)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `[exception-flow-real-write-browser] ${String(error?.message || error)}\n`,
    );
    process.exitCode = Number(error?.exitCode || 1);
  }
}
