import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import {
  buildRuntimeManifest,
  runCustomerConfigRuntimeManifest,
  validateRuntimeManifest,
} from "./customer-config-runtime-manifest.mjs";

test("customer-config-runtime-manifest: builds publishable JSON-RPC payload shape", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  assert.equal(manifest.customer_key, "yoyoosun");
  assert.equal(manifest.revision, "yoyoosun-customer-package-v1.runtime-manifest-v1");
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
  assert.equal(manifest.module_states.length, 15);
  assert.equal(manifest.role_profiles.length, 9);
  assert.equal(manifest.work_pools.length, 18);
  assert.equal(manifest.work_pool_memberships.length, 18);
  assert(manifest.access_entitlements.length > manifest.role_profiles.length);
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
  assert.equal(manifest.revision, "demo-customer-package-v1.runtime-manifest-v1");
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

test("customer-config-runtime-manifest: proves same responsibility pool can map to different customer roles", () => {
  const demoManifest = buildRuntimeManifest(demoCustomerPackage);
  const yoyoosunManifest = buildRuntimeManifest(yoyoosunCustomerPackage);
  const demoOrderReview = demoManifest.work_pool_memberships.find(
    (membership) => membership.pool_key === "order_review",
  );
  const yoyoosunOrderReview = yoyoosunManifest.work_pool_memberships.find(
    (membership) => membership.pool_key === "order_review",
  );

  assert.equal(demoManifest.compiled_snapshot.workPoolRoleOverrides.order_review, "sales");
  assert.equal(demoOrderReview?.role_key, "sales");
  assert.equal(yoyoosunOrderReview?.role_key, "pmc");
  assert.equal(
    demoManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.nodes[2]
      .owner_pool_key,
    "order_review",
  );
  assert.equal(
    yoyoosunManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.nodes[2]
      .owner_pool_key,
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
  assert.equal(processDefinition.domain_boundary, "source_document_command_only");
  assert.equal(processDefinition.fact_boundary, "no_fact_posting");
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_key),
    ["submit_sales_order", "order_approval", "order_review", "end"],
  );
  assert.deepEqual(
    processDefinition.nodes.map((node) => node.node_type),
    ["domain_command", "approval", "human_task", "end"],
  );
  assert.equal(
    processDefinition.nodes[0].policy_snapshot.command_key,
    "sales_order.submit",
  );
  assert.equal(processDefinition.nodes[0].policy_snapshot.writes_fact, false);
  assert.equal(processDefinition.nodes[1].owner_pool_key, "order_approval");
  assert.equal(processDefinition.nodes[1].source_owner_pool_key, "boss");
  assert.equal(processDefinition.nodes[2].owner_pool_key, "order_review");
  assert.equal(processDefinition.nodes[2].source_owner_pool_key, "pmc");
  assert(
    manifest.work_pools.some(
      (pool) =>
        pool.pool_key === "order_approval" &&
        pool.source_pool_key === "boss",
    ),
  );
  assert(
    manifest.work_pool_memberships.some(
      (membership) =>
        membership.pool_key === "order_review" &&
        membership.role_key === "pmc",
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
  assert.equal(processDefinition.source_workflow_key, "purchase_order_approval");
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
    processDefinition.nodes.slice(0, 3).map((node) => [
      node.policy_snapshot.command_key,
      node.policy_snapshot.writes_fact,
      node.policy_snapshot.idempotency_key_required,
    ]),
    [
      ["purchase_receipt.create", false, true],
      ["quality_inspection.decide", false, true],
      ["inventory.post_inbound", false, true],
    ],
  );
  assert.deepEqual(
    processDefinition.nodes.slice(0, 3).map((node) => [
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
        "quality_inspection.decide",
        "process_runtime_handler_registered",
        true,
        "InventoryUsecase.PassQualityInspection / InventoryUsecase.RejectQualityInspection",
        "quality.pass_quality_inspection / quality.reject_quality_inspection",
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
      item.includes("TestPurchaseReceiptProcessDomainCommandCreateBindsUsecase"),
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
      item.includes("TestQualityInspectionProcessDomainCommandDecidePassBindsUsecase"),
    ),
  );
  assert.equal(
    qualityContract.runtime_loader_blockers.includes(
      "domain_command_handler_not_registered",
    ),
    false,
  );
  assert.deepEqual(qualityContract.runtime_loader_blockers, []);
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
        membership.role_key === "purchasing",
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
  assert.equal(processDefinition.variant_key, "quality_finance_ship_receivable");
  assert.equal(processDefinition.source_workflow_key, "finished_goods_delivery");
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
    ["domain_command", "domain_command", "domain_command", "domain_command", "end"],
  );
  assert.deepEqual(
    processDefinition.nodes.slice(0, 4).map((node) => [
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
    assert(
      node.fact_command_contract.runtime_loader_blockers.length === 0,
    );
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
    assert.equal(node.fact_command_contract.required_before_runtime_execute, true);
    assert.equal(node.fact_command_contract.required_test_anchors.length >= 2, true);
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

  assert(roleKeys.includes("purchasing"));
  assert(roleKeys.includes("engineering"));
  assert.equal(roleKeys.includes("purchase"), false);
  assert.equal(purchaseMembership.role_key, "purchasing");
  assert.equal(engineeringMembership.role_key, "engineering");
  assert(engineeringEntitlements.some((item) => item.capability_key === "mobile.engineering.access"));
  assert.equal(
    bossEntitlements.some((item) => item.capability_key === "mobile.engineering.access"),
    false,
  );
});

test("customer-config-runtime-manifest: enforces entitlement and work pool integrity", () => {
  const manifest = buildRuntimeManifest(yoyoosunCustomerPackage);

  const orphanPoolManifest = structuredClone(manifest);
  orphanPoolManifest.work_pool_memberships = orphanPoolManifest.work_pool_memberships.filter(
    (item) => item.pool_key !== "engineering",
  );
  assert.throws(
    () => validateRuntimeManifest(orphanPoolManifest),
    /work pool engineering must have at least one membership/,
  );

  const unknownRoleMembershipManifest = structuredClone(manifest);
  unknownRoleMembershipManifest.work_pool_memberships[0].role_key = "ghost_role";
  assert.throws(
    () => validateRuntimeManifest(unknownRoleMembershipManifest),
    /work pool membership references unknown role: ghost_role/,
  );

  const missingEntitlementManifest = structuredClone(manifest);
  missingEntitlementManifest.access_entitlements = missingEntitlementManifest.access_entitlements.filter(
    (item) => item.role_key !== "engineering",
  );
  assert.throws(
    () => validateRuntimeManifest(missingEntitlementManifest),
    /role profile engineering must have access entitlements/,
  );

  const crossCustomerScopeManifest = structuredClone(manifest);
  crossCustomerScopeManifest.access_entitlements[0].scope_value = "yoyoosun";
  crossCustomerScopeManifest.customer_key = "demo";
  crossCustomerScopeManifest.revision = "demo-customer-package-v1.runtime-manifest-v1";
  crossCustomerScopeManifest.compiled_snapshot.customer.key = "demo";
  assert.throws(
    () => validateRuntimeManifest(crossCustomerScopeManifest),
    /access entitlement scope_value must match customer_key/,
  );

  const missingWorkflowCapabilityManifest = structuredClone(manifest);
  missingWorkflowCapabilityManifest.access_entitlements =
    missingWorkflowCapabilityManifest.access_entitlements.filter(
      (item) =>
        !(item.role_key === "engineering" && item.capability_key === "workflow.task.read"),
    );
  assert.throws(
    () => validateRuntimeManifest(missingWorkflowCapabilityManifest),
    /work pool role engineering must have workflow\.task\.read/,
  );

  const missingProcessCapabilityManifest = structuredClone(manifest);
  missingProcessCapabilityManifest.access_entitlements =
    missingProcessCapabilityManifest.access_entitlements.filter(
      (item) =>
        !(item.role_key === "pmc" && item.capability_key === "workflow.task.complete"),
    );
  assert.throws(
    () => validateRuntimeManifest(missingProcessCapabilityManifest),
    /order_review mapped role pmc must have workflow\.task\.complete/,
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
  factPostingManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.fact_boundary = "fact_posting";
  assert.throws(
    () => validateRuntimeManifest(factPostingManifest),
    /sales_order_acceptance must not post domain facts/,
  );

  const wrongCommandManifest = structuredClone(manifest);
  wrongCommandManifest.compiled_snapshot.processDefinitions.sales_order_acceptance.nodes[0].policy_snapshot.command_key = "inventory.post";
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
  materialRuntimeBindingManifest.compiled_snapshot.processDefinitions.material_supply.nodes[1].fact_command_contract.runtime_binding_status = "runtime_loader_ready";
  assert.throws(
    () => validateRuntimeManifest(materialRuntimeBindingManifest),
    /incoming_qc\.fact_command_contract\.runtime_binding_status must stay process_runtime_handler_registered/,
  );

  const materialContractTestAnchorManifest = structuredClone(manifest);
  materialContractTestAnchorManifest.compiled_snapshot.processDefinitions.material_supply.nodes[2].fact_command_contract.required_test_anchors = [];
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
  finishedGoodsRuntimeBindingManifest.compiled_snapshot.processDefinitions.finished_goods_delivery.nodes[1].fact_command_contract.runtime_binding_status = "contract_preflight_only";
  assert.throws(
    () => validateRuntimeManifest(finishedGoodsRuntimeBindingManifest),
    /shipment_finance_release\.fact_command_contract\.runtime_binding_status must stay process_runtime_handler_registered/,
  );

  const finishedGoodsBlockerManifest = structuredClone(manifest);
  finishedGoodsBlockerManifest.compiled_snapshot.processDefinitions.finished_goods_delivery.nodes[1].fact_command_contract.runtime_execute_blockers = [
    "domain_command_handler_not_registered",
    "target_evidence_missing",
  ];
  assert.throws(
    () => validateRuntimeManifest(finishedGoodsBlockerManifest),
    /shipment_finance_release\.fact_command_contract must not keep handler registration as an execute blocker after registration/,
  );
});

test("customer-config-runtime-manifest: preview output is bounded to output directory", async () => {
  const outPath = "output/customers/yoyoosun/customer-config-runtime-manifest.test.json";
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
