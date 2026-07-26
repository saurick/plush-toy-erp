package biz

import (
	"context"
	"errors"
	"testing"
)

type approvalSettingsAdminDirectory struct {
	admins []*AdminUser
	err    error
}

func (d approvalSettingsAdminDirectory) GetAdminByID(_ context.Context, id int) (*AdminUser, error) {
	for _, admin := range d.admins {
		if admin != nil && admin.ID == id {
			return admin, nil
		}
	}
	return nil, ErrAdminNotFound
}

func (d approvalSettingsAdminDirectory) ListAdmins(context.Context) ([]*AdminUser, error) {
	return d.admins, d.err
}

func activeApprovalSettingsFixture(t *testing.T) (*CustomerConfigUsecase, *memCustomerConfigRepo, CustomerConfigPublishInput, *CustomerConfigRevision) {
	t.Helper()
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.RoleProfiles = append(
		in.RoleProfiles,
		RoleProfileInput{RoleKey: PurchaseRoleKey, DisplayName: "采购"},
		RoleProfileInput{RoleKey: BossRoleKey, DisplayName: "老板"},
	)
	_, err := uc.PublishCustomerConfig(ctx, in, 1)
	if err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	active, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, in.Revision, 1)
	if err != nil {
		t.Fatalf("activateCustomerConfigForTest error = %v", err)
	}
	return uc, repo, in, active
}

func validApprovalSettingsRevision(active *CustomerConfigRevision) ApprovalSettingsRevisionInput {
	return ApprovalSettingsRevisionInput{
		CustomerKey:            active.CustomerKey,
		Revision:               active.Revision + ".approval.1",
		ExpectedActiveRevision: active.Revision,
		ExpectedActiveHash:     active.ConfigHash,
		Items: []ApprovalSettingItemInput{
			{
				ApprovalKey: ApprovalSettingSalesOrder,
				Enabled:     true,
				Members: []ApprovalSettingMemberInput{
					{RoleKey: SalesRoleKey, Strategy: ApprovalMemberStrategyPrimary, Enabled: true},
					{RoleKey: BossRoleKey, Strategy: ApprovalMemberStrategyEscalation, Enabled: true},
				},
			},
			{
				ApprovalKey: ApprovalSettingPurchaseOrder,
				Enabled:     true,
				Members: []ApprovalSettingMemberInput{
					{RoleKey: PurchaseRoleKey, UserID: 22, Strategy: ApprovalMemberStrategyPrimary, Enabled: true},
					{RoleKey: BossRoleKey, Strategy: ApprovalMemberStrategyBackup, Enabled: true},
				},
			},
			{
				ApprovalKey: ApprovalSettingShipmentFinance,
				Enabled:     true,
				Members: []ApprovalSettingMemberInput{
					{RoleKey: FinanceRoleKey, Strategy: ApprovalMemberStrategyPrimary, Enabled: true},
				},
			},
		},
	}
}

func TestApprovalSettingsPreviewBuildsFixedPoolsAndEffectiveTiers(t *testing.T) {
	uc, _, _, active := activeApprovalSettingsFixture(t)
	preview, err := uc.PreviewApprovalSettingsRevision(context.Background(), validApprovalSettingsRevision(active))
	if err != nil {
		t.Fatalf("PreviewApprovalSettingsRevision error = %v", err)
	}
	if preview.Source != "approval_settings_preview" || preview.PublishInput == nil {
		t.Fatalf("preview = %#v", preview)
	}
	if got := approvalSettingsEnabledMap(preview.PublishInput.CompiledSnapshot); !got[ApprovalSettingSalesOrder] || !got[ApprovalSettingPurchaseOrder] || !got[ApprovalSettingShipmentFinance] {
		t.Fatalf("approval settings snapshot = %#v", got)
	}
	var sales ApprovalSettingItemExplanation
	for _, item := range preview.Items {
		if item.ApprovalKey == ApprovalSettingSalesOrder {
			sales = item
		}
	}
	if len(sales.EffectiveRoleKeys) != 1 || sales.EffectiveRoleKeys[0] != SalesRoleKey || sales.EffectiveStrategy != ApprovalMemberStrategyPrimary {
		t.Fatalf("sales effective candidates = %#v strategy=%q", sales.EffectiveRoleKeys, sales.EffectiveStrategy)
	}
	if len(sales.BlockedReasons) != 0 {
		t.Fatalf("sales blockers = %#v", sales.BlockedReasons)
	}
}

func TestApprovalSettingsMissingSnapshotIsUnconfiguredNotDisabled(t *testing.T) {
	uc, _, _, active := activeApprovalSettingsFixture(t)
	settings, err := uc.GetApprovalSettings(context.Background(), active.CustomerKey)
	if err != nil {
		t.Fatalf("GetApprovalSettings error = %v", err)
	}
	for _, item := range settings.Items {
		if !item.Configurable {
			continue
		}
		if item.Configured || item.Enabled {
			t.Fatalf("missing approval snapshot item = %#v", item)
		}
		if !stringSliceContains(item.BlockedReasons, "approval_settings_not_published") {
			t.Fatalf("missing approval snapshot blockers = %#v", item.BlockedReasons)
		}
		if stringSliceContains(item.BlockedReasons, "approval_disabled") {
			t.Fatalf("unconfigured approval must not be reported disabled: %#v", item.BlockedReasons)
		}
	}
}

func TestApprovalSettingsFallbackAndDisabledFailClosed(t *testing.T) {
	uc, _, _, active := activeApprovalSettingsFixture(t)
	in := validApprovalSettingsRevision(active)
	in.Items[0].Members[0].Enabled = false
	preview, err := uc.PreviewApprovalSettingsRevision(context.Background(), in)
	if err != nil {
		t.Fatalf("PreviewApprovalSettingsRevision fallback error = %v", err)
	}
	sales := preview.Items[0]
	if len(sales.EffectiveRoleKeys) != 1 || sales.EffectiveRoleKeys[0] != BossRoleKey || sales.EffectiveStrategy != ApprovalMemberStrategyEscalation {
		t.Fatalf("fallback candidates = %#v strategy=%q", sales.EffectiveRoleKeys, sales.EffectiveStrategy)
	}

	in.Items[0].Enabled = false
	preview, err = uc.PreviewApprovalSettingsRevision(context.Background(), in)
	if err != nil {
		t.Fatalf("PreviewApprovalSettingsRevision disabled error = %v", err)
	}
	sales = preview.Items[0]
	if !sales.Configured ||
		!stringSliceContains(sales.BlockedReasons, "approval_disabled") ||
		stringSliceContains(sales.BlockedReasons, "approval_settings_not_published") ||
		stringSliceContains(sales.BlockedReasons, "no_eligible_approver") {
		t.Fatalf("disabled blockers = %#v", sales.BlockedReasons)
	}
}

func TestDisabledApprovalBlocksNewRuntimeBeforeProcessCreation(t *testing.T) {
	tests := []struct {
		name            string
		processKey      string
		variantKey      string
		businessRefType string
		approvalKey     string
	}{
		{
			name:            "sales order approval",
			processKey:      ProcessKeySalesOrderAcceptance,
			variantKey:      CustomerProcessVariantSalesApprovalPMC,
			businessRefType: "sales_order",
			approvalKey:     ApprovalSettingSalesOrder,
		},
		{
			name:            "purchase order approval",
			processKey:      ProcessKeyMaterialSupply,
			variantKey:      CustomerProcessVariantPurchaseOrderApproval,
			businessRefType: "purchase_order",
			approvalKey:     ApprovalSettingPurchaseOrder,
		},
		{
			name:            "shipment finance approval",
			processKey:      ProcessKeyFinishedGoodsDelivery,
			variantKey:      CustomerProcessVariantShipmentFinanceApproval,
			businessRefType: "shipment",
			approvalKey:     ApprovalSettingShipmentFinance,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			addRuntimeProcessSelection(&in, test.processKey, "v1", test.variantKey, test.businessRefType)
			in.CompiledSnapshot["approval_settings"] = approvalSettingsSnapshot([]ApprovalSettingItemInput{
				{ApprovalKey: ApprovalSettingSalesOrder, Enabled: false},
				{ApprovalKey: ApprovalSettingPurchaseOrder, Enabled: false},
				{ApprovalKey: ApprovalSettingShipmentFinance, Enabled: false},
			})
			published, err := uc.PublishCustomerConfig(ctx, in, 1)
			if err != nil {
				t.Fatalf("PublishCustomerConfig error = %v", err)
			}
			if _, err := activateCustomerConfigForTest(ctx, uc, repo, in.CustomerKey, published.Revision, 1); err != nil {
				t.Fatalf("activateCustomerConfigForTest error = %v", err)
			}

			_, err = uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
				CustomerKey:     in.CustomerKey,
				ProcessKey:      test.processKey,
				BusinessRefType: test.businessRefType,
				BusinessRefID:   1001,
				IdempotencyKey:  test.processKey + "/disabled-approval",
			})
			if !errors.Is(err, ErrCustomerConfigTransitionBlocked) {
				t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v, want ErrCustomerConfigTransitionBlocked", err)
			}

			explanation, err := uc.ExplainProcessDefinition(ctx, in.CustomerKey, test.processKey)
			if err != nil {
				t.Fatalf("ExplainProcessDefinition error = %v", err)
			}
			if explanation.CanStartRuntime || !stringSliceContains(explanation.StartBlockedReasons, "approval_disabled") {
				t.Fatalf("disabled %s explanation = %#v", test.approvalKey, explanation)
			}
		})
	}
}

func TestApprovalSettingsValidatorAllowsDisabledUnselectedPoolsToBeAbsent(t *testing.T) {
	in := validCustomerConfigInput()
	in.CompiledSnapshot["approval_settings"] = approvalSettingsSnapshot([]ApprovalSettingItemInput{
		{
			ApprovalKey: ApprovalSettingSalesOrder,
			Enabled:     true,
		},
		{ApprovalKey: ApprovalSettingPurchaseOrder, Enabled: false},
		{ApprovalKey: ApprovalSettingShipmentFinance, Enabled: false},
	})
	in.RoleProfiles = append(in.RoleProfiles, RoleProfileInput{
		RoleKey: SalesRoleKey, DisplayName: "业务",
	})
	in.AccessEntitlements = append(in.AccessEntitlements, AccessEntitlementInput{
		RoleKey: SalesRoleKey, CapabilityKey: PermissionWorkflowTaskApprove,
		ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true,
	})
	in.WorkPools = append(in.WorkPools, WorkPoolInput{
		PoolKey: "approval.sales_order", ModuleKey: "sales_orders", DisplayName: "销售审批",
	})
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey: "approval.sales_order", RoleKey: SalesRoleKey,
		Strategy: ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
	})

	if err := validateApprovalSettingsPublishInput(in); err != nil {
		t.Fatalf("disabled unselected approval pools may be absent: %v", err)
	}

	in.CompiledSnapshot["approval_settings"] = approvalSettingsSnapshot([]ApprovalSettingItemInput{
		{ApprovalKey: ApprovalSettingSalesOrder, Enabled: true},
		{ApprovalKey: ApprovalSettingPurchaseOrder, Enabled: true},
		{ApprovalKey: ApprovalSettingShipmentFinance, Enabled: false},
	})
	if err := validateApprovalSettingsPublishInput(in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("enabled approval without its pool error = %v, want ErrBadParam", err)
	}
}

func TestApprovalSettingsRejectsStaleCASAndUnconfigurableItem(t *testing.T) {
	uc, _, _, active := activeApprovalSettingsFixture(t)
	in := validApprovalSettingsRevision(active)
	in.ExpectedActiveHash = "stale"
	if _, err := uc.PreviewApprovalSettingsRevision(context.Background(), in); !errors.Is(err, ErrCustomerConfigTransitionBlocked) {
		t.Fatalf("stale preview error = %v", err)
	}

	in = validApprovalSettingsRevision(active)
	in.Items[0].ApprovalKey = "payment"
	if _, err := uc.PreviewApprovalSettingsRevision(context.Background(), in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("payment preview error = %v", err)
	}
}

func TestApprovalSettingsRejectsAmbiguousOrDuplicateResponsibility(t *testing.T) {
	uc, _, _, active := activeApprovalSettingsFixture(t)
	testCases := []struct {
		name   string
		change func(*ApprovalSettingsRevisionInput)
	}{
		{
			name: "same priority has multiple roles",
			change: func(in *ApprovalSettingsRevisionInput) {
				in.Items[0].Members = append(in.Items[0].Members,
					ApprovalSettingMemberInput{
						RoleKey: PurchaseRoleKey, Strategy: ApprovalMemberStrategyPrimary, Enabled: true,
					},
				)
			},
		},
		{
			name: "same member appears in multiple tiers",
			change: func(in *ApprovalSettingsRevisionInput) {
				in.Items[0].Members = append(in.Items[0].Members,
					ApprovalSettingMemberInput{
						RoleKey: SalesRoleKey, Strategy: ApprovalMemberStrategyBackup, Enabled: true,
					},
				)
			},
		},
		{
			name: "multiple named employees widen to role pool",
			change: func(in *ApprovalSettingsRevisionInput) {
				in.Items[1].Members = append(in.Items[1].Members,
					ApprovalSettingMemberInput{
						RoleKey: PurchaseRoleKey, UserID: 23,
						Strategy: ApprovalMemberStrategyPrimary, Enabled: true,
					},
				)
			},
		},
		{
			name: "enabled item has no enabled member",
			change: func(in *ApprovalSettingsRevisionInput) {
				for index := range in.Items[2].Members {
					in.Items[2].Members[index].Enabled = false
				}
			},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			in := validApprovalSettingsRevision(active)
			testCase.change(&in)
			if _, err := uc.PreviewApprovalSettingsRevision(context.Background(), in); !errors.Is(err, ErrBadParam) {
				t.Fatalf("PreviewApprovalSettingsRevision error = %v, want ErrBadParam", err)
			}
		})
	}
}

func TestApprovalCandidateResolverChoosesLowestEligiblePriority(t *testing.T) {
	uc, repo, in, active := activeApprovalSettingsFixture(t)
	key := customerRevisionKey(in.CustomerKey, active.Revision)
	repo.entitlements[key] = append(repo.entitlements[key],
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: PermissionWorkflowTaskApprove, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true},
		AccessEntitlementInput{RoleKey: BossRoleKey, CapabilityKey: PermissionWorkflowTaskApprove, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true},
	)
	repo.memberships[key] = append(repo.memberships[key],
		WorkPoolMembershipInput{PoolKey: "approval.test", RoleKey: BossRoleKey, Strategy: ApprovalMemberStrategyEscalation, Priority: 300, Enabled: true},
		WorkPoolMembershipInput{PoolKey: "approval.test", RoleKey: SalesRoleKey, Strategy: ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true},
	)
	explanation, err := uc.WorkflowCandidateOwnerRoleKeysAtRevision(
		context.Background(), in.CustomerKey, active.Revision, "approval.test", PermissionWorkflowTaskApprove,
	)
	if err != nil {
		t.Fatalf("WorkflowCandidateOwnerRoleKeysAtRevision error = %v", err)
	}
	if len(explanation.CandidateOwnerRoleKeys) != 1 || explanation.CandidateOwnerRoleKeys[0] != SalesRoleKey ||
		explanation.SelectedStrategy != ApprovalMemberStrategyPrimary || explanation.SelectedPriority != 100 {
		t.Fatalf("candidate explanation = %#v", explanation)
	}
}

func TestApprovalCandidateResolverHonorsNamedMultiRoleAndFallbackOrder(t *testing.T) {
	uc, repo, in, active := activeApprovalSettingsFixture(t)
	primary := &AdminUser{
		ID:       22,
		Disabled: true,
		Roles:    []AdminRole{{Key: SalesRoleKey}, {Key: FinanceRoleKey}},
	}
	backup := &AdminUser{
		ID:    23,
		Roles: []AdminRole{{Key: PurchaseRoleKey}, {Key: FinanceRoleKey}},
	}
	escalation := &AdminUser{ID: 24, Roles: []AdminRole{{Key: BossRoleKey}}}
	uc.adminDirectory = approvalSettingsAdminDirectory{
		admins: []*AdminUser{primary, backup, escalation},
	}

	key := customerRevisionKey(in.CustomerKey, active.Revision)
	repo.entitlements[key] = append(repo.entitlements[key],
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: PermissionWorkflowTaskApprove, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true},
		AccessEntitlementInput{RoleKey: PurchaseRoleKey, CapabilityKey: PermissionWorkflowTaskApprove, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true},
		AccessEntitlementInput{RoleKey: BossRoleKey, CapabilityKey: PermissionWorkflowTaskApprove, ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true},
	)
	repo.memberships[key] = append(repo.memberships[key],
		WorkPoolMembershipInput{
			PoolKey: "approval.sales_order", RoleKey: SalesRoleKey, UserID: primary.ID,
			Strategy: ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
		},
		WorkPoolMembershipInput{
			PoolKey: "approval.sales_order", RoleKey: PurchaseRoleKey,
			Strategy: ApprovalMemberStrategyBackup, Priority: 200, Enabled: true,
		},
		WorkPoolMembershipInput{
			PoolKey: "approval.sales_order", RoleKey: BossRoleKey,
			Strategy: ApprovalMemberStrategyEscalation, Priority: 300, Enabled: true,
		},
	)

	fallback, err := uc.WorkflowCandidateOwnerRoleKeysAtRevision(
		context.Background(),
		in.CustomerKey,
		active.Revision,
		"approval.sales_order",
		PermissionWorkflowTaskApprove,
	)
	if err != nil {
		t.Fatalf("fallback candidate error = %v", err)
	}
	if len(fallback.CandidateOwnerRoleKeys) != 1 ||
		fallback.CandidateOwnerRoleKeys[0] != PurchaseRoleKey ||
		fallback.SelectedStrategy != ApprovalMemberStrategyBackup ||
		len(fallback.CandidateAssigneeIDs) != 0 {
		t.Fatalf("fallback candidate = %#v", fallback)
	}
	if roles, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(),
		in.CustomerKey,
		active.Revision,
		"approval.sales_order",
		backup,
		PermissionWorkflowTaskApprove,
	); err != nil || len(roles) != 1 || roles[0] != PurchaseRoleKey {
		t.Fatalf("backup visibility roles=%#v err=%v", roles, err)
	}
	if roles, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(),
		in.CustomerKey,
		active.Revision,
		"approval.sales_order",
		escalation,
		PermissionWorkflowTaskApprove,
	); err != nil || len(roles) != 0 {
		t.Fatalf("escalation must wait for backup roles=%#v err=%v", roles, err)
	}

	primary.Disabled = false
	selected, err := uc.WorkflowCandidateOwnerRoleKeysAtRevision(
		context.Background(),
		in.CustomerKey,
		active.Revision,
		"approval.sales_order",
		PermissionWorkflowTaskApprove,
	)
	if err != nil {
		t.Fatalf("named primary candidate error = %v", err)
	}
	if len(selected.CandidateOwnerRoleKeys) != 1 ||
		selected.CandidateOwnerRoleKeys[0] != SalesRoleKey ||
		len(selected.CandidateAssigneeIDs) != 1 ||
		selected.CandidateAssigneeIDs[0] != primary.ID ||
		selected.SelectedStrategy != ApprovalMemberStrategyPrimary {
		t.Fatalf("named multi-role primary candidate = %#v", selected)
	}
	if roles, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(),
		in.CustomerKey,
		active.Revision,
		"approval.sales_order",
		backup,
		PermissionWorkflowTaskApprove,
	); err != nil || len(roles) != 0 {
		t.Fatalf("backup must not cross active primary roles=%#v err=%v", roles, err)
	}
}

func TestWorkflowVisibilityAtRevisionRequiresExactPoolMembershipAndEntitlement(t *testing.T) {
	uc, repo, in, active := activeApprovalSettingsFixture(t)
	key := customerRevisionKey(in.CustomerKey, active.Revision)
	repo.entitlements[key] = append(repo.entitlements[key],
		AccessEntitlementInput{
			RoleKey: SalesRoleKey, CapabilityKey: PermissionWorkflowTaskApprove,
			ScopeType: "customer", ScopeValue: in.CustomerKey, Enabled: true,
		},
	)
	repo.memberships[key] = append(repo.memberships[key],
		WorkPoolMembershipInput{
			PoolKey: "approval.sales_order", RoleKey: SalesRoleKey, UserID: 22,
			Strategy: ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
		},
		WorkPoolMembershipInput{
			PoolKey: "approval.role", RoleKey: SalesRoleKey,
			Strategy: ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
		},
	)

	named, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(), in.CustomerKey, active.Revision, "approval.sales_order",
		&AdminUser{ID: 22, Roles: []AdminRole{{Key: SalesRoleKey}}}, PermissionWorkflowTaskApprove,
	)
	if err != nil || len(named) != 1 || named[0] != SalesRoleKey {
		t.Fatalf("named member roles=%#v err=%v", named, err)
	}
	namedWithoutRole, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(), in.CustomerKey, active.Revision, "approval.sales_order",
		&AdminUser{ID: 22}, PermissionWorkflowTaskApprove,
	)
	if err != nil || len(namedWithoutRole) != 0 {
		t.Fatalf("named user without configured role crossed pool roles=%#v err=%v", namedWithoutRole, err)
	}
	otherSameRole, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(), in.CustomerKey, active.Revision, "approval.sales_order",
		&AdminUser{ID: 23, Roles: []AdminRole{{Key: SalesRoleKey}}}, PermissionWorkflowTaskApprove,
	)
	if err != nil || len(otherSameRole) != 0 {
		t.Fatalf("other same-role user crossed named pool roles=%#v err=%v", otherSameRole, err)
	}
	roleMember, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(), in.CustomerKey, active.Revision, "approval.role",
		&AdminUser{ID: 23, Roles: []AdminRole{{Key: SalesRoleKey}}}, PermissionWorkflowTaskApprove,
	)
	if err != nil || len(roleMember) != 1 || roleMember[0] != SalesRoleKey {
		t.Fatalf("role member roles=%#v err=%v", roleMember, err)
	}
	noEntitlement, err := uc.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
		context.Background(), in.CustomerKey, active.Revision, "approval.role",
		&AdminUser{ID: 23, Roles: []AdminRole{{Key: SalesRoleKey}}}, PermissionWorkflowTaskComplete,
	)
	if err != nil || len(noEntitlement) != 0 {
		t.Fatalf("pool-only member must fail without entitlement roles=%#v err=%v", noEntitlement, err)
	}
}
