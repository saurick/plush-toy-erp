import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { browserRPCURL } from "./browser-write-target.mjs";
import { consumeExpectedRPCFailure, trackBrowserRPCNetwork } from "./transaction-browser-network.mjs";
import { resolveMobileTaskBusinessEntry } from "../../web/src/erp/mobile/utils/mobileTaskBusiness.mjs";
import { waitForFiniteAnimations } from "../../web/scripts/style-l1/browserReadiness.mjs";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { expect } = require("playwright/test");

export function businessURL(options, role, route) {
  return `${options.baseURL}${options.mobile ? `/m/${role}/handle/${route}` : `/erp/${route}`}`;
}

export function flowKey(options, key) {
  return `${options.mobile ? "mobile_" : ""}${key}`;
}

export async function openMobileTaskCard(page, taskID) {
  const card = page.locator(`[data-mobile-task-id="${taskID}"]`);
  await expect(card).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  const open = card.locator("button.erp-task-card__open");
  const heading = card.locator(".erp-task-identity__heading");
  await expect(heading).toHaveCount(1);
  const titleBox = await heading.boundingBox();
  const buttonBox = await open.boundingBox();
  assert.ok(titleBox && buttonBox);
  const point = {
    x: titleBox.x + titleBox.width / 2,
    y: titleBox.y + titleBox.height / 2,
  };
  await expect.poll(
    () => open.evaluate(
      (element, position) =>
        document.elementFromPoint(position.x, position.y) === element,
      point,
    ),
    { message: "task title must hit its primary open button after transient feedback clears" },
  ).toBe(true);
  // The thumbnail has its own image-preview action; touch the task heading.
  await open.tap({
    position: { x: point.x - buttonBox.x, y: point.y - buttonBox.y },
  });
}

export async function openMobileTaskList(page, options, role) {
  assert.equal(options.mobile, true);
  const taskURL = `${options.baseURL}/m/${role}/tasks`;
  // Preserve a closed form when switching tasks in the same screen; reloading
  // restores the source task and opens its focused form again.
  if (page.url() !== taskURL) await navigate(page, taskURL);
  else await settleRPCPage(page);
  for (const screenID of ['mobile-task-action-screen', 'mobile-task-desktop-review']) {
    const screen = page.getByTestId(screenID);
    if (await screen.isVisible()) {
      await screen.getByRole('button', { name: '返回任务详情', exact: true }).first().click();
      await expect(page.getByTestId('mobile-task-detail-screen')).toBeVisible();
      await settleRPCPage(page);
    }
  }
  const receiptScreen = page.getByTestId("mobile-task-receipt-screen");
  if (await receiptScreen.isVisible()) {
    await receiptScreen.getByRole("button", { name: "返回任务列表", exact: true }).first().click();
  } else if (await page.getByTestId("mobile-task-detail-screen").isVisible()) {
    await page.getByTestId("mobile-task-detail-screen").getByRole("button", { name: "返回任务列表", exact: true }).first().click();
  }
  await page.getByTestId("mobile-role-nav-tasks").click();
  await expect(page.getByTestId('mobile-role-task-list')).toBeVisible();
}

export async function openMobileSourceTask(page, options, client, role, sourceType, sourceID, groups) {
  assert.equal(options.mobile, true);
  const { tasks } = await client.rpc(role, "workflow", "list_tasks", {
    source_type: sourceType,
    source_id: sourceID,
    limit: 100,
  });
  const candidates = tasks.filter(task => task.source_type === sourceType && task.source_id === sourceID && task.owner_role_key === role && groups.includes(task.task_group));
  assert.equal(candidates.length, 1, `${sourceType}:${sourceID} must have one authoritative task for ${groups.join(",")}`);
  const [task] = candidates;
  assert.ok(resolveMobileTaskBusinessEntry(task), "the actual source task must resolve to an exact task form");
  await openMobileTaskList(page, options, role);
  const actionScreen = page.getByTestId("mobile-task-action-screen");
  await page.getByLabel("任务状态", { exact: true }).getByText(
    ["done", "withdrawn", "cancelled"].includes(task.task_status_key) ? "已办" : "待办",
    { exact: true },
  ).click();
  assert.ok(task.source_no, "a source task must expose its real business reference");
  const search = page.getByRole("searchbox");
  await search.fill(task.source_no);
  await search.press("Enter");
  await openMobileTaskCard(page, task.id);
  const detail = page.getByTestId("mobile-task-detail-screen");
  await expect(detail).toBeVisible();
  const entry = detail.locator('.mobile-role-action-bar').getByRole("button", { name: /^(任务办理|选择处理方式)$/u });
  await expect(entry).toHaveCount(1);
  await expect(entry).toBeEnabled();
  if ((await entry.textContent()).trim() === "选择处理方式") {
    await entry.click();
    await page.getByTestId("mobile-task-action-screen").getByRole('main').getByRole("button", { name: "任务办理", exact: true }).click();
  } else await entry.click();
  assert.equal(new URL(page.url()).pathname, `/m/${role}/tasks`, "fact handling must remain inside the current mobile task screen");
  const form = page.getByTestId("mobile-task-fact-form");
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("data-source-type", sourceType);
  await expect(form).toHaveAttribute("data-source-id", String(sourceID));
  await expect(actionScreen.getByTestId("mobile-task-flow-steps").locator("[data-step-key]")).toHaveCount(3);
  await assertMobileLayout(page, options);
  await settleRPCPage(page);
  return task;
}

export async function openDesktopTaskRow(page, task, sourceNo) {
  const row = page.locator(`tr.erp-task-table-row[data-row-key="${task.id}"]`);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(sourceNo);
  await expect(row).toHaveAttribute("data-task-code", task.task_code);
  const entry = row.locator("button[data-task-entry]");
  await expect(entry).toHaveCount(1);
  await entry.press("Enter");
}

export async function assertMobileLayout(page, options) {
  if (!options.mobile) return;
  const taskScreen = /^\/m\/[a-z_]+\/tasks$/u.test(new URL(page.url()).pathname);
  await expect(
    page.locator(taskScreen ? '[data-task-business-page="true"]' : '[data-mobile-business-page="true"]'),
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

export async function selectOption(page, control, label) {
  await waitForFiniteAnimations(page, { selector: ".ant-modal" });
  await control
    .locator("xpath=ancestor::div[contains(@class,'ant-select-selector')][1]")
    .click();
  const listboxID = await control.getAttribute("aria-controls");
  assert.ok(listboxID, "select control must identify its own listbox");
  const dropdown = page.locator(`[id=${JSON.stringify(listboxID)}]`)
    .locator("xpath=ancestor::div[contains(@class,'ant-select-dropdown')][1]");
  await expect(dropdown).toBeVisible();
  await waitForFiniteAnimations(page, { selector: ".ant-select-dropdown" });
  const option = dropdown.getByText(label, { exact: true });
  await expect(option).toHaveCount(1);
  await option.click();
  const multiple = await control.evaluate(node => node.closest(".ant-select").classList.contains("ant-select-multiple"));
  if (multiple) {
    const selectedOption = option.locator("xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' ant-select-item-option ')][1]");
    await expect(selectedOption).toHaveClass(/ant-select-item-option-selected/u);
    await control.press("Escape");
  }
  await expect(control).toHaveAttribute("aria-expanded", "false");
}
export async function selectRow(page, id) {
  if (/^\/m\/[a-z_]+\/tasks$/u.test(new URL(page.url()).pathname)) {
    const source = page.getByTestId("mobile-task-business-source");
    await expect(source).toHaveCount(1);
    await expect(source).toHaveAttribute("data-record-id", String(id));
    return;
  }
  const row = page.locator(`.ant-table-row[data-row-key="${id}"]:visible`);
  await expect(row).toHaveCount(1);
  const radio = row.getByRole("radio");
  await radio.check();
  await expect(radio).toBeChecked();
}
export async function pageAction(page, label) {
  const browserPage = typeof page.page === 'function' ? page.page() : page;
  const direct = page.locator("button:visible").filter({ hasText: label });
  const more = page.getByRole("button", { name: /^更多操作，共 \d+ 项$/u });
  const otherActions = page.locator('details.mobile-task-business-other-actions:not([open])')
    .filter({ has: browserPage.locator('button').filter({ hasText: label }) });
  await expect.poll(async () => (await direct.count()) > 0 || await more.isVisible() || (await otherActions.count()) > 0).toBe(true);
  if ((await direct.count()) > 0) {
    await expect(direct).toHaveCount(1);
    return direct.click();
  }
  if (await otherActions.count()) {
    await expect(otherActions).toHaveCount(1);
    await otherActions.locator('summary').click();
  } else await more.click();
  await expect(direct).toHaveCount(1);
  await direct.click();
}
export async function modal(page, title) {
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.locator(".ant-modal-title").filter({ hasText: title }) })
    .filter({ has: page.getByText(title, { exact: true }) });
  await expect(dialog).toBeVisible();
  await waitForFiniteAnimations(page, { selector: ".ant-modal" });
  return dialog;
}
export async function settleRPCPage(page) {
  await page.waitForLoadState("networkidle");
  if (page.rpcNetwork) await page.rpcNetwork.flushCancellations();
  await expect.poll(() => page.pendingRPC.size).toBe(0);
  await Promise.all([...page.rpcResponses]);
  // Let collected results mount views and deliver IntersectionObserver reads.
  // Drain those reads before replacing the document or closing its context.
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));
  await page.waitForLoadState("networkidle");
  if (page.rpcNetwork) await page.rpcNetwork.flushCancellations();
  await expect.poll(() => page.pendingRPC.size).toBe(0);
  await Promise.all([...page.rpcResponses]);
}
export async function navigate(page, url) {
  await settleRPCPage(page);
  await page.goto(url);
  await settleRPCPage(page);
}
export async function closePage(page, context) {
  await settleRPCPage(page);
  await context.unrouteAll({ behavior: "wait" });
  await Promise.all([...page.rpcResponses]);
  assert.equal(
    page.rpcRecorded,
    page.rpcNetwork.counts.completed,
    "every completed network RPC must have a collected business response",
  );
  assert.equal(
    page.rpcNetwork.counts.started,
    page.rpcNetwork.counts.completed +
      page.rpcNetwork.counts.failed +
      page.rpcNetwork.counts.navigationAborted +
      page.rpcNetwork.counts.scopeAborted,
    "every dispatched RPC must complete, fail or have proven read cancellation evidence",
  );
  assert.equal(page.rpcNetwork.unclassifiedCancellations.size, 0, "unproven cancellations cannot be left out of the result");
  await context.close();
}
export async function clickRPC(page, method, action, code = 0) {
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
export async function login(browser, options, role, report) {
  const context = await browser.newContext({
    viewport: options.mobile
      ? { width: 390, height: 844 }
      : options.fourK
        ? { width: 1920, height: 1080 }
        : { width: 1600, height: 1000 },
    isMobile: Boolean(options.mobile),
    hasTouch: Boolean(options.mobile),
    deviceScaleFactor: options.fourK && !options.mobile ? 2 : 1,
  });
  // The authenticated proxy probe proves that Vite forwards to this isolated backend.
  const page = await context.newPage();
  page.rpcResponses = new Set();
  page.expectedRPCFailures = new Map();
  page.rpcRecorded = 0;
  const transportFailure = (request, failure) => {
    const { method, params } = request.postDataJSON();
    if (consumeExpectedRPCFailure(request, page.expectedRPCFailures)) return;
    report.pageErrors.push({
      role,
      surface: options.mobile ? "mobile" : "desktop",
      method,
      taskID: params?.task_id,
      timing: request.timing(),
      url: page.url(),
      responseStatus: request.response?.status,
      serverRequestID: Object.entries(request.response?.headers || {}).find(([key]) => key.toLowerCase() === "x-request-id")?.[1],
      cancellationClassification: request.cancellationDecision?.reason,
      message: "Unexpected RPC transport failure",
      failure,
    });
  };
  page.rpcNetwork = await trackBrowserRPCNetwork(context, page, {
    onFailure: (request, event) =>
      transportFailure(request, {
        errorText: event.errorText,
        canceled: Boolean(event.canceled),
        requestID: event.requestId,
      }),
    onComplete(request, readBody) {
      const collected = (async () => {
        try {
          const body = await readBody();
          const data = JSON.parse(body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body);
          assert.ok(Number.isInteger(data.result?.code), "completed RPC needs a business result code");
          report.browserRPC.push({
            role,
            surface: options.mobile ? "mobile" : "desktop",
            method: request.postDataJSON().method,
            code: data.result.code,
            http: request.response.status,
            requestID: Object.entries(request.response.headers).find(([key]) => key.toLowerCase() === "x-request-id")?.[1],
          });
          page.rpcRecorded++;
        } catch (error) {
          report.pageErrors.push({ role, message: `Unreadable RPC response: ${error.message}`, method: request.postDataJSON().method });
        }
      })();
      page.rpcResponses.add(collected);
      void collected.finally(() => page.rpcResponses.delete(collected));
    },
  });
  page.pendingRPC = page.rpcNetwork.pending;
  (report.networkPages ??= []).push({
    role,
    surface: options.mobile ? "mobile" : "desktop",
    counts: page.rpcNetwork.counts,
    cancellations: page.rpcNetwork.cancellations,
    history: page.rpcNetwork.history,
  });
  page.on("requestfailed", request => {
    if (["script", "stylesheet"].includes(request.resourceType())) {
      (report.assetErrors ??= []).push({ url: request.url(), failure: request.failure()?.errorText });
    }
  });
  page.on("response", response => {
    if (response.status() >= 400 && ["script", "stylesheet"].includes(response.request().resourceType())) {
      (report.assetErrors ??= []).push({ url: response.url(), status: response.status() });
    }
  });
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) =>
    report.pageErrors.push({ role, message: error.message, stack: error.stack }),
  );
  try {
  await navigate(page, `${options.baseURL}/admin-login`);
  if (options.mobile)
    await page
      .locator(".ant-segmented-item")
      .filter({ hasText: "手机版" })
      .click();
  await page
    .getByLabel("账号", { exact: true })
    .fill(role === "admin" ? options.adminUsername : `demo_${role}`);
  await page
    .getByLabel("密码", { exact: true })
    .fill(role === "admin" ? options.adminPassword : options.rolePassword);
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
  await settleRPCPage(page);
  return { page, context };
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  }
}
export async function captureFailure(page, options, report, error) {
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
    dialogs: await page.locator('.ant-modal').evaluateAll((nodes) => nodes.map((node) => ({
      title: node.querySelector('.ant-modal-title')?.textContent,
      role: node.getAttribute('role'),
      hiddenBy: node.closest('[aria-hidden="true"], [inert]')?.className || null,
      visible: Boolean(node.getClientRects().length),
      buttons: [...node.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled, hidden: Boolean(button.closest('[aria-hidden="true"], [inert]')), visible: Boolean(button.getClientRects().length) })),
    }))),
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
export async function dropRealResponse(page, options, domain, method) {
  const state = { method, injected: false, backendCode: null };
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  page.expectedRPCFailures.set(method, state);
  const pattern = `**/rpc/${domain}`;
  const handler = async (route) => {
    if (state.captured || route.request().postDataJSON()?.method !== method)
      return route.fallback();
    state.captured = true;
    try {
      const response = await route.fetch({
        url: browserRPCURL(options.backendURL, route.request().url()),
        maxRedirects: 0,
        timeout: 30000,
      });
      const body = await response.json();
      state.params = route.request().postDataJSON().params;
      state.backendCode = body.result?.code;
      state.requestID = response.headers()["x-request-id"];
      state.injectionStarted = true;
      await route.abort("failed");
      state.injected = true;
    } catch (error) {
      state.failure = error;
    } finally {
      complete();
    }
  };
  await page.route(pattern, handler);
  return {
    state,
    remove: async () => {
      assert.equal(
        state.captured,
        true,
        "the real backend fault request must start before removal",
      );
      await completed;
      // Keep the route alive while recovery starts and finishes its real reads.
      // Removing it with queued interceptions can strand a fallback request.
      if (!state.failure) await settleRPCPage(page);
      await page.unrouteAll({ behavior: "wait" });
      if (state.failure) throw state.failure;
      assert.equal(state.injected, true);
    },
  };
}

export function faultEvidence({ method, injected, backendCode, requestID }) {
  return { method, injected, backendCode, requestID };
}
