package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryPostgresOperationMultiLineRollbackAndRetry(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, client := openInventoryPostgresTestData(t)
	f := createInventoryPostgresFixtures(t, ctx, client)
	second := createTestWarehouse(t, ctx, client, "PG-SECOND-"+f.suffix)
	target := createTestWarehouse(t, ctx, client, "PG-TARGET-"+f.suffix)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	seed := func(warehouseID int, quantity int64, key string) {
		t.Helper()
		_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
			WarehouseID: warehouseID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(quantity), SourceType: "TEST", IdempotencyKey: key + f.suffix})
		if err != nil {
			t.Fatal(err)
		}
	}
	assertBalance := func(warehouseID int, quantity int64) {
		t.Helper()
		balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: warehouseID, UnitID: f.unitID})
		if err != nil || !balance.Quantity.Equal(decimal.NewFromInt(quantity)) {
			t.Fatalf("warehouse=%d balance=%+v err=%v", warehouseID, balance, err)
		}
	}
	seed(f.warehouseID, 10, "pg-transfer-first-")
	seed(second.ID, 1, "pg-transfer-second-")
	operation, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{OperationNo: "PG-MULTI-" + f.suffix,
		OperationType: biz.InventoryOperationTransfer, Reason: "多行调拨", CreatedBy: 1, IdempotencyKey: "pg-multi-" + f.suffix,
		Items: []biz.InventoryOperationItemCreate{
			{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, FromWarehouseID: f.warehouseID, ToWarehouseID: &target.ID, UnitID: f.unitID, AdjustmentQuantity: decimal.NewFromInt(4)},
			{LineNo: "2", SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, FromWarehouseID: second.ID, ToWarehouseID: &target.ID, UnitID: f.unitID, AdjustmentQuantity: decimal.NewFromInt(2)},
		}})
	if err != nil {
		t.Fatal(err)
	}
	post := &biz.InventoryOperationMutation{ID: operation.ID, ExpectedVersion: operation.Version, ActorID: 1}
	if _, err := uc.PostInventoryOperation(ctx, post); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("second-line shortage error=%v", err)
	}
	assertBalance(f.warehouseID, 10)
	assertBalance(second.ID, 1)
	if _, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: target.ID, UnitID: f.unitID}); !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("failed transfer left target balance: %v", err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SubjectType(biz.InventorySubjectMaterial), inventorytxn.SubjectID(f.materialID)).CountX(ctx); count != 2 {
		t.Fatalf("failed transfer left partial ledger: %d", count)
	}
	current, err := uc.GetInventoryOperation(ctx, operation.ID)
	if err != nil || current.Status != operation.Status || current.Version != operation.Version {
		t.Fatalf("failed transfer changed operation=%+v err=%v", current, err)
	}
	seed(second.ID, 1, "pg-transfer-replenish-")
	posted, err := uc.PostInventoryOperation(ctx, post)
	if err != nil || posted.Status != biz.InventoryOperationStatusPosted || posted.Version != operation.Version+1 {
		t.Fatalf("retry=%+v err=%v", posted, err)
	}
	replay, err := uc.PostInventoryOperation(ctx, post)
	if err != nil || replay.Version != posted.Version {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	assertBalance(f.warehouseID, 6)
	assertBalance(second.ID, 0)
	assertBalance(target.ID, 6)
	if count := client.InventoryTxn.Query().Where(inventorytxn.SubjectType(biz.InventorySubjectMaterial), inventorytxn.SubjectID(f.materialID)).CountX(ctx); count != 7 {
		t.Fatalf("retry/replay ledger count=%d, want 3 receipts plus 4 transfer entries", count)
	}
}

func TestInventoryPostgresCycleCountStaleRecovery(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, client := openInventoryPostgresTestData(t)
	f := createInventoryPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	seed := func(quantity int64, key string) {
		t.Helper()
		if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
			WarehouseID: f.warehouseID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(quantity), SourceType: "TEST", IdempotencyKey: key + f.suffix}); err != nil {
			t.Fatal(err)
		}
	}
	seed(10, "pg-count-first-")
	expected, counted := decimal.NewFromInt(10), decimal.NewFromInt(8)
	operation, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{OperationNo: "PG-COUNT-" + f.suffix,
		OperationType: biz.InventoryOperationCycleCount, Reason: "月盘", CreatedBy: 1, IdempotencyKey: "pg-count-" + f.suffix,
		Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
			FromWarehouseID: f.warehouseID, UnitID: f.unitID, ExpectedQuantity: &expected, CountedQuantity: &counted}}})
	if err != nil {
		t.Fatal(err)
	}
	seed(1, "pg-count-change-")
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: operation.ID, ExpectedVersion: operation.Version, ActorID: 1}); !errors.Is(err, biz.ErrInventoryOperationStaleCount) {
		t.Fatalf("stale count error=%v", err)
	}
	current, err := uc.GetInventoryOperation(ctx, operation.ID)
	if err != nil || current.Version != operation.Version || current.Status != biz.InventoryOperationStatusDraft || !current.Items[0].ExpectedQuantity.Equal(expected) {
		t.Fatalf("stale post changed document=%+v err=%v", current, err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SubjectType(biz.InventorySubjectMaterial), inventorytxn.SubjectID(f.materialID)).CountX(ctx); count != 2 {
		t.Fatalf("stale count left ledger: %d", count)
	}
	counted = decimal.NewFromInt(9)
	saved, err := uc.SaveInventoryOperationDraft(ctx, &biz.InventoryOperationDraftSave{ID: operation.ID, ExpectedVersion: operation.Version,
		OperationNo: operation.OperationNo, Reason: "重新核对盘点", Items: []biz.InventoryOperationDraftItemSave{{ID: operation.Items[0].ID, CountedQuantity: &counted}}}, 1)
	if err != nil || saved.Version != operation.Version+1 || !saved.Items[0].ExpectedQuantity.Equal(decimal.NewFromInt(11)) || !saved.Items[0].AdjustmentQuantity.Equal(decimal.NewFromInt(-2)) {
		t.Fatalf("save must refresh from current database balance: %+v err=%v", saved, err)
	}
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: operation.ID, ExpectedVersion: operation.Version, ActorID: 1}); !errors.Is(err, biz.ErrInventoryOperationVersionConflict) {
		t.Fatalf("old version error=%v", err)
	}
	post := &biz.InventoryOperationMutation{ID: saved.ID, ExpectedVersion: saved.Version, ActorID: 1}
	posted, err := uc.PostInventoryOperation(ctx, post)
	if err != nil || posted.Status != biz.InventoryOperationStatusPosted || posted.Version != saved.Version+1 {
		t.Fatalf("post after refresh=%+v err=%v", posted, err)
	}
	if replay, err := uc.PostInventoryOperation(ctx, post); err != nil || replay.Version != posted.Version {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID})
	if err != nil || !balance.Quantity.Equal(counted) {
		t.Fatalf("recovered count balance=%+v err=%v", balance, err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SubjectType(biz.InventorySubjectMaterial), inventorytxn.SubjectID(f.materialID)).CountX(ctx); count != 3 {
		t.Fatalf("recovery/replay ledger count=%d", count)
	}
}
