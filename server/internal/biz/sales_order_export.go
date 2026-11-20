package biz

import (
	"context"
	"errors"
	"time"
)

const (
	SalesOrderExportMaxRows     = 5000
	SalesOrderExportMaxBytes    = 8 << 20
	SalesOrderExportConcurrency = 2
	SalesOrderExportTimeout     = 10 * time.Second
)

var (
	ErrSalesOrderExportLimit   = errors.New("sales order export exceeds its result budget")
	ErrSalesOrderExportBusy    = errors.New("sales order export read slots are occupied")
	ErrSalesOrderExportTimeout = errors.New("sales order export read timed out")
)

type SalesOrderExportQuery struct {
	Filter SalesOrderFilter
	ID     int
}

type SalesOrderExportRepo interface {
	ExportSalesOrders(context.Context, SalesOrderExportQuery) ([]*SalesOrder, error)
}

// BeginSalesOrderExport admits a bounded export preparation. The caller must
// defer release until both snapshot reading and response preparation finish.
func (uc *SalesOrderUsecase) BeginSalesOrderExport(ctx context.Context) (context.Context, func(), error) {
	if err := ctx.Err(); err != nil {
		return ctx, nil, err
	}
	select {
	case uc.exportSlots <- struct{}{}:
		ctx, cancel := context.WithTimeout(ctx, SalesOrderExportTimeout)
		return ctx, func() { cancel(); <-uc.exportSlots }, nil
	default:
		return ctx, nil, ErrSalesOrderExportBusy
	}
}

func (uc *SalesOrderUsecase) ExportSalesOrders(ctx context.Context, query SalesOrderExportQuery) (orders []*SalesOrder, resultErr error) {
	ctx, finish := startBusinessTrace(ctx, "sales_order.export")
	defer func() { finish(resultErr) }()
	if uc == nil || uc.repo == nil || query.ID < 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(SalesOrderExportRepo)
	if !ok {
		return nil, ErrBadParam
	}
	filter, err := normalizeSalesOrderFilter(query.Filter)
	if err != nil {
		return nil, err
	}
	filter.Offset = 0
	query.Filter = filter
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	orders, err = repo.ExportSalesOrders(ctx, query)
	if err == nil && len(orders) > SalesOrderExportMaxRows {
		err = ErrSalesOrderExportLimit
	}
	if ctx.Err() != nil {
		err = ctx.Err()
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return nil, ErrSalesOrderExportTimeout
	}
	if err != nil {
		return nil, err
	}
	return orders, nil
}
