package biz

import (
	"context"
	"strings"
)

// The summary reads the same order lines as the source document, across orders.
type SalesOrderSummaryFilter struct {
	SalesOrderFilter
	Customer       string
	SalesOwner     string
	SalesOwnerName string
}

type SalesOrderSummaryRow struct {
	Order    *SalesOrder
	Item     *SalesOrderItem
	UnitName string
}

type SalesSummaryCustomerOption struct {
	ID            int
	Name          string
	Code          string
	PreviousNames []string
}

type SalesOrderSummaryOptions struct {
	Customers   []SalesSummaryCustomerOption
	SalesOwners []string
}

type SalesOrderSummaryRepo interface {
	ListSalesOrderSummaryFilterOptions(context.Context) (*SalesOrderSummaryOptions, error)
	ListSalesOrderSummary(context.Context, SalesOrderSummaryFilter) ([]*SalesOrderSummaryRow, int, error)
}

func (uc *SalesOrderUsecase) ListSalesOrderSummaryFilterOptions(ctx context.Context) (*SalesOrderSummaryOptions, error) {
	repo, ok := uc.repo.(SalesOrderSummaryRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.ListSalesOrderSummaryFilterOptions(ctx)
}

func (uc *SalesOrderUsecase) ListSalesOrderSummary(ctx context.Context, filter SalesOrderSummaryFilter) ([]*SalesOrderSummaryRow, int, error) {
	if uc == nil || uc.repo == nil || filter.Limit < 1 || filter.Limit > 200 || filter.Offset < 0 || filter.Offset > 10000000 {
		return nil, 0, ErrBadParam
	}
	repo, ok := uc.repo.(SalesOrderSummaryRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	filter.Customer = strings.TrimSpace(filter.Customer)
	filter.SalesOwner = strings.TrimSpace(filter.SalesOwner)
	filter.SalesOwnerName = strings.TrimSpace(filter.SalesOwnerName)
	var err error
	filter.SalesOrderFilter, err = normalizeSalesOrderFilter(filter.SalesOrderFilter)
	if err != nil || len([]rune(filter.Keyword)) > 100 || len([]rune(filter.Customer)) > 100 || len([]rune(filter.SalesOwner)) > 100 || len([]rune(filter.SalesOwnerName)) > 128 {
		return nil, 0, ErrBadParam
	}
	return repo.ListSalesOrderSummary(ctx, filter)
}
