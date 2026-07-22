package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	ProductionExceptionScrap         = "SCRAP"
	ProductionExceptionOverIssue     = "OVER_ISSUE"
	ProductionExceptionWIPConcession = "WIP_CONCESSION"
	ProductionExceptionSubmitted     = "SUBMITTED"
	ProductionExceptionApproved      = "APPROVED"
	ProductionExceptionRejected      = "REJECTED"
	ProductionExceptionCancelled     = "CANCELLED"
	ProductionExceptionSourceType    = "PRODUCTION_EXCEPTION"
	ProductionFactScrap              = "SCRAP"
)

var (
	ErrProductionExceptionNotFound       = errors.New("production exception decision not found")
	ErrProductionExceptionConflict       = errors.New("production exception decision conflict")
	ErrProductionExceptionSourceInvalid  = errors.New("production exception source invalid")
	ErrProductionExceptionInvalidState   = errors.New("production exception state invalid")
	ErrProductionExceptionApprovalAmount = errors.New("production exception approved quantity invalid")
)

type ProductionExceptionDecision struct {
	ID, ProductionOrderID, ProductionOrderItemID, Version, RequestedBy int
	DecisionNo, DecisionType, Status, Reason                           string
	ProductionMaterialRequirementID, ProductionWIPBatchID              *int
	QualityInspectionID, DecidedBy                                     *int
	RequestedQuantity                                                  decimal.Decimal
	ApprovedQuantity                                                   *decimal.Decimal
	RequestedAt                                                        time.Time
	DecidedAt                                                          *time.Time
	DecisionReason                                                     *string
}

type ProductionExceptionSubmit struct {
	DecisionNo, DecisionType, Reason, IdempotencyKey                           string
	ProductionOrderID, ProductionOrderItemID                                   int
	ProductionMaterialRequirementID, ProductionWIPBatchID, QualityInspectionID *int
	RequestedQuantity                                                          decimal.Decimal
	RequestedBy                                                                int
}

type ProductionExceptionMutation struct {
	ID, ExpectedVersion, ActorID int
	ApprovedQuantity             *decimal.Decimal
	Reason                       string
}

type ProductionExceptionDecisionRepo interface {
	SubmitProductionException(context.Context, *ProductionExceptionSubmit, string) (*ProductionExceptionDecision, error)
	ApproveProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	RejectProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	CancelProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	GetProductionException(context.Context, int) (*ProductionExceptionDecision, error)
}

func (uc *OperationalFactUsecase) SubmitProductionException(ctx context.Context, in *ProductionExceptionSubmit) (*ProductionExceptionDecision, error) {
	repo, ok := productionExceptionRepo(uc)
	if !ok || in == nil {
		return nil, ErrBadParam
	}
	n := *in
	n.DecisionNo, n.DecisionType, n.Reason, n.IdempotencyKey = strings.TrimSpace(n.DecisionNo), strings.ToUpper(strings.TrimSpace(n.DecisionType)), strings.TrimSpace(n.Reason), strings.TrimSpace(n.IdempotencyKey)
	if n.DecisionNo == "" || n.ProductionOrderID <= 0 || n.ProductionOrderItemID <= 0 || !n.RequestedQuantity.IsPositive() || n.Reason == "" || n.IdempotencyKey == "" || len(n.IdempotencyKey) > 128 || n.RequestedBy <= 0 {
		return nil, ErrBadParam
	}
	switch n.DecisionType {
	case ProductionExceptionOverIssue:
		if n.ProductionMaterialRequirementID == nil || *n.ProductionMaterialRequirementID <= 0 || n.ProductionWIPBatchID != nil || n.QualityInspectionID != nil {
			return nil, ErrProductionExceptionSourceInvalid
		}
	case ProductionExceptionWIPConcession:
		if n.ProductionWIPBatchID == nil || n.QualityInspectionID == nil || n.ProductionMaterialRequirementID != nil {
			return nil, ErrProductionExceptionSourceInvalid
		}
	case ProductionExceptionScrap:
		if (n.ProductionWIPBatchID == nil) == (n.QualityInspectionID == nil) || n.ProductionMaterialRequirementID != nil {
			return nil, ErrProductionExceptionSourceInvalid
		}
	default:
		return nil, ErrBadParam
	}
	payload, err := json.Marshal(n)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(payload)
	return repo.SubmitProductionException(ctx, &n, hex.EncodeToString(sum[:]))
}

func (uc *OperationalFactUsecase) ApproveProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	repo, ok := productionExceptionRepo(uc)
	if !ok || !validProductionExceptionMutation(in, true) {
		return nil, ErrBadParam
	}
	n := *in
	n.Reason = strings.TrimSpace(n.Reason)
	return repo.ApproveProductionException(ctx, &n)
}
func (uc *OperationalFactUsecase) RejectProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	repo, ok := productionExceptionRepo(uc)
	if !ok || !validProductionExceptionMutation(in, false) {
		return nil, ErrBadParam
	}
	n := *in
	n.Reason = strings.TrimSpace(n.Reason)
	n.ApprovedQuantity = nil
	return repo.RejectProductionException(ctx, &n)
}
func (uc *OperationalFactUsecase) CancelProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	repo, ok := productionExceptionRepo(uc)
	if !ok || !validProductionExceptionMutation(in, false) {
		return nil, ErrBadParam
	}
	n := *in
	n.Reason = strings.TrimSpace(n.Reason)
	n.ApprovedQuantity = nil
	return repo.CancelProductionException(ctx, &n)
}
func (uc *OperationalFactUsecase) GetProductionException(ctx context.Context, id int) (*ProductionExceptionDecision, error) {
	repo, ok := productionExceptionRepo(uc)
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetProductionException(ctx, id)
}

func productionExceptionRepo(uc *OperationalFactUsecase) (ProductionExceptionDecisionRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := any(uc.repo).(ProductionExceptionDecisionRepo)
	return repo, ok
}
func validProductionExceptionMutation(in *ProductionExceptionMutation, approval bool) bool {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || strings.TrimSpace(in.Reason) == "" {
		return false
	}
	return !approval || in.ApprovedQuantity == nil || in.ApprovedQuantity.IsPositive()
}
