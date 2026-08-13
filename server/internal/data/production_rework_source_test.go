package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func acceptProductionPackagingBatchForReworkTest(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	orderUC *biz.ProductionOrderUsecase,
	actorID int,
	aggregate *biz.ProductionWIPAggregate,
	key string,
) (*biz.ProductionWIPAggregate, *biz.ProductionWIPBatch) {
	t.Helper()
	if aggregate == nil || len(aggregate.ProductionOrderItems) != 1 || len(aggregate.Batches) == 0 {
		t.Fatalf("invalid routed production fixture: %#v", aggregate)
	}
	current := aggregate.Batches[0]
	for index, targetCode := range []string{
		biz.ProductionWIPOperationSewing,
		biz.ProductionWIPOperationHandwork,
		biz.ProductionWIPOperationPackaging,
	} {
		accepted := client.ProductionWIPBatch.UpdateOneID(current.ID).
			SetStatus(biz.ProductionWIPStatusAccepted).
			AddVersion(1).
			SaveX(ctx)
		target := productionWIPOperationForCode(t, aggregate, targetCode)
		next, err := orderUC.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{
			ProductionOrderID: aggregate.ProductionOrderID,
			BatchID:           current.ID,
			TargetOperationID: target.ID,
			ExpectedVersion:   accepted.Version,
			ActorID:           actorID,
			IdempotencyKey:    fmt.Sprintf("%s-transfer-%d", key, index),
			Quantity:          current.Quantity,
		})
		if err != nil {
			t.Fatalf("transfer routed fixture to %s: %v", targetCode, err)
		}
		aggregate = next
		current = productionWIPBatchForOperation(t, aggregate, target.ID)
	}
	assigned, err := orderUC.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-packaging-assign",
		ExecutionMode:     biz.ProductionWIPExecutionInHouse,
	})
	if err != nil {
		t.Fatalf("assign packaging fixture: %v", err)
	}
	current = productionWIPBatchByID(t, assigned, current.ID)
	confirmation := assigned.PackagingConfirmations[0]
	versionSnapshot := "返工闭环测试包装版"
	confirmed, err := orderUC.ConfirmProductionWIPPackagingMaterial(ctx, &biz.ProductionWIPAction{
		ProductionOrderID:        aggregate.ProductionOrderID,
		ProductionOrderItemID:    aggregate.ProductionOrderItems[0].ID,
		ExpectedVersion:          confirmation.Version,
		ActorID:                  actorID,
		IdempotencyKey:           key + "-packaging-confirm",
		PackagingVersionSnapshot: &versionSnapshot,
	})
	if err != nil {
		t.Fatalf("confirm packaging fixture: %v", err)
	}
	current = productionWIPBatchByID(t, confirmed, current.ID)
	started, err := orderUC.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-packaging-start",
	})
	if err != nil {
		t.Fatalf("start packaging fixture: %v", err)
	}
	current = productionWIPBatchByID(t, started, current.ID)
	completed, err := orderUC.CompleteProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-packaging-complete",
	})
	if err != nil {
		t.Fatalf("complete packaging fixture: %v", err)
	}
	current = productionWIPBatchByID(t, completed, current.ID)
	if current.Status != biz.ProductionWIPStatusAccepted {
		t.Fatalf("packaging fixture status = %s", current.Status)
	}
	return completed, current
}

func acceptProductionReworkReplacementPackagingForTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	orderUC *biz.ProductionOrderUsecase,
	actorID int,
	aggregate *biz.ProductionWIPAggregate,
	root *biz.ProductionWIPBatch,
	key string,
) (*biz.ProductionWIPAggregate, *biz.ProductionWIPBatch) {
	t.Helper()
	assigned, err := orderUC.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           root.ID,
		ExpectedVersion:   root.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-handwork-assign",
		ExecutionMode:     biz.ProductionWIPExecutionInHouse,
	})
	if err != nil {
		t.Fatalf("assign rework handwork batch: %v", err)
	}
	current := productionWIPBatchByID(t, assigned, root.ID)
	started, err := orderUC.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-handwork-start",
	})
	if err != nil {
		t.Fatalf("start rework handwork batch: %v", err)
	}
	current = productionWIPBatchByID(t, started, current.ID)
	waiting, err := orderUC.CompleteProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-handwork-complete",
	})
	if err != nil {
		t.Fatalf("complete rework handwork batch: %v", err)
	}
	current = productionWIPBatchByID(t, waiting, current.ID)
	if current.Status != biz.ProductionWIPStatusWaitingQuality {
		t.Fatalf("rework handwork status = %s, want WAITING_QUALITY", current.Status)
	}
	if _, err := orderUC.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		TargetOperationID: productionWIPOperationForCode(t, waiting, biz.ProductionWIPOperationPackaging).ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-quality-bypass",
		Quantity:          current.Quantity,
	}); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("transfer before rework quality acceptance error = %v", err)
	}
	qualityUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	for {
		currentRow := client.ProductionWIPBatch.GetX(ctx, current.ID)
		if currentRow.Status == biz.ProductionWIPStatusAccepted {
			break
		}
		inspection := client.QualityInspection.Query().Where(
			qualityinspection.ProductionWipBatchID(current.ID),
			qualityinspection.Status(biz.QualityInspectionStatusDraft),
		).OnlyX(ctx)
		if _, err := qualityUC.SubmitQualityInspection(ctx, inspection.ID); err != nil {
			t.Fatalf("submit rework quality gate: %v", err)
		}
		if _, err := qualityUC.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatalf("pass rework quality gate: %v", err)
		}
	}
	acceptedAggregate, err := orderUC.GetProductionWIP(ctx, aggregate.ProductionOrderID)
	if err != nil {
		t.Fatalf("read accepted rework WIP: %v", err)
	}
	current = productionWIPBatchByID(t, acceptedAggregate, current.ID)
	packagingOperation := productionWIPOperationForCode(t, acceptedAggregate, biz.ProductionWIPOperationPackaging)
	transferred, err := orderUC.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           current.ID,
		TargetOperationID: packagingOperation.ID,
		ExpectedVersion:   current.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-to-packaging",
		Quantity:          current.Quantity,
	})
	if err != nil {
		t.Fatalf("transfer accepted rework to packaging: %v", err)
	}
	var packaging *biz.ProductionWIPBatch
	for _, batch := range transferred.Batches {
		if batch.ProductionOrderOperationID == packagingOperation.ID &&
			batch.SourceBatchID != nil && *batch.SourceBatchID == current.ID &&
			batch.Status != biz.ProductionWIPStatusCancelled {
			packaging = batch
			break
		}
	}
	if packaging == nil {
		t.Fatal("replacement packaging batch not found")
	}
	if packaging.OriginReworkFactID == nil || root.OriginReworkFactID == nil || *packaging.OriginReworkFactID != *root.OriginReworkFactID {
		t.Fatalf("replacement packaging lineage = %#v, root=%#v", packaging.OriginReworkFactID, root.OriginReworkFactID)
	}
	assigned, err = orderUC.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           packaging.ID,
		ExpectedVersion:   packaging.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-packaging-assign",
		ExecutionMode:     biz.ProductionWIPExecutionInHouse,
	})
	if err != nil {
		t.Fatalf("assign replacement packaging: %v", err)
	}
	packaging = productionWIPBatchByID(t, assigned, packaging.ID)
	started, err = orderUC.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           packaging.ID,
		ExpectedVersion:   packaging.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-packaging-start",
	})
	if err != nil {
		t.Fatalf("start replacement packaging: %v", err)
	}
	packaging = productionWIPBatchByID(t, started, packaging.ID)
	completed, err := orderUC.CompleteProductionWIPOperation(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           packaging.ID,
		ExpectedVersion:   packaging.Version,
		ActorID:           actorID,
		IdempotencyKey:    key + "-packaging-complete",
	})
	if err != nil {
		t.Fatalf("complete replacement packaging: %v", err)
	}
	packaging = productionWIPBatchByID(t, completed, packaging.ID)
	if packaging.Status != biz.ProductionWIPStatusAccepted {
		t.Fatalf("replacement packaging status = %s", packaging.Status)
	}
	return completed, packaging
}

func TestProductionReworkFromCompletionOwnsSourceQuantityAndReversal(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_rework_source")
	logger := log.NewStdLogger(io.Discard)
	createProductionWIPRouteProcesses(t, ctx, f.client)
	warehouse := createTestWarehouse(t, ctx, f.client, "REWORK-WH")
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-REWORK-001", 10, false)
	flow, packaging := acceptProductionPackagingBatchForReworkTest(
		t, ctx, f.client, f.uc, f.actorID, flow, "rework-source",
	)
	firstLotNo := "REWORK-SOURCE-LOT"
	completion, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-REWORK-SOURCE", ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: flow.ProductionOrderItems[0].ID,
		ProductionWIPBatchID: packaging.ID,
		WarehouseID:          warehouse.ID,
		NewLotNo:             &firstLotNo,
		Quantity:             decimal.NewFromInt(6),
		IdempotencyKey:       "pf-rework-source",
	})
	if err != nil {
		t.Fatalf("create source completion: %v", err)
	}
	postedCompletion, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(completion.ID, completion.Version, f.actorID, ""))
	if err != nil {
		t.Fatalf("post source completion: %v", err)
	}
	if _, err := f.client.InventoryLot.UpdateOneID(*completion.LotID).SetStatus(biz.InventoryLotRejected).Save(ctx); err != nil {
		t.Fatalf("mark source lot rejected before rework: %v", err)
	}

	reworkIn := &biz.ProductionReworkFromCompletionCreate{
		FactNo: "PF-REWORK-001", SourceCompletionFactID: completion.ID,
		Quantity: decimal.NewFromInt(4), Reason: "成品抽检不合格，返工处理",
		IdempotencyKey: "pf-rework-001",
	}
	rework, err := factUC.CreateProductionReworkFromCompletion(ctx, reworkIn)
	if err != nil {
		t.Fatalf("create rework: %v", err)
	}
	if rework.FactType != biz.ProductionFactRework || rework.SourceType == nil || *rework.SourceType != biz.ProductionFactSourceType || rework.SourceID == nil || *rework.SourceID != completion.ID || rework.LotID == nil || completion.LotID == nil || *rework.LotID != *completion.LotID {
		t.Fatalf("unexpected source-derived rework %#v", rework)
	}
	replayed, err := factUC.CreateProductionReworkFromCompletion(ctx, reworkIn)
	if err != nil || replayed.ID != rework.ID {
		t.Fatalf("rework replay = %#v, err=%v", replayed, err)
	}
	changed := *reworkIn
	changed.Quantity = decimal.NewFromInt(3)
	if _, err := factUC.CreateProductionReworkFromCompletion(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed rework intent error = %v", err)
	}
	postedRework, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(rework.ID, rework.Version, f.actorID, ""))
	if err != nil {
		t.Fatalf("post rework from rejected source lot: %v", err)
	}
	root := f.client.ProductionWIPBatch.Query().Where(
		productionwipbatch.OriginReworkFactID(postedRework.ID),
		productionwipbatch.SourceBatchIDIsNil(),
	).OnlyX(ctx)
	if root.ProductionOrderID != flow.ProductionOrderID ||
		root.ProductionOrderItemID != flow.ProductionOrderItems[0].ID ||
		root.Status != biz.ProductionWIPStatusPlanned ||
		root.FlowType != biz.ProductionWIPFlowRework ||
		root.ReworkReason == nil || *root.ReworkReason != reworkIn.Reason {
		t.Fatalf("posted rework root WIP = %#v", root)
	}
	postReplay, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(rework.ID, rework.Version, f.actorID, ""))
	if err != nil || postReplay.ID != postedRework.ID {
		t.Fatalf("rework post replay = %#v, err=%v", postReplay, err)
	}
	legacyTaskCode := biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionExceptionGroup, rework.ID)
	legacyTask := f.client.WorkflowTask.Query().Where(workflowtask.TaskCode(legacyTaskCode)).OnlyX(ctx)
	deleteWorkflowSourceTaskBundleForBackfillTest(
		t, ctx, f.data, biz.WorkflowSourceTaskProductionFactSourceType, rework.ID, legacyTask.ID,
	)
	backfill, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, f.client)
	if err != nil || backfill.ProductionExceptionCreated != 1 {
		t.Fatalf("backfill posted REWORK source task result=%#v err=%v", backfill, err)
	}
	completeProductionExceptionTaskForTest(t, ctx, f.data, f.client, rework.ID, f.actorID)
	if got := lotBalanceQuantity(t, ctx, f.client, f.productID, f.skuID, warehouse.ID, f.unitID, *completion.LotID); !got.Equal(decimal.NewFromInt(2)) {
		t.Fatalf("source lot balance after rework = %s, want 2", got)
	}
	sourceCancelRequest := operationalFactStatusMutation(postedCompletion.ID, postedCompletion.Version, f.actorID, "撤销来源完工")
	if _, err := factUC.CancelPostedProductionFact(ctx, sourceCancelRequest); !errors.Is(err, biz.ErrProductionReworkDependency) {
		t.Fatalf("source completion cancellation error = %v", err)
	}
	tooMuch := *reworkIn
	tooMuch.FactNo = "PF-REWORK-OVER"
	tooMuch.IdempotencyKey = "pf-rework-over"
	tooMuch.Quantity = decimal.NewFromInt(3)
	if _, err := factUC.CreateProductionReworkFromCompletion(ctx, &tooMuch); !errors.Is(err, biz.ErrProductionReworkQuantityExceeded) {
		t.Fatalf("over-source rework error = %v", err)
	}

	reworkCancelReason := "撤销返工"
	cancelledRework, err := factUC.CancelPostedProductionFact(
		ctx,
		operationalFactStatusMutation(postedRework.ID, postedRework.Version, f.actorID, reworkCancelReason),
	)
	if err != nil {
		t.Fatalf("cancel untouched rework root: %v", err)
	}
	cancelledRoot := f.client.ProductionWIPBatch.GetX(ctx, root.ID)
	if cancelledRoot.Status != biz.ProductionWIPStatusCancelled || cancelledRoot.Version != 2 {
		t.Fatalf("cancelled rework root = %#v", cancelledRoot)
	}
	cancelReplay, err := factUC.CancelPostedProductionFact(
		ctx,
		operationalFactStatusMutation(cancelledRework.ID, postedRework.Version, f.actorID, reworkCancelReason),
	)
	if err != nil || cancelReplay.ID != cancelledRework.ID {
		t.Fatalf("rework cancellation replay = %#v, err=%v", cancelReplay, err)
	}
	cancelledTask := f.client.WorkflowTask.Query().Where(workflowtask.TaskCode(legacyTaskCode)).OnlyX(ctx)
	if cancelledTask.BusinessStatusKey == nil || *cancelledTask.BusinessStatusKey != "cancelled" {
		t.Fatalf("cancelled REWORK task projection = %#v", cancelledTask)
	}
	cancelledState := f.client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionFactSourceType),
		workflowbusinessstate.SourceID(rework.ID),
	).OnlyX(ctx)
	if cancelledState.BusinessStatusKey != "cancelled" || cancelledState.Payload["source_projection_action"] != "production_rework.cancel" {
		t.Fatalf("cancelled REWORK business state = %#v", cancelledState)
	}
	if got := lotBalanceQuantity(t, ctx, f.client, f.productID, f.skuID, warehouse.ID, f.unitID, *completion.LotID); !got.Equal(decimal.NewFromInt(6)) {
		t.Fatalf("source lot balance after rework reversal = %s, want 6", got)
	}
	currentCompletion := f.client.ProductionFact.GetX(ctx, postedCompletion.ID)
	if _, err := factUC.CancelPostedProductionFact(ctx, operationalFactStatusMutation(currentCompletion.ID, currentCompletion.Version, f.actorID, "撤销来源完工")); err != nil {
		t.Fatalf("cancel source completion after rework reversal: %v", err)
	}
}

func TestClosedProductionOrderReworkRequiresAcceptedReplacementPackaging(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_closed_rework_replacement")
	logger := log.NewStdLogger(io.Discard)
	createProductionWIPRouteProcesses(t, ctx, f.client)
	warehouse := createTestWarehouse(t, ctx, f.client, "CLOSED-REWORK-WH")
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-CLOSED-REWORK", 10, false)
	flow, originalPackaging := acceptProductionPackagingBatchForReworkTest(
		t, ctx, f.client, f.uc, f.actorID, flow, "closed-rework-source",
	)
	completeProductionSchedulingTaskForTest(t, ctx, f.data, f.client, flow.ProductionOrderID, f.actorID)
	firstLotNo := "CLOSED-REWORK-FIRST"
	completion, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-CLOSED-REWORK-FIRST", ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: flow.ProductionOrderItems[0].ID,
		ProductionWIPBatchID: originalPackaging.ID,
		WarehouseID:          warehouse.ID,
		NewLotNo:             &firstLotNo,
		Quantity:             decimal.NewFromInt(10),
		IdempotencyKey:       "pf-closed-rework-first",
	})
	if err != nil {
		t.Fatalf("create initial completion: %v", err)
	}
	overflowLotNo := "CLOSED-REWORK-OVERFLOW"
	if _, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-CLOSED-REWORK-OVERFLOW", ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: flow.ProductionOrderItems[0].ID,
		ProductionWIPBatchID: originalPackaging.ID,
		WarehouseID:          warehouse.ID,
		NewLotNo:             &overflowLotNo,
		Quantity:             decimal.NewFromInt(1),
		IdempotencyKey:       "pf-closed-rework-overflow",
	}); !errors.Is(err, biz.ErrProductionWIPQuantityExceeded) {
		t.Fatalf("exact packaging capacity error = %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(completion.ID, completion.Version, f.actorID, "")); err != nil {
		t.Fatalf("post initial completion: %v", err)
	}
	closed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: flow.ProductionOrderID, ExpectedVersion: flow.ProductionOrder.Version,
		ActorID: f.actorID, IdempotencyKey: "close-before-finished-goods-rework",
	})
	if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed {
		t.Fatalf("close fully completed routed order = %#v, err=%v", closed, err)
	}
	rework, err := factUC.CreateProductionReworkFromCompletion(ctx, &biz.ProductionReworkFromCompletionCreate{
		FactNo: "PF-CLOSED-REWORK", SourceCompletionFactID: completion.ID,
		Quantity: decimal.NewFromInt(4), Reason: "成品返工后重新完成手工、质检和包装",
		IdempotencyKey: "pf-closed-rework",
	})
	if err != nil {
		t.Fatalf("create rework: %v", err)
	}
	postedRework, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(rework.ID, rework.Version, f.actorID, ""))
	if err != nil {
		t.Fatalf("post rework: %v", err)
	}
	rootRow := f.client.ProductionWIPBatch.Query().Where(
		productionwipbatch.OriginReworkFactID(postedRework.ID),
		productionwipbatch.SourceBatchIDIsNil(),
	).OnlyX(ctx)
	aggregate, err := f.uc.GetProductionWIP(ctx, flow.ProductionOrderID)
	if err != nil {
		t.Fatalf("read finished-goods rework WIP: %v", err)
	}
	root := productionWIPBatchByID(t, aggregate, rootRow.ID)
	if root.Status != biz.ProductionWIPStatusPlanned ||
		root.OriginReworkFactID == nil || *root.OriginReworkFactID != postedRework.ID {
		t.Fatalf("finished-goods rework root = %#v", root)
	}
	blockedLotNo := "CLOSED-NORMAL-PACKAGING-BLOCKED"
	if _, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-CLOSED-NORMAL-PACKAGING-BLOCKED", ProductionOrderID: flow.ProductionOrderID,
		ProductionOrderItemID: flow.ProductionOrderItems[0].ID, ProductionWIPBatchID: originalPackaging.ID,
		WarehouseID: warehouse.ID, NewLotNo: &blockedLotNo, Quantity: decimal.NewFromInt(1),
		IdempotencyKey: "pf-closed-normal-packaging-blocked",
	}); !errors.Is(err, biz.ErrProductionOrderInvalidState) {
		t.Fatalf("closed normal packaging completion error = %v", err)
	}

	aggregate, replacementPackaging := acceptProductionReworkReplacementPackagingForTest(
		t, ctx, f.data, f.client, f.uc, f.actorID, aggregate, root, "closed-rework-replacement",
	)
	replacementLotNo := "CLOSED-REWORK-REPLACEMENT"
	replacement, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-CLOSED-REWORK-REPLACEMENT", ProductionOrderID: aggregate.ProductionOrderID,
		ProductionOrderItemID: aggregate.ProductionOrderItems[0].ID, ProductionWIPBatchID: replacementPackaging.ID,
		WarehouseID: warehouse.ID, NewLotNo: &replacementLotNo, Quantity: decimal.NewFromInt(4),
		IdempotencyKey: "pf-closed-rework-replacement",
	})
	if err != nil {
		t.Fatalf("create replacement completion: %v", err)
	}
	postedReplacement, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(replacement.ID, replacement.Version, f.actorID, ""))
	if err != nil {
		t.Fatalf("post replacement completion: %v", err)
	}
	if postedReplacement.ProductionWIPBatchID == nil || *postedReplacement.ProductionWIPBatchID != replacementPackaging.ID {
		t.Fatalf("replacement completion WIP linkage = %#v", postedReplacement)
	}
	completeProductionExceptionTaskForTest(t, ctx, f.data, f.client, postedRework.ID, f.actorID)
	if _, err := factUC.CancelPostedProductionFact(
		ctx,
		operationalFactStatusMutation(postedRework.ID, postedRework.Version, f.actorID, "返工已执行后不允许撤销"),
	); !errors.Is(err, biz.ErrProductionReworkExecutionDependency) {
		t.Fatalf("cancel progressed rework error = %v", err)
	}
	currentOrder := f.client.ProductionOrder.GetX(ctx, flow.ProductionOrderID)
	if currentOrder.Status != biz.ProductionOrderStatusClosed {
		t.Fatalf("replacement completion changed closed order state = %#v", currentOrder)
	}
}

func lotBalanceQuantity(t *testing.T, ctx context.Context, client *ent.Client, productID, productSKUID, warehouseID, unitID, lotID int) decimal.Decimal {
	t.Helper()
	row, err := client.InventoryBalance.Query().Where(
		inventorybalance.SubjectType(biz.InventorySubjectProduct),
		inventorybalance.SubjectID(productID),
		inventorybalance.ProductSkuID(productSKUID),
		inventorybalance.WarehouseID(warehouseID),
		inventorybalance.LotID(lotID),
		inventorybalance.UnitID(unitID),
	).Only(ctx)
	if err != nil {
		t.Fatalf("query lot balance: %v", err)
	}
	return row.Quantity
}
