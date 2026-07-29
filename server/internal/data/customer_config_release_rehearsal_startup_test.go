package data

import (
	"context"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestValidateActiveCustomerTrialConfigBindsReleaseRehearsalRuntime(t *testing.T) {
	const runID = "release_95d64e23_20260729"
	const database = "plush_erp_release_release_95d64e23_20260729"
	const dsn = "postgres://postgres:secret@postgres:5432/plush_erp_release_release_95d64e23_20260729?sslmode=disable"
	const systemID = "1234567890123456789"
	markers := map[string]string{"applyPurpose": biz.CustomerConfigLocalTestApplyPurpose}

	for _, test := range []struct {
		name             string
		allow            string
		runID            string
		expectedSystemID string
		configuredDSN    string
		database         string
		actualSystemID   string
		wantError        string
	}{
		{
			name:             "exact disposable runtime",
			allow:            "1",
			runID:            runID,
			expectedSystemID: systemID,
			configuredDSN:    dsn,
			database:         database,
			actualSystemID:   systemID,
		},
		{
			name:             "flag absent",
			runID:            runID,
			expectedSystemID: systemID,
			configuredDSN:    dsn,
			database:         database,
			actualSystemID:   systemID,
			wantError:        "exact registered runtime opt-in",
		},
		{
			name:             "mismatched cluster",
			allow:            "1",
			runID:            runID,
			expectedSystemID: systemID,
			configuredDSN:    dsn,
			database:         database,
			actualSystemID:   "9999999999999999999",
			wantError:        "exact release rehearsal database identity",
		},
		{
			name:             "ordinary production database",
			allow:            "1",
			runID:            runID,
			expectedSystemID: systemID,
			configuredDSN:    "postgres://postgres:secret@postgres:5432/plush_erp?sslmode=disable",
			database:         "plush_erp",
			actualSystemID:   systemID,
			wantError:        "exact release rehearsal database identity",
		},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Setenv(biz.CustomerConfigLocalTestAllowEnv, "")
			t.Setenv(biz.CustomerConfigReleaseRehearsalAllowEnv, test.allow)
			t.Setenv(biz.CustomerConfigReleaseRehearsalIDEnv, test.runID)
			t.Setenv(biz.CustomerConfigReleaseRehearsalSystemIdentifierEnv, test.expectedSystemID)
			db, mock := expectActiveCustomerConfigVersion(
				t,
				"yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				biz.CustomerConfigLocalTestProductVersion,
				markers,
				test.database,
				test.actualSystemID,
				nil,
			)
			defer func() { _ = db.Close() }()
			err := validateActiveCustomerTrialConfig(
				context.Background(),
				db,
				false,
				test.configuredDSN,
			)
			if test.wantError == "" && err != nil {
				t.Fatalf("validateActiveCustomerTrialConfig() error = %v", err)
			}
			if test.wantError != "" && (err == nil || !strings.Contains(err.Error(), test.wantError)) {
				t.Fatalf("validateActiveCustomerTrialConfig() error = %v, want substring %q", err, test.wantError)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
