package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestQualityInspectionFromOutsourcingReturnDerivesSourceAndGuardsCancellation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quality_outsourcing_return_source")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, operationalUC, fixtures, "SOURCE")

	in := &biz.QualityInspectionFromOutsourcingReturnCreate{
		InspectionNo:      "QI-OUT-RETURN-SOURCE",
		OutsourcingFactID: fact.ID,
		DecisionNote:      stringPtr("委外回货抽检"),
	}
	draft, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, in)
	if err != nil {
		t.Fatalf("create outsourcing return quality inspection: %v", err)
	}
	if draft.SourceType == nil || *draft.SourceType != biz.QualityInspectionSourceOutsourcingFact ||
		draft.SourceID == nil || *draft.SourceID != fact.ID ||
		draft.InspectionType == nil || *draft.InspectionType != biz.QualityInspectionTypeOutsourcingReturn ||
		draft.SubjectType == nil || *draft.SubjectType != biz.QualityInspectionSubjectProduct ||
		draft.SubjectID == nil || *draft.SubjectID != fixtures.productID ||
		draft.InventoryLotID != *fact.LotID || draft.WarehouseID != fixtures.warehouseID || draft.MaterialID != 0 ||
		draft.PurchaseReceiptID != 0 || draft.PurchaseReceiptItemID != nil {
		t.Fatalf("outsourcing return source fields were not derived: %#v", draft)
	}
	listed, total, err := inventoryUC.ListOutsourcingReturnQualityInspections(ctx, biz.QualityInspectionFilter{SourceID: fact.ID})
	if err != nil || total != 1 || len(listed) != 1 || listed[0].SourceNo == nil || *listed[0].SourceNo != fact.FactNo {
		t.Fatalf("listed outsourcing quality source number rows=%#v total=%d err=%v", listed, total, err)
	}
	replayed, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, in)
	if err != nil || replayed.ID != draft.ID {
		t.Fatalf("same-intent replay = %#v err=%v", replayed, err)
	}
	conflict := *in
	conflict.InspectionNo = "QI-OUT-RETURN-SOURCE-OTHER"
	if _, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &conflict); !errors.Is(err, biz.ErrQualityInspectionSourceConflict) {
		t.Fatalf("second active inspection error = %v, want source conflict", err)
	}
	if _, err := operationalUC.CancelPostedOutsourcingFact(ctx, fact.ID); !errors.Is(err, biz.ErrOutsourcingReturnQualityDependency) {
		t.Fatalf("cancel return with active quality error = %v, want dependency", err)
	}
	if _, err := inventoryUC.CancelQualityInspection(ctx, draft.ID, stringPtr("撤销抽检")); err != nil {
		t.Fatalf("cancel draft quality inspection: %v", err)
	}
	cancelled, err := operationalUC.CancelPostedOutsourcingFact(ctx, fact.ID)
	if err != nil || cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("cancel return after quality cancellation = %#v err=%v", cancelled, err)
	}
}

func TestQualityInspectionFromOutsourcingReturnReusesLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quality_outsourcing_return_lifecycle")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventoryUC, operationalUC, fixtures, "LIFECYCLE")

	draft, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{
		InspectionNo:      "QI-OUT-RETURN-LIFECYCLE",
		OutsourcingFactID: fact.ID,
	})
	if err != nil {
		t.Fatalf("create quality draft: %v", err)
	}
	submitted, err := inventoryUC.SubmitQualityInspection(ctx, draft.ID)
	if err != nil || submitted.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("submit outsourcing quality = %#v err=%v", submitted, err)
	}
	assertLotStatus(t, ctx, inventoryUC, *fact.LotID, biz.InventoryLotHold)
	decision := approximateQualityInspectionDecision(draft.ID, biz.QualityInspectionResultReject)
	decision.DecisionNote = stringPtr("尺寸超差")
	rejected, err := inventoryUC.RejectQualityInspection(ctx, decision)
	if err != nil || rejected.Status != biz.QualityInspectionStatusRejected || rejected.Result == nil || *rejected.Result != biz.QualityInspectionResultReject {
		t.Fatalf("reject outsourcing quality = %#v err=%v", rejected, err)
	}
	assertLotStatus(t, ctx, inventoryUC, *fact.LotID, biz.InventoryLotRejected)
	if got := client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact),
		qualityinspection.SourceID(fact.ID),
	).CountX(ctx); got != 1 {
		t.Fatalf("quality source row count = %d, want 1", got)
	}
}

func createPostedOutsourcingReturnForQuality(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	inventoryUC *biz.InventoryUsecase,
	operationalUC *biz.OperationalFactUsecase,
	fixtures inventoryTestFixtures,
	suffix string,
) *biz.OutsourcingFact {
	t.Helper()
	source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "QI-"+suffix, decimal.NewFromInt(5))
	lot, err := inventoryUC.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		LotNo:       "QI-OUT-LOT-" + suffix,
	})
	if err != nil {
		t.Fatalf("create outsourcing return lot: %v", err)
	}
	fact, err := operationalUC.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "QI-OUT-RETURN-" + suffix,
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID:            fixtures.warehouseID,
		LotID:                  &lot.ID,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "QI-OUT-RETURN-" + suffix,
	})
	if err != nil {
		t.Fatalf("create outsourcing return: %v", err)
	}
	posted, err := operationalUC.PostOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post outsourcing return: %v", err)
	}
	return posted
}
