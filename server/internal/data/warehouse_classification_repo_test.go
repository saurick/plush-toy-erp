package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
)

func TestWarehouseClassificationStockAndDefaultLifecycle(t *testing.T) {
	d, _ := openInventoryRepoTestData(t, "warehouse_classification_lifecycle")
	verifyWarehouseClassificationLifecycle(t, d)
}

func TestMasterDataSchemaPostgresWarehouseClassificationLifecycle(t *testing.T) {
	d, _ := openPurchaseReceiptPostgresTestData(t)
	verifyWarehouseClassificationLifecycle(t, d)
}

func verifyWarehouseClassificationLifecycle(t *testing.T, d *Data) {
	t.Helper()
	ctx := context.Background()
	logger := log.NewStdLogger(io.Discard)
	master := biz.NewMasterDataUsecase(NewMasterDataRepo(d, logger))
	stock := biz.NewInventoryUsecase(NewInventoryRepo(d, logger))
	scope := biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, d.postgres, "CAT-U-"+suffix)
	product := createTestProduct(t, ctx, d.postgres, unit.ID, "CAT-P-"+suffix)
	warehouse := func(kind string) *biz.Warehouse {
		row, err := master.SaveWarehouseForAccess(ctx, 0, &biz.WarehouseMutation{Code: "CAT-" + kind + suffix, Name: "分类测试仓", Type: kind, IsActive: true}, scope)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	main, auxiliary, finished := warehouse(biz.WarehouseMainMaterial), warehouse(biz.WarehouseAuxiliaryMaterial), warehouse(biz.WarehouseFinishedGoods)
	input := biz.MaterialMutation{Code: "CAT-M-" + suffix, Name: "模拟面料", StockCategory: biz.MaterialStockMain, DefaultWarehouseID: &main.ID, DefaultUnitID: unit.ID}
	material, err := master.CreateMaterial(ctx, &input)
	if err != nil || material.DefaultWarehouseID == nil || *material.DefaultWarehouseID != main.ID {
		t.Fatalf("default warehouse not saved: %+v %v", material, err)
	}
	input.DefaultWarehouseID = &auxiliary.ID
	if _, err := master.UpdateMaterial(ctx, material.ID, &input); !errors.Is(err, biz.ErrWarehouseCategoryMismatch) {
		t.Fatalf("incompatible default: %v", err)
	}
	input.StockCategory = biz.MaterialStockAuxiliary
	updated, err := master.UpdateMaterial(ctx, material.ID, &input)
	if err != nil || updated.StockCategory != biz.MaterialStockAuxiliary || *updated.DefaultWarehouseID != auxiliary.ID {
		t.Fatalf("switch default: %+v %v", updated, err)
	}
	input.StockCategory, input.DefaultWarehouseID = biz.MaterialStockMain, nil
	updated, err = master.UpdateMaterial(ctx, material.ID, &input)
	if err != nil || updated.DefaultWarehouseID != nil {
		t.Fatalf("clear default: %+v %v", updated, err)
	}
	apply := func(subject string, id, warehouseID int, key string) (*biz.InventoryTxnApplyResult, error) {
		return stock.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: subject, SubjectID: id, WarehouseID: warehouseID, UnitID: unit.ID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), SourceType: "TEST", IdempotencyKey: key + suffix, OccurredAt: time.Date(2026, 9, 9, 0, 0, 0, 0, time.UTC)})
	}
	for _, mismatch := range []struct {
		subject         string
		id, warehouseID int
	}{{biz.InventorySubjectMaterial, material.ID, auxiliary.ID}, {biz.InventorySubjectMaterial, material.ID, finished.ID}, {biz.InventorySubjectProduct, product.ID, main.ID}} {
		if _, err := apply(mismatch.subject, mismatch.id, mismatch.warehouseID, "wrong"); !errors.Is(err, biz.ErrWarehouseCategoryMismatch) {
			t.Fatalf("wrong warehouse accepted: %v", err)
		}
	}
	if count := d.postgres.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey("wrong" + suffix)).CountX(ctx); count != 0 {
		t.Fatal("rejected writes left stock txns")
	}
	posted, err := apply(biz.InventorySubjectMaterial, material.ID, main.ID, "main")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := apply(biz.InventorySubjectProduct, product.ID, finished.ID, "finished"); err != nil {
		t.Fatal(err)
	}
	input.StockCategory = biz.MaterialStockAuxiliary
	if _, err := master.UpdateMaterial(ctx, material.ID, &input); !errors.Is(err, biz.ErrWarehouseClassificationInUse) {
		t.Fatalf("changed category with conflicting stock: %v", err)
	}
	if _, err := master.SaveWarehouseForAccess(ctx, main.ID, &biz.WarehouseMutation{Code: main.Code, Name: main.Name, Type: biz.WarehouseAuxiliaryMaterial, IsActive: true}, scope); !errors.Is(err, biz.ErrWarehouseClassificationInUse) {
		t.Fatalf("changed occupied warehouse: %v", err)
	}
	if _, err := master.SaveWarehouseForAccess(ctx, main.ID, &biz.WarehouseMutation{Code: main.Code, Name: main.Name, Type: main.Type, IsActive: false}, scope); !errors.Is(err, biz.ErrWarehouseClassificationInUse) {
		t.Fatalf("disabled occupied warehouse: %v", err)
	}
	balances, total, err := stock.ListInventoryBalancesForAccess(ctx, biz.InventoryBalanceFilter{StockCategory: biz.MaterialStockMain, WarehouseID: main.ID, Limit: 1}, scope)
	if err != nil || total != 1 || len(balances) != 1 || balances[0].StockCategory != biz.MaterialStockMain {
		t.Fatalf("filtered balances: %+v %d %v", balances, total, err)
	}
	txns, total, err := stock.ListInventoryTxnsForAccess(ctx, biz.InventoryTxnFilter{StockCategory: biz.MaterialStockMain, WarehouseID: main.ID, Limit: 1}, scope)
	if err != nil || total != 1 || len(txns) != 1 || txns[0].SubjectID != material.ID {
		t.Fatalf("filtered txns: %+v %d %v", txns, total, err)
	}
	// Same-key retries return the posted fact even if reference configuration has since been disabled.
	d.postgres.Warehouse.UpdateOneID(main.ID).SetIsActive(false).SaveX(ctx)
	replay, err := apply(biz.InventorySubjectMaterial, material.ID, main.ID, "main")
	if err != nil || replay.Txn.ID != posted.Txn.ID {
		t.Fatalf("replay lost historical fact: %+v %v", replay, err)
	}
	if _, err := apply(biz.InventorySubjectMaterial, material.ID, main.ID, "inactive"); !errors.Is(err, biz.ErrWarehouseInactive) {
		t.Fatalf("inactive warehouse accepted new receipt: %v", err)
	}
	originalID := posted.Txn.ID
	_, err = stock.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: material.ID, WarehouseID: main.ID, UnitID: unit.ID, TxnType: biz.InventoryTxnReversal, Direction: -1, Quantity: decimal.NewFromInt(5), SourceType: "TEST", IdempotencyKey: "reverse" + suffix, ReversalOfTxnID: &originalID})
	if err != nil {
		t.Fatalf("historical reversal blocked: %v", err)
	}
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{auxiliary.ID}}
	if _, err := master.SaveWarehouseForAccess(ctx, main.ID, &biz.WarehouseMutation{Code: main.Code, Name: main.Name, Type: main.Type, IsActive: true}, assigned); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("foreign warehouse write: %v", err)
	}
	if _, err := master.SaveWarehouseForAccess(ctx, 0, &biz.WarehouseMutation{Code: "new", Name: "new", Type: main.Type, IsActive: true}, assigned); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("scoped user created global warehouse: %v", err)
	}
}

func TestPurchaseReceiptWarehousePerLineAndAtomicValidation(t *testing.T) {
	ctx := context.Background()
	d, client := openInventoryRepoTestData(t, "receipt_per_line_warehouses")
	f := createInventoryTestFixtures(t, ctx, client)
	first := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, f, "MIXED-WAREHOUSE", decimal.NewFromInt(10))
	main := client.Warehouse.UpdateOneID(f.warehouseID).SetType(biz.WarehouseMainMaterial).SaveX(ctx)
	auxiliary := client.Warehouse.Create().SetCode("AUX-WH").SetName("辅料仓").SetType(biz.WarehouseAuxiliaryMaterial).SaveX(ctx)
	m := client.Material.Create().SetCode("AUX-M").SetName("线").SetStockCategory(biz.MaterialStockAuxiliary).SetDefaultUnitID(f.unitID).SetDefaultWarehouseID(auxiliary.ID).SaveX(ctx)
	second := client.PurchaseOrderItem.Create().SetPurchaseOrderID(first.PurchaseOrderID).SetLineNo(2).SetMaterialID(m.ID).SetUnitID(f.unitID).SetPurchasedQuantity(decimal.NewFromInt(20)).SetLineStatus(biz.PurchaseOrderItemStatusOpen).SaveX(ctx)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(d, log.NewStdLogger(io.Discard)))
	input := &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: first.PurchaseOrderID, ReceiptNo: "MIXED-WH", ItemWarehouses: map[int]int{first.ID: main.ID, second.ID: main.ID}, IdempotencyKey: "mixed-wh"}
	before := client.PurchaseReceipt.Query().CountX(ctx)
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input); !errors.Is(err, biz.ErrWarehouseCategoryMismatch) {
		t.Fatalf("mixed material order accepted one wrong warehouse: %v", err)
	}
	if client.PurchaseReceipt.Query().CountX(ctx) != before {
		t.Fatal("invalid warehouse left a partial receipt")
	}
	input.ItemWarehouses[second.ID] = auxiliary.ID
	input.ItemWarehouses[99999] = main.ID
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("foreign source line mapping accepted: %v", err)
	}
	delete(input.ItemWarehouses, 99999)
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input)
	if err != nil || len(receipt.Items) != 2 || len(receipt.QualityInspections) != 2 {
		t.Fatalf("create mixed warehouse receipt: %+v %v", receipt, err)
	}
	for _, line := range receipt.Items {
		if line.WarehouseID != input.ItemWarehouses[*line.PurchaseOrderItemID] {
			t.Fatal("source row warehouse was overwritten")
		}
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 {
		t.Fatal("receipt draft posted stock")
	}
	replay, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input)
	if err != nil || replay.ID != receipt.ID {
		t.Fatalf("receipt replay: %+v %v", replay, err)
	}
	input.ItemWarehouses[second.ID] = main.ID
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("warehouse change reused same intent: %v", err)
	}
}

func TestMasterDataSchemaPostgresWarehouseChangeSerializesWithIncomingStock(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	d, client := openPurchaseReceiptPostgresTestData(t)
	f := createInventoryPostgresFixtures(t, ctx, client)
	tx, err := client.Tx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if tx != nil {
			if err := tx.Rollback(); err != nil {
				t.Errorf("rollback warehouse transaction: %v", err)
			}
		}
	}()
	if _, err := tx.Warehouse.UpdateOneID(f.warehouseID).SetType(biz.WarehouseAuxiliaryMaterial).Save(ctx); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := biz.NewInventoryUsecase(NewInventoryRepo(d, log.NewStdLogger(io.Discard))).ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1), TxnType: biz.InventoryTxnIn, Direction: 1, SourceType: "TEST", IdempotencyKey: "class-race-" + f.suffix})
		result <- err
	}()
	waitForPostgresBlockedQueryCount(t, ctx, d.sqldb, "warehouses", 1)
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	tx = nil
	if err := <-result; !errors.Is(err, biz.ErrWarehouseCategoryMismatch) {
		t.Fatalf("incoming stock ignored committed warehouse change: %v", err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey("class-race-" + f.suffix)).CountX(ctx); count != 0 {
		t.Fatal("race left a stock txn")
	}
}
