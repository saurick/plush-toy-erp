package data

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestPurchaseReceiptPostgresIQCResponsibilityMigration(t *testing.T) {
	ctx := context.Background()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	migration, err := os.ReadFile("model/migrate/20260919003921_iqc_receiving_permissions.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, roleType := range []string{"business_default", "custom"} {
		t.Run(roleType, func(t *testing.T) {
			tx, err := data.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback() }()
			var roleID int
			err = tx.QueryRowContext(ctx, `INSERT INTO roles (role_key, name, role_type, version, disabled, created_at, updated_at)
VALUES ('quality', '模拟仓库 IQC', $1, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (role_key) DO UPDATE SET role_type = EXCLUDED.role_type, version = 10, disabled = true RETURNING id`, roleType).Scan(&roleID)
			if err != nil {
				t.Fatal(err)
			}
			for _, key := range []string{"purchase.order.read", "purchase.receipt.create", "warehouse.inbound.confirm"} {
				if _, err := tx.ExecContext(ctx, `INSERT INTO permissions (permission_key, name, module, action, resource, created_at, updated_at)
VALUES ($1, $1, 'purchase', 'read', 'receipt', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (permission_key) DO NOTHING`, key); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
				t.Fatal(err)
			}
			ids := make([]int, 3)
			for i := range ids {
				sourceID := 700000001 + i
				status, producer := "ready", "fulfillment.source"
				if i == 1 {
					status = "done"
				}
				if i == 2 {
					producer = "custom"
				}
				payload, _ := json.Marshal(map[string]any{"source_record_id": sourceID, "source_task_intent_hash": strings.Repeat("a", 64), "source_task_contract": "workflow.source-task/v1", "source_task_producer": producer})
				err := tx.QueryRowContext(ctx, `INSERT INTO workflow_tasks (task_code, task_group, task_name, source_type, source_id, task_status_key, owner_role_key, owner_pool_key, required_capability_key, assignee_id, version, payload, created_at, updated_at)
VALUES ($1, 'handoff_purchase_arrival', '模拟来料登记', 'purchase_order', $2, $3, 'warehouse', 'warehouse', 'purchase.receipt.create', 17, 10, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`, fmt.Sprintf("source-handoff-purchase-arrival-%d", sourceID), sourceID, status, string(payload)).Scan(&ids[i])
				if err != nil {
					t.Fatal(err)
				}
			}
			for replay := 0; replay < 2; replay++ {
				if _, err := tx.ExecContext(ctx, string(migration)); err != nil {
					t.Fatalf("migration replay %d: %v", replay, err)
				}
				var version, grants, stockGrants int
				var disabled bool
				if err := tx.QueryRowContext(ctx, `SELECT version, disabled FROM roles WHERE id=$1`, roleID).Scan(&version, &disabled); err != nil {
					t.Fatal(err)
				}
				if err := tx.QueryRowContext(ctx, `SELECT count(*), count(*) FILTER (WHERE p.permission_key='warehouse.inbound.confirm') FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1`, roleID).Scan(&grants, &stockGrants); err != nil {
					t.Fatal(err)
				}
				wantVersion, wantGrants := 10, 0
				if roleType == "business_default" {
					wantVersion, wantGrants = 11, 3
				}
				if version != wantVersion || grants != wantGrants || stockGrants != 0 || !disabled {
					t.Fatalf("role boundary: version=%d grants=%d stock=%d disabled=%t", version, grants, stockGrants, disabled)
				}
				for i, id := range ids {
					var owner string
					var assignee, taskVersion, events int
					if err := tx.QueryRowContext(ctx, `SELECT owner_role_key, COALESCE(assignee_id,0), version, (SELECT count(*) FROM workflow_task_events WHERE task_id=$1 AND event_type='role_reassigned') FROM workflow_tasks WHERE id=$1`, id).Scan(&owner, &assignee, &taskVersion, &events); err != nil {
						t.Fatal(err)
					}
					wantOwner, wantAssignee, wantVersion, wantEvents := "quality", 0, 11, 1
					if i == 1 {
						wantAssignee = 17
					}
					if i == 2 {
						wantOwner, wantAssignee, wantVersion, wantEvents = "warehouse", 17, 10, 0
					}
					if owner != wantOwner || assignee != wantAssignee || taskVersion != wantVersion || events != wantEvents {
						t.Fatalf("task %d boundary: owner=%s assignee=%d version=%d events=%d", i, owner, assignee, taskVersion, events)
					}
				}
			}
		})
	}
}
