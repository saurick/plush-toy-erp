package data

import (
	"context"
	"database/sql"
	"testing"

	"server/internal/biz"

	_ "github.com/mattn/go-sqlite3"
)

func TestSeedBuiltinRBACPrunesStaleBuiltinPermissions(t *testing.T) {
	ctx := context.Background()
	db := openRBACPermissionTestDB(t, "admin_rbac_permission_prune")
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close sqlite failed: %v", err)
		}
	}()
	createRBACPermissionTestSchema(t, ctx, db)

	for _, stmt := range []string{
		`INSERT INTO permissions (id, permission_key, name, module, action, resource, builtin) VALUES
			(1, 'business.record.delete', '删除业务记录', 'business', 'delete', 'business.record', true),
			(2, 'erp.help_center.read', '查看帮助中心', 'erp', 'read', 'erp.help_center', true),
			(3, 'custom.local.debug', '本地自定义调试', 'custom', 'read', 'custom.local', false)`,
		`INSERT INTO role_permissions (role_id, permission_id) VALUES
			(9001, 1),
			(9001, 2),
			(9001, 3)`,
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("exec stmt failed: %v\n%s", err, stmt)
		}
	}

	if err := SeedBuiltinRBACIfNeeded(ctx, db, nil); err != nil {
		t.Fatalf("SeedBuiltinRBACIfNeeded() error = %v", err)
	}

	assertPermissionRowCount(t, ctx, db, "business.record.delete", 0)
	assertPermissionRowCount(t, ctx, db, "erp.help_center.read", 0)
	assertPermissionRowCount(t, ctx, db, "custom.local.debug", 1)
	assertPermissionRowCount(t, ctx, db, biz.PermissionERPDashboardRead, 1)
	assertPermissionBindingCount(t, ctx, db, 1, 0)
	assertPermissionBindingCount(t, ctx, db, 2, 0)
	assertPermissionBindingCount(t, ctx, db, 3, 1)
}

func TestListPermissionsHidesRowsOutsideRBACSource(t *testing.T) {
	ctx := context.Background()
	db := openRBACPermissionTestDB(t, "admin_rbac_permission_list")
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close sqlite failed: %v", err)
		}
	}()
	createRBACPermissionTestSchema(t, ctx, db)

	for _, stmt := range []string{
		`INSERT INTO permissions (id, permission_key, name, module, action, resource, builtin) VALUES
			(1, 'business.record.read', '查看业务记录', 'business', 'read', 'business.record', true),
			(2, 'workflow.task.read', '查看协同任务', 'workflow', 'read', 'workflow.task', true)`,
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("exec stmt failed: %v\n%s", err, stmt)
		}
	}

	repo := &adminManageRepo{data: &Data{sqldb: db}}
	permissions, err := repo.ListPermissions(ctx)
	if err != nil {
		t.Fatalf("ListPermissions() error = %v", err)
	}
	keys := make(map[string]struct{}, len(permissions))
	for _, permission := range permissions {
		keys[permission.Key] = struct{}{}
	}
	if _, ok := keys["business.record.read"]; ok {
		t.Fatalf("stale permission must not be returned: %#v", permissions)
	}
	if _, ok := keys[biz.PermissionWorkflowTaskRead]; !ok {
		t.Fatalf("current permission %s must be returned: %#v", biz.PermissionWorkflowTaskRead, permissions)
	}
}

func openRBACPermissionTestDB(t *testing.T, name string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", "file:"+name+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	return db
}

func createRBACPermissionTestSchema(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	for _, stmt := range []string{
		`CREATE TABLE permissions (
			id integer primary key,
			permission_key text not null unique,
			name text not null default '',
			description text not null default '',
			module text not null default '',
			action text not null default '',
			resource text not null default '',
			builtin boolean not null default false,
			created_at timestamp null,
			updated_at timestamp null
		)`,
		`CREATE TABLE roles (
			id integer primary key,
			role_key text not null unique,
			name text not null default '',
			description text not null default '',
			builtin boolean not null default false,
			disabled boolean not null default false,
			sort_order integer not null default 0,
			created_at timestamp null,
			updated_at timestamp null
		)`,
		`CREATE TABLE role_permissions (
			role_id integer not null,
			permission_id integer not null,
			created_at timestamp null,
			unique(role_id, permission_id)
		)`,
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("exec schema failed: %v\n%s", err, stmt)
		}
	}
}

func assertPermissionRowCount(t *testing.T, ctx context.Context, db *sql.DB, permissionKey string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM permissions WHERE permission_key = $1", permissionKey).Scan(&got); err != nil {
		t.Fatalf("count permission %s failed: %v", permissionKey, err)
	}
	if got != want {
		t.Fatalf("permission %s row count = %d, want %d", permissionKey, got, want)
	}
}

func assertPermissionBindingCount(t *testing.T, ctx context.Context, db *sql.DB, permissionID int, want int) {
	t.Helper()
	var got int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM role_permissions WHERE permission_id = $1", permissionID).Scan(&got); err != nil {
		t.Fatalf("count permission binding %d failed: %v", permissionID, err)
	}
	if got != want {
		t.Fatalf("permission binding %d row count = %d, want %d", permissionID, got, want)
	}
}
