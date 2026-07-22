package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestInventoryOperationCreateNormalizesCycleCountIntent(t *testing.T) {
	repo := &inventoryOperationUsecaseRepoStub{}
	uc := NewInventoryUsecase(repo)
	expected, counted := decimal.NewFromInt(10), decimal.NewFromInt(8)
	got, err := uc.CreateInventoryOperation(context.Background(), &InventoryOperationCreate{
		OperationNo: "  CC-1  ", OperationType: " cycle_count ", Reason: " 月盘 ", IdempotencyKey: " count-1 ", CreatedBy: 7,
		Items: []InventoryOperationItemCreate{{LineNo: " 1 ", SubjectType: " material ", SubjectID: 1, FromWarehouseID: 2, UnitID: 3, ExpectedQuantity: &expected, CountedQuantity: &counted}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.OperationNo != "CC-1" || repo.created.OperationType != InventoryOperationCycleCount || repo.created.Items[0].SubjectType != InventorySubjectMaterial || !repo.created.Items[0].AdjustmentQuantity.Equal(decimal.NewFromInt(-2)) || repo.intentHash == "" {
		t.Fatalf("created=%#v item=%#v hash=%q", repo.created, repo.created.Items[0], repo.intentHash)
	}
}

func TestInventoryOperationCreateRequiresManualApproval(t *testing.T) {
	uc := NewInventoryUsecase(&inventoryOperationUsecaseRepoStub{})
	_, err := uc.CreateInventoryOperation(context.Background(), &InventoryOperationCreate{
		OperationNo: "MA-1", OperationType: InventoryOperationManualAdjustment, Reason: "调整", IdempotencyKey: "ma-1", CreatedBy: 1,
		Items: []InventoryOperationItemCreate{{LineNo: "1", SubjectType: InventorySubjectMaterial, SubjectID: 1, FromWarehouseID: 2, UnitID: 3, AdjustmentQuantity: decimal.NewFromInt(1)}},
	})
	if !errors.Is(err, ErrInventoryOperationApprovalMissing) {
		t.Fatalf("err=%v", err)
	}
}

type inventoryOperationUsecaseRepoStub struct {
	InventoryRepo
	created    *InventoryOperationCreate
	intentHash string
}

func (r *inventoryOperationUsecaseRepoStub) CreateInventoryOperation(_ context.Context, in *InventoryOperationCreate, hash string) (*InventoryOperation, error) {
	r.created, r.intentHash = in, hash
	return &InventoryOperation{ID: 1, OperationNo: in.OperationNo, OperationType: in.OperationType, Status: InventoryOperationStatusDraft, Version: 1}, nil
}

func (r *inventoryOperationUsecaseRepoStub) PostInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) CancelInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) GetInventoryOperation(context.Context, int) (*InventoryOperation, error) {
	return nil, nil
}
