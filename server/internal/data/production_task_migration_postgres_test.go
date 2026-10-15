package data

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProductionOrderPostgresTaskResponsibilityMigration(t *testing.T) {
	ctx := context.Background()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	tx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	// Use the actual column/default/check contracts with transaction-local tables.
	// Existing integration fixtures and immutable event rows are never rewritten.
	for _, table := range []string{"permissions", "roles", "role_permissions", "workflow_tasks", "workflow_task_events"} {
		if _, err = tx.ExecContext(ctx, "CREATE TEMP TABLE "+table+" (LIKE public."+table+" INCLUDING ALL) ON COMMIT DROP"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = tx.ExecContext(ctx, `
ALTER TABLE pg_temp.permissions ALTER COLUMN id RESTART WITH 100;
INSERT INTO roles (id, role_key, name, role_type, builtin, version, created_at, updated_at)
VALUES (1,'sales','业务','business_default',true,7,now(),now()),(2,'warehouse','仓库','business_default',true,7,now(),now()),(3,'quality','IQC','business_default',true,7,now(),now()),(4,'production','生产','business_default',true,7,now(),now()),(5,'custom_sales','自定义','custom',false,7,now(),now());
INSERT INTO permissions (id,permission_key,name,module,action,resource,builtin,created_at,updated_at)
VALUES (1,'production.completion.create','收仓','production','create','completion',true,now(),now()),(2,'purchase.receipt.create','点数','purchase','create','receipt',true,now(),now()),(3,'shipment.ship','发货','shipment','ship','shipment',true,now(),now()),(4,'production.wip.rework','旧返工','production','rework','wip',true,now(),now()),(5,'production.exception.submit','方案','production','submit','exception',true,now(),now());
INSERT INTO role_permissions (role_id,permission_id,created_at) VALUES (2,3,now()),(3,2,now()),(4,1,now()),(4,4,now()),(5,3,now()),(5,4,now());
INSERT INTO workflow_tasks (id,task_code,task_group,task_name,source_type,source_id,task_status_key,owner_role_key,owner_pool_key,required_capability_key,version,payload,created_at,updated_at)
VALUES (1,'source-handoff-purchase-arrival-1','handoff_purchase_arrival','旧到货','purchase_order',1,'ready','quality','quality','purchase.receipt.create',2,'{"source_task_producer":"fulfillment.source","source_task_contract":"workflow.source-task/v1","source_task_intent_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',now(),now()),
(2,'source-handoff-production-completion-2','handoff_production_completion','旧入库','production_wip_batch',2,'done','production','production','production.completion.create',3,'{"source_task_producer":"fulfillment.source","source_task_contract":"workflow.source-task/v1"}',now(),now()),
(3,'source-handoff-production-exception-3','handoff_production_exception','旧异常','production_wip_batch',3,'blocked','production','production','production.wip.rework',4,'{"source_task_producer":"fulfillment.source","source_task_contract":"workflow.source-task/v1"}',now(),now());
`); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.ExecContext(ctx, `UPDATE workflow_tasks SET assignee_id=17 WHERE id=2;
INSERT INTO workflow_task_events (task_id,task_version,event_type,from_status_key,to_status_key,actor_id,idempotency_key,intent_hash,command_key,mutation_result,payload,created_at)
VALUES (2,3,'completed','ready','done',99,'prior-terminal-receipt',repeat('a',64),'complete','{"contract":"workflow.task-mutation-result/v1","task":{"id":2,"task_status_key":"done","assignee_id":17}}','{}',now());`); err != nil {
		t.Fatal(err)
	}
	sql, err := os.ReadFile(filepath.Join("model", "migrate", "20261010185222_migrate.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.ExecContext(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		role       int
		permission string
		want       int
	}{
		{1, "shipment.ship", 1}, {1, "production.exception.submit", 1}, {2, "shipment.ship", 0}, {2, "production.completion.create", 1}, {2, "purchase.receipt.create", 1}, {2, "warehouse.packaging.execute", 1}, {3, "purchase.receipt.create", 0}, {4, "production.completion.create", 0}, {4, "production.exception.execute", 1}, {5, "shipment.ship", 1}, {5, "production.wip.rework", 0},
	} {
		var count int
		if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.permission_key=$2`, tc.role, tc.permission).Scan(&count); err != nil || count != tc.want {
			t.Fatalf("role=%d permission=%s got=%d want=%d err=%v", tc.role, tc.permission, count, tc.want, err)
		}
	}
	var changed int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM workflow_tasks WHERE (id IN (1,2) AND owner_role_key='warehouse') OR (id=3 AND owner_role_key='sales' AND required_capability_key='production.exception.submit')`).Scan(&changed); err != nil || changed != 3 {
		t.Fatalf("responsibilities=%d err=%v", changed, err)
	}
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM workflow_task_events WHERE event_type='source_updated'`).Scan(&changed); err != nil || changed != 3 {
		t.Fatalf("audit events=%d err=%v", changed, err)
	}
	var version int
	if err = tx.QueryRowContext(ctx, `SELECT version FROM roles WHERE id=5`).Scan(&version); err != nil || version != 8 {
		t.Fatalf("retired permission must invalidate custom role sessions: %d %v", version, err)
	}
	correction, err := os.ReadFile(filepath.Join("model", "migrate", "20261015082400_restore_terminal_task_assignees.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.ExecContext(ctx, string(correction)); err != nil {
		t.Fatal(err)
	}
	var assignee int
	if err = tx.QueryRowContext(ctx, "SELECT assignee_id FROM workflow_tasks WHERE id=2").Scan(&assignee); err != nil || assignee != 17 {
		t.Fatalf("restored assignee=%d err=%v", assignee, err)
	}
	if _, err = tx.ExecContext(ctx, string(correction)); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM workflow_task_events WHERE payload->>'source'='terminal_task_assignee_restoration'").Scan(&changed); err != nil || changed != 1 {
		t.Fatalf("restoration events=%d err=%v", changed, err)
	}

}

func TestProductionOrderPostgresTerminalAssigneeRequiresOriginalProof(t *testing.T) {
	data, _ := openPurchaseReceiptPostgresTestData(t)
	migration, err := os.ReadFile(filepath.Join("model", "migrate", "20261015082400_restore_terminal_task_assignees.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, receipt string
		blocked       bool
	}{
		{"missing receipt", "", true},
		{"different task", `{"contract":"workflow.task-mutation-result/v1","task":{"id":8,"task_status_key":"done","assignee_id":17}}`, true},
		{"malformed assignee", `{"contract":"workflow.task-mutation-result/v1","task":{"id":2,"task_status_key":"done","assignee_id":"unknown"}}`, true},
		{"proven originally unassigned", `{"contract":"workflow.task-mutation-result/v1","task":{"id":2,"task_status_key":"done"}}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := t.Context()
			tx, err := data.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback() }()
			for _, table := range []string{"workflow_tasks", "workflow_task_events"} {
				if _, err = tx.ExecContext(ctx, "CREATE TEMP TABLE "+table+" (LIKE public."+table+" INCLUDING ALL) ON COMMIT DROP"); err != nil {
					t.Fatal(err)
				}
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO workflow_tasks (id,task_code,task_group,task_name,source_type,source_id,task_status_key,owner_role_key,version,payload,created_at,updated_at)
VALUES(2,'review-proof','handoff_production_completion','历史终态','production_wip_batch',2,'done','warehouse',4,'{}',now(),now());
INSERT INTO workflow_task_events(task_id,task_version,event_type,from_status_key,to_status_key,payload,created_at)
VALUES(2,4,'source_updated','done','done','{"source":"production_task_responsibility_migration"}',now());`)
			if err != nil {
				t.Fatal(err)
			}
			if tc.receipt != "" {
				_, err = tx.ExecContext(ctx, `INSERT INTO workflow_task_events(task_id,task_version,event_type,from_status_key,to_status_key,actor_id,idempotency_key,intent_hash,command_key,mutation_result,payload,created_at)
VALUES(2,3,'completed','ready','done',99,'review-proof',repeat('b',64),'complete',$1::jsonb,'{}',now())`, tc.receipt)
				if err != nil {
					t.Fatal(err)
				}
			}
			_, err = tx.ExecContext(ctx, string(migration))
			if tc.blocked {
				if err == nil || !strings.Contains(err.Error(), "assignee recovery blocked") {
					t.Fatalf("unproven assignment must block: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var unchanged bool
			if err = tx.QueryRowContext(ctx, "SELECT assignee_id IS NULL AND version=4 FROM workflow_tasks WHERE id=2").Scan(&unchanged); err != nil || !unchanged {
				t.Fatalf("proven unassigned task was rewritten: %v", err)
			}
		})
	}
}
