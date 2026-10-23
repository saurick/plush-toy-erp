package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestBusinessQuickCountsPurchaseWarehouseScope(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quick_counts_receipts")
	f := createInventoryTestFixtures(t, ctx, client)
	other := createTestWarehouse(t, ctx, client, "COUNT-OTHER")
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	countsUC := biz.NewPurchaseReceiptUsecase(repo)
	for i, warehouses := range [][]int{{f.warehouseID}, {f.warehouseID}, {other.ID}, {f.warehouseID, other.ID}} {
		items := []*biz.PurchaseReceiptItemCreate{}
		for _, warehouse := range warehouses {
			items = append(items, &biz.PurchaseReceiptItemCreate{MaterialID: f.materialID, WarehouseID: warehouse, UnitID: f.unitID, Quantity: decimal.NewFromInt(1)})
		}
		if _, err := uc.CreatePurchaseReceiptWithItems(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: fmt.Sprintf("QUICK-RCV-%d", i), SupplierName: "模拟供应商"}, items); err != nil {
			t.Fatal(err)
		}
	}
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	filter := biz.PurchaseReceiptFilter{Keyword: "QUICK-RCV", Status: "POSTED", WarehouseScope: &assigned, Limit: 1, Offset: 100}
	got, err := countsUC.CountPurchaseReceiptsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 2})
	filter.WarehouseID = other.ID
	got, err = countsUC.CountPurchaseReceiptsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{})
	filter.WarehouseID = 0
	filter.WarehouseScope = &biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
	got, err = countsUC.CountPurchaseReceiptsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{})
	filter.WarehouseScope = &biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}
	got, err = countsUC.CountPurchaseReceiptsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 4})
	filter.Keyword = "missing"
	got, err = countsUC.CountPurchaseReceiptsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{})
}

func TestBusinessQuickCountsLotsAndBOMScope(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quick_counts_inventory")
	f := createInventoryTestFixtures(t, ctx, client)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	for i, status := range []string{"ACTIVE", "HOLD", "DISABLED"} {
		lot := client.InventoryLot.Create().SetSubjectType("MATERIAL").SetSubjectID(f.materialID).SetLotNo(fmt.Sprintf("QUICK-LOT-%d", i)).SetStatus(status).SaveX(ctx)
		if i < 2 {
			client.InventoryBalance.Create().SetSubjectType("MATERIAL").SetSubjectID(f.materialID).SetWarehouseID(f.warehouseID).SetUnitID(f.unitID).SetLotID(lot.ID).SetQuantity(decimal.NewFromInt(1)).SaveX(ctx)
		}
	}
	filter := biz.InventoryLotFilter{Keyword: "QUICK-LOT", Status: "ACTIVE", Limit: 1, Offset: 100}
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	got, err := uc.CountInventoryLotsByStatusForAccess(ctx, filter, assigned)
	assertBusinessCounts(t, got, err, map[string]int{"ACTIVE": 1, "HOLD": 1})
	got, err = uc.CountInventoryLotsByStatusForAccess(ctx, filter, biz.WarehouseDataScope{Mode: biz.DataScopeModeAll})
	assertBusinessCounts(t, got, err, map[string]int{"ACTIVE": 1, "HOLD": 1, "DISABLED": 1})
	got, err = uc.CountInventoryLotsByStatusForAccess(ctx, filter, biz.WarehouseDataScope{Mode: biz.DataScopeModeNone})
	assertBusinessCounts(t, got, err, map[string]int{})
	filter.WarehouseID = f.warehouseID + 100
	if _, err := uc.CountInventoryLotsByStatusForAccess(ctx, filter, assigned); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("scope error = %v", err)
	}
	for i, status := range []string{"DRAFT", "ACTIVE", "ARCHIVED"} {
		client.BOMHeader.Create().SetProductID(f.productID).SetVersion(fmt.Sprintf("QUICK-BOM-%d", i)).SetStatus(status).SaveX(ctx)
	}
	for _, tc := range []struct {
		scope, status string
		want          map[string]int
	}{
		{biz.LifecycleScopeCurrent, "DRAFT", map[string]int{"DRAFT": 1, "ACTIVE": 1}},
		{biz.LifecycleScopeHistory, "ARCHIVED", map[string]int{"ARCHIVED": 1}},
		{biz.LifecycleScopeAll, "ACTIVE", map[string]int{"DRAFT": 1, "ACTIVE": 1, "ARCHIVED": 1}},
	} {
		got, err := uc.CountBOMHeadersByStatus(ctx, biz.BOMHeaderFilter{ProductID: f.productID, LifecycleScope: tc.scope, Status: tc.status, Limit: 1, Offset: 100})
		assertBusinessCounts(t, got, err, tc.want)
	}
}

func TestBusinessQuickCountsWorkflowVisibility(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quick_counts_workflow")
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	for i, role := range []string{biz.QualityRoleKey, biz.QualityRoleKey, biz.FinanceRoleKey, biz.QualityRoleKey} {
		status := []string{"ready", "done", "blocked", "withdrawn"}[i]
		client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("QUICK-TASK-%d", i)).SetTaskName("模拟统计任务").SetTaskGroup("generic").SetSourceType("source").SetSourceID(i + 1).SetOwnerRoleKey(role).SetTaskStatusKey(status).SetPayload(map[string]any{}).SaveX(ctx)
	}
	filter := biz.WorkflowTaskFilter{Keyword: "QUICK-TASK", TaskGroup: "generic", TaskStatusKey: "ready", Limit: 1, Offset: 100,
		VisibilityScope: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.QualityRoleKey}}}
	got, err := repo.CountWorkflowTasksByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"ready": 1, "done": 1, "withdrawn": 1})
	filter.VisibilityScope = &biz.WorkflowTaskVisibilityScope{}
	got, err = repo.CountWorkflowTasksByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{})
	filter.VisibilityScope = &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}
	filter.SourceID = 3
	got, err = repo.CountWorkflowTasksByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"blocked": 1})
}

func TestBusinessQuickCountsProductionAndReservations(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quick_counts_facts")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for i, kind := range []string{biz.ProductionFactFinishedGoodsReceipt, biz.ProductionFactFinishedGoodsReceipt, biz.ProductionFactRework} {
		no := fmt.Sprintf("QUICK-FACT-%d", i)
		client.ProductionFact.Create().SetFactNo(no).SetFactType(kind).SetSubjectType("PRODUCT").SetSubjectID(f.productID).SetWarehouseID(f.productWarehouseID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(1)).SetIdempotencyKey(no).SaveX(ctx)
	}
	got, err := uc.CountProductionFactsByStatus(ctx, biz.OperationalFactFilter{FactType: biz.ProductionFactFinishedGoodsReceipt, Status: "POSTED", Keyword: "QUICK-FACT", Limit: 1, Offset: 100})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 2})
	client.Product.UpdateOneID(f.productID).SetName("可见产品关键字").SaveX(ctx)
	for i, status := range []string{"ACTIVE", "RELEASED", "CONSUMED", "CANCELLED"} {
		no := fmt.Sprintf("QUICK-RSV-%d", i)
		client.StockReservation.Create().SetReservationNo(no).SetStatus(status).SetProductID(f.productID).SetWarehouseID(f.productWarehouseID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(1)).SetIdempotencyKey(no).SaveX(ctx)
	}
	filter := biz.OperationalFactFilter{Status: "ACTIVE", Keyword: "可见产品关键字", Limit: 1, Offset: 100}
	got, err = uc.CountStockReservationsByStatusForAccess(ctx, filter, biz.StockReservationReadScope{})
	assertBusinessCounts(t, got, err, map[string]int{})
	got, err = uc.CountStockReservationsByStatusForAccess(ctx, filter, biz.StockReservationReadScope{IncludeInventoryReferences: true})
	assertBusinessCounts(t, got, err, map[string]int{"ACTIVE": 1, "RELEASED": 1, "CONSUMED": 1, "CANCELLED": 1})
	filter.DateFrom = timePointer(time.Now().AddDate(0, 0, 1))
	got, err = uc.CountStockReservationsByStatusForAccess(ctx, filter, biz.StockReservationReadScope{IncludeInventoryReferences: true})
	assertBusinessCounts(t, got, err, map[string]int{})
}

func TestBusinessQuickCountsExceptionHandlingProjection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quick_counts_exceptions")
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for i, key := range []string{"SUBMITTED:PENDING", "APPROVED:PENDING", "APPROVED:APPLIED", "APPROVED:REVERSED", "REJECTED:PENDING", "CANCELLED:PENDING"} {
		parts := strings.Split(key, ":")
		no := fmt.Sprintf("QUICK-EX-%d", i)
		create := client.ProductionExceptionDecision.Create().SetDecisionNo(no).SetDecisionType(biz.ProductionExceptionScrap).SetProductionOrderID(1).SetProductionOrderItemID(1).
			SetProductionWipBatchID(i + 1).SetQualityInspectionID(i + 1).SetRequestedQuantity(decimal.NewFromInt(1)).SetReason("模拟统计").SetIdempotencyKey(no).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SetRequestedBy(1).SetStatus(parts[0]).SetExecutionStatus(parts[1])
		if parts[1] != "PENDING" {
			create.SetExecutedAt(time.Now()).SetExecutedBy(1).SetExecutionReason("模拟办理")
		}
		if parts[1] == "REVERSED" {
			create.SetReversedAt(time.Now()).SetReversedBy(1).SetReverseReason("模拟冲正")
		}
		create.SaveX(ctx)
	}
	filter := biz.ProductionExceptionFilter{HandlingStatus: "APPROVED:PENDING", ProductionOrderID: 1, Limit: 1, Offset: 100}
	got, err := uc.CountProductionExceptionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"SUBMITTED": 1, "APPROVED:PENDING": 1, "APPROVED:APPLIED": 1, "APPROVED:REVERSED": 1, "REJECTED": 1, "CANCELLED": 1})
	filter.Offset = 0
	rows, total, err := uc.ListProductionExceptions(ctx, filter)
	if err != nil || total != 1 || len(rows) != 1 || rows[0].Status != "APPROVED" || rows[0].ExecutionStatus != "PENDING" {
		t.Fatalf("handling result=%v total=%d err=%v", rows, total, err)
	}
	for _, key := range []string{"SUBMITTED", "APPROVED:PENDING", "APPROVED:APPLIED", "APPROVED:REVERSED", "REJECTED", "CANCELLED"} {
		rows, total, err := uc.ListProductionExceptions(ctx, biz.ProductionExceptionFilter{HandlingStatus: key, ProductionOrderID: 1, Limit: 1})
		if err != nil || total != 1 || len(rows) != 1 {
			t.Fatalf("handling %s rows=%v total=%d err=%v", key, rows, total, err)
		}
		actual := rows[0].Status
		if actual == biz.ProductionExceptionApproved {
			actual += ":" + rows[0].ExecutionStatus
		}
		if actual != key {
			t.Fatalf("handling %s returned %s", key, actual)
		}
	}
	for _, excluded := range []biz.ProductionExceptionFilter{
		{HandlingStatus: "APPROVED:PENDING", ProductionOrderID: 2},
		{HandlingStatus: "APPROVED:PENDING", ProductionOrderID: 1, DecisionType: biz.ProductionExceptionOverIssue},
	} {
		got, err = uc.CountProductionExceptionsByStatus(ctx, excluded)
		assertBusinessCounts(t, got, err, map[string]int{})
		rows, total, err := uc.ListProductionExceptions(ctx, excluded)
		if err != nil || total != 0 || len(rows) != 0 {
			t.Fatalf("excluded scope rows=%v total=%d err=%v", rows, total, err)
		}
	}
	cleared := biz.ProductionExceptionFilter{ProductionOrderID: 1, Limit: 1, Offset: 1}
	rows, total, err = uc.ListProductionExceptions(ctx, cleared)
	if err != nil || total != 6 || len(rows) != 1 {
		t.Fatalf("cleared handling rows=%v total=%d err=%v", rows, total, err)
	}
	filter.Status = "APPROVED"
	got, err = uc.CountProductionExceptionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"APPROVED:PENDING": 1, "APPROVED:APPLIED": 1, "APPROVED:REVERSED": 1})
	filter.ExecutionStatus = "APPLIED"
	got, err = uc.CountProductionExceptionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"APPROVED:APPLIED": 1})
	filter.HandlingStatus = "APPROVED:unknown"
	if _, err := uc.CountProductionExceptionsByStatus(ctx, filter); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("invalid handling error=%v", err)
	}
}
