package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

func TestOperationalFactRepo_ShipmentFinishedGoodsQualityGate(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finished_goods_quality_gate")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	type shipmentQualityCase struct {
		shipment   *biz.Shipment
		inspection *biz.QualityInspection
	}
	createCase := func(suffix string, createInspection bool) shipmentQualityCase {
		t.Helper()
		lot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectProduct, fixtures.productID, "QI-GATE-LOT-"+suffix)
		if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectProduct,
			SubjectID:      fixtures.productID,
			WarehouseID:    fixtures.warehouseID,
			LotID:          &lot.ID,
			TxnType:        biz.InventoryTxnIn,
			Direction:      1,
			Quantity:       mustDecimal(t, "1"),
			UnitID:         fixtures.unitID,
			SourceType:     "TEST_SHIPMENT_QUALITY_GATE",
			IdempotencyKey: "shipment-quality-gate-in/" + suffix,
		}); err != nil {
			t.Fatalf("seed inventory %s: %v", suffix, err)
		}
		shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{
				ShipmentNo:     "QI-GATE-SHIP-" + suffix,
				IdempotencyKey: "qi-gate-ship/" + suffix,
			},
			Items: []*biz.ShipmentItemCreate{{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				LotID:       &lot.ID,
				Quantity:    mustDecimal(t, "1"),
			}},
		})
		if err != nil {
			t.Fatalf("create shipment %s: %v", suffix, err)
		}
		result := shipmentQualityCase{shipment: shipment}
		if !createInspection {
			return result
		}
		inspection, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
			InspectionNo:   "QI-GATE-" + suffix,
			SourceID:       shipment.ID,
			InventoryLotID: lot.ID,
			WarehouseID:    fixtures.warehouseID,
			SubjectID:      fixtures.productID,
		})
		if err != nil {
			t.Fatalf("create inspection %s: %v", suffix, err)
		}
		result.inspection = inspection
		return result
	}

	withoutInspection := createCase("NONE", false)
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, withoutInspection.shipment.ID)
	if shipped, err := operationalUC.ShipShipment(ctx, withoutInspection.shipment.ID); err != nil || shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("optional inspection policy should allow shipment without inspection: shipment=%+v err=%v", shipped, err)
	}

	pending := createCase("PENDING", true)
	pendingActor := shipmentReleaseActorForTest(t, ctx, client, pending.shipment.ID)
	if _, _, err := operationalUC.SubmitShipmentRelease(ctx, pending.shipment.ID, pendingActor.ID); !errors.Is(err, biz.ErrShipmentQualityPending) {
		t.Fatalf("draft inspection release error=%v, want ErrShipmentQualityPending", err)
	}
	if _, err := inventoryUC.SubmitQualityInspection(ctx, pending.inspection.ID); err != nil {
		t.Fatalf("submit pending inspection: %v", err)
	}
	if _, _, err := operationalUC.SubmitShipmentRelease(ctx, pending.shipment.ID, pendingActor.ID); !errors.Is(err, biz.ErrShipmentQualityPending) {
		t.Fatalf("submitted inspection release error=%v, want ErrShipmentQualityPending", err)
	}
	if _, err := inventoryUC.PassQualityInspection(ctx, approximateQualityInspectionDecision(pending.inspection.ID, biz.QualityInspectionResultConcession)); err != nil {
		t.Fatalf("pass pending inspection: %v", err)
	}
	if _, _, err := operationalUC.SubmitShipmentRelease(ctx, pending.shipment.ID, pendingActor.ID); err != nil {
		t.Fatalf("submit release after passed inspection: %v", err)
	}
	completeShipmentReleaseTaskForTest(t, ctx, data, client, pending.shipment.ID, pendingActor.ID)
	if shipped, err := operationalUC.ShipShipment(ctx, pending.shipment.ID); err != nil || shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("passed inspection should allow shipment: shipment=%+v err=%v", shipped, err)
	}

	rejected := createCase("REJECTED", true)
	if _, err := inventoryUC.SubmitQualityInspection(ctx, rejected.inspection.ID); err != nil {
		t.Fatalf("submit rejected inspection: %v", err)
	}
	if _, err := inventoryUC.RejectQualityInspection(ctx, approximateQualityInspectionDecision(rejected.inspection.ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatalf("reject inspection: %v", err)
	}
	rejectedActor := shipmentReleaseActorForTest(t, ctx, client, rejected.shipment.ID)
	if _, _, err := operationalUC.SubmitShipmentRelease(ctx, rejected.shipment.ID, rejectedActor.ID); !errors.Is(err, biz.ErrShipmentQualityRejected) {
		t.Fatalf("rejected inspection release error=%v, want ErrShipmentQualityRejected", err)
	}

	cancelled := createCase("CANCELLED", true)
	if _, err := inventoryUC.CancelQualityInspection(ctx, cancelled.inspection.ID, nil); err != nil {
		t.Fatalf("cancel inspection: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, cancelled.shipment.ID)
	if shipped, err := operationalUC.ShipShipment(ctx, cancelled.shipment.ID); err != nil || shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("cancelled inspection should not block shipment: shipment=%+v err=%v", shipped, err)
	}
}
