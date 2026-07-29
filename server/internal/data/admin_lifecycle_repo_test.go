package data

import (
	"context"
	"database/sql"
	"strings"
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

func TestAdminManageRepoSetRolesRejectsRevokedAccountWithoutClearingRoles(t *testing.T) {
	ctx := context.Background()
	dsn := "file:admin_roles_revoked?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqldb.Close() })
	repo := &adminManageRepo{data: &Data{postgres: client, sqldb: sqldb, sqlDialect: dialect.SQLite}}
	operator := client.AdminUser.Create().SetUsername("root_roles").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
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

	if _, err := repo.SetAdminRolesWithAudit(ctx, &biz.AdminRolesChange{
		AdminID: admin.ID, OperatorID: operator.ID, RoleKeys: []string{"sales"},
	}); err != nil {
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
	if _, err := repo.SetAdminRolesWithAudit(ctx, &biz.AdminRolesChange{
		AdminID: admin.ID, OperatorID: operator.ID, RoleKeys: []string{"purchase"},
	}); err != biz.ErrAdminRevoked {
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
	dsn := "file:admin_lifecycle_revoke?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqldb.Close() })
	repo := &adminManageRepo{data: &Data{postgres: client, sqldb: sqldb, sqlDialect: dialect.SQLite}}
	operator := client.AdminUser.Create().
		SetUsername("root").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
	target := client.AdminUser.Create().
		SetUsername("leaver").SetPasswordHash("hash").SaveX(ctx)
	task := client.WorkflowTask.Create().
		SetTaskCode("LEAVE-001").SetTaskGroup("sales").SetTaskName("待跟进订单").
		SetSourceType("sales_order").SetSourceID(1).SetTaskStatusKey("ready").
		SetOwnerRoleKey("sales").SetAssigneeID(target.ID).SaveX(ctx)
	if _, err := sqldb.ExecContext(
		ctx,
		"ALTER TABLE runtime_audit_events RENAME TO runtime_audit_events_unavailable_for_test",
	); err != nil {
		t.Fatalf("make audit table unavailable: %v", err)
	}
	if _, _, err := repo.ChangeAdminLifecycle(ctx, &biz.AdminLifecycleChange{
		AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true,
		Reason: "员工离职",
	}); err == nil {
		t.Fatal("audit write failure must roll back lifecycle transaction")
	}
	if rolledBackAdmin := client.AdminUser.GetX(ctx, target.ID); rolledBackAdmin.Disabled || rolledBackAdmin.RevokedAt != nil {
		t.Fatalf("account change survived audit rollback: %#v", rolledBackAdmin)
	}
	if rolledBackTask := client.WorkflowTask.GetX(ctx, task.ID); rolledBackTask.AssigneeID == nil || *rolledBackTask.AssigneeID != target.ID {
		t.Fatalf("task change survived audit rollback: %#v", rolledBackTask)
	}
	if _, err := sqldb.ExecContext(
		ctx,
		"ALTER TABLE runtime_audit_events_unavailable_for_test RENAME TO runtime_audit_events",
	); err != nil {
		t.Fatalf("restore audit table: %v", err)
	}

	updated, released, err := repo.ChangeAdminLifecycle(ctx, &biz.AdminLifecycleChange{
		AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true,
		Reason: "员工离职",
	})
	if err != nil {
		t.Fatalf("ChangeAdminLifecycle() error = %v", err)
	}
	if released != 1 {
		t.Fatalf("released task count = %d, want 1", released)
	}
	if updated == nil || updated.ID != target.ID || updated.AccountStatus() != biz.AdminAccountStatusRevoked {
		t.Fatalf("returned admin snapshot = %#v", updated)
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
	event := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("unassigned")).OnlyX(ctx)
	if event.Payload["account_lifecycle_action"] != adminSessionRevokeReasonAccountRevoked {
		t.Fatalf("unassignment lifecycle action = %#v", event.Payload)
	}
	if _, ok := event.Payload["account_status_reason"]; ok {
		t.Fatalf("unassignment event leaked account reason: %#v", event.Payload)
	}
	if count := client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.revoked")).CountX(ctx); count != 1 {
		t.Fatalf("audit event count = %d, want 1", count)
	}
	if count := client.WorkflowTask.Query().Where(workflowtask.AssigneeID(target.ID)).CountX(ctx); count != 0 {
		t.Fatalf("revoked admin still has %d assigned tasks", count)
	}
}

func TestAdminManageRepoDisableReleasesActiveTasksWithoutRevokingAccount(t *testing.T) {
	ctx := context.Background()
	dsn := "file:admin_lifecycle_disable?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqldb.Close() })
	repo := &adminManageRepo{data: &Data{postgres: client, sqldb: sqldb, sqlDialect: dialect.SQLite}}
	operator := client.AdminUser.Create().
		SetUsername("root_disable").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
	target := client.AdminUser.Create().
		SetUsername("leave_temporarily").SetPasswordHash("hash").SaveX(ctx)
	task := client.WorkflowTask.Create().
		SetTaskCode("DISABLE-001").SetTaskGroup("sales").SetTaskName("待审批订单").
		SetSourceType("sales_order").SetSourceID(1).SetTaskStatusKey("ready").
		SetOwnerRoleKey(biz.SalesRoleKey).SetAssigneeID(target.ID).SaveX(ctx)

	updated, released, err := repo.ChangeAdminLifecycle(ctx, &biz.AdminLifecycleChange{
		AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Reason: "临时离岗",
	})
	if err != nil {
		t.Fatalf("ChangeAdminLifecycle(disable) error = %v", err)
	}
	if released != 1 || updated == nil || updated.AccountStatus() != biz.AdminAccountStatusSuspended || updated.RevokedAt != nil {
		t.Fatalf("disable result admin=%#v released=%d", updated, released)
	}
	updatedTask := client.WorkflowTask.GetX(ctx, task.ID)
	if updatedTask.AssigneeID != nil ||
		updatedTask.Payload["assignee_released_to_pool"] != true ||
		updatedTask.Payload["account_lifecycle_action"] != adminSessionRevokeReasonAccountDisabled {
		t.Fatalf("disabled account task was not released: %#v", updatedTask)
	}
	event := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("unassigned")).
		OnlyX(ctx)
	if event.Payload["account_lifecycle_action"] != adminSessionRevokeReasonAccountDisabled ||
		event.Reason == nil ||
		!strings.Contains(*event.Reason, "账号停用") {
		t.Fatalf("disable unassignment event = %#v", event)
	}
}

func TestAdminManageRepoRoleRemovalReleasesOnlyTasksOwnedByRemovedRoles(t *testing.T) {
	ctx := context.Background()
	dsn := "file:admin_role_removal_release?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqldb.Close() })
	repo := &adminManageRepo{data: &Data{postgres: client, sqldb: sqldb, sqlDialect: dialect.SQLite}}
	operator := client.AdminUser.Create().
		SetUsername("root_role_release").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
	target := client.AdminUser.Create().
		SetUsername("role_release_target").SetPasswordHash("hash").SaveX(ctx)
	salesRole := client.Role.Create().
		SetRoleKey(biz.SalesRoleKey).SetName("业务").SaveX(ctx)
	client.Role.Create().
		SetRoleKey(biz.PurchaseRoleKey).SetName("采购").SaveX(ctx)
	client.AdminUserRole.Create().
		SetAdminUserID(target.ID).
		SetRoleID(salesRole.ID).
		SaveX(ctx)

	removedRoleTask := client.WorkflowTask.Create().
		SetTaskCode("ROLE-REMOVED-001").SetTaskGroup("sales").SetTaskName("销售审批").
		SetSourceType("sales_order").SetSourceID(1).SetTaskStatusKey("ready").
		SetOwnerRoleKey(biz.SalesRoleKey).SetAssigneeID(target.ID).SaveX(ctx)
	retainedRoleTask := client.WorkflowTask.Create().
		SetTaskCode("ROLE-RETAINED-001").SetTaskGroup("purchase").SetTaskName("采购审批").
		SetSourceType("purchase_order").SetSourceID(2).SetTaskStatusKey("ready").
		SetOwnerRoleKey(biz.PurchaseRoleKey).SetAssigneeID(target.ID).SaveX(ctx)
	terminalTask := client.WorkflowTask.Create().
		SetTaskCode("ROLE-TERMINAL-001").SetTaskGroup("sales").SetTaskName("已完成销售审批").
		SetSourceType("sales_order").SetSourceID(3).SetTaskStatusKey("done").
		SetOwnerRoleKey(biz.SalesRoleKey).SetAssigneeID(target.ID).SaveX(ctx)

	updated, err := repo.SetAdminRolesWithAudit(ctx, &biz.AdminRolesChange{
		AdminID: target.ID, OperatorID: operator.ID, RoleKeys: []string{biz.PurchaseRoleKey},
	})
	if err != nil {
		t.Fatalf("SetAdminRolesWithAudit error = %v", err)
	}
	if !biz.AdminHasRole(updated, biz.PurchaseRoleKey) || biz.AdminHasRole(updated, biz.SalesRoleKey) {
		t.Fatalf("updated roles = %#v", biz.AdminRoleKeys(updated))
	}
	released := client.WorkflowTask.GetX(ctx, removedRoleTask.ID)
	if released.AssigneeID != nil ||
		released.Version != removedRoleTask.Version+1 ||
		released.Payload["assignee_released_to_pool"] != true ||
		released.Payload["account_role_action"] != "roles_removed" {
		t.Fatalf("removed role task was not released = %#v", released)
	}
	if current := client.WorkflowTask.GetX(ctx, retainedRoleTask.ID); current.AssigneeID == nil || *current.AssigneeID != target.ID {
		t.Fatalf("retained role task must keep assignee = %#v", current)
	}
	if current := client.WorkflowTask.GetX(ctx, terminalTask.ID); current.AssigneeID == nil || *current.AssigneeID != target.ID {
		t.Fatalf("terminal task must remain immutable = %#v", current)
	}
	event := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(removedRoleTask.ID), workflowtaskevent.EventType("unassigned")).
		OnlyX(ctx)
	if event.Payload["account_role_action"] != "roles_removed" ||
		event.Reason == nil ||
		!strings.Contains(*event.Reason, "岗位移除") {
		t.Fatalf("role removal unassignment event = %#v", event)
	}
	if count := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskIDIn(retainedRoleTask.ID, terminalTask.ID)).
		CountX(ctx); count != 0 {
		t.Fatalf("unrelated tasks received %d events", count)
	}
}

func TestAdminManageRepoRejectsInvalidRevokeCommandBeforeWriting(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:admin_lifecycle_invalid_revoke?mode=memory&cache=shared&_fk=1")
	repo := &adminManageRepo{data: &Data{postgres: client}}
	operator := client.AdminUser.Create().SetUsername("root_invalid").SetPasswordHash("hash").SetIsSuperAdmin(true).SaveX(ctx)
	target := client.AdminUser.Create().SetUsername("leaver_invalid").SetPasswordHash("hash").SaveX(ctx)

	for _, change := range []*biz.AdminLifecycleChange{
		{AdminID: target.ID, OperatorID: operator.ID, Disabled: false, Revoke: true, Reason: "员工离职"},
		{AdminID: target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true, Reason: " "},
	} {
		if _, _, err := repo.ChangeAdminLifecycle(ctx, change); err != biz.ErrBadParam {
			t.Fatalf("invalid revoke error = %v, want ErrBadParam", err)
		}
	}
	unchanged := client.AdminUser.GetX(ctx, target.ID)
	if unchanged.Disabled || unchanged.RevokedAt != nil {
		t.Fatalf("invalid revoke changed account: %#v", unchanged)
	}
}
