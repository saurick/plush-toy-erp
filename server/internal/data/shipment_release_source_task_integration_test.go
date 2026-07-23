package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
)

// This integration starts from the shipment domain entry and verifies the
// resulting Workflow projection without making Workflow post a domain fact.
func TestShipmentReleaseSourceTaskOwnsReleaseGate(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_release_source_task")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	actor := client.AdminUser.Create().SetUsername("shipment-release-actor").SetPasswordHash("test-password-hash").SaveX(ctx)

	lot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectProduct, fixtures.productID, "SHIP-RELEASE-LOT")
	if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
		WarehouseID: fixtures.warehouseID, LotID: &lot.ID, UnitID: fixtures.unitID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: mustDecimal(t, "2"),
		SourceType: "TEST_SHIPMENT_RELEASE", IdempotencyKey: "shipment-release-source-stock",
	}); err != nil {
		t.Fatalf("seed shipment stock: %v", err)
	}
	shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: "SHIP-RELEASE-001", IdempotencyKey: "shipment-release-source"},
		Items: []*biz.ShipmentItemCreate{{
			ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, LotID: &lot.ID,
			UnitID: fixtures.unitID, Quantity: mustDecimal(t, "1"),
		}},
	})
	if err != nil {
		t.Fatalf("create shipment: %v", err)
	}
	if err := operationalUC.ValidateShipmentReleaseForShipping(ctx, shipment.ID); !errors.Is(err, biz.ErrShipmentReleaseRequired) {
		t.Fatalf("validate before submit error = %v, want ErrShipmentReleaseRequired", err)
	}

	task, created, err := operationalUC.SubmitShipmentRelease(ctx, shipment.ID, actor.ID)
	if err != nil || !created {
		t.Fatalf("submit shipment release task=%#v created=%v err=%v", task, created, err)
	}
	if !biz.IsTrustedShipmentReleaseSourceTask(task) || task.OwnerRoleKey != biz.WarehouseRoleKey {
		t.Fatalf("unexpected shipment release source task %#v", task)
	}
	if count := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("created")).CountX(ctx); count != 1 {
		t.Fatalf("shipment release must atomically create one event, count=%d", count)
	}
	state := client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskShipmentSourceType),
		workflowbusinessstate.SourceID(shipment.ID),
	).OnlyX(ctx)
	if state.BusinessStatusKey != "shipment_pending" {
		t.Fatalf("shipment release state = %#v", state)
	}
	replayed, replayCreated, err := operationalUC.SubmitShipmentRelease(ctx, shipment.ID, actor.ID)
	if err != nil || replayCreated || replayed.ID != task.ID {
		t.Fatalf("shipment release replay task=%#v created=%v err=%v", replayed, replayCreated, err)
	}
	if err := operationalUC.ValidateShipmentReleaseForShipping(ctx, shipment.ID); !errors.Is(err, biz.ErrShipmentReleasePending) {
		t.Fatalf("validate pending release error = %v", err)
	}
	if _, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo: "QI-AFTER-RELEASE", SourceID: shipment.ID, InventoryLotID: lot.ID,
		WarehouseID: fixtures.warehouseID, SubjectID: fixtures.productID,
	}); !errors.Is(err, biz.ErrShipmentReleaseAlreadySubmitted) {
		t.Fatalf("quality inspection after release submit error = %v", err)
	}

	completeShipmentReleaseTaskForTest(t, ctx, data, client, shipment.ID, actor.ID)
	if err := operationalUC.ValidateShipmentReleaseForShipping(ctx, shipment.ID); err != nil {
		t.Fatalf("validate completed release: %v", err)
	}
	state = client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskShipmentSourceType),
		workflowbusinessstate.SourceID(shipment.ID),
	).OnlyX(ctx)
	if state.BusinessStatusKey != "shipping_released" {
		t.Fatalf("completed release state = %#v", state)
	}
	client.Shipment.UpdateOneID(shipment.ID).
		SetFinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusApproved).
		SetFinanceReleaseVersion(2).
		SaveX(ctx)
	shipped, err := operationalUC.ShipShipment(ctx, shipment.ID)
	if err != nil || shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("ship after completed release shipment=%#v err=%v", shipped, err)
	}
	shipmentTask := client.WorkflowTask.GetX(ctx, task.ID)
	if shipmentTask.BusinessStatusKey == nil || *shipmentTask.BusinessStatusKey != "shipping_released" {
		t.Fatalf("legacy release projection must remain historical after shipment: %#v", shipmentTask)
	}
	state = client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskShipmentSourceType),
		workflowbusinessstate.SourceID(shipment.ID),
	).OnlyX(ctx)
	if state.BusinessStatusKey != "shipping_released" {
		t.Fatalf("legacy release state must not replace the shipment finance gate: %#v", state)
	}
	if err := operationalUC.ValidateShipmentReleaseForShipping(ctx, shipment.ID); err != nil {
		t.Fatalf("shipping replay must preserve completed release: %v", err)
	}
}
