package data

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestWarehouseProductionWorkReturnStagesDoNotPostInventory(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "warehouse_return_work")
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-WH-RETURN", 5, false)
	batch := flow.Batches[0]
	list := func() *biz.WarehouseProductionWorkPage {
		t.Helper()
		page, err := f.uc.ListWarehouseProductionWork(ctx, biz.WarehouseProductionWorkFilter{Kind: biz.WarehouseProductionKindReturn})
		if err != nil {
			t.Fatal(err)
		}
		return page
	}
	if page := list(); page.Total != 0 {
		t.Fatal("planned work is not an actual outsourcing return")
	}
	// Prepare the reached state for this read-only projection; domain writes
	// and quantity mismatch behavior remain covered by WIP command tests.
	f.client.ProductionWIPBatch.UpdateOneID(batch.ID).SetExecutionMode(biz.ProductionWIPExecutionOutsourced).SetStatus(biz.ProductionWIPStatusOutsourced).SetStartedAt(time.Now()).SaveX(ctx)
	page := list()
	if page.Total != 1 || page.Items[0].Stage != biz.WarehouseProductionStageReturn || page.Items[0].Action != biz.ProductionWIPActionReceiveOutsourcingReturn {
		t.Fatalf("return queue=%#v", page)
	}
	f.client.ProductionWIPBatch.UpdateOneID(batch.ID).SetStatus(biz.ProductionWIPStatusWaitingQuality).SaveX(ctx)
	page = list()
	if page.Items[0].Stage != biz.WarehouseProductionStageQuality || page.Items[0].Action != "" {
		t.Fatalf("quality handoff=%#v", page)
	}
	if f.client.InventoryTxn.Query().CountX(ctx) != 0 {
		t.Fatal("WIP return projection wrote inventory")
	}
}

func TestWarehouseProductionWorkReceiptStagesPaginationAndWarehouseScope(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "warehouse_production_work")
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-WH-WORK", 10, false)
	flow, handwork := acceptProductionHandworkBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "wh-work")
	firstWarehouse := createTestProductWarehouse(t, ctx, f.client, "WH-WORK-A")
	secondWarehouse := createTestProductWarehouse(t, ctx, f.client, "WH-WORK-B")
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	create := func(no string, warehouseID int, quantity int64) *biz.ProductionFact {
		t.Helper()
		lot := no + "-LOT"
		row, err := facts.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{FactNo: no, ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: handwork.ProductionOrderItemID, ProductionWIPBatchID: handwork.ID, WarehouseID: warehouseID, NewLotNo: &lot, Quantity: decimal.NewFromInt(quantity), IdempotencyKey: no})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	first, second := create("FG-WORK-A", firstWarehouse.ID, 6), create("FG-WORK-B", secondWarehouse.ID, 4)
	list := func(readCtx context.Context, filter biz.WarehouseProductionWorkFilter) *biz.WarehouseProductionWorkPage {
		t.Helper()
		filter.Kind = biz.WarehouseProductionKindReceipt
		page, err := f.uc.ListWarehouseProductionWork(readCtx, filter)
		if err != nil {
			t.Fatal(err)
		}
		return page
	}
	page := list(ctx, biz.WarehouseProductionWorkFilter{Limit: 1})
	if page.Total != 2 || len(page.Items) != 1 || page.Counts[biz.WarehouseProductionStageInbound] != 2 {
		t.Fatalf("pagination and global stage counts: %#v", page)
	}
	page = list(biz.WithWarehouseDataScope(ctx, biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{secondWarehouse.ID}}), biz.WarehouseProductionWorkFilter{})
	if page.Total != 1 || page.Items[0].FactID != second.ID {
		t.Fatalf("warehouse scope leaked: %#v", page)
	}
	page = list(biz.WithWarehouseDataScope(ctx, biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}), biz.WarehouseProductionWorkFilter{})
	if page.Total != 0 || len(page.Items) != 0 {
		t.Fatal("empty scope must not expose receipts")
	}
	if _, err := facts.PostProductionFact(ctx, operationalFactStatusMutation(first.ID, first.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	page = list(ctx, biz.WarehouseProductionWorkFilter{Stage: biz.WarehouseProductionStagePackaging})
	if page.Total != 1 || page.Items[0].FactID != first.ID || page.Items[0].PendingPackagingQuantity != "6" || page.Items[0].Action != biz.ProductionWIPActionTransferToNextOperation {
		t.Fatalf("posted receipt projection: %#v", page)
	}
	readiness, err := productionFinishedGoodsReadiness(ctx, f.client, biz.InventoryBalanceKey{SubjectType: first.SubjectType, SubjectID: first.SubjectID, ProductSkuID: first.ProductSkuID, WarehouseID: first.WarehouseID, LotID: first.LotID, UnitID: first.UnitID})
	if err != nil || readiness.PendingPackaging.String() != page.Items[0].PendingPackagingQuantity {
		t.Fatalf("inventory readiness drift: %+v %v", readiness, err)
	}
	op := productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationPackaging)
	current := f.client.ProductionWIPBatch.GetX(ctx, handwork.ID)
	flow, err = f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: handwork.ID, ExpectedVersion: current.Version, TargetOperationID: op.ID, FinishedGoodsReceiptID: first.ID, Quantity: decimal.NewFromInt(6), ActorID: f.actorID, IdempotencyKey: "wh-work-pack-transfer"})
	if err != nil {
		t.Fatal(err)
	}
	packing := productionWIPBatchForOperation(t, flow, op.ID)
	page = list(ctx, biz.WarehouseProductionWorkFilter{Keyword: "FG-WORK-A"})
	if len(page.Items) != 1 || page.Items[0].ActionBatchID != packing.ID || page.Items[0].Action != biz.ProductionWIPActionAssignExecution {
		t.Fatalf("packing source/assignment: %#v", page)
	}
	version := "确认包装资料"
	if _, err = f.uc.ConfirmProductionWIPPackagingMaterial(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: handwork.ProductionOrderItemID, ExpectedVersion: flow.PackagingConfirmations[0].Version, ActorID: f.actorID, IdempotencyKey: "wh-work-pack-confirm", PackagingVersionSnapshot: &version}); err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{biz.ProductionWIPActionAssignExecution, biz.ProductionWIPActionStartOperation, biz.ProductionWIPActionCompleteOperation} {
		batch := f.client.ProductionWIPBatch.GetX(ctx, packing.ID)
		in := &biz.ProductionWIPAction{Action: action, ProductionOrderID: flow.ProductionOrderID, BatchID: packing.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "wh-work-" + action}
		if action == biz.ProductionWIPActionAssignExecution {
			in.ExecutionMode = biz.ProductionWIPExecutionInHouse
		}
		if _, err = f.uc.ApplyProductionWIPAction(ctx, in); err != nil {
			t.Fatal(err)
		}
	}
	before := f.client.InventoryTxn.Query().CountX(ctx)
	page = list(ctx, biz.WarehouseProductionWorkFilter{Stage: biz.WarehouseProductionStageReady})
	if page.Total != 1 || page.Items[0].PendingInspectionQuantity != "0" || page.Items[0].PendingPackagingQuantity != "0" || !page.Items[0].PackagingConfirmed {
		t.Fatalf("completed packing: %#v", page)
	}
	if f.client.InventoryTxn.Query().CountX(ctx) != before {
		t.Fatal("read projection changed inventory")
	}
	page = list(ctx, biz.WarehouseProductionWorkFilter{Keyword: "' OR 1=1 --"})
	if page.Total != 0 {
		t.Fatal("search must remain parameterized")
	}
}
