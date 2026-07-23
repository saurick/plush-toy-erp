package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
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
		t.Fatalf("expected no archived business records, got %#v", cleanup.ArchivedRecords)
	}
	if len(cleanup.DeletedTasks) != beforeTasks || cleanup.DeletedBusinessStates != beforeStates {
		t.Fatalf("unexpected cleanup task/state counts %#v", cleanup)
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
	assertProjectBusinessTablesEmpty(t, ctx, client)
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

func assertProjectBusinessTablesEmpty(t *testing.T, ctx context.Context, client *ent.Client) {
	t.Helper()
	checks := []struct {
		name  string
		count func(context.Context) (int, error)
	}{
		{"workflow_tasks", client.WorkflowTask.Query().Count},
		{"workflow_task_events", client.WorkflowTaskEvent.Query().Count},
		{"workflow_business_states", client.WorkflowBusinessState.Query().Count},
		{"finance_facts", client.FinanceFact.Query().Count},
		{"stock_reservations", client.StockReservation.Query().Count},
		{"shipment_items", client.ShipmentItem.Query().Count},
		{"shipments", client.Shipment.Query().Count},
		{"outsourcing_order_items", client.OutsourcingOrderItem.Query().Count},
		{"outsourcing_orders", client.OutsourcingOrder.Query().Count},
		{"outsourcing_facts", client.OutsourcingFact.Query().Count},
		{"production_facts", client.ProductionFact.Query().Count},
		{"quality_inspections", client.QualityInspection.Query().Count},
		{"purchase_receipt_adjustments", client.PurchaseReceiptAdjustment.Query().Count},
		{"purchase_receipt_adjustment_items", client.PurchaseReceiptAdjustmentItem.Query().Count},
		{"purchase_returns", client.PurchaseReturn.Query().Count},
		{"purchase_return_items", client.PurchaseReturnItem.Query().Count},
		{"purchase_receipts", client.PurchaseReceipt.Query().Count},
		{"purchase_receipt_items", client.PurchaseReceiptItem.Query().Count},
		{"inventory_balances", client.InventoryBalance.Query().Count},
		{"inventory_txns", client.InventoryTxn.Query().Count},
		{"inventory_lots", client.InventoryLot.Query().Count},
		{"purchase_orders", client.PurchaseOrder.Query().Count},
		{"purchase_order_items", client.PurchaseOrderItem.Query().Count},
		{"sales_orders", client.SalesOrder.Query().Count},
		{"sales_order_items", client.SalesOrderItem.Query().Count},
		{"contacts", client.Contact.Query().Count},
		{"bom_headers", client.BOMHeader.Query().Count},
		{"bom_items", client.BOMItem.Query().Count},
		{"product_skus", client.ProductSKU.Query().Count},
		{"processes", client.Process.Query().Count},
		{"materials", client.Material.Query().Count},
		{"products", client.Product.Query().Count},
		{"suppliers", client.Supplier.Query().Count},
		{"customers", client.Customer.Query().Count},
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
