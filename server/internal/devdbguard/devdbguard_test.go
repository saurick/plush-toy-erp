package devdbguard

import "testing"

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
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable",
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

func TestRequireLocalAdminResetDSNAllowsOnlyRegisteredDevelopmentFamily(t *testing.T) {
	t.Parallel()

	for _, dsn := range []string{
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp?sslmode=disable",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable",
		"postgres://test_user:secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable",
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
