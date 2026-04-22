package data

import (
	"context"
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
		ID:              a.ID,
		Username:        a.Username,
		PasswordHash:    a.PasswordHash,
		Level:           a.Level,
		MenuPermissions: decodeMenuPermissions(a.MenuPermissions),
		Disabled:        a.Disabled,
		LastLoginAt:     a.LastLoginAt,
		CreatedAt:       a.CreatedAt,
		UpdatedAt:       a.UpdatedAt,
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
		SetPasswordHash(in.PasswordHash).
		SetLevel(int8(in.Level)).
		SetMenuPermissions(encodeMenuPermissions(in.MenuPermissions)).
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

func (r *adminManageRepo) UpdateAdminMenuPermissions(ctx context.Context, id int, menuPermissions []string) error {
	if id <= 0 {
		return biz.ErrBadParam
	}
	if _, err := r.data.postgres.AdminUser.UpdateOneID(id).
		SetMenuPermissions(encodeMenuPermissions(menuPermissions)).
		Save(ctx); err != nil {
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

func encodeMenuPermissions(menuPermissions []string) string {
	return strings.Join(biz.NormalizeAdminMenuPermissions(menuPermissions), ",")
}

func decodeMenuPermissions(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	return biz.NormalizeAdminMenuPermissions(strings.Split(raw, ","))
}
