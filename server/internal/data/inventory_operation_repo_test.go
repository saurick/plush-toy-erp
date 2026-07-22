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

func TestInventoryOperationTransferPostCancelAndReplay(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_operation_transfer")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	to := createTestWarehouse(t, ctx, client, "WH-INV-TO")
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), UnitID: fixtures.unitID, SourceType: "TEST", IdempotencyKey: "inventory-operation-seed"})
	if err != nil {
		t.Fatal(err)
	}
	in := &biz.InventoryOperationCreate{OperationNo: "TR-1", OperationType: biz.InventoryOperationTransfer, Reason: "移仓", IdempotencyKey: "tr-1", CreatedBy: 1, Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, FromWarehouseID: fixtures.warehouseID, ToWarehouseID: &to.ID, UnitID: fixtures.unitID, AdjustmentQuantity: decimal.NewFromInt(4)}}}
	created, err := uc.CreateInventoryOperation(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := uc.CreateInventoryOperation(ctx, in)
	if err != nil || replay.ID != created.ID {
		t.Fatalf("replay=%#v err=%v", replay, err)
	}
	posted, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || posted.Status != biz.InventoryOperationStatusPosted {
		t.Fatalf("posted=%#v err=%v", posted, err)
	}
	assertInventoryOperationBalance(t, ctx, uc, fixtures.materialID, fixtures.warehouseID, fixtures.unitID, "6")
	assertInventoryOperationBalance(t, ctx, uc, fixtures.materialID, to.ID, fixtures.unitID, "4")
	postReplay, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || postReplay.ID != posted.ID {
		t.Fatalf("post replay=%#v err=%v", postReplay, err)
	}
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 9}); !errors.Is(err, biz.ErrInventoryOperationVersionConflict) {
		t.Fatalf("different-actor post replay err=%v", err)
	}
	cancelled, err := uc.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: posted.Version, ActorID: 3, Reason: "调拨撤销"})
	if err != nil || cancelled.Status != biz.InventoryOperationStatusCancelled {
		t.Fatalf("cancel=%#v err=%v", cancelled, err)
	}
	assertInventoryOperationBalance(t, ctx, uc, fixtures.materialID, fixtures.warehouseID, fixtures.unitID, "10")
	assertInventoryOperationBalance(t, ctx, uc, fixtures.materialID, to.ID, fixtures.unitID, "0")
	if _, err := uc.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: posted.Version, ActorID: 3, Reason: "不同原因"}); !errors.Is(err, biz.ErrInventoryOperationVersionConflict) {
		t.Fatalf("different-intent cancel replay err=%v", err)
	}
}

func TestInventoryOperationCycleCountStaleAndManualAdjustmentGuard(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_operation_count")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	_, _ = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), UnitID: fixtures.unitID, SourceType: "TEST", IdempotencyKey: "count-seed"})
	expected, counted := decimal.NewFromInt(10), decimal.NewFromInt(8)
	count, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{OperationNo: "CC-1", OperationType: biz.InventoryOperationCycleCount, Reason: "月盘", IdempotencyKey: "cc-1", CreatedBy: 1, Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, FromWarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, ExpectedQuantity: &expected, CountedQuantity: &counted}}})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID, SourceType: "TEST", IdempotencyKey: "count-race"})
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: count.ID, ExpectedVersion: count.Version, ActorID: 2}); !errors.Is(err, biz.ErrInventoryOperationStaleCount) {
		t.Fatalf("stale err=%v", err)
	}
	manual := &biz.InventoryOperationCreate{OperationNo: "MA-1", OperationType: biz.InventoryOperationManualAdjustment, Reason: "审批调整", IdempotencyKey: "ma-1", CreatedBy: 1, Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, FromWarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, AdjustmentQuantity: decimal.NewFromInt(-20)}}}
	if _, err := uc.CreateInventoryOperation(ctx, manual); !errors.Is(err, biz.ErrInventoryOperationApprovalMissing) {
		t.Fatalf("approval err=%v", err)
	}
	approval := "APR-1"
	manual.ApprovalRef = &approval
	created, err := uc.CreateInventoryOperation(ctx, manual)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: 1, ActorID: 2}); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("negative guard err=%v", err)
	}
}

func assertInventoryOperationBalance(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, materialID, warehouseID, unitID int, want string) {
	t.Helper()
	got, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: materialID, WarehouseID: warehouseID, UnitID: unitID})
	if err != nil || got.Quantity.String() != want {
		t.Fatalf("balance warehouse=%d got=%v err=%v want=%s", warehouseID, got, err, want)
	}
}
