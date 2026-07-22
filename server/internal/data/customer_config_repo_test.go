package data

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"server/internal/biz"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-kratos/kratos/v2/log"
)

type customerConfigAuditPayloadMatcher struct {
	t                *testing.T
	action           string
	expectedAfterKey string
}

func (m customerConfigAuditPayloadMatcher) Match(value driver.Value) bool {
	payload, ok := value.(string)
	if !ok {
		m.t.Fatalf("payload must be string, got %T", value)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		m.t.Fatalf("payload must be JSON: %v", err)
	}
	if decoded["action"] != m.action {
		m.t.Fatalf("action = %#v", decoded["action"])
	}
	actor, _ := decoded["actor"].(map[string]any)
	if actor["id"] != float64(99) {
		m.t.Fatalf("actor.id = %#v", actor["id"])
	}
	target, _ := decoded["target"].(map[string]any)
	if target["type"] != "customer_config_revision" || target["key"] != "yoyoosun/rev-1" {
		m.t.Fatalf("target = %#v", target)
	}
	after, _ := decoded["after"].(map[string]any)
	if m.expectedAfterKey != "" && after[m.expectedAfterKey] == nil {
		m.t.Fatalf("after.%s missing: %#v", m.expectedAfterKey, after)
	}
	if _, exists := after["compiled_snapshot"]; exists {
		m.t.Fatalf("audit payload must not contain compiled_snapshot")
	}
	return true
}

func TestWriteCustomerConfigAuditRecordsSanitizedRuntimeAudit(t *testing.T) {
	testWriteCustomerConfigAuditRecordsSanitizedRuntimeAudit(t, "customer_config.publish", "config_hash", map[string]any{
		"config_hash": "abc123",
	})
}

func TestWriteCustomerConfigAuditRecordsRollbackAction(t *testing.T) {
	testWriteCustomerConfigAuditRecordsSanitizedRuntimeAudit(t, "customer_config.rollback", "rollback_target_revision", map[string]any{
		"status":                   "active",
		"rollback_target_revision": "rev-1",
	})
}

func TestCustomerConfigRepoRollbackWritesRollbackAudit(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
	ctx := context.Background()
	rolledBackAt := time.Date(2026, 6, 28, 12, 0, 0, 0, time.UTC)
	publishedAt := rolledBackAt.Add(-24 * time.Hour)
	firstActivatedAt := rolledBackAt.Add(-2 * time.Hour)
	currentActivatedAt := rolledBackAt.Add(-time.Hour)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`
	SELECT id, customer_key, revision, product_version, config_hash, config_hash_version, status, compiled_snapshot,
	       published_by, published_at, activated_by, activated_at, created_at, updated_at
	FROM customer_config_revisions
	WHERE customer_key = $1
	ORDER BY id
	FOR UPDATE`)).
		WithArgs("yoyoosun").
		WillReturnRows(sqlmock.NewRows(customerConfigRevisionSQLMockColumns()).
			AddRow(10, "yoyoosun", "rev-1", "local-test", "hash-1", biz.CustomerConfigHashVersion, biz.CustomerConfigStatusSuperseded, []byte(`{}`), 98, publishedAt, 98, firstActivatedAt, publishedAt, firstActivatedAt).
			AddRow(11, "yoyoosun", "rev-2", "local-test", "hash-2", biz.CustomerConfigHashVersion, biz.CustomerConfigStatusActive, []byte(`{}`), 98, publishedAt, 98, currentActivatedAt, publishedAt, currentActivatedAt))
	mock.ExpectQuery(regexp.QuoteMeta(`
	SELECT module_key, contract_version, state, reason
	FROM deployment_module_states
	WHERE customer_key = $1 AND config_revision = $2
	ORDER BY module_key ASC
	FOR SHARE`)).
		WithArgs("yoyoosun", "rev-1").
		WillReturnRows(sqlmock.NewRows([]string{"module_key", "contract_version", "state", "reason"}))
	mock.ExpectExec(regexp.QuoteMeta(`
	UPDATE customer_config_revisions
SET status = $3, updated_at = $4
WHERE customer_key = $1 AND status = $2 AND revision <> $5`)).
		WithArgs("yoyoosun", biz.CustomerConfigStatusActive, biz.CustomerConfigStatusSuperseded, sqlmock.AnyArg(), "rev-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE customer_config_revisions
SET status = $3, activated_by = $4, activated_at = $5, updated_at = $6
WHERE customer_key = $1 AND revision = $2`)).
		WithArgs("yoyoosun", "rev-1", biz.CustomerConfigStatusActive, 99, rolledBackAt, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)")).
		WithArgs(
			"customer_config_control_plane",
			"customer_config.rollback",
			"customer_config",
			customerConfigAuditPayloadMatcher{t: t, action: "customer_config.rollback", expectedAfterKey: "rollback_target_revision"},
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	item, err := repo.RollbackCustomerConfig(ctx, "yoyoosun", "rev-1", "hash-1", "local-test", "rev-2", 99, rolledBackAt)
	if err != nil {
		t.Fatalf("RollbackCustomerConfig() error = %v", err)
	}
	if item.Revision != "rev-1" || item.Status != biz.CustomerConfigStatusActive {
		t.Fatalf("item = %#v", item)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestValidateCustomerConfigSwitchTargetStateMatrix(t *testing.T) {
	activatedAt := time.Date(2026, 6, 28, 10, 0, 0, 0, time.UTC)
	tests := []struct {
		name           string
		auditAction    string
		status         string
		activatedAt    *time.Time
		wantIdempotent bool
		wantErr        error
	}{
		{name: "activate published", auditAction: customerConfigAuditActionActivate, status: biz.CustomerConfigStatusPublished},
		{name: "activate active is idempotent", auditAction: customerConfigAuditActionActivate, status: biz.CustomerConfigStatusActive, activatedAt: &activatedAt, wantIdempotent: true},
		{name: "activate superseded is rejected", auditAction: customerConfigAuditActionActivate, status: biz.CustomerConfigStatusSuperseded, activatedAt: &activatedAt, wantErr: biz.ErrBadParam},
		{name: "rollback historical superseded", auditAction: customerConfigAuditActionRollback, status: biz.CustomerConfigStatusSuperseded, activatedAt: &activatedAt},
		{name: "rollback never active superseded is rejected", auditAction: customerConfigAuditActionRollback, status: biz.CustomerConfigStatusSuperseded, wantErr: biz.ErrBadParam},
		{name: "rollback published is rejected", auditAction: customerConfigAuditActionRollback, status: biz.CustomerConfigStatusPublished, wantErr: biz.ErrBadParam},
		{name: "rollback current active is rejected", auditAction: customerConfigAuditActionRollback, status: biz.CustomerConfigStatusActive, activatedAt: &activatedAt, wantErr: biz.ErrBadParam},
		{name: "unknown action is rejected", auditAction: "customer_config.unknown", status: biz.CustomerConfigStatusPublished, wantErr: biz.ErrBadParam},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotIdempotent, err := validateCustomerConfigSwitchTarget(tc.auditAction, &biz.CustomerConfigRevision{
				Status:      tc.status,
				ActivatedAt: tc.activatedAt,
			})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("validateCustomerConfigSwitchTarget() error = %v, want %v", err, tc.wantErr)
			}
			if gotIdempotent != tc.wantIdempotent {
				t.Fatalf("validateCustomerConfigSwitchTarget() idempotent = %v, want %v", gotIdempotent, tc.wantIdempotent)
			}
		})
	}
}

func TestCustomerConfigRepoPublishSameIdentityReturnsExistingWithoutWrites(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
	existingPublishedAt := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	existingCreatedAt := existingPublishedAt.Add(-time.Minute)
	existingUpdatedAt := existingPublishedAt
	retryPublishedAt := existingPublishedAt.Add(time.Hour)
	in := biz.CustomerConfigPublishInput{
		CustomerKey:      "yoyoosun",
		Revision:         "rev-1",
		ProductVersion:   "product-v1",
		CompiledSnapshot: map[string]any{"customer": map[string]any{"key": "yoyoosun"}},
	}

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`
		INSERT INTO customer_config_revisions
		  (customer_key, revision, product_version, config_hash, config_hash_version, status, compiled_snapshot, published_by, published_at, created_at, updated_at)
		VALUES
		  ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
		ON CONFLICT (customer_key, revision) DO NOTHING`)).
		WithArgs("yoyoosun", "rev-1", "product-v1", "hash-1", biz.CustomerConfigHashVersion, customerConfigStatusBuilding, `{"customer":{"key":"yoyoosun"}}`, 100, retryPublishedAt, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, customer_key, revision, product_version, config_hash, config_hash_version, status, compiled_snapshot,
		       published_by, published_at, activated_by, activated_at, created_at, updated_at
	FROM customer_config_revisions
	WHERE customer_key = $1 AND revision = $2
	FOR UPDATE`)).
		WithArgs("yoyoosun", "rev-1").
		WillReturnRows(sqlmock.NewRows(customerConfigRevisionSQLMockColumns()).
			AddRow(10, "yoyoosun", "rev-1", "product-v1", "hash-1", biz.CustomerConfigHashVersion, biz.CustomerConfigStatusActive, []byte(`{"customer":{"key":"yoyoosun"}}`), 99, existingPublishedAt, 101, existingPublishedAt, existingCreatedAt, existingUpdatedAt))
	mock.ExpectCommit()

	item, err := repo.PublishCustomerConfig(context.Background(), in, "hash-1", 100, retryPublishedAt)
	if err != nil {
		t.Fatalf("PublishCustomerConfig() error = %v", err)
	}
	if item.ID != 10 || item.Status != biz.CustomerConfigStatusActive || item.PublishedBy == nil || *item.PublishedBy != 99 || item.PublishedAt == nil || !item.PublishedAt.Equal(existingPublishedAt) || !item.UpdatedAt.Equal(existingUpdatedAt) {
		t.Fatalf("idempotent publish must return original revision, got %#v", item)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestCustomerConfigRepoPublishDifferentIdentityRejectsImmutableRevision(t *testing.T) {
	tests := []struct {
		name                    string
		candidateProductVersion string
		candidateHash           string
	}{
		{name: "different hash", candidateProductVersion: "product-v1", candidateHash: "hash-2"},
		{name: "different product version", candidateProductVersion: "product-v2", candidateHash: "hash-1"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("sqlmock.New() error = %v", err)
			}
			defer func() { _ = db.Close() }()

			repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
			now := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
			in := biz.CustomerConfigPublishInput{
				CustomerKey:      "yoyoosun",
				Revision:         "rev-1",
				ProductVersion:   tc.candidateProductVersion,
				CompiledSnapshot: map[string]any{"customer": map[string]any{"key": "yoyoosun"}},
			}

			mock.ExpectBegin()
			mock.ExpectExec("INSERT INTO customer_config_revisions").
				WithArgs("yoyoosun", "rev-1", tc.candidateProductVersion, tc.candidateHash, biz.CustomerConfigHashVersion, customerConfigStatusBuilding, `{"customer":{"key":"yoyoosun"}}`, 100, now, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnResult(sqlmock.NewResult(0, 0))
			mock.ExpectQuery("SELECT id, customer_key, revision, product_version, config_hash, config_hash_version, status, compiled_snapshot").
				WithArgs("yoyoosun", "rev-1").
				WillReturnRows(sqlmock.NewRows(customerConfigRevisionSQLMockColumns()).
					AddRow(10, "yoyoosun", "rev-1", "product-v1", "hash-1", biz.CustomerConfigHashVersion, biz.CustomerConfigStatusSuperseded, []byte(`{"customer":{"key":"yoyoosun"}}`), 99, now, 101, now, now, now))
			mock.ExpectRollback()

			if _, err := repo.PublishCustomerConfig(context.Background(), in, tc.candidateHash, 100, now); !errors.Is(err, biz.ErrCustomerConfigRevisionImmutable) {
				t.Fatalf("PublishCustomerConfig() error = %v, want ErrCustomerConfigRevisionImmutable", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unmet expectations: %v", err)
			}
		})
	}
}

func TestCustomerConfigRepoPublishNewRevisionInsertsRowsAndAuditOnce(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
	publishedAt := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	in := biz.CustomerConfigPublishInput{
		CustomerKey:      "yoyoosun",
		Revision:         "rev-1",
		ProductVersion:   "product-v1",
		CompiledSnapshot: map[string]any{"customer": map[string]any{"key": "yoyoosun"}},
		ModuleStates: []biz.DeploymentModuleStateInput{
			{ModuleKey: "customers", ContractVersion: "v1", State: "enabled", Reason: "ready"},
		},
	}

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO customer_config_revisions").
		WithArgs("yoyoosun", "rev-1", "product-v1", "hash-1", biz.CustomerConfigHashVersion, customerConfigStatusBuilding, `{"customer":{"key":"yoyoosun"}}`, 99, publishedAt, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO deployment_module_states").
		WithArgs("yoyoosun", "rev-1", "customers", "v1", "enabled", "ready", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("UPDATE customer_config_revisions").
		WithArgs("yoyoosun", "rev-1", biz.CustomerConfigStatusPublished, sqlmock.AnyArg(), customerConfigStatusBuilding).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)")).
		WithArgs(
			"customer_config_control_plane",
			"customer_config.publish",
			"customer_config",
			customerConfigAuditPayloadMatcher{t: t, action: "customer_config.publish", expectedAfterKey: "config_hash"},
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT id, customer_key, revision, product_version, config_hash, config_hash_version, status, compiled_snapshot,
		       published_by, published_at, activated_by, activated_at, created_at, updated_at
	FROM customer_config_revisions
	WHERE customer_key = $1 AND revision = $2
	LIMIT 1`)).
		WithArgs("yoyoosun", "rev-1").
		WillReturnRows(sqlmock.NewRows(customerConfigRevisionSQLMockColumns()).
			AddRow(10, "yoyoosun", "rev-1", "product-v1", "hash-1", biz.CustomerConfigHashVersion, biz.CustomerConfigStatusPublished, []byte(`{"customer":{"key":"yoyoosun"}}`), 99, publishedAt, nil, nil, publishedAt, publishedAt))

	item, err := repo.PublishCustomerConfig(context.Background(), in, "hash-1", 99, publishedAt)
	if err != nil {
		t.Fatalf("PublishCustomerConfig() error = %v", err)
	}
	if item.ID != 10 || item.ConfigHash != "hash-1" || item.Status != biz.CustomerConfigStatusPublished {
		t.Fatalf("published revision = %#v", item)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestCustomerConfigRepoPublishRollsBackWhenExpandedRowsFail(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
	publishedAt := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	in := biz.CustomerConfigPublishInput{
		CustomerKey:      "yoyoosun",
		Revision:         "rev-1",
		ProductVersion:   "product-v1",
		CompiledSnapshot: map[string]any{"customer": map[string]any{"key": "yoyoosun"}},
		ModuleStates: []biz.DeploymentModuleStateInput{
			{ModuleKey: "customers", ContractVersion: "v1", State: "enabled", Reason: "ready"},
		},
	}

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO customer_config_revisions").
		WithArgs("yoyoosun", "rev-1", "product-v1", "hash-1", biz.CustomerConfigHashVersion, customerConfigStatusBuilding, `{"customer":{"key":"yoyoosun"}}`, 99, publishedAt, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO deployment_module_states").
		WithArgs("yoyoosun", "rev-1", "customers", "v1", "enabled", "ready", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnError(errors.New("insert module failed"))
	mock.ExpectRollback()

	if _, err := repo.PublishCustomerConfig(context.Background(), in, "hash-1", 99, publishedAt); err == nil || err.Error() != "insert module failed" {
		t.Fatalf("PublishCustomerConfig() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestCustomerConfigRepoSwitchIdentityFailuresRollBackBeforeWrites(t *testing.T) {
	now := time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC)
	tests := []struct {
		name                   string
		action                 string
		targetStatus           string
		targetHashVersion      int
		targetActivatedAt      any
		includeActive          bool
		expectedHash           string
		expectedProductVersion string
		expectedActiveRevision string
		wantErr                error
	}{
		{
			name:                   "active revision changed",
			action:                 customerConfigAuditActionActivate,
			targetStatus:           biz.CustomerConfigStatusPublished,
			targetHashVersion:      biz.CustomerConfigHashVersion,
			includeActive:          true,
			expectedHash:           "hash-new",
			expectedProductVersion: "product-v2",
			expectedActiveRevision: "stale-active",
			wantErr:                biz.ErrCustomerConfigActiveRevisionChanged,
		},
		{
			name:                   "target hash mismatch",
			action:                 customerConfigAuditActionActivate,
			targetStatus:           biz.CustomerConfigStatusPublished,
			targetHashVersion:      biz.CustomerConfigHashVersion,
			includeActive:          true,
			expectedHash:           "stale-hash",
			expectedProductVersion: "product-v2",
			expectedActiveRevision: "rev-active",
			wantErr:                biz.ErrCustomerConfigHashMismatch,
		},
		{
			name:                   "target product mismatch",
			action:                 customerConfigAuditActionActivate,
			targetStatus:           biz.CustomerConfigStatusPublished,
			targetHashVersion:      biz.CustomerConfigHashVersion,
			includeActive:          true,
			expectedHash:           "hash-new",
			expectedProductVersion: "stale-product",
			expectedActiveRevision: "rev-active",
			wantErr:                biz.ErrCustomerConfigProductVersionMismatch,
		},
		{
			name:                   "unknown hash version",
			action:                 customerConfigAuditActionActivate,
			targetStatus:           biz.CustomerConfigStatusPublished,
			targetHashVersion:      biz.CustomerConfigHashVersion + 1,
			includeActive:          true,
			expectedHash:           "hash-new",
			expectedProductVersion: "product-v2",
			expectedActiveRevision: "rev-active",
			wantErr:                biz.ErrCustomerConfigHashMismatch,
		},
		{
			name:                   "rollback requires current active",
			action:                 customerConfigAuditActionRollback,
			targetStatus:           biz.CustomerConfigStatusSuperseded,
			targetHashVersion:      biz.CustomerConfigHashVersion,
			targetActivatedAt:      now.Add(-time.Hour),
			expectedHash:           "hash-new",
			expectedProductVersion: "product-v2",
			expectedActiveRevision: "",
			wantErr:                biz.ErrCustomerConfigActiveRevisionChanged,
		},
		{
			name:                   "corrupt active target lacks activation evidence",
			action:                 customerConfigAuditActionActivate,
			targetStatus:           biz.CustomerConfigStatusActive,
			targetHashVersion:      biz.CustomerConfigHashVersion,
			includeActive:          false,
			expectedHash:           "hash-new",
			expectedProductVersion: "product-v2",
			expectedActiveRevision: "rev-new",
			wantErr:                biz.ErrBadParam,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("sqlmock.New() error = %v", err)
			}
			defer func() { _ = db.Close() }()
			repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
			rows := sqlmock.NewRows(customerConfigRevisionSQLMockColumns()).
				AddRow(10, "yoyoosun", "rev-new", "product-v2", "hash-new", tc.targetHashVersion, tc.targetStatus, []byte(`{}`), 98, now.Add(-2*time.Hour), 98, tc.targetActivatedAt, now.Add(-2*time.Hour), now.Add(-time.Hour))
			if tc.includeActive {
				rows.AddRow(11, "yoyoosun", "rev-active", "product-v1", "hash-active", biz.CustomerConfigHashVersion, biz.CustomerConfigStatusActive, []byte(`{}`), 98, now.Add(-3*time.Hour), 98, now.Add(-2*time.Hour), now.Add(-3*time.Hour), now.Add(-2*time.Hour))
			}

			mock.ExpectBegin()
			mock.ExpectQuery("SELECT id, customer_key, revision, product_version, config_hash, config_hash_version, status, compiled_snapshot").
				WithArgs("yoyoosun").
				WillReturnRows(rows)
			mock.ExpectRollback()

			var gotErr error
			if tc.action == customerConfigAuditActionRollback {
				_, gotErr = repo.RollbackCustomerConfig(context.Background(), "yoyoosun", "rev-new", tc.expectedHash, tc.expectedProductVersion, tc.expectedActiveRevision, 99, now)
			} else {
				_, gotErr = repo.ActivateCustomerConfig(context.Background(), "yoyoosun", "rev-new", tc.expectedHash, tc.expectedProductVersion, tc.expectedActiveRevision, 99, now)
			}
			if !errors.Is(gotErr, tc.wantErr) {
				t.Fatalf("switch error = %v, want %v", gotErr, tc.wantErr)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unexpected SQL after identity failure: %v", err)
			}
		})
	}
}

func TestCountOpenWorkflowTasksByResponsibilitiesUsesRuntimeTaskCategoriesAndFallbackRoles(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer func() { _ = db.Close() }()
	repo := NewCustomerConfigRepo(NewDataForTesting(nil, db), log.NewStdLogger(io.Discard))
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT COUNT(*)
FROM workflow_tasks
WHERE task_status_key IN ('ready', 'blocked')
  AND (
    (
      config_revision = $1
      AND process_instance_id > 0
      AND process_node_instance_id > 0
    )
    OR (
      config_revision IS NULL
      AND process_instance_id IS NULL
      AND process_node_instance_id IS NULL
    )
  )
  AND (
    owner_pool_key IN ($2, $3)
    OR (
      NULLIF(BTRIM(owner_pool_key), '') IS NULL
      AND owner_role_key IN ($4, $5)
    )
  )`)).
		WithArgs("rev-1", "finance_pool", "sales_pool", "finance", "sales").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	count, err := repo.CountOpenWorkflowTasksByResponsibilities(
		context.Background(),
		"yoyoosun",
		"rev-1",
		[]string{"sales_pool", "finance_pool"},
		[]string{"sales", "finance"},
	)
	if err != nil {
		t.Fatalf("CountOpenWorkflowTasksByResponsibilities() error = %v", err)
	}
	if count != 2 {
		t.Fatalf("CountOpenWorkflowTasksByResponsibilities() = %d, want 2", count)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("workflow task open-state query drifted: %v", err)
	}
}

func customerConfigRevisionSQLMockColumns() []string {
	return []string{
		"id", "customer_key", "revision", "product_version", "config_hash", "config_hash_version", "status", "compiled_snapshot",
		"published_by", "published_at", "activated_by", "activated_at", "created_at", "updated_at",
	}
}

func testWriteCustomerConfigAuditRecordsSanitizedRuntimeAudit(t *testing.T, action, expectedAfterKey string, after map[string]any) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)")).
		WithArgs(
			"customer_config_control_plane",
			action,
			"customer_config",
			customerConfigAuditPayloadMatcher{t: t, action: action, expectedAfterKey: expectedAfterKey},
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if err := writeCustomerConfigAudit(context.Background(), tx, action, "yoyoosun", "rev-1", 99, after); err != nil {
		t.Fatalf("writeCustomerConfigAudit() error = %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}
