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
  LOCAL_TEST_APPLY_PURPOSE,
  RUNTIME_PAGE_KEYS,
  buildLocalTestApplyRuntimeManifest,
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

test("customer-config-runtime-manifest: local test apply is content-addressed and isolated from formal release", () => {
  const first = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);
  const second = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);

  assert.equal(first.manifest_status, "runtime_compile_ready");
  assert.equal(first.runtime_enabled, true);
  assert.equal(first.publishable, true);
  assert.equal(first.product_version, "local-customer-package-test-apply");
  assert.equal(first.compiled_snapshot.applyPurpose, LOCAL_TEST_APPLY_PURPOSE);
  assert.equal(first.compiled_snapshot.package.status, "draft");
  assert.equal(first.compiled_snapshot.package.runtimeEnabled, false);
  assert.equal(first.compiled_snapshot.package.previewOnly, true);
  assert.equal(first.compiled_snapshot.package.publishEnabled, false);
  assert.match(
    first.revision,
    /^yoyoosun-customer-package-v7\.local-[a-f0-9]{16}\.runtime-v1$/u,
  );
  assert.equal(second.revision, first.revision);
  assert(first.revision.length <= 64);
  assert.deepEqual(second, first);
  validateRuntimeManifest(first, {
    publishable: true,
    purpose: LOCAL_TEST_APPLY_PURPOSE,
  });
  assert.throws(
    () => validateRuntimeManifest(first),
    /revision must be namespaced|product_version must match|local test apply purpose/u,
  );

  const changedPackage = structuredClone(yoyoosunCustomerPackage);
  changedPackage.label = `${changedPackage.label} 本地变更`;
  const changed = buildLocalTestApplyRuntimeManifest(changedPackage);
  assert.notEqual(changed.revision, first.revision);
});

test("customer-config-runtime-manifest: local test apply requires tracked opt-in", () => {
  const disabled = structuredClone(yoyoosunCustomerPackage);
  disabled.sourcePolicy.localTestApplyEnabled = false;
  assert.throws(
    () => buildLocalTestApplyRuntimeManifest(disabled),
    /explicitly enabled tracked customer package/u,
  );
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
  assert.equal(yoyoosunMenuConfig.desktopMenu.presentation, "role_guided");
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
  assert.deepEqual(yoyoosunMenuConfig.desktopMenu.hiddenItemKeys, []);
  for (const key of [
    "business-dashboard",
    "shipping-release",
  ]) {
    assert(manifest.compiled_snapshot.pages.includes(key));
  }
  assert(
    manifest.compiled_snapshot.rolePageProjections.boss.includes(
      "business-dashboard",
    ),
  );
  assert(
    manifest.compiled_snapshot.rolePageProjections.pmc.includes(
      "business-dashboard",
    ),
  );
  assert(
    manifest.compiled_snapshot.rolePageProjections.warehouse.includes(
      "shipping-release",
    ),
  );
  for (const [pageKey, expectedOwners] of [
    ["business-dashboard", ["boss", "pmc"]],
    ["shipping-release", ["warehouse"]],
  ]) {
    const owners = Object.entries(
      manifest.compiled_snapshot.rolePageProjections,
    )
      .filter(([, pageKeys]) => pageKeys.includes(pageKey))
      .map(([roleKey]) => roleKey)
      .sort();
    assert.deepEqual(owners, expectedOwners);
  }
  assert.equal(manifest.module_states.length, customerPackageCatalog.modules.length);
  assert.equal(
    new Set(manifest.module_states.map((item) => item.module_key)).size,
    manifest.module_states.length,
  );
});

test("customer-config-runtime-manifest: finance and quality can reach outsourcing source actions without cross-domain mutations", () => {
  const manifest = buildRuntimeManifest();
  const pages = manifest.compiled_snapshot.rolePageProjections;
  const entitlementsFor = (roleKey) =>
    new Set(
      manifest.access_entitlements
        .filter((item) => item.role_key === roleKey)
        .map((item) => item.capability_key),
    );

  assert(pages.finance.includes("processing-contracts"));
  assert(pages.quality.includes("processing-contracts"));
  assert(pages.quality.includes("shipments"));

  const finance = entitlementsFor("finance");
  for (const key of [
    "outsourcing.order.read",
    "outsourcing.fact.read",
    "quality.inspection.read",
    "finance.invoice.read",
    "finance.invoice.confirm",
    "finance.reconciliation.read",
    "finance.reconciliation.confirm",
  ]) {
    assert(finance.has(key), `finance must receive ${key}`);
  }
  assert(!finance.has("outsourcing.order.update"));
  assert(!finance.has("quality.inspection.create"));

  const quality = entitlementsFor("quality");
  for (const key of [
    "outsourcing.order.read",
    "outsourcing.fact.read",
    "shipment.read",
    "quality.inspection.create",
  ]) {
    assert(quality.has(key), `quality must receive ${key}`);
  }
  assert(!quality.has("outsourcing.order.update"));
  assert(!quality.has("shipment.ship"));
  assert(!quality.has("shipment.cancel"));
  assert(!quality.has("finance.payable.confirm"));
});

test("customer-config-runtime-manifest: source action projections stay within Product Core role boundaries", () => {
  const manifest = buildRuntimeManifest();
  const pages = manifest.compiled_snapshot.rolePageProjections;
  const entitlementsFor = (roleKey) =>
    new Set(
      manifest.access_entitlements
        .filter((item) => item.role_key === roleKey)
        .map((item) => item.capability_key),
    );

  const productionMenu = yoyoosunMenuConfig.desktopMenu.sections.find(
    (section) => section.title === "生产管理",
  );
  assert(productionMenu?.items.includes("production-orders"));

  assert(pages.sales.includes("sales-orders"));
  assert(pages.sales.includes("production-orders"));
  assert(entitlementsFor("sales").has("stock.reservation.create"));
  assert(entitlementsFor("sales").has("sales_order.cancel"));
  assert(entitlementsFor("sales").has("contact.disable"));
  assert(entitlementsFor("sales").has("contact.set_primary"));
  assert(entitlementsFor("sales").has("production.wip.read"));
  assert(
    entitlementsFor("sales").has("production.packaging_material.confirm"),
  );
  assert(!entitlementsFor("sales").has("pmc.plan.read"));
  assert(!entitlementsFor("sales").has("production.wip.assign"));

  assert(pages.quality.includes("inbound"));
  const quality = entitlementsFor("quality");
  assert(quality.has("purchase.return.read"));
  assert(quality.has("purchase.return.create"));
  assert(quality.has("production.wip.read"));

  assert(pages.pmc.includes("production-progress"));
  assert(entitlementsFor("pmc").has("production.fact.read"));
  assert(entitlementsFor("pmc").has("production.wip.read"));

  assert(pages.warehouse.includes("inbound"));
  const warehouse = entitlementsFor("warehouse");
  for (const key of [
    "purchase.return.read",
    "purchase.return.create",
    "purchase.return.post",
    "purchase.return.cancel",
    "purchase.receipt.adjustment.read",
    "purchase.receipt.adjustment.create",
    "purchase.receipt.adjustment.post",
    "purchase.receipt.adjustment.cancel",
  ]) {
    assert(warehouse.has(key), `warehouse must receive ${key}`);
  }

  const purchase = entitlementsFor("purchase");
  assert(purchase.has("contact.disable"));
  assert(purchase.has("contact.set_primary"));
  for (const key of [
    "purchase.return.read",
    "purchase.return.create",
    "purchase.return.post",
    "purchase.return.cancel",
    "purchase.receipt.adjustment.read",
    "purchase.receipt.adjustment.create",
    "purchase.receipt.adjustment.post",
    "purchase.receipt.adjustment.cancel",
  ]) {
    assert(purchase.has(key), `purchase must receive ${key}`);
  }

  assert(pages.production.includes("production-orders"));
  assert(pages.production.includes("processing-contracts"));
  const production = entitlementsFor("production");
  for (const key of [
    "production.fact.read",
    "production.wip.read",
    "production.wip.assign",
    "production.wip.execute",
    "production.wip.rework",
    "production.completion.create",
    "production.material_issue.create",
    "production.rework.create",
    "production.fact.post",
    "production.fact.cancel",
    "outsourcing.fact.read",
    "outsourcing.material_issue.create",
    "outsourcing.return_receipt.create",
    "outsourcing.fact.post",
    "outsourcing.fact.cancel",
  ]) {
    assert(production.has(key), `production must receive ${key}`);
  }

  const finance = entitlementsFor("finance");
  assert(pages.finance.includes("inbound"));
  assert(finance.has("purchase.receipt.read"));
  assert(!finance.has("purchase.receipt.create"));
  assert(!finance.has("purchase.receipt.adjustment.read"));
  assert(!finance.has("purchase.receipt.adjustment.create"));
  assert(!finance.has("warehouse.inbound.read"));
  assert(!finance.has("warehouse.inbound.confirm"));
  assert(!finance.has("purchase.return.read"));
  assert(!finance.has("purchase.return.create"));
});

test("customer-config-runtime-manifest: production orders use PMC-read or WIP-read page access", () => {
  const page = customerPackageCatalog.pages.find(
    (item) => item.key === "production-orders",
  );
  assert.deepEqual(page.requiredCapabilityKeys, []);
  assert.deepEqual(page.requiredAnyCapabilityKeys, [
    "pmc.plan.read",
    "production.wip.read",
  ]);

  const withoutEither = structuredClone(yoyoosunCustomerPackage);
  const sales = withoutEither.roleProfiles.find(
    (profile) => profile.roleKey === "sales",
  );
  sales.capabilityKeys = sales.capabilityKeys.filter(
    (key) => key !== "production.wip.read",
  );
  assert.throws(
    () => buildRuntimeManifest(withoutEither),
    /sales page production-orders does not satisfy its required capability contract/u,
  );
});

test("customer-config-runtime-manifest: finance pages use exact family read capabilities", () => {
  const pageCapabilities = new Map(
    customerPackageCatalog.pages.map((page) => [
      page.key,
      page.requiredCapabilityKeys,
    ]),
  );
  assert.deepEqual(pageCapabilities.get("invoices"), ["finance.invoice.read"]);
  assert.deepEqual(pageCapabilities.get("reconciliation"), [
    "finance.reconciliation.read",
  ]);
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
