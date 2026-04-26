package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/user"

	"github.com/go-kratos/kratos/v2/log"
)

type adminManageRepo struct {
	data *Data
	log  *log.Helper
}

func NewAdminManageRepo(d *Data, logger log.Logger) *adminManageRepo {
	return &adminManageRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.admin_manage_repo")),
	}
}

var _ biz.AdminManageRepo = (*adminManageRepo)(nil)

func (r *adminManageRepo) toBizAdmin(a *ent.AdminUser) *biz.AdminUser {
	if a == nil {
		return nil
	}
	admin := &biz.AdminUser{
		ID:             a.ID,
		Username:       a.Username,
		Phone:          stringValue(a.Phone),
		PasswordHash:   a.PasswordHash,
		IsSuperAdmin:   a.IsSuperAdmin,
		ERPPreferences: decodeAdminERPPreferences(a.ErpPreferences),
		Disabled:       a.Disabled,
		LastLoginAt:    a.LastLoginAt,
		CreatedAt:      a.CreatedAt,
		UpdatedAt:      a.UpdatedAt,
	}
	if err := loadAdminRBAC(context.Background(), r.data.sqldb, admin); err != nil {
		r.log.Warnf("load admin RBAC failed admin_id=%d err=%v", admin.ID, err)
	}
	return admin
}

func (r *adminManageRepo) GetAdminByID(ctx context.Context, id int) (*biz.AdminUser, error) {
	if id <= 0 {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.AdminUser.Query().Where(adminuser.ID(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrAdminNotFound
		}
		return nil, err
	}
	return r.toBizAdmin(row), nil
}

func (r *adminManageRepo) GetAdminByUsername(ctx context.Context, username string) (*biz.AdminUser, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.AdminUser.Query().Where(adminuser.Username(username)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrAdminNotFound
		}
		return nil, err
	}
	return r.toBizAdmin(row), nil
}

func (r *adminManageRepo) GetAdminByPhone(ctx context.Context, phone string) (*biz.AdminUser, error) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.AdminUser.Query().Where(adminuser.Phone(phone)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrAdminNotFound
		}
		return nil, err
	}
	return r.toBizAdmin(row), nil
}

func (r *adminManageRepo) ListAdmins(ctx context.Context) ([]*biz.AdminUser, error) {
	rows, err := r.data.postgres.AdminUser.Query().Order(ent.Desc(adminuser.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.AdminUser, 0, len(rows))
	for _, row := range rows {
		out = append(out, r.toBizAdmin(row))
	}
	return out, nil
}

func (r *adminManageRepo) CreateAdmin(ctx context.Context, in *biz.AdminCreate) (*biz.AdminUser, error) {
	if in == nil || strings.TrimSpace(in.Username) == "" || strings.TrimSpace(in.PasswordHash) == "" {
		return nil, biz.ErrBadParam
	}
	if exists, err := r.data.postgres.User.Query().Where(user.UsernameEQ(in.Username)).Exist(ctx); err != nil {
		return nil, err
	} else if exists {
		return nil, biz.ErrAdminExists
	}

	row, err := r.data.postgres.AdminUser.Create().
		SetUsername(in.Username).
		SetNillablePhone(stringPtrOrNil(in.Phone)).
		SetPasswordHash(in.PasswordHash).
		SetIsSuperAdmin(false).
		SetDisabled(false).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrAdminExists
		}
		return nil, err
	}
	if err := r.UpdateAdminRoles(ctx, row.ID, in.RoleKeys); err != nil {
		return nil, err
	}
	return r.GetAdminByID(ctx, row.ID)
}

func (r *adminManageRepo) UpdateAdminRoles(ctx context.Context, id int, roleKeys []string) error {
	if id <= 0 {
		return biz.ErrBadParam
	}
	roleKeys = biz.NormalizeAdminRoleKeys(roleKeys)
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer rollbackSQLTx(ctx, tx, r.log)

	if _, err := tx.ExecContext(ctx, "DELETE FROM admin_user_roles WHERE admin_user_id = $1", id); err != nil {
		return err
	}
	for _, roleKey := range roleKeys {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO admin_user_roles (admin_user_id, role_id, created_at)
SELECT $1, id, $3 FROM roles WHERE role_key = $2 AND disabled = FALSE
ON CONFLICT (admin_user_id, role_id) DO NOTHING`, id, roleKey, time.Now()); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil
	return nil
}

func (r *adminManageRepo) ListRoles(ctx context.Context) ([]biz.AdminRole, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT id, role_key, name, description, builtin, disabled, sort_order
FROM roles
ORDER BY sort_order ASC, id ASC`)
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
		item.Permissions, err = r.loadRolePermissionKeys(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *adminManageRepo) loadRolePermissionKeys(ctx context.Context, roleID int) ([]string, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT p.permission_key
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role_id = $1
ORDER BY p.module ASC, p.permission_key ASC`, roleID)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	out := []string{}
	for rows.Next() {
		var permissionKey string
		if err := rows.Scan(&permissionKey); err != nil {
			return nil, err
		}
		out = append(out, permissionKey)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return biz.NormalizePermissionKeys(out), nil
}

func (r *adminManageRepo) ListPermissions(ctx context.Context) ([]biz.AdminPermission, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT id, permission_key, name, description, module, action, resource, builtin
FROM permissions
ORDER BY module ASC, permission_key ASC`)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	out := []biz.AdminPermission{}
	for rows.Next() {
		var item biz.AdminPermission
		if err := rows.Scan(&item.ID, &item.Key, &item.Name, &item.Description, &item.Module, &item.Action, &item.Resource, &item.Builtin); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *adminManageRepo) GetRoleByKey(ctx context.Context, roleKey string) (*biz.AdminRole, error) {
	roleKey = biz.NormalizeRoleKey(roleKey)
	if roleKey == "" {
		return nil, biz.ErrBadParam
	}
	var item biz.AdminRole
	err := r.data.sqldb.QueryRowContext(ctx, `
SELECT id, role_key, name, description, builtin, disabled, sort_order
FROM roles WHERE role_key = $1 LIMIT 1`, roleKey).Scan(&item.ID, &item.Key, &item.Name, &item.Description, &item.Builtin, &item.Disabled, &item.SortOrder)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, biz.ErrRoleNotFound
		}
		return nil, err
	}
	item.Key = biz.NormalizeRoleKey(item.Key)
	item.Permissions, err = r.loadRolePermissionKeys(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *adminManageRepo) UpdateRolePermissions(ctx context.Context, roleKey string, permissionKeys []string) error {
	roleKey = biz.NormalizeRoleKey(roleKey)
	if roleKey == "" {
		return biz.ErrBadParam
	}
	permissionKeys = biz.NormalizePermissionKeys(permissionKeys)
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer rollbackSQLTx(ctx, tx, r.log)

	var roleID int
	if err := tx.QueryRowContext(ctx, "SELECT id FROM roles WHERE role_key = $1 LIMIT 1", roleKey).Scan(&roleID); err != nil {
		if err == sql.ErrNoRows {
			return biz.ErrRoleNotFound
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM role_permissions WHERE role_id = $1", roleID); err != nil {
		return err
	}
	for _, permissionKey := range permissionKeys {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT $1, id, $3 FROM permissions WHERE permission_key = $2
ON CONFLICT (role_id, permission_id) DO NOTHING`, roleID, permissionKey, time.Now()); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil
	return nil
}

func (r *adminManageRepo) UpdateAdminPhone(ctx context.Context, id int, phone string) error {
	if id <= 0 {
		return biz.ErrBadParam
	}
	update := r.data.postgres.AdminUser.UpdateOneID(id)
	if strings.TrimSpace(phone) == "" {
		update.ClearPhone()
	} else {
		update.SetPhone(phone)
	}
	if _, err := update.Save(ctx); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrAdminNotFound
		}
		if ent.IsConstraintError(err) {
			return biz.ErrAdminPhoneExists
		}
		return err
	}
	return nil
}

func (r *adminManageRepo) UpdateAdminERPColumnOrder(ctx context.Context, id int, moduleKey string, order []string) error {
	if id <= 0 || strings.TrimSpace(moduleKey) == "" {
		return biz.ErrBadParam
	}
	row, err := r.data.postgres.AdminUser.Query().Where(adminuser.ID(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrAdminNotFound
		}
		return err
	}
	preferences := decodeAdminERPPreferences(row.ErpPreferences)
	if preferences.ColumnOrders == nil {
		preferences.ColumnOrders = map[string][]string{}
	}
	normalizedOrder := biz.NormalizeAdminERPColumnOrder(order)
	if len(normalizedOrder) == 0 {
		delete(preferences.ColumnOrders, moduleKey)
	} else {
		preferences.ColumnOrders[moduleKey] = normalizedOrder
	}
	encoded := encodeAdminERPPreferences(preferences)
	if encoded == row.ErpPreferences {
		return nil
	}
	if _, err := r.data.postgres.AdminUser.UpdateOneID(id).SetErpPreferences(encoded).Save(ctx); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrAdminNotFound
		}
		return err
	}
	return nil
}

func (r *adminManageRepo) SetAdminDisabled(ctx context.Context, id int, disabled bool) error {
	if id <= 0 {
		return biz.ErrBadParam
	}
	if _, err := r.data.postgres.AdminUser.UpdateOneID(id).SetDisabled(disabled).Save(ctx); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrAdminNotFound
		}
		return err
	}
	return nil
}

func (r *adminManageRepo) UpdateAdminPasswordHash(ctx context.Context, id int, passwordHash string) error {
	if id <= 0 || strings.TrimSpace(passwordHash) == "" {
		return biz.ErrBadParam
	}
	if _, err := r.data.postgres.AdminUser.UpdateOneID(id).SetPasswordHash(passwordHash).Save(ctx); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrAdminNotFound
		}
		return err
	}
	return nil
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func stringPtrOrNil(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func decodeAdminERPPreferences(raw string) biz.AdminERPPreferences {
	if strings.TrimSpace(raw) == "" {
		return biz.AdminERPPreferences{}
	}
	var decoded struct {
		ColumnOrders map[string][]string `json:"column_orders"`
	}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return biz.AdminERPPreferences{}
	}
	return biz.NormalizeAdminERPPreferences(biz.AdminERPPreferences{
		ColumnOrders: decoded.ColumnOrders,
	})
}

func encodeAdminERPPreferences(preferences biz.AdminERPPreferences) string {
	normalized := biz.NormalizeAdminERPPreferences(preferences)
	if len(normalized.ColumnOrders) == 0 {
		return "{}"
	}
	payload := struct {
		ColumnOrders map[string][]string `json:"column_orders"`
	}{
		ColumnOrders: normalized.ColumnOrders,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}
