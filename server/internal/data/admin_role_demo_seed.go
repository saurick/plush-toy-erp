package data

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrRoleDemoPasswordRequired = errors.New("role demo admin password is required")
	ErrRoleDemoPasswordInvalid  = errors.New("role demo admin password must contain 8-20 characters")
	ErrStableAdminProtected     = errors.New("stable admin account is not managed by role demo or manual acceptance seeding")
)

const PublicRoleDemoPassword = "12345678"

type ManualAcceptancePasswordRotationAccount struct {
	Username        string `json:"username"`
	AuthVersion     int64  `json:"authVersion"`
	RevokedSessions int64  `json:"revokedSessions"`
	PhoneBound      bool   `json:"phoneBound"`
}

type ManualAcceptancePasswordRotationReceipt struct {
	OperationID      string                                         `json:"operationId,omitempty"`
	Target           string                                         `json:"target,omitempty"`
	DatasetVersion   string                                         `json:"datasetVersion,omitempty"`
	Release          string                                         `json:"release,omitempty"`
	MigrationVersion string                                         `json:"migrationVersion,omitempty"`
	CustomerRevision string                                         `json:"customerRevision,omitempty"`
	RotatedAt        time.Time                                      `json:"rotatedAt"`
	Accounts         []ManualAcceptancePasswordRotationAccount      `json:"accounts"`
	Unselected       *ManualAcceptanceUnselectedAccountReceipt      `json:"unselectedAccounts,omitempty"`
	RollbackPoint    *ManualAcceptancePasswordRotationRollbackPoint `json:"rollbackPoint,omitempty"`
	Replayed         bool                                           `json:"replayed"`
}

type ManualAcceptancePasswordRotationRollbackPoint struct {
	BackupAlias    string `json:"backupAlias"`
	BackupSHA256   string `json:"backupSha256"`
	BackupSize     int64  `json:"backupSizeBytes"`
	RestoreChecked bool   `json:"restoreChecked"`
}

type ManualAcceptanceUnselectedAccountReceipt struct {
	AccountCount        int    `json:"accountCount"`
	IdentityFingerprint string `json:"identityFingerprint"`
	Preserved           bool   `json:"preserved"`
}

type ManualAcceptancePasswordRotationOperation struct {
	MarkerKey                  string
	OperationID                string
	Target                     string
	DatasetVersion             string
	Release                    string
	MigrationVersion           string
	CustomerRevision           string
	PreserveUnselectedAccounts bool
	RollbackPoint              *ManualAcceptancePasswordRotationRollbackPoint
}

type manualAcceptanceUnselectedAccountIdentitySnapshot struct {
	accountCount        int
	identityFingerprint string
}

func RejectPublicRoleDemoPassword(password string) error {
	if strings.TrimSpace(password) == PublicRoleDemoPassword {
		return errors.New("the public role demo password is forbidden outside a registered local development database")
	}
	return nil
}

func validateManualAcceptanceRotationOperation(operation ManualAcceptancePasswordRotationOperation) error {
	values := []string{
		operation.MarkerKey, operation.OperationID, operation.Target, operation.DatasetVersion,
		operation.Release, operation.MigrationVersion, operation.CustomerRevision,
	}
	nonEmpty := 0
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			nonEmpty++
		}
	}
	if nonEmpty == 0 {
		if operation.PreserveUnselectedAccounts || operation.RollbackPoint != nil {
			return errors.New("rotation evidence requires a durable rotation operation identity")
		}
		return nil
	}
	if nonEmpty != len(values) || len(operation.MarkerKey) > 128 {
		return errors.New("manual acceptance password rotation operation identity is incomplete")
	}
	if operation.RollbackPoint != nil {
		point := operation.RollbackPoint
		if strings.TrimSpace(point.BackupAlias) == "" ||
			!validManualAcceptanceIdentityFingerprint(point.BackupSHA256) ||
			point.BackupSize <= 0 || !point.RestoreChecked {
			return errors.New("manual acceptance password rotation rollback point is incomplete")
		}
	} else if operation.Target == "customer-trial-133" || operation.Target == "customer-test-133" {
		return errors.New("registered 133 password rotation requires a durable rollback point")
	}
	return nil
}

func validateManualAcceptanceRotationScope(
	operation ManualAcceptancePasswordRotationOperation,
	adminUsernames []string,
	demoUsernames []string,
	demoPassword string,
	phoneUsername string,
	phone string,
) error {
	if operation.Target != "customer-test-133" {
		return nil
	}
	if len(adminUsernames) != 1 || strings.TrimSpace(adminUsernames[0]) != "admin" {
		return errors.New("customer-test-133 password rotation must select only the stable admin")
	}
	if len(demoUsernames) != 0 || strings.TrimSpace(demoPassword) != "" {
		return errors.New("customer-test-133 password rotation must preserve every non-admin credential")
	}
	if strings.TrimSpace(phoneUsername) != "" || strings.TrimSpace(phone) != "" {
		return errors.New("customer-test-133 password rotation must not change phone identities")
	}
	if !operation.PreserveUnselectedAccounts {
		return errors.New("customer-test-133 password rotation must prove unselected account preservation")
	}
	return nil
}

func manualAcceptanceRollbackPointMatches(
	expected *ManualAcceptancePasswordRotationRollbackPoint,
	actual *ManualAcceptancePasswordRotationRollbackPoint,
) bool {
	if expected == nil || actual == nil {
		return expected == nil && actual == nil
	}
	return expected.BackupAlias == actual.BackupAlias &&
		expected.BackupSHA256 == actual.BackupSHA256 &&
		expected.BackupSize == actual.BackupSize &&
		expected.RestoreChecked == actual.RestoreChecked
}

func validManualAcceptanceIdentityFingerprint(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	for _, character := range value {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return false
		}
	}
	return true
}

func readManualAcceptanceUnselectedAccountIdentitySnapshot(
	ctx context.Context,
	tx *sql.Tx,
	selected map[string]struct{},
) (manualAcceptanceUnselectedAccountIdentitySnapshot, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT id, username
FROM admin_users
ORDER BY username`)
	if err != nil {
		return manualAcceptanceUnselectedAccountIdentitySnapshot{}, err
	}
	defer func() { _ = rows.Close() }()
	hash := sha256.New()
	accountCount := 0
	for rows.Next() {
		var id int64
		var username string
		if err := rows.Scan(&id, &username); err != nil {
			return manualAcceptanceUnselectedAccountIdentitySnapshot{}, err
		}
		if _, exists := selected[username]; exists {
			continue
		}
		encoded, err := json.Marshal([]any{id, username})
		if err != nil {
			return manualAcceptanceUnselectedAccountIdentitySnapshot{}, err
		}
		_, _ = hash.Write(encoded)
		_, _ = hash.Write([]byte{'\n'})
		for index := range encoded {
			encoded[index] = 0
		}
		accountCount++
	}
	if err := rows.Err(); err != nil {
		return manualAcceptanceUnselectedAccountIdentitySnapshot{}, err
	}
	return manualAcceptanceUnselectedAccountIdentitySnapshot{
		accountCount:        accountCount,
		identityFingerprint: fmt.Sprintf("%x", hash.Sum(nil)),
	}, nil
}

func readManualAcceptanceRotationReceipt(
	ctx context.Context,
	tx *sql.Tx,
	operation ManualAcceptancePasswordRotationOperation,
	adminUsernames []string,
	demoUsernames []string,
	expectPhoneBound bool,
	expectUnselectedPreservation bool,
) (*ManualAcceptancePasswordRotationReceipt, error) {
	var raw string
	if err := tx.QueryRowContext(ctx,
		"SELECT marker_value FROM runtime_markers WHERE marker_key = $1 LIMIT 1",
		operation.MarkerKey,
	).Scan(&raw); err != nil {
		return nil, err
	}
	var receipt ManualAcceptancePasswordRotationReceipt
	if err := json.Unmarshal([]byte(raw), &receipt); err != nil {
		return nil, fmt.Errorf("parse manual acceptance password rotation marker: %w", err)
	}
	if receipt.OperationID != operation.OperationID ||
		receipt.Target != operation.Target ||
		receipt.DatasetVersion != operation.DatasetVersion ||
		receipt.Release != operation.Release ||
		receipt.MigrationVersion != operation.MigrationVersion ||
		receipt.CustomerRevision != operation.CustomerRevision ||
		receipt.RotatedAt.IsZero() ||
		!manualAcceptanceRollbackPointMatches(operation.RollbackPoint, receipt.RollbackPoint) {
		return nil, errors.New("manual acceptance password rotation marker identity mismatch")
	}
	expectedUsernames := append(append([]string(nil), adminUsernames...), demoUsernames...)
	if len(receipt.Accounts) != len(expectedUsernames) {
		return nil, errors.New("manual acceptance password rotation marker account count mismatch")
	}
	phoneBoundCount := 0
	for index, account := range receipt.Accounts {
		if account.Username != expectedUsernames[index] || account.AuthVersion <= 0 || account.RevokedSessions < 0 {
			return nil, errors.New("manual acceptance password rotation marker account receipt is invalid")
		}
		if account.PhoneBound {
			phoneBoundCount++
		}
	}
	if (expectPhoneBound && (phoneBoundCount != 1 || receipt.Accounts[0].Username != "admin" || !receipt.Accounts[0].PhoneBound)) ||
		(!expectPhoneBound && phoneBoundCount != 0) {
		return nil, errors.New("manual acceptance password rotation marker phone binding mismatch")
	}
	if expectUnselectedPreservation {
		if receipt.Unselected == nil ||
			receipt.Unselected.AccountCount < 0 ||
			!receipt.Unselected.Preserved ||
			!validManualAcceptanceIdentityFingerprint(receipt.Unselected.IdentityFingerprint) {
			return nil, errors.New("manual acceptance password rotation marker preservation receipt is invalid")
		}
	} else if receipt.Unselected != nil {
		return nil, errors.New("manual acceptance password rotation marker has unexpected preservation receipt")
	}
	receipt.Replayed = false
	return &receipt, nil
}

func mapAdminPhoneUniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "adminuser_phone" {
		return biz.ErrAdminPhoneExists
	}
	return err
}

type RoleDemoAdminAccountSpec struct {
	DisplayName string
	Username    string
	RoleKey     string
}

type RoleDemoAdminSeedOptions struct {
	Password      string
	ResetPassword bool
	IncludeDebug  bool
	Accounts      []RoleDemoAdminAccountSpec
}

type RoleDemoAdminSeededAccount struct {
	DisplayName   string
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
	_, err := RotateManualAcceptancePasswords(ctx, db, adminUsernames, adminPassword, demoUsernames, demoPassword)
	return err
}

func RotateManualAcceptancePasswords(
	ctx context.Context,
	db *sql.DB,
	adminUsernames []string,
	adminPassword string,
	demoUsernames []string,
	demoPassword string,
) (*ManualAcceptancePasswordRotationReceipt, error) {
	return RotateManualAcceptancePasswordsWithPhoneBinding(
		ctx, db, adminUsernames, adminPassword, demoUsernames, demoPassword, "", "",
	)
}

func RotateManualAcceptancePasswordsWithPhoneBinding(
	ctx context.Context,
	db *sql.DB,
	adminUsernames []string,
	adminPassword string,
	demoUsernames []string,
	demoPassword string,
	phoneUsername string,
	phone string,
) (*ManualAcceptancePasswordRotationReceipt, error) {
	return RotateManualAcceptancePasswordsWithOperation(
		ctx, db, adminUsernames, adminPassword, demoUsernames, demoPassword,
		phoneUsername, phone, ManualAcceptancePasswordRotationOperation{},
	)
}

func RotateManualAcceptancePasswordsWithOperation(
	ctx context.Context,
	db *sql.DB,
	adminUsernames []string,
	adminPassword string,
	demoUsernames []string,
	demoPassword string,
	phoneUsername string,
	phone string,
	operation ManualAcceptancePasswordRotationOperation,
) (*ManualAcceptancePasswordRotationReceipt, error) {
	if db == nil {
		return nil, errors.New("RotateManualAcceptancePasswords: missing db")
	}
	adminPassword = strings.TrimSpace(adminPassword)
	demoPassword = strings.TrimSpace(demoPassword)
	if len(adminUsernames) > 0 && adminPassword == "" {
		return nil, errors.New("manual acceptance admin password is required")
	}
	if len(demoUsernames) > 0 && demoPassword == "" {
		return nil, ErrRoleDemoPasswordRequired
	}
	if len(adminUsernames) > 0 && biz.ValidateAdminPassword(adminPassword) != nil {
		return nil, errors.New("manual acceptance admin password must contain 8-20 characters")
	}
	if len(demoUsernames) > 0 && biz.ValidateAdminPassword(demoPassword) != nil {
		return nil, ErrRoleDemoPasswordInvalid
	}
	if len(adminUsernames) > 0 && len(demoUsernames) > 0 && adminPassword == demoPassword {
		return nil, errors.New("manual acceptance admin and demo passwords must differ")
	}
	phoneUsername = strings.TrimSpace(phoneUsername)
	phone = strings.TrimSpace(phone)
	if err := validateManualAcceptanceRotationScope(
		operation,
		adminUsernames,
		demoUsernames,
		demoPassword,
		phoneUsername,
		phone,
	); err != nil {
		return nil, err
	}
	if (phoneUsername == "") != (phone == "") {
		return nil, errors.New("manual acceptance phone username and phone must be provided together")
	}
	if phone != "" {
		normalizedPhone, err := biz.NormalizeLoginPhone(phone)
		if err != nil {
			return nil, err
		}
		phone = normalizedPhone
	}
	if err := validateManualAcceptanceRotationOperation(operation); err != nil {
		return nil, err
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
				return nil, biz.ErrBadParam
			}
			if _, exists := seen[username]; exists {
				return nil, fmt.Errorf("duplicate manual acceptance account: %s", username)
			}
			seen[username] = struct{}{}
			group.usernames[usernameIndex] = username
		}
	}
	if phoneUsername != "" {
		if _, exists := seen[phoneUsername]; !exists {
			return nil, fmt.Errorf("manual acceptance phone account not selected for rotation: %s", phoneUsername)
		}
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var unselectedBefore manualAcceptanceUnselectedAccountIdentitySnapshot
	if operation.PreserveUnselectedAccounts {
		if _, err := tx.ExecContext(ctx, "LOCK TABLE admin_users IN SHARE ROW EXCLUSIVE MODE"); err != nil {
			return nil, err
		}
		unselectedBefore, err = readManualAcceptanceUnselectedAccountIdentitySnapshot(ctx, tx, seen)
		if err != nil {
			return nil, err
		}
	}
	if operation.MarkerKey != "" {
		replayed, err := readManualAcceptanceRotationReceipt(
			ctx,
			tx,
			operation,
			adminUsernames,
			demoUsernames,
			phoneUsername != "",
			operation.PreserveUnselectedAccounts,
		)
		if err == nil {
			if operation.PreserveUnselectedAccounts &&
				(replayed.Unselected.AccountCount != unselectedBefore.accountCount ||
					replayed.Unselected.IdentityFingerprint != unselectedBefore.identityFingerprint) {
				return nil, errors.New("manual acceptance unselected account identity set changed after the durable rotation receipt")
			}
			if commitErr := tx.Commit(); commitErr != nil {
				return nil, commitErr
			}
			replayed.Replayed = true
			return replayed, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	for groupIndex := range groups {
		group := &groups[groupIndex]
		if len(group.usernames) == 0 {
			continue
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(group.password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		group.passwordHash = string(hash)
		group.password = ""
	}
	now := time.Now().UTC()
	receipt := &ManualAcceptancePasswordRotationReceipt{
		OperationID: operation.OperationID, Target: operation.Target,
		DatasetVersion: operation.DatasetVersion, Release: operation.Release,
		MigrationVersion: operation.MigrationVersion, CustomerRevision: operation.CustomerRevision,
		RotatedAt: now, Accounts: make([]ManualAcceptancePasswordRotationAccount, 0, len(adminUsernames)+len(demoUsernames)),
	}
	if operation.RollbackPoint != nil {
		point := *operation.RollbackPoint
		receipt.RollbackPoint = &point
	}
	phoneAlreadyBound := false
	if phone != "" {
		var existingID int
		var existingUsername string
		err := tx.QueryRowContext(ctx, "SELECT id, username FROM admin_users WHERE phone = $1 FOR UPDATE", phone).
			Scan(&existingID, &existingUsername)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if err == nil && existingUsername != phoneUsername {
			return nil, biz.ErrAdminPhoneExists
		}
		phoneAlreadyBound = err == nil && existingUsername == phoneUsername
	}
	for _, group := range groups {
		if len(group.usernames) == 0 {
			continue
		}
		for _, username := range group.usernames {
			var adminID int
			var authVersion int64
			phoneBound := phone != "" && username == phoneUsername
			query := `
UPDATE admin_users
SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`
			args := []any{username, group.passwordHash, now}
			if phoneBound {
				query = `
UPDATE admin_users
SET password_hash = $2, phone = $4, auth_version = auth_version + 1, updated_at = $3
WHERE username = $1
RETURNING id, auth_version`
				args = append(args, phone)
			}
			if err := tx.QueryRowContext(ctx, query, args...).Scan(&adminID, &authVersion); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil, fmt.Errorf("manual acceptance account not found: %s", username)
				}
				return nil, mapAdminPhoneUniqueViolation(err)
			}
			result, err := tx.ExecContext(ctx, `
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`, adminID, now, adminSessionRevokeReasonPasswordReset)
			if err != nil {
				return nil, err
			}
			revokedSessions, err := result.RowsAffected()
			if err != nil {
				return nil, err
			}
			payload, err := json.Marshal(map[string]any{
				"action": "admin_user.password.reset",
				"actor":  map[string]any{"id": 0, "username": "system:manual-acceptance-password-rotation"},
				"target": map[string]any{"type": "admin_user", "id": adminID, "key": username},
				"before": map[string]any{"password_reset": false},
				"after": map[string]any{
					"password_reset":        true,
					"auth_version":          authVersion,
					"revoked_session_count": revokedSessions,
					"session_revoke_reason": adminSessionRevokeReasonPasswordReset,
				},
			})
			if err != nil {
				return nil, err
			}
			if _, err := tx.ExecContext(ctx,
				"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
				"admin_control_plane", "admin_user.password.reset", "manual_acceptance_password_rotation", string(payload), now,
			); err != nil {
				return nil, err
			}
			if phoneBound && !phoneAlreadyBound {
				phonePayload, err := json.Marshal(map[string]any{
					"action": "admin_user.profile.set",
					"actor":  map[string]any{"id": 0, "username": "system:manual-acceptance-password-rotation"},
					"target": map[string]any{"type": "admin_user", "id": adminID, "key": username},
					"before": map[string]any{"phone_bound": false},
					"after":  map[string]any{"phone_bound": true},
				})
				if err != nil {
					return nil, err
				}
				if _, err := tx.ExecContext(ctx,
					"INSERT INTO runtime_audit_events (event_type, event_key, source, payload, created_at) VALUES ($1, $2, $3, $4, $5)",
					"admin_control_plane", "admin_user.profile.set", "manual_acceptance_password_rotation", string(phonePayload), now,
				); err != nil {
					return nil, err
				}
			}
			receipt.Accounts = append(receipt.Accounts, ManualAcceptancePasswordRotationAccount{
				Username: username, AuthVersion: authVersion, RevokedSessions: revokedSessions, PhoneBound: phoneBound,
			})
		}
	}
	if operation.PreserveUnselectedAccounts {
		unselectedAfter, err := readManualAcceptanceUnselectedAccountIdentitySnapshot(ctx, tx, seen)
		if err != nil {
			return nil, err
		}
		if unselectedBefore != unselectedAfter {
			return nil, errors.New("manual acceptance unselected account identity set changed during password rotation")
		}
		receipt.Unselected = &ManualAcceptanceUnselectedAccountReceipt{
			AccountCount:        unselectedAfter.accountCount,
			IdentityFingerprint: unselectedAfter.identityFingerprint,
			Preserved:           true,
		}
	}
	if operation.MarkerKey != "" {
		markerValue, err := json.Marshal(receipt)
		if err != nil {
			return nil, err
		}
		if len(markerValue) > 4096 {
			return nil, errors.New("manual acceptance password rotation receipt exceeds runtime marker capacity")
		}
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO runtime_markers (marker_key, marker_value, created_at, updated_at) VALUES ($1, $2, $3, $4)",
			operation.MarkerKey, string(markerValue), now, now,
		); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return receipt, nil
}

func DefaultRoleDemoAdminAccounts(includeDebug bool) []RoleDemoAdminAccountSpec {
	accounts := []RoleDemoAdminAccountSpec{
		{DisplayName: "演示老板", Username: "demo_boss", RoleKey: biz.BossRoleKey},
		{DisplayName: "演示业务员", Username: "demo_sales", RoleKey: biz.SalesRoleKey},
		{DisplayName: "演示采购员", Username: "demo_purchase", RoleKey: biz.PurchaseRoleKey},
		{DisplayName: "演示生产员", Username: "demo_production", RoleKey: biz.ProductionRoleKey},
		{DisplayName: "演示仓管员", Username: "demo_warehouse", RoleKey: biz.WarehouseRoleKey},
		{DisplayName: "演示质检员", Username: "demo_quality", RoleKey: biz.QualityRoleKey},
		{DisplayName: "演示财务员", Username: "demo_finance", RoleKey: biz.FinanceRoleKey},
		{DisplayName: "演示 PMC", Username: "demo_pmc", RoleKey: biz.PMCRoleKey},
		{DisplayName: "演示工程员", Username: "demo_engineering", RoleKey: biz.EngineeringRoleKey},
		{DisplayName: "演示系统管理员", Username: "demo_admin", RoleKey: biz.AdminRoleKey},
	}
	if includeDebug {
		accounts = append(accounts, RoleDemoAdminAccountSpec{
			DisplayName: "演示调试员",
			Username:    "demo_debug",
			RoleKey:     biz.DebugOperatorRoleKey,
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
	displayName, err := biz.NormalizeAdminDisplayName(account.DisplayName)
	if err != nil {
		return RoleDemoAdminSeededAccount{}, biz.ErrBadParam
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
INSERT INTO admin_users (display_name, username, password_hash, is_super_admin, disabled, created_at, updated_at)
VALUES ($1, $2, $3, FALSE, FALSE, $4, $5)
RETURNING id`, displayName, username, string(hash), now, now).Scan(&adminID); err != nil {
			return RoleDemoAdminSeededAccount{}, err
		}
	} else if resetPassword {
		if _, err := tx.ExecContext(ctx, `
UPDATE admin_users
SET password_hash = $2,
    display_name = $3,
    auth_version = auth_version + 1,
    is_super_admin = FALSE,
    disabled = FALSE,
    updated_at = $4
WHERE id = $1`, adminID, string(hash), displayName, now); err != nil {
			return RoleDemoAdminSeededAccount{}, err
		}
		if _, err := tx.ExecContext(ctx, `
UPDATE admin_sessions
SET revoked_at = $2, revoke_reason = $3, updated_at = $2
WHERE admin_user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2`, adminID, now, adminSessionRevokeReasonPasswordReset); err != nil {
			return RoleDemoAdminSeededAccount{}, err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `
UPDATE admin_users
SET display_name = $2, is_super_admin = FALSE, disabled = FALSE, updated_at = $3
WHERE id = $1`, adminID, displayName, now); err != nil {
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
		DisplayName:   displayName,
		Username:      username,
		RoleKey:       roleKey,
		Created:       created,
		PasswordReset: created || resetPassword,
	}, nil
}
