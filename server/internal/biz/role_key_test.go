package biz

import "testing"

func TestNormalizeRoleKeyTrimsOfficialRole(t *testing.T) {
	if got := NormalizeRoleKey(" sales "); got != SalesRoleKey {
		t.Fatalf("expected role to normalize to %q, got %q", SalesRoleKey, got)
	}
}
