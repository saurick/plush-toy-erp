package biz

import (
	"context"
	"slices"
	"testing"
)

func TestCustomerConfigRoleProgressSharesTaskBoardProjection(t *testing.T) {
	snapshot := map[string]any{"rolePageProjections": map[string]any{
		SalesRoleKey: []any{"task-board"}, FinanceRoleKey: []any{"receivables"},
	}}
	pages := []string{"task-board", "business-dashboard", "receivables"}
	for _, tc := range []struct {
		name, role  string
		input, want []string
	}{
		{"published task workspace", SalesRoleKey, pages, []string{"business-dashboard", "task-board"}},
		{"dashboard disabled by customer", SalesRoleKey, []string{"task-board"}, []string{"task-board"}},
		{"task workspace not available", SalesRoleKey, []string{"business-dashboard"}, nil},
		{"unrelated role", FinanceRoleKey, pages, []string{"receivables"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := effectivePageKeysForRoles(tc.input, snapshot, []string{tc.role}); !slices.Equal(got, tc.want) {
				t.Fatalf("effective pages = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCustomerConfigProgressMenuForDefaultBusinessRoles(t *testing.T) {
	for _, role := range BuiltinRoles() {
		mobile := MobileRoleAccessPermission(role.Key)
		if mobile == "" {
			continue
		}
		t.Run(role.Key, func(t *testing.T) {
			global := role.Key == BossRoleKey || role.Key == PMCRoleKey
			projected := []any{"task-board"}
			if global {
				projected = append(projected, "business-dashboard")
			}
			revision := &CustomerConfigRevision{CompiledSnapshot: map[string]any{
				"pages":               []any{"task-board", "business-dashboard"},
				"rolePageProjections": map[string]any{role.Key: projected},
			}}
			admin := &AdminUser{ID: 1, Roles: []AdminRole{{Key: role.Key}}, Permissions: role.Permissions}
			moduleKeys := customerConfigModuleDependencyClosure(append([]string{"workflow_tasks"}, customerConfigModulesForAction(mobile)...))
			var modules []DeploymentModuleStateInput
			for _, key := range moduleKeys {
				modules = append(modules, DeploymentModuleStateInput{ModuleKey: key, State: "enabled"})
			}
			grants := []AccessEntitlementInput{
				{RoleKey: role.Key, CapabilityKey: PermissionWorkflowTaskRead, Enabled: true},
				{RoleKey: role.Key, CapabilityKey: mobile, Enabled: true},
			}
			if global {
				grants = append(grants, AccessEntitlementInput{RoleKey: role.Key, CapabilityKey: PermissionERPBusinessDashboardRead, Enabled: true})
			}
			session := buildEffectiveSessionFromRevision("yoyoosun", revision, admin, []string{role.Key}, modules,
				[]RoleProfileInput{{RoleKey: role.Key}}, grants, nil, nil)
			if !slices.Contains(session.Pages, "business-dashboard") || !slices.Contains(session.Actions, mobile) ||
				slices.Contains(session.Actions, PermissionERPBusinessDashboardRead) != global {
				t.Fatalf("page or scope mismatch for %s: pages=%v actions=%v", role.Key, session.Pages, session.Actions)
			}
		})
	}
}

func TestExplainRoleEffectiveAccessRequiresActiveRevisionForFixedCustomer(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	explanation, err := uc.ExplainRoleEffectiveAccess(context.Background(), "yoyoosun", AdminRole{
		Key:         SalesRoleKey,
		Name:        "销售",
		Type:        RoleTypeBusinessDefault,
		Permissions: []string{PermissionSalesOrderRead},
	}, true)
	if err != nil {
		t.Fatalf("ExplainRoleEffectiveAccess error = %v", err)
	}
	if explanation.IsFinal || explanation.Source != "active_revision_missing" {
		t.Fatalf("missing active revision explanation = %#v", explanation)
	}
	for _, page := range explanation.Pages {
		if page.Effective {
			t.Fatalf("fixed customer without active revision exposed page %#v", page)
		}
	}
}

func TestExplainRoleEffectiveAccessMatchesEffectiveSession(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	role := AdminRole{
		Key:         SalesRoleKey,
		Name:        "销售",
		Type:        RoleTypeBusinessDefault,
		Version:     3,
		Permissions: []string{PermissionSalesOrderRead, PermissionCustomerRead},
	}
	explanation, err := uc.ExplainRoleEffectiveAccess(ctx, in.CustomerKey, role, true)
	if err != nil {
		t.Fatalf("ExplainRoleEffectiveAccess error = %v", err)
	}
	if !explanation.IsFinal || explanation.ConfigRevision != in.Revision {
		t.Fatalf("active explanation identity = %#v", explanation)
	}
	admin := &AdminUser{Roles: []AdminRole{role}, Permissions: role.Permissions}
	session, err := uc.GetEffectiveSessionRequiringActiveRevision(ctx, in.CustomerKey, admin)
	if err != nil {
		t.Fatalf("GetEffectiveSessionRequiringActiveRevision error = %v", err)
	}
	wantPages := map[string]bool{}
	for _, key := range session.Pages {
		wantPages[key] = true
	}
	for _, page := range explanation.Pages {
		if page.Effective != wantPages[page.Key] {
			t.Fatalf("page %s explanation effective=%t session=%t", page.Key, page.Effective, wantPages[page.Key])
		}
	}
	wantActions := PermissionKeySet(session.Actions)
	for _, permission := range explanation.Permissions {
		if permission.Class == PermissionClassControlPlane {
			continue
		}
		_, want := wantActions[permission.PermissionKey]
		if permission.Effective != want {
			t.Fatalf("permission %s explanation effective=%t session=%t", permission.PermissionKey, permission.Effective, want)
		}
	}
}

func TestExplainRoleEffectiveAccessKeepsSystemRoleOnControlPlaneRBAC(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	explanation, err := uc.ExplainRoleEffectiveAccess(context.Background(), "yoyoosun", AdminRole{
		Key:         AdminRoleKey,
		Name:        "系统管理员",
		Builtin:     true,
		Type:        RoleTypeSystem,
		Permissions: []string{PermissionSystemRoleRead, PermissionSystemPermissionRead},
	}, true)
	if err != nil {
		t.Fatalf("ExplainRoleEffectiveAccess error = %v", err)
	}
	if !explanation.IsFinal || explanation.Source != "control_plane_rbac" {
		t.Fatalf("system role explanation = %#v", explanation)
	}
}
