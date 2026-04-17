// server/internal/data/auth_repo.go
package data

import (
	"context"
	"errors"
	"time"

	"server/internal/biz"
	entadminuser "server/internal/data/model/ent/adminuser"
	entuser "server/internal/data/model/ent/user"

	"github.com/go-kratos/kratos/v2/log"
)

type authRepo struct {
	data *Data
	log  *log.Helper
}

func NewAuthRepo(data *Data, logger log.Logger) *authRepo {
	return &authRepo{
		data: data,
		log:  log.NewHelper(log.With(logger, "module", "data.auth_repo")),
	}
}

var _ biz.AuthRepo = (*authRepo)(nil)

// =======================
// user
// =======================

func (r *authRepo) GetUserByUsername(ctx context.Context, username string) (*biz.User, error) {
	l := r.log.WithContext(ctx)

	if username == "" {
		l.Warn("GetUserByUsername: empty username")
		return nil, errors.New("username is required")
	}

	u, err := r.data.postgres.User.
		Query().
		Where(entuser.Username(username)).
		Only(ctx)
	if err != nil {
		l.Infof("GetUserByUsername not found username=%s err=%v", username, err)
		return nil, err
	}

	var lastLoginAt *time.Time
	if u.LastLoginAt != nil {
		t := *u.LastLoginAt
		lastLoginAt = &t
	}

	return &biz.User{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		Disabled:     u.Disabled,
		Role:         int8(biz.RoleUser),
		LastLoginAt:  lastLoginAt,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}, nil
}

func (r *authRepo) GetUserByID(ctx context.Context, id int) (*biz.User, error) {
	l := r.log.WithContext(ctx)
	if id <= 0 {
		l.Warn("GetUserByID: invalid id")
		return nil, errors.New("user id is required")
	}

	u, err := r.data.postgres.User.
		Query().
		Where(entuser.ID(id)).
		Only(ctx)
	if err != nil {
		l.Infof("GetUserByID not found id=%d err=%v", id, err)
		return nil, err
	}

	var lastLoginAt *time.Time
	if u.LastLoginAt != nil {
		t := *u.LastLoginAt
		lastLoginAt = &t
	}

	return &biz.User{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		Disabled:     u.Disabled,
		Role:         int8(biz.RoleUser),
		LastLoginAt:  lastLoginAt,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}, nil
}

func (r *authRepo) CreateUser(ctx context.Context, in *biz.User) (*biz.User, error) {
	l := r.log.WithContext(ctx)

	l.Infof("CreateUser start username=%s", in.Username)

	// 关键兜底：账号名在 users/admin_users 间必须全局唯一，避免用户与管理员同名。
	if exists, err := r.isUsernameUsedByAdmin(ctx, in.Username); err != nil {
		l.Errorf("CreateUser check admin username failed username=%s err=%v", in.Username, err)
		return nil, err
	} else if exists {
		l.Warnf("CreateUser username conflicts with admin username=%s", in.Username)
		return nil, biz.ErrUserExists
	}

	m := r.data.postgres.User.
		Create().
		SetUsername(in.Username).
		SetPasswordHash(in.PasswordHash)

	u, err := m.Save(ctx)
	if err != nil {
		if isDuplicateUsernameConstraint(err) {
			l.Warnf("CreateUser duplicate username username=%s err=%v", in.Username, err)
			return nil, biz.ErrUserExists
		}
		l.Errorf("CreateUser failed err=%v", err)
		return nil, err
	}

	return &biz.User{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		Disabled:     u.Disabled,
		Role:         int8(biz.RoleUser),
		LastLoginAt:  u.LastLoginAt,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}, nil
}

func (r *authRepo) UpdateUserLastLogin(ctx context.Context, id int, t time.Time) error {
	l := r.log.WithContext(ctx)

	_, err := r.data.postgres.User.
		UpdateOneID(id).
		SetLastLoginAt(t).
		SetUpdatedAt(time.Now()).
		Save(ctx)

	if err != nil {
		l.Errorf("UpdateUserLastLogin failed user_id=%d err=%v", id, err)
	}

	return err
}

func (r *authRepo) isUsernameUsedByAdmin(ctx context.Context, username string) (bool, error) {
	if username == "" {
		return false, nil
	}
	return r.data.postgres.AdminUser.
		Query().
		Where(entadminuser.Username(username)).
		Exist(ctx)
}
