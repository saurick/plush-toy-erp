package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	SalesReturnSourceType      = "SALES_RETURN"
	SalesReturnStatusDraft     = "DRAFT"
	SalesReturnStatusApproved  = "APPROVED"
	SalesReturnStatusReceived  = "RECEIVED"
	SalesReturnStatusCancelled = "CANCELLED"
)

type SalesReturn struct {
	ID                     int
	ReturnNo               string
	ShipmentID             int
	CustomerID             int
	CustomerNameSnapshot   string
	Status                 string
	Reason                 string
	IdempotencyKey         string
	IdempotencyPayloadHash string
	Version                int
	ApprovedAt             *time.Time
	ApprovedBy             *int
	ReceivedAt             *time.Time
	ReceivedBy             *int
	CancelledAt            *time.Time
	CancelledBy            *int
	CancelReason           *string
	CreatedBy              int
	CreatedAt              time.Time
	UpdatedAt              time.Time
	Items                  []*SalesReturnItem
}

type SalesReturnItem struct {
	ID                  int
	SalesReturnID       int
	LineNo              string
	ShipmentItemID      int
	ProductID           int
	ProductSkuID        *int
	WarehouseID         int
	UnitID              int
	LotID               *int
	QualityInspectionID int
	Quantity            decimal.Decimal
	Condition           string
	Note                *string
}

type SalesReturnCreate struct {
	ReturnNo       string
	ShipmentID     int
	Reason         string
	IdempotencyKey string
	Items          []SalesReturnItemCreate
}

type SalesReturnItemCreate struct {
	ShipmentItemID int
	Quantity       decimal.Decimal
	Note           *string
}

type SalesReturnTransition struct {
	ID              int
	ExpectedVersion int
	Reason          string
}

type SalesReturnFilter struct {
	Status     string
	ShipmentID int
	CustomerID int
	Limit      int
	Offset     int
}

type SalesReturnRepo interface {
	CreateSalesReturn(ctx context.Context, in *SalesReturnCreate, actorID int, payloadHash string) (*SalesReturn, error)
	ApproveSalesReturn(ctx context.Context, in *SalesReturnTransition, actorID int) (*SalesReturn, error)
	ReceiveSalesReturn(ctx context.Context, in *SalesReturnTransition, actorID int) (*SalesReturn, error)
	CancelSalesReturn(ctx context.Context, in *SalesReturnTransition, actorID int) (*SalesReturn, error)
	GetSalesReturn(ctx context.Context, id int) (*SalesReturn, error)
	ListSalesReturns(ctx context.Context, filter SalesReturnFilter) ([]*SalesReturn, int, error)
}

func (uc *OperationalFactUsecase) CreateSalesReturn(ctx context.Context, in *SalesReturnCreate, actorID int) (*SalesReturn, error) {
	repo, ok := uc.salesReturnRepo()
	if !ok || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	normalized, hash, err := normalizeSalesReturnCreate(*in)
	if err != nil {
		return nil, err
	}
	return repo.CreateSalesReturn(ctx, &normalized, actorID, hash)
}

func (uc *OperationalFactUsecase) ApproveSalesReturn(ctx context.Context, in *SalesReturnTransition, actorID int) (*SalesReturn, error) {
	repo, ok := uc.salesReturnRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	return repo.ApproveSalesReturn(ctx, in, actorID)
}
func (uc *OperationalFactUsecase) ReceiveSalesReturn(ctx context.Context, in *SalesReturnTransition, actorID int) (*SalesReturn, error) {
	repo, ok := uc.salesReturnRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	return repo.ReceiveSalesReturn(ctx, in, actorID)
}
func (uc *OperationalFactUsecase) CancelSalesReturn(ctx context.Context, in *SalesReturnTransition, actorID int) (*SalesReturn, error) {
	repo, ok := uc.salesReturnRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 || strings.TrimSpace(in.Reason) == "" {
		return nil, ErrBadParam
	}
	return repo.CancelSalesReturn(ctx, in, actorID)
}
func (uc *OperationalFactUsecase) GetSalesReturn(ctx context.Context, id int) (*SalesReturn, error) {
	repo, ok := uc.salesReturnRepo()
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetSalesReturn(ctx, id)
}
func (uc *OperationalFactUsecase) ListSalesReturns(ctx context.Context, filter SalesReturnFilter) ([]*SalesReturn, int, error) {
	repo, ok := uc.salesReturnRepo()
	if !ok {
		return nil, 0, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	return repo.ListSalesReturns(ctx, filter)
}
func (uc *OperationalFactUsecase) salesReturnRepo() (SalesReturnRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := uc.repo.(SalesReturnRepo)
	return repo, ok
}

func normalizeSalesReturnCreate(in SalesReturnCreate) (SalesReturnCreate, string, error) {
	in.ReturnNo = strings.TrimSpace(in.ReturnNo)
	in.Reason = strings.TrimSpace(in.Reason)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.ReturnNo == "" || in.Reason == "" || in.IdempotencyKey == "" || len(in.IdempotencyKey) > 128 || in.ShipmentID <= 0 || len(in.Items) == 0 {
		return SalesReturnCreate{}, "", ErrBadParam
	}
	sort.Slice(in.Items, func(i, j int) bool { return in.Items[i].ShipmentItemID < in.Items[j].ShipmentItemID })
	seen := map[int]struct{}{}
	for i := range in.Items {
		if in.Items[i].ShipmentItemID <= 0 || !in.Items[i].Quantity.IsPositive() {
			return SalesReturnCreate{}, "", ErrBadParam
		}
		if _, exists := seen[in.Items[i].ShipmentItemID]; exists {
			return SalesReturnCreate{}, "", ErrBadParam
		}
		seen[in.Items[i].ShipmentItemID] = struct{}{}
		in.Items[i].Note = normalizeOptionalString(in.Items[i].Note)
	}
	payload := struct {
		ReturnNo   string                  `json:"return_no"`
		ShipmentID int                     `json:"shipment_id"`
		Reason     string                  `json:"reason"`
		Items      []SalesReturnItemCreate `json:"items"`
	}{in.ReturnNo, in.ShipmentID, in.Reason, in.Items}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return SalesReturnCreate{}, "", err
	}
	sum := sha256.Sum256(encoded)
	return in, hex.EncodeToString(sum[:]), nil
}
