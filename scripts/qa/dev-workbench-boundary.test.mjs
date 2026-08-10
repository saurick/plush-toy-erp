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
        /const DevWorkbenchRoutes\s*=\s*import\.meta\.env\.DEV[\s\S]{0,180}?import\(['"]@\/dev-workbench\/DevWorkbenchRoutes\.jsx['"]\)/u,
      );
      assert.match(
        source,
        /<Route path="\/__dev\/\*" element=\{<DevWorkbenchRoutes \/>\}/u,
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
    "web/src/dev-workbench/components/DevPageNav.jsx",
    "web/src/dev-workbench/components/DevReceiptPanel.jsx",
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
    ".erp-dev-governance",
    ".erp-dev-capability",
    ".erp-dev-prototypes",
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
    "web/dev-server/devDatabaseMigrationRuntime.mjs",
    "web/dev-server/devDeliveryBridgePlugin.mjs",
    "web/dev-server/devQaCoveragePlugin.mjs",
    "web/dev-server/devQualityGatePlugin.mjs",
    "web/dev-server/devWorkbenchReceiptPlugin.mjs",
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
    /const DEV_WORKBENCH_PLUGIN_MODULE = '\.\/dev-server\/devWorkbenchPlugins\.mjs'/u,
  );
  assert.match(viteConfig, /await import\(DEV_WORKBENCH_PLUGIN_MODULE\)/u);
  assert.match(viteConfig, /isDev && command === 'serve'/u);
  assert.doesNotMatch(
    viteConfig,
    /from '\.\/dev-server\/devWorkbenchPlugins\.mjs'/u,
  );
});

test("dev workbench boundary: primary navigation is fixed to four areas", () => {
  assert.deepEqual(
    DEV_WORKSPACE_NAV_ITEMS.map(({ key, route }) => ({ key, route })),
    [
      { key: "overview", route: "/__dev" },
      {
        key: "product-engineering",
        route: "/__dev/product-engineering",
      },
      { key: "quality", route: "/__dev/quality" },
      { key: "delivery", route: "/__dev/delivery" },
    ],
  );
  assert.equal(DEV_SECONDARY_NAV_ITEMS.length, 13);
  assert(
    DEV_SECONDARY_NAV_ITEMS.every(
      (item) =>
        item.route.startsWith("/__dev/") &&
        ["product-engineering", "quality", "delivery"].includes(item.areaKey),
    ),
  );
});

test("dev workbench boundary: imports from ERP stay on explicit read/API adapters", () => {
  const workbenchSources = listFiles("web/src/dev-workbench")
    .filter((file) => /\.(?:js|jsx|mjs)$/u.test(file))
    .map((file) => ({ file, source: read(file) }));
  const allowedERPImports = new Set([
    "@/erp/api/customerConfigApi.mjs",
    "@/erp/api/customerConfigTransition.mjs",
    "@/erp/api/workflowApi.mjs",
    "@/erp/utils/processRuntimePresentation.mjs",
    "../../erp/api/approvalSettingsApi.mjs",
    "../../erp/utils/permissionCenterAccess.mjs",
    "../../erp/utils/permissionCenterSearch.mjs",
    "../../erp/utils/permissionModuleLabels.mjs",
    "../../erp/config/printTemplates.mjs",
    "../../erp/config/workflowStatus.mjs",
  ]);
  const allowedERPImportsByFile = new Map([
    [
      "web/src/dev-workbench/pages/DevCustomerConfigPage.jsx",
      new Set([
        "@/erp/config/businessModules.mjs",
        "@/erp/config/seedData.mjs",
      ]),
    ],
    [
      "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
      new Set([
        "@/erp/utils/workflowTaskEventPresentation.mjs",
        "@/erp/utils/workflowTaskBoard.mjs",
      ]),
    ],
  ]);

  for (const { file, source } of workbenchSources) {
    const fileScopedERPImports = allowedERPImportsByFile.get(file);
    for (const match of source.matchAll(
      /(?:from\s+|import\()['"]([^'"]*erp\/[^'"]+)['"]/gu,
    )) {
      assert(
        allowedERPImports.has(match[1]) || fileScopedERPImports?.has(match[1]),
        `${file} imports non-approved ERP internals: ${match[1]}`,
      );
    }
    assert.doesNotMatch(source, /@\/erp\/(?:pages|components|styles)\//u);
  }
});
