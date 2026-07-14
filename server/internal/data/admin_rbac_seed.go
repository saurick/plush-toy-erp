package data

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

func InitRBACIfNeeded(ctx context.Context, d *Data, l *log.Helper) error {
	if d == nil || d.sqldb == nil {
		return errors.New("InitRBACIfNeeded: missing db")
	}
	return SeedBuiltinRBACIfNeeded(ctx, d.sqldb, l)
}

func SeedBuiltinRBACIfNeeded(ctx context.Context, db *sql.DB, l *log.Helper) error {
	if db == nil {
		return errors.New("SeedBuiltinRBACIfNeeded: missing db")
	}
	now := time.Now()
	for _, permission := range biz.BuiltinPermissions() {
		if _, err := db.ExecContext(ctx, `
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
	if err := pruneStaleBuiltinPermissions(ctx, db); err != nil {
		return err
	}

	for _, role := range biz.BuiltinRoles() {
		var existingRoleID int
		roleExists := true
		if err := db.QueryRowContext(ctx, "SELECT id FROM roles WHERE role_key = $1 LIMIT 1", role.Key).Scan(&existingRoleID); err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			roleExists = false
		}
		if _, err := db.ExecContext(ctx, `
INSERT INTO roles (role_key, name, description, builtin, role_type, disabled, sort_order, version, created_at, updated_at)
VALUES ($1, $2, $3, TRUE, $4, $5, $6, 1, $7, $8)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  builtin = TRUE,
  role_type = EXCLUDED.role_type,
  sort_order = EXCLUDED.sort_order,
  updated_at = EXCLUDED.updated_at`,
			role.Key,
			role.Name,
			role.Description,
			role.Type,
			role.Disabled,
			role.SortOrder,
			now,
			now,
		); err != nil {
			return err
		}
		// Business and custom role selections survive restart. System roles are
		// code-managed: seed reconciles their exact permission set and increments
		// the CAS version only when that set actually changes.
		if !roleExists || role.Type == biz.RoleTypeSystem {
			if err := seedBuiltinRolePermissions(ctx, db, role, now, roleExists, l); err != nil {
				return err
			}
		}
	}

	if l != nil {
		l.Infof("rbac seed completed permissions=%d roles=%d", len(biz.BuiltinPermissions()), len(biz.BuiltinRoles()))
	}
	return nil
}

func pruneStaleBuiltinPermissions(ctx context.Context, db *sql.DB) error {
	keys := biz.AllPermissionKeys()
	if len(keys) == 0 {
		return nil
	}
	placeholders := make([]string, 0, len(keys))
	args := make([]any, 0, len(keys))
	for index, key := range keys {
		placeholders = append(placeholders, "$"+strconv.Itoa(index+1))
		args = append(args, key)
	}
	inClause := strings.Join(placeholders, ", ")
	if _, err := db.ExecContext(ctx, `
DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE builtin = TRUE AND permission_key NOT IN (`+inClause+`)
)`, args...); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `
DELETE FROM permissions
WHERE builtin = TRUE AND permission_key NOT IN (`+inClause+`)`, args...); err != nil {
		return err
	}
	return nil
}

func seedBuiltinRolePermissions(ctx context.Context, db *sql.DB, role biz.RoleDefinition, now time.Time, bumpVersion bool, l *log.Helper) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer rollbackSQLTx(ctx, tx, l)

	var roleID int
	if err := tx.QueryRowContext(ctx, "SELECT id FROM roles WHERE role_key = $1 LIMIT 1", role.Key).Scan(&roleID); err != nil {
		return err
	}
	rows, err := tx.QueryContext(ctx, `
SELECT p.permission_key
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role_id = $1`, roleID)
	if err != nil {
		return err
	}
	currentKeys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			_ = rows.Close()
			return err
		}
		currentKeys = append(currentKeys, key)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	desiredKeys := biz.NormalizePermissionKeys(role.Permissions)
	if slices.Equal(biz.NormalizePermissionKeys(currentKeys), desiredKeys) {
		if err := tx.Commit(); err != nil {
			return err
		}
		tx = nil
		return nil
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM role_permissions WHERE role_id = $1", roleID); err != nil {
		return err
	}
	for _, permissionKey := range desiredKeys {
		var permissionID int
		if err := tx.QueryRowContext(ctx, "SELECT id FROM permissions WHERE permission_key = $1 LIMIT 1", permissionKey).Scan(&permissionID); err != nil {
			return fmt.Errorf("load builtin permission %q for role %q: %w", permissionKey, role.Key, err)
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO role_permissions (role_id, permission_id, created_at)
VALUES ($1, $2, $3)
ON CONFLICT (role_id, permission_id) DO NOTHING`, roleID, permissionID, now); err != nil {
			return err
		}
	}
	if bumpVersion {
		if _, err := tx.ExecContext(ctx, "UPDATE roles SET version = version + 1, updated_at = $1 WHERE id = $2", now, roleID); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil
	return nil
}
