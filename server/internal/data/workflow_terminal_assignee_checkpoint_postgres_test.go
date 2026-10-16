package data

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func terminalCheckpointFixture(t *testing.T, db *sql.DB) *sql.Tx {
	t.Helper()
	tx := terminalRecoveryFixture(t, db, false)
	_, err := tx.ExecContext(t.Context(), `ALTER TABLE admin_users ADD COLUMN is_super_admin boolean DEFAULT false;
ALTER TABLE admin_users ADD COLUMN disabled boolean DEFAULT false;
ALTER TABLE admin_users ADD COLUMN revoked_at timestamptz;
INSERT INTO admin_users(id,username,is_super_admin) VALUES(99,'maintenance_admin',true);
UPDATE workflow_tasks SET payload=payload || '{"source_task_producer":"fulfillment.source","source_task_contract":"workflow.source-task/v1"}'::jsonb;`)
	if err != nil {
		t.Fatal(err)
	}
	return tx
}

func TestProductionOrderPostgresTerminalAssigneeCheckpoint(t *testing.T) {
	db, _ := openPurchaseReceiptPostgresTestData(t)
	proof := TerminalAssigneeBackup{ID: "pre-migration-test", SHA256: strings.Repeat("b", 64), MigrationVersion: "20261006155051", VerifiedAt: time.Now()}
	for _, tc := range []struct {
		name, change string
		actor        int
	}{
		{"verified current assignment and NULL", "", 99},
		{"backup row differs", "UPDATE workflow_tasks SET assignee_id=NULL WHERE id=1", 99},
		{"history differs", "UPDATE workflow_task_events SET actor_id=123 WHERE task_id=1", 99},
		{"assignee account differs", "UPDATE admin_users SET username='renamed' WHERE id=17", 99},
		{"operator lacks authority", "", 17},
		{"disabled operator", "UPDATE admin_users SET disabled=true WHERE id=99", 99},
		{"already migrated", "INSERT INTO workflow_task_events(task_id,task_version,event_type,payload,created_at) VALUES(1,3,'source_updated','{\"source\":\"production_task_responsibility_migration\"}',CURRENT_TIMESTAMP)", 99},
	} {
		t.Run(tc.name, func(t *testing.T) {
			target := terminalCheckpointFixture(t, db.sqldb)
			history := terminalCheckpointFixture(t, db.sqldb)
			if tc.change != "" {
				if _, err := target.ExecContext(t.Context(), tc.change); err != nil {
					t.Fatal(err)
				}
			}
			before, err := terminalCheckpointRow(t.Context(), target, 1)
			if err != nil {
				t.Fatal(err)
			}
			result, err := checkpointTerminalTaskAssignees(t.Context(), target, history, proof, tc.actor)
			if tc.change != "" || tc.actor != 99 {
				if err == nil {
					t.Fatal("unproven checkpoint accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if result.Captured != 2 || result.AlreadyCaptured != 0 {
				t.Fatalf("%+v", result)
			}
			var assignee, version, receiptCount int
			if err = target.QueryRowContext(t.Context(), `SELECT assignee_id,version FROM workflow_tasks WHERE id=1`).Scan(&assignee, &version); err != nil || assignee != 17 || version != 3 {
				t.Fatalf("assignment=%d version=%d err=%v", assignee, version, err)
			}
			if err = target.QueryRowContext(t.Context(), `SELECT count(*) FROM workflow_task_events WHERE command_key=$1 AND mutation_result->>'contract'='workflow.task-mutation-result/v1' AND actor_id=99`, terminalAssigneeCheckpointCommand).Scan(&receiptCount); err != nil || receiptCount != 2 {
				t.Fatalf("receipts=%d err=%v", receiptCount, err)
			}
			replay, err := checkpointTerminalTaskAssignees(t.Context(), target, history, proof, tc.actor)
			if err != nil || replay.Captured != 0 || replay.AlreadyCaptured != 2 {
				t.Fatalf("replay=%+v err=%v", replay, err)
			}
			unchanged, err := terminalCheckpointRow(t.Context(), history, 1)
			if err != nil || unchanged != before {
				t.Fatalf("backup changed: %v", err)
			}
			// Exercise the destructive responsibility statement followed by both
			// unchanged formal restoration migrations, inside this rolled-back fixture.
			migration, err := os.ReadFile(filepath.Join("model", "migrate", "20261010185222_migrate.sql"))
			if err != nil {
				t.Fatal(err)
			}
			statement := string(migration[strings.Index(string(migration), "WITH changed AS ("):])
			if _, err = target.ExecContext(t.Context(), statement); err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"20261015082400_restore_terminal_task_assignees.sql", "20261016150000_confirm_terminal_task_unassigned.sql"} {
				migration, err = os.ReadFile(filepath.Join("model", "migrate", name))
				if err != nil {
					t.Fatal(err)
				}
				if _, err = target.ExecContext(t.Context(), string(migration)); err != nil {
					t.Fatal(err)
				}
			}
			var unassigned bool
			if err = target.QueryRowContext(t.Context(), `SELECT assignee_id FROM workflow_tasks WHERE id=1`).Scan(&assignee); err != nil || assignee != 17 {
				t.Fatalf("original assignee lost: %d %v", assignee, err)
			}
			if err = target.QueryRowContext(t.Context(), `SELECT assignee_id IS NULL FROM workflow_tasks WHERE id=2`).Scan(&unassigned); err != nil || !unassigned {
				t.Fatalf("original NULL assignment lost: %v", err)
			}
		})
	}
}

func TestTerminalAssigneeCheckpointRequiresVerifiedBackup(t *testing.T) {
	if _, err := CheckpointTerminalTaskAssignees(t.Context(), nil, nil, TerminalAssigneeBackup{}, 0, true); err == nil {
		t.Fatal("unproven maintenance write accepted")
	}
}
