package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestWarehouseDataScopeFiltersInventoryAndWarehouseCountsBeforePagination(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_warehouse_data_scope")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	secondWarehouse := createTestWarehouse(t, ctx, client, "WH-SCOPE-002")
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	for index, warehouseID := range []int{fixtures.warehouseID, secondWarehouse.ID} {
		lot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectMaterial, fixtures.materialID, "LOT-SCOPE-00"+string(rune('1'+index)))
		if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
			WarehouseID: warehouseID, LotID: &lot.ID, TxnType: biz.InventoryTxnIn,
			Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: fixtures.unitID,
			SourceType: "TEST", IdempotencyKey: "SCOPE-IN-00" + string(rune('1'+index)),
		}); err != nil {
			t.Fatalf("seed scoped inventory failed: %v", err)
		}
	}
	for index, warehouseID := range []int{fixtures.warehouseID, secondWarehouse.ID} {
		receipt, err := inventoryUC.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
			ReceiptNo:    "PR-SCOPE-00" + string(rune('1'+index)),
			SupplierName: "范围测试供应商",
		})
		if err != nil {
			t.Fatalf("create scoped draft receipt failed: %v", err)
		}
		if _, err := inventoryUC.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
			ReceiptID: receipt.ID, MaterialID: fixtures.materialID,
			WarehouseID: warehouseID, UnitID: fixtures.unitID,
			Quantity: decimal.NewFromInt(2), IdempotencyKey: "scope-draft-line-00" + string(rune('1'+index)),
		}); err != nil {
			t.Fatalf("create scoped zero-balance HOLD lot failed: %v", err)
		}
	}

	scope := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{fixtures.warehouseID}}
	balances, total, err := inventoryUC.ListInventoryBalancesForAccess(ctx, biz.InventoryBalanceFilter{Limit: 1}, scope)
	if err != nil || total != 1 || len(balances) != 1 || balances[0].WarehouseID != fixtures.warehouseID {
		t.Fatalf("scoped balances = total %d items %#v err %v", total, balances, err)
	}
	txns, total, err := inventoryUC.ListInventoryTxnsForAccess(ctx, biz.InventoryTxnFilter{Limit: 1}, scope)
	if err != nil || total != 1 || len(txns) != 1 || txns[0].WarehouseID != fixtures.warehouseID {
		t.Fatalf("scoped txns = total %d items %#v err %v", total, txns, err)
	}
	lots, total, err := inventoryUC.ListInventoryLotsForAccess(ctx, biz.InventoryLotFilter{Limit: 10}, scope)
	if err != nil || total != 2 || len(lots) != 2 {
		t.Fatalf("scoped lots = total %d items %#v err %v", total, lots, err)
	}
	if holdCount := countInventoryLotsByStatus(lots, biz.InventoryLotHold); holdCount != 1 {
		t.Fatalf("scoped lots must include exactly one authorized zero-balance HOLD lot, got %d in %#v", holdCount, lots)
	}
	if _, _, err := inventoryUC.ListInventoryBalancesForAccess(ctx, biz.InventoryBalanceFilter{WarehouseID: secondWarehouse.ID}, scope); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("explicit unauthorized warehouse err = %v", err)
	}
	if _, err := inventoryUC.GetInventoryBalanceForAccess(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
		WarehouseID: secondWarehouse.ID, UnitID: fixtures.unitID,
	}, scope); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("unauthorized source lookup err = %v", err)
	}
	if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalanceForAccess(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
		WarehouseID: secondWarehouse.ID, TxnType: biz.InventoryTxnIn, Direction: 1,
		Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID, SourceType: "TEST", IdempotencyKey: "SCOPE-DENIED",
	}, scope); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("unauthorized inventory write err = %v", err)
	}

	masterDataUC := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	warehouses, total, err := masterDataUC.ListWarehousesForAccess(ctx, biz.MasterDataFilter{Limit: 1}, scope)
	if err != nil || total != 1 || len(warehouses) != 1 || warehouses[0].ID != fixtures.warehouseID {
		t.Fatalf("scoped warehouses = total %d items %#v err %v", total, warehouses, err)
	}
}

func countInventoryLotsByStatus(items []*biz.InventoryLot, status string) int {
	count := 0
	for _, item := range items {
		if item != nil && item.Status == status {
			count++
		}
	}
	return count
}

func TestWarehouseDataScopeMissingAndEmptyAssignedFailClosed(t *testing.T) {
	ctx := context.Background()
	data, _ := openInventoryRepoTestData(t, "inventory_warehouse_data_scope_closed")
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	for _, scope := range []biz.WarehouseDataScope{{}, {Mode: biz.DataScopeModeAssigned}} {
		items, total, err := inventoryUC.ListInventoryBalancesForAccess(ctx, biz.InventoryBalanceFilter{}, scope)
		if err != nil || total != 0 || len(items) != 0 {
			t.Fatalf("scope %#v must return empty, total=%d items=%#v err=%v", scope, total, items, err)
		}
	}
}
