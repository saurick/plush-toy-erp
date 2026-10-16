package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestOutsourcingDispositionReturnToVendor(t *testing.T) {
	repo := &outsourcingDispositionRepoStub{}
	uc := NewOperationalFactUsecase(repo)
	in := &OutsourcingReturnDispositionCreate{DispositionNo: " OD-1 ", QualityInspectionID: 2, DispositionType: " return_to_vendor ", Quantity: decimal.NewFromInt(1), Reason: " 返厂 ", IdempotencyKey: " od-1 ", CreatedBy: 7}
	got, err := uc.CreateOutsourcingReturnDisposition(context.Background(), in)
	if err != nil || got.DispositionType != OutsourcingDispositionReturnToVendor || repo.hash == "" {
		t.Fatalf("got=%#v err=%v hash=%q", got, err, repo.hash)
	}
}

func TestOutsourcingDispositionCannotBypassProductionExceptionApproval(t *testing.T) {
	repo := &outsourcingDispositionRepoStub{}
	uc := NewOperationalFactUsecase(repo)
	in := &OutsourcingReturnDispositionCreate{DispositionNo: "OD-REWORK", QualityInspectionID: 2, DispositionType: " rework ", Quantity: decimal.NewFromInt(1), Reason: "返工", IdempotencyKey: "od-rework", CreatedBy: 7}
	if _, err := uc.CreateOutsourcingReturnDisposition(context.Background(), in); !errors.Is(err, ErrProcessRuntimeRequired) || repo.hash != "" {
		t.Fatalf("unapproved rework reached repository: err=%v hash=%q", err, repo.hash)
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
