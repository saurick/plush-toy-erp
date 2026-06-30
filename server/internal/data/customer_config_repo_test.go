package data

import (
	"context"
	"database/sql/driver"
	"encoding/json"
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
	now := rolledBackAt

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id
FROM customer_config_revisions
WHERE customer_key = $1 AND revision = $2
LIMIT 1`)).
		WithArgs("yoyoosun", "rev-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(10))
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
	mock.ExpectQuery(regexp.QuoteMeta(`
SELECT id, customer_key, revision, product_version, config_hash, status, compiled_snapshot,
       published_by, published_at, activated_by, activated_at, created_at, updated_at
FROM customer_config_revisions
WHERE customer_key = $1 AND revision = $2
LIMIT 1`)).
		WithArgs("yoyoosun", "rev-1").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "customer_key", "revision", "product_version", "config_hash", "status", "compiled_snapshot",
			"published_by", "published_at", "activated_by", "activated_at", "created_at", "updated_at",
		}).AddRow(10, "yoyoosun", "rev-1", "local-test", "hash-1", biz.CustomerConfigStatusActive, []byte(`{}`), 98, now, 99, rolledBackAt, now, now))

	item, err := repo.RollbackCustomerConfig(ctx, "yoyoosun", "rev-1", 99, rolledBackAt)
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
