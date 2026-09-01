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
	"server/internal/manualacceptance"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	targetLocalDev          = "local-dev"
	targetCustomerTrial133  = "customer-trial-133"
	targetCustomerTest133   = "customer-test-133"
	adminPasswordEnv        = "MANUAL_ACCEPTANCE_ADMIN_PASSWORD"
	demoPasswordEnv         = "MANUAL_ACCEPTANCE_PASSWORD"
	uatPasswordEnv          = "MANUAL_ACCEPTANCE_UAT_PASSWORD"
	smsPhoneEnv             = "MANUAL_ACCEPTANCE_SMS_PHONE"
	registeredAdminPassword = "adminadmin"
	dsnEnv                  = "POSTGRES_DSN"
	customerTrial133Port    = "55436"
	customerTest133DB       = "plush_erp_customer_test_v1"
	customerTest133Port     = "55437"
	customerTest133Identity = "deployment-target:customer-test-133:clean-acceptance"

	deploymentTargetDemo133         = "demo-133"
	deploymentTargetCustomerTest133 = "customer-test-133"
	nonAdminPolicyRotate            = "rotate"
	nonAdminPolicyPreserve          = "preserve"

	localCustomerConfigProductVersion = "local-customer-package-test-apply"
	localCustomerConfigApplyPurpose   = "local_test_apply"
	customerTrial133ApplyPurpose      = "customer_trial_test_apply"
	credentialRotationReceiptContract = "plush.manual-acceptance-credential-rotation-receipt/v1"
)

var Version = "dev"

var (
	manualAcceptanceContract       = manualacceptance.Current()
	customerTrial133DB             = manualAcceptanceContract.CustomerTrial133.DatabaseName
	currentDatasetVersion          = manualAcceptanceContract.DataVersion
	customerTrial133Revision       = manualAcceptanceContract.CustomerTrial133.ConfigRevision
	customerTrial133ProductVersion = manualAcceptanceContract.CustomerTrial133.ConfigProductVersion
)

var immutableReleasePattern = regexp.MustCompile(`^[a-f0-9]{40}$`)
var operationIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var sha256Pattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var localAcceptanceDatabasePattern = regexp.MustCompile(`^plush_erp_acceptance_([a-z0-9][a-z0-9_]{2,39})_dev$`)

var localCustomerConfigRevisionPattern = regexp.MustCompile(
	`^yoyoosun-customer-package-v[1-9][0-9]*\.local-[a-f0-9]{16}\.runtime-v1$`,
)

var localDemoAcceptanceUsernames = []string{
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

var customerUATAcceptanceUsernames = []string{
	"uat_admin",
	"uat_boss",
	"uat_engineering",
	"uat_finance",
	"uat_pmc",
	"uat_production",
	"uat_purchase",
	"uat_quality",
	"uat_sales",
	"uat_warehouse",
}

type options struct {
	target                   string
	datasetVersion           string
	targetIdentity           string
	expectedMigrationVersion string
	expectedRelease          string
	operationID              string
	backupAlias              string
	backupSHA256             string
	backupSizeBytes          int64
	backupRestoreChecked     bool
	confirm                  string
	timeout                  time.Duration
}

type activeCustomerConfigIdentity struct {
	revision         string
	productVersion   string
	compiledSnapshot map[string]any
}

type rotationReceipt struct {
	SchemaVersion          string                                         `json:"schemaVersion"`
	GeneratedAt            string                                         `json:"generatedAt"`
	OperationID            string                                         `json:"operationId"`
	DeploymentTarget       string                                         `json:"deploymentTarget"`
	Target                 string                                         `json:"target"`
	TargetIdentity         string                                         `json:"targetIdentity"`
	Database               string                                         `json:"database"`
	DatasetVersion         string                                         `json:"datasetVersion,omitempty"`
	MigrationVersion       string                                         `json:"migrationVersion"`
	CustomerRevision       string                                         `json:"customerRevision,omitempty"`
	Release                string                                         `json:"release"`
	AdminAccounts          int                                            `json:"adminAccounts"`
	AccountKind            string                                         `json:"accountKind"`
	RoleAccounts           int                                            `json:"roleAccounts"`
	NonAdminPolicy         string                                         `json:"nonAdminPolicy"`
	NonAdminAccounts       int                                            `json:"nonAdminAccounts"`
	NonAdminPreserved      *bool                                          `json:"nonAdminAccountsPreserved,omitempty"`
	RevokedSessions        int64                                          `json:"revokedSessions"`
	AuthVersionIncremented bool                                           `json:"authVersionIncremented"`
	AuditSource            string                                         `json:"auditSource"`
	PhoneBound             bool                                           `json:"phoneBound"`
	Accounts               []data.ManualAcceptancePasswordRotationAccount `json:"accounts"`
	Replayed               bool                                           `json:"replayed"`
	RollbackPoint          *rotationRollbackPoint                         `json:"rollbackPoint,omitempty"`
}

type rotationRollbackPoint struct {
	BackupAlias    string `json:"backupAlias"`
	BackupSHA256   string `json:"backupSha256"`
	BackupSize     int64  `json:"backupSizeBytes"`
	RestoreChecked bool   `json:"restoreChecked"`
}

func expectedConfirmation(target, identity string) string {
	if target == targetCustomerTest133 {
		return "ROTATE_DEPLOYMENT_ADMIN_CREDENTIAL:" + target + ":" + identity
	}
	return "ROTATE_SIMULATED_ACCEPTANCE_ACCOUNTS:" + target + ":" + identity
}

func isRemote133Target(target string) bool {
	return target == targetCustomerTrial133 || target == targetCustomerTest133
}

func deploymentTargetForCommandTarget(target string) (string, error) {
	switch target {
	case targetLocalDev:
		return targetLocalDev, nil
	case targetCustomerTrial133:
		return deploymentTargetDemo133, nil
	case targetCustomerTest133:
		return deploymentTargetCustomerTest133, nil
	default:
		return "", errors.New("unsupported target")
	}
}

func optionIdentity(opts options) string {
	if opts.target == targetCustomerTest133 {
		return opts.targetIdentity
	}
	return opts.datasetVersion
}

func validateOptions(opts options) error {
	if opts.target != targetLocalDev && opts.target != targetCustomerTrial133 && opts.target != targetCustomerTest133 {
		return fmt.Errorf("target must be %s, %s or %s", targetLocalDev, targetCustomerTrial133, targetCustomerTest133)
	}
	if opts.target == targetCustomerTest133 {
		if opts.datasetVersion != "" {
			return errors.New("dataset-version is not valid for customer-test-133")
		}
		if opts.targetIdentity != customerTest133Identity {
			return errors.New("target-identity does not match the registered customer-test-133 identity")
		}
	} else {
		if strings.TrimSpace(opts.datasetVersion) == "" {
			return errors.New("dataset-version is required")
		}
		if opts.targetIdentity != "" {
			return errors.New("target-identity is only valid for customer-test-133")
		}
	}
	if strings.TrimSpace(opts.expectedMigrationVersion) == "" {
		return errors.New("expected-migration-version is required")
	}
	if isRemote133Target(opts.target) && !immutableReleasePattern.MatchString(opts.expectedRelease) {
		return errors.New("expected-release must be a 40-character lowercase git sha for a registered 133 target")
	}
	if strings.TrimSpace(opts.operationID) == "" {
		return errors.New("operation-id is required")
	}
	if isRemote133Target(opts.target) && !operationIDPattern.MatchString(opts.operationID) {
		return errors.New("operation-id must be a lowercase UUID v4 for a registered 133 target")
	}
	if len(rotationMarkerKey(opts.operationID)) > 128 {
		return errors.New("operation-id is too long for the runtime marker key")
	}
	if isRemote133Target(opts.target) {
		expectedAlias := "pre-credential-rotation-" + opts.expectedRelease[:12] + "-" + opts.operationID
		if opts.backupAlias != expectedAlias {
			return errors.New("backup-alias does not match the immutable credential rotation identity")
		}
		if !sha256Pattern.MatchString(opts.backupSHA256) {
			return errors.New("backup-sha256 must be a 64-character lowercase sha256")
		}
		if opts.backupSizeBytes <= 0 {
			return errors.New("backup-size-bytes must be positive")
		}
		if !opts.backupRestoreChecked {
			return errors.New("backup-restore-checked is required for a registered 133 target")
		}
	} else if opts.backupAlias != "" || opts.backupSHA256 != "" || opts.backupSizeBytes != 0 || opts.backupRestoreChecked {
		return errors.New("backup rollback point is only valid for a registered 133 target")
	}
	if opts.confirm != expectedConfirmation(opts.target, optionIdentity(opts)) {
		return errors.New("confirmation does not match target identity")
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
	if !isRemote133Target(opts.target) {
		return nil
	}
	if !immutableReleasePattern.MatchString(opts.expectedRelease) || version != opts.expectedRelease {
		return fmt.Errorf("%s expected release does not match the immutable rotate binary version", opts.target)
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
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			return errors.New("local-dev target requires a loopback PostgreSQL endpoint")
		}
		matches := localAcceptanceDatabasePattern.FindStringSubmatch(databaseName)
		if len(matches) != 2 || strings.HasSuffix(matches[1], "_browser_actions") {
			return errors.New("local-dev target requires database plush_erp_acceptance_<run-id>_dev")
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
	case targetCustomerTest133:
		if datasetVersion != "" {
			return errors.New("customer-test-133 does not accept a simulated dataset version")
		}
		if databaseName != customerTest133DB {
			return fmt.Errorf("customer-test-133 target requires isolated database %s", customerTest133DB)
		}
		hostEndpoint := (host == "127.0.0.1" || host == "localhost") && port == customerTest133Port
		containerEndpoint := host == "postgres" && port == "5432"
		if !hostEndpoint && !containerEndpoint {
			return fmt.Errorf("customer-test-133 target requires the exact host loopback endpoint on port %s or compose endpoint postgres:5432", customerTest133Port)
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

func acceptanceAccountUsernames(opts options) (adminUsernames, roleUsernames []string, accountKind, nonAdminPolicy string, err error) {
	switch opts.target {
	case targetLocalDev:
		return nil, append([]string(nil), localDemoAcceptanceUsernames...), "local-demo", nonAdminPolicyRotate, nil
	case targetCustomerTrial133:
		return []string{"admin"}, append([]string(nil), customerUATAcceptanceUsernames...), "customer-uat", nonAdminPolicyRotate, nil
	case targetCustomerTest133:
		return []string{"admin"}, nil, "customer-test-admin-only", nonAdminPolicyPreserve, nil
	default:
		return nil, nil, "", "", errors.New("unsupported target")
	}
}

func assertAcceptanceAccounts(ctx context.Context, db *sql.DB, target string, adminUsernames, roleUsernames []string) error {
	if target == targetCustomerTest133 {
		if len(adminUsernames) != 1 || adminUsernames[0] != "admin" || len(roleUsernames) != 0 {
			return errors.New("customer-test-133 account selection must contain only the stable admin")
		}
		var found string
		if err := db.QueryRowContext(ctx, `SELECT username FROM admin_users WHERE username = $1`, "admin").Scan(&found); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return errors.New("required acceptance account is missing: admin")
			}
			return err
		}
		if found != "admin" {
			return errors.New("customer-test-133 stable admin identity mismatch")
		}
		return nil
	}
	requiredPrefix := "demo_"
	forbiddenPrefix := "uat_"
	if target == targetCustomerTrial133 {
		requiredPrefix = "uat_"
		forbiddenPrefix = "demo_"
	}
	rows, err := db.QueryContext(ctx, `SELECT username FROM admin_users WHERE username LIKE $1`, requiredPrefix+"%")
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
	usernames := append(append([]string(nil), adminUsernames...), roleUsernames...)
	for _, username := range usernames {
		if !present[username] {
			missing = append(missing, username)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("required acceptance accounts are missing: %s", strings.Join(missing, ","))
	}
	var forbiddenCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM admin_users WHERE username LIKE $1`, forbiddenPrefix+"%").Scan(&forbiddenCount); err != nil {
		return err
	}
	if forbiddenCount != 0 {
		return fmt.Errorf("%s target contains %d forbidden %s accounts", target, forbiddenCount, forbiddenPrefix)
	}
	return nil
}

func validateRotationPasswords(target, adminPassword, rolePassword string) error {
	adminPassword = strings.TrimSpace(adminPassword)
	rolePassword = strings.TrimSpace(rolePassword)
	switch target {
	case targetLocalDev:
		if rolePassword == "" {
			return fmt.Errorf("%s is required", demoPasswordEnv)
		}
		if biz.ValidateAdminPassword(rolePassword) != nil {
			return fmt.Errorf("%s must contain 8-20 characters", demoPasswordEnv)
		}
		if rolePassword != data.PublicRoleDemoPassword {
			return fmt.Errorf("%s must match the registered local test credential", demoPasswordEnv)
		}
		return nil
	case targetCustomerTrial133:
		if rolePassword == "" {
			return fmt.Errorf("%s is required", uatPasswordEnv)
		}
		if biz.ValidateAdminPassword(rolePassword) != nil {
			return fmt.Errorf("%s must contain 8-20 characters", uatPasswordEnv)
		}
		if rolePassword != data.PublicRoleDemoPassword {
			return fmt.Errorf("%s must match the registered customer-trial-133 test credential", uatPasswordEnv)
		}
	case targetCustomerTest133:
		if rolePassword != "" {
			return errors.New("customer-test-133 does not accept a non-admin password")
		}
	default:
		return errors.New("unsupported target")
	}
	if adminPassword == "" {
		return fmt.Errorf("%s is required for %s", adminPasswordEnv, target)
	}
	if biz.ValidateAdminPassword(adminPassword) != nil {
		return fmt.Errorf("%s must contain 8-20 characters", adminPasswordEnv)
	}
	if adminPassword != registeredAdminPassword {
		return fmt.Errorf("%s must match the registered deployment test credential", adminPasswordEnv)
	}
	if target == targetCustomerTrial133 && adminPassword == rolePassword {
		return errors.New("manual acceptance admin and UAT role passwords must differ")
	}
	return nil
}

func normalizeRotationSMSPhone(target, rawPhone string) (string, error) {
	if target != targetCustomerTrial133 {
		if strings.TrimSpace(rawPhone) != "" {
			return "", fmt.Errorf("%s is only valid for customer-trial-133", smsPhoneEnv)
		}
		return "", nil
	}
	if strings.TrimSpace(rawPhone) == "" {
		return "", nil
	}
	phone, err := biz.NormalizeLoginPhone(rawPhone)
	if err != nil {
		return "", fmt.Errorf("%s is invalid", smsPhoneEnv)
	}
	return phone, nil
}

func nonAdminReceiptFields(
	policy string,
	roleAccountCount int,
	receipt *data.ManualAcceptancePasswordRotationReceipt,
) (int, *bool, error) {
	if receipt == nil {
		return 0, nil, errors.New("manual acceptance password rotation receipt is missing")
	}
	switch policy {
	case nonAdminPolicyRotate:
		if receipt.Unselected != nil {
			return 0, nil, errors.New("rotate policy returned an unexpected unselected account receipt")
		}
		return roleAccountCount, nil, nil
	case nonAdminPolicyPreserve:
		if receipt.Unselected == nil || receipt.Unselected.AccountCount < 0 || !receipt.Unselected.Preserved {
			return 0, nil, errors.New("preserve policy is missing an atomic unselected account receipt")
		}
		preserved := true
		return receipt.Unselected.AccountCount, &preserved, nil
	default:
		return 0, nil, errors.New("unsupported non-admin policy")
	}
}

func run(ctx context.Context, opts options, dsn, adminPassword, rolePassword, smsPhone string) error {
	if err := validateOptions(opts); err != nil {
		return err
	}
	if err := validateReleaseBinding(opts, Version); err != nil {
		return err
	}
	if err := validateTargetDSN(opts.target, opts.datasetVersion, dsn); err != nil {
		return err
	}
	dsnURL, err := url.Parse(dsn)
	if err != nil || dsnURL == nil {
		return errors.New("POSTGRES_DSN is invalid")
	}
	databaseName := strings.TrimPrefix(dsnURL.Path, "/")
	adminUsernames, roleUsernames, accountKind, nonAdminPolicy, err := acceptanceAccountUsernames(opts)
	if err != nil {
		return err
	}
	deploymentTarget, err := deploymentTargetForCommandTarget(opts.target)
	if err != nil {
		return err
	}
	if err := validateRotationPasswords(opts.target, adminPassword, rolePassword); err != nil {
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
	targetIdentity := opts.target + ":" + opts.datasetVersion
	customerRevision := ""
	operationDatasetVersion := opts.datasetVersion
	operationIdentity := ""
	if opts.target == targetCustomerTest133 {
		targetIdentity = opts.targetIdentity
		operationDatasetVersion = opts.targetIdentity
		operationIdentity = opts.targetIdentity
	} else {
		activeConfig, err := activeCustomerConfig(ctx, db)
		if err != nil {
			return errors.New("active yoyoosun customer configuration is required")
		}
		if err := validateActiveCustomerConfigIdentity(opts.target, activeConfig); err != nil {
			return err
		}
		customerRevision = activeConfig.revision
		operationIdentity = activeConfig.revision
	}
	if err := assertAcceptanceAccounts(ctx, db, opts.target, adminUsernames, roleUsernames); err != nil {
		return err
	}
	phoneUsername := ""
	if normalizedSMSPhone != "" {
		phoneUsername = "admin"
	}
	var rollbackPoint *data.ManualAcceptancePasswordRotationRollbackPoint
	if isRemote133Target(opts.target) {
		rollbackPoint = &data.ManualAcceptancePasswordRotationRollbackPoint{
			BackupAlias:    opts.backupAlias,
			BackupSHA256:   opts.backupSHA256,
			BackupSize:     opts.backupSizeBytes,
			RestoreChecked: opts.backupRestoreChecked,
		}
	}
	passwordReceipt, err := data.RotateManualAcceptancePasswordsWithOperation(
		ctx,
		db,
		adminUsernames,
		adminPassword,
		roleUsernames,
		rolePassword,
		phoneUsername,
		normalizedSMSPhone,
		data.ManualAcceptancePasswordRotationOperation{
			MarkerKey: rotationMarkerKey(opts.operationID), OperationID: opts.operationID,
			Target: opts.target, DatasetVersion: operationDatasetVersion, Release: opts.expectedRelease,
			MigrationVersion: version, CustomerRevision: operationIdentity,
			PreserveUnselectedAccounts: nonAdminPolicy == nonAdminPolicyPreserve,
			RollbackPoint:              rollbackPoint,
		},
	)
	if err != nil {
		return err
	}
	nonAdminAccounts, nonAdminPreserved, err := nonAdminReceiptFields(
		nonAdminPolicy,
		len(roleUsernames),
		passwordReceipt,
	)
	if err != nil {
		return err
	}
	var revokedSessions int64
	for _, account := range passwordReceipt.Accounts {
		revokedSessions += account.RevokedSessions
	}
	receipt := rotationReceipt{
		SchemaVersion: credentialRotationReceiptContract,
		GeneratedAt:   passwordReceipt.RotatedAt.Format(time.RFC3339Nano), OperationID: opts.operationID,
		DeploymentTarget: deploymentTarget, Target: opts.target, TargetIdentity: targetIdentity, Database: databaseName,
		DatasetVersion: opts.datasetVersion, MigrationVersion: version, CustomerRevision: customerRevision,
		Release:       opts.expectedRelease,
		AdminAccounts: len(adminUsernames), AccountKind: accountKind, RoleAccounts: len(roleUsernames),
		NonAdminPolicy: nonAdminPolicy, NonAdminAccounts: nonAdminAccounts, NonAdminPreserved: nonAdminPreserved,
		RevokedSessions: revokedSessions, AuthVersionIncremented: true,
		AuditSource: "manual_acceptance_password_rotation", PhoneBound: normalizedSMSPhone != "", Accounts: passwordReceipt.Accounts,
		Replayed: passwordReceipt.Replayed,
	}
	if isRemote133Target(opts.target) {
		if passwordReceipt.RollbackPoint == nil {
			return errors.New("durable credential rotation rollback point is missing")
		}
		receipt.RollbackPoint = &rotationRollbackPoint{
			BackupAlias:    passwordReceipt.RollbackPoint.BackupAlias,
			BackupSHA256:   passwordReceipt.RollbackPoint.BackupSHA256,
			BackupSize:     passwordReceipt.RollbackPoint.BackupSize,
			RestoreChecked: passwordReceipt.RollbackPoint.RestoreChecked,
		}
	}
	return json.NewEncoder(os.Stdout).Encode(receipt)
}

func main() {
	var opts options
	flag.StringVar(&opts.target, "target", "", "local-dev, customer-trial-133 or customer-test-133")
	flag.StringVar(&opts.datasetVersion, "dataset-version", "", "semantic acceptance dataset version")
	flag.StringVar(&opts.targetIdentity, "target-identity", "", "fixed non-dataset identity for customer-test-133")
	flag.StringVar(&opts.expectedMigrationVersion, "expected-migration-version", "", "exact Atlas migration version")
	flag.StringVar(&opts.expectedRelease, "expected-release", "", "exact immutable release git sha")
	flag.StringVar(&opts.operationID, "operation-id", "", "unique idempotency operation id")
	flag.StringVar(&opts.backupAlias, "backup-alias", "", "operation-bound pre-credential rollback point alias")
	flag.StringVar(&opts.backupSHA256, "backup-sha256", "", "restore-checked pre-credential backup sha256")
	flag.Int64Var(&opts.backupSizeBytes, "backup-size-bytes", 0, "restore-checked pre-credential backup size")
	flag.BoolVar(&opts.backupRestoreChecked, "backup-restore-checked", false, "confirm the operation-bound backup restore check passed")
	flag.StringVar(&opts.confirm, "confirm", "", "exact target identity-bound confirmation")
	flag.DurationVar(&opts.timeout, "timeout", 30*time.Second, "database operation timeout")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), opts.timeout)
	defer cancel()
	rolePassword := ""
	smsPhone := ""
	if opts.target == targetLocalDev {
		rolePassword = os.Getenv(demoPasswordEnv)
	}
	if opts.target == targetCustomerTrial133 {
		rolePassword = os.Getenv(uatPasswordEnv)
		smsPhone = os.Getenv(smsPhoneEnv)
	}
	if err := run(
		ctx,
		opts,
		os.Getenv(dsnEnv),
		os.Getenv(adminPasswordEnv),
		rolePassword,
		smsPhone,
	); err != nil {
		fmt.Fprintf(os.Stderr, "rotate manual acceptance passwords: %v\n", err)
		os.Exit(1)
	}
}
