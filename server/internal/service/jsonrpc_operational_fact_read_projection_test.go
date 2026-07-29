package service

import (
	"testing"
	"time"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestOperationalFactReadProjectionMapsUseExactDecimalStrings(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	originalAmount := decimal.RequireFromString("100.000001")
	outstandingAmount := decimal.RequireFromString("99.876543")
	factProjection := financeFactToAny(&biz.FinanceFact{
		ID:                10,
		FactNo:            "AR-PROJECTION",
		FactType:          biz.FinanceFactReceivable,
		Amount:            originalAmount,
		OutstandingAmount: outstandingAmount,
		OccurredAt:        now,
		CreatedAt:         now,
		UpdatedAt:         now,
	})
	if got := factProjection["outstanding_amount"]; got != outstandingAmount.String() {
		t.Fatalf("finance fact outstanding_amount=%#v want=%q", got, outstandingAmount.String())
	}

	paymentProjection := financePaymentToMap(&biz.FinancePayment{
		ID:         20,
		PaymentNo:  "PAY-PROJECTION",
		Amount:     decimal.RequireFromString("0.123458"),
		OccurredAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
		Allocations: []*biz.FinanceAllocation{{
			ID:                           21,
			FinanceFactID:                10,
			FinanceFactNo:                "AR-PROJECTION",
			FinanceFactType:              biz.FinanceFactReceivable,
			FinanceFactOriginalAmount:    originalAmount,
			FinanceFactOutstandingAmount: outstandingAmount,
			Amount:                       decimal.RequireFromString("0.123458"),
		}},
	})
	rawAllocations, ok := paymentProjection["allocations"].([]any)
	if !ok || len(rawAllocations) != 1 {
		t.Fatalf("payment allocations=%#v", paymentProjection["allocations"])
	}
	allocation, ok := rawAllocations[0].(map[string]any)
	if !ok {
		t.Fatalf("payment allocation=%#v", rawAllocations[0])
	}
	if allocation["finance_fact_no"] != "AR-PROJECTION" ||
		allocation["finance_fact_type"] != biz.FinanceFactReceivable ||
		allocation["finance_fact_original_amount"] != originalAmount.String() ||
		allocation["finance_fact_outstanding_amount"] != outstandingAmount.String() {
		t.Fatalf("payment allocation projection=%#v", allocation)
	}

	creditProjection := financeCreditNoteToMap(&biz.FinanceCreditNote{
		ID:                           30,
		CreditNoteNo:                 "CN-PROJECTION",
		FinanceFactID:                10,
		FinanceFactNo:                "AR-PROJECTION",
		FinanceFactType:              biz.FinanceFactReceivable,
		FinanceFactOriginalAmount:    originalAmount,
		FinanceFactOutstandingAmount: outstandingAmount,
		Amount:                       decimal.RequireFromString("0.000001"),
		CreatedAt:                    now,
	})
	if creditProjection["finance_fact_no"] != "AR-PROJECTION" ||
		creditProjection["finance_fact_type"] != biz.FinanceFactReceivable ||
		creditProjection["finance_fact_original_amount"] != originalAmount.String() ||
		creditProjection["finance_fact_outstanding_amount"] != outstandingAmount.String() {
		t.Fatalf("credit projection=%#v", creditProjection)
	}
}

func TestSalesReturnReadProjectionMapIncludesReadableSourceFields(t *testing.T) {
	skuCode := "SKU-PROJECTION"
	skuName := "投影规格"
	lotNo := "RMA-LOT-PROJECTION"
	item := salesReturnToMap(&biz.SalesReturn{
		ID:         40,
		ReturnNo:   "RMA-PROJECTION",
		ShipmentID: 41,
		ShipmentNo: "SHP-PROJECTION",
		Items: []*biz.SalesReturnItem{{
			ID:                          42,
			ProductCode:                 "PRODUCT-PROJECTION",
			ProductName:                 "投影产品",
			ProductSkuCode:              &skuCode,
			ProductSkuName:              &skuName,
			WarehouseCode:               "WH-PROJECTION",
			WarehouseName:               "投影仓",
			UnitCode:                    "PCS",
			UnitName:                    "件",
			LotNo:                       &lotNo,
			Quantity:                    decimal.RequireFromString("1.200001"),
			SourceShippedQuantity:       decimal.RequireFromString("5.500001"),
			ActiveReturnedQuantity:      decimal.RequireFromString("1.500003"),
			RemainingReturnableQuantity: decimal.RequireFromString("3.999998"),
		}},
	})
	if item["shipment_no"] != "SHP-PROJECTION" {
		t.Fatalf("shipment_no=%#v", item["shipment_no"])
	}
	rawLines, ok := item["items"].([]any)
	if !ok || len(rawLines) != 1 {
		t.Fatalf("sales return lines=%#v", item["items"])
	}
	line, ok := rawLines[0].(map[string]any)
	if !ok {
		t.Fatalf("sales return line=%#v", rawLines[0])
	}
	want := map[string]any{
		"product_code":                  "PRODUCT-PROJECTION",
		"product_name":                  "投影产品",
		"product_sku_code":              skuCode,
		"product_sku_name":              skuName,
		"warehouse_code":                "WH-PROJECTION",
		"warehouse_name":                "投影仓",
		"unit_code":                     "PCS",
		"unit_name":                     "件",
		"lot_no":                        lotNo,
		"source_shipped_quantity":       "5.500001",
		"active_returned_quantity":      "1.500003",
		"remaining_returnable_quantity": "3.999998",
	}
	for key, value := range want {
		if line[key] != value {
			t.Fatalf("%s=%#v want=%#v; line=%#v", key, line[key], value, line)
		}
	}
}
