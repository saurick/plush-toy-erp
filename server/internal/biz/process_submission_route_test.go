package biz

import (
	"context"
	"errors"
	"testing"
)

func submissionRouteFixture(t *testing.T, contract customerProcessContract) (*CustomerConfigUsecase, *memCustomerConfigRepo, *CustomerConfigRevision) {
	t.Helper()
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	selection := contract.Selection
	addRuntimeProcessSelection(&in, selection.ProcessKey, selection.ProcessVersion, selection.VariantKey, selection.BusinessRefType)
	for index := range in.ModuleStates {
		in.ModuleStates[index].State = "enabled"
	}
	in.ModuleStates = append(in.ModuleStates, DeploymentModuleStateInput{ModuleKey: "finance_payments", State: "enabled"})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{PoolKey: "boss", ModuleKey: "workflow_tasks", DisplayName: "审批"})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{PoolKey: "boss", RoleKey: BossRoleKey, Enabled: true})
	for _, capability := range []string{PermissionFinancePaymentApprove, PermissionWarehouseAdjustmentApprove, PermissionProductionExceptionApprove} {
		in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{RoleKey: BossRoleKey, CapabilityKey: capability, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true})
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 1); err != nil {
		t.Fatal(err)
	}
	active, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 1)
	if err != nil {
		t.Fatal(err)
	}
	return uc, repo, active
}

func TestProcessSubmissionRouteUsesConfiguredResponsibilityAcrossAllContracts(t *testing.T) {
	for _, contract := range builtinCustomerProcessContracts() {
		t.Run(contract.Selection.ProcessKey+"/"+contract.Selection.VariantKey, func(t *testing.T) {
			uc, repo, active := submissionRouteFixture(t, contract)
			beforeHash := active.ConfigHash
			route, err := uc.GetProcessSubmissionRoute(context.Background(), active.CustomerKey, contract.Selection.ProcessKey)
			if err != nil {
				t.Fatal(err)
			}
			wantRole := BossRoleKey
			if contract.Selection.ProcessKey == ProcessKeyFinishedGoodsDelivery {
				wantRole = FinanceRoleKey
			}
			if route.OwnerRoleKey != wantRole || route.ConfigRevision != active.Revision || route.AssigneeDisplayName != "" {
				t.Fatalf("unexpected responsibility: %+v", route)
			}
			if len(repo.revisions) != 1 || active.ConfigHash != beforeHash {
				t.Fatal("preview mutated configuration")
			}
		})
	}
}

func TestProcessSubmissionRouteUsesNamedMemberAndRejectsMissingResponsibility(t *testing.T) {
	uc, repo, active := submissionRouteFixture(t, newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalPMC, false))
	key := customerRevisionKey(active.CustomerKey, active.Revision)
	for index := range repo.memberships[key] {
		if repo.memberships[key][index].PoolKey == "approval.sales_order" {
			repo.memberships[key][index].UserID = 42
		}
	}
	uc.adminDirectory = approvalSettingsAdminDirectory{admins: []*AdminUser{{ID: 42, Username: "approver", DisplayName: "审核负责人", Roles: []AdminRole{{Key: BossRoleKey}}}}}
	route, err := uc.GetProcessSubmissionRoute(context.Background(), active.CustomerKey, ProcessKeySalesOrderAcceptance)
	if err != nil || route.AssigneeDisplayName != "审核负责人" {
		t.Fatalf("route=%+v err=%v", route, err)
	}
	uc.adminDirectory = approvalSettingsAdminDirectory{admins: []*AdminUser{}}
	if _, err := uc.GetProcessSubmissionRoute(context.Background(), active.CustomerKey, ProcessKeySalesOrderAcceptance); !errors.Is(err, ErrProcessTaskOwnerRoleNotFound) {
		t.Fatalf("missing member must not fabricate a default: %v", err)
	}
	active.CompiledSnapshot["approval_settings"] = approvalSettingsSnapshot([]ApprovalSettingItemInput{{ApprovalKey: ApprovalSettingSalesOrder, Enabled: false}})
	if _, err := uc.GetProcessSubmissionRoute(context.Background(), active.CustomerKey, ProcessKeySalesOrderAcceptance); !errors.Is(err, ErrCustomerConfigTransitionBlocked) {
		t.Fatalf("disabled approval must fail closed: %v", err)
	}
}

func TestProcessSubmissionRouteConditionsAndAmbiguousResponsibility(t *testing.T) {
	uc, repo, active := submissionRouteFixture(t, newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalPMC, false))
	active.CompiledSnapshot["approval_settings"] = approvalSettingsSnapshot([]ApprovalSettingItemInput{{
		ApprovalKey: ApprovalSettingSalesOrder, Enabled: true,
		Condition: ApprovalCondition{Mode: ApprovalConditionAmount, Amount: "5000", Currency: "CNY"},
	}})
	route, err := uc.GetProcessSubmissionRoute(context.Background(), active.CustomerKey, ProcessKeySalesOrderAcceptance)
	if err != nil || route.Condition.Mode != ApprovalConditionAmount || route.Condition.Amount != "5000" {
		t.Fatalf("amount route=%+v err=%v", route, err)
	}
	key := customerRevisionKey(active.CustomerKey, active.Revision)
	repo.memberships[key] = append(repo.memberships[key], WorkPoolMembershipInput{
		PoolKey: "approval.sales_order", RoleKey: FinanceRoleKey, Enabled: true, Strategy: ApprovalMemberStrategyPrimary, Priority: 100,
	})
	if _, err := uc.GetProcessSubmissionRoute(context.Background(), active.CustomerKey, ProcessKeySalesOrderAcceptance); !errors.Is(err, ErrProcessTaskOwnerRoleAmbiguous) {
		t.Fatalf("ambiguous responsibility must not pick an arbitrary role: %v", err)
	}
}

func TestApprovalSettingsApplyPreservesExecutableProcessDefinition(t *testing.T) {
	ctx := context.Background()
	uc, _, active := submissionRouteFixture(t, newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalPMC, false))
	settings, err := uc.GetApprovalSettings(ctx, active.CustomerKey)
	if err != nil {
		t.Fatal(err)
	}
	items := []ApprovalSettingItemInput{}
	for _, item := range settings.Items {
		if !item.Configurable {
			continue
		}
		members := []ApprovalSettingMemberInput{}
		for _, member := range item.Members {
			members = append(members, ApprovalSettingMemberInput{RoleKey: member.RoleKey, UserID: member.UserID, Strategy: member.Strategy, Enabled: member.Enabled})
		}
		items = append(items, ApprovalSettingItemInput{ApprovalKey: item.ApprovalKey, Enabled: item.Enabled, Condition: item.Condition, Members: members})
	}
	updated, err := uc.ApplyApprovalSettingsRevision(ctx, ApprovalSettingsRevisionInput{
		CustomerKey: active.CustomerKey, Revision: "responsibility-update", ExpectedActiveRevision: active.Revision, ExpectedActiveHash: active.ConfigHash, Items: items,
	}, 1)
	if err != nil {
		t.Fatal(err)
	}
	route, err := uc.GetProcessSubmissionRoute(ctx, active.CustomerKey, ProcessKeySalesOrderAcceptance)
	if err != nil || route.ConfigRevision != updated.Revision {
		t.Fatalf("saved settings must retain the executable graph: route=%+v err=%v", route, err)
	}
	if _, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey: active.CustomerKey, ProcessKey: ProcessKeySalesOrderAcceptance, BusinessRefID: 1, IdempotencyKey: "after-responsibility-change",
	}); err != nil {
		t.Fatalf("new submissions must still compile after settings apply: %v", err)
	}
}
