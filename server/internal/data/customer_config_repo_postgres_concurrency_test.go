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
	"server/internal/data/model/ent/workflowtask"

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

func TestCustomerConfigPostgresCountOpenWorkflowTasksUsesRuntimeTaskCategoriesAndFallbackRoles(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	suffix := strings.ToLower(postgresTestSuffix())
	taskCodePrefix := "customer-config-open-" + suffix
	sourceType := "config-transition-test-" + suffix
	activeRevision := "rev-active-" + suffix
	otherRevision := "rev-other-" + suffix
	ownerPoolKey := "pool-active-" + suffix
	otherPoolKey := "pool-other-" + suffix
	ownerRoleKey := "role-active-" + suffix
	otherRoleKey := "role-other-" + suffix
	ownerPool := ownerPoolKey
	otherPool := otherPoolKey
	blankPool := "  "
	processIDs := []int{}
	nodeIDs := []int{}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if _, err := client.WorkflowTask.Delete().Where(workflowtask.SourceType(sourceType)).Exec(cleanupCtx); err != nil {
			t.Errorf("cleanup workflow task fixtures: %v", err)
		}
		for index := len(nodeIDs) - 1; index >= 0; index-- {
			if err := client.ProcessNodeInstance.DeleteOneID(nodeIDs[index]).Exec(cleanupCtx); err != nil {
				t.Errorf("cleanup process node fixture %d: %v", nodeIDs[index], err)
			}
		}
		for index := len(processIDs) - 1; index >= 0; index-- {
			if err := client.ProcessInstance.DeleteOneID(processIDs[index]).Exec(cleanupCtx); err != nil {
				t.Errorf("cleanup process fixture %d: %v", processIDs[index], err)
			}
		}
	})
	createAnchor := func(label, revision string, businessRefID int) (int, int) {
		t.Helper()
		key := "cc-count-" + label + "-" + suffix
		instance, err := client.ProcessInstance.Create().
			SetProcessKey(key).
			SetProcessVersion("v1").
			SetConfigRevision(revision).
			SetDefinitionHash("sha256:" + key).
			SetBusinessRefType("customer-config-count").
			SetBusinessRefID(businessRefID).
			SetIdempotencyKey(key + ":v1").
			SetStatus(biz.ProcessStatusActive).
			Save(ctx)
		if err != nil {
			t.Fatalf("create process anchor %s: %v", label, err)
		}
		processIDs = append(processIDs, instance.ID)
		node, err := client.ProcessNodeInstance.Create().
			SetProcessInstanceID(instance.ID).
			SetNodeKey("workflow-task").
			SetNodeType(biz.ProcessNodeTypeHumanTask).
			SetAttempt(1).
			SetStatus(biz.ProcessNodeStatusWaiting).
			SetPolicySnapshot(map[string]any{}).
			Save(ctx)
		if err != nil {
			t.Fatalf("create process node anchor %s: %v", label, err)
		}
		nodeIDs = append(nodeIDs, node.ID)
		return instance.ID, node.ID
	}
	activeProcessID, activeNodeID := createAnchor("active", activeRevision, 1)
	nullRevisionProcessID, nullRevisionNodeID := createAnchor("null-revision", activeRevision, 2)
	otherProcessID, otherNodeID := createAnchor("other", otherRevision, 3)
	intPointer := func(value int) *int { return &value }

	fixtures := []struct {
		revision              *string
		poolKey               *string
		ownerRoleKey          string
		status                string
		processInstanceID     *int
		processNodeInstanceID *int
	}{
		{revision: &activeRevision, poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "ready", processInstanceID: intPointer(activeProcessID), processNodeInstanceID: intPointer(activeNodeID)},
		{revision: &activeRevision, poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "ready"},
		{poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "ready"},
		{poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "blocked"},
		{ownerRoleKey: ownerRoleKey, status: "ready"},
		{poolKey: &blankPool, ownerRoleKey: ownerRoleKey, status: "blocked"},
		{poolKey: &otherPool, ownerRoleKey: ownerRoleKey, status: "ready"},
		{poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "ready", processInstanceID: intPointer(nullRevisionProcessID), processNodeInstanceID: intPointer(nullRevisionNodeID)},
		{revision: &otherRevision, poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "ready", processInstanceID: intPointer(otherProcessID), processNodeInstanceID: intPointer(otherNodeID)},
		{poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "done"},
		{poolKey: &ownerPool, ownerRoleKey: ownerRoleKey, status: "rejected"},
		{ownerRoleKey: otherRoleKey, status: "ready"},
	}
	for index, fixture := range fixtures {
		builder := client.WorkflowTask.Create().
			SetTaskCode(taskCodePrefix + fmt.Sprintf("-%d", index)).
			SetTaskGroup("config_transition_test").
			SetTaskName("配置切换任务计数").
			SetSourceType(sourceType).
			SetSourceID(index + 1).
			SetTaskStatusKey(fixture.status).
			SetOwnerRoleKey(fixture.ownerRoleKey).
			SetNillableOwnerPoolKey(fixture.poolKey).
			SetNillableProcessInstanceID(fixture.processInstanceID).
			SetNillableProcessNodeInstanceID(fixture.processNodeInstanceID)
		if fixture.revision != nil {
			builder.SetConfigRevision(*fixture.revision)
		}
		if _, err := builder.Save(ctx); err != nil {
			t.Fatalf("insert workflow task fixture %d: %v", index, err)
		}
	}

	checks := []struct {
		name     string
		poolKeys []string
		roleKeys []string
		want     int
	}{
		{name: "combined", poolKeys: []string{ownerPoolKey}, roleKeys: []string{ownerRoleKey}, want: 5},
		{name: "explicit pool only", poolKeys: []string{ownerPoolKey}, want: 3},
		{name: "fallback role only", roleKeys: []string{ownerRoleKey}, want: 2},
	}
	for _, check := range checks {
		count, err := repo.CountOpenWorkflowTasksByResponsibilities(
			ctx,
			biz.DefaultCustomerKey,
			activeRevision,
			check.poolKeys,
			check.roleKeys,
		)
		if err != nil {
			t.Fatalf("%s: CountOpenWorkflowTasksByResponsibilities() error = %v", check.name, err)
		}
		if count != check.want {
			t.Fatalf("%s: CountOpenWorkflowTasksByResponsibilities() = %d, want %d", check.name, count, check.want)
		}
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

func TestCustomerConfigPostgresApplyApprovalSettingsIsAtomicAndIdempotent(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	customerKey := "cc-approval-apply-" + strings.ToLower(postgresTestSuffix())
	now := time.Now().UTC().Truncate(time.Microsecond)
	base := customerConfigPostgresPublishInput(customerKey, "rev-base", "base")
	if _, err := repo.PublishCustomerConfig(ctx, base, "hash-base", 10, now); err != nil {
		t.Fatalf("publish base revision: %v", err)
	}
	if _, err := repo.ActivateCustomerConfig(
		ctx,
		customerKey,
		base.Revision,
		"hash-base",
		base.ProductVersion,
		"",
		10,
		now.Add(time.Second),
	); err != nil {
		t.Fatalf("activate base revision: %v", err)
	}

	candidate := customerConfigPostgresPublishInput(customerKey, "rev-applied", "approval-settings")
	appliedAt := now.Add(2 * time.Second)
	applied, err := repo.ApplyApprovalSettingsRevision(
		ctx,
		candidate,
		"hash-applied",
		base.Revision,
		"hash-base",
		20,
		appliedAt,
	)
	if err != nil {
		t.Fatalf("apply approval settings: %v", err)
	}
	if applied.Status != biz.CustomerConfigStatusActive ||
		applied.Revision != candidate.Revision ||
		applied.ConfigHash != "hash-applied" {
		t.Fatalf("applied revision = %#v", applied)
	}

	replayed, err := repo.ApplyApprovalSettingsRevision(
		ctx,
		candidate,
		"hash-applied",
		base.Revision,
		"hash-base",
		20,
		appliedAt.Add(time.Hour),
	)
	if err != nil {
		t.Fatalf("exact apply replay: %v", err)
	}
	if replayed.ID != applied.ID ||
		replayed.Status != biz.CustomerConfigStatusActive ||
		replayed.ActivatedAt == nil ||
		applied.ActivatedAt == nil ||
		!replayed.ActivatedAt.Equal(*applied.ActivatedAt) {
		t.Fatalf("replay must return the original active revision: applied=%#v replayed=%#v", applied, replayed)
	}

	var totalCount, activeCount, intermediateCount int
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT count(*),
       count(*) FILTER (WHERE status = 'active'),
       count(*) FILTER (WHERE status IN ('building', 'published'))
FROM customer_config_revisions
WHERE customer_key = $1`, customerKey).Scan(&totalCount, &activeCount, &intermediateCount); err != nil {
		t.Fatalf("count applied revisions: %v", err)
	}
	if totalCount != 2 || activeCount != 1 || intermediateCount != 0 {
		t.Fatalf("revision counts total/active/intermediate = %d/%d/%d, want 2/1/0", totalCount, activeCount, intermediateCount)
	}
	var baseStatus string
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT status
FROM customer_config_revisions
WHERE customer_key = $1 AND revision = $2`, customerKey, base.Revision).Scan(&baseStatus); err != nil {
		t.Fatalf("read base revision status: %v", err)
	}
	if baseStatus != biz.CustomerConfigStatusSuperseded {
		t.Fatalf("base revision status = %q, want %q", baseStatus, biz.CustomerConfigStatusSuperseded)
	}
	if count := customerConfigPostgresApplyAuditCount(t, ctx, data, customerKey); count != 1 {
		t.Fatalf("approval settings apply audit count = %d, want 1", count)
	}
}

func TestCustomerConfigPostgresConcurrentApprovalSettingsApplyLeavesNoLoserRevision(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	repo := NewCustomerConfigRepo(data, log.NewStdLogger(io.Discard))
	customerKey := "cc-approval-race-" + strings.ToLower(postgresTestSuffix())
	now := time.Now().UTC().Truncate(time.Microsecond)
	base := customerConfigPostgresPublishInput(customerKey, "rev-base", "base")
	if _, err := repo.PublishCustomerConfig(ctx, base, "hash-base", 30, now); err != nil {
		t.Fatalf("publish base revision: %v", err)
	}
	if _, err := repo.ActivateCustomerConfig(
		ctx,
		customerKey,
		base.Revision,
		"hash-base",
		base.ProductVersion,
		"",
		30,
		now.Add(time.Second),
	); err != nil {
		t.Fatalf("activate base revision: %v", err)
	}

	candidates := []struct {
		revision string
		marker   string
		hash     string
	}{
		{revision: "rev-a", marker: "candidate-a", hash: "hash-a"},
		{revision: "rev-b", marker: "candidate-b", hash: "hash-b"},
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
			in := customerConfigPostgresPublishInput(customerKey, candidate.revision, candidate.marker)
			item, err := repo.ApplyApprovalSettingsRevision(
				ctx,
				in,
				candidate.hash,
				base.Revision,
				"hash-base",
				40+index,
				now.Add(time.Duration(index+2)*time.Second),
			)
			results <- customerConfigPostgresPublishResult{
				marker: candidate.marker,
				hash:   candidate.hash,
				item:   item,
				err:    err,
			}
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	successCount := 0
	conflictCount := 0
	var winner customerConfigPostgresPublishResult
	for result := range results {
		switch {
		case result.err == nil:
			successCount++
			winner = result
		case errors.Is(result.err, biz.ErrCustomerConfigActiveRevisionChanged):
			conflictCount++
		default:
			t.Fatalf("unexpected concurrent approval settings apply error: %v", result.err)
		}
	}
	if successCount != 1 || conflictCount != 1 {
		t.Fatalf("apply success/conflict = %d/%d, want 1/1", successCount, conflictCount)
	}
	if winner.item == nil || winner.item.Status != biz.CustomerConfigStatusActive {
		t.Fatalf("winner = %#v", winner)
	}

	var totalCount, activeCount, intermediateCount int
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT count(*),
       count(*) FILTER (WHERE status = 'active'),
       count(*) FILTER (WHERE status IN ('building', 'published'))
FROM customer_config_revisions
WHERE customer_key = $1`, customerKey).Scan(&totalCount, &activeCount, &intermediateCount); err != nil {
		t.Fatalf("count concurrent apply revisions: %v", err)
	}
	if totalCount != 2 || activeCount != 1 || intermediateCount != 0 {
		t.Fatalf("revision counts total/active/intermediate = %d/%d/%d, want 2/1/0", totalCount, activeCount, intermediateCount)
	}
	if count := customerConfigPostgresApplyAuditCount(t, ctx, data, customerKey); count != 1 {
		t.Fatalf("concurrent apply audit count = %d, want 1", count)
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

func customerConfigPostgresApplyAuditCount(t *testing.T, ctx context.Context, data *Data, customerKey string) int {
	t.Helper()
	var count int
	if err := data.sqldb.QueryRowContext(ctx, `
	SELECT count(*)
	FROM runtime_audit_events
	WHERE source = 'customer_config'
	  AND event_type = 'customer_config_control_plane'
	  AND event_key = 'customer_config.approval_settings.apply'
	  AND payload::jsonb->'target'->>'key' LIKE $1`, customerKey+"/%").Scan(&count); err != nil {
		t.Fatalf("count approval settings apply audit events: %v", err)
	}
	return count
}
