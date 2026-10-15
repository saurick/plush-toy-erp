package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOutsourcingReturnToVendorPostsOutAndCancelsWithReversal(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "outsourcing_return_disposition")
	testOutsourcingReturnToVendorPostsOutAndCancelsWithReversal(t, data, client)
}

func TestQualityInspectionFromOutsourcingReturnPostgresDispositionClosure(t *testing.T) {
	data, client := openPurchaseOperationalPostgresTestData(t)
	testOutsourcingReturnToVendorPostsOutAndCancelsWithReversal(t, data, client)
}

func testOutsourcingReturnToVendorPostsOutAndCancelsWithReversal(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	pgFixtures := createInventoryPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{unitID: pgFixtures.unitID, materialID: pgFixtures.materialID, productID: pgFixtures.productID, warehouseID: pgFixtures.warehouseID, productWarehouseID: pgFixtures.productWarehouseID}
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	creator := client.AdminUser.Create().SetUsername("outsourcing-disposition-creator").SetPasswordHash("test-password-hash").SaveX(ctx)
	poster := client.AdminUser.Create().SetUsername("outsourcing-disposition-poster").SetPasswordHash("test-password-hash").SaveX(ctx)
	canceller := client.AdminUser.Create().SetUsername("outsourcing-disposition-canceller").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, factUC, fixtures, poster.ID, "DISPOSITION")
	batchID := linkRejectedOutsourcingReturnBatchForDisposition(t, ctx, data, client, fact, "OUT-RETURN")
	inspection, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "QI-OUT-DISPOSITION", OutsourcingFactID: fact.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inventoryUC.SubmitQualityInspection(ctx, inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := inventoryUC.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	iqcTask := assertFulfillmentTask(t, ctx, client, "outsourcing_quality", rejected.ID, "done", biz.QualityRoleKey)
	workflow := NewWorkflowRepo(data, logger)
	assertState := func(state string) {
		t.Helper()
		board, err := workflow.ListWorkflowExceptions(ctx, biz.WorkflowExceptionQuery{Limit: 10, TrackingRef: &biz.WorkflowTrackingRef{Kind: "task", ID: iqcTask.ID}, Visibility: &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}})
		if err != nil || board.Total != 1 || len(board.Items) != 1 || board.Items[0].State != state {
			t.Fatalf("outsourcing exception expected %s: %+v %v", state, board, err)
		}
	}
	created, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-RETURN-1", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "退回加工商", IdempotencyKey: "od-return-1", CreatedBy: creator.ID})
	if err != nil {
		t.Fatal(err)
	}
	posted, err := factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: poster.ID})
	if err != nil || posted.Status != biz.OutsourcingDispositionPosted {
		t.Fatalf("posted=%#v err=%v", posted, err)
	}
	assertOutsourcingDispositionBalance(t, ctx, inventoryUC, fact, decimal.NewFromInt(1))
	assertState("open")
	if _, err := factUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: posted.Version + 1, ActorID: canceller.ID, Reason: "过期页面撤销"}); !errors.Is(err, biz.ErrOutsourcingDispositionConflict) {
		t.Fatalf("stale cancel err=%v", err)
	}
	cancelled, err := factUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: posted.Version, ActorID: canceller.ID, Reason: "撤销退回"})
	if err != nil || cancelled.Status != biz.OutsourcingDispositionCancelled {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	assertOutsourcingDispositionBalance(t, ctx, inventoryUC, fact, decimal.NewFromInt(2))
	assertState("open")
	full, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-RETURN-ALL", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: fact.Quantity, Reason: "全部退回", IdempotencyKey: "od-return-all", CreatedBy: creator.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-RETURN-OVER", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "不得重复分配", IdempotencyKey: "od-return-over", CreatedBy: creator.ID}); !errors.Is(err, biz.ErrOutsourcingDispositionSourceInvalid) {
		t.Fatalf("over-allocated outsourcing return accepted: %v", err)
	}
	assertState("open")
	full, err = factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: full.ID, ExpectedVersion: full.Version, ActorID: poster.ID})
	if err != nil {
		t.Fatal(err)
	}
	assertState("closed")
	batch := client.ProductionWIPBatch.GetX(ctx, batchID)
	client.ProductionOrder.UpdateOneID(batch.ProductionOrderID).SetStatus(biz.ProductionOrderStatusClosed).SetClosedAt(time.Now()).SetClosedBy(canceller.ID).SetCloseReason("模拟结案后冲正").SaveX(ctx)
	if _, err := factUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: full.ID, ExpectedVersion: full.Version, ActorID: canceller.ID, Reason: "撤销全部退回"}); err != nil {
		t.Fatal(err)
	}
	assertState("open")
}

func TestOutsourcingReturnToVendorBlockedByActivePayable(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_return_disposition_payable")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	actor := client.AdminUser.Create().SetUsername("outsourcing-disposition-payable-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, factUC, fixtures, actor.ID, "DISPOSITION-AP")
	linkRejectedOutsourcingReturnBatchForDisposition(t, ctx, data, client, fact, "OUT-RETURN-AP")
	inspection, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "QI-OUT-DISPOSITION-AP", OutsourcingFactID: fact.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inventoryUC.SubmitQualityInspection(ctx, inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := inventoryUC.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	created, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-RETURN-AP", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "退回加工商", IdempotencyKey: "od-return-ap", CreatedBy: actor.ID})
	if err != nil {
		t.Fatal(err)
	}
	if fact.SupplierID == nil {
		t.Fatal("posted outsourcing return must retain its supplier")
	}
	client.FinanceFact.Create().
		SetFactNo("AP-OUT-DISPOSITION-BLOCK").
		SetFactType(biz.FinanceFactPayable).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(biz.FinanceCounterpartySupplier).
		SetCounterpartyID(*fact.SupplierID).
		SetAmount(decimal.NewFromInt(1)).
		SetCurrency(biz.FinanceCurrencyCNY).
		SetPaymentTerm(biz.FinancePaymentTermDueOnOccurrence).
		SetPaymentTermDays(0).
		SetDueAt(fact.OccurredAt).
		SetSourceType(biz.OutsourcingFactSourceType).
		SetSourceID(fact.ID).
		SetIdempotencyKey("ap-out-disposition-block").
		SetOccurredAt(fact.OccurredAt).
		SetOccurredAtSpecified(true).
		SaveX(ctx)
	if _, err := factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: actor.ID}); !errors.Is(err, biz.ErrOutsourcingReturnFinanceDependency) {
		t.Fatalf("active payable err=%v", err)
	}
}

func TestOutsourcingRejectedReturnReworkRequiresApproval(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "outsourcing_return_rework_disposition")
	testOutsourcingRejectedReturnReworkRequiresApproval(t, data, client)
}

func TestQualityInspectionFromOutsourcingReturnPostgresReworkApprovalBoundary(t *testing.T) {
	data, client := openPurchaseOperationalPostgresTestData(t)
	testOutsourcingRejectedReturnReworkRequiresApproval(t, data, client)
}

func testOutsourcingRejectedReturnReworkRequiresApproval(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	pgFixtures := createInventoryPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{unitID: pgFixtures.unitID, materialID: pgFixtures.materialID, productID: pgFixtures.productID, warehouseID: pgFixtures.warehouseID, productWarehouseID: pgFixtures.productWarehouseID}
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	actor := client.AdminUser.Create().SetUsername("outsourcing-rework-disposition-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, factUC, fixtures, actor.ID, "REWORK-DISPOSITION")
	inspection, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "QI-OUT-REWORK-DISPOSITION", OutsourcingFactID: fact.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inventoryUC.SubmitQualityInspection(ctx, inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := inventoryUC.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	wip := newProductionWIPQualityTestFixture(t, ctx, data, client, "OUT-REWORK")
	wipSource := wip.createWaitingBatch(t, "OUT-REWORK", []string{biz.ProductionWIPQualityGateFinishedGoods})
	client.ProductionWIPBatch.UpdateOneID(wipSource.batch.ID).SetStatus(biz.ProductionWIPStatusRejected).SaveX(ctx)
	client.ProductionWIPOutsourcingAllocation.Create().SetProductionWipBatchID(wipSource.batch.ID).SetOutsourcingOrderItemID(*fact.SourceLineID).SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetAllocatedQuantity(wipSource.batch.Quantity).SetUnitID(wip.unitID).SetCreatedBy(wip.actorID).SaveX(ctx)
	batchID := wipSource.batch.ID
	input := &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-REWORK-1", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionRework, Quantity: decimal.NewFromInt(1), ProductionWIPBatchID: &batchID, Reason: "返工处理", IdempotencyKey: "od-rework-1", CreatedBy: wip.actorID}
	if _, err := factUC.CreateOutsourcingReturnDisposition(ctx, input); !errors.Is(err, biz.ErrProcessRuntimeRequired) {
		t.Fatalf("direct rework creation bypassed approval: %v", err)
	}
	repo := NewOperationalFactRepo(data, logger)
	if _, err := repo.CreateOutsourcingReturnDisposition(ctx, input, "rework-intent"); !errors.Is(err, biz.ErrProcessRuntimeRequired) {
		t.Fatalf("repository accepted unapproved rework: %v", err)
	}
	// A persisted unposted request must not retain the removed execution path.
	draft := client.OutsourcingReturnDisposition.Create().SetDispositionNo(input.DispositionNo).SetQualityInspectionID(rejected.ID).
		SetOutsourcingReturnFactID(fact.ID).SetDispositionType(biz.OutsourcingDispositionRework).SetStatus(biz.OutsourcingDispositionDraft).
		SetQuantity(input.Quantity).SetProductionWipBatchID(batchID).SetReason(input.Reason).SetIdempotencyKey(input.IdempotencyKey).
		SetIdempotencyPayloadHash("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").SetCreatedBy(wip.actorID).SaveX(ctx)
	before := client.InventoryTxn.Query().CountX(ctx)
	if _, err := factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: draft.ID, ExpectedVersion: draft.Version, ActorID: wip.actorID}); !errors.Is(err, biz.ErrProcessRuntimeRequired) {
		t.Fatalf("persisted draft bypassed approval: %v", err)
	}
	if client.ProductionWIPBatch.Query().Where(productionwipbatch.SourceBatchID(batchID)).CountX(ctx) != 0 || client.InventoryTxn.Query().CountX(ctx) != before {
		t.Fatal("rejected rework created WIP or inventory effects")
	}
	if _, err := factUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: draft.ID, ExpectedVersion: draft.Version, ActorID: wip.actorID, Reason: "改走正式异常方案"}); err != nil {
		t.Fatal(err)
	}
}

func linkRejectedOutsourcingReturnBatchForDisposition(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	fact *biz.OutsourcingFact,
	suffix string,
) int {
	t.Helper()
	if fact == nil || fact.SourceLineID == nil {
		t.Fatal("outsourcing return disposition fixture requires an exact source line")
	}
	wip := newProductionWIPQualityTestFixture(t, ctx, data, client, suffix)
	source := wip.createWaitingBatch(t, suffix, []string{biz.ProductionWIPQualityGateFinishedGoods})
	client.ProductionWIPBatch.UpdateOneID(source.batch.ID).SetStatus(biz.ProductionWIPStatusRejected).SaveX(ctx)
	client.ProductionWIPOutsourcingAllocation.Create().
		SetProductionWipBatchID(source.batch.ID).
		SetOutsourcingOrderItemID(*fact.SourceLineID).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetAllocatedQuantity(source.batch.Quantity).
		SetUnitID(wip.unitID).
		SetCreatedBy(wip.actorID).
		SaveX(ctx)
	return source.batch.ID
}

func assertOutsourcingDispositionBalance(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, fact *biz.OutsourcingFact, want decimal.Decimal) {
	t.Helper()
	got, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: fact.SubjectType, SubjectID: fact.SubjectID, ProductSkuID: fact.ProductSkuID, WarehouseID: fact.WarehouseID, LotID: fact.LotID, UnitID: fact.UnitID})
	if err != nil || !got.Quantity.Equal(want) {
		t.Fatalf("balance=%#v err=%v want=%s", got, err, want)
	}
}
