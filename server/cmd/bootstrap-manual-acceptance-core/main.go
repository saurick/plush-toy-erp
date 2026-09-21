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
	"strings"
	"time"

	"server/internal/customertrialconfig"
	"server/internal/data"
	"server/internal/manualacceptance"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	dsnEnv                    = "POSTGRES_DSN"
	customerTestTarget        = "customer-test-133"
	customerTestDatabase      = "plush_erp_customer_test_v1"
	customerTestFoundationKey = "yoyoosun-customer-test-core"
	productionPostgresHost    = "postgres"
	productionPostgresPort    = "5432"
)

var (
	manualAcceptanceContract = manualacceptance.Current()
	Version                  = "dev"
	migrationVersionPattern  = regexp.MustCompile(`^[0-9]{14}$`)
	releaseVersionPattern    = regexp.MustCompile(`^[0-9a-f]{40}$`)
	errCoreBoundaryViolation = errors.New("manual acceptance core boundary is invalid")
)

type targetPolicy struct {
	target             string
	customerKey        string
	database           string
	datasetKey         string
	datasetVersion     string
	runID              string
	requireTrialConfig bool
	retireLegacy       bool
}

type options struct {
	target                   string
	expectedDatabase         string
	expectedMigrationVersion string
	expectedRelease          string
	confirm                  string
	timeout                  time.Duration
}

type activeConfigIdentity struct {
	revision         string
	productVersion   string
	compiledSnapshot map[string]any
	activeCount      int64
}

type coreBoundary struct {
	unitTotal      int64
	unitExact      int64
	warehouseTotal int64
	warehouseExact int64
	materialCount  int64
	productCount   int64
	processCount   int64
	bomHeaderCount int64
}

type bootstrapResult struct {
	unitIDs             map[string]int
	warehouseIDs        map[string]int
	retiredUnitIDs      map[string]int
	retiredWarehouseIDs map[string]int
}

func main() {
	opts, err := parseOptions(os.Args[1:])
	if err != nil {
		fail("%v", err)
	}
	policy, err := resolveTargetPolicy(opts.target)
	if err != nil {
		fail("%v", err)
	}
	dsn := os.Getenv(dsnEnv)
	if err := validateInvocation(opts, dsn, os.Getenv, Version); err != nil {
		fail("%v", err)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fail("open PostgreSQL failed")
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), opts.timeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		fail("connect PostgreSQL failed")
	}
	result, err := bootstrapManualAcceptanceCore(ctx, db, opts)
	if err != nil {
		fail("bootstrap manual acceptance core failed: %v", err)
	}

	fmt.Printf(
		"core reference bootstrap completed target=%s customer=%s database=%s dataset_key=%s dataset_version=%s run_id=%s migration=%s release=%s units=%d warehouses=%d retired_legacy_units=%d retired_legacy_warehouses=%d retire_legacy_references=%t idempotent=true\n",
		policy.target,
		policy.customerKey,
		policy.database,
		policy.datasetKey,
		policy.datasetVersion,
		policy.runID,
		opts.expectedMigrationVersion,
		opts.expectedRelease,
		len(result.unitIDs),
		len(result.warehouseIDs),
		len(result.retiredUnitIDs),
		len(result.retiredWarehouseIDs),
		policy.retireLegacy,
	)
}

func parseOptions(args []string) (options, error) {
	var opts options
	flags := flag.NewFlagSet("bootstrap-manual-acceptance-core", flag.ContinueOnError)
	flags.StringVar(&opts.target, "target", customertrialconfig.ExpectedTarget, "exact target: customer-trial-133 or customer-test-133")
	flags.StringVar(&opts.expectedDatabase, "expected-database", "", "exact registered target database")
	flags.StringVar(&opts.expectedMigrationVersion, "expected-migration", "", "exact current Atlas migration version")
	flags.StringVar(&opts.expectedRelease, "expected-release", "", "exact 40-character lowercase Git SHA compiled into this binary")
	flags.StringVar(&opts.confirm, "confirm", "", "exact target-bound confirmation")
	flags.DurationVar(&opts.timeout, "timeout", 30*time.Second, "total database operation timeout")
	if err := flags.Parse(args); err != nil {
		return options{}, err
	}
	if flags.NArg() != 0 {
		return options{}, fmt.Errorf("unexpected positional arguments")
	}
	return opts, nil
}

func resolveTargetPolicy(target string) (targetPolicy, error) {
	target = strings.TrimSpace(target)
	switch target {
	case customertrialconfig.ExpectedTarget:
		return targetPolicy{
			target:             customertrialconfig.ExpectedTarget,
			customerKey:        customertrialconfig.ExpectedCustomerKey,
			database:           manualAcceptanceContract.CustomerTrial133.DatabaseName,
			datasetKey:         manualAcceptanceContract.DatasetKey,
			datasetVersion:     customertrialconfig.DatasetVersion,
			runID:              manualAcceptanceContract.RunID,
			requireTrialConfig: true,
			retireLegacy:       true,
		}, nil
	case customerTestTarget:
		return targetPolicy{
			target:             customerTestTarget,
			customerKey:        customertrialconfig.ExpectedCustomerKey,
			database:           customerTestDatabase,
			datasetKey:         customerTestFoundationKey,
			datasetVersion:     manualAcceptanceContract.DataVersion,
			runID:              manualAcceptanceContract.RunID,
			requireTrialConfig: false,
			retireLegacy:       false,
		}, nil
	default:
		return targetPolicy{}, fmt.Errorf("--target must equal %s or %s", customertrialconfig.ExpectedTarget, customerTestTarget)
	}
}

func expectedConfirmation(opts options) (string, error) {
	policy, err := resolveTargetPolicy(opts.target)
	if err != nil {
		return "", err
	}
	action := "BOOTSTRAP_MANUAL_ACCEPTANCE_CORE"
	if policy.target == customerTestTarget {
		action = "BOOTSTRAP_CUSTOMER_TEST_CORE"
	}
	return strings.Join([]string{
		action,
		policy.target,
		policy.customerKey,
		policy.database,
		policy.datasetKey,
		policy.datasetVersion,
		policy.runID,
		opts.expectedMigrationVersion,
		opts.expectedRelease,
	}, ":"), nil
}

func validateOptions(opts options) error {
	policy, err := resolveTargetPolicy(opts.target)
	if err != nil {
		return err
	}
	if opts.expectedDatabase != policy.database {
		return fmt.Errorf("--expected-database must equal the registered %s database", policy.target)
	}
	if !migrationVersionPattern.MatchString(opts.expectedMigrationVersion) {
		return fmt.Errorf("--expected-migration must be a 14-digit Atlas version")
	}
	if !releaseVersionPattern.MatchString(opts.expectedRelease) {
		return fmt.Errorf("--expected-release must be a 40-character lowercase Git SHA")
	}
	expected, err := expectedConfirmation(opts)
	if err != nil {
		return err
	}
	if opts.confirm != expected {
		return fmt.Errorf("--confirm does not match the exact target, database, dataset, run, migration and release")
	}
	if opts.timeout <= 0 || opts.timeout > time.Minute {
		return fmt.Errorf("--timeout must be greater than zero and at most one minute")
	}
	return nil
}

func validateInvocation(opts options, dsn string, getenv func(string) string, compiledVersion string) error {
	if err := validateOptions(opts); err != nil {
		return err
	}
	policy, err := resolveTargetPolicy(opts.target)
	if err != nil {
		return err
	}
	if dsn == "" || dsn != strings.TrimSpace(dsn) {
		return fmt.Errorf("%s must be present without surrounding whitespace", dsnEnv)
	}
	enabled, gateErr := customertrialconfig.ResolveGate(dsn, getenv)
	if policy.requireTrialConfig {
		if gateErr != nil {
			return gateErr
		}
		if !enabled {
			return fmt.Errorf("customer-trial-133 runtime gate is not enabled")
		}
	} else {
		if gateErr != nil || enabled {
			return fmt.Errorf("customer-test-133 requires the customer trial runtime gate to be disabled")
		}
		if strings.TrimSpace(getenv(customertrialconfig.DebugEnv)) != "prod" {
			return fmt.Errorf("customer-test-133 requires %s=prod", customertrialconfig.DebugEnv)
		}
		if err := validateCustomerTestDSN(dsn, policy.database); err != nil {
			return err
		}
	}
	if compiledVersion != opts.expectedRelease {
		return fmt.Errorf("compiled release does not match --expected-release")
	}
	return nil
}

func validateCustomerTestDSN(raw, expectedDatabase string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil ||
		(parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") ||
		parsed.Opaque != "" || parsed.Fragment != "" ||
		parsed.Hostname() != productionPostgresHost ||
		parsed.Port() != productionPostgresPort ||
		parsed.Path != "/"+expectedDatabase {
		return fmt.Errorf("customer-test-133 PostgreSQL target does not match the registered database")
	}
	query := parsed.Query()
	sslModes, ok := query["sslmode"]
	if len(query) != 1 || !ok || len(sslModes) != 1 || sslModes[0] != "disable" {
		return fmt.Errorf("customer-test-133 PostgreSQL query must contain only sslmode=disable")
	}
	config, err := pgconn.ParseConfig(raw)
	if err != nil || config == nil ||
		strings.TrimSpace(config.Host) != productionPostgresHost ||
		fmt.Sprintf("%d", config.Port) != productionPostgresPort ||
		strings.TrimSpace(config.Database) != expectedDatabase ||
		len(config.Fallbacks) != 0 || config.TLSConfig != nil {
		return fmt.Errorf("customer-test-133 PostgreSQL target cannot be resolved to the single registered database")
	}
	return nil
}

func bootstrapManualAcceptanceCore(ctx context.Context, db *sql.DB, opts options) (*bootstrapResult, error) {
	if db == nil {
		return nil, fmt.Errorf("PostgreSQL connection is required")
	}
	policy, err := resolveTargetPolicy(opts.target)
	if err != nil {
		return nil, err
	}
	dataset := data.DefaultCoreDemoReferenceSeedDataset()
	if err := validateReferenceDataset(dataset); err != nil {
		return nil, err
	}
	var databaseName string
	if err := db.QueryRowContext(ctx, `SELECT current_database()`).Scan(&databaseName); err != nil {
		return nil, fmt.Errorf("database identity readback failed: %w", err)
	}
	if databaseName != policy.database || databaseName != opts.expectedDatabase {
		return nil, fmt.Errorf("database identity does not match the registered %s database", policy.target)
	}

	var schemaStatus string
	if err := db.QueryRowContext(ctx, `
SELECT CASE WHEN
  to_regclass('public.units') IS NOT NULL AND
  to_regclass('public.warehouses') IS NOT NULL AND
  to_regclass('public.materials') IS NOT NULL AND
  to_regclass('public.products') IS NOT NULL AND
  to_regclass('public.processes') IS NOT NULL AND
  to_regclass('public.bom_headers') IS NOT NULL AND
  to_regclass('public.customer_config_revisions') IS NOT NULL AND
  to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL
THEN 'ready' ELSE 'missing' END`).Scan(&schemaStatus); err != nil {
		return nil, fmt.Errorf("schema preflight failed: %w", err)
	}
	if schemaStatus != "ready" {
		return nil, fmt.Errorf("required schema is incomplete")
	}

	var migrationVersion string
	if err := db.QueryRowContext(ctx, `
SELECT version
FROM atlas_schema_revisions.atlas_schema_revisions
WHERE type = 2
ORDER BY executed_at DESC
LIMIT 1`).Scan(&migrationVersion); err != nil {
		return nil, fmt.Errorf("atlas migration readback failed: %w", err)
	}
	if strings.TrimSpace(migrationVersion) != opts.expectedMigrationVersion {
		return nil, fmt.Errorf("atlas migration does not match --expected-migration")
	}

	identity, err := activeCustomerConfig(ctx, db, policy.customerKey)
	if err != nil {
		return nil, err
	}
	if identity.activeCount != 1 {
		return nil, fmt.Errorf("active %s configuration count must equal one", policy.target)
	}
	trial, err := customertrialconfig.ClassifyManifest(
		policy.customerKey,
		identity.revision,
		identity.productVersion,
		identity.compiledSnapshot,
	)
	if err != nil {
		return nil, fmt.Errorf("active %s configuration is invalid: %w", policy.target, err)
	}
	if policy.requireTrialConfig != trial {
		return nil, fmt.Errorf("active configuration does not match the registered %s policy", policy.target)
	}

	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, fmt.Errorf("begin reference transaction failed: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	before, err := inspectCoreBoundary(ctx, tx, dataset)
	if err != nil {
		return nil, fmt.Errorf("pre-write core boundary readback failed: %w", err)
	}
	if err := validatePreWriteBoundary(before, dataset); err != nil {
		return nil, err
	}
	result, err := upsertCoreReferences(ctx, tx, dataset, policy.retireLegacy)
	if err != nil {
		return nil, err
	}
	after, err := inspectCoreBoundary(ctx, tx, dataset)
	if err != nil {
		return nil, fmt.Errorf("post-write core boundary readback failed: %w", err)
	}
	if err := validatePostWriteBoundary(after, dataset); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit reference transaction failed: %w", err)
	}
	return result, nil
}

func activeCustomerConfig(ctx context.Context, db *sql.DB, customerKey string) (activeConfigIdentity, error) {
	var identity activeConfigIdentity
	var snapshotRaw []byte
	err := db.QueryRowContext(ctx, `
SELECT revision, product_version, compiled_snapshot, COUNT(*) OVER ()
FROM customer_config_revisions
WHERE customer_key = $1 AND status = 'active'
ORDER BY activated_at DESC NULLS LAST, id DESC
LIMIT 1`, customerKey).Scan(
		&identity.revision,
		&identity.productVersion,
		&snapshotRaw,
		&identity.activeCount,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return activeConfigIdentity{}, fmt.Errorf("active customer configuration is missing")
	}
	if err != nil {
		return activeConfigIdentity{}, fmt.Errorf("active customer configuration readback failed: %w", err)
	}
	if len(snapshotRaw) == 0 || json.Unmarshal(snapshotRaw, &identity.compiledSnapshot) != nil || len(identity.compiledSnapshot) == 0 {
		return activeConfigIdentity{}, fmt.Errorf("active customer compiled snapshot is invalid")
	}
	return identity, nil
}

func validateReferenceDataset(dataset data.CoreDemoReferenceSeedDataset) error {
	contract := manualacceptance.Current()
	if strings.TrimSpace(dataset.Prefix) != contract.VisiblePrefix || len(dataset.Units) != len(contract.Units) || len(dataset.Warehouses) != len(contract.Warehouses) {
		return fmt.Errorf("%w: default dataset must contain exactly %d units and %d warehouses", errCoreBoundaryViolation, len(contract.Units), len(contract.Warehouses))
	}
	unitCodes := make(map[string]struct{}, len(dataset.Units))
	unitPattern := ""
	for _, unit := range dataset.Units {
		if !strings.HasPrefix(unit.Code, dataset.Prefix+"-") || strings.TrimSpace(unit.Name) == "" || unit.Precision < 0 {
			return fmt.Errorf("%w: default unit is invalid", errCoreBoundaryViolation)
		}
		if _, duplicate := unitCodes[unit.Code]; duplicate {
			return fmt.Errorf("%w: default unit code is duplicated", errCoreBoundaryViolation)
		}
		unitCodes[unit.Code] = struct{}{}
		pattern, err := coreCodeNamespacePattern(unit.Code)
		if err != nil {
			return err
		}
		if unitPattern == "" {
			unitPattern = pattern
		} else if pattern != unitPattern {
			return fmt.Errorf("%w: default unit namespace is inconsistent", errCoreBoundaryViolation)
		}
	}
	warehouseCodes := make(map[string]struct{}, len(dataset.Warehouses))
	warehousePattern := ""
	for _, warehouse := range dataset.Warehouses {
		if !strings.HasPrefix(warehouse.Code, dataset.Prefix+"-") || strings.TrimSpace(warehouse.Name) == "" || strings.TrimSpace(warehouse.Type) == "" {
			return fmt.Errorf("%w: default warehouse is invalid", errCoreBoundaryViolation)
		}
		if _, duplicate := warehouseCodes[warehouse.Code]; duplicate {
			return fmt.Errorf("%w: default warehouse code is duplicated", errCoreBoundaryViolation)
		}
		warehouseCodes[warehouse.Code] = struct{}{}
		pattern, err := coreCodeNamespacePattern(warehouse.Code)
		if err != nil {
			return err
		}
		if warehousePattern == "" {
			warehousePattern = pattern
		} else if pattern != warehousePattern {
			return fmt.Errorf("%w: default warehouse namespace is inconsistent", errCoreBoundaryViolation)
		}
	}
	if unitPattern == warehousePattern {
		return fmt.Errorf("%w: unit and warehouse namespaces must be distinct", errCoreBoundaryViolation)
	}
	return nil
}

func inspectCoreBoundary(ctx context.Context, tx *sql.Tx, dataset data.CoreDemoReferenceSeedDataset) (coreBoundary, error) {
	units := dataset.Units
	warehouses := dataset.Warehouses
	unitPattern, err := coreCodeNamespacePattern(units[0].Code)
	if err != nil {
		return coreBoundary{}, err
	}
	warehousePattern, err := coreCodeNamespacePattern(warehouses[0].Code)
	if err != nil {
		return coreBoundary{}, err
	}
	args := []any{unitPattern, warehousePattern}
	unitClauses := make([]string, 0, len(units))
	for _, unit := range units {
		base := len(args) + 1
		unitClauses = append(unitClauses, fmt.Sprintf("(code = $%d AND name = $%d AND precision = $%d)", base, base+1, base+2))
		args = append(args, unit.Code, unit.Name, unit.Precision)
	}
	warehouseClauses := make([]string, 0, len(warehouses))
	for _, warehouse := range warehouses {
		base := len(args) + 1
		warehouseClauses = append(warehouseClauses, fmt.Sprintf("(code = $%d AND name = $%d AND type = $%d)", base, base+1, base+2))
		args = append(args, warehouse.Code, warehouse.Name, warehouse.Type)
	}
	query := fmt.Sprintf(`
/* manual-acceptance-core-boundary */
SELECT
  (SELECT COUNT(*) FROM units WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM units WHERE is_active IS TRUE AND (%s)),
  (SELECT COUNT(*) FROM warehouses WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM warehouses WHERE is_active IS TRUE AND (%s)),
  (SELECT COUNT(*) FROM materials WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM products WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM processes WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM bom_headers WHERE version LIKE $1 OR version LIKE $2)`, strings.Join(unitClauses, " OR "), strings.Join(warehouseClauses, " OR "))
	var boundary coreBoundary
	err = tx.QueryRowContext(ctx, query, args...).Scan(
		&boundary.unitTotal,
		&boundary.unitExact,
		&boundary.warehouseTotal,
		&boundary.warehouseExact,
		&boundary.materialCount,
		&boundary.productCount,
		&boundary.processCount,
		&boundary.bomHeaderCount,
	)
	return boundary, err
}

func coreCodeNamespacePattern(code string) (string, error) {
	code = strings.TrimSpace(code)
	separator := strings.LastIndex(code, "-")
	if separator <= 0 || separator == len(code)-1 {
		return "", fmt.Errorf("%w: core reference code namespace is invalid", errCoreBoundaryViolation)
	}
	return code[:separator+1] + "%", nil
}

func validatePreWriteBoundary(boundary coreBoundary, dataset data.CoreDemoReferenceSeedDataset) error {
	if boundary.materialCount != 0 || boundary.productCount != 0 || boundary.processCount != 0 || boundary.bomHeaderCount != 0 {
		return fmt.Errorf("%w: prefixed material, product, process or BOM records already exist", errCoreBoundaryViolation)
	}
	if boundary.unitTotal != boundary.unitExact || boundary.unitTotal > int64(len(dataset.Units)) {
		return fmt.Errorf("%w: prefixed unit records are outside the exact allowlist", errCoreBoundaryViolation)
	}
	if boundary.warehouseTotal != boundary.warehouseExact || boundary.warehouseTotal > int64(len(dataset.Warehouses)) {
		return fmt.Errorf("%w: prefixed warehouse records are outside the exact allowlist", errCoreBoundaryViolation)
	}
	return nil
}

func validatePostWriteBoundary(boundary coreBoundary, dataset data.CoreDemoReferenceSeedDataset) error {
	if err := validatePreWriteBoundary(boundary, dataset); err != nil {
		return err
	}
	if boundary.unitTotal != int64(len(dataset.Units)) || boundary.unitExact != int64(len(dataset.Units)) || boundary.warehouseTotal != int64(len(dataset.Warehouses)) || boundary.warehouseExact != int64(len(dataset.Warehouses)) {
		return fmt.Errorf("%w: exact unit and warehouse readback counts are incomplete", errCoreBoundaryViolation)
	}
	return nil
}

func upsertCoreReferences(ctx context.Context, tx *sql.Tx, dataset data.CoreDemoReferenceSeedDataset, retireLegacy bool) (*bootstrapResult, error) {
	var (
		reconciled *data.CoreDemoSeedResult
		err        error
	)
	if retireLegacy {
		reconciled, err = data.ReconcileCoreDemoReferencesInTx(ctx, tx, dataset)
	} else {
		reconciled, err = data.ReconcilePreservedCoreReferencesInTx(ctx, tx, dataset)
	}
	if err != nil {
		return nil, fmt.Errorf("reconcile exact core references failed: %w", err)
	}
	return &bootstrapResult{
		unitIDs:             reconciled.UnitIDs,
		warehouseIDs:        reconciled.WarehouseIDs,
		retiredUnitIDs:      reconciled.RetiredUnitIDs,
		retiredWarehouseIDs: reconciled.RetiredWarehouseIDs,
	}, nil
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
