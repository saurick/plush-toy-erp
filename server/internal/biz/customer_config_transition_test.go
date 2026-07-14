package biz

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestCustomerConfigTransitionCheckAllowsUnchangedPublishedRevision(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	activeInput := validCustomerConfigInput()
	activeInput.Revision = "rev-a"
	active, err := uc.PublishCustomerConfig(ctx, activeInput, 10)
	if err != nil {
		t.Fatalf("publish active: %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, active.CustomerKey, active.Revision, active.ConfigHash, active.ProductVersion, "", 10); err != nil {
		t.Fatalf("activate rev-a: %v", err)
	}
	targetInput := validCustomerConfigInput()
	targetInput.Revision = "rev-b"
	target, err := uc.PublishCustomerConfig(ctx, targetInput, 11)
	if err != nil {
		t.Fatalf("publish target: %v", err)
	}

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionActivate,
		CustomerKey:            target.CustomerKey,
		TargetRevision:         target.Revision,
		ExpectedConfigHash:     target.ConfigHash,
		ExpectedProductVersion: target.ProductVersion,
		ExpectedActiveRevision: active.Revision,
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	if !check.Allowed || check.Noop || len(check.Blockers) != 0 {
		t.Fatalf("check = %#v", check)
	}
}

func TestCustomerConfigTransitionCheckBlocksRuntimeBreakingChanges(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	activeInput := validCustomerConfigInput()
	activeInput.Revision = "rev-a"
	addRuntimeProcessSelection(
		&activeInput,
		ProcessKeySalesOrderAcceptance,
		"v1",
		CustomerProcessVariantSalesApprovalPMC,
		"sales_order",
	)
	active, err := uc.PublishCustomerConfig(ctx, activeInput, 10)
	if err != nil {
		t.Fatalf("publish active: %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, active.CustomerKey, active.Revision, active.ConfigHash, active.ProductVersion, "", 10); err != nil {
		t.Fatalf("activate rev-a: %v", err)
	}

	targetInput := validCustomerConfigInput()
	targetInput.Revision = "rev-b"
	addRuntimeProcessSelection(
		&targetInput,
		ProcessKeySalesOrderAcceptance,
		"v1",
		CustomerProcessVariantSalesApprovalEngineeringPMC,
		"sales_order",
	)
	for index := range targetInput.ModuleStates {
		if targetInput.ModuleStates[index].ModuleKey == "production" {
			targetInput.ModuleStates[index].State = "disabled"
		}
	}
	for index := range targetInput.RoleProfiles {
		if targetInput.RoleProfiles[index].RoleKey == FinanceRoleKey {
			targetInput.RoleProfiles[index].Disabled = true
		}
	}
	target, err := uc.PublishCustomerConfig(ctx, targetInput, 11)
	if err != nil {
		t.Fatalf("publish target: %v", err)
	}
	repo.processCount[customerRevisionKey(active.CustomerKey, active.Revision)+"/"+ProcessKeySalesOrderAcceptance] = 2
	repo.taskCount[customerRevisionKey(active.CustomerKey, active.Revision)+"/sales"] = 3
	repo.businessCount[active.CustomerKey+"/production"] = 4

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionActivate,
		CustomerKey:            target.CustomerKey,
		TargetRevision:         target.Revision,
		ExpectedConfigHash:     target.ConfigHash,
		ExpectedProductVersion: target.ProductVersion,
		ExpectedActiveRevision: active.Revision,
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	if check.Allowed {
		t.Fatalf("breaking transition must be blocked: %#v", check)
	}
	assertCustomerConfigTransitionBlocker(t, check, "in_flight_processes_for_changed_contracts", 2)
	assertCustomerConfigTransitionBlocker(t, check, "open_workflow_tasks_for_changed_responsibility", 3)
	assertCustomerConfigTransitionBlocker(t, check, "open_business_documents_for_disabled_modules", 4)
}

func TestCustomerConfigTransitionCheckRejectsStaleIdentityAndUnactivatedRollback(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	activeInput := validCustomerConfigInput()
	activeInput.Revision = "rev-a"
	active, err := uc.PublishCustomerConfig(ctx, activeInput, 10)
	if err != nil {
		t.Fatalf("publish active: %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, active.CustomerKey, active.Revision, active.ConfigHash, active.ProductVersion, "", 10); err != nil {
		t.Fatalf("activate rev-a: %v", err)
	}
	targetInput := validCustomerConfigInput()
	targetInput.Revision = "rev-b"
	target, err := uc.PublishCustomerConfig(ctx, targetInput, 11)
	if err != nil {
		t.Fatalf("publish target: %v", err)
	}

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionRollback,
		CustomerKey:            target.CustomerKey,
		TargetRevision:         target.Revision,
		ExpectedConfigHash:     strings.Repeat("a", 64),
		ExpectedProductVersion: "stale-product",
		ExpectedActiveRevision: "stale-revision",
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	for _, code := range []string{
		"active_revision_changed",
		"rollback_target_not_activated",
		"target_config_hash_mismatch",
		"target_product_version_mismatch",
	} {
		assertCustomerConfigTransitionBlocker(t, check, code, 0)
	}
}

func TestCustomerConfigTransitionCheckRollbackRequiresImmutableActivatedHistory(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	now := time.Now()
	repo.revisions[customerRevisionKey("yoyoosun", "rev-old")] = &CustomerConfigRevision{
		CustomerKey:       "yoyoosun",
		Revision:          "rev-old",
		ProductVersion:    "product-v1",
		ConfigHash:        strings.Repeat("b", 64),
		ConfigHashVersion: CustomerConfigHashVersion,
		Status:            CustomerConfigStatusSuperseded,
		ActivatedAt:       &now,
	}
	repo.revisions[customerRevisionKey("yoyoosun", "rev-active")] = &CustomerConfigRevision{
		CustomerKey:       "yoyoosun",
		Revision:          "rev-active",
		ProductVersion:    "product-v1",
		ConfigHash:        strings.Repeat("c", 64),
		ConfigHashVersion: CustomerConfigHashVersion,
		Status:            CustomerConfigStatusActive,
		ActivatedAt:       &now,
	}

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionRollback,
		CustomerKey:            "yoyoosun",
		TargetRevision:         "rev-old",
		ExpectedConfigHash:     strings.Repeat("b", 64),
		ExpectedProductVersion: "product-v1",
		ExpectedActiveRevision: "rev-active",
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	if !check.Allowed {
		t.Fatalf("activated immutable history should be a valid rollback target: %#v", check)
	}
}

func TestCustomerConfigTransitionCheckRejectsRollbackWithoutActiveRevision(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	now := time.Now()
	repo.revisions[customerRevisionKey("yoyoosun", "rev-old")] = &CustomerConfigRevision{
		CustomerKey:       "yoyoosun",
		Revision:          "rev-old",
		ProductVersion:    "product-v1",
		ConfigHash:        strings.Repeat("b", 64),
		ConfigHashVersion: CustomerConfigHashVersion,
		Status:            CustomerConfigStatusSuperseded,
		ActivatedAt:       &now,
	}

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionRollback,
		CustomerKey:            "yoyoosun",
		TargetRevision:         "rev-old",
		ExpectedConfigHash:     strings.Repeat("b", 64),
		ExpectedProductVersion: "product-v1",
		ExpectedActiveRevision: "",
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	if check.Allowed {
		t.Fatalf("rollback without an active revision must fail closed: %#v", check)
	}
	assertCustomerConfigTransitionBlocker(t, check, "rollback_active_revision_required", 0)
}

func TestCustomerConfigTransitionCheckRejectsCurrentActiveAsRollbackTarget(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	now := time.Now()
	repo.revisions[customerRevisionKey("yoyoosun", "rev-active")] = &CustomerConfigRevision{
		CustomerKey:       "yoyoosun",
		Revision:          "rev-active",
		ProductVersion:    "product-v1",
		ConfigHash:        strings.Repeat("c", 64),
		ConfigHashVersion: CustomerConfigHashVersion,
		Status:            CustomerConfigStatusActive,
		ActivatedAt:       &now,
	}

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionRollback,
		CustomerKey:            "yoyoosun",
		TargetRevision:         "rev-active",
		ExpectedConfigHash:     strings.Repeat("c", 64),
		ExpectedProductVersion: "product-v1",
		ExpectedActiveRevision: "rev-active",
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	if check.Allowed || check.Noop {
		t.Fatalf("current active revision must not be accepted as rollback target: %#v", check)
	}
	assertCustomerConfigTransitionBlocker(t, check, "target_status_invalid", 0)
}

func TestCustomerConfigTransitionCheckRejectsSupersededActivateAndUnknownHashVersion(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	now := time.Now()
	repo.revisions[customerRevisionKey("yoyoosun", "rev-old")] = &CustomerConfigRevision{
		CustomerKey:       "yoyoosun",
		Revision:          "rev-old",
		ProductVersion:    "product-v1",
		ConfigHash:        strings.Repeat("b", 64),
		ConfigHashVersion: CustomerConfigHashVersion + 1,
		Status:            CustomerConfigStatusSuperseded,
		ActivatedAt:       &now,
	}

	check, err := uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionActivate,
		CustomerKey:            "yoyoosun",
		TargetRevision:         "rev-old",
		ExpectedConfigHash:     strings.Repeat("b", 64),
		ExpectedProductVersion: "product-v1",
		ExpectedActiveRevision: "",
	})
	if err != nil {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
	if check.Allowed {
		t.Fatalf("superseded revision with an unknown hash version must not be activated: %#v", check)
	}
	assertCustomerConfigTransitionBlocker(t, check, "target_config_hash_version_invalid", 0)
	assertCustomerConfigTransitionBlocker(t, check, "target_status_invalid", 0)
}

func TestCustomerConfigTransitionCheckFailsClosedOnRepoError(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	target, err := uc.PublishCustomerConfig(ctx, in, 10)
	if err != nil {
		t.Fatalf("publish target: %v", err)
	}
	repo.activeErr = errors.New("active lookup failed")
	_, err = uc.CheckCustomerConfigTransition(ctx, CustomerConfigTransitionCheckInput{
		Action:                 CustomerConfigTransitionActivate,
		CustomerKey:            target.CustomerKey,
		TargetRevision:         target.Revision,
		ExpectedConfigHash:     target.ConfigHash,
		ExpectedProductVersion: target.ProductVersion,
		ExpectedActiveRevision: "",
	})
	if err == nil || err.Error() != "active lookup failed" {
		t.Fatalf("CheckCustomerConfigTransition() error = %v", err)
	}
}

func assertCustomerConfigTransitionBlocker(t *testing.T, check *CustomerConfigTransitionCheck, code string, count int) {
	t.Helper()
	for _, blocker := range check.Blockers {
		if blocker.Code == code {
			if blocker.Count != count {
				t.Fatalf("blocker %s count = %d, want %d", code, blocker.Count, count)
			}
			return
		}
	}
	t.Fatalf("missing blocker %s in %#v", code, check.Blockers)
}
