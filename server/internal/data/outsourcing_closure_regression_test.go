package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOutsourcingContractRejectsUnpricedConfirmation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "test_unpriced")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "TEST-UNPRICED", decimal.NewFromInt(2))
	actor := client.AdminUser.Create().SetUsername("test-unpriced-actor").SetPasswordHash("test-only").SaveX(ctx)
	order := client.OutsourcingOrder.UpdateOneID(source.order.ID).SetLifecycleStatus(biz.OutsourcingOrderStatusDraft).SetExpectedReturnDate(time.Now().Add(24 * time.Hour)).SetContractPartySnapshot(map[string]any{"buyerCompany": "Test Buyer", "buyerContact": "Test", "buyerPhone": "123", "buyerAddress": "Test Address"}).SetSupplierSnapshot(map[string]any{"name": "Test Supplier", "contact_name": "Test", "contact_phone": "123", "address": "Test Address"}).SaveX(ctx)
	client.OutsourcingOrderItem.UpdateOneID(source.materialLine.ID).SetProcessingItem("Test Process").SaveX(ctx)
	client.OutsourcingOrderItem.UpdateOneID(source.productLine.ID).SetProcessingItem("Test Process").SaveX(ctx)
	uc := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(data, log.NewStdLogger(io.Discard)))
	_, err := uc.SubmitOutsourcingOrderWithAction(ctx, &biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version, ActorID: actor.ID, IdempotencyKey: "unpriced-submit"})
	if !errors.Is(err, biz.ErrOutsourcingOrderIncomplete) {
		t.Fatalf("unpriced submission: %v", err)
	}
	current := client.OutsourcingOrder.GetX(ctx, order.ID)
	if current.Version != order.Version || current.LifecycleStatus != biz.OutsourcingOrderStatusDraft {
		t.Fatal("invalid submission mutated order")
	}
	// The repository also validates under the parent lock, closing the race
	// between an earlier usecase read and a draft price edit.
	action, err := biz.NormalizeSourceOrderLifecycleAction(biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version, ActorID: actor.ID, IdempotencyKey: "atomic-submit"}, biz.SourceOrderActionSubmit)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = NewOutsourcingOrderRepo(data, log.NewStdLogger(io.Discard)).ApplyOutsourcingOrderLifecycleAction(ctx, &action, biz.OutsourcingOrderStatusSubmitted); !errors.Is(err, biz.ErrOutsourcingOrderIncomplete) {
		t.Fatalf("atomic price guard: %v", err)
	}

}
func TestOutsourcingStageNormalCloseAndPayable(t *testing.T) {
	f := openProductionOrderRepoTest(t, "stage_close_payable")
	createProductionWIPRouteProcesses(t, context.Background(), f.client)
	testOutsourcingStageNormalCloseAndPayable(t, f)
}
func TestOutsourcingNormalClosePostgresStagePayable(t *testing.T) {
	pg := openProductionOrderPGFixture(t)
	ensureProductionWIPRouteProcessesForPostgresRace(t, context.Background(), pg.client, pg.suffix)
	f := productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID}
	testOutsourcingStageNormalCloseAndPayable(t, f)
}
func testOutsourcingStageNormalCloseAndPayable(t *testing.T, f productionOrderTestFixture) {
	t.Helper()
	ctx := context.Background()
	warehouse := createTestProductWarehouse(t, ctx, f.client, "STAGE-NO-INVENTORY-RETURN")
	flow := releaseProductionWIPRoute(t, ctx, f, "TEST-WIP-CLOSE", 2, false)
	root := flow.Batches[0]
	// Upstream completion is fixture state; all target sewing commands below use business usecases.
	acceptedRoot := f.client.ProductionWIPBatch.UpdateOneID(root.ID).SetStatus(biz.ProductionWIPStatusAccepted).AddVersion(1).SaveX(ctx)
	sewing := productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationSewing)
	flow, err := f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: root.ID, TargetOperationID: sewing.ID, ExpectedVersion: acceptedRoot.Version, ActorID: f.actorID, Quantity: root.Quantity, IdempotencyKey: "test-to-sewing"})
	if err != nil {
		t.Fatal(err)
	}
	batch := productionWIPBatchForOperation(t, flow, sewing.ID)
	vendor := f.client.Supplier.Create().SetCode("TEST-SEW-VENDOR").SetName("Test Supplier").SetSupplierType("outsourcing").SaveX(ctx)
	prepared, err := f.uc.PrepareProductionOutsourcing(ctx, &biz.ProductionOutsourcingPrepare{BatchID: batch.ID, ExpectedVersion: batch.Version, SupplierID: vendor.ID, ExpectedReturnDate: time.Now().Add(24 * time.Hour), ActorID: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	// A confirmed and priced contract is the input fixture for route execution and settlement.
	contract := f.client.OutsourcingOrder.UpdateOneID(prepared.OutsourcingOrderID).ClearSourceWipBatchID().SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SetPaymentTermDays(30).SaveX(ctx)
	line := f.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(contract.ID)).OnlyX(ctx)
	f.client.OutsourcingOrderItem.UpdateOneID(line.ID).SetUnitPrice(decimal.NewFromInt(10)).SetAmount(decimal.NewFromInt(20)).SaveX(ctx)
	if err := syncOutsourcingHandoffs(ctx, f.client, contract.ID, f.actorID); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "outsourcing_return", contract.ID, "ready", biz.WarehouseRoleKey)
	finance := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	ordinary, err := finance.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: "BEFORE-STAGE-RETURN", OutsourcingOrderID: contract.ID, OutsourcingOrderItemID: line.ID, WarehouseID: warehouse.ID, NewLotNo: stringPtr("BEFORE-STAGE-LOT"), Quantity: batch.Quantity, IdempotencyKey: "before-stage-return"})
	if err != nil {
		t.Fatal(err)
	}
	assign := &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "test-sew-assign", ExecutionMode: biz.ProductionWIPExecutionOutsourced, OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: line.ID}}}
	if _, err := f.uc.AssignProductionWIPExecution(ctx, assign); !errors.Is(err, biz.ErrProductionWIPOutsourcingAllocationInvalid) {
		t.Fatalf("ordinary receipt must prevent a parallel WIP source: %v", err)
	}
	if _, err := finance.CancelPostedOutsourcingFact(ctx, operationalFactStatusMutation(ordinary.ID, ordinary.Version, f.actorID, "改按工序办理")); err != nil {
		t.Fatal(err)
	}
	flow, err = f.uc.AssignProductionWIPExecution(ctx, assign)
	if err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "outsourcing_return", contract.ID, "withdrawn", biz.WarehouseRoleKey)
	batch = productionWIPBatchByID(t, flow, batch.ID)
	flow, err = f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "test-sew-start"})
	if err != nil {
		t.Fatal(err)
	}
	batch = productionWIPBatchByID(t, flow, batch.ID)
	flow, err = f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "test-sew-return", Quantity: batch.Quantity})
	if err != nil {
		t.Fatal(err)
	}
	payableInput := &biz.FinanceFactFromOutsourcingOrderCreate{FactNo: "AP-STAGE", OutsourcingOrderID: contract.ID, IdempotencyKey: "ap-stage"}
	if _, err = finance.CreatePayableFromOutsourcingOrder(ctx, payableInput); !errors.Is(err, biz.ErrOutsourcingStageNotAccepted) {
		t.Fatalf("unaccepted payable: %v", err)
	}
	if _, err = finance.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: "WRONG-STAGE-RETURN", OutsourcingOrderID: contract.ID, OutsourcingOrderItemID: line.ID, WarehouseID: warehouse.ID, NewLotNo: stringPtr("STAGE-MUST-NOT-CREATE-LOT"), Quantity: batch.Quantity, IdempotencyKey: "wrong-stage-receipt"}); !errors.Is(err, biz.ErrOutsourcingStageReturnRequired) {
		t.Fatalf("parallel inventory return: %v", err)
	}
	qi := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).OnlyX(ctx)
	inv := biz.NewInventoryUsecase(NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)))
	if _, err = inv.SubmitQualityInspection(ctx, qi.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(qi.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatal(err)
	}
	if f.client.ProductionWIPBatch.GetX(ctx, batch.ID).Status != biz.ProductionWIPStatusAccepted {
		t.Fatal("route return not accepted")
	}
	if f.client.OutsourcingFact.Query().Where(outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceID(contract.ID), outsourcingfact.StatusNEQ(biz.OperationalFactStatusCancelled)).CountX(ctx) != 0 {
		t.Fatal("unexpected generic return fact")
	}
	uc := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(f.data, log.NewStdLogger(io.Discard)))
	_, err = uc.CloseOutsourcingOrderWithAction(ctx, &biz.SourceOrderLifecycleAction{ID: contract.ID, ExpectedVersion: contract.Version, ActorID: f.actorID, IdempotencyKey: "test-sew-close", CloseMode: biz.SourceOrderCloseModeNormal})
	if err != nil {
		t.Fatalf("normal closure: %v", err)
	}
	payable, err := finance.CreatePayableFromOutsourcingOrder(ctx, payableInput)
	if err != nil {
		t.Fatal(err)
	}
	if payable.SourceType == nil || *payable.SourceType != biz.OutsourcingOrderSourceType || payable.SourceID == nil || *payable.SourceID != contract.ID || !payable.Amount.Equal(decimal.NewFromInt(20)) || payable.Status != biz.OperationalFactStatusDraft || payable.PaymentTermDays == nil || *payable.PaymentTermDays != 30 {
		t.Fatalf("payable snapshot: %#v", payable)
	}
	replay, err := finance.CreatePayableFromOutsourcingOrder(ctx, payableInput)
	if err != nil || replay.ID != payable.ID {
		t.Fatalf("payable replay: %#v %v", replay, err)
	}
	duplicate := *payableInput
	duplicate.FactNo = "AP-STAGE-OTHER"
	duplicate.IdempotencyKey = "ap-stage-other"
	if _, err = finance.CreatePayableFromOutsourcingOrder(ctx, &duplicate); !errors.Is(err, biz.ErrFinanceFactSourceConflict) {
		t.Fatalf("duplicate billing: %v", err)
	}
	if _, err = finance.PostFinanceFact(ctx, operationalFactStatusMutation(payable.ID, payable.Version, f.actorID, "")); err != nil {
		t.Fatalf("confirm stage payable: %v", err)
	}
	if f.client.OutsourcingFact.Query().Where(outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceID(contract.ID), outsourcingfact.StatusNEQ(biz.OperationalFactStatusCancelled)).CountX(ctx) != 0 {
		t.Fatal("stage billing fabricated warehouse facts")
	}
	items, _, err := NewOutsourcingOrderRepo(f.data, log.NewStdLogger(io.Discard)).ListOutsourcingOrderItems(ctx, biz.OutsourcingOrderItemFilter{OutsourcingOrderID: contract.ID, Limit: 200})
	if err != nil || len(items) != 1 || items[0].ProductionWIPBatchID == nil || *items[0].ProductionWIPBatchID != batch.ID || items[0].ProductionOrderID == nil || *items[0].ProductionOrderID != flow.ProductionOrderID {
		t.Fatalf("stage entry projection: %#v %v", items, err)
	}
	if err := ensureProductionExceptionWIPNoActiveChild(ctx, f.client, batch.ID); !errors.Is(err, biz.ErrProductionExceptionWIPDependency) {
		t.Fatalf("payable must block concession reversal: %v", err)
	}
	posted := f.client.FinanceFact.GetX(ctx, payable.ID)
	if _, err = finance.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(payable.ID, posted.Version, f.actorID, "取消应付后恢复来源")); err != nil {
		t.Fatal(err)
	}
	if err := ensureProductionExceptionWIPNoActiveChild(ctx, f.client, batch.ID); err != nil {
		t.Fatalf("cancelled payable retains source dependency: %v", err)
	}

}
