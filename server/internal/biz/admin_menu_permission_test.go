package biz

import "testing"

func TestNormalizeAdminMenuPermissions(t *testing.T) {
	got := NormalizeAdminMenuPermissions([]string{
		"/erp/source-readiness",
		"/invalid",
		"/erp/dashboard",
		"/erp/source-readiness",
		" ",
	})

	want := []string{"/erp/dashboard", "/erp/source-readiness"}
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
	if len(gotStandard) != 1 || gotStandard[0] != "/erp/help-center" {
		t.Fatalf("unexpected standard permissions: %+v", gotStandard)
	}
}

func TestDefaultAdminMenuPermissionsExcludePermissionCenter(t *testing.T) {
	defaults := DefaultAdminMenuPermissions()
	for _, item := range defaults {
		if item == "/erp/system/permissions" {
			t.Fatalf("default permissions must exclude permission center")
		}
	}
}
