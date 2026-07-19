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

func TestNormalizeAdminRoleKeysKeepsConfiguredRoleKeys(t *testing.T) {
	got := NormalizeAdminRoleKeys([]string{
		" " + SalesRoleKey + " ",
		"sample_room_manager",
		SalesRoleKey,
		"customer.finance.assistant",
		"",
	})
	want := []string{SalesRoleKey, "sample_room_manager", "customer.finance.assistant"}
	if len(got) != len(want) {
		t.Fatalf("expected %d role keys, got %#v", len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected role key at %d: got %q want %q", i, got[i], want[i])
		}
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
				PermissionPurchaseOrderApprove,
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
				PermissionERPPrintTemplateRead,
				PermissionOutsourcingOrderRead,
				PermissionOutsourcingOrderCreate,
				PermissionOutsourcingOrderUpdate,
				PermissionOutsourcingOrderConfirm,
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionWorkflowTaskReject,
				PermissionMobileProductionAccess,
			},
			omits: []string{PermissionWorkflowTaskApprove, PermissionPurchaseOrderApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: EngineeringRoleKey,
			has: []string{
				PermissionERPPrintTemplateRead,
				PermissionProcessRead,
				PermissionProcessCreate,
				PermissionProductRead,
				PermissionBOMRead,
				PermissionBOMUpdate,
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionMobileEngineeringAccess,
			},
			omits: []string{PermissionWorkflowTaskCreate, PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
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
			omits: []string{PermissionWorkflowTaskReject, PermissionWorkflowTaskApprove, PermissionPurchaseOrderApprove, PermissionDebugBusinessClear},
		},
		{
			roleKey: FinanceRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionWorkflowTaskReject,
				PermissionPurchaseReceiptRead,
				PermissionPurchaseReceiptAdjustmentRead,
				PermissionPurchaseReturnRead,
				PermissionShipmentRead,
				PermissionMobileFinanceAccess,
			},
			omits: []string{PermissionWorkflowTaskApprove, PermissionPurchaseOrderRead, PermissionPurchaseOrderCreate, PermissionPurchaseOrderUpdate, PermissionPurchaseOrderApprove, PermissionPurchaseReceiptCreate, PermissionPurchaseReceiptAdjustmentCreate, PermissionPurchaseReceiptAdjustmentPost, PermissionPurchaseReceiptAdjustmentCancel, PermissionPurchaseReturnCreate, PermissionPurchaseReturnPost, PermissionPurchaseReturnCancel, PermissionWarehouseInboundRead, PermissionWarehouseInboundConfirm, PermissionDebugBusinessClear},
		},
		{
			roleKey: PMCRoleKey,
			has: []string{
				PermissionWorkflowTaskRead,
				PermissionWorkflowTaskCreate,
				PermissionWorkflowTaskUpdate,
				PermissionWorkflowTaskComplete,
				PermissionWorkflowTaskReject,
				PermissionShipmentRead,
				PermissionMobilePMCAccess,
			},
			omits: []string{PermissionWorkflowTaskApprove, PermissionDebugBusinessClear},
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
				PermissionSystemRolePermissionManage,
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

func TestBuiltinRoleOperationalFactPermissionProjection(t *testing.T) {
	production := builtinRolePermissionSet(t, ProductionRoleKey)
	assertPermissionSetContains(
		t,
		production,
		PermissionProductionFactRead,
		PermissionProductionWIPRead,
		PermissionProductionWIPAssign,
		PermissionProductionWIPExecute,
		PermissionProductionWIPRework,
		PermissionProductionCompletionCreate,
		PermissionProductionMaterialIssueCreate,
		PermissionProductionFactPost,
		PermissionProductionFactCancel,
	)

	pmc := builtinRolePermissionSet(t, PMCRoleKey)
	assertPermissionSetContains(t, pmc, PermissionProductionFactRead, PermissionProductionWIPRead)
	assertPermissionSetOmits(t, pmc, PermissionProductionWIPAssign, PermissionProductionWIPExecute, PermissionProductionWIPRework, PermissionPackagingMaterialConfirm, PermissionProductionCompletionCreate, PermissionProductionMaterialIssueCreate, PermissionProductionFactPost, PermissionProductionFactCancel)

	sales := builtinRolePermissionSet(t, SalesRoleKey)
	assertPermissionSetContains(t, sales, PermissionStockReservationCreate, PermissionStockReservationRelease, PermissionProductionWIPRead, PermissionPackagingMaterialConfirm)
	assertPermissionSetOmits(t, sales, PermissionProductionWIPAssign, PermissionProductionWIPExecute, PermissionProductionWIPRework)

	warehouse := builtinRolePermissionSet(t, WarehouseRoleKey)
	assertPermissionSetContains(t, warehouse, PermissionStockReservationCreate, PermissionStockReservationRelease)
	assertPermissionSetOmits(t, warehouse, PermissionProductionCompletionCreate, PermissionProductionMaterialIssueCreate, PermissionProductionFactPost, PermissionProductionFactCancel)

	quality := builtinRolePermissionSet(t, QualityRoleKey)
	assertPermissionSetContains(t, quality, PermissionCustomerRead, PermissionSalesOrderRead, PermissionSalesOrderItemRead, PermissionOutsourcingOrderRead, PermissionOutsourcingFactRead, PermissionShipmentRead, PermissionProductionWIPRead, PermissionQualityInspectionRead, PermissionQualityInspectionCreate)
	assertPermissionSetOmits(t, quality, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionShipmentCreate, PermissionShipmentShip, PermissionShipmentCancel, PermissionFinancePayableConfirm)

	finance := builtinRolePermissionSet(t, FinanceRoleKey)
	assertPermissionSetContains(t, finance, PermissionOutsourcingOrderRead, PermissionOutsourcingFactRead, PermissionPurchaseReceiptRead, PermissionPurchaseReceiptAdjustmentRead, PermissionPurchaseReturnRead, PermissionQualityInspectionRead, PermissionFinancePayableConfirm)
	assertPermissionSetOmits(t, finance, PermissionOutsourcingOrderCreate, PermissionOutsourcingOrderUpdate, PermissionPurchaseReceiptCreate, PermissionPurchaseReceiptAdjustmentCreate, PermissionPurchaseReceiptAdjustmentPost, PermissionPurchaseReceiptAdjustmentCancel, PermissionPurchaseReturnCreate, PermissionPurchaseReturnPost, PermissionPurchaseReturnCancel, PermissionWarehouseInboundRead, PermissionWarehouseInboundConfirm, PermissionQualityInspectionCreate)

	assertPermissionSetContains(t, production, PermissionProductSKURead, PermissionWarehouseInventoryRead, PermissionOutsourcingFactRead)
}

func TestMobileRoleAccessPermissionIncludesEngineering(t *testing.T) {
	if got := MobileRoleAccessPermission(EngineeringRoleKey); got != PermissionMobileEngineeringAccess {
		t.Fatalf("expected engineering mobile access permission, got %q", got)
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
		permissionSet := PermissionKeySet(admin.Permissions)
		hasAny := len(menu.RequiredAny) == 0 || PermissionSetHasAny(permissionSet, menu.RequiredAny...)
		hasAll := PermissionSetHasAll(permissionSet, menu.RequiredAll...)
		if !hasAny || !hasAll {
			t.Fatalf("menu %s is not guarded by admin permission set", menu.Path)
		}
	}
}

func TestBuiltinAdminMenusAlignCurrentRuntimeNavigation(t *testing.T) {
	menusByKey := map[string]AdminMenu{}
	for _, menu := range BuiltinAdminMenus() {
		menusByKey[menu.Key] = menu
	}

	tests := []struct {
		key         string
		label       string
		path        string
		permissions []string
	}{
		{
			key:         "global-dashboard",
			label:       "工作台",
			path:        "/erp/dashboard",
			permissions: []string{PermissionERPDashboardRead},
		},
		{
			key:         "task-board",
			label:       "任务看板",
			path:        "/erp/task-board",
			permissions: []string{PermissionWorkflowTaskRead},
		},
		{
			key:         "business-dashboard",
			label:       "业务看板",
			path:        "/erp/business-dashboard",
			permissions: []string{PermissionERPDashboardRead},
		},
		{
			key:         "receivables",
			label:       "应收管理",
			path:        "/erp/finance/receivables",
			permissions: []string{PermissionFinanceReceivableRead},
		},
		{
			key:         "invoices",
			label:       "发票管理",
			path:        "/erp/finance/invoices",
			permissions: []string{PermissionFinanceInvoiceRead},
		},
		{
			key:         "products",
			label:       "产品档案",
			path:        "/erp/master/products",
			permissions: []string{PermissionProductRead, PermissionProductSKURead},
		},
		{
			key:         "material-bom",
			label:       "BOM 管理",
			path:        "/erp/purchase/material-bom",
			permissions: []string{PermissionBOMRead},
		},
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			menu, ok := menusByKey[tt.key]
			if !ok {
				t.Fatalf("expected builtin menu %s", tt.key)
			}
			if menu.Label != tt.label {
				t.Fatalf("expected %s label %q, got %q", tt.key, tt.label, menu.Label)
			}
			if menu.Path != tt.path {
				t.Fatalf("expected %s path %q, got %q", tt.key, tt.path, menu.Path)
			}
			menuPermissions := append(append([]string(nil), menu.RequiredAny...), menu.RequiredAll...)
			if !PermissionSetHasAll(PermissionKeySet(menuPermissions), tt.permissions...) {
				t.Fatalf("expected %s permissions to contain %#v, got %#v", tt.key, tt.permissions, menuPermissions)
			}
		})
	}
	if _, ok := menusByKey["exception-flow"]; ok {
		t.Fatal("retired exception-flow menu must not remain registered")
	}
}

func TestAdminMenuRequirementsDistinguishAnyAndAll(t *testing.T) {
	t.Run("all requirements must all be present", func(t *testing.T) {
		menu := AdminMenu{
			RequiredAny: []string{PermissionProductRead},
			RequiredAll: []string{PermissionProductSKURead, PermissionMaterialRead},
		}
		if AdminMenuRequirementsSatisfied(PermissionKeySet([]string{PermissionProductRead, PermissionProductSKURead}), menu) {
			t.Fatal("menu must stay hidden when one RequiredAll permission is missing")
		}
		if !AdminMenuRequirementsSatisfied(PermissionKeySet([]string{PermissionProductRead, PermissionProductSKURead, PermissionMaterialRead}), menu) {
			t.Fatal("menu must be visible when RequiredAny and every RequiredAll permission are present")
		}
	})

	t.Run("finance pages require their exact family read permission", func(t *testing.T) {
		menus := AdminVisibleMenus(&AdminUser{Permissions: []string{PermissionFinancePayableRead}})
		if adminMenusContainKey(menus, "invoices") || adminMenusContainKey(menus, "reconciliation") {
			t.Fatal("payable read must not expose invoice or reconciliation pages")
		}

		invoiceMenus := AdminVisibleMenus(&AdminUser{Permissions: []string{PermissionFinanceInvoiceRead}})
		if !adminMenusContainKey(invoiceMenus, "invoices") || adminMenusContainKey(invoiceMenus, "reconciliation") {
			t.Fatal("invoice read must expose only the invoice page among exact finance families")
		}

		reconciliationMenus := AdminVisibleMenus(&AdminUser{Permissions: []string{PermissionFinanceReconciliationRead}})
		if !adminMenusContainKey(reconciliationMenus, "reconciliation") || adminMenusContainKey(reconciliationMenus, "invoices") {
			t.Fatal("reconciliation read must expose only the reconciliation page among exact finance families")
		}
	})

	t.Run("production orders accept plan read or WIP read", func(t *testing.T) {
		for _, permission := range []string{PermissionPMCPlanRead, PermissionProductionWIPRead} {
			menus := AdminVisibleMenus(&AdminUser{Permissions: []string{permission}})
			if !adminMenusContainKey(menus, "production-orders") {
				t.Fatalf("permission %q must expose production orders", permission)
			}
		}
		if adminMenusContainKey(AdminVisibleMenus(&AdminUser{Permissions: []string{PermissionProductionFactRead}}), "production-orders") {
			t.Fatal("production fact read alone must not expose production orders")
		}
	})
}

func adminMenusContainKey(menus []AdminMenu, key string) bool {
	for _, menu := range menus {
		if menu.Key == key {
			return true
		}
	}
	return false
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

func TestPermissionDefinitionsSeparateDelegableAndControlPlaneCapabilities(t *testing.T) {
	business, ok := PermissionDefinitionByKey(PermissionWarehouseInventoryRead)
	if !ok || business.Class != PermissionClassBusiness || !business.Assignable || business.NonProductionOnly {
		t.Fatalf("unexpected business permission metadata: %#v ok=%t", business, ok)
	}
	controlPlane, ok := PermissionDefinitionByKey(PermissionSystemUserRead)
	if !ok || controlPlane.Class != PermissionClassControlPlane || controlPlane.Assignable || controlPlane.NonProductionOnly {
		t.Fatalf("unexpected control-plane permission metadata: %#v ok=%t", controlPlane, ok)
	}
	debug, ok := PermissionDefinitionByKey(PermissionDebugBusinessClear)
	if !ok || debug.Class != PermissionClassDebug || debug.Assignable || !debug.NonProductionOnly {
		t.Fatalf("unexpected debug permission metadata: %#v ok=%t", debug, ok)
	}
}

func TestNormalizeRoleTypeKeepsReservedRolesSystemManaged(t *testing.T) {
	for _, roleKey := range []string{AdminRoleKey, DebugOperatorRoleKey} {
		if got := NormalizeRoleType(RoleTypeCustom, roleKey, false); got != RoleTypeSystem {
			t.Fatalf("NormalizeRoleType(custom, %q) = %q, want system", roleKey, got)
		}
	}
	if got := NormalizeRoleType("", WarehouseRoleKey, true); got != RoleTypeBusinessDefault {
		t.Fatalf("builtin business role type = %q, want business_default", got)
	}
	if got := NormalizeRoleType("", "sample_room_manager", false); got != RoleTypeCustom {
		t.Fatalf("custom role type = %q, want custom", got)
	}
}

func TestRoleAssignmentEnvironmentAllowsDebugOnlyInExplicitNonProduction(t *testing.T) {
	for _, environment := range []string{"local", "localhost", "dev", "development"} {
		if !RoleAssignmentEnvironmentAllowsDebug(environment) {
			t.Fatalf("expected %q to allow debug role assignment", environment)
		}
	}
	for _, environment := range []string{"", "sql", "qa", "test", "shared", "staging", "prod", "production", "remote"} {
		if RoleAssignmentEnvironmentAllowsDebug(environment) {
			t.Fatalf("expected %q to reject debug role assignment", environment)
		}
	}
}
