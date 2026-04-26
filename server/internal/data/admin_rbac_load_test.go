package data

import (
	"context"
	"database/sql"
	"testing"

	"server/internal/biz"

	_ "github.com/mattn/go-sqlite3"
)

func TestLoadAdminRBACUsesRolePermissionSource(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite3", "file:admin_rbac_load?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close sqlite failed: %v", err)
		}
	}()

	for _, stmt := range []string{
		`CREATE TABLE roles (
			id integer primary key,
			role_key text not null,
			name text not null,
			description text not null default '',
			builtin boolean not null default false,
			disabled boolean not null default false,
			sort_order integer not null default 0
		)`,
		`CREATE TABLE permissions (
			id integer primary key,
			permission_key text not null
		)`,
		`CREATE TABLE role_permissions (
			role_id integer not null,
			permission_id integer not null
		)`,
		`CREATE TABLE admin_user_roles (
			admin_user_id integer not null,
			role_id integer not null
		)`,
		`INSERT INTO roles (id, role_key, name, disabled, sort_order) VALUES
			(1, 'purchase', '采购', false, 10),
			(2, 'warehouse', '仓库', true, 20)`,
		`INSERT INTO permissions (id, permission_key) VALUES
			(1, 'purchase.receipt.read'),
			(2, 'warehouse.inventory.read'),
			(3, 'legacy.disabled.permission')`,
		`INSERT INTO role_permissions (role_id, permission_id) VALUES
			(1, 1),
			(1, 3),
			(2, 2)`,
		`INSERT INTO admin_user_roles (admin_user_id, role_id) VALUES
			(100, 1),
			(100, 2)`,
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("exec stmt failed: %v\n%s", err, stmt)
		}
	}

	admin := &biz.AdminUser{ID: 100, Username: "buyer"}
	if err := loadAdminRBAC(ctx, db, admin); err != nil {
		t.Fatalf("loadAdminRBAC() error = %v", err)
	}

	if len(admin.Roles) != 2 {
		t.Fatalf("expected both bound roles to be returned for profile, got %#v", admin.Roles)
	}
	if !biz.AdminHasPermission(admin, biz.PermissionPurchaseReceiptRead) {
		t.Fatalf("expected active role permission %s", biz.PermissionPurchaseReceiptRead)
	}
	if biz.AdminHasPermission(admin, biz.PermissionWarehouseInventoryRead) {
		t.Fatalf("disabled role must not grant %s", biz.PermissionWarehouseInventoryRead)
	}
	if biz.AdminHasPermission(admin, "legacy.disabled.permission") {
		t.Fatalf("permission outside rbac.go source must not grant access")
	}
}

func TestLoadAdminRBACSuperAdminGetsAllPermissions(t *testing.T) {
	db, err := sql.Open("sqlite3", "file:admin_rbac_load_super?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close sqlite failed: %v", err)
		}
	}()
	if _, err := db.ExecContext(context.Background(), `CREATE TABLE admin_user_roles (admin_user_id integer not null, role_id integer not null)`); err != nil {
		t.Fatalf("create admin_user_roles failed: %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `CREATE TABLE roles (id integer primary key, role_key text not null, name text not null, description text not null default '', builtin boolean not null default false, disabled boolean not null default false, sort_order integer not null default 0)`); err != nil {
		t.Fatalf("create roles failed: %v", err)
	}

	admin := &biz.AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	if err := loadAdminRBAC(context.Background(), db, admin); err != nil {
		t.Fatalf("loadAdminRBAC() error = %v", err)
	}
	if len(admin.Permissions) != len(biz.AllPermissionKeys()) {
		t.Fatalf("expected all permissions for super admin, got %d", len(admin.Permissions))
	}
	if !biz.AdminHasPermission(admin, biz.PermissionDebugBusinessClear) {
		t.Fatalf("expected super admin to have %s", biz.PermissionDebugBusinessClear)
	}
}
