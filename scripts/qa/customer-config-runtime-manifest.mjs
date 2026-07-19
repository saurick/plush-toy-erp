#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { customerPackageSchema } from "../../config/schemas/customerPackageSchema.mjs";
import {
  getCustomerPackage,
  listCustomerPackageKeys,
} from "../../config/customers/index.mjs";
import {
  buildPreview,
  validateCatalog,
  validatePackage,
} from "./customer-package-lint.mjs";
import { getNavigationSections } from "../../web/src/erp/config/seedData.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const ALLOWED_MODES = Object.freeze(["validate", "compile", "preview"]);
const MANIFEST_SCHEMA_VERSION = "customer-config-manifest/v1";
const PROCESS_CONTRACT_VERSION = "customer-process-contract/v1";
const FORMAL_PRODUCT_VERSION = "local-customer-package";
const LOCAL_TEST_PRODUCT_VERSION = "local-customer-package-test-apply";
const LOCAL_TEST_APPLY_PURPOSE = "local_test_apply";

const ROLE_KEY_BY_POOL = Object.freeze({
  boss: "boss",
  sales: "sales",
  purchase: "purchase",
  warehouse: "warehouse",
  quality: "quality",
  finance: "finance",
  pmc: "pmc",
  engineering: "engineering",
  production: "production",
});

const MODULE_KEY_BY_POOL = Object.freeze({
  boss: "workflow_tasks",
  sales: "sales_orders",
  purchase: "purchase_orders",
  warehouse: "inventory",
  quality: "quality_inspections",
  finance: "finance",
  pmc: "workflow_tasks",
  engineering: "products",
  production: "workflow_tasks",
});

const ROLE_CAPABILITY_KEYS_BY_POOL = Object.freeze({
  boss: Object.freeze([
    "erp.dashboard.read",
    "erp.print_template.read",
    "supplier.read",
    "contact.read",
    "material.read",
    "warehouse.inventory.read",
    "purchase.order.read",
    "purchase.order.approve",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.approve",
    "workflow.task.reject",
    "mobile.boss.access",
  ]),
  sales: Object.freeze([
    "erp.dashboard.read",
    "erp.print_template.read",
    "customer.read",
    "customer.create",
    "customer.update",
    "contact.read",
    "contact.create",
    "contact.update",
    "material.read",
    "product.read",
    "product_sku.read",
    "sales_order.read",
    "sales_order.create",
    "sales_order.update",
    "sales_order.submit",
    "sales_order.activate",
    "sales_order.close",
    "sales_order.cancel",
    "sales_order_item.read",
    "warehouse.inventory.read",
    "stock.reservation.create",
    "shipment.read",
    "shipment.create",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.sales.access",
  ]),
  purchase: Object.freeze([
    "erp.dashboard.read",
    "erp.print_template.read",
    "supplier.read",
    "supplier.create",
    "supplier.update",
    "material.read",
    "purchase.order.read",
    "purchase.order.create",
    "purchase.order.update",
    "purchase.receipt.read",
    "purchase.receipt.create",
    "warehouse.inventory.read",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.purchase.access",
  ]),
  warehouse: Object.freeze([
    "erp.dashboard.read",
    "customer.read",
    "supplier.read",
    "material.read",
    "product.read",
    "product_sku.read",
    "sales_order.read",
    "sales_order_item.read",
    "purchase.receipt.read",
    "warehouse.inventory.read",
    "warehouse.inbound.read",
    "warehouse.inbound.confirm",
    "warehouse.outbound.read",
    "warehouse.outbound.confirm",
    "shipment.read",
    "shipment.create",
    "shipment.ship",
    "shipment.cancel",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "workflow.task.reject",
    "mobile.warehouse.access",
  ]),
  quality: Object.freeze([
    "erp.dashboard.read",
    "supplier.read",
    "contact.read",
    "material.read",
    "process.read",
    "product.read",
    "product_sku.read",
    "outsourcing.order.read",
    "outsourcing.fact.read",
    "purchase.receipt.read",
    "purchase.return.read",
    "purchase.return.create",
    "warehouse.inventory.read",
    "quality.inspection.read",
    "quality.inspection.create",
    "quality.inspection.update",
    "quality.exception.handle",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "workflow.task.reject",
    "mobile.quality.access",
  ]),
  finance: Object.freeze([
    "erp.dashboard.read",
    "erp.print_template.read",
    "customer.read",
    "supplier.read",
    "contact.read",
    "material.read",
    "product.read",
    "product_sku.read",
    "process.read",
    "outsourcing.order.read",
    "outsourcing.fact.read",
    "purchase.receipt.read",
    "quality.inspection.read",
    "sales_order.read",
    "sales_order_item.read",
    "warehouse.inventory.read",
    "shipment.read",
    "finance.payable.read",
    "finance.payable.confirm",
    "finance.receivable.read",
    "finance.receivable.confirm",
    "finance.invoice.read",
    "finance.invoice.confirm",
    "finance.reconciliation.read",
    "finance.reconciliation.confirm",
    "finance.report.read",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "workflow.task.reject",
    "mobile.finance.access",
  ]),
  pmc: Object.freeze([
    "erp.dashboard.read",
    "material.read",
    "product.read",
    "product.create",
    "product.update",
    "product_sku.read",
    "product_sku.create",
    "product_sku.update",
    "bom.read",
    "bom.create",
    "bom.update",
    "bom.activate",
    "pmc.plan.read",
    "pmc.plan.create",
    "pmc.plan.update",
    "pmc.risk.read",
    "pmc.risk.handle",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.pmc.access",
  ]),
  engineering: Object.freeze([
    "erp.dashboard.read",
    "erp.print_template.read",
    "material.read",
    "process.read",
    "process.create",
    "process.update",
    "product.read",
    "product.create",
    "product.update",
    "product_sku.read",
    "product_sku.create",
    "product_sku.update",
    "bom.read",
    "bom.create",
    "bom.update",
    "bom.activate",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.engineering.access",
  ]),
  production: Object.freeze([
    "erp.dashboard.read",
    "erp.print_template.read",
    "supplier.read",
    "outsourcing.order.read",
    "outsourcing.order.create",
    "outsourcing.order.update",
    "outsourcing.order.confirm",
    "contact.read",
    "material.read",
    "process.read",
    "product.read",
    "product_sku.read",
    "outsourcing.fact.read",
    "outsourcing.material_issue.create",
    "outsourcing.return_receipt.create",
    "outsourcing.fact.post",
    "outsourcing.fact.cancel",
    "warehouse.inventory.read",
    "production.fact.read",
    "production.completion.create",
    "production.material_issue.create",
    "production.rework.create",
    "production.fact.post",
    "production.fact.cancel",
    "pmc.plan.read",
    "pmc.plan.update",
    "pmc.risk.read",
    "pmc.risk.handle",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.production.access",
  ]),
});

const FORBIDDEN_RUNTIME_KEYS = Object.freeze([
  "secret",
  "secrets",
  "token",
  "password",
  "sql",
  "go",
  "js",
  "rows",
  "rawRows",
  "rawValues",
  "records",
]);

function collectRuntimePageKeys() {
  return getNavigationSections().flatMap((section) =>
    (Array.isArray(section?.items) ? section.items : [])
      .map((item) => String(item?.key || "").trim())
      .filter(Boolean),
  );
}

const RUNTIME_PAGE_KEYS = Object.freeze(collectRuntimePageKeys());

const RUNTIME_DOMAIN_COMMAND_KEYS = Object.freeze([
  "sales_order.submit",
  "purchase_receipt.create",
  "quality_inspection.aggregate_gate",
  "inventory.post_inbound",
  "finance.receivable_lead",
]);

const REVIEWED_CONTRACT_COMMAND_KEYS = Object.freeze([
  ...RUNTIME_DOMAIN_COMMAND_KEYS,
  "finished_goods_quality.decide",
  "shipment.finance_release",
  "shipment.ship",
]);

const PROCESS_DEFINITION_NODE_TYPES = Object.freeze([
  "domain_command",
  "approval",
  "human_task",
  "end",
]);

const SALES_ORDER_ACCEPTANCE_PROCESS_KEY = "sales_order_acceptance";
const MATERIAL_SUPPLY_PROCESS_KEY = "material_supply";
const FINISHED_GOODS_DELIVERY_PROCESS_KEY = "finished_goods_delivery";

const SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS = Object.freeze([
  Object.freeze({
    pool_key: "order_approval",
    source_pool_key: "boss",
    module_key: "workflow_tasks",
    display_name: "销售订单审批责任池",
    description: "derived from sales order acceptance process definition",
  }),
  Object.freeze({
    pool_key: "engineering_data",
    source_pool_key: "engineering",
    module_key: "products",
    display_name: "销售订单工程资料责任池",
    description: "derived from customer sales order acceptance process definition",
  }),
  Object.freeze({
    pool_key: "order_review",
    source_pool_key: "pmc",
    module_key: "workflow_tasks",
    display_name: "销售订单 PMC 评审责任池",
    description: "derived from sales order acceptance process definition",
  }),
]);

const MATERIAL_SUPPLY_EVIDENCE_OWNER_POOLS = Object.freeze([
  Object.freeze({
    pool_key: "purchase_receipt_source",
    source_pool_key: "purchase",
    module_key: "purchase_receipts",
    display_name: "采购收货来源责任池",
    description: "material supply runtime node; no automatic task fact posting",
  }),
  Object.freeze({
    pool_key: "incoming_qc",
    source_pool_key: "quality",
    module_key: "quality_inspections",
    display_name: "来料质检责任池",
    description: "material supply runtime node; no automatic task fact posting",
  }),
  Object.freeze({
    pool_key: "warehouse_inbound",
    source_pool_key: "warehouse",
    module_key: "inventory",
    display_name: "仓库入库责任池",
    description: "material supply runtime node; no automatic task fact posting",
  }),
]);

const FINISHED_GOODS_DELIVERY_EVIDENCE_OWNER_POOLS = Object.freeze([
  Object.freeze({
    pool_key: "finished_goods_quality",
    source_pool_key: "quality",
    module_key: "quality_inspections",
    display_name: "成品质检责任池",
    description: "finished goods delivery contract node; runtime loader start-only",
  }),
  Object.freeze({
    pool_key: "shipment_finance_release",
    source_pool_key: "finance",
    module_key: "finance",
    display_name: "出货财务放行责任池",
    description: "finished goods delivery contract node; runtime loader start-only",
  }),
  Object.freeze({
    pool_key: "shipment_execution",
    source_pool_key: "warehouse",
    module_key: "shipments",
    display_name: "仓库出货执行责任池",
    description: "finished goods delivery contract node; runtime loader start-only",
  }),
  Object.freeze({
    pool_key: "receivable_lead",
    source_pool_key: "finance",
    module_key: "finance",
    display_name: "应收线索责任池",
    description: "finished goods delivery contract node; runtime loader start-only",
  }),
]);

const RUNTIME_PROCESS_POOL_KEYS = Object.freeze([
  ...SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS.map((pool) => pool.pool_key),
  ...MATERIAL_SUPPLY_EVIDENCE_OWNER_POOLS.map((pool) => pool.pool_key),
  ...FINISHED_GOODS_DELIVERY_EVIDENCE_OWNER_POOLS.map((pool) => pool.pool_key),
]);

const MATERIAL_SUPPLY_FACT_COMMAND_CONTRACTS = Object.freeze({
  purchase_receipt_source: Object.freeze({
    command_key: "purchase_receipt.create",
    required_before_runtime_loader: false,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Purchase / InventoryUsecase",
    domain_usecase_binding: "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
    jsonrpc_method: "purchase.create_purchase_receipt_from_purchase_order",
    required_permission_key: "purchase.receipt.create",
    jsonrpc_allowed_permission_keys: Object.freeze(["purchase.receipt.create"]),
    stable_business_ref: "purchase_order_id + purchase_order_item_id -> purchase_receipt_id",
    idempotency_boundary:
      "purchase receipt no and source line uniqueness exist; future runtime command must still provide process idempotency key",
    required_test_anchors: Object.freeze([
      "server/internal/biz/purchase_receipt_process_command_test.go: TestPurchaseReceiptProcessDomainCommandCreateBindsUsecase",
      "server/internal/biz/purchase_receipt_process_command_test.go: TestPurchaseReceiptProcessDomainCommandCreateRejectsMismatchedBusinessRef",
      "server/internal/service/jsonrpc_purchase_test.go: TestJsonrpcDispatcher_CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly",
      "server/internal/service/jsonrpc_purchase_test.go: TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze([]),
  }),
  incoming_qc: Object.freeze({
    command_key: "quality_inspection.aggregate_gate",
    required_before_runtime_loader: false,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Quality gate / InventoryUsecase",
    domain_usecase_binding: "InventoryUsecase.EvaluatePurchaseReceiptQualityGate",
    jsonrpc_method: "customer_config.execute_material_supply_quality_gate",
    required_permission_key: "quality.inspection.update",
    jsonrpc_allowed_permission_keys: Object.freeze(["quality.inspection.update"]),
    stable_business_ref: "purchase_receipt_id -> every purchase_receipt_item + quality_inspection + inventory_lot",
    idempotency_boundary:
      "gate evaluation never decides line inspections or writes domain facts; ProcessRuntime still requires active node, expected version and idempotency key",
    required_test_anchors: Object.freeze([
      "server/internal/biz/quality_inspection_process_command_test.go: TestIncomingQualityGateProcessDomainCommandPassesOnlyAfterAggregateReady",
      "server/internal/biz/quality_inspection_process_command_test.go: TestIncomingQualityGateProcessDomainCommandRejectBlocksProcess",
      "server/internal/biz/quality_inspection_process_command_test.go: TestIncomingQualityGateProcessDomainCommandKeepsPendingNodeActive",
      "server/internal/biz/quality_inspection_process_command_test.go: TestIncomingQualityGateProcessDomainCommandRejectsLegacyInspectionID",
      "server/internal/data/purchase_receipt_order_quantity_test.go: TestMaterialSupplyReceiptCreatesLineQualityGateBeforeInventoryPost",
      "server/internal/data/inventory_postgres_purchase_receipt_test.go: TestPurchaseReceiptPostgresMaterialSupplyMultiLineQualityGate",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteMaterialSupplyQualityAndInbound",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze([]),
  }),
  warehouse_inbound: Object.freeze({
    command_key: "inventory.post_inbound",
    required_before_runtime_loader: false,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Inventory / InventoryUsecase",
    domain_usecase_binding: "InventoryUsecase.PostPurchaseReceipt",
    jsonrpc_method: "purchase.post_purchase_receipt",
    required_permission_key: "warehouse.inbound.confirm",
    jsonrpc_allowed_permission_keys: Object.freeze(["purchase.receipt.create", "warehouse.inbound.confirm"]),
    stable_business_ref: "purchase_receipt_id",
    idempotency_boundary:
      "purchase receipt posting replay keeps one inbound inventory transaction; future runtime command must still provide process idempotency key",
    required_test_anchors: Object.freeze([
      "server/internal/biz/inventory_process_command_test.go: TestInventoryProcessDomainCommandPostInboundBindsUsecase",
      "server/internal/biz/inventory_process_command_test.go: TestInventoryProcessDomainCommandPostInboundRejectsMismatchedBusinessRef",
      "server/internal/data/inventory_repo_purchase_receipt_test.go: TestInventoryRepo_PurchaseReceiptLifecycle",
      "server/internal/data/inventory_postgres_purchase_receipt_test.go: TestPurchaseReceiptPostgresFlow",
      "server/internal/service/jsonrpc_purchase_test.go: TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact",
      "server/internal/service/jsonrpc_purchase_test.go: TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze([]),
  }),
});

const FINISHED_GOODS_DELIVERY_FACT_COMMAND_CONTRACTS = Object.freeze({
  finished_goods_quality: Object.freeze({
    command_key: "finished_goods_quality.decide",
    required_before_runtime_loader: false,
    required_before_runtime_execute: true,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Quality / InventoryUsecase",
    domain_usecase_binding:
      "process_runtime_handler: InventoryUsecase.PassQualityInspection / RejectQualityInspection for source_type=SHIPMENT quality_inspection",
    jsonrpc_method: "customer_config.execute_finished_goods_delivery_quality_decide",
    required_permission_key: "quality.inspection.update",
    jsonrpc_allowed_permission_keys: Object.freeze(["quality.inspection.update"]),
    stable_business_ref: "shipment_id + finished_goods_lot_id + quality_inspection_id",
    idempotency_boundary:
      "ExecuteDomainCommandNode requires active node, expected_version and idempotency key; handler rejects mismatched shipment / inspection refs",
    required_test_anchors: Object.freeze([
      "server/internal/biz/quality_inspection_process_command_test.go: TestFinishedGoodsQualityProcessDomainCommandDecideBindsShipmentLinkedInspection",
      "server/internal/biz/quality_inspection_process_command_test.go: TestFinishedGoodsQualityProcessDomainCommandDecideRejectsMismatchedShipmentRefs",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideRunsRegisteredHandler",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideRequiresQualityPermission",
      "server/internal/biz/workflow_shipment_release_test.go: TestWorkflowUsecase_ShipmentReleaseDoneUpsertsShippingReleasedOnly",
      "server/internal/service/jsonrpc_workflow_test.go: TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze(["target_evidence_missing"]),
  }),
  shipment_finance_release: Object.freeze({
    command_key: "shipment.finance_release",
    required_before_runtime_loader: false,
    required_before_runtime_execute: true,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Shipment / OperationalFactUsecase",
    domain_usecase_binding:
      "process_runtime_handler: OperationalFactUsecase.GetShipment validates draft shipment finance release gate without shipping inventory or creating finance facts",
    jsonrpc_method: "customer_config.execute_finished_goods_delivery_finance_release",
    required_permission_key: "finance.receivable.confirm",
    jsonrpc_allowed_permission_keys: Object.freeze(["finance.receivable.confirm"]),
    stable_business_ref: "shipment_id",
    idempotency_boundary:
      "ProcessRuntime domain command carries process idempotency key and keeps finance release separate from shipment.ship",
    required_test_anchors: Object.freeze([
      "server/internal/biz/shipment_process_command_test.go: TestShipmentProcessDomainCommandFinanceReleaseBindsUsecase",
      "server/internal/biz/shipment_process_command_test.go: TestShipmentProcessDomainCommandFinanceReleaseRequiresDraftShipment",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRunsRegisteredHandler",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRequiresFinancePermission",
      "server/internal/biz/workflow_shipment_release_test.go: TestWorkflowUsecase_ShipmentReleaseDoneUpsertsShippingReleasedOnly",
      "server/internal/service/jsonrpc_operational_fact_test.go: TestFinanceFactCreateFromParamsParsesFeeAndCurrency",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze(["target_evidence_missing"]),
  }),
  shipment_execution: Object.freeze({
    command_key: "shipment.ship",
    required_before_runtime_loader: false,
    required_before_runtime_execute: true,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Shipment / OperationalFactUsecase",
    domain_usecase_binding:
      "process_runtime_handler: OperationalFactUsecase.ShipShipment",
    jsonrpc_method: "customer_config.execute_finished_goods_delivery_shipment_ship",
    required_permission_key: "shipment.ship",
    jsonrpc_allowed_permission_keys: Object.freeze(["shipment.ship"]),
    stable_business_ref: "shipment_id",
    idempotency_boundary:
      "ExecuteDomainCommandNode requires active node, expected_version and idempotency key; after success the node is completed so duplicate calls cannot re-enter shipment.ship",
    required_test_anchors: Object.freeze([
      "server/internal/biz/shipment_process_command_test.go: TestShipmentProcessDomainCommandShipBindsUsecase",
      "server/internal/biz/shipment_process_command_test.go: TestShipmentProcessDomainCommandShipRejectsMismatchedBusinessRef",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRunsRegisteredHandler",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRequiresShipmentPermission",
      "server/internal/service/jsonrpc_operational_fact_test.go: TestJsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions",
      "server/internal/service/jsonrpc_workflow_test.go: TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze(["target_evidence_missing"]),
  }),
  receivable_lead: Object.freeze({
    command_key: "finance.receivable_lead",
    required_before_runtime_loader: false,
    required_before_runtime_execute: true,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Finance / OperationalFactUsecase",
    domain_usecase_binding:
      "process_runtime_handler: OperationalFactUsecase.CreateFinanceFactDraft for RECEIVABLE from SHIPPED shipment",
    jsonrpc_method: "customer_config.execute_finished_goods_delivery_receivable_lead",
    required_permission_key: "finance.receivable.confirm",
    jsonrpc_allowed_permission_keys: Object.freeze(["finance.receivable.confirm"]),
    stable_business_ref: "shipment_id + customer_id + receivable_source_no",
    idempotency_boundary:
      "ExecuteDomainCommandNode requires active node, expected_version and idempotency key; finance fact draft uses the same process idempotency key",
    required_test_anchors: Object.freeze([
      "server/internal/biz/finance_process_command_test.go: TestFinanceProcessDomainCommandReceivableLeadBindsUsecase",
      "server/internal/biz/finance_process_command_test.go: TestFinanceProcessDomainCommandReceivableLeadRequiresShippedShipment",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadCreatesDraft",
      "server/internal/service/jsonrpc_customer_config_test.go: TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadRequiresFinancePermission",
      "server/internal/service/jsonrpc_operational_fact_test.go: TestFinanceFactCreateFromParamsParsesFeeAndCurrency",
      "server/internal/service/jsonrpc_workflow_test.go: TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState",
    ]),
    runtime_loader_blockers: Object.freeze([]),
    runtime_execute_blockers: Object.freeze(["target_evidence_missing"]),
  }),
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    customer: "yoyoosun",
    customers: [],
    all: false,
    mode: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      const customerKey = argv[index + 1] || "";
      args.customer = customerKey;
      args.customers.push(customerKey);
      index += 1;
    } else if (arg === "--all") {
      args.all = true;
    } else if (arg === "--mode") {
      args.mode = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }
  assert(
    !(args.all && args.customers.length > 0),
    "--all and --customer are mutually exclusive",
  );
  if (!args.all && args.customers.length === 0) {
    args.customers = [args.customer];
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode preview
  node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --customer yoyoosun --mode preview
  node scripts/qa/customer-config-runtime-manifest.mjs --all --mode preview
  node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json

Modes:
  validate  validate the compiled runtime manifest without writing files
  compile   validate and return the manifest in-process for tests
  preview   validate and optionally write JSON under output/

Tracked draft packages must use preview mode. Formal validate / compile only
accepts an explicitly reviewed release-ready input. This tool does not upload
files, call the backend, activate a revision, import business data, or write
Workflow / Fact runtime state.`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function packageRevision(config) {
  return `${config.packageKey}.runtime-manifest-v1`;
}

function localTestApplyRevision(config, manifest) {
  const fingerprintSource = {
    ...manifest,
    revision: "",
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintSource))
    .digest("hex")
    .slice(0, 16);
  return `${config.packageKey}.local-${fingerprint}.runtime-v1`;
}

function moduleStateOverridesFromPackage(config, catalog) {
  const moduleKeys = new Set(catalog.modules.map((item) => item.key));
  const overrides = new Map();
  if (config.moduleStates == null) {
    return overrides;
  }
  assert(Array.isArray(config.moduleStates), "moduleStates must be an array");
  for (const [index, item] of config.moduleStates.entries()) {
    const path = `moduleStates[${index}]`;
    assert(item && typeof item === "object" && !Array.isArray(item), `${path} must be an object`);
    assert(typeof item.moduleKey === "string" && item.moduleKey.trim() !== "", `${path}.moduleKey must be set`);
    const moduleKey = item.moduleKey.trim();
    assert(moduleKeys.has(moduleKey), `${path}.moduleKey contains unknown module ${moduleKey}`);
    assert(!overrides.has(moduleKey), `${path}.moduleKey must not be duplicated`);
    assert(typeof item.state === "string" && item.state.trim() !== "", `${path}.state must be set`);
    const state = item.state.trim();
    assert(["enabled", "read_only", "disabled"].includes(state), `${path}.state must be enabled, read_only or disabled`);
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (state !== "enabled") {
      assert(reason !== "", `${path}.reason must be set for read_only or disabled module`);
    }
    overrides.set(moduleKey, { state, reason });
  }
  return overrides;
}

function moduleStatesFromCatalog(catalog, config = {}) {
  const overrides = moduleStateOverridesFromPackage(config, catalog);
  return catalog.modules.map((item) => ({
    module_key: item.key,
    contract_version: catalog.catalogKey,
    state: overrides.get(item.key)?.state || "enabled",
    reason:
      overrides.get(item.key)?.reason ||
      "compiled from tracked customer package catalog",
  }));
}

function knownRoleKeys() {
  return new Set(Object.values(ROLE_KEY_BY_POOL));
}

function knownWorkPoolKeys(catalog) {
  return new Set([
    ...catalog.workPools.map((pool) => pool.key),
    ...RUNTIME_PROCESS_POOL_KEYS,
  ]);
}

function customerWorkPoolRoleOverrides(config, catalog) {
  const overrides = config.workPoolRoleOverrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }
  const roleKeys = knownRoleKeys();
  const poolKeys = knownWorkPoolKeys(catalog);
  return Object.fromEntries(
    Object.entries(overrides).map(([poolKey, roleKey]) => {
      assert(poolKeys.has(poolKey), `workPoolRoleOverrides.${poolKey} must reference a registered work pool`);
      assert(roleKeys.has(roleKey), `workPoolRoleOverrides.${poolKey} must map to a registered role key`);
      return [poolKey, roleKey];
    }),
  );
}

function roleKeyForPool(poolKey, overrides = {}) {
  return overrides[poolKey] || ROLE_KEY_BY_POOL[poolKey];
}

function configuredRoleProfiles(config) {
  if (!Array.isArray(config.roleProfiles)) {
    return new Map();
  }
  return new Map(config.roleProfiles.map((profile) => [profile.roleKey, profile]));
}

function roleCapabilitiesSatisfyPage(page, capabilityKeys) {
  const requiredAll = uniqueSorted(page.requiredCapabilityKeys || []);
  const requiredAny = uniqueSorted(page.requiredAnyCapabilityKeys || []);
  return (
    requiredAll.every((capabilityKey) => capabilityKeys.has(capabilityKey)) &&
    (requiredAny.length === 0 ||
      requiredAny.some((capabilityKey) => capabilityKeys.has(capabilityKey)))
  );
}

function rolePageProjectionsFromPackage(config, catalog) {
  const pagesByKey = new Map(catalog.pages.map((page) => [page.key, page]));
  const configuredProfiles = configuredRoleProfiles(config);
  const projections = {};
  for (const pool of catalog.workPools) {
    const roleKey = ROLE_KEY_BY_POOL[pool.key];
    assert(roleKey, `work pool ${pool.key} does not have a role key mapping`);
    const profile = configuredProfiles.get(roleKey);
    const capabilityKeys = new Set(
      uniqueSorted(profile?.capabilityKeys || ROLE_CAPABILITY_KEYS_BY_POOL[roleKey] || []),
    );
    const pageKeys = profile
      ? uniqueSorted(profile.menuSurfaces || [])
      : uniqueSorted(
        catalog.pages
          .filter((page) => roleCapabilitiesSatisfyPage(page, capabilityKeys))
          .map((page) => page.key),
      );
    assert(pageKeys.length > 0, `${roleKey} role profile must resolve at least one runtime page`);
    for (const pageKey of pageKeys) {
      const page = pagesByKey.get(pageKey);
      assert(page, `${roleKey}.menuSurfaces contains unknown runtime page: ${pageKey}`);
      assert(
        roleCapabilitiesSatisfyPage(page, capabilityKeys),
        `${roleKey} page ${pageKey} does not satisfy its required capability contract`,
      );
    }
    projections[roleKey] = pageKeys;
  }
  return projections;
}

function roleProfilesFromPackage(config, catalog) {
  const configuredProfiles = configuredRoleProfiles(config);
  return catalog.workPools.map((pool) => {
    const roleKey = ROLE_KEY_BY_POOL[pool.key];
    assert(roleKey, `work pool ${pool.key} does not have a role key mapping`);
    const configured = configuredProfiles.get(roleKey);
    return {
      role_key: roleKey,
      display_name: configured?.displayName || pool.label,
      disabled: configured?.disabled === true,
      bundle_keys: uniqueSorted(configured?.ownerPools || [pool.key]),
      revokes: uniqueSorted(configured?.revokes || []),
    };
  });
}

function selectedProcessPoolDefinitions(runtimeProcessSelections = []) {
  const processPools = [];
  const salesSelection = runtimeProcessSelections.find(
    (selection) => selection.process_key === SALES_ORDER_ACCEPTANCE_PROCESS_KEY,
  );
  if (salesSelection) {
    const runtimePoolKeys = new Set([
      "order_approval",
      "order_review",
      ...(salesSelection.variant_key === "approval_engineering_pmc"
        ? ["engineering_data"]
        : []),
    ]);
    processPools.push(
      ...SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS.filter((pool) =>
        runtimePoolKeys.has(pool.pool_key),
      ),
    );
  }
  if (
    runtimeProcessSelections.some(
      (selection) => selection.process_key === MATERIAL_SUPPLY_PROCESS_KEY,
    )
  ) {
    processPools.push(...MATERIAL_SUPPLY_EVIDENCE_OWNER_POOLS);
  }
  if (
    runtimeProcessSelections.some(
      (selection) => selection.process_key === FINISHED_GOODS_DELIVERY_PROCESS_KEY,
    )
  ) {
    processPools.push(...FINISHED_GOODS_DELIVERY_EVIDENCE_OWNER_POOLS);
  }
  return processPools;
}

function processWorkPoolsFromSelections(runtimeProcessSelections = []) {
  const processPools = selectedProcessPoolDefinitions(runtimeProcessSelections);
  return processPools.map((pool) => ({
    pool_key: pool.pool_key,
    module_key: pool.module_key,
    display_name: pool.display_name,
    description: pool.description,
    source_pool_key: pool.source_pool_key,
  }));
}

function workPoolsFromCatalog(catalog, runtimeProcessSelections = []) {
  const catalogPools = catalog.workPools.map((pool) => {
    const moduleKey = MODULE_KEY_BY_POOL[pool.key];
    assert(moduleKey, `work pool ${pool.key} does not have a module key mapping`);
    return {
      pool_key: pool.key,
      module_key: moduleKey,
      display_name: pool.label,
      description: "compiled responsibility pool from tracked customer package catalog",
    };
  });
  return [
    ...catalogPools,
    ...processWorkPoolsFromSelections(runtimeProcessSelections),
  ];
}

function processWorkPoolMembershipsFromSelections(
  runtimeProcessSelections = [],
  priorityOffset = 0,
  overrides = {},
) {
  const processPools = selectedProcessPoolDefinitions(runtimeProcessSelections);
  return processPools.map((pool, index) => {
    const roleKey = roleKeyForPool(pool.pool_key, overrides) || roleKeyForPool(pool.source_pool_key, overrides);
    assert(
      roleKey,
      `process owner pool ${pool.pool_key} source pool ${pool.source_pool_key} does not map to a role key`,
    );
    return {
      pool_key: pool.pool_key,
      role_key: roleKey,
      user_id: 0,
      strategy: "process_role_pool",
      priority: priorityOffset + index + 1,
      enabled: true,
    };
  });
}

function workPoolMembershipsFromCatalog(
  catalog,
  runtimeProcessSelections = [],
  overrides = {},
) {
  const catalogMemberships = catalog.workPools.map((pool, index) => ({
    pool_key: pool.key,
    role_key: roleKeyForPool(pool.key, overrides),
    user_id: 0,
    strategy: "role_pool",
    priority: index + 1,
    enabled: true,
  }));
  return [
    ...catalogMemberships,
    ...processWorkPoolMembershipsFromSelections(
      runtimeProcessSelections,
      catalogMemberships.length,
      overrides,
    ),
  ];
}

function accessEntitlementsFromPackage(config, catalog, customerKey) {
  const configuredProfiles = configuredRoleProfiles(config);
  return catalog.workPools.flatMap((pool) => {
    const roleKey = ROLE_KEY_BY_POOL[pool.key];
    const configured = configuredProfiles.get(roleKey);
    const capabilityKeys = uniqueSorted(configured?.capabilityKeys || ROLE_CAPABILITY_KEYS_BY_POOL[pool.key] || []);
    return capabilityKeys.map((capabilityKey) => ({
      role_key: roleKey,
      capability_key: capabilityKey,
      scope_type: "customer",
      scope_value: customerKey,
      constraints: {
        source: "compiled_customer_package",
        runtime_enforced: true,
      },
      enabled: true,
    }));
  });
}

function fieldPoliciesFromCatalog(catalog, config = {}) {
  const overrides = new Map(
    (Array.isArray(config.fieldPolicyOverrides)
      ? config.fieldPolicyOverrides
      : []
    ).map((override) => [
      `${override.surfaceKey}.${override.fieldKey}`,
      override,
    ]),
  );
  const policies = {};
  for (const surface of [...catalog.fieldPolicySurfaces].sort((left, right) =>
    left.key.localeCompare(right.key),
  )) {
    const fieldPolicies = {};
    for (const fieldKey of [...surface.fieldKeys].sort()) {
      const override = overrides.get(`${surface.key}.${fieldKey}`);
      fieldPolicies[fieldKey] = {
        visible: override?.visible ?? true,
      };
    }
    policies[surface.key] = fieldPolicies;
  }
  return policies;
}

function runtimePagesFromCatalog(catalog) {
  return catalog.pages.map((item) => item.key);
}

function runtimeProcessSelectionsFromPackage(config) {
  return (config.runtimeProcessSelections || []).map((selection) => ({
    process_key: selection.processKey,
    process_version: selection.processVersion,
    variant_key: selection.variantKey,
    business_ref_type: selection.businessRefType,
  }));
}

function flowCatalogFromPackage(config) {
  return {
    runtime_enabled: false,
    catalog_status: "preview_only",
    business_flows: config.businessFlows.map((flow) => ({
      key: flow.key,
      label: flow.label,
      status: flow.status,
      modules: [...flow.modules],
      guardrail: flow.guardrail,
    })),
    state_machines: config.stateMachines.map((stateMachine) => ({
      key: stateMachine.key,
      label: stateMachine.label,
      status: stateMachine.status,
      states: [...stateMachine.states],
      transitions: stateMachine.transitions.map((transition) => [...transition]),
      guardrail: stateMachine.guardrail,
    })),
  };
}

function normalizeProcessPolicyRule(rule) {
  const normalized = {};
  for (const key of customerPackageSchema.allowedProcessPolicyRuleKeys) {
    if (rule[key] != null) {
      normalized[key] = String(rule[key]).trim();
    }
  }
  return normalized;
}

function policyCatalogFromPackage(config) {
  return {
    runtime_enabled: false,
    catalog_status: "preview_only",
    process_policies: config.processPolicies.map((policy) => ({
      key: policy.key,
      kind: policy.kind,
      label: policy.label,
      status: policy.status,
      runtime_enabled: false,
      rule_count: policy.rules.length,
      rules: policy.rules.map((rule) => normalizeProcessPolicyRule(rule)),
      guardrail: policy.guardrail,
    })),
  };
}

function extensionPointCatalogFromPackage(config) {
  const extensionRuntimeBlockers = [
    "no_reviewed_extension_contract",
    "customer_package_handler_forbidden",
    "registered_deployment_package_required",
  ];

  return {
    runtime_enabled: false,
    catalog_status:
      config.extensionPoints.length > 0 ? "contract_preview_only" : "controlled_empty",
    implementation_source: "registered_deployment_package_required",
    handler_allowed: false,
    customer_package_handler_allowed: false,
    blocked_reasons: [...extensionRuntimeBlockers],
    extension_points: config.extensionPoints.map((extensionPoint) => ({
      key: extensionPoint.key,
      label: extensionPoint.label,
      status: extensionPoint.status,
      runtime_enabled: extensionPoint.runtimeEnabled,
      implementation_source: "registered_deployment_package_required",
      handler_allowed: false,
      customer_package_handler_allowed: false,
      blocked_reasons: [...extensionRuntimeBlockers],
      guardrail: extensionPoint.guardrail,
    })),
  };
}

function printTemplateDefaultsFromPackage(config) {
  const templates = (Array.isArray(config.printTemplateDefaults)
    ? config.printTemplateDefaults
    : []
  ).map((item) => ({
    template_key: item.templateKey,
    status: "effective_session_projected",
    runtime_consumed: true,
    party_defaults: Object.fromEntries(
      Object.entries(item.partyDefaults || {}).filter(
        ([, value]) => typeof value === "string" && value.trim() !== "",
      ),
    ),
    supplier_defaults_allowed: false,
    guardrail: item.guardrail,
  }));

  return {
    runtime_enabled: templates.length > 0,
    catalog_status:
      templates.length > 0
        ? "effective_session_projected"
        : "controlled_empty",
    source: "customer_package_print_template_defaults",
    formal_runtime_consumed: templates.length > 0,
    sales_order_print_template_enabled: false,
    templates,
    guardrail:
      "Customer package print defaults provide customer-specific buyer party display defaults through the reviewed customer_config effective session projection; supplier snapshots still come from business records.",
  };
}

function compiledSnapshotFromPackage(
  config,
  catalog,
  runtimeProcessSelections = [],
  { applyPurpose = "" } = {},
) {
  const snapshot = {
    customer: {
      key: config.customerKey,
      name: config.label,
      packageKey: config.packageKey,
    },
    package: {
      key: config.packageKey,
      status: config.status,
      runtimeEnabled: config.runtimeEnabled,
      previewOnly: config.sourcePolicy.previewOnly,
      publishEnabled: config.sourcePolicy.publishEnabled,
    },
    pages: runtimePagesFromCatalog(catalog),
    rolePageProjections: rolePageProjectionsFromPackage(config, catalog),
    modules: catalog.modules.map((item) => ({
      key: item.key,
      label: item.label,
      layer: item.layer,
    })),
    fieldPolicies: fieldPoliciesFromCatalog(catalog, config),
    workPoolRoleOverrides: customerWorkPoolRoleOverrides(config, catalog),
    runtimeProcessSelections,
    flowCatalog: flowCatalogFromPackage(config),
    policyCatalog: policyCatalogFromPackage(config),
    extensionPointCatalog: extensionPointCatalogFromPackage(config),
    printTemplateDefaults: printTemplateDefaultsFromPackage(config),
    preview: buildPreview(config),
  };
  if (applyPurpose) {
    snapshot.applyPurpose = applyPurpose;
  }
  return snapshot;
}

function createManifestProjection(
  config,
  catalog,
  {
    publishable,
    productVersion = FORMAL_PRODUCT_VERSION,
    applyPurpose = "",
  },
) {
  const runtimeProcessSelections = runtimeProcessSelectionsFromPackage(config);
  const workPoolRoleOverrides = customerWorkPoolRoleOverrides(config, catalog);
  return {
    manifest_schema_version: MANIFEST_SCHEMA_VERSION,
    process_contract_version: PROCESS_CONTRACT_VERSION,
    manifest_status: publishable ? "runtime_compile_ready" : "preview_only",
    runtime_enabled: publishable,
    publishable,
    customer_key: config.customerKey,
    revision: packageRevision(config),
    product_version: productVersion,
    compiled_snapshot: compiledSnapshotFromPackage(
      config,
      catalog,
      runtimeProcessSelections,
      { applyPurpose },
    ),
    module_states: moduleStatesFromCatalog(catalog, config),
    role_profiles: roleProfilesFromPackage(config, catalog),
    access_entitlements: accessEntitlementsFromPackage(config, catalog, config.customerKey),
    work_pools: workPoolsFromCatalog(catalog, runtimeProcessSelections),
    work_pool_memberships: workPoolMembershipsFromCatalog(
      catalog,
      runtimeProcessSelections,
      workPoolRoleOverrides,
    ),
  };
}

function buildManifestProjection(config, catalog, { publishable }) {
  const manifest = createManifestProjection(config, catalog, { publishable });
  validateRuntimeManifest(manifest, { publishable, purpose: "formal" });
  return manifest;
}

function buildRuntimeManifest(config, catalog = customerPackageCatalog) {
  validateCatalog(catalog);
  validatePackage(config, catalog, customerPackageSchema, {
    allowReleaseReady: true,
  });
  assert(
    config.status === "release_ready" &&
      config.runtimeEnabled === true &&
      config.sourcePolicy.previewOnly === false &&
      config.sourcePolicy.publishEnabled === true,
    "formal runtime compile requires a release-ready package with runtime and publish enabled",
  );
  return buildManifestProjection(config, catalog, { publishable: true });
}

function buildRuntimePreviewManifest(
  config,
  catalog = customerPackageCatalog,
) {
  validateCatalog(catalog);
  validatePackage(config, catalog);
  return buildManifestProjection(config, catalog, { publishable: false });
}

function buildLocalTestApplyRuntimeManifest(
  config,
  catalog = customerPackageCatalog,
) {
  validateCatalog(catalog);
  validatePackage(config, catalog);
  assert(
    config.sourcePolicy?.localTestApplyEnabled === true,
    "local test apply requires an explicitly enabled tracked customer package",
  );
  const manifest = createManifestProjection(config, catalog, {
    publishable: true,
    productVersion: LOCAL_TEST_PRODUCT_VERSION,
    applyPurpose: LOCAL_TEST_APPLY_PURPOSE,
  });
  manifest.revision = localTestApplyRevision(config, manifest);
  validateRuntimeManifest(manifest, {
    publishable: true,
    purpose: LOCAL_TEST_APPLY_PURPOSE,
  });
  return manifest;
}

function assertNoForbiddenKeys(value, currentPath = "runtimeManifest") {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    assert(
      !FORBIDDEN_RUNTIME_KEYS.includes(key),
      `${currentPath}.${key} must not embed raw rows, secrets, SQL or executable code payloads`,
    );
    assertNoForbiddenKeys(nestedValue, `${currentPath}.${key}`);
  }
}

function roleHasCapability(manifest, roleKey, capabilityKey) {
  return manifest.access_entitlements.some(
    (item) =>
      item.role_key === roleKey &&
      item.capability_key === capabilityKey &&
      item.scope_value === manifest.customer_key &&
      item.enabled === true,
  );
}

function validateFlowAndPolicyCatalogs(manifest) {
  const flowCatalog = manifest.compiled_snapshot.flowCatalog;
  assert(flowCatalog && typeof flowCatalog === "object", "compiled_snapshot.flowCatalog must exist");
  assert(flowCatalog.runtime_enabled === false, "flowCatalog must not enable runtime flow execution");
  assert(flowCatalog.catalog_status === "preview_only", "flowCatalog must stay preview_only");
  assert(Array.isArray(flowCatalog.business_flows), "flowCatalog.business_flows must be an array");
  assert(Array.isArray(flowCatalog.state_machines), "flowCatalog.state_machines must be an array");
  for (const stateMachine of flowCatalog.state_machines) {
    assert(stateMachine.status === "preview_only", `${stateMachine.key}.status must stay preview_only`);
    assert(Array.isArray(stateMachine.states) && stateMachine.states.length > 0, `${stateMachine.key}.states must not be empty`);
    assert(Array.isArray(stateMachine.transitions), `${stateMachine.key}.transitions must be an array`);
  }

  const policyCatalog = manifest.compiled_snapshot.policyCatalog;
  assert(policyCatalog && typeof policyCatalog === "object", "compiled_snapshot.policyCatalog must exist");
  assert(policyCatalog.runtime_enabled === false, "policyCatalog must not enable arbitrary policy execution");
  assert(policyCatalog.catalog_status === "preview_only", "policyCatalog must stay preview_only");
  assert(Array.isArray(policyCatalog.process_policies), "policyCatalog.process_policies must be an array");
  const allowedPolicyKeys = new Set(customerPackageCatalog.policies.map((policy) => policy.key));
  for (const policy of policyCatalog.process_policies) {
    assert(allowedPolicyKeys.has(policy.key), `policyCatalog references unknown policy: ${policy.key}`);
    assert(policy.status === "preview_only", `${policy.key}.status must stay preview_only`);
    assert(policy.runtime_enabled === false, `${policy.key}.runtime_enabled must stay false`);
    assert(policy.rule_count > 0, `${policy.key}.rule_count must be positive`);
    assert(Array.isArray(policy.rules), `${policy.key}.rules must be an array`);
    assert(policy.rules.length === policy.rule_count, `${policy.key}.rules must match rule_count`);
    for (const [ruleIndex, rule] of policy.rules.entries()) {
      const rulePath = `${policy.key}.rules[${ruleIndex}]`;
      assert(rule && typeof rule === "object" && !Array.isArray(rule), `${rulePath} must be a rule object`);
      assert(
        customerPackageSchema.requiredProcessPolicyRuleTriggerKeys.some(
          (key) => typeof rule[key] === "string" && rule[key].trim() !== "",
        ),
        `${rulePath} must declare key or when`,
      );
      assert(
        customerPackageSchema.requiredProcessPolicyRuleResultKeys.some(
          (key) => typeof rule[key] === "string" && rule[key].trim() !== "",
        ),
        `${rulePath} must declare decision or action`,
      );
      for (const [key, value] of Object.entries(rule)) {
        assert(
          customerPackageSchema.allowedProcessPolicyRuleKeys.includes(key),
          `${rulePath}.${key} is not an allowed policy rule field`,
        );
        assert(typeof value === "string" && value.trim() !== "", `${rulePath}.${key} must be a non-empty string`);
      }
    }
  }

  const extensionPointCatalog = manifest.compiled_snapshot.extensionPointCatalog;
  assert(
    extensionPointCatalog && typeof extensionPointCatalog === "object",
    "compiled_snapshot.extensionPointCatalog must exist",
  );
  assert(
    extensionPointCatalog.runtime_enabled === false,
    "extensionPointCatalog must not enable customer code execution",
  );
  assert(
    ["controlled_empty", "contract_preview_only"].includes(extensionPointCatalog.catalog_status),
    "extensionPointCatalog must declare controlled_empty or contract_preview_only until reviewed extension contracts exist",
  );
  assert(Array.isArray(extensionPointCatalog.extension_points), "extensionPointCatalog.extension_points must be an array");
  assert(
    extensionPointCatalog.extension_points.length > 0 ||
      extensionPointCatalog.catalog_status === "controlled_empty",
    "extensionPointCatalog must declare controlled_empty when no extension points are bound",
  );
  assert(
    extensionPointCatalog.extension_points.length === 0 ||
      extensionPointCatalog.catalog_status === "contract_preview_only",
    "extensionPointCatalog must declare contract_preview_only when extension points are bound",
  );
  assert(
    extensionPointCatalog.implementation_source === "registered_deployment_package_required",
    "extensionPointCatalog must require registered deployment packages for implementations",
  );
  assert(
    extensionPointCatalog.handler_allowed === false,
    "extensionPointCatalog must not allow executable handlers",
  );
  assert(
    extensionPointCatalog.customer_package_handler_allowed === false,
    "extensionPointCatalog must not allow handlers from customer packages",
  );
  assert(
    Array.isArray(extensionPointCatalog.blocked_reasons) &&
      extensionPointCatalog.blocked_reasons.includes("no_reviewed_extension_contract") &&
      extensionPointCatalog.blocked_reasons.includes("customer_package_handler_forbidden") &&
      extensionPointCatalog.blocked_reasons.includes("registered_deployment_package_required"),
    "extensionPointCatalog.blocked_reasons must explain why runtime extensions stay blocked",
  );
  for (const extensionPoint of extensionPointCatalog.extension_points) {
    assert(extensionPoint.runtime_enabled === false, `${extensionPoint.key}.runtime_enabled must stay false`);
    assert(extensionPoint.handler == null, `${extensionPoint.key} must not publish executable handlers`);
    assert(extensionPoint.module == null, `${extensionPoint.key} must not publish executable modules`);
    assert(
      extensionPoint.implementation_source === "registered_deployment_package_required",
      `${extensionPoint.key}.implementation_source must require registered deployment packages`,
    );
    assert(extensionPoint.handler_allowed === false, `${extensionPoint.key}.handler_allowed must stay false`);
    assert(
      extensionPoint.customer_package_handler_allowed === false,
      `${extensionPoint.key}.customer_package_handler_allowed must stay false`,
    );
    assert(
      Array.isArray(extensionPoint.blocked_reasons) &&
        extensionPoint.blocked_reasons.includes("no_reviewed_extension_contract") &&
        extensionPoint.blocked_reasons.includes("customer_package_handler_forbidden") &&
        extensionPoint.blocked_reasons.includes("registered_deployment_package_required"),
      `${extensionPoint.key}.blocked_reasons must explain why runtime extension stays blocked`,
    );
  }
}

function validateRuntimeProcessSelections(manifest) {
  assert(
    manifest.compiled_snapshot.processDefinitions == null,
    "compiled_snapshot must not publish customer-defined process node graphs",
  );
  const selections = manifest.compiled_snapshot.runtimeProcessSelections;
  assert(
    Array.isArray(selections),
    "compiled_snapshot.runtimeProcessSelections must be an array",
  );
  const allowedContracts = new Map(
    customerPackageSchema.allowedRuntimeProcessSelections.map((selection) => [
      `${selection.processKey}/${selection.processVersion}`,
      selection,
    ]),
  );
  const selectedProcessKeys = new Set();
  for (const [index, selection] of selections.entries()) {
    const selectionPath = `compiled_snapshot.runtimeProcessSelections[${index}]`;
    assert(
      selection && typeof selection === "object" && !Array.isArray(selection),
      `${selectionPath} must be an object`,
    );
    assert(
      JSON.stringify(Object.keys(selection).sort()) ===
        JSON.stringify([
          "business_ref_type",
          "process_key",
          "process_version",
          "variant_key",
        ]),
      `${selectionPath} must contain selection identifiers only`,
    );
    assert(
      !selectedProcessKeys.has(selection.process_key),
      `${selectionPath}.process_key must not be duplicated`,
    );
    selectedProcessKeys.add(selection.process_key);
    const contract = allowedContracts.get(
      `${selection.process_key}/${selection.process_version}`,
    );
    assert(
      contract,
      `${selectionPath} must select a registered process/version`,
    );
    assert(
      contract.variantKeys.includes(selection.variant_key),
      `${selectionPath}.variant_key is not registered`,
    );
    assert(
      selection.business_ref_type === contract.businessRefType,
      `${selectionPath}.business_ref_type must be ${contract.businessRefType}`,
    );
  }
}

function assertNoLegacyRuntimeGraphMetadata(
  value,
  currentPath = "runtimeManifest",
) {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    assert(
      key !== "processDefinitions" && !key.startsWith("runtime_loader"),
      `${currentPath}.${key} must not publish customer-defined runtime graph metadata`,
    );
    assert(
      nestedValue !== "runtime_loader_ready" &&
        nestedValue !== "runtime_loader_start_ready",
      `${currentPath}.${key} must not claim runtime loader readiness`,
    );
    assertNoLegacyRuntimeGraphMetadata(nestedValue, `${currentPath}.${key}`);
  }
}

function validateRuntimeManifest(
  manifest,
  { publishable = true, purpose = "formal" } = {},
) {
  assert(
    purpose === "formal" || purpose === LOCAL_TEST_APPLY_PURPOSE,
    "runtime manifest validation purpose is unsupported",
  );
  assert(
    manifest.manifest_schema_version === MANIFEST_SCHEMA_VERSION,
    `manifest_schema_version must be ${MANIFEST_SCHEMA_VERSION}`,
  );
  assert(
    manifest.process_contract_version === PROCESS_CONTRACT_VERSION,
    `process_contract_version must be ${PROCESS_CONTRACT_VERSION}`,
  );
  assert(manifest.publishable === publishable, "publishable must match compile mode");
  assert(manifest.runtime_enabled === publishable, "runtime_enabled must match compile mode");
  assert(
    manifest.manifest_status ===
      (publishable ? "runtime_compile_ready" : "preview_only"),
    "manifest_status must match compile mode",
  );
  assert(typeof manifest.customer_key === "string" && manifest.customer_key.trim() !== "", "customer_key must be set");
  assert(typeof manifest.revision === "string" && manifest.revision.trim() !== "", "revision must be set");
  const formalRevisionPattern =
    /^[a-z0-9]+(?:-[a-z0-9]+)*-package-v[1-9][0-9]*\.runtime-manifest-v1$/u;
  const localTestRevisionPattern =
    /^[a-z0-9]+(?:-[a-z0-9]+)*-package-v[1-9][0-9]*\.local-[a-f0-9]{16}\.runtime-v1$/u;
  assert(
    manifest.revision.length <= 64,
    "revision must fit the customer_config_revisions schema limit",
  );
  assert(
    manifest.revision.startsWith(`${manifest.customer_key}-`) &&
      (purpose === LOCAL_TEST_APPLY_PURPOSE
        ? localTestRevisionPattern.test(manifest.revision)
        : formalRevisionPattern.test(manifest.revision)),
    "revision must be namespaced by customer_key and derive from the expected versioned package identity",
  );
  assert(
    manifest.product_version ===
      (purpose === LOCAL_TEST_APPLY_PURPOSE
        ? LOCAL_TEST_PRODUCT_VERSION
        : FORMAL_PRODUCT_VERSION),
    "product_version must match the runtime manifest purpose",
  );
  assert(manifest.compiled_snapshot && typeof manifest.compiled_snapshot === "object", "compiled_snapshot must exist");
  assert(
    manifest.compiled_snapshot.customer?.key === manifest.customer_key,
    "compiled_snapshot.customer.key must match customer_key",
  );
  const packageSnapshot = manifest.compiled_snapshot.package;
  assert(
    packageSnapshot && typeof packageSnapshot === "object",
    "compiled_snapshot.package must exist",
  );
  if (purpose === LOCAL_TEST_APPLY_PURPOSE) {
    assert(
      manifest.compiled_snapshot.applyPurpose === LOCAL_TEST_APPLY_PURPOSE,
      "local test manifest must declare its apply purpose",
    );
    assert(
      packageSnapshot.status !== "release_ready" &&
        packageSnapshot.runtimeEnabled === false &&
        packageSnapshot.previewOnly === true &&
        packageSnapshot.publishEnabled === false,
      "local test manifest must preserve the tracked draft package boundary",
    );
  } else {
    assert(
      manifest.compiled_snapshot.applyPurpose == null,
      "formal runtime manifest must not carry a local test apply purpose",
    );
    if (publishable) {
      assert(
        packageSnapshot.status === "release_ready" &&
          packageSnapshot.runtimeEnabled === true &&
          packageSnapshot.previewOnly === false &&
          packageSnapshot.publishEnabled === true,
        "formal publishable manifest requires a release-ready package snapshot",
      );
    }
  }
  assert(Array.isArray(manifest.compiled_snapshot.pages), "compiled_snapshot.pages must be an array");
  const pageKeys = uniqueSorted(manifest.compiled_snapshot.pages);
  assert(pageKeys.length > 0, "compiled_snapshot.pages must not be empty");
  const allowedPageKeys = new Set(RUNTIME_PAGE_KEYS);
  for (const pageKey of pageKeys) {
    assert(allowedPageKeys.has(pageKey), `compiled_snapshot.pages contains unsupported page key: ${pageKey}`);
  }
  assert(pageKeys.includes("sales-orders"), "compiled_snapshot.pages must include formal ERP page keys");
  assert(Array.isArray(manifest.module_states) && manifest.module_states.length > 0, "module_states must not be empty");
  assert(Array.isArray(manifest.role_profiles) && manifest.role_profiles.length > 0, "role_profiles must not be empty");
  assert(Array.isArray(manifest.access_entitlements) && manifest.access_entitlements.length > 0, "access_entitlements must not be empty");
  assert(Array.isArray(manifest.work_pools) && manifest.work_pools.length > 0, "work_pools must not be empty");
  assert(
    Array.isArray(manifest.work_pool_memberships) && manifest.work_pool_memberships.length > 0,
    "work_pool_memberships must not be empty",
  );
  const roleKeys = new Set(manifest.role_profiles.map((item) => item.role_key));
  for (const profile of manifest.role_profiles) {
    assert(profile.grants == null, `${profile.role_key} role profile must not duplicate entitlement grants`);
    assert(Array.isArray(profile.bundle_keys), `${profile.role_key} role profile bundle_keys must be an array`);
    assert(Array.isArray(profile.revokes), `${profile.role_key} role profile revokes must be an array`);
  }
  const rolePageProjections = manifest.compiled_snapshot.rolePageProjections;
  assert(
    rolePageProjections && typeof rolePageProjections === "object" && !Array.isArray(rolePageProjections),
    "compiled_snapshot.rolePageProjections must be an object",
  );
  for (const [roleKey, projectedPages] of Object.entries(rolePageProjections)) {
    assert(roleKeys.has(roleKey), `rolePageProjections contains unknown role: ${roleKey}`);
    assert(Array.isArray(projectedPages) && projectedPages.length > 0, `${roleKey} page projection must not be empty`);
    for (const pageKey of projectedPages) {
      assert(allowedPageKeys.has(pageKey), `${roleKey} page projection contains unsupported page: ${pageKey}`);
    }
  }
  assert(roleKeys.has("purchase"), "purchase work pool must map to backend purchase role key");
  assert(roleKeys.has("engineering"), "engineering work pool must map to backend engineering role key");
  assert(!roleKeys.has("purchasing"), "runtime manifest must not publish frontend-only purchasing app key");
  const workPoolKeys = new Set(manifest.work_pools.map((item) => item.pool_key));
  const membershipPoolKeys = new Set(manifest.work_pool_memberships.map((item) => item.pool_key));
  const entitlementRoleKeys = new Set(manifest.access_entitlements.map((item) => item.role_key));
  for (const pool of manifest.work_pools) {
    assert(
      membershipPoolKeys.has(pool.pool_key),
      `work pool ${pool.pool_key} must have at least one membership`,
    );
  }
  for (const membership of manifest.work_pool_memberships) {
    assert(workPoolKeys.has(membership.pool_key), `work pool membership references unknown pool: ${membership.pool_key}`);
    assert(roleKeys.has(membership.role_key), `work pool membership references unknown role: ${membership.role_key}`);
    assert(membership.enabled === true, `work pool membership ${membership.pool_key}/${membership.role_key} must stay enabled`);
  }
  for (const roleKey of roleKeys) {
    assert(entitlementRoleKeys.has(roleKey), `role profile ${roleKey} must have access entitlements`);
  }
  for (const entitlement of manifest.access_entitlements) {
    assert(roleKeys.has(entitlement.role_key), `access entitlement references unknown role: ${entitlement.role_key}`);
    assert(entitlement.scope_type === "customer", "access entitlement scope_type must be customer");
    assert(entitlement.enabled === true, `access entitlement ${entitlement.role_key}/${entitlement.capability_key} must stay enabled`);
  }
  const engineeringEntitlements = manifest.access_entitlements.filter((item) => item.role_key === "engineering");
  assert(
    manifest.access_entitlements.every((item) => item.scope_value === manifest.customer_key),
    "access entitlement scope_value must match customer_key",
  );
  for (const membership of manifest.work_pool_memberships) {
    const capabilities = manifest.access_entitlements
      .filter((item) => item.role_key === membership.role_key)
      .map((item) => item.capability_key);
    assert(
      capabilities.includes("workflow.task.read"),
      `work pool role ${membership.role_key} must have workflow.task.read`,
    );
    assert(
      capabilities.includes("workflow.task.update"),
      `work pool role ${membership.role_key} must have workflow.task.update`,
    );
  }
  assert(
    engineeringEntitlements.some((item) => item.capability_key === "mobile.engineering.access"),
    "engineering role must receive mobile engineering access entitlement",
  );
  const fieldPolicies = manifest.compiled_snapshot.fieldPolicies;
  assert(
    fieldPolicies && typeof fieldPolicies === "object" && !Array.isArray(fieldPolicies),
    "compiled_snapshot.fieldPolicies must be an object",
  );
  assert(
    fieldPolicies["customers.default"],
    "fieldPolicies must include the current customers runtime surface",
  );
  assert(
    fieldPolicies["suppliers.default"],
    "fieldPolicies must include the current suppliers runtime surface",
  );
  assert(
    fieldPolicies["sales_orders.default"],
    "fieldPolicies must include the current sales orders runtime surface",
  );
  assert(
    !fieldPolicies["sales_order_items.default"],
    "fieldPolicies must not publish sales order item draft fields before a runtime surface consumes them",
  );
  validateFlowAndPolicyCatalogs(manifest);
  validateRuntimeProcessSelections(manifest);
  const printTemplateDefaults = manifest.compiled_snapshot.printTemplateDefaults;
  assert(
    printTemplateDefaults && typeof printTemplateDefaults === "object" && !Array.isArray(printTemplateDefaults),
    "compiled_snapshot.printTemplateDefaults must exist",
  );
  const hasPrintTemplates = printTemplateDefaults.templates.length > 0;
  assert(
    printTemplateDefaults.runtime_enabled === hasPrintTemplates,
    "printTemplateDefaults runtime_enabled must match template presence",
  );
  assert(
    printTemplateDefaults.formal_runtime_consumed === hasPrintTemplates,
    "printTemplateDefaults formal runtime consumption must match effective session projection readiness",
  );
  assert(
    printTemplateDefaults.sales_order_print_template_enabled === false,
    "printTemplateDefaults must not enable sales order print templates",
  );
  assert(Array.isArray(printTemplateDefaults.templates), "printTemplateDefaults.templates must be an array");
  for (const item of printTemplateDefaults.templates) {
    assert(typeof item.template_key === "string" && item.template_key.trim() !== "", "print template default must include template_key");
    assert(
      item.status === "effective_session_projected",
      `${item.template_key} print template default must be projected through effective session`,
    );
    assert(item.runtime_consumed === true, `${item.template_key} print template default must be marked runtime consumed`);
    assert(item.supplier_defaults_allowed === false, `${item.template_key} must not override supplier business snapshots`);
    assert(item.party_defaults && typeof item.party_defaults === "object", `${item.template_key} party_defaults must be an object`);
    assert(Object.keys(item.party_defaults).length > 0, `${item.template_key} party_defaults must not be empty`);
    assert(
      Object.values(item.party_defaults).every(
        (value) => typeof value === "string" && value.trim() !== "",
      ),
      `${item.template_key} party_defaults must omit unconfirmed empty values`,
    );
    assert(typeof item.guardrail === "string" && item.guardrail.trim() !== "", `${item.template_key} guardrail must be set`);
  }
  assertNoForbiddenKeys(manifest);
  assertNoLegacyRuntimeGraphMetadata(manifest);
}

function writeManifest(outPath, manifest) {
  const absoluteOutPath = path.resolve(repoRoot, outPath);
  assert(
    absoluteOutPath.startsWith(path.join(repoRoot, "output") + path.sep),
    "--out must write under output/",
  );
  mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function runCustomerConfigRuntimeManifest(args) {
  const mode = args.mode || (args.out ? "preview" : "validate");
  assert(ALLOWED_MODES.includes(mode), `unsupported mode: ${mode}`);
  assert(!args.out || mode === "preview", "--out requires --mode preview");
  const config = getCustomerPackage(args.customer);
  assert(config, `unknown customer package: ${args.customer}`);
  assert(existsSync(path.join(repoRoot, "server/internal/biz/customer_config.go")), "customer_config usecase must exist");
  const manifest =
    mode === "preview"
      ? buildRuntimePreviewManifest(config)
      : buildRuntimeManifest(config);
  if (mode === "preview" && args.out) {
    writeManifest(args.out, manifest);
  }
  return {
    mode,
    manifest,
  };
}

function normalizeCustomerKeys(args) {
  if (args.all === true) {
    assert(
      !Array.isArray(args.customers) || args.customers.length === 0,
      "--all and --customer are mutually exclusive",
    );
    return listCustomerPackageKeys();
  }
  const requestedCustomers =
    Array.isArray(args.customers) && args.customers.length > 0
      ? args.customers
      : [args.customer || "yoyoosun"];
  const customerKeys = requestedCustomers.map((customerKey) =>
    String(customerKey || "").trim(),
  );
  assert(
    customerKeys.every((customerKey) => customerKey !== ""),
    "--customer must be a non-empty customer key",
  );
  assert(
    new Set(customerKeys).size === customerKeys.length,
    "--customer entries must not be duplicated",
  );
  return customerKeys;
}

function runCustomerConfigRuntimeManifestMany(args) {
  const customerKeys = normalizeCustomerKeys(args);
  assert(
    !args.out || customerKeys.length === 1,
    "--out only supports one customer runtime manifest; run preview once per customer",
  );
  return customerKeys.map((customerKey) =>
    runCustomerConfigRuntimeManifest({
      ...args,
      customer: customerKey,
    }),
  );
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const results = runCustomerConfigRuntimeManifestMany(args);
  for (const result of results) {
    console.log(
      `customer config runtime manifest ${result.mode} ok: ${result.manifest.customer_key}, revision=${result.manifest.revision}, modules=${result.manifest.module_states.length}, roles=${result.manifest.role_profiles.length}, entitlements=${result.manifest.access_entitlements.length}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  LOCAL_TEST_APPLY_PURPOSE,
  RUNTIME_PAGE_KEYS,
  buildLocalTestApplyRuntimeManifest,
  buildRuntimeManifest,
  buildRuntimePreviewManifest,
  runCustomerConfigRuntimeManifest,
  runCustomerConfigRuntimeManifestMany,
  validateRuntimeManifest,
};
