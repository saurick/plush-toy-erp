import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { yoyoosunMenuConfig } from "../../config/customers/yoyoosun/menuConfig.mjs";
import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { getNavigationSections } from "../../web/src/erp/config/seedData.mjs";
import {
  RUNTIME_PAGE_KEYS,
  buildRuntimeManifest,
  runCustomerConfigRuntimeManifest,
  runCustomerConfigRuntimeManifestMany,
  validateRuntimeManifest,
} from "./customer-config-runtime-manifest.mjs";

function navigationPageKeys() {
  return getNavigationSections().flatMap((section) =>
    section.items.map((item) => item.key),
  );
}

test("customer-config-runtime-manifest: runtime page allowlist follows desktop navigation truth", () => {
  assert.deepEqual(RUNTIME_PAGE_KEYS, navigationPageKeys());
  assert(RUNTIME_PAGE_KEYS.includes("sales-orders"));
  assert(RUNTIME_PAGE_KEYS.includes("permission-center"));
  assert(RUNTIME_PAGE_KEYS.includes("system-audit-logs"));
  assert(!RUNTIME_PAGE_KEYS.includes("help-center"));
  assert(!RUNTIME_PAGE_KEYS.includes("operations-facts"));
});

test("customer-config-runtime-manifest: publishes every visible yoyoosun menu page", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const hidden = new Set(yoyoosunMenuConfig.desktopMenu.hiddenItemKeys);
  const visibleMenuKeys = yoyoosunMenuConfig.desktopMenu.sections
    .flatMap((section) => section.items)
    .filter((key) => !hidden.has(key));

  for (const key of visibleMenuKeys) {
    assert(
      manifest.compiled_snapshot.pages.includes(key),
      `visible yoyoosun menu page must be published by effective config: ${key}`,
    );
  }
  assert(manifest.compiled_snapshot.pages.includes("system-audit-logs"));
});

test("customer-config-runtime-manifest: customer catalog does not duplicate route paths", () => {
  assert(
    customerPackageCatalog.pages.every((item) => item.path === undefined),
    "page routes must stay owned by the frontend navigation registry",
  );
});

test("customer-config-runtime-manifest: builds publishable JSON-RPC payload shape", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  assert.equal(manifest.customer_key, "yoyoosun");
  assert.equal(
    manifest.revision,
    "yoyoosun-customer-package-v7.runtime-manifest-v1",
  );
  assert.equal(manifest.compiled_snapshot.package.runtimeEnabled, false);
  assert.equal(manifest.compiled_snapshot.package.previewOnly, true);
  assert(manifest.compiled_snapshot.pages.includes("sales-orders"));
  assert.equal(
    manifest.compiled_snapshot.processDefinitions.sales_order_acceptance
      .manifest_status,
    "runtime_loader_ready",
  );
  assert.equal(
    manifest.compiled_snapshot.processDefinitions.sales_order_acceptance
      .runtime_loader_enabled,
    true,
  );
  assert(manifest.compiled_snapshot.pages.includes("material-bom"));
  assert(manifest.compiled_snapshot.pages.includes("processes"));
  assert.equal(
    manifest.module_states.length,
    customerPackageCatalog.modules.length,
  );
  assert(
    manifest.module_states.some(
      (item) => item.module_key === "production_orders",
    ),
  );
  assert(
    manifest.module_states.some((item) => item.module_key === "production"),
  );
  assert.equal(manifest.role_profiles.length, 9);
  assert.equal(manifest.work_pools.length, 19);
  assert.equal(manifest.work_pool_memberships.length, 19);
  assert.equal(manifest.compiled_snapshot.flowCatalog.runtime_enabled, false);
  assert.equal(manifest.compiled_snapshot.policyCatalog.runtime_enabled, false);
  assert.equal(
    manifest.compiled_snapshot.extensionPointCatalog.catalog_status,
    "controlled_empty",
  );
  assert.equal(
    manifest.compiled_snapshot.extensionPointCatalog.implementation_source,
    "registered_deployment_package_required",
  );
  assert.equal(
    manifest.compiled_snapshot.extensionPointCatalog.handler_allowed,
    false,
  );
  assert.equal(
    manifest.compiled_snapshot.extensionPointCatalog
      .customer_package_handler_allowed,
    false,
  );
  assert.equal(
    manifest.compiled_snapshot.printTemplateDefaults.runtime_enabled,
    true,
  );
  assert.equal(
    manifest.compiled_snapshot.printTemplateDefaults.formal_runtime_consumed,
    true,
  );
  assert.equal(
    manifest.compiled_snapshot.printTemplateDefaults
      .sales_order_print_template_enabled,
    false,
  );
  assert.deepEqual(
    manifest.compiled_snapshot.printTemplateDefaults.templates.map((item) => [
      item.template_key,
      item.party_defaults.buyerCompany,
      item.party_defaults.buyerContact,
      item.party_defaults.buyerAddress,
      Object.hasOwn(item.party_defaults, "buyerPhone"),
      Object.hasOwn(item.party_defaults, "buyerSigner"),
      item.runtime_consumed,
      item.supplier_defaults_allowed,
    ]),
    [
      [
        "material-purchase-contract",
        "永绅",
        "采购负责人",
        "东莞-茶山",
        false,
        false,
        true,
        false,
      ],
      [
        "processing-contract",
        "永绅",
        "委外负责人",
        "东莞茶山",
        false,
        false,
        true,
        false,
      ],
    ],
  );
  assert(
    manifest.compiled_snapshot.printTemplateDefaults.templates.every(
      (item) => !Object.values(item.party_defaults).includes("待维护"),
    ),
    "print party defaults must not keep placeholder values",
  );
  assert.deepEqual(
    manifest.compiled_snapshot.extensionPointCatalog.blocked_reasons,
    [
      "no_reviewed_extension_contract",
      "customer_package_handler_forbidden",
      "registered_deployment_package_required",
    ],
  );
  assert(manifest.access_entitlements.length > manifest.role_profiles.length);
  const purchaseCapabilities = manifest.access_entitlements
    .filter((item) => item.role_key === "purchase")
    .map((item) => item.capability_key);
  assert(
    purchaseCapabilities.includes("purchase.order.read"),
    "purchase role must keep purchase order read entitlement",
  );
  assert(
    purchaseCapabilities.includes("material.read"),
    "purchase role must read materials for purchase contract print spec/unit context",
  );
  validateRuntimeManifest(manifest);
});

test("customer-config-runtime-manifest: compiles controlled module state overrides", () => {
  const manifest = buildRuntimeManifest({
    ...demoCustomerPackage,
    moduleStates: Object.freeze([
      Object.freeze({
        moduleKey: "shipments",
        state: "read_only",
        reason: "trial package keeps shipment history visible without writes",
      }),
      Object.freeze({
        moduleKey: "finance",
        state: "disabled",
        reason: "trial package excludes finance operations",
      }),
    ]),
  });
  const moduleStates = new Map(
    manifest.module_states.map((item) => [item.module_key, item]),
  );

  assert.equal(moduleStates.get("shipments")?.state, "read_only");
  assert.equal(
    moduleStates.get("shipments")?.reason,
    "trial package keeps shipment history visible without writes",
  );
  assert.equal(moduleStates.get("finance")?.state, "disabled");
  assert.equal(moduleStates.get("sales_orders")?.state, "enabled");
  validateRuntimeManifest(manifest);
});

test("customer-config-runtime-manifest: compiles neutral demo package without yoyoosun scope", () => {
  const manifest = buildRuntimeManifest(demoCustomerPackage);

  assert.equal(manifest.customer_key, "demo");
  assert.equal(
    manifest.revision,
    "demo-customer-package-v1.runtime-manifest-v1",
  );
  assert.equal(manifest.compiled_snapshot.customer.key, "demo");
  assert(
    manifest.access_entitlements.every((item) => item.scope_value === "demo"),
  );
  assert(manifest.compiled_snapshot.pages.includes("sales-orders"));
  assert.equal(
    manifest.compiled_snapshot.processDefinitions.sales_order_acceptance
      .source_workflow_key,
    "demo_sales_order_review",
  );
  assert.equal(
    manifest.compiled_snapshot.processDefinitions.finished_goods_delivery
      .source_workflow_key,
    "demo_finished_goods_delivery",
  );
  assert.equal(manifest.role_profiles.length, 9);
  validateRuntimeManifest(manifest);
});

test("customer-config-runtime-manifest: repeated customer flags compile every requested package", () => {
  const results = runCustomerConfigRuntimeManifestMany({
    customers: ["yoyoosun", "demo"],
    mode: "compile",
    out: "",
  });

  assert.deepEqual(
    results.map((result) => result.manifest.customer_key),
    ["yoyoosun", "demo"],
  );
  assert.deepEqual(
    results.map((result) => result.manifest.revision),
    [
      "yoyoosun-customer-package-v7.runtime-manifest-v1",
      "demo-customer-package-v1.runtime-manifest-v1",
    ],
  );
  for (const result of results) {
    assert.equal(result.mode, "compile");
    validateRuntimeManifest(result.manifest);
  }
});

test("customer-config-runtime-manifest: proves same responsibility pool can map to different customer roles", () => {
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
  assert.equal(
    demoManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.nodes.find(
      (node) => node.node_key === "order_review",
    )?.owner_pool_key,
    "order_review",
  );
  assert.equal(
    yoyoosunManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.nodes.find(
      (node) => node.node_key === "order_review",
    )?.owner_pool_key,
    "order_review",
  );
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
  validateRuntimeManifest(demoManifest);
  validateRuntimeManifest(yoyoosunManifest);
});

test("customer-config-runtime-manifest: compiles sales order acceptance process definition as controlled loader ready", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const processDefinition =
    manifest.compiled_snapshot.processDefinitions.sales_order_acceptance;

  assert.equal(processDefinition.process_key, "sales_order_acceptance");
  assert.equal(processDefinition.business_ref_type, "sales_order");
  assert.equal(
    processDefinition.domain_boundary,
    "source_document_command_only",
  );
  assert.equal(processDefinition.fact_boundary, "no_fact_posting");
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_key),
    [
      "submit_sales_order",
      "order_approval",
      "engineering_data",
      "order_review",
      "end",
    ],
  );
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_type),
    ["domain_command", "approval", "human_task", "human_task", "end"],
  );
  assert.equal(
    processDefinition.nodes[0].policy_snapshot.command_key,
    "sales_order.submit",
  );
  assert.equal(processDefinition.nodes[0].policy_snapshot.writes_fact, false);
  assert.equal(processDefinition.nodes[1].owner_pool_key, "order_approval");
  assert.equal(processDefinition.nodes[1].source_owner_pool_key, "boss");
  assert.equal(processDefinition.nodes[2].owner_pool_key, "engineering_data");
  assert.equal(processDefinition.nodes[2].source_owner_pool_key, "engineering");
  assert.equal(processDefinition.nodes[3].owner_pool_key, "order_review");
  assert.equal(processDefinition.nodes[3].source_owner_pool_key, "pmc");
  assert(
    manifest.work_pools.some(
      (pool) =>
        pool.pool_key === "order_approval" && pool.source_pool_key === "boss",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "order_review" && membership.role_key === "pmc",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "engineering_data" &&
        membership.role_key === "engineering",
    ),
  );
  assert(
    manifest.access_entitlements.some(
      (item) =>
        item.role_key === "pmc" &&
        item.capability_key === "workflow.task.complete",
    ),
  );
});

test("customer-config-runtime-manifest: compiles material supply as loader-ready process definition", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const processDefinition =
    manifest.compiled_snapshot.processDefinitions.material_supply;

  assert.equal(processDefinition.process_key, "material_supply");
  assert.equal(processDefinition.variant_key, "purchase_receipt_iqc_inbound");
  assert.equal(
    processDefinition.source_workflow_key,
    "purchase_order_approval",
  );
  assert.equal(processDefinition.manifest_status, "runtime_loader_ready");
  assert.equal(processDefinition.runtime_loader_enabled, true);
  assert.equal(processDefinition.business_ref_type, "purchase_order");
  assert.equal(processDefinition.domain_boundary, "explicit_fact_command_api");
  assert.equal(processDefinition.fact_boundary, "no_fact_posting");
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_key),
    ["purchase_receipt_source", "incoming_qc", "warehouse_inbound", "end"],
  );
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_type),
    ["domain_command", "domain_command", "domain_command", "end"],
  );
  assert.deepEqual(
    processDefinition.nodes
      .slice(0, 3)
      .map((node) => [
        node.policy_snapshot.command_key,
        node.policy_snapshot.writes_fact,
        node.policy_snapshot.idempotency_key_required,
      ]),
    [
      ["purchase_receipt.create", false, true],
      ["quality_inspection.aggregate_gate", false, true],
      ["inventory.post_inbound", false, true],
    ],
  );
  assert.deepEqual(
    processDefinition.nodes
      .slice(0, 3)
      .map((node) => [
        node.owner_pool_key,
        node.required_capability_key,
        node.fact_command_contract.command_key,
        node.fact_command_contract.runtime_binding_status,
        node.fact_command_contract.process_runtime_handler_registered,
        node.fact_command_contract.domain_usecase_binding,
        node.fact_command_contract.jsonrpc_method,
        node.fact_command_contract.required_permission_key,
        node.fact_command_contract.writes_fact,
      ]),
    [
      [
        "purchase_receipt_source",
        "purchase.receipt.create",
        "purchase_receipt.create",
        "process_runtime_handler_registered",
        true,
        "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
        "purchase.create_purchase_receipt_from_purchase_order",
        "purchase.receipt.create",
        false,
      ],
      [
        "incoming_qc",
        "quality.inspection.update",
        "quality_inspection.aggregate_gate",
        "process_runtime_handler_registered",
        true,
        "InventoryUsecase.EvaluatePurchaseReceiptQualityGate",
        "customer_config.execute_material_supply_quality_gate",
        "quality.inspection.update",
        false,
      ],
      [
        "warehouse_inbound",
        "warehouse.inbound.confirm",
        "inventory.post_inbound",
        "process_runtime_handler_registered",
        true,
        "InventoryUsecase.PostPurchaseReceipt",
        "purchase.post_purchase_receipt",
        "warehouse.inbound.confirm",
        false,
      ],
    ],
  );
  const inboundContract = processDefinition.nodes.find(
    (node) => node.node_key === "warehouse_inbound",
  ).fact_command_contract;
  const purchaseContract = processDefinition.nodes.find(
    (node) => node.node_key === "purchase_receipt_source",
  ).fact_command_contract;
  const qualityContract = processDefinition.nodes.find(
    (node) => node.node_key === "incoming_qc",
  ).fact_command_contract;
  assert.equal(purchaseContract.process_runtime_handler_registered, true);
  assert(
    purchaseContract.required_test_anchors.some((item) =>
      item.includes(
        "TestPurchaseReceiptProcessDomainCommandCreateBindsUsecase",
      ),
    ),
  );
  assert.equal(
    purchaseContract.runtime_loader_blockers.includes(
      "domain_command_handler_not_registered",
    ),
    false,
  );
  assert.deepEqual(purchaseContract.runtime_loader_blockers, []);
  assert.equal(qualityContract.process_runtime_handler_registered, true);
  assert(
    qualityContract.required_test_anchors.some((item) =>
      item.includes(
        "TestIncomingQualityGateProcessDomainCommandPassesOnlyAfterAggregateReady",
      ),
    ),
  );
  assert.equal(
    qualityContract.domain_usecase_binding,
    "InventoryUsecase.EvaluatePurchaseReceiptQualityGate",
  );
  assert.equal(
    qualityContract.jsonrpc_method,
    "customer_config.execute_material_supply_quality_gate",
  );
  assert.equal(qualityContract.writes_fact, false);
  assert.equal(
    qualityContract.runtime_loader_blockers.includes(
      "domain_command_handler_not_registered",
    ),
    false,
  );
  assert.deepEqual(qualityContract.runtime_loader_blockers, []);
  assert.deepEqual(qualityContract.runtime_execute_blockers, []);
  assert.equal(inboundContract.process_runtime_handler_registered, true);
  assert(
    inboundContract.required_test_anchors.some((item) =>
      item.includes("TestInventoryProcessDomainCommandPostInboundBindsUsecase"),
    ),
  );
  assert.equal(
    inboundContract.runtime_loader_blockers.includes(
      "domain_command_handler_not_registered",
    ),
    false,
  );
  assert.deepEqual(inboundContract.runtime_loader_blockers, []);
  assert.deepEqual(inboundContract.jsonrpc_allowed_permission_keys, [
    "purchase.receipt.create",
    "warehouse.inbound.confirm",
  ]);
  assert(
    inboundContract.required_test_anchors.some((item) =>
      item.includes("TestInventoryRepo_PurchaseReceiptLifecycle"),
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "purchase_receipt_source" &&
        membership.role_key === "purchase",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "incoming_qc" &&
        membership.role_key === "quality",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "warehouse_inbound" &&
        membership.role_key === "warehouse",
    ),
  );
});

test("customer-config-runtime-manifest: compiles finished goods delivery as start-only loader", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const processDefinition =
    manifest.compiled_snapshot.processDefinitions.finished_goods_delivery;

  assert.equal(processDefinition.process_key, "finished_goods_delivery");
  assert.equal(
    processDefinition.variant_key,
    "quality_finance_ship_receivable",
  );
  assert.equal(
    processDefinition.source_workflow_key,
    "finished_goods_delivery",
  );
  assert.equal(processDefinition.manifest_status, "runtime_loader_start_ready");
  assert.equal(processDefinition.runtime_loader_enabled, true);
  assert.equal(processDefinition.business_ref_type, "shipment");
  assert.equal(processDefinition.domain_boundary, "contract_preflight_only");
  assert.equal(processDefinition.fact_boundary, "no_fact_posting");
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_key),
    [
      "finished_goods_quality",
      "shipment_finance_release",
      "shipment_execution",
      "receivable_lead",
      "end",
    ],
  );
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_type),
    [
      "domain_command",
      "domain_command",
      "domain_command",
      "domain_command",
      "end",
    ],
  );
  assert.deepEqual(
    processDefinition.nodes
      .slice(0, 4)
      .map((node) => [
        node.owner_pool_key,
        node.required_capability_key,
        node.policy_snapshot.command_key,
        node.policy_snapshot.handler,
        node.policy_snapshot.writes_fact,
        node.fact_command_contract.runtime_binding_status,
        node.fact_command_contract.process_runtime_handler_registered,
        node.fact_command_contract.command_key,
        node.fact_command_contract.required_before_runtime_loader,
        node.fact_command_contract.writes_fact,
        node.fact_command_contract.jsonrpc_method,
      ]),
    [
      [
        "finished_goods_quality",
        "quality.inspection.update",
        "finished_goods_quality.decide",
        "InventoryUsecase.PassQualityInspection/RejectQualityInspection",
        false,
        "process_runtime_handler_registered",
        true,
        "finished_goods_quality.decide",
        false,
        false,
        "customer_config.execute_finished_goods_delivery_quality_decide",
      ],
      [
        "shipment_finance_release",
        "finance.receivable.confirm",
        "shipment.finance_release",
        "OperationalFactUsecase.GetShipment",
        false,
        "process_runtime_handler_registered",
        true,
        "shipment.finance_release",
        false,
        false,
        "customer_config.execute_finished_goods_delivery_finance_release",
      ],
      [
        "shipment_execution",
        "shipment.ship",
        "shipment.ship",
        "OperationalFactUsecase.ShipShipment",
        false,
        "process_runtime_handler_registered",
        true,
        "shipment.ship",
        false,
        false,
        "customer_config.execute_finished_goods_delivery_shipment_ship",
      ],
      [
        "receivable_lead",
        "finance.receivable.confirm",
        "finance.receivable_lead",
        "OperationalFactUsecase.CreateFinanceFactDraft",
        false,
        "process_runtime_handler_registered",
        true,
        "finance.receivable_lead",
        false,
        false,
        "customer_config.execute_finished_goods_delivery_receivable_lead",
      ],
    ],
  );
  for (const node of processDefinition.nodes.slice(0, 4)) {
    assert(node.fact_command_contract.runtime_loader_blockers.length === 0);
    if (
      node.node_key === "finished_goods_quality" ||
      node.node_key === "shipment_finance_release" ||
      node.node_key === "shipment_execution" ||
      node.node_key === "receivable_lead"
    ) {
      assert(
        !node.fact_command_contract.runtime_execute_blockers.includes(
          "domain_command_handler_not_registered",
        ),
      );
    } else {
      assert(
        node.fact_command_contract.runtime_execute_blockers.includes(
          "domain_command_handler_not_registered",
        ),
      );
    }
    if (
      node.node_key === "finished_goods_quality" ||
      node.node_key === "shipment_finance_release" ||
      node.node_key === "shipment_execution" ||
      node.node_key === "receivable_lead"
    ) {
      assert(
        !node.fact_command_contract.runtime_execute_blockers.includes(
          "explicit_runtime_execute_api_not_implemented",
        ),
      );
    } else {
      assert(
        node.fact_command_contract.runtime_execute_blockers.includes(
          "explicit_runtime_execute_api_not_implemented",
        ),
      );
    }
    assert.equal(
      node.fact_command_contract.required_before_runtime_execute,
      true,
    );
    assert.equal(
      node.fact_command_contract.required_test_anchors.length >= 2,
      true,
    );
  }
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "finished_goods_quality" &&
        membership.role_key === "quality",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "shipment_finance_release" &&
        membership.role_key === "finance",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "shipment_execution" &&
        membership.role_key === "warehouse",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "receivable_lead" &&
        membership.role_key === "finance",
    ),
  );
});

test("customer-config-runtime-manifest: publishes only currently consumed field policy surfaces", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const demoManifest = buildRuntimeManifest(demoCustomerPackage);
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
  for (const surface of Object.values(fieldPolicies)) {
    for (const policy of Object.values(surface)) {
      assert.deepEqual(
        policy,
        { visible: true },
        "runtime manifest must not publish unconsumed label/editable/required metadata",
      );
    }
  }
  assert.deepEqual(
    fieldPolicies,
    demoManifest.compiled_snapshot.fieldPolicies,
    "current field policies are Product Core visibility defaults, not a yoyoosun-specific override",
  );
  assert.equal(fieldPolicies["sales_order_items.default"], undefined);
  assert.equal(
    Object.values(fieldPolicies).some((surface) => surface.style_no),
    false,
  );
  assert.equal(
    Object.values(fieldPolicies).some((surface) => surface.color_size),
    false,
  );
});

test("customer-config-runtime-manifest: publishes preview-only flow, policy and extension catalogs", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const { flowCatalog, policyCatalog, extensionPointCatalog } =
    manifest.compiled_snapshot;

  assert.deepEqual(flowCatalog.business_flows.map((flow) => flow.key).sort(), [
    "delivery_to_settlement",
    "production_to_inventory",
    "purchase_to_inventory",
    "sales_to_production",
  ]);
  assert.deepEqual(
    flowCatalog.state_machines.map((stateMachine) => stateMachine.key).sort(),
    [
      "production_order_lifecycle",
      "purchase_order_lifecycle",
      "sales_order_lifecycle",
    ],
  );
  assert.deepEqual(
    policyCatalog.process_policies.map((policy) => policy.key).sort(),
    ["auto_generate_policy", "close_policy", "skip_policy"],
  );
  assert(
    policyCatalog.process_policies.every(
      (policy) =>
        policy.runtime_enabled === false &&
        policy.rule_count > 0 &&
        policy.rules.length === policy.rule_count,
    ),
  );
  assert.deepEqual(policyCatalog.process_policies[0].rules, [
    {
      key: "skip_optional_review_when_unconfigured",
      decision: "manual_review_required",
    },
  ]);
  assert.equal(extensionPointCatalog.runtime_enabled, false);
  assert.equal(extensionPointCatalog.catalog_status, "controlled_empty");
  assert.equal(
    extensionPointCatalog.implementation_source,
    "registered_deployment_package_required",
  );
  assert.equal(extensionPointCatalog.handler_allowed, false);
  assert.equal(extensionPointCatalog.customer_package_handler_allowed, false);
  assert.deepEqual(extensionPointCatalog.blocked_reasons, [
    "no_reviewed_extension_contract",
    "customer_package_handler_forbidden",
    "registered_deployment_package_required",
  ]);
  assert.deepEqual(extensionPointCatalog.extension_points, []);
  validateRuntimeManifest(manifest);
});

test("customer-config-runtime-manifest: rejects empty or unknown page projections", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  const emptyPagesManifest = structuredClone(manifest);
  emptyPagesManifest.compiled_snapshot.pages = [];
  assert.throws(
    () => validateRuntimeManifest(emptyPagesManifest),
    /compiled_snapshot\.pages must not be empty/,
  );

  const unknownPagesManifest = structuredClone(manifest);
  unknownPagesManifest.compiled_snapshot.pages = [
    ...unknownPagesManifest.compiled_snapshot.pages,
    "unknown-page",
  ];
  assert.throws(
    () => validateRuntimeManifest(unknownPagesManifest),
    /compiled_snapshot\.pages contains unsupported page key: unknown-page/,
  );
});

test("customer-config-runtime-manifest: maps customer work pools to backend role keys", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const roleKeys = manifest.role_profiles.map((item) => item.role_key);
  const purchaseMembership = manifest.work_pool_memberships.find(
    (item) => item.pool_key === "purchase",
  );
  const engineeringMembership = manifest.work_pool_memberships.find(
    (item) => item.pool_key === "engineering",
  );
  const engineeringEntitlements = manifest.access_entitlements.filter(
    (item) => item.role_key === "engineering",
  );
  const bossEntitlements = manifest.access_entitlements.filter(
    (item) => item.role_key === "boss",
  );
  const financeEntitlements = manifest.access_entitlements.filter(
    (item) => item.role_key === "finance",
  );

  assert(roleKeys.includes("purchase"));
  assert(roleKeys.includes("engineering"));
  assert.equal(roleKeys.includes("purchasing"), false);
  assert.equal(purchaseMembership.role_key, "purchase");
  assert.equal(engineeringMembership.role_key, "engineering");
  assert(
    engineeringEntitlements.some(
      (item) => item.capability_key === "mobile.engineering.access",
    ),
  );
  assert(
    bossEntitlements.some(
      (item) => item.capability_key === "purchase.order.read",
    ),
  );
  assert(
    bossEntitlements.some(
      (item) => item.capability_key === "purchase.order.approve",
    ),
  );
  assert.equal(
    bossEntitlements.some(
      (item) => item.capability_key === "mobile.engineering.access",
    ),
    false,
  );
  assert.equal(
    financeEntitlements.some((item) =>
      item.capability_key.startsWith("purchase.order."),
    ),
    false,
    "finance role must acquire purchase responsibilities through a second role assignment, not implicit grants",
  );
});

test("customer-config-runtime-manifest: compiles yoyoosun entitlements as the only additive action source", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const profilesByRole = new Map(
    manifest.role_profiles.map((item) => [item.role_key, item]),
  );
  const entitlementsByRole = new Map();
  for (const item of manifest.access_entitlements) {
    const keys = entitlementsByRole.get(item.role_key) || [];
    keys.push(item.capability_key);
    entitlementsByRole.set(item.role_key, keys);
  }

  for (const configured of yoyoosunCustomerPackage.roleProfiles) {
    assert.equal(profilesByRole.get(configured.roleKey)?.grants, undefined);
    assert.deepEqual(profilesByRole.get(configured.roleKey)?.revokes, []);
    assert.deepEqual(
      (entitlementsByRole.get(configured.roleKey) || []).sort(),
      [...configured.capabilityKeys].sort(),
      `${configured.roleKey} entitlements must come from the customer role matrix`,
    );
  }
  assert.deepEqual(
    manifest.compiled_snapshot.rolePageProjections.sales,
    [
      ...yoyoosunCustomerPackage.roleProfiles.find(
        (item) => item.roleKey === "sales",
      ).menuSurfaces,
    ].sort(),
  );
  assert.equal(
    manifest.access_entitlements.some((item) =>
      item.capability_key.startsWith("page."),
    ),
    false,
    "page pseudo-capabilities must not be published as backend permissions",
  );
  assert.equal(
    manifest.access_entitlements.some(
      (item) => item.capability_key === "package.preview",
    ),
    false,
    "catalog preview capabilities must not be published as business permissions",
  );
});

test("customer-config-runtime-manifest: keeps yoyoosun master-data maintenance aligned with Product Core roles", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const capabilitiesByRole = Object.groupBy(
    manifest.access_entitlements,
    (item) => item.role_key,
  );
  assert.deepEqual(
    [
      "customer.create",
      "customer.update",
      "contact.create",
      "contact.update",
    ].filter(
      (capability) =>
        !capabilitiesByRole.sales.some(
          (item) => item.capability_key === capability,
        ),
    ),
    [],
  );
  assert.deepEqual(
    [
      "supplier.create",
      "supplier.update",
      "contact.create",
      "contact.update",
    ].filter(
      (capability) =>
        !capabilitiesByRole.purchase.some(
          (item) => item.capability_key === capability,
        ),
    ),
    [],
  );
  assert.deepEqual(
    ["shipment.create", "shipment.ship", "shipment.cancel"].filter(
      (capability) =>
        !capabilitiesByRole.warehouse.some(
          (item) => item.capability_key === capability,
        ),
    ),
    [],
  );
  assert(
    capabilitiesByRole.pmc.some(
      (item) => item.capability_key === "workflow.task.create",
    ),
  );
});

test("customer-config-runtime-manifest: enforces entitlement and work pool integrity", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  const orphanPoolManifest = structuredClone(manifest);
  orphanPoolManifest.work_pool_memberships =
    orphanPoolManifest.work_pool_memberships.filter(
      (item) => item.pool_key !== "engineering",
    );
  assert.throws(
    () => validateRuntimeManifest(orphanPoolManifest),
    /work pool engineering must have at least one membership/,
  );

  const unknownRoleMembershipManifest = structuredClone(manifest);
  unknownRoleMembershipManifest.work_pool_memberships[0].role_key =
    "ghost_role";
  assert.throws(
    () => validateRuntimeManifest(unknownRoleMembershipManifest),
    /work pool membership references unknown role: ghost_role/,
  );

  const missingEntitlementManifest = structuredClone(manifest);
  missingEntitlementManifest.access_entitlements =
    missingEntitlementManifest.access_entitlements.filter(
      (item) => item.role_key !== "engineering",
    );
  assert.throws(
    () => validateRuntimeManifest(missingEntitlementManifest),
    /role profile engineering must have access entitlements/,
  );

  const crossCustomerScopeManifest = structuredClone(manifest);
  crossCustomerScopeManifest.access_entitlements[0].scope_value = "yoyoosun";
  crossCustomerScopeManifest.customer_key = "demo";
  crossCustomerScopeManifest.revision =
    "demo-customer-package-v1.runtime-manifest-v1";
  crossCustomerScopeManifest.compiled_snapshot.customer.key = "demo";
  assert.throws(
    () => validateRuntimeManifest(crossCustomerScopeManifest),
    /access entitlement scope_value must match customer_key/,
  );

  const missingWorkflowCapabilityManifest = structuredClone(manifest);
  missingWorkflowCapabilityManifest.access_entitlements =
    missingWorkflowCapabilityManifest.access_entitlements.filter(
      (item) =>
        !(
          item.role_key === "engineering" &&
          item.capability_key === "workflow.task.read"
        ),
    );
  assert.throws(
    () => validateRuntimeManifest(missingWorkflowCapabilityManifest),
    /work pool role engineering must have workflow\.task\.read/,
  );

  const missingProcessCapabilityManifest = structuredClone(manifest);
  missingProcessCapabilityManifest.access_entitlements =
    missingProcessCapabilityManifest.access_entitlements.filter(
      (item) =>
        !(
          item.role_key === "pmc" &&
          item.capability_key === "workflow.task.complete"
        ),
    );
  assert.throws(
    () => validateRuntimeManifest(missingProcessCapabilityManifest),
    /order_review mapped role pmc must have workflow\.task\.complete/,
  );
});

test("customer-config-runtime-manifest: rejects runtime-enabled policy and extension catalogs", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  const runtimeFlowManifest = structuredClone(manifest);
  runtimeFlowManifest.compiled_snapshot.flowCatalog.runtime_enabled = true;
  assert.throws(
    () => validateRuntimeManifest(runtimeFlowManifest),
    /flowCatalog must not enable runtime flow execution/,
  );

  const runtimePolicyManifest = structuredClone(manifest);
  runtimePolicyManifest.compiled_snapshot.policyCatalog.process_policies[0].runtime_enabled = true;
  assert.throws(
    () => validateRuntimeManifest(runtimePolicyManifest),
    /skip_policy\.runtime_enabled must stay false/,
  );

  const emptyPolicyRulesManifest = structuredClone(manifest);
  emptyPolicyRulesManifest.compiled_snapshot.policyCatalog.process_policies[0].rules =
    [];
  assert.throws(
    () => validateRuntimeManifest(emptyPolicyRulesManifest),
    /skip_policy\.rules must match rule_count/,
  );

  const executablePolicyRulesManifest = structuredClone(manifest);
  executablePolicyRulesManifest.compiled_snapshot.policyCatalog.process_policies[0].rules =
    [
      {
        key: "skip_optional_review_when_unconfigured",
        decision: "manual_review_required",
        handler: "customerPolicyHandler",
      },
    ];
  assert.throws(
    () => validateRuntimeManifest(executablePolicyRulesManifest),
    /skip_policy\.rules\[0\]\.handler is not an allowed policy rule field/,
  );

  const runtimeExtensionManifest = structuredClone(manifest);
  runtimeExtensionManifest.compiled_snapshot.extensionPointCatalog.catalog_status =
    "contract_preview_only";
  runtimeExtensionManifest.compiled_snapshot.extensionPointCatalog.extension_points =
    [
      {
        key: "customer_code_hook",
        label: "客户代码扩展",
        status: "preview_only",
        runtime_enabled: true,
        handler: "customerSpecificHandler",
        guardrail: "invalid",
      },
    ];
  assert.throws(
    () => validateRuntimeManifest(runtimeExtensionManifest),
    /customer_code_hook\.runtime_enabled must stay false/,
  );
});

test("customer-config-runtime-manifest: extension points stay preview-only and non-executable", () => {
  const manifest = buildRuntimeManifest({
    ...yoyoosunCustomerPackage,
    extensionPoints: Object.freeze([
      Object.freeze({
        key: "sales_order_acceptance_hook",
        label: "销售订单受理扩展位",
        status: "preview_only",
        runtimeEnabled: false,
        guardrail: "只声明扩展位，不允许客户包上传 handler。",
      }),
    ]),
  });
  const extensionPointCatalog =
    manifest.compiled_snapshot.extensionPointCatalog;
  const [extensionPoint] = extensionPointCatalog.extension_points;

  assert.equal(extensionPointCatalog.runtime_enabled, false);
  assert.equal(extensionPointCatalog.catalog_status, "contract_preview_only");
  assert.equal(
    extensionPointCatalog.implementation_source,
    "registered_deployment_package_required",
  );
  assert.equal(extensionPointCatalog.handler_allowed, false);
  assert.equal(extensionPointCatalog.customer_package_handler_allowed, false);
  assert.deepEqual(extensionPointCatalog.blocked_reasons, [
    "no_reviewed_extension_contract",
    "customer_package_handler_forbidden",
    "registered_deployment_package_required",
  ]);
  assert.equal(extensionPoint.key, "sales_order_acceptance_hook");
  assert.equal(extensionPoint.runtime_enabled, false);
  assert.equal(extensionPoint.handler_allowed, false);
  assert.equal(extensionPoint.customer_package_handler_allowed, false);
  assert.equal(
    extensionPoint.implementation_source,
    "registered_deployment_package_required",
  );
  assert.deepEqual(extensionPoint.blocked_reasons, [
    "no_reviewed_extension_contract",
    "customer_package_handler_forbidden",
    "registered_deployment_package_required",
  ]);
  validateRuntimeManifest(manifest);

  const handlerManifest = structuredClone(manifest);
  handlerManifest.compiled_snapshot.extensionPointCatalog.extension_points[0].handler =
    "customerSpecificHandler";
  assert.throws(
    () => validateRuntimeManifest(handlerManifest),
    /sales_order_acceptance_hook must not publish executable handlers/,
  );

  const missingBlockerManifest = structuredClone(manifest);
  missingBlockerManifest.compiled_snapshot.extensionPointCatalog.extension_points[0].blocked_reasons =
    [];
  assert.throws(
    () => validateRuntimeManifest(missingBlockerManifest),
    /sales_order_acceptance_hook\.blocked_reasons must explain why runtime extension stays blocked/,
  );
});

test("customer-config-runtime-manifest: rejects forbidden runtime payload keys", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  manifest.compiled_snapshot.secret = "bad";

  assert.throws(
    () => validateRuntimeManifest(manifest),
    /must not embed raw rows, secrets, SQL or executable code payloads/,
  );
});

test("customer-config-runtime-manifest: rejects unsafe process definition changes", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  const loaderDisabledManifest = structuredClone(manifest);
  loaderDisabledManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.runtime_loader_enabled = false;
  assert.throws(
    () => validateRuntimeManifest(loaderDisabledManifest),
    /sales_order_acceptance must explicitly enable the controlled runtime loader/,
  );

  const factPostingManifest = structuredClone(manifest);
  factPostingManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.fact_boundary =
    "fact_posting";
  assert.throws(
    () => validateRuntimeManifest(factPostingManifest),
    /sales_order_acceptance must not post domain facts/,
  );

  const wrongCommandManifest = structuredClone(manifest);
  wrongCommandManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.nodes[0].policy_snapshot.command_key =
    "inventory.post";
  assert.throws(
    () => validateRuntimeManifest(wrongCommandManifest),
    /submit_sales_order\.policy_snapshot\.command_key must be a registered runtime domain command/,
  );

  const materialLoaderDisabledManifest = structuredClone(manifest);
  materialLoaderDisabledManifest.compiled_snapshot.processDefinitions.material_supply.runtime_loader_enabled = false;
  assert.throws(
    () => validateRuntimeManifest(materialLoaderDisabledManifest),
    /material_supply runtime loader must stay enabled/,
  );

  const materialFactPostingManifest = structuredClone(manifest);
  materialFactPostingManifest.compiled_snapshot.processDefinitions.material_supply.nodes[0].fact_command_contract.writes_fact = true;
  assert.throws(
    () => validateRuntimeManifest(materialFactPostingManifest),
    /purchase_receipt_source manifest contract must not claim fact posting/,
  );

  const materialRuntimeBindingManifest = structuredClone(manifest);
  materialRuntimeBindingManifest.compiled_snapshot.processDefinitions.material_supply.nodes[1].fact_command_contract.runtime_binding_status =
    "runtime_loader_ready";
  assert.throws(
    () => validateRuntimeManifest(materialRuntimeBindingManifest),
    /incoming_qc\.fact_command_contract\.runtime_binding_status must stay process_runtime_handler_registered/,
  );

  const materialContractTestAnchorManifest = structuredClone(manifest);
  materialContractTestAnchorManifest.compiled_snapshot.processDefinitions.material_supply.nodes[2].fact_command_contract.required_test_anchors =
    [];
  assert.throws(
    () => validateRuntimeManifest(materialContractTestAnchorManifest),
    /warehouse_inbound\.fact_command_contract\.required_test_anchors must reference existing tests/,
  );

  const finishedGoodsLoaderDisabledManifest = structuredClone(manifest);
  finishedGoodsLoaderDisabledManifest.compiled_snapshot.processDefinitions.finished_goods_delivery.runtime_loader_enabled = false;
  assert.throws(
    () => validateRuntimeManifest(finishedGoodsLoaderDisabledManifest),
    /finished_goods_delivery runtime loader must allow start-only instances/,
  );

  const finishedGoodsRuntimeBindingManifest = structuredClone(manifest);
  finishedGoodsRuntimeBindingManifest.compiled_snapshot.processDefinitions.finished_goods_delivery.nodes[1].fact_command_contract.runtime_binding_status =
    "contract_preflight_only";
  assert.throws(
    () => validateRuntimeManifest(finishedGoodsRuntimeBindingManifest),
    /shipment_finance_release\.fact_command_contract\.runtime_binding_status must stay process_runtime_handler_registered/,
  );

  const finishedGoodsBlockerManifest = structuredClone(manifest);
  finishedGoodsBlockerManifest.compiled_snapshot.processDefinitions.finished_goods_delivery.nodes[1].fact_command_contract.runtime_execute_blockers =
    ["domain_command_handler_not_registered", "target_evidence_missing"];
  assert.throws(
    () => validateRuntimeManifest(finishedGoodsBlockerManifest),
    /shipment_finance_release\.fact_command_contract must not keep handler registration as an execute blocker after registration/,
  );
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
  rmSync(path.resolve(outPath), { force: true });

  const defaultPreviewResult = runCustomerConfigRuntimeManifest({
    customer: "yoyoosun",
    mode: "",
    out: outPath,
  });
  assert.equal(defaultPreviewResult.mode, "preview");
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

test("customer-config-runtime-manifest: --out requires preview mode", () => {
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
