package data

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
)

func TestFinanceChinaMonthEndMigrationPostgres(t *testing.T) {
	ctx := context.Background()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	migration, err := os.ReadFile(filepath.Join("model", "migrate", "20261026060500_finance_china_month_end.sql"))
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := os.ReadFile(filepath.Join("..", "..", "..", "scripts", "qa", "finance-china-month-end-preflight.sql"))
	if err != nil {
		t.Fatal(err)
	}
	tx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	// A transaction-local copy keeps the current real constraints while isolating
	// this historical conversion from fixtures owned by other database tests.
	if _, err := tx.ExecContext(ctx, `CREATE TEMP TABLE finance_facts (LIKE public.finance_facts INCLUDING ALL) ON COMMIT DROP`); err != nil {
		t.Fatal(err)
	}
	china := time.FixedZone("Asia/Shanghai", 8*60*60)
	var changedID int
	for index, status := range []string{"DRAFT", "POSTED", "SETTLED", "CANCELLED"} {
		at := time.Date(2026, 9, 1, index, 15, 0, 123456000, china).UTC()
		oldDue := time.Date(at.Year(), at.Month()+1, 0, at.Hour(), at.Minute(), at.Second(), at.Nanosecond(), time.UTC).AddDate(0, 0, 30)
		kind, party := "RECEIVABLE", "CUSTOMER"
		if index%2 == 1 {
			kind, party = "PAYABLE", "SUPPLIER"
		}
		var id int
		err := tx.QueryRowContext(ctx, `INSERT INTO finance_facts
		(fact_no,fact_type,status,version,counterparty_type,counterparty_id,amount,currency,
		 payment_term,payment_term_days,due_at,idempotency_key,occurred_at,created_at,updated_at,
		 posted_at,posted_by,settled_at,settled_by,cancelled_at,cancelled_by,cancel_reason)
		VALUES ($1,$2,$3::varchar,7,$4,1,100,'CNY','EOM_DAYS',30,$5,$1,$6,$6,$6,
		 CASE WHEN $3 <> 'DRAFT' THEN $6::timestamptz END, CASE WHEN $3 <> 'DRAFT' THEN 1 END,
		 CASE WHEN $3 = 'SETTLED' THEN $6::timestamptz END, CASE WHEN $3 = 'SETTLED' THEN 1 END,
		 CASE WHEN $3 = 'CANCELLED' THEN $6::timestamptz END, CASE WHEN $3 = 'CANCELLED' THEN 1 END,
		 CASE WHEN $3 = 'CANCELLED' THEN '历史取消原因' END) RETURNING id`, "EOM-"+status, kind, status, party, oldDue, at).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		changedID = id
	}
	// Cash terms, invoice rows, and already-corrected monthly rows stay unchanged.
	if _, err := tx.ExecContext(ctx, `INSERT INTO finance_facts
		(fact_no,fact_type,counterparty_type,amount,currency,payment_term,payment_term_days,due_at,idempotency_key,occurred_at,created_at,updated_at)
		VALUES ('CASH','PAYABLE','SUPPLIER',10,'CNY','DUE_ON_OCCURRENCE',0,'2026-09-01T00:15:00+08','CASH','2026-09-01T00:15:00+08',now(),now()),
		('INVOICE','INVOICE','CUSTOMER',10,'CNY',NULL,NULL,NULL,'INVOICE','2026-09-01T00:15:00+08',now(),now()),
		('CORRECTED','RECEIVABLE','CUSTOMER',10,'CNY','EOM_DAYS',30,'2026-10-30T00:15:00+08','CORRECTED','2026-09-01T00:15:00+08',now(),now())`); err != nil {
		t.Fatal(err)
	}
	snapshot := func(excludeCorrectedFields bool) string {
		t.Helper()
		projection := "to_jsonb(f)"
		if excludeCorrectedFields {
			projection += " - 'due_at' - 'version' - 'updated_at'"
		}
		var result string
		if err := tx.QueryRowContext(ctx, "SELECT jsonb_agg("+projection+" ORDER BY id)::text FROM finance_facts f").Scan(&result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	before := snapshot(true)
	if _, err := tx.ExecContext(ctx, string(preflight)); err != nil {
		t.Fatalf("read-only review: %v", err)
	}
	if _, err := tx.ExecContext(ctx, string(migration)); err != nil {
		t.Fatalf("convert populated finance facts: %v", err)
	}
	if after := snapshot(true); before != after {
		t.Fatalf("migration changed amounts, source, terms, or posting audit: before=%s after=%s", before, after)
	}
	rows, err := tx.QueryContext(ctx, `SELECT fact_no, occurred_at, due_at, version FROM finance_facts WHERE payment_term='EOM_DAYS' ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var no string
		var occurred, due time.Time
		var version int
		if err := rows.Scan(&no, &occurred, &due, &version); err != nil {
			t.Fatal(err)
		}
		days := 30
		want, err := biz.FinanceFactDueAtFromDays(occurred, &days)
		wantVersion := 8
		if no == "CORRECTED" {
			wantVersion = 1
		}
		if err != nil || !due.Equal(*want) || version != wantVersion {
			t.Fatalf("%s due=%s want=%v version=%d", no, due, want, version)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	beforeReplay := snapshot(false)
	if _, err := tx.ExecContext(ctx, string(migration)); err != nil || snapshot(false) != beforeReplay {
		t.Fatalf("replay changed corrected values or audit: %v", err)
	}
	for _, invalid := range []string{"occurred_at + INTERVAL '123 days'", "NULL"} {
		if _, err := tx.ExecContext(ctx, `SAVEPOINT invalid_due; ALTER TABLE finance_facts DROP CONSTRAINT finance_facts_due_at_bundle`); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.ExecContext(ctx, "UPDATE finance_facts SET due_at="+invalid+" WHERE id=$1", changedID); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.ExecContext(ctx, string(migration)); err == nil || !strings.Contains(err.Error(), "noncanonical due dates") {
			t.Fatalf("historical %s must block migration: %v", invalid, err)
		}
		if _, err := tx.ExecContext(ctx, `ROLLBACK TO SAVEPOINT invalid_due`); err != nil {
			t.Fatal(err)
		}
		if snapshot(false) != beforeReplay {
			t.Fatal("failed migration did not roll back exactly")
		}
	}
}
