package data

import (
	"context"
	stdsql "database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"
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

func TestInventoryRepo_ChangeInventoryLotStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	defaultLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-STATUS-DEFAULT")
	if defaultLot.Status != biz.InventoryLotActive {
		t.Fatalf("expected default lot status ACTIVE, got %s", defaultLot.Status)
	}
	holdLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-HOLD",
		Status:      biz.InventoryLotHold,
	})
	if err != nil {
		t.Fatalf("create HOLD lot failed: %v", err)
	}
	if holdLot.Status != biz.InventoryLotHold {
		t.Fatalf("expected HOLD lot, got %s", holdLot.Status)
	}
	rejectedLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-REJECTED",
		Status:      biz.InventoryLotRejected,
	})
	if err != nil {
		t.Fatalf("create REJECTED lot failed: %v", err)
	}
	if rejectedLot.Status != biz.InventoryLotRejected {
		t.Fatalf("expected REJECTED lot, got %s", rejectedLot.Status)
	}
	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-INVALID",
		Status:      "WAITING",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected invalid lot status to be rejected, got %v", err)
	}

	changed, err := uc.ChangeInventoryLotStatus(ctx, defaultLot.ID, biz.InventoryLotHold, "待检")
	if err != nil {
		t.Fatalf("change ACTIVE to HOLD failed: %v", err)
	}
	if changed.Status != biz.InventoryLotHold {
		t.Fatalf("expected changed status HOLD, got %s", changed.Status)
	}
	changed, err = uc.ChangeInventoryLotStatus(ctx, changed.ID, biz.InventoryLotRejected, "不合格")
	if err != nil {
		t.Fatalf("change HOLD to REJECTED failed: %v", err)
	}
	if changed.Status != biz.InventoryLotRejected {
		t.Fatalf("expected changed status REJECTED, got %s", changed.Status)
	}
	changed, err = uc.ChangeInventoryLotStatus(ctx, changed.ID, biz.InventoryLotActive, "让步接收")
	if err != nil {
		t.Fatalf("change REJECTED to ACTIVE failed: %v", err)
	}
	if changed.Status != biz.InventoryLotActive {
		t.Fatalf("expected changed status ACTIVE, got %s", changed.Status)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, changed.ID, "WAITING", "非法状态"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected invalid changed status to be rejected, got %v", err)
	}

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &changed.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status",
		IdempotencyKey: "lot-status-positive-balance",
	}); err != nil {
		t.Fatalf("inbound before DISABLED guard failed: %v", err)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, changed.ID, biz.InventoryLotDisabled, "仍有余额"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected DISABLED with positive balance to be rejected, got %v", err)
	}
	zeroLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "MAT-LOT-STATUS-ZERO")
	disabled, err := uc.ChangeInventoryLotStatus(ctx, zeroLot.ID, biz.InventoryLotDisabled, "无余额停用")
	if err != nil {
		t.Fatalf("change zero-balance lot to DISABLED failed: %v", err)
	}
	if disabled.Status != biz.InventoryLotDisabled {
		t.Fatalf("expected DISABLED zero-balance lot, got %s", disabled.Status)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, zeroLot.ID, biz.InventoryLotActive, "停用恢复"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected DISABLED to ACTIVE to be rejected, got %v", err)
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

func TestInventoryRepo_LotStatusGuardsOrdinaryDeduction(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_lot_status_guard")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	statuses := []struct {
		name    string
		status  string
		wantErr error
	}{
		{name: "ACTIVE", status: biz.InventoryLotActive},
		{name: "HOLD", status: biz.InventoryLotHold, wantErr: biz.ErrInventoryLotStatusBlocked},
		{name: "REJECTED", status: biz.InventoryLotRejected, wantErr: biz.ErrInventoryLotStatusBlocked},
		{name: "DISABLED", status: biz.InventoryLotDisabled, wantErr: biz.ErrInventoryLotStatusBlocked},
	}
	for _, tc := range statuses {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			lot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				LotNo:       "MAT-LOT-STATUS-GUARD-" + tc.name,
				Status:      tc.status,
			})
			if err != nil {
				t.Fatalf("create %s lot failed: %v", tc.status, err)
			}
			if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnIn,
				Direction:      1,
				Quantity:       mustDecimal(t, "5"),
				UnitID:         fixtures.unitID,
				SourceType:     "test_lot_status_guard",
				IdempotencyKey: "status-guard-in-" + tc.name,
			}); err != nil {
				t.Fatalf("inbound into %s lot fixture failed: %v", tc.status, err)
			}
			beforeCount, err := client.InventoryTxn.Query().Count(ctx)
			if err != nil {
				t.Fatalf("count before %s adjust-out failed: %v", tc.status, err)
			}
			_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnAdjustOut,
				Direction:      -1,
				Quantity:       mustDecimal(t, "1"),
				UnitID:         fixtures.unitID,
				SourceType:     "test_lot_status_guard",
				IdempotencyKey: "status-guard-adjust-out-" + tc.name,
			})
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("expected %s adjust-out to fail with %v, got %v", tc.status, tc.wantErr, err)
				}
				afterCount, err := client.InventoryTxn.Query().Count(ctx)
				if err != nil {
					t.Fatalf("count after %s adjust-out failed: %v", tc.status, err)
				}
				if afterCount != beforeCount {
					t.Fatalf("failed %s adjust-out should not create txn, before=%d after=%d", tc.status, beforeCount, afterCount)
				}
				balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
					SubjectType: biz.InventorySubjectMaterial,
					SubjectID:   fixtures.materialID,
					WarehouseID: fixtures.warehouseID,
					LotID:       &lot.ID,
					UnitID:      fixtures.unitID,
				})
				if err != nil {
					t.Fatalf("get %s lot balance failed: %v", tc.status, err)
				}
				assertDecimalEqual(t, balance.Quantity, "5")
				return
			}
			if err != nil {
				t.Fatalf("expected ACTIVE adjust-out to succeed, got %v", err)
			}
			balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				WarehouseID: fixtures.warehouseID,
				LotID:       &lot.ID,
				UnitID:      fixtures.unitID,
			})
			if err != nil {
				t.Fatalf("get ACTIVE lot balance failed: %v", err)
			}
			assertDecimalEqual(t, balance.Quantity, "4")
		})
	}

	holdOutLot, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		LotNo:       "MAT-LOT-STATUS-GUARD-OUT",
		Status:      biz.InventoryLotHold,
	})
	if err != nil {
		t.Fatalf("create HOLD lot for ordinary OUT failed: %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &holdOutLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-hold-out-in",
	}); err != nil {
		t.Fatalf("inbound into HOLD lot for ordinary OUT failed: %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &holdOutLot.ID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-hold-ordinary-out",
	}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected HOLD ordinary OUT to be blocked, got %v", err)
	}

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-non-lot-in",
	}); err != nil {
		t.Fatalf("non-lot inbound before status boundary failed: %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "2"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_lot_status_guard",
		IdempotencyKey: "status-guard-non-lot-out",
	}); err != nil {
		t.Fatalf("non-lot outbound should not be checked by lot status, got %v", err)
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance after status boundary failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "1")
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
	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-NOLOT-IN", fixtures, nil, mustDecimal(t, "10"))
	nonLotReceiptItem := nonLotReceipt.Items[0]
	if nonLotReceiptItem.LotID != nil {
		t.Fatalf("expected non-lot receipt item lot_id nil")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "5"),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_NON_LOT_CONSUME",
		IdempotencyKey: "test-non-lot-consume-before-return",
	}); err != nil {
		t.Fatalf("consume non-lot stock before return failed: %v", err)
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

func TestInventoryRepo_PurchaseReturnReceiptItemCumulativeLimit(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return_cumulative")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-001", fixtures, stringPtr("RET-CUM-LOT-A"), mustDecimal(t, "100"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected cumulative receipt lot_id")
	}

	createLinkedReturn := func(returnNo string, quantity decimal.Decimal) *biz.PurchaseReturn {
		t.Helper()
		purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
			ReturnNo:          returnNo,
			PurchaseReceiptID: &postedReceipt.ID,
			SupplierName:      "累计退货供应商",
			ReturnedAt:        time.Date(2026, 4, 26, 15, 0, 0, 0, time.UTC),
		})
		if err != nil {
			t.Fatalf("create linked purchase return %s failed: %v", returnNo, err)
		}
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              purchaseReturn.ID,
			PurchaseReceiptItemID: &receiptItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 receiptItem.LotID,
			Quantity:              quantity,
		}); err != nil {
			t.Fatalf("add linked purchase return item %s failed: %v", returnNo, err)
		}
		return purchaseReturn
	}

	return60 := createLinkedReturn("PR-RET-CUM-060", mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("post 60 cumulative return failed: %v", err)
	}
	balanceAfter60, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after 60 return failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfter60.Quantity, "40")

	return40 := createLinkedReturn("PR-RET-CUM-040", mustDecimal(t, "40"))
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("post 40 cumulative return failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("repeat post 40 cumulative return should be idempotent, got %v", err)
	}
	outCount40, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(return40.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated cumulative return out txns failed: %v", err)
	}
	if outCount40 != 1 {
		t.Fatalf("repeat post should keep one out txn, got %d", outCount40)
	}

	extraStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-EXTRA", fixtures, stringPtr("RET-CUM-LOT-A"), mustDecimal(t, "10"))
	assertOptionalIntEqual(t, extraStockReceipt.Items[0].LotID, *receiptItem.LotID)
	overOriginal := createLinkedReturn("PR-RET-CUM-OVER-001", mustDecimal(t, "1"))
	if _, err := uc.PostPurchaseReturn(ctx, overOriginal.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cumulative over-return to be rejected even with stock available, got %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("cancel 60 cumulative return failed: %v", err)
	}
	releasedReturn := createLinkedReturn("PR-RET-CUM-RELEASED-060", mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, releasedReturn.ID); err != nil {
		t.Fatalf("post return after cancellation released quantity failed: %v", err)
	}

	multiLineReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-MULTI", fixtures, stringPtr("RET-CUM-LOT-MULTI"), mustDecimal(t, "100"))
	multiLineItem := multiLineReceipt.Items[0]
	if multiLineItem.LotID == nil {
		t.Fatalf("expected multi-line receipt lot_id")
	}
	multiLineReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PR-RET-CUM-MULTI",
		PurchaseReceiptID: &multiLineReceipt.ID,
		SupplierName:      "累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 16, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create multi-line cumulative return failed: %v", err)
	}
	for _, quantity := range []string{"70", "31"} {
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              multiLineReturn.ID,
			PurchaseReceiptItemID: &multiLineItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 multiLineItem.LotID,
			Quantity:              mustDecimal(t, quantity),
		}); err != nil {
			t.Fatalf("add multi-line cumulative item %s failed: %v", quantity, err)
		}
	}
	if _, err := uc.PostPurchaseReturn(ctx, multiLineReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected same-return multi-line over original receipt item to be rejected, got %v", err)
	}

	lowStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-LOW-STOCK", fixtures, stringPtr("RET-CUM-LOT-LOW"), mustDecimal(t, "100"))
	lowStockItem := lowStockReceipt.Items[0]
	if lowStockItem.LotID == nil {
		t.Fatalf("expected low-stock receipt lot_id")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          lowStockItem.LotID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "95"),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_LOW_STOCK_CONSUME",
		IdempotencyKey: "test-low-stock-before-linked-return",
	}); err != nil {
		t.Fatalf("consume low-stock lot before linked return failed: %v", err)
	}
	lowStockReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PR-RET-CUM-LOW-STOCK",
		PurchaseReceiptID: &lowStockReceipt.ID,
		SupplierName:      "累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 17, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create low-stock return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              lowStockReturn.ID,
		PurchaseReceiptItemID: &lowStockItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 lowStockItem.LotID,
		Quantity:              mustDecimal(t, "10"),
	}); err != nil {
		t.Fatalf("add low-stock return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, lowStockReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected linked return within original quantity but over current stock to be rejected, got %v", err)
	}
}

func TestInventoryRepo_PurchaseReturnAllowsHoldRejectedLots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	statuses := []struct {
		name        string
		status      string
		prepare     func(t *testing.T, lotID int)
		wantPostErr error
	}{
		{name: "ACTIVE", status: biz.InventoryLotActive},
		{name: "HOLD", status: biz.InventoryLotHold, prepare: func(t *testing.T, lotID int) {
			changeLotToStatus(t, ctx, uc, lotID, biz.InventoryLotHold)
		}},
		{name: "REJECTED", status: biz.InventoryLotRejected, prepare: func(t *testing.T, lotID int) {
			changeLotToStatus(t, ctx, uc, lotID, biz.InventoryLotRejected)
		}},
		{name: "DISABLED", status: biz.InventoryLotDisabled, prepare: func(t *testing.T, lotID int) {
			if _, err := client.InventoryLot.UpdateOneID(lotID).SetStatus(biz.InventoryLotDisabled).Save(ctx); err != nil {
				t.Fatalf("force lot to DISABLED fixture failed: %v", err)
			}
		}, wantPostErr: biz.ErrInventoryLotStatusBlocked},
	}

	for _, tc := range statuses {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-IN-"+tc.name, fixtures, stringPtr("PR-RET-STATUS-LOT-"+tc.name), mustDecimal(t, "5"))
			receiptItem := receipt.Items[0]
			if receiptItem.LotID == nil {
				t.Fatalf("expected %s receipt lot_id", tc.name)
			}
			if tc.prepare != nil {
				tc.prepare(t, *receiptItem.LotID)
			}
			purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "PR-RET-STATUS-"+tc.name, receipt.ID, receiptItem, fixtures, mustDecimal(t, "2"))
			_, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID)
			if tc.wantPostErr != nil {
				if !errors.Is(err, tc.wantPostErr) {
					t.Fatalf("expected %s purchase return to fail with %v, got %v", tc.status, tc.wantPostErr, err)
				}
				balance, balanceErr := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
					SubjectType: biz.InventorySubjectMaterial,
					SubjectID:   fixtures.materialID,
					WarehouseID: fixtures.warehouseID,
					LotID:       receiptItem.LotID,
					UnitID:      fixtures.unitID,
				})
				if balanceErr != nil {
					t.Fatalf("get %s balance after rejected return failed: %v", tc.status, balanceErr)
				}
				assertDecimalEqual(t, balance.Quantity, "5")
				return
			}
			if err != nil {
				t.Fatalf("expected %s purchase return to succeed, got %v", tc.status, err)
			}
			balance, balanceErr := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				WarehouseID: fixtures.warehouseID,
				LotID:       receiptItem.LotID,
				UnitID:      fixtures.unitID,
			})
			if balanceErr != nil {
				t.Fatalf("get %s balance after return failed: %v", tc.status, balanceErr)
			}
			assertDecimalEqual(t, balance.Quantity, "3")
		})
	}

	lowStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-LOW-STOCK-IN", fixtures, stringPtr("PR-RET-STATUS-LOW-STOCK-LOT"), mustDecimal(t, "2"))
	lowStockItem := lowStockReceipt.Items[0]
	if lowStockItem.LotID == nil {
		t.Fatalf("expected low-stock lot_id")
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, *lowStockItem.LotID, biz.InventoryLotHold, "待检低库存退货"); err != nil {
		t.Fatalf("change low-stock lot to HOLD failed: %v", err)
	}
	lowStockReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-STATUS-LOW-STOCK",
		SupplierName: "状态退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create low-stock status return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    lowStockReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       lowStockItem.LotID,
		Quantity:    mustDecimal(t, "3"),
	}); err != nil {
		t.Fatalf("add low-stock status return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, lowStockReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected HOLD return over current stock to be rejected by balance, got %v", err)
	}

	effectiveReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-EFFECTIVE-IN", fixtures, stringPtr("PR-RET-STATUS-EFFECTIVE-LOT"), mustDecimal(t, "2"))
	effectiveItem := effectiveReceipt.Items[0]
	if effectiveItem.LotID == nil {
		t.Fatalf("expected effective status lot_id")
	}
	extraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-EFFECTIVE-EXTRA", fixtures, stringPtr("PR-RET-STATUS-EFFECTIVE-LOT"), mustDecimal(t, "3"))
	assertOptionalIntEqual(t, extraStock.Items[0].LotID, *effectiveItem.LotID)
	if _, err := uc.ChangeInventoryLotStatus(ctx, *effectiveItem.LotID, biz.InventoryLotHold, "待判有效入库上限"); err != nil {
		t.Fatalf("change effective lot to HOLD failed: %v", err)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, *effectiveItem.LotID, biz.InventoryLotRejected, "不合格有效入库上限"); err != nil {
		t.Fatalf("change effective lot to REJECTED failed: %v", err)
	}
	overEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PR-RET-STATUS-EFFECTIVE-OVER", effectiveReceipt.ID, effectiveItem, fixtures, mustDecimal(t, "3"))
	if _, err := uc.PostPurchaseReturn(ctx, overEffectiveReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected REJECTED linked return over effective receipt quantity to be rejected, got %v", err)
	}
}

func TestInventoryRepo_QualityInspectionLifecycleAndLotStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_quality_inspection_lifecycle")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	passReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-PASS", fixtures, stringPtr("QI-LIFE-LOT-PASS"), mustDecimal(t, "10"))
	passItem := passReceipt.Items[0]
	beforeQualityTxnCount := inventoryTxnCount(t, ctx, client)
	draft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-PASS", passReceipt, fixtures)
	if draft.Status != biz.QualityInspectionStatusDraft || draft.OriginalLotStatus != "" || draft.Result != nil || draft.InspectedAt != nil {
		t.Fatalf("unexpected draft state: status=%s original=%q result=%v inspected_at=%v", draft.Status, draft.OriginalLotStatus, draft.Result, draft.InspectedAt)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if _, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          "QI-LIFE-PASS",
		PurchaseReceiptID:     passReceipt.ID,
		PurchaseReceiptItemID: &passItem.ID,
		InventoryLotID:        *passItem.LotID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected inspection_no unique constraint, got %v", err)
	}

	submitted, err := uc.SubmitQualityInspection(ctx, draft.ID)
	if err != nil {
		t.Fatalf("submit quality inspection failed: %v", err)
	}
	if submitted.Status != biz.QualityInspectionStatusSubmitted || submitted.OriginalLotStatus != biz.InventoryLotActive {
		t.Fatalf("unexpected submitted state: status=%s original=%q", submitted.Status, submitted.OriginalLotStatus)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotHold)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if replay, err := uc.SubmitQualityInspection(ctx, draft.ID); err != nil || replay.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("repeat submit should be idempotent submitted, row=%v err=%v", replay, err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          passItem.LotID,
		TxnType:        biz.InventoryTxnAdjustOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_quality_inspection",
		IdempotencyKey: "qi-life-hold-adjust-out",
	}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected SUBMITTED HOLD lot to block ordinary adjust-out, got %v", err)
	}

	inspectedAt := time.Date(2026, 4, 26, 10, 30, 0, 0, time.UTC)
	inspectorID := 7001
	passed, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: draft.ID,
		Result:       biz.QualityInspectionResultPass,
		InspectedAt:  inspectedAt,
		InspectorID:  &inspectorID,
		DecisionNote: stringPtr("合格"),
	})
	if err != nil {
		t.Fatalf("pass quality inspection failed: %v", err)
	}
	if passed.Status != biz.QualityInspectionStatusPassed ||
		passed.Result == nil || *passed.Result != biz.QualityInspectionResultPass ||
		passed.InspectedAt == nil || !passed.InspectedAt.Equal(inspectedAt) ||
		passed.InspectorID == nil || *passed.InspectorID != inspectorID {
		t.Fatalf("unexpected passed state: %+v", passed)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if replay, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: draft.ID}); err != nil || replay.Status != biz.QualityInspectionStatusPassed {
		t.Fatalf("repeat pass should be idempotent passed, row=%v err=%v", replay, err)
	}
	if _, err := uc.CancelQualityInspection(ctx, draft.ID, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected passed inspection cancel to be rejected, got %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          passItem.LotID,
		TxnType:        biz.InventoryTxnAdjustOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_quality_inspection",
		IdempotencyKey: "qi-life-active-adjust-out",
	}); err != nil {
		t.Fatalf("expected PASSED ACTIVE lot to allow ordinary adjust-out, got %v", err)
	}

	rejectReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-REJECT", fixtures, stringPtr("QI-LIFE-LOT-REJECT"), mustDecimal(t, "5"))
	rejectDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-REJECT", rejectReceipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, rejectDraft.ID); err != nil {
		t.Fatalf("submit reject fixture failed: %v", err)
	}
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID, DecisionNote: stringPtr("拒收")}); err != nil {
		t.Fatalf("reject quality inspection failed: %v", err)
	}
	rejected, err := uc.GetQualityInspection(ctx, rejectDraft.ID)
	if err != nil {
		t.Fatalf("get rejected inspection failed: %v", err)
	}
	if rejected.Status != biz.QualityInspectionStatusRejected || rejected.Result == nil || *rejected.Result != biz.QualityInspectionResultReject {
		t.Fatalf("unexpected rejected state: %+v", rejected)
	}
	rejectItem := rejectReceipt.Items[0]
	assertLotStatus(t, ctx, uc, *rejectItem.LotID, biz.InventoryLotRejected)
	if replay, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID}); err != nil || replay.Status != biz.QualityInspectionStatusRejected {
		t.Fatalf("repeat reject should be idempotent rejected, row=%v err=%v", replay, err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          rejectItem.LotID,
		TxnType:        biz.InventoryTxnAdjustOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_quality_inspection",
		IdempotencyKey: "qi-life-rejected-adjust-out",
	}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected REJECTED lot to block ordinary adjust-out, got %v", err)
	}
	purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "QI-LIFE-RETURN-REJECT", rejectReceipt.ID, rejectItem, fixtures, mustDecimal(t, "1"))
	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("expected REJECTED lot to allow purchase return out, got %v", err)
	}
	if _, err := uc.CancelQualityInspection(ctx, rejectDraft.ID, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected rejected inspection cancel to be rejected, got %v", err)
	}

	cancelDraftReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-CANCEL-DRAFT", fixtures, stringPtr("QI-LIFE-LOT-CANCEL-DRAFT"), mustDecimal(t, "3"))
	cancelDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-CANCEL-DRAFT", cancelDraftReceipt, fixtures)
	cancelledDraft, err := uc.CancelQualityInspection(ctx, cancelDraft.ID, stringPtr("草稿取消"))
	if err != nil {
		t.Fatalf("cancel draft inspection failed: %v", err)
	}
	if cancelledDraft.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected cancelled draft, got %s", cancelledDraft.Status)
	}
	assertLotStatus(t, ctx, uc, *cancelDraftReceipt.Items[0].LotID, biz.InventoryLotActive)
	if replay, err := uc.CancelQualityInspection(ctx, cancelDraft.ID, nil); err != nil || replay.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("repeat cancel should be idempotent cancelled, row=%v err=%v", replay, err)
	}
	if _, err := uc.SubmitQualityInspection(ctx, cancelDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled inspection submit to be rejected, got %v", err)
	}
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: cancelDraft.ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled inspection pass to be rejected, got %v", err)
	}
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: cancelDraft.ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled inspection reject to be rejected, got %v", err)
	}

	cancelSubmittedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-CANCEL-SUBMITTED", fixtures, stringPtr("QI-LIFE-LOT-CANCEL-SUBMITTED"), mustDecimal(t, "3"))
	cancelSubmitted := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-CANCEL-SUBMITTED", cancelSubmittedReceipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, cancelSubmitted.ID); err != nil {
		t.Fatalf("submit cancel fixture failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *cancelSubmittedReceipt.Items[0].LotID, biz.InventoryLotHold)
	cancelledSubmitted, err := uc.CancelQualityInspection(ctx, cancelSubmitted.ID, stringPtr("提交后取消"))
	if err != nil {
		t.Fatalf("cancel submitted inspection failed: %v", err)
	}
	if cancelledSubmitted.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected submitted inspection cancelled, got %s", cancelledSubmitted.Status)
	}
	assertLotStatus(t, ctx, uc, *cancelSubmittedReceipt.Items[0].LotID, biz.InventoryLotActive)

	holdReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-HOLD-ORIGINAL", fixtures, stringPtr("QI-LIFE-LOT-HOLD-ORIGINAL"), mustDecimal(t, "3"))
	changeLotToStatus(t, ctx, uc, *holdReceipt.Items[0].LotID, biz.InventoryLotHold)
	holdDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-HOLD-ORIGINAL", holdReceipt, fixtures)
	holdSubmitted, err := uc.SubmitQualityInspection(ctx, holdDraft.ID)
	if err != nil {
		t.Fatalf("submit originally HOLD inspection failed: %v", err)
	}
	if holdSubmitted.OriginalLotStatus != biz.InventoryLotHold {
		t.Fatalf("expected originally HOLD inspection to record HOLD, got %s", holdSubmitted.OriginalLotStatus)
	}
	if _, err := uc.CancelQualityInspection(ctx, holdDraft.ID, nil); err != nil {
		t.Fatalf("cancel originally HOLD inspection failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *holdReceipt.Items[0].LotID, biz.InventoryLotHold)

	conflictReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-CANCEL-CONFLICT", fixtures, stringPtr("QI-LIFE-LOT-CANCEL-CONFLICT"), mustDecimal(t, "3"))
	conflictDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-CANCEL-CONFLICT", conflictReceipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, conflictDraft.ID); err != nil {
		t.Fatalf("submit cancel conflict fixture failed: %v", err)
	}
	forceLotStatus(t, ctx, client, *conflictReceipt.Items[0].LotID, biz.InventoryLotActive)
	if _, err := uc.CancelQualityInspection(ctx, conflictDraft.ID, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancel with externally changed lot status to be rejected, got %v", err)
	}
}

func TestInventoryRepo_QualityInspectionReferenceValidation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_quality_inspection_validation")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	validReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-VALID-RECEIPT", fixtures, stringPtr("QI-VALID-LOT"), mustDecimal(t, "5"))
	validItem := validReceipt.Items[0]
	if validItem.LotID == nil {
		t.Fatalf("expected valid receipt item lot_id")
	}
	base := func(no string) *biz.QualityInspectionCreate {
		return &biz.QualityInspectionCreate{
			InspectionNo:          no,
			PurchaseReceiptID:     validReceipt.ID,
			PurchaseReceiptItemID: &validItem.ID,
			InventoryLotID:        *validItem.LotID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
		}
	}
	validDraft, err := uc.CreateQualityInspectionDraft(ctx, base("QI-VALID-OK"))
	if err != nil {
		t.Fatalf("create valid quality inspection draft failed: %v", err)
	}
	if validDraft.Status != biz.QualityInspectionStatusDraft {
		t.Fatalf("expected valid draft status DRAFT, got %s", validDraft.Status)
	}

	if _, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:      "QI-VALID-MISSING-RECEIPT",
		PurchaseReceiptID: 999999,
		InventoryLotID:    *validItem.LotID,
		MaterialID:        fixtures.materialID,
		WarehouseID:       fixtures.warehouseID,
	}); !errors.Is(err, biz.ErrPurchaseReceiptNotFound) {
		t.Fatalf("expected missing receipt to fail with ErrPurchaseReceiptNotFound, got %v", err)
	}
	draftReceipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "QI-VALID-DRAFT-RECEIPT",
		SupplierName: "待提交供应商",
		ReceivedAt:   time.Date(2026, 4, 26, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create non-posted receipt fixture failed: %v", err)
	}
	nonPosted := base("QI-VALID-NON-POSTED")
	nonPosted.PurchaseReceiptID = draftReceipt.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, nonPosted); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected non-posted receipt to fail with ErrBadParam, got %v", err)
	}
	missingItem := base("QI-VALID-MISSING-ITEM")
	missingID := 999999
	missingItem.PurchaseReceiptItemID = &missingID
	if _, err := uc.CreateQualityInspectionDraft(ctx, missingItem); !errors.Is(err, biz.ErrPurchaseReceiptItemNotFound) {
		t.Fatalf("expected missing receipt item to fail, got %v", err)
	}
	otherReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-VALID-OTHER-RECEIPT", fixtures, stringPtr("QI-VALID-OTHER-LOT"), mustDecimal(t, "5"))
	itemNotBelong := base("QI-VALID-ITEM-NOT-BELONG")
	itemNotBelong.PurchaseReceiptItemID = &otherReceipt.Items[0].ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, itemNotBelong); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item from another receipt to fail, got %v", err)
	}
	lotMissing := base("QI-VALID-MISSING-LOT")
	lotMissing.InventoryLotID = 999999
	if _, err := uc.CreateQualityInspectionDraft(ctx, lotMissing); !errors.Is(err, biz.ErrInventoryLotNotFound) {
		t.Fatalf("expected missing lot to fail, got %v", err)
	}
	productLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectProduct, fixtures.productID, "QI-VALID-PRODUCT-LOT")
	productLotInput := base("QI-VALID-PRODUCT-LOT")
	productLotInput.InventoryLotID = productLot.ID
	productLotInput.PurchaseReceiptItemID = nil
	if _, err := uc.CreateQualityInspectionDraft(ctx, productLotInput); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected product lot inspection to fail, got %v", err)
	}
	otherMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "MAT-QI-VALID-OTHER")
	otherMaterialLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, otherMaterial.ID, "QI-VALID-OTHER-MATERIAL-LOT")
	materialMismatch := base("QI-VALID-MATERIAL-MISMATCH")
	materialMismatch.PurchaseReceiptItemID = nil
	materialMismatch.InventoryLotID = otherMaterialLot.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, materialMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot subject/material mismatch to fail, got %v", err)
	}
	itemMaterialMismatch := base("QI-VALID-ITEM-MATERIAL-MISMATCH")
	itemMaterialMismatch.InventoryLotID = otherMaterialLot.ID
	itemMaterialMismatch.MaterialID = otherMaterial.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, itemMaterialMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item material mismatch to fail, got %v", err)
	}
	otherWarehouse := createTestWarehouse(t, ctx, client, "WH-QI-VALID-OTHER")
	warehouseMismatch := base("QI-VALID-WAREHOUSE-MISMATCH")
	warehouseMismatch.WarehouseID = otherWarehouse.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, warehouseMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item warehouse mismatch to fail, got %v", err)
	}
	lotMismatchLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "QI-VALID-LOT-MISMATCH")
	lotMismatch := base("QI-VALID-LOT-MISMATCH")
	lotMismatch.InventoryLotID = lotMismatchLot.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, lotMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item lot mismatch to fail, got %v", err)
	}
}

func TestInventoryRepo_QualityInspectionSubmittedUniquenessAndProtection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_quality_inspection_uniqueness")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-UNIQ-RECEIPT", fixtures, stringPtr("QI-UNIQ-LOT"), mustDecimal(t, "8"))
	first := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-FIRST", receipt, fixtures)
	second := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-SECOND", receipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, first.ID); err != nil {
		t.Fatalf("submit first inspection failed: %v", err)
	}
	if _, err := uc.SubmitQualityInspection(ctx, second.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected second submitted inspection for same lot to be rejected, got %v", err)
	}
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: first.ID}); err != nil {
		t.Fatalf("pass first inspection failed: %v", err)
	}
	third := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-THIRD", receipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, third.ID); err != nil {
		t.Fatalf("expected historical PASSED inspection to allow new submitted inspection, got %v", err)
	}
	if _, err := uc.CancelQualityInspection(ctx, third.ID, nil); err != nil {
		t.Fatalf("expected submitted third inspection to cancel, got %v", err)
	}
	fourth := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-FOURTH", receipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, fourth.ID); err != nil {
		t.Fatalf("expected historical CANCELLED inspection to allow new submitted inspection, got %v", err)
	}
	if _, err := uc.CancelQualityInspection(ctx, fourth.ID, nil); err != nil {
		t.Fatalf("cancel fourth inspection failed: %v", err)
	}

	disabledReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-UNIQ-DISABLED-RECEIPT", fixtures, stringPtr("QI-UNIQ-DISABLED-LOT"), mustDecimal(t, "2"))
	disabledDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-DISABLED", disabledReceipt, fixtures)
	forceLotStatus(t, ctx, client, *disabledReceipt.Items[0].LotID, biz.InventoryLotDisabled)
	if _, err := uc.SubmitQualityInspection(ctx, disabledDraft.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected DISABLED lot submit to be rejected, got %v", err)
	}
	rejectedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-UNIQ-REJECTED-RECEIPT", fixtures, stringPtr("QI-UNIQ-REJECTED-LOT"), mustDecimal(t, "2"))
	rejectedDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-REJECTED", rejectedReceipt, fixtures)
	changeLotToStatus(t, ctx, uc, *rejectedReceipt.Items[0].LotID, biz.InventoryLotRejected)
	if _, err := uc.SubmitQualityInspection(ctx, rejectedDraft.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected REJECTED lot submit to be rejected, got %v", err)
	}

	if err := client.QualityInspection.DeleteOneID(first.ID).Exec(ctx); err == nil {
		t.Fatalf("expected quality inspection delete to be rejected")
	}
	if _, err := client.QualityInspection.UpdateOneID(first.ID).SetStatus(biz.QualityInspectionStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected direct status update to be rejected")
	}
	if _, err := client.QualityInspection.UpdateOneID(first.ID).SetInspectionNo("QI-UNIQ-FIRST-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected direct inspection_no update to be rejected")
	}
	if _, err := client.QualityInspection.UpdateOneID(first.ID).SetInspectorID(9001).Save(ctx); err == nil {
		t.Fatalf("expected direct inspector_id update on terminal inspection to be rejected")
	}
}

func TestInventoryRepo_PurchaseReceiptAdjustmentQuantityLifecycleAndProtection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_lifecycle")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	draftReceipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PRA-DRAFT-RECEIPT",
		SupplierName: "调整供应商",
		ReceivedAt:   time.Date(2026, 4, 26, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft receipt failed: %v", err)
	}
	if _, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PRA-DRAFT-BLOCK",
		PurchaseReceiptID: draftReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected non-posted receipt adjustment to be rejected, got %v", err)
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-QTY-IN-RECEIPT", fixtures, stringPtr("PRA-QTY-LOT"), mustDecimal(t, "100"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected posted receipt lot_id")
	}
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PRA-QTY-IN-001",
		PurchaseReceiptID: postedReceipt.ID,
		Reason:            stringPtr("多收补入"),
		AdjustedAt:        time.Date(2026, 4, 26, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create receipt adjustment draft failed: %v", err)
	}
	if adjustment.Status != biz.PurchaseReceiptAdjustmentStatusDraft {
		t.Fatalf("expected draft adjustment, got %s", adjustment.Status)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 adjustment item to be rejected, got %v", err)
	}
	item, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "10"),
		SourceLineNo:          stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add receipt adjustment item failed: %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustment.Delete().Where(purchasereceiptadjustment.ID(adjustment.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment bulk delete to be rejected")
	}
	if err := client.PurchaseReceiptAdjustment.DeleteOneID(adjustment.ID).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment delete-one to be rejected")
	}
	if err := client.PurchaseReceiptAdjustmentItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment item delete-one to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Delete().Where(purchasereceiptadjustmentitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment item bulk delete to be rejected")
	}

	posted, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("post receipt adjustment failed: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptAdjustmentStatusPosted || posted.PostedAt == nil {
		t.Fatalf("expected posted adjustment with posted_at, got status=%s posted_at=%v", posted.Status, posted.PostedAt)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after adjustment post failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "110")

	adjustTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment adjust-in txn failed: %v", err)
	}
	assertOptionalIntEqual(t, adjustTxn.LotID, *receiptItem.LotID)
	if adjustTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentIdempotencyKey(adjustment.ID, item.ID, biz.InventoryTxnAdjustIn) {
		t.Fatalf("unexpected adjustment idempotency key %s", adjustTxn.IdempotencyKey)
	}

	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat post adjustment failed: %v", err)
	}
	adjustCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeat adjustment txns failed: %v", err)
	}
	if adjustCount != 1 {
		t.Fatalf("repeat post should keep one adjust-in txn, got %d", adjustCount)
	}

	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted adjustment must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustment.UpdateOneID(adjustment.ID).SetStatus(biz.PurchaseReceiptAdjustmentStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected posted adjustment status update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "11")).Save(ctx); err == nil {
		t.Fatalf("expected posted adjustment item quantity update to be rejected")
	}

	draftToCancel, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PRA-DRAFT-CANCEL",
		PurchaseReceiptID: postedReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft adjustment for cancel guard failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, draftToCancel.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("draft adjustment must not be cancellable, got %v", err)
	}

	cancelled, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("cancel posted adjustment failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptAdjustmentStatusCancelled {
		t.Fatalf("expected cancelled adjustment, got %s", cancelled.Status)
	}
	balanceAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after adjustment cancel failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "100")

	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *receiptItem.LotID)
	if reversalTxn.SourceType != biz.PurchaseReceiptAdjustmentSourceType {
		t.Fatalf("unexpected adjustment reversal source_type %s", reversalTxn.SourceType)
	}
	assertOptionalIntEqual(t, reversalTxn.SourceID, adjustment.ID)
	assertOptionalIntEqual(t, reversalTxn.SourceLineID, item.ID)
	if reversalTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentReversalIdempotencyKey(adjustment.ID, item.ID, adjustTxn.ID) {
		t.Fatalf("unexpected adjustment reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat cancel adjustment failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated adjustment reversals failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat cancel should keep one reversal txn, got %d", reversalCount)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled adjustment must not be posted again, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled adjustment must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustment.UpdateOneID(adjustment.ID).SetAdjustedAt(time.Now()).Save(ctx); err == nil {
		t.Fatalf("expected cancelled adjustment adjusted_at update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected cancelled adjustment item warehouse update to be rejected")
	}
}

func TestInventoryRepo_PurchaseReceiptAdjustmentEffectiveQuantityAndReturnLimit(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_effective")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	decreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-DEC-RECEIPT", fixtures, stringPtr("PRA-EFF-DEC-LOT"), mustDecimal(t, "100"))
	decreaseItem := decreaseReceipt.Items[0]
	decreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-30", decreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decreaseAdj.ID, decreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, decreaseItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decreaseAdj.ID); err != nil {
		t.Fatalf("post quantity decrease 30 failed: %v", err)
	}
	balanceAfterDecrease, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       decreaseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after quantity decrease failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterDecrease.Quantity, "70")

	returnLimitReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-RETURN-RECEIPT", fixtures, stringPtr("PRA-EFF-RETURN-LOT"), mustDecimal(t, "100"))
	returnLimitItem := returnLimitReceipt.Items[0]
	return80 := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-80", returnLimitReceipt.ID, returnLimitItem, fixtures, mustDecimal(t, "80"))
	if _, err := uc.PostPurchaseReturn(ctx, return80.ID); err != nil {
		t.Fatalf("post return 80 before adjustment failed: %v", err)
	}
	decrease21 := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-21-BLOCK", returnLimitReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decrease21.ID, returnLimitItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnLimitItem.LotID, mustDecimal(t, "21"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease21.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected decrease below returned quantity to be rejected, got %v", err)
	}
	decrease20 := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-20-OK", returnLimitReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decrease20.ID, returnLimitItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnLimitItem.LotID, mustDecimal(t, "20"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease20.ID); err != nil {
		t.Fatalf("post decrease to returned quantity failed: %v", err)
	}

	overDecreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-DEC-101-RECEIPT", fixtures, stringPtr("PRA-EFF-DEC-101-LOT"), mustDecimal(t, "100"))
	overDecreaseItem := overDecreaseReceipt.Items[0]
	overDecreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-101", overDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, overDecreaseAdj.ID, overDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, overDecreaseItem.LotID, mustDecimal(t, "101"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, overDecreaseAdj.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected decrease below zero effective quantity to be rejected, got %v", err)
	}

	cancelDecreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-CANCEL-DEC-RECEIPT", fixtures, stringPtr("PRA-EFF-CANCEL-DEC-LOT"), mustDecimal(t, "100"))
	cancelDecreaseItem := cancelDecreaseReceipt.Items[0]
	cancelDecreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-CANCEL-DEC-20", cancelDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, cancelDecreaseAdj.ID, cancelDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, cancelDecreaseItem.LotID, mustDecimal(t, "20"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, cancelDecreaseAdj.ID); err != nil {
		t.Fatalf("post decrease before cancellation restore failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, cancelDecreaseAdj.ID); err != nil {
		t.Fatalf("cancel decrease adjustment failed: %v", err)
	}
	return100AfterCancelDecrease := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-CANCEL-DEC-RETURN-100", cancelDecreaseReceipt.ID, cancelDecreaseItem, fixtures, mustDecimal(t, "100"))
	if _, err := uc.PostPurchaseReturn(ctx, return100AfterCancelDecrease.ID); err != nil {
		t.Fatalf("post return 100 after cancelling decrease should succeed, got %v", err)
	}

	increaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-INCREASE-RECEIPT", fixtures, stringPtr("PRA-EFF-INCREASE-LOT"), mustDecimal(t, "100"))
	increaseItem := increaseReceipt.Items[0]
	increaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-INCREASE-10", increaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, increaseAdj.ID, increaseItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, increaseItem.LotID, mustDecimal(t, "10"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, increaseAdj.ID); err != nil {
		t.Fatalf("post quantity increase 10 failed: %v", err)
	}
	extraIncreaseStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-INCREASE-EXTRA-STOCK", fixtures, stringPtr("PRA-EFF-INCREASE-LOT"), mustDecimal(t, "1"))
	assertOptionalIntEqual(t, extraIncreaseStock.Items[0].LotID, *increaseItem.LotID)
	return110 := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-110", increaseReceipt.ID, increaseItem, fixtures, mustDecimal(t, "110"))
	if _, err := uc.PostPurchaseReturn(ctx, return110.ID); err != nil {
		t.Fatalf("post return up to increased effective quantity failed: %v", err)
	}
	return111 := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-111", increaseReceipt.ID, increaseItem, fixtures, mustDecimal(t, "111"))
	if _, err := uc.PostPurchaseReturn(ctx, return111.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected return over increased effective quantity to be rejected, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, increaseAdj.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelling increase below returned quantity to be rejected, got %v", err)
	}

	increaseThenDecreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-IN-DEC-RECEIPT", fixtures, stringPtr("PRA-EFF-IN-DEC-LOT"), mustDecimal(t, "100"))
	increaseThenDecreaseItem := increaseThenDecreaseReceipt.Items[0]
	return80BeforeNetDecrease := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-IN-DEC-RETURN-80", increaseThenDecreaseReceipt.ID, increaseThenDecreaseItem, fixtures, mustDecimal(t, "80"))
	if _, err := uc.PostPurchaseReturn(ctx, return80BeforeNetDecrease.ID); err != nil {
		t.Fatalf("post return 80 before net decrease failed: %v", err)
	}
	netIncreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-IN-DEC-INCREASE", increaseThenDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, netIncreaseAdj.ID, increaseThenDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, increaseThenDecreaseItem.LotID, mustDecimal(t, "10"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, netIncreaseAdj.ID); err != nil {
		t.Fatalf("post net increase before decrease failed: %v", err)
	}
	netDecreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-IN-DEC-DECREASE", increaseThenDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, netDecreaseAdj.ID, increaseThenDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, increaseThenDecreaseItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, netDecreaseAdj.ID); err != nil {
		t.Fatalf("post net decrease to returned quantity failed: %v", err)
	}

	cancelledAdjReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-CANCELLED-RECEIPT", fixtures, stringPtr("PRA-EFF-CANCELLED-LOT"), mustDecimal(t, "100"))
	cancelledAdjItem := cancelledAdjReceipt.Items[0]
	cancelledAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-CANCELLED-INCREASE", cancelledAdjReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, cancelledAdj.ID, cancelledAdjItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, cancelledAdjItem.LotID, mustDecimal(t, "20"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, cancelledAdj.ID); err != nil {
		t.Fatalf("post adjustment before cancellation failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, cancelledAdj.ID); err != nil {
		t.Fatalf("cancel adjustment before effective check failed: %v", err)
	}
	extraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-CANCELLED-EXTRA-STOCK", fixtures, stringPtr("PRA-EFF-CANCELLED-LOT"), mustDecimal(t, "20"))
	assertOptionalIntEqual(t, extraStock.Items[0].LotID, *cancelledAdjItem.LotID)
	cancelledAdjReturn := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-CANCELLED-RETURN-120", cancelledAdjReceipt.ID, cancelledAdjItem, fixtures, mustDecimal(t, "120"))
	if _, err := uc.PostPurchaseReturn(ctx, cancelledAdjReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled adjustment to be ignored by effective quantity, got %v", err)
	}

	multiLineReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-MULTI-RECEIPT", fixtures, stringPtr("PRA-EFF-MULTI-LOT"), mustDecimal(t, "100"))
	multiLineItem := multiLineReceipt.Items[0]
	multiLineAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-MULTI-OVER", multiLineReceipt.ID)
	for idx, quantity := range []string{"70", "31"} {
		addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiLineAdj.ID, multiLineItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, multiLineItem.LotID, mustDecimal(t, quantity), stringPtr(fmt.Sprintf("L%d", idx+1)))
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, multiLineAdj.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected same-adjustment multi-line effective over-decrease to be rejected, got %v", err)
	}

	returnEffectiveReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-RETURN-LINK-RECEIPT", fixtures, stringPtr("PRA-EFF-RETURN-LINK-LOT"), mustDecimal(t, "100"))
	returnEffectiveItem := returnEffectiveReceipt.Items[0]
	returnEffectiveAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-RETURN-LINK-DEC", returnEffectiveReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, returnEffectiveAdj.ID, returnEffectiveItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnEffectiveItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, returnEffectiveAdj.ID); err != nil {
		t.Fatalf("post return-link decrease failed: %v", err)
	}
	extraReturnStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-RETURN-LINK-EXTRA", fixtures, stringPtr("PRA-EFF-RETURN-LINK-LOT"), mustDecimal(t, "10"))
	assertOptionalIntEqual(t, extraReturnStock.Items[0].LotID, *returnEffectiveItem.LotID)
	overEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-LINK-71", returnEffectiveReceipt.ID, returnEffectiveItem, fixtures, mustDecimal(t, "71"))
	if _, err := uc.PostPurchaseReturn(ctx, overEffectiveReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected purchase return to use effective receipt quantity, got %v", err)
	}
	okEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-LINK-70", returnEffectiveReceipt.ID, returnEffectiveItem, fixtures, mustDecimal(t, "70"))
	if _, err := uc.PostPurchaseReturn(ctx, okEffectiveReturn.ID); err != nil {
		t.Fatalf("post return within effective receipt quantity failed: %v", err)
	}

	unlinkedReturnReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-UNLINKED-RECEIPT", fixtures, stringPtr("PRA-EFF-UNLINKED-LOT"), mustDecimal(t, "100"))
	unlinkedReturnItem := unlinkedReturnReceipt.Items[0]
	unlinkedExtraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-UNLINKED-EXTRA", fixtures, stringPtr("PRA-EFF-UNLINKED-LOT"), mustDecimal(t, "50"))
	assertOptionalIntEqual(t, unlinkedExtraStock.Items[0].LotID, *unlinkedReturnItem.LotID)
	unlinkedReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PRA-EFF-UNLINKED-RETURN-120",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create unlinked return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    unlinkedReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       unlinkedReturnItem.LotID,
		Quantity:    mustDecimal(t, "120"),
	}); err != nil {
		t.Fatalf("add unlinked return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, unlinkedReturn.ID); err != nil {
		t.Fatalf("unlinked return should use inventory balance only, got %v", err)
	}

	if rows, err := client.PurchaseReceiptAdjustmentItem.Query().
		Where(purchasereceiptadjustmentitem.AdjustmentID(multiLineAdj.ID)).
		Count(ctx); err != nil || rows != 2 {
		t.Fatalf("failed multi-line adjustment should keep draft rows for correction, count=%d err=%v", rows, err)
	}
}

func TestInventoryRepo_PurchaseReceiptAdjustmentLotAndWarehouseCorrections(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_corrections")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-CORR-RECEIPT", fixtures, stringPtr("PRA-CORR-OLD-LOT"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected correction receipt lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-CORR-NEW-LOT")

	lotAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-CORR-LOT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotAdj.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "4"), stringPtr("LOT-G1"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotAdj.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "4"), stringPtr("LOT-G1"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, lotAdj.ID); err != nil {
		t.Fatalf("post lot correction failed: %v", err)
	}
	oldLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old lot balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, oldLotBalance.Quantity, "6")
	newLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &newLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new lot balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, newLotBalance.Quantity, "4")

	if count, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(lotAdj.ID),
		).
		Count(ctx); err != nil || count != 2 {
		t.Fatalf("expected lot correction to write two txns, count=%d err=%v", count, err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, lotAdj.ID); err != nil {
		t.Fatalf("cancel lot correction failed: %v", err)
	}
	oldLotAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old lot balance after lot correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, oldLotAfterCancel.Quantity, "10")
	newLotAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &newLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new lot balance after lot correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, newLotAfterCancel.Quantity, "0")

	multiGroupReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-CORR-MULTI-GROUP-RECEIPT", fixtures, stringPtr("PRA-CORR-MULTI-OLD"), mustDecimal(t, "10"))
	multiGroupItem := multiGroupReceipt.Items[0]
	if multiGroupItem.LotID == nil {
		t.Fatalf("expected multi correction receipt lot_id")
	}
	multiGroupLotA := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-CORR-MULTI-NEW-A")
	multiGroupLotB := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-CORR-MULTI-NEW-B")
	multiGroupAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-CORR-MULTI-GROUP", multiGroupReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, multiGroupItem.LotID, mustDecimal(t, "2"), stringPtr("MG-A"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &multiGroupLotA.ID, mustDecimal(t, "2"), stringPtr("MG-A"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, multiGroupItem.LotID, mustDecimal(t, "3"), stringPtr("MG-B"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &multiGroupLotB.ID, mustDecimal(t, "3"), stringPtr("MG-B"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, multiGroupAdj.ID); err != nil {
		t.Fatalf("post multiple correction groups failed: %v", err)
	}
	multiGroupOldBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       multiGroupItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get multi-group old lot balance failed: %v", err)
	}
	assertDecimalEqual(t, multiGroupOldBalance.Quantity, "5")
	multiGroupLotABalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &multiGroupLotA.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get multi-group lot A balance failed: %v", err)
	}
	assertDecimalEqual(t, multiGroupLotABalance.Quantity, "2")
	multiGroupLotBBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &multiGroupLotB.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get multi-group lot B balance failed: %v", err)
	}
	assertDecimalEqual(t, multiGroupLotBBalance.Quantity, "3")

	warehouseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-CORR-WAREHOUSE-RECEIPT", fixtures, stringPtr("PRA-CORR-WH-OLD-LOT"), mustDecimal(t, "10"))
	warehouseItem := warehouseReceipt.Items[0]
	if warehouseItem.LotID == nil {
		t.Fatalf("expected warehouse correction receipt lot_id")
	}
	otherWarehouse := createTestWarehouse(t, ctx, client, "PRA-CORR-WH-TO")
	warehouseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-CORR-WAREHOUSE", warehouseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseAdj.ID, warehouseItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, warehouseItem.LotID, mustDecimal(t, "3"), stringPtr("WH-G1"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseAdj.ID, warehouseItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, warehouseItem.LotID, mustDecimal(t, "3"), stringPtr("WH-G1"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseAdj.ID); err != nil {
		t.Fatalf("post warehouse correction failed: %v", err)
	}
	oldWarehouseBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old warehouse balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, oldWarehouseBalance.Quantity, "7")
	newWarehouseBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: otherWarehouse.ID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new warehouse balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, newWarehouseBalance.Quantity, "3")
	if count, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(warehouseAdj.ID),
		).
		Count(ctx); err != nil || count != 2 {
		t.Fatalf("expected warehouse correction to write two txns, count=%d err=%v", count, err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, warehouseAdj.ID); err != nil {
		t.Fatalf("cancel warehouse correction failed: %v", err)
	}
	oldWarehouseAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old warehouse balance after correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, oldWarehouseAfterCancel.Quantity, "10")
	newWarehouseAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: otherWarehouse.ID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new warehouse balance after correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, newWarehouseAfterCancel.Quantity, "0")
}

func TestInventoryRepo_PurchaseReceiptAdjustmentCorrectionGuardsAndLotIsolation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_guards")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-GUARD-RECEIPT", fixtures, stringPtr("PRA-GUARD-LOT"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected guard receipt lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-GUARD-NEW-LOT")

	missingPair := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-LOT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, missingPair.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "1"), stringPtr("MISSING"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, missingPair.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing lot correction pair to be rejected, got %v", err)
	}
	missingLotOut := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-LOT-OUT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, missingLotOut.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "1"), stringPtr("MISSING-OUT"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, missingLotOut.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot correction missing OUT to be rejected, got %v", err)
	}

	quantityMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-LOT-QTY-MISMATCH", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, quantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "2"), stringPtr("QTY-MISMATCH"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, quantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "3"), stringPtr("QTY-MISMATCH"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, quantityMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot correction quantity mismatch to be rejected, got %v", err)
	}

	otherWarehouse := createTestWarehouse(t, ctx, client, "PRA-GUARD-WH-TO")
	lotWarehouseMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-LOT-WH-MISMATCH", postedReceipt.ID)
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(lotWarehouseMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentLotCorrectionOut).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetLotID(*receiptItem.LotID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("LOT-WH-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create lot correction out mismatch fixture failed: %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(lotWarehouseMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentLotCorrectionIn).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(otherWarehouse.ID).
		SetUnitID(fixtures.unitID).
		SetLotID(newLot.ID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("LOT-WH-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create lot correction in mismatch fixture failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, lotWarehouseMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot correction warehouse mismatch to be rejected, got %v", err)
	}

	warehouseMissingPair := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-WH", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseMissingPair.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "1"), stringPtr("WH-MISSING"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseMissingPair.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing warehouse correction pair to be rejected, got %v", err)
	}
	warehouseMissingOut := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-WH-OUT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseMissingOut.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, receiptItem.LotID, mustDecimal(t, "1"), stringPtr("WH-MISSING-OUT"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseMissingOut.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected warehouse correction missing OUT to be rejected, got %v", err)
	}

	warehouseQuantityMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-WH-QTY-MISMATCH", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseQuantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "2"), stringPtr("WH-QTY-MISMATCH"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseQuantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, receiptItem.LotID, mustDecimal(t, "3"), stringPtr("WH-QTY-MISMATCH"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseQuantityMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected warehouse correction quantity mismatch to be rejected, got %v", err)
	}
	warehouseLotMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-WH-LOT-MISMATCH", postedReceipt.ID)
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(warehouseLotMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetLotID(*receiptItem.LotID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("WH-LOT-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create warehouse correction out mismatch fixture failed: %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(warehouseLotMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(otherWarehouse.ID).
		SetUnitID(fixtures.unitID).
		SetLotID(newLot.ID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("WH-LOT-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create warehouse correction in mismatch fixture failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseLotMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected warehouse correction lot mismatch to be rejected, got %v", err)
	}

	overdraw := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-LOT-OVERDRAW", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, overdraw.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "11"), stringPtr("OVERDRAW"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, overdraw.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "11"), stringPtr("OVERDRAW"))
	beforeTxnCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count adjustment txns before overdraw failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, overdraw.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected correction out side overdraw to be rejected, got %v", err)
	}
	afterTxnCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count adjustment txns after overdraw failed: %v", err)
	}
	if afterTxnCount != beforeTxnCount {
		t.Fatalf("failed overdraw correction should rollback txns, before=%d after=%d", beforeTxnCount, afterTxnCount)
	}

	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-GUARD-NONLOT-RECEIPT", fixtures, nil, mustDecimal(t, "10"))
	nonLotItem := nonLotReceipt.Items[0]
	if nonLotItem.LotID != nil {
		t.Fatalf("expected non-lot receipt item")
	}
	lotStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-GUARD-LOT-STOCK", fixtures, stringPtr("PRA-GUARD-ISOLATED-LOT"), mustDecimal(t, "10"))
	if lotStockReceipt.Items[0].LotID == nil {
		t.Fatalf("expected isolated lot stock")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "8"),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_PRA_NONLOT_CONSUME",
		IdempotencyKey: "test-pra-nonlot-consume",
	}); err != nil {
		t.Fatalf("consume non-lot stock before adjustment failed: %v", err)
	}
	nonLotDecrease := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-NONLOT-DECREASE", nonLotReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, nonLotDecrease.ID, nonLotItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, nil, mustDecimal(t, "3"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, nonLotDecrease.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected non-lot decrease to ignore lot stock, got %v", err)
	}
	lotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotStockReceipt.Items[0].LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get isolated lot balance failed: %v", err)
	}
	assertDecimalEqual(t, lotBalance.Quantity, "10")
}

func TestInventoryRepo_PurchaseReceiptAdjustmentLotStatusGuard(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	for _, status := range []string{biz.InventoryLotHold, biz.InventoryLotRejected} {
		status := status
		t.Run("quantity_decrease_"+status, func(t *testing.T) {
			receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-STATUS-QTY-"+status, fixtures, stringPtr("PRA-STATUS-QTY-LOT-"+status), mustDecimal(t, "5"))
			item := receipt.Items[0]
			if item.LotID == nil {
				t.Fatalf("expected quantity status lot_id")
			}
			changeLotToStatus(t, ctx, uc, *item.LotID, status)
			adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-STATUS-QTY-ADJ-"+status, receipt.ID)
			addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, item, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, item.LotID, mustDecimal(t, "1"), nil)
			if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
				t.Fatalf("expected %s quantity decrease to be blocked by lot status, got %v", status, err)
			}
			assertAdjustmentTxnCount(t, ctx, client, adjustment.ID, 0)
			balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				WarehouseID: fixtures.warehouseID,
				LotID:       item.LotID,
				UnitID:      fixtures.unitID,
			})
			if err != nil {
				t.Fatalf("get %s balance after blocked quantity decrease failed: %v", status, err)
			}
			assertDecimalEqual(t, balance.Quantity, "5")
		})
	}

	lotCorrectionReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-STATUS-LOT-CORR-IN", fixtures, stringPtr("PRA-STATUS-LOT-CORR-OLD"), mustDecimal(t, "5"))
	lotCorrectionItem := lotCorrectionReceipt.Items[0]
	if lotCorrectionItem.LotID == nil {
		t.Fatalf("expected lot correction status old lot_id")
	}
	lotCorrectionNewLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-STATUS-LOT-CORR-NEW")
	changeLotToStatus(t, ctx, uc, *lotCorrectionItem.LotID, biz.InventoryLotHold)
	lotCorrection := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-STATUS-LOT-CORR", lotCorrectionReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotCorrection.ID, lotCorrectionItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, lotCorrectionItem.LotID, mustDecimal(t, "2"), stringPtr("LOT-STATUS"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotCorrection.ID, lotCorrectionItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &lotCorrectionNewLot.ID, mustDecimal(t, "2"), stringPtr("LOT-STATUS"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, lotCorrection.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected HOLD lot correction OUT to be blocked, got %v", err)
	}
	assertAdjustmentTxnCount(t, ctx, client, lotCorrection.ID, 0)
	oldLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotCorrectionItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old lot balance after blocked correction failed: %v", err)
	}
	assertDecimalEqual(t, oldLotBalance.Quantity, "5")
	if _, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lotCorrectionNewLot.ID,
		UnitID:      fixtures.unitID,
	}); !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("blocked correction must not write IN-side balance, got %v", err)
	}

	warehouseCorrectionReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-STATUS-WH-CORR-IN", fixtures, stringPtr("PRA-STATUS-WH-CORR-LOT"), mustDecimal(t, "5"))
	warehouseCorrectionItem := warehouseCorrectionReceipt.Items[0]
	if warehouseCorrectionItem.LotID == nil {
		t.Fatalf("expected warehouse correction status lot_id")
	}
	otherWarehouse := createTestWarehouse(t, ctx, client, "PRA-STATUS-WH-CORR-TO")
	changeLotToStatus(t, ctx, uc, *warehouseCorrectionItem.LotID, biz.InventoryLotRejected)
	warehouseCorrection := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-STATUS-WH-CORR", warehouseCorrectionReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseCorrection.ID, warehouseCorrectionItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, warehouseCorrectionItem.LotID, mustDecimal(t, "2"), stringPtr("WH-STATUS"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseCorrection.ID, warehouseCorrectionItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, warehouseCorrectionItem.LotID, mustDecimal(t, "2"), stringPtr("WH-STATUS"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseCorrection.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected REJECTED warehouse correction OUT to be blocked, got %v", err)
	}
	assertAdjustmentTxnCount(t, ctx, client, warehouseCorrection.ID, 0)
	if _, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: otherWarehouse.ID,
		LotID:       warehouseCorrectionItem.LotID,
		UnitID:      fixtures.unitID,
	}); !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("blocked warehouse correction must not write IN-side balance, got %v", err)
	}
}

func TestInventoryRepo_ReversalIgnoresCurrentLotStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_reversal_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "REV-STATUS-RECEIPT", fixtures, stringPtr("REV-STATUS-RECEIPT-LOT"), mustDecimal(t, "5"))
	receiptItem := receipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected receipt reversal lot_id")
	}
	changeLotToStatus(t, ctx, uc, *receiptItem.LotID, biz.InventoryLotHold)
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("cancel purchase receipt should ignore HOLD lot status, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("repeat cancel purchase receipt should remain idempotent, got %v", err)
	}
	inboundTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(receiptItem.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find receipt inbound txn failed: %v", err)
	}
	assertReversalCount(t, ctx, client, inboundTxn.ID, 1)

	returnReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "REV-STATUS-RETURN-IN", fixtures, stringPtr("REV-STATUS-RETURN-LOT"), mustDecimal(t, "5"))
	returnItem := returnReceipt.Items[0]
	if returnItem.LotID == nil {
		t.Fatalf("expected return reversal lot_id")
	}
	purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "REV-STATUS-RETURN", returnReceipt.ID, returnItem, fixtures, mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("post return before status reversal failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *returnItem.LotID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("cancel purchase return should ignore REJECTED lot status, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat cancel purchase return should remain idempotent, got %v", err)
	}
	returnOutTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find return outbound txn failed: %v", err)
	}
	assertReversalCount(t, ctx, client, returnOutTxn.ID, 1)

	adjustmentReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "REV-STATUS-ADJ-IN", fixtures, stringPtr("REV-STATUS-ADJ-OLD"), mustDecimal(t, "5"))
	adjustmentItem := adjustmentReceipt.Items[0]
	if adjustmentItem.LotID == nil {
		t.Fatalf("expected adjustment reversal old lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "REV-STATUS-ADJ-NEW")
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "REV-STATUS-ADJ", adjustmentReceipt.ID)
	outItem := addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, adjustmentItem.LotID, mustDecimal(t, "2"), stringPtr("REV-ADJ"))
	inItem := addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "2"), stringPtr("REV-ADJ"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("post adjustment before status reversal failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *adjustmentItem.LotID, biz.InventoryLotHold)
	changeLotToStatus(t, ctx, uc, newLot.ID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("cancel adjustment should ignore HOLD/REJECTED lot status, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat cancel adjustment should remain idempotent, got %v", err)
	}
	adjustOutTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(outItem.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment out txn failed: %v", err)
	}
	adjustInTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(inItem.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment in txn failed: %v", err)
	}
	assertReversalCount(t, ctx, client, adjustOutTxn.ID, 1)
	assertReversalCount(t, ctx, client, adjustInTxn.ID, 1)
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

func createLinkedPurchaseReturn(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, returnNo string, receiptID int, receiptItem *biz.PurchaseReceiptItem, fixtures inventoryTestFixtures, quantity decimal.Decimal) *biz.PurchaseReturn {
	t.Helper()
	purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          returnNo,
		PurchaseReceiptID: &receiptID,
		SupplierName:      "采购供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 15, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase return %s failed: %v", returnNo, err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              purchaseReturn.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              quantity,
	}); err != nil {
		t.Fatalf("add purchase return %s item failed: %v", returnNo, err)
	}
	return purchaseReturn
}

func createQualityInspectionDraftFromReceipt(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, inspectionNo string, receipt *biz.PurchaseReceipt, fixtures inventoryTestFixtures) *biz.QualityInspection {
	t.Helper()
	if len(receipt.Items) != 1 {
		t.Fatalf("expected receipt %s to have one item, got %d", receipt.ReceiptNo, len(receipt.Items))
	}
	item := receipt.Items[0]
	if item.LotID == nil {
		t.Fatalf("expected receipt %s item lot_id", receipt.ReceiptNo)
	}
	inspection, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          inspectionNo,
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: &item.ID,
		InventoryLotID:        *item.LotID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
	})
	if err != nil {
		t.Fatalf("create quality inspection %s failed: %v", inspectionNo, err)
	}
	return inspection
}

func createPurchaseReceiptAdjustmentDraft(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, adjustmentNo string, receiptID int) *biz.PurchaseReceiptAdjustment {
	t.Helper()
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      adjustmentNo,
		PurchaseReceiptID: receiptID,
		AdjustedAt:        time.Date(2026, 4, 26, 16, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt adjustment %s failed: %v", adjustmentNo, err)
	}
	return adjustment
}

func addPurchaseReceiptAdjustmentItem(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, adjustmentID int, receiptItem *biz.PurchaseReceiptItem, adjustType string, warehouseID int, lotID *int, quantity decimal.Decimal, correctionGroup *string) *biz.PurchaseReceiptAdjustmentItem {
	t.Helper()
	item, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustmentID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            adjustType,
		MaterialID:            receiptItem.MaterialID,
		WarehouseID:           warehouseID,
		UnitID:                receiptItem.UnitID,
		LotID:                 lotID,
		Quantity:              quantity,
		CorrectionGroup:       correctionGroup,
	})
	if err != nil {
		t.Fatalf("add purchase receipt adjustment item failed: %v", err)
	}
	return item
}

func changeLotToStatus(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, lotID int, status string) {
	t.Helper()
	if status == biz.InventoryLotRejected {
		if _, err := uc.ChangeInventoryLotStatus(ctx, lotID, biz.InventoryLotHold, "待判"); err != nil {
			t.Fatalf("change lot %d to HOLD before REJECTED failed: %v", lotID, err)
		}
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, lotID, status, "测试状态变更"); err != nil {
		t.Fatalf("change lot %d to %s failed: %v", lotID, status, err)
	}
}

func forceLotStatus(t *testing.T, ctx context.Context, client *ent.Client, lotID int, status string) {
	t.Helper()
	if _, err := client.InventoryLot.UpdateOneID(lotID).SetStatus(status).Save(ctx); err != nil {
		t.Fatalf("force lot %d to %s failed: %v", lotID, status, err)
	}
}

func assertLotStatus(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, lotID int, want string) {
	t.Helper()
	lot, err := uc.GetInventoryLot(ctx, lotID)
	if err != nil {
		t.Fatalf("get lot %d failed: %v", lotID, err)
	}
	if lot.Status != want {
		t.Fatalf("expected lot %d status %s, got %s", lotID, want, lot.Status)
	}
}

func inventoryTxnCount(t *testing.T, ctx context.Context, client *ent.Client) int {
	t.Helper()
	count, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory txns failed: %v", err)
	}
	return count
}

func assertInventoryTxnCount(t *testing.T, ctx context.Context, client *ent.Client, want int) {
	t.Helper()
	count := inventoryTxnCount(t, ctx, client)
	if count != want {
		t.Fatalf("expected inventory txn count %d, got %d", want, count)
	}
}

func assertAdjustmentTxnCount(t *testing.T, ctx context.Context, client *ent.Client, adjustmentID int, want int) {
	t.Helper()
	count, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustmentID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count adjustment txns failed: %v", err)
	}
	if count != want {
		t.Fatalf("expected adjustment %d txn count %d, got %d", adjustmentID, want, count)
	}
}

func assertReversalCount(t *testing.T, ctx context.Context, client *ent.Client, originalTxnID int, want int) {
	t.Helper()
	count, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(originalTxnID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count reversals for txn %d failed: %v", originalTxnID, err)
	}
	if count != want {
		t.Fatalf("expected txn %d reversal count %d, got %d", originalTxnID, want, count)
	}
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
