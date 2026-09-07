package devdbguard

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const AllowTestDBEnv = "ERP_ALLOW_TEST_DB_AS_DEV"

const (
	CustomerConfigLocalTestHost             = "192.168.0.133"
	CustomerConfigLocalTestPort             = uint16(5432)
	CustomerConfigLocalTestSystemIdentifier = "7682605996671565865"
	localDevelopmentDatabaseName            = "plush_erp"
	customerConfigReleaseRehearsalHost      = "postgres"
	customerConfigReleaseRehearsalPort      = uint16(5432)
)

var customerConfigReleaseRehearsalIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_]{7,44}$`)

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

	cfg, err := pgconn.ParseConfig(strings.TrimSpace(dsn))
	if err != nil {
		return fmt.Errorf("invalid postgres dsn for development guard")
	}
	u, err := url.Parse(strings.TrimSpace(dsn))
	if err != nil {
		return fmt.Errorf("invalid postgres dsn for development guard")
	}
	if u.Scheme == "postgres" || u.Scheme == "postgresql" {
		port := u.Port()
		if port == "" {
			port = "5432"
		}
		if u.Hostname() != cfg.Host || port != fmt.Sprint(cfg.Port) || strings.TrimPrefix(u.Path, "/") != cfg.Database {
			return fmt.Errorf("development database URL cannot override its declared target")
		}
	}
	check := func(host string, port uint16) error {
		if host == "192.168.0.106" || host == CustomerConfigLocalTestHost || port == 5435 {
			if host != CustomerConfigLocalTestHost || port != CustomerConfigLocalTestPort || !isLocalDevelopmentDatabaseName(cfg.Database) {
				return fmt.Errorf("dev config must use registered development PostgreSQL %s:%d/plush_erp or plush_erp_*_dev; other 133 instances and the retired source are not development targets", CustomerConfigLocalTestHost, CustomerConfigLocalTestPort)
			}
		}
		return nil
	}
	if err := check(cfg.Host, cfg.Port); err != nil {
		return err
	}
	for _, fallback := range cfg.Fallbacks {
		if fallback.Host != cfg.Host || fallback.Port != cfg.Port {
			return fmt.Errorf("development database must not use a fallback target")
		}
	}

	return nil
}

// VerifyRegisteredDevelopmentRuntime checks the live cluster before application
// startup. Explicit loopback test databases and deployment instances retain their
// own lifecycle; the registered shared development target has a fixed identity.
func VerifyRegisteredDevelopmentRuntime(dsn string) error {
	cfg, err := pgconn.ParseConfig(strings.TrimSpace(dsn))
	if err != nil {
		return fmt.Errorf("invalid development database configuration")
	}
	if cfg.Host != CustomerConfigLocalTestHost || cfg.Port != CustomerConfigLocalTestPort {
		return nil
	}
	if err := RequireCustomerConfigLocalTestDSN(dsn); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("cannot verify registered development PostgreSQL connection")
	}
	defer func() { _ = conn.Close(ctx) }()
	var database, identity string
	if err := conn.QueryRow(ctx, "SELECT current_database(), system_identifier::text FROM pg_control_system()").Scan(&database, &identity); err != nil {
		return fmt.Errorf("cannot read registered development PostgreSQL identity")
	}
	return RequireCustomerConfigLocalTestRuntime(dsn, database, identity)
}

// RequireCustomerConfigLocalTestDSN binds local-test customer-config writes to
// the registered 133 development database family. It deliberately ignores
// ERP_ALLOW_TEST_DB_AS_DEV so that an explicit test-server operation cannot
// enable this revision class on another instance or database family.
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
// registered address and database name. A deliberate development cluster rebuild must
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

// RequireCustomerConfigReleaseRehearsalDSN keeps the release-only local-test
// capability inside the disposable Compose database named by the exact run ID.
// It is separate from the registered 133 development-family capability.
func RequireCustomerConfigReleaseRehearsalDSN(dsn string, runID string) error {
	runID = strings.TrimSpace(runID)
	if !customerConfigReleaseRehearsalIDPattern.MatchString(runID) {
		return fmt.Errorf("customer config release rehearsal run ID is invalid")
	}
	config, err := pgconn.ParseConfig(strings.TrimSpace(dsn))
	if err != nil {
		return fmt.Errorf("parse postgres dsn for customer config release rehearsal guard failed: %w", err)
	}
	expectedDatabase := "plush_erp_release_" + runID
	if len(config.Fallbacks) != 0 ||
		strings.TrimSpace(config.Host) != customerConfigReleaseRehearsalHost ||
		config.Port != customerConfigReleaseRehearsalPort ||
		strings.TrimSpace(config.Database) != expectedDatabase {
		return fmt.Errorf(
			"customer config release rehearsal gate requires %s:%d/%s with no fallback",
			customerConfigReleaseRehearsalHost,
			customerConfigReleaseRehearsalPort,
			expectedDatabase,
		)
	}
	return nil
}

// RequireCustomerConfigReleaseRehearsalRuntime binds the configured disposable
// database to the live database and PostgreSQL cluster observed before startup.
func RequireCustomerConfigReleaseRehearsalRuntime(
	dsn string,
	runID string,
	currentDatabase string,
	systemIdentifier string,
	expectedSystemIdentifier string,
) error {
	if err := RequireCustomerConfigReleaseRehearsalDSN(dsn, runID); err != nil {
		return err
	}
	expectedDatabase := "plush_erp_release_" + strings.TrimSpace(runID)
	if strings.TrimSpace(currentDatabase) != expectedDatabase {
		return fmt.Errorf(
			"customer config release rehearsal runtime database mismatch: expected %s, connected %s",
			expectedDatabase,
			strings.TrimSpace(currentDatabase),
		)
	}
	systemIdentifier = strings.TrimSpace(systemIdentifier)
	expectedSystemIdentifier = strings.TrimSpace(expectedSystemIdentifier)
	if len(systemIdentifier) == 0 ||
		len(systemIdentifier) > 20 ||
		expectedSystemIdentifier == "" ||
		systemIdentifier != expectedSystemIdentifier ||
		!allDecimalDigits(systemIdentifier) {
		return fmt.Errorf("customer config release rehearsal PostgreSQL cluster identity mismatch")
	}
	return nil
}

func allDecimalDigits(value string) bool {
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return value != ""
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
// the registered 133 development database family. Callers still apply their
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
