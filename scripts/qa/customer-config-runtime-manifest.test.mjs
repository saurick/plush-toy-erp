import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { referenceCustomerPackage } from "../../config/customers/reference-customer/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { yoyoosunMenuConfig } from "../../config/customers/yoyoosun/menuConfig.mjs";
import { getNavigationSections } from "../../web/src/erp/config/seedData.mjs";
import {
  RUNTIME_PAGE_KEYS,
  buildRuntimeManifest as compileRuntimeManifest,
  buildRuntimePreviewManifest,
  runCustomerConfigRuntimeManifest,
  runCustomerConfigRuntimeManifestMany,
  validateRuntimeManifest,
} from "./customer-config-runtime-manifest.mjs";

const runtimeManifestSource = readFileSync(
  new URL("./customer-config-runtime-manifest.mjs", import.meta.url),
  "utf8",
);

function releaseReadyPackage(config) {
  return {
    ...config,
    status: "release_ready",
    runtimeEnabled: true,
    sourcePolicy: {
      ...config.sourcePolicy,
      previewOnly: false,
      publishEnabled: true,
    },
  };
}

function buildRuntimeManifest(config = yoyoosunCustomerPackage) {
  return compileRuntimeManifest(releaseReadyPackage(config));
}

function navigationPageKeys() {
  return getNavigationSections().flatMap((section) =>
    section.items.map((item) => item.key),
  );
}

function selectionByProcess(manifest, processKey) {
  return manifest.compiled_snapshot.runtimeProcessSelections.find(
    (selection) => selection.process_key === processKey,
  );
}

function assertSelectionOnlyManifest(manifest) {
  assert.equal(manifest.compiled_snapshot.processDefinitions, undefined);
  for (const selection of manifest.compiled_snapshot.runtimeProcessSelections) {
    assert.deepEqual(Object.keys(selection).sort(), [
      "business_ref_type",
      "process_key",
      "process_version",
      "variant_key",
    ]);
  }
}

test("customer-config-runtime-manifest: runtime page allowlist follows desktop navigation truth", () => {
  assert.deepEqual(RUNTIME_PAGE_KEYS, navigationPageKeys());
  assert(RUNTIME_PAGE_KEYS.includes("sales-orders"));
  assert(RUNTIME_PAGE_KEYS.includes("permission-center"));
  assert(RUNTIME_PAGE_KEYS.includes("system-audit-logs"));
  assert(!RUNTIME_PAGE_KEYS.includes("help-center"));
  assert(!RUNTIME_PAGE_KEYS.includes("operations-facts"));
});

test("customer-config-runtime-manifest: formal compile rejects every tracked draft package", () => {
  for (const config of [
    demoCustomerPackage,
    referenceCustomerPackage,
    yoyoosunCustomerPackage,
  ]) {
    assert.equal(config.status, "draft");
    assert.equal(config.runtimeEnabled, false);
    assert.equal(config.sourcePolicy.previewOnly, true);
    assert.equal(config.sourcePolicy.publishEnabled, false);
    assert.throws(
      () => compileRuntimeManifest(config),
      /formal runtime compile requires a release-ready package with runtime and publish enabled/,
    );
  }
});

test("customer-config-runtime-manifest: preview stays explicitly non-publishable", () => {
  const manifest = buildRuntimePreviewManifest(yoyoosunCustomerPackage);

  assert.equal(manifest.publishable, false);
  assert.equal(manifest.runtime_enabled, false);
  assert.equal(manifest.manifest_status, "preview_only");
  assert.equal(manifest.compiled_snapshot.package.status, "draft");
  assert.equal(manifest.compiled_snapshot.package.runtimeEnabled, false);
  assert.equal(manifest.compiled_snapshot.package.previewOnly, true);
  assert.equal(manifest.compiled_snapshot.package.publishEnabled, false);
  assertSelectionOnlyManifest(manifest);
  validateRuntimeManifest(manifest, { publishable: false });
});

test("customer-config-runtime-manifest: formal payload publishes versions and selection identifiers only", () => {
  const manifest = buildRuntimeManifest();

  assert.equal(manifest.manifest_schema_version, "customer-config-manifest/v1");
  assert.equal(manifest.process_contract_version, "customer-process-contract/v1");
  assert.equal(manifest.publishable, true);
  assert.equal(manifest.runtime_enabled, true);
  assert.equal(manifest.manifest_status, "runtime_compile_ready");
  assert.equal(manifest.customer_key, "yoyoosun");
  assert.equal(
    manifest.revision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );
  assert.equal(manifest.product_version, "local-customer-package");
  assert.equal(manifest.compiled_snapshot.package.status, "release_ready");
  assert.equal(manifest.compiled_snapshot.package.runtimeEnabled, true);
  assert.equal(manifest.compiled_snapshot.package.previewOnly, false);
  assert.equal(manifest.compiled_snapshot.package.publishEnabled, true);
  assertSelectionOnlyManifest(manifest);
  assert.deepEqual(
    manifest.compiled_snapshot.runtimeProcessSelections.map(
      (selection) => selection.process_key,
    ),
    [
      "sales_order_acceptance",
      "material_supply",
      "finished_goods_delivery",
    ],
  );
  validateRuntimeManifest(manifest);
});

test("customer-config-runtime-manifest: customer package cannot publish runtime node graphs", () => {
  for (const forbiddenName of [
    "findWorkflow",
    "findWorkflowNode",
    "salesOrderAcceptanceProcessDefinitionFromPackage",
    "materialSupplyProcessDefinitionFromPackage",
    "finishedGoodsDeliveryProcessDefinitionFromPackage",
    "processDefinitionsFromPackage",
    "validateProcessDefinitions",
  ]) {
    assert.doesNotMatch(runtimeManifestSource, new RegExp(`function ${forbiddenName}\\b`, "u"));
  }

  const manifest = buildRuntimeManifest();
  const injectedGraph = structuredClone(manifest);
  injectedGraph.compiled_snapshot.processDefinitions = {
    sales_order_acceptance: { nodes: [] },
  };
  assert.throws(
    () => validateRuntimeManifest(injectedGraph),
    /must not publish customer-defined process node graphs/,
  );
});

test("customer-config-runtime-manifest: yoyoosun selects registered Product Core variants", () => {
  const manifest = buildRuntimeManifest();

  assert.deepEqual(selectionByProcess(manifest, "sales_order_acceptance"), {
    process_key: "sales_order_acceptance",
    process_version: "v1",
    variant_key: "approval_engineering_pmc",
    business_ref_type: "sales_order",
  });
  assert.deepEqual(selectionByProcess(manifest, "material_supply"), {
    process_key: "material_supply",
    process_version: "v1",
    variant_key: "purchase_receipt_iqc_inbound",
    business_ref_type: "purchase_order",
  });
  assert.deepEqual(selectionByProcess(manifest, "finished_goods_delivery"), {
    process_key: "finished_goods_delivery",
    process_version: "v1",
    variant_key: "quality_finance_ship_receivable",
    business_ref_type: "shipment",
  });
});

test("customer-config-runtime-manifest: demo and yoyoosun may select different registered variants", () => {
  const demoManifest = buildRuntimeManifest(demoCustomerPackage);
  const yoyoosunManifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  assert.equal(
    selectionByProcess(demoManifest, "sales_order_acceptance").variant_key,
    "approval_pmc",
  );
  assert.equal(
    selectionByProcess(yoyoosunManifest, "sales_order_acceptance").variant_key,
    "approval_engineering_pmc",
  );
  assertSelectionOnlyManifest(demoManifest);
  assertSelectionOnlyManifest(yoyoosunManifest);
});

test("customer-config-runtime-manifest: reviewed reference clone compiles one bounded process selection", () => {
  const manifest = compileRuntimeManifest(
    releaseReadyPackage(referenceCustomerPackage),
  );

  assert.equal(referenceCustomerPackage.status, "draft");
  assert.equal(referenceCustomerPackage.runtimeEnabled, false);
  assert.equal(manifest.publishable, true);
  assert.deepEqual(
    manifest.compiled_snapshot.runtimeProcessSelections.map(
      (selection) => selection.process_key,
    ),
    ["sales_order_acceptance"],
  );
  assert.equal(
    manifest.work_pool_memberships.find(
      (membership) => membership.pool_key === "order_review",
    )?.role_key,
    "sales",
  );
  assert.equal(
    manifest.compiled_snapshot.fieldPolicies["suppliers.default"]
      .supplier_type.visible,
    false,
  );
});

test("customer-config-runtime-manifest: accepts registered subsets and rejects unknown or duplicate selections", () => {
  const manifest = buildRuntimeManifest();

  const unknownVariant = structuredClone(manifest);
  unknownVariant.compiled_snapshot.runtimeProcessSelections[0].variant_key =
    "customer_defined_graph";
  assert.throws(
    () => validateRuntimeManifest(unknownVariant),
    /variant_key is not registered/,
  );

  const duplicate = structuredClone(manifest);
  duplicate.compiled_snapshot.runtimeProcessSelections[1].process_key =
    "sales_order_acceptance";
  assert.throws(
    () => validateRuntimeManifest(duplicate),
    /process_key must not be duplicated/,
  );

  const missing = structuredClone(manifest);
  missing.compiled_snapshot.runtimeProcessSelections.pop();
  validateRuntimeManifest(missing);

  const selectionFree = structuredClone(manifest);
  selectionFree.compiled_snapshot.runtimeProcessSelections = [];
  validateRuntimeManifest(selectionFree);
});

test("customer-config-runtime-manifest: visible menu pages and module states compile from bounded catalogs", () => {
  const manifest = buildRuntimeManifest();
  const hidden = new Set(yoyoosunMenuConfig.desktopMenu.hiddenItemKeys);
  const visibleMenuKeys = yoyoosunMenuConfig.desktopMenu.sections
    .flatMap((section) => section.items)
    .filter((key) => !hidden.has(key));

  for (const key of visibleMenuKeys) {
    assert(
      manifest.compiled_snapshot.pages.includes(key),
      `visible yoyoosun menu page must be published: ${key}`,
    );
  }
  assert.equal(manifest.module_states.length, customerPackageCatalog.modules.length);
  assert.equal(
    new Set(manifest.module_states.map((item) => item.module_key)).size,
    manifest.module_states.length,
  );
});

test("customer-config-runtime-manifest: responsibility pools map through roles and entitlements, not graph ownership", () => {
  const demoManifest = buildRuntimeManifest(demoCustomerPackage);
  const yoyoosunManifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const demoOrderReview = demoManifest.work_pool_memberships.find(
    (membership) => membership.pool_key === "order_review",
  );
  const yoyoosunOrderReview = yoyoosunManifest.work_pool_memberships.find(
    (membership) => membership.pool_key === "order_review",
  );

  assert.equal(
    demoManifest.compiled_snapshot.workPoolRoleOverrides.order_review,
    "sales",
  );
  assert.equal(demoOrderReview?.role_key, "sales");
  assert.equal(yoyoosunOrderReview?.role_key, "pmc");
  assert(
    demoManifest.access_entitlements.some(
      (item) =>
        item.role_key === "sales" &&
        item.capability_key === "workflow.task.complete" &&
        item.scope_value === "demo",
    ),
  );
  assert(
    yoyoosunManifest.access_entitlements.some(
      (item) =>
        item.role_key === "pmc" &&
        item.capability_key === "workflow.task.complete" &&
        item.scope_value === "yoyoosun",
    ),
  );
});

test("customer-config-runtime-manifest: only current field-policy surfaces are published", () => {
  const manifest = buildRuntimeManifest();
  const fieldPolicies = manifest.compiled_snapshot.fieldPolicies;

  assert.deepEqual(Object.keys(fieldPolicies).sort(), [
    "customers.default",
    "sales_orders.default",
    "suppliers.default",
  ]);
  assert.deepEqual(Object.keys(fieldPolicies["customers.default"]).sort(), [
    "customer_code",
    "display_name",
  ]);
  assert.deepEqual(Object.keys(fieldPolicies["suppliers.default"]).sort(), [
    "supplier_code",
    "supplier_type",
  ]);
  assert.deepEqual(Object.keys(fieldPolicies["sales_orders.default"]).sort(), [
    "expected_ship_date",
    "order_no",
    "source_no",
  ]);
});

test("customer-config-runtime-manifest: flow, policy and extension catalogs stay preview-only", () => {
  const manifest = buildRuntimeManifest();
  const { flowCatalog, policyCatalog, extensionPointCatalog } =
    manifest.compiled_snapshot;

  assert.equal(flowCatalog.runtime_enabled, false);
  assert.equal(flowCatalog.catalog_status, "preview_only");
  assert(flowCatalog.business_flows.every((item) => item.status === "preview_only"));
  assert(flowCatalog.state_machines.every((item) => item.status === "preview_only"));
  assert.equal(policyCatalog.runtime_enabled, false);
  assert.equal(policyCatalog.catalog_status, "preview_only");
  assert(policyCatalog.process_policies.every((item) => item.runtime_enabled === false));
  assert.equal(extensionPointCatalog.runtime_enabled, false);
  assert.equal(extensionPointCatalog.handler_allowed, false);
  assert.equal(extensionPointCatalog.customer_package_handler_allowed, false);
  validateRuntimeManifest(manifest);

  const executablePolicy = structuredClone(manifest);
  executablePolicy.compiled_snapshot.policyCatalog.runtime_enabled = true;
  assert.throws(
    () => validateRuntimeManifest(executablePolicy),
    /policyCatalog must not enable arbitrary policy execution/,
  );

  const executableExtension = structuredClone(manifest);
  executableExtension.compiled_snapshot.extensionPointCatalog.handler_allowed = true;
  assert.throws(
    () => validateRuntimeManifest(executableExtension),
    /extensionPointCatalog must not allow executable handlers/,
  );
});

test("customer-config-runtime-manifest: entitlement and pool references fail closed", () => {
  const manifest = buildRuntimeManifest();

  const missingRole = structuredClone(manifest);
  missingRole.work_pool_memberships[0].role_key = "customer_unknown_role";
  assert.throws(
    () => validateRuntimeManifest(missingRole),
    /work pool membership references unknown role/,
  );

  const missingPool = structuredClone(manifest);
  missingPool.work_pool_memberships.push({
    ...missingPool.work_pool_memberships[0],
    pool_key: "customer_unknown_pool",
  });
  assert.throws(
    () => validateRuntimeManifest(missingPool),
    /work pool membership references unknown pool/,
  );

  const wrongScope = structuredClone(manifest);
  wrongScope.access_entitlements[0].scope_value = "other-customer";
  assert.throws(
    () => validateRuntimeManifest(wrongScope),
    /scope_value must match customer_key/,
  );
});

test("customer-config-runtime-manifest: forbidden payloads are rejected", () => {
  const manifest = buildRuntimeManifest();
  manifest.compiled_snapshot.secret = "bad";

  assert.throws(
    () => validateRuntimeManifest(manifest),
    /must not embed raw rows, secrets, SQL or executable code payloads/,
  );
});

test("customer-config-runtime-manifest: repeated flags and --all inspect drafts in preview mode", () => {
  const requested = runCustomerConfigRuntimeManifestMany({
    customers: ["yoyoosun", "demo"],
    mode: "preview",
    out: "",
  });
  assert.deepEqual(
    requested.map((result) => result.manifest.customer_key),
    ["yoyoosun", "demo"],
  );
  assert(requested.every((result) => result.manifest.publishable === false));

  const all = runCustomerConfigRuntimeManifestMany({
    all: true,
    customers: [],
    mode: "preview",
    out: "",
  });
  assert.deepEqual(
    all.map((result) => result.manifest.customer_key),
    ["demo", "reference-customer", "yoyoosun"],
  );
});

test("customer-config-runtime-manifest: reference package stays preview-only with one registered responsibility projection", () => {
  const manifest = buildRuntimePreviewManifest(referenceCustomerPackage);

  assert.equal(manifest.publishable, false);
  assert.equal(manifest.runtime_enabled, false);
  assert.deepEqual(manifest.compiled_snapshot.runtimeProcessSelections, [
    {
      process_key: "sales_order_acceptance",
      process_version: "v1",
      variant_key: "approval_pmc",
      business_ref_type: "sales_order",
    },
  ]);
  assert.equal(
    manifest.work_pool_memberships.find(
      (membership) => membership.pool_key === "order_review",
    )?.role_key,
    "sales",
  );
  assert.equal(manifest.compiled_snapshot.processDefinitions, undefined);
  validateRuntimeManifest(manifest, { publishable: false });
});

test("customer-config-runtime-manifest: reference preview compile is byte deterministic", () => {
  const first = JSON.stringify(
    buildRuntimePreviewManifest(referenceCustomerPackage),
  );
  const second = JSON.stringify(
    buildRuntimePreviewManifest(referenceCustomerPackage),
  );

  assert.equal(second, first);
});

test("customer-config-runtime-manifest: preview output is bounded to output directory", async () => {
  const outPath =
    "output/customers/yoyoosun/customer-config-runtime-manifest.test.json";
  rmSync(path.resolve(outPath), { force: true });

  const result = runCustomerConfigRuntimeManifest({
    customer: "yoyoosun",
    mode: "preview",
    out: outPath,
  });
  const payload = JSON.parse(await readFile(path.resolve(outPath), "utf8"));
  assert.equal(result.manifest.revision, payload.revision);
  assert.equal(payload.customer_key, "yoyoosun");
  assert.equal(payload.publishable, false);
  rmSync(path.resolve(outPath), { force: true });

  assert.throws(
    () =>
      runCustomerConfigRuntimeManifest({
        customer: "yoyoosun",
        mode: "preview",
        out: "tmp/customer-config-runtime-manifest.json",
      }),
    /--out must write under output\//,
  );
});

test("customer-config-runtime-manifest: --out cannot be combined with formal compile", () => {
  assert.throws(
    () =>
      runCustomerConfigRuntimeManifest({
        customer: "yoyoosun",
        mode: "compile",
        out: "output/customers/yoyoosun/customer-config-runtime-manifest.json",
      }),
    /--out requires --mode preview/,
  );
});

test("customer-config-runtime-manifest: multi-customer preview output is rejected", () => {
  assert.throws(
    () =>
      runCustomerConfigRuntimeManifestMany({
        customers: ["yoyoosun", "demo"],
        mode: "preview",
        out: "output/customers/yoyoosun/customer-config-runtime-manifest.json",
      }),
    /--out only supports one customer runtime manifest/,
  );
});
