package data

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
	"server/internal/biz"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/predicate"
)

var _ biz.OutsourcingOrderSummaryRepo = (*outsourcingOrderRepo)(nil)

func (r *outsourcingOrderRepo) ListOutsourcingOrderSummary(ctx context.Context, filter biz.OutsourcingOrderSummaryFilter) ([]*biz.OutsourcingOrderSummaryRow, int, error) {
	query := r.data.postgres.OutsourcingOrderItem.Query()
	if filter.Keyword != "" {
		query.Where(outsourcingorderitem.Or(
			outsourcingorderitem.ProductOrderNoSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.ProductNoSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.ProductNameSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.MaterialCodeSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.MaterialNameSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.SkuCodeSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.ProcessingItemContainsFold(filter.Keyword),
			outsourcingorderitem.ProcessNameSnapshotContainsFold(filter.Keyword),
			outsourcingorderitem.HasOutsourcingOrderWith(outsourcingorder.Or(
				outsourcingorder.OutsourcingOrderNoContainsFold(filter.Keyword),
				outsourcingorder.SourceOrderNoContainsFold(filter.Keyword),
				func(s *sql.Selector) {
					s.Where(sql.Or(
						sqljson.StringContains(outsourcingorder.FieldSupplierSnapshot, filter.Keyword, sqljson.Path("name")),
						sqljson.StringContains(outsourcingorder.FieldSupplierSnapshot, filter.Keyword, sqljson.Path("short_name")),
					))
				},
			)),
		))
	}
	if filter.ProcessID > 0 {
		query.Where(outsourcingorderitem.ProcessID(filter.ProcessID))
	}
	orderPredicates := []predicate.OutsourcingOrder{}
	if filter.SupplierID > 0 {
		orderPredicates = append(orderPredicates, outsourcingorder.SupplierID(filter.SupplierID))
	}
	if filter.LifecycleStatus != "" {
		orderPredicates = append(orderPredicates, outsourcingorder.LifecycleStatus(filter.LifecycleStatus))
	} else if statuses := biz.LifecycleStatusesForScope(filter.LifecycleScope,
		[]string{biz.OutsourcingOrderStatusDraft, biz.OutsourcingOrderStatusSubmitted, biz.OutsourcingOrderStatusConfirmed},
		[]string{biz.OutsourcingOrderStatusClosed, biz.OutsourcingOrderStatusCanceled}); len(statuses) > 0 {
		orderPredicates = append(orderPredicates, outsourcingorder.LifecycleStatusIn(statuses...))
	}
	if filter.DateField == "expected_return_date" {
		// An explicit line date overrides the contract's default date.
		if filter.DateFrom != nil {
			query.Where(outsourcingorderitem.Or(outsourcingorderitem.ExpectedReturnDateGTE(*filter.DateFrom),
				outsourcingorderitem.And(outsourcingorderitem.ExpectedReturnDateIsNil(), outsourcingorderitem.HasOutsourcingOrderWith(outsourcingorder.ExpectedReturnDateGTE(*filter.DateFrom)))))
		}
		if filter.DateTo != nil {
			query.Where(outsourcingorderitem.Or(outsourcingorderitem.ExpectedReturnDateLTE(*filter.DateTo),
				outsourcingorderitem.And(outsourcingorderitem.ExpectedReturnDateIsNil(), outsourcingorderitem.HasOutsourcingOrderWith(outsourcingorder.ExpectedReturnDateLTE(*filter.DateTo)))))
		}
	} else {
		if filter.DateFrom != nil {
			orderPredicates = append(orderPredicates, outsourcingorder.OrderDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			orderPredicates = append(orderPredicates, outsourcingorder.OrderDateLTE(*filter.DateTo))
		}
	}
	if len(orderPredicates) > 0 {
		query.Where(outsourcingorderitem.HasOutsourcingOrderWith(orderPredicates...))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.WithOutsourcingOrder().
		Order(outsourcingorderitem.ByOutsourcingOrderField(outsourcingorder.FieldOrderDate, sql.OrderDesc()),
			outsourcingorderitem.ByOutsourcingOrderID(sql.OrderDesc()),
			sourceDocumentItemOrder(outsourcingorderitem.FieldDisplayOrder, outsourcingorderitem.FieldLineNo, outsourcingorderitem.FieldID)).
		Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	result := make([]*biz.OutsourcingOrderSummaryRow, 0, len(rows))
	for _, row := range rows {
		order, err := row.Edges.OutsourcingOrderOrErr()
		if err != nil {
			return nil, 0, err
		}
		item := entOutsourcingOrderItemToBiz(row)
		if item.ExpectedReturnDate == nil {
			item.ExpectedReturnDate = order.ExpectedReturnDate
		}
		result = append(result, &biz.OutsourcingOrderSummaryRow{Order: entOutsourcingOrderToBiz(order), Item: item})
	}
	return result, total, nil
}
