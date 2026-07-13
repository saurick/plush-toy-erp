package data

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestCustomerConfigPostgresSingleActiveIndexRejectsDuplicate(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	customerKey := "customer-config-index-" + strings.ToLower(postgresTestSuffix())
	now := time.Now().UTC()

	if _, err := data.sqldb.ExecContext(ctx, `
INSERT INTO customer_config_revisions
  (customer_key, revision, product_version, config_hash, status, compiled_snapshot, published_by, published_at, activated_by, activated_at, created_at, updated_at)
VALUES
  ($1, 'rev-1', 'local-test', 'hash-1', 'active', '{}'::jsonb, 1, $2, 1, $2, $2, $2)`, customerKey, now); err != nil {
		t.Fatalf("insert first active revision: %v", err)
	}
	_, err := data.sqldb.ExecContext(ctx, `
INSERT INTO customer_config_revisions
  (customer_key, revision, product_version, config_hash, status, compiled_snapshot, published_by, published_at, activated_by, activated_at, created_at, updated_at)
VALUES
  ($1, 'rev-2', 'local-test', 'hash-2', 'active', '{}'::jsonb, 1, $2, 1, $2, $2, $2)`, customerKey, now)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Fatalf("second active revision error = %v, want PostgreSQL 23505", err)
	}
}

func TestCustomerConfigPostgresConcurrentActivationKeepsOneActive(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	customerKey := "customer-config-race-" + strings.ToLower(postgresTestSuffix())
	now := time.Now().UTC()

	for index, revision := range []string{"rev-a", "rev-b"} {
		if _, err := data.sqldb.ExecContext(ctx, `
INSERT INTO customer_config_revisions
  (customer_key, revision, product_version, config_hash, status, compiled_snapshot, published_by, published_at, created_at, updated_at)
VALUES
  ($1, $2, 'local-test', $3, 'published', '{}'::jsonb, 1, $4, $4, $4)`, customerKey, revision, "hash-"+revision, now.Add(time.Duration(index)*time.Millisecond)); err != nil {
			t.Fatalf("insert %s: %v", revision, err)
		}
	}

	start := make(chan struct{})
	errorsByRevision := make(chan error, 2)
	var wg sync.WaitGroup
	for index, revision := range []string{"rev-a", "rev-b"} {
		index, revision := index, revision
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := repo.ActivateCustomerConfig(ctx, customerKey, revision, 10+index, now.Add(time.Duration(index+1)*time.Second))
			errorsByRevision <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errorsByRevision)
	for err := range errorsByRevision {
		if err != nil {
			t.Fatalf("concurrent activation: %v", err)
		}
	}

	var activeCount int
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT count(*)
FROM customer_config_revisions
WHERE customer_key = $1 AND status = 'active'`, customerKey).Scan(&activeCount); err != nil {
		t.Fatalf("count active revisions: %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("active revision count = %d, want 1", activeCount)
	}

	var auditCount int
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT count(*)
FROM runtime_audit_events
WHERE source = 'customer_config'
  AND event_type = 'customer_config_control_plane'
  AND payload::jsonb->'target'->>'key' LIKE $1`, customerKey+"/%").Scan(&auditCount); err != nil {
		t.Fatalf("count activation audit events: %v", err)
	}
	if auditCount != 2 {
		t.Fatalf("activation audit count = %d, want 2", auditCount)
	}
}
