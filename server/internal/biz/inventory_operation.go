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
	InventoryOperationCycleCount       = "CYCLE_COUNT"
	InventoryOperationTransfer         = "TRANSFER"
	InventoryOperationManualAdjustment = "MANUAL_ADJUSTMENT"
	InventoryOperationStatusDraft      = "DRAFT"
	InventoryOperationStatusSubmitted  = "SUBMITTED"
	InventoryOperationStatusApproved   = "APPROVED"
	InventoryOperationStatusRejected   = "REJECTED"
	InventoryOperationStatusPosted     = "POSTED"
	InventoryOperationStatusCancelled  = "CANCELLED"
	InventoryOperationSourceType       = "INVENTORY_OPERATION"
)

var (
	ErrInventoryOperationNotFound        = errors.New("inventory operation not found")
	ErrInventoryOperationVersionConflict = errors.New("inventory operation version conflict")
	ErrInventoryOperationStaleCount      = errors.New("inventory cycle count expected quantity is stale")
	ErrInventoryOperationSubmitOwner     = errors.New("only the inventory operation creator can submit it")
	ErrInventoryOperationSelfApproval    = errors.New("inventory operation creator cannot decide it")
	ErrInventoryOperationCancelOwner     = errors.New("only the inventory operation creator or poster can cancel it")
)

type InventoryOperation struct {
	ID                                         int
	OperationNo, OperationType, Status, Reason string
	Version                                    int
	SubmittedAt                                *time.Time
	SubmittedBy                                *int
	ApprovedAt                                 *time.Time
	ApprovedBy                                 *int
	RejectedAt                                 *time.Time
	RejectedBy                                 *int
	RejectReason                               *string
	PostedAt                                   *time.Time
	PostedBy                                   *int
	CancelledAt                                *time.Time
	CancelledBy                                *int
	CancelReason                               *string
	CreatedBy                                  int
	CreatedAt, UpdatedAt                       time.Time
	Items                                      []*InventoryOperationItem
}

type InventoryOperationItem struct {
	ID, OperationID                   int
	LineNo, SubjectType               string
	SubjectID                         int
	ProductSkuID                      *int
	FromWarehouseID                   int
	FromLotID, ToWarehouseID, ToLotID *int
	UnitID                            int
	ExpectedQuantity, CountedQuantity *decimal.Decimal
	AdjustmentQuantity                decimal.Decimal
	Note                              *string
}

type InventoryOperationCreate struct {
	OperationNo, OperationType, Reason string
	IdempotencyKey                     string
	CreatedBy                          int
	Items                              []InventoryOperationItemCreate
}

type InventoryOperationItemCreate struct {
	LineNo, SubjectType               string
	SubjectID                         int
	ProductSkuID                      *int
	FromWarehouseID                   int
	FromLotID, ToWarehouseID, ToLotID *int
	UnitID                            int
	ExpectedQuantity, CountedQuantity *decimal.Decimal
	AdjustmentQuantity                decimal.Decimal
	Note                              *string
}

type InventoryOperationMutation struct {
	ID, ExpectedVersion, ActorID int
	Reason                       string
}

type InventoryOperationFilter struct {
	OperationType string
	Status        string
	CreatedBy     int
	Limit         int
	Offset        int
}

type InventoryOperationRepo interface {
	CreateInventoryOperation(context.Context, *InventoryOperationCreate, string) (*InventoryOperation, error)
	SubmitInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	ApproveInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	RejectInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	PostInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	CancelInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	GetInventoryOperation(context.Context, int) (*InventoryOperation, error)
	ListInventoryOperationsForAccess(context.Context, InventoryOperationFilter, WarehouseDataScope) ([]*InventoryOperation, int, error)
}

func (uc *InventoryUsecase) CreateInventoryOperation(ctx context.Context, in *InventoryOperationCreate) (*InventoryOperation, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	n, hash, err := normalizeInventoryOperationCreate(in)
	if err != nil {
		return nil, err
	}
	return repo.CreateInventoryOperation(ctx, n, hash)
}
func (uc *InventoryUsecase) SubmitInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if !validInventoryOperationMutation(uc, in) {
		return nil, ErrBadParam
	}
	_, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return nil, ErrProcessRuntimeRequired
}
func (uc *InventoryUsecase) ApproveInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if !validInventoryOperationMutation(uc, in) {
		return nil, ErrBadParam
	}
	_, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return nil, ErrProcessRuntimeRequired
}
func (uc *InventoryUsecase) RejectInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if !validInventoryOperationMutation(uc, in) {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, ErrBadParam
	}
	_, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return nil, ErrProcessRuntimeRequired
}
func (uc *InventoryUsecase) PostInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if !validInventoryOperationMutation(uc, in) {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	item, err := repo.GetInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, ErrInventoryOperationNotFound
	}
	if item.OperationType == InventoryOperationManualAdjustment {
		return nil, ErrProcessRuntimeRequired
	}
	return repo.PostInventoryOperation(ctx, in)
}
func (uc *InventoryUsecase) CancelInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if !validInventoryOperationMutation(uc, in) {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, ErrBadParam
	}
	return repo.CancelInventoryOperation(ctx, in)
}
func (uc *InventoryUsecase) GetInventoryOperation(ctx context.Context, id int) (*InventoryOperation, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.GetInventoryOperation(ctx, id)
}
func (uc *InventoryUsecase) ListInventoryOperationsForAccess(ctx context.Context, filter InventoryOperationFilter, scope WarehouseDataScope) ([]*InventoryOperation, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter.OperationType = strings.ToUpper(strings.TrimSpace(filter.OperationType))
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	if filter.OperationType != "" && filter.OperationType != InventoryOperationCycleCount && filter.OperationType != InventoryOperationTransfer && filter.OperationType != InventoryOperationManualAdjustment {
		return nil, 0, ErrBadParam
	}
	switch filter.Status {
	case "", InventoryOperationStatusDraft, InventoryOperationStatusSubmitted, InventoryOperationStatusApproved, InventoryOperationStatusRejected, InventoryOperationStatusPosted, InventoryOperationStatusCancelled:
	default:
		return nil, 0, ErrBadParam
	}
	if filter.CreatedBy < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	repo, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	return repo.ListInventoryOperationsForAccess(ctx, filter, NormalizeWarehouseDataScope(scope))
}

func normalizeInventoryOperationCreate(in *InventoryOperationCreate) (*InventoryOperationCreate, string, error) {
	o := *in
	o.OperationNo = strings.TrimSpace(o.OperationNo)
	o.OperationType = strings.ToUpper(strings.TrimSpace(o.OperationType))
	o.Reason = strings.TrimSpace(o.Reason)
	o.IdempotencyKey = strings.TrimSpace(o.IdempotencyKey)
	if o.OperationNo == "" || o.Reason == "" || o.IdempotencyKey == "" || len(o.IdempotencyKey) > 128 || o.CreatedBy <= 0 || len(o.Items) == 0 {
		return nil, "", ErrBadParam
	}
	if o.OperationType != InventoryOperationCycleCount && o.OperationType != InventoryOperationTransfer && o.OperationType != InventoryOperationManualAdjustment {
		return nil, "", ErrBadParam
	}
	seen := map[string]struct{}{}
	o.Items = append([]InventoryOperationItemCreate(nil), o.Items...)
	for i := range o.Items {
		item := &o.Items[i]
		item.LineNo = strings.TrimSpace(item.LineNo)
		item.SubjectType = strings.ToUpper(strings.TrimSpace(item.SubjectType))
		item.Note = normalizeOptionalString(item.Note)
		if item.LineNo == "" || item.SubjectID <= 0 || item.FromWarehouseID <= 0 || item.UnitID <= 0 || (item.SubjectType != InventorySubjectMaterial && item.SubjectType != InventorySubjectProduct) || (item.ProductSkuID != nil && (item.SubjectType != InventorySubjectProduct || *item.ProductSkuID <= 0)) {
			return nil, "", ErrBadParam
		}
		if _, dup := seen[item.LineNo]; dup {
			return nil, "", ErrBadParam
		}
		seen[item.LineNo] = struct{}{}
		switch o.OperationType {
		case InventoryOperationCycleCount:
			if item.ExpectedQuantity == nil || item.CountedQuantity == nil || item.ExpectedQuantity.IsNegative() || item.CountedQuantity.IsNegative() || item.ToWarehouseID != nil || item.ToLotID != nil {
				return nil, "", ErrBadParam
			}
			item.AdjustmentQuantity = item.CountedQuantity.Sub(*item.ExpectedQuantity)
			if item.AdjustmentQuantity.IsZero() {
				return nil, "", ErrBadParam
			}
		case InventoryOperationTransfer:
			if !item.AdjustmentQuantity.IsPositive() || item.ToWarehouseID == nil || *item.ToWarehouseID <= 0 || *item.ToWarehouseID == item.FromWarehouseID || item.ExpectedQuantity != nil || item.CountedQuantity != nil {
				return nil, "", ErrBadParam
			}
			if item.ToLotID != nil && !sameBizOptionalInt(item.ToLotID, item.FromLotID) {
				return nil, "", ErrBadParam
			}
			item.ToLotID = item.FromLotID
		case InventoryOperationManualAdjustment:
			if item.AdjustmentQuantity.IsZero() || item.ToWarehouseID != nil || item.ToLotID != nil || item.ExpectedQuantity != nil || item.CountedQuantity != nil {
				return nil, "", ErrBadParam
			}
		}
	}
	payload, err := json.Marshal(o)
	if err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(payload)
	return &o, hex.EncodeToString(sum[:]), nil
}

func validInventoryOperationMutation(uc *InventoryUsecase, in *InventoryOperationMutation) bool {
	return uc != nil && uc.repo != nil && in != nil && in.ID > 0 && in.ExpectedVersion > 0 && in.ActorID > 0
}

func sameBizOptionalInt(a, b *int) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
