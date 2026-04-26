package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
)

func TestDebugSeedRepo_CleanupDryRunDoesNotMutateAndCleanupOnlyDebugData(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "debug_seed_repo")

	repo := NewDebugSeedRepo(
		data,
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

func TestDebugSeedRepo_ClearBusinessDataDeletesCurrentProjectBusinessTables(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "debug_seed_repo_clear_business")

	repo := NewDebugSeedRepo(
		data,
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewDebugUsecase(repo, biz.DebugSafetyConfig{
		Environment:    "local",
		SeedEnabled:    true,
		CleanupEnabled: true,
		CleanupScope:   biz.DebugDefaultCleanupScope,
	})

	if _, err := uc.SeedBusinessChainScenario(ctx, biz.DebugBusinessChainSeedInput{
		ScenarioKey: "purchase_iqc_inbound",
		DebugRunID:  "RUN-CLEAR01",
	}, 7); err != nil {
		t.Fatalf("seed failed: %v", err)
	}
	if records, err := client.BusinessRecord.Query().Count(ctx); err != nil || records == 0 {
		t.Fatalf("expected business records before clear, count=%d err=%v", records, err)
	}

	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	fixtures := createInventoryTestFixtures(t, ctx, client)
	header, err := inventoryUC.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "debug-clear-v1",
		Status:    biz.BOMStatusActive,
	})
	if err != nil {
		t.Fatalf("create bom header failed: %v", err)
	}
	if _, err := inventoryUC.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1.5"),
		UnitID:      fixtures.unitID,
		LossRate:    mustDecimal(t, "0.02"),
	}); err != nil {
		t.Fatalf("create bom item failed: %v", err)
	}
	createAndPostPurchaseReceipt(t, ctx, inventoryUC, "DBG-PR-CLEAR-001", fixtures, stringPtr("DBG-LOT-CLEAR-001"), mustDecimal(t, "8"))

	result, err := uc.ClearBusinessData(ctx)
	if err != nil {
		t.Fatalf("clear business data failed: %v", err)
	}
	for _, tableName := range debugBusinessDataClearTables {
		if _, ok := result.DeletedCounts[tableName]; !ok {
			t.Fatalf("expected clear result to include %s, got %#v", tableName, result)
		}
	}
	if result.DeletedTotal == 0 ||
		result.DeletedCounts["business_records"] == 0 ||
		result.DeletedCounts["inventory_txns"] == 0 ||
		result.DeletedCounts["bom_headers"] == 0 ||
		result.DeletedCounts["purchase_receipts"] == 0 {
		t.Fatalf("unexpected clear result %#v", result)
	}
	assertProjectBusinessTablesEmpty(t, ctx, client)
}

func assertProjectBusinessTablesEmpty(t *testing.T, ctx context.Context, client *ent.Client) {
	t.Helper()
	checks := []struct {
		name  string
		count func(context.Context) (int, error)
	}{
		{"business_records", client.BusinessRecord.Query().Count},
		{"business_record_items", client.BusinessRecordItem.Query().Count},
		{"business_record_events", client.BusinessRecordEvent.Query().Count},
		{"workflow_tasks", client.WorkflowTask.Query().Count},
		{"workflow_task_events", client.WorkflowTaskEvent.Query().Count},
		{"workflow_business_states", client.WorkflowBusinessState.Query().Count},
		{"purchase_receipt_adjustments", client.PurchaseReceiptAdjustment.Query().Count},
		{"purchase_receipt_adjustment_items", client.PurchaseReceiptAdjustmentItem.Query().Count},
		{"purchase_receipts", client.PurchaseReceipt.Query().Count},
		{"purchase_receipt_items", client.PurchaseReceiptItem.Query().Count},
		{"inventory_balances", client.InventoryBalance.Query().Count},
		{"inventory_txns", client.InventoryTxn.Query().Count},
		{"inventory_lots", client.InventoryLot.Query().Count},
		{"bom_headers", client.BOMHeader.Query().Count},
		{"bom_items", client.BOMItem.Query().Count},
		{"materials", client.Material.Query().Count},
		{"products", client.Product.Query().Count},
		{"warehouses", client.Warehouse.Query().Count},
		{"units", client.Unit.Query().Count},
	}
	for _, check := range checks {
		count, err := check.count(ctx)
		if err != nil {
			t.Fatalf("count %s failed: %v", check.name, err)
		}
		if count != 0 {
			t.Fatalf("expected %s empty, got %d", check.name, count)
		}
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
