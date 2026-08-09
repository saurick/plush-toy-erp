package biz

import (
	"context"
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

func TestInventoryOperationCreateAcceptsManualAdjustmentAsDraft(t *testing.T) {
	repo := &inventoryOperationUsecaseRepoStub{}
	uc := NewInventoryUsecase(repo)
	got, err := uc.CreateInventoryOperation(context.Background(), &InventoryOperationCreate{
		OperationNo: "MA-1", OperationType: InventoryOperationManualAdjustment, Reason: "调整", IdempotencyKey: "ma-1", CreatedBy: 1,
		Items: []InventoryOperationItemCreate{{LineNo: "1", SubjectType: InventorySubjectMaterial, SubjectID: 1, FromWarehouseID: 2, UnitID: 3, AdjustmentQuantity: decimal.NewFromInt(1)}},
	})
	if err != nil || got.Status != InventoryOperationStatusDraft || repo.created.OperationType != InventoryOperationManualAdjustment {
		t.Fatalf("got=%#v created=%#v err=%v", got, repo.created, err)
	}
}

func TestInventoryOperationDraftSaveNormalizesEditableFields(t *testing.T) {
	repo := &inventoryOperationUsecaseRepoStub{}
	uc := NewInventoryUsecase(repo)
	counted := decimal.RequireFromString("8.5")
	note := "  复盘后修正  "
	got, err := uc.SaveInventoryOperationDraft(context.Background(), &InventoryOperationDraftSave{
		ID: 9, ExpectedVersion: 2, OperationNo: "  CC-9  ", Reason: "  月末复盘  ",
		Items: []InventoryOperationDraftItemSave{{ID: 10, CountedQuantity: &counted, Note: &note}},
	}, 7)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != 9 || repo.saved == nil || repo.saved.ActorID != 7 || repo.saved.OperationNo != "CC-9" || repo.saved.Reason != "月末复盘" || repo.saved.Items[0].Note == nil || *repo.saved.Items[0].Note != "复盘后修正" {
		t.Fatalf("got=%#v saved=%#v", got, repo.saved)
	}
	_, err = uc.SaveInventoryOperationDraft(context.Background(), &InventoryOperationDraftSave{
		ID: 9, ExpectedVersion: 2, OperationNo: "CC-9", Reason: "月末复盘",
		Items: []InventoryOperationDraftItemSave{{ID: 10}, {ID: 10}},
	}, 7)
	if err != ErrBadParam {
		t.Fatalf("duplicate item ids err=%v", err)
	}
}

type inventoryOperationUsecaseRepoStub struct {
	InventoryRepo
	created    *InventoryOperationCreate
	saved      *InventoryOperationDraftSave
	intentHash string
}

func (r *inventoryOperationUsecaseRepoStub) SaveInventoryOperationDraft(_ context.Context, in *InventoryOperationDraftSave) (*InventoryOperation, error) {
	r.saved = in
	return &InventoryOperation{ID: in.ID, OperationNo: in.OperationNo, Reason: in.Reason, Status: InventoryOperationStatusDraft, Version: in.ExpectedVersion + 1}, nil
}

func (r *inventoryOperationUsecaseRepoStub) CreateInventoryOperation(_ context.Context, in *InventoryOperationCreate, hash string) (*InventoryOperation, error) {
	r.created, r.intentHash = in, hash
	return &InventoryOperation{ID: 1, OperationNo: in.OperationNo, OperationType: in.OperationType, Status: InventoryOperationStatusDraft, Version: 1}, nil
}

func (r *inventoryOperationUsecaseRepoStub) PostInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) SubmitInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) ApproveInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) RejectInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) CancelInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) GetInventoryOperation(context.Context, int) (*InventoryOperation, error) {
	return nil, nil
}
func (r *inventoryOperationUsecaseRepoStub) ListInventoryOperationsForAccess(context.Context, InventoryOperationFilter, WarehouseDataScope) ([]*InventoryOperation, int, error) {
	return nil, 0, nil
}
