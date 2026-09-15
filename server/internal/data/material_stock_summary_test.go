package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestMaterialStockSummaryKeepsWarehouseScopeAndMaterialIdentity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "material_stock_summary")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	second := createTestWarehouse(t, ctx, client, "WH-SUMMARY-002")
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	for index, warehouseID := range []int{fixtures.warehouseID, second.ID} {
		lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "LOT-SUMMARY-"+string(rune('1'+index)))
		if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
			WarehouseID: warehouseID, LotID: &lot.ID, TxnType: biz.InventoryTxnIn,
			Direction: 1, Quantity: decimal.RequireFromString("5.125001"), UnitID: fixtures.unitID,
			SourceType: "TEST", IdempotencyKey: "SUMMARY-IN-" + string(rune('1'+index)),
		}); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		scope    biz.WarehouseDataScope
		expected string
	}{
		{biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}, "10.250002"},
		{biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{fixtures.warehouseID}}, "5.125001"},
	} {
		rows, err := uc.SummarizeMaterialStockForAccess(ctx, []int{fixtures.materialID, fixtures.materialID}, tc.scope)
		if err != nil || len(rows) != 1 || rows[0].MaterialID != fixtures.materialID || rows[0].UnitID != fixtures.unitID || !rows[0].Quantity.Equal(decimal.RequireFromString(tc.expected)) {
			t.Fatalf("unexpected scoped material stock: %+v, %v", rows, err)
		}
	}
	if _, err := uc.SummarizeMaterialStockForAccess(ctx, []int{fixtures.materialID}, biz.WarehouseDataScope{}); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatal(err)
	}
	rows, err := uc.SummarizeMaterialStockForAccess(ctx, []int{fixtures.materialID + 100}, biz.WarehouseDataScope{Mode: biz.DataScopeModeAll})
	if err != nil || len(rows) != 0 {
		t.Fatalf("unrelated stock leaked: %+v %v", rows, err)
	}
}
