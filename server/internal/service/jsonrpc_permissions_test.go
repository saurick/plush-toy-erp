package service

import (
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestMenuOptionsExposeExplicitAnyAndAllRequirements(t *testing.T) {
	items := menuOptionsToAny([]biz.AdminMenu{{
		Key:         "combined",
		Label:       "组合页面",
		Path:        "/erp/combined",
		RequiredAny: []string{"a.read", "b.read"},
		RequiredAll: []string{"base.read"},
	}})
	if len(items) != 1 {
		t.Fatalf("menu options len = %d, want 1", len(items))
	}
	menu := items[0].(map[string]any)
	if got := menu["required_any"].([]any); len(got) != 2 {
		t.Fatalf("required_any = %#v", got)
	}
	if got := menu["required_all"].([]any); len(got) != 1 {
		t.Fatalf("required_all = %#v", got)
	}
	if _, exists := menu["required_permissions"]; exists {
		t.Fatalf("non-contract required_permissions must not be exposed: %#v", menu)
	}
}

func TestPermissionUsageUsesExplicitRegisteredSurface(t *testing.T) {
	usage := permissionUsageToMap(biz.AdminPermission{
		Key: biz.PermissionSystemUserRoleAssign,
	})
	pages := usage["pages"].([]any)
	if len(pages) != 1 {
		t.Fatalf("pages = %#v", pages)
	}
	page := pages[0].(map[string]any)
	if page["key"] != "permission-center" ||
		page["section_key"] != "admin-accounts" ||
		page["control_key"] != "assign-admin-roles" ||
		page["control_name"] != "分配业务角色" {
		t.Fatalf("registered page surface = %#v", page)
	}
	methods := page["backend_methods"].([]any)
	if len(methods) != 1 || methods[0].(map[string]any)["domain"] != "admin" || methods[0].(map[string]any)["method"] != "set_roles" {
		t.Fatalf("registered backend methods = %#v", methods)
	}
	if _, exists := usage["menus"]; exists {
		t.Fatalf("usage must not fall back to suffix-derived legacy menus: %#v", usage)
	}
}

func TestPermissionUsageKeepsBackendOnlyPermissionsOutOfPageProjection(t *testing.T) {
	usage := permissionUsageToMap(biz.AdminPermission{Key: biz.PermissionCustomerConfigRead})
	if usage["backend_only"] != true {
		t.Fatalf("backend_only = %#v", usage["backend_only"])
	}
	if pages := usage["pages"].([]any); len(pages) != 0 {
		t.Fatalf("backend-only pages = %#v", pages)
	}
	if methods := usage["backend_methods"].([]any); len(methods) == 0 {
		t.Fatalf("backend-only methods = %#v", methods)
	}
}

func TestPermissionOptionsExposeBackendModuleNameAndDefinitionMetadata(t *testing.T) {
	items := permissionOptionsToAny([]biz.AdminPermission{{
		Key:        biz.PermissionProcessRuntimeRecover,
		Module:     "stale_module",
		Class:      biz.PermissionClassBusiness,
		Assignable: true,
	}})
	if len(items) != 1 {
		t.Fatalf("permission options len = %d, want 1", len(items))
	}
	permission := items[0].(map[string]any)
	if permission["module"] != "process_runtime" ||
		permission["module_name"] != "异常流程恢复" ||
		permission["class"] != string(biz.PermissionClassControlPlane) ||
		permission["assignable"] != false {
		t.Fatalf("permission option metadata = %#v", permission)
	}
}

func TestRequireAdminPermissionIntersectsRBACWithActiveCustomerEntitlement(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	repo := newServiceCustomerConfigRepo()
	uc := biz.NewCustomerConfigUsecase(repo)
	params := customerConfigPublishParamsForRevision(t, "2026.07.10.permission-intersection")
	payload := params.AsMap()
	entitlements := payload["access_entitlements"].([]any)
	filtered := make([]any, 0, len(entitlements))
	for _, raw := range entitlements {
		item := raw.(map[string]any)
		if item["role_key"] == biz.PurchaseRoleKey && item["capability_key"] == biz.PermissionOutsourcingOrderConfirm {
			continue
		}
		filtered = append(filtered, raw)
	}
	payload["access_entitlements"] = filtered
	in, ok := customerConfigPublishInputFromParams(payload)
	if !ok {
		t.Fatal("customer config test payload must parse")
	}
	published, err := uc.PublishCustomerConfig(t.Context(), in, 1)
	if err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	activatePublishedCustomerConfigForTest(t, uc, in, published, 1)

	newDispatcher := func(roleKey string) *jsonrpcDispatcher {
		return &jsonrpcDispatcher{
			log: log.NewHelper(log.With(
				log.NewStdLogger(io.Discard),
				"module", "service.jsonrpc.permissions.test",
			)),
			adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(
				[]string{roleKey},
				biz.PermissionOutsourcingOrderConfirm,
				biz.PermissionCustomerConfigRead,
				biz.PermissionProcessRuntimeRecover,
			)},
			customerConfigUC: uc,
		}
	}
	ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.PurchaseRoleKey).RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderConfirm); got == nil || got.Code != errcode.PermissionDenied.Code {
		t.Fatalf("purchase RBAC must be narrowed by active customer entitlement, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.PurchaseRoleKey).RequireAdminRBACPermission(ctx, biz.PermissionOutsourcingOrderConfirm); got != nil {
		t.Fatalf("revision-aware workflow guard must preserve the RBAC upper bound before applying its immutable revision, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.ProductionRoleKey).RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderConfirm); got != nil {
		t.Fatalf("production role must retain configured processing-contract confirmation, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.PurchaseRoleKey).RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); got != nil {
		t.Fatalf("control-plane repair permission must stay under RBAC, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.PurchaseRoleKey).RequireAdminPermission(ctx, biz.PermissionProcessRuntimeRecover); got != nil {
		t.Fatalf("process runtime recovery must stay under control-plane RBAC, got %#v", got)
	}
}

func TestCustomerConfigEntitlementBoundaryUsesPermissionClass(t *testing.T) {
	for _, permissionKey := range []string{
		biz.PermissionSystemUserRead,
		biz.PermissionCustomerConfigRead,
		biz.PermissionProcessRuntimeRecover,
		biz.PermissionDebugBusinessClear,
		biz.PermissionERPBusinessChainDebugRead,
	} {
		if customerConfigEntitlementApplies(permissionKey) {
			t.Errorf("permission %q must stay outside customer business entitlements", permissionKey)
		}
	}
	for _, permissionKey := range []string{
		biz.PermissionWorkflowTaskRead,
		biz.PermissionProductionFactRead,
	} {
		if !customerConfigEntitlementApplies(permissionKey) {
			t.Errorf("business permission %q must be narrowed by customer entitlements", permissionKey)
		}
	}
	if !customerConfigEntitlementApplies("legacy.unknown") {
		t.Fatal("unknown RBAC permissions must remain fail-closed behind customer entitlements")
	}
}

func TestRequireAdminPermissionFailsClosedWithoutFixedCustomerActiveRevision(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module", "service.jsonrpc.permissions.test",
		)),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(
			[]string{biz.SalesRoleKey},
			biz.PermissionSalesOrderRead,
			biz.PermissionCustomerConfigRead,
		)},
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}

	ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); got == nil || got.Code != errcode.PermissionDenied.Code {
		t.Fatalf("business permission must fail closed without active revision, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); got != nil {
		t.Fatalf("customer config repair permission must remain available under RBAC, got %#v", got)
	}
}

func TestSuperAdminBusinessPermissionFailsClosedWithoutFixedCustomerActiveRevision(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.permissions.test")),
		adminReader: stubAdminAccountReader{admin: &biz.AdminUser{
			ID: 7, Username: "admin", IsSuperAdmin: true,
		}},
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionShipmentShip); got == nil || got.Code != errcode.PermissionDenied.Code {
		t.Fatalf("super admin business permission must fail closed without active revision, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionCustomerConfigPublish); got != nil {
		t.Fatalf("super admin customer config repair permission must stay available, got %#v", got)
	}
}
