package data

import (
	"context"
	stdsql "database/sql"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

type inventoryTestFixtures struct {
	unitID      int
	materialID  int
	productID   int
	warehouseID int
}

func TestInventoryMasterDataCodeUnique(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:inventory_master_unique?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS")
	if _, err := client.Unit.Create().SetCode("PCS").SetName("重复单位").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected unit code unique constraint, got %v", err)
	}

	createTestMaterial(t, ctx, client, unit.ID, "MAT-001")
	if _, err := client.Material.Create().
		SetCode("MAT-001").
		SetName("重复物料").
		SetDefaultUnitID(unit.ID).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected material code unique constraint, got %v", err)
	}

	createTestProduct(t, ctx, client, unit.ID, "PRD-001")
	if _, err := client.Product.Create().
		SetCode("PRD-001").
		SetName("重复成品").
		SetDefaultUnitID(unit.ID).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected product code unique constraint, got %v", err)
	}

	createTestWarehouse(t, ctx, client, "RAW-01")
	if _, err := client.Warehouse.Create().
		SetCode("RAW-01").
		SetName("重复仓库").
		SetType("RAW_MATERIAL").
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected warehouse code unique constraint, got %v", err)
	}
}

func TestInventoryRepo_CreateInventoryLots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lots")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	colorNo := "C-01"
	dyeLotNo := "DYE-01"
	materialLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-001",
		ColorNo:     &colorNo,
		DyeLotNo:    &dyeLotNo,
	})
	if err != nil {
		t.Fatalf("create material lot failed: %v", err)
	}
	if materialLot.Status != biz.InventoryLotActive {
		t.Fatalf("expected default lot status ACTIVE, got %s", materialLot.Status)
	}

	productLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		LotNo:       "PRD-LOT-001",
	})
	if err != nil {
		t.Fatalf("create product lot failed: %v", err)
	}
	if productLot.SubjectType != biz.InventorySubjectProduct {
		t.Fatalf("expected product lot subject PRODUCT, got %s", productLot.SubjectType)
	}

	loaded, err := uc.GetInventoryLot(ctx, materialLot.ID)
	if err != nil {
		t.Fatalf("get material lot failed: %v", err)
	}
	if loaded.LotNo != materialLot.LotNo {
		t.Fatalf("expected loaded lot %s, got %s", materialLot.LotNo, loaded.LotNo)
	}
	if err := client.InventoryLot.DeleteOneID(materialLot.ID).Exec(ctx); err == nil {
		t.Fatalf("expected inventory lot delete to be rejected")
	}

	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-001",
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate lot unique constraint, got %v", err)
	}

	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   999999,
		LotNo:       "MISSING-MATERIAL-LOT",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing material lot subject to be rejected, got %v", err)
	}

	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   999999,
		LotNo:       "MISSING-PRODUCT-LOT",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing product lot subject to be rejected, got %v", err)
	}
}

func TestInventoryRepo_ApplyTxnUpdatesBalances(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_apply")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	materialIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10.5"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-in-001",
	})
	if err != nil {
		t.Fatalf("material inbound failed: %v", err)
	}
	assertDecimalEqual(t, materialIn.Balance.Quantity, "10.5")

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10.5"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-in-001",
	})
	if err != nil {
		t.Fatalf("material inbound replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected replay to be marked idempotent")
	}
	if replayed.Txn.ID != materialIn.Txn.ID {
		t.Fatalf("expected replay to return existing txn id=%d, got %d", materialIn.Txn.ID, replayed.Txn.ID)
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "10.5")

	productIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "3.25"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "prd-in-001",
	})
	if err != nil {
		t.Fatalf("product inbound failed: %v", err)
	}
	assertDecimalEqual(t, productIn.Balance.Quantity, "3.25")

	materialOut, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "4"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-out-001",
	})
	if err != nil {
		t.Fatalf("material outbound failed: %v", err)
	}
	assertDecimalEqual(t, materialOut.Balance.Quantity, "6.5")

	txnCountBeforeFailedOut, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count txns before failed outbound failed: %v", err)
	}
	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "7"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-out-overdraw",
	})
	if !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected insufficient stock, got %v", err)
	}
	txnCountAfterFailedOut, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count txns after failed outbound failed: %v", err)
	}
	if txnCountAfterFailedOut != txnCountBeforeFailedOut {
		t.Fatalf("failed outbound should not create txn, before=%d after=%d", txnCountBeforeFailedOut, txnCountAfterFailedOut)
	}

	reversalOf := materialOut.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "4"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "mat-reversal-001",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("material reversal failed: %v", err)
	}
	assertDecimalEqual(t, reversed.Balance.Quantity, "10.5")

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get material balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "10.5")

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected inventory balance unique constraint, got %v", err)
	}
}

func TestInventoryRepo_ApplyTxnUpdatesLotBalances(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_apply")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	materialLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-APPLY-001")
	productLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectProduct, fixtures.productID, "PRD-LOT-APPLY-001")

	lotIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &materialLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-in-001",
	})
	if err != nil {
		t.Fatalf("lot inbound failed: %v", err)
	}
	assertOptionalIntEqual(t, lotIn.Txn.LotID, materialLot.ID)
	assertOptionalIntEqual(t, lotIn.Balance.LotID, materialLot.ID)
	assertDecimalEqual(t, lotIn.Balance.Quantity, "10")
	persistedLotInTxn, err := client.InventoryTxn.Get(ctx, lotIn.Txn.ID)
	if err != nil {
		t.Fatalf("get persisted lot inbound txn failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedLotInTxn.LotID, materialLot.ID)
	persistedLotBalance, err := client.InventoryBalance.Get(ctx, lotIn.Balance.ID)
	if err != nil {
		t.Fatalf("get persisted lot balance failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedLotBalance.LotID, materialLot.ID)

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &materialLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-in-001",
	})
	if err != nil {
		t.Fatalf("lot inbound replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected lot inbound replay to be idempotent")
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "10")

	nilLotIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "5"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-no-lot-in-001",
	})
	if err != nil {
		t.Fatalf("non-lot inbound failed: %v", err)
	}
	if nilLotIn.Balance.LotID != nil {
		t.Fatalf("expected non-lot balance lot_id to be nil, got %v", *nilLotIn.Balance.LotID)
	}
	assertDecimalEqual(t, nilLotIn.Balance.Quantity, "5")

	lotOut, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &materialLot.ID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-out-001",
	})
	if err != nil {
		t.Fatalf("lot outbound failed: %v", err)
	}
	assertDecimalEqual(t, lotOut.Balance.Quantity, "7")

	batchBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &materialLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance failed: %v", err)
	}
	assertDecimalEqual(t, batchBalance.Quantity, "7")

	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "5")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "6"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-no-lot-overdraw-001",
	})
	if !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected non-lot outbound to ignore lot stock, got %v", err)
	}
	batchBalanceAfterNonLotOverdraw, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &materialLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after non-lot overdraw failed: %v", err)
	}
	assertDecimalEqual(t, batchBalanceAfterNonLotOverdraw.Quantity, "7")
	nonLotBalanceAfterOverdraw, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance after non-lot overdraw failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalanceAfterOverdraw.Quantity, "5")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &productLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot",
		IdempotencyKey: "mat-lot-mismatch-001",
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected txn lot subject mismatch to be rejected, got %v", err)
	}

	reversalOf := lotOut.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "test_lot",
		IdempotencyKey:  "mat-lot-reversal-001",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("lot reversal without explicit lot_id failed: %v", err)
	}
	assertOptionalIntEqual(t, reversed.Txn.LotID, materialLot.ID)
	assertDecimalEqual(t, reversed.Balance.Quantity, "10")
	persistedReversalTxn, err := client.InventoryTxn.Get(ctx, reversed.Txn.ID)
	if err != nil {
		t.Fatalf("get persisted lot reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedReversalTxn.LotID, materialLot.ID)

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		LotID:           &productLot.ID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "test_lot",
		IdempotencyKey:  "mat-lot-reversal-wrong-lot",
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected reversal with mismatched lot_id to be rejected, got %v", err)
	}

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		LotID:           &materialLot.ID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "test_lot",
		IdempotencyKey:  "mat-lot-reversal-duplicate",
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrInventoryTxnAlreadyReversed) {
		t.Fatalf("expected duplicate lot reversal to be rejected, got %v", err)
	}
}

func TestInventoryRepo_LotBalancesHaveSeparateUniqueScopes(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_unique")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lotA := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-UNIQ-A")
	lotB := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-UNIQ-B")

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("create nil-lot balance failed: %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate nil-lot balance unique constraint, got %v", err)
	}

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotA.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("create lot balance failed: %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotA.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate lot balance unique constraint, got %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotB.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("expected different lot balance to be allowed, got %v", err)
	}
}

func TestInventoryRepo_PreservesDecimalPrecision(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_decimal")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	applied, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1.234567"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-decimal-001",
	})
	if err != nil {
		t.Fatalf("decimal inbound failed: %v", err)
	}
	assertDecimalEqual(t, applied.Txn.Quantity, "1.234567")
	assertDecimalEqual(t, applied.Balance.Quantity, "1.234567")
}

func TestInventoryRepo_ReversalOffsetsOriginalAndRejectsDuplicate(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_reversal")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	inbound, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "mat-reversal-in-001",
	})
	if err != nil {
		t.Fatalf("inbound before reversal failed: %v", err)
	}

	reversalOf := inbound.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        mustDecimal(t, "10"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "mat-reversal-in-001-r",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("reversal failed: %v", err)
	}
	assertDecimalEqual(t, reversed.Balance.Quantity, "0")

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        mustDecimal(t, "10"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "mat-reversal-in-001-r",
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("reversal replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected reversal replay to be idempotent")
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "0")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       -1,
		Quantity:        mustDecimal(t, "10"),
		UnitID:          fixtures.unitID,
		SourceType:      "test",
		IdempotencyKey:  "mat-reversal-in-001-r-duplicate",
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrInventoryTxnAlreadyReversed) {
		t.Fatalf("expected duplicate reversal to be rejected, got %v", err)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after duplicate reversal failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "0")
}

func TestInventoryTxnRejectsHistoricalDelete(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_immutable_txn")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	applied, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "immutable-txn-001",
	})
	if err != nil {
		t.Fatalf("inbound before immutable delete check failed: %v", err)
	}
	if err := client.InventoryTxn.DeleteOneID(applied.Txn.ID).Exec(ctx); err == nil {
		t.Fatalf("expected inventory txn delete to be rejected")
	}
}

func TestInventoryRepo_RejectsInvalidSubjectReferences(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_invalid_subject")

	unit := createTestUnit(t, ctx, client, "PCS")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-SUBJECT-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-SUBJECT-001")
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      product.ID,
		WarehouseID:    warehouse.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         unit.ID,
		SourceType:     "test",
		IdempotencyKey: "invalid-material-points-product",
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected MATERIAL with product id to be rejected, got %v", err)
	}

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      999999,
		WarehouseID:    warehouse.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         unit.ID,
		SourceType:     "test",
		IdempotencyKey: "invalid-product-missing",
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing PRODUCT to be rejected, got %v", err)
	}
}

func TestInventoryRepo_ConcurrentOutboundCannotOverdraw(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_concurrent_out")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test",
		IdempotencyKey: "concurrent-in-001",
	}); err != nil {
		t.Fatalf("inbound before concurrent outbound failed: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				TxnType:        biz.InventoryTxnOut,
				Direction:      -1,
				Quantity:       mustDecimal(t, "7"),
				UnitID:         fixtures.unitID,
				SourceType:     "test",
				IdempotencyKey: "concurrent-out-00" + string(rune('1'+i)),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	insufficient := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			insufficient++
		default:
			t.Fatalf("unexpected concurrent outbound error: %v", err)
		}
	}
	if successes != 1 || insufficient != 1 {
		t.Fatalf("expected one success and one insufficient stock, successes=%d insufficient=%d", successes, insufficient)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after concurrent outbound failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "3")
}

func TestInventoryRepo_LotConcurrentOutboundCannotOverdraw(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_concurrent_out")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-CONCURRENT")

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_concurrent",
		IdempotencyKey: "lot-concurrent-in-001",
	}); err != nil {
		t.Fatalf("lot inbound before concurrent outbound failed: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnOut,
				Direction:      -1,
				Quantity:       mustDecimal(t, "7"),
				UnitID:         fixtures.unitID,
				SourceType:     "test_lot_concurrent",
				IdempotencyKey: "lot-concurrent-out-00" + string(rune('1'+i)),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	insufficient := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			insufficient++
		default:
			t.Fatalf("unexpected lot concurrent outbound error: %v", err)
		}
	}
	if successes != 1 || insufficient != 1 {
		t.Fatalf("expected one lot success and one insufficient stock, successes=%d insufficient=%d", successes, insufficient)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after concurrent outbound failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "3")
}

func TestInventoryRepo_BOMHeaderAndItems(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	header, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V1",
		Status:    biz.BOMStatusActive,
	})
	if err != nil {
		t.Fatalf("create bom header failed: %v", err)
	}
	if header.Status != biz.BOMStatusActive {
		t.Fatalf("expected active bom header, got %s", header.Status)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V1",
		Status:    biz.BOMStatusDraft,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected product/version unique constraint, got %v", err)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V2",
		Status:    biz.BOMStatusActive,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected one ACTIVE BOM per product constraint, got %v", err)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V2",
		Status:    biz.BOMStatusDraft,
	}); err != nil {
		t.Fatalf("expected draft BOM with different version to be allowed, got %v", err)
	}

	position := "face"
	item, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1.250000"),
		UnitID:      fixtures.unitID,
		LossRate:    mustDecimal(t, "0.100000"),
		Position:    &position,
	})
	if err != nil {
		t.Fatalf("create bom item failed: %v", err)
	}
	assertDecimalEqual(t, item.Quantity, "1.250000")
	assertDecimalEqual(t, item.LossRate, "0.100000")

	activeHeader, err := uc.GetActiveBOMByProduct(ctx, fixtures.productID)
	if err != nil {
		t.Fatalf("get active bom failed: %v", err)
	}
	if activeHeader.ID != header.ID {
		t.Fatalf("expected active bom id %d, got %d", header.ID, activeHeader.ID)
	}

	items, err := uc.ListBOMItemsByProduct(ctx, fixtures.productID)
	if err != nil {
		t.Fatalf("list active bom items failed: %v", err)
	}
	if len(items) != 1 || items[0].ID != item.ID {
		t.Fatalf("expected one active bom item id=%d, got %#v", item.ID, items)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    decimal.Zero,
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 to be rejected, got %v", err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    mustDecimal(t, "-0.01"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected loss_rate < 0 to be rejected, got %v", err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  999999,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing material to be rejected, got %v", err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      999999,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing unit to be rejected, got %v", err)
	}

	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(decimal.Zero).
		SetUnitID(fixtures.unitID).
		SetLossRate(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for quantity > 0, got %v", err)
	}
	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitID(fixtures.unitID).
		SetLossRate(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for loss_rate >= 0, got %v", err)
	}
}

func TestInventoryRepo_PurchaseReceiptLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-IN-001",
		SupplierName: "布料供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt draft failed: %v", err)
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("expected draft purchase receipt, got %s", receipt.Status)
	}

	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotNo:       stringPtr("LOT-A"),
		Quantity:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 to be rejected, got %v", err)
	}

	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:    receipt.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		LotNo:        stringPtr("LOT-A"),
		Quantity:     mustDecimal(t, "10"),
		SourceLineNo: stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add purchase receipt item failed: %v", err)
	}

	txnCountBeforePost, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count txns before post failed: %v", err)
	}
	if txnCountBeforePost != 0 {
		t.Fatalf("draft purchase receipt should not affect inventory, txn count=%d", txnCountBeforePost)
	}

	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post purchase receipt failed: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptStatusPosted || posted.PostedAt == nil {
		t.Fatalf("expected posted receipt with posted_at, got status=%s posted_at=%v", posted.Status, posted.PostedAt)
	}
	if len(posted.Items) != 1 {
		t.Fatalf("expected one posted item, got %d", len(posted.Items))
	}

	lotID := posted.Items[0].LotID
	if lotID == nil {
		t.Fatalf("expected lot_id to be set after posting lot_no item")
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get posted lot balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "10")

	inboundTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase receipt inbound txn failed: %v", err)
	}
	assertOptionalIntEqual(t, inboundTxn.LotID, *lotID)
	if inboundTxn.IdempotencyKey != biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID) {
		t.Fatalf("unexpected inbound idempotency key %s", inboundTxn.IdempotencyKey)
	}

	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("repeat post purchase receipt failed: %v", err)
	}
	balanceAfterReplay, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after repeat post failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterReplay.Quantity, "10")
	inboundCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count inbound txns after repeat post failed: %v", err)
	}
	if inboundCount != 1 {
		t.Fatalf("repeat post should keep one inbound txn, got %d", inboundCount)
	}

	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("cancel posted purchase receipt failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected cancelled receipt, got %s", cancelled.Status)
	}
	balanceAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after cancel failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "0")
	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase receipt reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *lotID)
	if reversalTxn.IdempotencyKey != biz.PurchaseReceiptReversalIdempotencyKey(receipt.ID, item.ID) {
		t.Fatalf("unexpected reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}

	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("repeat cancel purchase receipt failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat cancel should keep one reversal txn, got %d", reversalCount)
	}
}

func TestInventoryRepo_PurchaseReceiptTraceProtection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_trace_protection")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-TRACE-001",
		SupplierName: "追溯供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create trace receipt failed: %v", err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:    receipt.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		LotNo:        stringPtr("TRACE-LOT-001"),
		Quantity:     mustDecimal(t, "6"),
		SourceLineNo: stringPtr("TRACE-LINE-001"),
	})
	if err != nil {
		t.Fatalf("add trace receipt item failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("draft receipt must not be cancellable, got %v", err)
	}

	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post trace receipt failed: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("expected posted trace receipt, got %s", posted.Status)
	}
	lotID := posted.Items[0].LotID
	if lotID == nil {
		t.Fatalf("expected posted trace item lot_id")
	}

	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted receipt must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(receipt.ID).SetReceiptNo("PR-TRACE-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected posted receipt protected field update to be rejected")
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(receipt.ID).SetStatus(biz.PurchaseReceiptStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected posted receipt status update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "7")).Save(ctx); err == nil {
		t.Fatalf("expected posted receipt item quantity update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(item.ID).SetLotNo("TRACE-LOT-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected posted receipt item lot_no update to be rejected")
	}
	if _, err := client.PurchaseReceipt.Delete().Where(purchasereceipt.ID(receipt.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase receipt bulk delete to be rejected")
	}
	if err := client.PurchaseReceiptItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase receipt item delete-one to be rejected")
	}

	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("cancel posted trace receipt failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected cancelled trace receipt, got %s", cancelled.Status)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled receipt must not be posted again, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled receipt must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(receipt.ID).SetSupplierName("修改供应商").Save(ctx); err == nil {
		t.Fatalf("expected cancelled receipt protected field update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected cancelled receipt item warehouse update to be rejected")
	}
	if err := client.PurchaseReceipt.DeleteOneID(receipt.ID).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase receipt delete-one to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.Delete().Where(purchasereceiptitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase receipt item bulk delete to be rejected")
	}

	tracedTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(item.ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query traced inventory txns failed: %v", err)
	}
	if len(tracedTxns) != 2 {
		t.Fatalf("expected inbound and reversal trace txns, got %d", len(tracedTxns))
	}
	var inboundTxnID, reversalTxnID int
	for _, txn := range tracedTxns {
		assertOptionalIntEqual(t, txn.SourceID, receipt.ID)
		assertOptionalIntEqual(t, txn.SourceLineID, item.ID)
		assertOptionalIntEqual(t, txn.LotID, *lotID)
		switch txn.TxnType {
		case biz.InventoryTxnIn:
			inboundTxnID = txn.ID
		case biz.InventoryTxnReversal:
			reversalTxnID = txn.ID
		default:
			t.Fatalf("unexpected trace txn type %s", txn.TxnType)
		}
	}
	if inboundTxnID == 0 || reversalTxnID == 0 {
		t.Fatalf("expected both inbound and reversal txns, inbound=%d reversal=%d", inboundTxnID, reversalTxnID)
	}
	if err := client.InventoryTxn.DeleteOneID(inboundTxnID).Exec(ctx); err == nil {
		t.Fatalf("expected inbound inventory txn delete to be rejected")
	}
	if err := client.InventoryTxn.DeleteOneID(reversalTxnID).Exec(ctx); err == nil {
		t.Fatalf("expected reversal inventory txn delete to be rejected")
	}
	if _, err := client.PurchaseReceipt.Get(ctx, receipt.ID); err != nil {
		t.Fatalf("receipt should remain after failed deletes: %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Get(ctx, item.ID); err != nil {
		t.Fatalf("receipt item should remain after failed deletes: %v", err)
	}
}

func TestInventoryRepo_PurchaseReceiptLotsAndNonLotSeparation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_lots")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	firstReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-LOT-001", fixtures, stringPtr("LOT-SAME"), mustDecimal(t, "5"))
	firstLotID := firstReceipt.Items[0].LotID
	if firstLotID == nil {
		t.Fatalf("expected first lot_id")
	}
	secondReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-LOT-002", fixtures, stringPtr("LOT-SAME"), mustDecimal(t, "2"))
	assertOptionalIntEqual(t, secondReceipt.Items[0].LotID, *firstLotID)
	sameLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       firstLotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get same lot balance failed: %v", err)
	}
	assertDecimalEqual(t, sameLotBalance.Quantity, "7")

	otherReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-LOT-003", fixtures, stringPtr("LOT-OTHER"), mustDecimal(t, "3"))
	otherLotID := otherReceipt.Items[0].LotID
	if otherLotID == nil {
		t.Fatalf("expected other lot_id")
	}
	if *otherLotID == *firstLotID {
		t.Fatalf("expected different lot_no to create different lot_id")
	}
	otherLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       otherLotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get other lot balance failed: %v", err)
	}
	assertDecimalEqual(t, otherLotBalance.Quantity, "3")

	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-NO-LOT-001", fixtures, nil, mustDecimal(t, "4"))
	if nonLotReceipt.Items[0].LotID != nil {
		t.Fatalf("expected non-lot receipt item lot_id nil, got %v", *nonLotReceipt.Items[0].LotID)
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot purchase balance failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "4")
	sameLotBalanceAfterNonLot, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       firstLotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get same lot balance after non-lot receipt failed: %v", err)
	}
	assertDecimalEqual(t, sameLotBalanceAfterNonLot.Quantity, "7")

	lotCount, err := client.InventoryLot.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count lots after purchase receipts failed: %v", err)
	}
	if lotCount != 2 {
		t.Fatalf("expected two material lots for two lot_no values, got %d", lotCount)
	}
}

func TestInventoryRepo_PurchaseReturnLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-IN-001", fixtures, stringPtr("RET-LOT-A"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected posted receipt lot_id")
	}

	returnDraft, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PR-RET-001",
		PurchaseReceiptID: &postedReceipt.ID,
		SupplierName:      "布料供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase return draft failed: %v", err)
	}
	if returnDraft.Status != biz.PurchaseReturnStatusDraft {
		t.Fatalf("expected draft purchase return, got %s", returnDraft.Status)
	}

	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              returnDraft.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 to be rejected, got %v", err)
	}

	item, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              returnDraft.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
		SourceLineNo:          stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add purchase return item failed: %v", err)
	}

	outCountBeforePost, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count purchase return out txns before post failed: %v", err)
	}
	if outCountBeforePost != 0 {
		t.Fatalf("draft purchase return should not affect inventory, out txn count=%d", outCountBeforePost)
	}

	postedReturn, err := uc.PostPurchaseReturn(ctx, returnDraft.ID)
	if err != nil {
		t.Fatalf("post purchase return failed: %v", err)
	}
	if postedReturn.Status != biz.PurchaseReturnStatusPosted || postedReturn.PostedAt == nil {
		t.Fatalf("expected posted return with posted_at, got status=%s posted_at=%v", postedReturn.Status, postedReturn.PostedAt)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after purchase return failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "6")

	outTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase return out txn failed: %v", err)
	}
	assertOptionalIntEqual(t, outTxn.LotID, *receiptItem.LotID)
	if outTxn.IdempotencyKey != biz.PurchaseReturnOutboundIdempotencyKey(returnDraft.ID, item.ID) {
		t.Fatalf("unexpected outbound idempotency key %s", outTxn.IdempotencyKey)
	}

	if _, err := uc.PostPurchaseReturn(ctx, returnDraft.ID); err != nil {
		t.Fatalf("repeat post purchase return failed: %v", err)
	}
	balanceAfterReplay, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after repeat return post failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterReplay.Quantity, "6")
	outCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count out txns after repeat return post failed: %v", err)
	}
	if outCount != 1 {
		t.Fatalf("repeat post should keep one out txn, got %d", outCount)
	}

	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    returnDraft.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted purchase return must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(returnDraft.ID).SetStatus(biz.PurchaseReturnStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected posted return status update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "5")).Save(ctx); err == nil {
		t.Fatalf("expected posted return item quantity update to be rejected")
	}
	if _, err := client.PurchaseReturn.Delete().Where(purchasereturn.ID(returnDraft.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase return bulk delete to be rejected")
	}
	if err := client.PurchaseReturnItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase return item delete-one to be rejected")
	}

	draftToCancel, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-DRAFT-CANCEL",
		SupplierName: "布料供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft return for cancel guard failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, draftToCancel.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("draft purchase return must not be cancellable, got %v", err)
	}

	cancelledReturn, err := uc.CancelPostedPurchaseReturn(ctx, returnDraft.ID)
	if err != nil {
		t.Fatalf("cancel posted purchase return failed: %v", err)
	}
	if cancelledReturn.Status != biz.PurchaseReturnStatusCancelled {
		t.Fatalf("expected cancelled return, got %s", cancelledReturn.Status)
	}
	balanceAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after purchase return cancel failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "10")

	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase return reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *receiptItem.LotID)
	if reversalTxn.IdempotencyKey != biz.PurchaseReturnReversalIdempotencyKey(returnDraft.ID, item.ID) {
		t.Fatalf("unexpected return reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}

	if _, err := uc.CancelPostedPurchaseReturn(ctx, returnDraft.ID); err != nil {
		t.Fatalf("repeat cancel purchase return failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count return reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat cancel should keep one reversal txn, got %d", reversalCount)
	}
	if _, err := uc.PostPurchaseReturn(ctx, returnDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled return must not be posted again, got %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    returnDraft.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled purchase return must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(returnDraft.ID).SetSupplierName("修改供应商").Save(ctx); err == nil {
		t.Fatalf("expected cancelled return protected update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected cancelled return item protected update to be rejected")
	}
	if err := client.PurchaseReturn.DeleteOneID(returnDraft.ID).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase return delete-one to be rejected")
	}
	if _, err := client.PurchaseReturnItem.Delete().Where(purchasereturnitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase return item bulk delete to be rejected")
	}

	tracedTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.SourceLineID(item.ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query traced return inventory txns failed: %v", err)
	}
	if len(tracedTxns) != 2 {
		t.Fatalf("expected outbound and reversal trace txns, got %d", len(tracedTxns))
	}
}

func TestInventoryRepo_PurchaseReturnLotIsolationAndReceiptItemValidation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return_lot_validation")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	lotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-LOT-IN", fixtures, stringPtr("RET-LOT-B"), mustDecimal(t, "10"))
	lotReceiptItem := lotReceipt.Items[0]
	if lotReceiptItem.LotID == nil {
		t.Fatalf("expected lot receipt item lot_id")
	}
	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-NOLOT-IN", fixtures, nil, mustDecimal(t, "5"))
	nonLotReceiptItem := nonLotReceipt.Items[0]
	if nonLotReceiptItem.LotID != nil {
		t.Fatalf("expected non-lot receipt item lot_id nil")
	}

	mismatchReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-MISMATCH",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create mismatch return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              mismatchReturn.ID,
		PurchaseReceiptItemID: &lotReceiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected linked lot return without lot_id to be rejected, got %v", err)
	}
	otherMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "MAT-RET-OTHER")
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              mismatchReturn.ID,
		PurchaseReceiptItemID: &lotReceiptItem.ID,
		MaterialID:            otherMaterial.ID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 lotReceiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected linked return material mismatch to be rejected, got %v", err)
	}

	nonLotOverReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-NOLOT-OVER",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create non-lot over return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              nonLotOverReturn.ID,
		PurchaseReceiptItemID: &nonLotReceiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		Quantity:              mustDecimal(t, "6"),
	}); err != nil {
		t.Fatalf("add non-lot over return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, nonLotOverReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected non-lot over return to be rejected as insufficient stock, got %v", err)
	}
	lotBalanceAfterNonLotOverReturn, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotReceiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after non-lot over return failed: %v", err)
	}
	assertDecimalEqual(t, lotBalanceAfterNonLotOverReturn.Quantity, "10")

	nonLotReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-NOLOT-OK",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 14, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create non-lot return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              nonLotReturn.ID,
		PurchaseReceiptItemID: &nonLotReceiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		Quantity:              mustDecimal(t, "4"),
	}); err != nil {
		t.Fatalf("add non-lot return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, nonLotReturn.ID); err != nil {
		t.Fatalf("post non-lot return failed: %v", err)
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance after return failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "1")
	lotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotReceiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after non-lot return failed: %v", err)
	}
	assertDecimalEqual(t, lotBalance.Quantity, "10")
}

func TestInventoryQuantityGeneratedTypeIsDecimal(t *testing.T) {
	decimalType := reflect.TypeOf(decimal.Decimal{})
	txnQuantity, ok := reflect.TypeOf(ent.InventoryTxn{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("inventory txn quantity field missing")
	}
	if txnQuantity.Type != decimalType {
		t.Fatalf("inventory txn quantity must be decimal.Decimal, got %s", txnQuantity.Type)
	}
	balanceQuantity, ok := reflect.TypeOf(ent.InventoryBalance{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("inventory balance quantity field missing")
	}
	if balanceQuantity.Type != decimalType {
		t.Fatalf("inventory balance quantity must be decimal.Decimal, got %s", balanceQuantity.Type)
	}
	bomQuantity, ok := reflect.TypeOf(ent.BOMItem{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("bom item quantity field missing")
	}
	if bomQuantity.Type != decimalType {
		t.Fatalf("bom item quantity must be decimal.Decimal, got %s", bomQuantity.Type)
	}
	bomLossRate, ok := reflect.TypeOf(ent.BOMItem{}).FieldByName("LossRate")
	if !ok {
		t.Fatalf("bom item loss_rate field missing")
	}
	if bomLossRate.Type != decimalType {
		t.Fatalf("bom item loss_rate must be decimal.Decimal, got %s", bomLossRate.Type)
	}
	returnQuantity, ok := reflect.TypeOf(ent.PurchaseReturnItem{}).FieldByName("Quantity")
	if !ok {
		t.Fatalf("purchase return item quantity field missing")
	}
	if returnQuantity.Type != decimalType {
		t.Fatalf("purchase return item quantity must be decimal.Decimal, got %s", returnQuantity.Type)
	}

	payload, err := json.Marshal(struct {
		Quantity decimal.Decimal `json:"quantity"`
	}{Quantity: mustDecimal(t, "1.234567")})
	if err != nil {
		t.Fatalf("marshal decimal quantity failed: %v", err)
	}
	var decoded struct {
		Quantity decimal.Decimal `json:"quantity"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal decimal quantity failed: %v", err)
	}
	assertDecimalEqual(t, decoded.Quantity, "1.234567")
}

func openInventoryRepoTestData(t *testing.T, name string) (*Data, *ent.Client) {
	t.Helper()
	db, err := stdsql.Open("sqlite3", "file:"+name+"?mode=memory&cache=shared&_fk=1&_busy_timeout=5000")
	if err != nil {
		t.Fatalf("open sqlite db failed: %v", err)
	}
	db.SetMaxOpenConns(1)
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.SQLite, db)))
	if err := client.Schema.Create(context.Background()); err != nil {
		_ = client.Close()
		_ = db.Close()
		t.Fatalf("create ent schema failed: %v", err)
	}
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.SQLite,
	}, client
}

func createInventoryTestFixtures(t *testing.T, ctx context.Context, client *ent.Client) inventoryTestFixtures {
	t.Helper()
	unit := createTestUnit(t, ctx, client, "PCS")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-INV-001")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-INV-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-INV-001")
	return inventoryTestFixtures{
		unitID:      unit.ID,
		materialID:  material.ID,
		productID:   product.ID,
		warehouseID: warehouse.ID,
	}
}

func createTestUnit(t *testing.T, ctx context.Context, client *ent.Client, code string) *ent.Unit {
	t.Helper()
	unit, err := client.Unit.Create().
		SetCode(code).
		SetName(code + "单位").
		SetPrecision(2).
		Save(ctx)
	if err != nil {
		t.Fatalf("create unit %s failed: %v", code, err)
	}
	return unit
}

func createTestMaterial(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string) *ent.Material {
	t.Helper()
	material, err := client.Material.Create().
		SetCode(code).
		SetName(code + "材料").
		SetCategory("FABRIC").
		SetSpec("10mm").
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create material %s failed: %v", code, err)
	}
	return material
}

func createTestProduct(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string) *ent.Product {
	t.Helper()
	product, err := client.Product.Create().
		SetCode(code).
		SetName(code + "成品").
		SetStyleNo("STYLE-" + code).
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product %s failed: %v", code, err)
	}
	return product
}

func createTestWarehouse(t *testing.T, ctx context.Context, client *ent.Client, code string) *ent.Warehouse {
	t.Helper()
	warehouse, err := client.Warehouse.Create().
		SetCode(code).
		SetName(code + "仓").
		SetType("RAW_MATERIAL").
		Save(ctx)
	if err != nil {
		t.Fatalf("create warehouse %s failed: %v", code, err)
	}
	return warehouse
}

func createTestInventoryLot(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, subjectType string, subjectID int, lotNo string) *biz.InventoryLot {
	t.Helper()
	lot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: subjectType,
		SubjectID:   subjectID,
		LotNo:       lotNo,
	})
	if err != nil {
		t.Fatalf("create inventory lot %s failed: %v", lotNo, err)
	}
	return lot
}

func createAndPostPurchaseReceipt(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, receiptNo string, fixtures inventoryTestFixtures, lotNo *string, quantity decimal.Decimal) *biz.PurchaseReceipt {
	t.Helper()
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    receiptNo,
		SupplierName: "采购供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt %s failed: %v", receiptNo, err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotNo:       lotNo,
		Quantity:    quantity,
	}); err != nil {
		t.Fatalf("add purchase receipt %s item failed: %v", receiptNo, err)
	}
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post purchase receipt %s failed: %v", receiptNo, err)
	}
	if len(posted.Items) != 1 {
		t.Fatalf("expected purchase receipt %s to have one item, got %d", receiptNo, len(posted.Items))
	}
	return posted
}

func stringPtr(value string) *string {
	return &value
}

func mustDecimal(t *testing.T, value string) decimal.Decimal {
	t.Helper()
	out, err := decimal.NewFromString(value)
	if err != nil {
		t.Fatalf("parse decimal %q failed: %v", value, err)
	}
	return out
}

func assertDecimalEqual(t *testing.T, got decimal.Decimal, want string) {
	t.Helper()
	expected := mustDecimal(t, want)
	if got.Cmp(expected) != 0 {
		t.Fatalf("expected decimal %s, got %s", expected.String(), got.String())
	}
}

func assertOptionalIntEqual(t *testing.T, got *int, want int) {
	t.Helper()
	if got == nil {
		t.Fatalf("expected int pointer %d, got nil", want)
	}
	if *got != want {
		t.Fatalf("expected int pointer %d, got %d", want, *got)
	}
}
