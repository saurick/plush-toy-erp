package main

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func validOptions(target string) options {
	return options{
		target:                   target,
		datasetVersion:           "2026.07.16-v5",
		expectedMigrationVersion: "20260710150001",
		expectedRelease:          strings.Repeat("a", 40),
		operationID:              "123e4567-e89b-42d3-a456-426614174000",
		confirm:                  expectedConfirmation(target, "2026.07.16-v5"),
		timeout:                  30 * time.Second,
	}
}

func TestValidateOptionsBindsConfirmationToTargetAndVersion(t *testing.T) {
	for _, target := range []string{targetLocalDev, targetCustomerTrial133} {
		if err := validateOptions(validOptions(target)); err != nil {
			t.Fatalf("validateOptions(%s): %v", target, err)
		}
	}
	opts := validOptions(targetCustomerTrial133)
	opts.confirm = expectedConfirmation(targetLocalDev, opts.datasetVersion)
	if err := validateOptions(opts); err == nil {
		t.Fatal("expected mismatched target confirmation to fail")
	}
	opts = validOptions(targetCustomerTrial133)
	opts.operationID = "UPPERCASE"
	if err := validateOptions(opts); err == nil {
		t.Fatal("unsafe 133 operation id accepted")
	}
	if len(rotationMarkerKey(validOptions(targetCustomerTrial133).operationID)) > 128 {
		t.Fatal("valid operation marker key exceeds runtime marker capacity")
	}
}

func TestAcceptanceAccountUsernamesSelectsStableAdminOnlyFor133(t *testing.T) {
	for _, target := range []string{targetLocalDev, targetCustomerTrial133} {
		opts := validOptions(target)
		adminUsernames, demoUsernames, err := acceptanceAccountUsernames(opts)
		if err != nil {
			t.Fatalf("acceptanceAccountUsernames(%s): %v", target, err)
		}
		if target == targetLocalDev && len(adminUsernames) != 0 {
			t.Fatalf("local admin usernames = %v, want none", adminUsernames)
		}
		if target == targetCustomerTrial133 && (len(adminUsernames) != 1 || adminUsernames[0] != "admin") {
			t.Fatalf("133 admin usernames = %v, want stable admin", adminUsernames)
		}
		if len(demoUsernames) == 0 {
			t.Fatalf("%s demo usernames must not be empty", target)
		}
		for _, username := range demoUsernames {
			if strings.EqualFold(strings.TrimSpace(username), "admin") {
				t.Fatalf("%s selected protected username %q", target, username)
			}
		}
	}
}

func TestValidateTargetDSNSeparatesLocalAnd133(t *testing.T) {
	tests := []struct {
		name    string
		target  string
		dsn     string
		wantErr string
	}{
		{name: "local", target: targetLocalDev, dsn: "postgres://user:secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable"},
		{name: "local rejects loopback", target: targetLocalDev, dsn: "postgres://user:secret@127.0.0.1:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable", wantErr: "registered local"},
		{name: "local rejects IPv6 loopback", target: targetLocalDev, dsn: "postgres://user:secret@[::1]:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable", wantErr: "registered local"},
		{name: "local rejects 133", target: targetLocalDev, dsn: "postgres://user:secret@192.168.0.133:55435/plush_erp_uat_20260716_v5?sslmode=disable", wantErr: "registered local"},
		{name: "local rejects unregistered remote", target: targetLocalDev, dsn: "postgres://user:secret@192.168.0.88:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable", wantErr: "registered local"},
		{name: "local rejects shared dev database", target: targetLocalDev, dsn: "postgres://user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable", wantErr: "plush_erp_acceptance_20260716_v5_dev"},
		{name: "local rejects generic database", target: targetLocalDev, dsn: "postgres://user:secret@192.168.0.106:5432/plush_erp?sslmode=disable", wantErr: "plush_erp_acceptance_20260716_v5_dev"},
		{name: "local rejects production-like database", target: targetLocalDev, dsn: "postgres://user:secret@192.168.0.106:5432/plush_erp_production?sslmode=disable", wantErr: "plush_erp_acceptance_20260716_v5_dev"},
		{name: "133 host loopback", target: targetCustomerTrial133, dsn: "postgres://user:secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable"},
		{name: "133 postgresql URL and escaped password", target: targetCustomerTrial133, dsn: "postgresql://user:secret%40value%3A1@localhost:55435/plush_erp_uat_20260716_v5?sslmode=disable"},
		{name: "133 exact compose endpoint", target: targetCustomerTrial133, dsn: "postgres://user:secret@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable"},
		{name: "133 rejects arbitrary compose host", target: targetCustomerTrial133, dsn: "postgres://user:secret@database:5432/plush_erp_uat_20260716_v5?sslmode=disable", wantErr: "exact host"},
		{name: "133 rejects LAN credentials", target: targetCustomerTrial133, dsn: "postgres://user:secret@192.168.0.133:55435/plush_erp_uat_20260716_v5?sslmode=disable", wantErr: "loopback"},
		{name: "133 rejects live db", target: targetCustomerTrial133, dsn: "postgres://user:secret@127.0.0.1:55435/plush_erp?sslmode=disable", wantErr: "isolated database"},
		{name: "133 wrong db", target: targetCustomerTrial133, dsn: "postgres://user:secret@127.0.0.1:55435/other?sslmode=disable", wantErr: "isolated database"},
		{name: "133 rejects retired stack port", target: targetCustomerTrial133, dsn: "postgres://user:secret@127.0.0.1:5435/plush_erp_uat_20260716_v5?sslmode=disable", wantErr: "55435"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateTargetDSN(test.target, currentDatasetVersion, test.dsn)
			if test.wantErr == "" && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if test.wantErr != "" && (err == nil || !strings.Contains(err.Error(), test.wantErr)) {
				t.Fatalf("error=%v, want substring %q", err, test.wantErr)
			}
		})
	}
}

func TestValidateRotationPasswordsRequiresIndependentNonPublic133Credentials(t *testing.T) {
	if err := validateRotationPasswords(targetCustomerTrial133, "admin-password", "demo-password"); err != nil {
		t.Fatalf("validateRotationPasswords() error = %v", err)
	}
	for _, test := range []struct{ admin, demo, want string }{
		{admin: "", demo: "demo-password", want: adminPasswordEnv},
		{admin: "same-password", demo: "same-password", want: "must differ"},
		{admin: "admin-password", demo: "12345678", want: "public"},
		{admin: "12345678", demo: "demo-password", want: "public"},
	} {
		err := validateRotationPasswords(targetCustomerTrial133, test.admin, test.demo)
		if err == nil || !strings.Contains(err.Error(), test.want) {
			t.Fatalf("validateRotationPasswords(%q,%q) error=%v, want %q", test.admin, test.demo, err, test.want)
		}
	}
	if err := validateRotationPasswords(targetLocalDev, "", "12345678"); err != nil {
		t.Fatalf("registered isolated local target may use the public credential: %v", err)
	}
}

func TestValidateReleaseBindingRequiresExactImmutable133Version(t *testing.T) {
	opts := validOptions(targetCustomerTrial133)
	if err := validateReleaseBinding(opts, opts.expectedRelease); err != nil {
		t.Fatalf("matching release rejected: %v", err)
	}
	if err := validateReleaseBinding(opts, strings.Repeat("b", 40)); err == nil {
		t.Fatal("mismatched rotate binary version accepted")
	}
	opts.expectedRelease = "DEV"
	if err := validateOptions(opts); err == nil {
		t.Fatal("non-immutable 133 release accepted")
	}
}

func TestNormalizeRotationSMSPhoneRequires133IdentityBinding(t *testing.T) {
	phone, err := normalizeRotationSMSPhone(targetCustomerTrial133, "+86 138-0013-8000")
	if err != nil || phone != "13800138000" {
		t.Fatalf("normalizeRotationSMSPhone() = (%q, %v)", phone, err)
	}
	if _, err := normalizeRotationSMSPhone(targetCustomerTrial133, ""); err == nil {
		t.Fatal("133 accepted missing SMS phone")
	}
	if _, err := normalizeRotationSMSPhone(targetCustomerTrial133, "12345678"); err == nil {
		t.Fatal("133 accepted invalid SMS phone")
	}
	if _, err := normalizeRotationSMSPhone(targetLocalDev, "13800138000"); err == nil {
		t.Fatal("local target accepted remote SMS identity binding")
	}
}

func TestDockerfileBuildsAndCopiesRotateBinary(t *testing.T) {
	raw, err := os.ReadFile("../../Dockerfile")
	if err != nil {
		t.Fatalf("read Dockerfile: %v", err)
	}
	content := string(raw)
	for _, anchor := range []string{
		"-o ./bin/rotate-manual-acceptance-passwords ./cmd/rotate-manual-acceptance-passwords",
		"COPY --from=builder /src/bin/rotate-manual-acceptance-passwords /app/rotate-manual-acceptance-passwords",
	} {
		if !strings.Contains(content, anchor) {
			t.Fatalf("Dockerfile missing rotate binary anchor %q", anchor)
		}
	}
}

func TestAssertAcceptanceAccountsDoesNotReadStableAdminForLocalDev(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New(): %v", err)
	}
	defer func() { _ = db.Close() }()
	rows := sqlmock.NewRows([]string{"username"})
	for _, username := range demoAcceptanceUsernames {
		rows.AddRow(username)
	}
	mock.ExpectQuery(`SELECT username FROM admin_users WHERE username LIKE 'demo_%'`).WillReturnRows(rows)
	if err := assertAcceptanceAccounts(t.Context(), db, nil, demoAcceptanceUsernames); err != nil {
		t.Fatalf("assertAcceptanceAccounts(local-dev): %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet(): %v", err)
	}
}

func TestValidateTargetDSNRejectsURLAndPGXOverrideAttacks(t *testing.T) {
	tests := []struct {
		name   string
		target string
		dsn    string
	}{
		{
			name:   "local host query override",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?host=192.168.0.133&sslmode=disable",
		},
		{
			name:   "local database query override",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?dbname=plush_erp&sslmode=disable",
		},
		{
			name:   "local user query override",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?user=postgres&sslmode=disable",
		},
		{
			name:   "local multi host URL",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106,192.168.0.133:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable",
		},
		{
			name:   "local keyword multi host fallback",
			target: targetLocalDev,
			dsn:    "host=192.168.0.106,192.168.0.133 port=5432,5435 dbname=plush_erp_acceptance_20260716_v5_dev user=user password=top-secret sslmode=disable",
		},
		{
			name:   "local duplicate sslmode",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable&sslmode=disable",
		},
		{
			name:   "local extra query",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable&application_name=acceptance",
		},
		{
			name:   "local missing sslmode",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev",
		},
		{
			name:   "local fragment",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable#host=192.168.0.133",
		},
		{
			name:   "local empty fragment",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable#",
		},
		{
			name:   "local opaque URL",
			target: targetLocalDev,
			dsn:    "postgres:user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable",
		},
		{
			name:   "local escaped database path",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/%70lush_erp_simon_dev?sslmode=disable",
		},
		{
			name:   "local invalid URL",
			target: targetLocalDev,
			dsn:    "postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=%zz",
		},
		{
			name:   "local surrounding whitespace",
			target: targetLocalDev,
			dsn:    " postgres://user:top-secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable\n",
		},
		{
			name:   "133 host query override",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable&host=192.168.0.133",
		},
		{
			name:   "133 port query override",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?port=5432&sslmode=disable",
		},
		{
			name:   "133 database query override",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable&dbname=plush_erp",
		},
		{
			name:   "133 user query override",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable&user=postgres",
		},
		{
			name:   "133 multi host URL",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1,192.168.0.133:55435/plush_erp_uat_20260716_v5?sslmode=disable",
		},
		{
			name:   "133 duplicate sslmode",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable&sslmode=disable",
		},
		{
			name:   "133 extra query",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable&target_session_attrs=read-write",
		},
		{
			name:   "133 TLS mode",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=require",
		},
		{
			name:   "133 fragment",
			target: targetCustomerTrial133,
			dsn:    "postgres://user:top-secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable#dbname=plush_erp",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateTargetDSN(test.target, currentDatasetVersion, test.dsn)
			if err == nil {
				t.Fatal("validateTargetDSN() unexpectedly accepted an unsafe DSN")
			}
			if strings.Contains(err.Error(), "top-secret") {
				t.Fatal("validateTargetDSN() exposed a DSN password")
			}
		})
	}
}

func TestValidateTargetDSNRequiresExplicitCredentials(t *testing.T) {
	tests := []string{
		"postgres://127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable",
		"postgres://user@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable",
		"postgres://user:@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable",
	}
	for _, dsn := range tests {
		if err := validateTargetDSN(targetCustomerTrial133, currentDatasetVersion, dsn); err == nil {
			t.Fatalf("validateTargetDSN() accepted missing credentials for %q", dsn)
		}
	}
}

func TestValidateTargetDSNRejectsUnknown133DatasetVersion(t *testing.T) {
	err := validateTargetDSN(
		targetCustomerTrial133,
		"2026.07.15-v1",
		"postgres://user:secret@127.0.0.1:55435/plush_erp_uat_20260716_v5?sslmode=disable",
	)
	if err == nil || !strings.Contains(err.Error(), currentDatasetVersion) {
		t.Fatalf("validateTargetDSN() error = %v, want dataset version failure", err)
	}
}

func localActiveCustomerConfigIdentity() activeCustomerConfigIdentity {
	return activeCustomerConfigIdentity{
		revision:       "yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
		productVersion: localCustomerConfigProductVersion,
		compiledSnapshot: map[string]any{
			"applyPurpose": localCustomerConfigApplyPurpose,
			"pages":        []any{"global-dashboard"},
		},
	}
}

func customerTrial133ActiveConfigIdentity() activeCustomerConfigIdentity {
	return activeCustomerConfigIdentity{
		revision:       customerTrial133Revision,
		productVersion: customerTrial133ProductVersion,
		compiledSnapshot: map[string]any{
			"applyPurpose":   customerTrial133ApplyPurpose,
			"datasetVersion": currentDatasetVersion,
			"target":         targetCustomerTrial133,
			"pages":          []any{"global-dashboard"},
		},
	}
}

func TestValidateActiveCustomerConfigIdentityAcceptsOnlyTargetIdentity(t *testing.T) {
	if err := validateActiveCustomerConfigIdentity(targetLocalDev, localActiveCustomerConfigIdentity()); err != nil {
		t.Fatalf("local identity rejected: %v", err)
	}
	if err := validateActiveCustomerConfigIdentity(targetCustomerTrial133, customerTrial133ActiveConfigIdentity()); err != nil {
		t.Fatalf("customer-trial-133 identity rejected: %v", err)
	}
}

func TestValidateActiveCustomerConfigIdentityRejectsWrongLocalIdentity(t *testing.T) {
	tests := []struct {
		name     string
		identity activeCustomerConfigIdentity
	}{
		{
			name: "formal revision",
			identity: activeCustomerConfigIdentity{
				revision:         "yoyoosun-customer-package-v7.runtime-manifest-v1",
				productVersion:   localCustomerConfigProductVersion,
				compiledSnapshot: map[string]any{"applyPurpose": localCustomerConfigApplyPurpose},
			},
		},
		{
			name: "wrong fingerprint length",
			identity: activeCustomerConfigIdentity{
				revision:         "yoyoosun-customer-package-v7.local-deadbeef.runtime-v1",
				productVersion:   localCustomerConfigProductVersion,
				compiledSnapshot: map[string]any{"applyPurpose": localCustomerConfigApplyPurpose},
			},
		},
		{
			name: "wrong product version",
			identity: activeCustomerConfigIdentity{
				revision:         "yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				productVersion:   "local-customer-package",
				compiledSnapshot: map[string]any{"applyPurpose": localCustomerConfigApplyPurpose},
			},
		},
		{
			name: "missing marker",
			identity: activeCustomerConfigIdentity{
				revision:         "yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				productVersion:   localCustomerConfigProductVersion,
				compiledSnapshot: map[string]any{"pages": []any{"global-dashboard"}},
			},
		},
		{
			name: "wrong marker",
			identity: activeCustomerConfigIdentity{
				revision:         "yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				productVersion:   localCustomerConfigProductVersion,
				compiledSnapshot: map[string]any{"applyPurpose": customerTrial133ApplyPurpose},
			},
		},
		{
			name: "marker wrong type",
			identity: activeCustomerConfigIdentity{
				revision:         "yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				productVersion:   localCustomerConfigProductVersion,
				compiledSnapshot: map[string]any{"applyPurpose": true},
			},
		},
		{
			name: "mixed remote marker",
			identity: activeCustomerConfigIdentity{
				revision:       "yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1",
				productVersion: localCustomerConfigProductVersion,
				compiledSnapshot: map[string]any{
					"applyPurpose":   localCustomerConfigApplyPurpose,
					"datasetVersion": currentDatasetVersion,
				},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateActiveCustomerConfigIdentity(targetLocalDev, test.identity); err == nil {
				t.Fatal("validateActiveCustomerConfigIdentity() accepted invalid local identity")
			}
		})
	}
}

func TestValidateActiveCustomerConfigIdentityRejectsWrong133Identity(t *testing.T) {
	tests := []struct {
		name     string
		identity activeCustomerConfigIdentity
	}{
		{
			name: "wrong revision",
			identity: activeCustomerConfigIdentity{
				revision:       "yoyoosun-customer-trial-133-package-v1.runtime-manifest-v1",
				productVersion: customerTrial133ProductVersion,
				compiledSnapshot: map[string]any{
					"applyPurpose": customerTrial133ApplyPurpose, "datasetVersion": currentDatasetVersion, "target": targetCustomerTrial133,
				},
			},
		},
		{
			name: "wrong product version",
			identity: activeCustomerConfigIdentity{
				revision:       customerTrial133Revision,
				productVersion: "customer-trial-133-test-2026.07.15-v1",
				compiledSnapshot: map[string]any{
					"applyPurpose": customerTrial133ApplyPurpose, "datasetVersion": currentDatasetVersion, "target": targetCustomerTrial133,
				},
			},
		},
		{
			name: "missing purpose",
			identity: activeCustomerConfigIdentity{
				revision:       customerTrial133Revision,
				productVersion: customerTrial133ProductVersion,
				compiledSnapshot: map[string]any{
					"datasetVersion": currentDatasetVersion, "target": targetCustomerTrial133,
				},
			},
		},
		{
			name: "wrong dataset version",
			identity: activeCustomerConfigIdentity{
				revision:       customerTrial133Revision,
				productVersion: customerTrial133ProductVersion,
				compiledSnapshot: map[string]any{
					"applyPurpose": customerTrial133ApplyPurpose, "datasetVersion": "2026.07.15-v1", "target": targetCustomerTrial133,
				},
			},
		},
		{
			name: "wrong target",
			identity: activeCustomerConfigIdentity{
				revision:       customerTrial133Revision,
				productVersion: customerTrial133ProductVersion,
				compiledSnapshot: map[string]any{
					"applyPurpose": customerTrial133ApplyPurpose, "datasetVersion": currentDatasetVersion, "target": targetLocalDev,
				},
			},
		},
		{
			name: "marker wrong type",
			identity: activeCustomerConfigIdentity{
				revision:       customerTrial133Revision,
				productVersion: customerTrial133ProductVersion,
				compiledSnapshot: map[string]any{
					"applyPurpose": customerTrial133ApplyPurpose, "datasetVersion": currentDatasetVersion, "target": []any{targetCustomerTrial133},
				},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateActiveCustomerConfigIdentity(targetCustomerTrial133, test.identity); err == nil {
				t.Fatal("validateActiveCustomerConfigIdentity() accepted invalid customer-trial-133 identity")
			}
		})
	}
}

func TestActiveCustomerConfigReadsCompiledSnapshotIdentity(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New(): %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery(`SELECT revision, product_version, compiled_snapshot`).WillReturnRows(
		sqlmock.NewRows([]string{"revision", "product_version", "compiled_snapshot"}).AddRow(
			customerTrial133Revision,
			customerTrial133ProductVersion,
			[]byte(`{"applyPurpose":"customer_trial_test_apply","datasetVersion":"2026.07.16-v5","target":"customer-trial-133"}`),
		),
	)
	identity, err := activeCustomerConfig(t.Context(), db)
	if err != nil {
		t.Fatalf("activeCustomerConfig(): %v", err)
	}
	if err := validateActiveCustomerConfigIdentity(targetCustomerTrial133, identity); err != nil {
		t.Fatalf("validateActiveCustomerConfigIdentity(): %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet(): %v", err)
	}
}

func TestActiveCustomerConfigRejectsUnreadableSnapshot(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New(): %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery(`SELECT revision, product_version, compiled_snapshot`).WillReturnRows(
		sqlmock.NewRows([]string{"revision", "product_version", "compiled_snapshot"}).AddRow(
			customerTrial133Revision,
			customerTrial133ProductVersion,
			[]byte(`{"applyPurpose":`),
		),
	)
	if _, err := activeCustomerConfig(t.Context(), db); err == nil {
		t.Fatal("activeCustomerConfig() accepted invalid compiled_snapshot JSON")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet(): %v", err)
	}
}
