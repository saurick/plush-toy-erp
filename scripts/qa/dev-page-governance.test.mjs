import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEV_SECONDARY_NAV_ITEMS,
  DEV_WORKSPACE_NAV_ITEMS,
} from "../../web/src/dev-workbench/config/devRoutes.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const LEGACY_ROUTE_BASELINE = new Set([
  "/__dev",
  "/__dev/customer-config",
  "/__dev/data-preparation",
  "/__dev/database-migration",
  "/__dev/delivery",
  "/__dev/docs",
  "/__dev/governance",
  "/__dev/permission-relationships",
  "/__dev/product-core",
  "/__dev/product-engineering",
  "/__dev/prototypes",
  "/__dev/quality",
  "/__dev/quality-gates",
  "/__dev/status-flows",
  "/__dev/testing",
  "/__dev/version-center",
]);
const REQUIRED_SHARED_SCENARIOS = Object.freeze([
  "root-redirect-desktop",
  "dev-all-pages-mobile",
  "dev-workbench-wide-layout",
  "dev-hub-dark-desktop",
]);
const GOVERNED_PAGE_CONTRACTS = Object.freeze([
  Object.freeze({
    route: "/__dev/drill-recovery",
    scenarioFile: "web/scripts/style-l1/devDrillRecoveryScenarios.mjs",
    scenarioNames: Object.freeze([
      "dev-drill-recovery-desktop-light",
      "dev-drill-recovery-mobile-dark",
    ]),
  }),
]);

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function normalizedRoute(route) {
  return String(route || "")
    .split("?", 1)[0]
    .replace(/\/+$/u, "");
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function extractScenarioBlock(source, scenarioName) {
  const marker = `name: '${scenarioName}'`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `缺少浏览器治理场景 ${scenarioName}`);
  const next = source.indexOf("\n    {\n      name: '", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function readDefaultBrowserScenarios() {
  const full = read("scripts/qa/full.sh");
  const match = full.match(/^DEFAULT_QA_BROWSER_SCENARIOS="([^"]+)"$/mu);
  assert(match, "full.sh 必须显式登记默认页面治理浏览器场景");
  return sortedUnique(match[1].split(",").map((item) => item.trim()));
}

test("DEV 菜单路由全部进入移动端壳层与溢出治理", () => {
  const menuRoutes = sortedUnique(
    [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS].map((item) =>
      normalizedRoute(item.route),
    ),
  );
  assert.equal(
    menuRoutes.length,
    DEV_WORKSPACE_NAV_ITEMS.length + DEV_SECONDARY_NAV_ITEMS.length,
    "DEV 一级或二级菜单存在重复 route，不能依赖渲染顺序消歧",
  );

  const scenarios = read("web/scripts/style-l1/scenarios.mjs");
  const mobileBlock = extractScenarioBlock(scenarios, "dev-all-pages-mobile");
  assert.match(
    mobileBlock,
    /mockAdminRpc:\s*true/u,
    "DEV 全页面视觉门禁必须自带 RPC mock，不能依赖开发机或 CI 外部后端",
  );
  const coveredRoutes = sortedUnique(
    [...mobileBlock.matchAll(/path:\s*'([^']+)'/gu)].map((match) =>
      normalizedRoute(match[1]),
    ),
  );
  assert.deepEqual(
    coveredRoutes,
    menuRoutes,
    "新增或删除 DEV 菜单时，必须同步 dev-all-pages-mobile 的真实页面、H1、导航和横向溢出覆盖",
  );
});

test("新增 DEV 页面不能扩充 legacy，必须登记专属视觉治理合同", () => {
  const governedRoutes = new Set(
    GOVERNED_PAGE_CONTRACTS.map((contract) => contract.route),
  );
  const legacyRoutes = sortedUnique(
    [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]
      .map((item) => normalizedRoute(item.route))
      .filter((route) => !governedRoutes.has(route)),
  );
  assert.deepEqual(
    legacyRoutes.filter((route) => !LEGACY_ROUTE_BASELINE.has(route)),
    [],
    "发现未登记的新 DEV 页面；legacy 基线只能缩小，新菜单必须登记桌面、移动端、深色、键盘、密度与溢出场景",
  );
});

test("专属页面治理场景必须真实接入 style:l1 与 full/strict", () => {
  const scenarioRegistry = read("web/scripts/style-l1/scenarios.mjs");
  const full = read("scripts/qa/full.sh");
  const defaultScenarios = readDefaultBrowserScenarios();

  assert.match(
    full,
    /browser_scenarios="\$\{browser_scenarios\},\$\{QA_BROWSER_SCENARIOS\}"/u,
    "QA_BROWSER_SCENARIOS 只能追加诊断场景，不能替换正式页面治理门禁",
  );
  assert.doesNotMatch(full, /STYLE_L1_SCENARIOS="\$\{QA_BROWSER_SCENARIOS:-/u);

  for (const required of REQUIRED_SHARED_SCENARIOS) {
    assert(
      defaultScenarios.includes(required),
      `full/strict 默认浏览器门禁缺少共享治理场景 ${required}`,
    );
  }

  for (const contract of GOVERNED_PAGE_CONTRACTS) {
    const source = read(contract.scenarioFile);
    const moduleName = path.basename(contract.scenarioFile, ".mjs");
    const exportName = `create${moduleName[0].toUpperCase()}${moduleName.slice(1)}`;
    assert.match(
      scenarioRegistry,
      new RegExp(`import \\{ ${exportName} \\} from`, "u"),
      `${contract.scenarioFile} 必须由 style:l1 唯一场景注册表导入`,
    );
    assert.match(
      scenarioRegistry,
      new RegExp(`\\.\\.\\.${exportName}\\(`, "u"),
      `${contract.scenarioFile} 必须真实展开到 style:l1 场景集合`,
    );

    for (const scenarioName of contract.scenarioNames) {
      assert.match(source, new RegExp(`name: '${scenarioName}'`, "u"));
      assert(
        defaultScenarios.includes(scenarioName),
        `${scenarioName} 必须进入 full/strict 默认浏览器门禁，不能只留一段从不执行的场景代码`,
      );
    }

    assert.match(source, /viewport:\s*\{ width: 1440, height: 900 \}/u);
    assert.match(source, /viewport:\s*\{ width: 390, height: 844 \}/u);
    assert.match(source, /clickERPThemeOption\(page, '暗色'\)/u);
    assert.match(source, /page\.keyboard\.press\('Enter'\)/u);
    assert.match(source, /assertNoHorizontalOverflow/u);
    assert.match(source, /page\.screenshot/u);
    assert.match(source, /cardCount/u);
    assert.match(source, /documentHeight/u);
    assert.equal(
      [...source.matchAll(/path:\s*'([^']+)'/gu)].every(
        (match) => normalizedRoute(match[1]) === contract.route,
      ),
      true,
      `${contract.scenarioFile} 只能验证登记的 exact route`,
    );
  }
});
