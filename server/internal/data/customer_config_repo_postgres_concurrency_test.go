package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestCustomerConfigPostgresSingleActiveIndexRejectsDuplicate(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	customerKey := "customer-config-index-" + strings.ToLower(postgresTestSuffix())
	now := time.Now().UTC()

	for index, revision := range []string{"rev-1", "rev-2"} {
		in := customerConfigPostgresPublishInput(customerKey, revision, "index")
		if _, err := repo.PublishCustomerConfig(ctx, in, "hash-"+revision, 1, now.Add(time.Duration(index)*time.Millisecond)); err != nil {
			t.Fatalf("publish %s: %v", revision, err)
		}
	}
	if _, err := data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET status = 'active', activated_by = 1, activated_at = $2, updated_at = $2
		WHERE customer_key = $1 AND revision = 'rev-1'`, customerKey, now.Add(time.Second)); err != nil {
		t.Fatalf("activate first revision: %v", err)
	}
	_, err := data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET status = 'active', activated_by = 1, activated_at = $2, updated_at = $2
		WHERE customer_key = $1 AND revision = 'rev-2'`, customerKey, now.Add(2*time.Second))
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
		in := customerConfigPostgresPublishInput(customerKey, revision, "race")
		if _, err := repo.PublishCustomerConfig(ctx, in, "hash-"+revision, 1, now.Add(time.Duration(index)*time.Millisecond)); err != nil {
			t.Fatalf("publish %s: %v", revision, err)
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
			_, err := repo.ActivateCustomerConfig(
				ctx,
				customerKey,
				revision,
				"hash-"+revision,
				"product-v1",
				"",
				10+index,
				now.Add(time.Duration(index+1)*time.Second),
			)
			errorsByRevision <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errorsByRevision)
	successCount := 0
	conflictCount := 0
	for err := range errorsByRevision {
		switch {
		case err == nil:
			successCount++
		case errors.Is(err, biz.ErrCustomerConfigActiveRevisionChanged):
			conflictCount++
		default:
			t.Fatalf("concurrent activation: %v", err)
		}
	}
	if successCount != 1 || conflictCount != 1 {
		t.Fatalf("activation success/conflict = %d/%d, want 1/1", successCount, conflictCount)
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
  AND event_key = 'customer_config.activate'
  AND payload::jsonb->'target'->>'key' LIKE $1`, customerKey+"/%").Scan(&auditCount); err != nil {
		t.Fatalf("count activation audit events: %v", err)
	}
	if auditCount != 1 {
		t.Fatalf("activation audit count = %d, want 1", auditCount)
	}
}

func TestCustomerConfigPostgresPublishRevisionIsImmutableAndIdempotent(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	customerKey := "cc-publish-" + strings.ToLower(postgresTestSuffix())
	in := customerConfigPostgresPublishInput(customerKey, "rev-1", "original")
	publishedAt := time.Now().UTC().Truncate(time.Microsecond)

	first, err := repo.PublishCustomerConfig(ctx, in, "hash-1", 10, publishedAt)
	if err != nil {
		t.Fatalf("first publish: %v", err)
	}
	before := customerConfigPostgresExpandedRowStamps(t, ctx, data, customerKey, in.Revision)

	retry := customerConfigPostgresPublishInput(customerKey, "rev-1", "must-not-overwrite")
	replayed, err := repo.PublishCustomerConfig(ctx, retry, "hash-1", 11, publishedAt.Add(time.Hour))
	if err != nil {
		t.Fatalf("same identity replay: %v", err)
	}
	if replayed.ID != first.ID || replayed.PublishedBy == nil || first.PublishedBy == nil || *replayed.PublishedBy != *first.PublishedBy || replayed.PublishedAt == nil || first.PublishedAt == nil || !replayed.PublishedAt.Equal(*first.PublishedAt) || !replayed.CreatedAt.Equal(first.CreatedAt) || !replayed.UpdatedAt.Equal(first.UpdatedAt) {
		t.Fatalf("replay must return original revision: first=%#v replayed=%#v", first, replayed)
	}
	after := customerConfigPostgresExpandedRowStamps(t, ctx, data, customerKey, in.Revision)
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("replay rewrote expanded rows: before=%#v after=%#v", before, after)
	}
	var moduleReason string
	if err := data.sqldb.QueryRowContext(ctx, `
	SELECT reason
	FROM deployment_module_states
	WHERE customer_key = $1 AND config_revision = $2 AND module_key = 'customers'`, customerKey, in.Revision).Scan(&moduleReason); err != nil {
		t.Fatalf("read module reason: %v", err)
	}
	if moduleReason != "original" {
		t.Fatalf("same identity replay changed expanded content: reason=%q", moduleReason)
	}
	if count := customerConfigPostgresPublishAuditCount(t, ctx, data, customerKey, in.Revision); count != 1 {
		t.Fatalf("publish audit count = %d, want 1", count)
	}

	if _, err := repo.PublishCustomerConfig(ctx, in, "hash-2", 12, publishedAt.Add(2*time.Hour)); !errors.Is(err, biz.ErrCustomerConfigRevisionImmutable) {
		t.Fatalf("different hash error = %v, want ErrCustomerConfigRevisionImmutable", err)
	}
	differentProduct := in
	differentProduct.ProductVersion = "product-v2"
	if _, err := repo.PublishCustomerConfig(ctx, differentProduct, "hash-1", 12, publishedAt.Add(2*time.Hour)); !errors.Is(err, biz.ErrCustomerConfigRevisionImmutable) {
		t.Fatalf("different product version error = %v, want ErrCustomerConfigRevisionImmutable", err)
	}
	stored, err := repo.GetCustomerConfigRevision(ctx, customerKey, in.Revision)
	if err != nil {
		t.Fatalf("read stored revision: %v", err)
	}
	if stored.ConfigHash != "hash-1" || stored.ProductVersion != "product-v1" || stored.PublishedBy == nil || *stored.PublishedBy != 10 || stored.PublishedAt == nil || !stored.PublishedAt.Equal(publishedAt) {
		t.Fatalf("immutable revision changed after conflict: %#v", stored)
	}
	if count := customerConfigPostgresPublishAuditCount(t, ctx, data, customerKey, in.Revision); count != 1 {
		t.Fatalf("conflicts must not append publish audit, got %d", count)
	}
}

func TestCustomerConfigPostgresPublishedRevisionAndProjectionsRejectTampering(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	customerKey := "cc-immutable-" + strings.ToLower(postgresTestSuffix())
	in := customerConfigPostgresPublishInput(customerKey, "rev-1", "immutable")
	publishedAt := time.Now().UTC().Truncate(time.Microsecond)

	if _, err := repo.PublishCustomerConfig(ctx, in, "hash-immutable", 10, publishedAt); err != nil {
		t.Fatalf("publish immutable fixture: %v", err)
	}

	_, err := data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET compiled_snapshot = '{"tampered":true}'::jsonb
		WHERE customer_key = $1 AND revision = $2`, customerKey, in.Revision)
	assertCustomerConfigPostgresCheckViolation(t, err)
	_, err = data.sqldb.ExecContext(ctx, `
		DELETE FROM customer_config_revisions
		WHERE customer_key = $1 AND revision = $2`, customerKey, in.Revision)
	assertCustomerConfigPostgresCheckViolation(t, err)
	_, err = data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET status = 'building', updated_at = NOW()
		WHERE customer_key = $1 AND revision = $2`, customerKey, in.Revision)
	assertCustomerConfigPostgresCheckViolation(t, err)
	_, err = data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET status = 'preview', updated_at = NOW()
		WHERE customer_key = $1 AND revision = $2`, customerKey, in.Revision)
	assertCustomerConfigPostgresCheckViolation(t, err)

	for _, tableName := range []string{
		"deployment_module_states",
		"role_profiles",
		"access_entitlements",
		"work_pools",
		"work_pool_memberships",
	} {
		t.Run(tableName, func(t *testing.T) {
			updateQuery := fmt.Sprintf(`UPDATE %s SET updated_at = NOW() WHERE customer_key = $1 AND config_revision = $2`, tableName)
			_, err := data.sqldb.ExecContext(ctx, updateQuery, customerKey, in.Revision)
			assertCustomerConfigPostgresCheckViolation(t, err)

			deleteQuery := fmt.Sprintf(`DELETE FROM %s WHERE customer_key = $1 AND config_revision = $2`, tableName)
			_, err = data.sqldb.ExecContext(ctx, deleteQuery, customerKey, in.Revision)
			assertCustomerConfigPostgresCheckViolation(t, err)

			insertQuery := fmt.Sprintf(`INSERT INTO %s SELECT * FROM %s WHERE customer_key = $1 AND config_revision = $2`, tableName, tableName)
			_, err = data.sqldb.ExecContext(ctx, insertQuery, customerKey, in.Revision)
			assertCustomerConfigPostgresCheckViolation(t, err)
		})
	}

	if _, err := data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET status = 'active', activated_by = 10, activated_at = $3, updated_at = $3
		WHERE customer_key = $1 AND revision = $2`, customerKey, in.Revision, publishedAt.Add(time.Second)); err != nil {
		t.Fatalf("lifecycle-only revision update must remain allowed: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `
		UPDATE customer_config_revisions
		SET status = 'building', updated_at = NOW()
		WHERE customer_key = $1 AND revision = $2`, customerKey, in.Revision)
	assertCustomerConfigPostgresCheckViolation(t, err)
}

func assertCustomerConfigPostgresCheckViolation(t *testing.T, err error) {
	t.Helper()
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("tamper error = %v, want PostgreSQL 23514", err)
	}
}

func TestCustomerConfigPostgresConcurrentPublishHasOneImmutableContent(t *testing.T) {
	t.Run("same identity is exact replay", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		data, _ := openPurchaseReceiptPostgresTestData(t)
		repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
		customerKey := "cc-pub-same-" + strings.ToLower(postgresTestSuffix())
		in := customerConfigPostgresPublishInput(customerKey, "rev-1", "same")
		start := make(chan struct{})
		results := make(chan customerConfigPostgresPublishResult, 2)
		var wg sync.WaitGroup
		for index := 0; index < 2; index++ {
			index := index
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				item, err := repo.PublishCustomerConfig(ctx, in, "hash-same", 20+index, time.Now().UTC().Add(time.Duration(index)*time.Second))
				results <- customerConfigPostgresPublishResult{item: item, err: err}
			}()
		}
		close(start)
		wg.Wait()
		close(results)
		var revisionID int
		for result := range results {
			if result.err != nil {
				t.Fatalf("same identity concurrent publish: %v", result.err)
			}
			if revisionID == 0 {
				revisionID = result.item.ID
			} else if result.item.ID != revisionID {
				t.Fatalf("same identity returned different revisions: got %d and %d", revisionID, result.item.ID)
			}
		}
		if count := customerConfigPostgresPublishAuditCount(t, ctx, data, customerKey, in.Revision); count != 1 {
			t.Fatalf("same identity publish audit count = %d, want 1", count)
		}
	})

	t.Run("different identity has one winner", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		data, _ := openPurchaseReceiptPostgresTestData(t)
		repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
		customerKey := "cc-pub-diff-" + strings.ToLower(postgresTestSuffix())
		candidates := []struct {
			marker string
			hash   string
		}{
			{marker: "candidate-a", hash: "hash-a"},
			{marker: "candidate-b", hash: "hash-b"},
		}
		start := make(chan struct{})
		results := make(chan customerConfigPostgresPublishResult, len(candidates))
		var wg sync.WaitGroup
		for index, candidate := range candidates {
			index, candidate := index, candidate
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				in := customerConfigPostgresPublishInput(customerKey, "rev-1", candidate.marker)
				item, err := repo.PublishCustomerConfig(ctx, in, candidate.hash, 30+index, time.Now().UTC().Add(time.Duration(index)*time.Second))
				results <- customerConfigPostgresPublishResult{marker: candidate.marker, hash: candidate.hash, item: item, err: err}
			}()
		}
		close(start)
		wg.Wait()
		close(results)

		var winner customerConfigPostgresPublishResult
		winnerCount := 0
		conflictCount := 0
		for result := range results {
			switch {
			case result.err == nil:
				winner = result
				winnerCount++
			case errors.Is(result.err, biz.ErrCustomerConfigRevisionImmutable):
				conflictCount++
			default:
				t.Fatalf("unexpected concurrent publish error: %v", result.err)
			}
		}
		if winnerCount != 1 || conflictCount != 1 {
			t.Fatalf("winner/conflict = %d/%d, want 1/1", winnerCount, conflictCount)
		}
		stored, err := repo.GetCustomerConfigRevision(ctx, customerKey, "rev-1")
		if err != nil {
			t.Fatalf("read winner revision: %v", err)
		}
		if stored.ConfigHash != winner.hash || winner.item == nil || stored.ID != winner.item.ID {
			t.Fatalf("stored revision does not match winner: stored=%#v winner=%#v", stored, winner)
		}
		var moduleReason string
		if err := data.sqldb.QueryRowContext(ctx, `
		SELECT reason
		FROM deployment_module_states
		WHERE customer_key = $1 AND config_revision = 'rev-1' AND module_key = 'customers'`, customerKey).Scan(&moduleReason); err != nil {
			t.Fatalf("read winner module state: %v", err)
		}
		if moduleReason != winner.marker {
			t.Fatalf("expanded rows do not match winner: reason=%q winner=%q", moduleReason, winner.marker)
		}
		if count := customerConfigPostgresPublishAuditCount(t, ctx, data, customerKey, "rev-1"); count != 1 {
			t.Fatalf("different identity publish audit count = %d, want 1", count)
		}
	})
}

type customerConfigPostgresPublishResult struct {
	marker string
	hash   string
	item   *biz.CustomerConfigRevision
	err    error
}

type customerConfigPostgresExpandedRowStamp struct {
	ID        int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func customerConfigPostgresPublishInput(customerKey, revision, marker string) biz.CustomerConfigPublishInput {
	return biz.CustomerConfigPublishInput{
		CustomerKey:    customerKey,
		Revision:       revision,
		ProductVersion: "product-v1",
		CompiledSnapshot: map[string]any{
			"customer": map[string]any{"key": customerKey, "name": marker},
			"pages":    []any{"global-dashboard"},
		},
		ModuleStates: []biz.DeploymentModuleStateInput{
			{ModuleKey: "customers", ContractVersion: "v1", State: "enabled", Reason: marker},
		},
		RoleProfiles: []biz.RoleProfileInput{
			{RoleKey: "admin", DisplayName: "配置管理员 " + marker},
		},
		AccessEntitlements: []biz.AccessEntitlementInput{
			{RoleKey: "admin", CapabilityKey: "customer.config.read", ScopeType: "customer", ScopeValue: customerKey, Enabled: true},
		},
		WorkPools: []biz.WorkPoolInput{
			{PoolKey: "admin", ModuleKey: "system", DisplayName: "配置池 " + marker},
		},
		WorkPoolMemberships: []biz.WorkPoolMembershipInput{
			{PoolKey: "admin", RoleKey: "admin", Strategy: "role_pool", Enabled: true},
		},
	}
}

func customerConfigPostgresExpandedRowStamps(t *testing.T, ctx context.Context, data *Data, customerKey, revision string) map[string]customerConfigPostgresExpandedRowStamp {
	t.Helper()
	out := map[string]customerConfigPostgresExpandedRowStamp{}
	for _, tableName := range []string{
		"deployment_module_states",
		"role_profiles",
		"access_entitlements",
		"work_pools",
		"work_pool_memberships",
	} {
		var item customerConfigPostgresExpandedRowStamp
		query := fmt.Sprintf("SELECT id, created_at, updated_at FROM %s WHERE customer_key = $1 AND config_revision = $2", tableName)
		if err := data.sqldb.QueryRowContext(ctx, query, customerKey, revision).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt); err != nil {
			t.Fatalf("read %s stamp: %v", tableName, err)
		}
		out[tableName] = item
	}
	return out
}

func customerConfigPostgresPublishAuditCount(t *testing.T, ctx context.Context, data *Data, customerKey, revision string) int {
	t.Helper()
	var count int
	if err := data.sqldb.QueryRowContext(ctx, `
	SELECT count(*)
	FROM runtime_audit_events
	WHERE source = 'customer_config'
	  AND event_type = 'customer_config_control_plane'
	  AND event_key = 'customer_config.publish'
	  AND payload::jsonb->'target'->>'key' = $1`, customerKey+"/"+revision).Scan(&count); err != nil {
		t.Fatalf("count publish audit events: %v", err)
	}
	return count
}
