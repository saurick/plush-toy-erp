package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"math/big"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorder"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
)

// Number allocation and draft writes share one transaction lock, including
// manual numbers, so a concurrent save cannot claim the next automatic number.
// The unique order_no index remains the final constraint.
const salesOrderNumberLock int64 = 0x53414c45534e4f

// Ent UpdateOne may request a nested graph transaction. All statements already
// belong to the draft SQL transaction; only salesOrderDraftTx may finish it.
type salesOrderDraftDriver struct {
	*entsql.Driver
}

func (driver salesOrderDraftDriver) Tx(context.Context) (dialect.Tx, error) {
	return dialect.NopTx(driver.Driver), nil
}

func (salesOrderDraftDriver) Close() error { return nil }

type salesOrderDraftTx struct {
	*ent.Client
	sqlTx *stdsql.Tx
	entTx *ent.Tx
}

func beginSalesOrderDraftTx(ctx context.Context, data *Data) (*salesOrderDraftTx, error) {
	if data.sqldb == nil {
		// Ent-only SQLite fixtures use their normal transaction; production
		// PostgreSQL must provide the SQL handle for the cross-process lock.
		if data.sqlDialect == dialect.Postgres {
			return nil, biz.ErrBadParam
		}
		tx, err := data.postgres.Tx(ctx)
		if err != nil {
			return nil, err
		}
		return &salesOrderDraftTx{Client: tx.Client(), entTx: tx}, nil
	}
	sqlDialect := data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	tx, err := data.sqldb.BeginTx(ctx, &stdsql.TxOptions{Isolation: stdsql.LevelReadCommitted})
	if err != nil {
		return nil, err
	}
	if sqlDialect == dialect.Postgres {
		if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", salesOrderNumberLock); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	client := newBusinessEntClient(ent.Driver(salesOrderDraftDriver{entsql.NewDriver(sqlDialect, entsql.Conn{ExecQuerier: tx})}))
	// Preserve aggregate hooks registered on the application client, including
	// failures that must roll back the entire header-and-items save.
	client.SalesOrder.Use(data.postgres.SalesOrder.Hooks()...)
	client.SalesOrderItem.Use(data.postgres.SalesOrderItem.Hooks()...)
	return &salesOrderDraftTx{Client: client, sqlTx: tx}, nil
}

func (tx *salesOrderDraftTx) Commit() error {
	if tx.sqlTx != nil {
		err := tx.sqlTx.Commit()
		if err == nil {
			tx.sqlTx = nil
		}
		return err
	}
	err := tx.entTx.Commit()
	if err == nil {
		tx.entTx = nil
	}
	return err
}

func (tx *salesOrderDraftTx) rollback(ctx context.Context, logger *log.Helper) {
	if tx.sqlTx != nil {
		rollbackSQLTx(ctx, tx.sqlTx, logger)
	} else if tx.entTx != nil {
		rollbackEntTx(ctx, tx.entTx, logger)
	}
}

func allocateSalesOrderNumber(ctx context.Context, client *ent.Client, orderDate time.Time) (string, error) {
	prefix := "SO-" + orderDate.UTC().Format("20060102") + "-"
	// Prefix matching must not depend on database collation ordering punctuation.
	// Canceled/closed orders still occupy their numbers.
	numbers, err := client.SalesOrder.Query().
		Where(salesorder.OrderNoHasPrefix(prefix)).
		Select(salesorder.FieldOrderNo).Strings(ctx)
	if err != nil {
		return "", err
	}
	maximum := new(big.Int)
	for _, number := range numbers {
		suffix := strings.TrimPrefix(number, prefix)
		if suffix == "" || strings.IndexFunc(suffix, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
			continue
		}
		value, ok := new(big.Int).SetString(suffix, 10)
		if ok && value.Cmp(maximum) > 0 {
			maximum = value
		}
	}
	maximum.Add(maximum, big.NewInt(1))
	number := prefix + fmt.Sprintf("%03s", maximum.String())
	if len(number) > 64 {
		return "", biz.ErrBadParam
	}
	return number, nil
}
