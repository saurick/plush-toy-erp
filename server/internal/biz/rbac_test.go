package biz

import (
	"strings"
	"testing"
)

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
				PermissionShipmentRead,
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
				PermissionShipmentRead,
				PermissionShipmentShip,
				PermissionShipmentCancel,
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
				PermissionMaterialRead,
				PermissionMaterialCreate,
				PermissionMaterialUpdate,
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
				PermissionShipmentRead,
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
				PermissionShipmentRead,
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
				PermissionShipmentRead,
				PermissionShipmentCreate,
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
				PermissionSystemAuditRead,
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
		Permissions: []string{PermissionERPDashboardRead},
	}

	menus := AdminVisibleMenus(admin)
	if len(menus) == 0 {
		t.Fatalf("expected visible menus")
	}
	for _, menu := range menus {
		if !PermissionSetHasAny(PermissionKeySet(admin.Permissions), menu.RequiredPermissions...) {
			t.Fatalf("menu %s is not guarded by admin permission set", menu.Path)
		}
	}
}

func TestAdminVisibleMenusUsesFormalV1Entries(t *testing.T) {
	admin := &AdminUser{
		ID:       2,
		Username: "operator",
		Permissions: []string{
			PermissionCustomerRead,
			PermissionSupplierRead,
			PermissionMaterialRead,
			PermissionProductSKURead,
			PermissionSalesOrderRead,
			PermissionBOMRead,
			PermissionPurchaseOrderRead,
			PermissionPurchaseReceiptRead,
			PermissionWarehouseInventoryRead,
			PermissionWarehouseInboundRead,
			PermissionWarehouseOutboundRead,
			PermissionShipmentRead,
			PermissionQualityInspectionRead,
			PermissionFinancePayableRead,
			PermissionFinanceReceivableRead,
			PermissionFinanceReportRead,
			PermissionPMCPlanRead,
			PermissionPMCRiskRead,
		},
	}

	paths := map[string]struct{}{}
	for _, menu := range AdminVisibleMenus(admin) {
		paths[menu.Path] = struct{}{}
	}
	if _, ok := paths["/erp/master/partners/customers"]; !ok {
		t.Fatalf("expected customers formal master data menu")
	}
	if _, ok := paths["/erp/master/partners/suppliers"]; !ok {
		t.Fatalf("expected suppliers formal master data menu")
	}
	if _, ok := paths["/erp/sales/project-orders/sales-orders"]; !ok {
		t.Fatalf("expected sales orders formal source document menu")
	}
	if _, ok := paths["/erp/master/products"]; !ok {
		t.Fatalf("expected product SKU master data menu")
	}
	if _, ok := paths["/erp/master/materials"]; !ok {
		t.Fatalf("expected materials formal master data menu")
	}
	if _, ok := paths["/erp/purchase/material-bom"]; !ok {
		t.Fatalf("expected BOM Version menu")
	}
	if _, ok := paths["/erp/warehouse/inbound"]; !ok {
		t.Fatalf("expected inbound formal shell menu")
	}
	if _, ok := paths["/erp/production/quality-inspections"]; !ok {
		t.Fatalf("expected quality inspection formal shell menu")
	}
	if _, ok := paths["/erp/finance/receivables"]; !ok {
		t.Fatalf("expected receivables formal shell menu")
	}
	if _, ok := paths["/erp/warehouse/shipments"]; !ok {
		t.Fatalf("expected shipments formal fact menu")
	}
	if _, ok := paths["/erp/master/partners"]; ok {
		t.Fatalf("old partners business_records entry must not be a visible formal menu")
	}
	if _, ok := paths["/erp/sales/project-orders"]; ok {
		t.Fatalf("old project-orders business_records entry must not be a visible formal menu")
	}
}

func TestAdminMenusOmitRetiredFrontendDocsAndQAPaths(t *testing.T) {
	menus := append(BuiltinAdminMenus(), AdminVisibleMenus(&AdminUser{
		ID:           1,
		Username:     "root",
		IsSuperAdmin: true,
	})...)

	for _, menu := range menus {
		if menu.Path == "/erp/help-center" {
			t.Fatalf("help center menu must not be registered")
		}
		if strings.HasPrefix(menu.Path, "/erp/docs/") {
			t.Fatalf("docs menu must not be registered: %s", menu.Path)
		}
		if strings.HasPrefix(menu.Path, "/erp/qa/") {
			t.Fatalf("QA menu must not be registered: %s", menu.Path)
		}
		if menu.Key == "operational-facts" || menu.Path == "/erp/operations/facts" {
			t.Fatalf("operational fact internal page must not be registered as a menu")
		}
		if menu.Path == "/erp/master/partners" || menu.Path == "/erp/sales/project-orders" {
			t.Fatalf("old business_records overlap path must not be registered: %s", menu.Path)
		}
	}
}

func TestNormalizeAdminMenuPermissionsRedirectsRetiredFrontendPaths(t *testing.T) {
	normalized := NormalizeAdminMenuPermissions([]string{
		"/erp/help-center",
		"/erp/docs/operation-guide",
		"/erp/qa/business-chain-debug",
	})

	if len(normalized) != 1 || normalized[0] != "/erp/dashboard" {
		t.Fatalf("expected retired paths to normalize to dashboard, got %#v", normalized)
	}
}

func TestNormalizeAdminMenuPermissionsDropsLegacyBusinessRecordEntries(t *testing.T) {
	normalized := NormalizeAdminMenuPermissions([]string{
		"/erp/master/partners",
		"/erp/sales/project-orders",
	})

	if len(normalized) != 0 {
		t.Fatalf("expected legacy business record paths to be dropped, got %#v", normalized)
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
