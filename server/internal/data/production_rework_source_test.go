package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionReworkFromCompletionOwnsSourceQuantityAndReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_rework_source")
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryTestFixtures(t, ctx, client)
	actor := client.AdminUser.Create().SetUsername("production-rework-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	orderUC := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))

	created, err := orderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: biz.ProductionOrderDraft{OrderNo: "MO-REWORK-001", Items: []biz.ProductionOrderDraftItem{{
			LineNo: 1, ProductID: fixtures.productID, UnitID: fixtures.unitID, PlannedQuantity: decimal.NewFromInt(10),
		}}},
		ActorID: actor.ID, IdempotencyKey: "mo-rework-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := orderUC.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: actor.ID, IdempotencyKey: "mo-rework-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	firstLotNo := "REWORK-SOURCE-LOT"
	completion, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-REWORK-SOURCE", ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID,
		WarehouseID: fixtures.warehouseID, NewLotNo: &firstLotNo, Quantity: decimal.NewFromInt(6),
		IdempotencyKey: "pf-rework-source",
	})
	if err != nil {
		t.Fatalf("create source completion: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, completion.ID); err != nil {
		t.Fatalf("post source completion: %v", err)
	}
	if _, err := client.InventoryLot.UpdateOneID(*completion.LotID).SetStatus(biz.InventoryLotRejected).Save(ctx); err != nil {
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
	if _, err := factUC.PostProductionFact(ctx, rework.ID); err != nil {
		t.Fatalf("post rework from rejected source lot: %v", err)
	}
	legacyTaskCode := biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionExceptionGroup, rework.ID)
	legacyTask := client.WorkflowTask.Query().Where(workflowtask.TaskCode(legacyTaskCode)).OnlyX(ctx)
	client.WorkflowTaskEvent.Delete().Where(workflowtaskevent.TaskID(legacyTask.ID)).ExecX(ctx)
	client.WorkflowBusinessState.Delete().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionFactSourceType),
		workflowbusinessstate.SourceID(rework.ID),
	).ExecX(ctx)
	client.WorkflowTask.DeleteOne(legacyTask).ExecX(ctx)
	backfill, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, client)
	if err != nil || backfill.ProductionExceptionCreated != 1 {
		t.Fatalf("backfill posted REWORK source task result=%#v err=%v", backfill, err)
	}
	completeProductionExceptionTaskForTest(t, ctx, data, client, rework.ID, actor.ID)
	if got := lotBalanceQuantity(t, ctx, client, fixtures.productID, fixtures.warehouseID, fixtures.unitID, *completion.LotID); !got.Equal(decimal.NewFromInt(2)) {
		t.Fatalf("source lot balance after rework = %s, want 2", got)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, completion.ID); !errors.Is(err, biz.ErrProductionReworkDependency) {
		t.Fatalf("source completion cancellation error = %v", err)
	}
	tooMuch := *reworkIn
	tooMuch.FactNo = "PF-REWORK-OVER"
	tooMuch.IdempotencyKey = "pf-rework-over"
	tooMuch.Quantity = decimal.NewFromInt(3)
	if _, err := factUC.CreateProductionReworkFromCompletion(ctx, &tooMuch); !errors.Is(err, biz.ErrProductionReworkQuantityExceeded) {
		t.Fatalf("over-source rework error = %v", err)
	}

	secondLotNo := "REWORK-RECEIPT-LOT"
	recompleted, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-REWORK-RECEIPT", ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID,
		WarehouseID: fixtures.warehouseID, NewLotNo: &secondLotNo, Quantity: decimal.NewFromInt(8),
		IdempotencyKey: "pf-rework-receipt",
	})
	if err != nil {
		t.Fatalf("create completion after rework: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, recompleted.ID); err != nil {
		t.Fatalf("post completion after rework: %v", err)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, rework.ID); !errors.Is(err, biz.ErrProductionOrderQuantityExceeded) {
		t.Fatalf("rework cancellation with replacement completion error = %v", err)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, recompleted.ID); err != nil {
		t.Fatalf("cancel replacement completion: %v", err)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, rework.ID); err != nil {
		t.Fatalf("cancel rework after replacement reversal: %v", err)
	}
	cancelledTask := client.WorkflowTask.Query().Where(workflowtask.TaskCode(legacyTaskCode)).OnlyX(ctx)
	if cancelledTask.BusinessStatusKey == nil || *cancelledTask.BusinessStatusKey != "cancelled" {
		t.Fatalf("cancelled REWORK task projection = %#v", cancelledTask)
	}
	cancelledState := client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionFactSourceType),
		workflowbusinessstate.SourceID(rework.ID),
	).OnlyX(ctx)
	if cancelledState.BusinessStatusKey != "cancelled" || cancelledState.Payload["source_projection_action"] != "production_rework.cancel" {
		t.Fatalf("cancelled REWORK business state = %#v", cancelledState)
	}
	if got := lotBalanceQuantity(t, ctx, client, fixtures.productID, fixtures.warehouseID, fixtures.unitID, *completion.LotID); !got.Equal(decimal.NewFromInt(6)) {
		t.Fatalf("source lot balance after rework reversal = %s, want 6", got)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, completion.ID); err != nil {
		t.Fatalf("cancel source completion after rework reversal: %v", err)
	}
}

func TestProductionOrderCloseUsesNetCompletionAfterRework(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_close_net_rework")
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryTestFixtures(t, ctx, client)
	actor := client.AdminUser.Create().SetUsername("production-close-net-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	orderUC := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))

	created, err := orderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: biz.ProductionOrderDraft{OrderNo: "MO-CLOSE-NET-REWORK", Items: []biz.ProductionOrderDraftItem{{
			LineNo: 1, ProductID: fixtures.productID, UnitID: fixtures.unitID, PlannedQuantity: decimal.NewFromInt(10),
		}}},
		ActorID: actor.ID, IdempotencyKey: "mo-close-net-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := orderUC.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: actor.ID, IdempotencyKey: "mo-close-net-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	completeProductionSchedulingTaskForTest(t, ctx, data, client, released.Order.ID, actor.ID)

	firstLotNo := "CLOSE-NET-FIRST"
	completion, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-CLOSE-NET-FIRST", ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID,
		WarehouseID: fixtures.warehouseID, NewLotNo: &firstLotNo, Quantity: decimal.NewFromInt(10),
		IdempotencyKey: "pf-close-net-first",
	})
	if err != nil {
		t.Fatalf("create initial completion: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, completion.ID); err != nil {
		t.Fatalf("post initial completion: %v", err)
	}
	rework, err := factUC.CreateProductionReworkFromCompletion(ctx, &biz.ProductionReworkFromCompletionCreate{
		FactNo: "PF-CLOSE-NET-REWORK", SourceCompletionFactID: completion.ID,
		Quantity: decimal.NewFromInt(4), Reason: "返工后等待重新完工", IdempotencyKey: "pf-close-net-rework",
	})
	if err != nil {
		t.Fatalf("create rework: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, rework.ID); err != nil {
		t.Fatalf("post rework: %v", err)
	}
	if _, err := orderUC.Close(ctx, &biz.ProductionOrderAction{
		ID: released.Order.ID, ExpectedVersion: released.Order.Version, ActorID: actor.ID, IdempotencyKey: "mo-close-net-incomplete",
	}); !errors.Is(err, biz.ErrProductionOrderCloseReasonRequired) {
		t.Fatalf("close after net-short completion error = %v", err)
	}

	replacementLotNo := "CLOSE-NET-REPLACEMENT"
	replacement, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-CLOSE-NET-REPLACEMENT", ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID,
		WarehouseID: fixtures.warehouseID, NewLotNo: &replacementLotNo, Quantity: decimal.NewFromInt(4),
		IdempotencyKey: "pf-close-net-replacement",
	})
	if err != nil {
		t.Fatalf("create replacement completion: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, replacement.ID); err != nil {
		t.Fatalf("post replacement completion: %v", err)
	}
	closed, err := orderUC.Close(ctx, &biz.ProductionOrderAction{
		ID: released.Order.ID, ExpectedVersion: released.Order.Version, ActorID: actor.ID, IdempotencyKey: "mo-close-net-complete",
	})
	if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed || closed.Order.CloseReason != nil {
		t.Fatalf("close after replacement completion = %#v, err=%v", closed, err)
	}
}

func lotBalanceQuantity(t *testing.T, ctx context.Context, client *ent.Client, productID, warehouseID, unitID, lotID int) decimal.Decimal {
	t.Helper()
	row, err := client.InventoryBalance.Query().Where(
		inventorybalance.SubjectType(biz.InventorySubjectProduct),
		inventorybalance.SubjectID(productID),
		inventorybalance.ProductSkuIDIsNil(),
		inventorybalance.WarehouseID(warehouseID),
		inventorybalance.LotID(lotID),
		inventorybalance.UnitID(unitID),
	).Only(ctx)
	if err != nil {
		t.Fatalf("query lot balance: %v", err)
	}
	return row.Quantity
}
