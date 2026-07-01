#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import {
  buildPreview,
  validateCatalog,
  validatePackage,
} from "./customer-package-lint.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const CUSTOMER_PACKAGES = Object.freeze({
  demo: demoCustomerPackage,
  yoyoosun: yoyoosunCustomerPackage,
});

const ALLOWED_MODES = Object.freeze(["validate", "compile", "preview"]);

const ROLE_KEY_BY_POOL = Object.freeze({
  boss: "boss",
  sales: "sales",
  purchase: "purchasing",
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
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.approve",
    "workflow.task.reject",
    "mobile.boss.access",
  ]),
  sales: Object.freeze([
    "customer.read",
    "customer.create",
    "customer.update",
    "contact.read",
    "contact.create",
    "contact.update",
    "sales_order.read",
    "sales_order.create",
    "sales_order.update",
    "sales_order.submit",
    "sales_order.activate",
    "sales_order.close",
    "sales_order.cancel",
    "sales_order_item.read",
    "sales_order_item.create",
    "sales_order_item.update",
    "sales_order_item.cancel",
    "shipment.read",
    "shipment.create",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.sales.access",
  ]),
  purchase: Object.freeze([
    "supplier.read",
    "supplier.create",
    "supplier.update",
    "purchase.order.read",
    "purchase.order.create",
    "purchase.order.update",
    "purchase.receipt.read",
    "purchase.receipt.create",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "mobile.purchase.access",
  ]),
  warehouse: Object.freeze([
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
    "finance.payable.read",
    "finance.payable.confirm",
    "finance.receivable.read",
    "finance.receivable.confirm",
    "finance.report.read",
    "workflow.task.read",
    "workflow.task.update",
    "workflow.task.complete",
    "workflow.task.reject",
    "mobile.finance.access",
  ]),
  pmc: Object.freeze([
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
    "outsourcing.order.read",
    "outsourcing.order.create",
    "outsourcing.order.update",
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

const RUNTIME_PAGE_KEYS = Object.freeze([
  "global-dashboard",
  "task-board",
  "business-dashboard",
  "customers",
  "suppliers",
  "products",
  "materials",
  "processes",
  "sales-orders",
  "material-bom",
  "accessories-purchase",
  "inbound",
  "quality-inspections",
  "inventory",
  "processing-contracts",
  "production-scheduling",
  "production-progress",
  "production-exceptions",
  "shipping-release",
  "outbound",
  "shipments",
  "reconciliation",
  "payables",
  "receivables",
  "invoices",
  "print-center",
  "exception-flow",
  "permission-center",
  "system-audit-logs",
]);

const RUNTIME_FIELD_POLICY_SURFACES = Object.freeze({
  customers: Object.freeze({
    surfaceKey: "customers.default",
    fieldKeys: Object.freeze(["customer_code", "display_name"]),
  }),
  suppliers: Object.freeze({
    surfaceKey: "suppliers.default",
    fieldKeys: Object.freeze(["supplier_code", "supplier_type"]),
  }),
  sales_orders: Object.freeze({
    surfaceKey: "sales_orders.default",
    fieldKeys: Object.freeze(["order_no", "source_no", "expected_ship_date"]),
  }),
});

const RUNTIME_DOMAIN_COMMAND_KEYS = Object.freeze([
  "sales_order.submit",
  "purchase_receipt.create",
  "quality_inspection.decide",
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
  }),
  incoming_qc: Object.freeze({
    command_key: "quality_inspection.decide",
    required_before_runtime_loader: false,
    writes_fact: false,
    runtime_binding_status: "process_runtime_handler_registered",
    process_runtime_handler_registered: true,
    domain_owner: "Quality / InventoryUsecase",
    domain_usecase_binding: "InventoryUsecase.PassQualityInspection / InventoryUsecase.RejectQualityInspection",
    jsonrpc_method: "quality.pass_quality_inspection / quality.reject_quality_inspection",
    required_permission_key: "quality.inspection.update",
    jsonrpc_allowed_permission_keys: Object.freeze(["quality.inspection.update"]),
    stable_business_ref: "quality_inspection_id + purchase_receipt_id + inventory_lot_id",
    idempotency_boundary:
      "quality inspection decision replay is idempotent; future runtime command must still provide process idempotency key",
    required_test_anchors: Object.freeze([
      "server/internal/biz/quality_inspection_process_command_test.go: TestQualityInspectionProcessDomainCommandDecidePassBindsUsecase",
      "server/internal/biz/quality_inspection_process_command_test.go: TestQualityInspectionProcessDomainCommandDecideRejectBindsUsecase",
      "server/internal/biz/quality_inspection_process_command_test.go: TestQualityInspectionProcessDomainCommandDecideRejectsMismatchedStableRefs",
      "server/internal/data/inventory_repo_quality_inspection_test.go: TestInventoryRepo_QualityInspectionLifecycleAndLotStatus",
      "server/internal/service/jsonrpc_quality_test.go: TestJsonrpcDispatcher_QualityInspectionAPIChangesLotStatusWithoutInventoryTxn",
      "server/internal/service/jsonrpc_quality_test.go: TestJsonrpcDispatcher_QualityInspectionAPIRequiresDomainPermissions",
    ]),
    runtime_loader_blockers: Object.freeze([]),
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

function materialSupplyFactCommandContract(nodeKey) {
  const contract = MATERIAL_SUPPLY_FACT_COMMAND_CONTRACTS[nodeKey];
  assert(contract, `material_supply fact command contract missing for ${nodeKey}`);
  return {
    ...contract,
    jsonrpc_allowed_permission_keys: [...contract.jsonrpc_allowed_permission_keys],
    required_test_anchors: [...contract.required_test_anchors],
    runtime_loader_blockers: [...contract.runtime_loader_blockers],
  };
}

function finishedGoodsDeliveryFactCommandContract(nodeKey) {
  const contract = FINISHED_GOODS_DELIVERY_FACT_COMMAND_CONTRACTS[nodeKey];
  assert(contract, `finished_goods_delivery fact command contract missing for ${nodeKey}`);
  return {
    ...contract,
    jsonrpc_allowed_permission_keys: [...contract.jsonrpc_allowed_permission_keys],
    required_test_anchors: [...contract.required_test_anchors],
    runtime_loader_blockers: [...contract.runtime_loader_blockers],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    customer: "yoyoosun",
    mode: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      args.customer = argv[index + 1] || "";
      index += 1;
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
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/customer-config-runtime-manifest.mjs --customer demo
  node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun
  node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json

Modes:
  validate  validate the compiled runtime manifest without writing files
  compile   validate and return the manifest in-process for tests
  preview   validate and optionally write JSON under output/

This tool compiles a tracked customer package into the JSON-RPC payload shape
accepted by customer_config.validate_customer_config / publish_customer_config.
It does not upload files, call the backend, activate a revision, import business
data, or write Workflow / Fact runtime state.`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function packageRevision(config) {
  return `${config.packageKey}.runtime-manifest-v1`;
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

function roleProfilesFromCatalog(catalog) {
  return catalog.workPools.map((pool) => {
    const roleKey = ROLE_KEY_BY_POOL[pool.key];
    assert(roleKey, `work pool ${pool.key} does not have a role key mapping`);
    return {
      role_key: roleKey,
      display_name: pool.label,
      disabled: false,
      bundle_keys: [pool.key],
      grants: uniqueSorted([
        ...catalog.capabilities.map((item) => item.key),
        ...(ROLE_CAPABILITY_KEYS_BY_POOL[pool.key] || []),
      ]),
      revokes: [],
    };
  });
}

function processWorkPoolsFromDefinitions(processDefinitions = {}) {
  const processPools = [];
  if (processDefinitions[SALES_ORDER_ACCEPTANCE_PROCESS_KEY]) {
    processPools.push(...SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS);
  }
  if (processDefinitions[MATERIAL_SUPPLY_PROCESS_KEY]) {
    processPools.push(...MATERIAL_SUPPLY_EVIDENCE_OWNER_POOLS);
  }
  if (processDefinitions[FINISHED_GOODS_DELIVERY_PROCESS_KEY]) {
    processPools.push(...FINISHED_GOODS_DELIVERY_EVIDENCE_OWNER_POOLS);
  }
  return processPools.map((pool) => ({
    pool_key: pool.pool_key,
    module_key: pool.module_key,
    display_name: pool.display_name,
    description: pool.description,
    source_pool_key: pool.source_pool_key,
  }));
}

function workPoolsFromCatalog(catalog, processDefinitions = {}) {
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
  return [...catalogPools, ...processWorkPoolsFromDefinitions(processDefinitions)];
}

function processWorkPoolMembershipsFromDefinitions(
  processDefinitions = {},
  priorityOffset = 0,
  overrides = {},
) {
  const processPools = [];
  if (processDefinitions[SALES_ORDER_ACCEPTANCE_PROCESS_KEY]) {
    processPools.push(...SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS);
  }
  if (processDefinitions[MATERIAL_SUPPLY_PROCESS_KEY]) {
    processPools.push(...MATERIAL_SUPPLY_EVIDENCE_OWNER_POOLS);
  }
  if (processDefinitions[FINISHED_GOODS_DELIVERY_PROCESS_KEY]) {
    processPools.push(...FINISHED_GOODS_DELIVERY_EVIDENCE_OWNER_POOLS);
  }
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

function workPoolMembershipsFromCatalog(catalog, processDefinitions = {}, overrides = {}) {
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
    ...processWorkPoolMembershipsFromDefinitions(
      processDefinitions,
      catalogMemberships.length,
      overrides,
    ),
  ];
}

function accessEntitlementsFromCatalog(catalog, customerKey) {
  const capabilities = catalog.capabilities.map((item) => item.key);
  const pageCapabilities = catalog.pages.map((item) => `page.${item.key}.read`);
  return catalog.workPools.flatMap((pool) => {
    const roleKey = ROLE_KEY_BY_POOL[pool.key];
    const capabilityKeys = uniqueSorted([
      ...capabilities,
      ...pageCapabilities,
      ...(ROLE_CAPABILITY_KEYS_BY_POOL[pool.key] || []),
    ]);
    return capabilityKeys.map((capabilityKey) => ({
      role_key: roleKey,
      capability_key: capabilityKey,
      scope_type: "customer",
      scope_value: customerKey,
      constraints: {
        source: "compiled_customer_package",
        preview_only_source: true,
      },
      enabled: true,
    }));
  });
}

function fieldPoliciesFromCatalog(catalog) {
  const policies = {};
  for (const field of catalog.fields) {
    const runtimeSurface = RUNTIME_FIELD_POLICY_SURFACES[field.module];
    if (!runtimeSurface || !runtimeSurface.fieldKeys.includes(field.key)) {
      continue;
    }
    const surfaceKey = runtimeSurface.surfaceKey;
    policies[surfaceKey] = policies[surfaceKey] || {};
    policies[surfaceKey][field.key] = {
      label: field.label,
      visible: true,
      editable: false,
      source: "customer_package_catalog",
    };
  }
  return policies;
}

function runtimePagesFromCatalog(catalog) {
  return catalog.pages.map((item) => item.key);
}

function findWorkflow(config, predicate, label) {
  const workflow = (Array.isArray(config.workflows) ? config.workflows : []).find(predicate);
  assert(workflow, `${config.customerKey} customer package must include ${label}`);
  return workflow;
}

function findWorkflowNode(workflow, predicate, label) {
  const node = (Array.isArray(workflow.nodes) ? workflow.nodes : []).find(predicate);
  assert(node, `${workflow.key} workflow must include ${label}`);
  return node;
}

function salesOrderAcceptanceProcessDefinitionFromPackage(config) {
  const workflow = findWorkflow(
    config,
    (item) =>
      item.key === "sales_order_approval" ||
      (item.sourceModules?.includes("sales_orders") &&
        item.ownerPools?.includes("sales") &&
        item.ownerPools?.includes("boss") &&
        item.ownerPools?.includes("pmc")),
    "a sales order acceptance workflow source",
  );
  assert(workflow.factBoundary === "workflow_only", "sales order acceptance source workflow must stay workflow_only");
  for (const poolKey of ["sales", "boss", "pmc"]) {
    assert(
      workflow.ownerPools.includes(poolKey),
      `sales order acceptance source workflow must include ${poolKey} owner pool`,
    );
  }
  const submitNode = findWorkflowNode(
    workflow,
    (node) => node.command === "submit_sales_order" && node.ownerPool === "sales",
    "sales submit node",
  );
  const approvalNode = findWorkflowNode(
    workflow,
    (node) => node.type === "approval" && node.ownerPool === "boss",
    "boss approval node",
  );
  const reviewNode = findWorkflowNode(
    workflow,
    (node) => node.type === "human_task" && node.ownerPool === "pmc",
    "PMC review node",
  );
  const endNode = findWorkflowNode(
    workflow,
    (node) => node.type === "end",
    "end node",
  );
  return {
    process_key: SALES_ORDER_ACCEPTANCE_PROCESS_KEY,
    process_version: "v1",
    variant_key: "default",
    source_workflow_key: workflow.key,
    source_status: workflow.status,
    manifest_status: "runtime_loader_ready",
    runtime_loader_enabled: true,
    business_ref_type: "sales_order",
    domain_boundary: "source_document_command_only",
    fact_boundary: "no_fact_posting",
    config_revision_source: "runtime_manifest",
    definition_hash_source: "compiled_customer_package",
    nodes: [
      {
        node_key: "submit_sales_order",
        source_node_key: submitNode.key,
        node_type: "domain_command",
        source_owner_pool_key: "sales",
        required_capability_key: "sales_order.submit",
        policy_snapshot: {
          command_key: "sales_order.submit",
          source_command_key: "submit_sales_order",
          handler: "SalesOrderUsecase.SubmitSalesOrder",
          idempotency_key_required: true,
          writes_fact: false,
        },
      },
      {
        node_key: "order_approval",
        source_node_key: approvalNode.key,
        node_type: "approval",
        source_owner_pool_key: "boss",
        owner_pool_key: "order_approval",
        required_capability_key: "workflow.task.approve",
        form_profile_key: "sales_order_approval.default",
        action_set_key: "sales_order_approval",
      },
      {
        node_key: "order_review",
        source_node_key: reviewNode.key,
        node_type: "human_task",
        source_owner_pool_key: "pmc",
        owner_pool_key: "order_review",
        required_capability_key: "workflow.task.complete",
        form_profile_key: "sales_order_review.default",
        action_set_key: "sales_order_review",
      },
      {
        node_key: "end",
        source_node_key: endNode.key,
        node_type: "end",
      },
    ],
    guardrail:
      "Controlled runtime loader ready: sales_order_acceptance may submit the sales order source document, then create boss approval and PMC review tasks; it does not post inventory, shipment, quality or finance facts.",
  };
}

function materialSupplyProcessDefinitionFromPackage(config) {
  const workflow = findWorkflow(
    config,
    (item) =>
      item.key === "material_supply" ||
      item.key === "purchase_order_approval" ||
      item.key === "demo_material_supply_review" ||
      (item.sourceModules?.includes("purchase_orders") &&
        item.ownerPools?.includes("purchase") &&
        item.ownerPools?.includes("warehouse") &&
        item.ownerPools?.includes("quality")),
    "a material supply workflow source",
  );
  assert(workflow.factBoundary === "workflow_only", "material supply source workflow must stay workflow_only");
  for (const poolKey of ["purchase", "warehouse", "quality"]) {
    assert(
      workflow.ownerPools.includes(poolKey),
      `material supply source workflow must include ${poolKey} owner pool`,
    );
  }
  return {
    process_key: MATERIAL_SUPPLY_PROCESS_KEY,
    process_version: "v1",
    variant_key: "purchase_receipt_iqc_inbound",
    source_workflow_key: workflow.key,
    source_status: workflow.status,
    manifest_status: "runtime_loader_ready",
    runtime_loader_enabled: true,
    business_ref_type: "purchase_order",
    domain_boundary: "explicit_fact_command_api",
    fact_boundary: "no_fact_posting",
    config_revision_source: "runtime_manifest",
    definition_hash_source: "compiled_customer_package",
    nodes: [
      {
        node_key: "purchase_receipt_source",
        node_type: "domain_command",
        source_owner_pool_key: "purchase",
        owner_pool_key: "purchase_receipt_source",
        required_capability_key: "purchase.receipt.create",
        form_profile_key: "purchase_receipt_source.default",
        action_set_key: "purchase_receipt_source",
        policy_snapshot: {
          command_key: "purchase_receipt.create",
          handler: "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: materialSupplyFactCommandContract("purchase_receipt_source"),
      },
      {
        node_key: "incoming_qc",
        node_type: "domain_command",
        source_owner_pool_key: "quality",
        owner_pool_key: "incoming_qc",
        required_capability_key: "quality.inspection.update",
        form_profile_key: "incoming_qc.default",
        action_set_key: "incoming_qc",
        policy_snapshot: {
          command_key: "quality_inspection.decide",
          handler: "InventoryUsecase.PassQualityInspection/RejectQualityInspection",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: materialSupplyFactCommandContract("incoming_qc"),
      },
      {
        node_key: "warehouse_inbound",
        node_type: "domain_command",
        source_owner_pool_key: "warehouse",
        owner_pool_key: "warehouse_inbound",
        required_capability_key: "warehouse.inbound.confirm",
        form_profile_key: "warehouse_inbound.default",
        action_set_key: "warehouse_inbound",
        policy_snapshot: {
          command_key: "inventory.post_inbound",
          handler: "InventoryUsecase.PostPurchaseReceipt",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: materialSupplyFactCommandContract("warehouse_inbound"),
      },
      {
        node_key: "end",
        node_type: "end",
      },
    ],
    guardrail:
      "Runtime loader ready: material_supply can construct purchase_order process instances with explicit domain_command nodes; it still does not let Workflow task completion create purchase_receipts, decide quality_inspections or post inventory_txns.",
  };
}

function finishedGoodsDeliveryProcessDefinitionFromPackage(config) {
  const workflow = findWorkflow(
    config,
    (item) =>
      item.key === "finished_goods_delivery" ||
      item.key === "demo_finished_goods_delivery" ||
      (item.sourceModules?.includes("shipments") &&
        item.sourceModules?.includes("finance") &&
        item.ownerPools?.includes("quality") &&
        item.ownerPools?.includes("finance") &&
        item.ownerPools?.includes("warehouse")),
    "a finished goods delivery workflow source",
  );
  assert(workflow.factBoundary === "workflow_only", "finished goods delivery source workflow must stay workflow_only");
  for (const poolKey of ["quality", "finance", "warehouse"]) {
    assert(
      workflow.ownerPools.includes(poolKey),
      `finished goods delivery source workflow must include ${poolKey} owner pool`,
    );
  }
  return {
    process_key: FINISHED_GOODS_DELIVERY_PROCESS_KEY,
    process_version: "v1",
    variant_key: "quality_finance_ship_receivable",
    source_workflow_key: workflow.key,
    source_status: workflow.status,
    manifest_status: "runtime_loader_start_ready",
    runtime_loader_enabled: true,
    business_ref_type: "shipment",
    domain_boundary: "contract_preflight_only",
    fact_boundary: "no_fact_posting",
    config_revision_source: "runtime_manifest",
    definition_hash_source: "compiled_customer_package",
    nodes: [
      {
        node_key: "finished_goods_quality",
        node_type: "domain_command",
        source_owner_pool_key: "quality",
        owner_pool_key: "finished_goods_quality",
        required_capability_key: "quality.inspection.update",
        form_profile_key: "finished_goods_quality.default",
        action_set_key: "finished_goods_quality",
        policy_snapshot: {
          command_key: "finished_goods_quality.decide",
          handler: "InventoryUsecase.PassQualityInspection/RejectQualityInspection",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: finishedGoodsDeliveryFactCommandContract("finished_goods_quality"),
      },
      {
        node_key: "shipment_finance_release",
        node_type: "domain_command",
        source_owner_pool_key: "finance",
        owner_pool_key: "shipment_finance_release",
        required_capability_key: "finance.receivable.confirm",
        form_profile_key: "shipment_finance_release.default",
        action_set_key: "shipment_finance_release",
        policy_snapshot: {
          command_key: "shipment.finance_release",
          handler: "OperationalFactUsecase.GetShipment",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: finishedGoodsDeliveryFactCommandContract("shipment_finance_release"),
      },
      {
        node_key: "shipment_execution",
        node_type: "domain_command",
        source_owner_pool_key: "warehouse",
        owner_pool_key: "shipment_execution",
        required_capability_key: "shipment.ship",
        form_profile_key: "shipment_execution.default",
        action_set_key: "shipment_execution",
        policy_snapshot: {
          command_key: "shipment.ship",
          handler: "OperationalFactUsecase.ShipShipment",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: finishedGoodsDeliveryFactCommandContract("shipment_execution"),
      },
      {
        node_key: "receivable_lead",
        node_type: "domain_command",
        source_owner_pool_key: "finance",
        owner_pool_key: "receivable_lead",
        required_capability_key: "finance.receivable.confirm",
        form_profile_key: "receivable_lead.default",
        action_set_key: "receivable_lead",
        policy_snapshot: {
          command_key: "finance.receivable_lead",
          handler: "OperationalFactUsecase.CreateFinanceFactDraft",
          idempotency_key_required: true,
          writes_fact: false,
        },
        fact_command_contract: finishedGoodsDeliveryFactCommandContract("receivable_lead"),
      },
      {
        node_key: "end",
        node_type: "end",
      },
    ],
    guardrail:
      "Start-only loader: finished_goods_delivery can create and start a ProcessInstance; finished_goods_quality, shipment_finance_release, shipment_execution, and receivable_lead now have explicit handlers, and target evidence is still required before release readiness.",
  };
}

function processDefinitionsFromPackage(config) {
  return {
    [SALES_ORDER_ACCEPTANCE_PROCESS_KEY]:
      salesOrderAcceptanceProcessDefinitionFromPackage(config),
    [MATERIAL_SUPPLY_PROCESS_KEY]:
      materialSupplyProcessDefinitionFromPackage(config),
    [FINISHED_GOODS_DELIVERY_PROCESS_KEY]:
      finishedGoodsDeliveryProcessDefinitionFromPackage(config),
  };
}

function compiledSnapshotFromPackage(config, catalog, processDefinitions = {}) {
  return {
    customer: {
      key: config.customerKey,
      name: config.label,
      packageKey: config.packageKey,
    },
    package: {
      key: config.packageKey,
      status: config.status,
      runtimeEnabled: false,
      previewOnly: true,
    },
    pages: runtimePagesFromCatalog(catalog),
    modules: catalog.modules.map((item) => ({
      key: item.key,
      label: item.label,
      layer: item.layer,
    })),
    fieldPolicies: fieldPoliciesFromCatalog(catalog),
    workPoolRoleOverrides: customerWorkPoolRoleOverrides(config, catalog),
    processDefinitions,
    preview: buildPreview(config),
  };
}

function buildRuntimeManifest(config, catalog = customerPackageCatalog) {
  validateCatalog(catalog);
  validatePackage(config, catalog);
  const processDefinitions = processDefinitionsFromPackage(config);
  const workPoolRoleOverrides = customerWorkPoolRoleOverrides(config, catalog);
  const manifest = {
    customer_key: config.customerKey,
    revision: packageRevision(config),
    product_version: "local-customer-package",
    compiled_snapshot: compiledSnapshotFromPackage(config, catalog, processDefinitions),
    module_states: moduleStatesFromCatalog(catalog, config),
    role_profiles: roleProfilesFromCatalog(catalog),
    access_entitlements: accessEntitlementsFromCatalog(catalog, config.customerKey),
    work_pools: workPoolsFromCatalog(catalog, processDefinitions),
    work_pool_memberships: workPoolMembershipsFromCatalog(catalog, processDefinitions, workPoolRoleOverrides),
  };
  validateRuntimeManifest(manifest);
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

function validateProcessDefinitions(manifest, { workPoolKeys } = {}) {
  const processDefinitions = manifest.compiled_snapshot.processDefinitions;
  assert(
    processDefinitions && typeof processDefinitions === "object" && !Array.isArray(processDefinitions),
    "compiled_snapshot.processDefinitions must be an object",
  );
  const salesOrderProcess = processDefinitions[SALES_ORDER_ACCEPTANCE_PROCESS_KEY];
  assert(salesOrderProcess, "processDefinitions must include sales_order_acceptance");
  const materialSupplyProcess = processDefinitions[MATERIAL_SUPPLY_PROCESS_KEY];
  assert(materialSupplyProcess, "processDefinitions must include material_supply");
  const finishedGoodsDeliveryProcess = processDefinitions[FINISHED_GOODS_DELIVERY_PROCESS_KEY];
  assert(finishedGoodsDeliveryProcess, "processDefinitions must include finished_goods_delivery");
  assert(
    salesOrderProcess.process_key === SALES_ORDER_ACCEPTANCE_PROCESS_KEY,
    "sales_order_acceptance.process_key must match its manifest key",
  );
  assert(salesOrderProcess.process_version === "v1", "sales_order_acceptance.process_version must be v1");
  assert(salesOrderProcess.variant_key === "default", "sales_order_acceptance.variant_key must be default");
  assert(salesOrderProcess.manifest_status === "runtime_loader_ready", "sales_order_acceptance must be marked runtime loader ready");
  assert(salesOrderProcess.runtime_loader_enabled === true, "sales_order_acceptance must explicitly enable the controlled runtime loader");
  assert(salesOrderProcess.business_ref_type === "sales_order", "sales_order_acceptance must stay bound to sales_order refs");
  assert(salesOrderProcess.fact_boundary === "no_fact_posting", "sales_order_acceptance must not post domain facts");
  assert(Array.isArray(salesOrderProcess.nodes), "sales_order_acceptance.nodes must be an array");
  assert(
    JSON.stringify(salesOrderProcess.nodes.map((node) => node.node_key)) ===
      JSON.stringify(["submit_sales_order", "order_approval", "order_review", "end"]),
    "sales_order_acceptance nodes must match the reviewed minimum chain",
  );
  const roleByRuntimePool = new Map(
    manifest.work_pool_memberships.map((membership) => [
      membership.pool_key,
      membership.role_key,
    ]),
  );
  for (const node of salesOrderProcess.nodes) {
    assert(PROCESS_DEFINITION_NODE_TYPES.includes(node.node_type), `unsupported process node type: ${node.node_type}`);
    if (node.node_type === "end") {
      assert(!node.owner_pool_key, "end node must not own a work pool");
      continue;
    }
    assert(
      typeof node.required_capability_key === "string" && node.required_capability_key.trim() !== "",
      `${node.node_key}.required_capability_key must be set`,
    );
    if (node.node_type === "domain_command") {
      assert(
        RUNTIME_DOMAIN_COMMAND_KEYS.includes(node.policy_snapshot?.command_key),
        `${node.node_key}.policy_snapshot.command_key must be a registered runtime domain command`,
      );
      assert(node.policy_snapshot?.writes_fact === false, `${node.node_key} must not post facts`);
      const sourceRoleKey = ROLE_KEY_BY_POOL[node.source_owner_pool_key];
      assert(sourceRoleKey, `${node.node_key}.source_owner_pool_key must map to a role key`);
      assert(
        roleHasCapability(manifest, sourceRoleKey, node.required_capability_key),
        `${node.node_key} source role ${sourceRoleKey} must have ${node.required_capability_key}`,
      );
      continue;
    }
    assert(workPoolKeys.has(node.owner_pool_key), `${node.node_key}.owner_pool_key must be a runtime work pool`);
    const roleKey = roleByRuntimePool.get(node.owner_pool_key);
    assert(roleKey, `${node.node_key}.owner_pool_key must have a membership`);
    assert(
      roleHasCapability(manifest, roleKey, node.required_capability_key),
      `${node.node_key} mapped role ${roleKey} must have ${node.required_capability_key}`,
    );
  }
  assert(
    materialSupplyProcess.process_key === MATERIAL_SUPPLY_PROCESS_KEY,
    "material_supply.process_key must match its manifest key",
  );
  assert(materialSupplyProcess.process_version === "v1", "material_supply.process_version must be v1");
  assert(
    materialSupplyProcess.variant_key === "purchase_receipt_iqc_inbound",
    "material_supply.variant_key must identify the reviewed P4-2 chain",
  );
  assert(
    materialSupplyProcess.manifest_status === "runtime_loader_ready",
    "material_supply must be loader ready after explicit process APIs are implemented",
  );
  assert(materialSupplyProcess.runtime_loader_enabled === true, "material_supply runtime loader must stay enabled");
  assert(materialSupplyProcess.business_ref_type === "purchase_order", "material_supply must start from purchase order refs");
  assert(materialSupplyProcess.fact_boundary === "no_fact_posting", "material_supply must not post facts from the manifest");
  assert(Array.isArray(materialSupplyProcess.nodes), "material_supply.nodes must be an array");
  assert(
    JSON.stringify(materialSupplyProcess.nodes.map((node) => node.node_key)) ===
      JSON.stringify(["purchase_receipt_source", "incoming_qc", "warehouse_inbound", "end"]),
    "material_supply nodes must match the reviewed purchase receipt -> IQC -> inbound chain",
  );
  const expectedMaterialSupplyCommandKeys = new Map([
    ["purchase_receipt_source", "purchase_receipt.create"],
    ["incoming_qc", "quality_inspection.decide"],
    ["warehouse_inbound", "inventory.post_inbound"],
  ]);
  for (const node of materialSupplyProcess.nodes) {
    assert(PROCESS_DEFINITION_NODE_TYPES.includes(node.node_type), `unsupported process node type: ${node.node_type}`);
    if (node.node_type === "end") {
      assert(!node.owner_pool_key, "material_supply end node must not own a work pool");
      continue;
    }
    assert(node.node_type === "domain_command", "material_supply runtime nodes must be explicit domain_command nodes");
    assert(workPoolKeys.has(node.owner_pool_key), `${node.node_key}.owner_pool_key must be a runtime work pool`);
    const roleKey = roleByRuntimePool.get(node.owner_pool_key);
    assert(roleKey, `${node.node_key}.owner_pool_key must have a membership`);
    assert(
      roleHasCapability(manifest, roleKey, node.required_capability_key),
      `${node.node_key} mapped role ${roleKey} must have ${node.required_capability_key}`,
    );
    assert(
      node.fact_command_contract?.required_before_runtime_loader === false,
      `${node.node_key} fact command contract must be satisfied before enabling runtime loader`,
    );
    assert(
      node.policy_snapshot?.command_key === expectedMaterialSupplyCommandKeys.get(node.node_key),
      `${node.node_key}.policy_snapshot.command_key must match reviewed P4-2 command`,
    );
    assert(
      node.policy_snapshot?.writes_fact === false,
      `${node.node_key}.policy_snapshot must not claim manifest-level fact posting`,
    );
    assert(
      node.fact_command_contract?.writes_fact === false,
      `${node.node_key} manifest contract must not claim fact posting`,
    );
    assert(
      node.fact_command_contract?.command_key === expectedMaterialSupplyCommandKeys.get(node.node_key),
      `${node.node_key}.fact_command_contract.command_key must match reviewed P4-2 command`,
    );
    const handlerRegisteredNodeKeys = new Set(["purchase_receipt_source", "incoming_qc", "warehouse_inbound"]);
    const expectedRuntimeBindingStatus = handlerRegisteredNodeKeys.has(node.node_key)
      ? "process_runtime_handler_registered"
      : "contract_preflight_only";
    assert(
      node.fact_command_contract?.runtime_binding_status === expectedRuntimeBindingStatus,
      `${node.node_key}.fact_command_contract.runtime_binding_status must stay ${expectedRuntimeBindingStatus}`,
    );
    assert(
      Boolean(node.fact_command_contract?.process_runtime_handler_registered) ===
        handlerRegisteredNodeKeys.has(node.node_key),
      `${node.node_key}.fact_command_contract.process_runtime_handler_registered must match current handler registration`,
    );
    assert(
      node.fact_command_contract?.required_permission_key === node.required_capability_key,
      `${node.node_key}.fact_command_contract.required_permission_key must match node capability`,
    );
    for (const field of [
      "domain_owner",
      "domain_usecase_binding",
      "jsonrpc_method",
      "stable_business_ref",
      "idempotency_boundary",
    ]) {
      assert(
        typeof node.fact_command_contract?.[field] === "string" &&
          node.fact_command_contract[field].trim() !== "",
        `${node.node_key}.fact_command_contract.${field} must be documented before runtime loader`,
      );
    }
    assert(
      Array.isArray(node.fact_command_contract?.jsonrpc_allowed_permission_keys) &&
        node.fact_command_contract.jsonrpc_allowed_permission_keys.includes(node.required_capability_key),
      `${node.node_key}.fact_command_contract must list the required JSON-RPC permission`,
    );
    assert(
      Array.isArray(node.fact_command_contract?.required_test_anchors) &&
        node.fact_command_contract.required_test_anchors.length >= 2,
      `${node.node_key}.fact_command_contract.required_test_anchors must reference existing tests`,
    );
    assert(Array.isArray(node.fact_command_contract?.runtime_loader_blockers), `${node.node_key}.fact_command_contract.runtime_loader_blockers must be an array`);
    if (handlerRegisteredNodeKeys.has(node.node_key)) {
      assert(
        !node.fact_command_contract.runtime_loader_blockers.includes("domain_command_handler_not_registered") &&
          node.fact_command_contract.runtime_loader_blockers.length === 0,
        `${node.node_key}.fact_command_contract must not keep loader blockers after explicit APIs are implemented`,
      );
    } else {
      assert(
        node.fact_command_contract.runtime_loader_blockers.includes("domain_command_handler_not_registered"),
        `${node.node_key}.fact_command_contract must keep handler registration as a loader blocker`,
      );
    }
  }
  assert(
    finishedGoodsDeliveryProcess.process_key === FINISHED_GOODS_DELIVERY_PROCESS_KEY,
    "finished_goods_delivery.process_key must match its manifest key",
  );
  assert(finishedGoodsDeliveryProcess.process_version === "v1", "finished_goods_delivery.process_version must be v1");
  assert(
    finishedGoodsDeliveryProcess.variant_key === "quality_finance_ship_receivable",
    "finished_goods_delivery.variant_key must identify the reviewed P4-3 chain",
  );
  assert(
    finishedGoodsDeliveryProcess.manifest_status === "runtime_loader_start_ready",
    "finished_goods_delivery must be start-ready before execute handlers exist",
  );
  assert(
    finishedGoodsDeliveryProcess.runtime_loader_enabled === true,
    "finished_goods_delivery runtime loader must allow start-only instances",
  );
  assert(finishedGoodsDeliveryProcess.business_ref_type === "shipment", "finished_goods_delivery must start from shipment refs");
  assert(finishedGoodsDeliveryProcess.fact_boundary === "no_fact_posting", "finished_goods_delivery must not post facts from the manifest");
  assert(Array.isArray(finishedGoodsDeliveryProcess.nodes), "finished_goods_delivery.nodes must be an array");
  assert(
    JSON.stringify(finishedGoodsDeliveryProcess.nodes.map((node) => node.node_key)) ===
      JSON.stringify([
        "finished_goods_quality",
        "shipment_finance_release",
        "shipment_execution",
        "receivable_lead",
        "end",
      ]),
    "finished_goods_delivery nodes must match the reviewed quality -> finance -> shipment -> receivable chain",
  );
  const expectedFinishedGoodsCommandKeys = new Map([
    ["finished_goods_quality", "finished_goods_quality.decide"],
    ["shipment_finance_release", "shipment.finance_release"],
    ["shipment_execution", "shipment.ship"],
    ["receivable_lead", "finance.receivable_lead"],
  ]);
  const finishedGoodsHandlerRegisteredNodeKeys = new Set([
    "finished_goods_quality",
    "shipment_finance_release",
    "shipment_execution",
    "receivable_lead",
  ]);
  for (const node of finishedGoodsDeliveryProcess.nodes) {
    assert(PROCESS_DEFINITION_NODE_TYPES.includes(node.node_type), `unsupported process node type: ${node.node_type}`);
    if (node.node_type === "end") {
      assert(!node.owner_pool_key, "finished_goods_delivery end node must not own a work pool");
      continue;
    }
    assert(node.node_type === "domain_command", "finished_goods_delivery runtime candidates must be explicit domain_command nodes");
    assert(workPoolKeys.has(node.owner_pool_key), `${node.node_key}.owner_pool_key must be a runtime work pool`);
    const roleKey = roleByRuntimePool.get(node.owner_pool_key);
    assert(roleKey, `${node.node_key}.owner_pool_key must have a membership`);
    assert(
      roleHasCapability(manifest, roleKey, node.required_capability_key),
      `${node.node_key} mapped role ${roleKey} must have ${node.required_capability_key}`,
    );
    assert(
      node.fact_command_contract?.required_before_runtime_loader === false,
      `${node.node_key} fact command contract must not block start-only loader`,
    );
    assert(
      node.fact_command_contract?.required_before_runtime_execute === true,
      `${node.node_key} fact command contract must block execute until handler and explicit API exist`,
    );
    assert(
      REVIEWED_CONTRACT_COMMAND_KEYS.includes(node.policy_snapshot?.command_key),
      `${node.node_key}.policy_snapshot.command_key must be a reviewed contract command`,
    );
    assert(
      node.policy_snapshot?.command_key === expectedFinishedGoodsCommandKeys.get(node.node_key),
      `${node.node_key}.policy_snapshot.command_key must match reviewed P4-3 command`,
    );
    assert(
      node.policy_snapshot?.writes_fact === false,
      `${node.node_key}.policy_snapshot must not claim manifest-level fact posting`,
    );
    assert(
      node.fact_command_contract?.writes_fact === false,
      `${node.node_key} manifest contract must not claim fact posting`,
    );
    assert(
      node.fact_command_contract?.command_key === expectedFinishedGoodsCommandKeys.get(node.node_key),
      `${node.node_key}.fact_command_contract.command_key must match reviewed P4-3 command`,
    );
    const expectedRuntimeBindingStatus = finishedGoodsHandlerRegisteredNodeKeys.has(node.node_key)
      ? "process_runtime_handler_registered"
      : "contract_preflight_only";
    assert(
      node.fact_command_contract?.runtime_binding_status === expectedRuntimeBindingStatus,
      `${node.node_key}.fact_command_contract.runtime_binding_status must stay ${expectedRuntimeBindingStatus}`,
    );
    assert(
      Boolean(node.fact_command_contract?.process_runtime_handler_registered) ===
        finishedGoodsHandlerRegisteredNodeKeys.has(node.node_key),
      `${node.node_key}.fact_command_contract.process_runtime_handler_registered must match current handler registration`,
    );
    assert(
      node.fact_command_contract?.required_permission_key === node.required_capability_key,
      `${node.node_key}.fact_command_contract.required_permission_key must match node capability`,
    );
    for (const field of [
      "domain_owner",
      "domain_usecase_binding",
      "jsonrpc_method",
      "stable_business_ref",
      "idempotency_boundary",
    ]) {
      assert(
        typeof node.fact_command_contract?.[field] === "string" &&
          node.fact_command_contract[field].trim() !== "",
        `${node.node_key}.fact_command_contract.${field} must be documented before runtime loader`,
      );
    }
    assert(
      Array.isArray(node.fact_command_contract?.jsonrpc_allowed_permission_keys) &&
        node.fact_command_contract.jsonrpc_allowed_permission_keys.includes(node.required_capability_key),
      `${node.node_key}.fact_command_contract must list the required JSON-RPC permission`,
    );
    assert(
      Array.isArray(node.fact_command_contract?.required_test_anchors) &&
        node.fact_command_contract.required_test_anchors.length >= 2,
      `${node.node_key}.fact_command_contract.required_test_anchors must reference existing tests`,
    );
    if (finishedGoodsHandlerRegisteredNodeKeys.has(node.node_key)) {
      assert(
        !node.fact_command_contract.runtime_execute_blockers.includes("domain_command_handler_not_registered"),
        `${node.node_key}.fact_command_contract must not keep handler registration as an execute blocker after registration`,
      );
    } else {
      assert(
        node.fact_command_contract.runtime_execute_blockers.includes("domain_command_handler_not_registered"),
        `${node.node_key}.fact_command_contract must keep handler registration as an execute blocker`,
      );
    }
    if (
      !String(node.fact_command_contract.jsonrpc_method || "").startsWith(
        "customer_config.",
      )
    ) {
      assert(
        node.fact_command_contract.runtime_execute_blockers.includes("explicit_runtime_execute_api_not_implemented"),
        `${node.node_key}.fact_command_contract must keep explicit runtime execute API as a blocker until a customer_config execute API exists`,
      );
    } else {
      assert(
        !node.fact_command_contract.runtime_execute_blockers.includes("explicit_runtime_execute_api_not_implemented"),
        `${node.node_key}.fact_command_contract must remove explicit runtime execute API blocker once jsonrpc_method is registered`,
      );
    }
  }
}

function validateRuntimeManifest(manifest) {
  assert(typeof manifest.customer_key === "string" && manifest.customer_key.trim() !== "", "customer_key must be set");
  assert(typeof manifest.revision === "string" && manifest.revision.trim() !== "", "revision must be set");
  assert(
    manifest.revision.startsWith(`${manifest.customer_key}-customer-package-`),
    "revision must be namespaced by customer_key",
  );
  assert(manifest.product_version === "local-customer-package", "product_version must identify local package compile");
  assert(manifest.compiled_snapshot && typeof manifest.compiled_snapshot === "object", "compiled_snapshot must exist");
  assert(
    manifest.compiled_snapshot.customer?.key === manifest.customer_key,
    "compiled_snapshot.customer.key must match customer_key",
  );
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
  assert(roleKeys.has("purchasing"), "purchase work pool must map to backend purchasing role key");
  assert(roleKeys.has("engineering"), "engineering work pool must map to backend engineering role key");
  assert(!roleKeys.has("purchase"), "runtime manifest must not publish frontend-only purchase role key");
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
  validateProcessDefinitions(manifest, { workPoolKeys });
  assertNoForbiddenKeys(manifest);
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
  const config = CUSTOMER_PACKAGES[args.customer];
  assert(config, `unknown customer package: ${args.customer}`);
  assert(existsSync(path.join(repoRoot, "server/internal/biz/customer_config.go")), "customer_config usecase must exist");
  const manifest = buildRuntimeManifest(config);
  if (mode === "preview" && args.out) {
    writeManifest(args.out, manifest);
  }
  return {
    mode,
    manifest,
  };
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const result = runCustomerConfigRuntimeManifest(args);
  console.log(
    `customer config runtime manifest ${result.mode} ok: ${result.manifest.customer_key}, revision=${result.manifest.revision}, modules=${result.manifest.module_states.length}, roles=${result.manifest.role_profiles.length}, entitlements=${result.manifest.access_entitlements.length}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  buildRuntimeManifest,
  runCustomerConfigRuntimeManifest,
  validateRuntimeManifest,
};
