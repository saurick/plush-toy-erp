package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminsession"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/adminuserrole"
	"server/internal/data/model/ent/permission"
	"server/internal/data/model/ent/role"
	"server/internal/data/model/ent/roledatascope"
	"server/internal/data/model/ent/rolepermission"
	"server/internal/data/model/ent/runtimeauditevent"
	"server/internal/data/model/ent/warehouse"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
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
var _ biz.RoleDataScopeRepo = (*adminManageRepo)(nil)

const (
	defaultRuntimeAuditListLimit = 50
	maxRuntimeAuditListLimit     = 200

	adminSessionRevokeReasonAccountDisabled = "account_disabled"
	adminSessionRevokeReasonAccountEnabled  = "account_enabled"
	adminSessionRevokeReasonAccountRevoked  = "account_revoked"
	adminSessionRevokeReasonPasswordReset   = "password_reset"
)

func (r *adminManageRepo) toBizAdmin(ctx context.Context, a *ent.AdminUser) (*biz.AdminUser, error) {
	if a == nil {
		return nil, nil
	}
	admin := mapEntAdminUser(a)
	if err := loadAdminRBAC(ctx, r.data.sqldb, admin); err != nil {
		return nil, err
	}
	return admin, nil
}

func mapEntAdminUser(a *ent.AdminUser) *biz.AdminUser {
	if a == nil {
		return nil
	}
	return &biz.AdminUser{
		ID:              a.ID,
		Username:        a.Username,
		Phone:           stringValue(a.Phone),
		PasswordHash:    a.PasswordHash,
		IsSuperAdmin:    a.IsSuperAdmin,
		ERPPreferences:  decodeAdminERPPreferences(a.ErpPreferences),
		Disabled:        a.Disabled,
		AuthVersion:     a.AuthVersion,
		RevokedAt:       a.RevokedAt,
		StatusReason:    stringValue(a.StatusReason),
		StatusChangedAt: a.StatusChangedAt,
		StatusChangedBy: a.StatusChangedBy,
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
	return r.toBizAdmin(ctx, row)
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
	return r.toBizAdmin(ctx, row)
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
	return r.toBizAdmin(ctx, row)
}

func (r *adminManageRepo) ListAdmins(ctx context.Context) ([]*biz.AdminUser, error) {
	rows, err := r.data.postgres.AdminUser.Query().Order(ent.Desc(adminuser.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.AdminUser, 0, len(rows))
	for _, row := range rows {
		admin, mapErr := r.toBizAdmin(ctx, row)
		if mapErr != nil {
			return nil, mapErr
		}
		out = append(out, admin)
	}
	return out, nil
}

func (r *adminManageRepo) CreateAdminWithAudit(ctx context.Context, command *biz.AdminCreateCommand) (*biz.AdminUser, error) {
	if command == nil || command.Admin == nil || command.OperatorID <= 0 {
		return nil, biz.ErrBadParam
	}
	in := command.Admin
	username := strings.TrimSpace(in.Username)
	phone := strings.TrimSpace(in.Phone)
	if username == "" || strings.TrimSpace(in.PasswordHash) == "" {
		return nil, biz.ErrBadParam
	}
	roleKeys := biz.NormalizeAdminRoleKeys(in.RoleKeys)

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, err := r.loadOperatorForUpdate(ctx, tx, command.OperatorID)
	if err != nil {
		return nil, err
	}
	if err := r.ensureAdminIdentityAvailableInTx(ctx, tx, username, phone); err != nil {
		return nil, err
	}
	roleIDs, err := r.resolveActiveRoleIDsInTx(ctx, tx, roleKeys, operator.IsSuperAdmin)
	if err != nil {
		return nil, err
	}

	row, err := tx.AdminUser.Create().
		SetUsername(username).
		SetNillablePhone(stringPtrOrNil(phone)).
		SetPasswordHash(in.PasswordHash).
		SetIsSuperAdmin(false).
		SetDisabled(false).
		Save(ctx)
	if err != nil {
		return nil, mapAdminIdentityConstraintError(err, phone)
	}
	if err := setAdminRoleIDsInTx(ctx, tx, row.ID, roleIDs); err != nil {
		return nil, err
	}
	after, err := r.loadAdminSnapshotInTx(ctx, tx, row.ID)
	if err != nil {
		return nil, err
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		"admin_user.create",
		"admin_user",
		after.ID,
		after.Username,
		nil,
		biz.AdminAuditUserSnapshot(after),
	)
	if err != nil {
		return nil, err
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return after, nil
}

func (r *adminManageRepo) SetAdminRolesWithAudit(ctx context.Context, change *biz.AdminRolesChange) (*biz.AdminUser, error) {
	if change == nil || change.AdminID <= 0 || change.OperatorID <= 0 {
		return nil, biz.ErrBadParam
	}
	roleKeys := biz.NormalizeAdminRoleKeys(change.RoleKeys)

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, before, err := r.loadAdminPairForUpdate(ctx, tx, change.OperatorID, change.AdminID)
	if err != nil {
		return nil, err
	}
	if operator.ID == before.ID {
		return nil, biz.ErrAdminSelfRoleChangeForbidden
	}
	if before.IsSuperAdmin {
		return nil, biz.ErrNoPermission
	}
	if err := biz.ValidateAdminControlTarget(operator, before); err != nil {
		return nil, err
	}
	if before.AccountStatus() == biz.AdminAccountStatusRevoked {
		return nil, biz.ErrAdminRevoked
	}
	roleIDs, err := r.resolveActiveRoleIDsInTx(ctx, tx, roleKeys, operator.IsSuperAdmin)
	if err != nil {
		return nil, err
	}
	if err := setAdminRoleIDsInTx(ctx, tx, before.ID, roleIDs); err != nil {
		return nil, err
	}
	after, err := r.loadAdminSnapshotInTx(ctx, tx, before.ID)
	if err != nil {
		return nil, err
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		"admin_user.roles.set",
		"admin_user",
		after.ID,
		after.Username,
		biz.AdminAuditUserSnapshot(before),
		biz.AdminAuditUserSnapshot(after),
	)
	if err != nil {
		return nil, err
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return after, nil
}

func (r *adminManageRepo) ListRoles(ctx context.Context) ([]biz.AdminRole, error) {
	rows, err := r.data.sqldb.QueryContext(ctx, `
SELECT id, role_key, name, description, builtin, role_type, disabled, sort_order, version
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
		if err := rows.Scan(&item.ID, &item.Key, &item.Name, &item.Description, &item.Builtin, &item.Type, &item.Disabled, &item.SortOrder, &item.Version); err != nil {
			return nil, err
		}
		item.Key = biz.NormalizeRoleKey(item.Key)
		item.Type = biz.NormalizeRoleType(item.Type, item.Key, item.Builtin)
		item.Permissions, err = r.loadRolePermissionKeys(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		item.DataScopes, err = r.loadRoleDataScopes(ctx, item.ID)
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

func (r *adminManageRepo) loadRoleDataScopes(ctx context.Context, roleID int) ([]biz.RoleDataScope, error) {
	rows, err := r.data.postgres.RoleDataScope.Query().
		Where(roledatascope.RoleID(roleID)).
		Order(roledatascope.ByResourceType()).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]biz.RoleDataScope, 0, len(rows))
	for _, row := range rows {
		normalized, normalizeErr := biz.NormalizeRoleDataScope(biz.RoleDataScope{
			ResourceType: row.ResourceType,
			Mode:         row.Mode,
			ResourceIDs:  row.ResourceIds,
		})
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		out = append(out, normalized)
	}
	return out, nil
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

	allowed := biz.PermissionKeySet(biz.AllPermissionKeys())
	out := []biz.AdminPermission{}
	for rows.Next() {
		var item biz.AdminPermission
		if err := rows.Scan(&item.ID, &item.Key, &item.Name, &item.Description, &item.Module, &item.Action, &item.Resource, &item.Builtin); err != nil {
			return nil, err
		}
		item.Key = strings.TrimSpace(item.Key)
		if _, ok := allowed[item.Key]; !ok {
			continue
		}
		if definition, ok := biz.PermissionDefinitionByKey(item.Key); ok {
			item.Class = definition.Class
			item.Assignable = definition.Assignable
			item.NonProductionOnly = definition.NonProductionOnly
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
SELECT id, role_key, name, description, builtin, role_type, disabled, sort_order, version
FROM roles WHERE role_key = $1 LIMIT 1`, roleKey).Scan(&item.ID, &item.Key, &item.Name, &item.Description, &item.Builtin, &item.Type, &item.Disabled, &item.SortOrder, &item.Version)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, biz.ErrRoleNotFound
		}
		return nil, err
	}
	item.Key = biz.NormalizeRoleKey(item.Key)
	item.Type = biz.NormalizeRoleType(item.Type, item.Key, item.Builtin)
	item.Permissions, err = r.loadRolePermissionKeys(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	item.DataScopes, err = r.loadRoleDataScopes(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *adminManageRepo) ListRoleDataScopesByRoleKeys(ctx context.Context, roleKeys []string) ([]biz.RoleDataScope, error) {
	roleKeys = biz.NormalizeAdminRoleKeys(roleKeys)
	if len(roleKeys) == 0 {
		return []biz.RoleDataScope{}, nil
	}
	rows, err := r.data.postgres.RoleDataScope.Query().
		Where(roledatascope.HasRoleWith(role.RoleKeyIn(roleKeys...), role.Disabled(false))).
		Order(roledatascope.ByRoleID(), roledatascope.ByResourceType()).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]biz.RoleDataScope, 0, len(rows))
	for _, row := range rows {
		normalized, normalizeErr := biz.NormalizeRoleDataScope(biz.RoleDataScope{
			ResourceType: row.ResourceType,
			Mode:         row.Mode,
			ResourceIDs:  row.ResourceIds,
		})
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		out = append(out, normalized)
	}
	return out, nil
}

func (r *adminManageRepo) SetRoleDataScopesWithAudit(ctx context.Context, change *biz.RoleDataScopesChangeCommand) (*biz.AdminRole, error) {
	if change == nil || change.OperatorID <= 0 || change.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	roleKey := biz.NormalizeRoleKey(change.RoleKey)
	scopes, err := biz.NormalizeRoleDataScopes(change.Scopes)
	if roleKey == "" || err != nil {
		return nil, biz.ErrBadParam
	}

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, err := r.loadOperatorForUpdate(ctx, tx, change.OperatorID)
	if err != nil {
		return nil, err
	}
	if !operator.IsSuperAdmin && biz.AdminHasRole(operator, roleKey) {
		return nil, biz.ErrAdminSelfRolePermissionForbidden
	}
	roleRow, err := r.loadRoleForUpdate(ctx, tx, roleKey)
	if err != nil {
		return nil, err
	}
	if roleRow.Disabled {
		return nil, biz.ErrRoleNotFound
	}
	if biz.IsSystemManagedRole(mapEntAdminRole(roleRow)) {
		return nil, biz.ErrSystemRoleImmutable
	}
	if roleRow.Version != change.ExpectedVersion {
		return nil, biz.ErrRoleVersionConflict
	}
	before, err := r.loadRoleSnapshotFromRowInTx(ctx, tx, roleRow)
	if err != nil {
		return nil, err
	}
	if err := validateWarehouseDataScopeResourcesInTx(ctx, tx, scopes[0]); err != nil {
		return nil, err
	}

	affected, err := tx.Role.Update().Where(
		role.ID(roleRow.ID),
		role.Version(change.ExpectedVersion),
		role.Disabled(false),
	).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, biz.ErrRoleVersionConflict
	}
	if _, err := tx.RoleDataScope.Delete().Where(
		roledatascope.RoleID(roleRow.ID),
		roledatascope.ResourceType(scopes[0].ResourceType),
	).Exec(ctx); err != nil {
		return nil, err
	}
	if _, err := tx.RoleDataScope.Create().
		SetRoleID(roleRow.ID).
		SetResourceType(scopes[0].ResourceType).
		SetMode(scopes[0].Mode).
		SetResourceIds(scopes[0].ResourceIDs).
		Save(ctx); err != nil {
		return nil, err
	}
	after, err := r.loadRoleSnapshotInTx(ctx, tx, roleRow.ID)
	if err != nil {
		return nil, err
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		"role.data_scopes.set",
		"role",
		after.ID,
		after.Key,
		biz.AdminAuditRoleSnapshot(before),
		biz.AdminAuditRoleSnapshot(after),
	)
	if err != nil {
		return nil, err
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return after, nil
}

func validateWarehouseDataScopeResourcesInTx(ctx context.Context, tx *ent.Tx, scope biz.RoleDataScope) error {
	if scope.Mode != biz.DataScopeModeAssigned {
		return nil
	}
	count, err := tx.Warehouse.Query().Where(warehouse.IDIn(scope.ResourceIDs...)).Count(ctx)
	if err != nil {
		return err
	}
	if count != len(scope.ResourceIDs) {
		return biz.ErrRoleDataScopeResourceNotFound
	}
	return nil
}

func (r *adminManageRepo) SetRolePermissionsWithAudit(ctx context.Context, change *biz.RolePermissionsChange) (*biz.AdminRole, error) {
	if change == nil || change.OperatorID <= 0 || change.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	roleKey := biz.NormalizeRoleKey(change.RoleKey)
	if roleKey == "" {
		return nil, biz.ErrBadParam
	}
	permissionKeys, err := biz.NormalizePermissionKeysStrict(change.PermissionKeys)
	if err != nil {
		return nil, err
	}
	if err := biz.ValidateAssignablePermissionKeys(permissionKeys); err != nil {
		return nil, err
	}

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, err := r.loadOperatorForUpdate(ctx, tx, change.OperatorID)
	if err != nil {
		return nil, err
	}
	if !operator.IsSuperAdmin && biz.AdminHasRole(operator, roleKey) {
		return nil, biz.ErrAdminSelfRolePermissionForbidden
	}
	roleRow, err := r.loadRoleForUpdate(ctx, tx, roleKey)
	if err != nil {
		return nil, err
	}
	if roleRow.Disabled {
		return nil, biz.ErrRoleNotFound
	}
	if biz.IsSystemManagedRole(mapEntAdminRole(roleRow)) {
		return nil, biz.ErrSystemRoleImmutable
	}
	if roleRow.Version != change.ExpectedVersion {
		return nil, biz.ErrRoleVersionConflict
	}
	before, err := r.loadRoleSnapshotFromRowInTx(ctx, tx, roleRow)
	if err != nil {
		return nil, err
	}
	permissionIDs, err := resolvePermissionIDsInTx(ctx, tx, permissionKeys)
	if err != nil {
		return nil, err
	}

	affected, err := tx.Role.Update().Where(
		role.ID(roleRow.ID),
		role.Version(change.ExpectedVersion),
		role.Disabled(false),
	).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, biz.ErrRoleVersionConflict
	}
	if _, err := tx.RolePermission.Delete().Where(rolepermission.RoleID(roleRow.ID)).Exec(ctx); err != nil {
		return nil, err
	}
	for _, permissionID := range permissionIDs {
		if _, err := tx.RolePermission.Create().
			SetRoleID(roleRow.ID).
			SetPermissionID(permissionID).
			Save(ctx); err != nil {
			return nil, err
		}
	}
	after, err := r.loadRoleSnapshotInTx(ctx, tx, roleRow.ID)
	if err != nil {
		return nil, err
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		"role.permissions.set",
		"role",
		after.ID,
		after.Key,
		biz.AdminAuditRoleSnapshot(before),
		biz.AdminAuditRoleSnapshot(after),
	)
	if err != nil {
		return nil, err
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return after, nil
}

func (r *adminManageRepo) SetAdminPhoneWithAudit(ctx context.Context, change *biz.AdminPhoneChange) (*biz.AdminUser, error) {
	if change == nil || change.AdminID <= 0 || change.OperatorID <= 0 {
		return nil, biz.ErrBadParam
	}
	phone := strings.TrimSpace(change.Phone)

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, before, err := r.loadAdminPairForUpdate(ctx, tx, change.OperatorID, change.AdminID)
	if err != nil {
		return nil, err
	}
	if err := biz.ValidateAdminControlTarget(operator, before); err != nil {
		return nil, err
	}
	if before.AccountStatus() == biz.AdminAccountStatusRevoked {
		return nil, biz.ErrAdminRevoked
	}
	update := tx.AdminUser.Update().Where(adminuser.ID(before.ID), adminuser.RevokedAtIsNil())
	if phone == "" {
		update = update.ClearPhone()
	} else {
		update = update.SetPhone(phone)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrAdminPhoneExists
		}
		return nil, err
	}
	if affected == 0 {
		return nil, biz.ErrAdminRevoked
	}
	after, err := r.loadAdminSnapshotInTx(ctx, tx, before.ID)
	if err != nil {
		return nil, err
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		"admin_user.phone.set",
		"admin_user",
		after.ID,
		after.Username,
		biz.AdminAuditUserSnapshot(before),
		biz.AdminAuditUserSnapshot(after),
	)
	if err != nil {
		return nil, err
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return after, nil
}

func (r *adminManageRepo) rollbackAdminManageTx(ctx context.Context, tx *ent.Tx) {
	if tx == nil {
		return
	}
	if err := tx.Rollback(); err != nil && r.log != nil {
		r.log.WithContext(ctx).Warnf("rollback admin manage transaction failed err=%v", err)
	}
}

func (r *adminManageRepo) loadOperatorForUpdate(ctx context.Context, tx *ent.Tx, operatorID int) (*biz.AdminUser, error) {
	rows, err := r.loadAdminRowsForUpdate(ctx, tx, []int{operatorID})
	if err != nil {
		return nil, err
	}
	row, ok := rows[operatorID]
	if !ok {
		return nil, biz.ErrAdminNotFound
	}
	operator, err := r.loadAdminSnapshotFromRowInTx(ctx, tx, row)
	if err != nil {
		return nil, err
	}
	if !operator.IsActive() {
		return nil, biz.ErrUserDisabled
	}
	return operator, nil
}

func (r *adminManageRepo) loadAdminPairForUpdate(
	ctx context.Context,
	tx *ent.Tx,
	operatorID int,
	targetID int,
) (*biz.AdminUser, *biz.AdminUser, error) {
	ids := []int{operatorID}
	if targetID != operatorID {
		ids = append(ids, targetID)
	}
	rows, err := r.loadAdminRowsForUpdate(ctx, tx, ids)
	if err != nil {
		return nil, nil, err
	}
	operatorRow, ok := rows[operatorID]
	if !ok {
		return nil, nil, biz.ErrAdminNotFound
	}
	targetRow, ok := rows[targetID]
	if !ok {
		return nil, nil, biz.ErrAdminNotFound
	}
	operator := mapEntAdminUser(operatorRow)
	if !operator.IsActive() {
		return nil, nil, biz.ErrUserDisabled
	}
	target, err := r.loadAdminSnapshotFromRowInTx(ctx, tx, targetRow)
	if err != nil {
		return nil, nil, err
	}
	return operator, target, nil
}

func (r *adminManageRepo) loadAdminRowsForUpdate(
	ctx context.Context,
	tx *ent.Tx,
	ids []int,
) (map[int]*ent.AdminUser, error) {
	if len(ids) == 0 {
		return map[int]*ent.AdminUser{}, nil
	}
	query := tx.AdminUser.Query().Where(adminuser.IDIn(ids...)).Order(adminuser.ByID())
	if r.data.sqlDialect == dialect.Postgres {
		query = query.Where(func(selector *entsql.Selector) {
			selector.ForUpdate()
		})
	}
	rows, err := query.All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int]*ent.AdminUser, len(rows))
	for _, row := range rows {
		out[row.ID] = row
	}
	return out, nil
}

func (r *adminManageRepo) loadAdminSnapshotInTx(ctx context.Context, tx *ent.Tx, adminID int) (*biz.AdminUser, error) {
	row, err := tx.AdminUser.Query().Where(adminuser.ID(adminID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrAdminNotFound
		}
		return nil, err
	}
	return r.loadAdminSnapshotFromRowInTx(ctx, tx, row)
}

func (r *adminManageRepo) loadAdminSnapshotFromRowInTx(
	ctx context.Context,
	tx *ent.Tx,
	row *ent.AdminUser,
) (*biz.AdminUser, error) {
	admin := mapEntAdminUser(row)
	if admin == nil {
		return nil, biz.ErrAdminNotFound
	}
	admin.Roles = []biz.AdminRole{}
	admin.Permissions = []string{}

	assignments, err := tx.AdminUserRole.Query().
		Where(adminuserrole.AdminUserID(admin.ID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	roleIDs := make([]int, 0, len(assignments))
	for _, assignment := range assignments {
		roleIDs = append(roleIDs, assignment.RoleID)
	}
	if len(roleIDs) > 0 {
		roleRows, queryErr := tx.Role.Query().
			Where(role.IDIn(roleIDs...)).
			Order(role.BySortOrder(), role.ByID()).
			All(ctx)
		if queryErr != nil {
			return nil, queryErr
		}
		activeRoleIDs := make([]int, 0, len(roleRows))
		for _, roleRow := range roleRows {
			admin.Roles = append(admin.Roles, mapEntAdminRole(roleRow))
			if !roleRow.Disabled {
				activeRoleIDs = append(activeRoleIDs, roleRow.ID)
			}
		}
		if !admin.IsSuperAdmin && len(activeRoleIDs) > 0 {
			admin.Permissions, err = loadAdminPermissionKeysInTx(ctx, tx, activeRoleIDs)
			if err != nil {
				return nil, err
			}
		}
	}
	if admin.IsSuperAdmin {
		admin.Permissions = biz.AllPermissionKeys()
	}
	return admin, nil
}

func loadAdminPermissionKeysInTx(ctx context.Context, tx *ent.Tx, activeRoleIDs []int) ([]string, error) {
	if len(activeRoleIDs) == 0 {
		return []string{}, nil
	}
	links, err := tx.RolePermission.Query().
		Where(rolepermission.RoleIDIn(activeRoleIDs...)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	permissionIDs := make([]int, 0, len(links))
	seen := make(map[int]struct{}, len(links))
	for _, link := range links {
		if _, ok := seen[link.PermissionID]; ok {
			continue
		}
		seen[link.PermissionID] = struct{}{}
		permissionIDs = append(permissionIDs, link.PermissionID)
	}
	if len(permissionIDs) == 0 {
		return []string{}, nil
	}
	rows, err := tx.Permission.Query().
		Where(permission.IDIn(permissionIDs...)).
		Order(permission.ByPermissionKey()).
		All(ctx)
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(rows))
	for _, row := range rows {
		keys = append(keys, row.PermissionKey)
	}
	return biz.NormalizePermissionKeys(keys), nil
}

func (r *adminManageRepo) ensureAdminIdentityAvailableInTx(
	ctx context.Context,
	tx *ent.Tx,
	username string,
	phone string,
) error {
	usernameQuery := tx.AdminUser.Query().Where(adminuser.Username(username))
	if r.data.sqlDialect == dialect.Postgres {
		usernameQuery = usernameQuery.Where(func(selector *entsql.Selector) {
			selector.ForUpdate()
		})
	}
	if _, err := usernameQuery.First(ctx); err == nil {
		return biz.ErrAdminExists
	} else if !ent.IsNotFound(err) {
		return err
	}
	if phone == "" {
		return nil
	}
	phoneQuery := tx.AdminUser.Query().Where(adminuser.Phone(phone))
	if r.data.sqlDialect == dialect.Postgres {
		phoneQuery = phoneQuery.Where(func(selector *entsql.Selector) {
			selector.ForUpdate()
		})
	}
	if _, err := phoneQuery.First(ctx); err == nil {
		return biz.ErrAdminPhoneExists
	} else if !ent.IsNotFound(err) {
		return err
	}
	return nil
}

func mapAdminIdentityConstraintError(err error, phone string) error {
	if !ent.IsConstraintError(err) {
		return err
	}
	if phone != "" && strings.Contains(strings.ToLower(err.Error()), "phone") {
		return biz.ErrAdminPhoneExists
	}
	return biz.ErrAdminExists
}

func (r *adminManageRepo) resolveActiveRoleIDsInTx(
	ctx context.Context,
	tx *ent.Tx,
	roleKeys []string,
	operatorIsSuperAdmin bool,
) ([]int, error) {
	if len(roleKeys) == 0 {
		return []int{}, nil
	}
	query := tx.Role.Query().
		Where(role.RoleKeyIn(roleKeys...), role.Disabled(false)).
		Order(role.ByID())
	if r.data.sqlDialect == dialect.Postgres {
		query = query.Where(func(selector *entsql.Selector) {
			selector.ForUpdate()
		})
	}
	rows, err := query.All(ctx)
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]int, len(rows))
	for _, row := range rows {
		if biz.IsSystemManagedRole(mapEntAdminRole(row)) && !operatorIsSuperAdmin {
			return nil, biz.ErrPrivilegedRoleAssignmentForbidden
		}
		byKey[biz.NormalizeRoleKey(row.RoleKey)] = row.ID
	}
	roleIDs := make([]int, 0, len(roleKeys))
	for _, roleKey := range roleKeys {
		roleID, ok := byKey[roleKey]
		if !ok {
			return nil, biz.ErrRoleNotFound
		}
		roleIDs = append(roleIDs, roleID)
	}
	return roleIDs, nil
}

func setAdminRoleIDsInTx(ctx context.Context, tx *ent.Tx, adminID int, roleIDs []int) error {
	if _, err := tx.AdminUserRole.Delete().Where(adminuserrole.AdminUserID(adminID)).Exec(ctx); err != nil {
		return err
	}
	for _, roleID := range roleIDs {
		if _, err := tx.AdminUserRole.Create().
			SetAdminUserID(adminID).
			SetRoleID(roleID).
			Save(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (r *adminManageRepo) loadRoleForUpdate(ctx context.Context, tx *ent.Tx, roleKey string) (*ent.Role, error) {
	query := tx.Role.Query().Where(role.RoleKey(roleKey))
	if r.data.sqlDialect == dialect.Postgres {
		query = query.Where(func(selector *entsql.Selector) {
			selector.ForUpdate()
		})
	}
	row, err := query.Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrRoleNotFound
		}
		return nil, err
	}
	return row, nil
}

func (r *adminManageRepo) loadRoleSnapshotInTx(ctx context.Context, tx *ent.Tx, roleID int) (*biz.AdminRole, error) {
	row, err := tx.Role.Query().Where(role.ID(roleID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrRoleNotFound
		}
		return nil, err
	}
	return r.loadRoleSnapshotFromRowInTx(ctx, tx, row)
}

func (r *adminManageRepo) loadRoleSnapshotFromRowInTx(
	ctx context.Context,
	tx *ent.Tx,
	row *ent.Role,
) (*biz.AdminRole, error) {
	if row == nil {
		return nil, biz.ErrRoleNotFound
	}
	item := mapEntAdminRole(row)
	permissionKeys, err := loadRolePermissionKeysInTx(ctx, tx, row.ID)
	if err != nil {
		return nil, err
	}
	item.Permissions = permissionKeys
	scopeRows, err := tx.RoleDataScope.Query().
		Where(roledatascope.RoleID(row.ID)).
		Order(roledatascope.ByResourceType()).
		All(ctx)
	if err != nil {
		return nil, err
	}
	item.DataScopes = make([]biz.RoleDataScope, 0, len(scopeRows))
	for _, scopeRow := range scopeRows {
		normalized, normalizeErr := biz.NormalizeRoleDataScope(biz.RoleDataScope{
			ResourceType: scopeRow.ResourceType,
			Mode:         scopeRow.Mode,
			ResourceIDs:  scopeRow.ResourceIds,
		})
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		item.DataScopes = append(item.DataScopes, normalized)
	}
	return &item, nil
}

func loadRolePermissionKeysInTx(ctx context.Context, tx *ent.Tx, roleID int) ([]string, error) {
	links, err := tx.RolePermission.Query().Where(rolepermission.RoleID(roleID)).All(ctx)
	if err != nil {
		return nil, err
	}
	permissionIDs := make([]int, 0, len(links))
	for _, link := range links {
		permissionIDs = append(permissionIDs, link.PermissionID)
	}
	if len(permissionIDs) == 0 {
		return []string{}, nil
	}
	rows, err := tx.Permission.Query().
		Where(permission.IDIn(permissionIDs...)).
		Order(permission.ByPermissionKey()).
		All(ctx)
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(rows))
	for _, permissionRow := range rows {
		keys = append(keys, permissionRow.PermissionKey)
	}
	return biz.NormalizePermissionKeys(keys), nil
}

func resolvePermissionIDsInTx(ctx context.Context, tx *ent.Tx, permissionKeys []string) ([]int, error) {
	if len(permissionKeys) == 0 {
		return []int{}, nil
	}
	rows, err := tx.Permission.Query().
		Where(permission.PermissionKeyIn(permissionKeys...)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]int, len(rows))
	for _, row := range rows {
		byKey[strings.TrimSpace(row.PermissionKey)] = row.ID
	}
	permissionIDs := make([]int, 0, len(permissionKeys))
	for _, permissionKey := range permissionKeys {
		permissionID, ok := byKey[permissionKey]
		if !ok {
			return nil, biz.ErrPermissionNotFound
		}
		permissionIDs = append(permissionIDs, permissionID)
	}
	return permissionIDs, nil
}

func mapEntAdminRole(row *ent.Role) biz.AdminRole {
	roleKey := biz.NormalizeRoleKey(row.RoleKey)
	return biz.AdminRole{
		ID:          row.ID,
		Key:         roleKey,
		Name:        row.Name,
		Description: row.Description,
		Builtin:     row.Builtin,
		Disabled:    row.Disabled,
		SortOrder:   row.SortOrder,
		Type:        biz.NormalizeRoleType(biz.RoleType(row.RoleType), roleKey, row.Builtin),
		Version:     row.Version,
		Permissions: []string{},
		DataScopes:  []biz.RoleDataScope{},
	}
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

func (r *adminManageRepo) ChangeAdminLifecycle(ctx context.Context, change *biz.AdminLifecycleChange) (*biz.AdminUser, int, error) {
	if change == nil || change.AdminID <= 0 || change.OperatorID <= 0 {
		return nil, 0, biz.ErrBadParam
	}
	reason := strings.TrimSpace(change.Reason)
	if (change.Disabled && reason == "") || (change.Revoke && !change.Disabled) {
		return nil, 0, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, before, err := r.loadAdminPairForUpdate(ctx, tx, change.OperatorID, change.AdminID)
	if err != nil {
		return nil, 0, err
	}
	if operator.ID == before.ID {
		return nil, 0, biz.ErrNoPermission
	}
	if err := biz.ValidateAdminControlTarget(operator, before); err != nil {
		return nil, 0, err
	}
	if before.AccountStatus() == biz.AdminAccountStatusRevoked {
		return nil, 0, biz.ErrAdminRevoked
	}
	if !change.Revoke && before.Disabled == change.Disabled {
		if err := tx.Commit(); err != nil {
			return nil, 0, err
		}
		tx = nil
		return before, 0, nil
	}

	now := time.Now()
	update := tx.AdminUser.Update().Where(
		adminuser.ID(change.AdminID),
		adminuser.RevokedAtIsNil(),
	).
		SetDisabled(change.Disabled).
		AddAuthVersion(1).
		SetStatusChangedAt(now).
		SetStatusChangedBy(change.OperatorID)
	if reason == "" {
		update = update.ClearStatusReason()
	} else {
		update = update.SetStatusReason(reason)
	}
	if change.Revoke {
		update = update.SetRevokedAt(now)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, 0, err
	}
	if affected == 0 {
		return nil, 0, biz.ErrAdminRevoked
	}
	sessionRevokeReason := adminSessionRevokeReasonAccountEnabled
	if change.Disabled {
		sessionRevokeReason = adminSessionRevokeReasonAccountDisabled
	}
	if change.Revoke {
		sessionRevokeReason = adminSessionRevokeReasonAccountRevoked
	}
	revokedSessionCount, err := revokeActiveAdminSessionsInTx(
		ctx,
		tx,
		change.AdminID,
		now,
		sessionRevokeReason,
	)
	if err != nil {
		return nil, 0, err
	}

	releasedTaskCount := 0
	if change.Revoke {
		terminalStatuses := biz.WorkflowTerminalTaskStatusKeys()
		tasks, queryErr := tx.WorkflowTask.Query().Where(
			workflowtask.AssigneeID(change.AdminID),
			workflowtask.TaskStatusKeyNotIn(terminalStatuses...),
		).All(ctx)
		if queryErr != nil {
			return nil, 0, queryErr
		}
		for _, task := range tasks {
			nextVersion := task.Version + 1
			updated, updateErr := tx.WorkflowTask.Update().Where(
				workflowtask.ID(task.ID),
				workflowtask.AssigneeID(change.AdminID),
				workflowtask.Version(task.Version),
				workflowtask.TaskStatusKey(task.TaskStatusKey),
				workflowtask.TaskStatusKeyNotIn(terminalStatuses...),
			).
				ClearAssigneeID().
				SetUpdatedBy(change.OperatorID).
				SetVersion(nextVersion).
				Save(ctx)
			if updateErr != nil {
				return nil, 0, updateErr
			}
			if updated != 1 {
				return nil, 0, biz.ErrWorkflowTaskConflict
			}
			if _, eventErr := tx.WorkflowTaskEvent.Create().
				SetTaskID(task.ID).
				SetTaskVersion(nextVersion).
				SetEventType("unassigned").
				SetFromStatusKey(task.TaskStatusKey).
				SetToStatusKey(task.TaskStatusKey).
				SetActorID(change.OperatorID).
				SetReason("账号注销，待办退回原岗位任务池").
				SetPayload(map[string]any{
					"released_assignee_id":     change.AdminID,
					"account_lifecycle_action": adminSessionRevokeReasonAccountRevoked,
				}).
				Save(ctx); eventErr != nil {
				return nil, 0, eventErr
			}
			releasedTaskCount++
		}
	}
	after, err := r.loadAdminSnapshotInTx(ctx, tx, before.ID)
	if err != nil {
		return nil, 0, err
	}
	action := "admin_user.disabled.set"
	if change.Revoke {
		action = "admin_user.revoked"
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		action,
		"admin_user",
		after.ID,
		after.Username,
		biz.AdminAuditUserSnapshot(before),
		adminAuditSnapshotWithSessionRevocation(
			biz.AdminAuditUserSnapshot(after),
			revokedSessionCount,
			sessionRevokeReason,
		),
	)
	if err != nil {
		return nil, 0, err
	}
	if err = createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, 0, err
	}
	if err = tx.Commit(); err != nil {
		return nil, 0, err
	}
	tx = nil
	return after, releasedTaskCount, nil
}

func (r *adminManageRepo) ResetAdminPasswordWithAudit(ctx context.Context, reset *biz.AdminPasswordReset) (*biz.AdminUser, error) {
	if reset == nil || reset.AdminID <= 0 || reset.OperatorID <= 0 || strings.TrimSpace(reset.PasswordHash) == "" {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { r.rollbackAdminManageTx(ctx, tx) }()

	operator, before, err := r.loadAdminPairForUpdate(ctx, tx, reset.OperatorID, reset.AdminID)
	if err != nil {
		return nil, err
	}
	if err := biz.ValidateAdminControlTarget(operator, before); err != nil {
		return nil, err
	}
	if before.AccountStatus() == biz.AdminAccountStatusRevoked {
		return nil, biz.ErrAdminRevoked
	}
	affected, err := tx.AdminUser.Update().
		Where(adminuser.ID(before.ID), adminuser.RevokedAtIsNil()).
		SetPasswordHash(reset.PasswordHash).
		AddAuthVersion(1).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, biz.ErrAdminRevoked
	}
	revokedSessionCount, err := revokeActiveAdminSessionsInTx(
		ctx,
		tx,
		before.ID,
		time.Now(),
		adminSessionRevokeReasonPasswordReset,
	)
	if err != nil {
		return nil, err
	}
	after, err := r.loadAdminSnapshotInTx(ctx, tx, before.ID)
	if err != nil {
		return nil, err
	}
	auditEvent, err := biz.BuildAdminControlAuditEvent(
		operator,
		"admin_user.password.reset",
		"admin_user",
		after.ID,
		after.Username,
		map[string]any{"password_reset": false},
		map[string]any{
			"password_reset":        true,
			"revoked_session_count": revokedSessionCount,
			"session_revoke_reason": adminSessionRevokeReasonPasswordReset,
		},
	)
	if err != nil {
		return nil, err
	}
	if err := createRuntimeAuditEventInTx(ctx, tx, auditEvent); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return after, nil
}

func revokeActiveAdminSessionsInTx(
	ctx context.Context,
	tx *ent.Tx,
	adminID int,
	revokedAt time.Time,
	reason string,
) (int, error) {
	if tx == nil || adminID <= 0 || strings.TrimSpace(reason) == "" {
		return 0, biz.ErrBadParam
	}
	return tx.AdminSession.Update().Where(
		adminsession.AdminUserID(adminID),
		adminsession.RevokedAtIsNil(),
		adminsession.ExpiresAtGT(revokedAt),
	).
		SetRevokedAt(revokedAt).
		SetRevokeReason(strings.TrimSpace(reason)).
		Save(ctx)
}

func adminAuditSnapshotWithSessionRevocation(snapshot map[string]any, revokedSessionCount int, reason string) map[string]any {
	out := make(map[string]any, len(snapshot)+2)
	for key, value := range snapshot {
		out[key] = value
	}
	out["revoked_session_count"] = revokedSessionCount
	out["session_revoke_reason"] = strings.TrimSpace(reason)
	return out
}

func (r *adminManageRepo) RecordRuntimeAuditEvent(ctx context.Context, event *biz.RuntimeAuditEventCreate) error {
	eventType, eventKey, source, encodedPayload, err := normalizeRuntimeAuditEventCreate(event)
	if err != nil {
		return err
	}
	_, err = r.data.postgres.RuntimeAuditEvent.Create().
		SetEventType(eventType).
		SetEventKey(eventKey).
		SetSource(source).
		SetPayload(encodedPayload).
		Save(ctx)
	return err
}

func createRuntimeAuditEventInTx(ctx context.Context, tx *ent.Tx, event *biz.RuntimeAuditEventCreate) error {
	eventType, eventKey, source, encodedPayload, err := normalizeRuntimeAuditEventCreate(event)
	if err != nil {
		return err
	}
	_, err = tx.RuntimeAuditEvent.Create().
		SetEventType(eventType).
		SetEventKey(eventKey).
		SetSource(source).
		SetPayload(encodedPayload).
		Save(ctx)
	return err
}

func normalizeRuntimeAuditEventCreate(event *biz.RuntimeAuditEventCreate) (string, string, string, string, error) {
	if event == nil || strings.TrimSpace(event.EventType) == "" || strings.TrimSpace(event.Source) == "" {
		return "", "", "", "", biz.ErrBadParam
	}
	payload := event.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return "", "", "", "", err
	}
	return strings.TrimSpace(event.EventType), strings.TrimSpace(event.EventKey), strings.TrimSpace(event.Source), string(encodedPayload), nil
}

func (r *adminManageRepo) ListRuntimeAuditEvents(
	ctx context.Context,
	filter biz.RuntimeAuditEventListFilter,
) (biz.RuntimeAuditEventListResult, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = defaultRuntimeAuditListLimit
	}
	if limit > maxRuntimeAuditListLimit {
		limit = maxRuntimeAuditListLimit
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	query := r.data.postgres.RuntimeAuditEvent.Query()
	countQuery := r.data.postgres.RuntimeAuditEvent.Query()
	if source := strings.TrimSpace(filter.Source); source != "" {
		query = query.Where(runtimeauditevent.Source(source))
		countQuery = countQuery.Where(runtimeauditevent.Source(source))
	}
	if eventType := strings.TrimSpace(filter.EventType); eventType != "" {
		query = query.Where(runtimeauditevent.EventType(eventType))
		countQuery = countQuery.Where(runtimeauditevent.EventType(eventType))
	}
	if eventKey := strings.TrimSpace(filter.EventKey); eventKey != "" {
		query = query.Where(runtimeauditevent.EventKey(eventKey))
		countQuery = countQuery.Where(runtimeauditevent.EventKey(eventKey))
	}
	if !filter.CreatedFrom.IsZero() {
		query = query.Where(runtimeauditevent.CreatedAtGTE(filter.CreatedFrom))
		countQuery = countQuery.Where(runtimeauditevent.CreatedAtGTE(filter.CreatedFrom))
	}
	if !filter.CreatedTo.IsZero() {
		query = query.Where(runtimeauditevent.CreatedAtLTE(filter.CreatedTo))
		countQuery = countQuery.Where(runtimeauditevent.CreatedAtLTE(filter.CreatedTo))
	}
	if actorKey := strings.TrimSpace(filter.ActorKey); actorKey != "" {
		query = query.Where(runtimeauditevent.PayloadContainsFold(actorKey))
		countQuery = countQuery.Where(runtimeauditevent.PayloadContainsFold(actorKey))
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		query = query.Where(runtimeauditevent.PayloadContainsFold(targetType))
		countQuery = countQuery.Where(runtimeauditevent.PayloadContainsFold(targetType))
	}
	if targetKey := strings.TrimSpace(filter.TargetKey); targetKey != "" {
		query = query.Where(runtimeauditevent.PayloadContainsFold(targetKey))
		countQuery = countQuery.Where(runtimeauditevent.PayloadContainsFold(targetKey))
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		predicate := runtimeauditevent.Or(
			runtimeauditevent.EventTypeContainsFold(keyword),
			runtimeauditevent.EventKeyContainsFold(keyword),
			runtimeauditevent.SourceContainsFold(keyword),
			runtimeauditevent.PayloadContainsFold(keyword),
		)
		query = query.Where(predicate)
		countQuery = countQuery.Where(predicate)
	}

	total, err := countQuery.Count(ctx)
	if err != nil {
		return biz.RuntimeAuditEventListResult{}, err
	}
	rows, err := query.
		Order(ent.Desc(runtimeauditevent.FieldCreatedAt), ent.Desc(runtimeauditevent.FieldID)).
		Offset(offset).
		Limit(limit).
		All(ctx)
	if err != nil {
		return biz.RuntimeAuditEventListResult{}, err
	}

	events := make([]biz.RuntimeAuditEvent, 0, len(rows))
	for _, row := range rows {
		payload := map[string]any{}
		if strings.TrimSpace(row.Payload) != "" {
			if err := json.Unmarshal([]byte(row.Payload), &payload); err != nil {
				payload = map[string]any{"_decode_error": "invalid_payload_json"}
			}
		}
		events = append(events, biz.RuntimeAuditEvent{
			ID:        row.ID,
			EventType: row.EventType,
			EventKey:  row.EventKey,
			Source:    row.Source,
			Payload:   payload,
			CreatedAt: row.CreatedAt,
		})
	}

	return biz.RuntimeAuditEventListResult{
		Events: events,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
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
