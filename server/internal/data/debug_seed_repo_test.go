package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	entmigrate "server/internal/data/model/ent/migrate"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
)

func TestDebugSeedRepo_CleanupDryRunDoesNotMutateAndCleanupOnlyDebugData(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "debug_seed_repo")
	regularTask := client.WorkflowTask.Create().
		SetTaskCode("REGULAR-TASK-001").
		SetTaskGroup("regular").
		SetTaskName("普通业务任务").
		SetSourceType("sales_order").
		SetSourceID(9001).
		SetTaskStatusKey("ready").
		SetOwnerRoleKey("sales").
		SaveX(ctx)
	regularEvent := client.WorkflowTaskEvent.Create().
		SetTaskID(regularTask.ID).
		SetTaskVersion(regularTask.Version).
		SetEventType("created").
		SetToStatusKey("ready").
		SaveX(ctx)

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
	beforeTasks := countDebugTasks(t, ctx, client, prefix)
	beforeStates := countDebugStates(t, ctx, client, prefix)
	if beforeTasks == 0 || beforeStates == 0 {
		t.Fatalf("expected debug rows before cleanup, tasks=%d states=%d", beforeTasks, beforeStates)
	}

	preview, err := uc.CleanupBusinessChainScenario(ctx, biz.DebugBusinessChainCleanupInput{
		DebugRunID:  debugRunID,
		ScenarioKey: scenarioKey,
		DryRun:      true,
	})
	if err != nil {
		t.Fatalf("dry run cleanup failed: %v", err)
	}
	if !preview.DryRun || len(preview.MatchedRecords) != 0 || len(preview.MatchedTasks) != beforeTasks {
		t.Fatalf("unexpected dry run result %#v", preview)
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
	if len(cleanup.ArchivedRecords) != 0 {
		t.Fatalf("expected no archived debug rows, got %#v", cleanup.ArchivedRecords)
	}
	if len(cleanup.DeletedTasks) != beforeTasks || cleanup.DeletedBusinessStates != beforeStates {
		t.Fatalf("unexpected cleanup task/state counts %#v", cleanup)
	}
	if after := countDebugTasks(t, ctx, client, prefix); after != 0 {
		t.Fatalf("expected debug tasks deleted, got %d", after)
	}
	if _, err := client.WorkflowTask.Get(ctx, regularTask.ID); err != nil {
		t.Fatalf("expected non-debug workflow task preserved: %v", err)
	}
	if _, err := client.WorkflowTaskEvent.Get(ctx, regularEvent.ID); err != nil {
		t.Fatalf("expected non-debug workflow task event preserved: %v", err)
	}
	if events, err := client.WorkflowTaskEvent.Query().Count(ctx); err != nil || events != 1 {
		t.Fatalf("expected only non-debug workflow task event preserved, count=%d err=%v", events, err)
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
		Environment:              "local",
		SeedEnabled:              true,
		CleanupEnabled:           true,
		BusinessDataClearEnabled: true,
		CleanupScope:             biz.DebugDefaultCleanupScope,
	})

	if _, err := uc.SeedBusinessChainScenario(ctx, biz.DebugBusinessChainSeedInput{
		ScenarioKey: "purchase_iqc_inbound",
		DebugRunID:  "RUN-CLEAR01",
	}, 7); err != nil {
		t.Fatalf("seed failed: %v", err)
	}
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	fixtures := createInventoryTestFixtures(t, ctx, client)
	header, err := inventoryUC.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "debug-clear-v1",
		Status:    biz.BOMStatusDraft,
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
	if _, err := inventoryUC.ActivateBOMVersion(ctx, header.ID); err != nil {
		t.Fatalf("activate bom failed: %v", err)
	}
	createAndPostPurchaseReceipt(t, ctx, inventoryUC, "DBG-PR-CLEAR-001", fixtures, stringPtr("DBG-LOT-CLEAR-001"), mustDecimal(t, "8"))
	createDebugOutsourcingOrderWithProcess(t, ctx, client, fixtures)

	preview, err := uc.ClearBusinessData(ctx, biz.DebugBusinessDataClearInput{DryRun: true})
	if err != nil {
		t.Fatalf("dry run clear business data failed: %v", err)
	}
	if !preview.DryRun || preview.MatchedTotal == 0 || preview.DeletedTotal != 0 || len(preview.ClearedTableNames) != 0 {
		t.Fatalf("unexpected dry run clear result %#v", preview)
	}
	if preview.MatchedCounts["inventory_txns"] == 0 || preview.MatchedCounts["purchase_receipts"] == 0 {
		t.Fatalf("dry run did not count expected business rows %#v", preview.MatchedCounts)
	}
	if count, err := client.InventoryTxn.Query().Count(ctx); err != nil || count == 0 {
		t.Fatalf("dry run mutated inventory txns count=%d err=%v", count, err)
	}

	result, err := uc.ClearBusinessData(ctx, biz.DebugBusinessDataClearInput{
		Confirmation: biz.DebugBusinessDataClearConfirmation,
	})
	if err != nil {
		t.Fatalf("clear business data failed: %v", err)
	}
	if result.DryRun || result.MatchedTotal == 0 || result.MatchedTotal != result.DeletedTotal {
		t.Fatalf("unexpected destructive clear totals %#v", result)
	}
	for _, tableName := range debugBusinessDataClearTables {
		if _, ok := result.DeletedCounts[tableName]; !ok {
			t.Fatalf("expected clear result to include %s, got %#v", tableName, result)
		}
	}
	if result.DeletedTotal == 0 ||
		result.DeletedCounts["inventory_txns"] == 0 ||
		result.DeletedCounts["bom_headers"] == 0 ||
		result.DeletedCounts["purchase_receipts"] == 0 ||
		result.DeletedCounts["outsourcing_order_items"] == 0 ||
		result.DeletedCounts["outsourcing_orders"] == 0 ||
		result.DeletedCounts["processes"] == 0 {
		t.Fatalf("unexpected clear result %#v", result)
	}
	assertProjectBusinessTablesEmpty(t, ctx, data)
}

func TestDebugBusinessDataClearIncludesProcessRuntimeBeforeSourceDocuments(t *testing.T) {
	index := map[string]int{}
	for position, table := range debugBusinessDataClearTables {
		index[table] = position
	}
	for _, table := range []string{"workflow_tasks", "process_node_instances", "process_instances", "sales_order_items", "sales_orders"} {
		if _, ok := index[table]; !ok {
			t.Fatalf("business clear allowlist is missing %s", table)
		}
	}
	if index["workflow_tasks"] >= index["process_node_instances"] ||
		index["process_node_instances"] >= index["process_instances"] ||
		index["process_instances"] >= index["sales_orders"] {
		t.Fatalf("process runtime cleanup order is unsafe: %#v", index)
	}
}

func TestDebugBusinessDataClearClassifiesEveryGeneratedTableAndKeepsForeignKeyOrder(t *testing.T) {
	preserved := map[string]struct{}{
		"access_entitlements": {}, "admin_sessions": {}, "admin_users": {}, "admin_user_roles": {},
		"customer_config_revisions": {}, "deployment_module_states": {}, "permissions": {},
		"roles": {}, "role_data_scopes": {}, "role_permissions": {}, "role_profiles": {},
		"runtime_audit_events": {}, "runtime_markers": {}, "work_pools": {}, "work_pool_memberships": {},
	}
	clearIndex := make(map[string]int, len(debugBusinessDataClearTables))
	for index, tableName := range debugBusinessDataClearTables {
		if _, exists := clearIndex[tableName]; exists {
			t.Fatalf("business clear allowlist contains duplicate table %s", tableName)
		}
		clearIndex[tableName] = index
	}
	generated := make(map[string]struct{}, len(entmigrate.Tables))
	usedDetachments := make(map[debugBusinessDataClearDetachment]bool, len(debugBusinessDataClearDetachments))
	for _, table := range entmigrate.Tables {
		generated[table.Name] = struct{}{}
		_, cleared := clearIndex[table.Name]
		_, kept := preserved[table.Name]
		if cleared == kept {
			t.Fatalf("generated table %s must be classified exactly once as business-clear or preserved", table.Name)
		}
		if !cleared {
			continue
		}
		for _, foreignKey := range table.ForeignKeys {
			if foreignKey.RefTable == nil || foreignKey.RefTable.Name == table.Name {
				continue
			}
			parentIndex, parentCleared := clearIndex[foreignKey.RefTable.Name]
			if !parentCleared {
				continue
			}
			detached := false
			if len(foreignKey.Columns) == 1 && debugBusinessDataClearDetaches(table.Name, foreignKey.Columns[0].Name) {
				if !foreignKey.Columns[0].Nullable {
					t.Fatalf("business clear detachment %s.%s must remain nullable", table.Name, foreignKey.Columns[0].Name)
				}
				usedDetachments[debugBusinessDataClearDetachment{tableName: table.Name, columnName: foreignKey.Columns[0].Name}] = true
				detached = true
			}
			if !detached && clearIndex[table.Name] >= parentIndex {
				t.Fatalf("business clear order must delete child %s before parent %s", table.Name, foreignKey.RefTable.Name)
			}
		}
	}
	for tableName := range clearIndex {
		if _, ok := generated[tableName]; !ok {
			t.Fatalf("business clear allowlist contains unknown generated table %s", tableName)
		}
	}
	for tableName := range preserved {
		if _, ok := generated[tableName]; !ok {
			t.Fatalf("preserved table classification contains unknown generated table %s", tableName)
		}
	}
	for _, detachment := range debugBusinessDataClearDetachments {
		if !usedDetachments[detachment] {
			t.Fatalf("business clear detachment no longer matches a generated foreign key: %#v", detachment)
		}
	}
}

func createDebugOutsourcingOrderWithProcess(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryTestFixtures) {
	t.Helper()
	supplier, err := client.Supplier.Create().
		SetCode("DBG-OUT-SUP-CLEAR-001").
		SetName("调试委外加工厂").
		SetSupplierType("outsourcing").
		Save(ctx)
	if err != nil {
		t.Fatalf("create debug outsourcing supplier failed: %v", err)
	}
	process, err := client.Process.Create().
		SetCode("DBG-PROC-CLEAR-001").
		SetName("调试车缝").
		SetCategory("委外").
		SetOutsourcingEnabled(true).
		SetInhouseEnabled(false).
		SetQualityRequired(false).
		SetSortOrder(1).
		Save(ctx)
	if err != nil {
		t.Fatalf("create debug process failed: %v", err)
	}
	order, err := client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("DBG-OUT-CLEAR-001").
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]interface{}{
			"code": supplier.Code,
			"name": supplier.Name,
		}).
		SetOrderDate(time.Date(2026, 6, 20, 10, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create debug outsourcing order failed: %v", err)
	}
	if _, err := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(order.ID).
		SetLineNo(1).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProductID(fixtures.productID).
		SetProcessID(process.ID).
		SetUnitID(fixtures.unitID).
		SetProductNoSnapshot("DBG-PRODUCT-CLEAR").
		SetProductNameSnapshot("调试产品").
		SetProcessNameSnapshot(process.Name).
		SetProcessCategorySnapshot("委外").
		SetUnitNameSnapshot("PCS单位").
		SetOutsourcingQuantity(mustDecimal(t, "3")).
		Save(ctx); err != nil {
		t.Fatalf("create debug outsourcing order item failed: %v", err)
	}
}

func assertProjectBusinessTablesEmpty(t *testing.T, ctx context.Context, data *Data) {
	t.Helper()
	for _, tableName := range debugBusinessDataClearTables {
		var count int
		if err := data.sqldb.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+quoteSQLIdentifier(tableName)).Scan(&count); err != nil {
			t.Fatalf("count %s failed: %v", tableName, err)
		}
		if count != 0 {
			t.Fatalf("expected %s empty, got %d", tableName, count)
		}
	}
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
