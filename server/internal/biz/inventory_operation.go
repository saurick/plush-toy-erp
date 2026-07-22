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
	InventoryOperationStatusPosted     = "POSTED"
	InventoryOperationStatusCancelled  = "CANCELLED"
	InventoryOperationSourceType       = "INVENTORY_OPERATION"
)

var (
	ErrInventoryOperationNotFound        = errors.New("inventory operation not found")
	ErrInventoryOperationVersionConflict = errors.New("inventory operation version conflict")
	ErrInventoryOperationStaleCount      = errors.New("inventory cycle count expected quantity is stale")
	ErrInventoryOperationApprovalMissing = errors.New("manual inventory adjustment requires approval reference")
)

type InventoryOperation struct {
	ID                                         int
	OperationNo, OperationType, Status, Reason string
	ApprovalRef                                *string
	Version                                    int
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
	ApprovalRef                        *string
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

type InventoryOperationRepo interface {
	CreateInventoryOperation(context.Context, *InventoryOperationCreate, string) (*InventoryOperation, error)
	PostInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	CancelInventoryOperation(context.Context, *InventoryOperationMutation) (*InventoryOperation, error)
	GetInventoryOperation(context.Context, int) (*InventoryOperation, error)
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
func (uc *InventoryUsecase) PostInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(InventoryOperationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.PostInventoryOperation(ctx, in)
}
func (uc *InventoryUsecase) CancelInventoryOperation(ctx context.Context, in *InventoryOperationMutation) (*InventoryOperation, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
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

func normalizeInventoryOperationCreate(in *InventoryOperationCreate) (*InventoryOperationCreate, string, error) {
	o := *in
	o.OperationNo = strings.TrimSpace(o.OperationNo)
	o.OperationType = strings.ToUpper(strings.TrimSpace(o.OperationType))
	o.Reason = strings.TrimSpace(o.Reason)
	o.ApprovalRef = normalizeOptionalString(o.ApprovalRef)
	o.IdempotencyKey = strings.TrimSpace(o.IdempotencyKey)
	if o.OperationNo == "" || o.Reason == "" || o.IdempotencyKey == "" || len(o.IdempotencyKey) > 128 || o.CreatedBy <= 0 || len(o.Items) == 0 {
		return nil, "", ErrBadParam
	}
	if o.OperationType != InventoryOperationCycleCount && o.OperationType != InventoryOperationTransfer && o.OperationType != InventoryOperationManualAdjustment {
		return nil, "", ErrBadParam
	}
	if o.OperationType == InventoryOperationManualAdjustment && o.ApprovalRef == nil {
		return nil, "", ErrInventoryOperationApprovalMissing
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
			if !item.AdjustmentQuantity.IsPositive() || item.ToWarehouseID == nil || *item.ToWarehouseID <= 0 || (*item.ToWarehouseID == item.FromWarehouseID && sameBizOptionalInt(item.ToLotID, item.FromLotID)) || item.ExpectedQuantity != nil || item.CountedQuantity != nil {
				return nil, "", ErrBadParam
			}
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

func sameBizOptionalInt(a, b *int) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
