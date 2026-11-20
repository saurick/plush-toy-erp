package data

import (
	"context"
	"database/sql"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

// All task search consumers share the same snapshot and query execution policy.
// JIT compilation dominates interactive cross-source searches; SET LOCAL keeps
// the setting inside this transaction, including cancellation and failure.
func (r *workflowRepo) readWorkflowSnapshot(ctx context.Context, keyword string, read func(*ent.Client) error) error {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return biz.ErrBadParam
	}
	if r.data.sqldb == nil {
		tx, err := r.data.postgres.Tx(ctx)
		if err != nil {
			return err
		}
		defer func() { rollbackEntTx(ctx, tx, r.log) }()
		if err := read(tx.Client()); err != nil {
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		tx = nil
		return nil
	}
	d := r.data.sqlDialect
	if d == "" {
		d = dialect.Postgres
	}
	options := &sql.TxOptions{}
	if d == dialect.Postgres {
		options.Isolation, options.ReadOnly = sql.LevelRepeatableRead, true
	}
	tx, err := r.data.sqldb.BeginTx(ctx, options)
	if err != nil {
		return err
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()
	if d == dialect.Postgres && keyword != "" {
		if _, err := tx.ExecContext(ctx, "SET LOCAL jit = off"); err != nil {
			return err
		}
	}
	client := newBusinessEntClient(ent.Driver(entsql.NewDriver(d, entsql.Conn{ExecQuerier: tx})))
	if err := read(client); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil
	return nil
}

// Consumers choose their projection; responsibility filtering has one owner.
func workflowTaskVisibilitySQL(scope *biz.WorkflowTaskVisibilityScope, columns ...string) (string, []any) {
	builder := entsql.Dialect(dialect.Postgres)
	table := builder.Table(workflowtask.Table)
	if len(columns) == 0 {
		columns = workflowtask.Columns
	}
	query := builder.Select(table.Columns(columns...)...).From(table)
	if scope == nil {
		query.Where(entsql.False())
	} else {
		workflowTaskRevisionVisibilityPredicate(scope, "")(query)
	}
	return query.Query()
}
