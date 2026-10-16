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
	OutsourcingDispositionReturnToVendor = "RETURN_TO_VENDOR"
	OutsourcingDispositionRework         = "REWORK"
	OutsourcingDispositionDraft          = "DRAFT"
	OutsourcingDispositionPosted         = "POSTED"
	OutsourcingDispositionCancelled      = "CANCELLED"
	OutsourcingDispositionSourceType     = "OUTSOURCING_RETURN_DISPOSITION"
)

var (
	ErrOutsourcingDispositionNotFound      = errors.New("outsourcing return disposition not found")
	ErrOutsourcingDispositionSourceInvalid = errors.New("outsourcing return disposition source invalid")
	ErrOutsourcingDispositionState         = errors.New("outsourcing return disposition state invalid")
	ErrOutsourcingDispositionConflict      = errors.New("outsourcing return disposition conflict")
)

type OutsourcingReturnDisposition struct {
	ID, QualityInspectionID, OutsourcingReturnFactID, CreatedBy   int
	DispositionNo, DispositionType, Status, Reason                string
	Quantity                                                      decimal.Decimal
	ProductionWIPBatchID, ResultWIPBatchID, PostedBy, CancelledBy *int
	PostedAt, CancelledAt                                         *time.Time
	CancelReason                                                  *string
	Version                                                       int
}
type OutsourcingReturnDispositionCreate struct {
	DispositionNo, DispositionType, Reason, IdempotencyKey string
	QualityInspectionID, CreatedBy                         int
	ProductionWIPBatchID                                   *int
	Quantity                                               decimal.Decimal
}
type OutsourcingReturnDispositionMutation struct {
	ID, ExpectedVersion, ActorID int
	Reason                       string
}
type OutsourcingReturnDispositionFilter struct {
	QualityInspectionID, OutsourcingReturnFactID int
	Status                                       string
	Limit, Offset                                int
}
type OutsourcingReturnDispositionRepo interface {
	CreateOutsourcingReturnDisposition(context.Context, *OutsourcingReturnDispositionCreate, string) (*OutsourcingReturnDisposition, error)
	PostOutsourcingReturnDisposition(context.Context, *OutsourcingReturnDispositionMutation) (*OutsourcingReturnDisposition, error)
	CancelOutsourcingReturnDisposition(context.Context, *OutsourcingReturnDispositionMutation) (*OutsourcingReturnDisposition, error)
	GetOutsourcingReturnDisposition(context.Context, int) (*OutsourcingReturnDisposition, error)
}
type OutsourcingReturnDispositionListRepo interface {
	ListOutsourcingReturnDispositions(context.Context, OutsourcingReturnDispositionFilter) ([]*OutsourcingReturnDisposition, int, error)
}

func (uc *OperationalFactUsecase) ListOutsourcingReturnDispositions(ctx context.Context, filter OutsourcingReturnDispositionFilter) ([]*OutsourcingReturnDisposition, int, error) {
	if uc == nil || uc.repo == nil || filter.QualityInspectionID < 0 || filter.OutsourcingReturnFactID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	repo, ok := any(uc.repo).(OutsourcingReturnDispositionListRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	if filter.Status != "" && filter.Status != OutsourcingDispositionDraft && filter.Status != OutsourcingDispositionPosted && filter.Status != OutsourcingDispositionCancelled {
		return nil, 0, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	return repo.ListOutsourcingReturnDispositions(ctx, filter)
}

func (uc *OperationalFactUsecase) CreateOutsourcingReturnDisposition(ctx context.Context, in *OutsourcingReturnDispositionCreate) (*OutsourcingReturnDisposition, error) {
	repo, ok := outsourcingDispositionRepo(uc)
	if !ok || in == nil {
		return nil, ErrBadParam
	}
	n := *in
	n.DispositionNo, n.DispositionType, n.Reason, n.IdempotencyKey = strings.TrimSpace(n.DispositionNo), strings.ToUpper(strings.TrimSpace(n.DispositionType)), strings.TrimSpace(n.Reason), strings.TrimSpace(n.IdempotencyKey)
	if n.DispositionNo == "" || n.QualityInspectionID <= 0 || !n.Quantity.IsPositive() || n.Reason == "" || n.IdempotencyKey == "" || len(n.IdempotencyKey) > 128 || n.CreatedBy <= 0 {
		return nil, ErrBadParam
	}
	if n.DispositionType == OutsourcingDispositionReturnToVendor && n.ProductionWIPBatchID != nil {
		return nil, ErrOutsourcingDispositionSourceInvalid
	}
	if n.DispositionType == OutsourcingDispositionRework && n.ProductionWIPBatchID != nil && *n.ProductionWIPBatchID <= 0 {
		return nil, ErrOutsourcingDispositionSourceInvalid
	}
	if n.DispositionType != OutsourcingDispositionReturnToVendor && n.DispositionType != OutsourcingDispositionRework {
		return nil, ErrBadParam
	}
	payload, err := json.Marshal(n)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(payload)
	return repo.CreateOutsourcingReturnDisposition(ctx, &n, hex.EncodeToString(sum[:]))
}
func (uc *OperationalFactUsecase) PostOutsourcingReturnDisposition(ctx context.Context, in *OutsourcingReturnDispositionMutation) (*OutsourcingReturnDisposition, error) {
	repo, ok := outsourcingDispositionRepo(uc)
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	return repo.PostOutsourcingReturnDisposition(ctx, in)
}
func (uc *OperationalFactUsecase) CancelOutsourcingReturnDisposition(ctx context.Context, in *OutsourcingReturnDispositionMutation) (*OutsourcingReturnDisposition, error) {
	repo, ok := outsourcingDispositionRepo(uc)
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || strings.TrimSpace(in.Reason) == "" {
		return nil, ErrBadParam
	}
	n := *in
	n.Reason = strings.TrimSpace(n.Reason)
	return repo.CancelOutsourcingReturnDisposition(ctx, &n)
}
func (uc *OperationalFactUsecase) GetOutsourcingReturnDisposition(ctx context.Context, id int) (*OutsourcingReturnDisposition, error) {
	repo, ok := outsourcingDispositionRepo(uc)
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetOutsourcingReturnDisposition(ctx, id)
}
func outsourcingDispositionRepo(uc *OperationalFactUsecase) (OutsourcingReturnDispositionRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := any(uc.repo).(OutsourcingReturnDispositionRepo)
	return repo, ok
}
