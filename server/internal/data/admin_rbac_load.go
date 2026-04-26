package data

import (
	"context"
	"database/sql"
	"strings"

	"server/internal/biz"
)

func loadAdminRBAC(ctx context.Context, db *sql.DB, admin *biz.AdminUser) error {
	if db == nil || admin == nil {
		return nil
	}

	roles, err := loadAdminRoles(ctx, db, admin.ID)
	if err != nil {
		return err
	}
	admin.Roles = roles

	if admin.IsSuperAdmin {
		admin.Permissions = biz.AllPermissionKeys()
		return nil
	}

	permissions, err := loadAdminPermissionKeys(ctx, db, admin.ID)
	if err != nil {
		return err
	}
	admin.Permissions = permissions
	return nil
}

func loadAdminRoles(ctx context.Context, db *sql.DB, adminID int) ([]biz.AdminRole, error) {
	rows, err := db.QueryContext(ctx, `
SELECT r.id, r.role_key, r.name, r.description, r.builtin, r.disabled, r.sort_order
FROM admin_user_roles aur
JOIN roles r ON r.id = aur.role_id
WHERE aur.admin_user_id = $1
ORDER BY r.sort_order ASC, r.id ASC`, adminID)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	out := []biz.AdminRole{}
	for rows.Next() {
		var item biz.AdminRole
		if err := rows.Scan(&item.ID, &item.Key, &item.Name, &item.Description, &item.Builtin, &item.Disabled, &item.SortOrder); err != nil {
			return nil, err
		}
		item.Key = biz.NormalizeRoleKey(item.Key)
		out = append(out, item)
	}
	return out, rows.Err()
}

func loadAdminPermissionKeys(ctx context.Context, db *sql.DB, adminID int) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
SELECT DISTINCT p.permission_key
FROM admin_user_roles aur
JOIN roles r ON r.id = aur.role_id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE aur.admin_user_id = $1
  AND r.disabled = FALSE
ORDER BY p.permission_key ASC`, adminID)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	raw := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		if strings.TrimSpace(key) != "" {
			raw = append(raw, key)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return biz.NormalizePermissionKeys(raw), nil
}
