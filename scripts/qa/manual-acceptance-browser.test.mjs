import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXCEPTION_BROWSER_ACCOUNTS,
  FORMAL_BROWSER_ACCOUNTS,
  MANUAL_ACCEPTANCE_BROWSER_BOUNDARY,
  assertPDFRenderResponse,
  assertBoundSimulatedPrintReports,
  buildManualAcceptanceBrowserPlan,
  normalizeLocalBrowserURL,
  partitionTargetRuntimeEvents,
  summarizeManualAcceptance,
  parseManualAcceptanceBrowserArgs,
  resolveManualAcceptanceBrowserReportPath,
  resolveManualAcceptanceBrowserInputReportPath,
  runManualAcceptanceBrowser,
  readBusinessSummaryTotal,
  readMobileLoadedTaskCount,
} from "./manual-acceptance-browser.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const scriptPath = path.resolve(
  repoRoot,
  "scripts/qa/manual-acceptance-browser.mjs",
);

test("manual acceptance browser plan covers all 48 catalog targets and ten formal accounts", () => {
  const plan = buildManualAcceptanceBrowserPlan({
    baseURL: "http://127.0.0.1:5177",
    backendURL: "http://localhost:8300",
  });

  assert.equal(plan.writesDatabase, false);
  assert.equal(plan.clicksBusinessWriteActions, false);
  assert.equal(plan.summary.totalTargets, 48);
  assert.deepEqual(plan.summary, {
    entryPages: 2,
    desktopPages: 27,
    mobileRolePages: 9,
    printPreviewPages: 5,
    printWorkspacePages: 5,
    totalTargets: 48,
  });
  assert.equal(plan.targets.length, 48);
  assert.equal(plan.formalAccounts.length, 10);
  assert.equal(FORMAL_BROWSER_ACCOUNTS.length, 10);
  assert.equal(EXCEPTION_BROWSER_ACCOUNTS.length, 3);
  assert.equal(
    plan.targets.filter((item) => item.group === "mobile").length,
    9,
  );
  assert.equal(
    plan.targets.filter((item) => item.group === "desktop").length,
    27,
  );
  const productionOrders = plan.targets.find(
    (item) => item.group === "desktop" && item.key === "production-orders",
  );
  assert.equal(productionOrders?.roleKey, "production");
  assert.equal(productionOrders?.username, "demo_production");
  assert.equal(
    plan.targets.filter((item) => item.username === "demo_admin").length,
    2,
  );
  assert.equal(
    plan.targets.every(
      (item) => item.key === "admin-login" || (item.username && item.roleKey),
    ),
    true,
  );
});

test("manual acceptance browser boundary is explicitly read-only", () => {
  assert.deepEqual(MANUAL_ACCEPTANCE_BROWSER_BOUNDARY, {
    readOnly: true,
    writesDatabase: false,
    clicksBusinessWriteActions: false,
    callsBusinessMutationRPC: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    allowedInteractions: [
      "login",
      "route_navigation",
      "read_only_tab_navigation",
    ],
  });
});

test("browser and backend URLs fail closed outside localhost", () => {
  for (const value of [
    "https://example.com",
    "http://192.168.0.106:5177",
    "http://user:secret@127.0.0.1:5177",
    "file:///tmp/index.html",
    "http://127.0.0.1:5177/erp",
    "http://127.0.0.1:5177/?next=prod",
  ]) {
    assert.throws(() => normalizeLocalBrowserURL(value, "target"));
  }
  assert.equal(
    normalizeLocalBrowserURL("http://127.0.0.1:5177", "target"),
    "http://127.0.0.1:5177",
  );
  assert.equal(
    normalizeLocalBrowserURL("http://localhost:8300", "target"),
    "http://localhost:8300",
  );
  assert.equal(
    normalizeLocalBrowserURL("http://[::1]:8300", "target"),
    "http://[::1]:8300",
  );
});

test("CLI requires explicit local frontend and backend origins", () => {
  assert.throws(
    () => parseManualAcceptanceBrowserArgs([]),
    /--base-url is required/,
  );
  assert.throws(
    () =>
      parseManualAcceptanceBrowserArgs([
        "--base-url",
        "https://erp.example.com",
        "--backend-url",
        "http://127.0.0.1:8300",
      ]),
    /must stay on this computer/,
  );
  const parsed = parseManualAcceptanceBrowserArgs([
    "--plan",
    "--base-url=http://127.0.0.1:5177",
    "--backend-url",
    "http://127.0.0.1:8300",
    "--source-report",
    "output/qa/manual-acceptance/datasets/v3/source/apply-report.json",
    "--fact-report",
    "output/qa/manual-acceptance/datasets/v3/facts/apply-report.json",
  ]);
  assert.equal(parsed.plan, true);
  assert.equal(parsed.baseURL, "http://127.0.0.1:5177");
  assert.equal(parsed.backendURL, "http://127.0.0.1:8300");
  assert.match(parsed.sourceReportPath, /datasets\/v3\/source\/apply-report\.json$/u);
  assert.match(parsed.factReportPath, /datasets\/v3\/facts\/apply-report\.json$/u);
});

test("report output cannot leave the manual acceptance browser directory", () => {
  assert.match(
    resolveManualAcceptanceBrowserReportPath(
      "output/qa/manual-acceptance/browser/custom.json",
    ),
    /output\/qa\/manual-acceptance\/browser\/custom\.json$/u,
  );
  assert.throws(
    () => resolveManualAcceptanceBrowserReportPath("output/qa/other.json"),
    /must stay under/,
  );
  assert.throws(
    () =>
      resolveManualAcceptanceBrowserReportPath(
        "output/qa/manual-acceptance/browser/report.txt",
      ),
    /\.json file/,
  );
});

test("bound print inputs stay in the acceptance report root and match the current batch", () => {
  assert.match(
    resolveManualAcceptanceBrowserInputReportPath(
      "output/qa/manual-acceptance/datasets/v3/source/apply-report.json",
      "--source-report",
    ),
    /datasets\/v3\/source\/apply-report\.json$/u,
  );
  assert.throws(
    () =>
      resolveManualAcceptanceBrowserInputReportPath(
        "output/qa/other/apply-report.json",
        "--source-report",
      ),
    /must stay under/u,
  );

  const runtime = { configRevision: "customer-config-v3" };
  const source = {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.15-v3",
    runId: "20260715-V3",
    target: "local-dev",
    backendURL: "http://127.0.0.1:8310",
    semanticDigest: "digest-v3",
    prefix: "SIM-YOYOOSUN-UAT-20260715-V3",
    runtime,
  };
  const fact = {
    ...source,
    reportContract: "source-driven-operational-facts-v1",
  };
  assert.deepEqual(assertBoundSimulatedPrintReports(source, fact), {
    sourceRunId: "20260715-V3",
    factRunId: "20260715-V3",
    sourcePrefix: "SIM-YOYOOSUN-UAT-20260715-V3",
  });
  assert.throws(
    () =>
      assertBoundSimulatedPrintReports(source, {
        ...fact,
        runId: "20260715-OLD",
        sourceRunId: source.runId,
      }),
    /同一批次/u,
  );
});

test("fresh print workspaces never hide render-pdf failures by route or status", () => {
  const events = [
    {
      type: "response",
      message: "400 http://127.0.0.1:5177/templates/render-pdf",
    },
    {
      type: "console",
      message:
        "Failed to load resource: the server responded with a status of 400 (Bad Request)",
    },
  ];
  const fresh = partitionTargetRuntimeEvents(
    {
      group: "print-workspace",
      route: "/erp/print-workspace/processing-contract?draft=fresh",
    },
    events,
  );
  assert.equal(fresh.blocking.length, 2);
  assert.equal(fresh.expected.length, 0);

  const businessPage = partitionTargetRuntimeEvents(
    { group: "desktop", route: "/erp/sales/project-orders/sales-orders" },
    events,
  );
  assert.equal(businessPage.blocking.length, 2);
  assert.equal(businessPage.expected.length, 0);
});

test("business summary totals use the visible client-facing counters", () => {
  assert.equal(readBusinessSummaryTotal("task-board", "全部任务 20"), 20);
  assert.equal(
    readBusinessSummaryTotal(
      "task-board",
      "常规待办 6 阻塞 3 到期提醒 8 已结束 3",
    ),
    20,
  );
  assert.equal(
    readBusinessSummaryTotal("products", "总产品 34 当前结果 20"),
    34,
  );
  assert.equal(
    readBusinessSummaryTotal("accessories-purchase", "总订单 203"),
    203,
  );
  assert.equal(
    readBusinessSummaryTotal("permission-center", "角色模板 11 管理员账号 22"),
    22,
  );
  assert.equal(
    readBusinessSummaryTotal("production-orders", "符合条件 47 当前页 20"),
    47,
  );
});

test("mobile task totals use the active tab's loaded summary even without a collapse toggle", () => {
  assert.equal(readMobileLoadedTaskCount("todo", "已加载 18 条待处理"), 18);
  assert.equal(readMobileLoadedTaskCount("done", "已加载 2 条已办"), 2);
  assert.equal(readMobileLoadedTaskCount("done", "已加载 18 条待处理"), 0);
});

test("mobile task evidence waits for each lazy-loaded tab before reading zero", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /mobile-role-scroll/u);
  assert.match(source, /getAttribute\("aria-busy"\) === "false"/u);
  assert.match(
    source,
    /mobile-role-nav-done[\s\S]{0,900}waitForActiveViewLoaded\(\)[\s\S]{0,500}readCurrentTotal\("done"\)/u,
  );
  assert.match(
    source,
    /loadedTodoCount \+ Number\(match\[1\] \|\| 0\) >= requiredMinimum/u,
  );
});

test("PDF response failures surface before blob preview polling", async () => {
  await assert.rejects(
    () =>
      assertPDFRenderResponse(
        {
          headers: () => ({ "content-type": "application/json" }),
          status: () => 400,
          ok: () => false,
          json: async () => ({
            message: "html 样式包含不允许的外部资源或动态表达式",
          }),
        },
        "material-purchase-contract",
      ),
    /PDF HTTP 400.*html 样式/u,
  );
  assert.deepEqual(
    await assertPDFRenderResponse(
      {
        headers: () => ({
          "content-type": "application/pdf; charset=binary",
          "x-request-id": "req-print-1",
        }),
        status: () => 200,
        ok: () => true,
      },
      "material-purchase-contract",
    ),
    {
      status: 200,
      contentType: "application/pdf; charset=binary",
      requestID: "req-print-1",
    },
  );
});

test("disabled login keeps the non-enumerating user-visible message", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /expectedText:\s*"登录信息不正确或账号不可用"/u);
  assert.doesNotMatch(source, /expectedText:\s*"账号已停用"/u);
});

test("business print proof searches canonical current-batch records before exact actions", async () => {
  const source = await fs.readFile(scriptPath, "utf8");
  assert.match(source, /recordQuery/u);
  assert.match(source, /search\.fill\(recordQuery\)/u);
  assert.match(source, /search\.press\("Enter"\)/u);
  assert.match(source, /-PO-001/u);
  assert.match(source, /-OS-001/u);
  assert.match(source, /-BOM-001-1/u);
  assert.match(source, /row\.getByText\(recordQuery, \{ exact: true \}\)/u);
  assert.match(source, /\.ant-table-row-selected/u);
  assert.doesNotMatch(source, /selector\.evaluate\(\(node\) => node\.click\(\)\)/u);
  assert.match(
    source,
    /locator\("button"\)[\s\S]{0,180}getByText\(actionLabel,\s*\{\s*exact:\s*true\s*\}\)/u,
  );
  assert.match(source, /button\.innerText[\s\S]*=== label[\s\S]*!button\.disabled/u);
});

test("mobile role totals cannot overwrite a task board DOM minimum failure", () => {
  const taskBoard = {
    key: "task-board",
    passed: true,
    isList: true,
    dataEvidence: {
      observedTotal: 0,
      minimumRecords: 180,
      minimumSatisfied: false,
    },
  };
  const mobileTargets = [
    "boss",
    "sales",
    "purchase",
    "production",
    "warehouse",
    "quality",
    "finance",
    "pmc",
    "engineering",
  ].map((roleKey) => ({
    key: roleKey,
    group: "mobile",
    roleKey,
    passed: true,
    isList: true,
    dataEvidence: { observedTotal: 20, minimumSatisfied: true },
  }));
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    targets: [taskBoard, ...mobileTargets],
  });
  assert.equal(taskBoard.dataEvidence.minimumSatisfied, false);
  assert.equal(summary.acceptancePassed, false);
  assert.deepEqual(summary.failedDataMinimums, [taskBoard]);
});

test("list minimums are part of acceptance while page runtime remains separately visible", () => {
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    printEvidence: { passed: true },
    targets: [
      { passed: true, isList: false },
      { passed: true, isList: true, dataEvidence: { minimumSatisfied: false } },
    ],
  });
  assert.equal(summary.pageRuntimePassed, true);
  assert.equal(summary.acceptancePassed, false);
  assert.equal(summary.passed, false);
  assert.equal(summary.failedDataMinimums.length, 1);
});

test("five real business PDF proofs are required for final acceptance", () => {
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    targets: [{ passed: true, isList: false }],
    printEvidence: { passed: false, templates: [] },
  });
  assert.equal(summary.pageRuntimePassed, true);
  assert.equal(summary.printEvidencePassed, false);
  assert.equal(summary.acceptancePassed, false);
});

test("historical readiness evidence cannot override a current DOM minimum failure", () => {
  const summary = summarizeManualAcceptance({
    formalAccounts: [{ passed: true }],
    exceptionAccounts: [{ passed: true }],
    printEvidence: { passed: true },
    targets: [
      {
        key: "task-board",
        passed: true,
        isList: true,
        dataEvidence: {
          observedTotal: 0,
          minimumRecords: 180,
          minimumSatisfied: false,
        },
        historicalReadinessEvidence: {
          actual: 180,
          generatedAt: "2026-07-11T13:02:49.831Z",
        },
      },
    ],
  });
  assert.equal(summary.pageRuntimePassed, true);
  assert.equal(summary.acceptancePassed, false);
  assert.equal(summary.failedDataMinimums.length, 1);
});

test("list proof reads current task cards and the permission account tab without readiness fallback", async () => {
  const source = await fs.readFile(
    path.resolve(repoRoot, "scripts/qa/manual-acceptance-browser.mjs"),
    "utf8",
  );
  assert.match(source, /\.erp-task-board-card/u);
  assert.match(source, /getByRole\("tab", \{ name: \/管理员账号/u);
  assert.doesNotMatch(source, /loadReadinessEvidence|readinessReportSHA256/u);
});

test("missing password starts zero browsers and performs zero probes", async () => {
  let chromiumLoads = 0;
  let fetchCalls = 0;
  await assert.rejects(
    runManualAcceptanceBrowser(
      {
        baseURL: "http://127.0.0.1:5177",
        backendURL: "http://127.0.0.1:8300",
        password: "",
      },
      {
        loadChromium: async () => {
          chromiumLoads += 1;
          throw new Error("browser must not load");
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("network must not run");
        },
      },
    ),
    /缺少本地试用账号密码/,
  );
  assert.equal(chromiumLoads, 0);
  assert.equal(fetchCalls, 0);
});

test("plan mode needs no password and starts no browser", () => {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--plan",
      "--base-url",
      "http://127.0.0.1:5177",
      "--backend-url",
      "http://127.0.0.1:8300",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, MANUAL_ACCEPTANCE_PASSWORD: "" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.summary.totalTargets, 48);
  assert.equal(plan.writesDatabase, false);
  assert.equal(plan.formalAccounts.length, 10);
});
