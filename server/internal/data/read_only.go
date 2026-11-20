package data

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"server/internal/data/model/ent"
)

// NewReadOnlyData reuses the repositories without the application startup's
// RBAC/account initialization. PostgreSQL enforces read-only on every connection.
func NewReadOnlyData(ctx context.Context, dsn string, logger log.Logger) (*Data, func(), error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, nil, errors.New("invalid read-only database configuration")
	}
	cfg.ConnectTimeout = 5 * time.Second
	cfg.RuntimeParams["default_transaction_read_only"] = "on"
	cfg.RuntimeParams["statement_timeout"] = "10000"
	db := stdlib.OpenDB(*cfg)
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(2)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, nil, errors.New("read-only database connection unavailable")
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	return &Data{
		log: log.NewHelper(logger), postgres: client, sqldb: db, sqlDialect: dialect.Postgres,
	}, func() { _ = client.Close() }, nil
}
