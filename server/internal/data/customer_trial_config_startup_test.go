package data

import (
	"context"
	"database/sql"
	"regexp"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/customertrialconfig"
	"server/internal/devdbguard"

	"github.com/DATA-DOG/go-sqlmock"
)

func expectActiveCustomerConfigVersion(
	t *testing.T,
	revision string,
	productVersion string,
	markers map[string]string,
	databaseHost string,
	databasePort int,
	databaseName string,
	queryErr error,
) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	expectation := mock.ExpectQuery(regexp.QuoteMeta(`
SELECT revision,
	       product_version,
	       COALESCE(jsonb_extract_path_text(compiled_snapshot, 'applyPurpose'), ''),
	       COALESCE(jsonb_extract_path_text(compiled_snapshot, 'datasetVersion'), ''),
	       COALESCE(jsonb_extract_path_text(compiled_snapshot, 'target'), ''),
	       COALESCE(host(inet_server_addr()), ''),
	       COALESCE(inet_server_port(), 0),
	       current_database()
FROM customer_config_revisions
WHERE customer_key = $1
  AND status = 'active'
ORDER BY id DESC
LIMIT 1`)).WithArgs(customertrialconfig.ExpectedCustomerKey)
	if queryErr != nil {
		expectation.WillReturnError(queryErr)
	} else {
		expectation.WillReturnRows(
			sqlmock.NewRows([]string{"revision", "product_version", "apply_purpose", "dataset_version", "target", "database_host", "database_port", "database_name"}).
				AddRow(revision, productVersion, markers["applyPurpose"], markers["datasetVersion"], markers["target"], databaseHost, databasePort, databaseName),
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
			db, mock := expectActiveCustomerConfigVersion(t, "formal-revision", tc.version, nil, "postgres", 5432, "formal_database", tc.queryError)
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
	db, mock := expectActiveCustomerConfigVersion(t, customertrialconfig.Revision, customertrialconfig.ProductVersion, map[string]string{
		"applyPurpose":   customertrialconfig.ApplyPurpose,
		"datasetVersion": customertrialconfig.DatasetVersion,
		"target":         customertrialconfig.ExpectedTarget,
	}, "postgres", 5432, "plush_erp_uat_20260716_v5", nil)
	defer func() { _ = db.Close() }()
	if err := validateActiveCustomerTrialConfig(context.Background(), db, false); err == nil {
		t.Fatal("expected active trial revision to be rejected while gate is disabled")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateActiveCustomerTrialConfigAllowsExactEnabledRuntime(t *testing.T) {
	db, mock := expectActiveCustomerConfigVersion(t, customertrialconfig.Revision, customertrialconfig.ProductVersion, map[string]string{
		"applyPurpose":   customertrialconfig.ApplyPurpose,
		"datasetVersion": customertrialconfig.DatasetVersion,
		"target":         customertrialconfig.ExpectedTarget,
	}, "postgres", 5432, "plush_erp_uat_20260716_v5", nil)
	defer func() { _ = db.Close() }()
	if err := validateActiveCustomerTrialConfig(context.Background(), db, true); err != nil {
		t.Fatalf("validateActiveCustomerTrialConfig() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateActiveCustomerTrialConfigRejectsReservedVersionDrift(t *testing.T) {
	db, mock := expectActiveCustomerConfigVersion(t, "old-trial-revision", "customer-trial-133-test-2026.07.15-v1", map[string]string{
		"applyPurpose":   customertrialconfig.ApplyPurpose,
		"datasetVersion": "2026.07.15-v1",
		"target":         customertrialconfig.ExpectedTarget,
	}, "postgres", 5432, "plush_erp_uat_20260716_v5", nil)
	defer func() { _ = db.Close() }()
	if err := validateActiveCustomerTrialConfig(context.Background(), db, true); err == nil {
		t.Fatal("expected reserved customer-trial version drift to be rejected")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateActiveCustomerTrialConfigRequiresRegisteredLocalTestRuntime(t *testing.T) {
	const acceptanceDatabase = "plush_erp_acceptance_20260716_v5_dev"
	localMarkers := map[string]string{"applyPurpose": biz.CustomerConfigLocalTestApplyPurpose}
	for _, tc := range []struct {
		name         string
		allow        string
		databaseHost string
		databasePort int
		databaseName string
		wantError    string
	}{
		{
			name:         "exact local acceptance runtime",
			allow:        "1",
			databaseHost: devdbguard.CustomerConfigLocalTestHost,
			databasePort: int(devdbguard.CustomerConfigLocalTestPort),
			databaseName: acceptanceDatabase,
		},
		{
			name:         "local flag is absent",
			databaseHost: devdbguard.CustomerConfigLocalTestHost,
			databasePort: int(devdbguard.CustomerConfigLocalTestPort),
			databaseName: acceptanceDatabase,
			wantError:    "exact registered runtime opt-in",
		},
		{
			name:         "local flag is not exact",
			allow:        "true",
			databaseHost: devdbguard.CustomerConfigLocalTestHost,
			databasePort: int(devdbguard.CustomerConfigLocalTestPort),
			databaseName: acceptanceDatabase,
			wantError:    "exact registered runtime opt-in",
		},
		{
			name:         "non-local server",
			allow:        "1",
			databaseHost: "192.168.0.133",
			databasePort: int(devdbguard.CustomerConfigLocalTestPort),
			databaseName: acceptanceDatabase,
			wantError:    "registered local development database family",
		},
		{
			name:         "wrong port",
			allow:        "1",
			databaseHost: devdbguard.CustomerConfigLocalTestHost,
			databasePort: 5435,
			databaseName: acceptanceDatabase,
			wantError:    "registered local development database family",
		},
		{
			name:         "shared development database",
			allow:        "1",
			databaseHost: devdbguard.CustomerConfigLocalTestHost,
			databasePort: int(devdbguard.CustomerConfigLocalTestPort),
			databaseName: "plush_erp",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(biz.CustomerConfigLocalTestAllowEnv, tc.allow)
			db, mock := expectActiveCustomerConfigVersion(
				t,
				"yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				biz.CustomerConfigLocalTestProductVersion,
				localMarkers,
				tc.databaseHost,
				tc.databasePort,
				tc.databaseName,
				nil,
			)
			defer func() { _ = db.Close() }()
			err := validateActiveCustomerTrialConfig(context.Background(), db, false)
			if tc.wantError == "" && err != nil {
				t.Fatalf("validateActiveCustomerTrialConfig() error = %v", err)
			}
			if tc.wantError != "" && (err == nil || !strings.Contains(err.Error(), tc.wantError)) {
				t.Fatalf("validateActiveCustomerTrialConfig() error = %v, want substring %q", err, tc.wantError)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestValidateActiveCustomerTrialConfigRejectsIncompleteLocalTestMarker(t *testing.T) {
	for _, tc := range []struct {
		name           string
		productVersion string
		markers        map[string]string
	}{
		{
			name:           "product without purpose",
			productVersion: biz.CustomerConfigLocalTestProductVersion,
		},
		{
			name:    "purpose without product",
			markers: map[string]string{"applyPurpose": biz.CustomerConfigLocalTestApplyPurpose},
		},
		{
			name:           "reserved product namespace drift",
			productVersion: "local-customer-package-test-unknown",
		},
		{
			name:           "reserved purpose namespace drift",
			productVersion: biz.CustomerConfigLocalTestProductVersion,
			markers:        map[string]string{"applyPurpose": "local_test_unknown"},
		},
		{
			name:           "local marker mixed with trial target",
			productVersion: biz.CustomerConfigLocalTestProductVersion,
			markers: map[string]string{
				"applyPurpose": biz.CustomerConfigLocalTestApplyPurpose,
				"target":       customertrialconfig.ExpectedTarget,
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(biz.CustomerConfigLocalTestAllowEnv, "1")
			db, mock := expectActiveCustomerConfigVersion(
				t,
				"local-revision",
				tc.productVersion,
				tc.markers,
				devdbguard.CustomerConfigLocalTestHost,
				int(devdbguard.CustomerConfigLocalTestPort),
				"plush_erp_acceptance_20260716_v5_dev",
				nil,
			)
			defer func() { _ = db.Close() }()
			err := validateActiveCustomerTrialConfig(context.Background(), db, false)
			if err == nil || !strings.Contains(err.Error(), "local-test customer config marker is incomplete or invalid") {
				t.Fatalf("validateActiveCustomerTrialConfig() error = %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
