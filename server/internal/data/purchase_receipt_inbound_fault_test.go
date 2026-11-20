package data

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
)

// The repository opens its own transaction client, so inject at the SQL
// connection and retain the real transaction, schema and business hooks.
type partialInboundFaultConnector struct {
	base     driver.Driver
	dsn      string
	enabled  bool
	inserts  int
	injected error
}

func (c *partialInboundFaultConnector) Driver() driver.Driver { return c.base }

func (c *partialInboundFaultConnector) Connect(context.Context) (driver.Conn, error) {
	conn, err := c.base.Open(c.dsn)
	if err != nil {
		return nil, err
	}
	return &partialInboundFaultConn{Conn: conn, fault: c}, nil
}

type partialInboundFaultConn struct {
	driver.Conn
	fault *partialInboundFaultConnector
}

func (c *partialInboundFaultConn) BeginTx(ctx context.Context, options driver.TxOptions) (driver.Tx, error) {
	return c.Conn.(driver.ConnBeginTx).BeginTx(ctx, options)
}

func (c *partialInboundFaultConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	return c.Conn.(driver.ExecerContext).ExecContext(ctx, query, args)
}

func (c *partialInboundFaultConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if c.fault.enabled && (strings.HasPrefix(query, "INSERT INTO `inventory_txns`") || strings.HasPrefix(query, `INSERT INTO "inventory_txns"`)) {
		c.fault.inserts++
		if c.fault.inserts == 2 {
			return nil, c.fault.injected
		}
	}
	return c.Conn.(driver.QueryerContext).QueryContext(ctx, query, args)
}

func injectSecondInboundFailure(t *testing.T, data *Data, fixtureKey string) *partialInboundFaultConnector {
	t.Helper()
	if data.sqlDialect != dialect.SQLite {
		t.Fatal("partial inbound fault fixture requires SQLite")
	}
	fault := &partialInboundFaultConnector{
		base:     data.sqldb.Driver(),
		dsn:      "file:" + fixtureKey + "?mode=memory&cache=shared&_fk=1&_busy_timeout=5000",
		enabled:  true,
		injected: errors.New("simulated second inbound failure"),
	}
	original := data.sqldb
	wrapped := sql.OpenDB(fault)
	wrapped.SetMaxOpenConns(1)
	data.sqldb = wrapped
	t.Cleanup(func() {
		data.sqldb = original
		_ = wrapped.Close()
	})
	return fault
}
