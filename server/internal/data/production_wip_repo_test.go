package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionordermaterialrequirement"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionpackagingconfirmation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipevent"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func createProductionWIPRouteProcesses(t *testing.T, ctx context.Context, client *ent.Client) map[string]*ent.Process {
	t.Helper()
	create := func(code, name, category string, inhouse, outsourced bool, sortOrder int) *ent.Process {
		builder := client.Process.Create().
			SetCode(code).
			SetName(name).
			SetInhouseEnabled(inhouse).
			SetOutsourcingEnabled(outsourced).
			SetSortOrder(sortOrder).
			SetIsActive(true)
		if category != "" {
			builder.SetCategory(category)
		}
		return builder.SaveX(ctx)
	}
	return map[string]*ent.Process{
		biz.ProductionWIPOperationFabricProcessing: create("WIP-CUT", "机裁", "裁片", false, true, 400),
		biz.ProductionWIPOperationSewing:           create("WIP-SEW", "车缝", "车缝", true, true, 10),
		biz.ProductionWIPOperationHandwork:         create("WIP-HAND", "手工", "手工", true, true, 300),
		biz.ProductionWIPOperationPackaging:        create("WIP-PACK", "包装", "包装", true, false, 20),
	}
}

func releaseProductionWIPRoute(t *testing.T, ctx context.Context, f productionOrderTestFixture, orderNo string, quantity int64, customerInspection bool) *biz.ProductionWIPAggregate {
	t.Helper()
	route := biz.ProductionWIPRoutePlushSewHandV1
	draft := f.draft(orderNo, quantity)
	draft.Items[0].RouteCode = &route
	draft.Items[0].CustomerInspectionRequired = customerInspection
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: draft, ActorID: f.actorID, IdempotencyKey: orderNo + "-create",
	})
	if err != nil {
		t.Fatalf("create routed production order: %v", err)
	}
	if _, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID, IdempotencyKey: orderNo + "-release",
	}); err != nil {
		t.Fatalf("release routed production order: %v", err)
	}
	aggregate, err := f.uc.GetProductionWIP(ctx, created.Order.ID)
	if err != nil {
		t.Fatalf("get frozen WIP route: %v", err)
	}
	return aggregate
}

func productionWIPOperationForCode(t *testing.T, aggregate *biz.ProductionWIPAggregate, code string) *biz.ProductionOrderOperation {
	t.Helper()
	for _, operation := range aggregate.Operations {
		if operation.OperationCode == code {
			return operation
		}
	}
	t.Fatalf("operation %s not found", code)
	return nil
}

func productionWIPBatchByID(t *testing.T, aggregate *biz.ProductionWIPAggregate, id int) *biz.ProductionWIPBatch {
	t.Helper()
	for _, batch := range aggregate.Batches {
		if batch.ID == id {
			return batch
		}
	}
	t.Fatalf("batch %d not found", id)
	return nil
}

func productionWIPBatchForOperation(t *testing.T, aggregate *biz.ProductionWIPAggregate, operationID int) *biz.ProductionWIPBatch {
	t.Helper()
	for _, batch := range aggregate.Batches {
		if batch.ProductionOrderOperationID == operationID && batch.Status != biz.ProductionWIPStatusCancelled {
			return batch
		}
	}
	t.Fatalf("batch for operation %d not found", operationID)
	return nil
}

func completeProductionSchedulingTaskForWIPClose(t *testing.T, ctx context.Context, f productionOrderTestFixture, orderID int) {
	t.Helper()
	task := f.client.WorkflowTask.Query().Where(
		workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionSchedulingGroup, orderID)),
	).OnlyX(ctx)
	workflowUC := biz.NewWorkflowUsecase(NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard)))
	if _, err := workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID: task.ID, ExpectedVersion: task.Version, TaskStatusKey: "done",
		CommandKey: "complete_task_action", IdempotencyKey: fmt.Sprintf("complete-scheduling-%d", orderID),
	}, f.actorID, biz.PMCRoleKey); err != nil {
		t.Fatalf("complete production scheduling task: %v", err)
	}
}

func TestProductionWIPReleaseFreezesExactRouteAndRollsBackInvalidResolution(t *testing.T) {
	t.Run("freezes route by semantic identity rather than sort order", func(t *testing.T) {
		ctx := context.Background()
		f := openProductionOrderRepoTest(t, "production_wip_release_success")
		processes := createProductionWIPRouteProcesses(t, ctx, f.client)
		aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-WIP-RELEASE", 10, true)
		if aggregate.ProductionOrder.Status != biz.ProductionOrderStatusReleased || len(aggregate.ProductionOrderItems) != 1 ||
			len(aggregate.Operations) != 4 || len(aggregate.Batches) != 1 || len(aggregate.PackagingConfirmations) != 1 {
			t.Fatalf("unexpected frozen aggregate: %#v", aggregate)
		}
		item := aggregate.ProductionOrderItems[0]
		if item.RouteCode == nil || *item.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 || !item.CustomerInspectionRequired {
			t.Fatalf("route fields did not persist/read back: %#v", item)
		}
		wantCodes := []string{
			biz.ProductionWIPOperationFabricProcessing,
			biz.ProductionWIPOperationSewing,
			biz.ProductionWIPOperationHandwork,
			biz.ProductionWIPOperationPackaging,
		}
		for index, operation := range aggregate.Operations {
			if operation.StepNo != (index+1)*10 || operation.OperationCode != wantCodes[index] ||
				operation.ProcessID != processes[wantCodes[index]].ID {
				t.Fatalf("operation[%d] = %#v", index, operation)
			}
		}
		handwork := productionWIPOperationForCode(t, aggregate, biz.ProductionWIPOperationHandwork)
		if len(handwork.RequiredQualityGates) != 4 || handwork.RequiredQualityGates[3] != biz.ProductionWIPQualityGateCustomerAcceptance {
			t.Fatalf("customer inspection gate snapshot = %#v", handwork.RequiredQualityGates)
		}
		root := aggregate.Batches[0]
		if root.SourceBatchID != nil || root.ProductionOrderOperationID != aggregate.Operations[0].ID || root.Status != biz.ProductionWIPStatusPlanned ||
			root.ExecutionMode != nil || !root.Quantity.Equal(decimal.NewFromInt(10)) {
			t.Fatalf("root WIP = %#v", root)
		}
		if aggregate.PackagingConfirmations[0].Status != biz.ProductionPackagingConfirmationPending || aggregate.PackagingConfirmations[0].Version != 1 {
			t.Fatalf("packaging confirmation = %#v", aggregate.PackagingConfirmations[0])
		}
	})

	t.Run("rejects routed item without explicit fabric material ownership", func(t *testing.T) {
		ctx := context.Background()
		f := openProductionOrderRepoTest(t, "production_wip_release_missing_fabric_owner")
		createProductionWIPRouteProcesses(t, ctx, f.client)
		f.client.BOMItem.Update().ClearProductionOperationCode().SaveX(ctx)
		route := biz.ProductionWIPRoutePlushSewHandV1
		draft := f.draft("MO-WIP-MISSING-FABRIC-OWNER", 10)
		draft.Items[0].RouteCode = &route
		created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: "missing-owner-create"})
		if err != nil {
			t.Fatalf("create routed order: %v", err)
		}
		if _, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
			ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID, IdempotencyKey: "missing-owner-release",
		}); !errors.Is(err, biz.ErrProductionWIPInvalidRoute) {
			t.Fatalf("release error = %v", err)
		}
		if count := f.client.ProductionOrderMaterialRequirement.Query().Where(
			productionordermaterialrequirement.ProductionOrderID(created.Order.ID),
		).CountX(ctx); count != 0 {
			t.Fatalf("rolled-back requirements = %d", count)
		}
	})

	for _, test := range []struct {
		name      string
		ambiguous bool
	}{
		{name: "missing semantic process"},
		{name: "ambiguous semantic process", ambiguous: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			f := openProductionOrderRepoTest(t, "production_wip_release_"+fmt.Sprint(test.ambiguous))
			if test.ambiguous {
				createProductionWIPRouteProcesses(t, ctx, f.client)
				f.client.Process.Create().SetCode("WIP-CUT-DUP").SetName("裁片").SetOutsourcingEnabled(true).SetInhouseEnabled(false).SaveX(ctx)
			}
			route := biz.ProductionWIPRoutePlushSewHandV1
			draft := f.draft("MO-WIP-ROLLBACK-"+fmt.Sprint(test.ambiguous), 10)
			draft.Items[0].RouteCode = &route
			created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: "rollback-create"})
			if err != nil {
				t.Fatalf("create rollback fixture: %v", err)
			}
			if _, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "rollback-release"}); !errors.Is(err, biz.ErrProductionWIPInvalidRoute) {
				t.Fatalf("release error = %v", err)
			}
			order := f.client.ProductionOrder.GetX(ctx, created.Order.ID)
			if order.Status != biz.ProductionOrderStatusDraft || order.Version != 1 {
				t.Fatalf("failed release changed source order: %#v", order)
			}
			if count := f.client.ProductionOrderOperation.Query().Where(productionorderoperation.ProductionOrderID(order.ID)).CountX(ctx); count != 0 {
				t.Fatalf("rolled-back operation count = %d", count)
			}
			if count := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderID(order.ID)).CountX(ctx); count != 0 {
				t.Fatalf("rolled-back WIP count = %d", count)
			}
			if count := f.client.ProductionPackagingConfirmation.Query().Where(productionpackagingconfirmation.ProductionOrderID(order.ID)).CountX(ctx); count != 0 {
				t.Fatalf("rolled-back confirmation count = %d", count)
			}
			if count := f.client.ProductionOrderMaterialRequirement.Query().Where(productionordermaterialrequirement.ProductionOrderID(order.ID)).CountX(ctx); count != 0 {
				t.Fatalf("rolled-back material freeze count = %d", count)
			}
		})
	}
}

func TestProductionOrderCloseBlocksActiveWIPAndAllowsTerminalSplitLineage(t *testing.T) {
	ctx := context.Background()
	reason := "按实际完成数量短关闭"

	t.Run("planned batch blocks close", func(t *testing.T) {
		f := openProductionOrderRepoTest(t, "production_close_active_wip")
		createProductionWIPRouteProcesses(t, ctx, f.client)
		aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-CLOSE-ACTIVE-WIP", 10, false)
		completeProductionSchedulingTaskForWIPClose(t, ctx, f, aggregate.ProductionOrderID)
		if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
			ID: aggregate.ProductionOrderID, ExpectedVersion: aggregate.ProductionOrder.Version,
			ActorID: f.actorID, IdempotencyKey: "close-active-wip", Reason: &reason,
		}); !errors.Is(err, biz.ErrProductionOrderWIPActive) {
			t.Fatalf("close active WIP error = %v", err)
		}
		order := f.client.ProductionOrder.GetX(ctx, aggregate.ProductionOrderID)
		if order.Status != biz.ProductionOrderStatusReleased || order.Version != aggregate.ProductionOrder.Version {
			t.Fatalf("blocked close changed order: %+v", order)
		}
	})

	t.Run("split parent and rejected child are terminal", func(t *testing.T) {
		f := openProductionOrderRepoTest(t, "production_close_terminal_split")
		createProductionWIPRouteProcesses(t, ctx, f.client)
		aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-CLOSE-SPLIT-WIP", 10, false)
		fabricRoot := aggregate.Batches[0]
		acceptedFabric := f.client.ProductionWIPBatch.UpdateOneID(fabricRoot.ID).
			SetStatus(biz.ProductionWIPStatusAccepted).
			AddVersion(1).
			SaveX(ctx)
		sewing := productionWIPOperationForCode(t, aggregate, biz.ProductionWIPOperationSewing)
		aggregate, err := f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{
			ProductionOrderID: aggregate.ProductionOrderID, BatchID: fabricRoot.ID, TargetOperationID: sewing.ID,
			ExpectedVersion: acceptedFabric.Version, ActorID: f.actorID, IdempotencyKey: "close-split-transfer", Quantity: decimal.NewFromInt(10),
		})
		if err != nil {
			t.Fatalf("transfer to sewing: %v", err)
		}
		sewingRoot := productionWIPBatchForOperation(t, aggregate, sewing.ID)
		aggregate, err = f.uc.SplitProductionWIPBatch(ctx, &biz.ProductionWIPAction{
			ProductionOrderID: aggregate.ProductionOrderID, BatchID: sewingRoot.ID, ExpectedVersion: sewingRoot.Version,
			ActorID: f.actorID, IdempotencyKey: "close-split-batches",
			Splits: []biz.ProductionWIPSplit{{Quantity: decimal.NewFromInt(6)}, {Quantity: decimal.NewFromInt(4)}},
		})
		if err != nil {
			t.Fatalf("split sewing batch: %v", err)
		}
		completeProductionSchedulingTaskForWIPClose(t, ctx, f, aggregate.ProductionOrderID)
		if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
			ID: aggregate.ProductionOrderID, ExpectedVersion: aggregate.ProductionOrder.Version,
			ActorID: f.actorID, IdempotencyKey: "close-split-active-child", Reason: &reason,
		}); !errors.Is(err, biz.ErrProductionOrderWIPActive) {
			t.Fatalf("close split lineage with active child error = %v", err)
		}
		children := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.SourceBatchID(sewingRoot.ID)).AllX(ctx)
		if len(children) != 2 {
			t.Fatalf("split children = %d", len(children))
		}
		f.client.ProductionWIPBatch.UpdateOneID(children[0].ID).SetStatus(biz.ProductionWIPStatusAccepted).AddVersion(1).SaveX(ctx)
		f.client.ProductionWIPBatch.UpdateOneID(children[1].ID).SetStatus(biz.ProductionWIPStatusRejected).AddVersion(1).SaveX(ctx)
		closed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
			ID: aggregate.ProductionOrderID, ExpectedVersion: aggregate.ProductionOrder.Version,
			ActorID: f.actorID, IdempotencyKey: "close-split-terminal-children", Reason: &reason,
		})
		if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed {
			t.Fatalf("close terminal split lineage = %+v err=%v", closed, err)
		}
	})
}

func TestProductionWIPAggregateReadRejectsConcessionDrift(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_wip_concession_read")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-WIP-CONCESSION-READ", 10, false)
	root := aggregate.Batches[0]
	f.client.ProductionWIPBatch.UpdateOneID(root.ID).SetStatus(biz.ProductionWIPStatusWaitingQuality).AddVersion(1).SaveX(ctx)
	f.client.QualityInspection.Create().
		SetInspectionNo("WIP-CONCESSION-DRIFT").
		SetProductionWipBatchID(root.ID).
		SetGateCode(biz.ProductionWIPQualityGateCutPiece).
		SetSourceType(biz.QualityInspectionSourceProductionWIP).
		SetSourceID(root.ID).
		SetInspectionType(biz.QualityInspectionTypeProductionStage).
		SetSubjectType(biz.QualityInspectionSubjectWIP).
		SetSubjectID(root.ID).
		SetStatus(biz.QualityInspectionStatusPassed).
		SetResult(biz.QualityInspectionResultConcession).
		SaveX(ctx)
	if _, err := f.uc.GetProductionWIP(ctx, aggregate.ProductionOrderID); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("aggregate concession drift error = %v", err)
	}
}

func TestProductionWIPExternalReturnCreatesFirstQualityDraftAndReplaysExactly(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_wip_external")
	processes := createProductionWIPRouteProcesses(t, ctx, f.client)
	aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-WIP-EXTERNAL", 10, false)
	root := aggregate.Batches[0]
	if _, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "fabric-inhouse-forbidden", ExecutionMode: biz.ProductionWIPExecutionInHouse,
	}); !errors.Is(err, biz.ErrProductionWIPExecutionModeNotAllowed) {
		t.Fatalf("fabric in-house assignment error = %v", err)
	}

	supplier := f.client.Supplier.Create().SetCode("WIP-OUT-SUP").SetName("WIP 外发厂").SetSupplierType("outsourcing").SaveX(ctx)
	outsourceOrder := f.client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("WIP-OUT-ORDER").SetSupplierID(supplier.ID).SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx)
	wrongLine := f.client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(outsourceOrder.ID).SetLineNo(1).SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProductID(f.productID).SetProductSkuID(f.skuID).SetProcessID(processes[biz.ProductionWIPOperationFabricProcessing].ID).
		SetUnitID(f.unitID).SetOutsourcingQuantity(decimal.NewFromInt(9)).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
	if _, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "outsource-wrong-quantity", ExecutionMode: biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{
			OutsourcingOrderItemID:               wrongLine.ID,
			ProductionOrderMaterialRequirementID: &aggregate.MaterialRequirements[0].ID,
		}},
	}); !errors.Is(err, biz.ErrProductionWIPOutsourcingAllocationInvalid) {
		t.Fatalf("mismatched outsourcing line error = %v", err)
	}
	line := f.client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(outsourceOrder.ID).SetLineNo(2).SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
		SetMaterialID(f.materialID).SetProcessID(processes[biz.ProductionWIPOperationFabricProcessing].ID).
		SetUnitID(f.unitID).SetOutsourcingQuantity(aggregate.MaterialRequirements[0].PlannedQuantity).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
	assignInput := &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "outsource-assign", ExecutionMode: biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{
			OutsourcingOrderItemID:               line.ID,
			ProductionOrderMaterialRequirementID: &aggregate.MaterialRequirements[0].ID,
		}},
	}
	assigned, err := f.uc.AssignProductionWIPExecution(ctx, assignInput)
	if err != nil {
		t.Fatalf("assign external execution: %v", err)
	}
	assignReplay := *assignInput
	assignReplay.ExpectedVersion = 999
	if replayed, err := f.uc.AssignProductionWIPExecution(ctx, &assignReplay); err != nil ||
		len(replayed.OutsourcingAllocations) != 1 || f.client.ProductionWIPOutsourcingAllocation.Query().CountX(ctx) != 1 {
		t.Fatalf("assignment replay=%#v err=%v", replayed, err)
	}
	corrupted := *assigned
	corrupted.OutsourcingAllocations = append([]*biz.ProductionWIPOutsourcingAllocation(nil), assigned.OutsourcingAllocations...)
	badAllocation := *corrupted.OutsourcingAllocations[0]
	badAllocation.AllocatedQuantity = badAllocation.AllocatedQuantity.Add(decimal.NewFromInt(1))
	corrupted.OutsourcingAllocations[0] = &badAllocation
	if err := validateProductionWIPAggregateShape(&corrupted); !errors.Is(err, biz.ErrProductionWIPInvalidRoute) {
		t.Fatalf("corrupt allocation aggregate error = %v", err)
	}
	assignedRoot := productionWIPBatchByID(t, assigned, root.ID)
	if _, err := f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: assignedRoot.Version,
		ActorID: f.actorID, IdempotencyKey: "outsource-start-before-issue",
	}); !errors.Is(err, biz.ErrProductionWIPOutsourcingMaterialIssuePending) {
		t.Fatalf("start before material issue error = %v", err)
	}
	warehouse := f.client.Warehouse.Create().SetCode("WIP-OUT-WH").SetName("外发仓").SetType("RAW").SetIsActive(true).SaveX(ctx)
	lot := f.client.InventoryLot.Create().SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(f.materialID).SetLotNo("WIP-OUT-LOT").SetStatus(biz.InventoryLotActive).SaveX(ctx)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(f.data, logger)
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: warehouse.ID, LotID: &lot.ID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: aggregate.MaterialRequirements[0].PlannedQuantity,
		UnitID: f.unitID, SourceType: "WIP_TEST_SEED", IdempotencyKey: "wip-test-seed",
	}); err != nil {
		t.Fatalf("seed material inventory: %v", err)
	}
	factRepo := NewOperationalFactRepo(f.data, logger)
	factUC := biz.NewOperationalFactUsecase(factRepo)
	createAndPostIssue := func(suffix string) *biz.OutsourcingFact {
		t.Helper()
		draft, err := factUC.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
			FactNo: "WIP-OUT-ISSUE-" + suffix, OutsourcingOrderID: outsourceOrder.ID, OutsourcingOrderItemID: line.ID,
			WarehouseID: warehouse.ID, LotID: &lot.ID, Quantity: aggregate.MaterialRequirements[0].PlannedQuantity,
			IdempotencyKey: "wip-out-issue-" + suffix,
		})
		if err != nil {
			t.Fatalf("create material issue %s: %v", suffix, err)
		}
		posted, err := factUC.PostOutsourcingFact(ctx, draft.ID)
		if err != nil {
			t.Fatalf("post material issue %s: %v", suffix, err)
		}
		return posted
	}
	initialIssueFact := createAndPostIssue("initial")
	orderRepo := NewOutsourcingOrderRepo(f.data, logger)
	if _, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, outsourceOrder.ID, biz.OutsourcingOrderStatusCanceled); !errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency) {
		t.Fatalf("cancel allocated outsourcing order error = %v", err)
	}
	if _, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, outsourceOrder.ID, biz.OutsourcingOrderStatusClosed); !errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency) {
		t.Fatalf("close active outsourcing order error = %v", err)
	}
	if cancelled, err := factRepo.CancelPostedOutsourcingFact(ctx, initialIssueFact.ID); err != nil || cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("cancel material issue while WIP is planned = %#v err=%v", cancelled, err)
	}
	issueFact := createAndPostIssue("repost")
	started, err := f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: assignedRoot.Version,
		ActorID: f.actorID, IdempotencyKey: "outsource-start",
	})
	if err != nil {
		t.Fatalf("start external execution: %v", err)
	}
	startedRoot := productionWIPBatchByID(t, started, root.ID)
	if startedRoot.Status != biz.ProductionWIPStatusOutsourced {
		t.Fatalf("started external status = %s", startedRoot.Status)
	}
	if _, err := factRepo.CancelPostedOutsourcingFact(ctx, issueFact.ID); !errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency) {
		t.Fatalf("cancel material issue used by started WIP error = %v", err)
	}
	receivedInput := &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: startedRoot.Version,
		ActorID: f.actorID, IdempotencyKey: "outsource-return",
	}
	received, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, receivedInput)
	if err != nil {
		t.Fatalf("receive outsourcing return: %v", err)
	}
	receivedRoot := productionWIPBatchByID(t, received, root.ID)
	if receivedRoot.Status != biz.ProductionWIPStatusWaitingQuality || len(received.QualityInspections) != 1 ||
		received.QualityInspections[0].GateCode != biz.ProductionWIPQualityGateCutPiece || received.QualityInspections[0].Status != biz.QualityInspectionStatusDraft {
		t.Fatalf("external return quality handoff = %#v / %#v", receivedRoot, received.QualityInspections)
	}
	if count := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(root.ID)).CountX(ctx); count != 1 {
		t.Fatalf("first quality draft count = %d", count)
	}
	replay := *receivedInput
	replay.ExpectedVersion = 999
	replayed, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, &replay)
	if err != nil || productionWIPBatchByID(t, replayed, root.ID).Version != receivedRoot.Version {
		t.Fatalf("exact receipt replay = %#v, err=%v", replayed, err)
	}
	if count := f.client.ProductionWIPEvent.Query().Where(
		productionwipevent.ProductionWipBatchID(root.ID), productionwipevent.Action(biz.ProductionWIPEventActionOutsourcingReturn),
	).CountX(ctx); count != 1 {
		t.Fatalf("outsourcing return receipt count = %d", count)
	}
	f.client.ProductionWIPBatch.UpdateOneID(root.ID).SetStatus(biz.ProductionWIPStatusRejected).SaveX(ctx)
	if closed, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, outsourceOrder.ID, biz.OutsourcingOrderStatusClosed); err != nil || closed.LifecycleStatus != biz.OutsourcingOrderStatusClosed {
		t.Fatalf("close rejected terminal outsourcing order = %#v err=%v", closed, err)
	}
}

func TestProductionWIPFabricAllocationRequiresCompleteSingleContractMaterialCoverage(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_wip_fabric_multi_material")
	processes := createProductionWIPRouteProcesses(t, ctx, f.client)
	secondMaterial := createTestMaterial(t, ctx, f.client, f.unitID, "POR-M-SECOND")
	f.client.BOMItem.Create().SetBomHeaderID(f.bomID).SetMaterialID(secondMaterial.ID).
		SetQuantity(decimal.NewFromInt(1)).SetUnitID(f.unitID).SetLossRate(decimal.Zero).
		SetProductionOperationCode(biz.ProductionWIPOperationFabricProcessing).SaveX(ctx)
	aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-WIP-MULTI-MATERIAL", 10, false)
	if len(aggregate.MaterialRequirements) != 2 {
		t.Fatalf("material requirements = %#v", aggregate.MaterialRequirements)
	}
	requirementByMaterial := make(map[int]*biz.ProductionOrderMaterialRequirement, 2)
	for _, requirement := range aggregate.MaterialRequirements {
		requirementByMaterial[requirement.MaterialID] = requirement
	}
	createOrderAndLine := func(suffix string, materialID int, quantity decimal.Decimal) *ent.OutsourcingOrderItem {
		supplier := f.client.Supplier.Create().SetCode("WIP-MULTI-SUP-" + suffix).SetName("多材料外发厂" + suffix).SetSupplierType("outsourcing").SaveX(ctx)
		order := f.client.OutsourcingOrder.Create().SetOutsourcingOrderNo("WIP-MULTI-ORDER-" + suffix).SetSupplierID(supplier.ID).
			SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx)
		return f.client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(order.ID).SetLineNo(1).
			SetSubjectType(biz.OutsourcingOrderSubjectMaterial).SetMaterialID(materialID).
			SetProcessID(processes[biz.ProductionWIPOperationFabricProcessing].ID).SetUnitID(f.unitID).
			SetOutsourcingQuantity(quantity).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
	}
	firstRequirement := requirementByMaterial[f.materialID]
	secondRequirement := requirementByMaterial[secondMaterial.ID]
	firstLine := createOrderAndLine("A", f.materialID, firstRequirement.PlannedQuantity)
	secondLine := createOrderAndLine("B", secondMaterial.ID, secondRequirement.PlannedQuantity)
	root := aggregate.Batches[0]
	if _, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "fabric-incomplete-allocation", ExecutionMode: biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{
			OutsourcingOrderItemID: firstLine.ID, ProductionOrderMaterialRequirementID: &firstRequirement.ID,
		}},
	}); !errors.Is(err, biz.ErrProductionWIPOutsourcingAllocationInvalid) {
		t.Fatalf("incomplete material coverage error = %v", err)
	}
	if _, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "fabric-cross-contract-allocation", ExecutionMode: biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{
			{OutsourcingOrderItemID: firstLine.ID, ProductionOrderMaterialRequirementID: &firstRequirement.ID},
			{OutsourcingOrderItemID: secondLine.ID, ProductionOrderMaterialRequirementID: &secondRequirement.ID},
		},
	}); !errors.Is(err, biz.ErrProductionWIPOutsourcingAllocationInvalid) {
		t.Fatalf("cross-contract material allocation error = %v", err)
	}
}

func TestProductionWIPSplitTransferReworkPackagingAndCompletionGate(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_wip_flow")
	processes := createProductionWIPRouteProcesses(t, ctx, f.client)
	aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-WIP-FLOW", 10, false)
	root := aggregate.Batches[0]
	if _, err := f.uc.SplitProductionWIPBatch(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "fabric-split-forbidden",
		Splits: []biz.ProductionWIPSplit{{Quantity: decimal.NewFromInt(6)}, {Quantity: decimal.NewFromInt(4)}},
	}); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("fabric split error = %v", err)
	}
	acceptedRoot := f.client.ProductionWIPBatch.UpdateOneID(root.ID).SetStatus(biz.ProductionWIPStatusAccepted).AddVersion(1).SaveX(ctx)
	sewing := productionWIPOperationForCode(t, aggregate, biz.ProductionWIPOperationSewing)
	transferredToSewing, err := f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, TargetOperationID: sewing.ID,
		ExpectedVersion: acceptedRoot.Version, ActorID: f.actorID, IdempotencyKey: "fabric-to-sewing", Quantity: decimal.NewFromInt(10),
	})
	if err != nil {
		t.Fatalf("transfer fabric to sewing: %v", err)
	}
	aggregate = transferredToSewing
	root = productionWIPBatchForOperation(t, aggregate, sewing.ID)
	splitInput := &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version,
		ActorID: f.actorID, IdempotencyKey: "split-exact", Splits: []biz.ProductionWIPSplit{{Quantity: decimal.NewFromInt(6)}, {Quantity: decimal.NewFromInt(4)}},
	}
	split, err := f.uc.SplitProductionWIPBatch(ctx, splitInput)
	if err != nil {
		t.Fatalf("split batch: %v", err)
	}
	if productionWIPBatchByID(t, split, root.ID).Status != biz.ProductionWIPStatusSplit || len(split.Batches) != 4 {
		t.Fatalf("split aggregate = %#v", split.Batches)
	}
	replay := *splitInput
	replay.ExpectedVersion = 999
	if replayed, err := f.uc.SplitProductionWIPBatch(ctx, &replay); err != nil || len(replayed.Batches) != 4 {
		t.Fatalf("split exact replay = %#v, err=%v", replayed, err)
	}
	changed := replay
	changed.Splits = []biz.ProductionWIPSplit{{Quantity: decimal.NewFromInt(5)}, {Quantity: decimal.NewFromInt(5)}}
	if _, err := f.uc.SplitProductionWIPBatch(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed split intent error = %v", err)
	}
	if _, err := f.uc.SplitProductionWIPBatch(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: root.ID, ExpectedVersion: 1, ActorID: f.actorID,
		IdempotencyKey: "split-stale-cas", Splits: []biz.ProductionWIPSplit{{Quantity: decimal.NewFromInt(5)}, {Quantity: decimal.NewFromInt(5)}},
	}); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("stale split CAS error = %v", err)
	}

	var four *biz.ProductionWIPBatch
	for _, batch := range split.Batches {
		if batch.SourceBatchID != nil && batch.Quantity.Equal(decimal.NewFromInt(4)) {
			four = batch
		}
	}
	if four == nil {
		t.Fatal("four-unit split child not found")
	}
	rejected := f.client.ProductionWIPBatch.UpdateOneID(four.ID).SetStatus(biz.ProductionWIPStatusRejected).AddVersion(1).SaveX(ctx)
	fabric := productionWIPOperationForCode(t, aggregate, biz.ProductionWIPOperationFabricProcessing)
	reason := "裁片返修"
	reworked, err := f.uc.ReworkProductionWIPBatch(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: four.ID, TargetOperationID: fabric.ID,
		ExpectedVersion: rejected.Version, ActorID: f.actorID, IdempotencyKey: "rework-four", Quantity: decimal.NewFromInt(4), Reason: &reason,
	})
	if err != nil {
		t.Fatalf("rework rejected batch: %v", err)
	}
	var reworkChild *biz.ProductionWIPBatch
	for _, batch := range reworked.Batches {
		if batch.SourceBatchID != nil && *batch.SourceBatchID == four.ID && batch.FlowType == biz.ProductionWIPFlowRework {
			reworkChild = batch
		}
	}
	if reworkChild == nil || reworkChild.ReworkReason == nil || *reworkChild.ReworkReason != reason || !reworkChild.Quantity.Equal(decimal.NewFromInt(4)) {
		t.Fatalf("rework child = %#v", reworkChild)
	}
	reworkSupplier := f.client.Supplier.Create().SetCode("WIP-REWORK-SUP").SetName("返工外发厂").SetSupplierType("outsourcing").SaveX(ctx)
	reworkOrder := f.client.OutsourcingOrder.Create().SetOutsourcingOrderNo("WIP-REWORK-ORDER").SetSupplierID(reworkSupplier.ID).
		SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx)
	reworkLine := f.client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(reworkOrder.ID).SetLineNo(1).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetProductID(f.productID).SetProductSkuID(f.skuID).
		SetProcessID(processes[biz.ProductionWIPOperationFabricProcessing].ID).SetUnitID(f.unitID).
		SetOutsourcingQuantity(decimal.NewFromInt(4)).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
	reworkAssigned, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: reworkChild.ID, ExpectedVersion: reworkChild.Version,
		ActorID: f.actorID, IdempotencyKey: "rework-outsource-assign", ExecutionMode: biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: reworkLine.ID}},
	})
	if err != nil {
		t.Fatalf("assign fabric rework product contract: %v", err)
	}
	corruptedRework := *reworkAssigned
	corruptedRework.OutsourcingAllocations = append([]*biz.ProductionWIPOutsourcingAllocation(nil), reworkAssigned.OutsourcingAllocations...)
	badReworkAllocation := *corruptedRework.OutsourcingAllocations[len(corruptedRework.OutsourcingAllocations)-1]
	badReworkAllocation.UnitID++
	corruptedRework.OutsourcingAllocations[len(corruptedRework.OutsourcingAllocations)-1] = &badReworkAllocation
	if err := validateProductionWIPAggregateShape(&corruptedRework); !errors.Is(err, biz.ErrProductionWIPInvalidRoute) {
		t.Fatalf("corrupt product allocation aggregate error = %v", err)
	}
	reworkAssignedBatch := productionWIPBatchByID(t, reworkAssigned, reworkChild.ID)
	if startedRework, err := f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: reworkChild.ID, ExpectedVersion: reworkAssignedBatch.Version,
		ActorID: f.actorID, IdempotencyKey: "rework-outsource-start",
	}); err != nil || productionWIPBatchByID(t, startedRework, reworkChild.ID).Status != biz.ProductionWIPStatusOutsourced {
		t.Fatalf("start fabric rework without new material issue = %#v err=%v", startedRework, err)
	}
	if _, err := f.uc.ReworkProductionWIPBatch(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID, BatchID: four.ID, TargetOperationID: fabric.ID,
		ExpectedVersion: rejected.Version + 1, ActorID: f.actorID, IdempotencyKey: "rework-overflow", Quantity: decimal.NewFromInt(1), Reason: &reason,
	}); !errors.Is(err, biz.ErrProductionWIPQuantityExceeded) {
		t.Fatalf("rework overflow error = %v", err)
	}

	// Use a separate root route for the straight-through internal path so the
	// split/rework lineage above cannot be double-counted as transfer output.
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-WIP-PACKAGING", 10, false)
	flowItem := flow.ProductionOrderItems[0]
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	if _, err := factRepo.ResolveProductionCompletionSource(ctx, flow.ProductionOrderID, flowItem.ID); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("completion source before final packaging error = %v", err)
	}
	current := flow.Batches[0]
	operationCodes := []string{
		biz.ProductionWIPOperationSewing,
		biz.ProductionWIPOperationHandwork,
		biz.ProductionWIPOperationPackaging,
	}
	for index, targetCode := range operationCodes {
		accepted := f.client.ProductionWIPBatch.UpdateOneID(current.ID).SetStatus(biz.ProductionWIPStatusAccepted).AddVersion(1).SaveX(ctx)
		target := productionWIPOperationForCode(t, flow, targetCode)
		transferred, err := f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{
			ProductionOrderID: flow.ProductionOrderID, BatchID: current.ID, TargetOperationID: target.ID,
			ExpectedVersion: accepted.Version, ActorID: f.actorID, IdempotencyKey: fmt.Sprintf("transfer-%d", index), Quantity: decimal.NewFromInt(10),
		})
		if err != nil {
			t.Fatalf("transfer to %s: %v", targetCode, err)
		}
		current = productionWIPBatchForOperation(t, transferred, target.ID)
		flow = transferred
	}
	assigned, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: flow.ProductionOrderID, BatchID: current.ID, ExpectedVersion: current.Version,
		ActorID: f.actorID, IdempotencyKey: "packaging-inhouse", ExecutionMode: biz.ProductionWIPExecutionInHouse,
	})
	if err != nil {
		t.Fatalf("assign packaging in-house: %v", err)
	}
	packaging := productionWIPBatchByID(t, assigned, current.ID)
	if _, err := f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: flow.ProductionOrderID, BatchID: packaging.ID, ExpectedVersion: packaging.Version,
		ActorID: f.actorID, IdempotencyKey: "packaging-start-blocked",
	}); !errors.Is(err, biz.ErrProductionWIPPackagingConfirmationPending) {
		t.Fatalf("packaging start before confirmation error = %v", err)
	}
	confirmation := assigned.PackagingConfirmations[0]
	versionSnapshot := "包材版 V2"
	confirmInput := &biz.ProductionWIPAction{
		ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: flowItem.ID, ExpectedVersion: confirmation.Version,
		ActorID: f.actorID, IdempotencyKey: "packaging-confirm", PackagingVersionSnapshot: &versionSnapshot,
	}
	confirmed, err := f.uc.ConfirmProductionWIPPackagingMaterial(ctx, confirmInput)
	if err != nil || confirmed.PackagingConfirmations[0].Status != biz.ProductionPackagingConfirmationConfirmed {
		t.Fatalf("confirm packaging material = %#v, err=%v", confirmed, err)
	}
	confirmReplay := *confirmInput
	confirmReplay.ExpectedVersion = 999
	if _, err := f.uc.ConfirmProductionWIPPackagingMaterial(ctx, &confirmReplay); err != nil {
		t.Fatalf("packaging confirmation replay: %v", err)
	}
	changedNote := "different note"
	confirmReplay.Note = &changedNote
	if _, err := f.uc.ConfirmProductionWIPPackagingMaterial(ctx, &confirmReplay); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed packaging receipt error = %v", err)
	}
	started, err := f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: flow.ProductionOrderID, BatchID: packaging.ID, ExpectedVersion: packaging.Version,
		ActorID: f.actorID, IdempotencyKey: "packaging-start-confirmed",
	})
	if err != nil {
		t.Fatalf("start packaging after confirmation: %v", err)
	}
	startedPackaging := productionWIPBatchByID(t, started, packaging.ID)
	completed, err := f.uc.CompleteProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: flow.ProductionOrderID, BatchID: packaging.ID, ExpectedVersion: startedPackaging.Version,
		ActorID: f.actorID, IdempotencyKey: "packaging-complete",
	})
	if err != nil {
		t.Fatalf("complete packaging: %v", err)
	}
	if productionWIPBatchByID(t, completed, packaging.ID).Status != biz.ProductionWIPStatusAccepted {
		t.Fatalf("final packaging batch = %#v", productionWIPBatchByID(t, completed, packaging.ID))
	}
	if _, err := factRepo.ResolveProductionCompletionSource(ctx, flow.ProductionOrderID, flowItem.ID); err != nil {
		t.Fatalf("completion source after packaging acceptance: %v", err)
	}
	itemRow := f.client.ProductionOrderItem.GetX(ctx, flowItem.ID)
	if err := validateProductionOrderFinishedQuantity(ctx, f.client, itemRow, decimal.NewFromInt(10)); err != nil {
		t.Fatalf("accepted completion quantity gate: %v", err)
	}
	if err := validateProductionOrderFinishedQuantity(ctx, f.client, itemRow, decimal.NewFromInt(11)); !errors.Is(err, biz.ErrProductionOrderQuantityExceeded) {
		t.Fatalf("completion overflow error = %v", err)
	}
}
