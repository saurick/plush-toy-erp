package biz

import "testing"

func builtinRolePermissionSet(t *testing.T, roleKey string) map[string]struct{} {
	t.Helper()
	for _, role := range BuiltinRoles() {
		if role.Key != roleKey {
			continue
		}
		return PermissionKeySet(role.Permissions)
	}
	t.Fatalf("builtin role %s not found", roleKey)
	return nil
}

func assertPermissionSetContains(t *testing.T, permissionSet map[string]struct{}, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if !PermissionSetHasAll(permissionSet, key) {
			t.Fatalf("expected permission %s", key)
		}
	}
}

func assertPermissionSetOmits(t *testing.T, permissionSet map[string]struct{}, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if PermissionSetHasAny(permissionSet, key) {
			t.Fatalf("unexpected permission %s", key)
		}
	}
}

func TestAdminHasPermissionSuperAdminHasAllPermissions(t *testing.T) {
	admin := &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}

	if !AdminHasPermission(admin, PermissionDebugBusinessClear) {
		t.Fatalf("expected super admin to have debug clear permission")
	}
}

func TestAdminHasPermissionDisabledAdminHasNoPermissions(t *testing.T) {
	admin := &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true, Disabled: true}

	if AdminHasPermission(admin, PermissionDebugBusinessClear) {
		t.Fatalf("disabled admin must not have debug clear permission")
	}
}

func TestBuiltinRoleWorkflowPermissionMatrix(t *testing.T) {
	tests := []struct {
		roleKey string
		has     []string
		omits   []string
	}{
		{
			roleKey: BossRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskApprove,
				PermissionWorkflowTaskReject,
				PermissionMobileBossAccess,
			},
			omits: []string{PermissionWorkflowTaskComplete, PermissionDebugBusinessClear},
		},
		{
			roleKey: QualityRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionWorkflowTaskReject,
				PermissionMobileQualityAccess,
			},
			omits: []string{PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: WarehouseRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionWorkflowTaskReject,
				PermissionMobileWarehouseAccess,
			},
			omits: []string{PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: ProductionRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionMobileProductionAccess,
			},
			omits: []string{PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: PurchaseRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskCreate,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionMobilePurchaseAccess,
			},
			omits: []string{PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: FinanceRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionWorkflowTaskReject,
				PermissionMobileFinanceAccess,
			},
			omits: []string{PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: PMCRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskCreate,
				PermissionWorkflowTaskUpdate,
				PermissionMobilePMCAccess,
			},
			omits: []string{PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: SalesRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskCreate,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionMobileSalesAccess,
			},
			omits: []string{PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: AdminRoleKey,
			has: []string{
				PermissionSystemUserRead,
				PermissionSystemRoleRead,
				PermissionSystemPermissionManage,
			},
			omits: []string{PermissionWorkflowTaskComplete, PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: DebugOperatorRoleKey,
			has: []string{
				PermissionERPBusinessChainDebugRead,
				PermissionDebugBusinessChainRead,
				PermissionDebugBusinessChainRun,
				PermissionDebugSeed,
				PermissionDebugCleanup,
				PermissionDebugBusinessClear,
			},
			omits: []string{PermissionWorkflowTaskRead, PermissionMobileFinanceAccess},
		},
	}

	for _, tt := range tests {
		t.Run(tt.roleKey, func(t *testing.T) {
			permissionSet := builtinRolePermissionSet(t, tt.roleKey)
			assertPermissionSetContains(t, permissionSet, tt.has...)
			assertPermissionSetOmits(t, permissionSet, tt.omits...)
		})
	}
}

func TestAdminVisibleMenusFiltersByPermissionCode(t *testing.T) {
	admin := &AdminUser{
		ID:          2,
		Username:    "manager",
		Permissions: []string{PermissionERPHelpCenterRead},
	}

	menus := AdminVisibleMenus(admin)
	if len(menus) == 0 {
		t.Fatalf("expected help menus")
	}
	for _, menu := range menus {
		if !PermissionSetHasAny(PermissionKeySet(admin.Permissions), menu.RequiredPermissions...) {
			t.Fatalf("menu %s is not guarded by admin permission set", menu.Path)
		}
	}
}

func TestAdminVisibleMenusRequiresDebugPermission(t *testing.T) {
	admin := &AdminUser{
		ID:          2,
		Username:    "manager",
		Permissions: []string{PermissionERPHelpCenterRead},
	}

	for _, menu := range AdminVisibleMenus(admin) {
		if menu.Path == "/erp/qa/business-chain-debug" {
			t.Fatalf("debug menu must not be visible without debug permission")
		}
	}

	admin.Permissions = append(admin.Permissions, PermissionDebugBusinessChainRun)
	foundDebugMenu := false
	for _, menu := range AdminVisibleMenus(admin) {
		if menu.Path == "/erp/qa/business-chain-debug" {
			foundDebugMenu = true
			break
		}
	}
	if !foundDebugMenu {
		t.Fatalf("expected debug menu with debug.business_chain.run")
	}
}

func TestAdminCanAccessMobileRoleUsesPermissionCode(t *testing.T) {
	admin := &AdminUser{
		ID:          2,
		Username:    "buyer",
		Permissions: []string{PermissionMobilePurchaseAccess},
	}

	if !AdminCanAccessMobileRole(admin, PurchaseRoleKey) {
		t.Fatalf("expected purchase mobile access")
	}
	if AdminCanAccessMobileRole(admin, WarehouseRoleKey) {
		t.Fatalf("warehouse mobile access must require its own permission")
	}
}
