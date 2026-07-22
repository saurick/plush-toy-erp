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
	PurchaseRejectionReturnToVendor  = "RETURN_TO_VENDOR"
	PurchaseRejectionReplace         = "REPLACE"
	PurchaseRejectionStatusDraft     = "DRAFT"
	PurchaseRejectionStatusPosted    = "POSTED"
	PurchaseRejectionStatusCancelled = "CANCELLED"
)

var (
	ErrPurchaseRejectionDispositionNotFound = errors.New("purchase rejection disposition not found")
	ErrPurchaseRejectionSourceInvalid       = errors.New("purchase rejection disposition source invalid")
	ErrPurchaseRejectionSourceState         = errors.New("purchase rejection disposition source state invalid")
	ErrPurchaseRejectionConflict            = errors.New("active purchase rejection disposition already exists")
)

type PurchaseRejectionDisposition struct {
	ID                                                            int
	DispositionNo                                                 string
	QualityInspectionID, PurchaseReceiptID, PurchaseReceiptItemID int
	DispositionType, Status                                       string
	Quantity                                                      decimal.Decimal
	SupplierID                                                    *int
	SupplierName, Reason                                          string
	PostedAt                                                      *time.Time
	PostedBy                                                      *int
	CancelledAt                                                   *time.Time
	CancelledBy                                                   *int
	CancelReason                                                  *string
	CreatedBy                                                     int
	Version                                                       int
	CreatedAt                                                     time.Time
}
type PurchaseRejectionDispositionCreate struct {
	DispositionNo          string
	QualityInspectionID    int
	DispositionType        string
	Quantity               decimal.Decimal
	Reason, IdempotencyKey string
	CreatedBy              int
}
type PurchaseRejectionDispositionMutation struct {
	ID, ExpectedVersion, ActorID int
	Reason                       string
}
type PurchaseRejectionDispositionRepo interface {
	CreatePurchaseRejectionDisposition(context.Context, *PurchaseRejectionDispositionCreate, string) (*PurchaseRejectionDisposition, error)
	PostPurchaseRejectionDisposition(context.Context, *PurchaseRejectionDispositionMutation) (*PurchaseRejectionDisposition, error)
	CancelPurchaseRejectionDisposition(context.Context, *PurchaseRejectionDispositionMutation) (*PurchaseRejectionDisposition, error)
	GetPurchaseRejectionDisposition(context.Context, int) (*PurchaseRejectionDisposition, error)
}

func (uc *InventoryUsecase) CreatePurchaseRejectionDisposition(ctx context.Context, in *PurchaseRejectionDispositionCreate) (*PurchaseRejectionDisposition, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(PurchaseRejectionDispositionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	n := *in
	n.DispositionNo = strings.TrimSpace(n.DispositionNo)
	n.DispositionType = strings.ToUpper(strings.TrimSpace(n.DispositionType))
	n.Reason = strings.TrimSpace(n.Reason)
	n.IdempotencyKey = strings.TrimSpace(n.IdempotencyKey)
	if n.DispositionNo == "" || n.QualityInspectionID <= 0 || (n.DispositionType != PurchaseRejectionReturnToVendor && n.DispositionType != PurchaseRejectionReplace) || !n.Quantity.IsPositive() || n.Reason == "" || n.IdempotencyKey == "" || len(n.IdempotencyKey) > 128 || n.CreatedBy <= 0 {
		return nil, ErrBadParam
	}
	payload, err := json.Marshal(n)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(payload)
	return repo.CreatePurchaseRejectionDisposition(ctx, &n, hex.EncodeToString(sum[:]))
}
func (uc *InventoryUsecase) PostPurchaseRejectionDisposition(ctx context.Context, in *PurchaseRejectionDispositionMutation) (*PurchaseRejectionDisposition, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(PurchaseRejectionDispositionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.PostPurchaseRejectionDisposition(ctx, in)
}
func (uc *InventoryUsecase) CancelPurchaseRejectionDisposition(ctx context.Context, in *PurchaseRejectionDispositionMutation) (*PurchaseRejectionDisposition, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(PurchaseRejectionDispositionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CancelPurchaseRejectionDisposition(ctx, in)
}
func (uc *InventoryUsecase) GetPurchaseRejectionDisposition(ctx context.Context, id int) (*PurchaseRejectionDisposition, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := any(uc.repo).(PurchaseRejectionDispositionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.GetPurchaseRejectionDisposition(ctx, id)
}
