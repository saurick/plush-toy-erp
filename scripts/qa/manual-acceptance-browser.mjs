#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { buildManualAcceptanceCatalog } from "./manual-acceptance-catalog.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_REPORT_PATH = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/browser/report.json",
);
const REPORT_ROOT = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/browser",
);
const DEFAULT_SOURCE_REPORT_PATH = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/source-data/apply-report.json",
);
const DEFAULT_FACT_REPORT_PATH = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/fact-data/apply-report.json",
);
const SOURCE_DRIVEN_FACT_REPORT_CONTRACT =
  "source-driven-operational-facts-v1";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const COMPANY_NAME = "东莞市永绅玩具有限公司";
const SYSTEM_NAME = "毛绒 ERP 管理后台";
const CUSTOMER_KEY = "yoyoosun";
const LOGIN_TIMEOUT_MS = 20_000;
const PAGE_TIMEOUT_MS = 25_000;
const AUTH_PACE_MS = 3_000;
const TARGET_PACE_MS = 3_000;

export const FORMAL_BROWSER_ACCOUNTS = Object.freeze([
  Object.freeze({ username: "demo_boss", roleKey: "boss" }),
  Object.freeze({ username: "demo_sales", roleKey: "sales" }),
  Object.freeze({ username: "demo_purchase", roleKey: "purchase" }),
  Object.freeze({ username: "demo_production", roleKey: "production" }),
  Object.freeze({ username: "demo_warehouse", roleKey: "warehouse" }),
  Object.freeze({ username: "demo_quality", roleKey: "quality" }),
  Object.freeze({ username: "demo_finance", roleKey: "finance" }),
  Object.freeze({ username: "demo_pmc", roleKey: "pmc" }),
  Object.freeze({ username: "demo_engineering", roleKey: "engineering" }),
  Object.freeze({ username: "demo_admin", roleKey: "system_admin" }),
]);

export const EXCEPTION_BROWSER_ACCOUNTS = Object.freeze([
  Object.freeze({
    key: "disabled-account",
    username: "demo_uat_disabled",
    expected: "disabled_login_rejected",
  }),
  Object.freeze({
    key: "multi-position-account",
    username: "demo_uat_sales_purchase",
    expected: "sales_and_purchase_entries_visible",
  }),
  Object.freeze({
    key: "no-business-entry-account",
    username: "demo_uat_no_entry",
    expected: "no_business_entry_warning",
  }),
]);

export const MANUAL_ACCEPTANCE_BROWSER_BOUNDARY = Object.freeze({
  readOnly: true,
  writesDatabase: false,
  clicksBusinessWriteActions: false,
  callsBusinessMutationRPC: false,
  storesPasswordValue: false,
  storesAccessToken: false,
  storesAuthorizationHeader: false,
  allowedInteractions: Object.freeze([
    "login",
    "route_navigation",
    "read_only_tab_navigation",
  ]),
});

class BrowserAcceptanceError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "BrowserAcceptanceError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new BrowserAcceptanceError(`${label} is required`, 2);
  return text;
}

export function normalizeLocalBrowserURL(value, label = "URL") {
  let url;
  try {
    url = new URL(requiredText(value, label));
  } catch (error) {
    if (error instanceof BrowserAcceptanceError) throw error;
    throw new BrowserAcceptanceError(`${label} is invalid`, 2);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new BrowserAcceptanceError(`${label} must use http or https`, 2);
  }
  if (url.username || url.password) {
    throw new BrowserAcceptanceError(
      `${label} must not contain credentials`,
      2,
    );
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new BrowserAcceptanceError(
      `${label} must stay on this computer: ${url.origin}`,
      2,
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new BrowserAcceptanceError(
      `${label} must be an origin without path/query/hash`,
      2,
    );
  }
  return url.origin;
}

export function resolveManualAcceptanceBrowserReportPath(value = "") {
  const target = value ? path.resolve(REPO_ROOT, value) : DEFAULT_REPORT_PATH;
  const relative = path.relative(REPORT_ROOT, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new BrowserAcceptanceError(
      "--report must stay under output/qa/manual-acceptance/browser",
      2,
    );
  }
  if (path.extname(target).toLowerCase() !== ".json") {
    throw new BrowserAcceptanceError("--report must point to a .json file", 2);
  }
  return target;
}

function flattenCatalogTargets(catalog) {
  return [
    ["entries", catalog.technicalManifest.entries],
    ["desktop", catalog.technicalManifest.desktopPages],
    ["mobile", catalog.technicalManifest.mobileRolePages],
    ["print-preview", catalog.technicalManifest.printPreviewPages],
    ["print-workspace", catalog.technicalManifest.printWorkspacePages],
  ].flatMap(([group, items]) => items.map((item) => ({ group, ...item })));
}

function accountForTarget(target) {
  if (target.key === "admin-login") return null;
  const roleKey = target.roleKeys[0];
  const account = FORMAL_BROWSER_ACCOUNTS.find(
    (item) => item.roleKey === roleKey,
  );
  if (!account) {
    throw new BrowserAcceptanceError(
      `页面 ${target.route} 没有可用的正式岗位试用账号`,
    );
  }
  return account;
}

export function buildManualAcceptanceBrowserPlan({ baseURL, backendURL } = {}) {
  const catalog = buildManualAcceptanceCatalog();
  const targets = flattenCatalogTargets(catalog).map((target) => {
    const account = accountForTarget(target);
    return {
      group: target.group,
      key: target.key,
      title: target.title,
      route: target.route,
      isList: target.isList,
      minimumRecords: target.minimumRecords,
      minimumRecordUnit: target.minimumRecordUnit,
      roleKey: account?.roleKey || "anonymous",
      username: account?.username || "",
    };
  });
  assert.equal(
    targets.length,
    48,
    "手工验收浏览器计划必须覆盖当前 48 个正式目标",
  );
  return {
    scope: "manual-acceptance-browser-plan",
    customerKey: catalog.meta.customerKey,
    companyName: COMPANY_NAME,
    systemName: catalog.meta.systemName,
    baseURL: baseURL ? normalizeLocalBrowserURL(baseURL, "--base-url") : "",
    backendURL: backendURL
      ? normalizeLocalBrowserURL(backendURL, "--backend-url")
      : "",
    ...MANUAL_ACCEPTANCE_BROWSER_BOUNDARY,
    formalAccounts: FORMAL_BROWSER_ACCOUNTS.map(({ username, roleKey }) => ({
      username,
      roleKey,
    })),
    exceptionAccounts: EXCEPTION_BROWSER_ACCOUNTS.map((item) => ({ ...item })),
    summary: {
      entryPages: catalog.summary.entryPages,
      desktopPages: catalog.summary.desktopPages,
      mobileRolePages: catalog.summary.mobileRolePages,
      printPreviewPages: catalog.summary.printPreviewPages,
      printWorkspacePages: catalog.summary.printWorkspacePages,
      totalTargets: targets.length,
    },
    targets,
  };
}

export function parseManualAcceptanceBrowserArgs(argv = []) {
  const options = {
    baseURL: "",
    backendURL: "",
    reportPath: DEFAULT_REPORT_PATH,
    headed: false,
    plan: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "-h" || token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--headed") {
      options.headed = true;
      continue;
    }
    if (token === "--plan") {
      options.plan = true;
      continue;
    }
    const [key, inlineValue] = token.startsWith("--")
      ? token.slice(2).split(/=(.*)/su, 2)
      : ["", ""];
    if (!key) throw new BrowserAcceptanceError(`不支持的参数：${token}`, 2);
    const value = inlineValue || argv[index + 1];
    if (!inlineValue) index += 1;
    if (!value || String(value).startsWith("--")) {
      throw new BrowserAcceptanceError(`参数 --${key} 缺少值`, 2);
    }
    if (key === "base-url") {
      options.baseURL = normalizeLocalBrowserURL(value, "--base-url");
      continue;
    }
    if (key === "backend-url") {
      options.backendURL = normalizeLocalBrowserURL(value, "--backend-url");
      continue;
    }
    if (key === "report") {
      options.reportPath = resolveManualAcceptanceBrowserReportPath(value);
      continue;
    }
    throw new BrowserAcceptanceError(`不支持的参数：--${key}`, 2);
  }
  if (!options.help) {
    options.baseURL = normalizeLocalBrowserURL(options.baseURL, "--base-url");
    options.backendURL = normalizeLocalBrowserURL(
      options.backendURL,
      "--backend-url",
    );
  }
  return options;
}

export function getManualAcceptanceBrowserHelp() {
  return `用法：
  MANUAL_ACCEPTANCE_PASSWORD='<本地试用密码>' node scripts/qa/manual-acceptance-browser.mjs \\
    --base-url http://127.0.0.1:5177 \\
    --backend-url http://127.0.0.1:8300
  node scripts/qa/manual-acceptance-browser.mjs --plan \\
    --base-url http://127.0.0.1:5177 \\
    --backend-url http://127.0.0.1:8300

说明：
  只允许 localhost / 127.0.0.1 / ::1，不接受带凭据、路径、查询参数或跳转的 URL。
  真实验收只登录、读页面和切换只读页签，不点击新增、编辑、提交、完成、取消或过账动作。
  报告默认写入 output/qa/manual-acceptance/browser/report.json，不保存密码或登录令牌。
`;
}

function sanitizeDiagnostic(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(
      /([?&](?:token|access_token|authorization)=)[^&\s]+/giu,
      "$1[redacted]",
    )
    .replace(
      /\b(password|accessToken|authorizationHeader)\b\s*[:=]\s*[^,}\s]+/giu,
      "$1=[redacted]",
    )
    .slice(0, 800);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchRequired(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url, { redirect: "error" });
  } catch (error) {
    throw new BrowserAcceptanceError(
      `${label} 无法访问：${sanitizeDiagnostic(error?.message)}`,
    );
  }
  if (!response.ok) {
    throw new BrowserAcceptanceError(`${label} 返回 HTTP ${response.status}`);
  }
  return response;
}

async function verifyRuntimePreflight({ baseURL, backendURL, fetchImpl }) {
  const healthURL = new URL("/healthz", `${backendURL}/`).toString();
  const customerConfigURL = new URL(
    "/customer-config.js",
    `${baseURL}/`,
  ).toString();
  const customerAssetURL = new URL(
    "/customer-assets/yoyoosun/favicon-yoyoosun.svg",
    `${baseURL}/`,
  ).toString();
  const healthResponse = await fetchRequired(
    fetchImpl,
    healthURL,
    "本地后端健康检查",
  );
  const configResponse = await fetchRequired(
    fetchImpl,
    customerConfigURL,
    "甲方前端配置",
  );
  const configText = await configResponse.text();
  if (
    !/customerKey\s*:\s*["']yoyoosun["']/u.test(configText) ||
    !configText.includes(COMPANY_NAME) ||
    !configText.includes(SYSTEM_NAME)
  ) {
    throw new BrowserAcceptanceError("当前前端端口不是 yoyoosun 甲方验收入口");
  }
  const assetResponse = await fetchRequired(
    fetchImpl,
    customerAssetURL,
    "甲方品牌图标",
  );
  const assetType = assetResponse.headers.get("content-type") || "";
  if (!assetType.includes("image/svg+xml")) {
    throw new BrowserAcceptanceError("甲方品牌图标未返回 SVG 内容");
  }
  return {
    healthURL,
    healthStatus: healthResponse.status,
    customerConfigURL,
    customerConfigStatus: configResponse.status,
    customerAssetURL,
    customerAssetStatus: assetResponse.status,
    customerAssetContentType: assetType,
    customerKey: CUSTOMER_KEY,
    companyName: COMPANY_NAME,
    systemName: SYSTEM_NAME,
    verified: true,
  };
}

function attachRuntimeCollectors(page) {
  const events = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      events.push({
        type: "console",
        message: sanitizeDiagnostic(message.text()),
      });
    }
  });
  page.on("pageerror", (error) => {
    events.push({ type: "page", message: sanitizeDiagnostic(error?.message) });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (failure && failure !== "net::ERR_ABORTED") {
      events.push({
        type: "request",
        message: sanitizeDiagnostic(
          `${request.method()} ${request.url()} ${failure}`,
        ),
      });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      events.push({
        type: "response",
        message: sanitizeDiagnostic(`${response.status()} ${response.url()}`),
      });
    }
  });
  return events;
}

async function waitForReadablePage(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 750 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      const text = document.body?.innerText?.replace(/\s+/gu, " ").trim() || "";
      return Boolean(root?.childElementCount && text.length >= 12);
    },
    null,
    { timeout: PAGE_TIMEOUT_MS },
  );
  await page.waitForTimeout(250);
}

async function selectLoginEntry(page, entryTarget) {
  const label = entryTarget === "mobile" ? "岗位任务端" : "后台管理";
  const entry = page
    .locator(".ant-segmented-item")
    .filter({ hasText: label })
    .first();
  if (await entry.isVisible().catch(() => false)) await entry.click();
}

async function fillLoginForm(
  page,
  { username, password, entryTarget = "desktop" },
) {
  await page
    .getByLabel("账号")
    .waitFor({ state: "visible", timeout: LOGIN_TIMEOUT_MS });
  await selectLoginEntry(page, entryTarget);
  await page.getByLabel("账号").fill(username);
  await page.locator('input[type="password"]').fill(password);
}

async function loginFormalAccount(
  browser,
  {
    baseURL,
    account,
    password,
    entryTarget = "desktop",
    fromPath = "/admin-login",
  },
) {
  const context = await browser.newContext({
    viewport:
      entryTarget === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const events = attachRuntimeCollectors(page);
  try {
    await page.goto(new URL(fromPath, `${baseURL}/`).toString(), {
      waitUntil: "domcontentloaded",
    });
    if (new URL(page.url()).pathname !== "/admin-login") {
      await page.waitForURL((url) => url.pathname === "/admin-login", {
        timeout: LOGIN_TIMEOUT_MS,
      });
    }
    await fillLoginForm(page, {
      username: account.username,
      password,
      entryTarget,
    });
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/admin-login", {
        timeout: LOGIN_TIMEOUT_MS,
      }),
      page.locator('button[type="submit"]').first().click(),
    ]);
    const landingPath = new URL(page.url()).pathname;
    if (entryTarget === "desktop") {
      // 登录后的默认工作台会并发读取多块业务数据；验收账号建态只需入口页，
      // 立即转到轻量只读入口，避免连续十个账号把本地 BBR 保护器压满。
      await page.goto(new URL("/entry", `${baseURL}/`).toString(), {
        waitUntil: "domcontentloaded",
      });
    }
    await waitForReadablePage(page);
    const visibleText = await page.locator("body").innerText();
    if (
      entryTarget === "desktop" &&
      (!visibleText.includes(COMPANY_NAME) ||
        !visibleText.includes(SYSTEM_NAME))
    ) {
      throw new BrowserAcceptanceError(
        `${account.username} 登录后未显示甲方品牌`,
      );
    }
    if (entryTarget === "mobile") {
      const expectedPath = new URL(fromPath, `${baseURL}/`).pathname;
      if (new URL(page.url()).pathname !== expectedPath) {
        throw new BrowserAcceptanceError(
          `${account.username} 岗位任务端登录偏离：expected=${expectedPath} actual=${new URL(page.url()).pathname}`,
        );
      }
      await page.locator(".mobile-role-tasks-page").waitFor({
        state: "visible",
        timeout: PAGE_TIMEOUT_MS,
      });
    }
    if (events.length > 0) {
      throw new BrowserAcceptanceError(
        `${account.username} 登录出现浏览器错误：${events.map((item) => item.message).join("；")}`,
      );
    }
    return {
      storageState: await context.storageState(),
      result: {
        username: account.username,
        roleKey: account.roleKey,
        entryTarget,
        passed: true,
        landingPath,
        verificationPath: new URL(page.url()).pathname,
        customerBrandVisible:
          visibleText.includes(COMPANY_NAME) ||
          visibleText.includes(SYSTEM_NAME),
      },
    };
  } finally {
    await context.close();
  }
}

async function readVisibleTextSummary(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText?.replace(/\s+/gu, " ").trim() || "";
    const heading =
      [...document.querySelectorAll("h1,h2,h3,h4")]
        .map((item) => item.textContent?.replace(/\s+/gu, " ").trim() || "")
        .find(Boolean) || "";
    return {
      textLength: text.length,
      textSample: text.slice(0, 240),
      heading: heading.slice(0, 120),
      companyVisible: text.includes("东莞市永绅玩具有限公司"),
      systemNameVisible: text.includes("毛绒 ERP 管理后台"),
    };
  });
}

function largestTotalFromTexts(texts) {
  const values = texts.flatMap((text) =>
    [...String(text || "").matchAll(/(?:共|总计)\s*(\d+)\s*条/gu)].map(
      (match) => Number(match[1]),
    ),
  );
  return values.length ? Math.max(...values) : 0;
}

export function readBusinessSummaryTotal(targetKey, bodyText = "") {
  const patterns = {
    "task-board": [/全部任务\s*(\d+)/u],
    products: [/总产品\s*(\d+)/u],
    "accessories-purchase": [/总订单\s*(\d+)/u],
    "permission-center": [/管理员账号\s*(\d+)/u, /角色模板\s*(\d+)/u],
  };
  const values = (patterns[targetKey] || []).flatMap((pattern) => {
    const match = String(bodyText).match(pattern);
    return match ? [Number(match[1])] : [];
  });
  return values.length ? Math.max(...values) : 0;
}

async function readMobileTaskEvidence(page, minimumRecords) {
  await page.getByTestId("mobile-role-bottom-nav").waitFor({
    state: "visible",
    timeout: PAGE_TIMEOUT_MS,
  });
  const readCurrentTotal = async () => {
    const toggle = page
      .locator('[data-testid^="mobile-role-list-toggle-"]')
      .first();
    const attributeTotal = await toggle
      .getAttribute("data-total-item-count")
      .then((value) => Number(value || 0))
      .catch(() => 0);
    if (attributeTotal > 0) return attributeTotal;
    return largestTotalFromTexts([await page.locator("body").innerText()]);
  };
  const todoCount = await readCurrentTotal();
  await page.getByTestId("mobile-role-nav-done").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".mobile-role-tasks-page h1")
        ?.textContent?.trim() === "已办",
    null,
    { timeout: PAGE_TIMEOUT_MS },
  );
  const doneCount = await readCurrentTotal();
  await page.getByTestId("mobile-role-nav-todo").click();
  const observedTotal = todoCount + doneCount;
  return {
    status:
      observedTotal >= minimumRecords
        ? "minimum_proven"
        : observedTotal > 0
          ? "page_has_data_minimum_not_proven"
          : "not_proven",
    evidenceSource: "mobile DOM read-only tabs",
    todoCount,
    doneCount,
    observedTotal,
    minimumRecords,
    minimumSatisfied: observedTotal >= minimumRecords,
  };
}

async function readListEvidence(page, target) {
  if (target.group === "mobile") {
    return readMobileTaskEvidence(page, target.minimumRecords);
  }
  if (target.key === "permission-center") {
    const accountTab = page.getByRole("tab", { name: /管理员账号/u });
    if (await accountTab.count()) {
      await accountTab.click();
      await page.waitForTimeout(150);
    }
  }
  const metrics = await page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
    };
    const tableRows = [
      ...document.querySelectorAll(".ant-table-tbody > tr"),
    ].filter(
      (row) => visible(row) && !row.classList.contains("ant-table-placeholder"),
    ).length;
    const mobileRows = [
      ...document.querySelectorAll(".erp-mobile-list-item"),
    ].filter(visible).length;
    const printTemplates = [
      ...document.querySelectorAll(".erp-print-center-template-btn"),
    ].filter(visible).length;
    const taskCards = [
      ...document.querySelectorAll(".erp-task-board-card"),
    ].filter(visible).length;
    const paginationTexts = [
      ...document.querySelectorAll(
        ".ant-pagination-total-text,.ant-pagination,.erp-audit-pagination",
      ),
    ].map((node) => node.textContent || "");
    const bodyText = document.body?.innerText || "";
    return {
      tableRows,
      mobileRows,
      printTemplates,
      taskCards,
      paginationTexts,
      bodyText,
    };
  });
  const renderedItems = Math.max(
    metrics.tableRows,
    metrics.mobileRows,
    metrics.printTemplates,
    metrics.taskCards,
  );
  const observedTotal = Math.max(
    renderedItems,
    largestTotalFromTexts([...metrics.paginationTexts, metrics.bodyText]),
    readBusinessSummaryTotal(target.key, metrics.bodyText),
  );
  const minimumSatisfied = observedTotal >= target.minimumRecords;
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : renderedItems > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource: "visible table/list/pagination DOM",
    renderedItems,
    observedTotal,
    minimumRecords: target.minimumRecords,
    minimumSatisfied,
  };
}

async function loadBoundSimulatedPrintInput() {
  const [sourceRaw, factRaw] = await Promise.all([
    fs.readFile(DEFAULT_SOURCE_REPORT_PATH, "utf8"),
    fs.readFile(DEFAULT_FACT_REPORT_PATH, "utf8"),
  ]);
  const source = JSON.parse(sourceRaw);
  const fact = JSON.parse(factRaw);
  const sourceRunId = requiredText(source?.runId, "source report runId");
  if (
    source?.simulatedOnly !== true ||
    fact?.simulatedOnly !== true ||
    fact?.reportContract !== SOURCE_DRIVEN_FACT_REPORT_CONTRACT ||
    fact?.sourceRunId !== sourceRunId
  ) {
    throw new BrowserAcceptanceError(
      "打印验收只接受同一批次的本机模拟业务记录",
    );
  }
  return {
    sourceRunId,
    factRunId: requiredText(fact?.runId, "fact report runId"),
    sourcePrefix: requiredText(source?.prefix, "source report prefix"),
    sourceReportSHA256: createHash("sha256").update(sourceRaw).digest("hex"),
    factReportSHA256: createHash("sha256").update(factRaw).digest("hex"),
  };
}

async function readPDFPreviewEvidence(workspace, preview) {
  if (!preview) throw new BrowserAcceptanceError("PDF 预览窗口未打开");
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let blobURL = "";
  while (Date.now() < deadline) {
    const popupURL = preview.url();
    if (popupURL.startsWith("blob:")) {
      blobURL = popupURL;
      break;
    }
    blobURL = await preview
      .locator("iframe.pdf-preview-frame")
      .first()
      .getAttribute("src")
      .then((value) => String(value || ""))
      .catch(() => "");
    if (blobURL.startsWith("blob:")) break;
    await preview.waitForTimeout(100);
  }
  if (!blobURL) throw new BrowserAcceptanceError("PDF 预览未生成 blob 文件");
  return workspace.evaluate(async (url) => {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return {
      byteLength: bytes.byteLength,
      magic: String.fromCharCode(...bytes.slice(0, 4)),
    };
  }, blobURL);
}

async function verifyBusinessPrintTemplate(browser, options) {
  const {
    baseURL,
    storageState,
    sourcePrefix,
    sourceRoute,
    actionLabel,
    templateKey,
    searchPlaceholder,
    recordQuery,
  } = options;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState,
  });
  const pdfResponses = [];
  context.on("response", (response) => {
    if (response.url().includes("/templates/render-pdf")) {
      pdfResponses.push(response);
    }
  });
  const page = await context.newPage();
  let workspace;
  let preview;
  try {
    await page.goto(new URL(sourceRoute, `${baseURL}/`).toString(), {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    await waitForReadablePage(page);
    await page.waitForFunction(
      (customerKey) =>
        window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__?.customerKey ===
          customerKey &&
        window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__?.blockers?.length ===
          0,
      CUSTOMER_KEY,
      { timeout: PAGE_TIMEOUT_MS },
    );
    const search = page.getByPlaceholder(searchPlaceholder, { exact: true });
    await search.fill(recordQuery);
    await search.press("Enter");
    const row = page.getByRole("row").filter({ hasText: recordQuery }).first();
    await row.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    const recordCell = row.getByText(recordQuery, { exact: true }).first();
    await recordCell.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    await recordCell.click();
    await page.waitForFunction(
      (query) =>
        [...document.querySelectorAll(".ant-table-row-selected")].some(
          (selectedRow) => selectedRow.innerText.includes(query),
        ),
      recordQuery,
      { timeout: PAGE_TIMEOUT_MS },
    );
    const action = page
      .locator("button")
      .filter({ has: page.getByText(actionLabel, { exact: true }) })
      .first();
    await action.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.innerText.replace(/\s+/gu, " ").trim() === label &&
            !button.disabled,
        ),
      actionLabel,
      { timeout: PAGE_TIMEOUT_MS },
    );
    assert.equal(
      await action.isDisabled(),
      false,
      `${actionLabel} 应在选择业务记录后可用`,
    );
    [workspace] = await Promise.all([
      page.waitForEvent("popup", { timeout: PAGE_TIMEOUT_MS }),
      action.click(),
    ]);
    await workspace.waitForLoadState("domcontentloaded");
    await workspace
      .getByText("业务记录带值", { exact: true })
      .waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    assert.equal(
      new URL(workspace.url()).searchParams.get("source"),
      "business",
    );
    const responsePromise = pdfResponses.length
      ? Promise.resolve(pdfResponses.at(-1))
      : workspace.waitForResponse(
          (response) => response.url().includes("/templates/render-pdf"),
          { timeout: PAGE_TIMEOUT_MS },
        );
    const popupPromise = workspace
      .waitForEvent("popup", { timeout: PAGE_TIMEOUT_MS })
      .catch(() => null);
    await workspace
      .getByRole("button", { name: "在线预览 PDF", exact: true })
      .click();
    const response = await responsePromise;
    preview = await popupPromise;
    const pdf = await readPDFPreviewEvidence(workspace, preview);
    const headers = response.headers();
    const requestID = requiredText(headers["x-request-id"], "PDF request_id");
    const contentType = String(headers["content-type"] || "").toLowerCase();
    assert.ok(response.ok(), `${templateKey} PDF HTTP ${response.status()}`);
    assert.match(contentType, /application\/pdf/u);
    assert.ok(pdf.byteLength > 100, `${templateKey} PDF 内容为空`);
    assert.equal(pdf.magic, "%PDF");
    return {
      templateKey,
      sourceRoute,
      actionLabel,
      sourcePrefix,
      recordQuery,
      workspaceSource: "business",
      workspacePath: new URL(workspace.url()).pathname,
      status: response.status(),
      contentType,
      byteLength: pdf.byteLength,
      requestID,
      passed: true,
    };
  } catch (error) {
    const diagnostics = await page
      .evaluate((label) => {
        const normalize = (value) =>
          String(value || "")
            .replace(/\s+/gu, " ")
            .trim();
        const matchingButtons = [...document.querySelectorAll("button")]
          .filter((button) => normalize(button.innerText) === label)
          .map((button) => {
            const style = window.getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return {
              disabled: button.disabled,
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              inSelectionBar: Boolean(
                button.closest(".erp-business-selection-action-bar"),
              ),
            };
          });
        return {
          matchingButtons,
          selectedRows: document.querySelectorAll(".ant-table-row-selected")
            .length,
          selectionBarActive: Boolean(
            document.querySelector(
              ".erp-business-selection-action-bar--active",
            ),
          ),
        };
      }, actionLabel)
      .catch(() => null);
    const screenshotPath = path.resolve(
      REPORT_ROOT,
      `print-source-${templateKey}-failed.png`,
    );
    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => {});
    if (diagnostics && error instanceof Error) {
      error.message = `${error.message}\nselection diagnostics: ${JSON.stringify(
        diagnostics,
      )}`;
    }
    throw error;
  } finally {
    if (preview && !preview.isClosed()) await preview.close().catch(() => {});
    if (workspace && !workspace.isClosed())
      await workspace.close().catch(() => {});
    await context.close();
  }
}

async function verifyBusinessPrintEvidence(
  browser,
  { baseURL, desktopStorageStates, printInput },
) {
  const cases = [
    [
      "demo_purchase",
      "/erp/purchase/accessories",
      "打印合同",
      "material-purchase-contract",
      "搜索采购单",
      `${printInput.sourcePrefix}-PO-001`,
    ],
    [
      "demo_production",
      "/erp/purchase/processing-contracts",
      "加工合同打印",
      "processing-contract",
      "搜索合同",
      `${printInput.sourcePrefix}-OS-001`,
    ],
    [
      "demo_engineering",
      "/erp/purchase/material-bom",
      "打印物料明细",
      "engineering-material-detail",
      "搜索 BOM 版本",
      `${printInput.sourcePrefix}-BOM-001-1`,
    ],
    [
      "demo_engineering",
      "/erp/purchase/material-bom",
      "打印色卡",
      "engineering-color-card",
      "搜索 BOM 版本",
      `${printInput.sourcePrefix}-BOM-001-1`,
    ],
    [
      "demo_engineering",
      "/erp/purchase/material-bom",
      "打印作业指导书",
      "engineering-work-instruction",
      "搜索 BOM 版本",
      `${printInput.sourcePrefix}-BOM-001-1`,
    ],
  ];
  const templates = [];
  for (const [
    username,
    sourceRoute,
    actionLabel,
    templateKey,
    searchPlaceholder,
    recordQuery,
  ] of cases) {
    try {
      templates.push(
        await verifyBusinessPrintTemplate(browser, {
          baseURL,
          storageState: desktopStorageStates.get(username),
          sourcePrefix: printInput.sourcePrefix,
          sourceRoute,
          actionLabel,
          templateKey,
          searchPlaceholder,
          recordQuery,
        }),
      );
    } catch (error) {
      templates.push({
        templateKey,
        sourceRoute,
        actionLabel,
        sourcePrefix: printInput.sourcePrefix,
        recordQuery,
        passed: false,
        error: sanitizeDiagnostic(error?.message || error),
      });
    }
  }
  return {
    ...printInput,
    templates,
    passed: templates.length === 5 && templates.every((item) => item.passed),
  };
}

export function partitionTargetRuntimeEvents(target, events) {
  void target;
  return { blocking: events, expected: [] };
}

export function summarizeManualAcceptance({
  targets,
  formalAccounts,
  exceptionAccounts,
  printEvidence,
}) {
  const failedTargets = targets.filter((item) => !item.passed);
  const failedAccounts = formalAccounts.filter((item) => !item.passed);
  const failedExceptions = exceptionAccounts.filter((item) => !item.passed);
  const listTargets = targets.filter((item) => item.isList);
  const failedDataMinimums = listTargets.filter(
    (item) => item.dataEvidence?.minimumSatisfied !== true,
  );
  const pageRuntimePassed =
    failedTargets.length + failedAccounts.length + failedExceptions.length ===
    0;
  const printEvidencePassed = printEvidence?.passed === true;
  const acceptancePassed =
    pageRuntimePassed && failedDataMinimums.length === 0 && printEvidencePassed;
  return {
    pageRuntimePassed,
    acceptancePassed,
    passed: acceptancePassed,
    failedTargets,
    failedAccounts,
    failedExceptions,
    listTargets,
    failedDataMinimums,
    printEvidencePassed,
  };
}

async function verifyTarget(
  browser,
  {
    baseURL,
    target,
    desktopStorageStates,
    mobileStorageStates,
    preflight,
    reportPath,
  },
) {
  const storageState = target.username
    ? target.group === "mobile"
      ? mobileStorageStates.get(target.username)
      : desktopStorageStates.get(target.username)
    : undefined;
  const context = await browser.newContext({
    viewport:
      target.group === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();
  const events = attachRuntimeCollectors(page);
  try {
    await page.goto(new URL(target.route, `${baseURL}/`).toString(), {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    await waitForReadablePage(page);
    const actualURL = new URL(page.url());
    const expectedURL = new URL(target.route, `${baseURL}/`);
    if (actualURL.pathname !== expectedURL.pathname) {
      throw new BrowserAcceptanceError(
        `${target.title} 路由偏离：expected=${expectedURL.pathname} actual=${actualURL.pathname}`,
      );
    }
    if (target.key !== "admin-login" && actualURL.pathname === "/admin-login") {
      throw new BrowserAcceptanceError(`${target.title} 被退回登录页`);
    }
    const visible = await readVisibleTextSummary(page);
    if (!visible.heading && visible.textLength < 40) {
      throw new BrowserAcceptanceError(`${target.title} 缺少可识别的页面内容`);
    }
    if (["admin-login", "entry"].includes(target.key)) {
      if (!visible.companyVisible || !visible.systemNameVisible) {
        throw new BrowserAcceptanceError(
          `${target.title} 未显示甲方公司和系统名称`,
        );
      }
    }
    const dataEvidence = target.isList
      ? await readListEvidence(page, target)
      : {
          status: "not_applicable",
          evidenceSource: "page content only",
          minimumRecords: target.minimumRecords,
          minimumSatisfied: null,
        };
    await page.waitForTimeout(150);
    const runtimeEvents = partitionTargetRuntimeEvents(target, events);
    if (runtimeEvents.blocking.length > 0) {
      throw new BrowserAcceptanceError(
        `${target.title} 出现浏览器运行时或请求错误：${events
          .filter((item) => runtimeEvents.blocking.includes(item))
          .map((item) => `${item.type}:${item.message}`)
          .join("；")}`,
      );
    }
    return {
      ...target,
      passed: true,
      actualPath: actualURL.pathname,
      customerBrandVerified: preflight.verified,
      customerBrandVisibleOnPage:
        visible.companyVisible || visible.systemNameVisible,
      visibleContent: visible,
      dataEvidence,
      runtimeErrors: [],
      expectedRuntimeWarnings: runtimeEvents.expected,
    };
  } catch (error) {
    const screenshotName = `${target.group}-${target.key}-failed.png`.replace(
      /[^a-z0-9._-]/giu,
      "-",
    );
    const screenshotPath = path.resolve(
      path.dirname(reportPath),
      screenshotName,
    );
    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => {});
    return {
      ...target,
      passed: false,
      actualPath: new URL(page.url()).pathname,
      customerBrandVerified: preflight.verified,
      error: sanitizeDiagnostic(error?.message || error),
      runtimeErrors: events,
      failureScreenshot: path.relative(REPO_ROOT, screenshotPath),
      dataEvidence: { status: "not_proven", minimumSatisfied: false },
    };
  } finally {
    await context.close();
  }
}

async function attemptRejectedLogin(
  browser,
  { baseURL, username, password, expectedText },
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const events = attachRuntimeCollectors(page);
  try {
    await page.goto(new URL("/admin-login", `${baseURL}/`).toString(), {
      waitUntil: "domcontentloaded",
    });
    await fillLoginForm(page, { username, password, entryTarget: "desktop" });
    await page.locator('button[type="submit"]').first().click();
    const alert = page.locator(".ant-alert-error").first();
    await Promise.race([
      alert.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
      page
        .waitForURL((url) => url.pathname !== "/admin-login", {
          timeout: 10_000,
        })
        .catch(() => {}),
      page.waitForTimeout(10_000),
    ]);
    const actualMessage = (await alert.isVisible().catch(() => false))
      ? (await alert.innerText()).replace(/\s+/gu, " ").trim()
      : "未显示拒绝提示";
    const stayedOnLogin = new URL(page.url()).pathname === "/admin-login";
    return {
      username,
      passed:
        stayedOnLogin &&
        actualMessage.includes(expectedText) &&
        events.length === 0,
      expectedResult: expectedText,
      actualMessage,
      actualPath: new URL(page.url()).pathname,
      runtimeErrors: events,
    };
  } finally {
    await context.close();
  }
}

async function loginForScenario(
  browser,
  {
    baseURL,
    username,
    password,
    entryTarget = "desktop",
    fromPath = "/admin-login",
  },
) {
  const account = { username, roleKey: "scenario" };
  return loginFormalAccount(browser, {
    baseURL,
    account,
    password,
    entryTarget,
    fromPath,
  });
}

async function verifyScenarioRoute(
  browser,
  { baseURL, storageState, route, text },
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState,
  });
  const page = await context.newPage();
  const events = attachRuntimeCollectors(page);
  try {
    await page.goto(new URL(route, `${baseURL}/`).toString(), {
      waitUntil: "domcontentloaded",
    });
    await waitForReadablePage(page);
    assert.equal(
      new URL(page.url()).pathname,
      new URL(route, `${baseURL}/`).pathname,
    );
    await page.getByText(text, { exact: false }).first().waitFor({
      state: "visible",
      timeout: PAGE_TIMEOUT_MS,
    });
    assert.deepEqual(events, []);
    return { route, visibleText: text, passed: true };
  } finally {
    await context.close();
  }
}

async function verifyExceptionAccounts(browser, { baseURL, password }) {
  await wait(AUTH_PACE_MS);
  const disabled = await attemptRejectedLogin(browser, {
    baseURL,
    username: "demo_uat_disabled",
    password,
    expectedText: "账号已停用",
  });

  await wait(AUTH_PACE_MS);
  let multiPosition;
  try {
    const multiLogin = await loginForScenario(browser, {
      baseURL,
      username: "demo_uat_sales_purchase",
      password,
      entryTarget: "mobile",
      fromPath: "/m/sales/tasks",
    });
    const verifiedEntries = [];
    for (const [route, text] of [
      ["/entry", "后台管理"],
      ["/m/sales/tasks", "业务"],
      ["/m/purchase/tasks", "采购"],
    ]) {
      verifiedEntries.push(
        await verifyScenarioRoute(browser, {
          baseURL,
          storageState: multiLogin.storageState,
          route,
          text,
        }),
      );
    }
    multiPosition = {
      key: "multi-position-account",
      username: "demo_uat_sales_purchase",
      passed: verifiedEntries.every((item) => item.passed),
      verifiedEntries,
      storesPasswordValue: false,
      storesAccessToken: false,
    };
  } catch (error) {
    multiPosition = {
      key: "multi-position-account",
      username: "demo_uat_sales_purchase",
      passed: false,
      error: sanitizeDiagnostic(error?.message || error),
      verifiedEntries: [],
      storesPasswordValue: false,
      storesAccessToken: false,
    };
  }

  await wait(AUTH_PACE_MS);
  let noEntry;
  try {
    const login = await loginForScenario(browser, {
      baseURL,
      username: "demo_uat_no_entry",
      password,
      entryTarget: "desktop",
      fromPath: "/entry",
    });
    const verifiedEntry = await verifyScenarioRoute(browser, {
      baseURL,
      storageState: login.storageState,
      route: "/entry",
      text: "当前账号暂无可用入口权限",
    });
    noEntry = {
      key: "no-business-entry-account",
      username: "demo_uat_no_entry",
      passed: verifiedEntry.passed,
      verifiedEntry,
      expectedResult: "登录后只显示无可用入口提示",
    };
  } catch (error) {
    noEntry = {
      key: "no-business-entry-account",
      username: "demo_uat_no_entry",
      passed: false,
      expectedResult: "登录后只显示无可用入口提示",
      error: sanitizeDiagnostic(error?.message || error),
    };
  }

  return [{ key: "disabled-account", ...disabled }, multiPosition, noEntry];
}

async function loadChromium() {
  const requireFromWeb = createRequire(
    path.resolve(REPO_ROOT, "web/package.json"),
  );
  return requireFromWeb("playwright").chromium;
}

async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

export async function runManualAcceptanceBrowser(
  {
    baseURL,
    backendURL,
    password = "",
    reportPath = DEFAULT_REPORT_PATH,
    headed = false,
  } = {},
  runtime = {},
) {
  const normalizedBaseURL = normalizeLocalBrowserURL(baseURL, "--base-url");
  const normalizedBackendURL = normalizeLocalBrowserURL(
    backendURL,
    "--backend-url",
  );
  const normalizedReportPath = resolveManualAcceptanceBrowserReportPath(
    path.relative(REPO_ROOT, reportPath),
  );
  const secret = String(password || "").trim();
  if (!secret) {
    throw new BrowserAcceptanceError(
      "缺少本地试用账号密码：请设置 MANUAL_ACCEPTANCE_PASSWORD",
      2,
    );
  }

  const plan = buildManualAcceptanceBrowserPlan({
    baseURL: normalizedBaseURL,
    backendURL: normalizedBackendURL,
  });
  const fetchImpl = runtime.fetchImpl || globalThis.fetch;
  const preflight = await verifyRuntimePreflight({
    baseURL: normalizedBaseURL,
    backendURL: normalizedBackendURL,
    fetchImpl,
  });
  const printInput = await loadBoundSimulatedPrintInput();
  const chromium =
    runtime.chromium || (await (runtime.loadChromium || loadChromium)());
  const browser = await chromium.launch({ headless: !headed });
  const formalAccounts = [];
  const formalMobileAccounts = [];
  const desktopStorageStates = new Map();
  const mobileStorageStates = new Map();
  const targets = [];
  let exceptionAccounts = [];
  let printEvidence = { ...printInput, templates: [], passed: false };
  try {
    for (const account of FORMAL_BROWSER_ACCOUNTS) {
      const login = await loginFormalAccount(browser, {
        baseURL: normalizedBaseURL,
        account,
        password: secret,
      });
      desktopStorageStates.set(account.username, login.storageState);
      formalAccounts.push(login.result);
      await wait(AUTH_PACE_MS);
    }
    for (const account of FORMAL_BROWSER_ACCOUNTS.filter(
      (item) => item.roleKey !== "system_admin",
    )) {
      const login = await loginFormalAccount(browser, {
        baseURL: normalizedBaseURL,
        account,
        password: secret,
        entryTarget: "mobile",
        fromPath: `/m/${account.roleKey}/tasks`,
      });
      mobileStorageStates.set(account.username, login.storageState);
      formalMobileAccounts.push(login.result);
      await wait(AUTH_PACE_MS);
    }
    for (const target of plan.targets) {
      if (target.group === "print-workspace") continue;
      targets.push(
        await verifyTarget(browser, {
          baseURL: normalizedBaseURL,
          target,
          desktopStorageStates,
          mobileStorageStates,
          preflight,
          reportPath: normalizedReportPath,
        }),
      );
      await wait(TARGET_PACE_MS);
    }
    printEvidence = await verifyBusinessPrintEvidence(browser, {
      baseURL: normalizedBaseURL,
      desktopStorageStates,
      printInput,
    });
    for (const target of plan.targets.filter(
      (item) => item.group === "print-workspace",
    )) {
      const proof = printEvidence.templates.find(
        (item) => item.templateKey === target.key,
      );
      targets.push({
        ...target,
        passed: proof?.passed === true,
        actualPath: proof?.workspacePath || "",
        customerBrandVerified: preflight.verified,
        customerBrandVisibleOnPage: true,
        visibleContent: {
          heading: target.title,
          textSample: proof?.passed
            ? "业务记录带值；PDF 已生成"
            : "打印证据未通过",
        },
        dataEvidence: {
          status: "not_applicable",
          evidenceSource: "bound business record PDF proof",
          minimumRecords: 0,
          minimumSatisfied: null,
        },
        runtimeErrors: proof?.passed
          ? []
          : [{ type: "print-evidence", message: proof?.error || "PDF 未通过" }],
        businessPrintEvidence: proof || null,
      });
    }
    exceptionAccounts = await verifyExceptionAccounts(browser, {
      baseURL: normalizedBaseURL,
      password: secret,
    });
  } finally {
    desktopStorageStates.clear();
    mobileStorageStates.clear();
    await browser.close();
  }

  const acceptance = summarizeManualAcceptance({
    targets,
    formalAccounts,
    exceptionAccounts,
    printEvidence,
  });
  const {
    failedTargets,
    failedAccounts,
    failedExceptions,
    listTargets,
    failedDataMinimums,
  } = acceptance;
  const report = {
    scope: "manual-acceptance-browser-report",
    generatedAt: new Date().toISOString(),
    customerKey: CUSTOMER_KEY,
    baseURL: normalizedBaseURL,
    backendURL: normalizedBackendURL,
    ...MANUAL_ACCEPTANCE_BROWSER_BOUNDARY,
    callsAuthLogin: true,
    callsReadOnlyPageQueries: true,
    preflight,
    catalogSummary: plan.summary,
    formalAccounts,
    formalMobileAccounts,
    exceptionAccounts,
    printEvidence,
    targets,
    summary: {
      passed: acceptance.passed,
      pageRuntimePassed: acceptance.pageRuntimePassed,
      acceptancePassed: acceptance.acceptancePassed,
      printEvidencePassed: acceptance.printEvidencePassed,
      formalAccountPassedCount: formalAccounts.length - failedAccounts.length,
      formalAccountCount: FORMAL_BROWSER_ACCOUNTS.length,
      formalMobileAccountPassedCount: formalMobileAccounts.filter(
        (item) => item.passed,
      ).length,
      formalMobileAccountCount: FORMAL_BROWSER_ACCOUNTS.length - 1,
      exceptionAccountPassedCount:
        exceptionAccounts.length - failedExceptions.length,
      exceptionAccountCount: EXCEPTION_BROWSER_ACCOUNTS.length,
      targetPassedCount: targets.length - failedTargets.length,
      targetFailedCount: failedTargets.length,
      targetCount: targets.length,
      listTargetCount: listTargets.length,
      dataMinimumProvenCount: listTargets.filter(
        (item) => item.dataEvidence?.status === "minimum_proven",
      ).length,
      dataPresentMinimumNotProvenCount: listTargets.filter(
        (item) =>
          item.dataEvidence?.status === "page_has_data_minimum_not_proven",
      ).length,
      dataNotProvenCount: listTargets.filter(
        (item) => item.dataEvidence?.status === "not_proven",
      ).length,
      dataMinimumFailedCount: failedDataMinimums.length,
    },
  };
  await writeReport(normalizedReportPath, report);
  if (!report.summary.passed) {
    throw new BrowserAcceptanceError(
      `浏览器验收未通过：页面 ${failedTargets.length}，正式账号 ${failedAccounts.length}，异常账号 ${failedExceptions.length}，列表最低数量 ${failedDataMinimums.length}；报告 ${path.relative(REPO_ROOT, normalizedReportPath)}`,
    );
  }
  return report;
}

async function main() {
  const options = parseManualAcceptanceBrowserArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(getManualAcceptanceBrowserHelp());
    return;
  }
  if (options.plan) {
    process.stdout.write(
      `${JSON.stringify(
        buildManualAcceptanceBrowserPlan({
          baseURL: options.baseURL,
          backendURL: options.backendURL,
        }),
        null,
        2,
      )}\n`,
    );
    return;
  }
  const report = await runManualAcceptanceBrowser({
    ...options,
    password: process.env.MANUAL_ACCEPTANCE_PASSWORD,
  });
  process.stdout.write(
    `[manual-acceptance-browser] 通过：正式账号 ${report.summary.formalAccountPassedCount}/${report.summary.formalAccountCount}，异常账号 ${report.summary.exceptionAccountPassedCount}/${report.summary.exceptionAccountCount}，页面 ${report.summary.targetPassedCount}/${report.summary.targetCount}；数据量已由页面证明 ${report.summary.dataMinimumProvenCount}/${report.summary.listTargetCount}。报告 ${path.relative(REPO_ROOT, options.reportPath)}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[manual-acceptance-browser][fatal] ${sanitizeDiagnostic(error?.message || error)}\n`,
    );
    process.exitCode = Number(error?.exitCode || 1);
  });
}
