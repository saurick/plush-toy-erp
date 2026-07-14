// server/internal/data/admin_auth_repo.go
package data

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"server/internal/biz"

	"entgo.io/ent/dialect"
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
		adminID         int
		uname           string
		phone           sql.NullString
		passwordHash    string
		isSuperAdmin    bool
		erpPreferences  string
		disabled        bool
		authVersion     int64
		revokedAt       *time.Time
		statusReason    sql.NullString
		statusChangedAt *time.Time
		statusChangedBy sql.NullInt64
		lastLoginAt     *time.Time
		createdAt       time.Time
		updatedAt       time.Time
	)

	err := r.data.sqldb.QueryRowContext(
		ctx,
		"SELECT id, username, phone, password_hash, is_super_admin, erp_preferences, disabled, auth_version, revoked_at, status_reason, status_changed_at, status_changed_by, last_login_at, created_at, updated_at FROM admin_users WHERE id = $1 LIMIT 1",
		id,
	).Scan(&adminID, &uname, &phone, &passwordHash, &isSuperAdmin, &erpPreferences, &disabled, &authVersion, &revokedAt, &statusReason, &statusChangedAt, &statusChangedBy, &lastLoginAt, &createdAt, &updatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			l.Infof("GetAdminByID not found id=%d", id)
			return nil, biz.ErrUserNotFound
		} else {
			l.Errorf("GetAdminByID failed id=%d err=%v", id, err)
		}
		return nil, err
	}

	admin := &biz.AdminUser{
		ID:              adminID,
		Username:        uname,
		Phone:           nullStringValue(phone),
		PasswordHash:    passwordHash,
		IsSuperAdmin:    isSuperAdmin,
		ERPPreferences:  decodeAdminERPPreferences(erpPreferences),
		Disabled:        disabled,
		AuthVersion:     authVersion,
		RevokedAt:       revokedAt,
		StatusReason:    nullStringValue(statusReason),
		StatusChangedAt: statusChangedAt,
		StatusChangedBy: nullIntPointer(statusChangedBy),
		LastLoginAt:     lastLoginAt,
		CreatedAt:       createdAt,
		UpdatedAt:       updatedAt,
	}
	if err := loadAdminRBAC(ctx, r.data.sqldb, admin); err != nil {
		return nil, err
	}
	return admin, nil
}

func (r *adminAuthRepo) GetAdminByUsername(ctx context.Context, username string) (*biz.AdminUser, error) {
	l := r.log.WithContext(ctx)
	if username == "" {
		l.Warn("GetAdminByUsername: empty username")
		return nil, errors.New("username is required")
	}

	var (
		id              int
		uname           string
		phone           sql.NullString
		passwordHash    string
		isSuperAdmin    bool
		erpPreferences  string
		disabled        bool
		authVersion     int64
		revokedAt       *time.Time
		statusReason    sql.NullString
		statusChangedAt *time.Time
		statusChangedBy sql.NullInt64
		lastLoginAt     *time.Time
		createdAt       time.Time
		updatedAt       time.Time
	)

	err := r.data.sqldb.QueryRowContext(
		ctx,
		"SELECT id, username, phone, password_hash, is_super_admin, erp_preferences, disabled, auth_version, revoked_at, status_reason, status_changed_at, status_changed_by, last_login_at, created_at, updated_at FROM admin_users WHERE username = $1 LIMIT 1",
		username,
	).Scan(&id, &uname, &phone, &passwordHash, &isSuperAdmin, &erpPreferences, &disabled, &authVersion, &revokedAt, &statusReason, &statusChangedAt, &statusChangedBy, &lastLoginAt, &createdAt, &updatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			l.Info("GetAdminByUsername not found")
			return nil, biz.ErrUserNotFound
		} else {
			l.Errorf("GetAdminByUsername failed err=%v", err)
		}
		return nil, err
	}

	admin := &biz.AdminUser{
		ID:              id,
		Username:        uname,
		Phone:           nullStringValue(phone),
		PasswordHash:    passwordHash,
		IsSuperAdmin:    isSuperAdmin,
		ERPPreferences:  decodeAdminERPPreferences(erpPreferences),
		Disabled:        disabled,
		AuthVersion:     authVersion,
		RevokedAt:       revokedAt,
		StatusReason:    nullStringValue(statusReason),
		StatusChangedAt: statusChangedAt,
		StatusChangedBy: nullIntPointer(statusChangedBy),
		LastLoginAt:     lastLoginAt,
		CreatedAt:       createdAt,
		UpdatedAt:       updatedAt,
	}
	return admin, nil
}

func (r *adminAuthRepo) GetAdminByPhone(ctx context.Context, phone string) (*biz.AdminUser, error) {
	l := r.log.WithContext(ctx)
	if phone == "" {
		l.Warn("GetAdminByPhone: empty phone")
		return nil, errors.New("phone is required")
	}

	var (
		id              int
		uname           string
		phoneValue      sql.NullString
		passwordHash    string
		isSuperAdmin    bool
		erpPreferences  string
		disabled        bool
		authVersion     int64
		revokedAt       *time.Time
		statusReason    sql.NullString
		statusChangedAt *time.Time
		statusChangedBy sql.NullInt64
		lastLoginAt     *time.Time
		createdAt       time.Time
		updatedAt       time.Time
	)

	err := r.data.sqldb.QueryRowContext(
		ctx,
		"SELECT id, username, phone, password_hash, is_super_admin, erp_preferences, disabled, auth_version, revoked_at, status_reason, status_changed_at, status_changed_by, last_login_at, created_at, updated_at FROM admin_users WHERE phone = $1 LIMIT 1",
		phone,
	).Scan(&id, &uname, &phoneValue, &passwordHash, &isSuperAdmin, &erpPreferences, &disabled, &authVersion, &revokedAt, &statusReason, &statusChangedAt, &statusChangedBy, &lastLoginAt, &createdAt, &updatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			l.Infof("GetAdminByPhone not found phone=%s", maskAdminAuthPhone(phone))
			return nil, biz.ErrPhoneNotBound
		} else {
			l.Errorf("GetAdminByPhone failed phone=%s err=%v", maskAdminAuthPhone(phone), err)
		}
		return nil, err
	}

	admin := &biz.AdminUser{
		ID:              id,
		Username:        uname,
		Phone:           nullStringValue(phoneValue),
		PasswordHash:    passwordHash,
		IsSuperAdmin:    isSuperAdmin,
		ERPPreferences:  decodeAdminERPPreferences(erpPreferences),
		Disabled:        disabled,
		AuthVersion:     authVersion,
		RevokedAt:       revokedAt,
		StatusReason:    nullStringValue(statusReason),
		StatusChangedAt: statusChangedAt,
		StatusChangedBy: nullIntPointer(statusChangedBy),
		LastLoginAt:     lastLoginAt,
		CreatedAt:       createdAt,
		UpdatedAt:       updatedAt,
	}
	if err := loadAdminRBAC(ctx, r.data.sqldb, admin); err != nil {
		return nil, err
	}
	return admin, nil
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

func (r *adminAuthRepo) CreateAdminSession(
	ctx context.Context,
	session *biz.AdminSession,
	constraint biz.AdminSessionIssueConstraint,
) error {
	if session == nil || strings.TrimSpace(session.SessionKey) == "" || session.AdminUserID <= 0 || session.AuthVersion <= 0 || session.ExpiresAt.IsZero() {
		return biz.ErrBadParam
	}
	expectedPhone := strings.TrimSpace(constraint.ExpectedPhone)
	requiredPermission := strings.TrimSpace(constraint.RequiredPermission)
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	accountQuery := `
SELECT is_super_admin
FROM admin_users
WHERE id = $1
  AND auth_version = $2
  AND disabled = FALSE
  AND revoked_at IS NULL`
	accountArgs := []any{session.AdminUserID, session.AuthVersion}
	if expectedPhone != "" {
		accountQuery += " AND phone = $3"
		accountArgs = append(accountArgs, expectedPhone)
	}
	if r.data.sqlDialect == dialect.Postgres {
		accountQuery += " FOR UPDATE"
	}
	var isSuperAdmin bool
	if err := tx.QueryRowContext(ctx, accountQuery, accountArgs...).Scan(&isSuperAdmin); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return biz.ErrAuthVersionStale
		}
		return err
	}

	if requiredPermission != "" && !isSuperAdmin {
		permissionQuery := `
SELECT r.id
FROM admin_user_roles aur
JOIN roles r ON r.id = aur.role_id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE aur.admin_user_id = $1
  AND r.disabled = FALSE
  AND p.permission_key = $2
LIMIT 1`
		if r.data.sqlDialect == dialect.Postgres {
			permissionQuery += " FOR SHARE OF r"
		}
		var roleID int
		if err := tx.QueryRowContext(ctx, permissionQuery, session.AdminUserID, requiredPermission).Scan(&roleID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return biz.ErrMobileRoleDenied
			}
			return err
		}
	}

	if _, err := tx.ExecContext(ctx, `
INSERT INTO admin_sessions (session_key, admin_user_id, auth_version, issued_at, expires_at, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $4, $4)`, session.SessionKey, session.AdminUserID, session.AuthVersion, session.IssuedAt, session.ExpiresAt); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *adminAuthRepo) GetAdminSession(ctx context.Context, sessionKey string) (*biz.AdminSession, error) {
	sessionKey = strings.TrimSpace(sessionKey)
	if sessionKey == "" {
		return nil, biz.ErrBadParam
	}
	var session biz.AdminSession
	var revokedAt sql.NullTime
	var revokeReason sql.NullString
	err := r.data.sqldb.QueryRowContext(ctx, `
SELECT session_key, admin_user_id, auth_version, issued_at, expires_at, revoked_at, revoke_reason
FROM admin_sessions WHERE session_key = $1 LIMIT 1`, sessionKey).Scan(
		&session.SessionKey, &session.AdminUserID, &session.AuthVersion, &session.IssuedAt,
		&session.ExpiresAt, &revokedAt, &revokeReason,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, biz.ErrSessionNotFound
		}
		return nil, err
	}
	if revokedAt.Valid {
		session.RevokedAt = &revokedAt.Time
	}
	session.RevokeReason = nullStringValue(revokeReason)
	return &session, nil
}

func (r *adminAuthRepo) RevokeAdminSession(ctx context.Context, sessionKey, reason string, revokedAt time.Time) error {
	sessionKey = strings.TrimSpace(sessionKey)
	if sessionKey == "" {
		return nil
	}
	if revokedAt.IsZero() {
		revokedAt = time.Now()
	}
	_, err := r.data.sqldb.ExecContext(ctx, `
UPDATE admin_sessions
SET revoked_at = COALESCE(revoked_at, $2), revoke_reason = COALESCE(revoke_reason, $3), updated_at = $2
WHERE session_key = $1`, sessionKey, revokedAt, strings.TrimSpace(reason))
	return err
}

func nullStringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func nullIntPointer(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	v := int(value.Int64)
	return &v
}

func maskAdminAuthPhone(phone string) string {
	if len(phone) < 7 {
		return "***"
	}
	return phone[:3] + "****" + phone[len(phone)-4:]
}
