import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildAssignableRoleOptions,
  getRolePermissionReadOnlyReason,
} from "../../web/src/erp/utils/permissionCenterAccess.mjs";
import {
  MOBILE_ROLE_TASK_VIEW_KEYS,
  createMobileRoleTaskScopeState,
  readMobileRoleTaskScopeState,
  settleMobileRoleTaskRequest,
} from "../../web/src/erp/utils/mobileTaskQueries.mjs";

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
  assert(layoutSource.includes("当前账号暂无可用页面"));
  assert(layoutSource.includes("isCustomerBusinessDataPageKey"));
  assert(layoutSource.includes("shouldGuardCustomerBusinessPageRuntime"));
  assert(layoutSource.includes("getProductCoreNavigationSections"));
  assert(layoutSource.includes("routeNavigationSections"));
  assert(layoutSource.includes("menuNavigationSections"));
  assert(layoutSource.includes("shouldUseProductCoreNavigation"));
  assert(layoutSource.includes("data-product-core-business-data-guard"));
  assert(layoutSource.includes("data-product-core-capability-review"));
  assert(layoutSource.includes("ProductCoreCapabilityReview"));
  assert(layoutSource.includes("功能预览"));
  assert(!layoutSource.includes("产品核心评审不读取客户业务数据"));
  assert(layoutSource.includes("data-effective-session-data-scope"));
  assert(layoutSource.includes("尚未连接客户环境"));

  const businessModuleSource = readRelative(
    "web/src/erp/config/businessModules.mjs",
  );
  assert(businessModuleSource.includes("isCustomerBusinessDataPageKey"));
  assert(businessModuleSource.includes("business-dashboard"));
  assert(!businessModuleSource.includes("exception-flow"));
  assert(businessModuleSource.includes("businessModuleDefinitions.map"));

  const seedDataSource = readRelative("web/src/erp/config/seedData.mjs");
  assert(seedDataSource.includes("getProductCoreNavigationSections"));
  assert(seedDataSource.includes("productCoreDashboardItem"));
  assert(seedDataSource.includes("系统功能总览"));
  assert(seedDataSource.includes("title: '功能预览'"));
  assert(seedDataSource.includes("title: '系统设置'"));

  const dashboardSource = readRelative("web/src/erp/pages/DashboardPage.jsx");
  assert(dashboardSource.includes("ProductCoreDashboard"));
  assert(dashboardSource.includes('data-product-core-dashboard="true"'));
  assert(dashboardSource.includes("shouldShowProductCoreDashboard"));
  assert(dashboardSource.includes("if (shouldShowProductCoreDashboard)"));
  assert(
    dashboardSource.includes("当前不读取客户订单、库存、待办任务或财务记录"),
  );

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
  assert(mobileLayoutSource.includes("暂时无法进入手机待办"));

  const mobileTasksSource = readRelative(
    "web/src/erp/mobile/pages/MobileRoleTasksPage.jsx",
  );
  assert(mobileTasksSource.includes("canMountCustomerRuntime"));
  assert(mobileTasksSource.includes("canMountCustomerTasks"));
  assert(mobileTasksSource.includes("if (!canMountCustomerTasks)"));
  assert(
    mobileTasksSource.includes("workflowTaskAdminAccessRequestIdentity"),
    "mobile task scope must reuse the complete admin access identity",
  );
  assert.match(
    mobileTasksSource,
    /const taskAccessIdentity =\s*workflowTaskAdminAccessRequestIdentity\(adminProfile\)[\s\S]*const taskScopeKey = `\$\{activeRoleKey\}\|access:\$\{taskAccessIdentity\}\|\$\{canMountCustomerTasks \? 'ready' : 'blocked'\}`/u,
    "role, customer, revision, or runtime access changes must invalidate the visible task scope",
  );
  assert.match(
    mobileTasksSource,
    /taskLoadRequestSeqRef\.current\[viewKey\] !== requestSeq/u,
    "stale task responses must be ignored",
  );
  for (const helperCall of [
    "createMobileRoleTaskScopeState(taskScopeKey)",
    "readMobileRoleTaskScopeState(",
    "settleMobileRoleTaskRequest(",
  ]) {
    assert(
      mobileTasksSource.includes(helperCall),
      `mobile task page must use ${helperCall}`,
    );
  }

  const originalScopeKey = "sales|customer-a|revision-1|ready";
  const originalScope = createMobileRoleTaskScopeState(originalScopeKey);
  originalScope.slots[MOBILE_ROLE_TASK_VIEW_KEYS.TODO] = {
    ...originalScope.slots[MOBILE_ROLE_TASK_VIEW_KEYS.TODO],
    items: [{ id: "old-task" }],
    loaded: true,
  };
  const replacementScope = readMobileRoleTaskScopeState(
    originalScope,
    "quality|customer-b|revision-2|ready",
  );
  assert.deepEqual(
    Object.values(replacementScope.slots).flatMap((slot) => slot.items),
    [],
    "a changed role/customer/revision scope must not retain old tasks",
  );

  const staleResult = settleMobileRoleTaskRequest(originalScope, {
    currentScopeKey: "quality|customer-b|revision-2|ready",
    requestScopeKey: originalScopeKey,
    viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
    currentRequestSeq: 1,
    requestSeq: 1,
    response: { items: [{ id: "stale-task" }] },
  });
  assert.equal(staleResult, originalScope, "a stale response must not refill a new scope");

  const refreshFailure = settleMobileRoleTaskRequest(originalScope, {
    currentScopeKey: originalScopeKey,
    requestScopeKey: originalScopeKey,
    viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
    currentRequestSeq: 2,
    requestSeq: 2,
    errorMessage: "refresh failed",
  });
  assert.deepEqual(
    refreshFailure.slots[MOBILE_ROLE_TASK_VIEW_KEYS.TODO].items,
    [{ id: "old-task" }],
    "refresh failures must preserve previously loaded task data",
  );

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
  assert(routerSource.includes("hasDesktopEntryAccess"));
  assert(routerSource.includes("isDesktopEntryEnabled(entryConfig)"));
  assert.match(
    routerSource,
    /target === ENTRY_TARGET\.DESKTOP &&\s*hasDesktopEntryAccess\(admin, entryConfig\)/u,
    "the root desktop entry must stay gated by the current admin profile and enabled desktop entry",
  );
  assert.match(
    routerSource,
    /getAllowedMobileRoleKeys\(\s*admin,\s*getEnabledMobileRoleKeys\(entryConfig\)\s*\)/u,
    "the root mobile entry must stay gated by the current admin profile and enabled role projection",
  );
  assert(
    !routerSource.includes("shouldUseRememberedDesktopEntry"),
    "explicit desktop and mobile routes must not be redirected by a remembered entry target",
  );
});

test("formal customer frontend copy uses the current account and business perspective", () => {
  const layoutSource = readRelative("web/src/erp/components/ERPLayout.jsx");
  assert(layoutSource.includes("正在进入工作台"));
  assert(layoutSource.includes("正在准备您的工作内容"));
  assert(layoutSource.includes("暂时无法进入工作台"));

  const mobileLayoutSource = readRelative(
    "web/src/erp/mobile/MobileAppLayout.jsx",
  );
  assert(mobileLayoutSource.includes("正在准备手机待办"));
  assert(mobileLayoutSource.includes("暂时无法进入手机待办"));

  const permissionSource = readRelative(
    "web/src/erp/pages/PermissionCenterPage.jsx",
  );
  const permissionBackendSource = readRelative(
    "server/internal/service/jsonrpc_permissions.go",
  );
  assert(permissionSource.includes("buildAssignableRoleOptions(roles"));
  assert(permissionSource.includes("getRolePermissionReadOnlyReason("));
  assert(permissionBackendSource.includes('mapped["assignable_by_current_admin"]'));
  assert(
    permissionBackendSource.includes(
      'mapped["permissions_editable_by_current_admin"]',
    ),
  );

  const roleFixtures = [
    {
      role_key: "admin",
      name: "系统管理员",
      role_type: "system",
      assignable_by_current_admin: true,
      permissions_editable_by_current_admin: false,
      version: 1,
    },
    {
      role_key: "debug_operator",
      role_type: "system",
      assignable_by_current_admin: false,
      permissions_editable_by_current_admin: false,
      version: 1,
    },
    {
      role_key: "sales",
      name: "业务员",
      role_type: "business_default",
      assignable_by_current_admin: true,
      permissions_editable_by_current_admin: true,
      version: 1,
    },
    {
      role_key: "quality_custom",
      name: "品质复核",
      role_type: "custom",
      assignable_by_current_admin: false,
      permissions_editable_by_current_admin: false,
      version: 1,
    },
  ];
  assert.deepEqual(buildAssignableRoleOptions(roleFixtures), [
    { label: "系统管理员", value: "admin" },
    { label: "业务员", value: "sales" },
  ]);
  assert.match(
    getRolePermissionReadOnlyReason(roleFixtures[0]),
    /系统统一维护/u,
  );
  assert.equal(getRolePermissionReadOnlyReason(roleFixtures[2]), "");
  assert.match(
    getRolePermissionReadOnlyReason(roleFixtures[3]),
    /只能查看/u,
  );

  const printCenterSource = readRelative(
    "web/src/erp/pages/PrintCenterPage.jsx",
  );
  assert(printCenterSource.includes("'委托方' : '订货方'"));

  const loginSource = readRelative("web/src/pages/AdminLogin/index.jsx");
  assert(loginSource.includes('label="账号"'));
  assert(loginSource.includes("本次登录验证码"));

  const routerSource = readRelative("web/src/erp/router.jsx");
  const printTemplateSource = readRelative(
    "web/src/erp/config/printTemplates.mjs",
  );
  const formalSources = [
    layoutSource,
    mobileLayoutSource,
    permissionSource,
    printCenterSource,
    loginSource,
    routerSource,
    printTemplateSource,
    readRelative(
      "web/src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx",
    ),
  ].join("\n");

  for (const forbiddenText of [
    "正在进入客户工作台",
    "暂时无法进入客户工作台",
    "当前客户的访问范围",
    "当前客户有效配置",
    "岗位任务端需要客户运行环境",
    "当前没有进入具体客户",
    "正在确认当前客户运行环境",
    "返回产品核心总览",
    "当前客户角色模板",
    "客户模板",
    "不同甲方可以配置",
    "客户/委托方",
    "甲方加工汇总",
    "当前部署未启用",
    "当前未接入短信运营商",
    "本地开发服务的页面模块",
    "保留控制台错误继续排查",
    "客户原始资料",
    'label="管理员账号"',
  ]) {
    assert(
      !formalSources.includes(forbiddenText),
      `formal customer frontend must not expose platform-view copy: ${forbiddenText}`,
    );
  }
});
