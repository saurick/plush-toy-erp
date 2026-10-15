package data

import (
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestReadOnlyDataInvalidConfigDoesNotDiscloseCredentials(t *testing.T) {
	_, _, err := NewReadOnlyData(context.Background(), "postgres://user:secret@example.invalid:bad/db", log.NewStdLogger(io.Discard))
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("expected sanitized configuration error, got %v", err)
	}
}

func TestDatabaseGovernancePostgresReadOnlyDataRejectsWrites(t *testing.T) {
	if os.Getenv("PURCHASE_RECEIPT_PG_TEST") != "1" {
		t.Skip("set PURCHASE_RECEIPT_PG_TEST=1 and PURCHASE_RECEIPT_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PURCHASE_RECEIPT_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PURCHASE_RECEIPT_PG_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PURCHASE_RECEIPT_PG_TEST_DB_URL or PURCHASE_RECEIPT_PG_DB_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, cleanup, err := NewReadOnlyData(ctx, dsn, log.NewStdLogger(io.Discard))
	if err != nil {
		t.Fatal("cannot establish read-only test connection")
	}
	defer cleanup()
	var mode string
	if err := db.SQLDB().QueryRowContext(ctx, "SHOW transaction_read_only").Scan(&mode); err != nil || mode != "on" {
		t.Fatal("PostgreSQL did not enforce read-only")
	}
	// Even an empty mutation must be rejected. A regression cannot change rows.
	_, err = db.SQLDB().ExecContext(ctx, "UPDATE roles SET name = name WHERE false")
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "25006" {
		t.Fatal("PostgreSQL did not reject an empty write with read_only_sql_transaction")
	}
}
