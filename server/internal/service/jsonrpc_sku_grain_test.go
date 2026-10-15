package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

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
	skuCodeSnapshot := "SKU-SNAPSHOT-52"
	if got := productionFactToAny(&biz.ProductionFact{ProductSkuID: intPtr(skuID), Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now})["product_sku_id"]; got != skuID {
		t.Fatalf("production response SKU=%v, want %d", got, skuID)
	}
	outsourcingResponse := outsourcingFactToAny(&biz.OutsourcingFact{ProductSkuID: intPtr(skuID), SKUCodeSnapshot: &skuCodeSnapshot, Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now})
	if got := outsourcingResponse["product_sku_id"]; got != skuID {
		t.Fatalf("outsourcing response SKU=%v, want %d", got, skuID)
	}
	if got := outsourcingResponse["sku_code_snapshot"]; got != skuCodeSnapshot {
		t.Fatalf("outsourcing response SKU snapshot=%v, want %q", got, skuCodeSnapshot)
	}
}

type outsourcingFactSKUSnapshotJSONRPCRepo struct {
	stubBusinessDashboardOperationalFactRepo
	fact *biz.OutsourcingFact
}

func (r *outsourcingFactSKUSnapshotJSONRPCRepo) ListOutsourcingFacts(context.Context, biz.OperationalFactFilter) ([]*biz.OutsourcingFact, int, error) {
	return []*biz.OutsourcingFact{r.fact}, 1, nil
}

func TestOperationalFactJSONRPCListCarriesRepoSKUSnapshot(t *testing.T) {
	now := time.Now()
	skuID := 53
	skuCodeSnapshot := "SKU-SNAPSHOT-53"
	repo := &outsourcingFactSKUSnapshotJSONRPCRepo{fact: &biz.OutsourcingFact{
		ID:              530,
		FactNo:          "OUT-SKU-SNAPSHOT-53",
		FactType:        biz.OutsourcingFactReturnReceipt,
		Status:          biz.OperationalFactStatusDraft,
		SubjectType:     biz.InventorySubjectProduct,
		SubjectID:       7,
		ProductSkuID:    &skuID,
		SKUCodeSnapshot: &skuCodeSnapshot,
		WarehouseID:     8,
		UnitID:          9,
		Quantity:        decimal.NewFromInt(1),
		OccurredAt:      now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}}
	admin := workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionOutsourcingFactRead)
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
	_, result, err := dispatcher.handleOperationalFact(
		workflowJSONRPCAdminContext(),
		"list_outsourcing_facts",
		"sku-snapshot-list",
		mustJSONRPCStruct(t, map[string]any{"limit": float64(20)}),
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("list outsourcing facts result=%#v err=%v", result, err)
	}
	rows, ok := result.Data.AsMap()["outsourcing_facts"].([]any)
	if !ok || len(rows) != 1 {
		t.Fatalf("outsourcing fact rows = %#v", result.Data.AsMap()["outsourcing_facts"])
	}
	row, ok := rows[0].(map[string]any)
	if !ok || row["product_sku_id"] != float64(skuID) || row["sku_code_snapshot"] != skuCodeSnapshot {
		t.Fatalf("outsourcing fact SKU response = %#v", rows[0])
	}
}

func intPtr(value int) *int {
	return &value
}
