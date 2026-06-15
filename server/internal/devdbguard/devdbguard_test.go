package devdbguard

import "testing"

func TestIsDevConfigPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		path string
		want bool
	}{
		{path: "./configs/dev/config.yaml", want: true},
		{path: "server/configs/dev/config.yaml", want: true},
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
