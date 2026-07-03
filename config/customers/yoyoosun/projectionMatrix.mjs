export const yoyoosunProjectionMatrix = Object.freeze({
  customerKey: "yoyoosun",
  status: "coverage_matrix",
  boundary:
    "Projection matrix documents which pages, actions, fields and print defaults are runtime-consumed versus planned. It does not widen backend access by itself.",
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
    Object.freeze({ surfaceKey: "sales_order_items.default", status: "planned", fields: Object.freeze(["product_no", "product_name", "sku_no", "quantity", "unit_price", "amount"]) }),
    Object.freeze({ surfaceKey: "purchase_orders.default", status: "planned", fields: Object.freeze(["purchase_order_no", "supplier_snapshot", "expected_arrival_date", "lifecycle_status"]) }),
    Object.freeze({ surfaceKey: "purchase_order_items.default", status: "planned", fields: Object.freeze(["product_order_no", "product_no", "material_name", "spec", "unit", "quantity", "unit_price", "amount"]) }),
    Object.freeze({ surfaceKey: "outsourcing_orders.default", status: "planned", fields: Object.freeze(["outsourcing_order_no", "processor_snapshot", "return_date", "lifecycle_status"]) }),
    Object.freeze({ surfaceKey: "quality_inspections.default", status: "planned", fields: Object.freeze(["inspection_no", "source_no", "result", "decision_note"]) }),
    Object.freeze({ surfaceKey: "inventory_lots.default", status: "planned", fields: Object.freeze(["lot_no", "warehouse", "material", "quantity", "status"]) }),
    Object.freeze({ surfaceKey: "shipments.default", status: "planned", fields: Object.freeze(["shipment_no", "sales_order_no", "warehouse", "status", "shipped_at"]) }),
    Object.freeze({ surfaceKey: "finance_facts.default", status: "planned", fields: Object.freeze(["finance_fact_no", "source_no", "fact_type", "amount", "status"]) }),
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
