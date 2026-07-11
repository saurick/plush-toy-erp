package service

import (
	"testing"
	"time"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestInventoryJSONRPCSKUFiltersAndResponses(t *testing.T) {
	const skuID = 41
	params := map[string]any{"product_sku_id": float64(skuID)}
	if got := inventoryBalanceFilterFromParams(params).ProductSkuID; got != skuID {
		t.Fatalf("balance filter SKU=%d, want %d", got, skuID)
	}
	if got, ok := inventoryLotFilterFromParams(params); !ok || got.ProductSkuID != skuID {
		t.Fatalf("lot filter=%#v ok=%v", got, ok)
	}
	if got, ok := inventoryTxnFilterFromParams(params); !ok || got.ProductSkuID != skuID {
		t.Fatalf("txn filter=%#v ok=%v", got, ok)
	}

	now := time.Now()
	for name, response := range map[string]map[string]any{
		"balance": inventoryBalanceToAny(&biz.InventoryBalance{ProductSkuID: intPtr(skuID), Quantity: decimal.NewFromInt(1), ActiveReservedQuantity: decimal.Zero, AvailableQuantity: decimal.NewFromInt(1), UpdatedAt: now}),
		"lot":     inventoryLotToAny(&biz.InventoryLot{ProductSkuID: intPtr(skuID), CreatedAt: now, UpdatedAt: now}),
		"txn":     inventoryTxnToAny(&biz.InventoryTxn{ProductSkuID: intPtr(skuID), Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now}),
	} {
		if got := response["product_sku_id"]; got != skuID {
			t.Fatalf("%s response SKU=%v, want %d", name, got, skuID)
		}
	}
}

func TestOperationalFactJSONRPCSKUInputAndResponses(t *testing.T) {
	const skuID = 52
	in, ok := operationalFactMutationFromParams(map[string]any{
		"fact_no":         "FACT-SKU",
		"fact_type":       "FINISHED_GOODS_RECEIPT",
		"subject_type":    "PRODUCT",
		"subject_id":      float64(7),
		"product_sku_id":  float64(skuID),
		"warehouse_id":    float64(8),
		"unit_id":         float64(9),
		"quantity":        "1",
		"idempotency_key": "FACT-SKU",
	})
	if !ok || in.ProductSkuID == nil || *in.ProductSkuID != skuID {
		t.Fatalf("operational fact input=%#v ok=%v", in, ok)
	}

	now := time.Now()
	if got := productionFactToAny(&biz.ProductionFact{ProductSkuID: intPtr(skuID), Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now})["product_sku_id"]; got != skuID {
		t.Fatalf("production response SKU=%v, want %d", got, skuID)
	}
	if got := outsourcingFactToAny(&biz.OutsourcingFact{ProductSkuID: intPtr(skuID), Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now})["product_sku_id"]; got != skuID {
		t.Fatalf("outsourcing response SKU=%v, want %d", got, skuID)
	}
}

func intPtr(value int) *int {
	return &value
}
