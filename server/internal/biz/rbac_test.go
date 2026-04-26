package biz

import "testing"

func TestAdminHasPermissionSuperAdminHasAllPermissions(t *testing.T) {
	admin := &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}

	if !AdminHasPermission(admin, PermissionDebugBusinessClear) {
		t.Fatalf("expected super admin to have debug clear permission")
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
