package data

import (
	"context"
	"io"
	"regexp"
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
	mock.ExpectExec(regexp.QuoteMeta(
		"UPDATE admin_users SET is_super_admin = TRUE, updated_at = $2 WHERE username = $1 AND is_super_admin = FALSE",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg()).
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

func TestInitAdminUsersIfNeededPromotesExistingBootstrapAdmin(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(regexp.QuoteMeta(
		"UPDATE admin_users SET is_super_admin = TRUE, updated_at = $2 WHERE username = $1 AND is_super_admin = FALSE",
	)).
		WithArgs("trialadmin", sqlmock.AnyArg()).
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
