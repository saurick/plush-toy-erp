package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestProductionExceptionSubmitNormalizesAndRequiresTypedSource(t *testing.T) {
	requirementID := 3
	repo := &productionExceptionRepoStub{}
	uc := NewOperationalFactUsecase(repo)
	got, err := uc.SubmitProductionException(context.Background(), &ProductionExceptionSubmit{DecisionNo: " EX-1 ", DecisionType: " over_issue ", ProductionOrderID: 1, ProductionOrderItemID: 2, ProductionMaterialRequirementID: &requirementID, RequestedQuantity: decimal.NewFromInt(4), Reason: " 超领 ", IdempotencyKey: " ex-1 ", RequestedBy: 8})
	if err != nil {
		t.Fatal(err)
	}
	if got.DecisionNo != "EX-1" || repo.submitted.DecisionType != ProductionExceptionOverIssue || repo.hash == "" {
		t.Fatalf("submitted=%#v hash=%q", repo.submitted, repo.hash)
	}
	bad := *repo.submitted
	bad.ProductionMaterialRequirementID = nil
	if _, err := uc.SubmitProductionException(context.Background(), &bad); !errors.Is(err, ErrProductionExceptionSourceInvalid) {
		t.Fatalf("missing typed source err=%v", err)
	}
}

type productionExceptionRepoStub struct {
	OperationalFactRepo
	submitted *ProductionExceptionSubmit
	hash      string
}

func (r *productionExceptionRepoStub) SubmitProductionException(_ context.Context, in *ProductionExceptionSubmit, hash string) (*ProductionExceptionDecision, error) {
	r.submitted, r.hash = in, hash
	return &ProductionExceptionDecision{ID: 1, DecisionNo: in.DecisionNo, DecisionType: in.DecisionType, Status: ProductionExceptionSubmitted, Version: 1}, nil
}
func (*productionExceptionRepoStub) ApproveProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	return nil, nil
}
func (*productionExceptionRepoStub) RejectProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	return nil, nil
}
func (*productionExceptionRepoStub) CancelProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	return nil, nil
}
func (*productionExceptionRepoStub) GetProductionException(context.Context, int) (*ProductionExceptionDecision, error) {
	return nil, nil
}
