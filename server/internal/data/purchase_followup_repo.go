package data

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

var purchaseFollowupPlaceholder = regexp.MustCompile(`\$(\d+)`)

var _ biz.PurchaseFollowupRepo = (*purchaseOrderRepo)(nil)

// The board is a read projection over source documents. Counts, calendar and
// paged rows share a snapshot; neither reminders nor exception states are stored.
func (r *purchaseOrderRepo) ListPurchaseFollowups(ctx context.Context, q biz.PurchaseFollowupQuery) (*biz.PurchaseFollowupBoard, error) {
	snapshot, err := beginReadSnapshot(ctx, r.data)
	if err != nil {
		return nil, err
	}
	defer snapshot.Rollback()
	if snapshot.sqlTx == nil {
		return nil, biz.ErrBadParam
	}
	out := &biz.PurchaseFollowupBoard{Rows: []*biz.PurchaseFollowupRow{}, Counts: map[string]int{}, Days: map[string]int{}, Access: q.Access, AsOfDate: q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")}
	cte, args := purchaseFollowupQuery(q, r.data.sqlDialect)
	querySQL := func(query string) string {
		if r.data.sqlDialect == dialect.SQLite {
			return purchaseFollowupPlaceholder.ReplaceAllString(query, `?$1`)
		}
		return query
	}

	counts, err := snapshot.sqlTx.QueryContext(ctx, querySQL(cte+` SELECT kind,COUNT(*) FROM scoped GROUP BY kind`), args...)
	if err != nil {
		return nil, err
	}
	for counts.Next() {
		var kind string
		var n int
		if err = counts.Scan(&kind, &n); err != nil {
			break
		}
		out.Counts[kind] = n
	}
	if err == nil {
		err = counts.Err()
	}
	if closeErr := counts.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}
	days, err := snapshot.sqlTx.QueryContext(ctx, querySQL(cte+` SELECT due_date,COUNT(*) FROM scoped WHERE kind IN ('overdue','due_soon','scheduled') AND due_date>=(SELECT starts_on FROM followup_window) AND due_date<=(SELECT ends_on FROM followup_window) GROUP BY due_date`), args...)
	if err != nil {
		return nil, err
	}
	for days.Next() {
		var date string
		var n int
		if err = days.Scan(&date, &n); err != nil {
			break
		}
		out.Days[date] = n
	}
	if err == nil {
		err = days.Err()
	}
	if closeErr := days.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}
	condition := purchaseFollowupCondition(q)
	if err = snapshot.sqlTx.QueryRowContext(ctx, querySQL(cte+` SELECT COUNT(*) FROM scoped WHERE `+condition), args...).Scan(&out.Total); err != nil {
		return nil, err
	}
	pageArgs := append(append([]any{}, args...), q.Limit, q.Offset)
	rows, err := snapshot.sqlTx.QueryContext(ctx, querySQL(cte+` SELECT kind,source_type,source_id,source_no,order_id,order_no,line_id,line_no,supplier_id,supplier_name,material_code,material_name,unit_name,CAST(quantity AS TEXT),COALESCE(CAST(due_date AS TEXT),''),date_source FROM scoped WHERE `+condition+fmt.Sprintf(` ORDER BY CASE kind WHEN 'rejected' THEN 0 WHEN 'overdue' THEN 1 WHEN 'pending_inspection' THEN 2 WHEN 'ready_inbound' THEN 3 WHEN 'missing_price' THEN 4 ELSE 5 END,CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,due_date,source_id,line_id,kind LIMIT $%d OFFSET $%d`, len(pageArgs)-1, len(pageArgs))), pageArgs...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		row := &biz.PurchaseFollowupRow{}
		var qty sql.NullString
		if err = rows.Scan(&row.Kind, &row.SourceType, &row.SourceID, &row.SourceNo, &row.OrderID, &row.OrderNo, &row.LineID, &row.LineNo, &row.SupplierID, &row.SupplierName, &row.MaterialCode, &row.MaterialName, &row.UnitName, &qty, &row.DueDate, &row.DateSource); err != nil {
			return nil, err
		}
		if qty.Valid {
			n, parseErr := decimal.NewFromString(qty.String)
			if parseErr != nil {
				return nil, parseErr
			}
			row.Quantity = n.String()
		}
		row.Key = fmt.Sprintf("%s:%s:%d:%d", row.Kind, row.SourceType, row.SourceID, row.LineID)
		out.Rows = append(out.Rows, row)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	if err = snapshot.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

func purchaseFollowupCondition(q biz.PurchaseFollowupQuery) string {
	switch q.Kind {
	case "all":
		return "1=1"
	case "period":
		return "kind IN ('overdue','due_soon','scheduled') AND due_date >= (SELECT starts_on FROM followup_window) AND due_date <= (SELECT ends_on FROM followup_window)"
	case "date":
		return "kind IN ('overdue','due_soon','scheduled') AND due_date = (SELECT selected_on FROM followup_window)"
	default:
		return "kind='" + q.Kind + "'"
	}
}

func purchaseFollowupQuery(q biz.PurchaseFollowupQuery, sqlDialect string) (string, []any) {
	start, _ := time.Parse("2006-01-02", q.StartDate)
	today := q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600))
	args := []any{q.StartDate, start.AddDate(0, 0, 13).Format("2006-01-02"), q.SelectedDate, today.Format("2006-01-02"), today.AddDate(0, 0, 6).Format("2006-01-02")}
	bind := func(value any) string { args = append(args, value); return fmt.Sprintf("$%d", len(args)) }
	receiptVisible := "FALSE"
	scope := biz.NormalizeWarehouseDataScope(q.WarehouseScope)
	if scope.Mode == biz.DataScopeModeAll {
		receiptVisible = "TRUE"
	} else if scope.Mode == biz.DataScopeModeAssigned && len(scope.WarehouseIDs) > 0 {
		placeholders := make([]string, 0, len(scope.WarehouseIDs))
		for _, id := range scope.WarehouseIDs {
			placeholders = append(placeholders, bind(id))
		}
		receiptVisible = "NOT EXISTS (SELECT 1 FROM purchase_receipt_items hidden WHERE hidden.receipt_id=r.receipt_id AND hidden.warehouse_id NOT IN (" + strings.Join(placeholders, ",") + "))"
	}
	supplierName := "COALESCE(NULLIF(p.supplier_snapshot->>'name',''),s.name,'')"
	if sqlDialect == dialect.SQLite {
		supplierName = "COALESCE(NULLIF(json_extract(p.supplier_snapshot,'$.name'),''),s.name,'')"
	}
	due := "CAST(" + progressDateSQL("COALESCE(i.expected_arrival_date,p.supplier_confirmed_arrival_date,p.expected_arrival_date)", sqlDialect) + " AS TEXT)"
	cte := `WITH followup_window AS (
 SELECT CAST($1 AS TEXT) AS starts_on,CAST($2 AS TEXT) AS ends_on,CAST($3 AS TEXT) AS selected_on,CAST($4 AS TEXT) AS today,CAST($5 AS TEXT) AS soon_ends_on
), posted AS (
 SELECT source_id,source_line_id FROM inventory_txns WHERE source_type='PURCHASE_RECEIPT' AND txn_type='IN' AND direction=1 GROUP BY source_id,source_line_id
), disposed AS (
 SELECT purchase_receipt_item_id,SUM(quantity) AS quantity FROM purchase_rejection_dispositions WHERE status='POSTED' GROUP BY purchase_receipt_item_id
), adjustments AS (
 SELECT i.purchase_receipt_item_id,SUM(CASE i.adjust_type WHEN 'QUANTITY_INCREASE' THEN i.quantity WHEN 'QUANTITY_DECREASE' THEN -i.quantity ELSE 0 END) AS quantity
 FROM purchase_receipt_adjustment_items i JOIN purchase_receipt_adjustments a ON a.id=i.adjustment_id WHERE a.status='POSTED' GROUP BY i.purchase_receipt_item_id
), inspections AS (
 SELECT q.purchase_receipt_item_id,
 MAX(CASE WHEN q.status='REJECTED' AND q.result='REJECT' THEN 1 ELSE 0 END) AS rejected,
 MAX(CASE WHEN q.status IN ('DRAFT','SUBMITTED') THEN 1 ELSE 0 END) AS pending,
 MAX(CASE WHEN q.status='PASSED' AND q.result IN ('PASS','CONCESSION') THEN 1 ELSE 0 END) AS passed
 FROM quality_inspections q JOIN purchase_receipt_items i ON i.id=q.purchase_receipt_item_id AND i.receipt_id=q.purchase_receipt_id AND i.lot_id=q.inventory_lot_id AND i.material_id=q.material_id AND i.warehouse_id=q.warehouse_id
 WHERE q.source_type='PURCHASE_RECEIPT' AND q.inspection_type='INCOMING' AND q.superseded_at IS NULL GROUP BY q.purchase_receipt_item_id
), receipt_lines AS (
 SELECT i.*,r.receipt_no,r.status AS receipt_status,COALESCE(r.supplier_id,0) AS supplier_id,r.supplier_name,
 COALESCE(d.quantity,0) AS disposed_quantity,COALESCE(a.quantity,0) AS adjustment_quantity,
 CASE WHEN t.source_line_id IS NOT NULL THEN 'posted' WHEN COALESCE(q.rejected,0)=1 AND COALESCE(d.quantity,0)>=i.quantity THEN 'disposed'
 WHEN COALESCE(q.rejected,0)=1 THEN 'rejected'
 WHEN COALESCE(q.pending,0)=1 OR COALESCE(q.passed,0)=0 OR l.id IS NULL OR l.status<>'ACTIVE' THEN 'pending_inspection' ELSE 'ready_inbound' END AS progress
 FROM purchase_receipt_items i JOIN purchase_receipts r ON r.id=i.receipt_id
 LEFT JOIN posted t ON t.source_id=i.receipt_id AND t.source_line_id=i.id
 LEFT JOIN disposed d ON d.purchase_receipt_item_id=i.id LEFT JOIN adjustments a ON a.purchase_receipt_item_id=i.id
 LEFT JOIN inspections q ON q.purchase_receipt_item_id=i.id LEFT JOIN inventory_lots l ON l.id=i.lot_id
 WHERE r.status<>'CANCELLED'
), received AS (
 SELECT purchase_order_item_id,SUM(CASE WHEN progress='posted' AND receipt_status='POSTED' THEN quantity+adjustment_quantity WHEN progress<>'posted' AND disposed_quantity<quantity THEN quantity ELSE 0 END) AS quantity
 FROM receipt_lines GROUP BY purchase_order_item_id
), order_lines AS (
 SELECT i.*,p.purchase_order_no,p.lifecycle_status,p.supplier_id,` + supplierName + ` AS supplier_name,
 COALESCE(NULLIF(i.material_code_snapshot,''),m.code) AS material_code,COALESCE(NULLIF(i.material_name_snapshot,''),m.name) AS material_name,COALESCE(NULLIF(i.unit_name_snapshot,''),u.name) AS unit_name,
 ` + due + ` AS due_date,CASE WHEN i.expected_arrival_date IS NOT NULL THEN 'line' WHEN p.supplier_confirmed_arrival_date IS NOT NULL THEN 'confirmed' ELSE 'expected' END AS date_source,
 i.purchased_quantity-COALESCE(r.quantity,0) AS remaining_quantity
 FROM purchase_order_items i JOIN purchase_orders p ON p.id=i.purchase_order_id JOIN materials m ON m.id=i.material_id JOIN units u ON u.id=i.unit_id
 LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN received r ON r.purchase_order_item_id=i.id WHERE i.line_status<>'canceled' AND p.lifecycle_status IN ('approved','closed')
), candidates AS (
 SELECT CASE WHEN due_date IS NULL THEN 'unscheduled' WHEN due_date<(SELECT today FROM followup_window) THEN 'overdue' WHEN due_date<=(SELECT soon_ends_on FROM followup_window) THEN 'due_soon' ELSE 'scheduled' END AS kind,
 'purchase_order' AS source_type,purchase_order_id AS source_id,purchase_order_no AS source_no,purchase_order_id AS order_id,purchase_order_no AS order_no,id AS line_id,CAST(line_no AS TEXT) AS line_no,supplier_id,supplier_name,material_code,material_name,unit_name,remaining_quantity AS quantity,due_date,date_source
 FROM order_lines WHERE lifecycle_status='approved' AND line_status='open' AND remaining_quantity>0
 UNION ALL
 SELECT 'missing_price','purchase_order',purchase_order_id,purchase_order_no,purchase_order_id,purchase_order_no,id,CAST(line_no AS TEXT),supplier_id,supplier_name,material_code,material_name,unit_name,purchased_quantity,due_date,date_source FROM order_lines WHERE unit_price IS NULL AND ` + fmt.Sprint(q.Access.Commercial) + `
 UNION ALL
 SELECT r.progress,'purchase_receipt',r.receipt_id,r.receipt_no,COALESCE(i.purchase_order_id,0),COALESCE(p.purchase_order_no,''),r.id,COALESCE(r.source_line_no,''),r.supplier_id,r.supplier_name,m.code,m.name,u.name,r.quantity-r.disposed_quantity,NULL,''
 FROM receipt_lines r JOIN materials m ON m.id=r.material_id JOIN units u ON u.id=r.unit_id LEFT JOIN purchase_order_items i ON i.id=r.purchase_order_item_id LEFT JOIN purchase_orders p ON p.id=i.purchase_order_id
 WHERE r.progress IN ('pending_inspection','rejected','ready_inbound') AND ` + fmt.Sprint(q.Access.Quality) + ` AND ` + receiptVisible + `
 UNION ALL
 SELECT 'unsettled','purchase_receipt',r.receipt_id,r.receipt_no,COALESCE(MIN(i.purchase_order_id),0),COALESCE(MIN(p.purchase_order_no),''),0,'',r.supplier_id,r.supplier_name,'','','',NULL,NULL,''
 FROM receipt_lines r LEFT JOIN purchase_order_items i ON i.id=r.purchase_order_item_id LEFT JOIN purchase_orders p ON p.id=i.purchase_order_id
 WHERE r.receipt_status='POSTED' AND ` + fmt.Sprint(q.Access.Finance) + ` AND ` + receiptVisible + ` AND NOT EXISTS (SELECT 1 FROM finance_facts f WHERE f.source_type='PURCHASE_RECEIPT' AND f.source_id=r.receipt_id AND f.fact_type='PAYABLE' AND f.status<>'CANCELLED')
 GROUP BY r.receipt_id,r.receipt_no,r.supplier_id,r.supplier_name HAVING SUM(CASE WHEN r.progress='posted' THEN 1 ELSE 0 END)>0 AND SUM(CASE WHEN r.progress NOT IN ('posted','disposed') THEN 1 ELSE 0 END)=0
), scoped AS (SELECT * FROM candidates WHERE `
	conditions := []string{"1=1"}
	if q.View == "arrival" {
		conditions = append(conditions, "kind IN ('overdue','due_soon','unscheduled','scheduled')")
	} else {
		conditions = append(conditions, "kind NOT IN ('due_soon','scheduled')")
	}
	if q.SupplierID > 0 {
		conditions = append(conditions, "supplier_id="+bind(q.SupplierID))
	}
	if q.OrderID > 0 {
		conditions = append(conditions, "order_id="+bind(q.OrderID))
	}
	if q.Keyword != "" {
		param := bind("%" + strings.ToLower(strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(q.Keyword)) + "%")
		conditions = append(conditions, "LOWER(source_no || ' ' || order_no || ' ' || supplier_name || ' ' || material_code || ' ' || material_name) LIKE "+param+" ESCAPE '\\'")
	}
	switch q.Confirmation {
	case "confirmed":
		conditions = append(conditions, "date_source='confirmed'")
	case "unconfirmed":
		conditions = append(conditions, "date_source<>'confirmed'")
	}
	return cte + strings.Join(conditions, " AND ") + ")", args
}
