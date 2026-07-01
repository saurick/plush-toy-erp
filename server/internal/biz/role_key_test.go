package biz

import "testing"

func TestNormalizeRoleKeyTrimsOfficialRole(t *testing.T) {
	if got := NormalizeRoleKey(" sales "); got != SalesRoleKey {
		t.Fatalf("expected role to normalize to %q, got %q", SalesRoleKey, got)
	}
}

func TestNormalizeRoleKeyMapsLegacyAliasesToCurrentRoles(t *testing.T) {
	if got := NormalizeRoleKey(" sales "); got != SalesRoleKey {
		t.Fatalf("expected role key to normalize to %q, got %q", SalesRoleKey, got)
	}
}

func TestNormalizeAdminMobileRolePermissionsUsesCurrentRoleKeys(t *testing.T) {
	got := NormalizeAdminMobileRolePermissions([]string{"sales", "engineering", "purchase", "invalid"})
	want := []string{SalesRoleKey, PurchaseRoleKey, EngineeringRoleKey}
	if len(got) != len(want) {
		t.Fatalf("expected %d role keys, got %#v", len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected role at %d: got %q want %q", i, got[i], want[i])
		}
	}
}

func TestAdminMobileRolePermissionOptionsIncludeEngineering(t *testing.T) {
	for _, item := range AdminMobileRolePermissionOptions() {
		if item.Key == EngineeringRoleKey {
			if item.Label != "工程岗位任务端" {
				t.Fatalf("unexpected engineering label: %q", item.Label)
			}
			return
		}
	}
	t.Fatalf("expected engineering mobile role permission option")
}
