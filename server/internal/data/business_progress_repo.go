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
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *businessProgressRepo) ListBusinessProgress(ctx context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressBoard, error) {
	result := &biz.BusinessProgressBoard{Rows: []*biz.BusinessProgressRow{}, SnapshotAt: q.SnapshotAt, Access: q.Access}
	err := r.read(ctx, func(tx *stdsql.Tx) error {
		cte, args := progressQuery(q, r.data.sqlDialect)
		err := tx.QueryRowContext(ctx, cte+` SELECT COUNT(*),COALESCE(SUM(overdue),0),COALESCE(SUM(due_soon),0),
 COALESCE(SUM(blocked),0),COALESCE(SUM(CASE WHEN due_at IS NULL THEN 1 ELSE 0 END),0) FROM filtered`, args...).
			Scan(&result.Counts.Total, &result.Counts.Overdue, &result.Counts.DueSoon, &result.Counts.Blocked, &result.Counts.Undated)
		if err != nil {
			return err
		}
		if err = tx.QueryRowContext(ctx, cte+" SELECT COUNT(*) FROM filtered"+progressRiskWhere(q), args...).Scan(&result.Total); err != nil {
			return err
		}
		result.Rows, err = loadBusinessProgressRows(ctx, tx, q, cte, args)
		return err
	})
	return result, err
}

func loadBusinessProgressRows(ctx context.Context, tx *stdsql.Tx, q biz.BusinessProgressQuery, cte string, args []any) (out []*biz.BusinessProgressRow, err error) {
	args = append(append([]any{}, args...), q.Limit, q.Offset)
	query := cte + ` SELECT id,order_no,status,customer,product,product_count,product_id,sales_owner,CAST(due_date AS TEXT),CAST(updated_at AS TEXT),
 active,unlinked,unit_name,CAST(ordered_quantity AS TEXT),CAST(shipped_quantity AS TEXT),delivery_known,engineering_total,engineering_ready,
 overdue,due_soon,blocked,production_orders,production_closed,material_total,material_pending,in_progress_batches,outsourced_batches,
 waiting_batches,rejected_batches,planned_batches,open_tasks,blocked_tasks,unassigned_tasks,attention_task_id,attention_task,
 attention_reason,attention_owner,attention_role,CAST(completed_quantity AS TEXT),current_operation,operation_count FROM filtered` + progressRiskWhere(q) +
		fmt.Sprintf(" ORDER BY active DESC,overdue DESC,blocked DESC,CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,due_at,id DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))
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
		x := &biz.BusinessProgressRow{View: q.View}
		var due, updated, ordered, shipped, completed stdsql.NullString
		err = rows.Scan(&x.ID, &x.OrderNo, &x.Status, &x.Customer, &x.Product, &x.ProductCount, &x.ProductID, &x.SalesOwner, &due, &updated,
			&x.Active, &x.Unlinked, &x.Unit, &ordered, &shipped, &x.DeliveryKnown, &x.EngineeringTotal, &x.EngineeringReady,
			&x.Overdue, &x.DueSoon, &x.Blocked, &x.ProductionOrders, &x.ProductionClosed, &x.MaterialTotal, &x.MaterialPending,
			&x.InProgressBatches, &x.OutsourcedBatches, &x.WaitingBatches, &x.RejectedBatches, &x.PlannedBatches, &x.OpenTasks, &x.BlockedTasks,
			&x.UnassignedTasks, &x.AttentionTaskID, &x.AttentionTask, &x.AttentionReason, &x.AttentionOwner, &x.AttentionRole, &completed, &x.CurrentOperation, &x.OperationCount)
		if err != nil {
			return nil, err
		}
		x.DueDate = progressDate(due.String)
		x.UpdatedAt = updated.String
		if ordered.Valid {
			v, e := decimal.NewFromString(ordered.String)
			if e != nil {
				return nil, e
			}
			s := v.String()
			x.OrderedQuantity = &s
		}
		if shipped.Valid {
			v, e := decimal.NewFromString(shipped.String)
			if e != nil {
				return nil, e
			}
			s := v.String()
			x.ShippedQuantity = &s
		}
		if completed.Valid {
			v, e := decimal.NewFromString(completed.String)
			if e != nil {
				return nil, e
			}
			s := v.String()
			x.CompletedQuantity = &s
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func progressDate(value string) string {
	if len(value) >= 10 {
		return value[:10]
	}
	return ""
}

func (r *businessProgressRepo) GetBusinessProgress(ctx context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressDetail, error) {
	result := &biz.BusinessProgressDetail{Sections: map[string][]biz.BusinessProgressRecord{}, HasMore: map[string]bool{}, SnapshotAt: q.SnapshotAt, Access: q.Access}
	err := r.read(ctx, func(tx *stdsql.Tx) error {
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
		for _, key := range []string{"lines", "production", "batches", "materials", "tasks"} {
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
				err = records.Scan(&x.ID, &x.Kind, &number, &label, &status, &quantity, &unit, &date, &owner, &role, &note, &x.ParentID)
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
		return nil
	})
	return result, err
}

func progressDetailQueries(q biz.BusinessProgressQuery, id, sqlDialect string) map[string]string {
	queries := map[string]string{}
	if q.View == "orders" {
		queries["lines"] = `SELECT l.id,'sales_line',CAST(l.line_no AS TEXT),l.product_label,l.engineering_status,
 CAST(l.ordered_quantity AS TEXT),l.unit_name,` + progressDateSQL("l.due_at", sqlDialect) + `,'','',
 CASE WHEN EXISTS(SELECT 1 FROM shipment_mismatch m WHERE m.order_id=l.sales_order_id) THEN '出货关联待核对'
 ELSE '已出货 ' || CAST(l.shipped_quantity AS TEXT) END,l.sales_order_id FROM sales_lines l
 WHERE l.sales_order_id=` + id + " ORDER BY l.line_no,l.id"
	} else {
		linkedNote := "'已关联销售明细'"
		if q.Access.Sales {
			linkedNote = "(SELECT s.order_no || ' · ' || COALESCE(NULLIF(s.customer_snapshot->>'name',''),c.name,'') FROM sales_order_items l JOIN sales_orders s ON s.id=l.sales_order_id JOIN customers c ON c.id=s.customer_id WHERE l.id=i.sales_order_item_id)"
		}
		queries["lines"] = `SELECT i.id,'production_line',CAST(i.line_no AS TEXT),COALESCE(NULLIF(i.product_name_snapshot,''),p.name),'',
 CAST(i.planned_quantity AS TEXT),COALESCE(NULLIF(i.unit_name_snapshot,''),u.name),'','','',
 CASE WHEN i.sales_order_item_id IS NULL THEN '未关联销售订单' ELSE ` + linkedNote + ` END,i.production_order_id
 FROM production_order_items i JOIN products p ON p.id=i.product_id JOIN units u ON u.id=i.unit_id
 WHERE i.production_order_id=` + id + " ORDER BY i.line_no,i.id"
	}
	if q.Access.Production {
		productionCondition := "p.id=" + id
		if q.View == "orders" {
			productionCondition = "EXISTS(SELECT 1 FROM production_order_items i JOIN sales_order_items s ON s.id=i.sales_order_item_id WHERE i.production_order_id=p.id AND s.sales_order_id=" + id + ")"
		}
		queries["production"] = `SELECT p.id,'production',p.order_no,'',p.status,'','',` + progressDateSQL("p.planned_end_at", sqlDialect) + `,'','',
 COALESCE(p.close_reason,p.cancel_reason,''),p.id FROM production_orders p WHERE ` + productionCondition + " ORDER BY p.id DESC"
		queries["batches"] = `SELECT b.id,'batch',b.batch_no,o.process_name_snapshot,b.status,CAST(b.quantity AS TEXT),
 w.unit_name_snapshot,` + progressDateSQL("b.updated_at", sqlDialect) + `,'','',COALESCE(b.rework_reason,''),b.production_order_id
 FROM production_wip_batches b JOIN work_lines w ON w.id=b.production_order_item_id
 JOIN production_order_operations o ON o.id=b.production_order_operation_id
 WHERE w.board_id=` + id + ` AND b.status NOT IN ('SPLIT','CANCELLED')
 ORDER BY CASE WHEN b.status IN ('REJECTED','WAITING_QUALITY') THEN 0 WHEN b.status IN ('IN_PROGRESS','OUTSOURCED') THEN 1 ELSE 2 END,o.step_no,b.id`
		queries["materials"] = `SELECT m.id,'material',m.material_code_snapshot,m.material_name_snapshot,
 CASE WHEN COALESCE(i.quantity,0)<m.planned_quantity THEN 'PENDING' ELSE 'ISSUED' END,
 CAST(m.planned_quantity AS TEXT),m.unit_name_snapshot,'','','','已领 ' || CAST(COALESCE(i.quantity,0) AS TEXT),m.production_order_id
 FROM production_order_material_requirements m JOIN work_lines w ON w.id=m.production_order_item_id
 LEFT JOIN issued i ON i.source_line_id=m.id WHERE w.board_id=` + id + " ORDER BY CASE WHEN COALESCE(i.quantity,0)<m.planned_quantity THEN 0 ELSE 1 END,m.id"
	}
	if !q.Access.WIP {
		delete(queries, "batches")
	}
	if q.Access.Tasks {
		queries["tasks"] = `SELECT id,'task',task_code,task_name,task_status_key,'','',` + progressDateSQL("due_at", sqlDialect) + `,
 assignee_name,owner_role_key,COALESCE(blocked_reason,''),source_id FROM task_rows WHERE view_key='` + q.View + "' AND board_id=" + id + " ORDER BY attention_rank"
	}
	return queries
}
