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

type businessStatisticsRepo struct{ reader *businessProgressRepo }

func NewBusinessStatisticsRepo(data *Data) biz.BusinessStatisticsRepo {
	return &businessStatisticsRepo{reader: &businessProgressRepo{data: data}}
}

func statisticsStatusWhere(status string) string {
	switch status {
	case "all":
		return "1=1"
	case "overdue", "soon", "undated":
		return status + ">0"
	case "not_due", "late_7", "late_30", "late_60", "late_more":
		return "aging='" + status + "'"
	case "pending_not_late":
		return "delivery_status='pending' AND overdue=0"
	default:
		return "delivery_status='" + status + "'"
	}
}

func (r *businessStatisticsRepo) deliveryQuery(q biz.BusinessStatisticsQuery) (string, []any) {
	pq := biz.BusinessProgressQuery{View: "orders", Access: biz.BusinessProgressAccess{Sales: true}}
	cte, args := progressCTE(pq)
	bind := func(v any) string { args = append(args, v); return fmt.Sprintf("$%d", len(args)) }
	local := q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600))
	day, soon := bind(local.Format("2006-01-02")), bind(local.AddDate(0, 0, 6).Format("2006-01-02"))
	date := progressDateSQL("b.due_at", r.reader.data.sqlDialect)
	cte += `, delivery AS (
 SELECT b.*,s.customer_id,c.name AS customer_name,s.currency,s.order_total,` + date + ` AS due_date,
 CASE WHEN b.delivery_known=0 THEN 'unknown'
 WHEN NOT EXISTS(SELECT 1 FROM sales_lines l WHERE l.sales_order_id=b.id AND l.shipped_quantity<l.ordered_quantity) THEN 'done'
 WHEN b.active=1 THEN 'pending' ELSE 'closed' END AS delivery_status
 FROM (` + progressBase(pq) + `) b JOIN sales_orders s ON s.id=b.id JOIN customers c ON c.id=s.customer_id
 WHERE s.lifecycle_status IN ('active','closed')
), cohort AS (SELECT * FROM delivery WHERE currency=` + bind(q.Currency)
	if q.DateFrom != "" {
		cte += " AND due_date>=" + bind(q.DateFrom)
	}
	if q.DateTo != "" {
		cte += " AND due_date<=" + bind(q.DateTo)
	}
	groupKey, groupName := "'c:' || CAST(d.customer_id AS TEXT)", "d.customer_name"
	if q.GroupBy == "product" {
		groupKey = "CASE WHEN l.product_id IS NULL THEN 'u:' || CAST(l.id AS TEXT) ELSE 'p:' || CAST(l.product_id AS TEXT) END"
		groupName = "l.product_label"
	}
	cte += `), shipment_amounts AS (
 SELECT i.sales_order_item_id,SUM(CASE WHEN i.currency_snapshot=s.currency AND i.amount_snapshot IS NOT NULL THEN i.amount_snapshot ELSE 0 END) AS amount,
 SUM(CASE WHEN i.currency_snapshot IS NULL OR i.currency_snapshot<>s.currency OR i.amount_snapshot IS NULL THEN 1 ELSE 0 END) AS missing
 FROM shipment_items i JOIN shipments h ON h.id=i.shipment_id
 JOIN sales_order_items l ON l.id=i.sales_order_item_id JOIN sales_orders s ON s.id=l.sales_order_id
 WHERE h.status='SHIPPED' AND h.sales_order_id=s.id GROUP BY i.sales_order_item_id
), members AS (
 SELECT d.*,` + groupKey + ` AS group_key,` + groupName + ` AS group_name,
 l.id AS member_id,l.product_label,l.unit_id,l.unit_name AS member_unit,
 l.ordered_quantity AS member_ordered,l.shipped_quantity AS member_shipped,l.amount AS member_amount,
 COALESCE(a.amount,0) AS member_shipped_amount,COALESCE(a.missing,0) AS member_shipped_missing
 FROM cohort d LEFT JOIN sales_lines l ON l.sales_order_id=d.id LEFT JOIN shipment_amounts a ON a.sales_order_item_id=l.id
 WHERE 1=1`
	if q.GroupBy == "product" {
		cte += " AND l.id IS NOT NULL"
	}
	if q.Keyword != "" {
		key := bind("%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(q.Keyword)) + "%")
		cte += " AND LOWER(" + groupName + ") LIKE " + key + " ESCAPE '\\'"
	}
	amount, missing := "MAX(order_total)", "MAX(CASE WHEN order_total IS NULL THEN 1 ELSE 0 END)"
	if q.GroupBy == "product" {
		amount = "SUM(member_amount)"
		missing = "SUM(CASE WHEN member_amount IS NULL THEN 1 ELSE 0 END)"
	}
	cte += `), scope_rows AS (
 SELECT id,group_key,MIN(group_name) AS group_name,MIN(order_no) AS number,MIN(customer) AS customer,
 MIN(product_label) AS product,COUNT(member_id) AS product_count,MIN(sales_owner) AS owner,
 MIN(delivery_status) AS delivery_status,MIN(due_date) AS due_date,
 MAX(CASE WHEN delivery_status='pending' AND due_date<` + day + ` THEN 1 ELSE 0 END) AS overdue,
 MAX(CASE WHEN delivery_status='pending' AND due_date>=` + day + ` AND due_date<=` + soon + ` THEN 1 ELSE 0 END) AS soon,
 MAX(CASE WHEN due_date IS NULL THEN 1 ELSE 0 END) AS undated,
 CASE WHEN COUNT(DISTINCT unit_id)=1 THEN MIN(member_unit) ELSE '' END AS unit,
 CASE WHEN COUNT(DISTINCT unit_id)=1 THEN SUM(member_ordered) END AS ordered_quantity,
 CASE WHEN COUNT(DISTINCT unit_id)=1 AND MIN(delivery_known)=1 THEN SUM(member_shipped) END AS shipped_quantity,
 ` + amount + ` AS amount,` + missing + ` AS missing_amount,SUM(member_shipped_amount) AS shipped_amount,
 SUM(member_shipped_missing)+MAX(CASE WHEN delivery_known=0 THEN 1 ELSE 0 END) AS missing_shipment_amount
 FROM members GROUP BY id,group_key
), selected AS (SELECT * FROM scope_rows WHERE ` + statisticsStatusWhere(q.Status) + `)`
	return cte, args
}

// Signed allocation/credit entries follow financeFactOutstandingAmounts:
// reversal receipts subtract the original posting rather than replacing it.
func (r *businessStatisticsRepo) receivableQuery(q biz.BusinessStatisticsQuery) (string, []any) {
	args := []any{q.Currency, q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")}
	date := progressDateSQL("f.due_at", r.reader.data.sqlDialect)
	days := "(CAST($2 AS DATE)-CAST(due_date AS DATE))"
	if r.reader.data.sqlDialect == dialect.SQLite {
		days = "CAST(julianday($2)-julianday(due_date) AS INTEGER)"
	}
	cte := `WITH allocations AS (
 SELECT finance_fact_id,SUM(CASE WHEN status='POSTED' THEN amount WHEN status='REVERSED' THEN -amount ELSE 0 END) AS amount
 FROM finance_allocations GROUP BY finance_fact_id
), credits AS (
 SELECT finance_fact_id,SUM(CASE WHEN status='POSTED' THEN amount WHEN status='REVERSED' THEN -amount ELSE 0 END) AS amount
 FROM finance_credit_notes GROUP BY finance_fact_id
), balances AS (
 SELECT f.*,COALESCE(a.amount,0) AS allocated,COALESCE(n.amount,0) AS credited,
 f.amount-COALESCE(a.amount,0)-COALESCE(n.amount,0) AS balance,` + date + ` AS due_date,
 'c:' || CAST(COALESCE(f.counterparty_id,0) AS TEXT) AS group_key,
 COALESCE(c.name,'未关联客户') AS group_name,COALESCE(h.shipment_no,'') AS source_number
 FROM finance_facts f LEFT JOIN allocations a ON a.finance_fact_id=f.id LEFT JOIN credits n ON n.finance_fact_id=f.id
 LEFT JOIN customers c ON f.counterparty_type='CUSTOMER' AND c.id=f.counterparty_id
 LEFT JOIN shipments h ON f.source_type='SHIPMENT' AND h.id=f.source_id
 WHERE f.fact_type='RECEIVABLE' AND f.status='POSTED' AND f.counterparty_type='CUSTOMER' AND f.currency=$1
), aged AS (SELECT *,` + days + ` AS late_days FROM balances), scope_rows AS (
 SELECT *,CASE WHEN late_days>0 THEN 1 ELSE 0 END AS overdue,
 CASE WHEN due_date IS NULL THEN 1 ELSE 0 END AS undated,
 CASE WHEN due_date IS NULL THEN 'undated' WHEN late_days<=0 THEN 'not_due'
 WHEN late_days<=7 THEN 'late_7' WHEN late_days<=30 THEN 'late_30' WHEN late_days<=60 THEN 'late_60' ELSE 'late_more' END AS aging
 FROM aged WHERE balance>0`
	if q.Keyword != "" {
		args = append(args, "%"+strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(q.Keyword))+"%")
		cte += fmt.Sprintf(" AND LOWER(group_name) LIKE $%d ESCAPE '\\'", len(args))
	}
	return cte + `), selected AS (SELECT * FROM scope_rows WHERE ` + statisticsStatusWhere(q.Status) + `)`, args
}

type statisticsScanner interface{ Scan(...any) error }

func statisticsDecimal(value sql.NullString) (*string, error) {
	if !value.Valid {
		return nil, nil
	}
	n, err := decimal.NewFromString(value.String)
	if err != nil {
		return nil, err
	}
	// Persisted quantities and money have at most six fractional digits; SQLite
	// SUM uses floating point in the isolated test engine.
	s := n.Round(6).String()
	return &s, nil
}

func scanDeliveryMetrics(s statisticsScanner, m *biz.BusinessStatisticsMetrics, money bool) error {
	var amount, shipped sql.NullString
	err := s.Scan(&m.Count, &m.Done, &m.Pending, &m.Closed, &m.Unknown, &m.Overdue, &m.Soon, &m.Undated, &amount, &shipped, &m.MissingAmount, &m.MissingShipmentAmount)
	if err != nil {
		return err
	}
	if !money {
		m.MissingAmount, m.MissingShipmentAmount = 0, 0
		return nil
	}
	if m.Amount, err = statisticsDecimal(amount); err != nil {
		return err
	}
	if m.ShippedAmount, err = statisticsDecimal(shipped); err != nil {
		return err
	}
	if m.MissingAmount > 0 {
		m.Amount = nil
	}
	if m.MissingShipmentAmount > 0 {
		m.ShippedAmount = nil
	}
	return nil
}

const deliveryMetricsSQL = `COUNT(DISTINCT id),COUNT(DISTINCT CASE WHEN delivery_status='done' THEN id END),
 COUNT(DISTINCT CASE WHEN delivery_status='pending' THEN id END),COUNT(DISTINCT CASE WHEN delivery_status='closed' THEN id END),
 COUNT(DISTINCT CASE WHEN delivery_status='unknown' THEN id END),COUNT(DISTINCT CASE WHEN overdue=1 THEN id END),
 COUNT(DISTINCT CASE WHEN soon=1 THEN id END),COUNT(DISTINCT CASE WHEN undated=1 THEN id END),
 CAST(SUM(amount) AS TEXT),CAST(COALESCE(SUM(shipped_amount),0) AS TEXT),COALESCE(SUM(missing_amount),0),COALESCE(SUM(missing_shipment_amount),0)`

const receivableMetricsSQL = `COUNT(*),COALESCE(SUM(overdue),0),COALESCE(SUM(undated),0),CAST(COALESCE(SUM(balance),0) AS TEXT),
 CAST(COALESCE(SUM(CASE WHEN aging='not_due' THEN balance ELSE 0 END),0) AS TEXT),
 CAST(COALESCE(SUM(CASE WHEN aging='late_7' THEN balance ELSE 0 END),0) AS TEXT),
 CAST(COALESCE(SUM(CASE WHEN aging='late_30' THEN balance ELSE 0 END),0) AS TEXT),
 CAST(COALESCE(SUM(CASE WHEN aging='late_60' THEN balance ELSE 0 END),0) AS TEXT),
 CAST(COALESCE(SUM(CASE WHEN aging='late_more' THEN balance ELSE 0 END),0) AS TEXT),
 CAST(COALESCE(SUM(CASE WHEN aging='undated' THEN balance ELSE 0 END),0) AS TEXT)`

func scanReceivableMetrics(s statisticsScanner, m *biz.BusinessStatisticsMetrics) error {
	var values [7]sql.NullString
	if err := s.Scan(&m.Count, &m.Overdue, &m.Undated, &values[0], &values[1], &values[2], &values[3], &values[4], &values[5], &values[6]); err != nil {
		return err
	}
	for i, dest := range []**string{&m.Balance, &m.NotDue, &m.Late7, &m.Late30, &m.Late60, &m.LateMore, &m.UnknownDue} {
		value, err := statisticsDecimal(values[i])
		if err != nil {
			return err
		}
		*dest = value
	}
	return nil
}

var statisticsBindParameter = regexp.MustCompile(`\$([0-9]+)`)

func (r *businessStatisticsRepo) query(q biz.BusinessStatisticsQuery) (string, []any) {
	var cte string
	var args []any
	if q.Report == "receivables" {
		cte, args = r.receivableQuery(q)
	} else {
		cte, args = r.deliveryQuery(q)
	}
	// SQLite treats dollar parameters as names in order of first occurrence.
	// Explicit numbered parameters preserve the PostgreSQL bind positions.
	if r.reader.data.sqlDialect == dialect.SQLite {
		cte = statisticsBindParameter.ReplaceAllString(cte, `?${1}`)
	}
	return cte, args
}

func validateStatisticsBalances(ctx context.Context, tx *sql.Tx, q biz.BusinessStatisticsQuery, cte string, args []any) error {
	if q.Report != "receivables" {
		return nil
	}
	var invalid int
	if err := tx.QueryRowContext(ctx, cte+` SELECT COUNT(*) FROM balances WHERE balance<0 OR allocated<0 OR credited<0`, args...).Scan(&invalid); err != nil {
		return err
	}
	if invalid > 0 {
		return biz.ErrBadParam
	}
	return nil
}

func (r *businessStatisticsRepo) Statistics(ctx context.Context, q biz.BusinessStatisticsQuery) (*biz.BusinessStatisticsBoard, error) {
	out := &biz.BusinessStatisticsBoard{Report: q.Report, GroupBy: q.GroupBy, Currency: q.Currency, DateFrom: q.DateFrom, DateTo: q.DateTo, SnapshotAt: q.SnapshotAt, Access: q.Access, Groups: []biz.BusinessStatisticsGroup{}}
	err := r.reader.read(ctx, func(tx *sql.Tx) error {
		cte, args := r.query(q)
		if err := validateStatisticsBalances(ctx, tx, q, cte, args); err != nil {
			return err
		}
		metrics := deliveryMetricsSQL
		scan := func(s statisticsScanner, m *biz.BusinessStatisticsMetrics) error {
			return scanDeliveryMetrics(s, m, q.Access.SalesAmounts)
		}
		if q.Report == "receivables" {
			metrics = receivableMetricsSQL
			scan = scanReceivableMetrics
		}
		if err := scan(tx.QueryRowContext(ctx, cte+" SELECT "+metrics+" FROM scope_rows", args...), &out.Counts); err != nil {
			return err
		}
		if err := scan(tx.QueryRowContext(ctx, cte+" SELECT "+metrics+" FROM selected", args...), &out.Totals); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, cte+` SELECT COUNT(DISTINCT group_key) FROM selected`, args...).Scan(&out.Total); err != nil {
			return err
		}
		order := map[string]string{"count": "COUNT(*)", "name": "MIN(group_name)", "overdue": "SUM(overdue)", "amount": "SUM(amount)"}[q.Sort]
		if q.Report == "receivables" && q.Sort == "amount" {
			order = "SUM(balance)"
		}
		args = append(args, q.Limit, q.Offset)
		rows, err := tx.QueryContext(ctx, cte+` SELECT group_key,MIN(group_name),`+metrics+` FROM selected GROUP BY group_key ORDER BY `+order+" "+q.Direction+fmt.Sprintf(",MIN(group_name),group_key LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
		if err != nil {
			return err
		}
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			g := biz.BusinessStatisticsGroup{}
			if err = scan(&statisticsGroupScanner{rows: rows, key: &g.Key, name: &g.Name}, &g.BusinessStatisticsMetrics); err != nil {
				return err
			}
			out.Groups = append(out.Groups, g)
		}
		return rows.Err()
	})
	return out, err
}

type statisticsGroupScanner struct {
	rows      *sql.Rows
	key, name *string
}

func (s *statisticsGroupScanner) Scan(dest ...any) error {
	return s.rows.Scan(append([]any{s.key, s.name}, dest...)...)
}

func (r *businessStatisticsRepo) StatisticsSources(ctx context.Context, q biz.BusinessStatisticsQuery) (*biz.BusinessStatisticsSources, error) {
	out := &biz.BusinessStatisticsSources{DateFrom: q.DateFrom, DateTo: q.DateTo, Rows: []biz.BusinessStatisticsSource{}, SnapshotAt: q.SnapshotAt, Access: q.Access}
	err := r.reader.read(ctx, func(tx *sql.Tx) error {
		cte, args := r.query(q)
		if err := validateStatisticsBalances(ctx, tx, q, cte, args); err != nil {
			return err
		}
		args = append(args, q.GroupKey)
		where := fmt.Sprintf(" WHERE group_key=$%d AND ", len(args)) + statisticsStatusWhere(q.SourceStatus)
		var name sql.NullString
		if err := tx.QueryRowContext(ctx, cte+` SELECT COUNT(*),MIN(group_name) FROM selected`+where, args...).Scan(&out.Total, &name); err != nil {
			return err
		}
		out.GroupName = name.String
		projection := `id,number,customer,product,product_count,due_date,
 CASE WHEN overdue=1 THEN 'overdue' ELSE delivery_status END,owner,unit,
 CAST(ordered_quantity AS TEXT),CAST(shipped_quantity AS TEXT),CAST(CASE WHEN missing_amount=0 THEN amount END AS TEXT),''`
		if q.Report == "receivables" {
			projection = `id,fact_no,group_name,'',0,due_date,aging,'','',NULL,NULL,CAST(balance AS TEXT),source_number`
		}
		args = append(args, q.Limit, q.Offset)
		rows, err := tx.QueryContext(ctx, cte+" SELECT "+projection+" FROM selected"+where+fmt.Sprintf(" ORDER BY overdue DESC,CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,due_date,id LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
		if err != nil {
			return err
		}
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			row := biz.BusinessStatisticsSource{}
			var product, due, ordered, shipped, amount sql.NullString
			if err = rows.Scan(&row.ID, &row.Number, &row.Customer, &product, &row.ProductCount, &due, &row.Status, &row.Owner, &row.Unit, &ordered, &shipped, &amount, &row.SourceNumber); err != nil {
				return err
			}
			row.Product, row.DueDate = product.String, due.String
			if row.OrderedQuantity, err = statisticsDecimal(ordered); err != nil {
				return err
			}
			if row.ShippedQuantity, err = statisticsDecimal(shipped); err != nil {
				return err
			}
			if q.Report == "receivables" || q.Access.SalesAmounts {
				if row.Amount, err = statisticsDecimal(amount); err != nil {
					return err
				}
			}
			out.Rows = append(out.Rows, row)
		}
		return rows.Err()
	})
	return out, err
}
