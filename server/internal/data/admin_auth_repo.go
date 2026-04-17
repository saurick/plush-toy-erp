// server/internal/data/admin_auth_repo.go
package data

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

type adminAuthRepo struct {
	data *Data
	log  *log.Helper
}

func NewAdminAuthRepo(data *Data, logger log.Logger) *adminAuthRepo {
	return &adminAuthRepo{
		data: data,
		log:  log.NewHelper(log.With(logger, "module", "data.admin_auth_repo")),
	}
}

var _ biz.AdminAuthRepo = (*adminAuthRepo)(nil)

func (r *adminAuthRepo) GetAdminByID(ctx context.Context, id int) (*biz.AdminUser, error) {
	l := r.log.WithContext(ctx)
	if id <= 0 {
		l.Warn("GetAdminByID: invalid id")
		return nil, errors.New("admin id is required")
	}

	var (
		adminID      int
		uname        string
		passwordHash string
		disabled     bool
	)

	err := r.data.sqldb.QueryRowContext(
		ctx,
		"SELECT id, username, password_hash, disabled FROM admin_users WHERE id = $1 LIMIT 1",
		id,
	).Scan(&adminID, &uname, &passwordHash, &disabled)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			l.Infof("GetAdminByID not found id=%d", id)
		} else {
			l.Errorf("GetAdminByID failed id=%d err=%v", id, err)
		}
		return nil, err
	}

	return &biz.AdminUser{
		ID:           adminID,
		Username:     uname,
		PasswordHash: passwordHash,
		Disabled:     disabled,
	}, nil
}

func (r *adminAuthRepo) GetAdminByUsername(ctx context.Context, username string) (*biz.AdminUser, error) {
	l := r.log.WithContext(ctx)
	if username == "" {
		l.Warn("GetAdminByUsername: empty username")
		return nil, errors.New("username is required")
	}

	var (
		id           int
		uname        string
		passwordHash string
		disabled     bool
	)

	err := r.data.sqldb.QueryRowContext(
		ctx,
		"SELECT id, username, password_hash, disabled FROM admin_users WHERE username = $1 LIMIT 1",
		username,
	).Scan(&id, &uname, &passwordHash, &disabled)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			l.Infof("GetAdminByUsername not found username=%s", username)
		} else {
			l.Errorf("GetAdminByUsername failed username=%s err=%v", username, err)
		}
		return nil, err
	}

	return &biz.AdminUser{
		ID:           id,
		Username:     uname,
		PasswordHash: passwordHash,
		Disabled:     disabled,
	}, nil
}

func (r *adminAuthRepo) UpdateAdminLastLogin(ctx context.Context, id int, t time.Time) error {
	if id <= 0 {
		return errors.New("admin id is required")
	}

	_, err := r.data.sqldb.ExecContext(
		ctx,
		"UPDATE admin_users SET last_login_at = $1, updated_at = $2 WHERE id = $3",
		t,
		time.Now(),
		id,
	)
	if err != nil {
		r.log.WithContext(ctx).Errorf("UpdateAdminLastLogin failed admin_id=%d err=%v", id, err)
	}
	return err
}
