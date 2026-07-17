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
	CustomerConfigLocalTestHost             = "192.168.0.106"
	CustomerConfigLocalTestPort             = uint16(5432)
	CustomerConfigLocalTestSystemIdentifier = "7572907083182862377"
	localDevelopmentDatabaseName            = "plush_erp"
)

func IsDevConfigPath(confPath string) bool {
	normalized := filepath.ToSlash(filepath.Clean(strings.TrimSpace(confPath)))
	const devConfigDir = "configs/dev"
	return normalized == devConfigDir ||
		strings.HasPrefix(normalized, devConfigDir+"/") ||
		strings.Contains(normalized, "/"+devConfigDir+"/") ||
		strings.HasSuffix(normalized, "/"+devConfigDir)
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

// RequireCustomerConfigLocalTestDSN binds local-test customer-config writes to
// the registered 106 development database family. It deliberately ignores
// ERP_ALLOW_TEST_DB_AS_DEV so that an explicit test-server operation cannot
// enable this revision class on 133 or another target.
func RequireCustomerConfigLocalTestDSN(dsn string) error {
	_, err := requireCustomerConfigLocalTestConfig(dsn)
	return err
}

// RequireCustomerConfigLocalTestRuntime keeps the configured connection target
// and the connected database identity bound together. PostgreSQL may report an
// internal/NAT server address from inet_server_addr(), so the network allowlist
// must be checked against the configured DSN while current_database() proves
// that the live connection did not switch databases. The PostgreSQL system
// identifier additionally rejects a different cluster reached through the same
// registered address and database name. A deliberate 106 cluster rebuild must
// be verified out of band before updating the registered identifier.
func RequireCustomerConfigLocalTestRuntime(dsn string, currentDatabase string, systemIdentifier string) error {
	config, err := requireCustomerConfigLocalTestConfig(dsn)
	if err != nil {
		return err
	}
	currentDatabase = strings.TrimSpace(currentDatabase)
	if currentDatabase == "" || currentDatabase != strings.TrimSpace(config.Database) {
		return fmt.Errorf(
			"customer config local-test runtime database mismatch: configured %s, connected %s",
			strings.TrimSpace(config.Database),
			currentDatabase,
		)
	}
	if strings.TrimSpace(systemIdentifier) != CustomerConfigLocalTestSystemIdentifier {
		return fmt.Errorf("customer config local-test runtime PostgreSQL cluster identity mismatch")
	}
	return nil
}

func requireCustomerConfigLocalTestConfig(dsn string) (*pgconn.Config, error) {
	config, err := pgconn.ParseConfig(strings.TrimSpace(dsn))
	if err != nil {
		return nil, fmt.Errorf("parse postgres dsn for customer config local-test guard failed: %w", err)
	}
	if len(config.Fallbacks) != 0 {
		return nil, customerConfigLocalTestDSNError(strings.TrimSpace(config.Host), config.Port, strings.TrimSpace(config.Database))
	}
	if err := RequireCustomerConfigLocalTestTarget(config.Host, config.Port, config.Database); err != nil {
		return nil, err
	}
	return config, nil
}

func RequireCustomerConfigLocalTestTarget(host string, port uint16, database string) error {
	host = strings.TrimSpace(host)
	database = strings.TrimSpace(database)
	if host != CustomerConfigLocalTestHost || port != CustomerConfigLocalTestPort || !isLocalDevelopmentDatabaseName(database) {
		return customerConfigLocalTestDSNError(host, port, database)
	}
	return nil
}

func customerConfigLocalTestDSNError(host string, port uint16, dbName string) error {
	return fmt.Errorf(
		"customer config local-test gate requires development PostgreSQL %s:%d/%s or %s_*_dev with no fallback; got %s:%d/%s",
		CustomerConfigLocalTestHost,
		CustomerConfigLocalTestPort,
		localDevelopmentDatabaseName,
		localDevelopmentDatabaseName,
		host,
		port,
		dbName,
	)
}

// RequireLocalAdminResetDSN keeps the stable local admin recovery command on
// the registered 106 development database family. Callers still apply their
// own account-selection rules; this guard only constrains the database target.
func RequireLocalAdminResetDSN(dsn string) error {
	return RequireCustomerConfigLocalTestDSN(dsn)
}

func isLocalDevelopmentDatabaseName(name string) bool {
	if name == localDevelopmentDatabaseName {
		return true
	}
	if !strings.HasSuffix(name, "_dev") {
		return false
	}
	base := strings.TrimSuffix(name, "_dev")
	if !strings.HasPrefix(base, localDevelopmentDatabaseName+"_") {
		return false
	}
	middle := strings.TrimPrefix(base, localDevelopmentDatabaseName+"_")
	return strings.Trim(middle, "abcdefghijklmnopqrstuvwxyz0123456789_") == "" && strings.Trim(middle, "_") != ""
}
