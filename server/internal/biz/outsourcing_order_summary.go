package biz

import "context"

// Summary rows project existing contract lines; they do not own business facts.
type OutsourcingOrderSummaryFilter struct {
	OutsourcingOrderFilter
	ProcessID int
}

type OutsourcingOrderSummaryRow struct {
	Order *OutsourcingOrder
	Item  *OutsourcingOrderItem
}

type OutsourcingOrderSummaryRepo interface {
	ListOutsourcingOrderSummary(context.Context, OutsourcingOrderSummaryFilter) ([]*OutsourcingOrderSummaryRow, int, error)
}

func (uc *OutsourcingOrderUsecase) ListOutsourcingOrderSummary(ctx context.Context, filter OutsourcingOrderSummaryFilter) ([]*OutsourcingOrderSummaryRow, int, error) {
	if uc == nil || uc.repo == nil || filter.ProcessID < 0 || filter.Limit < 1 || filter.Limit > 200 || filter.Offset < 0 || filter.Offset > 10000000 {
		return nil, 0, ErrBadParam
	}
	repo, ok := uc.repo.(OutsourcingOrderSummaryRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	var err error
	filter.OutsourcingOrderFilter, err = normalizeOutsourcingOrderFilter(filter.OutsourcingOrderFilter)
	if err != nil || len([]rune(filter.Keyword)) > 100 {
		return nil, 0, ErrBadParam
	}
	return repo.ListOutsourcingOrderSummary(ctx, filter)
}
