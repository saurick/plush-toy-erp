package biz

import (
	"context"
	"errors"
	"io"
	"slices"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
)

func TestRolePermissionPolicySeparatesDefaultsFromEditableBusinessPermissions(t *testing.T) {
	for _, definition := range BuiltinRoles() {
		role := AdminRole{Key: definition.Key, Type: definition.Type, Builtin: definition.Builtin, Permissions: definition.Permissions}
		if IsSystemManagedRole(role) {
			continue
		}
		t.Run(role.Key, func(t *testing.T) {
			policy := RolePermissionPolicyFor(role)
			if !policy.Registered || !slices.Equal(policy.Defaults, NormalizePermissionKeys(definition.Permissions)) {
				t.Fatalf("registered defaults drifted: %#v", policy)
			}
			for _, candidate := range [][]string{nil, {}, {PermissionWarehouseInventoryRead}, {PermissionFinancePaymentRead, PermissionFinancePaymentPost}} {
				if err := ValidateRolePermissionPolicy(role, candidate); err != nil {
					t.Fatalf("editable business permissions %v: %v", candidate, err)
				}
				role.Permissions = candidate
				if !slices.Equal(RolePermissionPolicyFor(role).Defaults, policy.Defaults) {
					t.Fatal("editing grants changed the initial template")
				}
				if err := ValidateRoleAssignment(role, true, "local"); err != nil {
					t.Fatalf("edited role cannot be assigned: %v", err)
				}
			}
			if err := ValidateAssignablePermissionKeys(policy.Assignable); err != nil || len(policy.Assignable) == 0 {
				t.Fatalf("editable catalog contains invalid permissions: %v", err)
			}
			if !slices.Contains(policy.Assignable, PermissionFinancePaymentPost) || slices.Contains(policy.Assignable, PermissionSystemRolePermissionManage) {
				t.Fatal("editable catalog must include business actions and exclude the control plane")
			}
		})
	}
}

func TestRolePermissionPolicyRejectsProtectedAndUnknownPermissions(t *testing.T) {
	role := AdminRole{Key: WarehouseRoleKey, Builtin: true}
	for _, key := range []string{PermissionSystemRolePermissionManage, PermissionCustomerConfigActivate, PermissionERPBusinessChainDebugRead} {
		if err := ValidateRolePermissionPolicy(role, []string{key}); !errors.Is(err, ErrPermissionNotDelegable) {
			t.Fatalf("protected permission %s: %v", key, err)
		}
	}
	if err := ValidateRolePermissionPolicy(role, []string{"unknown.permission"}); !errors.Is(err, ErrPermissionNotFound) {
		t.Fatalf("unknown permission: %v", err)
	}
	for _, role := range []AdminRole{{Key: "arbitrary-role"}, {Key: AdminRoleKey}, {Key: DebugOperatorRoleKey}} {
		if err := ValidateRolePermissionPolicy(role, []string{PermissionWarehouseInventoryRead}); !errors.Is(err, ErrRolePermissionPolicy) {
			t.Fatalf("unregistered or protected role %s was editable: %v", role.Key, err)
		}
	}
	if !builtinRoleAllowsPermission(WarehouseRoleKey, PermissionFinancePaymentPost) || builtinRoleAllowsPermission(WarehouseRoleKey, PermissionSystemRolePermissionManage) {
		t.Fatal("customer configuration must use the same editable business boundary")
	}
	if builtinRoleHasPermission(WarehouseRoleKey, PermissionFinancePaymentPost) {
		t.Fatal("an editable capability must not become a default duty or approval responsibility")
	}
}

func TestRolePermissionPolicySaveAndPreviewPreserveExplicitSelection(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})
	before := repo.roleByKey(WarehouseRoleKey)
	wanted := []string{PermissionFinancePaymentRead, PermissionFinancePaymentPost}
	preview, err := uc.GetRoleForAccessPreview(ctx, before.Key, wanted)
	if err != nil || !slices.Equal(preview.Permissions, NormalizePermissionKeys(wanted)) {
		t.Fatalf("preview: %#v err=%v", preview, err)
	}
	if !slices.Equal(repo.roleByKey(before.Key).Permissions, before.Permissions) || len(repo.auditEvents) != 0 {
		t.Fatal("preview mutated the saved role or emitted a success audit")
	}
	for _, candidate := range [][]string{wanted, {}} {
		current := repo.roleByKey(before.Key)
		updated, err := uc.SetRoleSettings(ctx, current.Key, candidate, []RoleDataScope{{ResourceType: DataScopeResourceWarehouse, Mode: DataScopeModeAll}}, RoleNavigationModeRecommended, nil, nil, current.Version)
		if err != nil || !slices.Equal(updated.Permissions, NormalizePermissionKeys(candidate)) || updated.Version != current.Version+1 {
			t.Fatalf("save: %#v err=%v", updated, err)
		}
	}
	if len(repo.auditEvents) != 2 {
		t.Fatalf("successful saves must retain audit events, got %d", len(repo.auditEvents))
	}
	current := repo.roleByKey(before.Key)
	for _, candidate := range [][]string{{PermissionSystemRolePermissionManage}, {"unknown.permission"}} {
		if _, err := uc.SetRoleSettings(ctx, current.Key, candidate, nil, RoleNavigationModeRecommended, nil, nil, current.Version); err == nil {
			t.Fatal("protected or unknown permission was saved")
		}
		if _, err := uc.GetRoleForAccessPreview(ctx, current.Key, candidate); err == nil {
			t.Fatal("protected or unknown permission was previewed")
		}
	}
	after := repo.roleByKey(before.Key)
	if after.Version != current.Version || !slices.Equal(after.Permissions, current.Permissions) || len(repo.auditEvents) != 2 {
		t.Fatal("rejected changes mutated configuration or emitted a success audit")
	}
}
