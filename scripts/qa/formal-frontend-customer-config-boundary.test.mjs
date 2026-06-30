import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const erpSourceRoot = path.join(repoRoot, "web/src/erp");

const sourceExtensions = new Set([".js", ".jsx", ".mjs"]);
const skippedSuffixes = [".test.js", ".test.jsx", ".test.mjs"];

const devOnlyPrefixes = [
  "web/src/erp/config/dev",
  "web/src/erp/pages/Dev",
];

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

  const devConfigSource = readRelative("web/src/erp/config/devCustomerConfig.mjs");
  assert(
    forbiddenRawConfigTokens.some((token) => devConfigSource.includes(token)),
    "dev-only customer config console should remain the only raw package preview surface",
  );
  for (const relativePath of allowedRawConfigPaths) {
    const source = readRelative(relativePath);
    assert(
      source.includes("config/customers/") || source.includes("yoyoosunCustomerPackage"),
      `${relativePath} should be explicit dev-only raw customer config context`,
    );
  }
});

test("formal frontend customer config boundary: page, action, and field projection stay wired to admin profile", () => {
  const layoutSource = readRelative("web/src/erp/components/ERPLayout.jsx");
  assert(layoutSource.includes("getEffectiveSession"));
  assert(layoutSource.includes("attachEffectiveSessionToAdminProfile"));
  assert(layoutSource.includes("filterNavigationSectionsByAdminProfile"));
  assert(layoutSource.includes("shouldRedirectFromCurrentNavigation"));
  assert(layoutSource.includes("当前账号暂无可见后台入口"));

  const syncSource = readRelative("web/src/erp/utils/adminProfileSync.mjs");
  assert(syncSource.includes("effective_session_sync_failed"));
  assert(syncSource.includes("filterNavigationSectionsByAdminProfile"));
  assert(syncSource.includes("filterColumnsByEffectiveFieldPolicy"));
  assert(syncSource.includes("effectiveSessionAllowsAction"));

  const actionSource = readRelative("web/src/erp/utils/masterDataOrderView.mjs");
  assert(actionSource.includes("effectiveSessionAllowsAction"));
  assert(actionSource.includes("rbacAllowed && effectiveSessionAllowsAction"));

  const masterDataSource = readRelative("web/src/erp/pages/V1MasterDataPage.jsx");
  assert(masterDataSource.includes("filterColumnsByEffectiveFieldPolicy"));
  assert(masterDataSource.includes("adminProfile"));

  const salesOrderSource = readRelative("web/src/erp/pages/V1SalesOrdersPage.jsx");
  assert(salesOrderSource.includes("filterColumnsByEffectiveFieldPolicy"));
  assert(salesOrderSource.includes("'sales_orders.default'"));
});
