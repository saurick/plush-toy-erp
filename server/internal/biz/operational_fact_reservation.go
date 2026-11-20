package biz

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
)

type StockReservation struct {
	ID               int
	ReservationNo    string
	Status           string
	SalesOrderID     *int
	SalesOrderItemID *int
	SalesOrderNo     *string
	SalesOrderLineNo *int
	ProductID        int
	ProductSkuID     *int
	ProductCode      string
	ProductName      string
	ProductSkuCode   *string
	ProductSkuName   *string
	WarehouseID      int
	WarehouseCode    string
	WarehouseName    string
	UnitID           int
	UnitCode         string
	UnitName         string
	LotID            *int
	LotNo            *string
	Quantity         decimal.Decimal
	IdempotencyKey   string
	ReservedAt       time.Time
	ReleasedAt       *time.Time
	ConsumedAt       *time.Time
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type StockReservationCreate struct {
	ReservationNo       string
	SalesOrderID        *int
	SalesOrderItemID    *int
	ProductID           int
	ProductSkuID        *int
	WarehouseID         int
	UnitID              int
	LotID               *int
	Quantity            decimal.Decimal
	IdempotencyKey      string
	ReservedAt          time.Time
	ReservedAtSpecified bool
	Note                *string
}

// StockReservationFromSalesOrderCreate contains only operator-owned fields.
// Product, SKU and unit are resolved from the locked sales-order item by the
// repository transaction.
type StockReservationFromSalesOrderCreate struct {
	ReservationNo       string
	SalesOrderID        int
	SalesOrderItemID    int
	WarehouseID         int
	LotID               *int
	Quantity            decimal.Decimal
	IdempotencyKey      string
	ReservedAt          time.Time
	ReservedAtSpecified bool
	Note                *string
}

type StockReservationRepo interface {
	StockReservationReadRepo
	CreateStockReservation(ctx context.Context, in *StockReservationCreate) (*StockReservation, error)
	CreateStockReservationFromSalesOrder(ctx context.Context, in *StockReservationFromSalesOrderCreate) (*StockReservation, error)
	ReleaseStockReservation(ctx context.Context, id int) (*StockReservation, error)
	ListStockReservations(ctx context.Context, filter OperationalFactFilter) ([]*StockReservation, int, error)
}

// StockReservationReadScope keeps the list endpoint's readable business
// references inside the caller's effective permissions. Raw IDs remain part of
// the stable API contract, but they are not a substitute for readable labels.
type StockReservationReadScope struct {
	IncludeSalesOrderReferences bool
	IncludeInventoryReferences  bool
}

// StockReservationReadRepo requires permission-scoped reference projections
// for every reservation list exposed by the usecase.
type StockReservationReadRepo interface {
	ListStockReservationsForAccess(ctx context.Context, filter OperationalFactFilter, scope StockReservationReadScope) ([]*StockReservation, int, error)
}

func (uc *OperationalFactUsecase) CreateStockReservation(ctx context.Context, in *StockReservationCreate) (*StockReservation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeStockReservationCreate(in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateSalesLineReferences(ctx, normalized.SalesOrderItemID, normalized.ProductID, normalized.ProductSkuID, normalized.UnitID, normalized.WarehouseID); err != nil {
		return nil, err
	}
	return uc.repo.CreateStockReservation(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateStockReservationFromSalesOrder(ctx context.Context, in *StockReservationFromSalesOrderCreate) (*StockReservation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeStockReservationFromSalesOrderCreate(in)
	if err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	return uc.repo.CreateStockReservationFromSalesOrder(ctx, normalized)
}

func (uc *OperationalFactUsecase) ReleaseStockReservation(ctx context.Context, id int) (*StockReservation, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ReleaseStockReservation(ctx, id)
}

func (uc *OperationalFactUsecase) ListStockReservations(ctx context.Context, filter OperationalFactFilter) ([]*StockReservation, int, error) {
	return uc.ListStockReservationsForAccess(ctx, filter, StockReservationReadScope{
		IncludeSalesOrderReferences: true,
		IncludeInventoryReferences:  true,
	})
}

func (uc *OperationalFactUsecase) ListStockReservationsForAccess(ctx context.Context, filter OperationalFactFilter, scope StockReservationReadScope) ([]*StockReservation, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeStockReservationFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListStockReservationsForAccess(ctx, normalized, scope)
}

var stockReservationStatuses = map[string]struct{}{
	StockReservationStatusActive:    {},
	StockReservationStatusReleased:  {},
	StockReservationStatusConsumed:  {},
	StockReservationStatusCancelled: {},
}
