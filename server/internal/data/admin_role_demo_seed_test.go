package data

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

type bcryptHashMatcher string

func (expected bcryptHashMatcher) Match(value driver.Value) bool {
	hash, ok := value.(string)
	return ok && bcrypt.CompareHashAndPassword([]byte(hash), []byte(expected)) == nil
}

type rotationAuditPayloadMatcher struct {
	username string
	secrets  []string
}

type phoneAuditPayloadMatcher struct {
	username string
	phone    string
}

type markerReceiptMatcher struct {
	operation ManualAcceptancePasswordRotationOperation
	username  string
	secrets   []string
}

func (expected markerReceiptMatcher) Match(value driver.Value) bool {
	raw, ok := value.(string)
	if !ok {
		return false
	}
	for _, secret := range expected.secrets {
		if secret != "" && strings.Contains(raw, secret) {
			return false
		}
	}
	var receipt ManualAcceptancePasswordRotationReceipt
	if json.Unmarshal([]byte(raw), &receipt) != nil {
		return false
	}
	return receipt.OperationID == expected.operation.OperationID &&
		receipt.Target == expected.operation.Target &&
		receipt.Release == expected.operation.Release &&
		receipt.MigrationVersion == expected.operation.MigrationVersion &&
		receipt.CustomerRevision == expected.operation.CustomerRevision &&
		len(receipt.Accounts) == 1 && receipt.Accounts[0].Username == expected.username &&
		receipt.Accounts[0].AuthVersion > 0 && !receipt.Replayed
}

func (expected phoneAuditPayloadMatcher) Match(value driver.Value) bool {
	payload, ok := value.(string)
	if !ok || strings.Contains(payload, expected.phone) {
		return false
	}
	var decoded map[string]any
	if json.Unmarshal([]byte(payload), &decoded) != nil || decoded["action"] != "admin_user.phone.set" {
		return false
	}
	target, _ := decoded["target"].(map[string]any)
	before, _ := decoded["before"].(map[string]any)
	after, _ := decoded["after"].(map[string]any)
	return target["key"] == expected.username && before["phone_bound"] == false && after["phone_bound"] == true
}

func (expected rotationAuditPayloadMatcher) Match(value driver.Value) bool {
	payload, ok := value.(string)
	if !ok {
		return false
	}
	for _, secret := range expected.secrets {
		if secret != "" && strings.Contains(payload, secret) {
			return false
		}
	}
	var decoded map[string]any
	if json.Unmarshal([]byte(payload), &decoded) != nil {
		return false
	}
	target, _ := decoded["target"].(map[string]any)
	after, _ := decoded["after"].(map[string]any)
	_, hasPhoneBound := after["phone_bound"]
	return target["key"] == expected.username && after["password_reset"] == true && !hasPhoneBound
}

func expectRotationAudit(mock sqlmock.Sqlmock, username string, secrets ...string) {
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)")).
		WithArgs(
			"admin_control_plane",
			"admin_user.password.reset",
			"manual_acceptance_password_rotation",
			rotationAuditPayloadMatcher{username: username, secrets: secrets},
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
}

func expectPhoneAudit(mock sqlmock.Sqlmock, username, phone string) {
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)")).
		WithArgs(
			"admin_control_plane",
			"admin_user.phone.set",
			"manual_acceptance_password_rotation",
			phoneAuditPayloadMatcher{username: username, phone: phone},
			sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
}

func TestDefaultRoleDemoAdminAccountsExcludeDebugByDefault(t *testing.T) {
	accounts := DefaultRoleDemoAdminAccounts(false)
	if len(accounts) != 10 {
		t.Fatalf("expected 10 default role demo accounts, got %d", len(accounts))
	}
	foundEngineering := false
	for _, account := range accounts {
		if account.RoleKey == biz.DebugOperatorRoleKey || account.Username == "demo_debug" {
			t.Fatalf("debug demo account must be opt-in, got %#v", account)
		}
		if account.Username == "demo_engineering" && account.RoleKey == biz.EngineeringRoleKey {
			foundEngineering = true
		}
	}
	if !foundEngineering {
		t.Fatalf("expected demo_engineering account")
	}
}

func TestRejectPublicRoleDemoPassword(t *testing.T) {
	if err := RejectPublicRoleDemoPassword(PublicRoleDemoPassword); err == nil {
		t.Fatal("public role demo password accepted")
	}
	if err := RejectPublicRoleDemoPassword("independent-demo-password"); err != nil {
		t.Fatalf("non-public password rejected: %v", err)
	}
}

func TestDefaultRoleDemoAdminAccountsCanIncludeDebug(t *testing.T) {
	accounts := DefaultRoleDemoAdminAccounts(true)
	last := accounts[len(accounts)-1]
	if last.Username != "demo_debug" || last.RoleKey != biz.DebugOperatorRoleKey {
		t.Fatalf("expected opt-in debug account at the end, got %#v", last)
	}
}

func TestSeedRoleDemoAdminAccountsUpdatesExistingAccountRole(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM roles WHERE role_key = $1 AND disabled = FALSE LIMIT 1")).
		WithArgs(biz.SalesRoleKey).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(20))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM admin_users WHERE username = $1 LIMIT 1")).
		WithArgs("demo_sales").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(100))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_users
SET is_super_admin = FALSE, disabled = FALSE, updated_at = $2
WHERE id = $1`)).
		WithArgs(100, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM admin_user_roles WHERE admin_user_id = $1")).
		WithArgs(100).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`
INSERT INTO admin_user_roles (admin_user_id, role_id, created_at)
VALUES ($1, $2, $3)
ON CONFLICT (admin_user_id, role_id) DO NOTHING`)).
		WithArgs(100, 20, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectClose()

	result, err := SeedRoleDemoAdminAccounts(context.Background(), db, RoleDemoAdminSeedOptions{
		Password: "role-demo-password",
		Accounts: []RoleDemoAdminAccountSpec{
			{Username: "demo_sales", RoleKey: biz.SalesRoleKey},
		},
	})
	if err != nil {
		t.Fatalf("SeedRoleDemoAdminAccounts() error = %v", err)
	}
	if len(result.Accounts) != 1 {
		t.Fatalf("expected one seeded account, got %d", len(result.Accounts))
	}
	if result.Accounts[0].Created {
		t.Fatalf("existing account must be updated, not created")
	}
	if result.Accounts[0].PasswordReset {
		t.Fatalf("password must not reset unless requested")
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSeedRoleDemoAdminAccountsRejectsMissingPassword(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectClose()
	_, err = SeedRoleDemoAdminAccounts(context.Background(), db, RoleDemoAdminSeedOptions{})
	if !errors.Is(err, ErrRoleDemoPasswordRequired) {
		t.Fatalf("expected ErrRoleDemoPasswordRequired, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestResetRoleDemoAdminPasswordsBumpsAuthVersionAndRevokesSessions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("demo_uat_disabled", bcryptHashMatcher("manual-test-pass"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}).AddRow(101, 2))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`)).
		WithArgs(101, sqlmock.AnyArg(), adminSessionRevokeReasonPasswordReset).
		WillReturnResult(sqlmock.NewResult(0, 2))
	expectRotationAudit(mock, "demo_uat_disabled", "manual-test-pass")
	mock.ExpectCommit()
	mock.ExpectClose()

	err = ResetRoleDemoAdminPasswords(
		context.Background(),
		db,
		[]string{"demo_uat_disabled"},
		"manual-test-pass",
	)
	if err != nil {
		t.Fatalf("ResetRoleDemoAdminPasswords() error = %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestResetRoleDemoAdminPasswordsProtectsStableAdminBeforeTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectClose()

	err = ResetRoleDemoAdminPasswords(
		context.Background(),
		db,
		[]string{" admin "},
		"manual-test-pass",
	)
	if !errors.Is(err, ErrStableAdminProtected) {
		t.Fatalf("ResetRoleDemoAdminPasswords() error = %v, want ErrStableAdminProtected", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSeedRoleDemoAdminAccountsProtectsStableAdminBeforeTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectClose()

	_, err = SeedRoleDemoAdminAccounts(context.Background(), db, RoleDemoAdminSeedOptions{
		Password: "manual-test-pass",
		Accounts: []RoleDemoAdminAccountSpec{
			{Username: "ADMIN", RoleKey: biz.AdminRoleKey},
		},
	})
	if !errors.Is(err, ErrStableAdminProtected) {
		t.Fatalf("SeedRoleDemoAdminAccounts() error = %v, want ErrStableAdminProtected", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestResetManualAcceptancePasswordsRotatesAdminAndDemoInOneTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	accounts := []struct {
		username string
		password string
		adminID  int
		sessions int64
	}{
		{username: "admin", password: "admin-test-pass", adminID: 1, sessions: 2},
		{username: "demo_sales", password: "demo-test-pass", adminID: 2, sessions: 1},
	}
	for _, account := range accounts {
		mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
			WithArgs(account.username, bcryptHashMatcher(account.password), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}).AddRow(account.adminID, 2))
		mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`)).
			WithArgs(account.adminID, sqlmock.AnyArg(), adminSessionRevokeReasonPasswordReset).
			WillReturnResult(sqlmock.NewResult(0, account.sessions))
		expectRotationAudit(mock, account.username, "admin-test-pass", "demo-test-pass")
	}
	mock.ExpectCommit()
	mock.ExpectClose()

	receipt, err := RotateManualAcceptancePasswords(
		context.Background(),
		db,
		[]string{"admin"},
		"admin-test-pass",
		[]string{"demo_sales"},
		"demo-test-pass",
	)
	if err != nil {
		t.Fatalf("RotateManualAcceptancePasswords() error = %v", err)
	}
	if len(receipt.Accounts) != 2 || receipt.Accounts[0].AuthVersion != 2 || receipt.Accounts[1].RevokedSessions != 1 {
		t.Fatalf("unexpected sanitized receipt: %#v", receipt)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestResetManualAcceptancePasswordsRejectsSharedPasswordBeforeTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectClose()

	err = ResetManualAcceptancePasswords(
		context.Background(),
		db,
		[]string{"admin"},
		"shared-password",
		[]string{"demo_sales"},
		"shared-password",
	)
	if err == nil || !strings.Contains(err.Error(), "must differ") {
		t.Fatalf("ResetManualAcceptancePasswords() error = %v, want independent password failure", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestRotateManualAcceptancePasswordsBindsAdminPhoneInSameTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, username FROM admin_users WHERE phone = $1 FOR UPDATE")).
		WithArgs("13800138000").
		WillReturnRows(sqlmock.NewRows([]string{"id", "username"}))
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, phone = $4, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("admin", bcryptHashMatcher("admin-test-pass"), sqlmock.AnyArg(), "13800138000").
		WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}).AddRow(1, 8))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`)).
		WithArgs(1, sqlmock.AnyArg(), adminSessionRevokeReasonPasswordReset).
		WillReturnResult(sqlmock.NewResult(0, 2))
	expectRotationAudit(mock, "admin", "admin-test-pass", "13800138000")
	expectPhoneAudit(mock, "admin", "13800138000")
	mock.ExpectCommit()
	mock.ExpectClose()

	receipt, err := RotateManualAcceptancePasswordsWithPhoneBinding(
		context.Background(), db,
		[]string{"admin"}, "admin-test-pass",
		nil, "", "admin", "+86 138-0013-8000",
	)
	if err != nil {
		t.Fatalf("RotateManualAcceptancePasswordsWithPhoneBinding() error = %v", err)
	}
	if len(receipt.Accounts) != 1 || !receipt.Accounts[0].PhoneBound || receipt.Accounts[0].AuthVersion != 8 {
		t.Fatalf("unexpected phone-bound receipt: %#v", receipt)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestRotateManualAcceptancePasswordsRejectsPhoneOwnedByAnotherAccount(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, username FROM admin_users WHERE phone = $1 FOR UPDATE")).
		WithArgs("13800138000").
		WillReturnRows(sqlmock.NewRows([]string{"id", "username"}).AddRow(9, "other_admin"))
	mock.ExpectRollback()
	mock.ExpectClose()

	_, err = RotateManualAcceptancePasswordsWithPhoneBinding(
		context.Background(), db,
		[]string{"admin"}, "admin-test-pass",
		nil, "", "admin", "13800138000",
	)
	if !errors.Is(err, biz.ErrAdminPhoneExists) {
		t.Fatalf("error = %v, want ErrAdminPhoneExists", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func testRotationOperation() ManualAcceptancePasswordRotationOperation {
	return ManualAcceptancePasswordRotationOperation{
		MarkerKey:        "manual-acceptance-password-rotation:00000000-0000-4000-8000-000000000001",
		OperationID:      "00000000-0000-4000-8000-000000000001",
		Target:           "customer-trial-133",
		DatasetVersion:   "2026.07.16-v5",
		Release:          strings.Repeat("a", 40),
		MigrationVersion: "20260722000505",
		CustomerRevision: "yoyoosun-customer-trial-133-package-v5.runtime-manifest-v1",
	}
}

func TestRotateManualAcceptancePasswordsReplaysDurableReceiptWithoutMutations(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	operation := testRotationOperation()
	persisted := ManualAcceptancePasswordRotationReceipt{
		OperationID: operation.OperationID, Target: operation.Target,
		DatasetVersion: operation.DatasetVersion, Release: operation.Release,
		MigrationVersion: operation.MigrationVersion, CustomerRevision: operation.CustomerRevision,
		RotatedAt: time.Date(2026, 7, 22, 3, 4, 5, 0, time.UTC),
		Accounts: []ManualAcceptancePasswordRotationAccount{
			{Username: "admin", AuthVersion: 7, RevokedSessions: 2, PhoneBound: true},
			{Username: "demo_sales", AuthVersion: 3, RevokedSessions: 1},
		},
	}
	raw, err := json.Marshal(persisted)
	if err != nil {
		t.Fatalf("json.Marshal(): %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1")).
		WithArgs(operation.MarkerKey).
		WillReturnRows(sqlmock.NewRows([]string{"marker_value"}).AddRow(string(raw)))
	mock.ExpectCommit()
	mock.ExpectClose()

	receipt, err := RotateManualAcceptancePasswordsWithOperation(
		context.Background(), db,
		[]string{"admin"}, "admin-test-pass",
		[]string{"demo_sales"}, "demo-test-pass",
		"admin", "13800138000", operation,
	)
	if err != nil {
		t.Fatalf("RotateManualAcceptancePasswordsWithOperation() error = %v", err)
	}
	if !receipt.Replayed || !receipt.RotatedAt.Equal(persisted.RotatedAt) || receipt.Accounts[0].AuthVersion != 7 {
		t.Fatalf("unexpected replay receipt: %#v", receipt)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("replay executed an unexpected mutation/audit: %v", err)
	}
}

func TestRotateManualAcceptancePasswordsMarkerConflictRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	operation := testRotationOperation()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1")).
		WithArgs(operation.MarkerKey).
		WillReturnRows(sqlmock.NewRows([]string{"marker_value"}))
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("admin", bcryptHashMatcher("admin-test-pass"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}).AddRow(1, 9))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`)).
		WithArgs(1, sqlmock.AnyArg(), adminSessionRevokeReasonPasswordReset).
		WillReturnResult(sqlmock.NewResult(0, 2))
	expectRotationAudit(mock, "admin", "admin-test-pass")
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO runtime_markers (marker_key, marker_value, created_at, updated_at) VALUES ($1, $2, $3, $4)")).
		WithArgs(operation.MarkerKey, markerReceiptMatcher{operation: operation, username: "admin", secrets: []string{"admin-test-pass"}}, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnError(&pgconn.PgError{Code: "23505", ConstraintName: "runtimemarker_marker_key"})
	mock.ExpectRollback()
	mock.ExpectClose()

	_, err = RotateManualAcceptancePasswordsWithOperation(
		context.Background(), db,
		[]string{"admin"}, "admin-test-pass",
		nil, "", "", "", operation,
	)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.ConstraintName != "runtimemarker_marker_key" {
		t.Fatalf("error = %v, want marker unique violation", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestRotateManualAcceptancePasswordsMapsPhoneUniqueViolation(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, username FROM admin_users WHERE phone = $1 FOR UPDATE")).
		WithArgs("13800138000").
		WillReturnRows(sqlmock.NewRows([]string{"id", "username"}))
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, phone = $4, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("admin", bcryptHashMatcher("admin-test-pass"), sqlmock.AnyArg(), "13800138000").
		WillReturnError(&pgconn.PgError{Code: "23505", ConstraintName: "adminuser_phone"})
	mock.ExpectRollback()
	mock.ExpectClose()

	_, err = RotateManualAcceptancePasswordsWithPhoneBinding(
		context.Background(), db,
		[]string{"admin"}, "admin-test-pass", nil, "", "admin", "13800138000",
	)
	if !errors.Is(err, biz.ErrAdminPhoneExists) {
		t.Fatalf("error = %v, want ErrAdminPhoneExists", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestResetRoleDemoAdminPasswordsRollsBackPartialUpdate(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("demo_sales", bcryptHashMatcher("manual-test-pass"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}).AddRow(201, 3))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`)).
		WithArgs(201, sqlmock.AnyArg(), adminSessionRevokeReasonPasswordReset).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectRotationAudit(mock, "demo_sales", "manual-test-pass")
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("demo_purchase", bcryptHashMatcher("manual-test-pass"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}))
	mock.ExpectRollback()
	mock.ExpectClose()

	err = ResetRoleDemoAdminPasswords(
		context.Background(),
		db,
		[]string{"demo_sales", "demo_purchase"},
		"manual-test-pass",
	)
	if err == nil || !strings.Contains(err.Error(), "demo_purchase") {
		t.Fatalf("ResetRoleDemoAdminPasswords() error = %v, want missing second account", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestResetManualAcceptancePasswordsRollsBackWhenSessionRevocationFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`)).
		WithArgs("admin", bcryptHashMatcher("admin-test-pass"), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "auth_version"}).AddRow(301, 4))
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`)).
		WithArgs(301, sqlmock.AnyArg(), adminSessionRevokeReasonPasswordReset).
		WillReturnError(errors.New("session storage unavailable"))
	mock.ExpectRollback()
	mock.ExpectClose()

	err = ResetManualAcceptancePasswords(
		context.Background(),
		db,
		[]string{"admin"},
		"admin-test-pass",
		nil,
		"",
	)
	if err == nil || !strings.Contains(err.Error(), "session storage unavailable") {
		t.Fatalf("ResetManualAcceptancePasswords() error = %v, want session revocation failure", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSeedBuiltinRBACIfNeededRejectsMissingDB(t *testing.T) {
	err := SeedBuiltinRBACIfNeeded(context.Background(), nil, log.NewHelper(log.NewStdLogger(io.Discard)))
	if err == nil || !strings.Contains(err.Error(), "missing db") {
		t.Fatalf("expected missing db error, got %v", err)
	}
}
