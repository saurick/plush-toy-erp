package devdbguard

import (
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
)

const AllowTestDBEnv = "ERP_ALLOW_TEST_DB_AS_DEV"

func IsDevConfigPath(confPath string) bool {
	normalized := filepath.ToSlash(filepath.Clean(strings.TrimSpace(confPath)))
	return strings.Contains(normalized, "/configs/dev/") || strings.HasPrefix(normalized, "configs/dev/")
}

func RequireLocalDevDSN(confPath string, dsn string, getenv func(string) string) error {
	if !IsDevConfigPath(confPath) {
		return nil
	}
	if getenv == nil {
		getenv = func(string) string { return "" }
	}
	if strings.TrimSpace(getenv(AllowTestDBEnv)) == "1" {
		return nil
	}

	u, err := url.Parse(strings.TrimSpace(dsn))
	if err != nil {
		return fmt.Errorf("parse postgres dsn for dev guard failed: %w", err)
	}
	host := strings.TrimSpace(u.Hostname())
	port := strings.TrimSpace(u.Port())
	dbName := strings.TrimPrefix(u.Path, "/")
	if host == "192.168.0.133" || port == "5435" {
		return fmt.Errorf("dev config points to test PostgreSQL %s:%s/%s; local development must use 192.168.0.106:5432/plush_erp, or set %s=1 for an explicit test-server operation", host, port, dbName, AllowTestDBEnv)
	}
	return nil
}
