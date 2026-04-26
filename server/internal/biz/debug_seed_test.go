package biz

import (
	"context"
	"errors"
	"testing"
)

type fakeDebugRepo struct {
	seedPlan DebugSeedPlan
	cleanup  DebugBusinessChainCleanupInput
	cleared  bool
}

func (r *fakeDebugRepo) SeedBusinessChainDebugData(_ context.Context, plan DebugSeedPlan, _ int) (*DebugBusinessChainSeedResult, error) {
	r.seedPlan = plan
	records := make([]DebugCreatedRecord, 0, len(plan.Records))
	for index, record := range plan.Records {
		records = append(records, DebugCreatedRecord{
			ID:                index + 1,
			ModuleKey:         record.ModuleKey,
			DocumentNo:        record.DocumentNo,
			Title:             record.Title,
			BusinessStatusKey: record.BusinessStatusKey,
			OwnerRoleKey:      record.OwnerRoleKey,
		})
	}
	tasks := make([]DebugCreatedTask, 0, len(plan.Tasks))
	for index, task := range plan.Tasks {
		tasks = append(tasks, DebugCreatedTask{
			ID:                index + 1,
			TaskCode:          task.TaskCode,
			TaskGroup:         task.TaskGroup,
			TaskName:          task.TaskName,
			BusinessStatusKey: task.BusinessStatusKey,
			TaskStatusKey:     task.TaskStatusKey,
			OwnerRoleKey:      task.OwnerRoleKey,
		})
	}
	return &DebugBusinessChainSeedResult{
		ScenarioKey:     plan.ScenarioKey,
		DebugRunID:      plan.DebugRunID,
		CreatedRecords:  records,
		CreatedTasks:    tasks,
		NextCheckpoints: plan.NextCheckpoints,
		CleanupToken:    plan.CleanupToken,
		Warnings:        plan.Warnings,
	}, nil
}

func (r *fakeDebugRepo) CleanupBusinessChainDebugData(_ context.Context, in DebugBusinessChainCleanupInput) (*DebugBusinessChainCleanupResult, error) {
	r.cleanup = in
	return &DebugBusinessChainCleanupResult{
		DebugRunID:   in.DebugRunID,
		ScenarioKey:  in.ScenarioKey,
		DryRun:       in.DryRun,
		MatchedTasks: []DebugMatchedTask{{ID: 1, TaskCode: "DBG-TASK"}},
	}, nil
}

func (r *fakeDebugRepo) ClearBusinessData(_ context.Context) (*DebugBusinessDataClearResult, error) {
	r.cleared = true
	return &DebugBusinessDataClearResult{
		DeletedCounts: map[string]int{
			"business_records": 2,
			"workflow_tasks":   1,
		},
		DeletedTotal:      3,
		ClearedTableNames: []string{"workflow_tasks", "business_records"},
	}, nil
}

func TestDebugUsecase_DisabledConfigRejectsSeedAndCleanup(t *testing.T) {
	uc := NewDebugUsecase(&fakeDebugRepo{}, DebugSafetyConfig{
		Environment:    "dev",
		SeedEnabled:    false,
		CleanupEnabled: false,
		CleanupScope:   DebugDefaultCleanupScope,
	})

	_, err := uc.SeedBusinessChainScenario(context.Background(), DebugBusinessChainSeedInput{
		ScenarioKey: "order_approval_engineering",
		DebugRunID:  "RUN-TEST01",
	}, 7)
	if !errors.Is(err, ErrDebugSeedDisabled) {
		t.Fatalf("expected seed disabled, got %v", err)
	}

	_, err = uc.CleanupBusinessChainScenario(context.Background(), DebugBusinessChainCleanupInput{
		DebugRunID:  "RUN-TEST01",
		ScenarioKey: "order_approval_engineering",
		DryRun:      true,
	})
	if !errors.Is(err, ErrDebugCleanupDisabled) {
		t.Fatalf("expected cleanup disabled, got %v", err)
	}

	_, err = uc.ClearBusinessData(context.Background())
	if !errors.Is(err, ErrDebugBusinessDataClearDisabled) {
		t.Fatalf("expected business data clear disabled, got %v", err)
	}
}

func TestDebugUsecase_CleanupRequiresDebugRunID(t *testing.T) {
	uc := NewDebugUsecase(&fakeDebugRepo{}, DebugSafetyConfig{
		Environment:    "local",
		CleanupEnabled: true,
		CleanupScope:   DebugDefaultCleanupScope,
	})

	_, err := uc.CleanupBusinessChainScenario(context.Background(), DebugBusinessChainCleanupInput{
		ScenarioKey: "order_approval_engineering",
		DryRun:      true,
	})
	if !errors.Is(err, ErrDebugRunIDRequired) {
		t.Fatalf("expected debug run id required, got %v", err)
	}
}

func TestDebugUsecase_SeedReturnsScenarioRunRecordsAndTasks(t *testing.T) {
	repo := &fakeDebugRepo{}
	uc := NewDebugUsecase(repo, DebugSafetyConfig{
		Environment: "local",
		SeedEnabled: true,
	})

	result, err := uc.SeedBusinessChainScenario(context.Background(), DebugBusinessChainSeedInput{
		ScenarioKey: "purchase_iqc_inbound",
		DebugRunID:  "RUN-TEST02",
	}, 7)
	if err != nil {
		t.Fatalf("seed failed: %v", err)
	}
	if result.ScenarioKey != "purchase_iqc_inbound" || result.DebugRunID != "RUN-TEST02" {
		t.Fatalf("unexpected result identity %#v", result)
	}
	if len(result.CreatedRecords) == 0 || len(result.CreatedTasks) == 0 {
		t.Fatalf("expected records and tasks, got %#v", result)
	}
	if len(result.NextCheckpoints) == 0 || result.CleanupToken == "" {
		t.Fatalf("expected checkpoints and cleanup token, got %#v", result)
	}
	if repo.seedPlan.Records[0].Payload["debug"] != true {
		t.Fatalf("expected debug payload marker, got %#v", repo.seedPlan.Records[0].Payload)
	}
}

func TestDebugUsecase_ClearBusinessDataUsesCleanupGuard(t *testing.T) {
	repo := &fakeDebugRepo{}
	uc := NewDebugUsecase(repo, DebugSafetyConfig{
		Environment:    "local",
		CleanupEnabled: true,
		CleanupScope:   DebugDefaultCleanupScope,
	})

	result, err := uc.ClearBusinessData(context.Background())
	if err != nil {
		t.Fatalf("clear business data failed: %v", err)
	}
	if !repo.cleared {
		t.Fatalf("expected repo clear to be called")
	}
	if result.DeletedTotal != 3 || result.DeletedCounts["business_records"] != 2 {
		t.Fatalf("unexpected clear result %#v", result)
	}
}
