package data

import (
	"context"
	"database/sql"
	"io"
	"regexp"
	"strings"
	"testing"

	"server/internal/conf"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-kratos/kratos/v2/log"
)

func mustCloseDB(t *testing.T, db interface{ Close() error }) {
	t.Helper()
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededCreatesAdminOnce(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectClose()

	err = InitAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)))
	if err != nil {
		t.Fatalf("InitAdminUsersIfNeeded() error = %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededSkipsWhenAdminAlreadyExists(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectClose()

	err = InitAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)))
	if err != nil {
		t.Fatalf("InitAdminUsersIfNeeded() error = %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededDoesNotPromoteExistingBootstrapAdmin(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectClose()

	err = InitAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)))
	if err != nil {
		t.Fatalf("InitAdminUsersIfNeeded() error = %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededProductionRequiresOnceFlag(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
	)).
		WithArgs(adminBootstrapEventBlocked, adminBootstrapMarkerKey, adminBootstrapAuditSource, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectClose()

	err = initAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)), adminBootstrapOptions{
		production: true,
		once:       false,
	})
	if err == nil || !strings.Contains(err.Error(), "BOOTSTRAP_ADMIN_ONCE=true") {
		t.Fatalf("expected BOOTSTRAP_ADMIN_ONCE error, got %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededRejectsWeakBootstrapPassword(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	config := testAdminInitConfig()
	config.Auth.Admin.Password = "1234567"
	mock.ExpectClose()

	err = initAdminUsersIfNeeded(
		context.Background(),
		&Data{sqldb: db},
		config,
		log.NewHelper(log.NewStdLogger(io.Discard)),
		adminBootstrapOptions{},
	)
	if err == nil || !strings.Contains(err.Error(), "at least 8 characters") {
		t.Fatalf("expected bootstrap password policy error, got %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededProductionOnceCreatesMarkerAndAudit(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(
		"SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1",
	)).
		WithArgs(adminBootstrapMarkerKey).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO runtime_markers (marker_key, marker_value, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (marker_key) DO NOTHING",
	)).
		WithArgs(adminBootstrapMarkerKey, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
	)).
		WithArgs(adminBootstrapEventCompleted, adminBootstrapMarkerKey, adminBootstrapAuditSource, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectClose()

	err = initAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)), adminBootstrapOptions{
		production: true,
		once:       true,
	})
	if err != nil {
		t.Fatalf("InitAdminUsersIfNeeded() error = %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededProductionOnceRejectsCompletedMarker(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(
		"SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1",
	)).
		WithArgs(adminBootstrapMarkerKey).
		WillReturnRows(sqlmock.NewRows([]string{"marker_value"}).AddRow("{}"))
	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
	)).
		WithArgs(adminBootstrapEventBlocked, adminBootstrapMarkerKey, adminBootstrapAuditSource, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()
	mock.ExpectClose()

	err = initAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)), adminBootstrapOptions{
		production: true,
		once:       true,
	})
	if err == nil || !strings.Contains(err.Error(), "already completed") {
		t.Fatalf("expected completed marker error, got %v", err)
	}
	_ = db.Close()

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededProductionOnceRejectsExistingUsername(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(
		"SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1",
	)).
		WithArgs(adminBootstrapMarkerKey).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
	)).
		WithArgs(adminBootstrapEventBlocked, adminBootstrapMarkerKey, adminBootstrapAuditSource, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()
	mock.ExpectClose()

	err = initAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, testAdminInitConfig(), log.NewHelper(log.NewStdLogger(io.Discard)), adminBootstrapOptions{
		production: true,
		once:       true,
	})
	if err == nil || !strings.Contains(err.Error(), "username already exists") {
		t.Fatalf("expected existing username error, got %v", err)
	}
	_ = db.Close()

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestInitAdminUsersIfNeededSkipsWhenCredentialsMissing(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectClose()

	err = InitAdminUsersIfNeeded(context.Background(), &Data{sqldb: db}, &conf.Data{
		Auth: &conf.Data_Auth{
			Admin: &conf.Data_Auth_Admin{},
		},
	}, log.NewHelper(log.NewStdLogger(io.Discard)))
	if err != nil {
		t.Fatalf("InitAdminUsersIfNeeded() error = %v", err)
	}
	mustCloseDB(t, db)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func testAdminInitConfig() *conf.Data {
	return &conf.Data{
		Auth: &conf.Data_Auth{
			Admin: &conf.Data_Auth_Admin{
				Username: "trialadmin",
				Password: "trial-password",
			},
		},
	}
}
