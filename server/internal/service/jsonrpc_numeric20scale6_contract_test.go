package service

import (
	"testing"

	"server/internal/biz"
)

func TestSourceDocumentAndFactQuantityParamsUseStringNumeric20Scale6(t *testing.T) {
	parsers := []struct {
		name  string
		parse func(any) bool
	}{
		{name: "bom-quantity", parse: func(value any) bool {
			_, ok := bomItemUpdateFromParams(map[string]any{"quantity": value, "loss_rate": "0"})
			return ok
		}},
		{name: "bom-loss-rate", parse: func(value any) bool {
			_, ok := bomItemUpdateFromParams(map[string]any{"quantity": "1", "loss_rate": value})
			return ok
		}},
		{name: "operational-fact", parse: func(value any) bool {
			_, ok := operationalFactMutationFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "stock-reservation", parse: func(value any) bool {
			_, ok := stockReservationFromSalesOrderCreateFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "production-material-issue", parse: func(value any) bool {
			_, ok := productionMaterialIssueFromOrderCreateFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "production-completion", parse: func(value any) bool {
			_, ok := productionCompletionFromOrderCreateFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "production-rework", parse: func(value any) bool {
			_, ok := productionReworkFromCompletionCreateFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "outsourcing-fact", parse: func(value any) bool {
			_, ok := outsourcingFactFromOrderCreateFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "outsourcing-order", parse: func(value any) bool {
			_, ok := outsourcingOrderItemMutationFromParams(map[string]any{"outsourcing_quantity": value})
			return ok
		}},
		{name: "purchase-receipt", parse: func(value any) bool {
			_, ok := purchaseReceiptItemCreateFromParams(map[string]any{"quantity": value})
			return ok
		}},
		{name: "purchase-order", parse: func(value any) bool {
			_, ok := purchaseOrderItemMutationFromParams(map[string]any{"purchased_quantity": value})
			return ok
		}},
		{name: "sales-order", parse: func(value any) bool {
			_, ok := salesOrderItemMutationFromParams(map[string]any{"ordered_quantity": value})
			return ok
		}},
		{name: "purchase-return-from-receipt", parse: func(value any) bool {
			_, ok := purchaseReturnFromReceiptCreateFromParams(map[string]any{
				"return_no": "RET-1", "purchase_receipt_id": 1, "returned_at": "2026-07-18", "idempotency_key": "ret-1",
				"items": []any{map[string]any{"purchase_receipt_item_id": 1, "quantity": value}},
			})
			return ok
		}},
		{name: "purchase-return-from-inspection", parse: func(value any) bool {
			_, ok := purchaseReturnFromQualityInspectionCreateFromParams(map[string]any{
				"return_no": "RET-2", "quality_inspection_id": 1, "quantity": value,
				"returned_at": "2026-07-18", "idempotency_key": "ret-2",
			})
			return ok
		}},
		{name: "purchase-receipt-adjustment", parse: func(value any) bool {
			_, ok := purchaseReceiptAdjustmentFromReceiptCreateFromParams(map[string]any{
				"adjustment_no": "ADJ-1", "purchase_receipt_id": 1, "adjusted_at": "2026-07-18", "idempotency_key": "adj-1",
				"items": []any{map[string]any{"purchase_receipt_item_id": 1, "adjust_type": "increase", "quantity": value}},
			})
			return ok
		}},
		{name: "production-order", parse: func(value any) bool {
			_, _, ok := productionOrderDraftFromParams(map[string]any{
				"order_no": "PROD-1", "idempotency_key": "prod-1",
				"items": []any{map[string]any{"line_no": 1, "product_id": 1, "unit_id": 1, "planned_quantity": value}},
			})
			return ok
		}},
		{name: "production-wip-transfer", parse: func(value any) bool {
			_, ok := productionWIPActionFromParams(map[string]any{
				"production_order_id": 1, "production_wip_batch_id": 1, "target_operation_id": 2,
				"quantity": value, "expected_version": 1, "idempotency_key": "wip-transfer-1",
			}, biz.ProductionWIPActionTransferToNextOperation, 1)
			return ok
		}},
		{name: "production-wip-rework", parse: func(value any) bool {
			_, ok := productionWIPActionFromParams(map[string]any{
				"production_order_id": 1, "production_wip_batch_id": 1, "target_operation_id": 2,
				"quantity": value, "reason": "返工", "expected_version": 1, "idempotency_key": "wip-rework-1",
			}, biz.ProductionWIPActionRework, 1)
			return ok
		}},
		{name: "production-wip-split", parse: func(value any) bool {
			_, ok := productionWIPSplitsFromParams([]any{
				map[string]any{"quantity": value}, map[string]any{"quantity": "1"},
			})
			return ok
		}},
		{name: "shipment", parse: func(value any) bool {
			_, ok := shipmentCreateWithItemsFromParams(map[string]any{
				"shipment_no": "SHP-1", "idempotency_key": "shp-1",
				"items": []any{map[string]any{"product_id": 1, "warehouse_id": 1, "unit_id": 1, "quantity": value}},
			})
			return ok
		}},
	}

	for _, parser := range parsers {
		t.Run(parser.name, func(t *testing.T) {
			for _, valid := range []string{"0.000001", "99999999999999.999999"} {
				if !parser.parse(valid) {
					t.Fatalf("numeric(20,6) value %q was rejected", valid)
				}
			}
			for _, invalid := range []any{float64(1), int(1), "1e-6", "0.0000001", "100000000000000", true, nil} {
				if parser.parse(invalid) {
					t.Fatalf("invalid numeric input %T(%v) was accepted", invalid, invalid)
				}
			}
		})
	}
}

func TestSourceDocumentMoneyParamsUseOptionalStringNumeric20Scale6(t *testing.T) {
	parsers := []struct {
		name  string
		parse func(string, any) bool
	}{
		{name: "sales-order", parse: func(field string, value any) bool {
			params := map[string]any{"ordered_quantity": "1", field: value}
			_, ok := salesOrderItemMutationFromParams(params)
			return ok
		}},
		{name: "purchase-order", parse: func(field string, value any) bool {
			params := map[string]any{"purchased_quantity": "1", field: value}
			_, ok := purchaseOrderItemMutationFromParams(params)
			return ok
		}},
		{name: "outsourcing-order", parse: func(field string, value any) bool {
			params := map[string]any{"outsourcing_quantity": "1", field: value}
			_, ok := outsourcingOrderItemMutationFromParams(params)
			return ok
		}},
		{name: "purchase-receipt", parse: func(field string, value any) bool {
			params := map[string]any{"quantity": "1", field: value}
			_, ok := purchaseReceiptItemCreateFromParams(params)
			return ok
		}},
	}

	for _, parser := range parsers {
		for _, field := range []string{"unit_price", "amount"} {
			t.Run(parser.name+"-"+field, func(t *testing.T) {
				for _, valid := range []any{nil, "0.000001", "99999999999999.999999"} {
					if !parser.parse(field, valid) {
						t.Fatalf("optional numeric(20,6) value %v was rejected", valid)
					}
				}
				for _, invalid := range []any{float64(1), int(1), "1e-6", "0.0000001", "100000000000000", true} {
					if parser.parse(field, invalid) {
						t.Fatalf("invalid optional numeric input %T(%v) was accepted", invalid, invalid)
					}
				}
			})
		}
	}
}
