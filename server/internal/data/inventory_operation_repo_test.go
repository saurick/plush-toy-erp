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
	lot := client.InventoryLot.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetLotNo("LOT-INV-TRANSFER").
		SetStatus(biz.InventoryLotActive).
		SaveX(ctx)
	otherLot := client.InventoryLot.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetLotNo("LOT-INV-TRANSFER-OTHER").
		SetStatus(biz.InventoryLotActive).
		SaveX(ctx)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, WarehouseID: fixtures.warehouseID, LotID: &lot.ID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), UnitID: fixtures.unitID, SourceType: "TEST", IdempotencyKey: "inventory-operation-seed"})
	if err != nil {
		t.Fatal(err)
	}
	mismatched := &biz.InventoryOperationCreate{OperationNo: "TR-MISMATCH", OperationType: biz.InventoryOperationTransfer, Reason: "禁止调拨换批", IdempotencyKey: "tr-mismatch", CreatedBy: 1, Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, FromWarehouseID: fixtures.warehouseID, FromLotID: &lot.ID, ToWarehouseID: &to.ID, ToLotID: &otherLot.ID, UnitID: fixtures.unitID, AdjustmentQuantity: decimal.NewFromInt(1)}}}
	if _, err := uc.CreateInventoryOperation(ctx, mismatched); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("mismatched transfer lot err=%v", err)
	}
	in := &biz.InventoryOperationCreate{OperationNo: "TR-1", OperationType: biz.InventoryOperationTransfer, Reason: "移仓", IdempotencyKey: "tr-1", CreatedBy: 1, Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, FromWarehouseID: fixtures.warehouseID, FromLotID: &lot.ID, ToWarehouseID: &to.ID, UnitID: fixtures.unitID, AdjustmentQuantity: decimal.NewFromInt(4)}}}
	created, err := uc.CreateInventoryOperation(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if created.Items[0].ToLotID == nil || *created.Items[0].ToLotID != lot.ID {
		t.Fatalf("transfer target lot = %#v, want source lot %d", created.Items[0].ToLotID, lot.ID)
	}
	replay, err := uc.CreateInventoryOperation(ctx, in)
	if err != nil || replay.ID != created.ID {
		t.Fatalf("replay=%#v err=%v", replay, err)
	}
	posted, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || posted.Status != biz.InventoryOperationStatusPosted {
		t.Fatalf("posted=%#v err=%v", posted, err)
	}
	assertInventoryOperationLotBalance(t, ctx, uc, fixtures.materialID, fixtures.warehouseID, lot.ID, fixtures.unitID, "6")
	assertInventoryOperationLotBalance(t, ctx, uc, fixtures.materialID, to.ID, lot.ID, fixtures.unitID, "4")
	postReplay, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || postReplay.ID != posted.ID {
		t.Fatalf("post replay=%#v err=%v", postReplay, err)
	}
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 9}); !errors.Is(err, biz.ErrInventoryOperationVersionConflict) {
		t.Fatalf("different-actor post replay err=%v", err)
	}
	cancelled, err := uc.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: posted.Version, ActorID: 2, Reason: "调拨撤销"})
	if err != nil || cancelled.Status != biz.InventoryOperationStatusCancelled {
		t.Fatalf("cancel=%#v err=%v", cancelled, err)
	}
	assertInventoryOperationLotBalance(t, ctx, uc, fixtures.materialID, fixtures.warehouseID, lot.ID, fixtures.unitID, "10")
	assertInventoryOperationLotBalance(t, ctx, uc, fixtures.materialID, to.ID, lot.ID, fixtures.unitID, "0")
	if _, err := uc.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: posted.Version, ActorID: 2, Reason: "不同原因"}); !errors.Is(err, biz.ErrInventoryOperationVersionConflict) {
		t.Fatalf("different-intent cancel replay err=%v", err)
	}
}

func TestInventoryOperationCycleCountStaleAndManualAdjustmentGuard(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_operation_count")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
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
	created, err := uc.CreateInventoryOperation(ctx, manual)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 1}); !errors.Is(err, biz.ErrProcessRuntimeRequired) {
		t.Fatalf("manual adjustment direct post guard err=%v", err)
	}
	if _, err := repo.submitInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 9}, nil, nil); !errors.Is(err, biz.ErrInventoryOperationSubmitOwner) {
		t.Fatalf("non-owner submit err=%v", err)
	}
	submitted, err := repo.submitInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 1}, nil, nil)
	if err != nil || submitted.Status != biz.InventoryOperationStatusSubmitted {
		t.Fatalf("submitted=%#v err=%v", submitted, err)
	}
	if replay, err := repo.submitInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 1}, nil, nil); err != nil || replay.ID != created.ID {
		t.Fatalf("submit replay=%#v err=%v", replay, err)
	}
	if _, err := repo.approveInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: submitted.Version, ActorID: 1}, nil, nil); !errors.Is(err, biz.ErrInventoryOperationSelfApproval) {
		t.Fatalf("self approval err=%v", err)
	}
	approved, err := repo.approveInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: submitted.Version, ActorID: 2}, nil, nil)
	if err != nil || approved.Status != biz.InventoryOperationStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	if replay, err := repo.approveInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: submitted.Version, ActorID: 2}, nil, nil); err != nil || replay.ID != created.ID {
		t.Fatalf("approve replay=%#v err=%v", replay, err)
	}
	if _, err := repo.postInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: created.ID, ExpectedVersion: approved.Version, ActorID: 1}, nil, nil); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("negative guard err=%v", err)
	}
	current, err := uc.GetInventoryOperation(ctx, created.ID)
	if err != nil || current.Status != biz.InventoryOperationStatusApproved || current.Version != approved.Version {
		t.Fatalf("failed post changed source document current=%#v err=%v", current, err)
	}
}

func assertInventoryOperationBalance(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, materialID, warehouseID, unitID int, want string) {
	t.Helper()
	got, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: materialID, WarehouseID: warehouseID, UnitID: unitID})
	if err != nil || got.Quantity.String() != want {
		t.Fatalf("balance warehouse=%d got=%v err=%v want=%s", warehouseID, got, err, want)
	}
}

func assertInventoryOperationLotBalance(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, materialID, warehouseID, lotID, unitID int, want string) {
	t.Helper()
	got, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: materialID, WarehouseID: warehouseID, LotID: &lotID, UnitID: unitID})
	if err != nil || got.Quantity.String() != want {
		t.Fatalf("balance warehouse=%d lot=%d got=%v err=%v want=%s", warehouseID, lotID, got, err, want)
	}
}
