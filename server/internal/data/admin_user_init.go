// server/internal/data/admin_user_init.go
package data

import (
	"context"
	"errors"
	"time"

	"server/internal/conf"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/crypto/bcrypt"
)

func InitAdminUsersIfNeeded(ctx context.Context, d *Data, cfg *conf.Data, l *log.Helper) error {
	if d == nil || d.sqldb == nil {
		return errors.New("InitAdminUsersIfNeeded: missing db")
	}

	if cfg == nil || cfg.Auth == nil || cfg.Auth.Admin == nil {
		return nil
	}

	username := cfg.Auth.Admin.Username
	password := cfg.Auth.Admin.Password

	if username == "" || password == "" {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	now := time.Now()
	// 多副本并发启动时，管理员初始化必须保持幂等，避免“先查后插”在唯一键上互相踩踏。
	result, err := d.sqldb.ExecContext(
		ctx,
		"INSERT INTO admin_users (username, password_hash, level, menu_permissions, disabled, created_at, updated_at) VALUES ($1, $2, 0, '', FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
		username,
		string(hash),
		now,
		now,
	)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		l.Warnf("admin_users init rows affected unavailable username=%s err=%v", username, err)
		l.Info("admin_users init completed without rows-affected detail")
		return nil
	}
	if affected == 0 {
		l.Infof("admin_users admin already exists, skip create username=%s", username)
		return nil
	}

	l.Info("create admin_users admin success")
	return nil
}
