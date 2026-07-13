package data

import (
	"context"
	"errors"
	"io"
	"regexp"
	"strings"
	"testing"

	"server/internal/biz"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-kratos/kratos/v2/log"
)

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

func TestResetRoleDemoAdminPasswordsOnlyUpdatesPassword(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectExec(regexp.QuoteMeta(`
UPDATE admin_users
SET password_hash = $2, updated_at = $3
WHERE username = $1`)).
		WithArgs("demo_uat_disabled", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectClose()

	err = ResetRoleDemoAdminPasswords(
		context.Background(),
		db,
		[]string{"demo_uat_disabled"},
		"manual-acceptance-password",
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

func TestSeedBuiltinRBACIfNeededRejectsMissingDB(t *testing.T) {
	err := SeedBuiltinRBACIfNeeded(context.Background(), nil, log.NewHelper(log.NewStdLogger(io.Discard)))
	if err == nil || !strings.Contains(err.Error(), "missing db") {
		t.Fatalf("expected missing db error, got %v", err)
	}
}
