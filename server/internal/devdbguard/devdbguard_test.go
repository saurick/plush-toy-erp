package devdbguard

import (
	"strings"
	"testing"
)

func TestIsDevConfigPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		path string
		want bool
	}{
		{path: "./configs/dev", want: true},
		{path: "./server/configs/dev", want: true},
		{path: "./configs/dev/config.yaml", want: true},
		{path: "server/configs/dev/config.yaml", want: true},
		{path: "./configs/development", want: false},
		{path: "./configs/prod/config.yaml", want: false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.path, func(t *testing.T) {
			t.Parallel()
			if got := IsDevConfigPath(tc.path); got != tc.want {
				t.Fatalf("IsDevConfigPath(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}

func TestRequireLocalDevDSNRejectsTestServerForDevConfig(t *testing.T) {
	t.Parallel()

	err := RequireLocalDevDSN(
		"./configs/dev/config.yaml",
		"postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
		func(string) string { return "" },
	)
	if err == nil {
		t.Fatal("expected test server DSN to be rejected")
	}
}

func TestRequireLocalDevDSNAllowsExplicitTestServerOverride(t *testing.T) {
	t.Parallel()

	err := RequireLocalDevDSN(
		"./configs/dev/config.yaml",
		"postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
		func(key string) string {
			if key == AllowTestDBEnv {
				return "1"
			}
			return ""
		},
	)
	if err != nil {
		t.Fatalf("expected explicit override to allow test server DSN, got %v", err)
	}
}

func TestRequireLocalDevDSNAllowsLocalDevServer(t *testing.T) {
	t.Parallel()

	err := RequireLocalDevDSN(
		"./configs/dev/config.yaml",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp?sslmode=disable",
		func(string) string { return "" },
	)
	if err != nil {
		t.Fatalf("expected local dev server DSN to pass, got %v", err)
	}
}

func TestRequireCustomerConfigLocalTestDSNOnlyAllowsRegisteredDevelopmentFamily(t *testing.T) {
	t.Parallel()

	for _, dsn := range []string{
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp?sslmode=disable",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_acceptance_local_fixture_dev?sslmode=disable",
	} {
		if err := RequireCustomerConfigLocalTestDSN(dsn); err != nil {
			t.Fatalf("expected registered development database to pass, got %v", err)
		}
	}
	for _, dsn := range []string{
		"postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
		"postgres://postgres:secret@127.0.0.1:5432/plush_erp?sslmode=disable",
		"postgres://postgres:secret@192.168.0.106:5432/other_db?sslmode=disable",
		"postgres://postgres:secret@192.168.0.106:5432/plush_erp_dev?sslmode=disable",
		"postgres://postgres:secret@192.168.0.106:5432/plush_erp?host=192.168.0.133&port=5435&sslmode=disable",
		"postgres://postgres:secret@192.168.0.106:5432/plush_erp?dbname=target_db&sslmode=disable",
		"host=192.168.0.106,192.168.0.133 port=5432,5435 dbname=plush_erp user=postgres password=secret sslmode=disable",
	} {
		if err := RequireCustomerConfigLocalTestDSN(dsn); err == nil {
			t.Fatalf("expected customer config local-test DSN %q to be rejected", dsn)
		}
	}
}

func TestRequireCustomerConfigLocalTestRuntimeBindsConfiguredAndConnectedDatabase(t *testing.T) {
	t.Parallel()

	const dsn = "postgres://test_user:secret@192.168.0.106:5432/plush_erp_acceptance_local_fixture_dev?sslmode=disable"
	if err := RequireCustomerConfigLocalTestRuntime(dsn, "plush_erp_acceptance_local_fixture_dev", CustomerConfigLocalTestSystemIdentifier); err != nil {
		t.Fatalf("expected matching registered runtime to pass, got %v", err)
	}
	for _, currentDatabase := range []string{"", "plush_erp", "plush_erp_acceptance_other_dev"} {
		if err := RequireCustomerConfigLocalTestRuntime(dsn, currentDatabase, CustomerConfigLocalTestSystemIdentifier); err == nil {
			t.Fatalf("expected connected database %q to be rejected", currentDatabase)
		}
	}
	if err := RequireCustomerConfigLocalTestRuntime(dsn, "plush_erp_acceptance_local_fixture_dev", "9999999999999999999"); err == nil {
		t.Fatal("expected a different PostgreSQL cluster identity to be rejected")
	}
	if err := RequireCustomerConfigLocalTestRuntime(
		"postgres://postgres:secret@192.168.0.133:5435/plush_erp_acceptance_local_fixture_dev?sslmode=disable",
		"plush_erp_acceptance_local_fixture_dev",
		CustomerConfigLocalTestSystemIdentifier,
	); err == nil {
		t.Fatal("expected unregistered configured target to be rejected")
	}
}

func TestRequireCustomerConfigReleaseRehearsalDSNBindsExactDisposableDatabase(t *testing.T) {
	t.Parallel()

	const runID = "release_95d64e23_20260729"
	const dsn = "postgres://postgres:secret@postgres:5432/plush_erp_release_release_95d64e23_20260729?sslmode=disable"
	if err := RequireCustomerConfigReleaseRehearsalDSN(dsn, runID); err != nil {
		t.Fatalf("expected exact release rehearsal DSN to pass, got %v", err)
	}
	for _, candidate := range []struct {
		dsn   string
		runID string
	}{
		{dsn: "postgres://postgres:secret@postgres:5432/plush_erp?sslmode=disable", runID: runID},
		{dsn: "postgres://postgres:secret@192.168.0.133:5435/plush_erp_release_release_95d64e23_20260729?sslmode=disable", runID: runID},
		{dsn: "postgres://postgres:secret@postgres:5432/plush_erp_release_release_other_20260729?sslmode=disable", runID: runID},
		{dsn: dsn, runID: "short"},
		{dsn: dsn, runID: "release_" + strings.Repeat("a", 38)},
		{dsn: dsn + "&host=192.168.0.133", runID: runID},
	} {
		if err := RequireCustomerConfigReleaseRehearsalDSN(candidate.dsn, candidate.runID); err == nil {
			t.Fatalf("expected release rehearsal target %#v to be rejected", candidate)
		}
	}
}

func TestRequireCustomerConfigReleaseRehearsalRuntimeBindsLiveCluster(t *testing.T) {
	t.Parallel()

	const runID = "release_95d64e23_20260729"
	const database = "plush_erp_release_release_95d64e23_20260729"
	const dsn = "postgres://postgres:secret@postgres:5432/plush_erp_release_release_95d64e23_20260729?sslmode=disable"
	const systemID = "1234567890123456789"
	if err := RequireCustomerConfigReleaseRehearsalRuntime(dsn, runID, database, systemID, systemID); err != nil {
		t.Fatalf("expected exact release rehearsal runtime to pass, got %v", err)
	}
	for _, candidate := range []struct {
		database string
		actual   string
		expected string
	}{
		{database: "plush_erp", actual: systemID, expected: systemID},
		{database: database, actual: "9999999999999999999", expected: systemID},
		{database: database, actual: systemID, expected: ""},
		{database: database, actual: "not-a-system-id", expected: "not-a-system-id"},
	} {
		if err := RequireCustomerConfigReleaseRehearsalRuntime(
			dsn,
			runID,
			candidate.database,
			candidate.actual,
			candidate.expected,
		); err == nil {
			t.Fatalf("expected release rehearsal runtime %#v to be rejected", candidate)
		}
	}
}

func TestRequireLocalAdminResetDSNAllowsOnlyRegisteredDevelopmentFamily(t *testing.T) {
	t.Parallel()

	for _, dsn := range []string{
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp?sslmode=disable",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_acceptance_local_fixture_dev?sslmode=disable",
	} {
		if err := RequireLocalAdminResetDSN(dsn); err != nil {
			t.Fatalf("expected registered local database to pass, got %v", err)
		}
	}
	for _, dsn := range []string{
		"postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
		"postgres://postgres:secret@127.0.0.1:5432/plush_erp?sslmode=disable",
		"host=192.168.0.106,192.168.0.133 port=5432,5435 dbname=plush_erp user=postgres password=secret sslmode=disable",
	} {
		if err := RequireLocalAdminResetDSN(dsn); err == nil {
			t.Fatalf("expected local admin reset DSN %q to be rejected", dsn)
		}
	}
}
