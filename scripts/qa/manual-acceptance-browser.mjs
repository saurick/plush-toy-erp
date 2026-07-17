#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT,
  MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT,
  MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
  buildManualAcceptanceCatalog,
} from "./manual-acceptance-catalog.mjs";
import { buildManualAcceptancePageDataContract } from "./manual-acceptance-page-data-contract.mjs";
import { dashboardHealthModules } from "../../web/src/erp/config/dashboardModules.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT,
  MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
} from "./manual-acceptance-dataset.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES,
  assertManualAcceptanceDatasetReadinessBoundary,
  digestManualAcceptanceDatasetComponentReport,
  manualAcceptanceDatasetStageReportPath,
} from "./manual-acceptance-dataset-runner.mjs";
import {
  CUSTOMER_TRIAL_133_TARGET,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import {
  TASK_SOURCE_TYPE,
  TASK_VISIBLE_CODE_PREFIX_BY_ROLE,
  buildManualAcceptanceTaskSchedule,
  manualAcceptanceTaskBatchIdentity,
} from "./manual-acceptance-task-data.mjs";

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
const DATASET_REPORT_ROOT = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/datasets",
);
const INPUT_REPORT_ROOT = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance",
);
const DEFAULT_SOURCE_REPORT_PATH = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/source-data/apply-report.json",
);
const DEFAULT_FACT_REPORT_PATH = path.resolve(
  REPO_ROOT,
  "output/qa/manual-acceptance/fact-data/apply-report.json",
);
const SOURCE_DRIVEN_FACT_REPORT_CONTRACT = "source-driven-operational-facts-v1";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const COMPANY_NAME = "东莞市永绅玩具有限公司";
const SYSTEM_NAME = "业务管理";
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
  const allowed = [REPORT_ROOT, DATASET_REPORT_ROOT].some((root) => {
    const relative = path.relative(root, target);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  if (!allowed) {
    throw new BrowserAcceptanceError(
      "--report must stay under output/qa/manual-acceptance/browser or output/qa/manual-acceptance/datasets",
      2,
    );
  }
  if (path.extname(target).toLowerCase() !== ".json") {
    throw new BrowserAcceptanceError("--report must point to a .json file", 2);
  }
  return target;
}

export function resolveManualAcceptanceBrowserInputReportPath(value, label) {
  const target = path.resolve(REPO_ROOT, requiredText(value, label));
  const relative = path.relative(INPUT_REPORT_ROOT, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new BrowserAcceptanceError(
      `${label} must stay under output/qa/manual-acceptance`,
      2,
    );
  }
  if (path.extname(target).toLowerCase() !== ".json") {
    throw new BrowserAcceptanceError(`${label} must point to a .json file`, 2);
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
  const roleKey = target.key === "task-board" ? "boss" : target.roleKeys[0];
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

const BUSINESS_DASHBOARD_PAGE_KEY_BY_SOURCE = Object.freeze({
  outbound: "shipments",
});
const BUSINESS_DASHBOARD_PROJECTION_PROBE_ID = "business-dashboard-stats";

const BUSINESS_DASHBOARD_PROBE_ID_BY_SOURCE = Object.freeze({
  customers: "customers",
  suppliers: "suppliers",
  products: "products",
  "material-bom": "bom-versions",
  "sales-orders": "sales-orders",
  "accessories-purchase": "purchase-orders",
  inbound: "purchase-receipts",
  "quality-inspections": "quality-inspections",
  inventory: "inventory-balances",
  "shipping-release": "workflow-tasks:shipment_release",
  outbound: "shipments",
  "production-orders": "production-orders",
  "production-scheduling": "workflow-tasks:production_scheduling",
  "production-progress": "production-facts",
  "production-exceptions": "workflow-tasks:production_exception",
  "processing-contracts": "outsourcing-orders",
  reconciliation: "finance-reconciliation",
  payables: "finance-payables",
  receivables: "finance-receivables",
  invoices: "finance-invoices",
});

const BUSINESS_DASHBOARD_AGGREGATED_SOURCE_KEYS = new Set([
  "production-scheduling",
]);

function businessDashboardRequirements(catalog) {
  const desktopByKey = new Map(
    catalog.technicalManifest.desktopPages.map((item) => [item.key, item]),
  );
  return dashboardHealthModules.flatMap((module) =>
    module.sources.map((source) => {
      const pageKey =
        BUSINESS_DASHBOARD_PAGE_KEY_BY_SOURCE[source.key] || source.key;
      const page = desktopByKey.get(pageKey);
      if (!page) {
        throw new BrowserAcceptanceError(
          `业务看板来源 ${source.key} 没有正式页面数据合同`,
        );
      }
      const probeId = BUSINESS_DASHBOARD_PROBE_ID_BY_SOURCE[source.key];
      if (!probeId) {
        throw new BrowserAcceptanceError(
          `业务看板来源 ${source.key} 没有当前批次 readiness 映射`,
        );
      }
      return {
        key: source.key,
        label: source.label,
        minimumRecords: page.minimumRecords,
        probeId,
        exactCurrentBatchCount: !BUSINESS_DASHBOARD_AGGREGATED_SOURCE_KEYS.has(
          source.key,
        ),
      };
    }),
  );
}

export function buildManualAcceptanceBrowserPlan({ baseURL, backendURL } = {}) {
  const catalog = buildManualAcceptanceCatalog();
  const pageDataContract = buildManualAcceptancePageDataContract({ catalog });
  const pageDataTargetByRoute = new Map(
    pageDataContract.targets.map((target) => [target.route, target]),
  );
  const dashboardRequirements = businessDashboardRequirements(catalog);
  const targets = flattenCatalogTargets(catalog).map((target) => {
    const account = accountForTarget(target);
    const pageDataTarget = pageDataTargetByRoute.get(target.route);
    if (!pageDataTarget || pageDataTarget.key !== target.key) {
      throw new BrowserAcceptanceError(
        `页面 ${target.route} 没有唯一的页面数据合同`,
      );
    }
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
      dataContractTargetId: pageDataTarget.id,
      readinessProbeIds: [...pageDataTarget.probeIds],
      requiresDataEvidence:
        target.isList ||
        ["print-preview", "print-workspace"].includes(target.group) ||
        ["global-dashboard", "business-dashboard", "exception-flow"].includes(
          target.key,
        ),
      ...(target.key === "business-dashboard"
        ? { dataEvidenceRequirements: dashboardRequirements }
        : {}),
    };
  });
  assert.equal(
    targets.length,
    51,
    "手工验收浏览器计划必须覆盖当前 51 个正式目标",
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

function currentBatchProbeEvidence(probe = {}) {
  return {
    id: String(probe.id || ""),
    status: String(probe.status || ""),
    actual: Number.isSafeInteger(Number(probe.actual))
      ? Number(probe.actual)
      : null,
    expectedMinimum: Number.isSafeInteger(Number(probe.expectedMinimum))
      ? Number(probe.expectedMinimum)
      : null,
    expectedExact: Number.isSafeInteger(Number(probe.expectedExact))
      ? Number(probe.expectedExact)
      : null,
    batchEvidence: String(probe.batchEvidence || "not_proven"),
    batchPrefix: String(probe.batchPrefix || "") || null,
    exactSourceType: String(probe.exactSourceType || "") || null,
    exactSourceID: Number.isSafeInteger(Number(probe.exactSourceID))
      ? Number(probe.exactSourceID)
      : null,
    exactTaskCodePrefix: String(probe.exactTaskCodePrefix || "") || null,
    exactOwnerRoleKey: String(probe.exactOwnerRoleKey || "") || null,
    exactTaskGroup: String(probe.exactTaskGroup || "") || null,
    moduleTotals:
      probe.moduleTotals && typeof probe.moduleTotals === "object"
        ? Object.fromEntries(
            Object.entries(probe.moduleTotals).map(([key, value]) => [
              key,
              Number(value),
            ]),
          )
        : null,
  };
}

export function buildManualAcceptanceCurrentBatchReadiness(readiness) {
  const contract = buildManualAcceptancePageDataContract();
  const readinessTargetById = new Map(
    (Array.isArray(readiness?.targets) ? readiness.targets : []).map(
      (target) => [target?.id, target],
    ),
  );
  const readinessProbeById = new Map(
    (Array.isArray(readiness?.probes) ? readiness.probes : []).map((probe) => [
      probe?.id,
      probe,
    ]),
  );
  return Object.fromEntries(
    contract.targets.map((contractTarget) => {
      const readinessTarget = readinessTargetById.get(contractTarget.id);
      const supportingById = new Map(
        (Array.isArray(readinessTarget?.supporting)
          ? readinessTarget.supporting
          : []
        ).map((probe) => [probe?.id, probe]),
      );
      return [
        contractTarget.id,
        {
          targetId: contractTarget.id,
          key: contractTarget.key,
          dataStatus: String(readinessTarget?.dataStatus || "missing"),
          expectedMinimum: Number(contractTarget.expectedMinimum),
          actual: Number.isSafeInteger(Number(readinessTarget?.actual))
            ? Number(readinessTarget.actual)
            : null,
          probes: contractTarget.probeIds.map((probeId) =>
            currentBatchProbeEvidence(
              readinessProbeById.get(probeId) || supportingById.get(probeId),
            ),
          ),
        },
      ];
    }),
  );
}

export function parseManualAcceptanceBrowserArgs(argv = []) {
  const options = {
    baseURL: "",
    backendURL: "",
    reportPath: DEFAULT_REPORT_PATH,
    sourceReportPath: DEFAULT_SOURCE_REPORT_PATH,
    factReportPath: DEFAULT_FACT_REPORT_PATH,
    readinessReportPath: "",
    datasetReportPath: "",
    targetAttestation: "",
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
    if (key === "source-report") {
      options.sourceReportPath = resolveManualAcceptanceBrowserInputReportPath(
        value,
        "--source-report",
      );
      continue;
    }
    if (key === "fact-report") {
      options.factReportPath = resolveManualAcceptanceBrowserInputReportPath(
        value,
        "--fact-report",
      );
      continue;
    }
    if (key === "readiness-report") {
      options.readinessReportPath =
        resolveManualAcceptanceBrowserInputReportPath(
          value,
          "--readiness-report",
        );
      continue;
    }
    if (key === "dataset-report") {
      options.datasetReportPath = resolveManualAcceptanceBrowserInputReportPath(
        value,
        "--dataset-report",
      );
      continue;
    }
    if (key === "target-attestation-json") {
      options.targetAttestation = parseManualAcceptanceTargetAttestation(value);
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
    --base-url http://127.0.0.1:15200 \\
    --backend-url http://127.0.0.1:8310 \\
    --source-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source/apply-report.json \\
    --fact-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/facts/apply-report.json \\
    --readiness-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/readiness/verify-report.json \\
    --dataset-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/dataset/apply-report.json \\
    --report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/browser/report.json
  node scripts/qa/manual-acceptance-browser.mjs --plan \\
    --base-url http://127.0.0.1:15200 \\
    --backend-url http://127.0.0.1:8310

说明：
  只允许 localhost / 127.0.0.1 / ::1，不接受带凭据、路径、查询参数或跳转的 URL。
  真实验收只登录、读页面和切换只读页签，不点击新增、编辑、提交、完成、取消或过账动作。
  非 plan 模式必须提供同一 runner 生成的 dataset、source、facts 和 readiness 规范报告；缺少附件或岗位场景也会失败。
  customer-trial-133 使用 127.0.0.1:18375 SSH 隧道、对应 customer-trial-133 报告和 --target-attestation-json，并先通过只读 runtime identity 探针。
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
  const label = entryTarget === "mobile" ? "手机端待办" : "电脑端业务管理";
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
      systemNameVisible: text.includes("业务管理"),
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

export function evaluatePrintPreviewEvidence(
  { entryVisible, rendererVisible, rendererTextLength },
  minimumRecords,
) {
  const observedTotal =
    entryVisible && rendererVisible && Number(rendererTextLength) >= 40 ? 1 : 0;
  const minimumSatisfied = observedTotal >= Number(minimumRecords);
  return {
    status: minimumSatisfied ? "minimum_proven" : "not_proven",
    evidenceSource: "visible fixed print preview renderer DOM",
    observedTotal,
    minimumRecords,
    minimumSatisfied,
    entryVisible: Boolean(entryVisible),
    rendererVisible: Boolean(rendererVisible),
    rendererTextLength: Number(rendererTextLength) || 0,
  };
}

export function evaluatePrintSourceMinimumEvidence({
  sourcePrefix,
  visibleRows,
  matchingCurrentBatchRows,
  paginationTexts = [],
  minimumRecords,
}) {
  const renderedRows = Number(visibleRows) || 0;
  const matchingRows = Number(matchingCurrentBatchRows) || 0;
  const currentBatchRowsOnly =
    renderedRows > 0 && matchingRows === renderedRows;
  const paginationTotal = largestTotalFromTexts(paginationTexts);
  const observedTotal = currentBatchRowsOnly
    ? Math.max(renderedRows, paginationTotal)
    : 0;
  const minimumSatisfied =
    currentBatchRowsOnly && observedTotal >= Number(minimumRecords);
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : renderedRows > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource:
      "current batch source-prefix search and visible table/pagination DOM",
    sourcePrefix,
    visibleRows: renderedRows,
    matchingCurrentBatchRows: matchingRows,
    currentBatchRowsOnly,
    paginationTotal,
    observedTotal,
    minimumRecords,
    minimumSatisfied,
  };
}

export function buildPrintWorkspaceDataEvidence(proof, minimumRecords) {
  const sourceEvidence = proof?.sourceDataEvidence || {};
  const observedTotal = Number(sourceEvidence.observedTotal) || 0;
  const minimumSatisfied =
    sourceEvidence.minimumSatisfied === true &&
    Number(sourceEvidence.minimumRecords) === Number(minimumRecords) &&
    observedTotal >= Number(minimumRecords);
  return {
    ...sourceEvidence,
    status: minimumSatisfied
      ? "minimum_proven"
      : observedTotal > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource:
      sourceEvidence.evidenceSource ||
      "bound current-batch business source record proof",
    observedTotal,
    minimumRecords,
    minimumSatisfied,
  };
}

async function readPrintPreviewEvidence(page, target) {
  const entry = page.getByText("模板预览入口", { exact: true });
  const action = page.getByRole("button", {
    name: /打开可编辑打印窗口/u,
  });
  const renderer = page
    .locator(
      ".erp-material-contract-paper--preview, .erp-print-paper, .erp-engineering-print-paper",
    )
    .first();
  await entry.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
  await action.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
  await renderer.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
  const rendererText = String(await renderer.innerText()).trim();
  const evidence = evaluatePrintPreviewEvidence(
    {
      entryVisible: await entry.isVisible(),
      rendererVisible: await renderer.isVisible(),
      rendererTextLength: rendererText.length,
    },
    target.minimumRecords,
  );
  if (!evidence.minimumSatisfied) {
    throw new BrowserAcceptanceError(
      `${target.title} 未证明至少 ${target.minimumRecords} 份固定样例`,
    );
  }
  return evidence;
}

export function readBusinessSummaryTotal(targetKey, bodyText = "") {
  const patterns = {
    "task-board": [/全部任务\s*(\d+)/u],
    products: [/总产品\s*(\d+)/u],
    "production-orders": [/符合条件\s*(\d+)/u],
    "accessories-purchase": [/总订单\s*(\d+)/u],
    shipments: [/总出货单\s*(\d+)/u],
    "permission-center": [/员工账号\s*(\d+)/u, /共\s*(\d+)\s*个员工账号/u],
  };
  const values = (patterns[targetKey] || []).flatMap((pattern) => {
    const match = String(bodyText).match(pattern);
    return match ? [Number(match[1])] : [];
  });
  if (targetKey === "task-board") {
    const boardCounts = ["常规待办", "阻塞", "到期提醒", "已结束"].map(
      (label) => {
        const match = String(bodyText).match(
          new RegExp(`${label}\\s*(\\d+)`, "u"),
        );
        return match ? Number(match[1]) : null;
      },
    );
    if (boardCounts.every(Number.isInteger)) {
      values.push(boardCounts.reduce((total, value) => total + value, 0));
    }
  }
  return values.length ? Math.max(...values) : 0;
}

export function readMobileLoadedTaskCount(tabKey, bodyText = "") {
  const label = tabKey === "done" ? "已办" : "待处理";
  const match = String(bodyText).match(
    new RegExp(`已加载\\s*(\\d+)\\s*条${label}`, "u"),
  );
  return match ? Number(match[1]) : 0;
}

export function evaluateGlobalDashboardEvidence(
  queueLabels,
  visibleRows,
  minimumRecords,
) {
  const queueCounts = Object.fromEntries(
    (queueLabels || []).flatMap((label) => {
      const match = String(label || "").match(/^(.+?)，\s*(\d+)\s*项(?:，|$)/u);
      return match ? [[match[1].trim(), Number(match[2])]] : [];
    }),
  );
  const observedTotal = Object.values(queueCounts).reduce(
    (total, value) => total + value,
    0,
  );
  const minimumSatisfied =
    observedTotal >= minimumRecords && Number(visibleRows) > 0;
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : observedTotal > 0 || Number(visibleRows) > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource: "workbench queue filters and visible task rows",
    queueCounts,
    visibleRows: Number(visibleRows) || 0,
    observedTotal,
    minimumRecords,
    minimumSatisfied,
  };
}

export function evaluateExceptionFlowEvidence(
  bodyText,
  visibleItems,
  minimumRecords,
) {
  const blockedMatch = String(bodyText || "").match(/阻塞任务\s*(\d+)/u);
  const dueMatch = String(bodyText || "").match(/今日\/超时任务\s*(\d+)/u);
  const blockedCount = blockedMatch ? Number(blockedMatch[1]) : 0;
  const dueCount = dueMatch ? Number(dueMatch[1]) : 0;
  const observedTotal = blockedCount;
  const minimumSatisfied =
    blockedCount >= minimumRecords &&
    dueCount > 0 &&
    Number(visibleItems) > 0 &&
    !String(bodyText || "").includes("暂无阻塞任务");
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : blockedCount > 0 || dueCount > 0 || Number(visibleItems) > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource: "exception summary and visible exception items",
    blockedCount,
    dueCount,
    visibleItems: Number(visibleItems) || 0,
    observedTotal,
    minimumRecords,
    minimumSatisfied,
  };
}

export function evaluateBusinessDashboardEvidence(ariaLabels, requirements) {
  const parsedByLabel = new Map(
    (ariaLabels || []).flatMap((ariaLabel) => {
      const match = String(ariaLabel || "").match(/^(.+?)数量(\d+|暂不可用)$/u);
      return match ? [[match[1].trim(), match[2]]] : [];
    }),
  );
  const sources = (requirements || []).map((requirement) => {
    const raw = parsedByLabel.get(requirement.label);
    const actual = /^\d+$/u.test(String(raw || "")) ? Number(raw) : null;
    return {
      ...requirement,
      actual,
      available: actual !== null,
      minimumSatisfied:
        actual !== null && actual >= Number(requirement.minimumRecords),
    };
  });
  const minimumSatisfied =
    sources.length > 0 && sources.every((source) => source.minimumSatisfied);
  const observedTotal = sources.length
    ? Math.min(...sources.map((source) => source.actual ?? 0))
    : 0;
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : sources.some((source) => Number(source.actual) > 0)
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource: "business dashboard source aria labels",
    sources,
    observedTotal,
    minimumRecords: sources.length
      ? Math.min(...sources.map((source) => Number(source.minimumRecords)))
      : 0,
    minimumSatisfied,
  };
}

export function evaluateBusinessDashboardCurrentBatchEvidence({
  evidence,
  currentBatch,
  baselineProven = false,
}) {
  const probeById = new Map(
    (currentBatch?.probes || []).map((probe) => [probe.id, probe]),
  );
  const projectionProbe = probeById.get(BUSINESS_DASHBOARD_PROJECTION_PROBE_ID);
  const projectionProven =
    baselineProven === true &&
    projectionProbe?.status === "pass" &&
    projectionProbe?.batchEvidence === "fresh_dataset_projection" &&
    projectionProbe?.moduleTotals &&
    typeof projectionProbe.moduleTotals === "object";
  const sources = (evidence?.sources || []).map((source) => {
    const probe = probeById.get(source.probeId);
    const batchProven =
      probe?.status === "pass" &&
      probe?.batchEvidence !== "not_proven" &&
      Number.isSafeInteger(probe?.actual);
    const projectionActual = Number(
      projectionProbe?.moduleTotals?.[source.key],
    );
    const projectionCountSatisfied =
      projectionProven &&
      Number.isSafeInteger(projectionActual) &&
      source.actual === projectionActual;
    const exactCurrentBatchCountSatisfied =
      source.exactCurrentBatchCount === false ||
      (batchProven && source.actual === probe.actual);
    return {
      ...source,
      currentBatchActual: probe?.actual ?? null,
      currentBatchEvidence: probe?.batchEvidence || "not_proven",
      batchProven,
      projectionActual: Number.isSafeInteger(projectionActual)
        ? projectionActual
        : null,
      projectionCountSatisfied,
      exactCurrentBatchCountSatisfied,
    };
  });
  const currentBatchBound =
    currentBatch?.dataStatus === "pass" &&
    projectionProven &&
    sources.length > 0 &&
    sources.every(
      (source) =>
        source.batchProven &&
        source.projectionCountSatisfied &&
        source.exactCurrentBatchCountSatisfied,
    );
  const minimumSatisfied =
    evidence?.minimumSatisfied === true && currentBatchBound;
  return {
    ...evidence,
    status: minimumSatisfied
      ? "minimum_proven"
      : sources.some((source) => Number(source.actual) > 0)
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource:
      "business dashboard source aria labels bound to current-batch readiness probes",
    sources,
    projectionProven,
    currentBatchBound,
    minimumSatisfied,
  };
}

export function evaluateDashboardTaskCurrentBatchEvidence({
  evidence,
  currentBatch,
  roleKey,
  taskGroup = null,
  visibleTaskCodes = [],
  currentBatchTaskCodes = [],
}) {
  const expectedPrefix = TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey];
  const taskProbe = currentBatch?.probes?.find(
    (probe) => probe.exactTaskCodePrefix === expectedPrefix,
  );
  const currentBatchBound =
    currentBatch?.dataStatus === "pass" &&
    taskProbe?.status === "pass" &&
    taskProbe?.batchEvidence === "exact_source" &&
    taskProbe?.exactSourceType === TASK_SOURCE_TYPE &&
    Number.isSafeInteger(taskProbe?.exactSourceID) &&
    taskProbe.exactSourceID > 0 &&
    taskProbe?.exactOwnerRoleKey === roleKey &&
    taskProbe?.exactTaskCodePrefix === expectedPrefix &&
    (taskGroup === null || taskProbe?.exactTaskGroup === taskGroup);
  const matchingCurrentBatchTaskCodes = visibleTaskCodes.filter((value) =>
    String(value || "").startsWith(`${expectedPrefix}-`),
  );
  const exactCurrentBatchTaskCodes = currentBatchTaskCodes.filter((value) =>
    String(value || "").startsWith(`${expectedPrefix}-`),
  );
  const currentBatchCountExact =
    Number.isSafeInteger(currentBatch?.actual) &&
    exactCurrentBatchTaskCodes.length === currentBatch.actual &&
    new Set(exactCurrentBatchTaskCodes).size ===
      exactCurrentBatchTaskCodes.length;
  const currentBatchVisible = matchingCurrentBatchTaskCodes.length > 0;
  const minimumSatisfied =
    evidence?.minimumSatisfied === true &&
    currentBatchBound &&
    currentBatchCountExact &&
    currentBatchVisible;
  return {
    ...evidence,
    status: minimumSatisfied
      ? "minimum_proven"
      : Number(evidence?.observedTotal) > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource:
      "dashboard totals and visible task-code metadata bound to the current exact-source batch",
    currentBatchActual: currentBatch?.actual ?? null,
    currentBatchBound,
    currentBatchTaskCount: exactCurrentBatchTaskCodes.length,
    currentBatchCountExact,
    visibleCurrentBatchTaskCount: matchingCurrentBatchTaskCodes.length,
    currentBatchVisible,
    minimumSatisfied,
  };
}

async function readDashboardEvidence(page, target, datasetBinding) {
  const currentBatch = requireCurrentBatchTargetEvidence(
    target,
    datasetBinding,
  );
  if (target.key === "global-dashboard") {
    await page.waitForFunction(
      () => {
        const labels = [
          ...document.querySelectorAll(
            ".erp-workbench-queue-filter[aria-label]",
          ),
        ].map((node) => node.getAttribute("aria-label") || "");
        const total = labels.reduce((sum, label) => {
          const match = label.match(/，\s*(\d+)\s*项(?:，|$)/u);
          return sum + Number(match?.[1] || 0);
        }, 0);
        return (
          total > 0 &&
          document.querySelector(".erp-workbench-task-row--openable")
        );
      },
      null,
      { timeout: PAGE_TIMEOUT_MS },
    );
    const metrics = await page.evaluate(
      (taskCodePrefix) => ({
        queueLabels: [
          ...document.querySelectorAll(
            ".erp-workbench-queue-filter[aria-label]",
          ),
        ].map((node) => node.getAttribute("aria-label") || ""),
        visibleRows: [
          ...document.querySelectorAll(".erp-workbench-task-row--openable"),
        ].filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length,
        visibleTaskCodes: [
          ...document.querySelectorAll(
            ".erp-workbench-task-row--openable[data-task-code]",
          ),
        ]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((node) => node.getAttribute("data-task-code") || ""),
        currentBatchTaskCodes: [
          ...document.querySelectorAll(
            '[data-testid="dashboard-workflow-task-evidence"] [data-task-code]',
          ),
        ]
          .filter(
            (node) =>
              node.getAttribute("data-task-terminal") === "false" &&
              (node.getAttribute("data-task-code") || "").startsWith(
                `${taskCodePrefix}-`,
              ),
          )
          .map((node) => node.getAttribute("data-task-code") || ""),
      }),
      TASK_VISIBLE_CODE_PREFIX_BY_ROLE.boss,
    );
    return evaluateDashboardTaskCurrentBatchEvidence({
      evidence: evaluateGlobalDashboardEvidence(
        metrics.queueLabels,
        metrics.visibleRows,
        target.minimumRecords,
      ),
      currentBatch,
      roleKey: "boss",
      visibleTaskCodes: metrics.visibleTaskCodes,
      currentBatchTaskCodes: metrics.currentBatchTaskCodes,
    });
  }
  if (target.key === "business-dashboard") {
    await page.locator(".erp-business-dashboard-page").waitFor({
      state: "visible",
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForFunction(
      (expected) => {
        const labels = [
          ...document.querySelectorAll(
            ".erp-business-board-source-count[aria-label]",
          ),
        ].map((node) => node.getAttribute("aria-label") || "");
        return (
          labels.length === expected &&
          labels.every((label) => !label.includes("暂不可用"))
        );
      },
      target.dataEvidenceRequirements.length,
      { timeout: PAGE_TIMEOUT_MS },
    );
    const labels = await page
      .locator(".erp-business-board-source-count[aria-label]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") || ""),
      );
    const evidence = evaluateBusinessDashboardCurrentBatchEvidence({
      evidence: evaluateBusinessDashboardEvidence(
        labels,
        target.dataEvidenceRequirements,
      ),
      currentBatch,
      baselineProven:
        datasetBinding?.dataset?.baseline?.exactEmptyBusinessBaseline === true,
    });
    const openable = page
      .locator(".erp-business-board-source-item[data-target-path]")
      .first();
    const expectedPath = requiredText(
      await openable.getAttribute("data-target-path"),
      "业务看板可进入来源路径",
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname === expectedPath, {
        timeout: PAGE_TIMEOUT_MS,
      }),
      openable.getByRole("button").click(),
    ]);
    await waitForReadablePage(page);
    return {
      ...evidence,
      navigationProof: {
        expectedPath,
        actualPath: new URL(page.url()).pathname,
        passed: new URL(page.url()).pathname === expectedPath,
      },
    };
  }
  if (target.key === "exception-flow") {
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText || "";
        return (
          /阻塞任务\s*\d+/u.test(text) && /今日\/超时任务\s*\d+/u.test(text)
        );
      },
      null,
      { timeout: PAGE_TIMEOUT_MS },
    );
    const metrics = await page.evaluate(
      ({ taskCodePrefix, taskGroup }) => ({
        bodyText: document.body?.innerText || "",
        visibleItems: [
          ...document.querySelectorAll(".erp-command-center-focus-item"),
        ].filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length,
        visibleTaskCodes: [
          ...document.querySelectorAll(
            ".erp-command-center-focus-item[data-task-code][data-task-group]",
          ),
        ]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              node.getAttribute("data-task-group") === taskGroup
            );
          })
          .map((node) => node.getAttribute("data-task-code") || ""),
        currentBatchTaskCodes: [
          ...document.querySelectorAll(
            '[data-testid="dashboard-workflow-task-evidence"] [data-task-code][data-task-group]',
          ),
        ]
          .filter(
            (node) =>
              node.getAttribute("data-task-terminal") === "false" &&
              node.getAttribute("data-task-group") === taskGroup &&
              (node.getAttribute("data-task-code") || "").startsWith(
                `${taskCodePrefix}-`,
              ),
          )
          .map((node) => node.getAttribute("data-task-code") || ""),
      }),
      {
        taskCodePrefix: TASK_VISIBLE_CODE_PREFIX_BY_ROLE.production,
        taskGroup: "production_exception",
      },
    );
    return evaluateDashboardTaskCurrentBatchEvidence({
      evidence: evaluateExceptionFlowEvidence(
        metrics.bodyText,
        metrics.visibleItems,
        target.minimumRecords,
      ),
      currentBatch,
      roleKey: "production",
      taskGroup: "production_exception",
      visibleTaskCodes: metrics.visibleTaskCodes,
      currentBatchTaskCodes: metrics.currentBatchTaskCodes,
    });
  }
  throw new BrowserAcceptanceError(`${target.title} 缺少页面数据证据读取器`);
}

function requireCurrentBatchTargetEvidence(target, datasetBinding) {
  const currentBatch =
    datasetBinding?.readiness?.currentBatchTargets?.[
      target.dataContractTargetId
    ];
  if (
    !currentBatch ||
    currentBatch.dataStatus !== "pass" ||
    !Number.isSafeInteger(currentBatch.actual) ||
    !Array.isArray(currentBatch.probes) ||
    currentBatch.probes.length !== target.readinessProbeIds.length ||
    currentBatch.probes.some(
      (probe, index) =>
        probe.id !== target.readinessProbeIds[index] || probe.status !== "pass",
    )
  ) {
    throw new BrowserAcceptanceError(
      `${target.title} 缺少当前 V5 批次 readiness 证据`,
    );
  }
  return currentBatch;
}

export function evaluateMobileCurrentBatchEvidence({
  roleKey,
  todoCount,
  doneCount,
  minimumRecords,
  currentBatch,
}) {
  const observedTotal = Number(todoCount) + Number(doneCount);
  const taskProbe = currentBatch?.probes?.find(
    (probe) => probe.id === `mobile-tasks:${roleKey}`,
  );
  const currentBatchBound =
    currentBatch?.dataStatus === "pass" &&
    currentBatch?.actual === minimumRecords &&
    taskProbe?.status === "pass" &&
    taskProbe?.batchEvidence === "exact_source" &&
    taskProbe?.exactSourceType === TASK_SOURCE_TYPE &&
    Number.isSafeInteger(taskProbe?.exactSourceID) &&
    taskProbe.exactSourceID > 0 &&
    taskProbe?.exactTaskCodePrefix ===
      TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey] &&
    taskProbe?.exactOwnerRoleKey === roleKey;
  const minimumSatisfied =
    currentBatchBound && observedTotal === currentBatch.actual;
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : observedTotal > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource:
      "mobile DOM totals bound to exact-source readiness probe for the current batch",
    todoCount: Number(todoCount) || 0,
    doneCount: Number(doneCount) || 0,
    observedTotal,
    minimumRecords,
    currentBatchActual: currentBatch?.actual ?? null,
    currentBatchBound,
    minimumSatisfied,
  };
}

async function readMobileTaskEvidence(page, target, datasetBinding) {
  const currentBatch = requireCurrentBatchTargetEvidence(
    target,
    datasetBinding,
  );
  const minimumRecords = target.minimumRecords;
  await page.getByTestId("mobile-role-bottom-nav").waitFor({
    state: "visible",
    timeout: PAGE_TIMEOUT_MS,
  });
  const waitForActiveViewLoaded = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="mobile-role-scroll"]')
          ?.getAttribute("aria-busy") === "false",
      null,
      { timeout: PAGE_TIMEOUT_MS },
    );
  await waitForActiveViewLoaded();
  const readCurrentTotal = async (tabKey) => {
    const bodyText = await page.locator("body").innerText();
    const loadedCount = readMobileLoadedTaskCount(tabKey, bodyText);
    if (loadedCount > 0) return loadedCount;
    const toggle = page
      .locator('[data-testid^="mobile-role-list-toggle-"]')
      .first();
    const attributeTotal = await toggle
      .getAttribute("data-total-item-count")
      .then((value) => Number(value || 0))
      .catch(() => 0);
    if (attributeTotal > 0) return attributeTotal;
    return largestTotalFromTexts([bodyText]);
  };
  const todoCount = await readCurrentTotal("todo");
  await page.getByTestId("mobile-role-nav-done").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".mobile-role-tasks-page h1")
        ?.textContent?.trim() === "已办",
    null,
    { timeout: PAGE_TIMEOUT_MS },
  );
  await waitForActiveViewLoaded();
  await page.waitForFunction(
    ({ loadedTodoCount, requiredMinimum }) => {
      const match = (document.body?.innerText || "").match(
        /已加载\s*(\d+)\s*条已办/u,
      );
      return (
        match && loadedTodoCount + Number(match[1] || 0) >= requiredMinimum
      );
    },
    { loadedTodoCount: todoCount, requiredMinimum: minimumRecords },
    { timeout: PAGE_TIMEOUT_MS },
  );
  const doneCount = await readCurrentTotal("done");
  await page.getByTestId("mobile-role-nav-todo").click();
  return evaluateMobileCurrentBatchEvidence({
    roleKey: target.roleKey,
    todoCount,
    doneCount,
    minimumRecords,
    currentBatch,
  });
}

function sharedTextPrefix(values) {
  const normalized = values.map((value) => String(value || "")).filter(Boolean);
  if (normalized.length === 0) return "";
  let prefix = normalized[0];
  for (const value of normalized.slice(1)) {
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function resolveCurrentBatchListFilter(
  target,
  currentBatch,
  datasetBinding,
) {
  if (target.key === "print-center") {
    return { mode: "bound_catalog", identifier: null };
  }
  if (target.key === "shipments") {
    return {
      mode: "exact_business_number",
      identifier: requiredText(
        datasetBinding?.dataset?.shipments?.longShipmentNo,
        "当前批次 25 行出货单号",
      ),
    };
  }
  if (["permission-center", "system-audit-logs"].includes(target.key)) {
    const identifier = sharedTextPrefix(
      [...FORMAL_BROWSER_ACCOUNTS, ...EXCEPTION_BROWSER_ACCOUNTS].map(
        (account) => account.username,
      ),
    );
    if (identifier.length < 5) {
      throw new BrowserAcceptanceError("验收账号缺少稳定的当前批次搜索前缀");
    }
    return { mode: "account_prefix", identifier };
  }
  const taskProbe = currentBatch.probes.find(
    (probe) =>
      probe.batchEvidence === "exact_source" && probe.exactTaskCodePrefix,
  );
  if (taskProbe) {
    return {
      mode: "exact_task_prefix",
      identifier: taskProbe.exactTaskCodePrefix,
    };
  }
  const sourceProbe = currentBatch.probes.find(
    (probe) => probe.batchEvidence === "prefix_filtered" && probe.batchPrefix,
  );
  if (sourceProbe) {
    return { mode: "source_prefix", identifier: sourceProbe.batchPrefix };
  }
  const factIdentifier = String(
    datasetBinding?.dataset?.currentBatchIdentifiers?.[target.key] || "",
  ).trim();
  if (factIdentifier) {
    return { mode: "exact_business_number", identifier: factIdentifier };
  }
  throw new BrowserAcceptanceError(
    `${target.title} 没有可在页面核对的当前批次标识`,
  );
}

async function filterVisibleListToCurrentBatch(page, target, filter) {
  const candidates = page.locator(
    'input[placeholder*="搜索"],input[placeholder^="操作人"]',
  );
  let search = null;
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) {
      search = candidate;
      break;
    }
  }
  if (!search) {
    throw new BrowserAcceptanceError(
      `${target.title} 没有可用于当前批次核对的搜索框`,
    );
  }
  await search.fill(filter.identifier);
  await page.keyboard.press("Enter");
  const itemSelector = [
    ".ant-table-tbody > tr:not(.ant-table-placeholder)",
    ".erp-task-board-card",
    ".erp-audit-event",
  ].join(",");
  await page.waitForFunction(
    ({ selector, identifier }) => {
      const marker = identifier.toLowerCase();
      return [...document.querySelectorAll(selector)].some((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const searchable = `${node.getAttribute("data-task-code") || ""} ${node.textContent || ""}`;
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          searchable.toLowerCase().includes(marker)
        );
      });
    },
    { selector: itemSelector, identifier: filter.identifier },
    { timeout: PAGE_TIMEOUT_MS },
  );
  if (target.key === "task-board") {
    await page.waitForURL(
      (url) => url.searchParams.get("q") === filter.identifier,
      { timeout: PAGE_TIMEOUT_MS },
    );
    await page.evaluate(() => {
      delete window.__manualAcceptanceTaskBoardStable;
    });
    await page.waitForFunction(
      ({ selector, identifier }) => {
        const marker = identifier.toLowerCase();
        const signature = [...document.querySelectorAll(selector)]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              `${node.getAttribute("data-task-code") || ""} ${node.textContent || ""}`
                .toLowerCase()
                .includes(marker)
            );
          })
          .map((node) => node.getAttribute("data-task-code") || "")
          .sort()
          .join("|");
        const now = performance.now();
        const previous = window.__manualAcceptanceTaskBoardStable;
        if (!signature || previous?.signature !== signature) {
          window.__manualAcceptanceTaskBoardStable = {
            signature,
            since: now,
          };
          return false;
        }
        return now - previous.since >= 300;
      },
      { selector: itemSelector, identifier: filter.identifier },
      { timeout: PAGE_TIMEOUT_MS, polling: 50 },
    );
  }
  const snapshot = await page.evaluate(
    ({ selector, identifier }) => {
      const marker = identifier.toLowerCase();
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return (
          rect.width > 0 && rect.height > 0 && style.visibility !== "hidden"
        );
      };
      const items = [...document.querySelectorAll(selector)].filter(visible);
      return {
        visibleItems: items.length,
        matchingCurrentBatchItems: items.filter((node) =>
          `${node.getAttribute("data-task-code") || ""} ${node.textContent || ""}`
            .toLowerCase()
            .includes(marker),
        ).length,
      };
    },
    { selector: itemSelector, identifier: filter.identifier },
  );
  return {
    ...filter,
    ...snapshot,
    currentBatchVisible: snapshot.matchingCurrentBatchItems > 0,
  };
}

export function evaluateCurrentBatchListEvidence({
  currentBatch,
  currentBatchDOM,
  renderedItems,
  pageReportedTotal,
  minimumRecords,
  exactEvidencePassed = true,
}) {
  const currentBatchBound =
    currentBatch?.dataStatus === "pass" &&
    Number.isSafeInteger(currentBatch?.actual) &&
    currentBatch.actual >= minimumRecords;
  const currentBatchVisible =
    currentBatchDOM?.mode === "bound_catalog"
      ? Number(renderedItems) >= minimumRecords
      : currentBatchDOM?.currentBatchVisible === true;
  const minimumSatisfied =
    currentBatchBound &&
    currentBatchVisible &&
    exactEvidencePassed &&
    (currentBatchDOM?.mode !== "exact_task_prefix" ||
      Number(pageReportedTotal) === currentBatch.actual);
  return {
    status: minimumSatisfied
      ? "minimum_proven"
      : Number(renderedItems) > 0
        ? "page_has_data_minimum_not_proven"
        : "not_proven",
    evidenceSource:
      "current-batch readiness probe plus filtered visible list DOM",
    renderedItems: Number(renderedItems) || 0,
    observedTotal: currentBatch?.actual ?? 0,
    pageReportedTotal: Number(pageReportedTotal) || 0,
    minimumRecords,
    currentBatchBound,
    currentBatchDOM,
    minimumSatisfied,
  };
}

async function readListEvidence(page, target, datasetBinding) {
  let specializedEvidence = null;
  let currentBatchDOM = null;
  if (target.group === "mobile") {
    return readMobileTaskEvidence(page, target, datasetBinding);
  }
  const currentBatch = requireCurrentBatchTargetEvidence(
    target,
    datasetBinding,
  );
  if (target.key === "permission-center") {
    const accountTab = page.getByRole("tab", { name: /员工账号/u });
    if (await accountTab.count()) {
      await accountTab.click();
      await page
        .locator(".erp-permission-section--admins .ant-table-tbody")
        .waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    }
  }
  if (target.key === "inventory") {
    await page.getByRole("tab", { name: "库存批次", exact: true }).click();
    await page.getByPlaceholder("搜索批次").waitFor({
      state: "visible",
      timeout: PAGE_TIMEOUT_MS,
    });
  }
  if (target.key === "shipping-release") {
    const visibleCodePrefix = TASK_VISIBLE_CODE_PREFIX_BY_ROLE.warehouse;
    const search = page.getByRole("textbox", { name: "搜索待办任务" });
    await search.fill(visibleCodePrefix);
    await page.locator(".erp-workflow-business-page").waitFor({
      state: "visible",
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () =>
        !document.querySelector(
          ".erp-workflow-business-page .ant-spin-spinning",
        ) &&
        Boolean(
          document.querySelector(
            ".erp-workflow-business-page .ant-table-tbody > tr:not(.ant-table-placeholder)",
          ),
        ),
      null,
      { timeout: PAGE_TIMEOUT_MS },
    );
    const taskRows = await page
      .locator(
        ".erp-workflow-business-page .ant-table-tbody > tr:not(.ant-table-placeholder)",
      )
      .evaluateAll(
        (rows, prefix) =>
          rows
            .map((row) => {
              const text = row.textContent?.replace(/\s+/gu, " ").trim() || "";
              const strongCode = [...row.querySelectorAll("td strong")]
                .map((node) => node.textContent?.trim() || "")
                .find((value) => value.startsWith(`${prefix}-`));
              return {
                code:
                  strongCode ||
                  text.match(new RegExp(`${prefix}-\\d{2}`, "u"))?.[0] ||
                  "",
                text,
              };
            })
            .filter((row) => row.code),
        visibleCodePrefix,
      );
    const visibleCodes = taskRows.map((row) => row.code);
    if (
      visibleCodes.length === 0 ||
      visibleCodes.some(
        (value) =>
          !new RegExp(`^${visibleCodePrefix}-\\d{2}$`, "u").test(
            String(value || "").trim(),
          ),
      )
    ) {
      throw new BrowserAcceptanceError(
        "出货放行页面未显示当前 V5 仓库任务批次",
      );
    }
    if (
      datasetBinding?.readiness?.taskSourceType !== TASK_SOURCE_TYPE ||
      !Number.isSafeInteger(datasetBinding?.readiness?.taskSourceID)
    ) {
      throw new BrowserAcceptanceError("出货放行页面缺少同批任务来源绑定");
    }
    specializedEvidence = evaluateShipmentReleaseEvidence(
      taskRows,
      datasetBinding?.dataset?.taskSchedule,
      Date.now(),
    );
    if (!specializedEvidence.passed) {
      throw new BrowserAcceptanceError(
        `出货放行页面未证明即将到期与已超时状态：${specializedEvidence.reason}`,
      );
    }
    currentBatchDOM = {
      mode: "exact_task_prefix",
      identifier: visibleCodePrefix,
      visibleItems: taskRows.length,
      matchingCurrentBatchItems: taskRows.length,
      currentBatchVisible: true,
    };
  } else if (target.key !== "shipments") {
    const filter = resolveCurrentBatchListFilter(
      target,
      currentBatch,
      datasetBinding,
    );
    currentBatchDOM =
      filter.mode === "bound_catalog"
        ? filter
        : await filterVisibleListToCurrentBatch(page, target, filter);
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
    const auditEvents = [
      ...document.querySelectorAll(".erp-audit-event"),
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
      auditEvents,
      paginationTexts,
      bodyText,
    };
  });
  const renderedItems = Math.max(
    metrics.tableRows,
    metrics.mobileRows,
    metrics.printTemplates,
    metrics.taskCards,
    metrics.auditEvents,
  );
  const pageReportedTotal = Math.max(
    renderedItems,
    largestTotalFromTexts([...metrics.paginationTexts, metrics.bodyText]),
    readBusinessSummaryTotal(target.key, metrics.bodyText),
  );
  if (target.key === "shipments") {
    const expected = datasetBinding?.dataset?.shipments;
    if (
      expected?.exactCount !== MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT ||
      pageReportedTotal !== expected.exactCount
    ) {
      throw new BrowserAcceptanceError(
        `出货页面必须精确显示 ${MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT} 张同批出货单，当前为 ${pageReportedTotal}`,
      );
    }
    const search = page.getByPlaceholder("搜索出货");
    await search.fill(expected.longShipmentNo);
    await page.keyboard.press("Enter");
    const row = page
      .locator(".ant-table-tbody > tr:not(.ant-table-placeholder)")
      .filter({ hasText: expected.longShipmentNo })
      .first();
    await row.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    await row.click();
    await page.getByRole("button", { name: /查看明细/u }).click();
    const modal = page.getByRole("dialog", { name: "查看出货明细" });
    await modal.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    const lineTag = modal.getByText(
      `${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT} 行`,
      { exact: true },
    );
    await lineTag.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    specializedEvidence = {
      passed: true,
      exactCount: pageReportedTotal,
      longShipmentNo: expected.longShipmentNo,
      longLineCount: MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
    };
    currentBatchDOM = {
      mode: "exact_business_number",
      identifier: expected.longShipmentNo,
      visibleItems: 1,
      matchingCurrentBatchItems: 1,
      currentBatchVisible: true,
    };
    await modal.locator(".ant-modal-close").click();
  }
  const evidence = evaluateCurrentBatchListEvidence({
    currentBatch,
    currentBatchDOM,
    renderedItems,
    pageReportedTotal,
    minimumRecords: target.minimumRecords,
    exactEvidencePassed:
      !["shipping-release", "shipments"].includes(target.key) ||
      (specializedEvidence?.passed === true &&
        currentBatch.actual === target.minimumRecords),
  });
  return {
    ...evidence,
    specializedEvidence,
  };
}

export function evaluateShipmentReleaseEvidence(rows, schedule, nowMs) {
  let expectedSchedule;
  try {
    expectedSchedule = buildManualAcceptanceTaskSchedule(schedule?.anchorUnix);
  } catch (error) {
    return {
      passed: false,
      reason: `任务时间锚点无效：${error?.message || error}`,
    };
  }
  if (JSON.stringify(schedule) !== JSON.stringify(expectedSchedule)) {
    return { passed: false, reason: "任务时间锚点结构不一致" };
  }
  const observedAt = Number(nowMs);
  if (
    !Number.isFinite(observedAt) ||
    observedAt < schedule.anchorUnix * 1000 ||
    observedAt > schedule.dueSoonValidUntilUnix * 1000
  ) {
    return { passed: false, reason: "即将到期样例已超出本批有效时间窗口" };
  }
  const requirements = [
    ["YS-V5-CK-02", "可执行", "即将到期"],
    ["YS-V5-CK-13", "阻塞", "已超时"],
    ["YS-V5-CK-16", "已完成", null],
    ["YS-V5-CK-19", "退回", null],
  ];
  const expectedCodes = requirements.map(([code]) => code);
  const visibleCodes = (rows || []).map((item) => String(item?.code || ""));
  if (
    visibleCodes.length !== expectedCodes.length ||
    new Set(visibleCodes).size !== visibleCodes.length ||
    JSON.stringify([...visibleCodes].sort()) !==
      JSON.stringify([...expectedCodes].sort())
  ) {
    return {
      passed: false,
      reason: `当前批次必须精确显示 ${expectedCodes.join(", ")}`,
      observedCodes: visibleCodes,
      requiredCodes: expectedCodes,
    };
  }
  const missing = requirements.filter(([code, status, dueLabel]) => {
    const row = (rows || []).find((item) => item.code === code);
    return (
      !row ||
      !String(row.text || "").includes(status) ||
      (dueLabel && !String(row.text || "").includes(dueLabel))
    );
  });
  return {
    passed: missing.length === 0,
    reason: missing.length
      ? `缺少 ${missing.map(([code]) => code).join(", ")}`
      : null,
    observedAtUtc: new Date(observedAt).toISOString(),
    validUntilUtc: schedule.dueSoonValidUntilUtc,
    observedCodes: visibleCodes,
    requiredCodes: expectedCodes,
  };
}

export function assertBoundSimulatedPrintReports(source, fact) {
  const sourceRunId = requiredText(source?.runId, "source report runId");
  const target = requiredText(source?.target, "source report target");
  const identityFields = [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
    "semanticDigest",
  ];
  const identityMatches = identityFields.every(
    (field) =>
      requiredText(source?.[field], `source report ${field}`) ===
      requiredText(fact?.[field], `fact report ${field}`),
  );
  const runtimeMatches =
    requiredText(
      source?.runtime?.configRevision,
      "source report configRevision",
    ) ===
    requiredText(fact?.runtime?.configRevision, "fact report configRevision");
  const sourceAttestation = source?.runtime?.targetAttestation;
  const factAttestation = fact?.runtime?.targetAttestation;
  const runtimeAttestationMatches =
    target === CUSTOMER_TRIAL_133_TARGET
      ? sourceAttestation?.source === "out-of-band" &&
        factAttestation?.source === "out-of-band" &&
        ["release", "migration"].every(
          (field) =>
            requiredText(
              sourceAttestation?.[field],
              `source report ${field}`,
            ) ===
            requiredText(factAttestation?.[field], `fact report ${field}`),
        )
      : !sourceAttestation && !factAttestation;
  if (
    source?.mode !== "apply" ||
    fact?.mode !== "apply" ||
    source?.simulatedOnly !== true ||
    fact?.simulatedOnly !== true ||
    source?.realCustomerImport !== false ||
    fact?.realCustomerImport !== false ||
    fact?.reportContract !== SOURCE_DRIVEN_FACT_REPORT_CONTRACT ||
    !identityMatches ||
    !runtimeMatches ||
    !runtimeAttestationMatches
  ) {
    throw new BrowserAcceptanceError(
      "打印验收只接受同一批次、同一运行配置的本机模拟业务记录",
    );
  }
  const exactLongRecord = (records, identityField, label) => {
    const matches = (Array.isArray(records) ? records : []).filter(
      (item) =>
        Array.isArray(item?.items) &&
        item.items.length === 25 &&
        String(item?.[identityField] || "").trim(),
    );
    if (matches.length === 0) {
      throw new BrowserAcceptanceError(`同批源数据缺少 25 行${label}打印样本`);
    }
    const selected = matches
      .slice()
      .sort((left, right) =>
        String(left[identityField]).localeCompare(
          String(right[identityField]),
          "zh-CN",
        ),
      )[0];
    return {
      recordQuery: requiredText(
        selected[identityField],
        `${label}打印样本编号`,
      ),
      lineCount: selected.items.length,
    };
  };
  const printRecords = {
    purchaseOrder: exactLongRecord(
      source?.referenceRecords?.purchaseOrders,
      "orderNo",
      "采购订单",
    ),
    outsourcingOrder: exactLongRecord(
      source?.referenceRecords?.outsourcingOrders,
      "orderNo",
      "委外订单",
    ),
    bomVersion: exactLongRecord(
      [
        ...(Array.isArray(source?.referenceRecords?.bomVersions)
          ? source.referenceRecords.bomVersions
          : []),
        ...(Array.isArray(source?.steps)
          ? source.steps
              .filter(
                (item) =>
                  item?.target === "bom_version" &&
                  ["create", "reuse"].includes(item?.action) &&
                  Number.isSafeInteger(item?.id) &&
                  item.id > 0 &&
                  Number.isSafeInteger(item?.items) &&
                  item.items > 0,
              )
              .map((item) => ({
                version: item.key,
                items: Array.from({ length: item.items }, () => null),
              }))
          : []),
      ],
      "version",
      "产品结构版本",
    ),
  };
  return {
    datasetKey: requiredText(source?.datasetKey, "source report datasetKey"),
    dataVersion: requiredText(source?.dataVersion, "source report dataVersion"),
    runId: sourceRunId,
    sourceRunId,
    factRunId: requiredText(fact?.runId, "fact report runId"),
    target,
    backendURL: requiredText(source?.backendURL, "source report backendURL"),
    databaseName: requiredText(
      source?.databaseName,
      "source report databaseName",
    ),
    semanticDigest: requiredText(
      source?.semanticDigest,
      "source report semanticDigest",
    ),
    sourcePrefix: requiredText(source?.prefix, "source report prefix"),
    configRevision: requiredText(
      source?.runtime?.configRevision,
      "source report configRevision",
    ),
    printRecords,
    runtimeAttestation:
      target === CUSTOMER_TRIAL_133_TARGET
        ? {
            source: "out-of-band",
            release: sourceAttestation.release,
            migration: sourceAttestation.migration,
          }
        : null,
  };
}

async function loadBoundSimulatedPrintInput({
  sourceReportPath,
  factReportPath,
  backendURL,
}) {
  const [sourceRaw, factRaw] = await Promise.all([
    fs.readFile(sourceReportPath, "utf8"),
    fs.readFile(factReportPath, "utf8"),
  ]);
  const source = JSON.parse(sourceRaw);
  const fact = JSON.parse(factRaw);
  const identity = assertBoundSimulatedPrintReports(source, fact);
  if (identity.backendURL !== backendURL) {
    throw new BrowserAcceptanceError(
      "浏览器后端与同批模拟数据报告的 backendURL 不一致",
    );
  }
  return {
    ...identity,
    sourceReportPath: path.relative(REPO_ROOT, sourceReportPath),
    factReportPath: path.relative(REPO_ROOT, factReportPath),
    sourceReportSHA256: createHash("sha256").update(sourceRaw).digest("hex"),
    factReportSHA256: createHash("sha256").update(factRaw).digest("hex"),
  };
}

export function assertManualAcceptanceTaskGroupCoverage(
  readiness,
  taskReportCoverage = null,
) {
  const taskInput = readiness?.reportInputs?.taskReport;
  const coverage = readiness?.summary?.taskGroupCoverage;
  const digest = String(taskInput?.taskGroupCoverageDigest || "");
  const expectedRoles = FORMAL_BROWSER_ACCOUNTS.map((item) => item.roleKey)
    .filter((roleKey) => roleKey !== "system_admin")
    .sort();
  const actualRoles = Object.keys(coverage?.byRole || {}).sort();
  const relevantProbes = (
    Array.isArray(readiness?.probes) ? readiness.probes : []
  ).filter((probe) => /^(mobile-tasks|workflow-tasks):/u.test(probe?.id || ""));
  const validProbeCoverage =
    relevantProbes.length >= expectedRoles.length &&
    relevantProbes.every(
      (probe) =>
        Array.isArray(probe.requiredScenarios) &&
        probe.requiredScenarios.length > 0 &&
        Array.isArray(probe.requiredTaskGroups) &&
        probe.requiredTaskGroups.length > 0 &&
        probe.taskGroupCounts &&
        typeof probe.taskGroupCounts === "object" &&
        !Array.isArray(probe.taskGroupCounts) &&
        probe.requiredTaskGroups.every(
          (taskGroup) => Number(probe.taskGroupCounts[taskGroup] || 0) > 0,
        ) &&
        Array.isArray(probe.missingTaskGroups) &&
        probe.missingTaskGroups.length === 0 &&
        Array.isArray(probe.unknownTaskGroups) &&
        probe.unknownTaskGroups.length === 0 &&
        probe.enoughTaskGroups === true &&
        probe.scenarioCounts &&
        typeof probe.scenarioCounts === "object" &&
        !Array.isArray(probe.scenarioCounts) &&
        probe.requiredScenarios.every(
          (scenarioKey) => Number(probe.scenarioCounts[scenarioKey] || 0) > 0,
        ) &&
        Array.isArray(probe.missingScenarios) &&
        probe.missingScenarios.length === 0 &&
        Array.isArray(probe.unknownScenarios) &&
        probe.unknownScenarios.length === 0 &&
        probe.enoughScenarios === true,
    );
  const validSummaryCoverage = expectedRoles.every((roleKey) => {
    const role = coverage?.byRole?.[roleKey];
    if (
      !Array.isArray(role?.taskGroups) ||
      role.taskGroups.length === 0 ||
      !role.groups ||
      typeof role.groups !== "object" ||
      Array.isArray(role.groups)
    ) {
      return false;
    }
    const groupKeys = Object.keys(role.groups).sort();
    if (
      JSON.stringify([...role.taskGroups].sort()) !== JSON.stringify(groupKeys)
    ) {
      return false;
    }
    return groupKeys.every((taskGroup) => {
      const group = role.groups[taskGroup];
      return (
        Array.isArray(group?.requiredScenarios) &&
        group.requiredScenarios.length > 0 &&
        group.scenarioCounts &&
        typeof group.scenarioCounts === "object" &&
        !Array.isArray(group.scenarioCounts) &&
        group.requiredScenarios.every(
          (scenarioKey) => Number(group.scenarioCounts[scenarioKey] || 0) > 0,
        ) &&
        Array.isArray(group.missingScenarios) &&
        group.missingScenarios.length === 0 &&
        Array.isArray(group.unknownScenarios) &&
        group.unknownScenarios.length === 0 &&
        group.enoughScenarios === true
      );
    });
  });
  const taskReportCoverageMatches = taskReportCoverage
    ? taskReportCoverage.catalogScenarioDigest === digest &&
      expectedRoles.every((roleKey) => {
        const taskGroups = [
          ...(taskReportCoverage.taskGroupsByRole?.[roleKey] || []),
        ].sort();
        const summaryRole = coverage?.byRole?.[roleKey];
        if (
          JSON.stringify(taskGroups) !==
          JSON.stringify([...(summaryRole?.taskGroups || [])].sort())
        ) {
          return false;
        }
        return taskGroups.every(
          (taskGroup) =>
            JSON.stringify(
              Object.entries(
                taskReportCoverage.scenariosByRoleTaskGroup?.[roleKey]?.[
                  taskGroup
                ] || {},
              ).sort(([left], [right]) => left.localeCompare(right)),
            ) ===
            JSON.stringify(
              Object.entries(
                summaryRole?.groups?.[taskGroup]?.scenarioCounts || {},
              ).sort(([left], [right]) => left.localeCompare(right)),
            ),
        );
      })
    : true;
  if (
    !/^[0-9a-f]{64}$/u.test(digest) ||
    coverage?.catalogScenarioDigest !== digest ||
    coverage?.complete !== true ||
    JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles) ||
    !validSummaryCoverage ||
    !validProbeCoverage ||
    !taskReportCoverageMatches
  ) {
    throw new BrowserAcceptanceError(
      "readiness 未完整证明九个岗位的 taskGroup 与场景覆盖",
    );
  }
  return {
    catalogScenarioDigest: digest,
    roleCount: actualRoles.length,
    relevantProbeCount: relevantProbes.length,
    complete: true,
  };
}

export function assertManualAcceptanceBrowserReadinessBinding(
  readiness,
  printInput,
) {
  const summary = readiness?.summary || {};
  const substrate = assertManualAcceptanceDatasetReadinessBoundary(
    readiness,
    summary.queryEvidenceComplete === true ? 0 : 1,
  );
  const factInput = readiness?.reportInputs?.factReport;
  const sourceInput = readiness?.reportInputs?.sourceReport;
  const taskInput = readiness?.reportInputs?.taskReport;
  const identityFields = [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
    "semanticDigest",
  ];
  const factMatches = identityFields.every(
    (field) => String(factInput?.[field] || "") === String(printInput[field]),
  );
  const sourceMatches =
    ["datasetKey", "dataVersion", "target", "backendURL", "databaseName"].every(
      (field) =>
        String(sourceInput?.[field] || "") === String(printInput[field] || ""),
    ) &&
    String(sourceInput?.runId || "") === printInput.sourceRunId &&
    String(sourceInput?.prefix || "") === printInput.sourcePrefix;
  const expectedTaskIdentity = manualAcceptanceTaskBatchIdentity(
    printInput.sourceRunId,
  );
  const taskMatches =
    ["datasetKey", "dataVersion", "target", "backendURL", "databaseName"].every(
      (field) =>
        String(taskInput?.[field] || "") === String(printInput[field] || ""),
    ) &&
    String(taskInput?.runId || "") === printInput.sourceRunId &&
    String(taskInput?.prefix || "") === expectedTaskIdentity.prefix &&
    String(taskInput?.sourceType || "") === TASK_SOURCE_TYPE &&
    Number(taskInput?.sourceID) === expectedTaskIdentity.sourceID;
  const taskGroupCoverage = assertManualAcceptanceTaskGroupCoverage(readiness);
  const runtimeMatches =
    readiness?.datasetKey === printInput.datasetKey &&
    readiness?.dataVersion === printInput.dataVersion &&
    readiness?.runId === printInput.sourceRunId &&
    readiness?.target === printInput.target &&
    readiness?.backendURL === printInput.backendURL &&
    readiness?.databaseName === printInput.databaseName &&
    readiness?.customerKey === CUSTOMER_KEY &&
    readiness?.runtimePreflight?.target === printInput.target &&
    readiness?.runtimePreflight?.customerKey === CUSTOMER_KEY &&
    readiness?.runtimePreflight?.configRevision === printInput.configRevision &&
    factInput?.runtime?.configRevision === printInput.configRevision;
  const reportedAttestation = factInput?.runtime?.targetAttestation;
  const remoteAttestationMatches =
    printInput.target === CUSTOMER_TRIAL_133_TARGET
      ? reportedAttestation?.source === "out-of-band" &&
        ["release", "migration"].every(
          (field) =>
            String(reportedAttestation?.[field] || "") ===
            String(printInput.runtimeAttestation?.[field] || ""),
        )
      : !reportedAttestation && !printInput.runtimeAttestation;
  if (
    !factMatches ||
    !sourceMatches ||
    !taskMatches ||
    !runtimeMatches ||
    !remoteAttestationMatches
  ) {
    throw new BrowserAcceptanceError(
      "readiness 报告与当前模拟数据批次或运行态身份不一致",
    );
  }
  return {
    ...substrate,
    datasetRunnerRevision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
    sourcePrefix: printInput.sourcePrefix,
    taskRunId: taskInput.runId,
    taskPrefix: taskInput.prefix,
    taskSourceType: taskInput.sourceType,
    taskSourceID: Number(taskInput.sourceID),
    taskVisibleCodePrefixes: { ...TASK_VISIBLE_CODE_PREFIX_BY_ROLE },
    taskGroupCoverage,
    currentBatchTargets: buildManualAcceptanceCurrentBatchReadiness(readiness),
  };
}

async function loadBoundReadinessInput({ readinessReportPath, printInput }) {
  const raw = await fs.readFile(readinessReportPath, "utf8");
  const report = JSON.parse(raw);
  const binding = assertManualAcceptanceBrowserReadinessBinding(
    report,
    printInput,
  );
  return {
    ...binding,
    readinessReportPath: path.relative(REPO_ROOT, readinessReportPath),
    readinessReportSHA256: createHash("sha256").update(raw).digest("hex"),
  };
}

async function readJSONEvidence(reportPath, label) {
  let raw;
  let report;
  try {
    raw = await fs.readFile(reportPath, "utf8");
    report = JSON.parse(raw);
  } catch (error) {
    throw new BrowserAcceptanceError(
      `${label} 无法读取：${error?.message || error}`,
      2,
    );
  }
  return { raw, report };
}

function expectedDatasetTargetAlias(policyTarget) {
  return policyTarget === CUSTOMER_TRIAL_133_TARGET ? policyTarget : "local";
}

function firstCurrentBatchBusinessNo(records, fields, predicate = () => true) {
  const record = (Array.isArray(records) ? records : []).find(predicate);
  if (!record) return null;
  for (const field of fields) {
    const value = String(record?.[field] || "").trim();
    if (value) return value;
  }
  return null;
}

function currentBatchFactIdentifiers(factReport) {
  const records = factReport?.referenceRecords || {};
  const financeNo = (factType) =>
    firstCurrentBatchBusinessNo(
      records.financeFacts,
      ["fact_no", "factNo"],
      (item) =>
        String(item?.fact_type || item?.factType || "").toUpperCase() ===
        factType,
    );
  return {
    "quality-inspections": firstCurrentBatchBusinessNo(
      records.qualityInspections,
      ["inspection_no", "inspectionNo"],
    ),
    inbound: firstCurrentBatchBusinessNo(records.purchaseReceipts, [
      "receipt_no",
      "receiptNo",
    ]),
    inventory: firstCurrentBatchBusinessNo(records.inventoryLots, [
      "lot_no",
      "lotNo",
    ]),
    "production-orders": firstCurrentBatchBusinessNo(records.productionOrders, [
      "order_no",
      "orderNo",
    ]),
    "production-progress": firstCurrentBatchBusinessNo(
      records.productionFacts,
      ["fact_no", "factNo"],
    ),
    outbound: firstCurrentBatchBusinessNo(records.stockReservations, [
      "reservation_no",
      "reservationNo",
    ]),
    shipments: firstCurrentBatchBusinessNo(records.shipments, [
      "shipment_no",
      "shipmentNo",
    ]),
    reconciliation: financeNo("RECONCILIATION"),
    payables: financeNo("PAYABLE"),
    receivables: financeNo("RECEIVABLE"),
    invoices: financeNo("INVOICE"),
  };
}

export async function verifyManualAcceptanceDatasetApplyReportBinding({
  datasetReportPath,
  sourceReportPath,
  factReportPath,
  readinessReportPath,
  printInput,
  datasetReportRoot = DATASET_REPORT_ROOT,
}) {
  if (!datasetReportPath) {
    throw new BrowserAcceptanceError(
      "浏览器验收必须提供同批 --dataset-report",
      2,
    );
  }
  const targetAlias = expectedDatasetTargetAlias(printInput.target);
  const expectedDatasetPath = path.resolve(
    datasetReportRoot,
    printInput.dataVersion,
    targetAlias,
    "dataset/apply-report.json",
  );
  if (path.resolve(datasetReportPath) !== expectedDatasetPath) {
    throw new BrowserAcceptanceError(
      "dataset apply 报告不在当前批次与目标的 canonical path",
      2,
    );
  }
  const datasetEvidence = await readJSONEvidence(
    expectedDatasetPath,
    "dataset apply 报告",
  );
  const dataset = datasetEvidence.report;
  const datasetSemanticDigest =
    typeof dataset?.semanticDigest === "string" &&
    /^[0-9a-f]{64}$/u.test(dataset.semanticDigest)
      ? dataset.semanticDigest
      : "";
  const identityMatches =
    dataset?.contract === MANUAL_ACCEPTANCE_DATASET_APPLY_REPORT_CONTRACT &&
    dataset?.mode === "apply" &&
    dataset?.scope === "manual-acceptance-dataset" &&
    dataset?.ok === true &&
    dataset?.failedStage == null &&
    dataset?.datasetKey === printInput.datasetKey &&
    dataset?.dataVersion === printInput.dataVersion &&
    dataset?.runId === printInput.sourceRunId &&
    Boolean(datasetSemanticDigest) &&
    dataset?.target?.alias === targetAlias &&
    dataset?.target?.policyTarget === printInput.target &&
    dataset?.target?.backendURL === printInput.backendURL &&
    dataset?.target?.databaseName === printInput.databaseName;
  if (!identityMatches) {
    throw new BrowserAcceptanceError(
      "dataset apply 报告与当前模拟数据批次或目标身份不一致",
    );
  }
  if (
    !Array.isArray(dataset.stages) ||
    dataset.stages.length !== MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.length ||
    dataset.stages.some(
      (stage, index) =>
        stage?.key !== MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS[index] ||
        stage?.stageKey !== stage.key ||
        stage?.status !== "completed" ||
        stage?.dataVersion !== printInput.dataVersion ||
        stage?.semanticDigest !== datasetSemanticDigest ||
        stage?.references?.runner?.revision !==
          MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
    )
  ) {
    throw new BrowserAcceptanceError(
      "dataset apply 报告没有完整完成全部 canonical stages",
    );
  }

  const components = {};
  const componentDigests = {};
  for (const stage of dataset.stages) {
    const expectedPath = path.resolve(
      REPO_ROOT,
      manualAcceptanceDatasetStageReportPath({
        outputRoot: datasetReportRoot,
        dataVersion: printInput.dataVersion,
        targetAlias,
        stageKey: stage.key,
      }),
    );
    if (path.resolve(stage.references.runner.reportPath) !== expectedPath) {
      throw new BrowserAcceptanceError(
        `dataset ${stage.key} stage 报告路径不是 canonical path`,
      );
    }
    const evidence = await readJSONEvidence(
      expectedPath,
      `dataset ${stage.key} stage 报告`,
    );
    const digest = digestManualAcceptanceDatasetComponentReport(
      evidence.report,
    );
    if (digest !== stage.references.runner.componentDigest) {
      throw new BrowserAcceptanceError(
        `dataset ${stage.key} stage component digest 不一致`,
      );
    }
    for (const [field, expected] of Object.entries({
      datasetKey: printInput.datasetKey,
      dataVersion: printInput.dataVersion,
      runId: printInput.sourceRunId,
      target: printInput.target,
      backendURL: printInput.backendURL,
      databaseName: printInput.databaseName,
    })) {
      if (String(evidence.report?.[field] ?? "") !== String(expected)) {
        throw new BrowserAcceptanceError(
          `dataset ${stage.key} stage ${field} 与当前批次不一致`,
        );
      }
    }
    components[stage.key] = {
      path: expectedPath,
      raw: evidence.raw,
      report: evidence.report,
    };
    componentDigests[stage.key] = digest;
  }

  for (const [stageKey, providedPath] of Object.entries({
    source: sourceReportPath,
    facts: factReportPath,
    readiness: readinessReportPath,
  })) {
    if (path.resolve(providedPath || "") !== components[stageKey].path) {
      throw new BrowserAcceptanceError(
        `--${stageKey === "facts" ? "fact" : stageKey}-report 必须使用 dataset runner 同批 stage 报告`,
        2,
      );
    }
  }

  const core = components.core.report;
  const baseline = components.baseline.report;
  const freshBaseline = dataset.freshEmptyBaseline;
  const baselineConfigMatches = [
    "configRevision",
    "configProductVersion",
    "configApplyPurpose",
    "configDatasetVersion",
    "configTarget",
  ].every(
    (field) =>
      String(baseline.customerConfig?.[field] ?? "") ===
      String(core?.[field] ?? ""),
  );
  const emptyBaselineProven =
    freshBaseline?.status === "completed" &&
    ["fresh_empty_baseline", "validated_resume_receipt"].includes(
      freshBaseline?.origin,
    ) &&
    ["verified", "reused"].includes(freshBaseline?.operation) &&
    path.resolve(freshBaseline?.reportPath || "") ===
      components.baseline.path &&
    freshBaseline?.componentDigest === componentDigests.baseline &&
    baseline?.contract === "manual-acceptance-empty-baseline-report-v1" &&
    baseline?.summary?.exactEmptyBusinessBaseline === true &&
    baseline?.summary?.zeroBusinessRecords === true &&
    baseline?.summary?.checkedBusinessObjectKinds ===
      MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length &&
    Object.keys(baseline?.zeroCounts || {}).length ===
      MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length &&
    MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.every(
      ({ key }) => baseline.zeroCounts?.[key] === 0,
    ) &&
    baseline?.databaseName === printInput.databaseName &&
    baseline?.runtimeIdentity?.databaseName === printInput.databaseName &&
    core?.configRevision === printInput.configRevision &&
    baselineConfigMatches;
  const runtimeBaselineMatches =
    printInput.target === CUSTOMER_TRIAL_133_TARGET
      ? baseline?.runtimeIdentity?.release ===
          printInput.runtimeAttestation?.release &&
        baseline?.runtimeIdentity?.migration ===
          printInput.runtimeAttestation?.migration
      : baseline?.runtimeIdentity?.release == null &&
        baseline?.runtimeIdentity?.migration == null;
  if (!emptyBaselineProven || !runtimeBaselineMatches) {
    throw new BrowserAcceptanceError(
      "dataset apply 报告没有绑定当前运行态的 fresh empty baseline",
    );
  }

  const taskCoverageDigest = requiredText(
    components.task.report?.coverage?.catalogScenarioDigest,
    "task report coverage.catalogScenarioDigest",
  );
  if (
    components.readiness.report?.reportInputs?.taskReport
      ?.taskGroupCoverageDigest !== taskCoverageDigest
  ) {
    throw new BrowserAcceptanceError(
      "task 与 readiness 的 taskGroup coverage digest 不一致",
    );
  }
  const taskGroupCoverage = assertManualAcceptanceTaskGroupCoverage(
    components.readiness.report,
    components.task.report.coverage,
  );
  let expectedTaskSchedule;
  try {
    expectedTaskSchedule = buildManualAcceptanceTaskSchedule(
      dataset?.taskSchedule?.anchorUnix,
    );
  } catch (error) {
    throw new BrowserAcceptanceError(
      `dataset 任务时间锚点无效：${error?.message || error}`,
    );
  }
  if (
    JSON.stringify(dataset.taskSchedule) !==
      JSON.stringify(expectedTaskSchedule) ||
    JSON.stringify(components.task.report?.schedule) !==
      JSON.stringify(expectedTaskSchedule)
  ) {
    throw new BrowserAcceptanceError(
      "dataset 与 task component 没有绑定同一个任务时间锚点",
    );
  }
  const shipments = components.facts.report?.referenceRecords?.shipments;
  if (
    !Array.isArray(shipments) ||
    shipments.length !== MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT
  ) {
    throw new BrowserAcceptanceError(
      `dataset facts 必须精确包含 ${MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT} 张出货单`,
    );
  }
  const longShipments = shipments.filter(
    (shipment) =>
      Array.isArray(shipment?.items) &&
      shipment.items.length ===
        MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
  );
  if (longShipments.length !== MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT) {
    throw new BrowserAcceptanceError(
      `dataset facts 必须恰好包含 ${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT} 张 ${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT} 行出货单`,
    );
  }
  const longShipmentNo = requiredText(
    longShipments[0]?.shipmentNo || longShipments[0]?.shipment_no,
    "25 行出货单号",
  );
  return {
    applyReportPath: path.relative(REPO_ROOT, expectedDatasetPath),
    applyReportSHA256: createHash("sha256")
      .update(datasetEvidence.raw)
      .digest("hex"),
    datasetSemanticDigest,
    targetAlias,
    baseline: {
      origin: freshBaseline.origin,
      operation: freshBaseline.operation,
      reportPath: path.relative(REPO_ROOT, components.baseline.path),
      componentDigest: componentDigests.baseline,
      exactEmptyBusinessBaseline: true,
    },
    componentDigests,
    taskSchedule: expectedTaskSchedule,
    shipments: {
      exactCount: shipments.length,
      longShipmentNo,
      longLineCount: MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
    },
    currentBatchIdentifiers: currentBatchFactIdentifiers(
      components.facts.report,
    ),
    attachments: {
      reportPath: path.relative(REPO_ROOT, components.attachments.path),
      componentDigest: componentDigests.attachments,
      summary: components.attachments.report.summary,
    },
    taskGroupCoverage,
  };
}

export function assertManualAcceptanceBrowserReportPathBinding(
  reportPath,
  printInput,
) {
  if (printInput.target !== CUSTOMER_TRIAL_133_TARGET) return reportPath;
  const expected = path.resolve(
    DATASET_REPORT_ROOT,
    printInput.dataVersion,
    printInput.target,
    "browser/report.json",
  );
  if (reportPath !== expected) {
    throw new BrowserAcceptanceError(
      `customer-trial-133 browser report must use ${path.relative(REPO_ROOT, expected)}`,
      2,
    );
  }
  return reportPath;
}

export async function verifyManualAcceptanceBrowserDatasetBinding({
  backendURL,
  printInput,
  datasetReportPath,
  sourceReportPath,
  factReportPath,
  readinessReportPath,
  targetAttestation,
  fetchImpl,
}) {
  if (printInput.backendURL !== backendURL) {
    throw new BrowserAcceptanceError("浏览器后端与当前模拟数据批次不一致");
  }
  if (!datasetReportPath) {
    throw new BrowserAcceptanceError(
      "浏览器验收必须提供同批 --dataset-report",
      2,
    );
  }
  if (!readinessReportPath) {
    throw new BrowserAcceptanceError(
      "浏览器验收必须提供同批 --readiness-report",
      2,
    );
  }
  const dataset = await verifyManualAcceptanceDatasetApplyReportBinding({
    datasetReportPath,
    sourceReportPath,
    factReportPath,
    readinessReportPath,
    printInput,
  });
  const readiness = await loadBoundReadinessInput({
    readinessReportPath,
    printInput,
  });
  if (printInput.target !== CUSTOMER_TRIAL_133_TARGET && targetAttestation) {
    throw new BrowserAcceptanceError(
      "本地浏览器验收不得提供 customer-trial-133 attestation",
      2,
    );
  }
  const policy = resolveManualAcceptanceTarget({
    target: printInput.target,
    backendURL,
    datasetKey: printInput.datasetKey,
    dataVersion: printInput.dataVersion,
    runId: printInput.sourceRunId,
    databaseName: printInput.databaseName,
  });
  const parsedAttestation =
    parseManualAcceptanceTargetAttestation(targetAttestation);
  const runtimeIdentity =
    await assertManualAcceptanceRuntimeIdentityPrecondition({
      policy,
      attestation: parsedAttestation,
      fetchImpl,
    });
  if (runtimeIdentity.databaseName !== printInput.databaseName) {
    throw new BrowserAcceptanceError(
      "当前运行时数据库与同批模拟数据报告不一致",
    );
  }
  if (
    printInput.target === CUSTOMER_TRIAL_133_TARGET &&
    (runtimeIdentity.release !== printInput.runtimeAttestation?.release ||
      runtimeIdentity.migration !== printInput.runtimeAttestation?.migration)
  ) {
    throw new BrowserAcceptanceError(
      "当前运行时 release/migration 与同批模拟数据报告不一致",
    );
  }
  return {
    datasetKey: printInput.datasetKey,
    dataVersion: printInput.dataVersion,
    runId: printInput.sourceRunId,
    target: printInput.target,
    semanticDigest: printInput.semanticDigest,
    configRevision: printInput.configRevision,
    dataset,
    readiness,
    runtimeIdentity: {
      databaseName: runtimeIdentity.databaseName,
      release: runtimeIdentity.release ?? null,
      migration: runtimeIdentity.migration ?? null,
      proof: runtimeIdentity.proof,
    },
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

export async function assertPDFRenderResponse(response, templateKey) {
  const headers = response.headers();
  const status = response.status();
  const contentType = String(headers["content-type"] || "").toLowerCase();
  if (!response.ok()) {
    let reason = "";
    try {
      const payload = await response.json();
      reason = sanitizeDiagnostic(payload?.message || payload?.error?.message);
    } catch {
      // HTTP status remains the authoritative failure evidence when the body
      // is absent or not JSON.
    }
    throw new BrowserAcceptanceError(
      `${templateKey} PDF HTTP ${status}${reason ? `：${reason}` : ""}`,
    );
  }
  const requestID = requiredText(headers["x-request-id"], "PDF request_id");
  if (!/application\/pdf/u.test(contentType)) {
    throw new BrowserAcceptanceError(
      `${templateKey} PDF Content-Type 非 application/pdf`,
    );
  }
  return { status, contentType, requestID };
}

async function readPrintSourceMinimumEvidence(
  page,
  {
    search,
    searchPlaceholder,
    sourcePrefix,
    minimumSourceRecords,
    templateKey,
  },
) {
  await search.fill(sourcePrefix);
  await page.waitForFunction(
    ({ placeholder, prefix }) => {
      const input = [...document.querySelectorAll("input")].find(
        (candidate) => candidate.getAttribute("placeholder") === placeholder,
      );
      const visibleRows = [
        ...document.querySelectorAll(".ant-table-tbody > tr.ant-table-row"),
      ].filter((row) => {
        const style = window.getComputedStyle(row);
        const rect = row.getBoundingClientRect();
        return (
          rect.width > 0 && rect.height > 0 && style.visibility !== "hidden"
        );
      });
      return (
        input?.value === prefix &&
        visibleRows.length > 0 &&
        visibleRows.every((row) => row.innerText.includes(prefix))
      );
    },
    { placeholder: searchPlaceholder, prefix: sourcePrefix },
    { timeout: PAGE_TIMEOUT_MS },
  );
  const metrics = await page.evaluate((prefix) => {
    const visibleRows = [
      ...document.querySelectorAll(".ant-table-tbody > tr.ant-table-row"),
    ].filter((row) => {
      const style = window.getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
    });
    return {
      visibleRows: visibleRows.length,
      matchingCurrentBatchRows: visibleRows.filter((row) =>
        row.innerText.includes(prefix),
      ).length,
      paginationTexts: [
        ...document.querySelectorAll(
          ".ant-pagination-total-text,.ant-pagination",
        ),
      ].map((node) => node.textContent || ""),
    };
  }, sourcePrefix);
  const evidence = evaluatePrintSourceMinimumEvidence({
    sourcePrefix,
    ...metrics,
    minimumRecords: minimumSourceRecords,
  });
  if (!evidence.minimumSatisfied) {
    throw new BrowserAcceptanceError(
      `${templateKey} 当前批次来源记录不足：expected>=${minimumSourceRecords} actual=${evidence.observedTotal}`,
    );
  }
  return evidence;
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
    expectedLineCount,
    minimumSourceRecords,
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
    assert.equal(
      new URL(page.url()).pathname,
      sourceRoute,
      `${templateKey} 应停留在绑定的业务来源页`,
    );
    await page
      .getByText(COMPANY_NAME, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    const search = page.getByPlaceholder(searchPlaceholder, { exact: true });
    const sourceDataEvidence = await readPrintSourceMinimumEvidence(page, {
      search,
      searchPlaceholder,
      sourcePrefix,
      minimumSourceRecords,
      templateKey,
    });
    const row = page.getByRole("row").filter({ hasText: recordQuery }).first();
    const recordCell = row.getByText(recordQuery, { exact: true }).first();
    const selectionControl = row
      .locator(
        ".ant-table-selection-column .ant-radio-wrapper, .ant-table-selection-column .ant-checkbox-wrapper",
      )
      .first();
    const selectionInput = row
      .locator(
        ".ant-table-selection-column input[type=radio], .ant-table-selection-column input[type=checkbox]",
      )
      .first();
    const action = page
      .locator("button")
      .filter({ has: page.getByText(actionLabel, { exact: true }) })
      .first();
    await action.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    let selectionStable = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await search.fill(recordQuery);
      const filteredRowsReady = await page
        .waitForFunction(
          (query) => {
            const rows = [
              ...document.querySelectorAll(
                ".ant-table-tbody > tr.ant-table-row",
              ),
            ].filter((candidate) => {
              const style = window.getComputedStyle(candidate);
              const rect = candidate.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== "hidden"
              );
            });
            return (
              rows.length > 0 &&
              rows.every((candidate) => candidate.innerText.includes(query))
            );
          },
          recordQuery,
          { timeout: 5_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!filteredRowsReady) {
        await page.waitForTimeout(500);
        continue;
      }
      await row.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
      await recordCell.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
      await selectionControl.waitFor({
        state: "visible",
        timeout: PAGE_TIMEOUT_MS,
      });
      await selectionInput.waitFor({
        state: "attached",
        timeout: PAGE_TIMEOUT_MS,
      });
      if (!(await selectionInput.isChecked())) {
        await selectionControl.click();
      }
      const actionReady = await page
        .waitForFunction(
          ({ label, query }) => {
            const selected = [
              ...document.querySelectorAll(".ant-table-row-selected"),
            ].some((selectedRow) => selectedRow.innerText.includes(query));
            const enabledAction = [...document.querySelectorAll("button")].some(
              (button) =>
                button.innerText.replace(/\s+/gu, " ").trim() === label &&
                !button.disabled,
            );
            return selected && enabledAction;
          },
          { label: actionLabel, query: recordQuery },
          { timeout: 3_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!actionReady) {
        continue;
      }
      await page.waitForTimeout(750);
      selectionStable = await Promise.all([
        search.inputValue().then((value) => value === recordQuery),
        selectionInput.isChecked(),
        row.evaluate((selectedRow) =>
          selectedRow.classList.contains("ant-table-row-selected"),
        ),
        action.isDisabled().then((disabled) => !disabled),
      ])
        .then((checks) => checks.every(Boolean))
        .catch(() => false);
      if (selectionStable) {
        break;
      }
      await page.waitForTimeout(250);
    }
    assert.equal(
      selectionStable,
      true,
      `${recordQuery} 的搜索、选中与打印动作应保持稳定`,
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
    const workspaceSourceLabel =
      templateKey === "processing-contract" ? "来自业务页面" : "业务记录带值";
    await workspace
      .getByText(workspaceSourceLabel, { exact: true })
      .waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    assert.equal(expectedLineCount, 25, `${templateKey} 必须绑定 25 行源记录`);
    const counterPattern = {
      "material-purchase-contract": /采购明细行:\s*25\//u,
      "processing-contract": /加工明细行:\s*25\//u,
      "engineering-material-detail": /物料行:\s*25\//u,
      "engineering-color-card": /色卡块:\s*25\//u,
      "engineering-work-instruction": /正文行:\s*25\b/u,
    }[templateKey];
    if (counterPattern) {
      await page.waitForTimeout(100);
      const workspaceText = await workspace.locator("body").innerText();
      assert.match(
        workspaceText,
        counterPattern,
        `${templateKey} 工作台未读回 25 行明细`,
      );
    }
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
    const responseEvidence = await assertPDFRenderResponse(
      response,
      templateKey,
    );
    const pdf = await readPDFPreviewEvidence(workspace, preview);
    assert.ok(pdf.byteLength > 100, `${templateKey} PDF 内容为空`);
    assert.equal(pdf.magic, "%PDF");
    return {
      templateKey,
      sourceRoute,
      actionLabel,
      sourcePrefix,
      recordQuery,
      expectedLineCount,
      sourceDataEvidence,
      workspaceSource: "business",
      workspacePath: new URL(workspace.url()).pathname,
      status: responseEvidence.status,
      contentType: responseEvidence.contentType,
      byteLength: pdf.byteLength,
      requestID: responseEvidence.requestID,
      passed: true,
    };
  } catch (error) {
    const diagnostics = await page
      .evaluate(
        ({ label, query, searchPlaceholder: placeholder }) => {
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
            searchValue:
              document.querySelector(
                `input[placeholder="${CSS.escape(placeholder)}"]`,
              )?.value || "",
            visibleRows: [
              ...document.querySelectorAll(
                ".ant-table-tbody > tr.ant-table-row",
              ),
            ].filter((row) => {
              const style = window.getComputedStyle(row);
              const rect = row.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== "hidden"
              );
            }).length,
            matchingRows: [
              ...document.querySelectorAll(
                ".ant-table-tbody > tr.ant-table-row",
              ),
            ].filter((row) => row.innerText.includes(query)).length,
            selectedRows: document.querySelectorAll(".ant-table-row-selected")
              .length,
            selectionBarActive: Boolean(
              document.querySelector(
                ".erp-business-selection-action-bar--active",
              ),
            ),
          };
        },
        {
          label: actionLabel,
          query: recordQuery,
          searchPlaceholder,
        },
      )
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
  { baseURL, password, printInput },
) {
  const workspaceMinimumByTemplate = new Map(
    buildManualAcceptanceCatalog().technicalManifest.printWorkspacePages.map(
      (target) => [target.key, target.minimumRecords],
    ),
  );
  const cases = [
    [
      "demo_purchase",
      "/erp/purchase/accessories",
      "打印合同",
      "material-purchase-contract",
      "搜索采购单",
      printInput.printRecords.purchaseOrder.recordQuery,
      printInput.printRecords.purchaseOrder.lineCount,
    ],
    [
      "demo_production",
      "/erp/purchase/processing-contracts",
      "加工合同打印",
      "processing-contract",
      "搜索合同",
      printInput.printRecords.outsourcingOrder.recordQuery,
      printInput.printRecords.outsourcingOrder.lineCount,
    ],
    [
      "demo_engineering",
      "/erp/purchase/material-bom",
      "打印物料明细",
      "engineering-material-detail",
      "搜索 BOM 版本",
      printInput.printRecords.bomVersion.recordQuery,
      printInput.printRecords.bomVersion.lineCount,
    ],
    [
      "demo_engineering",
      "/erp/purchase/material-bom",
      "打印色卡",
      "engineering-color-card",
      "搜索 BOM 版本",
      printInput.printRecords.bomVersion.recordQuery,
      printInput.printRecords.bomVersion.lineCount,
    ],
    [
      "demo_engineering",
      "/erp/purchase/material-bom",
      "打印作业指导书",
      "engineering-work-instruction",
      "搜索 BOM 版本",
      printInput.printRecords.bomVersion.recordQuery,
      printInput.printRecords.bomVersion.lineCount,
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
    expectedLineCount,
  ] of cases) {
    const minimumSourceRecords = workspaceMinimumByTemplate.get(templateKey);
    try {
      assert.ok(
        Number.isSafeInteger(minimumSourceRecords) && minimumSourceRecords > 0,
        `${templateKey} 缺少打印工作台最少来源记录合同`,
      );
      const account = FORMAL_BROWSER_ACCOUNTS.find(
        (candidate) => candidate.username === username,
      );
      assert.ok(account, `${username} 必须是正式岗位试用账号`);
      const login = await loginFormalAccount(browser, {
        baseURL,
        account,
        password,
      });
      await wait(AUTH_PACE_MS);
      templates.push(
        await verifyBusinessPrintTemplate(browser, {
          baseURL,
          storageState: login.storageState,
          sourcePrefix: printInput.sourcePrefix,
          sourceRoute,
          actionLabel,
          templateKey,
          searchPlaceholder,
          recordQuery,
          expectedLineCount,
          minimumSourceRecords,
        }),
      );
    } catch (error) {
      templates.push({
        templateKey,
        sourceRoute,
        actionLabel,
        sourcePrefix: printInput.sourcePrefix,
        recordQuery,
        expectedLineCount,
        minimumSourceRecords,
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
  const dataEvidenceTargets = targets.filter(
    (item) => item.requiresDataEvidence ?? item.isList,
  );
  const failedDataMinimums = dataEvidenceTargets.filter(
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
    dataEvidenceTargets,
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
    datasetBinding,
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
    const dataEvidence = target.requiresDataEvidence
      ? target.isList
        ? await readListEvidence(page, target, datasetBinding)
        : target.group === "print-preview"
          ? await readPrintPreviewEvidence(page, target)
          : await readDashboardEvidence(page, target, datasetBinding)
      : {
          status: "not_applicable",
          evidenceSource: "covered by account or print-specific evidence",
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
  { baseURL, storageState, route, text, absentTexts = [] },
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
    for (const absentText of absentTexts) {
      assert.equal(
        await page.getByText(absentText, { exact: true }).count(),
        0,
        `${route} 不应显示 ${absentText}`,
      );
    }
    assert.deepEqual(events, []);
    return { route, visibleText: text, absentTexts, passed: true };
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
      ["/entry", "电脑端"],
      ["/entry", "手机待办"],
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
      text: "当前账号暂无可用入口",
      absentTexts: ["电脑端", "手机待办"],
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
    sourceReportPath = DEFAULT_SOURCE_REPORT_PATH,
    factReportPath = DEFAULT_FACT_REPORT_PATH,
    readinessReportPath = "",
    datasetReportPath = "",
    targetAttestation = "",
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
  const normalizedSourceReportPath =
    resolveManualAcceptanceBrowserInputReportPath(
      path.relative(REPO_ROOT, sourceReportPath),
      "--source-report",
    );
  const normalizedFactReportPath =
    resolveManualAcceptanceBrowserInputReportPath(
      path.relative(REPO_ROOT, factReportPath),
      "--fact-report",
    );
  const normalizedReadinessReportPath = readinessReportPath
    ? resolveManualAcceptanceBrowserInputReportPath(
        path.relative(REPO_ROOT, readinessReportPath),
        "--readiness-report",
      )
    : "";
  const normalizedDatasetReportPath = datasetReportPath
    ? resolveManualAcceptanceBrowserInputReportPath(
        path.relative(REPO_ROOT, datasetReportPath),
        "--dataset-report",
      )
    : "";
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
  const printInput = await loadBoundSimulatedPrintInput({
    sourceReportPath: normalizedSourceReportPath,
    factReportPath: normalizedFactReportPath,
    backendURL: normalizedBackendURL,
  });
  assertManualAcceptanceBrowserReportPathBinding(
    normalizedReportPath,
    printInput,
  );
  const datasetBinding = await verifyManualAcceptanceBrowserDatasetBinding({
    backendURL: normalizedBackendURL,
    printInput,
    datasetReportPath: normalizedDatasetReportPath,
    sourceReportPath: normalizedSourceReportPath,
    factReportPath: normalizedFactReportPath,
    readinessReportPath: normalizedReadinessReportPath,
    targetAttestation,
    fetchImpl,
  });
  const preflight = await verifyRuntimePreflight({
    baseURL: normalizedBaseURL,
    backendURL: normalizedBackendURL,
    fetchImpl,
  });
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
    printEvidence = await verifyBusinessPrintEvidence(browser, {
      baseURL: normalizedBaseURL,
      password: secret,
      printInput,
    });
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
          datasetBinding,
        }),
      );
      await wait(TARGET_PACE_MS);
    }
    for (const target of plan.targets.filter(
      (item) => item.group === "print-workspace",
    )) {
      const proof = printEvidence.templates.find(
        (item) => item.templateKey === target.key,
      );
      const dataEvidence = buildPrintWorkspaceDataEvidence(
        proof,
        target.minimumRecords,
      );
      targets.push({
        ...target,
        passed: proof?.passed === true && dataEvidence.minimumSatisfied,
        actualPath: proof?.workspacePath || "",
        customerBrandVerified: preflight.verified,
        customerBrandVisibleOnPage: true,
        visibleContent: {
          heading: target.title,
          textSample: proof?.passed
            ? "业务记录带值；PDF 已生成"
            : "打印证据未通过",
        },
        dataEvidence,
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
    dataEvidenceTargets,
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
    datasetBinding,
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
      dataEvidenceTargetCount: dataEvidenceTargets.length,
      dataMinimumProvenCount: dataEvidenceTargets.filter(
        (item) => item.dataEvidence?.status === "minimum_proven",
      ).length,
      dataPresentMinimumNotProvenCount: dataEvidenceTargets.filter(
        (item) =>
          item.dataEvidence?.status === "page_has_data_minimum_not_proven",
      ).length,
      dataNotProvenCount: dataEvidenceTargets.filter(
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
    targetAttestation:
      options.targetAttestation ||
      process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
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
