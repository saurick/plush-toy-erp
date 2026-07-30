package data

import (
	"context"
	stdsql "database/sql"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

// readSnapshot keeps count, page rows and derived aggregates on one database
// view. PostgreSQL uses a read-only repeatable-read transaction; isolated
// SQLite tests use the driver default transaction contract.
type readSnapshot struct {
	client *ent.Client
	sqlTx  *stdsql.Tx
	entTx  *ent.Tx
}

func beginReadSnapshot(ctx context.Context, data *Data) (*readSnapshot, error) {
	if data == nil || data.postgres == nil {
		return nil, biz.ErrBadParam
	}
	if data.sqldb == nil {
		tx, err := data.postgres.Tx(ctx)
		if err != nil {
			return nil, err
		}
		return &readSnapshot{client: tx.Client(), entTx: tx}, nil
	}

	sqlDialect := data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	options := &stdsql.TxOptions{}
	if sqlDialect == dialect.Postgres {
		options.Isolation = stdsql.LevelRepeatableRead
		options.ReadOnly = true
	}
	sqlTx, err := data.sqldb.BeginTx(ctx, options)
	if err != nil {
		return nil, err
	}
	client := ent.NewClient(ent.Driver(entsql.NewDriver(
		sqlDialect,
		entsql.Conn{ExecQuerier: sqlTx},
	)))
	return &readSnapshot{client: client, sqlTx: sqlTx}, nil
}

func (s *readSnapshot) Commit() error {
	if s == nil {
		return nil
	}
	if s.sqlTx != nil {
		err := s.sqlTx.Commit()
		s.sqlTx = nil
		return err
	}
	if s.entTx != nil {
		err := s.entTx.Commit()
		s.entTx = nil
		return err
	}
	return nil
}

func (s *readSnapshot) Rollback() {
	if s == nil {
		return
	}
	if s.sqlTx != nil {
		_ = s.sqlTx.Rollback()
		s.sqlTx = nil
	}
	if s.entTx != nil {
		_ = s.entTx.Rollback()
		s.entTx = nil
	}
}
