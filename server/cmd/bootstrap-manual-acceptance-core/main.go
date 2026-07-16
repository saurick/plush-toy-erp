package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"server/internal/customertrialconfig"
	"server/internal/data"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	dsnEnv             = "POSTGRES_DSN"
	expectedDatabase   = "plush_erp_uat_20260716_v5"
	expectedDatasetKey = "yoyoosun-manual-acceptance"
	expectedRunID      = "20260716-V5"
)

var (
	Version                  = "dev"
	migrationVersionPattern  = regexp.MustCompile(`^[0-9]{14}$`)
	releaseVersionPattern    = regexp.MustCompile(`^[0-9a-f]{40}$`)
	errCoreBoundaryViolation = errors.New("manual acceptance core boundary is invalid")
)

type options struct {
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
	unitIDs      map[string]int
	warehouseIDs map[string]int
}

func main() {
	opts, err := parseOptions(os.Args[1:])
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
		"manual acceptance core bootstrap completed target=%s customer=%s database=%s dataset_key=%s dataset_version=%s run_id=%s migration=%s release=%s units=%d warehouses=%d idempotent=true\n",
		customertrialconfig.ExpectedTarget,
		customertrialconfig.ExpectedCustomerKey,
		expectedDatabase,
		expectedDatasetKey,
		customertrialconfig.DatasetVersion,
		expectedRunID,
		opts.expectedMigrationVersion,
		opts.expectedRelease,
		len(result.unitIDs),
		len(result.warehouseIDs),
	)
}

func parseOptions(args []string) (options, error) {
	var opts options
	flags := flag.NewFlagSet("bootstrap-manual-acceptance-core", flag.ContinueOnError)
	flags.StringVar(&opts.expectedDatabase, "expected-database", "", "exact registered customer-trial-133 database")
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

func expectedConfirmation(opts options) string {
	return strings.Join([]string{
		"BOOTSTRAP_MANUAL_ACCEPTANCE_CORE",
		customertrialconfig.ExpectedTarget,
		customertrialconfig.ExpectedCustomerKey,
		expectedDatabase,
		expectedDatasetKey,
		customertrialconfig.DatasetVersion,
		expectedRunID,
		opts.expectedMigrationVersion,
		opts.expectedRelease,
	}, ":")
}

func validateOptions(opts options) error {
	if opts.expectedDatabase != expectedDatabase {
		return fmt.Errorf("--expected-database must equal the registered customer-trial-133 database")
	}
	if !migrationVersionPattern.MatchString(opts.expectedMigrationVersion) {
		return fmt.Errorf("--expected-migration must be a 14-digit Atlas version")
	}
	if !releaseVersionPattern.MatchString(opts.expectedRelease) {
		return fmt.Errorf("--expected-release must be a 40-character lowercase Git SHA")
	}
	if opts.confirm != expectedConfirmation(opts) {
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
	if dsn == "" || dsn != strings.TrimSpace(dsn) {
		return fmt.Errorf("%s must be present without surrounding whitespace", dsnEnv)
	}
	enabled, err := customertrialconfig.ResolveGate(dsn, getenv)
	if err != nil {
		return err
	}
	if !enabled {
		return fmt.Errorf("customer-trial-133 runtime gate is not enabled")
	}
	if compiledVersion != opts.expectedRelease {
		return fmt.Errorf("compiled release does not match --expected-release")
	}
	return nil
}

func bootstrapManualAcceptanceCore(ctx context.Context, db *sql.DB, opts options) (*bootstrapResult, error) {
	if db == nil {
		return nil, fmt.Errorf("PostgreSQL connection is required")
	}
	dataset := data.DefaultCoreDemoReferenceSeedDataset()
	if err := validateReferenceDataset(dataset); err != nil {
		return nil, err
	}
	var databaseName string
	if err := db.QueryRowContext(ctx, `SELECT current_database()`).Scan(&databaseName); err != nil {
		return nil, fmt.Errorf("database identity readback failed: %w", err)
	}
	if databaseName != expectedDatabase || databaseName != opts.expectedDatabase {
		return nil, fmt.Errorf("database identity does not match the registered customer-trial-133 database")
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

	identity, err := activeCustomerTrialConfig(ctx, db)
	if err != nil {
		return nil, err
	}
	if identity.activeCount != 1 {
		return nil, fmt.Errorf("active customer-trial-133 configuration count must equal one")
	}
	trial, err := customertrialconfig.ClassifyManifest(
		customertrialconfig.ExpectedCustomerKey,
		identity.revision,
		identity.productVersion,
		identity.compiledSnapshot,
	)
	if err != nil {
		return nil, fmt.Errorf("active customer-trial-133 configuration is invalid: %w", err)
	}
	if !trial {
		return nil, fmt.Errorf("active configuration is not the registered customer-trial-133 revision")
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
	if err := validatePreWriteBoundary(before); err != nil {
		return nil, err
	}
	result, err := upsertCoreReferences(ctx, tx, dataset)
	if err != nil {
		return nil, err
	}
	after, err := inspectCoreBoundary(ctx, tx, dataset)
	if err != nil {
		return nil, fmt.Errorf("post-write core boundary readback failed: %w", err)
	}
	if err := validatePostWriteBoundary(after); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit reference transaction failed: %w", err)
	}
	return result, nil
}

func activeCustomerTrialConfig(ctx context.Context, db *sql.DB) (activeConfigIdentity, error) {
	var identity activeConfigIdentity
	var snapshotRaw []byte
	err := db.QueryRowContext(ctx, `
SELECT revision, product_version, compiled_snapshot, COUNT(*) OVER ()
FROM customer_config_revisions
WHERE customer_key = $1 AND status = 'active'
ORDER BY activated_at DESC NULLS LAST, id DESC
LIMIT 1`, customertrialconfig.ExpectedCustomerKey).Scan(
		&identity.revision,
		&identity.productVersion,
		&snapshotRaw,
		&identity.activeCount,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return activeConfigIdentity{}, fmt.Errorf("active customer-trial-133 configuration is missing")
	}
	if err != nil {
		return activeConfigIdentity{}, fmt.Errorf("active customer-trial-133 configuration readback failed: %w", err)
	}
	if len(snapshotRaw) == 0 || json.Unmarshal(snapshotRaw, &identity.compiledSnapshot) != nil || len(identity.compiledSnapshot) == 0 {
		return activeConfigIdentity{}, fmt.Errorf("active customer-trial-133 compiled snapshot is invalid")
	}
	return identity, nil
}

func validateReferenceDataset(dataset data.CoreDemoReferenceSeedDataset) error {
	if strings.TrimSpace(dataset.Prefix) == "" || len(dataset.Units) != 1 || len(dataset.Warehouses) != 4 {
		return fmt.Errorf("%w: default dataset must contain exactly one unit and four warehouses", errCoreBoundaryViolation)
	}
	unit := dataset.Units[0]
	if !strings.HasPrefix(unit.Code, dataset.Prefix+"-") || strings.TrimSpace(unit.Name) == "" || unit.Precision < 0 {
		return fmt.Errorf("%w: default unit is invalid", errCoreBoundaryViolation)
	}
	unitPattern, err := coreCodeNamespacePattern(unit.Code)
	if err != nil {
		return err
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
	unit := dataset.Units[0]
	warehouses := dataset.Warehouses
	unitPattern, err := coreCodeNamespacePattern(unit.Code)
	if err != nil {
		return coreBoundary{}, err
	}
	warehousePattern, err := coreCodeNamespacePattern(warehouses[0].Code)
	if err != nil {
		return coreBoundary{}, err
	}
	var boundary coreBoundary
	err = tx.QueryRowContext(ctx, `
/* manual-acceptance-core-boundary */
SELECT
  (SELECT COUNT(*) FROM units WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM units WHERE code = $3 AND name = $4 AND precision = $5 AND is_active IS TRUE),
  (SELECT COUNT(*) FROM warehouses WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM warehouses WHERE is_active IS TRUE AND (
    (code = $6 AND name = $7 AND type = $8) OR
    (code = $9 AND name = $10 AND type = $11) OR
    (code = $12 AND name = $13 AND type = $14) OR
    (code = $15 AND name = $16 AND type = $17)
  )),
  (SELECT COUNT(*) FROM materials WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM products WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM processes WHERE code LIKE $1 OR code LIKE $2),
  (SELECT COUNT(*) FROM bom_headers WHERE version LIKE $1 OR version LIKE $2)`,
		unitPattern,
		warehousePattern,
		unit.Code,
		unit.Name,
		unit.Precision,
		warehouses[0].Code,
		warehouses[0].Name,
		warehouses[0].Type,
		warehouses[1].Code,
		warehouses[1].Name,
		warehouses[1].Type,
		warehouses[2].Code,
		warehouses[2].Name,
		warehouses[2].Type,
		warehouses[3].Code,
		warehouses[3].Name,
		warehouses[3].Type,
	).Scan(
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

func validatePreWriteBoundary(boundary coreBoundary) error {
	if boundary.materialCount != 0 || boundary.productCount != 0 || boundary.processCount != 0 || boundary.bomHeaderCount != 0 {
		return fmt.Errorf("%w: prefixed material, product, process or BOM records already exist", errCoreBoundaryViolation)
	}
	if boundary.unitTotal != boundary.unitExact || boundary.unitTotal > 1 {
		return fmt.Errorf("%w: prefixed unit records are outside the exact allowlist", errCoreBoundaryViolation)
	}
	if boundary.warehouseTotal != boundary.warehouseExact || boundary.warehouseTotal > 4 {
		return fmt.Errorf("%w: prefixed warehouse records are outside the exact allowlist", errCoreBoundaryViolation)
	}
	return nil
}

func validatePostWriteBoundary(boundary coreBoundary) error {
	if err := validatePreWriteBoundary(boundary); err != nil {
		return err
	}
	if boundary.unitTotal != 1 || boundary.unitExact != 1 || boundary.warehouseTotal != 4 || boundary.warehouseExact != 4 {
		return fmt.Errorf("%w: exact unit and warehouse readback counts are incomplete", errCoreBoundaryViolation)
	}
	return nil
}

func upsertCoreReferences(ctx context.Context, tx *sql.Tx, dataset data.CoreDemoReferenceSeedDataset) (*bootstrapResult, error) {
	result := &bootstrapResult{
		unitIDs:      make(map[string]int, len(dataset.Units)),
		warehouseIDs: make(map[string]int, len(dataset.Warehouses)),
	}
	for _, unit := range dataset.Units {
		var id int
		err := tx.QueryRowContext(ctx, `
INSERT INTO units (code, name, precision, is_active, created_at, updated_at)
VALUES ($1, $2, $3, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  precision = EXCLUDED.precision,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`, unit.Code, unit.Name, unit.Precision).Scan(&id)
		if err != nil {
			return nil, fmt.Errorf("upsert exact core unit failed: %w", err)
		}
		result.unitIDs[unit.Code] = id
	}
	for _, warehouse := range dataset.Warehouses {
		var id int
		err := tx.QueryRowContext(ctx, `
INSERT INTO warehouses (code, name, type, is_active, created_at, updated_at)
VALUES ($1, $2, $3, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`, warehouse.Code, warehouse.Name, warehouse.Type).Scan(&id)
		if err != nil {
			return nil, fmt.Errorf("upsert exact core warehouse failed: %w", err)
		}
		result.warehouseIDs[warehouse.Code] = id
	}
	return result, nil
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
