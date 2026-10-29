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

func TestRolePermissionPolicyUsesRegisteredRoleAndPreservesDuties(t *testing.T) {
	for _, definition := range BuiltinRoles() {
		role := AdminRole{Key: definition.Key, Type: definition.Type, Builtin: definition.Builtin, Permissions: definition.Permissions}
		if IsSystemManagedRole(role) {
			continue
		}
		t.Run(role.Key, func(t *testing.T) {
			policy := RolePermissionPolicyFor(role)
			if !policy.Registered || len(policy.Required) == 0 || len(policy.MissingRequired) != 0 || len(policy.OutsideTemplate) != 0 {
				t.Fatalf("registered role does not satisfy its template: %#v", policy)
			}
			if err := ValidateRolePermissionPolicy(role, policy.Required); err != nil {
				t.Fatalf("core-only configuration: %v", err)
			}
			for _, optional := range policy.Optional {
				candidate := append(slices.Clone(policy.Required), optional)
				if err := ValidateRolePermissionPolicy(role, candidate); err != nil {
					t.Fatalf("registered assistance %s: %v", optional, err)
				}
			}
			if err := ValidateRolePermissionPolicy(role, policy.Required[1:]); !errors.Is(err, ErrRolePermissionPolicy) {
				t.Fatalf("removing a core capability: %v", err)
			}
		})
	}
	warehouse := AdminRole{Key: WarehouseRoleKey, Builtin: true}
	policy := RolePermissionPolicyFor(warehouse)
	if !slices.Contains(policy.Required, PermissionPurchaseOrderRead) || !slices.Contains(policy.Required, PermissionWarehouseInboundConfirm) {
		t.Fatal("warehouse source reads and inbound posting must stay core")
	}
	if err := ValidateRolePermissionPolicy(warehouse, append(policy.Required, PermissionFinancePaymentPost)); !errors.Is(err, ErrRolePermissionPolicy) {
		t.Fatalf("cross-domain permission was accepted: %v", err)
	}
	if err := ValidateRolePermissionPolicy(AdminRole{Key: "arbitrary-role"}, []string{PermissionWarehouseInventoryRead}); !errors.Is(err, ErrRolePermissionPolicy) {
		t.Fatalf("unregistered role was editable: %v", err)
	}
}

func TestRolePermissionPolicyRejectsInvalidSaveAndPreviewWithoutMutation(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})
	before := repo.roleByKey(WarehouseRoleKey)
	for _, candidate := range [][]string{
		{PermissionWarehouseInventoryRead},
		append(slices.Clone(before.Permissions), PermissionFinancePaymentPost),
	} {
		if _, err := uc.SetRoleSettings(ctx, before.Key, candidate, nil, RoleNavigationModeRecommended, nil, nil, before.Version); !errors.Is(err, ErrRolePermissionPolicy) {
			t.Fatalf("invalid save: %v", err)
		}
		if _, err := uc.GetRoleForAccessPreview(ctx, before.Key, candidate); !errors.Is(err, ErrRolePermissionPolicy) {
			t.Fatalf("invalid preview: %v", err)
		}
	}
	after := repo.roleByKey(WarehouseRoleKey)
	if after.Version != before.Version || !slices.Equal(before.Permissions, after.Permissions) || len(repo.auditEvents) != 0 {
		t.Fatal("rejected role change mutated configuration or emitted a success audit")
	}
}
