export const yoyoosunProjectionMatrix = Object.freeze({
  customerKey: "yoyoosun",
  status: "coverage_matrix",
  boundary:
    "Projection matrix documents pages, actions, fields and print defaults. Backend-allowed field surfaces still require frontend consumption before they are treated as fully customer-visible.",
  pageProjection: Object.freeze({
    runtimeSource: "customer_config.get_effective_session.pages",
    ordinaryAccountRule: "RBAC menu path AND active revision pages",
    superAdminRule: "product_core_review_not_narrowed_by_active_revision",
  }),
  actionProjection: Object.freeze({
    runtimeSource: "customer_config.get_effective_session.actions",
    ordinaryAccountRule: "backend RBAC AND active revision action entitlement AND module enabled",
    forbiddenFallback: "no formal UI may fall back to local action wrappers for writes",
  }),
  fieldSurfaces: Object.freeze([
    Object.freeze({ surfaceKey: "customers.default", status: "runtime_enabled", fields: Object.freeze(["customer_code", "display_name"]) }),
    Object.freeze({ surfaceKey: "suppliers.default", status: "runtime_enabled", fields: Object.freeze(["supplier_code", "supplier_type"]) }),
    Object.freeze({ surfaceKey: "sales_orders.default", status: "runtime_enabled", fields: Object.freeze(["order_no", "source_no", "expected_ship_date"]) }),
    Object.freeze({ surfaceKey: "sales_order_items.default", status: "backend_runtime_allowed", fields: Object.freeze(["product_no", "product_name", "sku_no", "quantity", "unit_price", "amount"]) }),
    Object.freeze({ surfaceKey: "purchase_orders.default", status: "backend_runtime_allowed", fields: Object.freeze(["purchase_order_no", "supplier_snapshot", "expected_arrival_date", "lifecycle_status"]) }),
    Object.freeze({ surfaceKey: "purchase_order_items.default", status: "backend_runtime_allowed", fields: Object.freeze(["product_order_no", "product_no", "material_name", "spec", "unit", "quantity", "unit_price", "amount"]) }),
    Object.freeze({ surfaceKey: "purchase_receipts.default", status: "backend_runtime_allowed", fields: Object.freeze(["receipt_no", "purchase_order_no", "warehouse", "status"]) }),
    Object.freeze({ surfaceKey: "quality_inspections.default", status: "backend_runtime_allowed", fields: Object.freeze(["inspection_no", "source_no", "result", "decision_note"]) }),
    Object.freeze({ surfaceKey: "inventory_lots.default", status: "backend_runtime_allowed", fields: Object.freeze(["lot_no", "warehouse", "material", "quantity", "status"]) }),
    Object.freeze({ surfaceKey: "inventory_txns.default", status: "backend_runtime_allowed", fields: Object.freeze(["txn_no", "txn_type", "warehouse", "material", "quantity"]) }),
    Object.freeze({ surfaceKey: "bom_versions.default", status: "runtime_enabled", fields: Object.freeze(["product", "version", "source_order_no", "quantity_text", "spare_text", "print_date", "designer", "maker", "auditor", "hair_direction", "status"]) }),
    Object.freeze({ surfaceKey: "bom_items.default", status: "runtime_enabled", fields: Object.freeze(["material", "quantity", "unit", "loss_rate", "position", "piece_count", "total_usage_snapshot", "process_base", "process_method", "note"]) }),
    Object.freeze({ surfaceKey: "shipments.default", status: "backend_runtime_allowed", fields: Object.freeze(["shipment_no", "sales_order_no", "warehouse", "status", "shipped_at"]) }),
    Object.freeze({ surfaceKey: "outsourcing_orders.default", status: "backend_runtime_allowed", fields: Object.freeze(["outsourcing_order_no", "processor_snapshot", "expected_return_date", "lifecycle_status"]) }),
    Object.freeze({ surfaceKey: "finance_facts.default", status: "backend_runtime_allowed", fields: Object.freeze(["finance_fact_no", "source_no", "fact_type", "amount", "status"]) }),
  ]),
  printTemplateDefaults: Object.freeze([
    Object.freeze({
      templateKey: "material-purchase-contract",
      status: "runtime_enabled",
      defaultFieldPolicy: "buyer_party_only",
      protectedBusinessSnapshots: Object.freeze(["supplierName", "supplierContact", "supplierPhone", "supplierAddress", "lines"]),
    }),
    Object.freeze({
      templateKey: "processing-contract",
      status: "runtime_enabled",
      defaultFieldPolicy: "buyer_party_only",
      protectedBusinessSnapshots: Object.freeze(["supplierName", "supplierContact", "supplierPhone", "supplierAddress", "lines"]),
    }),
  ]),
});
