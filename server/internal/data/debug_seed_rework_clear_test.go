package data

import (
	"context"
	"database/sql"
	"io"
	"strings"
	"testing"

	"server/internal/biz"
	entmigrate "server/internal/data/model/ent/migrate"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestDebugBusinessDataClearReworkConstraintAndRollback(t *testing.T) {
	for _, failDelete := range []bool{false, true} {
		name := "clear"
		if failDelete {
			name = "rollback_after_delete_failure"
		}
		t.Run(name, func(t *testing.T) {
			db, err := sql.Open("sqlite3", ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := db.Close(); err != nil {
					t.Errorf("close cleanup test database: %v", err)
				}
			})
			db.SetMaxOpenConns(1)
			check := entmigrate.ProductionWipBatchesTable.Annotation.Checks["production_wip_batches_rework_bundle"]
			if check == "" {
				t.Fatal("generated rework bundle constraint is missing")
			}
			statements := []string{
				"PRAGMA foreign_keys = ON",
				"CREATE TABLE units (id INTEGER PRIMARY KEY)",
				"INSERT INTO units VALUES (1)",
				"CREATE TABLE production_wip_batches (id INTEGER PRIMARY KEY, flow_type TEXT NOT NULL, rework_reason TEXT, source_batch_id INTEGER, origin_rework_fact_id INTEGER, CHECK (" + check + "))",
				"INSERT INTO production_wip_batches VALUES (1, 'REWORK', '模拟返工', NULL, 42), (2, 'REWORK', '模拟返工拆分', 1, 42)",
			}
			if failDelete {
				statements = append(statements,
					"CREATE TABLE preserved_reference (unit_id INTEGER REFERENCES units(id))",
					"INSERT INTO preserved_reference VALUES (1)",
				)
			}
			for _, statement := range statements {
				if _, err := db.Exec(statement); err != nil {
					t.Fatal(err)
				}
			}
			uc := biz.NewDebugUsecase(
				NewDebugSeedRepo(&Data{sqldb: db, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard)),
				biz.DebugSafetyConfig{Environment: "local", BusinessDataClearEnabled: true},
			)
			preview, err := uc.ClearBusinessData(context.Background(), biz.DebugBusinessDataClearInput{DryRun: true})
			if err != nil || preview.MatchedTotal != 3 || preview.DeletedTotal != 0 {
				t.Fatalf("unexpected preview: %#v, %v", preview, err)
			}
			result, err := uc.ClearBusinessData(context.Background(), biz.DebugBusinessDataClearInput{
				Confirmation: biz.DebugBusinessDataClearConfirmation,
			})
			if failDelete {
				if err == nil || !strings.Contains(err.Error(), "FOREIGN KEY") {
					t.Fatalf("preserved foreign key must reject cleanup after detachment: %v", err)
				}
				var unchanged int
				if err := db.QueryRow("SELECT count(*) FROM production_wip_batches WHERE flow_type = 'REWORK' AND rework_reason IS NOT NULL AND origin_rework_fact_id = 42").Scan(&unchanged); err != nil || unchanged != 2 {
					t.Fatalf("failed cleanup did not restore rework evidence: count=%d err=%v", unchanged, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if result.DeletedTotal != preview.MatchedTotal {
				t.Fatalf("cleanup count mismatch: preview=%d deleted=%d", preview.MatchedTotal, result.DeletedTotal)
			}
			var remaining int
			if err := db.QueryRow("SELECT count(*) FROM production_wip_batches").Scan(&remaining); err != nil || remaining != 0 {
				t.Fatalf("rework batches remain: count=%d err=%v", remaining, err)
			}
		})
	}
}
