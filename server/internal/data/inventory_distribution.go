package data

import (
	"context"
	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent/inventorybalance"
)

func inventoryBalanceReservationCTEs(source string) string {
	return `reservations AS (
 SELECT b.id AS balance_id,SUM(s.quantity) AS quantity FROM ` + source + ` b JOIN stock_reservations s
 ON s.product_id=b.subject_id AND s.warehouse_id=b.warehouse_id AND s.unit_id=b.unit_id
 AND s.product_sku_id IS NOT DISTINCT FROM b.product_sku_id AND s.lot_id IS NOT DISTINCT FROM b.lot_id
 WHERE b.subject_type='PRODUCT' AND s.status='ACTIVE' GROUP BY b.id
 ), available AS (
 SELECT b.*,COALESCE(s.quantity,0) AS active_reserved_quantity,
 CASE WHEN b.quantity>COALESCE(s.quantity,0) THEN b.quantity-COALESCE(s.quantity,0) ELSE 0 END AS available_quantity
 FROM ` + source + ` b LEFT JOIN reservations s ON s.balance_id=b.id
 )`
}

func (r *inventoryRepo) GetInventoryDistributionForAccess(ctx context.Context, filter biz.InventoryBalanceFilter, scope biz.WarehouseDataScope) ([]biz.InventoryDistributionRow, error) {
	scope = biz.NormalizeWarehouseDataScope(scope)
	out := []biz.InventoryDistributionRow{}
	if scope.Mode != biz.DataScopeModeAll && scope.Mode != biz.DataScopeModeAssigned {
		return out, nil
	}
	dialectName := r.data.sqlDialect
	if dialectName == "" {
		dialectName = dialect.Postgres
	}
	builder := entsql.Dialect(dialectName)
	table := builder.Table(inventorybalance.Table)
	selected := builder.Select(table.Columns(inventorybalance.Columns...)...).From(table)
	for _, p := range inventoryBalancePredicates(filter, scope) {
		p(selected)
	}
	query, args := selected.Query()
	query = `WITH candidates AS (` + query + `), ` + inventoryBalanceReservationCTEs("candidates") + `
 SELECT b.warehouse_id,w.name,w.code,COUNT(*),
 COUNT(DISTINCT b.subject_type || ':' || CAST(b.subject_id AS TEXT) || ':' || CAST(COALESCE(b.product_sku_id,0) AS TEXT)),
 SUM(CASE WHEN b.available_quantity>0 THEN 1 ELSE 0 END),SUM(CASE WHEN b.available_quantity<=0 THEN 1 ELSE 0 END)
 FROM available b JOIN warehouses w ON w.id=b.warehouse_id GROUP BY b.warehouse_id,w.name,w.code ORDER BY COUNT(*) DESC,w.name,b.warehouse_id`
	rows, err := r.data.sqldb.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var row biz.InventoryDistributionRow
		if err := rows.Scan(&row.WarehouseID, &row.WarehouseName, &row.WarehouseCode, &row.RecordCount, &row.StockCount, &row.AvailableRecordCount, &row.UnavailableRecordCount); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
