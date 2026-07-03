package biz

import "testing"

func TestExpandedRuntimeFieldPolicySurfacesAreAllowed(t *testing.T) {
	snapshot := map[string]any{
		"pages": []any{"sales-orders"},
		"fieldPolicies": map[string]any{
			"sales_order_items.default": map[string]any{
				"product_no": map[string]any{"visible": false},
				"amount":     map[string]any{"visible": true},
			},
			"purchase_orders.default": map[string]any{
				"purchase_order_no":     map[string]any{"visible": true},
				"expected_arrival_date": map[string]any{"visible": false},
			},
			"purchase_order_items.default": map[string]any{
				"material_name": map[string]any{"visible": true},
				"quantity":      map[string]any{"visible": true},
			},
			"purchase_receipts.default": map[string]any{
				"receipt_no": map[string]any{"visible": true},
				"status":     map[string]any{"visible": false},
			},
			"quality_inspections.default": map[string]any{
				"inspection_no": map[string]any{"visible": true},
				"result":        map[string]any{"visible": false},
			},
			"inventory_lots.default": map[string]any{
				"lot_no":   map[string]any{"visible": true},
				"quantity": map[string]any{"visible": false},
			},
			"inventory_txns.default": map[string]any{
				"txn_no":   map[string]any{"visible": true},
				"txn_type": map[string]any{"visible": false},
			},
			"shipments.default": map[string]any{
				"shipment_no": map[string]any{"visible": true},
				"status":      map[string]any{"visible": false},
			},
			"outsourcing_orders.default": map[string]any{
				"outsourcing_order_no": map[string]any{"visible": true},
				"expected_return_date": map[string]any{"visible": false},
			},
			"finance_facts.default": map[string]any{
				"finance_fact_no": map[string]any{"visible": true},
				"amount":          map[string]any{"visible": false},
			},
		},
	}

	if !compiledSnapshotFieldPoliciesAreAllowed(snapshot) {
		t.Fatal("expanded field policy surfaces should be allowed")
	}
	policies := effectiveFieldPoliciesFromSnapshot(snapshot)
	for surfaceKey := range snapshot["fieldPolicies"].(map[string]any) {
		if _, ok := policies[surfaceKey]; !ok {
			t.Fatalf("surface %s missing from effective policies", surfaceKey)
		}
	}
}

func TestExpandedRuntimeFieldPolicySurfacesRejectUnknownFields(t *testing.T) {
	snapshot := map[string]any{
		"pages": []any{"sales-orders"},
		"fieldPolicies": map[string]any{
			"purchase_orders.default": map[string]any{
				"not_a_purchase_field": map[string]any{"visible": false},
			},
		},
	}
	if compiledSnapshotFieldPoliciesAreAllowed(snapshot) {
		t.Fatal("unknown field key must be rejected")
	}
}
