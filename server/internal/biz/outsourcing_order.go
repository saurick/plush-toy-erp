package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

const (
	OutsourcingOrderStatusDraft     = "draft"
	OutsourcingOrderStatusSubmitted = "submitted"
	OutsourcingOrderStatusConfirmed = "confirmed"
	OutsourcingOrderStatusClosed    = "closed"
	OutsourcingOrderStatusCanceled  = "canceled"

	OutsourcingOrderItemStatusOpen     = "open"
	OutsourcingOrderItemStatusClosed   = "closed"
	OutsourcingOrderItemStatusCanceled = "canceled"
)

var (
	ErrOutsourcingOrderNotFound     = errors.New("outsourcing order not found")
	ErrOutsourcingOrderItemNotFound = errors.New("outsourcing order item not found")
	ErrProcessInactive              = errors.New("process inactive")
	ErrProcessNotOutsourcingEnabled = errors.New("process is not outsourcing enabled")
)

type OutsourcingOrder struct {
	ID                    int
	OutsourcingOrderNo    string
	SupplierID            int
	SupplierSnapshot      map[string]any
	ContractPartySnapshot map[string]any
	SourceOrderNo         *string
	SourceSalesOrderID    *int
	OrderDate             time.Time
	ExpectedReturnDate    *time.Time
	LifecycleStatus       string
	Note                  *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type OutsourcingOrderItem struct {
	ID                      int
	OutsourcingOrderID      int
	LineNo                  int
	ProductID               int
	ProcessID               int
	UnitID                  int
	ProductNoSnapshot       *string
	ProductOrderNoSnapshot  *string
	ProductNameSnapshot     *string
	ProcessNameSnapshot     *string
	ProcessCategorySnapshot *string
	UnitNameSnapshot        *string
	OutsourcingQuantity     decimal.Decimal
	UnitPrice               *decimal.Decimal
	Amount                  *decimal.Decimal
	ExpectedReturnDate      *time.Time
	LineStatus              string
	Note                    *string
	CreatedAt               time.Time
	UpdatedAt               time.Time
}

type OutsourcingOrderMutation struct {
	OutsourcingOrderNo    string
	SupplierID            int
	SupplierSnapshot      map[string]any
	ContractPartySnapshot map[string]any
	SourceOrderNo         *string
	SourceSalesOrderID    *int
	OrderDate             time.Time
	ExpectedReturnDate    *time.Time
	Note                  *string
}

type OutsourcingOrderItemMutation struct {
	OutsourcingOrderID      int
	LineNo                  int
	ProductID               int
	ProcessID               int
	UnitID                  int
	ProductNoSnapshot       *string
	ProductOrderNoSnapshot  *string
	ProductNameSnapshot     *string
	ProcessNameSnapshot     *string
	ProcessCategorySnapshot *string
	UnitNameSnapshot        *string
	OutsourcingQuantity     decimal.Decimal
	UnitPrice               *decimal.Decimal
	Amount                  *decimal.Decimal
	ExpectedReturnDate      *time.Time
	Note                    *string
}

type OutsourcingOrderItemSaveMutation struct {
	ID int
	OutsourcingOrderItemMutation
}

type OutsourcingOrderWithItems struct {
	Order *OutsourcingOrder
	Items []*OutsourcingOrderItem
}

type OutsourcingOrderFilter struct {
	Keyword         string
	SupplierID      int
	LifecycleStatus string
	DateField       string
	DateFrom        *time.Time
	DateTo          *time.Time
	SortBy          string
	SortDirection   string
	Limit           int
	Offset          int
}

type OutsourcingOrderItemFilter struct {
	OutsourcingOrderID int
	LineStatus         string
	Limit              int
	Offset             int
}

type OutsourcingOrderRepo interface {
	GetOutsourcingOrder(ctx context.Context, id int) (*OutsourcingOrder, error)
	ListOutsourcingOrders(ctx context.Context, filter OutsourcingOrderFilter) ([]*OutsourcingOrder, int, error)
	UpdateOutsourcingOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*OutsourcingOrder, error)
	SaveOutsourcingOrderWithItems(ctx context.Context, id int, order *OutsourcingOrderMutation, items []*OutsourcingOrderItemSaveMutation) (*OutsourcingOrderWithItems, error)
	ListOutsourcingOrderItems(ctx context.Context, filter OutsourcingOrderItemFilter) ([]*OutsourcingOrderItem, int, error)
	GetOutsourcingOrderItem(ctx context.Context, id int) (*OutsourcingOrderItem, error)

	SupplierIsActive(ctx context.Context, id int) (bool, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
	ProcessIsUsableForOutsourcing(ctx context.Context, id int) (active bool, outsourcingEnabled bool, err error)
}

type OutsourcingOrderUsecase struct {
	repo OutsourcingOrderRepo
}

func NewOutsourcingOrderUsecase(repo OutsourcingOrderRepo) *OutsourcingOrderUsecase {
	return &OutsourcingOrderUsecase{repo: repo}
}

func (uc *OutsourcingOrderUsecase) GetOutsourcingOrder(ctx context.Context, id int) (*OutsourcingOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetOutsourcingOrder(ctx, id)
}

func (uc *OutsourcingOrderUsecase) ListOutsourcingOrders(ctx context.Context, filter OutsourcingOrderFilter) ([]*OutsourcingOrder, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeOutsourcingOrderFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListOutsourcingOrders(ctx, normalized)
}

func (uc *OutsourcingOrderUsecase) SaveOutsourcingOrderWithItems(ctx context.Context, id int, order *OutsourcingOrderMutation, items []*OutsourcingOrderItemSaveMutation) (*OutsourcingOrderWithItems, error) {
	if uc == nil || uc.repo == nil || id < 0 || order == nil {
		return nil, ErrBadParam
	}
	if id > 0 {
		current, err := uc.repo.GetOutsourcingOrder(ctx, id)
		if err != nil {
			return nil, err
		}
		if isOutsourcingOrderSettled(current.LifecycleStatus) {
			return nil, ErrBadParam
		}
	}
	normalizedOrder, err := normalizeOutsourcingOrderMutation(*order)
	if err != nil {
		return nil, err
	}
	if err := uc.validateSupplierActive(ctx, normalizedOrder.SupplierID); err != nil {
		return nil, err
	}

	normalizedItems := make([]*OutsourcingOrderItemSaveMutation, 0, len(items))
	seenIDs := map[int]struct{}{}
	for _, item := range items {
		if item == nil || item.ID < 0 {
			return nil, ErrBadParam
		}
		if id == 0 && item.ID > 0 {
			return nil, ErrBadParam
		}
		if item.ID > 0 {
			if _, ok := seenIDs[item.ID]; ok {
				return nil, ErrBadParam
			}
			seenIDs[item.ID] = struct{}{}
			current, err := uc.repo.GetOutsourcingOrderItem(ctx, item.ID)
			if err != nil {
				return nil, err
			}
			if current.OutsourcingOrderID != id || current.LineStatus != OutsourcingOrderItemStatusOpen {
				return nil, ErrBadParam
			}
		}
		mutation := item.OutsourcingOrderItemMutation
		if id > 0 {
			if mutation.OutsourcingOrderID != 0 && mutation.OutsourcingOrderID != id {
				return nil, ErrBadParam
			}
			mutation.OutsourcingOrderID = id
		} else {
			mutation.OutsourcingOrderID = 0
		}
		normalizedItem, err := normalizeOutsourcingOrderItemFields(mutation)
		if err != nil {
			return nil, err
		}
		if err := validateOptionalDateNotBefore(normalizedOrder.OrderDate, normalizedItem.ExpectedReturnDate); err != nil {
			return nil, err
		}
		if err := uc.validateProductProcessAndUnit(ctx, normalizedItem.ProductID, normalizedItem.ProcessID, normalizedItem.UnitID); err != nil {
			return nil, err
		}
		normalizedItems = append(normalizedItems, &OutsourcingOrderItemSaveMutation{
			ID:                           item.ID,
			OutsourcingOrderItemMutation: normalizedItem,
		})
	}

	return uc.repo.SaveOutsourcingOrderWithItems(ctx, id, &normalizedOrder, normalizedItems)
}

func (uc *OutsourcingOrderUsecase) SubmitOutsourcingOrder(ctx context.Context, id int) (*OutsourcingOrder, error) {
	return uc.changeOutsourcingOrderLifecycle(ctx, id, OutsourcingOrderStatusSubmitted)
}

func (uc *OutsourcingOrderUsecase) ConfirmOutsourcingOrder(ctx context.Context, id int) (*OutsourcingOrder, error) {
	return uc.changeOutsourcingOrderLifecycle(ctx, id, OutsourcingOrderStatusConfirmed)
}

func (uc *OutsourcingOrderUsecase) CloseOutsourcingOrder(ctx context.Context, id int) (*OutsourcingOrder, error) {
	return uc.changeOutsourcingOrderLifecycle(ctx, id, OutsourcingOrderStatusClosed)
}

func (uc *OutsourcingOrderUsecase) CancelOutsourcingOrder(ctx context.Context, id int) (*OutsourcingOrder, error) {
	return uc.changeOutsourcingOrderLifecycle(ctx, id, OutsourcingOrderStatusCanceled)
}

func (uc *OutsourcingOrderUsecase) ListOutsourcingOrderItems(ctx context.Context, filter OutsourcingOrderItemFilter) ([]*OutsourcingOrderItem, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeOutsourcingOrderItemFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListOutsourcingOrderItems(ctx, normalized)
}

func (uc *OutsourcingOrderUsecase) changeOutsourcingOrderLifecycle(ctx context.Context, id int, next string) (*OutsourcingOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 || !IsValidOutsourcingOrderStatus(next) {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetOutsourcingOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !IsOutsourcingOrderLifecycleTransitionAllowed(current.LifecycleStatus, next) {
		return nil, ErrBadParam
	}
	if current.LifecycleStatus == next {
		return current, nil
	}
	return uc.repo.UpdateOutsourcingOrderLifecycle(ctx, id, next)
}

func (uc *OutsourcingOrderUsecase) validateSupplierActive(ctx context.Context, id int) error {
	active, err := uc.repo.SupplierIsActive(ctx, id)
	if err != nil {
		return err
	}
	if !active {
		return ErrSupplierInactive
	}
	return nil
}

func (uc *OutsourcingOrderUsecase) validateProductProcessAndUnit(ctx context.Context, productID int, processID int, unitID int) error {
	productActive, err := uc.repo.ProductIsActive(ctx, productID)
	if err != nil {
		return err
	}
	if !productActive {
		return ErrProductInactive
	}
	processActive, processOutsourcingEnabled, err := uc.repo.ProcessIsUsableForOutsourcing(ctx, processID)
	if err != nil {
		return err
	}
	if !processActive {
		return ErrProcessInactive
	}
	if !processOutsourcingEnabled {
		return ErrProcessNotOutsourcingEnabled
	}
	unitActive, err := uc.repo.UnitIsActive(ctx, unitID)
	if err != nil {
		return err
	}
	if !unitActive {
		return ErrUnitInactive
	}
	return nil
}

func normalizeOutsourcingOrderMutation(in OutsourcingOrderMutation) (OutsourcingOrderMutation, error) {
	in.OutsourcingOrderNo = strings.TrimSpace(in.OutsourcingOrderNo)
	in.SourceOrderNo = normalizeOptionalString(in.SourceOrderNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.SupplierSnapshot == nil {
		in.SupplierSnapshot = map[string]any{}
	}
	if in.ContractPartySnapshot == nil {
		in.ContractPartySnapshot = map[string]any{}
	}
	if in.OutsourcingOrderNo == "" || in.SupplierID <= 0 || in.OrderDate.IsZero() {
		return OutsourcingOrderMutation{}, ErrBadParam
	}
	if err := validateOptionalDateNotBefore(in.OrderDate, in.ExpectedReturnDate); err != nil {
		return OutsourcingOrderMutation{}, err
	}
	if in.SourceSalesOrderID != nil && *in.SourceSalesOrderID <= 0 {
		return OutsourcingOrderMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeOutsourcingOrderItemFields(in OutsourcingOrderItemMutation) (OutsourcingOrderItemMutation, error) {
	in.ProductNoSnapshot = normalizeOptionalString(in.ProductNoSnapshot)
	in.ProductOrderNoSnapshot = normalizeOptionalString(in.ProductOrderNoSnapshot)
	in.ProductNameSnapshot = normalizeOptionalString(in.ProductNameSnapshot)
	in.ProcessNameSnapshot = normalizeOptionalString(in.ProcessNameSnapshot)
	in.ProcessCategorySnapshot = normalizeOptionalString(in.ProcessCategorySnapshot)
	in.UnitNameSnapshot = normalizeOptionalString(in.UnitNameSnapshot)
	in.Note = normalizeOptionalString(in.Note)
	if in.OutsourcingOrderID < 0 || in.LineNo <= 0 || in.ProductID <= 0 || in.ProcessID <= 0 || in.UnitID <= 0 {
		return OutsourcingOrderItemMutation{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.OutsourcingQuantity); err != nil {
		return OutsourcingOrderItemMutation{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.UnitPrice); err != nil {
		return OutsourcingOrderItemMutation{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.Amount); err != nil {
		return OutsourcingOrderItemMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeOutsourcingOrderFilter(in OutsourcingOrderFilter) (OutsourcingOrderFilter, error) {
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.LifecycleStatus = strings.ToLower(strings.TrimSpace(in.LifecycleStatus))
	in.DateField = strings.TrimSpace(in.DateField)
	in.SortBy = strings.TrimSpace(in.SortBy)
	in.SortDirection = strings.ToLower(strings.TrimSpace(in.SortDirection))
	if in.LifecycleStatus != "" && !IsValidOutsourcingOrderStatus(in.LifecycleStatus) {
		return OutsourcingOrderFilter{}, ErrBadParam
	}
	if in.SupplierID < 0 {
		return OutsourcingOrderFilter{}, ErrBadParam
	}
	switch in.DateField {
	case "", "order_date", "expected_return_date":
	default:
		return OutsourcingOrderFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = "order_date"
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return OutsourcingOrderFilter{}, ErrBadParam
	}
	switch in.SortBy {
	case "":
		in.SortBy = "updated_at"
	case "order_date", "expected_return_date", "updated_at":
	default:
		return OutsourcingOrderFilter{}, ErrBadParam
	}
	switch in.SortDirection {
	case "":
		in.SortDirection = "desc"
	case "asc", "desc":
	default:
		return OutsourcingOrderFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func normalizeOutsourcingOrderItemFilter(in OutsourcingOrderItemFilter) (OutsourcingOrderItemFilter, error) {
	in.LineStatus = strings.ToLower(strings.TrimSpace(in.LineStatus))
	if in.OutsourcingOrderID <= 0 {
		return OutsourcingOrderItemFilter{}, ErrBadParam
	}
	if in.LineStatus != "" && !IsValidOutsourcingOrderItemStatus(in.LineStatus) {
		return OutsourcingOrderItemFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func IsValidOutsourcingOrderStatus(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case OutsourcingOrderStatusDraft, OutsourcingOrderStatusSubmitted, OutsourcingOrderStatusConfirmed, OutsourcingOrderStatusClosed, OutsourcingOrderStatusCanceled:
		return true
	default:
		return false
	}
}

func IsValidOutsourcingOrderItemStatus(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case OutsourcingOrderItemStatusOpen, OutsourcingOrderItemStatusClosed, OutsourcingOrderItemStatusCanceled:
		return true
	default:
		return false
	}
}

func IsOutsourcingOrderLifecycleTransitionAllowed(current string, next string) bool {
	current = strings.ToLower(strings.TrimSpace(current))
	next = strings.ToLower(strings.TrimSpace(next))
	if current == next {
		return true
	}
	switch current {
	case OutsourcingOrderStatusDraft:
		return next == OutsourcingOrderStatusSubmitted || next == OutsourcingOrderStatusCanceled
	case OutsourcingOrderStatusSubmitted:
		return next == OutsourcingOrderStatusConfirmed || next == OutsourcingOrderStatusCanceled
	case OutsourcingOrderStatusConfirmed:
		return next == OutsourcingOrderStatusClosed || next == OutsourcingOrderStatusCanceled
	default:
		return false
	}
}

func isOutsourcingOrderSettled(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case OutsourcingOrderStatusClosed, OutsourcingOrderStatusCanceled:
		return true
	default:
		return false
	}
}
