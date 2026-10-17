package commandconfig

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestResolvePostgresDSNPrecedence(t *testing.T) {
	t.Setenv("POSTGRES_DSN", "")
	dir := t.TempDir()
	base := filepath.Join(dir, "config.yaml")
	local := filepath.Join(dir, "config.local.yaml")
	writeConfig(t, base, "data:\n  postgres:\n    dsn: postgres://localhost/base\n")
	assertDSN := func(path, want string) {
		t.Helper()
		got, err := ResolvePostgresDSN(path)
		if err != nil || got != want {
			t.Fatalf("ResolvePostgresDSN: got %q, %v; want %q", got, err, want)
		}
	}
	assertDSN(base, "postgres://localhost/base")
	writeConfig(t, local, "data:\n  postgres:\n    dsn: postgres://localhost/local\n")
	assertDSN(base, "postgres://localhost/local")
	writeConfig(t, filepath.Join(dir, "config.local.local.yaml"), "invalid: [")
	assertDSN(local, "postgres://localhost/local")
	writeConfig(t, local, "data:\n  postgres:\n    dsn: ''\n")
	assertDSN(base, "postgres://localhost/base")
	t.Setenv("POSTGRES_DSN", " postgres://localhost/environment ")
	assertDSN(filepath.Join(dir, "missing.yaml"), "postgres://localhost/environment")
}

func TestResolvePostgresDSNRejectsBrokenConfiguration(t *testing.T) {
	t.Setenv("POSTGRES_DSN", "")
	dir := t.TempDir()
	base := filepath.Join(dir, "config.yaml")
	for _, content := range []string{"data: [", "data: {}"} {
		writeConfig(t, base, content)
		if _, err := ResolvePostgresDSN(base); err == nil {
			t.Fatal("broken or empty configuration must fail")
		}
	}
	writeConfig(t, base, "data:\n  postgres:\n    dsn: postgres://localhost/base\n")
	writeConfig(t, filepath.Join(dir, "config.local.yaml"), "data: [")
	if _, err := ResolvePostgresDSN(base); err == nil {
		t.Fatal("invalid local override must not fall back to the base target")
	}
	local := filepath.Join(dir, "config.local.yaml")
	if err := os.Remove(local); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(local, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolvePostgresDSN(base); err == nil {
		t.Fatal("an invalid override file type must not select the base target")
	}
}

func TestInvalidConfigurationDoesNotExposeValues(t *testing.T) {
	t.Setenv("POSTGRES_DSN", "")
	path := filepath.Join(t.TempDir(), "config.yaml")
	writeConfig(t, path, "data:\n  postgres: 'private-password'\n")
	_, err := ResolvePostgresDSN(path)
	if err == nil || strings.Contains(err.Error(), "private-password") {
		t.Fatalf("configuration errors must not include raw values: %v", err)
	}
}

func TestLocalOverrideLinksRequireAReadableFile(t *testing.T) {
	t.Setenv("POSTGRES_DSN", "")
	dir := t.TempDir()
	base := filepath.Join(dir, "config.yaml")
	local := filepath.Join(dir, "config.local.yaml")
	target := filepath.Join(dir, "linked.yaml")
	writeConfig(t, base, "data:\n  postgres:\n    dsn: postgres://localhost/base\n")
	if err := os.Symlink(target, local); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolvePostgresDSN(base); err == nil {
		t.Fatal("a dangling override must fail instead of selecting the base target")
	}
	writeConfig(t, target, "data:\n  postgres:\n    dsn: postgres://localhost/linked\n")
	if dsn, err := ResolvePostgresDSN(base); err != nil || dsn != "postgres://localhost/linked" {
		t.Fatalf("valid local override link was not read: %q, %v", dsn, err)
	}
}

func TestNormalizePostgresURL(t *testing.T) {
	for _, item := range []struct{ input, want string }{
		{"postgresql://localhost/dev", "postgres://localhost/dev?sslmode=disable"},
		{"postgres://localhost/dev?sslmode=require&application_name=seed", "postgres://localhost/dev?application_name=seed&sslmode=require"},
	} {
		got, err := NormalizePostgresURL(item.input)
		if err != nil || got != item.want {
			t.Fatalf("NormalizePostgresURL: got %q, %v; want %q", got, err, item.want)
		}
	}
	for _, input := range []string{"mysql://localhost/dev", "postgres://localhost", "postgres://user:private-password@host/%zz"} {
		_, err := NormalizePostgresURL(input)
		if err == nil || strings.Contains(err.Error(), "private-password") {
			t.Fatalf("invalid URL must fail without leaking credentials: %v", err)
		}
	}
}
