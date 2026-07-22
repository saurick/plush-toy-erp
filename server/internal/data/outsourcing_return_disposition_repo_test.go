package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOutsourcingReturnToVendorPostsOutAndCancelsWithReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_return_disposition")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, factUC, fixtures, "DISPOSITION")
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
	created, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-RETURN-1", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "退回加工商", IdempotencyKey: "od-return-1", CreatedBy: 1})
	if err != nil {
		t.Fatal(err)
	}
	posted, err := factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || posted.Status != biz.OutsourcingDispositionPosted {
		t.Fatalf("posted=%#v err=%v", posted, err)
	}
	assertOutsourcingDispositionBalance(t, ctx, inventoryUC, fact, decimal.NewFromInt(1))
	if _, err := factUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: posted.Version + 1, ActorID: 3, Reason: "过期页面撤销"}); !errors.Is(err, biz.ErrOutsourcingDispositionConflict) {
		t.Fatalf("stale cancel err=%v", err)
	}
	cancelled, err := factUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: posted.Version, ActorID: 3, Reason: "撤销退回"})
	if err != nil || cancelled.Status != biz.OutsourcingDispositionCancelled {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	assertOutsourcingDispositionBalance(t, ctx, inventoryUC, fact, decimal.NewFromInt(2))
}

func TestOutsourcingReturnToVendorBlockedByActivePayable(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_return_disposition_payable")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, factUC, fixtures, "DISPOSITION-AP")
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
	created, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-RETURN-AP", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "退回加工商", IdempotencyKey: "od-return-ap", CreatedBy: 1})
	if err != nil {
		t.Fatal(err)
	}
	client.FinanceFact.Create().SetFactNo("AP-OUT-DISPOSITION-BLOCK").SetFactType(biz.FinanceFactPayable).SetStatus(biz.OperationalFactStatusDraft).SetCounterpartyType(biz.FinanceCounterpartyOther).SetAmount(decimal.NewFromInt(1)).SetSourceType(biz.OutsourcingFactSourceType).SetSourceID(fact.ID).SetIdempotencyKey("ap-out-disposition-block").SaveX(ctx)
	if _, err := factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2}); !errors.Is(err, biz.ErrOutsourcingReturnFinanceDependency) {
		t.Fatalf("active payable err=%v", err)
	}
}

func TestOutsourcingRejectedReturnReworkCreatesExplicitWIPChild(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_return_rework_disposition")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, factUC, fixtures, "REWORK-DISPOSITION")
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
	created, err := factUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-REWORK-1", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionRework, Quantity: decimal.NewFromInt(1), ProductionWIPBatchID: &batchID, Reason: "返工处理", IdempotencyKey: "od-rework-1", CreatedBy: wip.actorID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: wip.actorID}); err != nil {
		t.Fatal(err)
	}
	children := client.ProductionWIPBatch.Query().Where(productionwipbatch.SourceBatchID(batchID), productionwipbatch.FlowType(biz.ProductionWIPFlowRework), productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled)).AllX(ctx)
	if len(children) != 1 || !children[0].Quantity.Equal(decimal.NewFromInt(1)) {
		t.Fatalf("children=%#v", children)
	}
}

func assertOutsourcingDispositionBalance(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, fact *biz.OutsourcingFact, want decimal.Decimal) {
	t.Helper()
	got, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: fact.SubjectType, SubjectID: fact.SubjectID, ProductSkuID: fact.ProductSkuID, WarehouseID: fact.WarehouseID, LotID: fact.LotID, UnitID: fact.UnitID})
	if err != nil || !got.Quantity.Equal(want) {
		t.Fatalf("balance=%#v err=%v want=%s", got, err, want)
	}
}
