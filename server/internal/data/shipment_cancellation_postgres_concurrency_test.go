package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactPostgresShipmentCancelVsFinishedGoodsProcessStartUsesOneSourceLock(t *testing.T) {
	ctx, cancelContext := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelContext()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	actor := client.AdminUser.Create().SetUsername("shipment-process-race-" + fixtures.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	processRepo := NewProcessRuntimeRepo(data, logger)

	for _, cancelFirst := range []bool{true, false} {
		name := "process_first"
		if cancelFirst {
			name = "cancel_first"
		}
		t.Run(name, func(t *testing.T) {
			created := createPostgresShipmentCancellationRaceDraft(t, ctx, factUC, fixtures, "PROCESS-"+name, nil)
			start := func() error {
				_, _, err := processRepo.CreateProcessInstanceFromSource(ctx, sourceBoundProcessCreate(
					biz.ProcessKeyFinishedGoodsDelivery,
					"shipment",
					created.ID,
					"shipment-process-race/"+name+"/"+fixtures.suffix,
				), actor.ID)
				return err
			}
			cancel := func() error {
				_, err := factUC.CancelShippedShipmentWithActor(ctx, created.ID, actor.ID)
				return err
			}
			first, second := start, cancel
			if cancelFirst {
				first, second = cancel, start
			}
			firstErr, secondErr := runPostgresSourceLockRace(t, ctx, data, "shipments", created.ID, first, second)
			current := client.Shipment.GetX(ctx, created.ID)
			processCount := client.ProcessInstance.Query().Where(
				processinstance.ProcessKey(biz.ProcessKeyFinishedGoodsDelivery),
				processinstance.BusinessRefType("shipment"),
				processinstance.BusinessRefID(created.ID),
			).CountX(ctx)
			if cancelFirst {
				if firstErr != nil || !errors.Is(secondErr, biz.ErrBadParam) || current.Status != biz.ShipmentStatusCancelled || processCount != 0 {
					t.Fatalf("cancel-first first=%v second=%v status=%s processes=%d", firstErr, secondErr, current.Status, processCount)
				}
				return
			}
			if firstErr != nil || !errors.Is(secondErr, biz.ErrShipmentCancellationProcessActive) || current.Status != biz.ShipmentStatusDraft || processCount != 1 {
				t.Fatalf("process-first first=%v second=%v status=%s processes=%d", firstErr, secondErr, current.Status, processCount)
			}
		})
	}
}

func TestOperationalFactPostgresShipmentCancelVsFinishedGoodsQualityCreateUsesOneSourceLock(t *testing.T) {
	ctx, cancelContext := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelContext()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	actor := client.AdminUser.Create().SetUsername("shipment-quality-race-" + fixtures.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	lot := client.InventoryLot.Create().
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixtures.productID).
		SetLotNo("SHIP-QUALITY-RACE-" + fixtures.suffix).
		SetStatus(biz.InventoryLotActive).
		SaveX(ctx)

	for _, cancelFirst := range []bool{true, false} {
		name := "quality_first"
		if cancelFirst {
			name = "cancel_first"
		}
		t.Run(name, func(t *testing.T) {
			created := createPostgresShipmentCancellationRaceDraft(t, ctx, factUC, fixtures, "QUALITY-"+name, &lot.ID)
			createQuality := func() error {
				_, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
					InspectionNo:   "SHIP-QUALITY-RACE-" + name + "-" + fixtures.suffix,
					SourceID:       created.ID,
					InventoryLotID: lot.ID,
					WarehouseID:    fixtures.warehouseID,
					SubjectID:      fixtures.productID,
				})
				return err
			}
			cancel := func() error {
				_, err := factUC.CancelShippedShipmentWithActor(ctx, created.ID, actor.ID)
				return err
			}
			first, second := createQuality, cancel
			if cancelFirst {
				first, second = cancel, createQuality
			}
			firstErr, secondErr := runPostgresSourceLockRace(t, ctx, data, "shipments", created.ID, first, second)
			current := client.Shipment.GetX(ctx, created.ID)
			qualityCount := client.QualityInspection.Query().Where(
				qualityinspection.SourceType(biz.QualityInspectionSourceShipment),
				qualityinspection.SourceID(created.ID),
				qualityinspection.InspectionType(biz.QualityInspectionTypeFinishedGoods),
			).CountX(ctx)
			if cancelFirst {
				if firstErr != nil || !errors.Is(secondErr, biz.ErrBadParam) || current.Status != biz.ShipmentStatusCancelled || qualityCount != 0 {
					t.Fatalf("cancel-first first=%v second=%v status=%s inspections=%d", firstErr, secondErr, current.Status, qualityCount)
				}
				return
			}
			if firstErr != nil || !errors.Is(secondErr, biz.ErrShipmentQualityPending) || current.Status != biz.ShipmentStatusDraft || qualityCount != 1 {
				t.Fatalf("quality-first first=%v second=%v status=%s inspections=%d", firstErr, secondErr, current.Status, qualityCount)
			}
		})
	}
}

func createPostgresShipmentCancellationRaceDraft(
	t *testing.T,
	ctx context.Context,
	uc *biz.OperationalFactUsecase,
	fixtures inventoryPostgresFixtures,
	label string,
	lotID *int,
) *biz.Shipment {
	t.Helper()
	created, err := uc.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     fmt.Sprintf("SHIP-CANCEL-RACE-%s-%s", label, fixtures.suffix),
			IdempotencyKey: fmt.Sprintf("shipment-cancel-race/%s/%s", label, fixtures.suffix),
		},
		Items: []*biz.ShipmentItemCreate{{
			ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			LotID: lotID, Quantity: decimal.NewFromInt(1),
		}},
	})
	if err != nil {
		t.Fatalf("create postgres shipment race fixture %s: %v", label, err)
	}
	return created
}
