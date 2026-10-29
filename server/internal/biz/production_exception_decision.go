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
	ProductionExceptionReworkOriginal    = "REWORK_ORIGINAL"
	ProductionExceptionReworkSwitch      = "REWORK_SWITCH"
	ProductionExceptionRemake            = "REMAKE"
	ProductionExceptionSubmitted         = "SUBMITTED"
	ProductionExceptionApproved          = "APPROVED"
	ProductionExceptionRejected          = "REJECTED"
	ProductionExceptionCancelled         = "CANCELLED"
	ProductionExceptionExecutionPending  = "PENDING"
	ProductionExceptionExecutionApplied  = "APPLIED"
	ProductionExceptionExecutionReversed = "REVERSED"
	ProductionExceptionSourceType        = "PRODUCTION_EXCEPTION"
)

var (
	ErrProductionExceptionNotFound       = errors.New("production exception decision not found")
	ErrProductionExceptionConflict       = errors.New("production exception decision conflict")
	ErrProductionExceptionSourceInvalid  = errors.New("production exception source invalid")
	ErrProductionExceptionInvalidState   = errors.New("production exception state invalid")
	ErrProductionExceptionApprovalAmount = errors.New("production exception approved quantity invalid")
	ErrProductionExceptionSelfApproval   = errors.New("production exception requester cannot approve own request")
	ErrProductionExceptionCancelOwner    = errors.New("only production exception requester can cancel request")
	ErrProductionExceptionWIPDependency  = errors.New("production exception WIP has active downstream dependency")
	ErrProductionExceptionFactDependency = errors.New("production exception WIP supports posted finished goods")
	ErrProductionExceptionAllowanceUsed  = errors.New("production over-issue allowance has already been consumed")
)

type ProductionExceptionDecision struct {
	ID, ProductionOrderID, ProductionOrderItemID, Version, RequestedBy int
	DecisionNo, DecisionType, Status, ExecutionStatus, Reason          string
	ProductionMaterialRequirementID, ProductionWIPBatchID              *int
	QualityInspectionID, DecidedBy                                     *int
	TargetSupplierID, TargetOperationID                                *int
	StockDispositionRequired                                           bool
	RequestedQuantity                                                  decimal.Decimal
	ApprovedQuantity                                                   *decimal.Decimal
	RequestedAt                                                        time.Time
	DecidedAt                                                          *time.Time
	DecisionReason                                                     *string
	ExecutedBy, ReversedBy                                             *int
	ExecutedAt, ReversedAt                                             *time.Time
	ExecutionReason, ReverseReason                                     *string
}

type ProductionExceptionSubmit struct {
	DecisionNo, DecisionType, Reason, IdempotencyKey                           string
	ProductionOrderID, ProductionOrderItemID                                   int
	ProductionMaterialRequirementID, ProductionWIPBatchID, QualityInspectionID *int
	TargetSupplierID, TargetOperationID                                        *int
	RequestedQuantity                                                          decimal.Decimal
	RequestedBy                                                                int
}

// Quality dispositions and additional material requests have different owners.
// The permission follows the authoritative decision type, including cancellation
// and process startup, so access to one kind never authorizes the other.
func ProductionExceptionSubmissionPermission(decisionType string) (string, bool) {
	switch strings.ToUpper(strings.TrimSpace(decisionType)) {
	case ProductionExceptionOverIssue:
		return PermissionProductionOverIssueSubmit, true
	case ProductionExceptionScrap, ProductionExceptionWIPConcession, ProductionExceptionReworkOriginal, ProductionExceptionReworkSwitch, ProductionExceptionRemake:
		return PermissionProductionExceptionSubmit, true
	default:
		return "", false
	}
}

type ProductionExceptionMutation struct {
	WarehouseScope               *WarehouseDataScope `json:"-"`
	ID, ExpectedVersion, ActorID int
	ApprovedQuantity             *decimal.Decimal
	Reason                       string
}
type ProductionExceptionFilter struct {
	HandlingStatus                        string
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

type ProductionExceptionContext struct {
	ProductionOrderID        int    `json:"production_order_id"`
	ProductionOrderItemID    int    `json:"production_order_item_id"`
	BatchID                  int    `json:"production_wip_batch_id"`
	BatchNo                  string `json:"batch_no"`
	Quantity                 string `json:"quantity"`
	UnitPrecision            int    `json:"unit_precision"`
	UnitName                 string `json:"unit_name"`
	OperationID              int    `json:"operation_id"`
	OperationName            string `json:"operation_name"`
	FabricOperationID        int    `json:"fabric_operation_id"`
	OriginalSupplierID       *int   `json:"original_supplier_id"`
	OriginalSupplierName     string `json:"original_supplier_name"`
	StockDispositionRequired bool   `json:"stock_disposition_required"`
}

type ProductionExceptionContextRepo interface {
	GetProductionExceptionContext(context.Context, int) (*ProductionExceptionContext, error)
}

func (uc *OperationalFactUsecase) GetProductionExceptionContext(ctx context.Context, inspectionID int) (*ProductionExceptionContext, error) {
	if uc == nil || uc.repo == nil || inspectionID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionExceptionContextRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.GetProductionExceptionContext(ctx, inspectionID)
}

func (uc *OperationalFactUsecase) ListProductionExceptions(ctx context.Context, filter ProductionExceptionFilter) ([]*ProductionExceptionDecision, int, error) {
	if uc == nil || uc.repo == nil || filter.ProductionOrderID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	repo, ok := any(uc.repo).(ProductionExceptionListRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeProductionExceptionFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return repo.ListProductionExceptions(ctx, normalized)
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
	case ProductionExceptionWIPConcession, ProductionExceptionScrap, ProductionExceptionReworkOriginal, ProductionExceptionReworkSwitch, ProductionExceptionRemake:
		if n.ProductionWIPBatchID == nil || *n.ProductionWIPBatchID <= 0 || n.QualityInspectionID == nil || *n.QualityInspectionID <= 0 || n.ProductionMaterialRequirementID != nil {
			return nil, ErrProductionExceptionSourceInvalid
		}
	default:
		return nil, ErrBadParam
	}
	if ProductionExceptionCreatesBatch(n.DecisionType) {
		if n.TargetOperationID == nil || *n.TargetOperationID <= 0 || (n.TargetSupplierID != nil && *n.TargetSupplierID <= 0) || (n.DecisionType != ProductionExceptionReworkOriginal && n.TargetSupplierID == nil) {
			return nil, ErrProductionExceptionSourceInvalid
		}
	} else if n.TargetSupplierID != nil || n.TargetOperationID != nil {
		return nil, ErrBadParam
	}
	payload, err := json.Marshal(n)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(payload)
	return repo.SubmitProductionException(ctx, &n, hex.EncodeToString(sum[:]))
}

func ProductionExceptionCreatesBatch(decisionType string) bool {
	return decisionType == ProductionExceptionReworkOriginal || decisionType == ProductionExceptionReworkSwitch || decisionType == ProductionExceptionRemake
}

func (uc *OperationalFactUsecase) ApproveProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	_, ok := productionExceptionRepo(uc)
	if !ok || !validProductionExceptionMutation(in, true) {
		return nil, ErrBadParam
	}
	return nil, ErrProcessRuntimeRequired
}
func (uc *OperationalFactUsecase) RejectProductionException(ctx context.Context, in *ProductionExceptionMutation) (*ProductionExceptionDecision, error) {
	_, ok := productionExceptionRepo(uc)
	if !ok || !validProductionExceptionMutation(in, false) {
		return nil, ErrBadParam
	}
	return nil, ErrProcessRuntimeRequired
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
	_, ok := any(uc.repo).(ProductionExceptionExecutionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return nil, ErrProcessRuntimeRequired
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

func normalizeProductionExceptionFilter(filter ProductionExceptionFilter) (ProductionExceptionFilter, error) {
	if filter.ProductionOrderID < 0 || filter.Offset < 0 {
		return ProductionExceptionFilter{}, ErrBadParam
	}
	filter.HandlingStatus = strings.ToUpper(strings.TrimSpace(filter.HandlingStatus))
	if _, _, err := ProductionExceptionHandlingFilter(filter.HandlingStatus); err != nil {
		return ProductionExceptionFilter{}, err
	}

	filter.Status, filter.ExecutionStatus, filter.DecisionType = strings.ToUpper(strings.TrimSpace(filter.Status)), strings.ToUpper(strings.TrimSpace(filter.ExecutionStatus)), strings.ToUpper(strings.TrimSpace(filter.DecisionType))
	filter.Limit = NormalizeBusinessListLimit(filter.Limit)
	return filter, nil
}

// Handling keys combine existing approval and execution values for read-only filtering.
func ProductionExceptionHandlingFilter(value string) (string, string, error) {
	if value == "" {
		return "", "", nil
	}
	switch value {
	case ProductionExceptionSubmitted, ProductionExceptionRejected, ProductionExceptionCancelled:
		return value, "", nil
	}
	for _, execution := range []string{ProductionExceptionExecutionPending, ProductionExceptionExecutionApplied, ProductionExceptionExecutionReversed} {
		if value == ProductionExceptionApproved+":"+execution {
			return ProductionExceptionApproved, execution, nil
		}
	}
	return "", "", ErrBadParam
}
