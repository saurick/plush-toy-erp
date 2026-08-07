package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	sqlschema "entgo.io/ent/dialect/sql/schema"
	"entgo.io/ent/schema/field"

	entmigrate "server/internal/data/model/ent/migrate"
)

func TestRepositoryCatalogAndGeneratedOutputsAreCurrent(t *testing.T) {
	t.Parallel()

	repoRoot, err := findRepoRoot(".")
	if err != nil {
		t.Fatal(err)
	}
	catalogValue, err := loadCatalog(filepath.Join(repoRoot, "server", "docs", "database", "table-catalog.json"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := extractDatabaseSchema(entmigrate.Tables)
	if err != nil {
		t.Fatal(err)
	}

	wantMetrics := schemaMetrics{
		Tables:         74,
		Columns:        1144,
		ForeignKeys:    152,
		Indexes:        338,
		PartialIndexes: 30,
		Checks:         250,
	}
	if got := db.metrics(); got != wantMetrics {
		t.Fatalf("schema metrics changed without an intentional data-dictionary review: got %+v want %+v", got, wantMetrics)
	}
	if got, want := len(catalogValue.Tables), wantMetrics.Tables; got != want {
		t.Fatalf("catalog table count = %d, want %d", got, want)
	}

	outputDir := filepath.Join(repoRoot, "server", "docs", "database")
	outputs, err := buildOutputs(db, catalogValue, repoRoot, outputDir)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(outputs), 8; got != want {
		t.Fatalf("generated output count = %d, want %d", got, want)
	}
	report, err := inspectOutputs(outputDir, outputs)
	if err != nil {
		t.Fatal(err)
	}
	if !report.clean() {
		t.Fatalf("generated outputs are not current: %s", formatOutputReport(report))
	}
}

func TestPostgresColumnType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		column  *sqlschema.Column
		want    string
		wantErr string
	}{
		{name: "schema override", column: &sqlschema.Column{Type: field.TypeString, SchemaType: map[string]string{dialect.Postgres: "citext"}}, want: "citext"},
		{name: "bool", column: &sqlschema.Column{Type: field.TypeBool}, want: "boolean"},
		{name: "int32", column: &sqlschema.Column{Type: field.TypeInt32}, want: "integer"},
		{name: "int64", column: &sqlschema.Column{Type: field.TypeInt64}, want: "bigint"},
		{name: "json", column: &sqlschema.Column{Type: field.TypeJSON}, want: "jsonb"},
		{name: "time", column: &sqlschema.Column{Type: field.TypeTime}, want: "timestamp with time zone"},
		{name: "bounded string", column: &sqlschema.Column{Type: field.TypeString, Size: 64}, want: "varchar(64)"},
		{name: "large string", column: &sqlschema.Column{Type: field.TypeString, Size: postgresMaxVarchar + 1}, want: "text"},
		{name: "other requires override", column: &sqlschema.Column{Type: field.TypeOther}, wantErr: "requires SchemaType"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := postgresColumnType(test.column)
			if test.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErr) {
					t.Fatalf("error = %v, want substring %q", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("postgres type = %q, want %q", got, test.want)
			}
		})
	}
}

func TestPostgresColumnDefault(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		column  *sqlschema.Column
		want    string
		wantSet bool
		wantErr string
	}{
		{name: "none", column: &sqlschema.Column{}, wantSet: false},
		{name: "expression", column: &sqlschema.Column{Default: sqlschema.Expr("CURRENT_TIMESTAMP")}, want: "CURRENT_TIMESTAMP", wantSet: true},
		{
			name: "dialect expression",
			column: &sqlschema.Column{
				Default: map[string]sqlschema.Expr{dialect.Postgres: "gen_random_uuid()"},
			},
			want:    "gen_random_uuid()",
			wantSet: true,
		},
		{name: "quoted string", column: &sqlschema.Column{Type: field.TypeString, Default: "it's"}, want: "'it''s'", wantSet: true},
		{name: "numeric string", column: &sqlschema.Column{Type: field.TypeFloat64, Default: "12.50"}, want: "12.50", wantSet: true},
		{name: "bool", column: &sqlschema.Column{Default: true}, want: "true", wantSet: true},
		{
			name:    "missing postgres expression",
			column:  &sqlschema.Column{Default: map[string]sqlschema.Expr{dialect.MySQL: "UUID()"}},
			wantErr: "does not define postgres",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, set, err := postgresColumnDefault(test.column)
			if test.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErr) {
					t.Fatalf("error = %v, want substring %q", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want || set != test.wantSet {
				t.Fatalf("default = (%q, %t), want (%q, %t)", got, set, test.want, test.wantSet)
			}
		})
	}
}

func TestLoadCatalogRejectsUnknownAndTrailingJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		content string
		wantErr string
	}{
		{
			name:    "unknown field",
			content: `{"version":1,"description":"x","exclusions":[],"domains":[],"commonFields":[],"tables":[],"unknown":true}`,
			wantErr: "unknown field",
		},
		{
			name:    "trailing value",
			content: `{"version":1,"description":"x","exclusions":[],"domains":[],"commonFields":[],"tables":[]} {}`,
			wantErr: "trailing JSON value",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "catalog.json")
			if err := os.WriteFile(path, []byte(test.content), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := loadCatalog(path)
			if err == nil || !strings.Contains(err.Error(), test.wantErr) {
				t.Fatalf("error = %v, want substring %q", err, test.wantErr)
			}
		})
	}
}

func TestValidateCatalogRejectsMissingGeneratedTable(t *testing.T) {
	t.Parallel()

	repoRoot, err := findRepoRoot(".")
	if err != nil {
		t.Fatal(err)
	}
	catalogValue, err := loadCatalog(filepath.Join(repoRoot, "server", "docs", "database", "table-catalog.json"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := extractDatabaseSchema(entmigrate.Tables)
	if err != nil {
		t.Fatal(err)
	}
	catalogValue.Tables = catalogValue.Tables[:len(catalogValue.Tables)-1]

	_, err = validateCatalog(db, catalogValue, repoRoot)
	if err == nil || !strings.Contains(err.Error(), "catalog is missing generated tables") {
		t.Fatalf("error = %v, want missing-table validation", err)
	}
}

func TestInspectOutputsDistinguishesDriftAndUnexpectedMarkdown(t *testing.T) {
	t.Parallel()

	outputDir := t.TempDir()
	expected := map[string][]byte{
		"README.md": []byte(generatedHeader + "\n\n# Current\n"),
	}
	if err := writeOutputs(outputDir, expected); err != nil {
		t.Fatal(err)
	}
	report, err := inspectOutputs(outputDir, expected)
	if err != nil {
		t.Fatal(err)
	}
	if !report.clean() {
		t.Fatalf("fresh outputs reported drift: %s", formatOutputReport(report))
	}

	if err := os.WriteFile(filepath.Join(outputDir, "README.md"), []byte("changed\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "旧生成文档.md"), []byte(generatedHeader+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "人工文档.md"), []byte("# Manual\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	report, err = inspectOutputs(outputDir, expected)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := strings.Join(report.Changed, ","), "README.md"; got != want {
		t.Fatalf("changed = %q, want %q", got, want)
	}
	if got, want := strings.Join(report.Stale, ","), "旧生成文档.md"; got != want {
		t.Fatalf("stale = %q, want %q", got, want)
	}
	if got, want := strings.Join(report.Unexpected, ","), "人工文档.md"; got != want {
		t.Fatalf("unexpected = %q, want %q", got, want)
	}
}

func TestRunRequiresExactlyOneMode(t *testing.T) {
	t.Parallel()

	for _, args := range [][]string{nil, {"--check", "--write"}} {
		var output bytes.Buffer
		err := run(args, &output)
		if err == nil || !strings.Contains(err.Error(), "exactly one") {
			t.Fatalf("run(%v) error = %v, want mode validation", args, err)
		}
	}
}

func TestTableSchemaSourcesHandlesGeneratedPluralNames(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"processes":              "process.go",
		"production_wip_batches": "production_wip_batch.go",
		"quality_inspections":    "quality_inspection.go",
		"role_data_scopes":       "role_data_scope.go",
	}
	for tableName, wantBase := range tests {
		got := tableSchemaSources(catalogTable{Name: tableName})
		if len(got) != 1 || filepath.Base(got[0]) != wantBase {
			t.Fatalf("tableSchemaSources(%q) = %v, want %q", tableName, got, wantBase)
		}
	}
}
