package main

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"server/internal/customertrialconfig"
	"server/internal/data"

	"github.com/DATA-DOG/go-sqlmock"
)

const (
	testMigration = "20260716123456"
	testRelease   = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	testDSN       = "postgres://postgres:runtime-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable"
)

func validOptions() options {
	opts := options{
		expectedDatabase:         expectedDatabase,
		expectedMigrationVersion: testMigration,
		expectedRelease:          testRelease,
		timeout:                  30 * time.Second,
	}
	opts.confirm = expectedConfirmation(opts)
	return opts
}

func enabledTrialEnv(key string) string {
	switch key {
	case customertrialconfig.AllowEnv:
		return "1"
	case customertrialconfig.TargetEnv:
		return customertrialconfig.ExpectedTarget
	case customertrialconfig.DebugEnv:
		return "prod"
	default:
		return ""
	}
}

func exactTrialSnapshot(t *testing.T) []byte {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"applyPurpose":   customertrialconfig.ApplyPurpose,
		"datasetVersion": customertrialconfig.DatasetVersion,
		"target":         customertrialconfig.ExpectedTarget,
	})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return raw
}

func TestValidateInvocationRequiresEveryExactBoundaryBeforeDatabaseAccess(t *testing.T) {
	if err := validateInvocation(validOptions(), testDSN, enabledTrialEnv, testRelease); err != nil {
		t.Fatalf("validateInvocation() exact input error = %v", err)
	}

	tests := []struct {
		name            string
		mutate          func(*options)
		dsn             string
		getenv          func(string) string
		compiledVersion string
	}{
		{name: "wrong database", mutate: func(opts *options) { opts.expectedDatabase = "plush_erp" }, dsn: testDSN, getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "wrong migration", mutate: func(opts *options) { opts.expectedMigrationVersion = "latest" }, dsn: testDSN, getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "wrong release", mutate: func(opts *options) { opts.expectedRelease = strings.Repeat("A", 40) }, dsn: testDSN, getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "wrong confirmation", mutate: func(opts *options) { opts.confirm = "yes" }, dsn: testDSN, getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "timeout too long", mutate: func(opts *options) { opts.timeout = 2 * time.Minute }, dsn: testDSN, getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "missing dsn", dsn: "", getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "dsn whitespace", dsn: " " + testDSN, getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "gate disabled", dsn: testDSN, getenv: func(string) string { return "" }, compiledVersion: testRelease},
		{name: "wrong gate database", dsn: "postgres://postgres:runtime-password@postgres:5432/plush_erp?sslmode=disable", getenv: enabledTrialEnv, compiledVersion: testRelease},
		{name: "compiled release mismatch", dsn: testDSN, getenv: enabledTrialEnv, compiledVersion: strings.Repeat("b", 40)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validOptions()
			if tt.mutate != nil {
				tt.mutate(&opts)
			}
			if err := validateInvocation(opts, tt.dsn, tt.getenv, tt.compiledVersion); err == nil {
				t.Fatal("validateInvocation() unexpectedly accepted an incomplete or mismatched boundary")
			} else if strings.Contains(err.Error(), "runtime-password") {
				t.Fatalf("validation error leaked DSN credentials: %v", err)
			}
		})
	}
}

func TestExpectedConfirmationBindsFixedDatasetAndRun(t *testing.T) {
	confirmation := expectedConfirmation(validOptions())
	for _, required := range []string{
		customertrialconfig.ExpectedTarget,
		customertrialconfig.ExpectedCustomerKey,
		expectedDatabase,
		expectedDatasetKey,
		customertrialconfig.DatasetVersion,
		expectedRunID,
		testMigration,
		testRelease,
	} {
		if !strings.Contains(confirmation, required) {
			t.Fatalf("confirmation %q does not bind %q", confirmation, required)
		}
	}
}

func TestDockerfileBuildsAndCopiesOneShotBinaryWithReleaseVersion(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "Dockerfile"))
	if err != nil {
		t.Fatalf("os.ReadFile(Dockerfile) error = %v", err)
	}
	source := string(raw)
	for _, required := range []string{
		`-ldflags "-X main.Version=${GIT_SHA}" \
      -o ./bin/bootstrap-manual-acceptance-core ./cmd/bootstrap-manual-acceptance-core`,
		`COPY --from=builder /src/bin/bootstrap-manual-acceptance-core /app/bootstrap-manual-acceptance-core`,
	} {
		if !strings.Contains(source, required) {
			t.Fatalf("Dockerfile is missing one-shot binary contract %q", required)
		}
	}
}

func TestCoreCodeNamespacePatternUsesDefaultBusinessCodes(t *testing.T) {
	dataset := data.DefaultCoreDemoReferenceSeedDataset()
	if err := validateReferenceDataset(dataset); err != nil {
		t.Fatalf("validateReferenceDataset() error = %v", err)
	}
	unitPattern, err := coreCodeNamespacePattern(dataset.Units[0].Code)
	if err != nil {
		t.Fatalf("coreCodeNamespacePattern(unit) error = %v", err)
	}
	warehousePattern, err := coreCodeNamespacePattern(dataset.Warehouses[0].Code)
	if err != nil {
		t.Fatalf("coreCodeNamespacePattern(warehouse) error = %v", err)
	}
	if unitPattern != "YS5-DW-%" || warehousePattern != "YS5-CK-%" {
		t.Fatalf("unexpected reference namespaces unit=%q warehouse=%q", unitPattern, warehousePattern)
	}
	if strings.Contains(unitPattern+warehousePattern, data.CoreDemoSeedPrefix) {
		t.Fatalf("references-only boundary leaked the full demo seed prefix")
	}
	if _, err := coreCodeNamespacePattern("invalid"); !errors.Is(err, errCoreBoundaryViolation) {
		t.Fatalf("expected invalid namespace error, got %v", err)
	}
	invalid := dataset
	invalid.Warehouses = invalid.Warehouses[:3]
	if err := validateReferenceDataset(invalid); !errors.Is(err, errCoreBoundaryViolation) {
		t.Fatalf("expected invalid default dataset shape, got %v", err)
	}
}

func expectDatabasePreflight(
	t *testing.T,
	mock sqlmock.Sqlmock,
	opts options,
	migration string,
	snapshot []byte,
	activeCount int64,
) {
	t.Helper()
	mock.ExpectQuery(`SELECT current_database\(\)`).
		WillReturnRows(sqlmock.NewRows([]string{"current_database"}).AddRow(expectedDatabase))
	mock.ExpectQuery(`SELECT CASE WHEN`).
		WillReturnRows(sqlmock.NewRows([]string{"schema_status"}).AddRow("ready"))
	mock.ExpectQuery(`SELECT version[\s\S]+FROM atlas_schema_revisions\.atlas_schema_revisions`).
		WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(migration))
	if migration != opts.expectedMigrationVersion {
		return
	}
	mock.ExpectQuery(`SELECT revision, product_version, compiled_snapshot, COUNT\(\*\) OVER \(\)`).
		WithArgs(customertrialconfig.ExpectedCustomerKey).
		WillReturnRows(sqlmock.NewRows([]string{"revision", "product_version", "compiled_snapshot", "active_count"}).AddRow(
			customertrialconfig.Revision,
			customertrialconfig.ProductVersion,
			snapshot,
			activeCount,
		))
}

func boundaryValues(dataset data.CoreDemoReferenceSeedDataset) []driver.Value {
	unitPattern, _ := coreCodeNamespacePattern(dataset.Units[0].Code)
	warehousePattern, _ := coreCodeNamespacePattern(dataset.Warehouses[0].Code)
	values := []driver.Value{
		unitPattern,
		warehousePattern,
		dataset.Units[0].Code,
		dataset.Units[0].Name,
		dataset.Units[0].Precision,
	}
	for _, warehouse := range dataset.Warehouses {
		values = append(values, warehouse.Code, warehouse.Name, warehouse.Type)
	}
	return values
}

func expectBoundary(mock sqlmock.Sqlmock, dataset data.CoreDemoReferenceSeedDataset, boundary coreBoundary) {
	mock.ExpectQuery(`manual-acceptance-core-boundary`).
		WithArgs(boundaryValues(dataset)...).
		WillReturnRows(sqlmock.NewRows([]string{
			"unit_total",
			"unit_exact",
			"warehouse_total",
			"warehouse_exact",
			"material_count",
			"product_count",
			"process_count",
			"bom_header_count",
		}).AddRow(
			boundary.unitTotal,
			boundary.unitExact,
			boundary.warehouseTotal,
			boundary.warehouseExact,
			boundary.materialCount,
			boundary.productCount,
			boundary.processCount,
			boundary.bomHeaderCount,
		))
}

func expectReferenceUpserts(mock sqlmock.Sqlmock, dataset data.CoreDemoReferenceSeedDataset) {
	mock.ExpectQuery(`INSERT INTO units`).
		WithArgs(dataset.Units[0].Code, dataset.Units[0].Name, dataset.Units[0].Precision).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11))
	for index, warehouse := range dataset.Warehouses {
		mock.ExpectQuery(`INSERT INTO warehouses`).
			WithArgs(warehouse.Code, warehouse.Name, warehouse.Type).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(21 + index))
	}
}

func TestBootstrapManualAcceptanceCoreRejectsMigrationBeforeWrite(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	opts := validOptions()
	expectDatabasePreflight(t, mock, opts, "20260715000000", exactTrialSnapshot(t), 1)
	mock.ExpectClose()

	if _, err := bootstrapManualAcceptanceCore(context.Background(), db, opts); err == nil || !strings.Contains(err.Error(), "atlas migration") {
		t.Fatalf("expected migration mismatch before write, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestBootstrapManualAcceptanceCoreRejectsActiveConfigBeforeWrite(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	opts := validOptions()
	snapshot := exactTrialSnapshot(t)
	var decoded map[string]any
	if err := json.Unmarshal(snapshot, &decoded); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	decoded["datasetVersion"] = "2026.07.15-v3"
	snapshot, err = json.Marshal(decoded)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	expectDatabasePreflight(t, mock, opts, opts.expectedMigrationVersion, snapshot, 1)
	mock.ExpectClose()

	if _, err := bootstrapManualAcceptanceCore(context.Background(), db, opts); err == nil || !strings.Contains(err.Error(), "configuration is invalid") {
		t.Fatalf("expected active config mismatch before write, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestBootstrapManualAcceptanceCoreRejectsPollutedNamespaceBeforeWrite(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	opts := validOptions()
	dataset := data.DefaultCoreDemoReferenceSeedDataset()
	expectDatabasePreflight(t, mock, opts, opts.expectedMigrationVersion, exactTrialSnapshot(t), 1)
	mock.ExpectBegin()
	expectBoundary(mock, dataset, coreBoundary{materialCount: 1})
	mock.ExpectRollback()
	mock.ExpectClose()

	if _, err := bootstrapManualAcceptanceCore(context.Background(), db, opts); !errors.Is(err, errCoreBoundaryViolation) {
		t.Fatalf("expected polluted namespace rejection before write, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestBootstrapManualAcceptanceCoreRollsBackFailedExactReadback(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	opts := validOptions()
	dataset := data.DefaultCoreDemoReferenceSeedDataset()
	expectDatabasePreflight(t, mock, opts, opts.expectedMigrationVersion, exactTrialSnapshot(t), 1)
	mock.ExpectBegin()
	expectBoundary(mock, dataset, coreBoundary{})
	expectReferenceUpserts(mock, dataset)
	expectBoundary(mock, dataset, coreBoundary{unitTotal: 1, unitExact: 1, warehouseTotal: 3, warehouseExact: 3})
	mock.ExpectRollback()
	mock.ExpectClose()

	if _, err := bootstrapManualAcceptanceCore(context.Background(), db, opts); !errors.Is(err, errCoreBoundaryViolation) {
		t.Fatalf("expected failed exact readback rollback, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestBootstrapManualAcceptanceCoreIsIdempotentWithExactReadback(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	opts := validOptions()
	dataset := data.DefaultCoreDemoReferenceSeedDataset()
	exact := coreBoundary{unitTotal: 1, unitExact: 1, warehouseTotal: 4, warehouseExact: 4}
	for run := 0; run < 2; run++ {
		expectDatabasePreflight(t, mock, opts, opts.expectedMigrationVersion, exactTrialSnapshot(t), 1)
		mock.ExpectBegin()
		if run == 0 {
			expectBoundary(mock, dataset, coreBoundary{})
		} else {
			expectBoundary(mock, dataset, exact)
		}
		expectReferenceUpserts(mock, dataset)
		expectBoundary(mock, dataset, exact)
		mock.ExpectCommit()
	}
	mock.ExpectClose()

	for run := 0; run < 2; run++ {
		result, err := bootstrapManualAcceptanceCore(context.Background(), db, opts)
		if err != nil {
			t.Fatalf("bootstrapManualAcceptanceCore() run %d error = %v", run+1, err)
		}
		if len(result.unitIDs) != 1 || len(result.warehouseIDs) != 4 {
			t.Fatalf("unexpected run %d result: %#v", run+1, result)
		}
		if result.unitIDs[dataset.Units[0].Code] != 11 {
			t.Fatalf("run %d did not return the exact unit id: %#v", run+1, result.unitIDs)
		}
		for index, warehouse := range dataset.Warehouses {
			if result.warehouseIDs[warehouse.Code] != 21+index {
				t.Fatalf("run %d did not return exact warehouse ids: %#v", run+1, result.warehouseIDs)
			}
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}
