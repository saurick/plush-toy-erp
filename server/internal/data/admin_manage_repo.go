package data

import (
	"context"
	"encoding/json"
	"strings"

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
	return &biz.AdminUser{
		ID:                    a.ID,
		Username:              a.Username,
		Phone:                 stringValue(a.Phone),
		PasswordHash:          a.PasswordHash,
		Level:                 a.Level,
		MenuPermissions:       decodeMenuPermissions(a.MenuPermissions),
		MobileRolePermissions: decodeMobileRolePermissions(a.MobileRolePermissions),
		ERPPreferences:        decodeAdminERPPreferences(a.ErpPreferences),
		Disabled:              a.Disabled,
		LastLoginAt:           a.LastLoginAt,
		CreatedAt:             a.CreatedAt,
		UpdatedAt:             a.UpdatedAt,
	}
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
		SetLevel(int8(in.Level)).
		SetMenuPermissions(encodeMenuPermissions(in.MenuPermissions)).
		SetMobileRolePermissions(encodeMobileRolePermissions(in.MobileRolePermissions)).
		SetDisabled(false).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrAdminExists
		}
		return nil, err
	}
	return r.toBizAdmin(row), nil
}

func (r *adminManageRepo) UpdateAdminPermissions(ctx context.Context, id int, menuPermissions []string, mobileRolePermissions []string) error {
	if id <= 0 {
		return biz.ErrBadParam
	}
	if _, err := r.data.postgres.AdminUser.UpdateOneID(id).
		SetMenuPermissions(encodeMenuPermissions(menuPermissions)).
		SetMobileRolePermissions(encodeMobileRolePermissions(mobileRolePermissions)).
		Save(ctx); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrAdminNotFound
		}
		return err
	}
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

func encodeMenuPermissions(menuPermissions []string) string {
	return strings.Join(biz.NormalizeAdminMenuPermissions(menuPermissions), ",")
}

func decodeMenuPermissions(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	return biz.NormalizeAdminMenuPermissions(strings.Split(raw, ","))
}

func encodeMobileRolePermissions(mobileRolePermissions []string) string {
	return strings.Join(biz.NormalizeAdminMobileRolePermissions(mobileRolePermissions), ",")
}

func decodeMobileRolePermissions(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	return biz.NormalizeAdminMobileRolePermissions(strings.Split(raw, ","))
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
