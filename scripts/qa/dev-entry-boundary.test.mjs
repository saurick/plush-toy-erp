import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEV_HUB_ITEMS,
  DEV_HUB_ROUTE,
  isDevHubEnabled,
} from "../../web/src/erp/config/devHub.mjs";
import {
  DEV_CUSTOMER_CONFIG_ROUTE,
  buildCustomerConfigDevOverviewFromSearch,
  buildImportToolingSummary,
  isDevCustomerConfigEnabled,
} from "../../web/src/erp/config/devCustomerConfig.mjs";
import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_CURRENT_DOC_PATHS,
  DEV_TESTING_ROUTE,
  buildDevTestingDocs,
  extractDevTestingCommandBlocks,
  isDevTestingEnabled,
} from "../../web/src/erp/config/devTesting.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source, token, context) {
  assert(source.includes(token), `${context} must include ${token}`);
}

function buildDevTestingCopyPresetSource(preset = {}) {
  return [
    preset.key,
    preset.label,
    preset.description,
    ...(preset.commands || []),
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveCommandCwd(command, currentCwd) {
  const cdMatch = String(command).match(/(?:^|&&\s*)cd\s+([^\s;&]+)/);
  if (!cdMatch) return currentCwd;
  const target = cdMatch[1].replace(/^['"]|['"]$/g, "");
  if (target.startsWith("/Users/simon/projects/plush-toy-erp")) {
    return target;
  }
  if (target.startsWith("/")) return target;
  return path.resolve(currentCwd, target);
}

function extractLocalCommandScriptPaths(command = "", currentCwd = repoRoot) {
  const paths = [];
  const source = String(command);
  const pattern =
    /(?:^|\s)(\/Users\/simon\/projects\/plush-toy-erp\/)?((?:web|scripts|server|deployments)\/[\w./-]+\.(?:mjs|js|sh))(?:\s|$)/g;
  for (const match of source.matchAll(pattern)) {
    const absolutePrefix = match[1] || "";
    const localPath = match[2];
    const resolvedPath = absolutePrefix
      ? path.join(repoRoot, localPath)
      : path.resolve(currentCwd, localPath);
    if (resolvedPath.startsWith(repoRoot)) {
      paths.push(path.relative(repoRoot, resolvedPath));
    }
  }
  return paths;
}

function extractDevTestingPageGlobPaths(pageSource = "") {
  const globMatch = String(pageSource).match(
    /const markdownModules = import\.meta\.glob\(\s*\[([\s\S]*?)\]\s*,\s*\{/,
  );
  assert(globMatch, "dev testing page must declare a literal Markdown glob");
  return [
    ...globMatch[1].matchAll(/["'](\.\.\/\.\.\/\.\.\/\.\.\/[^"']+\.md)["']/g),
  ]
    .map((match) => match[1].slice("../../../../".length))
    .sort();
}

test("dev entry boundary: dev routes stay under /__dev and disabled outside DEV", () => {
  const devDocsPageSource = read("web/src/erp/pages/DevDocsPage.jsx");
  assert.equal(DEV_HUB_ROUTE, "/__dev");
  assert.equal(DEV_TESTING_ROUTE, "/__dev/testing");
  assert.equal(DEV_CUSTOMER_CONFIG_ROUTE, "/__dev/customer-config");
  assert.equal(isDevHubEnabled({ DEV: true }), true);
  assert.equal(isDevHubEnabled({ DEV: false }), false);
  assert.equal(isDevTestingEnabled({ DEV: true }), true);
  assert.equal(isDevTestingEnabled({ DEV: false }), false);
  assert.equal(isDevCustomerConfigEnabled({ DEV: true }), true);
  assert.equal(isDevCustomerConfigEnabled({ DEV: false }), false);
  assert(
    DEV_HUB_ITEMS.every((item) =>
      String(item.route || "").startsWith("/__dev"),
    ),
    "all dev hub child entries must stay under /__dev",
  );
  const testingItem = DEV_HUB_ITEMS.find((item) => item.key === "testing");
  const docsItem = DEV_HUB_ITEMS.find((item) => item.key === "docs");
  const customerConfigItem = DEV_HUB_ITEMS.find(
    (item) => item.key === "customer-config",
  );
  assert(
    (testingItem?.guardrails || []).some((guardrail) =>
      String(guardrail).includes("No reference commands"),
    ),
    "testing dev entry must reject reference commands",
  );
  assert.match(
    docsItem?.truthSource || "",
    /当前工作区 Markdown/,
    "dev docs entry must describe the Vite workspace glob instead of Git tracked state",
  );
  assert.doesNotMatch(docsItem?.description || "", /tracked Markdown/);
  assertIncludes(
    devDocsPageSource,
    "当前工作区内已匹配的 Markdown",
    "dev docs workspace source copy",
  );
  assert(
    !devDocsPageSource.includes("浏览全量 Markdown"),
    "dev docs page must not claim completeness beyond the current Vite glob",
  );
  assert(
    (customerConfigItem?.guardrails || []).some((guardrail) =>
      String(guardrail).includes("No real import"),
    ),
    "customer config dev entry must reject real import",
  );
  assert.match(customerConfigItem?.title || "", /预检与发布/);
  assert.match(customerConfigItem?.truthSource || "", /已登记客户配置包/);
  assert.doesNotMatch(customerConfigItem?.title || "", /导入/);
});

test("dev entry boundary: dev testing indexes only current maintained docs", () => {
  const devTestingPageSource = read("web/src/erp/pages/DevTestingPage.jsx");
  const devTestingCssSource = read("web/src/erp/styles/app/dev-prototypes.css");
  assert.deepEqual(DEV_TESTING_CURRENT_DOC_PATHS, [
    "docs/product/自动化测试策略.md",
    "README.md",
    "web/README.md",
    "web/scripts/README.md",
    "server/README.md",
    "scripts/README.md",
    "docs/部署约定.md",
    "server/deploy/README.md",
    "server/deploy/compose/prod/README.md",
  ]);
  assert(
    DEV_TESTING_CURRENT_DOC_PATHS.every(
      (item) =>
        !item.startsWith("docs/reference/") &&
        !item.startsWith("docs/archive/"),
    ),
    "dev testing source docs must not include reference/archive paths",
  );
  assert.deepEqual(
    extractDevTestingPageGlobPaths(devTestingPageSource),
    [...DEV_TESTING_CURRENT_DOC_PATHS].sort(),
    "dev testing page literal glob must cover the maintained whitelist exactly",
  );
  const commandListRule =
    devTestingCssSource.match(
      /\.erp-dev-testing-command-list\s*\{([\s\S]*?)\}/,
    )?.[1] || "";
  assert.match(
    commandListRule,
    /grid-auto-rows:\s*max-content/,
    "dev testing command grid rows must keep their content height",
  );
  assertIncludes(
    devTestingPageSource,
    "data-command-lines={block.commands.length}",
    "dev testing command block browser box-model hook",
  );

  const docs = buildDevTestingDocs({
    "../../../../docs/product/自动化测试策略.md": "# 自动化测试策略\n",
    "../../../../web/scripts/README.md": read("web/scripts/README.md"),
    "../../../../scripts/README.md": read("scripts/README.md"),
    "../../../../docs/reference/第四次20260627/旧测试计划.md":
      "```bash\nbash stale-reference-command.sh\n```",
    "../../../../docs/archive/progress.md":
      "```bash\nbash stale-archive-command.sh\n```",
  });

  assert.deepEqual(
    docs.map((item) => item.path),
    [
      "docs/product/自动化测试策略.md",
      "web/scripts/README.md",
      "scripts/README.md",
    ],
  );
  const webScriptsDoc = docs.find(
    (item) => item.path === "web/scripts/README.md",
  );
  assertIncludes(
    webScriptsDoc?.source || "",
    "pnpm start:yoyoosun --print-plan",
    "dev testing web scripts README source",
  );
  assertIncludes(
    webScriptsDoc?.source || "",
    "pnpm preview:yoyoosun --print-plan",
    "dev testing web scripts README source",
  );
  assertIncludes(
    webScriptsDoc?.source || "",
    "verify customer config",
    "dev testing web scripts README source",
  );
  const scriptsDoc = docs.find((item) => item.path === "scripts/README.md");
  assertIncludes(
    scriptsDoc?.source || "",
    "trial-role-entry-docs",
    "dev testing scripts README source",
  );
  assertIncludes(
    scriptsDoc?.source || "",
    "sales-order-field-chain-boundary",
    "dev testing scripts README source",
  );
  assertIncludes(
    scriptsDoc?.source || "",
    "TestWorkflowRepo_(TaskStatusReasonEventAndCompletionCleanup",
    "dev testing scripts README source",
  );
  assertIncludes(
    scriptsDoc?.source || "",
    "TestJsonrpcDispatcher_WorkflowUrgeTask",
    "dev testing scripts README source",
  );
  assertIncludes(
    scriptsDoc?.source || "",
    "workflow-fact-boundary",
    "dev testing scripts README source",
  );
  assertIncludes(
    devTestingPageSource,
    "block.sourceLabel || block.title || '测试命令来源'",
    "dev testing page command source label",
  );
  assert(
    !devTestingPageSource.includes("{block.sourcePath}"),
    "dev testing command blocks must not render raw sourcePath as primary copy",
  );
  const presetKeys = DEV_TESTING_COPY_PRESETS.map((item) => item.key);
  assert.deepEqual(
    presetKeys,
    [
      "frontend",
      "workflow-backend-actions",
      "trial-role-entries",
      "frontend-role-menu-seed-contracts",
      "trial-account-rbac",
      "real-login-smoke-shared",
      "trial-simulated-data",
      "mvp-local-closure",
      "mobile-workflow-smoke",
      "customer-config-dev-console",
      "dev-prototype-registry",
      "dev-doc-governance-ledger",
      "customer-config-package-runtime",
      "customer-import-tooling",
      "frontend-customer-config-projection",
      "frontend-error-messages",
      "business-action-field-boundaries",
      "pre-commit",
      "release",
    ],
    "dev testing copy presets must expose current maintained entry points",
  );
  const mobileWorkflowPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "mobile-workflow-smoke",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "mobile-workflow-runtime-browser-smoke.test.mjs",
    "mobile workflow smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "mobileRoleTaskModel.test.mjs",
    "mobile workflow smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "workflowTaskBoard.test.mjs",
    "mobile workflow smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template",
    "mobile workflow smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json",
    "mobile workflow smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD",
    "mobile workflow smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mobileWorkflowPreset),
    "无写入输入模板",
    "mobile workflow smoke preset",
  );
  const trialRolePreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "trial-role-entries",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialRolePreset),
    "trial-role-entry-docs.test.mjs",
    "trial role entry preset",
  );
  const frontendRoleMenuSeedPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "frontend-role-menu-seed-contracts",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendRoleMenuSeedPreset),
    "entryConfig.test.mjs",
    "frontend role menu seed preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendRoleMenuSeedPreset),
    "menuPermissions.test.mjs",
    "frontend role menu seed preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendRoleMenuSeedPreset),
    "seedData.test.mjs",
    "frontend role menu seed preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendRoleMenuSeedPreset),
    "workflowStatus.test.mjs",
    "frontend role menu seed preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendRoleMenuSeedPreset),
    "不替代后端 RBAC",
    "frontend role menu seed preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendRoleMenuSeedPreset),
    "真实登录",
    "frontend role menu seed preset",
  );
  const trialAccountRbacPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "trial-account-rbac",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "trial-account-rbac.test.mjs",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "trialDemoAccountBrowserSmoke.test.mjs",
    "trial account browser smoke preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "trial-account-rbac.mjs",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "--print-input-template",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "trial-account-rbac.mjs --preflight-report output/trial-account-rbac/preflight.json",
    "trial account RBAC preflight preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "trialDemoAccountBrowserSmoke.mjs --print-input-template",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json",
    "trial account browser smoke preflight preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "TRIAL_ACCOUNT_PASSWORD",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "--report output/trial-account-rbac/report.json",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "smoke:trial-demo-browser",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "本地后端和演示账号密码",
    "trial account RBAC preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialAccountRbacPreset),
    "无写入输入模板",
    "trial account RBAC preset",
  );
  const realLoginSmokeSharedPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "real-login-smoke-shared",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "realLoginSmokeShared.test.mjs",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "mobileAuthLoginRouteSmoke.test.mjs",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "purchaseReceiptRealWriteBrowserE2E.test.mjs",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "realLoginSmokeShared.mjs --print-input-template",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "mobileAuthLoginRouteSmoke.mjs --print-input-template",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "REAL_LOGIN_ADMIN_USERNAME",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "smoke:purchase-contract-real-login",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "smoke:processing-contract-real-login",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "smoke:mobile-auth-login-route",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "smoke:purchase-receipt-real-write",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "mock RPC",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "生产单端口岗位路由",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "no-write 输入模板",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "前置清单",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "持久测试数据确认",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "不执行真实登录",
    "real login smoke shared preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(realLoginSmokeSharedPreset),
    "不启动浏览器",
    "real login smoke shared preset",
  );
  const trialSimulatedDataPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "trial-simulated-data",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "trial-simulated-data.test.mjs",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "operational-fact-simulated-closure.test.mjs",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "mobile-workflow-simulated-closure.test.mjs",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "trial-simulated-data.mjs --print-input-template",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "operational-fact-simulated-closure.mjs --print-input-template",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "mobile-workflow-simulated-closure.mjs --print-input-template",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "trial-simulated-data-dev-testing-report",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "mobile-workflow-simulated-closure-dev-testing-report",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "operational-fact-simulated-closure-dev-testing-report",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "--product-id <product_id>",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "no real import",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "no-write 输入模板",
    "trial simulated data preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(trialSimulatedDataPreset),
    "不连接后端",
    "trial simulated data preset",
  );
  const mvpLocalClosurePreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "mvp-local-closure",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "mvp-closure.test.mjs",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "purchase-receipt-real-write-e2e.test.mjs",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "purchase-receipt-real-write-e2e.mjs --print-input-template",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "purchase-receipt-real-write-e2e.mjs --preflight-report output/qa/purchase-receipt-real-write-e2e/preflight.json",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "--run-report-tools --product-id <product_id>",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "no-write evidence",
    "mvp local closure preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(mvpLocalClosurePreset),
    "真实写入输入模板",
    "mvp local closure preset",
  );
  const customerConfigPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "customer-config-dev-console",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigPreset),
    "devCustomerConfig.test.mjs",
    "customer config dev console preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigPreset),
    "printTemplates.test.mjs",
    "customer config dev console preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigPreset),
    "dev-customer-config-dark-desktop",
    "customer config dev console preset",
  );
  const devPrototypePreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "dev-prototype-registry",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devPrototypePreset),
    "devPrototypes.test.mjs",
    "dev prototype registry preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devPrototypePreset),
    "devHub.test.mjs",
    "dev prototype registry preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devPrototypePreset),
    "dev-prototypes-dark-desktop",
    "dev prototype registry preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devPrototypePreset),
    "不晋级 Current",
    "dev prototype registry preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devPrototypePreset),
    "不改正式菜单",
    "dev prototype registry preset",
  );
  const devDocGovernanceLedgerPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "dev-doc-governance-ledger",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "devDocs.test.mjs",
    "dev docs governance ledger preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "devGovernance.test.mjs",
    "dev docs governance ledger preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "devCapabilityLedger.test.mjs",
    "dev docs governance ledger preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "dev-docs-dark-desktop",
    "dev docs governance ledger preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "dev-governance-dark-desktop",
    "dev docs governance ledger preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "不改正式文档真源",
    "dev docs governance ledger preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(devDocGovernanceLedgerPreset),
    "不进入正式菜单",
    "dev docs governance ledger preset",
  );
  const customerConfigRuntimePreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "customer-config-package-runtime",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-package-lint.test.mjs",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-runtime-manifest.test.mjs",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-release-execute.test.mjs",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-release-readiness.test.mjs",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "run-smoke-script.test.mjs",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-package-lint.mjs --customer yoyoosun --mode compile",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-runtime-manifest.mjs --all --mode preview",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-effective-session-probe.mjs --json --report output/customers/yoyoosun/customer-config-effective-session-probe/current.json",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-release-execute.mjs --print-input-template",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "customer-config-release-readiness.mjs --print-input-template",
    "customer config runtime preset",
  );
  assert.doesNotMatch(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    /deployments\/yoyoosun\/evidence\/releases\/\d{4}-\d{2}-\d{2}/,
    "customer config runtime preset must not pin one concrete evidence batch",
  );
  assert(
    !/<YYYY-MM-DD>|<[^>]+>/.test(
      buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    ),
    "customer config runtime preset must not expose shell-redirection placeholders",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "run-smoke.sh --print-input-template",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "active revision 读回前置",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "输入模板",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "不发布",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "不激活",
    "customer config runtime preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerConfigRuntimePreset),
    "不调用后端",
    "customer config runtime preset",
  );
  const customerImportPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "customer-import-tooling",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerImportPreset),
    "customerSourceManifestCheck.test.mjs",
    "customer import tooling preset",
  );
  assert.doesNotMatch(
    buildDevTestingCopyPresetSource(customerImportPreset),
    /customerImportExecute|--execute/u,
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerImportPreset),
    "不执行真实客户导入",
    "customer import tooling preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(customerImportPreset),
    "不连接目标环境",
    "customer import tooling preset",
  );
  const frontendConfigPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "frontend-customer-config-projection",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendConfigPreset),
    "formal-frontend-customer-config-boundary.test.mjs",
    "frontend customer config projection preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendConfigPreset),
    "erp-effective-session-action-projection-business-pages",
    "frontend customer config projection preset",
  );
  const frontendErrorPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "frontend-error-messages",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendErrorPreset),
    "frontend-error-message-boundary.test.mjs",
    "frontend error message preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendErrorPreset),
    "errorMessage.test.mjs",
    "frontend error message preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendErrorPreset),
    "userVisibleTechnicalFields.test.mjs",
    "frontend error message preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendErrorPreset),
    "dashboardTaskDisplay.test.mjs",
    "frontend error message preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendErrorPreset),
    "共享 PDF 预览",
    "frontend error message preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(frontendErrorPreset),
    "raw id",
    "frontend error message preset",
  );
  const businessActionFieldPreset = DEV_TESTING_COPY_PRESETS.find(
    (item) => item.key === "business-action-field-boundaries",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(businessActionFieldPreset),
    "workflowTaskActionAccess.test.mjs",
    "business action and field boundary preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(businessActionFieldPreset),
    "workflow-ui-action-boundary.test.mjs",
    "business action and field boundary preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(businessActionFieldPreset),
    "sales-order-field-chain-boundary.test.mjs",
    "business action and field boundary preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(businessActionFieldPreset),
    "printTemplates.test.mjs",
    "business action and field boundary preset",
  );
  assertIncludes(
    buildDevTestingCopyPresetSource(businessActionFieldPreset),
    "后端登记表静态边界守卫",
    "business action and field boundary preset",
  );
});

test("dev entry boundary: indexed testing doc command scripts exist", () => {
  const missing = [];

  for (const docPath of DEV_TESTING_CURRENT_DOC_PATHS) {
    const absoluteDocPath = path.join(repoRoot, docPath);
    assert(
      existsSync(absoluteDocPath),
      `dev testing current doc must exist: ${docPath}`,
    );

    const blocks = extractDevTestingCommandBlocks(read(docPath), {
      sourcePath: docPath,
      title: docPath,
    });

    for (const block of blocks) {
      assert(
        !block.commandText.trimEnd().endsWith("\\"),
        `dev testing copied command must not end with a continuation: ${docPath} / ${block.context}`,
      );
      let currentCwd = repoRoot;
      for (const command of block.commands) {
        const commandCwd = resolveCommandCwd(command, currentCwd);
        for (const localPath of extractLocalCommandScriptPaths(
          command,
          commandCwd,
        )) {
          if (!existsSync(path.join(repoRoot, localPath))) {
            missing.push(`${docPath} / ${block.context}: ${localPath}`);
          }
        }
        currentCwd = commandCwd;
      }
    }
  }

  assert.deepEqual(missing, []);
});

test("dev entry boundary: customer config console stays preview or gated apply only", () => {
  const pageSource = read("web/src/erp/pages/DevCustomerConfigPage.jsx");
  assertIncludes(
    pageSource,
    "客户配置包预检与发布控制台",
    "customer config console heading",
  );
  assertIncludes(
    pageSource,
    "不提供原始包上传",
    "customer config console package-source boundary",
  );
  assert(
    !pageSource.includes("客户配置包导入控制台"),
    "customer config console must not imply an arbitrary package upload/import surface",
  );
  const missingOverview = buildCustomerConfigDevOverviewFromSearch(
    "?customer=unknown-customer",
  );
  assert.equal(missingOverview.status, "missing");
  assert.equal(missingOverview.customerKey, "unknown-customer");
  assert.equal(missingOverview.menuSummary, undefined);
  assert.match(missingOverview.blockedPieces[0].boundary, /不会 fallback/);

  const overview =
    buildCustomerConfigDevOverviewFromSearch("?customer=yoyoosun");
  assert.equal(overview.printTemplateSummary.templateCount, 5);
  assert.equal(overview.printTemplateSummary.sourceGroundedCount, 5);
  assert.deepEqual(
    overview.printTemplateSummary.templates.map((item) => item.title),
    ["采购合同", "加工合同", "物料分析明细表", "色卡", "作业指导书"],
  );
  assert.match(
    overview.printTemplateSummary.boundary,
    /销售订单受理未接打印模板/,
  );
  assert(
    overview.packageConsoleSummary.validationChecks.some(
      (item) => item.key === "print-template-boundary",
    ),
    "customer config console must surface print template field boundary",
  );

  const defaultSummary = buildImportToolingSummary();
  assert.equal(defaultSummary.canRunUiDryRun, false);
  assert.equal(defaultSummary.canApplyTestConfig, false);
  assert.equal(defaultSummary.canCheckReleaseReadiness, false);
  assert.equal(defaultSummary.testApply.status, "blocked");

  const summary = buildImportToolingSummary("yoyoosun");
  assert.equal(summary.canRunUiDryRun, true);
  assert.equal(summary.canExecuteRealImport, false);
  assert.equal(summary.writesBusinessData, false);
  assert.equal(summary.testApply.noBusinessDataImport, true);
  assert.equal(summary.releaseApply.noBusinessDataImport, true);
  assert.equal(
    summary.uiReleaseBatchesApiPath,
    "/__dev/api/customer-config/release-batches",
  );
  assert.match(summary.releaseApply.evidenceDir, /<release-batch>$/);
  assert.equal(
    summary.releaseApply.command,
    "node scripts/deploy/customer-config-release-execute.mjs --print-input-template",
  );
  assert(
    summary.importFlow.some((item) =>
      String(item.outcome).includes("模块状态"),
    ),
    "customer config import flow must surface module state projection input",
  );
  assert.deepEqual(
    summary.importFlow.map((item) => item.status),
    [
      "passed",
      "passed",
      "preview_only",
      "preview_only",
      "blocked",
      "release_gate_required",
    ],
  );
  assert.deepEqual(summary.testApply.blockedReasons, [
    "package_not_release_ready",
    "preview_only",
    "runtime_disabled",
    "publish_disabled",
    "activate_disabled",
  ]);
  assert(
    summary.formalGates.some(
      (item) =>
        item.key === "business-import" &&
        item.status === "separate_task_required",
    ),
    "business import must remain a separate gated task",
  );
  assert(
    summary.databaseTargets.some(
      (item) =>
        item.key === "business-data-import" &&
        item.status === "separate_task_required",
    ),
    "business data import must not be folded into customer config apply",
  );
  const devConsoleCommands = summary.tools
    .map((item) => item.command)
    .join("\n");
  assert(
    !devConsoleCommands.includes("CUSTOMER_CONFIG_ADMIN_TOKEN"),
    "dev customer config console must not render admin token placeholders",
  );
  assert(
    !devConsoleCommands.includes("--execute"),
    "dev customer config console fallback commands must stay no-write",
  );
  assert(
    !devConsoleCommands.includes("<release-batch>"),
    "dev customer config console must not expose non-executable batch placeholders",
  );
  assert(
    summary.tools.some(
      (item) =>
        item.key === "release-rollback-execute" &&
        item.command ===
          "node scripts/deploy/customer-config-release-execute.mjs --print-input-template",
    ),
    "customer config rollback fallback must be an input template, not an executable rollback command",
  );
  assert.match(
    pageSource,
    /const requestApplyTestConfig = \(\) => \{[\s\S]*modal\.confirm\([\s\S]*确认应用测试配置[\s\S]*127\.0\.0\.1:8300[\s\S]*不会导入客户业务数据[\s\S]*不代表正式发布通过[\s\S]*onOk: handleApplyTestConfig/su,
  );
  assertIncludes(
    pageSource,
    "assertEffectiveCustomerConfigIdentity(",
    "test apply authenticated identity readback",
  );
  assert(
    !pageSource.includes("requestApplyReleaseConfig") &&
      !pageSource.includes("handleApplyReleaseConfig"),
    "formal release must stay delegated to the audited release executor",
  );
  assertIncludes(
    pageSource,
    "正式发布只由统一执行器执行",
    "formal release executor boundary",
  );
  assertIncludes(
    pageSource,
    "releaseBatch",
    "release readiness must bind an explicit evidence batch",
  );
  assert(
    !pageSource.includes("onApplyTestConfig={handleApplyTestConfig}"),
    "test config control-plane write must be mediated by confirmation",
  );
  assert(
    !pageSource.includes("publishCustomerConfig(readiness.manifest)"),
    "release readiness result must not be published directly by the browser page",
  );
});


test("dev entry boundary: make dev_restart 先预检再停服并且不自动执行 migration", () => {
  const makefile = read("server/Makefile");
  const target = makefile.match(
    /^dev_restart:\s*dev_preflight\n(?<recipe>(?:\t.*\n)+)/mu,
  );
  assert(target?.groups?.recipe, "dev_restart 必须显式依赖 dev_preflight");
  const recipe = target.groups.recipe;
  assert(
    recipe.indexOf("$(MAKE) dev_stop") < recipe.indexOf("$(MAKE) dev_build"),
  );
  assert(recipe.indexOf("$(MAKE) dev_build") < recipe.indexOf("$(DEV_BIN)"));

  const preflight = read("scripts/local-runtime-preflight.mjs");
  assert.doesNotMatch(preflight, /migrate\s+apply/u);
  assert.match(preflight, /\[\s*["']migrate["'],\s*["']status["']/u);
});

test("dev entry boundary: Product Core 与客户开发入口共用同一 web preflight", () => {
  const packageJSON = JSON.parse(read("web/package.json"));
  assert.equal(packageJSON.scripts.start, "node ./scripts/startWebDev.mjs");
  assert.equal(
    packageJSON.scripts["start:frontend-only"],
    "node ./scripts/startWebDev.mjs --frontend-only",
  );
  assert.equal(
    packageJSON.scripts["start:yoyoosun"],
    "node ./scripts/startYoyoosunDev.mjs",
  );

  for (const script of [
    "web/scripts/startWebDev.mjs",
    "web/scripts/startYoyoosunDev.mjs",
  ]) {
    assert.match(read(script), /runWebRuntimePreflight/u, script);
  }
});
