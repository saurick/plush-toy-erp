package biz

import "testing"

func TestNormalizeRoleKeyTrimsOfficialRole(t *testing.T) {
	if got := NormalizeRoleKey(" business "); got != BusinessRoleKey {
		t.Fatalf("expected role to normalize to %q, got %q", BusinessRoleKey, got)
	}
}

func TestNormalizeAdminMobileRolePermissionsKeepsOfficialBusinessRole(t *testing.T) {
	got := NormalizeAdminMobileRolePermissions([]string{"business", "invalid"})
	if len(got) != 1 || got[0] != BusinessRoleKey {
		t.Fatalf("expected mobile permission to keep business, got %#v", got)
	}
}
