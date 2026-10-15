package biz

import "testing"

func TestFormalFieldContractsAreNotRuntimeFieldPolicySurfaces(t *testing.T) {
	unsupportedSurfaces := map[string]string{
		"sales_order_items.default":    "product_no",
		"purchase_orders.default":      "purchase_order_no",
		"purchase_order_items.default": "material_name",
		"purchase_receipts.default":    "receipt_no",
		"quality_inspections.default":  "inspection_no",
		"inventory_lots.default":       "lot_no",
		"inventory_txns.default":       "txn_no",
		"bom_versions.default":         "version",
		"bom_items.default":            "material",
		"shipments.default":            "shipment_no",
		"outsourcing_orders.default":   "outsourcing_order_no",
		"finance_facts.default":        "finance_fact_no",
	}
	for surfaceKey, fieldKey := range unsupportedSurfaces {
		t.Run(surfaceKey, func(t *testing.T) {
			snapshot := map[string]any{
				"pages": []any{"sales-orders"},
				"fieldPolicies": map[string]any{
					surfaceKey: map[string]any{
						fieldKey: map[string]any{"visible": false},
					},
				},
			}
			if compiledSnapshotFieldPoliciesAreAllowed(snapshot) {
				t.Fatalf("formal field contract %s must not be accepted as a runtime field policy", surfaceKey)
			}
		})
	}
}

func TestRuntimeFieldPolicyOnlyAcceptsBooleanVisibility(t *testing.T) {
	tests := []struct {
		name   string
		policy map[string]any
	}{
		{name: "label is not a runtime policy", policy: map[string]any{"label": "客户单号"}},
		{name: "editable is not a runtime policy", policy: map[string]any{"visible": true, "editable": false}},
		{name: "required is not a runtime policy", policy: map[string]any{"required": true}},
		{name: "visible must be boolean", policy: map[string]any{"visible": "false"}},
		{name: "empty policy is invalid", policy: map[string]any{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snapshot := map[string]any{
				"pages": []any{"sales-orders"},
				"fieldPolicies": map[string]any{
					"sales_orders.default": map[string]any{
						"source_no": tt.policy,
					},
				},
			}
			if compiledSnapshotFieldPoliciesAreAllowed(snapshot) {
				t.Fatalf("unsupported policy must be rejected: %#v", tt.policy)
			}
		})
	}
}
