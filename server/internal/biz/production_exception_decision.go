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
	ProductionExceptionScrap             = "SCRAP"
	ProductionExceptionOverIssue         = "OVER_ISSUE"
	ProductionExceptionWIPConcession     = "WIP_CONCESSION"
	ProductionExceptionSubmitted         = "SUBMITTED"
	ProductionExceptionApproved          = "APPROVED"
	ProductionExceptionRejected          = "REJECTED"
	ProductionExceptionCancelled         = "CANCELLED"
	ProductionExceptionExecutionPending  = "PENDING"
	ProductionExceptionExecutionApplied  = "APPLIED"
	ProductionExceptionExecutionReversed = "REVERSED"
	ProductionExceptionSourceType        = "PRODUCTION_EXCEPTION"
	ProductionFactScrap                  = "SCRAP"
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
	DecisionNo, DecisionType, Status, ExecutionStatus, Reason          string
	ProductionMaterialRequirementID, ProductionWIPBatchID              *int
	QualityInspectionID, DecidedBy                                     *int
	RequestedQuantity                                                  decimal.Decimal
	ApprovedQuantity                                                   *decimal.Decimal
	RequestedAt                                                        time.Time
	DecidedAt                                                          *time.Time
	DecisionReason                                                     *string
	ExecutedBy, ReversedBy                                             *int
	ExecutedAt, ReversedAt                                             *time.Time
	ReverseReason                                                      *string
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
type ProductionExceptionFilter struct {
	Status, ExecutionStatus, DecisionType string
	ProductionOrderID                     int
	Limit, Offset                         int
}

type ProductionExceptionDecisionRepo interface {
	SubmitProductionException(context.Context, *ProductionExceptionSubmit, string) (*ProductionExceptionDecision, error)
	ApproveProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	RejectProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	CancelProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	GetProductionException(context.Context, int) (*ProductionExceptionDecision, error)
}
type ProductionExceptionExecutionRepo interface {
	ExecuteProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
	ReverseProductionException(context.Context, *ProductionExceptionMutation) (*ProductionExceptionDecision, error)
}
type ProductionExceptionSourceResolver interface {
	ResolveProductionExceptionSource(context.Context, *ProductionExceptionSubmit) error
}
type ProductionExceptionListRepo interface {
	ListProductionExceptions(context.Context, ProductionExceptionFilter) ([]*ProductionExceptionDecision, int, error)
}

func (uc *OperationalFactUsecase) ListProductionExceptions(ctx context.Context, filter ProductionExceptionFilter) ([]*ProductionExceptionDecision, int, error) {
	if uc == nil || uc.repo == nil || filter.ProductionOrderID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	repo, ok := any(uc.repo).(ProductionExceptionListRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	filter.Status, filter.ExecutionStatus, filter.DecisionType = strings.ToUpper(strings.TrimSpace(filter.Status)), strings.ToUpper(strings.TrimSpace(filter.ExecutionStatus)), strings.ToUpper(strings.TrimSpace(filter.DecisionType))
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	return repo.ListProductionExceptions(ctx, filter)
}

func (uc *OperationalFactUsecase) SubmitProductionException(ctx context.Context, in *ProductionExceptionSubmit) (*ProductionExceptionDecision, error) {
	repo, ok := productionExceptionRepo(uc)
	if !ok || in == nil {
		return nil, ErrBadParam
	}
	n := *in
	n.DecisionNo, n.DecisionType, n.Reason, n.IdempotencyKey = strings.TrimSpace(n.DecisionNo), strings.ToUpper(strings.TrimSpace(n.DecisionType)), strings.TrimSpace(n.Reason), strings.TrimSpace(n.IdempotencyKey)
	if n.ProductionOrderID <= 0 || n.ProductionOrderItemID <= 0 {
		resolver, ok := any(uc.repo).(ProductionExceptionSourceResolver)
		if !ok || resolver.ResolveProductionExceptionSource(ctx, &n) != nil {
			return nil, ErrProductionExceptionSourceInvalid
		}
	}
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
func (uc *OperationalFactUsecase) ExecuteProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	if uc == nil || uc.repo == nil || !validProductionExceptionMutation(in, false) {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(ProductionExceptionExecutionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	n := *in
	n.Reason = strings.TrimSpace(n.Reason)
	n.ApprovedQuantity = nil
	return repo.ExecuteProductionException(ctx, &n)
}
func (uc *OperationalFactUsecase) ReverseProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	if uc == nil || uc.repo == nil || !validProductionExceptionMutation(in, false) {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(ProductionExceptionExecutionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	n := *in
	n.Reason = strings.TrimSpace(n.Reason)
	n.ApprovedQuantity = nil
	return repo.ReverseProductionException(ctx, &n)
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
