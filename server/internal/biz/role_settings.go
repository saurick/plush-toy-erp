package biz

import "context"

// RoleSettingsRepo owns the aggregate role-settings mutation. The permission
// center uses this capability so permissions, data scope, and menu placement
// share one version check, transaction, and audit event.
type RoleSettingsRepo interface {
	SetRoleSettingsWithAudit(ctx context.Context, change *RoleSettingsChangeCommand) (*AdminRole, error)
}

func (uc *AdminManageUsecase) SetRoleSettings(
	ctx context.Context,
	roleKey string,
	permissionKeys []string,
	scopes []RoleDataScope,
	mode RoleNavigationMode,
	primaryMenuPaths []string,
	secondaryMenuPaths []string,
	expectedVersion int,
) (*AdminRole, error) {
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return nil, err
	}
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == "" || expectedVersion <= 0 {
		return nil, ErrBadParam
	}
	if !operator.IsSuperAdmin && AdminHasRole(operator, roleKey) {
		return nil, ErrAdminSelfRolePermissionForbidden
	}
	role, err := uc.repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, err
	}
	if role == nil || role.Disabled {
		return nil, ErrRoleNotFound
	}
	if IsSystemManagedRole(*role) {
		return nil, ErrSystemRoleImmutable
	}
	if role.Version != expectedVersion {
		return nil, ErrRoleVersionConflict
	}
	normalizedPermissionKeys, err := NormalizePermissionKeysStrict(permissionKeys)
	if err != nil {
		return nil, err
	}
	if err := ValidateAssignablePermissionKeys(normalizedPermissionKeys); err != nil {
		return nil, err
	}
	normalizedScopes, err := NormalizeRoleDataScopes(scopes)
	if err != nil {
		return nil, err
	}
	navigation, err := NormalizeRoleNavigationSettings(
		mode,
		primaryMenuPaths,
		secondaryMenuPaths,
	)
	if err != nil {
		return nil, err
	}
	return uc.repo.SetRoleSettingsWithAudit(ctx, &RoleSettingsChangeCommand{
		RoleKey:            roleKey,
		OperatorID:         operator.ID,
		ExpectedVersion:    expectedVersion,
		PermissionKeys:     normalizedPermissionKeys,
		Scopes:             normalizedScopes,
		Mode:               navigation.Mode,
		PrimaryMenuPaths:   navigation.PrimaryMenuPaths,
		SecondaryMenuPaths: navigation.SecondaryMenuPaths,
	})
}
