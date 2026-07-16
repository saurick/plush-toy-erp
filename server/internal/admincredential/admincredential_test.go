package admincredential

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseOptionsUsesCanonicalLocalDefaults(t *testing.T) {
	t.Parallel()

	opts, err := parseOptions([]string{
		"--confirm", ExpectedConfirmation(DefaultLocalUsername),
	}, func(string) string { return "" })
	if err != nil {
		t.Fatalf("parseOptions() error = %v", err)
	}
	if opts.username != DefaultLocalUsername {
		t.Fatalf("username = %q, want %q", opts.username, DefaultLocalUsername)
	}
	if opts.password != DefaultLocalPassword {
		t.Fatal("password did not use the canonical local default")
	}
}

func TestParseOptionsSupportsExplicitEnvironmentAndFlagOverrides(t *testing.T) {
	t.Parallel()

	getenv := func(key string) string {
		switch key {
		case AdminUsernameEnv:
			return "env-admin"
		case AdminPasswordEnv:
			return "env-admin-pass"
		default:
			return ""
		}
	}

	envOpts, err := parseOptions([]string{
		"--confirm", ExpectedConfirmation("env-admin"),
	}, getenv)
	if err != nil {
		t.Fatalf("environment parseOptions() error = %v", err)
	}
	if envOpts.username != "env-admin" || envOpts.password != "env-admin-pass" {
		t.Fatal("environment overrides were not applied")
	}

	flagOpts, err := parseOptions([]string{
		"--username", "flag-admin",
		"--password", "flag-admin-pass",
		"--confirm", ExpectedConfirmation("flag-admin"),
	}, getenv)
	if err != nil {
		t.Fatalf("flag parseOptions() error = %v", err)
	}
	if flagOpts.username != "flag-admin" || flagOpts.password != "flag-admin-pass" {
		t.Fatal("flag overrides did not take precedence over environment values")
	}
}

func TestParseOptionsRequiresExactAccountBoundConfirmation(t *testing.T) {
	t.Parallel()

	for _, confirmation := range []string{
		"",
		"RESET_LOCAL_ADMIN_PASSWORD",
		ExpectedConfirmation(DefaultLocalUsername) + " ",
		ExpectedConfirmation("other-admin"),
	} {
		_, err := parseOptions([]string{"--confirm", confirmation}, func(string) string { return "" })
		if err == nil {
			t.Fatalf("confirmation %q unexpectedly passed", confirmation)
		}
	}
}

func TestParseOptionsHasNoProductionEscapeFlag(t *testing.T) {
	t.Parallel()

	_, err := parseOptions([]string{
		"--allow-prod",
		"--confirm", ExpectedConfirmation(DefaultLocalUsername),
	}, func(string) string { return "" })
	if err == nil {
		t.Fatal("--allow-prod unexpectedly enabled an escape path")
	}
}

func TestRequireLocalDevelopmentTargetFailsClosed(t *testing.T) {
	t.Parallel()

	localDSN := "postgres://test_user:secret@192.168.0.106:5432/plush_erp_simon_dev?sslmode=disable"
	if err := requireLocalDevelopmentTarget("./configs/dev/config.yaml", localDSN, func(string) string { return "" }); err != nil {
		t.Fatalf("registered local development target rejected: %v", err)
	}

	cases := []struct {
		name     string
		confPath string
		dsn      string
		getenv   func(string) string
	}{
		{
			name:     "production config",
			confPath: "./configs/prod/config.yaml",
			dsn:      localDSN,
			getenv:   func(string) string { return "" },
		},
		{
			name:     "production environment",
			confPath: "./configs/dev/config.yaml",
			dsn:      localDSN,
			getenv: func(key string) string {
				if key == "APP_ENV" {
					return "production"
				}
				return ""
			},
		},
		{
			name:     "target 133 despite old override",
			confPath: "./configs/dev/config.yaml",
			dsn:      "postgres://postgres:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
			getenv: func(key string) string {
				if key == "ERP_ALLOW_TEST_DB_AS_DEV" {
					return "1"
				}
				return ""
			},
		},
		{
			name:     "generic database",
			confPath: "./configs/dev/config.yaml",
			dsn:      "postgres://postgres:secret@192.168.0.106:5432/postgres?sslmode=disable",
			getenv:   func(string) string { return "" },
		},
		{
			name:     "generic localhost",
			confPath: "./configs/dev/config.yaml",
			dsn:      "postgres://postgres:secret@127.0.0.1:5432/plush_erp?sslmode=disable",
			getenv:   func(string) string { return "" },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if err := requireLocalDevelopmentTarget(tc.confPath, tc.dsn, tc.getenv); err == nil {
				t.Fatal("unsafe target unexpectedly passed")
			}
		})
	}
}

func TestResolvePostgresDSNMergesLocalConfigAndEnvironment(t *testing.T) {
	t.Parallel()

	confDir := filepath.Join(t.TempDir(), "configs", "dev")
	if err := os.MkdirAll(confDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	confPath := filepath.Join(confDir, "config.yaml")
	localPath := filepath.Join(confDir, "config.local.yaml")
	baseDSN := "postgres://base:secret@192.168.0.106:5432/plush_erp?sslmode=disable"
	localDSN := "postgres://local:secret@192.168.0.106:5432/plush_erp_local_dev?sslmode=disable"
	envDSN := "postgres://env:secret@192.168.0.106:5432/plush_erp_env_dev?sslmode=disable"
	writeConfigForTest(t, confPath, baseDSN)
	writeConfigForTest(t, localPath, localDSN)

	got, err := resolvePostgresDSN(confPath, func(string) string { return "" })
	if err != nil {
		t.Fatalf("resolvePostgresDSN() error = %v", err)
	}
	if got != localDSN {
		t.Fatal("config.local.yaml did not override the base development config")
	}

	got, err = resolvePostgresDSN(confPath, func(key string) string {
		if key == PostgresDSNEnv {
			return envDSN
		}
		return ""
	})
	if err != nil {
		t.Fatalf("resolvePostgresDSN() with env error = %v", err)
	}
	if got != envDSN {
		t.Fatal("POSTGRES_DSN did not override config.local.yaml")
	}
}

func writeConfigForTest(t *testing.T, path, dsn string) {
	t.Helper()
	content := "data:\n  postgres:\n    dsn: " + dsn + "\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}

func TestSuccessOutputDoesNotExposeCredentialOrDSN(t *testing.T) {
	t.Parallel()

	var output strings.Builder
	_, err := fmtSuccess(&output, DefaultLocalUsername)
	if err != nil {
		t.Fatalf("fmtSuccess() error = %v", err)
	}
	for _, forbidden := range []string{DefaultLocalPassword, "password_hash", "postgres://"} {
		if strings.Contains(output.String(), forbidden) {
			t.Fatalf("success output exposed forbidden value %q", forbidden)
		}
	}
}
