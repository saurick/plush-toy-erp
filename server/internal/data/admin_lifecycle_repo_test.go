package data

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/runtimeauditevent"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	_ "github.com/mattn/go-sqlite3"
)

func TestAdminManageRepoUpdateRolesRejectsRevokedAccountWithoutClearingRoles(t *testing.T) {
	ctx := context.Background()
	dsn := "file:admin_roles_revoked?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqldb.Close() })
	repo := &adminManageRepo{data: &Data{postgres: client, sqldb: sqldb, sqlDialect: dialect.SQLite}}
	admin := client.AdminUser.Create().SetUsername("leaver_roles").SetPasswordHash("hash").SaveX(ctx)
	client.Role.Create().SetRoleKey("sales").SetName("业务").SaveX(ctx)
	client.Role.Create().SetRoleKey("purchase").SetName("采购").SaveX(ctx)
	var visibleRoleCount int
	if err := sqldb.QueryRowContext(ctx, "SELECT COUNT(*) FROM roles").Scan(&visibleRoleCount); err != nil {
		t.Fatalf("count roles: %v", err)
	}
	if visibleRoleCount != 2 {
		t.Fatalf("visible role count = %d, want 2", visibleRoleCount)
	}

	if err := repo.UpdateAdminRoles(ctx, admin.ID, []string{"sales"}); err != nil {
		t.Fatalf("set initial roles: %v", err)
	}
	var initialRoleCount int
	if err := sqldb.QueryRowContext(ctx, "SELECT COUNT(*) FROM admin_user_roles WHERE admin_user_id = $1", admin.ID).Scan(&initialRoleCount); err != nil {
		t.Fatalf("count initial roles: %v", err)
	}
	if initialRoleCount != 1 {
		t.Fatalf("initial role count = %d, want 1", initialRoleCount)
	}
	changedAt := time.Now()
	client.AdminUser.UpdateOneID(admin.ID).
		SetDisabled(true).
		SetRevokedAt(changedAt).
		SetStatusReason("员工离职").
		SetStatusChangedAt(changedAt).
		SetStatusChangedBy(admin.ID).
		SaveX(ctx)
	if err := repo.UpdateAdminRoles(ctx, admin.ID, []string{"purchase"}); err != biz.ErrAdminRevoked {
		t.Fatalf("update revoked roles error = %v, want ErrAdminRevoked", err)
	}

	var roleKey string
	if err := sqldb.QueryRowContext(ctx, `
SELECT r.role_key
FROM admin_user_roles aur
JOIN roles r ON r.id = aur.role_id
WHERE aur.admin_user_id = $1`, admin.ID).Scan(&roleKey); err != nil {
		t.Fatalf("load preserved role: %v", err)
	}
	if roleKey != "sales" {
		t.Fatalf("role after rejected update = %q, want sales", roleKey)
	}
}

func TestAdminManageRepoRevokeIsTransactionalAndReleasesActiveTasks(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:admin_lifecycle_revoke?mode=memory&cache=shared&_fk=1")
	repo := &adminManageRepo{data: &Data{postgres: client}}
	operator := client.AdminUser.Create().
		SetUsername("root").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
	target := client.AdminUser.Create().
		SetUsername("leaver").SetPasswordHash("hash").SaveX(ctx)
	task := client.WorkflowTask.Create().
		SetTaskCode("LEAVE-001").SetTaskGroup("sales").SetTaskName("待跟进订单").
		SetSourceType("sales_order").SetSourceID(1).SetTaskStatusKey("processing").
		SetOwnerRoleKey("sales").SetAssigneeID(target.ID).SaveX(ctx)
	if _, err := repo.ChangeAdminLifecycle(ctx, &biz.AdminLifecycleChange{
		AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true,
		Reason: "员工离职",
		AuditEvent: &biz.RuntimeAuditEventCreate{
			EventType: "admin_control_plane", EventKey: "admin_user.revoked", Source: "admin_manage",
			Payload: map[string]any{"invalid": make(chan struct{})},
		},
	}); err == nil {
		t.Fatal("invalid audit payload must roll back lifecycle transaction")
	}
	if rolledBackAdmin := client.AdminUser.GetX(ctx, target.ID); rolledBackAdmin.Disabled || rolledBackAdmin.RevokedAt != nil {
		t.Fatalf("account change survived audit rollback: %#v", rolledBackAdmin)
	}
	if rolledBackTask := client.WorkflowTask.GetX(ctx, task.ID); rolledBackTask.AssigneeID == nil || *rolledBackTask.AssigneeID != target.ID {
		t.Fatalf("task change survived audit rollback: %#v", rolledBackTask)
	}

	released, err := repo.ChangeAdminLifecycle(ctx, &biz.AdminLifecycleChange{
		AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true,
		Reason: "员工离职",
		AuditEvent: &biz.RuntimeAuditEventCreate{
			EventType: "admin_control_plane", EventKey: "admin_user.revoked", Source: "admin_manage",
			Payload: map[string]any{"target": map[string]any{"id": target.ID}},
		},
	})
	if err != nil {
		t.Fatalf("ChangeAdminLifecycle() error = %v", err)
	}
	if released != 1 {
		t.Fatalf("released task count = %d, want 1", released)
	}
	updatedAdmin := client.AdminUser.GetX(ctx, target.ID)
	if !updatedAdmin.Disabled || updatedAdmin.RevokedAt == nil || updatedAdmin.StatusReason == nil || *updatedAdmin.StatusReason != "员工离职" {
		t.Fatalf("unexpected revoked admin: %#v", updatedAdmin)
	}
	updatedTask := client.WorkflowTask.GetX(ctx, task.ID)
	if updatedTask.AssigneeID != nil || updatedTask.Version != task.Version+1 {
		t.Fatalf("task must return to role pool with next version: %#v", updatedTask)
	}
	if count := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("unassigned")).CountX(ctx); count != 1 {
		t.Fatalf("unassignment event count = %d, want 1", count)
	}
	if count := client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.revoked")).CountX(ctx); count != 1 {
		t.Fatalf("audit event count = %d, want 1", count)
	}
	if count := client.WorkflowTask.Query().Where(workflowtask.AssigneeID(target.ID)).CountX(ctx); count != 0 {
		t.Fatalf("revoked admin still has %d assigned tasks", count)
	}
}

func TestAdminManageRepoRejectsInvalidRevokeCommandBeforeWriting(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:admin_lifecycle_invalid_revoke?mode=memory&cache=shared&_fk=1")
	repo := &adminManageRepo{data: &Data{postgres: client}}
	operator := client.AdminUser.Create().SetUsername("root_invalid").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
	target := client.AdminUser.Create().SetUsername("leaver_invalid").SetPasswordHash("hash").SaveX(ctx)
	event := &biz.RuntimeAuditEventCreate{
		EventType: "admin_control_plane", EventKey: "admin_user.revoked", Source: "admin_manage",
		Payload: map[string]any{"target": map[string]any{"id": target.ID}},
	}

	for _, change := range []*biz.AdminLifecycleChange{
		{AdminID: target.ID, OperatorID: operator.ID, Disabled: false, Revoke: true, Reason: "员工离职", AuditEvent: event},
		{AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true, Reason: " ", AuditEvent: event},
	} {
		if _, err := repo.ChangeAdminLifecycle(ctx, change); err != biz.ErrBadParam {
			t.Fatalf("invalid revoke error = %v, want ErrBadParam", err)
		}
	}
	unchanged := client.AdminUser.GetX(ctx, target.ID)
	if unchanged.Disabled || unchanged.RevokedAt != nil {
		t.Fatalf("invalid revoke changed account: %#v", unchanged)
	}
}
