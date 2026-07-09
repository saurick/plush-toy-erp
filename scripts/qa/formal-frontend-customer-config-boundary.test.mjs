import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const erpSourceRoot = path.join(repoRoot, "web/src/erp");

const sourceExtensions = new Set([".js", ".jsx", ".mjs"]);
const skippedSuffixes = [".test.js", ".test.jsx", ".test.mjs"];

const devOnlyPrefixes = ["web/src/erp/config/dev", "web/src/erp/pages/Dev"];

const allowedRawConfigPaths = new Set([
  "web/src/erp/config/devCustomerConfig.mjs",
  "web/src/erp/config/devHub.mjs",
]);

const forbiddenRawConfigTokens = [
  "config/customers/",
  "../../../../config/customers/",
  "yoyoosunCustomerPackage",
  "yoyoosunMenuConfig",
  "yoyoosunFieldNumberingConfig",
];

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function shouldScanFormalRuntime(filePath) {
  const relativePath = toRelative(filePath);
  if (skippedSuffixes.some((suffix) => relativePath.endsWith(suffix))) {
    return false;
  }
  if (!sourceExtensions.has(path.extname(filePath))) {
    return false;
  }
  if (devOnlyPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return false;
  }
  return true;
}

function collectSourceFiles(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }
    if (stat.isFile() && shouldScanFormalRuntime(entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function readRelative(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("formal frontend customer config boundary: runtime reads effective session, not raw customer packages", () => {
  const sourceFiles = collectSourceFiles(erpSourceRoot);
  assert(sourceFiles.length > 0, "expected ERP runtime source files");

  for (const filePath of sourceFiles) {
    const relativePath = toRelative(filePath);
    const source = readFileSync(filePath, "utf8");
    for (const token of forbiddenRawConfigTokens) {
      assert(
        !source.includes(token),
        `${relativePath} must not directly consume raw customer config token ${token}; formal runtime must use get_effective_session projection`,
      );
    }
  }

  const devConfigSource = readRelative(
    "web/src/erp/config/devCustomerConfig.mjs",
  );
  assert(
    forbiddenRawConfigTokens.some((token) => devConfigSource.includes(token)),
    "dev-only customer config console should remain the only raw package preview surface",
  );
  for (const relativePath of allowedRawConfigPaths) {
    const source = readRelative(relativePath);
    assert(
      source.includes("config/customers/") ||
        source.includes("yoyoosunCustomerPackage"),
      `${relativePath} should be explicit dev-only raw customer config context`,
    );
  }
});

test("formal frontend customer config boundary: page, action, and field projection stay wired to admin profile", () => {
  const layoutSource = readRelative("web/src/erp/components/ERPLayout.jsx");
  assert(layoutSource.includes("getEffectiveSession"));
  assert(layoutSource.includes("attachEffectiveSessionToAdminProfile"));
  assert(layoutSource.includes("resolveEffectiveSessionCustomerKey"));
  assert(
    layoutSource.includes("attachUnavailableEffectiveSessionToAdminProfile"),
  );
  assert(
    !layoutSource.includes(
      "customer_key: activeBrand?.customerKey || 'yoyoosun'",
    ),
    "formal layout must not fallback effective session requests to yoyoosun",
  );
  assert(
    !layoutSource.includes(
      'customer_key: activeBrand?.customerKey || "yoyoosun"',
    ),
    "formal layout must not fallback effective session requests to yoyoosun",
  );
  assert(layoutSource.includes("buildEffectiveSessionDiagnosticSummary"));
  assert(layoutSource.includes("__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__"));
  assert(layoutSource.includes("data-effective-session-source"));
  assert(layoutSource.includes("filterNavigationSectionsByAdminProfile"));
  assert(layoutSource.includes("shouldRedirectFromCurrentNavigation"));
  assert(layoutSource.includes("当前账号暂无可见后台入口"));
  assert(layoutSource.includes("isCustomerBusinessDataPageKey"));
  assert(layoutSource.includes("shouldGuardCustomerBusinessPageRuntime"));
  assert(layoutSource.includes("getProductCoreNavigationSections"));
  assert(layoutSource.includes("routeNavigationSections"));
  assert(layoutSource.includes("menuNavigationSections"));
  assert(layoutSource.includes("shouldUseProductCoreNavigation"));
  assert(layoutSource.includes("data-product-core-business-data-guard"));
  assert(layoutSource.includes("data-product-core-capability-review"));
  assert(layoutSource.includes("ProductCoreCapabilityReview"));
  assert(layoutSource.includes("能力审阅"));
  assert(!layoutSource.includes("产品核心评审不读取客户业务数据"));
  assert(layoutSource.includes("data-effective-session-data-scope"));
  assert(layoutSource.includes("无客户运行态"));

  const businessModuleSource = readRelative(
    "web/src/erp/config/businessModules.mjs",
  );
  assert(businessModuleSource.includes("isCustomerBusinessDataPageKey"));
  assert(businessModuleSource.includes("business-dashboard"));
  assert(businessModuleSource.includes("exception-flow"));
  assert(businessModuleSource.includes("businessModuleDefinitions.map"));

  const seedDataSource = readRelative("web/src/erp/config/seedData.mjs");
  assert(seedDataSource.includes("getProductCoreNavigationSections"));
  assert(seedDataSource.includes("productCoreDashboardItem"));
  assert(seedDataSource.includes("产品核心总览"));
  assert(seedDataSource.includes("title: '产品核心'"));
  assert(seedDataSource.includes("title: '控制面'"));

  const dashboardSource = readRelative("web/src/erp/pages/DashboardPage.jsx");
  assert(dashboardSource.includes("ProductCoreDashboard"));
  assert(dashboardSource.includes('data-product-core-dashboard="true"'));
  assert(dashboardSource.includes("shouldShowProductCoreDashboard"));
  assert(dashboardSource.includes("if (shouldShowProductCoreDashboard)"));
  assert(dashboardSource.includes("不加载客户订单、库存、Workflow"));

  const syncSource = readRelative("web/src/erp/utils/adminProfileSync.mjs");
  assert(syncSource.includes("effective_session_sync_failed"));
  assert(syncSource.includes("super_admin_product_core"));
  assert(syncSource.includes("dataRuntimeScope"));
  assert(syncSource.includes("canMountCustomerBusinessPages"));
  assert(syncSource.includes("canMountCustomerRuntime"));
  assert(syncSource.includes("shouldGuardCustomerBusinessPageRuntime"));
  assert(syncSource.includes("hiddenFieldPolicies"));
  assert(syncSource.includes("filterNavigationSectionsByAdminProfile"));
  assert(syncSource.includes("filterColumnsByEffectiveFieldPolicy"));
  assert(syncSource.includes("effectiveSessionAllowsAction"));

  const mobileLayoutSource = readRelative(
    "web/src/erp/mobile/MobileAppLayout.jsx",
  );
  assert(mobileLayoutSource.includes("getEffectiveSession"));
  assert(mobileLayoutSource.includes("attachEffectiveSessionToAdminProfile"));
  assert(mobileLayoutSource.includes("attachUnavailableEffectiveSessionToAdminProfile"));
  assert(mobileLayoutSource.includes("canMountCustomerRuntime"));
  assert(mobileLayoutSource.includes("shouldBlockMissingCustomerRuntime"));
  assert(mobileLayoutSource.includes('data-mobile-customer-runtime-guard="true"'));
  assert(mobileLayoutSource.includes("岗位任务端需要客户运行环境"));

  const mobileTasksSource = readRelative(
    "web/src/erp/mobile/pages/MobileRoleTasksPage.jsx",
  );
  assert(mobileTasksSource.includes("canMountCustomerRuntime"));
  assert(mobileTasksSource.includes("canMountCustomerTasks"));
  assert(mobileTasksSource.includes("if (!canMountCustomerTasks)"));
  assert(mobileTasksSource.includes("setTasks([])"));

  const actionSource = readRelative(
    "web/src/erp/utils/masterDataOrderView.mjs",
  );
  assert(actionSource.includes("effectiveSessionAllowsAction"));
  assert(actionSource.includes("rbacAllowed && effectiveSessionAllowsAction"));

  const masterDataSource = readRelative(
    "web/src/erp/pages/V1MasterDataPage.jsx",
  );
  assert(masterDataSource.includes("filterColumnsByEffectiveFieldPolicy"));
  assert(masterDataSource.includes("adminProfile"));

  const salesOrderSource = readRelative(
    "web/src/erp/pages/V1SalesOrdersPage.jsx",
  );
  assert(salesOrderSource.includes("filterColumnsByEffectiveFieldPolicy"));
  assert(salesOrderSource.includes("'sales_orders.default'"));

  const purchaseOrderSource = readRelative(
    "web/src/erp/pages/V1PurchaseOrdersPage.jsx",
  );
  assert(purchaseOrderSource.includes("getEffectivePrintTemplateDefaults"));
  assert(
    purchaseOrderSource.includes("MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY"),
  );
  assert(
    purchaseOrderSource.includes(
      "printTemplateDefaults: purchasePrintTemplateDefaults",
    ),
  );

  const outsourcingOrderSource = readRelative(
    "web/src/erp/pages/V1OutsourcingOrdersPage.jsx",
  );
  assert(outsourcingOrderSource.includes("getEffectivePrintTemplateDefaults"));
  assert(outsourcingOrderSource.includes("PROCESSING_CONTRACT_TEMPLATE_KEY"));
  assert(
    outsourcingOrderSource.includes(
      "printTemplateDefaults: processingPrintTemplateDefaults",
    ),
  );

  const routerSource = readRelative("web/src/erp/router.jsx");
  assert(routerSource.includes("shouldUseRememberedDesktopEntry"));
  assert(routerSource.includes("isDesktopEntryEnabled(entryConfig)"));
  assert(
    !routerSource.includes(
      "adminProfile && lastEntryTarget === ENTRY_TARGET.DESKTOP",
    ),
    "mobile route must not follow a remembered desktop entry unless the current admin has desktop menu access",
  );
});
