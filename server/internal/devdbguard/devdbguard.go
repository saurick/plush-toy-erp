package devdbguard

import (
	"fmt"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

const AllowTestDBEnv = "ERP_ALLOW_TEST_DB_AS_DEV"

const (
	localCustomerConfigTestHost = "192.168.0.106"
	localCustomerConfigTestPort = "5432"
	localCustomerConfigTestName = "plush_erp"
)

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

// RequireCustomerConfigLocalTestDSN binds the local-test customer config write
// gate to the project's shared development database. It deliberately ignores
// ERP_ALLOW_TEST_DB_AS_DEV so that an explicit test-server operation cannot
// accidentally enable local-test revisions on a target database.
func RequireCustomerConfigLocalTestDSN(dsn string) error {
	config, err := pgconn.ParseConfig(strings.TrimSpace(dsn))
	if err != nil {
		return fmt.Errorf("parse postgres dsn for customer config local-test guard failed: %w", err)
	}
	host := strings.TrimSpace(config.Host)
	port := fmt.Sprintf("%d", config.Port)
	dbName := strings.TrimSpace(config.Database)
	if host != localCustomerConfigTestHost || port != localCustomerConfigTestPort || !isCustomerConfigLocalTestDatabaseName(dbName) {
		return customerConfigLocalTestDSNError(host, port, dbName)
	}
	for _, fallback := range config.Fallbacks {
		if fallback == nil {
			continue
		}
		fallbackHost := strings.TrimSpace(fallback.Host)
		fallbackPort := fmt.Sprintf("%d", fallback.Port)
		if fallbackHost != localCustomerConfigTestHost || fallbackPort != localCustomerConfigTestPort {
			return customerConfigLocalTestDSNError(fallbackHost, fallbackPort, dbName)
		}
	}
	return nil
}

func isCustomerConfigLocalTestDatabaseName(name string) bool {
	if name == localCustomerConfigTestName {
		return true
	}
	if !strings.HasPrefix(name, localCustomerConfigTestName+"_") || !strings.HasSuffix(name, "_dev") {
		return false
	}
	middle := strings.TrimSuffix(strings.TrimPrefix(name, localCustomerConfigTestName+"_"), "_dev")
	return strings.Trim(middle, "abcdefghijklmnopqrstuvwxyz0123456789_") == "" && strings.Trim(middle, "_") != ""
}

func customerConfigLocalTestDSNError(host, port, dbName string) error {
	return fmt.Errorf(
		"customer config local-test gate requires development PostgreSQL %s:%s/%s or %s_*_dev; got %s:%s/%s",
		localCustomerConfigTestHost,
		localCustomerConfigTestPort,
		localCustomerConfigTestName,
		localCustomerConfigTestName,
		host,
		port,
		dbName,
	)
}
