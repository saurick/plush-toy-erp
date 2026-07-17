package biz

import (
	"context"
	"errors"
	"testing"
)

type fakeDebugRepo struct {
	seedPlan DebugSeedPlan
	cleanup  DebugBusinessChainCleanupInput
	clear    DebugBusinessDataClearInput
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

func (r *fakeDebugRepo) ClearBusinessData(_ context.Context, in DebugBusinessDataClearInput) (*DebugBusinessDataClearResult, error) {
	r.clear = in
	r.cleared = true
	deletedTotal := 1
	deletedCounts := map[string]int{"workflow_tasks": 1}
	clearedTableNames := []string{"workflow_tasks"}
	if in.DryRun {
		deletedTotal = 0
		deletedCounts = map[string]int{}
		clearedTableNames = nil
	}
	return &DebugBusinessDataClearResult{
		DryRun:            in.DryRun,
		MatchedCounts:     map[string]int{"workflow_tasks": 1},
		MatchedTotal:      1,
		DeletedCounts:     deletedCounts,
		DeletedTotal:      deletedTotal,
		ClearedTableNames: clearedTableNames,
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

	_, err = uc.ClearBusinessData(context.Background(), DebugBusinessDataClearInput{DryRun: true})
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
	bossMobileSampleCounts := map[string]int{}
	for _, task := range repo.seedPlan.Tasks {
		if task.OwnerRoleKey != "boss" {
			continue
		}
		switch task.TaskStatusKey {
		case "ready", "blocked", "done":
			bossMobileSampleCounts[task.TaskStatusKey]++
		}
	}
	for statusKey, count := range bossMobileSampleCounts {
		if count < debugMobileListStressCount {
			t.Fatalf("expected boss mobile list samples for %s, got %d", statusKey, count)
		}
	}
	if len(bossMobileSampleCounts) != 3 {
		t.Fatalf("expected boss ready/blocked/done mobile samples, got %#v", bossMobileSampleCounts)
	}
	if len(result.NextCheckpoints) == 0 || result.CleanupToken == "" {
		t.Fatalf("expected checkpoints and cleanup token, got %#v", result)
	}
	if repo.seedPlan.Records[0].Payload["debug"] != true {
		t.Fatalf("expected debug payload marker, got %#v", repo.seedPlan.Records[0].Payload)
	}
}

func TestDebugBusinessChainScenariosOnlyUseCanonicalTaskStatuses(t *testing.T) {
	for scenarioKey, scenario := range debugBusinessChainScenarios {
		for _, task := range scenario.tasks {
			if !IsKnownWorkflowTaskState(task.statusKey) {
				t.Fatalf("scenario %s task %s uses unsupported task status %q", scenarioKey, task.name, task.statusKey)
			}
		}
	}
}

func TestDebugBusinessChainScenariosDoNotForgeSourceProducedTaskGroups(t *testing.T) {
	for scenarioKey, scenario := range debugBusinessChainScenarios {
		for _, task := range scenario.tasks {
			if IsSourceProducedWorkflowTaskGroup(task.group) {
				t.Fatalf("scenario %s task %s forges source-produced group %q", scenarioKey, task.name, task.group)
			}
		}
	}
}

func TestDebugUsecase_ClearBusinessDataUsesIndependentGuard(t *testing.T) {
	repo := &fakeDebugRepo{}
	uc := NewDebugUsecase(repo, DebugSafetyConfig{
		Environment:    "local",
		CleanupEnabled: true,
		CleanupScope:   DebugDefaultCleanupScope,
	})

	_, err := uc.ClearBusinessData(context.Background(), DebugBusinessDataClearInput{DryRun: true})
	if !errors.Is(err, ErrDebugBusinessDataClearDisabled) {
		t.Fatalf("expected independent business clear guard, got %v", err)
	}
	if repo.cleared {
		t.Fatal("cleanup switch must not enable full business clear")
	}
}

func TestDebugUsecase_ClearBusinessDataOnlyAllowsLocalAndDev(t *testing.T) {
	for _, environment := range []string{"shared", "remote", "prod", "sql"} {
		t.Run(environment, func(t *testing.T) {
			repo := &fakeDebugRepo{}
			uc := NewDebugUsecase(repo, DebugSafetyConfig{
				Environment:              environment,
				BusinessDataClearEnabled: true,
			})
			_, err := uc.ClearBusinessData(context.Background(), DebugBusinessDataClearInput{DryRun: true})
			if !errors.Is(err, ErrDebugBusinessDataClearDisabled) {
				t.Fatalf("expected %s business clear denied, got %v", environment, err)
			}
			if repo.cleared {
				t.Fatalf("%s business clear reached repo", environment)
			}
		})
	}

	for _, environment := range []string{"local", "dev"} {
		t.Run(environment, func(t *testing.T) {
			repo := &fakeDebugRepo{}
			uc := NewDebugUsecase(repo, DebugSafetyConfig{
				Environment:              environment,
				BusinessDataClearEnabled: true,
			})
			result, err := uc.ClearBusinessData(context.Background(), DebugBusinessDataClearInput{DryRun: true})
			if err != nil {
				t.Fatalf("expected %s dry run allowed, got %v", environment, err)
			}
			if !repo.cleared || !result.DryRun || result.DeletedTotal != 0 || result.MatchedTotal != 1 {
				t.Fatalf("unexpected %s dry run result %#v", environment, result)
			}
		})
	}
}

func TestDebugUsecase_SeedAndCleanupOnlyAllowLocalAndDev(t *testing.T) {
	for _, environment := range []string{"shared", "qa", "test", "remote", "prod", "sql"} {
		t.Run(environment, func(t *testing.T) {
			repo := &fakeDebugRepo{}
			uc := NewDebugUsecase(repo, DebugSafetyConfig{
				Environment:    environment,
				SeedEnabled:    true,
				CleanupEnabled: true,
				CleanupScope:   DebugDefaultCleanupScope,
			})
			if _, err := uc.SeedBusinessChainScenario(context.Background(), DebugBusinessChainSeedInput{
				ScenarioKey: "purchase_iqc_inbound",
				DebugRunID:  "RUN-ENV01",
			}, 7); !errors.Is(err, ErrDebugSeedDisabled) {
				t.Fatalf("%s seed error = %v, want ErrDebugSeedDisabled", environment, err)
			}
			if _, err := uc.CleanupBusinessChainScenario(context.Background(), DebugBusinessChainCleanupInput{
				DebugRunID: "RUN-ENV01",
				DryRun:     true,
			}); !errors.Is(err, ErrDebugCleanupDisabled) {
				t.Fatalf("%s cleanup error = %v, want ErrDebugCleanupDisabled", environment, err)
			}
			capabilities := uc.Capabilities()
			if capabilities.SeedAllowed || capabilities.CleanupAllowed {
				t.Fatalf("%s capabilities expose debug mutations: %#v", environment, capabilities)
			}
		})
	}
}

func TestDebugUsecase_ClearBusinessDataRequiresExactConfirmationForDeletion(t *testing.T) {
	for _, confirmation := range []string{"", "CLEAR_ALL_BUSINESS_DATA", " CLEAR_ALL_PROJECT_BUSINESS_DATA", "CLEAR_ALL_PROJECT_BUSINESS_DATA "} {
		repo := &fakeDebugRepo{}
		uc := NewDebugUsecase(repo, DebugSafetyConfig{
			Environment:              "local",
			BusinessDataClearEnabled: true,
		})
		_, err := uc.ClearBusinessData(context.Background(), DebugBusinessDataClearInput{
			DryRun:       false,
			Confirmation: confirmation,
		})
		if !errors.Is(err, ErrDebugBusinessDataClearConfirmationInvalid) {
			t.Fatalf("expected exact confirmation rejection for %q, got %v", confirmation, err)
		}
		if repo.cleared {
			t.Fatalf("invalid confirmation %q reached repo", confirmation)
		}
	}

	repo := &fakeDebugRepo{}
	uc := NewDebugUsecase(repo, DebugSafetyConfig{
		Environment:              "local",
		BusinessDataClearEnabled: true,
	})
	result, err := uc.ClearBusinessData(context.Background(), DebugBusinessDataClearInput{
		Confirmation: DebugBusinessDataClearConfirmation,
	})
	if err != nil {
		t.Fatalf("clear business data failed: %v", err)
	}
	if !repo.cleared || repo.clear.Confirmation != DebugBusinessDataClearConfirmation {
		t.Fatalf("expected repo clear with exact confirmation, got %#v", repo.clear)
	}
	if result.DeletedTotal != 1 || result.DeletedCounts["workflow_tasks"] != 1 {
		t.Fatalf("unexpected clear result %#v", result)
	}
}
