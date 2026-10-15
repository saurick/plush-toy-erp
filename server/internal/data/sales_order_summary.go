package data

import (
	"context"

	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
	"server/internal/biz"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
)

var _ biz.SalesOrderSummaryRepo = (*salesOrderRepo)(nil)

func (r *salesOrderRepo) ListSalesOrderSummary(ctx context.Context, filter biz.SalesOrderSummaryFilter) ([]*biz.SalesOrderSummaryRow, int, error) {
	query := r.data.postgres.SalesOrderItem.Query()
	if filter.Keyword != "" {
		query.Where(salesorderitem.Or(
			salesorderitem.RequestedProductNameContainsFold(filter.Keyword),
			salesorderitem.CustomerProductNoContainsFold(filter.Keyword),
			salesorderitem.ProductCodeSnapshotContainsFold(filter.Keyword),
			salesorderitem.ProductNameSnapshotContainsFold(filter.Keyword),
			salesorderitem.HasSalesOrderWith(salesorder.Or(
				salesorder.OrderNoContainsFold(filter.Keyword),
				salesorder.CustomerOrderNoContainsFold(filter.Keyword),
			)),
		))
	}
	orderPredicates := []predicate.SalesOrder{}
	if filter.Customer != "" {
		orderPredicates = append(orderPredicates, func(s *sql.Selector) {
			s.Where(sqljson.StringContains(salesorder.FieldCustomerSnapshot, filter.Customer, sqljson.Path("name")))
		})
	}
	if filter.SalesOwner != "" {
		orderPredicates = append(orderPredicates, salesorder.SalesOwnerContainsFold(filter.SalesOwner))
	}
	if filter.LifecycleStatus != "" {
		orderPredicates = append(orderPredicates, salesorder.LifecycleStatus(filter.LifecycleStatus))
	}
	if filter.DateField == "planned_delivery_date" {
		// A line's date takes precedence over the order's default delivery date.
		if filter.DateFrom != nil {
			query.Where(salesorderitem.Or(salesorderitem.PlannedDeliveryDateGTE(*filter.DateFrom),
				salesorderitem.And(salesorderitem.PlannedDeliveryDateIsNil(), salesorderitem.HasSalesOrderWith(salesorder.PlannedDeliveryDateGTE(*filter.DateFrom)))))
		}
		if filter.DateTo != nil {
			query.Where(salesorderitem.Or(salesorderitem.PlannedDeliveryDateLTE(*filter.DateTo),
				salesorderitem.And(salesorderitem.PlannedDeliveryDateIsNil(), salesorderitem.HasSalesOrderWith(salesorder.PlannedDeliveryDateLTE(*filter.DateTo)))))
		}
	} else {
		if filter.DateFrom != nil {
			orderPredicates = append(orderPredicates, salesorder.OrderDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			orderPredicates = append(orderPredicates, salesorder.OrderDateLTE(*filter.DateTo))
		}
	}
	if len(orderPredicates) > 0 {
		query.Where(salesorderitem.HasSalesOrderWith(orderPredicates...))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.WithSalesOrder().WithUnit().
		Order(salesorderitem.BySalesOrderField(salesorder.FieldOrderDate, sql.OrderDesc()), salesorderitem.BySalesOrderID(sql.OrderDesc()),
			sourceDocumentItemOrder(salesorderitem.FieldDisplayOrder, salesorderitem.FieldLineNo, salesorderitem.FieldID)).
		Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	items := entSalesOrderItemsToBiz(rows)
	if err := populateSalesOrderItemDisplay(ctx, r.data.postgres, items); err != nil {
		return nil, 0, err
	}
	result := make([]*biz.SalesOrderSummaryRow, 0, len(rows))
	for i, row := range rows {
		order, err := row.Edges.SalesOrderOrErr()
		if err != nil {
			return nil, 0, err
		}
		unit, err := row.Edges.UnitOrErr()
		if err != nil {
			return nil, 0, err
		}
		if items[i].PlannedDeliveryDate == nil {
			items[i].PlannedDeliveryDate = order.PlannedDeliveryDate
		}
		result = append(result, &biz.SalesOrderSummaryRow{Order: entSalesOrderToBiz(order), Item: items[i], UnitName: unit.Name})
	}
	return result, total, nil
}
