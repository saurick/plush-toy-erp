package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	corestatus "server/internal/core/status"
	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

const (
	SalesOrderStatusDraft     = corestatus.SalesOrderDraft
	SalesOrderStatusSubmitted = corestatus.SalesOrderSubmitted
	SalesOrderStatusActive    = corestatus.SalesOrderActive
	SalesOrderStatusClosed    = corestatus.SalesOrderClosed
	SalesOrderStatusCanceled  = corestatus.SalesOrderCanceled

	SalesOrderItemStatusOpen     = corestatus.SalesOrderItemOpen
	SalesOrderItemStatusClosed   = corestatus.SalesOrderItemClosed
	SalesOrderItemStatusCanceled = corestatus.SalesOrderItemCanceled
)

var (
	ErrSalesOrderNotFound     = errors.New("sales order not found")
	ErrSalesOrderItemNotFound = errors.New("sales order item not found")
	ErrProductNotFound        = errors.New("product not found")
	ErrProductInactive        = errors.New("product inactive")
	ErrUnitNotFound           = errors.New("unit not found")
	ErrUnitInactive           = errors.New("unit inactive")
	ErrCustomerInactive       = errors.New("customer inactive")
)

type SalesOrder struct {
	ID                  int
	OrderNo             string
	CustomerID          int
	CustomerOrderNo     *string
	CustomerSnapshot    map[string]any
	SalesOwner          *string
	ContactSnapshot     map[string]any
	PaymentMethod       *string
	PaymentTermDays     *int
	PriceConditionNote  *string
	OrderDate           time.Time
	PlannedDeliveryDate *time.Time
	LifecycleStatus     string
	Note                *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type SalesOrderItem struct {
	ID                  int
	SalesOrderID        int
	LineNo              int
	ProductID           int
	ProductSkuID        *int
	UnitID              int
	ProductCodeSnapshot *string
	ProductNameSnapshot *string
	ColorSnapshot       *string
	OrderedQuantity     decimal.Decimal
	UnitPrice           *decimal.Decimal
	Amount              *decimal.Decimal
	PlannedDeliveryDate *time.Time
	LineStatus          string
	Note                *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type SalesOrderMutation struct {
	OrderNo             string
	CustomerID          int
	CustomerOrderNo     *string
	CustomerSnapshot    map[string]any
	SalesOwner          *string
	ContactSnapshot     map[string]any
	PaymentMethod       *string
	PaymentTermDays     *int
	PriceConditionNote  *string
	OrderDate           time.Time
	PlannedDeliveryDate *time.Time
	Note                *string
}

type SalesOrderItemMutation struct {
	SalesOrderID        int
	LineNo              int
	ProductID           int
	ProductSkuID        *int
	UnitID              int
	ProductCodeSnapshot *string
	ProductNameSnapshot *string
	ColorSnapshot       *string
	OrderedQuantity     decimal.Decimal
	UnitPrice           *decimal.Decimal
	Amount              *decimal.Decimal
	PlannedDeliveryDate *time.Time
	Note                *string
}

type SalesOrderItemSaveMutation struct {
	ID int
	SalesOrderItemMutation
}

type SalesOrderWithItems struct {
	Order *SalesOrder
	Items []*SalesOrderItem
}

type SalesOrderFilter struct {
	Keyword         string
	CustomerID      int
	LifecycleStatus string
	DateField       string
	DateFrom        *time.Time
	DateTo          *time.Time
	SortBy          string
	SortDirection   string
	Limit           int
	Offset          int
}

type SalesOrderItemFilter struct {
	SalesOrderID int
	LineStatus   string
	Limit        int
	Offset       int
}

type SalesOrderRepo interface {
	CreateSalesOrder(ctx context.Context, in *SalesOrderMutation) (*SalesOrder, error)
	UpdateSalesOrder(ctx context.Context, id int, in *SalesOrderMutation) (*SalesOrder, error)
	GetSalesOrder(ctx context.Context, id int) (*SalesOrder, error)
	ListSalesOrders(ctx context.Context, filter SalesOrderFilter) ([]*SalesOrder, int, error)
	UpdateSalesOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*SalesOrder, error)

	AddSalesOrderItem(ctx context.Context, in *SalesOrderItemMutation) (*SalesOrderItem, error)
	UpdateSalesOrderItem(ctx context.Context, id int, in *SalesOrderItemMutation) (*SalesOrderItem, error)
	GetSalesOrderItem(ctx context.Context, id int) (*SalesOrderItem, error)
	UpdateSalesOrderItemStatus(ctx context.Context, id int, lineStatus string) (*SalesOrderItem, error)
	ListSalesOrderItems(ctx context.Context, filter SalesOrderItemFilter) ([]*SalesOrderItem, int, error)
	SaveSalesOrderWithItems(ctx context.Context, id int, order *SalesOrderMutation, items []*SalesOrderItemSaveMutation) (*SalesOrderWithItems, error)

	CustomerIsActive(ctx context.Context, id int) (bool, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)
	ProductSKUIsActiveForProduct(ctx context.Context, skuID int, productID int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
}

// SalesOrderCancellationActorRepo is the authenticated cancellation path used
// when compensation evidence must retain the operator who caused the change.
type SalesOrderCancellationActorRepo interface {
	CancelSalesOrderWithActor(ctx context.Context, id int, actorID int) (*SalesOrder, error)
}

type SalesOrderUsecase struct {
	repo SalesOrderRepo
}

func NewSalesOrderUsecase(repo SalesOrderRepo) *SalesOrderUsecase {
	return &SalesOrderUsecase{repo: repo}
}

func (uc *SalesOrderUsecase) CreateSalesOrder(ctx context.Context, in *SalesOrderMutation) (*SalesOrder, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSalesOrderMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateCustomerActive(ctx, normalized.CustomerID); err != nil {
		return nil, err
	}
	return uc.repo.CreateSalesOrder(ctx, &normalized)
}

func (uc *SalesOrderUsecase) UpdateSalesOrder(ctx context.Context, id int, in *SalesOrderMutation) (*SalesOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetSalesOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !corestatus.IsSalesOrderEditable(current.LifecycleStatus) {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSalesOrderMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateCustomerActive(ctx, normalized.CustomerID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateSalesOrder(ctx, id, &normalized)
}

func (uc *SalesOrderUsecase) GetSalesOrder(ctx context.Context, id int) (*SalesOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetSalesOrder(ctx, id)
}

func (uc *SalesOrderUsecase) ListSalesOrders(ctx context.Context, filter SalesOrderFilter) ([]*SalesOrder, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeSalesOrderFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListSalesOrders(ctx, normalized)
}

func (uc *SalesOrderUsecase) SubmitSalesOrder(ctx context.Context, id int) (*SalesOrder, error) {
	return uc.changeSalesOrderLifecycle(ctx, id, SalesOrderStatusSubmitted)
}

func (uc *SalesOrderUsecase) ActivateSalesOrder(ctx context.Context, id int) (*SalesOrder, error) {
	return uc.changeSalesOrderLifecycle(ctx, id, SalesOrderStatusActive)
}

func (uc *SalesOrderUsecase) CloseSalesOrder(ctx context.Context, id int) (*SalesOrder, error) {
	return uc.changeSalesOrderLifecycle(ctx, id, SalesOrderStatusClosed)
}

func (uc *SalesOrderUsecase) CancelSalesOrder(ctx context.Context, id int) (*SalesOrder, error) {
	return uc.changeSalesOrderLifecycle(ctx, id, SalesOrderStatusCanceled)
}

func (uc *SalesOrderUsecase) CancelSalesOrderWithActor(ctx context.Context, id int, actorID int) (*SalesOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetSalesOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !IsSalesOrderLifecycleTransitionAllowed(current.LifecycleStatus, SalesOrderStatusCanceled) {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(SalesOrderCancellationActorRepo)
	if !ok {
		return nil, ErrActorAwareCancellationUnavailable
	}
	return repo.CancelSalesOrderWithActor(ctx, id, actorID)
}

func (uc *SalesOrderUsecase) AddSalesOrderItem(ctx context.Context, in *SalesOrderItemMutation) (*SalesOrderItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSalesOrderItemMutation(*in)
	if err != nil {
		return nil, err
	}
	order, err := uc.openSalesOrder(ctx, normalized.SalesOrderID)
	if err != nil {
		return nil, err
	}
	if err := validateOptionalDateNotBefore(order.OrderDate, normalized.PlannedDeliveryDate); err != nil {
		return nil, err
	}
	if err := uc.validateProductAndUnitActive(ctx, normalized.ProductID, normalized.ProductSkuID, normalized.UnitID); err != nil {
		return nil, err
	}
	return uc.repo.AddSalesOrderItem(ctx, &normalized)
}

func (uc *SalesOrderUsecase) UpdateSalesOrderItem(ctx context.Context, id int, in *SalesOrderItemMutation) (*SalesOrderItem, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetSalesOrderItem(ctx, id)
	if err != nil {
		return nil, err
	}
	if current.LineStatus == SalesOrderItemStatusCanceled || current.LineStatus == SalesOrderItemStatusClosed {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSalesOrderItemMutation(*in)
	if err != nil {
		return nil, err
	}
	order, err := uc.openSalesOrder(ctx, normalized.SalesOrderID)
	if err != nil {
		return nil, err
	}
	if err := validateOptionalDateNotBefore(order.OrderDate, normalized.PlannedDeliveryDate); err != nil {
		return nil, err
	}
	if err := uc.validateProductAndUnitActive(ctx, normalized.ProductID, normalized.ProductSkuID, normalized.UnitID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateSalesOrderItem(ctx, id, &normalized)
}

func (uc *SalesOrderUsecase) RemoveSalesOrderItem(ctx context.Context, id int) (*SalesOrderItem, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetSalesOrderItem(ctx, id)
	if err != nil {
		return nil, err
	}
	if current.LineStatus == SalesOrderItemStatusCanceled {
		return current, nil
	}
	if current.LineStatus == SalesOrderItemStatusClosed {
		return nil, ErrBadParam
	}
	if err := uc.validateOpenSalesOrder(ctx, current.SalesOrderID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateSalesOrderItemStatus(ctx, id, SalesOrderItemStatusCanceled)
}

func (uc *SalesOrderUsecase) SaveSalesOrderWithItems(ctx context.Context, id int, order *SalesOrderMutation, items []*SalesOrderItemSaveMutation) (*SalesOrderWithItems, error) {
	if uc == nil || uc.repo == nil || id < 0 || order == nil {
		return nil, ErrBadParam
	}
	if id > 0 {
		current, err := uc.repo.GetSalesOrder(ctx, id)
		if err != nil {
			return nil, err
		}
		if !corestatus.IsSalesOrderEditable(current.LifecycleStatus) {
			return nil, ErrBadParam
		}
	}
	normalizedOrder, err := normalizeSalesOrderMutation(*order)
	if err != nil {
		return nil, err
	}
	if err := uc.validateCustomerActive(ctx, normalizedOrder.CustomerID); err != nil {
		return nil, err
	}

	normalizedItems := make([]*SalesOrderItemSaveMutation, 0, len(items))
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
			current, err := uc.repo.GetSalesOrderItem(ctx, item.ID)
			if err != nil {
				return nil, err
			}
			if current.SalesOrderID != id || current.LineStatus == SalesOrderItemStatusCanceled || current.LineStatus == SalesOrderItemStatusClosed {
				return nil, ErrBadParam
			}
		}
		mutation := item.SalesOrderItemMutation
		if id > 0 {
			if mutation.SalesOrderID != 0 && mutation.SalesOrderID != id {
				return nil, ErrBadParam
			}
			mutation.SalesOrderID = id
		} else {
			mutation.SalesOrderID = 0
		}
		normalizedItem, err := normalizeSalesOrderItemFields(mutation)
		if err != nil {
			return nil, err
		}
		if err := validateOptionalDateNotBefore(normalizedOrder.OrderDate, normalizedItem.PlannedDeliveryDate); err != nil {
			return nil, err
		}
		if err := uc.validateProductAndUnitActive(ctx, normalizedItem.ProductID, normalizedItem.ProductSkuID, normalizedItem.UnitID); err != nil {
			return nil, err
		}
		normalizedItems = append(normalizedItems, &SalesOrderItemSaveMutation{
			ID:                     item.ID,
			SalesOrderItemMutation: normalizedItem,
		})
	}

	return uc.repo.SaveSalesOrderWithItems(ctx, id, &normalizedOrder, normalizedItems)
}

func (uc *SalesOrderUsecase) ListSalesOrderItems(ctx context.Context, filter SalesOrderItemFilter) ([]*SalesOrderItem, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeSalesOrderItemFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListSalesOrderItems(ctx, normalized)
}

func (uc *SalesOrderUsecase) changeSalesOrderLifecycle(ctx context.Context, id int, next string) (*SalesOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 || !IsValidSalesOrderStatus(next) {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetSalesOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !IsSalesOrderLifecycleTransitionAllowed(current.LifecycleStatus, next) {
		return nil, ErrBadParam
	}
	if current.LifecycleStatus == next {
		return current, nil
	}
	return uc.repo.UpdateSalesOrderLifecycle(ctx, id, next)
}

func (uc *SalesOrderUsecase) validateCustomerActive(ctx context.Context, id int) error {
	active, err := uc.repo.CustomerIsActive(ctx, id)
	if err != nil {
		return err
	}
	if !active {
		return ErrCustomerInactive
	}
	return nil
}

func (uc *SalesOrderUsecase) validateOpenSalesOrder(ctx context.Context, id int) error {
	_, err := uc.openSalesOrder(ctx, id)
	return err
}

func (uc *SalesOrderUsecase) openSalesOrder(ctx context.Context, id int) (*SalesOrder, error) {
	order, err := uc.repo.GetSalesOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !corestatus.IsSalesOrderEditable(order.LifecycleStatus) {
		return nil, ErrBadParam
	}
	return order, nil
}

func (uc *SalesOrderUsecase) validateProductAndUnitActive(ctx context.Context, productID int, productSkuID *int, unitID int) error {
	productActive, err := uc.repo.ProductIsActive(ctx, productID)
	if err != nil {
		return err
	}
	if !productActive {
		return ErrProductInactive
	}
	if productSkuID != nil {
		active, err := uc.repo.ProductSKUIsActiveForProduct(ctx, *productSkuID, productID)
		if err != nil {
			return err
		}
		if !active {
			return ErrProductSKUInactive
		}
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

func normalizeSalesOrderMutation(in SalesOrderMutation) (SalesOrderMutation, error) {
	var err error
	in.OrderNo = strings.TrimSpace(in.OrderNo)
	in.CustomerOrderNo = normalizeOptionalString(in.CustomerOrderNo)
	in.SalesOwner = normalizeOptionalString(in.SalesOwner)
	in.PaymentMethod = normalizeOptionalString(in.PaymentMethod)
	in.PriceConditionNote = normalizeOptionalString(in.PriceConditionNote)
	in.Note = normalizeOptionalString(in.Note)
	if in.CustomerSnapshot == nil {
		in.CustomerSnapshot = map[string]any{}
	}
	in.ContactSnapshot, err = normalizeContactSnapshot(in.ContactSnapshot)
	if err != nil {
		return SalesOrderMutation{}, err
	}
	if in.OrderNo == "" || in.CustomerID <= 0 || in.OrderDate.IsZero() || (in.PaymentTermDays != nil && *in.PaymentTermDays < 0) {
		return SalesOrderMutation{}, ErrBadParam
	}
	if err := validateOptionalDateNotBefore(in.OrderDate, in.PlannedDeliveryDate); err != nil {
		return SalesOrderMutation{}, err
	}
	return in, nil
}

func normalizeSalesOrderItemMutation(in SalesOrderItemMutation) (SalesOrderItemMutation, error) {
	in, err := normalizeSalesOrderItemFields(in)
	if err != nil {
		return SalesOrderItemMutation{}, err
	}
	if in.SalesOrderID <= 0 {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeSalesOrderItemFields(in SalesOrderItemMutation) (SalesOrderItemMutation, error) {
	in.ProductCodeSnapshot = normalizeOptionalString(in.ProductCodeSnapshot)
	in.ProductNameSnapshot = normalizeOptionalString(in.ProductNameSnapshot)
	in.ColorSnapshot = normalizeOptionalString(in.ColorSnapshot)
	in.Note = normalizeOptionalString(in.Note)
	if in.ProductSkuID != nil && *in.ProductSkuID <= 0 {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if in.SalesOrderID < 0 || in.LineNo <= 0 || in.ProductID <= 0 || in.UnitID <= 0 {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.OrderedQuantity); err != nil {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.UnitPrice); err != nil {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.Amount); err != nil {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	normalizedAmount, err := normalizeCalculatedLineAmount(in.OrderedQuantity, in.UnitPrice, in.Amount)
	if err != nil {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	in.Amount = normalizedAmount
	return in, nil
}

func normalizeSalesOrderFilter(in SalesOrderFilter) (SalesOrderFilter, error) {
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.LifecycleStatus = strings.ToLower(strings.TrimSpace(in.LifecycleStatus))
	in.DateField = strings.TrimSpace(in.DateField)
	in.SortBy = strings.TrimSpace(in.SortBy)
	in.SortDirection = strings.ToLower(strings.TrimSpace(in.SortDirection))
	if in.LifecycleStatus != "" && !IsValidSalesOrderStatus(in.LifecycleStatus) {
		return SalesOrderFilter{}, ErrBadParam
	}
	if in.CustomerID < 0 {
		return SalesOrderFilter{}, ErrBadParam
	}
	switch in.DateField {
	case "", "order_date", "planned_delivery_date":
	default:
		return SalesOrderFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = "order_date"
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return SalesOrderFilter{}, ErrBadParam
	}
	switch in.SortBy {
	case "":
		in.SortBy = "updated_at"
	case "order_date", "planned_delivery_date", "updated_at":
	default:
		return SalesOrderFilter{}, ErrBadParam
	}
	switch in.SortDirection {
	case "":
		in.SortDirection = "desc"
	case "asc", "desc":
	default:
		return SalesOrderFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func normalizeSalesOrderItemFilter(in SalesOrderItemFilter) (SalesOrderItemFilter, error) {
	in.LineStatus = strings.ToLower(strings.TrimSpace(in.LineStatus))
	if in.SalesOrderID <= 0 {
		return SalesOrderItemFilter{}, ErrBadParam
	}
	if in.LineStatus != "" && !IsValidSalesOrderItemStatus(in.LineStatus) {
		return SalesOrderItemFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func IsValidSalesOrderStatus(value string) bool {
	return corestatus.IsSalesOrderStatus(value)
}

func IsValidSalesOrderItemStatus(value string) bool {
	return corestatus.IsSalesOrderItemStatus(value)
}

func IsSalesOrderLifecycleTransitionAllowed(current string, next string) bool {
	return corestatus.CanChangeSalesOrderLifecycle(current, next)
}

func isSalesOrderSettled(status string) bool {
	return corestatus.IsSalesOrderSettled(status)
}
