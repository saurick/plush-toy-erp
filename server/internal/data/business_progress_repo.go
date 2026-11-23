package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

type businessProgressRepo struct{ data *Data }

func NewBusinessProgressRepo(data *Data) biz.BusinessProgressRepo {
	return &businessProgressRepo{data: data}
}

// Counts, rows and drill-down sections share one read snapshot. Aggregation is
// performed before pagination, without loading all source documents into Go.
func (r *businessProgressRepo) read(ctx context.Context, fn func(*stdsql.Tx) error) error {
	options := &stdsql.TxOptions{}
	if r.data.sqlDialect != dialect.SQLite {
		options.ReadOnly, options.Isolation = true, stdsql.LevelRepeatableRead
	}
	tx, err := r.data.sqldb.BeginTx(ctx, options)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if r.data.sqlDialect != dialect.SQLite {
		if _, err := tx.ExecContext(ctx, "SET LOCAL jit = off"); err != nil {
			return err
		}
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *businessProgressRepo) readProgress(ctx context.Context, q biz.BusinessProgressQuery, fn func(*stdsql.Tx) error) error {
	return r.read(ctx, func(tx *stdsql.Tx) error {
		// Aggregate pages must not repeatedly scan a whole task summary when fresh
		// data or derived source relations have underestimated cardinality. Keep
		// this planner policy inside the read transaction; keyed details retain
		// index-based nested loops. The shared snapshot owns the JIT policy.
		if q.ID == 0 && r.data.sqlDialect != dialect.SQLite {
			if _, err := tx.ExecContext(ctx, "SET LOCAL enable_nestloop = off"); err != nil {
				return err
			}
		}
		return fn(tx)
	})
}

func (r *businessProgressRepo) ListBusinessProgress(ctx context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressBoard, error) {
	result := &biz.BusinessProgressBoard{Rows: []*biz.BusinessProgressRow{}, SnapshotAt: q.SnapshotAt, Access: q.Access}
	err := r.readProgress(ctx, q, func(tx *stdsql.Tx) error {
		if q.Display == "lines" {
			return loadBusinessProgressDelivery(ctx, tx, q, r.data.sqlDialect, result)
		}
		cte, args := progressQuery(q, r.data.sqlDialect)
		err := tx.QueryRowContext(ctx, cte+progressCountsSQL(q), args...).
			Scan(&result.Counts.Total, &result.Counts.Overdue, &result.Counts.DueSoon, &result.Counts.Undated, &result.Counts.Blocked, &result.Counts.Unlinked, &result.Total)
		if err != nil {
			return err
		}
		result.Rows, err = loadBusinessProgressRows(ctx, tx, q, cte, args)
		return err
	})
	return result, err
}

func (r *businessProgressRepo) ListBusinessProgressOwners(ctx context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressOwnerOptions, error) {
	result := &biz.BusinessProgressOwnerOptions{Names: []string{}}
	err := r.readProgress(ctx, q, func(tx *stdsql.Tx) (err error) {
		cte, args := progressCTE(q)
		rows, err := tx.QueryContext(ctx, cte+" SELECT DISTINCT owners.name FROM ("+progressOwnerRowsSQL(q)+") owners ORDER BY owners.name", args...)
		if err != nil {
			return err
		}
		defer func() {
			if closeErr := rows.Close(); err == nil {
				err = closeErr
			}
		}()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				return err
			}
			result.Names = append(result.Names, name)
		}
		return rows.Err()
	})
	return result, err
}

func progressListOrder(q biz.BusinessProgressQuery) string {
	field := map[string]string{
		biz.BusinessProgressSortOrderNo:   "order_no",
		biz.BusinessProgressSortDueDate:   "due_date",
		biz.BusinessProgressSortProduct:   "product_label",
		biz.BusinessProgressSortRemaining: "remaining_quantity",
		biz.BusinessProgressSortCompleted: "completed_quantity",
	}[q.SortBy]
	if field != "" {
		direction := " ASC"
		if q.SortDirection == "desc" {
			direction = " DESC"
		}
		prefix := ""
		if q.SortBy == biz.BusinessProgressSortRemaining || q.SortBy == biz.BusinessProgressSortCompleted {
			if q.Display == "lines" {
				field = "CASE WHEN delivery_status NOT IN ('unknown','canceled') THEN remaining_quantity END"
			}
			prefix = "CASE WHEN " + field + " IS NULL THEN 1 ELSE 0 END, unit_name,"
		}
		if q.Display == "lines" {
			return prefix + field + direction + " NULLS LAST,order_no,line_no,id"
		}
		return prefix + field + direction + " NULLS LAST,id DESC"
	}
	if q.Display == "lines" {
		return `CASE delivery_status
 WHEN 'overdue' THEN 0 WHEN 'closed' THEN 1 WHEN 'due_soon' THEN 2
 WHEN 'undated' THEN 3 WHEN 'unknown' THEN 4 WHEN 'open' THEN 5 WHEN 'delivered' THEN 6 ELSE 7 END,
 due_at,order_no,line_no,id`
	}
	return "active DESC,blocked DESC,overdue DESC,CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,due_at,id DESC"
}

func loadBusinessProgressRows(ctx context.Context, tx *stdsql.Tx, q biz.BusinessProgressQuery, cte string, args []any) (out []*biz.BusinessProgressRow, err error) {
	args = append(append([]any{}, args...), q.Limit, q.Offset)
	query := cte + ` SELECT id,order_no,status,customer,product,product_count,linked_product_count,product_id,sales_owner,CAST(due_date AS TEXT),CAST(updated_at AS TEXT),
 active,unlinked,unit_name,CASE WHEN delivery_known=1 THEN delivered_lines END,CAST(remaining_quantity AS TEXT),CAST(ordered_quantity AS TEXT),CAST(shipped_quantity AS TEXT),delivery_known,engineering_total,engineering_ready,
 overdue,due_soon,blocked,production_orders,production_closed,material_total,material_pending,in_progress_batches,outsourced_batches,
 waiting_batches,rejected_batches,planned_batches,open_tasks,blocked_tasks,unassigned_tasks,attention_task_id,attention_task,
 attention_reason,attention_owner,attention_role,CAST(completed_quantity AS TEXT),current_operation,operation_count FROM filtered` + (" WHERE " + progressFilterCondition(q)) +
		fmt.Sprintf(" ORDER BY %s LIMIT $%d OFFSET $%d", progressListOrder(q), len(args)-1, len(args))
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); err == nil {
			err = closeErr
		}
	}()
	out = []*biz.BusinessProgressRow{}
	for rows.Next() {
		progressRow := &biz.BusinessProgressRow{View: q.View}
		var due, updated, ordered, shipped, completed, remaining stdsql.NullString
		err = rows.Scan(&progressRow.ID, &progressRow.OrderNo, &progressRow.Status, &progressRow.Customer, &progressRow.Product, &progressRow.ProductCount, &progressRow.LinkedProductCount, &progressRow.ProductID, &progressRow.SalesOwner, &due, &updated,
			&progressRow.Active, &progressRow.Unlinked, &progressRow.Unit, &progressRow.DeliveredLineCount, &remaining, &ordered, &shipped, &progressRow.DeliveryKnown, &progressRow.EngineeringTotal, &progressRow.EngineeringReady,
			&progressRow.Overdue, &progressRow.DueSoon, &progressRow.Blocked, &progressRow.ProductionOrders, &progressRow.ProductionClosed, &progressRow.MaterialTotal, &progressRow.MaterialPending,
			&progressRow.InProgressBatches, &progressRow.OutsourcedBatches, &progressRow.WaitingBatches, &progressRow.RejectedBatches, &progressRow.PlannedBatches, &progressRow.OpenTasks, &progressRow.BlockedTasks,
			&progressRow.UnassignedTasks, &progressRow.AttentionTaskID, &progressRow.AttentionTask, &progressRow.AttentionReason, &progressRow.AttentionOwner, &progressRow.AttentionRole, &completed, &progressRow.CurrentOperation, &progressRow.OperationCount)
		if err != nil {
			return nil, err
		}
		if progressRow.RemainingQuantity, err = statisticsDecimal(remaining); err != nil {
			return nil, err
		}
		progressRow.DueDate = progressDate(due.String)
		progressRow.UpdatedAt = updated.String
		if ordered.Valid {
			quantity, parseErr := decimal.NewFromString(ordered.String)
			if parseErr != nil {
				return nil, parseErr
			}
			quantityText := quantity.String()
			progressRow.OrderedQuantity = &quantityText
		}
		if shipped.Valid {
			quantity, parseErr := decimal.NewFromString(shipped.String)
			if parseErr != nil {
				return nil, parseErr
			}
			quantityText := quantity.String()
			progressRow.ShippedQuantity = &quantityText
		}
		if completed.Valid {
			quantity, parseErr := decimal.NewFromString(completed.String)
			if parseErr != nil {
				return nil, parseErr
			}
			quantityText := quantity.String()
			progressRow.CompletedQuantity = &quantityText
		}
		out = append(out, progressRow)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	return out, attachBusinessProgressIdentityMatches(ctx, tx, q, out)
}

func progressDate(value string) string {
	if len(value) >= 10 {
		return value[:10]
	}
	return ""
}

func (r *businessProgressRepo) GetBusinessProgress(ctx context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressDetail, error) {
	result := &biz.BusinessProgressDetail{Sections: map[string][]biz.BusinessProgressRecord{}, HasMore: map[string]bool{}, SnapshotAt: q.SnapshotAt, Access: q.Access}
	err := r.readProgress(ctx, q, func(tx *stdsql.Tx) error {
		cte, args := progressQuery(q, r.data.sqlDialect)
		rows, err := loadBusinessProgressRows(ctx, tx, q, cte, args)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			if q.View == "production" {
				return biz.ErrProductionOrderNotFound
			}
			return biz.ErrSalesOrderNotFound
		}
		result.Row = rows[0]
		sectionArgs := append(append([]any{}, args...), q.ID)
		id := fmt.Sprintf("$%d", len(sectionArgs))
		queries := progressDetailQueries(q, id, r.data.sqlDialect)
		for _, key := range []string{"lines", "production", "batches", "materials"} {
			query, ok := queries[key]
			if !ok {
				continue
			}
			records, err := tx.QueryContext(ctx, cte+" "+query+" LIMIT 101", sectionArgs...)
			if err != nil {
				return err
			}
			list := []biz.BusinessProgressRecord{}
			for records.Next() {
				var x biz.BusinessProgressRecord
				var number, label, status, quantity, unit, date, owner, role, note stdsql.NullString
				err = records.Scan(&x.ID, &x.Kind, &number, &label, &status, &quantity, &unit, &date, &owner, &role, &note, &x.ProductID, &x.ParentID)
				if err != nil {
					return errors.Join(err, records.Close())
				}
				x.Number, x.Label, x.Status, x.Quantity, x.Unit = number.String, label.String, status.String, quantity.String, unit.String
				x.Date, x.Owner, x.Role, x.Note = progressDate(date.String), owner.String, role.String, note.String
				if len(list) < 100 {
					list = append(list, x)
				} else {
					result.HasMore[key] = true
				}
			}
			err = records.Err()
			err = errors.Join(err, records.Close())
			if err != nil {
				return err
			}
			result.Sections[key] = list
		}
		if q.Access.Tasks {
			q.Limit, q.Offset = biz.WorkCenterDefaultLimit, 0
			page, err := loadProgressTaskPage(ctx, tx, q, r.data.sqlDialect)
			if err != nil {
				return err
			}
			result.Sections["tasks"], result.TaskTotal = page.Rows, page.Total
			result.HasMore["tasks"] = page.Total > len(page.Rows)
		}
		return nil
	})
	return result, err
}

func progressDetailQueries(q biz.BusinessProgressQuery, id, sqlDialect string) map[string]string {
	queries := map[string]string{}
	if q.View == "orders" {
		queries["lines"] = `SELECT l.id,'sales_line',CAST(l.line_no AS TEXT),l.product_label,CASE WHEN l.line_status='canceled' THEN '已取消' WHEN l.bom_id IS NOT NULL AND l.bom_fingerprint IS NOT NULL THEN '工程资料已完成' ELSE '待完善工程资料' END,
 CAST(l.ordered_quantity AS TEXT),l.unit_name,` + progressDateSQL("l.due_at", sqlDialect) + `,'','',
 CASE WHEN EXISTS(SELECT 1 FROM shipment_mismatch m WHERE m.order_id=l.sales_order_id) THEN '出货关联待核对'
 ELSE '已出货 ' || CAST(l.shipped_quantity AS TEXT) END,COALESCE(l.product_id,0),l.sales_order_id FROM sales_delivery_lines l
 WHERE l.sales_order_id=` + id + " ORDER BY l.line_no,l.id"
	} else {
		linkedNote := "'已关联销售明细'"
		if q.Access.Sales {
			linkedNote = "(SELECT s.order_no || ' · ' || COALESCE(NULLIF(s.customer_snapshot->>'name',''),c.name,'') FROM sales_order_items l JOIN sales_orders s ON s.id=l.sales_order_id JOIN customers c ON c.id=s.customer_id WHERE l.id=i.sales_order_item_id)"
		}
		queries["lines"] = `SELECT i.id,'production_line',CAST(i.line_no AS TEXT),COALESCE(NULLIF(i.product_name_snapshot,''),p.name),'',
 CAST(i.planned_quantity AS TEXT),COALESCE(NULLIF(i.unit_name_snapshot,''),u.name),'','','',
 CASE WHEN i.sales_order_item_id IS NULL THEN '未关联销售订单' ELSE ` + linkedNote + ` END,i.product_id,i.production_order_id
 FROM production_order_items i JOIN products p ON p.id=i.product_id JOIN units u ON u.id=i.unit_id
 WHERE i.production_order_id=` + id + " ORDER BY i.line_no,i.id"
	}
	if q.Access.Production {
		productionCondition := "p.id=" + id
		if q.View == "orders" {
			productionCondition = "EXISTS(SELECT 1 FROM production_order_items i JOIN sales_order_items s ON s.id=i.sales_order_item_id WHERE i.production_order_id=p.id AND s.sales_order_id=" + id + ")"
		}
		queries["production"] = `SELECT p.id,'production',p.order_no,'',p.status,'','',` + progressDateSQL("p.planned_end_at", sqlDialect) + `,'','',
 COALESCE(p.close_reason,p.cancel_reason,''),0,p.id FROM production_orders p WHERE ` + productionCondition + " ORDER BY p.id DESC"
		queries["batches"] = `SELECT b.id,'batch',b.batch_no,o.process_name_snapshot,b.status,CAST(b.quantity AS TEXT),
 w.unit_name_snapshot,` + progressDateSQL("b.updated_at", sqlDialect) + `,'','',COALESCE(b.rework_reason,''),w.product_id,b.production_order_id
 FROM production_wip_batches b JOIN work_lines w ON w.id=b.production_order_item_id
 JOIN production_order_operations o ON o.id=b.production_order_operation_id
 WHERE w.board_id=` + id + ` AND b.status NOT IN ('SPLIT','CANCELLED')
 ORDER BY CASE WHEN b.status IN ('REJECTED','WAITING_QUALITY') THEN 0 WHEN b.status IN ('IN_PROGRESS','OUTSOURCED') THEN 1 ELSE 2 END,o.step_no,b.id`
		queries["materials"] = `SELECT m.id,'material',m.material_code_snapshot,m.material_name_snapshot,
 CASE WHEN COALESCE(i.quantity,0)<m.planned_quantity THEN 'PENDING' ELSE 'ISSUED' END,
 CAST(m.planned_quantity AS TEXT),m.unit_name_snapshot,'','','','已领 ' || CAST(COALESCE(i.quantity,0) AS TEXT),0,m.production_order_id
 FROM production_order_material_requirements m JOIN work_lines w ON w.id=m.production_order_item_id
 LEFT JOIN issued i ON i.source_line_id=m.id WHERE w.board_id=` + id + " ORDER BY CASE WHEN COALESCE(i.quantity,0)<m.planned_quantity THEN 0 ELSE 1 END,m.id"
	}
	if !q.Access.WIP {
		delete(queries, "batches")
	}
	return queries
}

func (r *businessProgressRepo) ListBusinessProgressTasks(ctx context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressTaskPage, error) {
	var page *biz.BusinessProgressTaskPage
	err := r.readProgress(ctx, q, func(tx *stdsql.Tx) error {
		var err error
		page, err = loadProgressTaskPage(ctx, tx, q, r.data.sqlDialect)
		return err
	})
	return page, err
}

func loadProgressTaskPage(ctx context.Context, tx *stdsql.Tx, q biz.BusinessProgressQuery, sqlDialect string) (*biz.BusinessProgressTaskPage, error) {
	cte, args := progressCTE(q)
	// task_rows is already restricted to this view, document and reader.
	scope := " FROM task_rows WHERE TRUE"
	switch q.TaskStatus {
	case "open":
		scope += " AND task_status_key IN ('ready','blocked')"
	case "ended":
		scope += " AND task_status_key IN ('done','rejected','withdrawn')"
	}
	if q.TaskRole != "" {
		args = append(args, q.TaskRole)
		scope += fmt.Sprintf(" AND owner_role_key=$%d", len(args))
	}
	query := cte + ` SELECT id,task_no,task_name,task_status_key,task_group,` + progressDateSQL("due_at", sqlDialect) +
		`,assignee_name,owner_role_key,COALESCE(blocked_reason,''),source_id,COUNT(*) OVER()` + scope +
		fmt.Sprintf(" ORDER BY attention_rank LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	rows, err := tx.QueryContext(ctx, query, append(append([]any{}, args...), q.Limit, q.Offset)...)
	if err != nil {
		return nil, err
	}
	page := &biz.BusinessProgressTaskPage{Rows: []biz.BusinessProgressRecord{}}
	for rows.Next() {
		record := biz.BusinessProgressRecord{Kind: "task"}
		var date stdsql.NullString
		if err := rows.Scan(&record.ID, &record.Number, &record.Label, &record.Status, &record.TaskGroup, &date, &record.Owner, &record.Role, &record.Note, &record.ParentID, &page.Total); err != nil {
			return nil, errors.Join(err, rows.Close())
		}
		record.Date = progressDate(date.String)
		page.Rows = append(page.Rows, record)
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return nil, err
	}
	// After tasks leave a filtered page the client needs the new last page.
	if len(page.Rows) == 0 && q.Offset > 0 {
		if err := tx.QueryRowContext(ctx, cte+" SELECT COUNT(*)"+scope, args...).Scan(&page.Total); err != nil {
			return nil, err
		}
	}
	return page, nil
}
