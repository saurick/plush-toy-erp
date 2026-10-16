import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { browserRPCURL } from "./browser-write-target.mjs";
import { consumeExpectedRPCFailure, trackBrowserRPCNetwork } from "./transaction-browser-network.mjs";

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
  assert.equal(
    await open.evaluate(
      (element, position) =>
        document.elementFromPoint(position.x, position.y) === element,
      point,
    ),
    true,
    "task title must hit its primary open button",
  );
  // The thumbnail has its own image-preview action; touch the task heading.
  await open.tap({
    position: { x: point.x - buttonBox.x, y: point.y - buttonBox.y },
  });
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

export async function selectOption(page, control, label) {
  await control
    .locator("xpath=ancestor::div[contains(@class,'ant-select-selector')][1]")
    .click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(label, { exact: true })
    .click();
}
export async function selectRow(page, id) {
  const row = page.locator(`.ant-table-row[data-row-key="${id}"]:visible`);
  await expect(row).toHaveCount(1);
  const radio = row.getByRole("radio");
  await radio.check();
  await expect(radio).toBeChecked();
}
export async function pageAction(page, label) {
  const direct = page.locator("button:visible").filter({ hasText: label });
  if (await direct.isVisible()) return direct.click();
  await page
    .getByRole("button", { name: /^更多操作(?:，共 \d+ 项)?$/u })
    .click();
  await expect(direct).toHaveCount(1);
  await direct.click();
}
export async function modal(page, title) {
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText(title, { exact: true }) });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function navigate(page, url) {
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.pendingRPC.size).toBe(0);
  await Promise.all([...page.rpcResponses]);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
export async function closePage(page, context) {
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.pendingRPC.size).toBe(0);
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
      page.rpcNetwork.counts.navigationAborted,
    "every dispatched RPC must complete, fail or be a startup read displaced by document navigation",
  );
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
    const { method } = request.postDataJSON();
    if (consumeExpectedRPCFailure(request, page.expectedRPCFailures)) return;
    report.pageErrors.push({
      role,
      method,
      message: "Unexpected RPC transport failure",
      failure,
    });
  };
  page.rpcNetwork = await trackBrowserRPCNetwork(context, page, {
    onFailure: (request, event) =>
      transportFailure(request, {
        errorText: event.errorText,
        canceled: Boolean(event.canceled),
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
    history: page.rpcNetwork.history,
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
      await page.unroute(pattern, handler);
      if (state.failure) throw state.failure;
      assert.equal(state.injected, true);
    },
  };
}

export function faultEvidence({ method, injected, backendCode, requestID }) {
  return { method, injected, backendCode, requestID };
}
