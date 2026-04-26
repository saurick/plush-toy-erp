package data

import (
	"context"
	"errors"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

func InitRBACIfNeeded(ctx context.Context, d *Data, l *log.Helper) error {
	if d == nil || d.sqldb == nil {
		return errors.New("InitRBACIfNeeded: missing db")
	}
	now := time.Now()
	for _, permission := range biz.BuiltinPermissions() {
		if _, err := d.sqldb.ExecContext(ctx, `
INSERT INTO permissions (permission_key, name, description, module, action, resource, builtin, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
ON CONFLICT (permission_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  resource = EXCLUDED.resource,
  builtin = TRUE,
  updated_at = EXCLUDED.updated_at`,
			permission.Key,
			permission.Name,
			permission.Description,
			permission.Module,
			permission.Action,
			permission.Resource,
			now,
			now,
		); err != nil {
			return err
		}
	}

	for _, role := range biz.BuiltinRoles() {
		if _, err := d.sqldb.ExecContext(ctx, `
INSERT INTO roles (role_key, name, description, builtin, disabled, sort_order, created_at, updated_at)
VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  builtin = TRUE,
  sort_order = EXCLUDED.sort_order,
  updated_at = EXCLUDED.updated_at`,
			role.Key,
			role.Name,
			role.Description,
			role.Disabled,
			role.SortOrder,
			now,
			now,
		); err != nil {
			return err
		}
		if err := seedBuiltinRolePermissions(ctx, d, role, now); err != nil {
			return err
		}
	}

	if l != nil {
		l.Infof("rbac seed completed permissions=%d roles=%d", len(biz.BuiltinPermissions()), len(biz.BuiltinRoles()))
	}
	return nil
}

func seedBuiltinRolePermissions(ctx context.Context, d *Data, role biz.RoleDefinition, now time.Time) error {
	tx, err := d.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer rollbackSQLTx(ctx, tx, d.log)

	var roleID int
	if err := tx.QueryRowContext(ctx, "SELECT id FROM roles WHERE role_key = $1 LIMIT 1", role.Key).Scan(&roleID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM role_permissions WHERE role_id = $1", roleID); err != nil {
		return err
	}
	for _, permissionKey := range biz.NormalizePermissionKeys(role.Permissions) {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT $1, id, $3 FROM permissions WHERE permission_key = $2
ON CONFLICT (role_id, permission_id) DO NOTHING`, roleID, permissionKey, now); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil
	return nil
}
