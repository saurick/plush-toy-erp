package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestProcessDomainCommandAuthorizationUsesProcessRevisionAfterActiveSwitch(t *testing.T) {
	ctx := context.Background()
	const (
		customerKey = "yoyoosun"
		r1          = "yoyoosun-r1"
		r2          = "yoyoosun-r2"
	)
	activatedAt := time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC)

	newUsecase := func() (*CustomerConfigUsecase, *memCustomerConfigRepo) {
		repo := newMemCustomerConfigRepo()
		repo.revisions[customerRevisionKey(customerKey, r1)] = &CustomerConfigRevision{
			CustomerKey: customerKey,
			Revision:    r1,
			Status:      CustomerConfigStatusSuperseded,
			ActivatedAt: &activatedAt,
		}
		repo.revisions[customerRevisionKey(customerKey, r2)] = &CustomerConfigRevision{
			CustomerKey: customerKey,
			Revision:    r2,
			Status:      CustomerConfigStatusActive,
			ActivatedAt: &activatedAt,
		}
		repo.modules[customerRevisionKey(customerKey, r1)] = processRuntimeSalesSubmitModules("enabled")
		repo.modules[customerRevisionKey(customerKey, r2)] = processRuntimeSalesSubmitModules("disabled")
		repo.roles[customerRevisionKey(customerKey, r1)] = []RoleProfileInput{{RoleKey: SalesRoleKey, DisplayName: "销售"}}
		repo.roles[customerRevisionKey(customerKey, r2)] = []RoleProfileInput{{RoleKey: SalesRoleKey, DisplayName: "销售"}}
		repo.entitlements[customerRevisionKey(customerKey, r1)] = []AccessEntitlementInput{{
			RoleKey:       SalesRoleKey,
			CapabilityKey: PermissionSalesOrderSubmit,
			ScopeType:     "customer",
			ScopeValue:    customerKey,
			Enabled:       true,
		}}
		return NewCustomerConfigUsecase(repo), repo
	}

	admin := &AdminUser{
		ID:          7,
		Username:    "sales-r1",
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderSubmit},
		CreatedAt:   activatedAt,
		UpdatedAt:   activatedAt,
	}

	t.Run("R1 entitlement and modules remain authoritative", func(t *testing.T) {
		uc, _ := newUsecase()
		if err := uc.EnsureProcessDomainCommandAllowedAtRevision(
			ctx,
			customerKey,
			r1,
			admin,
			ProcessDomainCommandSalesOrderSubmit,
		); err != nil {
			t.Fatalf("R1 command rejected by active R2 boundary: %v", err)
		}
	})

	t.Run("R1 missing entitlement is denied even when R2 grants it", func(t *testing.T) {
		uc, repo := newUsecase()
		repo.entitlements[customerRevisionKey(customerKey, r1)] = nil
		repo.entitlements[customerRevisionKey(customerKey, r2)] = []AccessEntitlementInput{{
			RoleKey:       SalesRoleKey,
			CapabilityKey: PermissionSalesOrderSubmit,
			ScopeType:     "customer",
			ScopeValue:    customerKey,
			Enabled:       true,
		}}
		if err := uc.EnsureProcessDomainCommandAllowedAtRevision(ctx, customerKey, r1, admin, ProcessDomainCommandSalesOrderSubmit); !errors.Is(err, ErrNoPermission) {
			t.Fatalf("R2 entitlement widened R1 command: %v", err)
		}
	})

	t.Run("R1 disabled module is denied even when R2 enables it", func(t *testing.T) {
		uc, repo := newUsecase()
		repo.modules[customerRevisionKey(customerKey, r1)] = processRuntimeSalesSubmitModules("disabled")
		repo.modules[customerRevisionKey(customerKey, r2)] = processRuntimeSalesSubmitModules("enabled")
		if err := uc.EnsureProcessDomainCommandAllowedAtRevision(ctx, customerKey, r1, admin, ProcessDomainCommandSalesOrderSubmit); !errors.Is(err, ErrBadParam) {
			t.Fatalf("R2 modules widened R1 command: %v", err)
		}
	})

	t.Run("backend RBAC remains the upper bound", func(t *testing.T) {
		uc, _ := newUsecase()
		withoutRBAC := *admin
		withoutRBAC.Permissions = nil
		if err := uc.EnsureProcessDomainCommandAllowedAtRevision(ctx, customerKey, r1, &withoutRBAC, ProcessDomainCommandSalesOrderSubmit); !errors.Is(err, ErrNoPermission) {
			t.Fatalf("customer entitlement bypassed backend RBAC: %v", err)
		}
	})

	t.Run("never activated revision is rejected", func(t *testing.T) {
		uc, repo := newUsecase()
		repo.revisions[customerRevisionKey(customerKey, r1)].Status = CustomerConfigStatusPublished
		repo.revisions[customerRevisionKey(customerKey, r1)].ActivatedAt = nil
		if err := uc.EnsureProcessDomainCommandAllowedAtRevision(ctx, customerKey, r1, admin, ProcessDomainCommandSalesOrderSubmit); !errors.Is(err, ErrCustomerConfigNotFound) {
			t.Fatalf("published revision authorized runtime command: %v", err)
		}
	})
}

func processRuntimeSalesSubmitModules(workflowState string) []DeploymentModuleStateInput {
	return []DeploymentModuleStateInput{
		{ModuleKey: "customers", State: "enabled"},
		{ModuleKey: "products", State: "enabled"},
		{ModuleKey: "sales_orders", State: "enabled"},
		{ModuleKey: "workflow_tasks", State: workflowState},
	}
}
