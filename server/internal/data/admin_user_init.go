// server/internal/data/admin_user_init.go
package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"server/internal/conf"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/crypto/bcrypt"
)

const (
	adminBootstrapMarkerKey       = "admin_bootstrap.completed"
	adminBootstrapAuditSource     = "server_bootstrap"
	adminBootstrapEventCompleted  = "admin_bootstrap.completed"
	adminBootstrapEventBlocked    = "admin_bootstrap.blocked"
	adminBootstrapReasonNoFlag    = "missing_bootstrap_admin_once"
	adminBootstrapReasonCompleted = "bootstrap_already_completed"
	adminBootstrapReasonExists    = "admin_username_already_exists"
	adminBootstrapReasonMissing   = "missing_bootstrap_credentials"
)

type adminBootstrapOptions struct {
	production bool
	once       bool
}

type sqlExecer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func InitAdminUsersIfNeeded(ctx context.Context, d *Data, cfg *conf.Data, l *log.Helper) error {
	return initAdminUsersIfNeeded(ctx, d, cfg, l, adminBootstrapOptionsFromEnv(os.Getenv))
}

func initAdminUsersIfNeeded(ctx context.Context, d *Data, cfg *conf.Data, l *log.Helper, opts adminBootstrapOptions) error {
	if d == nil || d.sqldb == nil {
		return errors.New("InitAdminUsersIfNeeded: missing db")
	}

	if cfg == nil || cfg.Auth == nil || cfg.Auth.Admin == nil {
		return nil
	}

	username := cfg.Auth.Admin.Username
	password := cfg.Auth.Admin.Password

	if username == "" || password == "" {
		if opts.production && opts.once {
			if err := writeAdminBootstrapAudit(ctx, d.sqldb, adminBootstrapEventBlocked, adminBootstrapReasonMissing, username, nil, time.Now()); err != nil {
				return fmt.Errorf("admin bootstrap missing credentials and audit failed: %w", err)
			}
			return errors.New("production admin bootstrap requires APP_ADMIN_USERNAME and APP_ADMIN_PASSWORD when BOOTSTRAP_ADMIN_ONCE=true")
		}
		return nil
	}

	if opts.production && !opts.once {
		if err := writeAdminBootstrapAudit(ctx, d.sqldb, adminBootstrapEventBlocked, adminBootstrapReasonNoFlag, username, nil, time.Now()); err != nil {
			return fmt.Errorf("production admin bootstrap requires BOOTSTRAP_ADMIN_ONCE=true and audit failed: %w", err)
		}
		return errors.New("production admin bootstrap requires BOOTSTRAP_ADMIN_ONCE=true when APP_ADMIN_PASSWORD is set")
	}

	if opts.once {
		return bootstrapAdminOnce(ctx, d, username, password, l)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	now := time.Now()
	// 多副本并发启动时，管理员初始化必须保持幂等，避免“先查后插”在唯一键上互相踩踏。
	result, err := d.sqldb.ExecContext(
		ctx,
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
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

func bootstrapAdminOnce(ctx context.Context, d *Data, username, password string, l *log.Helper) error {
	tx, err := d.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer rollbackSQLTx(ctx, tx, l)

	var markerValue string
	err = tx.QueryRowContext(ctx, "SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1", adminBootstrapMarkerKey).Scan(&markerValue)
	if err == nil {
		if auditErr := writeAdminBootstrapAudit(ctx, d.sqldb, adminBootstrapEventBlocked, adminBootstrapReasonCompleted, username, map[string]any{"marker_value": markerValue}, time.Now()); auditErr != nil {
			return fmt.Errorf("admin bootstrap already completed and audit failed: %w", auditErr)
		}
		return errors.New("admin bootstrap already completed")
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	now := time.Now()
	result, err := tx.ExecContext(
		ctx,
		"INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at) VALUES ($1, $2, TRUE, FALSE, $3, $4) ON CONFLICT (username) DO NOTHING",
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
		return err
	}
	if affected == 0 {
		if auditErr := writeAdminBootstrapAudit(ctx, d.sqldb, adminBootstrapEventBlocked, adminBootstrapReasonExists, username, nil, time.Now()); auditErr != nil {
			return fmt.Errorf("admin bootstrap username already exists and audit failed: %w", auditErr)
		}
		return errors.New("admin bootstrap refused because username already exists")
	}

	markerPayload, err := runtimeAuditPayload(map[string]any{
		"username":     username,
		"completed_at": now.UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return err
	}
	markerResult, err := tx.ExecContext(
		ctx,
		"INSERT INTO runtime_markers (marker_key, marker_value, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (marker_key) DO NOTHING",
		adminBootstrapMarkerKey,
		markerPayload,
		now,
		now,
	)
	if err != nil {
		return err
	}
	markerAffected, err := markerResult.RowsAffected()
	if err != nil {
		return err
	}
	if markerAffected == 0 {
		return errors.New("admin bootstrap marker already exists")
	}

	if err := writeAdminBootstrapAudit(ctx, tx, adminBootstrapEventCompleted, "", username, map[string]any{"marker_key": adminBootstrapMarkerKey}, now); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	tx = nil

	if l != nil {
		l.Infof("admin bootstrap completed username=%s marker=%s", username, adminBootstrapMarkerKey)
	}
	return nil
}

func adminBootstrapOptionsFromEnv(getenv func(string) string) adminBootstrapOptions {
	if getenv == nil {
		getenv = os.Getenv
	}
	return adminBootstrapOptions{
		production: envIndicatesProduction(getenv),
		once:       adminBootstrapEnvBool(getenv("BOOTSTRAP_ADMIN_ONCE")),
	}
}

func envIndicatesProduction(getenv func(string) string) bool {
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV", "ERP_DEBUG_ENV"} {
		value := strings.ToLower(strings.TrimSpace(getenv(key)))
		if value == "prod" || value == "production" {
			return true
		}
	}
	return false
}

func adminBootstrapEnvBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func writeAdminBootstrapAudit(ctx context.Context, execer sqlExecer, eventType, reason, username string, details map[string]any, now time.Time) error {
	payload := map[string]any{
		"username": username,
	}
	if reason != "" {
		payload["reason"] = reason
	}
	for key, value := range details {
		payload[key] = value
	}
	payloadJSON, err := runtimeAuditPayload(payload)
	if err != nil {
		return err
	}
	if now.IsZero() {
		now = time.Now()
	}
	_, err = execer.ExecContext(
		ctx,
		"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
		eventType,
		adminBootstrapMarkerKey,
		adminBootstrapAuditSource,
		payloadJSON,
		now,
	)
	return err
}

func runtimeAuditPayload(payload map[string]any) (string, error) {
	if payload == nil {
		payload = map[string]any{}
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
