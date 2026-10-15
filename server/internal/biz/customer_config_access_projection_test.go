package biz

import (
	"context"
	"testing"
)

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
