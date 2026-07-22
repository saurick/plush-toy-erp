package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	targetLocalDev         = "local-dev"
	targetCustomerTrial133 = "customer-trial-133"
	adminPasswordEnv       = "MANUAL_ACCEPTANCE_ADMIN_PASSWORD"
	demoPasswordEnv        = "MANUAL_ACCEPTANCE_PASSWORD"
	smsPhoneEnv            = "MANUAL_ACCEPTANCE_SMS_PHONE"
	dsnEnv                 = "POSTGRES_DSN"
	localAcceptanceDB      = "plush_erp_acceptance_20260716_v5_dev"
	customerTrial133DB     = "plush_erp_uat_20260716_v5"
	customerTrial133Port   = "55435"
	currentDatasetVersion  = "2026.07.16-v5"

	localCustomerConfigProductVersion = "local-customer-package-test-apply"
	localCustomerConfigApplyPurpose   = "local_test_apply"
	customerTrial133Revision          = "yoyoosun-customer-trial-133-package-v5.runtime-manifest-v1"
	customerTrial133ProductVersion    = "customer-trial-133-test-2026.07.16-v5"
	customerTrial133ApplyPurpose      = "customer_trial_test_apply"
)

var Version = "dev"

var immutableReleasePattern = regexp.MustCompile(`^[a-f0-9]{40}$`)
var operationIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

var localCustomerConfigRevisionPattern = regexp.MustCompile(
	`^yoyoosun-customer-package-v[1-9][0-9]*\.local-[a-f0-9]{16}\.runtime-v1$`,
)

var demoAcceptanceUsernames = []string{
	"demo_admin",
	"demo_boss",
	"demo_engineering",
	"demo_finance",
	"demo_pmc",
	"demo_production",
	"demo_purchase",
	"demo_quality",
	"demo_sales",
	"demo_warehouse",
}

type options struct {
	target                   string
	datasetVersion           string
	expectedMigrationVersion string
	expectedRelease          string
	operationID              string
	confirm                  string
	timeout                  time.Duration
}

type activeCustomerConfigIdentity struct {
	revision         string
	productVersion   string
	compiledSnapshot map[string]any
}

type rotationReceipt struct {
	GeneratedAt            string                                         `json:"generatedAt"`
	OperationID            string                                         `json:"operationId"`
	Target                 string                                         `json:"target"`
	DatasetVersion         string                                         `json:"datasetVersion"`
	MigrationVersion       string                                         `json:"migrationVersion"`
	CustomerRevision       string                                         `json:"customerRevision"`
	Release                string                                         `json:"release"`
	AdminAccounts          int                                            `json:"adminAccounts"`
	DemoAccounts           int                                            `json:"demoAccounts"`
	RevokedSessions        int64                                          `json:"revokedSessions"`
	AuthVersionIncremented bool                                           `json:"authVersionIncremented"`
	AuditSource            string                                         `json:"auditSource"`
	PhoneBound             bool                                           `json:"phoneBound"`
	Accounts               []data.ManualAcceptancePasswordRotationAccount `json:"accounts"`
	Replayed               bool                                           `json:"replayed"`
}

func expectedConfirmation(target, datasetVersion string) string {
	return "ROTATE_SIMULATED_ACCEPTANCE_ACCOUNTS:" + target + ":" + datasetVersion
}

func validateOptions(opts options) error {
	if opts.target != targetLocalDev && opts.target != targetCustomerTrial133 {
		return fmt.Errorf("target must be %s or %s", targetLocalDev, targetCustomerTrial133)
	}
	if strings.TrimSpace(opts.datasetVersion) == "" {
		return errors.New("dataset-version is required")
	}
	if strings.TrimSpace(opts.expectedMigrationVersion) == "" {
		return errors.New("expected-migration-version is required")
	}
	if opts.target == targetCustomerTrial133 && !immutableReleasePattern.MatchString(opts.expectedRelease) {
		return errors.New("expected-release must be a 40-character lowercase git sha for customer-trial-133")
	}
	if strings.TrimSpace(opts.operationID) == "" {
		return errors.New("operation-id is required")
	}
	if opts.target == targetCustomerTrial133 && !operationIDPattern.MatchString(opts.operationID) {
		return errors.New("operation-id must be a lowercase UUID v4 for customer-trial-133")
	}
	if len(rotationMarkerKey(opts.operationID)) > 128 {
		return errors.New("operation-id is too long for the runtime marker key")
	}
	if opts.confirm != expectedConfirmation(opts.target, opts.datasetVersion) {
		return errors.New("confirmation does not match target and dataset version")
	}
	if opts.timeout <= 0 || opts.timeout > time.Minute {
		return errors.New("timeout must be between 1ns and 1m")
	}
	return nil
}

func rotationMarkerKey(operationID string) string {
	return "manual-acceptance-password-rotation:" + strings.TrimSpace(operationID)
}

func validateReleaseBinding(opts options, version string) error {
	if opts.target != targetCustomerTrial133 {
		return nil
	}
	if !immutableReleasePattern.MatchString(opts.expectedRelease) || version != opts.expectedRelease {
		return errors.New("customer-trial-133 expected release does not match the immutable rotate binary version")
	}
	return nil
}

func validateTargetDSN(target, datasetVersion, rawDSN string) error {
	if rawDSN != strings.TrimSpace(rawDSN) {
		return errors.New("POSTGRES_DSN must not contain surrounding whitespace")
	}
	u, err := url.Parse(rawDSN)
	if err != nil || u == nil {
		return errors.New("POSTGRES_DSN is invalid")
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return errors.New("POSTGRES_DSN must use postgres or postgresql")
	}
	if u.Opaque != "" || u.Fragment != "" || u.RawFragment != "" || strings.Contains(rawDSN, "#") {
		return errors.New("POSTGRES_DSN must use a hierarchical URL without a fragment")
	}
	if u.RawPath != "" {
		return errors.New("POSTGRES_DSN database path must use its canonical unescaped form")
	}
	if u.RawQuery != "sslmode=disable" {
		return errors.New("POSTGRES_DSN query must contain only one sslmode=disable")
	}
	if u.User == nil || strings.TrimSpace(u.User.Username()) == "" || strings.TrimSpace(u.User.Username()) != u.User.Username() {
		return errors.New("POSTGRES_DSN must include an explicit database user")
	}
	if password, ok := u.User.Password(); !ok || password == "" {
		return errors.New("POSTGRES_DSN must include an explicit database password")
	}
	username := u.User.Username()
	host := strings.TrimSpace(u.Hostname())
	port := strings.TrimSpace(u.Port())
	databaseName := strings.TrimPrefix(u.Path, "/")
	if databaseName == "" || u.Path != "/"+databaseName {
		return errors.New("POSTGRES_DSN is missing database name")
	}
	switch target {
	case targetLocalDev:
		if port != "5432" || host != "192.168.0.106" {
			return errors.New("local-dev target requires the registered local PostgreSQL endpoint")
		}
		if databaseName != localAcceptanceDB {
			return fmt.Errorf("local-dev target requires database %s", localAcceptanceDB)
		}
	case targetCustomerTrial133:
		if datasetVersion != currentDatasetVersion {
			return fmt.Errorf("customer-trial-133 supports dataset version %s", currentDatasetVersion)
		}
		if databaseName != customerTrial133DB {
			return fmt.Errorf("customer-trial-133 target requires isolated database %s", customerTrial133DB)
		}
		hostEndpoint := (host == "127.0.0.1" || host == "localhost") && port == customerTrial133Port
		containerEndpoint := host == "postgres" && port == "5432"
		if !hostEndpoint && !containerEndpoint {
			return fmt.Errorf("customer-trial-133 target requires the exact host loopback endpoint on port %s or compose endpoint postgres:5432", customerTrial133Port)
		}
	default:
		return errors.New("unsupported target")
	}

	config, err := pgconn.ParseConfig(rawDSN)
	if err != nil || config == nil {
		return errors.New("POSTGRES_DSN cannot be resolved")
	}
	if strings.TrimSpace(config.Host) != host ||
		fmt.Sprintf("%d", config.Port) != port ||
		strings.TrimSpace(config.Database) != databaseName ||
		config.User != username ||
		len(config.Fallbacks) != 0 ||
		config.TLSConfig != nil {
		return errors.New("POSTGRES_DSN resolved config does not match the single registered target")
	}
	return nil
}

func currentMigrationVersion(ctx context.Context, db *sql.DB) (string, error) {
	var version string
	err := db.QueryRowContext(ctx, `
SELECT version
FROM atlas_schema_revisions.atlas_schema_revisions
WHERE type = 2
ORDER BY executed_at DESC
LIMIT 1`).Scan(&version)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(version), nil
}

func activeCustomerConfig(ctx context.Context, db *sql.DB) (activeCustomerConfigIdentity, error) {
	var identity activeCustomerConfigIdentity
	var snapshotRaw []byte
	err := db.QueryRowContext(ctx, `
SELECT revision, product_version, compiled_snapshot
FROM customer_config_revisions
WHERE customer_key = 'yoyoosun' AND status = 'active'
ORDER BY id DESC
LIMIT 1`).Scan(&identity.revision, &identity.productVersion, &snapshotRaw)
	if err != nil {
		return activeCustomerConfigIdentity{}, err
	}
	if len(snapshotRaw) == 0 || json.Unmarshal(snapshotRaw, &identity.compiledSnapshot) != nil || len(identity.compiledSnapshot) == 0 {
		return activeCustomerConfigIdentity{}, errors.New("active yoyoosun customer configuration snapshot is invalid")
	}
	return identity, nil
}

func validateActiveCustomerConfigIdentity(target string, identity activeCustomerConfigIdentity) error {
	if identity.revision == "" || identity.productVersion == "" || len(identity.compiledSnapshot) == 0 {
		return errors.New("active yoyoosun customer configuration identity is incomplete")
	}
	snapshotString := func(key, expected string) bool {
		value, ok := identity.compiledSnapshot[key].(string)
		return ok && value == expected
	}

	switch target {
	case targetLocalDev:
		if !localCustomerConfigRevisionPattern.MatchString(identity.revision) {
			return errors.New("local-dev active customer configuration revision is not a registered local-test revision")
		}
		if identity.productVersion != localCustomerConfigProductVersion {
			return errors.New("local-dev active customer configuration product version does not match the local-test contract")
		}
		if !snapshotString("applyPurpose", localCustomerConfigApplyPurpose) {
			return errors.New("local-dev active customer configuration marker does not match the local-test contract")
		}
		if _, exists := identity.compiledSnapshot["datasetVersion"]; exists {
			return errors.New("local-dev active customer configuration contains a remote-trial marker")
		}
		if _, exists := identity.compiledSnapshot["target"]; exists {
			return errors.New("local-dev active customer configuration contains a remote-trial marker")
		}
	case targetCustomerTrial133:
		if identity.revision != customerTrial133Revision {
			return errors.New("customer-trial-133 active customer configuration revision does not match the registered trial revision")
		}
		if identity.productVersion != customerTrial133ProductVersion {
			return errors.New("customer-trial-133 active customer configuration product version does not match the registered trial version")
		}
		if !snapshotString("applyPurpose", customerTrial133ApplyPurpose) ||
			!snapshotString("datasetVersion", currentDatasetVersion) ||
			!snapshotString("target", targetCustomerTrial133) {
			return errors.New("customer-trial-133 active customer configuration marker identity is invalid")
		}
	default:
		return errors.New("unsupported target")
	}
	return nil
}

func acceptanceAccountUsernames(opts options) (adminUsernames, demoUsernames []string, err error) {
	demoUsernames = append([]string(nil), demoAcceptanceUsernames...)
	switch opts.target {
	case targetLocalDev:
		return nil, demoUsernames, nil
	case targetCustomerTrial133:
		return []string{"admin"}, demoUsernames, nil
	default:
		return nil, nil, errors.New("unsupported target")
	}
}

func assertAcceptanceAccounts(ctx context.Context, db *sql.DB, adminUsernames, demoUsernames []string) error {
	rows, err := db.QueryContext(ctx, `SELECT username FROM admin_users WHERE username LIKE 'demo_%'`)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	present := map[string]bool{}
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err != nil {
			return err
		}
		present[username] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, username := range adminUsernames {
		var found string
		err := db.QueryRowContext(ctx, `SELECT username FROM admin_users WHERE username = $1`, username).Scan(&found)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		present[found] = true
	}
	missing := make([]string, 0)
	usernames := append(append([]string(nil), adminUsernames...), demoUsernames...)
	for _, username := range usernames {
		if !present[username] {
			missing = append(missing, username)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("required acceptance accounts are missing: %s", strings.Join(missing, ","))
	}
	return nil
}

func validateRotationPasswords(target, adminPassword, demoPassword string) error {
	demoPassword = strings.TrimSpace(demoPassword)
	if demoPassword == "" {
		return fmt.Errorf("%s is required", demoPasswordEnv)
	}
	if biz.ValidateAdminPassword(demoPassword) != nil {
		return fmt.Errorf("%s must contain 8-20 characters", demoPasswordEnv)
	}
	if target != targetCustomerTrial133 {
		return nil
	}
	if err := data.RejectPublicRoleDemoPassword(demoPassword); err != nil {
		return fmt.Errorf("%s is unsafe for %s: %w", demoPasswordEnv, target, err)
	}
	adminPassword = strings.TrimSpace(adminPassword)
	if adminPassword == "" {
		return fmt.Errorf("%s is required for %s", adminPasswordEnv, target)
	}
	if biz.ValidateAdminPassword(adminPassword) != nil {
		return fmt.Errorf("%s must contain 8-20 characters", adminPasswordEnv)
	}
	if err := data.RejectPublicRoleDemoPassword(adminPassword); err != nil {
		return fmt.Errorf("%s is unsafe for %s: %w", adminPasswordEnv, target, err)
	}
	if adminPassword == demoPassword {
		return errors.New("manual acceptance admin and demo passwords must differ")
	}
	return nil
}

func normalizeRotationSMSPhone(target, rawPhone string) (string, error) {
	if target != targetCustomerTrial133 {
		if strings.TrimSpace(rawPhone) != "" {
			return "", errors.New("MANUAL_ACCEPTANCE_SMS_PHONE is only valid for customer-trial-133")
		}
		return "", nil
	}
	if strings.TrimSpace(rawPhone) == "" {
		return "", fmt.Errorf("%s is required for %s", smsPhoneEnv, target)
	}
	phone, err := biz.NormalizeLoginPhone(rawPhone)
	if err != nil {
		return "", fmt.Errorf("%s is invalid", smsPhoneEnv)
	}
	return phone, nil
}

func run(ctx context.Context, opts options, dsn, adminPassword, demoPassword, smsPhone string) error {
	if err := validateOptions(opts); err != nil {
		return err
	}
	if err := validateReleaseBinding(opts, Version); err != nil {
		return err
	}
	if err := validateTargetDSN(opts.target, opts.datasetVersion, dsn); err != nil {
		return err
	}
	adminUsernames, demoUsernames, err := acceptanceAccountUsernames(opts)
	if err != nil {
		return err
	}
	if err := validateRotationPasswords(opts.target, adminPassword, demoPassword); err != nil {
		return err
	}
	normalizedSMSPhone, err := normalizeRotationSMSPhone(opts.target, smsPhone)
	if err != nil {
		return err
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	if err := db.PingContext(ctx); err != nil {
		return err
	}
	version, err := currentMigrationVersion(ctx, db)
	if err != nil {
		return fmt.Errorf("read migration version: %w", err)
	}
	if version != opts.expectedMigrationVersion {
		return fmt.Errorf("migration version mismatch: got %s", version)
	}
	activeConfig, err := activeCustomerConfig(ctx, db)
	if err != nil {
		return errors.New("active yoyoosun customer configuration is required")
	}
	if err := validateActiveCustomerConfigIdentity(opts.target, activeConfig); err != nil {
		return err
	}
	if err := assertAcceptanceAccounts(ctx, db, adminUsernames, demoUsernames); err != nil {
		return err
	}
	phoneUsername := ""
	if normalizedSMSPhone != "" {
		phoneUsername = "admin"
	}
	passwordReceipt, err := data.RotateManualAcceptancePasswordsWithOperation(
		ctx,
		db,
		adminUsernames,
		adminPassword,
		demoUsernames,
		demoPassword,
		phoneUsername,
		normalizedSMSPhone,
		data.ManualAcceptancePasswordRotationOperation{
			MarkerKey: rotationMarkerKey(opts.operationID), OperationID: opts.operationID,
			Target: opts.target, DatasetVersion: opts.datasetVersion, Release: opts.expectedRelease,
			MigrationVersion: version, CustomerRevision: activeConfig.revision,
		},
	)
	if err != nil {
		return err
	}
	var revokedSessions int64
	for _, account := range passwordReceipt.Accounts {
		revokedSessions += account.RevokedSessions
	}
	receipt := rotationReceipt{
		GeneratedAt: passwordReceipt.RotatedAt.Format(time.RFC3339Nano), OperationID: opts.operationID,
		Target: opts.target, DatasetVersion: opts.datasetVersion,
		MigrationVersion: version, CustomerRevision: activeConfig.revision,
		Release:       opts.expectedRelease,
		AdminAccounts: len(adminUsernames), DemoAccounts: len(demoUsernames),
		RevokedSessions: revokedSessions, AuthVersionIncremented: true,
		AuditSource: "manual_acceptance_password_rotation", PhoneBound: normalizedSMSPhone != "", Accounts: passwordReceipt.Accounts,
		Replayed: passwordReceipt.Replayed,
	}
	return json.NewEncoder(os.Stdout).Encode(receipt)
}

func main() {
	var opts options
	flag.StringVar(&opts.target, "target", "", "local-dev or customer-trial-133")
	flag.StringVar(&opts.datasetVersion, "dataset-version", "", "semantic acceptance dataset version")
	flag.StringVar(&opts.expectedMigrationVersion, "expected-migration-version", "", "exact Atlas migration version")
	flag.StringVar(&opts.expectedRelease, "expected-release", "", "exact immutable release git sha")
	flag.StringVar(&opts.operationID, "operation-id", "", "unique idempotency operation id")
	flag.StringVar(&opts.confirm, "confirm", "", "exact target and dataset-bound confirmation")
	flag.DurationVar(&opts.timeout, "timeout", 30*time.Second, "database operation timeout")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), opts.timeout)
	defer cancel()
	if err := run(
		ctx,
		opts,
		os.Getenv(dsnEnv),
		os.Getenv(adminPasswordEnv),
		os.Getenv(demoPasswordEnv),
		os.Getenv(smsPhoneEnv),
	); err != nil {
		fmt.Fprintf(os.Stderr, "rotate manual acceptance passwords: %v\n", err)
		os.Exit(1)
	}
}
