package data

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrRoleDemoPasswordRequired = errors.New("role demo admin password is required")
	ErrRoleDemoPasswordInvalid  = errors.New("role demo admin password must contain 8-20 characters")
	ErrStableAdminProtected     = errors.New("stable admin account is not managed by role demo or manual acceptance seeding")
)

type RoleDemoAdminAccountSpec struct {
	Username string
	RoleKey  string
}

type RoleDemoAdminSeedOptions struct {
	Password      string
	ResetPassword bool
	IncludeDebug  bool
	Accounts      []RoleDemoAdminAccountSpec
}

type RoleDemoAdminSeededAccount struct {
	Username      string
	RoleKey       string
	Created       bool
	PasswordReset bool
}

type RoleDemoAdminSeedResult struct {
	Accounts []RoleDemoAdminSeededAccount
}

func ResetRoleDemoAdminPasswords(ctx context.Context, db *sql.DB, usernames []string, password string) error {
	for _, username := range usernames {
		if strings.EqualFold(strings.TrimSpace(username), "admin") {
			return ErrStableAdminProtected
		}
	}
	return ResetManualAcceptancePasswords(ctx, db, nil, "", usernames, password)
}

func ResetManualAcceptancePasswords(
	ctx context.Context,
	db *sql.DB,
	adminUsernames []string,
	adminPassword string,
	demoUsernames []string,
	demoPassword string,
) error {
	if db == nil {
		return errors.New("ResetManualAcceptancePasswords: missing db")
	}
	adminPassword = strings.TrimSpace(adminPassword)
	demoPassword = strings.TrimSpace(demoPassword)
	if len(adminUsernames) > 0 && adminPassword == "" {
		return errors.New("manual acceptance admin password is required")
	}
	if len(demoUsernames) > 0 && demoPassword == "" {
		return ErrRoleDemoPasswordRequired
	}
	if len(adminUsernames) > 0 && biz.ValidateAdminPassword(adminPassword) != nil {
		return errors.New("manual acceptance admin password must contain 8-20 characters")
	}
	if len(demoUsernames) > 0 && biz.ValidateAdminPassword(demoPassword) != nil {
		return ErrRoleDemoPasswordInvalid
	}
	if len(adminUsernames) > 0 && len(demoUsernames) > 0 && adminPassword == demoPassword {
		return errors.New("manual acceptance admin and demo passwords must differ")
	}

	type passwordGroup struct {
		usernames    []string
		password     string
		passwordHash string
	}
	groups := []passwordGroup{
		{usernames: append([]string(nil), adminUsernames...), password: adminPassword},
		{usernames: append([]string(nil), demoUsernames...), password: demoPassword},
	}
	seen := make(map[string]struct{}, len(adminUsernames)+len(demoUsernames))
	for groupIndex := range groups {
		group := &groups[groupIndex]
		for usernameIndex, rawUsername := range group.usernames {
			username := strings.TrimSpace(rawUsername)
			if username == "" {
				return biz.ErrBadParam
			}
			if _, exists := seen[username]; exists {
				return fmt.Errorf("duplicate manual acceptance account: %s", username)
			}
			seen[username] = struct{}{}
			group.usernames[usernameIndex] = username
		}
		if len(group.usernames) == 0 {
			continue
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(group.password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		group.passwordHash = string(hash)
		group.password = ""
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now()
	for _, group := range groups {
		if len(group.usernames) == 0 {
			continue
		}
		for _, username := range group.usernames {
			var adminID int
			if err := tx.QueryRowContext(ctx, `
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id`, username, group.passwordHash, now).Scan(&adminID); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return fmt.Errorf("manual acceptance account not found: %s", username)
				}
				return err
			}
			if _, err := tx.ExecContext(ctx, `
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`, adminID, now, adminSessionRevokeReasonPasswordReset); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func DefaultRoleDemoAdminAccounts(includeDebug bool) []RoleDemoAdminAccountSpec {
	accounts := []RoleDemoAdminAccountSpec{
		{Username: "demo_boss", RoleKey: biz.BossRoleKey},
		{Username: "demo_sales", RoleKey: biz.SalesRoleKey},
		{Username: "demo_purchase", RoleKey: biz.PurchaseRoleKey},
		{Username: "demo_production", RoleKey: biz.ProductionRoleKey},
		{Username: "demo_warehouse", RoleKey: biz.WarehouseRoleKey},
		{Username: "demo_quality", RoleKey: biz.QualityRoleKey},
		{Username: "demo_finance", RoleKey: biz.FinanceRoleKey},
		{Username: "demo_pmc", RoleKey: biz.PMCRoleKey},
		{Username: "demo_engineering", RoleKey: biz.EngineeringRoleKey},
		{Username: "demo_admin", RoleKey: biz.AdminRoleKey},
	}
	if includeDebug {
		accounts = append(accounts, RoleDemoAdminAccountSpec{
			Username: "demo_debug",
			RoleKey:  biz.DebugOperatorRoleKey,
		})
	}
	return accounts
}

func SeedRoleDemoAdminAccounts(ctx context.Context, db *sql.DB, opts RoleDemoAdminSeedOptions) (*RoleDemoAdminSeedResult, error) {
	if db == nil {
		return nil, errors.New("SeedRoleDemoAdminAccounts: missing db")
	}
	password := strings.TrimSpace(opts.Password)
	if password == "" {
		return nil, ErrRoleDemoPasswordRequired
	}
	if biz.ValidateAdminPassword(password) != nil {
		return nil, ErrRoleDemoPasswordInvalid
	}
	accounts := opts.Accounts
	if len(accounts) == 0 {
		accounts = DefaultRoleDemoAdminAccounts(opts.IncludeDebug)
	}

	result := &RoleDemoAdminSeedResult{Accounts: make([]RoleDemoAdminSeededAccount, 0, len(accounts))}
	for _, account := range accounts {
		seeded, err := seedOneRoleDemoAdmin(ctx, db, account, password, opts.ResetPassword)
		if err != nil {
			return nil, err
		}
		result.Accounts = append(result.Accounts, seeded)
	}
	return result, nil
}

func seedOneRoleDemoAdmin(ctx context.Context, db *sql.DB, account RoleDemoAdminAccountSpec, password string, resetPassword bool) (RoleDemoAdminSeededAccount, error) {
	username := strings.TrimSpace(account.Username)
	roleKey := biz.NormalizeRoleKey(account.RoleKey)
	if username == "" || roleKey == "" {
		return RoleDemoAdminSeededAccount{}, biz.ErrBadParam
	}
	if strings.EqualFold(username, "admin") {
		return RoleDemoAdminSeededAccount{}, ErrStableAdminProtected
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return RoleDemoAdminSeededAccount{}, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return RoleDemoAdminSeededAccount{}, err
	}
	defer rollbackSQLTx(ctx, tx, nil)

	var roleID int
	if err := tx.QueryRowContext(ctx, "SELECT id FROM roles WHERE role_key = $1 AND disabled = FALSE LIMIT 1", roleKey).Scan(&roleID); err != nil {
		if err == sql.ErrNoRows {
			return RoleDemoAdminSeededAccount{}, fmt.Errorf("%w: %s", biz.ErrRoleNotFound, roleKey)
		}
		return RoleDemoAdminSeededAccount{}, err
	}

	now := time.Now()
	created := false
	var adminID int
	if err := tx.QueryRowContext(ctx, "SELECT id FROM admin_users WHERE username = $1 LIMIT 1", username).Scan(&adminID); err != nil {
		if err != sql.ErrNoRows {
			return RoleDemoAdminSeededAccount{}, err
		}
		created = true
		if err := tx.QueryRowContext(ctx, `
INSERT INTO admin_users (username, password_hash, is_super_admin, disabled, created_at, updated_at)
VALUES ($1, $2, FALSE, FALSE, $3, $4)
RETURNING id`, username, string(hash), now, now).Scan(&adminID); err != nil {
			return RoleDemoAdminSeededAccount{}, err
		}
	} else if resetPassword {
		if _, err := tx.ExecContext(ctx, `
UPDATE admin_users
SET password_hash = $2, is_super_admin = FALSE, disabled = FALSE, updated_at = $3
WHERE id = $1`, adminID, string(hash), now); err != nil {
			return RoleDemoAdminSeededAccount{}, err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `
UPDATE admin_users
SET is_super_admin = FALSE, disabled = FALSE, updated_at = $2
WHERE id = $1`, adminID, now); err != nil {
			return RoleDemoAdminSeededAccount{}, err
		}
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM admin_user_roles WHERE admin_user_id = $1", adminID); err != nil {
		return RoleDemoAdminSeededAccount{}, err
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO admin_user_roles (admin_user_id, role_id, created_at)
VALUES ($1, $2, $3)
ON CONFLICT (admin_user_id, role_id) DO NOTHING`, adminID, roleID, now); err != nil {
		return RoleDemoAdminSeededAccount{}, err
	}
	if err := tx.Commit(); err != nil {
		return RoleDemoAdminSeededAccount{}, err
	}
	tx = nil

	return RoleDemoAdminSeededAccount{
		Username:      username,
		RoleKey:       roleKey,
		Created:       created,
		PasswordReset: created || resetPassword,
	}, nil
}
