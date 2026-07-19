package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestShipmentCancellationFinishedGoodsProcessStatusMatrix(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_cancellation_process_matrix")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	actor := client.AdminUser.Create().SetUsername("shipment-process-cancel-actor").SetPasswordHash("test-password-hash").SaveX(ctx)

	for index, tt := range []struct {
		status string
		want   error
	}{
		{status: biz.ProcessStatusActive, want: biz.ErrShipmentCancellationProcessActive},
		{status: biz.ProcessStatusBlocked},
		{status: biz.ProcessStatusCompleted},
	} {
		t.Run(tt.status, func(t *testing.T) {
			shipment := createShipmentCancellationDependencyDraft(t, ctx, uc, fixtures, fmt.Sprintf("PROCESS-%d", index), nil)
			createShipmentCancellationProcess(t, ctx, client, shipment.ID, tt.status, fmt.Sprintf("shipment-process-%d", index))
			_, err := uc.CancelShippedShipmentWithActor(ctx, shipment.ID, actor.ID)
			if !errors.Is(err, tt.want) {
				t.Fatalf("cancel with %s process error = %v, want %v", tt.status, err, tt.want)
			}
			current, getErr := uc.GetShipment(ctx, shipment.ID)
			if getErr != nil {
				t.Fatalf("get shipment after cancellation attempt: %v", getErr)
			}
			wantStatus := biz.ShipmentStatusCancelled
			if tt.want != nil {
				wantStatus = biz.ShipmentStatusDraft
			}
			if current.Status != wantStatus {
				t.Fatalf("shipment status = %s, want %s", current.Status, wantStatus)
			}
		})
	}
}

func TestShipmentCancellationFinishedGoodsQualityStatusMatrix(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_cancellation_quality_matrix")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	actor := client.AdminUser.Create().SetUsername("shipment-quality-cancel-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	lot := client.InventoryLot.Create().
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetLotNo("SHIP-CANCEL-QUALITY-LOT").
		SetStatus(biz.InventoryLotActive).
		SaveX(ctx)

	for index, tt := range []struct {
		status string
		result *string
		want   error
	}{
		{status: biz.QualityInspectionStatusDraft, want: biz.ErrShipmentQualityPending},
		{status: biz.QualityInspectionStatusSubmitted, want: biz.ErrShipmentQualityPending},
		{status: biz.QualityInspectionStatusPassed, result: qualityResultPtr(biz.QualityInspectionResultPass)},
		{status: biz.QualityInspectionStatusRejected, result: qualityResultPtr(biz.QualityInspectionResultReject)},
		{status: biz.QualityInspectionStatusCancelled},
	} {
		t.Run(tt.status, func(t *testing.T) {
			shipment := createShipmentCancellationDependencyDraft(t, ctx, uc, fixtures, fmt.Sprintf("QUALITY-%d", index), &lot.ID)
			builder := client.QualityInspection.Create().
				SetInspectionNo(fmt.Sprintf("SHIP-CANCEL-QI-%d", index)).
				SetInventoryLotID(lot.ID).
				SetWarehouseID(fixtures.warehouseID).
				SetSourceType(biz.QualityInspectionSourceShipment).
				SetSourceID(shipment.ID).
				SetInspectionType(biz.QualityInspectionTypeFinishedGoods).
				SetSubjectType(biz.QualityInspectionSubjectProduct).
				SetSubjectID(fixtures.productID).
				SetStatus(tt.status)
			if tt.result != nil {
				builder.SetResult(*tt.result).SetInspectedAt(time.Now().UTC())
			}
			builder.SaveX(ctx)

			_, err := uc.CancelShippedShipmentWithActor(ctx, shipment.ID, actor.ID)
			if !errors.Is(err, tt.want) {
				t.Fatalf("cancel with %s quality error = %v, want %v", tt.status, err, tt.want)
			}
			current, getErr := uc.GetShipment(ctx, shipment.ID)
			if getErr != nil {
				t.Fatalf("get shipment after cancellation attempt: %v", getErr)
			}
			wantStatus := biz.ShipmentStatusCancelled
			if tt.want != nil {
				wantStatus = biz.ShipmentStatusDraft
			}
			if current.Status != wantStatus {
				t.Fatalf("shipment status = %s, want %s", current.Status, wantStatus)
			}
		})
	}
}

func createShipmentCancellationDependencyDraft(
	t *testing.T,
	ctx context.Context,
	uc *biz.OperationalFactUsecase,
	fixtures inventoryTestFixtures,
	suffix string,
	lotID *int,
) *biz.Shipment {
	t.Helper()
	shipment, err := uc.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: "SHIP-CANCEL-" + suffix, IdempotencyKey: "ship-cancel/" + suffix},
		Items: []*biz.ShipmentItemCreate{{
			ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			LotID: lotID, Quantity: decimal.NewFromInt(1),
		}},
	})
	if err != nil {
		t.Fatalf("create shipment %s: %v", suffix, err)
	}
	return shipment
}

func createShipmentCancellationProcess(t *testing.T, ctx context.Context, client *ent.Client, shipmentID int, status, idempotencyKey string) {
	t.Helper()
	builder := client.ProcessInstance.Create().
		SetProcessKey(biz.ProcessKeyFinishedGoodsDelivery).
		SetProcessVersion("v1").
		SetConfigRevision("shipment-cancellation-test").
		SetDefinitionHash("sha256:shipment-cancellation-test").
		SetBusinessRefType("shipment").
		SetBusinessRefID(shipmentID).
		SetIdempotencyKey(idempotencyKey).
		SetStatus(status)
	if status == biz.ProcessStatusCompleted {
		builder.SetCompletedAt(time.Now().UTC())
	}
	builder.SaveX(ctx)
}

func qualityResultPtr(value string) *string {
	return &value
}
