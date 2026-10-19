package service

import "testing"

func TestIntegrationProcessInputsRejectCoercedSourceNodeAndVersion(t *testing.T) {
	badValues := []any{1.5, "1", true, nil, float64(9007199254740992)}
	for _, field := range []string{"process_instance_id", "process_node_instance_id", "expected_version", "sales_order_id"} {
		for _, bad := range badValues {
			params := map[string]any{"process_instance_id": float64(1), "process_node_instance_id": float64(2), "expected_version": float64(3), "sales_order_id": float64(4), "idempotency_key": "integration-submit"}
			if _, ok := salesOrderAcceptanceSubmitExecutionFromParams(params); !ok {
				t.Fatal("valid execution rejected")
			}
			params[field] = bad
			if _, ok := salesOrderAcceptanceSubmitExecutionFromParams(params); ok {
				t.Fatalf("%s accepted %T(%v)", field, bad, bad)
			}
		}
	}
	for _, bad := range badValues {
		for _, field := range []string{"sales_order_id", "business_ref_id"} {
			if _, ok := salesOrderAcceptanceProcessInputFromParams(map[string]any{field: bad, "idempotency_key": "integration-start"}); ok {
				t.Fatalf("sales source %s accepted %T", field, bad)
			}
		}
		for _, field := range []string{"shipment_id", "business_ref_id"} {
			if _, ok := finishedGoodsDeliveryProcessInputFromParams(map[string]any{field: bad, "idempotency_key": "integration-start"}); ok {
				t.Fatalf("shipment source %s accepted %T", field, bad)
			}
		}
	}
}
