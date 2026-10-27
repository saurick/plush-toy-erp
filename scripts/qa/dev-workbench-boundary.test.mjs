import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEV_SECONDARY_NAV_ITEMS,
  DEV_WORKSPACE_NAV_ITEMS,
} from "../../web/src/dev-workbench/config/devRoutes.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    return entry.isDirectory() ? listFiles(relativePath) : [relativePath];
  });
}

test("dev workbench boundary: product app keeps one DEV-only dynamic bridge", () => {
  const productFiles = [
    ...listFiles("web/src/erp"),
    ...listFiles("web/src/common"),
    "web/src/App.jsx",
  ].filter((file) => /\.(?:css|js|jsx|mjs)$/u.test(file));
  const bridgePath = "web/src/erp/router.jsx";

  for (const file of productFiles) {
    const source = read(file);
    const importsWorkbench = /(?:from\s+|import\()['"]@\/dev-workbench\//u.test(
      source,
    );
    if (file === bridgePath) {
      assert.match(
        source,
        /const DevWorkbenchBridge\s*=\s*import\.meta\.env\.DEV[\s\S]{0,180}?import\(['"]@\/dev-workbench\/DevWorkbenchBridge\.jsx['"]\)/u,
      );
      assert.match(
        source,
        /<Route path="\/__dev\/\*" element=\{<DevWorkbenchBridge \/>\}/u,
      );
      assert.match(
        source,
        /<DevWorkbenchBridge>\{children\}<\/DevWorkbenchBridge>/u,
      );
      assert.equal(
        source.match(/@\/dev-workbench\//gu)?.length,
        1,
        "ERP router must keep exactly one workbench bridge",
      );
      continue;
    }
    assert.equal(
      importsWorkbench,
      false,
      `${file} must not import the DEV-only workbench`,
    );
  }

  const bridge = read("web/src/dev-workbench/DevWorkbenchBridge.jsx");
  assert.match(bridge, /if \(children !== undefined\)/u);
  assert.match(
    bridge,
    /<DevRuntimeRecoveryBoundary>\{children\}<\/DevRuntimeRecoveryBoundary>/u,
  );
  assert.equal(bridge.match(/<DevRuntimeRecoveryBoundary>/gu)?.length, 1);
  assert.match(bridge, /import\(['"]\.\/DevWorkbenchRoutes\.jsx['"]\)/u);
});

test("dev workbench boundary: source and styles live outside product directories", () => {
  for (const legacyPath of [
    "web/src/erp/config/devRoutes.mjs",
    "web/src/erp/config/devHub.mjs",
    "web/src/erp/pages/DevHubPage.jsx",
    "web/src/erp/components/dev/DevPageNav.jsx",
    "web/src/erp/styles/app/dev-navigation.css",
    "web/src/erp/components/PermissionRelationshipGraphModal.jsx",
    "web/src/erp/utils/permissionRelationshipGraph.mjs",
    "web/src/erp/styles/app/permission-relationship-graph.css",
  ]) {
    assert.equal(
      existsSync(path.join(repoRoot, legacyPath)),
      false,
      legacyPath,
    );
  }

  for (const requiredPath of [
    "web/src/dev-workbench/DevWorkbenchRoutes.jsx",
    "web/src/dev-workbench/config/devRoutes.mjs",
    "web/src/dev-workbench/pages/DevHubPage.jsx",
    "web/src/dev-workbench/pages/DevDataPreparationPage.jsx",
    "web/src/dev-workbench/pages/DevDatabaseMigrationPage.jsx",
    "web/src/dev-workbench/pages/DevQualityGatesPage.jsx",
    "web/src/dev-workbench/pages/DevDrillRecoveryPage.jsx",
    "web/src/dev-workbench/pages/DevPermissionRelationshipsPage.jsx",
    "web/src/dev-workbench/pages/DevIntegrationPage.jsx",
    "web/src/dev-workbench/components/DevProjectGraphView.jsx",
    "web/src/dev-workbench/components/DevPageNav.jsx",
    "web/src/dev-workbench/config/devDataPreparation.mjs",
    "web/src/dev-workbench/config/devDatabaseMigration.mjs",
    "web/src/dev-workbench/config/devQualityGates.mjs",
    "web/src/dev-workbench/config/devRecovery.mjs",
    "web/src/dev-workbench/config/devPermissionRelationshipGraph.mjs",
    "web/src/dev-workbench/styles/dev-data-preparation.css",
    "web/src/dev-workbench/styles/dev-database-migration.css",
    "web/src/dev-workbench/styles/dev-quality-gates.css",
    "web/src/dev-workbench/styles/dev-drill-recovery.css",
    "web/src/dev-workbench/styles/dev-permission-relationships.css",
    "web/src/dev-workbench/styles/index.css",
  ]) {
    assert.equal(
      existsSync(path.join(repoRoot, requiredPath)),
      true,
      requiredPath,
    );
  }

  const forbiddenProductStyleMarkers = [
    ".erp-dev-docs",
    ".erp-dev-capability",
    ".erp-dev-ui-design",
    ".erp-dev-hub",
    ".erp-dev-flow-state",
    ".erp-dev-data-",
    ".erp-dev-database-",
    ".erp-dev-quality-gates",
    ".erp-dev-workspace-nav",
    ".erp-dev-permission-relationships",
    ".erp-permission-relationship",
  ];
  const productStyles = listFiles("web/src/erp/styles")
    .filter((file) => file.endsWith(".css"))
    .map((file) => read(file))
    .join("\n");
  for (const marker of forbiddenProductStyleMarkers) {
    assert.doesNotMatch(
      productStyles,
      new RegExp(marker.replace(".", "\\."), "u"),
    );
  }

  const workbenchStyles = listFiles("web/src/dev-workbench/styles")
    .filter((file) => file.endsWith(".css"))
    .map((file) => read(file))
    .join("\n");
  assert.doesNotMatch(
    workbenchStyles,
    /\.erp-login-/u,
    "formal login styles must not live in the DEV-only workbench bundle",
  );
  assert.match(
    read("web/src/erp/styles/app.css"),
    /@import '\.\/app\/login\.css';/u,
    "product app must import the formal login stylesheet",
  );
});

test("dev workbench boundary: Node serve bridges are centralized outside browser sources", () => {
  const rootDevModules = readdirSync(path.join(repoRoot, "web"), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^dev[A-Z].*(?:Plugin|Plugins|Runtime).*\.mjs$/u.test(entry.name),
    )
    .map((entry) => entry.name);
  assert.deepEqual(rootDevModules, []);

  for (const requiredPath of [
    "web/dev-server/README.md",
    "web/dev-server/devWorkbenchPlugins.mjs",
    "web/dev-server/devCustomerConfigPlugin.mjs",
    "web/dev-server/devCustomerImportDryRunPlugin.mjs",
    "web/dev-server/devDataPreparationPlugin.mjs",
    "web/dev-server/devDatabaseMigrationPlugin.mjs",
    "web/dev-server/devDatabaseMigrationRecoveryPlugin.mjs",
    "web/dev-server/devDatabaseMigrationRuntime.mjs",
    "web/dev-server/devDeliveryBridgePlugin.mjs",
    "web/dev-server/devQaCoveragePlugin.mjs",
    "web/dev-server/devQualityGatePlugin.mjs",
    "web/dev-server/devServerSecurity.mjs",
  ]) {
    assert.equal(
      existsSync(path.join(repoRoot, requiredPath)),
      true,
      requiredPath,
    );
  }

  const viteConfig = read("web/vite.shared.mjs");
  assert.match(
    viteConfig,
    /const DEV_WORKBENCH_PLUGIN_MODULE = new URL\(\s*'\.\/dev-server\/devWorkbenchPlugins\.mjs',\s*import\.meta\.url\s*\)\.href/u,
  );
  assert.match(viteConfig, /await import\(DEV_WORKBENCH_PLUGIN_MODULE\)/u);
  assert.match(viteConfig, /isDev && command === 'serve'/u);
  assert.doesNotMatch(
    viteConfig,
    /from '\.\/dev-server\/devWorkbenchPlugins\.mjs'/u,
  );
});

test("dev workbench boundary: primary navigation exposes overview and four responsibility areas", () => {
  assert.deepEqual(
    DEV_WORKSPACE_NAV_ITEMS.map(({ key, route }) => ({ key, route })),
    [
      { key: "overview", route: "/__dev" },
      {
        key: "product-engineering",
        route: "/__dev/product-engineering",
      },
      { key: "development-resources", route: "/__dev/development-resources" },
      { key: "quality", route: "/__dev/quality" },
      { key: "delivery", route: "/__dev/delivery" },
    ],
  );
  assert(
    DEV_SECONDARY_NAV_ITEMS.some(
      (item) => item.route === "/__dev/integration" && item.areaKey === "development-resources",
    ),
    "接口与集成归入开发资源",
  );
  assert(
    DEV_SECONDARY_NAV_ITEMS.every(
      (item) =>
        item.route.startsWith("/__dev/") &&
        ["product-engineering", "development-resources", "quality", "delivery"].includes(item.areaKey),
    ),
  );
});

const allowedERPImports = new Set([
  "api/customerConfigApi.mjs",
  "api/customerConfigTransition.mjs",
  "api/workflowApi.mjs",
  "utils/processRuntimePresentation.mjs",
  "api/approvalSettingsApi.mjs",
  "utils/approvalSettingsActivation.mjs",
  "utils/permissionCenterAccess.mjs",
  "utils/permissionCenterSearch.mjs",
  "utils/permissionModuleLabels.mjs",
  "utils/adminIdentity.mjs",
  "config/printTemplates.mjs",
  "config/workflowStatus.mjs",
  "config/businessUsabilityCatalog.mjs",
  "config/roleHelpContent.mjs",
]);
const businessSamplePresentationImports = new Set([
  "components/business-list/BusinessFormPage.jsx",
  "components/business-list/BusinessFormSection.jsx",
  "components/business-list/BusinessLineItemsSection.jsx",
  "components/business-list/BusinessLineItemsTable.jsx",
  "components/business-list/BusinessTextArea.jsx",
  "components/business-list/BusinessDateInputs.jsx",
  "components/business-list/SourceImportPickerModal.jsx",
]);
const allowedERPImportsByFile = new Map([
  ["web/src/dev-workbench/config/devTaskHandling.mjs", new Set(["utils/taskHandlingPolicy.mjs", "utils/roleKeys.mjs"])],
  ["web/src/dev-workbench/config/devTaskHandlingResponsibilities.test.mjs", new Set(["utils/roleKeys.mjs"])],
  ["web/src/dev-workbench/components/flow-state/TaskHandlingMatrix.jsx", new Set(["utils/taskHandlingPolicy.mjs", "utils/roleKeys.mjs"])],
  [
    "web/src/dev-workbench/components/DevUIBusinessExamples.jsx",
    businessSamplePresentationImports,
  ],
  [
    "web/src/dev-workbench/components/DevUIPageStateExamples.jsx",
    new Set([
      "mobile/components/MobileTaskListContent.jsx",
      "components/workflow/WorkflowTaskCard.jsx",
      "components/workflow/WorkflowTaskIdentity.jsx",
      "mobile/mobileRoleTasks.css",
    ]),
  ],
  [
    "web/src/dev-workbench/components/DevUIDesignIllustrations.jsx",
    new Set(["components/business-list/BusinessCellStack.jsx"]),
  ],
  [
    "web/src/dev-workbench/standalone.jsx",
    new Set(["styles/app.css"]),
  ],
  [
    "web/src/dev-workbench/components/DevWorkCenterDesign.jsx",
    new Set([
      "components/business-visualizations/ProgressCompactContent.jsx",
      "components/workflow/WorkflowTaskIdentity.jsx",
      "components/workflow/WorkflowTaskTiming.jsx",
      "utils/workflowTaskEventPresentation.mjs",
      "styles/app/progress-board.css",
      "mobile/mobileProgress.css",
    ]),
  ],
  [
    "web/src/dev-workbench/config/devWorkCenterDesign.test.mjs",
    new Set(["utils/workflowTaskTiming.mjs", "utils/workflowTaskIdentity.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devWorkCenterDesign.mjs",
    new Set([
      "utils/workflowTaskIdentity.mjs",
      "utils/dashboardTaskDisplay.mjs",
      "utils/businessProgress.mjs",
      "utils/workflowTaskEventPresentation.mjs",
      "utils/roleKeys.mjs",
    ]),
  ],
  [
    "web/src/dev-workbench/components/DevControlStandards.jsx",
    new Set(["utils/businessProgress.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/BusinessChainInstanceView.jsx",
    new Set(["utils/workflowBusinessChain.mjs", "utils/dashboardTaskDisplay.mjs"]),
  ],
  [
    "web/src/dev-workbench/pages/devFlowViewContext.mjs",
    new Set(["utils/workflowBusinessChain.mjs", "utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/TaskFulfillmentGuide.jsx",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/FulfillmentExceptionDetails.jsx",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/FulfillmentSubflow.jsx",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/FulfillmentChainCanvas.jsx",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/BusinessChainTopics.jsx",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devBusinessChainProjection.mjs",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devFulfillmentSubflow.mjs",
    new Set(["utils/roleKeys.mjs", "utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devFulfillmentPresentation.mjs",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devFulfillmentExceptionGraph.mjs",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devFulfillmentSubflow.test.mjs",
    new Set(["utils/roleKeys.mjs", "utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/pages/DevBusinessChainCustomerReviewPrint.jsx",
    new Set(["utils/workflowFulfillment.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/DevUIFeedbackExamples.jsx",
    new Set([
      "components/business-list/BusinessFormModal",
      "components/business-list/BusinessModal",
      "utils/modalSizes.mjs",
    ]),
  ],
  [
    "web/src/dev-workbench/components/DevUIFeedbackGuide.jsx",
    new Set(["utils/modalSizes.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/DevUIInputExamples.jsx",
    new Set([
      "components/business-list/BusinessDateInputs.jsx",
      "utils/dateRange.mjs",
      "utils/workflowTaskTiming.mjs",
    ]),
  ],
  [
    "web/src/dev-workbench/config/devUIDesign.test.mjs",
    new Set(["config/helpScenarios.mjs", "config/helpManualCatalog.mjs", "config/businessHandbook.mjs"]),
  ],
  [
    "web/src/dev-workbench/pages/customer-config/AssetsPanel.jsx",
    new Set(["config/businessModules.mjs", "config/seedData.mjs"]),
  ],
  [
    "web/src/dev-workbench/config/devPermissionNavigation.mjs",
    new Set([
      "config/seedData.mjs",
      "config/roleGuidedNavigation.mjs",
      "config/customerMenuConfig.mjs",
      "utils/businessModuleGroups.mjs",
    ]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/WorkflowView.jsx",
    new Set([
      "utils/workflowTaskEventPresentation.mjs",
      "utils/workflowTaskBoard.mjs",
    ]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/FlowTaskContext.jsx",
    new Set(["utils/workflowTaskBoard.mjs"]),
  ],
  [
    "web/src/dev-workbench/components/flow-state/RuntimeView.jsx",
    new Set(["utils/workflowTaskBoard.mjs"]),
  ],
]);

function isAllowedERPImport(file, specifier) {
  const resolved = specifier.startsWith("@/")
    ? path.posix.join("web/src", specifier.slice(2))
    : path.posix.join(path.posix.dirname(file), specifier);
  const module = path.posix.relative("web/src/erp", resolved);
  return (
    allowedERPImports.has(module) ||
    allowedERPImportsByFile.get(file)?.has(module) === true
  );
}

test("dev workbench boundary: ERP imports stay on explicit adapters and presentation samples", () => {
  const workbenchSources = listFiles("web/src/dev-workbench")
    .filter((file) => /\.(?:js|jsx|mjs)$/u.test(file))
    .map((file) => ({ file, source: read(file) }));

  for (const { file, source } of workbenchSources) {
    for (const match of source.matchAll(
      /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]*erp\/[^'"]+)['"]/gu,
    )) {
      assert(
        isAllowedERPImport(file, match[1]),
        `${file} imports non-approved ERP internals: ${match[1]}`,
      );
    }
  }
});

test("shared component consumers read only page presentation metadata", () => {
  for (const file of [
    "web/src/dev-workbench/components/DevControlStandards.jsx",
    "web/src/dev-workbench/components/DevSharedComponentGuide.jsx",
  ]) {
    assert.match(read(file), /\bgetBusinessPagePresentation\b/u);
    for (const prefix of ["@/erp/", "../../erp/"]) {
      assert.equal(isAllowedERPImport(file, `${prefix}config/businessModules.mjs`), false);
      assert.equal(isAllowedERPImport(file, `${prefix}config/commandCenter.mjs`), false);
      assert.equal(isAllowedERPImport(file, `${prefix}config/businessUsabilityCatalog.mjs`), true);
    }
  }
});

test("business component samples retain a closed presentation dependency graph", () => {
  const dependencies = [
    ...businessSamplePresentationImports,
    "components/business-list/BusinessFormBody.jsx",
    "components/business-list/BusinessFormPageContext.js",
    "components/business-list/BusinessFormSectionTitle.jsx",
    "components/business-list/BusinessCompactFieldTable.jsx",
    "components/business-list/BusinessLineItemsFooter.jsx",
    "components/business-list/BusinessModal.jsx",
    "components/business-list/businessCompactFieldTable.css",
    "components/ERPPageActions.jsx",
    "utils/businessFormSnapshot.mjs",
    "utils/businessFormSections.mjs",
    "utils/dateRange.mjs",
    "utils/modalSizes.mjs",
    "styles/app/business-form-page.css",
  ].map((file) => `web/src/erp/${file}`);
  const allowed = new Set([
    ...dependencies,
    "react", "react-dom", "react-router-dom", "antd", "@ant-design/icons",
    "dayjs", "dayjs/plugin/customParseFormat.js",
    "web/src/common/utils/antdApp",
    "web/src/common/utils/feedbackConfig.mjs",
    "web/src/common/components/select/AppSelect",
    "web/src/common/components/modal/AppModal",
    "web/src/common/components/table/AppTable",
    "web/src/common/components/table/TableScrollRegion.jsx",
    "web/src/common/components/pagination/AppPagination",
    "web/src/common/components/SearchInput",
    "web/src/common/components/scroll/MobileBackToTop",
  ]);
  const sample = "web/src/dev-workbench/components/DevUIBusinessExamples.jsx";
  for (const file of [sample, ...dependencies]) {
    const source = read(file);
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b|\/api\//u);
    if (file === sample) continue;
    for (const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
      const specifier = match[1];
      const resolved = specifier.startsWith("@/")
        ? path.posix.join("web/src", specifier.slice(2))
        : specifier.startsWith(".")
          ? path.posix.join(path.posix.dirname(file), specifier)
          : specifier;
      assert(allowed.has(resolved), `${file} imports a non-presentation dependency: ${specifier}`);
    }
  }
  for (const module of businessSamplePresentationImports) {
    assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", `@/erp/${module}`), false);
  }
  for (const module of ["pages/PurchaseOrdersPage.jsx", "api/masterDataOrderApi.mjs", "config/businessModules.mjs", "config/commandCenter.mjs"]) {
    assert.equal(isAllowedERPImport(sample, `@/erp/${module}`), false);
  }
});

test("feedback sample modal dependencies remain presentation-only", () => {
  const allowed = new Set([
    "react",
    "antd",
    "../../utils/modalSizes.mjs",
    "./BusinessModal.jsx",
    "../../common/utils/feedbackConfig.mjs",
    "@/common/components/modal/AppModal",
    "@/common/components/layout/SurfacePanel",
  ]);
  for (const file of [
    "web/src/erp/components/business-list/BusinessFormModal.jsx",
    "web/src/erp/components/business-list/BusinessModal.jsx",
    "web/src/erp/utils/modalSizes.mjs",
    "web/src/common/utils/feedbackConfig.mjs",
    "web/src/common/components/modal/AppModal.jsx",
    "web/src/common/components/layout/SurfacePanel.jsx",
  ]) {
    const source = read(file);
    for (const match of source.matchAll(
      /(?:from\s+|import\()['"]([^'"]+)['"]/gu,
    )) {
      assert(allowed.has(match[1]), `${file} imports a non-presentation dependency`);
    }
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/u);
  }
  assert.equal(
    isAllowedERPImport(
      "web/src/dev-workbench/pages/DevTestingPage.jsx",
      "@/erp/components/business-list/BusinessModal",
    ),
    false,
  );
  assert.equal(
    isAllowedERPImport(
      "web/src/dev-workbench/components/DevUIFeedbackExamples.jsx",
      "@/erp/pages/PurchaseOrdersPage.jsx",
    ),
    false,
  );
});

test("page state samples reuse only the presentation task list and cannot import business pages", () => {
  const allowed = new Set([
    "react", "antd", "@ant-design/icons", "./MobileTaskListSkeleton.jsx",
    "./workflowTaskCopy.css", "../../components/workflow/workflowTaskCopy.css",
    "../../components/workflow/workflowTaskIdentity.css",
  ]);
  for (const file of [
    "web/src/erp/mobile/components/MobileTaskListContent.jsx",
    "web/src/erp/mobile/components/MobileTaskListSkeleton.jsx",
    "web/src/erp/components/workflow/WorkflowTaskCard.jsx",
  ]) {
    const source = read(file);
    for (const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
      assert(allowed.has(match[1]), `${file} imports a non-presentation dependency`);
    }
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/u);
  }
  const sample = "web/src/dev-workbench/components/DevUIPageStateExamples.jsx";
  assert.equal(isAllowedERPImport(sample, "@/erp/mobile/components/MobileTaskListContent.jsx"), true);
  assert.equal(isAllowedERPImport(sample, "@/erp/mobile/pages/MobileRoleTasksPage.jsx"), false);
  assert.equal(isAllowedERPImport(sample, "@/erp/api/masterDataOrderApi.mjs"), false);
  assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", "@/erp/mobile/components/MobileTaskListContent.jsx"), false);
});

test("typography samples only reuse the presentation-only cell stack", () => {
  const component = "web/src/erp/components/business-list/BusinessCellStack.jsx";
  const allowed = new Set(["react", "./businessCellStack.css"]);
  const source = read(component);
  for (const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
    assert(allowed.has(match[1]), `${component} imports a non-presentation dependency`);
  }
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/u);
  const sample = "web/src/dev-workbench/components/DevUIDesignIllustrations.jsx";
  assert.equal(isAllowedERPImport(sample, "@/erp/components/business-list/BusinessCellStack.jsx"), true);
  assert.equal(isAllowedERPImport(sample, "@/erp/pages/SalesOrdersPage.jsx"), false);
  assert.equal(isAllowedERPImport(sample, "@/erp/api/salesOrderApi.mjs"), false);
  assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", "@/erp/components/business-list/BusinessCellStack.jsx"), false);
});

test("date input samples keep shared pickers free of business dependencies", () => {
  const dependencies = new Map([
    ["web/src/erp/components/business-list/BusinessDateInputs.jsx", new Set([
      "react", "antd", "@ant-design/icons", "../../utils/dateRange.mjs",
      "@/common/components/select/AppSelect",
    ])],
    ["web/src/erp/utils/dateRange.mjs", new Set([
      "dayjs", "dayjs/plugin/customParseFormat.js",
    ])],
    ["web/src/common/components/select/AppSelect.jsx", new Set([
      "react", "antd", "./app-select.css",
    ])],
  ]);
  for (const [file, allowed] of dependencies) {
    const source = read(file);
    for (const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
      assert(allowed.has(match[1]), `${file} imports a non-presentation dependency`);
    }
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/u);
  }
  const sample = read("web/src/dev-workbench/components/DevUIInputExamples.jsx");
  assert.doesNotMatch(sample, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b|\/api\//u);
});

test("work-center samples keep direct business actions outside the presentation adapter", () => {
  for (const file of [
    "web/src/dev-workbench/components/DevWorkCenterDesign.jsx",
    "web/src/dev-workbench/config/devWorkCenterDesign.mjs",
  ]) {
    assert.equal(isAllowedERPImport(file, "@/erp/components/workflow/WorkflowTaskCopy.jsx"), false);
    assert.equal(isAllowedERPImport(file, "@/erp/api/attachmentApi.mjs"), false);
    assert.equal(isAllowedERPImport(file, "@/erp/pages/WorkflowTasksPage.jsx"), false);
    assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|useOutletContext)\b/u);
  }
  assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", "@/erp/components/workflow/WorkflowTaskIdentity.jsx"), false);
  assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", "@/erp/mobile/mobileProgress.css"), false);
});

test("business chain reading context retains a closed presentation adapter", () => {
  const file = "web/src/dev-workbench/pages/devFlowViewContext.mjs";
  const modules = ["utils/workflowBusinessChain.mjs", "utils/workflowFulfillment.mjs"];
  for (const prefix of ["@/erp/", "../../erp/"]) {
    for (const module of modules) {
      assert.equal(isAllowedERPImport(file, `${prefix}${module}`), true);
      assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", `${prefix}${module}`), false);
    }
    for (const module of ["pages/PurchaseOrdersPage.jsx", "api/masterDataOrderApi.mjs", "config/businessModules.mjs", "config/commandCenter.mjs"]) {
      assert.equal(isAllowedERPImport(file, `${prefix}${module}`), false);
    }
  }
  const source = read(file);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b|\/api\//u);
  const imports = [...source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)].map((match) => match[1]);
  assert.deepEqual(new Set(imports), new Set([
    "../../common/consts/workflowTaskDiscovery.generated.mjs",
    "../../erp/utils/workflowBusinessChain.mjs",
    "../config/devBusinessChainProjection.mjs",
    "../../erp/utils/workflowFulfillment.mjs",
    "./devFlowStateQuery.mjs",
  ]));
});

test("dev workbench boundary: resolved imports preserve module and file scope", () => {
  assert.equal(isAllowedERPImport("web/src/dev-workbench/components/DevUIInputExamples.jsx", "@/erp/components/business-list/BusinessDateInputs.jsx"), true);
  assert.equal(isAllowedERPImport("web/src/dev-workbench/components/DevControlStandards.jsx", "@/erp/components/business-list/BusinessDateInputs.jsx"), false);
  assert.equal(isAllowedERPImport("web/src/dev-workbench/components/DevUIInputExamples.jsx", "@/erp/pages/PurchaseOrdersPage.jsx"), false);
  assert.equal(
    isAllowedERPImport("web/src/dev-workbench/config/devUIDesign.test.mjs", "../../erp/config/businessHandbook.mjs"),
    true,
  );
  assert.equal(
    isAllowedERPImport("web/src/dev-workbench/components/DevUIDesignDocument.jsx", "../../erp/config/businessHandbook.mjs"),
    false,
  );
  assert.equal(
    isAllowedERPImport(
      "web/src/dev-workbench/config/devUIDesign.test.mjs",
      "../../erp/config/helpScenarios.mjs",
    ),
    true,
  );
  assert.equal(
    isAllowedERPImport(
      "web/src/dev-workbench/pages/UIDesignPage.jsx",
      "../../erp/config/helpScenarios.mjs",
    ),
    false,
  );
  const workflowFile =
    "web/src/dev-workbench/components/flow-state/WorkflowView.jsx";
  for (const prefix of ["@/erp/", "../../../erp/"]) {
    assert.equal(
      isAllowedERPImport(
        workflowFile,
        `${prefix}utils/permissionCenterAccess.mjs`,
      ),
      true,
    );
    assert.equal(
      isAllowedERPImport(workflowFile, `${prefix}utils/workflowTaskBoard.mjs`),
      true,
    );
    assert.equal(
      isAllowedERPImport(
        workflowFile,
        `${prefix}utils/workflowTaskMutation.mjs`,
      ),
      false,
    );
    assert.equal(
      isAllowedERPImport(
        workflowFile,
        `${prefix}pages/PermissionCenterPage.jsx`,
      ),
      false,
    );
  }
  assert.equal(
    isAllowedERPImport(
      "web/src/dev-workbench/components/flow-state/BusinessChainViews.jsx",
      "@/erp/utils/workflowTaskBoard.mjs",
    ),
    false,
  );
  assert.equal(
    isAllowedERPImport(workflowFile, "@/erp/config/seedData.mjs"),
    false,
  );
  assert.equal(
    isAllowedERPImport(
      workflowFile,
      "@/erp/../dev-workbench/utils/workflowTaskBoard.mjs",
    ),
    false,
  );
});

test("task handling projections keep pure classification helpers consumer scoped", () => {
  for (const file of ["web/src/dev-workbench/config/devTaskHandling.mjs", "web/src/dev-workbench/components/flow-state/TaskHandlingMatrix.jsx"]) {
    assert.equal(isAllowedERPImport(file, "@/erp/utils/taskHandlingPolicy.mjs"), true);
    assert.equal(isAllowedERPImport(file, "@/erp/api/masterDataOrderApi.mjs"), false);
  }
  assert.equal(isAllowedERPImport("web/src/dev-workbench/pages/DevTestingPage.jsx", "@/erp/utils/taskHandlingPolicy.mjs"), false);
  const pending = ["web/src/erp/utils/taskHandlingPolicy.mjs"];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert(file.startsWith("web/src/erp/utils/") || file.startsWith("web/src/common/consts/") || file === "server/internal/unitpolicy/units.json", `${file} is outside the presentation dependency graph`);
    const source = read(file);
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b|\/api\//u);
    for (const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
      const specifier = match[1];
      assert(specifier.startsWith("."), `${file} imports a non-local dependency: ${specifier}`);
      pending.push(path.posix.join(path.posix.dirname(file), specifier));
    }
  }
});
