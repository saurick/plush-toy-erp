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
	if filter.CustomerID > 0 {
		orderPredicates = append(orderPredicates, salesorder.CustomerID(filter.CustomerID))
	}
	if filter.Customer != "" {
		orderPredicates = append(orderPredicates, func(s *sql.Selector) {
			s.Where(sqljson.StringContains(salesorder.FieldCustomerSnapshot, filter.Customer, sqljson.Path("name")))
		})
	}
	if filter.SalesOwner != "" {
		orderPredicates = append(orderPredicates, salesorder.SalesOwnerContainsFold(filter.SalesOwner))
	}
	if filter.SalesOwnerName != "" {
		orderPredicates = append(orderPredicates, salesorder.SalesOwnerEQ(filter.SalesOwnerName))
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

func (r *salesOrderRepo) ListSalesOrderSummaryFilterOptions(ctx context.Context) (result *biz.SalesOrderSummaryOptions, err error) {
	// Keep historical names searchable while selecting one stable customer identity.
	rows, err := r.data.postgres.QueryContext(ctx, `SELECT DISTINCT c.id, c.name, c.code, COALESCE(o.customer_snapshot->>'name', '') AS snapshot_name
		FROM sales_orders o JOIN customers c ON c.id = o.customer_id
		WHERE EXISTS (SELECT 1 FROM sales_order_items i WHERE i.sales_order_id = o.id)
		ORDER BY c.name, c.id, snapshot_name`)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			result, err = nil, closeErr
		}
	}()
	var options biz.SalesOrderSummaryOptions
	for rows.Next() {
		var customer biz.SalesSummaryCustomerOption
		var historicalName string
		if err := rows.Scan(&customer.ID, &customer.Name, &customer.Code, &historicalName); err != nil {
			return nil, err
		}
		n := len(options.Customers)
		if n == 0 || options.Customers[n-1].ID != customer.ID {
			options.Customers = append(options.Customers, customer)
		}
		if historicalName != "" && historicalName != customer.Name {
			last := &options.Customers[len(options.Customers)-1]
			last.PreviousNames = append(last.PreviousNames, historicalName)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	options.SalesOwners, err = r.data.postgres.SalesOrder.Query().
		Where(salesorder.HasItems(), salesorder.SalesOwnerNEQ("")).
		Unique(true).Order(salesorder.BySalesOwner()).Select(salesorder.FieldSalesOwner).Strings(ctx)
	if err != nil {
		return nil, err
	}
	return &options, nil
}
