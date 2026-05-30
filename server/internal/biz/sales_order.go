package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	SalesOrderStatusDraft     = "draft"
	SalesOrderStatusSubmitted = "submitted"
	SalesOrderStatusActive    = "active"
	SalesOrderStatusClosed    = "closed"
	SalesOrderStatusCanceled  = "canceled"

	SalesOrderItemStatusOpen     = "open"
	SalesOrderItemStatusClosed   = "closed"
	SalesOrderItemStatusCanceled = "canceled"
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

var (
	salesOrderStatuses = map[string]struct{}{
		SalesOrderStatusDraft:     {},
		SalesOrderStatusSubmitted: {},
		SalesOrderStatusActive:    {},
		SalesOrderStatusClosed:    {},
		SalesOrderStatusCanceled:  {},
	}
	salesOrderItemStatuses = map[string]struct{}{
		SalesOrderItemStatusOpen:     {},
		SalesOrderItemStatusClosed:   {},
		SalesOrderItemStatusCanceled: {},
	}
)

type SalesOrder struct {
	ID                  int
	OrderNo             string
	CustomerID          int
	CustomerOrderNo     *string
	CustomerSnapshot    map[string]any
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
	OrderDate           time.Time
	PlannedDeliveryDate *time.Time
	Note                *string
}

type SalesOrderItemMutation struct {
	SalesOrderID        int
	LineNo              int
	ProductID           int
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

type SalesOrderFilter struct {
	Keyword         string
	CustomerID      int
	LifecycleStatus string
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

	CustomerIsActive(ctx context.Context, id int) (bool, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
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
	if isSalesOrderSettled(current.LifecycleStatus) {
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

func (uc *SalesOrderUsecase) AddSalesOrderItem(ctx context.Context, in *SalesOrderItemMutation) (*SalesOrderItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSalesOrderItemMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateOpenSalesOrder(ctx, normalized.SalesOrderID); err != nil {
		return nil, err
	}
	if err := uc.validateProductAndUnitActive(ctx, normalized.ProductID, normalized.UnitID); err != nil {
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
	if err := uc.validateOpenSalesOrder(ctx, normalized.SalesOrderID); err != nil {
		return nil, err
	}
	if err := uc.validateProductAndUnitActive(ctx, normalized.ProductID, normalized.UnitID); err != nil {
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
	order, err := uc.repo.GetSalesOrder(ctx, id)
	if err != nil {
		return err
	}
	if isSalesOrderSettled(order.LifecycleStatus) {
		return ErrBadParam
	}
	return nil
}

func (uc *SalesOrderUsecase) validateProductAndUnitActive(ctx context.Context, productID int, unitID int) error {
	productActive, err := uc.repo.ProductIsActive(ctx, productID)
	if err != nil {
		return err
	}
	if !productActive {
		return ErrProductInactive
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
	in.OrderNo = strings.TrimSpace(in.OrderNo)
	in.CustomerOrderNo = normalizeOptionalString(in.CustomerOrderNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.CustomerSnapshot == nil {
		in.CustomerSnapshot = map[string]any{}
	}
	if in.OrderNo == "" || in.CustomerID <= 0 || in.OrderDate.IsZero() {
		return SalesOrderMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeSalesOrderItemMutation(in SalesOrderItemMutation) (SalesOrderItemMutation, error) {
	in.ProductCodeSnapshot = normalizeOptionalString(in.ProductCodeSnapshot)
	in.ProductNameSnapshot = normalizeOptionalString(in.ProductNameSnapshot)
	in.ColorSnapshot = normalizeOptionalString(in.ColorSnapshot)
	in.Note = normalizeOptionalString(in.Note)
	if in.SalesOrderID <= 0 || in.LineNo <= 0 || in.ProductID <= 0 || in.UnitID <= 0 {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if !in.OrderedQuantity.IsPositive() {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if in.UnitPrice != nil && in.UnitPrice.IsNegative() {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	if in.Amount != nil && in.Amount.IsNegative() {
		return SalesOrderItemMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeSalesOrderFilter(in SalesOrderFilter) (SalesOrderFilter, error) {
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.LifecycleStatus = strings.ToLower(strings.TrimSpace(in.LifecycleStatus))
	if in.LifecycleStatus != "" && !IsValidSalesOrderStatus(in.LifecycleStatus) {
		return SalesOrderFilter{}, ErrBadParam
	}
	if in.CustomerID < 0 {
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
	_, ok := salesOrderStatuses[strings.ToLower(strings.TrimSpace(value))]
	return ok
}

func IsValidSalesOrderItemStatus(value string) bool {
	_, ok := salesOrderItemStatuses[strings.ToLower(strings.TrimSpace(value))]
	return ok
}

func IsSalesOrderLifecycleTransitionAllowed(current string, next string) bool {
	current = strings.ToLower(strings.TrimSpace(current))
	next = strings.ToLower(strings.TrimSpace(next))
	if current == next {
		return true
	}
	switch current {
	case SalesOrderStatusDraft:
		return next == SalesOrderStatusSubmitted || next == SalesOrderStatusCanceled
	case SalesOrderStatusSubmitted:
		return next == SalesOrderStatusActive || next == SalesOrderStatusCanceled
	case SalesOrderStatusActive:
		return next == SalesOrderStatusClosed || next == SalesOrderStatusCanceled
	default:
		return false
	}
}

func isSalesOrderSettled(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == SalesOrderStatusClosed || status == SalesOrderStatusCanceled
}
