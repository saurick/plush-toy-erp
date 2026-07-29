package biz

import (
	"context"
	"errors"
	"testing"
)

func approvalSettingsApplyInputForTest(
	active *CustomerConfigRevision,
	revision string,
) ApprovalSettingsRevisionInput {
	return ApprovalSettingsRevisionInput{
		CustomerKey:            active.CustomerKey,
		Revision:               revision,
		ExpectedActiveRevision: active.Revision,
		ExpectedActiveHash:     active.ConfigHash,
		Items: []ApprovalSettingItemInput{
			{
				ApprovalKey: ApprovalSettingSalesOrder,
				Enabled:     true,
				Members: []ApprovalSettingMemberInput{
					{
						RoleKey:  SalesRoleKey,
						Strategy: ApprovalMemberStrategyPrimary,
						Enabled:  true,
					},
					{
						RoleKey:  PMCRoleKey,
						Strategy: ApprovalMemberStrategyBackup,
						Enabled:  true,
					},
				},
			},
			{
				ApprovalKey: ApprovalSettingPurchaseOrder,
				Enabled:     true,
				Members: []ApprovalSettingMemberInput{
					{
						RoleKey:  PurchaseRoleKey,
						Strategy: ApprovalMemberStrategyPrimary,
						Enabled:  true,
					},
				},
			},
			{
				ApprovalKey: ApprovalSettingShipmentFinance,
				Enabled:     false,
				Members:     []ApprovalSettingMemberInput{},
			},
		},
	}
}

func activeApprovalSettingsBaseForTest(
	t *testing.T,
) (*CustomerConfigUsecase, *memCustomerConfigRepo, *CustomerConfigRevision) {
	t.Helper()
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	base := validCustomerConfigInput()
	base.Revision = "approval-active-v1"
	base.RoleProfiles = append(
		base.RoleProfiles,
		RoleProfileInput{RoleKey: PurchaseRoleKey, DisplayName: "采购"},
		RoleProfileInput{RoleKey: PMCRoleKey, DisplayName: "PMC"},
	)
	published, err := uc.PublishCustomerConfig(ctx, base, 1)
	if err != nil {
		t.Fatalf("PublishCustomerConfig() error = %v", err)
	}
	active, err := uc.ActivateCustomerConfig(
		ctx,
		published.CustomerKey,
		published.Revision,
		published.ConfigHash,
		published.ProductVersion,
		"",
		1,
	)
	if err != nil {
		t.Fatalf("ActivateCustomerConfig() error = %v", err)
	}
	return uc, repo, active
}

func TestApplyApprovalSettingsRevisionActivatesAtomicallyAndReplaysExactly(
	t *testing.T,
) {
	ctx := context.Background()
	uc, repo, active := activeApprovalSettingsBaseForTest(t)
	in := approvalSettingsApplyInputForTest(active, "approval-active-v2")

	applied, err := uc.ApplyApprovalSettingsRevision(ctx, in, 1)
	if err != nil {
		t.Fatalf("ApplyApprovalSettingsRevision() error = %v", err)
	}
	if applied.Status != CustomerConfigStatusActive ||
		applied.Revision != in.Revision ||
		applied.ActivatedAt == nil {
		t.Fatalf("applied = %#v", applied)
	}
	previous := repo.revisions[customerRevisionKey(active.CustomerKey, active.Revision)]
	if previous == nil || previous.Status != CustomerConfigStatusSuperseded {
		t.Fatalf("previous = %#v", previous)
	}
	if _, ok := repo.revisions[customerRevisionKey(active.CustomerKey, in.Revision)]; !ok {
		t.Fatal("active candidate revision was not persisted")
	}
	memberships := repo.memberships[customerRevisionKey(active.CustomerKey, in.Revision)]
	foundPMCBackup := false
	for _, membership := range memberships {
		foundPMCBackup = foundPMCBackup ||
			(membership.PoolKey == "approval.sales_order" &&
				membership.RoleKey == PMCRoleKey &&
				membership.Strategy == ApprovalMemberStrategyBackup &&
				membership.Enabled)
	}
	if !foundPMCBackup {
		t.Fatalf("memberships = %#v", memberships)
	}

	replayed, err := uc.ApplyApprovalSettingsRevision(ctx, in, 1)
	if err != nil {
		t.Fatalf("exact replay error = %v", err)
	}
	if replayed.Revision != applied.Revision ||
		replayed.ConfigHash != applied.ConfigHash ||
		replayed.Status != CustomerConfigStatusActive {
		t.Fatalf("replayed = %#v, applied = %#v", replayed, applied)
	}
}

func TestApplyApprovalSettingsRevisionRejectsChangedIntentAndStaleCASWithoutCandidate(
	t *testing.T,
) {
	ctx := context.Background()
	uc, repo, active := activeApprovalSettingsBaseForTest(t)
	in := approvalSettingsApplyInputForTest(active, "approval-active-v2")
	if _, err := uc.ApplyApprovalSettingsRevision(ctx, in, 1); err != nil {
		t.Fatalf("first apply error = %v", err)
	}

	changed := in
	changed.Items = append([]ApprovalSettingItemInput(nil), in.Items...)
	changed.Items[0] = in.Items[0]
	changed.Items[0].Members = append(
		[]ApprovalSettingMemberInput(nil),
		in.Items[0].Members...,
	)
	changed.Items[0].Members[1].Enabled = false
	if _, err := uc.ApplyApprovalSettingsRevision(ctx, changed, 1); !errors.Is(
		err,
		ErrCustomerConfigRevisionImmutable,
	) {
		t.Fatalf("changed replay error = %v", err)
	}

	stale := approvalSettingsApplyInputForTest(active, "approval-stale-v3")
	if _, err := uc.ApplyApprovalSettingsRevision(ctx, stale, 1); !errors.Is(
		err,
		ErrCustomerConfigTransitionBlocked,
	) {
		t.Fatalf("stale apply error = %v", err)
	}
	if _, exists := repo.revisions[customerRevisionKey(active.CustomerKey, stale.Revision)]; exists {
		t.Fatal("stale CAS must not leave a candidate revision")
	}
}
