#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(
  new URL("./phase-label-boundaries.mjs", import.meta.url),
);

function runFixture(files, scanPaths = [], { throughFast = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-phase-labels-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    }
    if (throughFast) {
      const qaDirectory = path.join(root, "scripts/qa");
      fs.mkdirSync(qaDirectory, { recursive: true });
      fs.copyFileSync(
        SCRIPT_PATH,
        path.join(qaDirectory, "phase-label-boundaries.mjs"),
      );
      for (const name of [
        "agents-size.sh", "db-guard.sh", "error-code-sync.sh", "error-codes.sh",
      ]) {
        fs.writeFileSync(path.join(qaDirectory, name), "exit 0\n");
      }
      fs.writeFileSync(path.join(root, "scripts/gen-public-contracts.mjs"), "");
      const fast = fs.readFileSync(new URL("./fast.sh", import.meta.url), "utf8");
      const repositoryGuards = fast.match(
        /^qa_fast_repository_guards\(\) \{[\s\S]*?^\}/mu,
      )?.[0];
      assert.ok(repositoryGuards, "fast must expose its repository guard stage");
      return spawnSync("bash", ["-c", [
        "set -euo pipefail",
        'ROOT_DIR="$1"',
        "git() { return 0; }",
        repositoryGuards,
        "qa_fast_repository_guards",
      ].join("\n"), "fast-naming-fixture", root], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      });
    }
    return spawnSync(process.execPath, [SCRIPT_PATH, ...scanPaths], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("rejects full and abbreviated numbered implementation stages", () => {
  for (const content of [
    "Phase" + " 8 simulated closure",
    "reviewed P4" + "-3 chain",
    "P5" + " release candidate",
  ]) {
    const result = runFixture({ "active.md": content });
    assert.equal(result.status, 1, content);
    assert.match(result.stderr, /active implementation labels found/u);
  }
});

test("allows priorities, percentiles, product codes, and technical phases", () => {
  const result = runFixture({
    "active.md": [
      "P0/P1 risks",
      "product P001 and P-001",
      "p50 / p95 / p99 latency",
      "migration phase: status, dry-run, apply",
    ].join("\n"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[phase-label-boundaries\] ok/u);
});

test("rejects project stage versions in active entry points and project origin copy", () => {
  for (const content of [
    "V1" + "SalesOrdersPage",
    "V2" + "_ROUTE_PATHS",
    "formal-" + "v1",
    "erp-" + "v2-sales-orders-page",
    "business-" + "v1-customers",
    "v1-" + "acceptance-plan.mjs",
    "v2-local-" + "acceptance-plan",
    "旧项目" + "与外部规划",
    "旧项目" + "只作迁移背景",
  ]) {
    const result = runFixture({ "active.md": content });
    assert.equal(result.status, 1, content);
  }

  const result = runFixture({
    ["web/src/pages/V1" + "SalesOrdersPage.jsx"]: "export default null;",
  });
  assert.equal(result.status, 1, result.stderr);
});

test("preserves protocol, release, data format and business versions", () => {
  const result = runFixture({
    "active.md": [
      "server/api/jsonrpc/v1",
      "workflow.task-mutation-result/v1 and WorkflowSourceTaskContractV1",
      "plush.release-manifest/v2 and v1.2.3",
      "plush-toy-erp-v5 is a recorded deployment identity",
      "PLUSH_SEW_HAND_V1 / route_version=1",
      "BOM V1 and V2",
      "SalesOrdersPage and BUSINESS_ROUTE_PATHS",
      "2026.09.27-v8 is a frozen simulated dataset identity",
      "plush.execution-receipt/v3 is a serialized format identifier",
      "decodeEnvelopeV2 and GitLabV4Client are format and external protocol names",
    ].join("\n"),
  });
  assert.equal(result.status, 0, result.stderr);
});

test("rejects module version prefixes, infixes, suffixes and module paths", () => {
  for (const name of [
    "V0" + "InventoryPanel",
    "InventoryV2" + "Helper",
    "InventoryService" + "V3",
    "buildCatalog" + "V12",
    "V2" + "Runner",
  ]) {
    const result = runFixture({ "module.mjs": `export const ${name} = {};` });
    assert.equal(result.status, 1, name);
  }
  for (const file of [
    "web/src/pages/SalesOrdersPage" + "V3.jsx",
    "scripts/v2-inventory-" + "runner.mjs",
    "scripts/inventory-helper-" + "v4.mjs",
    "web/src/components/" + "v2/Inventory.jsx",
  ]) {
    const result = runFixture({ [file]: "export default {};" });
    assert.equal(result.status, 1, file);
    assert.match(result.stderr, /forbidden phase label in file path/u);
  }

  const allowed = runFixture({
    "server/api/jsonrpc/v1/service.go": "package v1",
    "scripts/receipt-v2.mjs": 'export const schemaVersion = "plush.receipt/v2";',
    "web/src/components/InventoryPanel.jsx": "export default {};",
  });
  assert.equal(allowed.status, 0, allowed.stderr);
});

test("rejects implementation counters in config keys, maturity labels and test descriptions", () => {
  for (const content of [
    "existing_" + "v1_snapshot",
    "existing_" + "v12_snapshot",
    "workflow_" + "v1_page",
    "workflow-" + "v4-page",
    "runtime_" + "v0",
    "runtime_" + "v12",
    "Workflow V2 " + "page",
    "V1 " + "masterdata",
  ]) {
    const result = runFixture({ "config.mjs": `export const key = "${content}";` });
    assert.equal(result.status, 1, content);
  }

  const result = runFixture({
    "config.mjs": [
      'export const reviewQueue = "existing_model_snapshot";',
      'export const uiEntry = "workflow_page";',
      'export const maturity = "runtime_available";',
      'export const runtimeKind = "plush.dev-runtime-status";',
      'export const workflowReceipt = "workflow.task-mutation-result/v1";',
      'export const configRevision = "yoyoosun-customer-package-v8.local-0123456789abcdef.runtime-v1";',
    ].join("\n"),
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fast repository guards actually reject invalid names and accept valid names", () => {
  const invalid = runFixture(
    { "page.jsx": "export const InventoryPanel" + "V3 = {};" },
    [],
    { throughFast: true },
  );
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stderr, /active implementation labels found/u);

  const valid = runFixture(
    { "page.jsx": "export const InventoryPanel = {};" },
    [],
    { throughFast: true },
  );
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  assert.match(valid.stdout, /mode=repository/u);
});

test("rejects presentation revisions and redundant internal catalog counters, including HTML", () => {
  for (const content of [
    "<title>统一界面交互评审稿 " + "V8</title>",
    "统一 UI " + "V12",
    "erp-prototype-" + "v8-density",
    "V2 " + "purchase order 候选",
    "V8 " + "客户配置",
    "existing V1 " + "snapshot",
    "现有 V1 " + "样本",
    "V1 " + "currency set",
    "dev-business-chain-catalog/" + "v3",
    "dev-flow-state-catalog/" + "v2",
    "dev-fact-ledger-catalog/" + "v1",
    "dev-business-chain-customer-review/" + "v2",
  ]) {
    const result = runFixture({ "prototype.html": content });
    assert.equal(result.status, 1, content);
  }

  const result = runFixture({
    "prototype.html": "<title>统一界面交互评审稿</title><p>BOM V3 · 包装 V2</p>",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("ignores historical and generated paths", () => {
  const historicalFingerprint = [
    "a971d7d96da1c27c05244542ee220e85615f57d3:scripts/qa/pha",
    "se11-private-deployment-closure.test.mjs:generic-api-key:14",
  ].join("");
  const result = runFixture({
    ".gitleaksignore": historicalFingerprint,
    ["docs/archive/phase" + "8-history.md"]:
      "Phase" + " 8 historical evidence",
    "web/node_modules/example/index.js": "const phase = 2;",
    ["server/bin/seed-phase" + "7"]:
      "Phase" + " 7 generated binary fixture",
  });
  assert.equal(result.status, 0, result.stderr);

  const activeResult = runFixture({ "active.md": historicalFingerprint });
  assert.equal(activeResult.status, 1, activeResult.stdout);
  assert.match(activeResult.stderr, /active implementation labels found/u);
});

test("ignores extensionless binary artifacts", () => {
  const result = runFixture({
    server: Buffer.concat([
      Buffer.from([0]),
      Buffer.from("Phase" + " 8 binary payload"),
    ]),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[phase-label-boundaries\] ok/u);
});

test("affected mode scans only the explicitly changed files", () => {
  const result = runFixture(
    {
      "changed.md": "capability-led delivery",
      "unrelated.md": "Phase" + " 8 historical planning residue",
    },
    ["changed.md"],
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mode=affected files=1/u);

  const rejected = runFixture(
    {
      "changed.md": "Phase" + " 8 active label",
      "unrelated.md": "capability-led delivery",
    },
    ["changed.md"],
  );
  assert.equal(rejected.status, 1);
});

test("affected mode rejects paths outside the repository", () => {
  const result = runFixture({ "changed.md": "safe" }, ["../outside.md"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must stay inside the repository/u);
});

test("rejects hand-maintained package identities and startup predecessor windows", () => {
  for (const [file, source] of [
    ["config/customers/example/customerPackage.mjs", 'export const config = { packageKey: "example-customer-package-v12" };'],
    ["config/catalog/customerPackageCatalog.mjs", 'export const catalog = { catalogKey: "customer-package-catalog-v2" };'],
    ["server/internal/manualacceptance/contract.json", '{ "previousConfigRevision": "hand-maintained" }'],
    ["server/internal/customertrialconfig/guard.go", 'var PreviousActiveRevision = "hand-maintained"'],
  ]) {
    const result = runFixture({ [file]: source });
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
  const allowed = runFixture({
    "config/customers/example/customerPackage.mjs": 'export const config = { packageKey: "example-customer-package" };',
    "receipt.json": '{ "schemaVersion": "plush.release-manifest/v2", "revision": "historical-package-v12" }',
  });
  assert.equal(allowed.status, 0, allowed.stderr);
});

test("rejects transient DEV response counters while preserving persisted formats", () => {
  for (const surface of ["qa-testing-summary", "data-preparation-action-result", "delivery-session", "customer-config-session"]) {
    const result = runFixture({
      "web/dev-server/plugin.mjs": `export const response = { schemaVersion: 'plush.dev-${surface}/` + "v2' };",
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
  const allowed = runFixture({
    "response.mjs": "export const response = { kind: 'plush.dev-qa-testing-summary' };",
    "operation.json": '{ "schemaVersion": "plush.dev-qa-testing-operation/v1" }',
    "receipt.json": '{ "schemaVersion": "plush.remote-promotion-receipt/v5" }',
  });
  assert.equal(allowed.status, 0, allowed.stderr);
});


test("rejects unregistered DEV formats including new response names while preserving stored contracts", () => {
  for (const name of ["qa-testing-plan", "database-migration-tools", "pressure-reports", "qa-testing-operation-public", "data-environment-contract", "runtime-status", "future-response"]) {
    const result = runFixture({"response.mjs": `export const schema = "plush.dev-${name}/v${2}";`});
    assert.equal(result.status, 1, name);
  }
  const accepted = runFixture({"stored.mjs": [
    'export const operation = "plush.dev-qa-testing-operation/v1";',
    'export const readback = "plush.dev-data-preparation-readback/v1";',
    'export const kind = "plush.dev-qa-testing-plan";',
  ].join("\n")});
  assert.equal(accepted.status, 0, accepted.stderr);
});


test("rejects DEV governance counters outside the dev namespace", () => {
  for (const name of ["catalog", "governance", "gap-analysis"]) {
    const result = runFixture({"governance.mjs": `export const schema = "plush.quality-gate-${name}/v${2}";`});
    assert.equal(result.status, 1, name);
  }
});
