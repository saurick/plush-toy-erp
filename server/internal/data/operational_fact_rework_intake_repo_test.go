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

func TestReworkIntakeProductionAndReshipmentClosedLoop(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "rework_intake_closed_loop")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	logger := log.NewStdLogger(io.Discard)
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
	warehouse := createTestWarehouse(t, ctx, f.client, "REWORK-CLOSED-WH")
	quantity := decimal.NewFromInt(3)

	flow := releaseProductionWIPRoute(t, ctx, f, "MO-REWORK-INTAKE", 3, false)
	flow, originalPackaging := acceptProductionPackagingBatchForReworkTest(
		t, ctx, f.client, f.uc, f.actorID, flow, "rework-intake-original",
	)
	originalLotNo := "REWORK-INTAKE-ORIGINAL"
	originalCompletion, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-REWORK-INTAKE-ORIGINAL", ProductionOrderID: flow.ProductionOrderID,
		ProductionOrderItemID: flow.ProductionOrderItems[0].ID, ProductionWIPBatchID: originalPackaging.ID,
		WarehouseID: warehouse.ID, NewLotNo: &originalLotNo, Quantity: quantity,
		IdempotencyKey: "pf-rework-intake-original",
	})
	if err != nil {
		t.Fatalf("create original completion: %v", err)
	}
	originalCompletion, err = factUC.PostProductionFact(ctx, operationalFactStatusMutation(
		originalCompletion.ID, originalCompletion.Version, f.actorID, "",
	))
	if err != nil || originalCompletion.Status != biz.OperationalFactStatusPosted || originalCompletion.LotID == nil {
		t.Fatalf("post original completion=%#v err=%v", originalCompletion, err)
	}

	salesItem := f.client.SalesOrderItem.GetX(ctx, f.salesItemID)
	salesOrder := f.client.SalesOrder.GetX(ctx, salesItem.SalesOrderID)
	customer := f.client.Customer.GetX(ctx, salesOrder.CustomerID)
	salesOrder = f.client.SalesOrder.UpdateOne(salesOrder).
		SetCustomerSnapshot(map[string]any{"name": customer.Name}).
		SaveX(ctx)
	sourceShipment, err := factUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo: "SHIP-REWORK-INTAKE-SOURCE", SalesOrderID: &salesOrder.ID,
			CustomerID: &salesOrder.CustomerID, IdempotencyKey: "ship-rework-intake-source",
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &salesItem.ID, ProductID: f.productID, ProductSkuID: &f.skuID,
			WarehouseID: warehouse.ID, UnitID: f.unitID, LotID: originalCompletion.LotID, Quantity: quantity,
		}},
	})
	if err != nil {
		t.Fatalf("create source shipment: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, f.data, f.client, sourceShipment.ID)
	if err := factUC.ValidateShipmentReleaseForShipping(ctx, sourceShipment.ID); err != nil {
		t.Fatalf("validate source shipment release: %v", err)
	}
	sourceShipment, err = factUC.ShipShipmentWithActor(ctx, sourceShipment.ID, f.actorID)
	if err != nil || sourceShipment.Status != biz.ShipmentStatusShipped || len(sourceShipment.Items) != 1 {
		t.Fatalf("ship original sales delivery=%#v err=%v", sourceShipment, err)
	}

	candidates, total, err := factUC.ListReworkIntakeSourceCandidates(ctx, biz.ReworkIntakeSourceCandidateFilter{
		SourceShipmentID: sourceShipment.ID, Limit: 50,
	})
	if err != nil || total != 1 || len(candidates) != 1 || !candidates[0].Selectable ||
		candidates[0].TargetProductionOrderItemID != flow.ProductionOrderItems[0].ID {
		t.Fatalf("rework intake candidates=%#v total=%d err=%v", candidates, total, err)
	}
	intakeInput := &biz.ReworkIntakeCreate{
		IntakeNo: "HCF-CLOSED-001", SourceShipmentID: sourceShipment.ID,
		Reason: "客户产品回厂返工", IdempotencyKey: "rework-intake-closed-001",
		Items: []biz.ReworkIntakeItemCreate{{
			SourceShipmentItemID:        sourceShipment.Items[0].ID,
			TargetProductionOrderItemID: flow.ProductionOrderItems[0].ID,
			Quantity:                    quantity,
		}},
	}
	intake, err := factUC.CreateReworkIntake(ctx, intakeInput, f.actorID)
	if err != nil || intake.Status != biz.ReworkIntakeStatusDraft || intake.ProgressStage != biz.ReworkIntakeStageWaitingReceive {
		t.Fatalf("create rework intake=%#v err=%v", intake, err)
	}
	replayed, err := factUC.CreateReworkIntake(ctx, intakeInput, f.actorID)
	if err != nil || replayed.ID != intake.ID {
		t.Fatalf("rework intake replay=%#v err=%v", replayed, err)
	}
	editCandidates, editTotal, err := factUC.ListReworkIntakeSourceCandidates(ctx, biz.ReworkIntakeSourceCandidateFilter{
		SourceShipmentID:           sourceShipment.ID,
		EditingReworkIntakeDraftID: intake.ID,
		Limit:                      50,
	})
	if err != nil || editTotal != 1 || len(editCandidates) != 1 || !editCandidates[0].Selectable ||
		!editCandidates[0].ActiveIntakeQuantity.IsZero() || !editCandidates[0].RemainingIntakeQuantity.Equal(quantity) {
		t.Fatalf("editable rework intake candidates=%#v total=%d err=%v", editCandidates, editTotal, err)
	}
	originalVersion := intake.Version
	originalItemID := intake.Items[0].ID
	originalIdempotencyKey := intake.IdempotencyKey
	itemNote := "更新后的返工明细"
	intake, err = factUC.SaveReworkIntakeDraft(ctx, &biz.ReworkIntakeDraftSave{
		ID:               intake.ID,
		ExpectedVersion:  intake.Version,
		IntakeNo:         "HCF-CLOSED-001-EDITED",
		SourceShipmentID: sourceShipment.ID,
		Reason:           "客户确认更新返工说明",
		Items: []biz.ReworkIntakeItemCreate{{
			SourceShipmentItemID:        sourceShipment.Items[0].ID,
			TargetProductionOrderItemID: flow.ProductionOrderItems[0].ID,
			Quantity:                    quantity,
			Note:                        &itemNote,
		}},
	}, f.actorID)
	if err != nil || intake.Version != originalVersion+1 || intake.IntakeNo != "HCF-CLOSED-001-EDITED" ||
		intake.Reason != "客户确认更新返工说明" || intake.IdempotencyKey != originalIdempotencyKey || len(intake.Items) != 1 ||
		intake.Items[0].ID == originalItemID || intake.Items[0].Note == nil || *intake.Items[0].Note != itemNote {
		t.Fatalf("save rework intake draft=%#v err=%v", intake, err)
	}
	if _, err := factUC.SaveReworkIntakeDraft(ctx, &biz.ReworkIntakeDraftSave{
		ID:               intake.ID,
		ExpectedVersion:  originalVersion,
		IntakeNo:         "HCF-CLOSED-STALE",
		SourceShipmentID: sourceShipment.ID,
		Reason:           "过期版本不得覆盖",
		Items:            intakeInput.Items,
	}, f.actorID); !errors.Is(err, biz.ErrOperationalFactVersionConflict) {
		t.Fatalf("stale rework intake save error=%v, want version conflict", err)
	}

	intake, err = factUC.ReceiveReworkIntake(ctx, &biz.ReworkIntakeTransition{
		ID: intake.ID, ExpectedVersion: intake.Version,
	}, f.actorID)
	if err != nil || intake.Status != biz.ReworkIntakeStatusReceived || intake.ProgressStage != biz.ReworkIntakeStageWaitingRework ||
		len(intake.Items) != 1 || intake.Items[0].ReceivedLotID == nil {
		t.Fatalf("receive rework intake=%#v err=%v", intake, err)
	}
	if _, err := factUC.SaveReworkIntakeDraft(ctx, &biz.ReworkIntakeDraftSave{
		ID:               intake.ID,
		ExpectedVersion:  intake.Version,
		IntakeNo:         intake.IntakeNo,
		SourceShipmentID: intake.SourceShipmentID,
		Reason:           intake.Reason,
		Items:            intakeInput.Items,
	}, f.actorID); !errors.Is(err, biz.ErrReworkIntakeSourceState) {
		t.Fatalf("received intake draft save error=%v, want source state", err)
	}
	receivedLotID := *intake.Items[0].ReceivedLotID
	if lot := f.client.InventoryLot.GetX(ctx, receivedLotID); lot.Status != biz.InventoryLotHold {
		t.Fatalf("received rework lot status=%s, want HOLD", lot.Status)
	}
	if got := lotBalanceQuantity(t, ctx, f.client, f.productID, f.skuID, warehouse.ID, f.unitID, receivedLotID); !got.Equal(quantity) {
		t.Fatalf("received rework balance=%s, want %s", got, quantity)
	}
	bindingTx, err := NewInventoryRepo(f.data, logger).beginInventoryDBTx(ctx)
	if err != nil {
		t.Fatalf("begin received lot rebinding check: %v", err)
	}
	if err := bindReworkIntakeReceivedLot(ctx, bindingTx, intake.Items[0].ID, *originalCompletion.LotID); !errors.Is(err, biz.ErrReworkIntakeSourceInvalid) {
		rollbackInventoryDBTx(ctx, bindingTx, nil)
		t.Fatalf("rebind received lot error=%v, want ErrReworkIntakeSourceInvalid", err)
	}
	rollbackInventoryDBTx(ctx, bindingTx, nil)
	if _, err := f.client.ReworkIntakeItem.UpdateOneID(intake.Items[0].ID).
		SetReceivedLotID(*originalCompletion.LotID).
		Save(ctx); err == nil {
		t.Fatal("rework intake received lot must not be rebound")
	}
	if _, err := f.client.ReworkIntakeItem.UpdateOneID(intake.Items[0].ID).
		ClearReceivedLotID().
		Save(ctx); err == nil {
		t.Fatal("rework intake received lot must not be cleared")
	}

	rework, err := factUC.CreateProductionReworkFromIntake(ctx, &biz.ProductionReworkFromIntakeCreate{
		FactNo: "PF-REWORK-INTAKE-001", ReworkIntakeItemID: intake.Items[0].ID,
		Quantity: quantity, IdempotencyKey: "pf-rework-intake-001", Reason: "按原工序拆线返工",
	})
	if err != nil || rework.Status != biz.OperationalFactStatusDraft || rework.SourceType == nil || *rework.SourceType != biz.ReworkIntakeSourceType {
		t.Fatalf("create production rework=%#v err=%v", rework, err)
	}
	postedRework, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(rework.ID, rework.Version, f.actorID, ""))
	if err != nil || postedRework.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("post production rework=%#v err=%v", postedRework, err)
	}
	if got := lotBalanceQuantity(t, ctx, f.client, f.productID, f.skuID, warehouse.ID, f.unitID, receivedLotID); !got.IsZero() {
		t.Fatalf("rework posting must consume received HOLD stock, balance=%s", got)
	}
	if _, err := factUC.ReverseReworkIntake(ctx, &biz.ReworkIntakeTransition{
		ID: intake.ID, ExpectedVersion: intake.Version, Reason: "已有生产返工，不得冲正",
	}, f.actorID); !errors.Is(err, biz.ErrReworkIntakeProductionDependency) {
		t.Fatalf("reverse after production error=%v, want ErrReworkIntakeProductionDependency", err)
	}

	rootRow := f.client.ProductionWIPBatch.Query().Where(
		productionwipbatch.OriginReworkFactID(postedRework.ID),
		productionwipbatch.SourceBatchIDIsNil(),
	).OnlyX(ctx)
	aggregate, err := f.uc.GetProductionWIP(ctx, flow.ProductionOrderID)
	if err != nil {
		t.Fatalf("read rework WIP: %v", err)
	}
	root := productionWIPBatchByID(t, aggregate, rootRow.ID)
	aggregate, replacementPackaging := acceptProductionReworkReplacementPackagingForTest(
		t, ctx, f.data, f.client, f.uc, f.actorID, aggregate, root, "rework-intake-replacement",
	)
	replacementLotNo := "REWORK-INTAKE-REPLACEMENT"
	replacement, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PF-REWORK-INTAKE-REPLACEMENT", ProductionOrderID: aggregate.ProductionOrderID,
		ProductionOrderItemID: aggregate.ProductionOrderItems[0].ID, ProductionWIPBatchID: replacementPackaging.ID,
		WarehouseID: warehouse.ID, NewLotNo: &replacementLotNo, Quantity: quantity,
		IdempotencyKey: "pf-rework-intake-replacement",
	})
	if err != nil {
		t.Fatalf("create replacement completion: %v", err)
	}
	replacement, err = factUC.PostProductionFact(ctx, operationalFactStatusMutation(replacement.ID, replacement.Version, f.actorID, ""))
	if err != nil || replacement.Status != biz.OperationalFactStatusPosted || replacement.LotID == nil {
		t.Fatalf("post replacement completion=%#v err=%v", replacement, err)
	}

	reshipment, err := factUC.CreateReworkReshipment(ctx, &biz.ReworkReshipmentCreate{
		ShipmentNo: "BF-REWORK-INTAKE-001", ReworkIntakeID: intake.ID,
		IdempotencyKey: "bf-rework-intake-001",
		Items:          []biz.ReworkReshipmentItemCreate{{ReworkCompletionFactID: replacement.ID, Quantity: quantity}},
	})
	if err != nil || reshipment.Purpose != biz.ShipmentPurposeReworkReshipment ||
		reshipment.FinanceReleaseStatus != biz.ShipmentFinanceReleaseStatusNotRequired {
		t.Fatalf("create rework reshipment=%#v err=%v", reshipment, err)
	}
	intake, err = factUC.GetReworkIntake(ctx, intake.ID)
	if err != nil || intake.ProgressStage != biz.ReworkIntakeStageReshipped ||
		!intake.Items[0].ActiveReshipmentQuantity.Equal(quantity) || !intake.Items[0].ReshippedQuantity.IsZero() {
		t.Fatalf("draft reshipment intake projection=%#v err=%v", intake, err)
	}

	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, f.data, f.client, reshipment.ID)
	if got := f.client.Shipment.GetX(ctx, reshipment.ID).FinanceReleaseStatus; got != biz.ShipmentFinanceReleaseStatusNotRequired {
		t.Fatalf("rework reshipment finance status=%s, want NOT_REQUIRED", got)
	}
	if err := factUC.ValidateShipmentReleaseForShipping(ctx, reshipment.ID); err != nil {
		t.Fatalf("validate rework reshipment release: %v", err)
	}
	reshipment, err = factUC.ShipShipmentWithActor(ctx, reshipment.ID, f.actorID)
	if err != nil || reshipment.Status != biz.ShipmentStatusShipped {
		t.Fatalf("ship rework reshipment=%#v err=%v", reshipment, err)
	}
	intake, err = factUC.GetReworkIntake(ctx, intake.ID)
	if err != nil || intake.ProgressStage != biz.ReworkIntakeStageClosed ||
		!intake.Items[0].ReshippedQuantity.Equal(quantity) {
		t.Fatalf("closed-loop intake projection=%#v err=%v", intake, err)
	}
	if got := lotBalanceQuantity(t, ctx, f.client, f.productID, f.skuID, warehouse.ID, f.unitID, *replacement.LotID); !got.IsZero() {
		t.Fatalf("replacement lot balance after reship=%s, want 0", got)
	}
	if _, err := factUC.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-REWORK-INTAKE-FORBIDDEN", ShipmentID: reshipment.ID, IdempotencyKey: "ar-rework-intake-forbidden",
	}); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("rework reshipment receivable error=%v, want ErrFinanceFactSourceInvalid", err)
	}
}
