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
const ORDINARY_DESKTOP_SCENARIO_MODULE =
  "web/scripts/style-l1/devWorkbenchDesktopScenarios.mjs";
const DEV_LAYOUT_CONTRACT_TESTS = Object.freeze([
  "web/src/dev-workbench/styles/dev-quality-gates.test.mjs",
  "web/src/dev-workbench/styles/dev-version-center.test.mjs",
  "web/src/dev-workbench/config/devHub.test.mjs",
  "web/src/dev-workbench/config/devRelationshipPerspectives.test.mjs",
]);
const SPECIALIZED_DESKTOP_CONTRACTS = Object.freeze([
  Object.freeze({
    route: "/__dev/business-usability",
    scenarioFile: "web/scripts/style-l1/devBusinessUsabilityScenarios.mjs",
    scenarioName: "dev-business-usability-desktop-light",
  }),
  Object.freeze({
    route: "/__dev/drill-recovery",
    scenarioFile: "web/scripts/style-l1/devDrillRecoveryScenarios.mjs",
    scenarioName: "dev-drill-recovery-desktop-light",
  }),
  Object.freeze({
    route: "/__dev/status-flows",
    scenarioFile: "web/scripts/style-l1/devFlowStateObservatoryScenarios.mjs",
    scenarioName: "dev-flow-state-observatory-desktop-light",
  }),
  Object.freeze({
    route: "/__dev/quality-gates",
    scenarioFile: "web/scripts/style-l1/devQualityGateScenarios.mjs",
    scenarioName: "dev-quality-gates-desktop-light",
  }),
  Object.freeze({
    route: "/__dev/version-center",
    scenarioFile: "web/scripts/style-l1/devVersionCenterScenarios.mjs",
    scenarioName: "dev-version-center-tabs-pagination-desktop",
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

function factoryName(relativePath) {
  const moduleName = path.basename(relativePath, ".mjs");
  return `create${moduleName[0].toUpperCase()}${moduleName.slice(1)}`;
}

test("DEV menu routes are unique and remain inside the internal route space", () => {
  const routes = [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS].map(
    (item) => normalizedRoute(item.route),
  );

  assert.equal(new Set(routes).size, routes.length);
  assert(
    routes.every((route) => route === "/__dev" || route.startsWith("/__dev/")),
  );
});

test("full and strict default browser evidence contains no DEV scenario", () => {
  const full = read("scripts/qa/full.sh");
  const match = full.match(/^DEFAULT_QA_BROWSER_SCENARIOS="([^"]+)"$/mu);

  assert(match, "full.sh 必须显式登记默认浏览器场景");
  assert.deepEqual(match[1].split(","), ["root-redirect-desktop"]);
  assert.doesNotMatch(match[1], /dev-/u);
});

test("ordinary DEV routes use one generated desktop-only smoke module", () => {
  const registry = read("web/scripts/style-l1/scenarios.mjs");
  const factory = factoryName(ORDINARY_DESKTOP_SCENARIO_MODULE);
  const source = read(ORDINARY_DESKTOP_SCENARIO_MODULE);

  assert.match(registry, new RegExp(`import \\{ ${factory} \\} from`, "u"));
  assert.match(registry, new RegExp(`\\.\\.\\.${factory}\\(`, "u"));
  assert.doesNotMatch(
    registry,
    /name:\s*'dev-/u,
    "DEV 场景必须由各自工厂登记，不能在总场景文件恢复移动端、暗色或页面形状副本",
  );
  assert.match(source, /viewport:\s*\{ width: 1440, height: 900 \}/u);
  assert.match(source, /assertNoHorizontalOverflow/u);
  assert.doesNotMatch(
    source,
    /themeMode:\s*'dark'|viewport:\s*\{ width:\s*(?:320|390|412)/u,
  );
  assert.doesNotMatch(source, /\.screenshot\s*\(|keyboard\.press/u);
  assert.doesNotMatch(
    source,
    /cardCount|documentHeight|scrollHeight|fixedDensity/u,
  );
});

test("specialized DEV pages keep one exact desktop smoke contract", () => {
  for (const contract of SPECIALIZED_DESKTOP_CONTRACTS) {
    const source = read(contract.scenarioFile);
    const scenarioNames = [...source.matchAll(/name:\s*'(dev-[^']+)'/gu)].map(
      (match) => match[1],
    );

    assert.deepEqual(scenarioNames, [contract.scenarioName]);
    assert.match(source, new RegExp(`name: '${contract.scenarioName}'`, "u"));
    assert.match(source, /viewport:\s*\{ width: 1440, height: 900 \}/u);
    assert.doesNotMatch(
      source,
      /themeMode:\s*'dark'|viewport:\s*\{ width:\s*(?:320|390|412)/u,
    );
    assert.doesNotMatch(source, /\.screenshot\s*\(/u);
    assert.doesNotMatch(
      source,
      /cardCount|documentHeight|scrollHeight|fixedDensity/u,
    );
    assert.doesNotMatch(source, /keyboard\.press/u);
    assert(
      [...source.matchAll(/path:\s*'([^']+)'/gu)].every(
        (match) => normalizedRoute(match[1]) === contract.route,
      ),
      `${contract.scenarioFile} 只能登记 ${contract.route}`,
    );
  }
});

test("DEV layout contracts do not restore mobile or dark acceptance", () => {
  for (const relativePath of DEV_LAYOUT_CONTRACT_TESTS) {
    const source = read(relativePath);
    assert.equal(
      source.includes("@media \\(max-width"),
      false,
      `${relativePath} 不应锁定 DEV 响应式断点`,
    );
    assert.doesNotMatch(
      source,
      /data-erp-theme='dark'|dark theme|mobile layout|on mobile|narrow screens|across breakpoints|移动端|暗色/iu,
    );
  }
});

test("DEV testing presets reference only the affected desktop scene names", () => {
  const source = read("web/src/dev-workbench/config/devTesting.mjs");
  const scenarioLists = [...source.matchAll(/STYLE_L1_SCENARIOS=([^ ]+)/gu)]
    .map((match) => match[1].split(","))
    .flat()
    .filter((name) => name.startsWith("dev-"));

  assert.deepEqual(scenarioLists, [
    "dev-page-customer-config-desktop-light",
    "dev-page-prototypes-desktop-light",
    "dev-page-overview-desktop-light",
    "dev-page-docs-desktop-light",
    "dev-page-governance-desktop-light",
  ]);
  assert.doesNotMatch(scenarioLists.join(","), /mobile|dark/u);
});
