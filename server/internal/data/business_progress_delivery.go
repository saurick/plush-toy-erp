package data

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/shopspring/decimal"
	"server/internal/biz"
)

// Keep the record range on the parent order. A shipped line in an active
// multi-line order is still part of that order's delivery detail.
func progressDeliveryQuery(q biz.BusinessProgressQuery, sqlDialect string) (string, []any) {
	cte, args := progressCTE(q)
	bind := func(v any) string { args = append(args, v); return fmt.Sprintf("$%d", len(args)) }
	dueDate := progressDateSQL("z.due_at", sqlDialect)
	dateConditions := []string{"1=1"}
	if q.DateFrom != "" {
		dateConditions = append(dateConditions, dueDate+">="+bind(q.DateFrom))
	}
	if q.DateTo != "" {
		dateConditions = append(dateConditions, dueDate+"<="+bind(q.DateTo))
	}
	cte += ", base AS (" + progressBase(q) + "), line_values AS (" +
		`SELECT z.id,j.id AS sales_order_id,j.order_no,j.status,j.customer,z.line_status,z.line_no,
 COALESCE(z.customer_product_no,'') AS customer_product_no,z.product_label,COALESCE(z.product_id,0) AS product_id,
 z.unit_name,z.ordered_quantity,z.shipped_quantity,j.active,z.due_at,` + dueDate + ` AS due_date,
 CASE WHEN ` + strings.Join(dateConditions, " AND ") + ` THEN 1 ELSE 0 END AS in_date_range,
 CASE WHEN z.ordered_quantity>0 AND NOT EXISTS(SELECT 1 FROM shipment_mismatch x WHERE x.order_id=j.id)
 THEN 1 ELSE 0 END AS delivery_known
 FROM sales_delivery_lines z JOIN base j ON j.id=z.sales_order_id`
	if q.Keyword != "" {
		cte += " LEFT JOIN products p ON p.id=z.product_id"
	}
	cte += " WHERE " + progressScopeSQL(q, bind)
	if q.BlockedOnly {
		cte += " AND EXISTS(SELECT 1 FROM task_summary t WHERE t.view_key='orders' AND t.board_id=j.id AND t.blocked_tasks>0)"
	}
	if q.Owner != "" {
		cte += " AND " + progressOwnerMatch(q, bind(progressLikePattern(q.Owner)))
	}
	if q.Keyword != "" {
		key := bind(progressLikePattern(q.Keyword))
		cte += " AND (lower(j.order_no) LIKE " + key + " ESCAPE '\\' OR lower(j.customer) LIKE " + key + " ESCAPE '\\' OR " +
			progressIdentityMatch(q.View, key) + " OR " + progressOwnerMatch(q, key) + ")"
	}
	day, soon := progressDateWindow(q.SnapshotAt)
	dayArg, soonArg := bind(day), bind(soon)
	cte += `), delivery AS (
 SELECT *,CASE
 WHEN status='canceled' OR line_status='canceled' THEN 'canceled'
 WHEN delivery_known=0 THEN 'unknown'
 WHEN shipped_quantity>=ordered_quantity THEN 'delivered'
 WHEN status='closed' OR line_status='closed' THEN 'closed'
 WHEN due_date IS NULL THEN 'undated'
 WHEN due_date<` + dayArg + ` THEN 'overdue'
 WHEN due_date<=` + soonArg + ` THEN 'due_soon'
 ELSE 'open' END AS delivery_status FROM line_values
)`
	return cte, args
}

func progressDeliveryFilter(status string) string {
	switch status {
	case "all":
		return "in_date_range=1"
	case "undated":
		return "delivery_status='undated'"
	default:
		// The caller only supplies normalized delivery filters or the fixed facets.
		return "in_date_range=1 AND delivery_status='" + status + "'"
	}
}

func loadBusinessProgressDelivery(ctx context.Context, tx *sql.Tx, q biz.BusinessProgressQuery, dialect string, result *biz.BusinessProgressBoard) error {
	cte, args := progressDeliveryQuery(q, dialect)
	columns := []string{}
	for _, status := range []string{"all", "overdue", "due_soon", "undated", "closed", "unknown", "delivered", q.DeliveryStatus} {
		columns = append(columns, "COUNT(CASE WHEN "+progressDeliveryFilter(status)+" THEN 1 END)")
	}
	counts := &biz.BusinessProgressDeliveryCounts{}
	if err := tx.QueryRowContext(ctx, cte+" SELECT "+strings.Join(columns, ",")+" FROM delivery", args...).Scan(
		&result.Counts.Total, &result.Counts.Overdue, &result.Counts.DueSoon, &result.Counts.Undated,
		&counts.Closed, &counts.Unknown, &counts.Delivered, &result.Total,
	); err != nil {
		return err
	}
	result.Counts.Delivery = counts
	args = append(args, q.Limit, q.Offset)
	rows, err := tx.QueryContext(ctx, cte+` SELECT id,sales_order_id,line_no,order_no,status,customer,
 product_label,product_id,customer_product_no,CAST(due_date AS TEXT),unit_name,
 CAST(ordered_quantity AS TEXT),CAST(shipped_quantity AS TEXT),active,delivery_known,delivery_status
 FROM delivery WHERE `+progressDeliveryFilter(q.DeliveryStatus)+
		fmt.Sprintf(" ORDER BY %s LIMIT $%d OFFSET $%d", progressListOrder(q), len(args)-1, len(args)), args...)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		line := &biz.BusinessProgressLine{}
		row := &biz.BusinessProgressRow{View: "orders", Line: line, ProductCount: 1}
		var due sql.NullString
		var ordered, shipped string
		if err := rows.Scan(&row.ID, &line.OrderID, &line.LineNo, &row.OrderNo, &row.Status, &row.Customer,
			&row.Product, &row.ProductID, &line.CustomerProductNo, &due, &row.Unit, &ordered, &shipped,
			&row.Active, &row.DeliveryKnown, &line.DeliveryStatus,
		); err != nil {
			return err
		}
		row.DueDate = progressDate(due.String)
		row.Overdue, row.DueSoon = line.DeliveryStatus == "overdue", line.DeliveryStatus == "due_soon"
		orderQty, err := decimal.NewFromString(ordered)
		if err != nil {
			return err
		}
		orderedText := orderQty.String()
		row.OrderedQuantity = &orderedText
		if row.DeliveryKnown {
			shippedQty, err := decimal.NewFromString(shipped)
			if err != nil {
				return err
			}
			shippedText := shippedQty.String()
			row.ShippedQuantity = &shippedText
			if line.DeliveryStatus != "canceled" {
				remaining := decimal.Max(orderQty.Sub(shippedQty), decimal.Zero).String()
				line.RemainingQuantity = &remaining
			}
		}
		result.Rows = append(result.Rows, row)
	}
	return rows.Err()
}
