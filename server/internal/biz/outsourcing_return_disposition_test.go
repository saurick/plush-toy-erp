package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestOutsourcingDispositionRequiresExplicitReworkBatch(t *testing.T) {
	repo := &outsourcingDispositionRepoStub{}
	uc := NewOperationalFactUsecase(repo)
	in := &OutsourcingReturnDispositionCreate{DispositionNo: " OD-1 ", QualityInspectionID: 2, DispositionType: " rework ", Quantity: decimal.NewFromInt(1), Reason: " 返工 ", IdempotencyKey: " od-1 ", CreatedBy: 7}
	if _, err := uc.CreateOutsourcingReturnDisposition(context.Background(), in); !errors.Is(err, ErrOutsourcingDispositionSourceInvalid) {
		t.Fatalf("missing batch err=%v", err)
	}
	batchID := 9
	in.ProductionWIPBatchID = &batchID
	got, err := uc.CreateOutsourcingReturnDisposition(context.Background(), in)
	if err != nil || got.DispositionType != OutsourcingDispositionRework || repo.hash == "" {
		t.Fatalf("got=%#v err=%v hash=%q", got, err, repo.hash)
	}
}

type outsourcingDispositionRepoStub struct {
	OperationalFactRepo
	hash string
}

func (r *outsourcingDispositionRepoStub) CreateOutsourcingReturnDisposition(_ context.Context, in *OutsourcingReturnDispositionCreate, hash string) (*OutsourcingReturnDisposition, error) {
	r.hash = hash
	return &OutsourcingReturnDisposition{ID: 1, DispositionNo: in.DispositionNo, DispositionType: in.DispositionType, Status: OutsourcingDispositionDraft}, nil
}
func (*outsourcingDispositionRepoStub) PostOutsourcingReturnDisposition(context.Context, *OutsourcingReturnDispositionMutation) (*OutsourcingReturnDisposition, error) {
	return nil, nil
}
func (*outsourcingDispositionRepoStub) CancelOutsourcingReturnDisposition(context.Context, *OutsourcingReturnDispositionMutation) (*OutsourcingReturnDisposition, error) {
	return nil, nil
}
func (*outsourcingDispositionRepoStub) GetOutsourcingReturnDisposition(context.Context, int) (*OutsourcingReturnDisposition, error) {
	return nil, nil
}
