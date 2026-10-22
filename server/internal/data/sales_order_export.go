package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strings"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent/salesorder"
)

var _ biz.SalesOrderExportRepo = (*salesOrderRepo)(nil)

func (r *salesOrderRepo) ExportSalesOrders(ctx context.Context, query biz.SalesOrderExportQuery) ([]*biz.SalesOrder, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil {
		return nil, biz.ErrBadParam
	}
	snapshot, err := beginReadSnapshot(ctx, r.data)
	if err != nil {
		return nil, err
	}
	defer snapshot.Rollback()
	reader := &salesOrderRepo{data: &Data{postgres: snapshot.client, sqlDialect: r.data.sqlDialect}, log: r.log}
	base := reader.salesOrderListQuery(query.Filter)
	if query.ID > 0 {
		base.Where(salesorder.ID(query.ID))
	}
	ids, err := base.Clone().Order(salesOrderSortOrder(query.Filter), salesorder.ByID(sql.OrderDesc())).
		Limit(biz.SalesOrderExportMaxRows + 1).IDs(ctx)
	if err != nil {
		return nil, err
	}
	if len(ids) > biz.SalesOrderExportMaxRows {
		return nil, biz.ErrSalesOrderExportLimit
	}
	if query.ID > 0 && len(ids) == 0 {
		return nil, biz.ErrSalesOrderNotFound
	}
	orders := []*biz.SalesOrder{}
	if len(ids) > 0 {
		// Check uncompressed stored rows before materializing JSON snapshots in Go.
		// The final public projection has its own encoded response budget.
		if err := checkSalesOrderExportStoredBytes(ctx, snapshot.sqlTx, r.data.sqlDialect, ids); err != nil {
			return nil, err
		}
		rows, err := base.Where(salesorder.IDIn(ids...)).
			Order(salesOrderSortOrder(query.Filter), salesorder.ByID(sql.OrderDesc())).
			Limit(biz.SalesOrderExportMaxRows).All(ctx)
		if err != nil {
			return nil, err
		}
		orders = entSalesOrdersToBiz(rows)
		if err := reader.populateSalesOrderItemCounts(ctx, orders); err != nil {
			return nil, err
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := snapshot.Commit(); err != nil {
		return nil, err
	}
	return orders, nil
}

func checkSalesOrderExportStoredBytes(ctx context.Context, tx *stdsql.Tx, sqlDialect string, ids []int) error {
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	size := "octet_length(row_to_json(o)::text)"
	if sqlDialect == dialect.SQLite {
		fields := make([]string, 0, len(salesorder.Columns)*2)
		for _, column := range salesorder.Columns {
			fields = append(fields, "'"+column+"'", `o."`+column+`"`)
		}
		size = "length(CAST(json_object(" + strings.Join(fields, ",") + ") AS BLOB))"
	}
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	statement := fmt.Sprintf("SELECT COALESCE(SUM(%s),0) FROM sales_orders o WHERE o.id IN (%s)", size,
		strings.Join(inventorySQLPlaceholders(sqlDialect, len(ids)), ","))
	var storedBytes int64
	if err := tx.QueryRowContext(ctx, statement, args...).Scan(&storedBytes); err != nil {
		return err
	}
	if storedBytes > biz.SalesOrderExportMaxBytes {
		return biz.ErrSalesOrderExportLimit
	}
	return nil
}
