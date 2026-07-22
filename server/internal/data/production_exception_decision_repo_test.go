package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionOverIssueApprovalExtendsAndCapsMaterialIssue(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_over_issue")
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-OVER-ISSUE", "over-issue")
	requirement := released.MaterialRequirements[0]
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-OVER-1", DecisionType: biz.ProductionExceptionOverIssue, ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID, ProductionMaterialRequirementID: &requirement.ID, RequestedQuantity: decimal.NewFromInt(5), Reason: "损耗超领", IdempotencyKey: "ex-over-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approved := decimal.NewFromInt(3)
	decision, err = factUC.ApproveProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: f.actorID, ApprovedQuantity: &approved, Reason: "批准三件"})
	if err != nil || decision.Status != biz.ProductionExceptionApproved || decision.ApprovedQuantity == nil || !decision.ApprovedQuantity.Equal(approved) {
		t.Fatalf("decision=%#v err=%v", decision, err)
	}
	fact, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-1", "pf-over-1", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(25)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.PostProductionFact(ctx, fact.ID); err != nil {
		t.Fatalf("approved issue post err=%v", err)
	}
	excess, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-2", "pf-over-2", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(1)))
	if err == nil {
		_, err = factUC.PostProductionFact(ctx, excess.ID)
	}
	if !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
		t.Fatalf("allowance overspend err=%v", err)
	}
}

func TestProductionOverIssueApprovalCannotBeSpentTwiceConcurrently(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_over_issue_concurrent")
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-OVER-CONCURRENT", "over-concurrent")
	requirement := released.MaterialRequirements[0]
	base, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-BASE", "pf-over-base", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, requirement.PlannedQuantity))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.PostProductionFact(ctx, base.ID); err != nil {
		t.Fatal(err)
	}
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-OVER-CONCURRENT", DecisionType: biz.ProductionExceptionOverIssue, ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID, ProductionMaterialRequirementID: &requirement.ID, RequestedQuantity: decimal.NewFromInt(1), Reason: "只批准一件", IdempotencyKey: "ex-over-concurrent", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.ApproveProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: f.actorID, Reason: "批准"}); err != nil {
		t.Fatal(err)
	}
	ids := make([]int, 2)
	for index := range ids {
		fact, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-RACE-"+string(rune('A'+index)), "pf-over-race-"+string(rune('a'+index)), released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(1)))
		if err != nil {
			t.Fatal(err)
		}
		ids[index] = fact.ID
	}
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, id := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := factUC.PostProductionFact(ctx, id)
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	success, exceeded := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			success++
		case errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded):
			exceeded++
		default:
			t.Fatalf("unexpected error=%v", err)
		}
	}
	if success != 1 || exceeded != 1 {
		t.Fatalf("success=%d exceeded=%d", success, exceeded)
	}
}

func TestProductionWIPConcessionKeepsRejectedInspectionAndAcceptsBatch(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_concession_decision")
	fixture := f.createWaitingBatch(t, "CONCESSION-DECISION", []string{biz.ProductionWIPQualityGateFinishedGoods})
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	batchID, inspectionID := fixture.batch.ID, rejected.ID
	decision, err := factUC.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-CONCESSION-1", DecisionType: biz.ProductionExceptionWIPConcession, ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID, ProductionWIPBatchID: &batchID, QualityInspectionID: &inspectionID, RequestedQuantity: fixture.batch.Quantity, Reason: "客户让步接收", IdempotencyKey: "ex-concession-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approved, err := factUC.ApproveProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: f.actorID, Reason: "批准让步"})
	if err != nil || approved.Status != biz.ProductionExceptionApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID)
	inspection := f.client.QualityInspection.GetX(f.ctx, inspectionID)
	if batch.Status != biz.ProductionWIPStatusAccepted || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
		t.Fatalf("batch=%#v inspection=%#v", batch, inspection)
	}
}

func TestProductionWIPScrapIsNonInventoryAndCancelsWholeBatch(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_scrap_decision")
	fixture := f.createWaitingBatch(t, "SCRAP-DECISION", []string{biz.ProductionWIPQualityGateFinishedGoods})
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	batchID := fixture.batch.ID
	before := f.client.InventoryTxn.Query().CountX(f.ctx)
	decision, err := factUC.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-SCRAP-WIP-1", DecisionType: biz.ProductionExceptionScrap, ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID, ProductionWIPBatchID: &batchID, RequestedQuantity: fixture.batch.Quantity, Reason: "在制整批报废", IdempotencyKey: "ex-scrap-wip-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.ApproveProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: f.actorID, Reason: "批准报废"}); err != nil {
		t.Fatal(err)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID)
	after := f.client.InventoryTxn.Query().CountX(f.ctx)
	if batch.Status != biz.ProductionWIPStatusCancelled || after != before {
		t.Fatalf("batch=%#v inventory before=%d after=%d", batch, before, after)
	}
}

func TestProductionStockedScrapPostsOutAndCancelReverses(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_stocked_scrap_decision")
	fixture := f.createWaitingBatch(t, "STOCKED-SCRAP", []string{biz.ProductionWIPQualityGateFinishedGoods})
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(f.data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
	warehouse := createTestWarehouse(t, f.ctx, f.client, "SCRAP-FG-WH")
	lot := createTestInventoryLot(t, f.ctx, inventoryUC, biz.InventorySubjectProduct, f.productID, "SCRAP-FG-LOT")
	if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(f.ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectProduct, SubjectID: f.productID, WarehouseID: warehouse.ID, LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(2), SourceType: "TEST_STOCKED_SCRAP", IdempotencyKey: "test-stocked-scrap"}); err != nil {
		t.Fatal(err)
	}
	sourceType, orderID, itemID := biz.ProductionOrderSourceType, fixture.order.ID, fixture.item.ID
	f.client.ProductionFact.Create().SetFactNo("PF-STOCKED-SCRAP-SOURCE").SetFactType(biz.ProductionFactFinishedGoodsReceipt).SetStatus(biz.OperationalFactStatusPosted).SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetLotID(lot.ID).SetQuantity(decimal.NewFromInt(2)).SetSourceType(sourceType).SetSourceID(orderID).SetSourceLineID(itemID).SetIdempotencyKey("pf-stocked-scrap-source").SetPostedAt(time.Now()).SaveX(f.ctx)
	f.client.InventoryLot.UpdateOneID(lot.ID).SetStatus(biz.InventoryLotRejected).SaveX(f.ctx)
	result := biz.QualityInspectionResultReject
	inspection := f.client.QualityInspection.Create().SetInspectionNo("QI-STOCKED-SCRAP").SetInventoryLotID(lot.ID).SetWarehouseID(warehouse.ID).SetSourceType(biz.QualityInspectionSourceShipment).SetSourceID(999).SetInspectionType(biz.QualityInspectionTypeFinishedGoods).SetSubjectType(biz.QualityInspectionSubjectProduct).SetSubjectID(f.productID).SetStatus(biz.QualityInspectionStatusRejected).SetResult(result).SaveX(f.ctx)
	inspectionID := inspection.ID
	decision, err := factUC.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-SCRAP-FG-1", DecisionType: biz.ProductionExceptionScrap, ProductionOrderID: orderID, ProductionOrderItemID: itemID, QualityInspectionID: &inspectionID, RequestedQuantity: decimal.NewFromInt(1), Reason: "成品报废", IdempotencyKey: "ex-scrap-fg-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approved, err := factUC.ApproveProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: f.actorID, Reason: "批准成品报废"})
	if err != nil {
		t.Fatal(err)
	}
	assertProductionStockedScrapBalance(t, f.ctx, inventoryUC, f.productID, warehouse.ID, lot.ID, f.unitID, decimal.NewFromInt(1))
	if _, err := factUC.CancelProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "撤销误报废"}); err != nil {
		t.Fatal(err)
	}
	assertProductionStockedScrapBalance(t, f.ctx, inventoryUC, f.productID, warehouse.ID, lot.ID, f.unitID, decimal.NewFromInt(2))
}

func assertProductionStockedScrapBalance(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, productID, warehouseID, lotID, unitID int, want decimal.Decimal) {
	t.Helper()
	got, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectProduct, SubjectID: productID, WarehouseID: warehouseID, LotID: &lotID, UnitID: unitID})
	if err != nil || !got.Quantity.Equal(want) {
		t.Fatalf("balance=%#v err=%v want=%s", got, err, want)
	}
}
