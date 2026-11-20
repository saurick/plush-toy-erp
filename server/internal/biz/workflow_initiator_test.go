package biz

import (
	"context"
	"testing"
)

func TestWorkflowInitiatorRoleRequiresAuthenticatedUnambiguousIdentity(t *testing.T) {
	for _, test := range []struct {
		name  string
		admin *AdminUser
		want  string
	}{
		{"no identity", nil, ""},
		{"single role", &AdminUser{ID: 7, Roles: []AdminRole{{Key: SalesRoleKey}}}, SalesRoleKey},
		{"super admin", &AdminUser{ID: 7, IsSuperAdmin: true, Roles: []AdminRole{{Key: SalesRoleKey}}}, AdminRoleKey},
		{"admin role", &AdminUser{ID: 7, Roles: []AdminRole{{Key: AdminRoleKey}}}, AdminRoleKey},
		{"multiple roles", &AdminUser{ID: 7, Roles: []AdminRole{{Key: PurchaseRoleKey}, {Key: SalesRoleKey}}}, ""},
		{"disabled role", &AdminUser{ID: 7, Roles: []AdminRole{{Key: PurchaseRoleKey, Disabled: true}, {Key: SalesRoleKey}}}, SalesRoleKey},
		{"duplicate role", &AdminUser{ID: 7, Roles: []AdminRole{{Key: SalesRoleKey}, {Key: SalesRoleKey}}}, SalesRoleKey},
		{"no role despite name", &AdminUser{ID: 7, DisplayName: "演示业务"}, ""},
		{"other actor", &AdminUser{ID: 8, Roles: []AdminRole{{Key: SalesRoleKey}}}, ""},
		{"disabled account", &AdminUser{ID: 7, Disabled: true, IsSuperAdmin: true}, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx := WithCurrentAdmin(context.Background(), test.admin)
			if got := WorkflowInitiatorRoleKey(ctx, 7); got != test.want {
				t.Fatalf("role=%q want=%q", got, test.want)
			}
			if got := WorkflowInitiatorRoleKey(ctx, 0); got != "" {
				t.Fatalf("system work inherited user role %q", got)
			}
		})
	}
	if label, risk := runtimeAuditActionLabelAndRisk(ProcessInitiationAuditEventPrefix + "123"); label != "发起流程" || risk != "normal" {
		t.Fatalf("audit label=%q risk=%q", label, risk)
	}
}
