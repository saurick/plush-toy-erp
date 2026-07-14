package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorylot"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSourceDrivenInboundFactsCreateAndReplayDerivedLots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "source_inbound_fact_lots")
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryTestFixtures(t, ctx, client)
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))

	actor := client.AdminUser.Create().
		SetUsername("source-inbound-lot-actor").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	orderUC := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger))
	created, err := orderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: biz.ProductionOrderDraft{
			OrderNo: "MO-SOURCE-LOT-001",
			Items: []biz.ProductionOrderDraftItem{{
				LineNo:          1,
				ProductID:       fixtures.productID,
				UnitID:          fixtures.unitID,
				PlannedQuantity: decimal.NewFromInt(3),
			}},
		},
		ActorID: actor.ID, IdempotencyKey: "mo-source-lot-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := orderUC.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: created.Order.Version,
		ActorID: actor.ID, IdempotencyKey: "mo-source-lot-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	productionLotNo := "PROD-SOURCE-LOT-001"
	completionIn := &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-SOURCE-LOT-001", ProductionOrderID: released.Order.ID,
		ProductionOrderItemID: released.Items[0].ID, WarehouseID: fixtures.warehouseID,
		NewLotNo: &productionLotNo, Quantity: decimal.NewFromInt(2),
		IdempotencyKey: "pf-source-lot-001",
	}
	completion, err := factUC.CreateProductionCompletionFromOrder(ctx, completionIn)
	if err != nil {
		t.Fatalf("create completion with new lot: %v", err)
	}
	if completion.LotID == nil {
		t.Fatal("completion must persist the atomically created lot")
	}
	productionLot := client.InventoryLot.GetX(ctx, *completion.LotID)
	if productionLot.SubjectType != biz.InventorySubjectProduct || productionLot.SubjectID != fixtures.productID || productionLot.LotNo != productionLotNo || productionLot.ProductionLotNo == nil || *productionLot.ProductionLotNo != productionLotNo {
		t.Fatalf("unexpected production lot %#v", productionLot)
	}
	replayedCompletion, err := factUC.CreateProductionCompletionFromOrder(ctx, completionIn)
	if err != nil || replayedCompletion.ID != completion.ID || replayedCompletion.LotID == nil || *replayedCompletion.LotID != *completion.LotID {
		t.Fatalf("completion lot replay = %#v, err=%v", replayedCompletion, err)
	}
	changedLot := *completionIn
	otherLotNo := "PROD-SOURCE-LOT-CHANGED"
	changedLot.NewLotNo = &otherLotNo
	if _, err := factUC.CreateProductionCompletionFromOrder(ctx, &changedLot); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed completion lot intent error = %v", err)
	}

	outsourcingSKU := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-SOURCE-LOT")
	outsourcingSource := createOutsourcingFactSourceFixtureWithSKU(t, ctx, client, fixtures, "SOURCE-LOT", decimal.NewFromInt(4), &outsourcingSKU.ID)
	outsourcingLotNo := "OUT-SOURCE-LOT-001"
	returnIn := &biz.OutsourcingFactFromOrderCreate{
		FactNo: "OUT-RETURN-SOURCE-LOT-001", OutsourcingOrderID: outsourcingSource.order.ID,
		OutsourcingOrderItemID: outsourcingSource.productLine.ID, WarehouseID: fixtures.warehouseID,
		NewLotNo: &outsourcingLotNo, Quantity: decimal.NewFromInt(2),
		IdempotencyKey: "out-return-source-lot-001",
	}
	returned, err := factUC.CreateOutsourcingReturnReceiptFromOrder(ctx, returnIn)
	if err != nil {
		t.Fatalf("create outsourcing return with new lot: %v", err)
	}
	if returned.LotID == nil {
		t.Fatal("outsourcing return must persist the atomically created lot")
	}
	outsourcingLot := client.InventoryLot.GetX(ctx, *returned.LotID)
	if returned.ProductSkuID == nil || *returned.ProductSkuID != outsourcingSKU.ID || outsourcingLot.ProductSkuID == nil || *outsourcingLot.ProductSkuID != outsourcingSKU.ID || outsourcingLot.SubjectType != biz.InventorySubjectProduct || outsourcingLot.SubjectID != fixtures.productID || outsourcingLot.LotNo != outsourcingLotNo || outsourcingLot.SupplierLotNo == nil || *outsourcingLot.SupplierLotNo != outsourcingLotNo {
		t.Fatalf("unexpected outsourcing lot %#v", outsourcingLot)
	}
	replayedReturn, err := factUC.CreateOutsourcingReturnReceiptFromOrder(ctx, returnIn)
	if err != nil || replayedReturn.ID != returned.ID {
		t.Fatalf("outsourcing lot replay = %#v, err=%v", replayedReturn, err)
	}
	if count := client.InventoryLot.Query().Where(inventorylot.LotNoIn(productionLotNo, outsourcingLotNo)).CountX(ctx); count != 2 {
		t.Fatalf("expected exactly two source-created lots, got %d", count)
	}
}
