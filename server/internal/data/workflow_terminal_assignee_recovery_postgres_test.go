package data

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func terminalRecoveryFixture(t *testing.T, db *sql.DB, target bool) *sql.Tx {
	t.Helper()
	ctx := t.Context()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })
	for _, table := range []string{"workflow_tasks", "workflow_task_events"} {
		if _, err = tx.ExecContext(ctx, "CREATE TEMP TABLE "+table+" (LIKE public."+table+" INCLUDING ALL) ON COMMIT DROP"); err != nil {
			t.Fatal(err)
		}
	}
	_, err = tx.ExecContext(ctx, `CREATE TEMP TABLE admin_users(id bigint,username text) ON COMMIT DROP;
INSERT INTO admin_users VALUES(17,'original_assignee');
INSERT INTO workflow_tasks(id,task_code,task_group,task_name,source_type,source_id,task_status_key,owner_role_key,version,assignee_id,payload,created_at,updated_at)
VALUES(1,'recovery-one','handoff_purchase_arrival','arrival','purchase_order',10,'done','quality',2,17,'{"source_task_intent_hash":"original-one"}','2026-10-01','2026-10-02'),
(2,'recovery-two','handoff_production_completion','completion','production_wip_batch',20,'done','production',2,NULL,'{"source_task_intent_hash":"original-two"}','2026-10-01','2026-10-02');
INSERT INTO workflow_task_events(id,task_id,task_version,event_type,from_status_key,to_status_key,actor_id,payload,created_at)
VALUES(1,1,2,'status_changed','ready','done',99,'{"source_action":"purchase_receipt"}','2026-10-02'),
(2,2,2,'status_changed','ready','done',99,'{"source_action":"production_completion"}','2026-10-02');
ALTER TABLE workflow_task_events ALTER COLUMN id RESTART WITH 10;`)
	if err != nil {
		t.Fatal(err)
	}
	if target {
		_, err = tx.ExecContext(ctx, `UPDATE workflow_tasks SET assignee_id=NULL,version=3,owner_role_key='warehouse';
INSERT INTO workflow_task_events(id,task_id,task_version,event_type,from_status_key,to_status_key,payload,created_at)
VALUES(3,1,3,'source_updated','done','done','{"source":"production_task_responsibility_migration"}','2026-10-11T01:10:54Z'),
(4,2,3,'source_updated','done','done','{"source":"production_task_responsibility_migration"}','2026-10-11T01:10:54Z');`)
		if err != nil {
			t.Fatal(err)
		}
	}
	return tx
}

func TestProductionOrderPostgresTerminalAssigneeBackupRecovery(t *testing.T) {
	db, _ := openPurchaseReceiptPostgresTestData(t)
	proof := TerminalAssigneeBackup{ID: "br-test-20261011", SHA256: strings.Repeat("a", 64), MigrationVersion: "20261006155051", VerifiedAt: time.Date(2026, 10, 11, 1, 10, 47, 0, time.UTC)}
	for _, tc := range []struct{ name, change string }{
		{"valid", ""},
		{"missing task", "DELETE FROM workflow_tasks WHERE id=2"},
		{"different source", "UPDATE workflow_tasks SET source_id=777 WHERE id=2"},
		{"stale backup", "UPDATE workflow_tasks SET version=1 WHERE id=2"},
		{"different history", "UPDATE workflow_task_events SET actor_id=123 WHERE task_id=2"},
		{"changed assignee identity", "UPDATE admin_users SET username='different_user'"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			target := terminalRecoveryFixture(t, db.sqldb, true)
			historical := terminalRecoveryFixture(t, db.sqldb, false)
			if tc.change != "" {
				if _, err := historical.ExecContext(t.Context(), tc.change); err != nil {
					t.Fatal(err)
				}
			}
			result, err := restoreTerminalTaskAssignees(t.Context(), target, historical, proof)
			if tc.change != "" {
				if err == nil {
					t.Fatal("unproven recovery accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if result.Restored != 1 || result.ConfirmedUnassigned != 1 {
				t.Fatalf("%+v", result)
			}
			var assigned int64
			var unassigned bool
			var events int
			if err = target.QueryRowContext(t.Context(), `SELECT assignee_id FROM workflow_tasks WHERE id=1`).Scan(&assigned); err != nil || assigned != 17 {
				t.Fatalf("actor replaced original assignee: %d %v", assigned, err)
			}
			if err = target.QueryRowContext(t.Context(), `SELECT assignee_id IS NULL FROM workflow_tasks WHERE id=2`).Scan(&unassigned); err != nil || !unassigned {
				t.Fatalf("originally unassigned task changed: %v", err)
			}
			if err = target.QueryRowContext(t.Context(), `SELECT count(*) FROM workflow_task_events WHERE payload->>'backup_sha256'=$1`, proof.SHA256).Scan(&events); err != nil || events != 2 {
				t.Fatalf("backup audit events=%d err=%v", events, err)
			}
			replay, err := restoreTerminalTaskAssignees(t.Context(), target, historical, proof)
			if err != nil || replay.Restored != 0 || replay.ConfirmedUnassigned != 0 {
				t.Fatalf("replay changed rows: %+v %v", replay, err)
			}
			migration, err := os.ReadFile(filepath.Join("model", "migrate", "20261015082400_restore_terminal_task_assignees.sql"))
			if err != nil {
				t.Fatal(err)
			}
			if _, err = target.ExecContext(t.Context(), string(migration)); err != nil {
				t.Fatal(err)
			}
		})
	}
}
