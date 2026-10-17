package data

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"server/internal/biz"
)

func progressIdentitySource(view string) (table, parent, name string) {
	if view == "production" {
		return "production_order_items", "production_order_id", "COALESCE(NULLIF(z.product_name_snapshot,''),p.name,'未填写产品')"
	}
	return "sales_order_items", "sales_order_id", "COALESCE(NULLIF(z.product_name_snapshot,''),NULLIF(z.requested_product_name,''),p.name,'未填写产品')"
}

// Filtering and representative selection use the same authoritative names,
// numbers and style references. A renamed master cannot override a snapshot.
func progressIdentityMatch(view, key string) string {
	_, _, name := progressIdentitySource(view)
	fields := []string{name, "COALESCE(NULLIF(z.product_code_snapshot,''),p.code)", "p.style_no", "p.customer_style_no"}
	if view != "production" {
		fields = append(fields, "z.requested_product_name", "z.customer_product_no")
	}
	matches := make([]string, 0, len(fields))
	for _, field := range fields {
		matches = append(matches, "lower(COALESCE("+field+",'')) LIKE "+key+" ESCAPE '\\'")
	}
	return "(" + strings.Join(matches, " OR ") + ")"
}

// Only the visible page is summarized, in the same read snapshot as its counts
// and quantities. Matching products never narrow the underlying order facts.
func attachBusinessProgressIdentityMatches(ctx context.Context, tx *sql.Tx, q biz.BusinessProgressQuery, items []*biz.BusinessProgressRow) error {
	if q.Keyword == "" || len(items) == 0 {
		return nil
	}
	pattern := "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(q.Keyword)) + "%"
	args := []any{pattern}
	ids := make([]string, 0, len(items))
	byID := make(map[int]*biz.BusinessProgressRow, len(items))
	for _, item := range items {
		args = append(args, item.ID)
		ids = append(ids, fmt.Sprintf("$%d", len(args)))
		byID[item.ID] = item
	}
	table, parent, name := progressIdentitySource(q.View)
	condition := "z." + parent + " IN (" + strings.Join(ids, ",") + ")"
	if q.View == "orders" {
		condition += " AND z.line_status<>'canceled'"
	}
	query := `WITH candidates AS (
 SELECT z.id,z.line_no,z.` + parent + ` AS parent_id,COALESCE(z.product_id,0) AS product_id,` + name + ` AS name,
 CASE WHEN COALESCE(z.product_id,0)>0 THEN z.product_id ELSE -z.id END AS identity_key,
 CASE WHEN ` + progressIdentityMatch(q.View, "$1") + ` THEN 1 ELSE 0 END AS matched
 FROM ` + table + ` z LEFT JOIN products p ON p.id=z.product_id WHERE ` + condition + `
), ranked AS (
 SELECT *,ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY matched DESC,line_no,id) AS rank FROM candidates
), counts AS (
 SELECT parent_id,COUNT(DISTINCT identity_key) AS total,
 COUNT(DISTINCT CASE WHEN matched=1 THEN identity_key END) AS matches FROM candidates GROUP BY parent_id
)
 SELECT r.parent_id,r.product_id,r.name,c.total,c.matches FROM ranked r
 JOIN counts c ON c.parent_id=r.parent_id WHERE r.rank=1`
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var id, productID, total, matches int
		var productName string
		if err := rows.Scan(&id, &productID, &productName, &total, &matches); err != nil {
			return err
		}
		item := byID[id]
		item.ProductTypeCount, item.ProductMatchCount = total, matches
		if matches > 0 {
			item.Product, item.ProductID = productName, productID
		}
	}
	return rows.Err()
}
