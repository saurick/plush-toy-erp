package biz

func init() {
	registerRuntimeFieldPolicySurface("sales_order_items.default", []string{
		"product_no",
		"product_name",
		"sku_no",
		"quantity",
		"unit_price",
		"amount",
	})
	registerRuntimeFieldPolicySurface("purchase_orders.default", []string{
		"purchase_order_no",
		"supplier_snapshot",
		"expected_arrival_date",
		"lifecycle_status",
	})
	registerRuntimeFieldPolicySurface("purchase_order_items.default", []string{
		"product_order_no",
		"product_order_no_snapshot",
		"product_no",
		"product_no_snapshot",
		"product_name_snapshot",
		"material_name",
		"material_name_snapshot",
		"spec",
		"unit",
		"quantity",
		"unit_price",
		"amount",
	})
	registerRuntimeFieldPolicySurface("purchase_receipts.default", []string{
		"receipt_no",
		"purchase_order_no",
		"warehouse",
		"status",
	})
	registerRuntimeFieldPolicySurface("quality_inspections.default", []string{
		"inspection_no",
		"source_no",
		"result",
		"decision_note",
	})
	registerRuntimeFieldPolicySurface("inventory_lots.default", []string{
		"lot_no",
		"warehouse",
		"material",
		"quantity",
		"status",
	})
	registerRuntimeFieldPolicySurface("inventory_txns.default", []string{
		"txn_no",
		"txn_type",
		"warehouse",
		"material",
		"quantity",
	})
	registerRuntimeFieldPolicySurface("shipments.default", []string{
		"shipment_no",
		"sales_order_no",
		"warehouse",
		"status",
		"shipped_at",
	})
	registerRuntimeFieldPolicySurface("outsourcing_orders.default", []string{
		"outsourcing_order_no",
		"processor_snapshot",
		"expected_return_date",
		"lifecycle_status",
	})
	registerRuntimeFieldPolicySurface("finance_facts.default", []string{
		"finance_fact_no",
		"source_no",
		"fact_type",
		"amount",
		"status",
	})
}

func registerRuntimeFieldPolicySurface(surfaceKey string, fieldKeys []string) {
	fields := map[string]struct{}{}
	for _, fieldKey := range fieldKeys {
		fields[fieldKey] = struct{}{}
	}
	runtimeFieldPolicySurfaceKeys[surfaceKey] = fields
}
