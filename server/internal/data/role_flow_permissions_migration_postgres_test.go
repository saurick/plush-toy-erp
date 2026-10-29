package data

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestAdminManagePostgresRoleFlowPermissionMigration(t *testing.T) {
	ctx := context.Background()
	db, _ := openPurchaseReceiptPostgresTestData(t)
	migration, err := os.ReadFile("model/migrate/20261026063901_role_flow_permissions.sql")
	if err != nil {
		t.Fatal(err)
	}
	before := map[string][]string{
		"sales": {"stock.reservation.create"}, "purchase": {"outsourcing.order.confirm"},
		"warehouse":  {"warehouse.manage", "warehouse.outbound.confirm"},
		"quality":    {"quality.inspection.update", "production.exception.submit"},
		"production": {"production.exception.submit", "production.material_issue.create", "field.procurement_commercial.read", "field.party_private.read"},
		"finance":    {"quality.inspection.read"}, "engineering": {"product.update"},
		"boss": {"workflow.task.assign"}, "pmc": {"pmc.plan.update"}, "admin": {biz.PermissionSystemRolePermissionManage}, "debug_operator": {biz.PermissionDebugSeed},
	}
	after := map[string][]string{
		"sales":       {"stock.reservation.create", "stock.reservation.release", "customer.disable"},
		"purchase":    {"outsourcing.order.confirm", "supplier.disable"},
		"warehouse":   {"warehouse.manage", "warehouse.outbound.confirm", "pmc.plan.read", "production.material_issue.create"},
		"quality":     {"quality.inspection.update"},
		"production":  {"production.over_issue.submit", "field.procurement_commercial.read", "field.party_private.read"},
		"finance":     {"quality.inspection.read", "pmc.plan.read", "production.wip.read"},
		"engineering": {"product.update", "process.disable", "product.disable", "product_sku.disable"},
	}
	for _, roleType := range []string{"business_default", "custom"} {
		t.Run(roleType, func(t *testing.T) {
			tx, err := db.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback() }()
			for _, permission := range biz.BuiltinPermissions() {
				_, err = tx.ExecContext(ctx, `INSERT INTO permissions(permission_key,name,module,action,resource,builtin,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(permission_key) DO NOTHING`, permission.Key, permission.Name, permission.Module, permission.Action, permission.Resource)
				if err != nil {
					t.Fatal(err)
				}
			}
			ids := map[string]int{}
			for key, grants := range before {
				var id int
				err = tx.QueryRowContext(ctx, `INSERT INTO roles(role_key,name,role_type,version,disabled,created_at,updated_at) VALUES($1,$1,$2,10,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(role_key) DO UPDATE SET role_type=$2,version=10,disabled=true RETURNING id`, key, roleType).Scan(&id)
				if err != nil {
					t.Fatal(err)
				}
				ids[key] = id
				if _, err = tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id=$1`, id); err != nil {
					t.Fatal(err)
				}
				for _, grant := range grants {
					_, err = tx.ExecContext(ctx, `INSERT INTO role_permissions(role_id,permission_id,created_at) SELECT $1,id,CURRENT_TIMESTAMP FROM permissions WHERE permission_key=$2`, id, grant)
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			taskIDs := []int{}
			for i, status := range []string{"ready", "blocked", "done", "ready"} {
				producer := "fulfillment.source"
				if i == 3 {
					producer = "custom"
				}
				sourceID := 710000001 + i
				payload, _ := json.Marshal(map[string]any{"source_record_id": sourceID, "source_task_intent_hash": strings.Repeat("a", 64), "source_task_contract": biz.WorkflowSourceTaskContractV1, "source_task_producer": producer})
				var id int
				err = tx.QueryRowContext(ctx, `INSERT INTO workflow_tasks(task_code,task_group,task_name,source_type,source_id,task_status_key,owner_role_key,owner_pool_key,required_capability_key,assignee_id,version,payload,created_at,updated_at) VALUES($1,'handoff_outsourcing_contract','补价并确认加工合同','outsourcing_order',$2,$3,'finance','finance','outsourcing.order.confirm',17,10,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, fmt.Sprintf("source-handoff-outsourcing-contract-%d", sourceID), sourceID, status, string(payload)).Scan(&id)
				if err != nil {
					t.Fatal(err)
				}
				taskIDs = append(taskIDs, id)
			}
			for replay := 0; replay < 2; replay++ {
				if _, err = tx.ExecContext(ctx, string(migration)); err != nil {
					t.Fatalf("apply %d: %v", replay, err)
				}
				for key, id := range ids {
					var version int
					var disabled bool
					if err = tx.QueryRowContext(ctx, `SELECT version,disabled FROM roles WHERE id=$1`, id).Scan(&version, &disabled); err != nil {
						t.Fatal(err)
					}
					want, changed := after[key]
					if !changed || roleType == "custom" {
						want = before[key]
					}
					wantVersion := 10
					if changed && roleType == "business_default" {
						wantVersion++
					}
					if version != wantVersion || !disabled {
						t.Fatalf("%s version=%d disabled=%v", key, version, disabled)
					}
					rows, err := tx.QueryContext(ctx, `SELECT p.permission_key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 ORDER BY p.permission_key`, id)
					if err != nil {
						t.Fatal(err)
					}
					got := []string{}
					for rows.Next() {
						var key string
						if err = rows.Scan(&key); err != nil {
							t.Fatal(err)
						}
						got = append(got, key)
					}
					if err = rows.Close(); err != nil {
						t.Fatal(err)
					}
					want = append([]string{}, want...)
					sort.Strings(want)
					sort.Strings(got)
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("%s grants=%v want=%v", key, got, want)
					}
				}
				for i, id := range taskIDs {
					var owner, status, hash string
					var assignee, version, events int
					err = tx.QueryRowContext(ctx, `SELECT owner_role_key,task_status_key,COALESCE(assignee_id,0),version,payload->>'source_task_intent_hash',(SELECT count(*) FROM workflow_task_events WHERE task_id=$1 AND event_type='role_reassigned') FROM workflow_tasks WHERE id=$1`, id).Scan(&owner, &status, &assignee, &version, &hash, &events)
					if err != nil {
						t.Fatal(err)
					}
					wantOwner, wantAssignee, wantVersion, wantEvents := "purchase", 0, 11, 1
					if i == 2 {
						wantAssignee = 17
					}
					if i == 3 {
						wantOwner, wantAssignee, wantVersion, wantEvents = "finance", 17, 10, 0
					}
					if owner != wantOwner || assignee != wantAssignee || version != wantVersion || events != wantEvents || hash != strings.Repeat("a", 64) || status != []string{"ready", "blocked", "done", "ready"}[i] {
						t.Fatalf("task %d lost responsibility/history: %s %s %d %d %d", id, owner, status, assignee, version, events)
					}
				}
			}
		})
	}
}
