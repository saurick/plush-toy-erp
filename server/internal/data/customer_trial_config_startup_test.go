package data

import (
	"context"
	"database/sql"
	"regexp"
	"testing"

	"server/internal/customertrialconfig"

	"github.com/DATA-DOG/go-sqlmock"
)

func expectActiveCustomerConfigVersion(
	t *testing.T,
	productVersion string,
	queryErr error,
) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	expectation := mock.ExpectQuery(regexp.QuoteMeta(`
SELECT product_version
FROM customer_config_revisions
WHERE customer_key = $1
  AND status = 'active'
ORDER BY id DESC
LIMIT 1`)).WithArgs(customertrialconfig.ExpectedCustomerKey)
	if queryErr != nil {
		expectation.WillReturnError(queryErr)
	} else {
		expectation.WillReturnRows(
			sqlmock.NewRows([]string{"product_version"}).AddRow(productVersion),
		)
	}
	return db, mock
}

func TestValidateActiveCustomerTrialConfigAllowsFormalOrMissingRevision(t *testing.T) {
	for _, tc := range []struct {
		name       string
		version    string
		queryError error
	}{
		{name: "formal active revision", version: "formal-product-v1"},
		{name: "no active revision", queryError: sql.ErrNoRows},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := expectActiveCustomerConfigVersion(t, tc.version, tc.queryError)
			defer func() { _ = db.Close() }()
			if err := validateActiveCustomerTrialConfig(context.Background(), db, false); err != nil {
				t.Fatalf("validateActiveCustomerTrialConfig() error = %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestValidateActiveCustomerTrialConfigRequiresExactRuntimeOptIn(t *testing.T) {
	db, mock := expectActiveCustomerConfigVersion(t, customertrialconfig.ProductVersion, nil)
	defer func() { _ = db.Close() }()
	if err := validateActiveCustomerTrialConfig(context.Background(), db, false); err == nil {
		t.Fatal("expected active trial revision to be rejected while gate is disabled")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateActiveCustomerTrialConfigAllowsExactEnabledRuntime(t *testing.T) {
	db, mock := expectActiveCustomerConfigVersion(t, customertrialconfig.ProductVersion, nil)
	defer func() { _ = db.Close() }()
	if err := validateActiveCustomerTrialConfig(context.Background(), db, true); err != nil {
		t.Fatalf("validateActiveCustomerTrialConfig() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateActiveCustomerTrialConfigRejectsReservedVersionDrift(t *testing.T) {
	db, mock := expectActiveCustomerConfigVersion(t, "customer-trial-133-test-2026.07.15-v1", nil)
	defer func() { _ = db.Close() }()
	if err := validateActiveCustomerTrialConfig(context.Background(), db, true); err == nil {
		t.Fatal("expected reserved customer-trial version drift to be rejected")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
