package biz

import "testing"

func TestNormalizeAdminMenuPermissions(t *testing.T) {
	got := NormalizeAdminMenuPermissions([]string{
		"/erp/source-readiness",
		"/invalid",
		"/erp/dashboard",
		"/erp/help-center",
		" ",
	})

	want := []string{
		"/erp/dashboard",
		"/erp/docs/operation-flow-overview",
		"/erp/docs/field-linkage-guide",
	}
	if len(got) != len(want) {
		t.Fatalf("unexpected length: got=%d want=%d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected item at %d: got=%s want=%s", i, got[i], want[i])
		}
	}
}

func TestEffectiveAdminMenuPermissions(t *testing.T) {
	gotSuper := EffectiveAdminMenuPermissions(AdminLevelSuper, []string{"/erp/dashboard"})
	all := AllAdminMenuPermissions()
	if len(gotSuper) != len(all) {
		t.Fatalf("super admin permissions should be full list, got=%d want=%d", len(gotSuper), len(all))
	}

	gotStandard := EffectiveAdminMenuPermissions(AdminLevelStandard, []string{"/erp/help-center"})
	if len(gotStandard) != 1 || gotStandard[0] != "/erp/docs/operation-flow-overview" {
		t.Fatalf("unexpected standard permissions: %+v", gotStandard)
	}
}

func TestDefaultAdminMenuPermissionsExcludePermissionCenter(t *testing.T) {
	defaults := DefaultAdminMenuPermissions()
	hasAcceptanceOverview := false
	for _, item := range defaults {
		if item == "/erp/system/permissions" {
			t.Fatalf("default permissions must exclude permission center")
		}
		if item == "/erp/qa/acceptance-overview" {
			hasAcceptanceOverview = true
		}
	}
	if !hasAcceptanceOverview {
		t.Fatalf("default permissions should include qa acceptance overview")
	}
}

func TestAllAdminMenuPermissionsExcludeAwaitingConfirmationModules(t *testing.T) {
	all := AllAdminMenuPermissions()
	for _, item := range all {
		if item == "/erp/sales/quotations" {
			t.Fatalf("awaiting confirmation module should not appear in admin menu permissions")
		}
		if item == "/erp/master/partners" || item == "/erp/master/products" {
			t.Fatalf("基础资料页不应作为主业务菜单权限项: %s", item)
		}
	}
}

func TestAllAdminMenuPermissionsIncludeQAWorkbench(t *testing.T) {
	all := AllAdminMenuPermissions()
	want := []string{
		"/erp/qa/acceptance-overview",
		"/erp/qa/business-chain-debug",
		"/erp/qa/field-linkage-coverage",
		"/erp/qa/run-records",
		"/erp/qa/reports",
	}

	seen := make(map[string]struct{}, len(all))
	for _, item := range all {
		seen[item] = struct{}{}
	}
	for _, item := range want {
		if _, ok := seen[item]; !ok {
			t.Fatalf("qa workbench permission missing: %s", item)
		}
	}
}
