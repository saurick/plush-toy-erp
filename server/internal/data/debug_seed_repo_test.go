package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestDebugSeedRepo_CleanupDryRunDoesNotMutateAndCleanupOnlyDebugData(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:debug_seed_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewDebugSeedRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewDebugUsecase(repo, biz.DebugSafetyConfig{
		Environment:    "local",
		SeedEnabled:    true,
		CleanupEnabled: true,
		CleanupScope:   biz.DebugDefaultCleanupScope,
	})
	debugRunID := "RUN-DRYRUN1"
	scenarioKey := "order_approval_engineering"

	seed, err := uc.SeedBusinessChainScenario(ctx, biz.DebugBusinessChainSeedInput{
		ScenarioKey: scenarioKey,
		DebugRunID:  debugRunID,
	}, 7)
	if err != nil {
		t.Fatalf("seed failed: %v", err)
	}
	if len(seed.CreatedRecords) == 0 || len(seed.CreatedTasks) == 0 {
		t.Fatalf("expected seed records and tasks, got %#v", seed)
	}
	prefix, err := biz.DebugDocumentPrefix(debugRunID, scenarioKey)
	if err != nil {
		t.Fatalf("prefix failed: %v", err)
	}
	beforeRecords := countActiveDebugRecords(t, ctx, client, prefix)
	beforeTasks := countDebugTasks(t, ctx, client, prefix)
	beforeStates := countDebugStates(t, ctx, client, prefix)
	if beforeRecords == 0 || beforeTasks == 0 || beforeStates == 0 {
		t.Fatalf("expected debug rows before cleanup, records=%d tasks=%d states=%d", beforeRecords, beforeTasks, beforeStates)
	}

	preview, err := uc.CleanupBusinessChainScenario(ctx, biz.DebugBusinessChainCleanupInput{
		DebugRunID:  debugRunID,
		ScenarioKey: scenarioKey,
		DryRun:      true,
	})
	if err != nil {
		t.Fatalf("dry run cleanup failed: %v", err)
	}
	if !preview.DryRun || len(preview.MatchedRecords) != beforeRecords || len(preview.MatchedTasks) != beforeTasks {
		t.Fatalf("unexpected dry run result %#v", preview)
	}
	if after := countActiveDebugRecords(t, ctx, client, prefix); after != beforeRecords {
		t.Fatalf("dry run mutated business records: before=%d after=%d", beforeRecords, after)
	}
	if after := countDebugTasks(t, ctx, client, prefix); after != beforeTasks {
		t.Fatalf("dry run mutated tasks: before=%d after=%d", beforeTasks, after)
	}

	cleanup, err := uc.CleanupBusinessChainScenario(ctx, biz.DebugBusinessChainCleanupInput{
		DebugRunID:  debugRunID,
		ScenarioKey: scenarioKey,
		DryRun:      false,
	})
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}
	if len(cleanup.ArchivedRecords) != beforeRecords {
		t.Fatalf("expected archived records=%d, got %#v", beforeRecords, cleanup.ArchivedRecords)
	}
	if len(cleanup.DeletedTasks) != beforeTasks || cleanup.DeletedBusinessStates != beforeStates {
		t.Fatalf("unexpected cleanup task/state counts %#v", cleanup)
	}
	if after := countActiveDebugRecords(t, ctx, client, prefix); after != 0 {
		t.Fatalf("expected active debug records archived, got %d", after)
	}
	if after := countDebugTasks(t, ctx, client, prefix); after != 0 {
		t.Fatalf("expected debug tasks deleted, got %d", after)
	}
	if events, err := client.WorkflowTaskEvent.Query().Count(ctx); err != nil || events != 0 {
		t.Fatalf("expected workflow task events deleted, count=%d err=%v", events, err)
	}
}

func countActiveDebugRecords(t *testing.T, ctx context.Context, client *ent.Client, prefix string) int {
	t.Helper()
	count, err := client.BusinessRecord.Query().
		Where(
			businessrecord.DeletedAtIsNil(),
			businessrecord.DocumentNoHasPrefix(prefix),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count active debug records failed: %v", err)
	}
	return count
}

func countDebugTasks(t *testing.T, ctx context.Context, client *ent.Client, prefix string) int {
	t.Helper()
	count, err := client.WorkflowTask.Query().
		Where(workflowtask.TaskCodeHasPrefix(prefix)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count debug tasks failed: %v", err)
	}
	return count
}

func countDebugStates(t *testing.T, ctx context.Context, client *ent.Client, prefix string) int {
	t.Helper()
	count, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceNoHasPrefix(prefix)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count debug states failed: %v", err)
	}
	return count
}
