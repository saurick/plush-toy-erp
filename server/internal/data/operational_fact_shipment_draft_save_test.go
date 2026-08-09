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
	"server/internal/data/model/ent/shipmentitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type editableShipmentSourceFixture struct {
	customerID       int
	salesOrderID     int
	salesOrderItemID int
	productID        int
	warehouseID      int
	unitID           int
}

func createEditableShipmentSourceFixture(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	fixtures inventoryTestFixtures,
) editableShipmentSourceFixture {
	t.Helper()
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SHIP-EDIT", true)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:          "SO-SHIP-EDIT",
		CustomerID:       customer.ID,
		CustomerSnapshot: map[string]any{"code": "C-SHIP-EDIT", "name": "出货编辑测试客户"},
		OrderDate:        time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create source sales order: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          1,
		ProductID:       fixtures.productID,
		UnitID:          fixtures.unitID,
		OrderedQuantity: decimal.NewFromInt(50),
	})
	if err != nil {
		t.Fatalf("create source sales order item: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit source sales order: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate source sales order: %v", err)
	}
	return editableShipmentSourceFixture{
		customerID:       customer.ID,
		salesOrderID:     order.ID,
		salesOrderItemID: item.ID,
		productID:        fixtures.productID,
		warehouseID:      fixtures.warehouseID,
		unitID:           fixtures.unitID,
	}
}

func createEditableShipmentDraft(
	t *testing.T,
	ctx context.Context,
	uc *biz.OperationalFactUsecase,
	source editableShipmentSourceFixture,
	suffix string,
	lotID *int,
) *biz.Shipment {
	t.Helper()
	created, err := uc.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHIP-EDIT-" + suffix,
			SalesOrderID:   &source.salesOrderID,
			CustomerID:     &source.customerID,
			IdempotencyKey: "shipment-edit/" + suffix,
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &source.salesOrderItemID,
			ProductID:        source.productID,
			WarehouseID:      source.warehouseID,
			UnitID:           source.unitID,
			LotID:            lotID,
			Quantity:         decimal.NewFromInt(1),
		}},
	})
	if err != nil {
		t.Fatalf("create editable shipment %s: %v", suffix, err)
	}
	return created
}

func shipmentDraftSaveInput(
	shipment *biz.Shipment,
	source editableShipmentSourceFixture,
	warehouseID int,
) *biz.ShipmentDraftSave {
	forgedSnapshot := "不能写入的前端客户旧值"
	note := "修改后的出货备注"
	itemNote := "修改后的行备注"
	plannedAt := time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)
	weight := decimal.RequireFromString("9.500000")
	return &biz.ShipmentDraftSave{
		ID:               shipment.ID,
		ExpectedVersion:  shipment.Version,
		ShipmentNo:       shipment.ShipmentNo + "-UPDATED",
		SalesOrderID:     &source.salesOrderID,
		CustomerID:       &source.customerID,
		CustomerSnapshot: &forgedSnapshot,
		PlannedShipAt:    &plannedAt,
		TotalNetWeightG:  &weight,
		Note:             &note,
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &source.salesOrderItemID,
			ProductID:        source.productID,
			WarehouseID:      warehouseID,
			UnitID:           source.unitID,
			Quantity:         decimal.RequireFromString("2.500000"),
			Note:             &itemNote,
		}},
	}
}

func TestOperationalFactRepoSaveShipmentDraftReplacesAggregateWithCASAndServerSnapshots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_draft_save_replace")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	repo := NewOperationalFactRepo(data, logger)
	uc := biz.NewOperationalFactUsecase(repo)
	source := createEditableShipmentSourceFixture(t, ctx, data, client, fixtures)
	created := createEditableShipmentDraft(t, ctx, uc, source, "REPLACE", nil)
	if created.Version != 1 || created.CustomerSnapshot == nil {
		t.Fatalf("new shipment content version/snapshot = %#v", created)
	}

	otherWarehouse := createTestWarehouse(t, ctx, client, "WH-SHIP-EDIT-NEW")
	in := shipmentDraftSaveInput(created, source, otherWarehouse.ID)
	updated, err := uc.SaveShipmentDraftWithItems(ctx, in)
	if err != nil {
		t.Fatalf("save shipment draft: %v", err)
	}
	if updated.Version != created.Version+1 || updated.ShipmentNo != in.ShipmentNo || updated.IdempotencyKey != created.IdempotencyKey {
		t.Fatalf("updated shipment = %#v", updated)
	}
	if updated.CustomerSnapshot == nil || *updated.CustomerSnapshot != *created.CustomerSnapshot || *updated.CustomerSnapshot == *in.CustomerSnapshot {
		t.Fatalf("customer snapshot was not resolved from sales order: created=%#v input=%#v updated=%#v", created.CustomerSnapshot, in.CustomerSnapshot, updated.CustomerSnapshot)
	}
	if len(updated.Items) != 1 || updated.Items[0].WarehouseID != otherWarehouse.ID || !updated.Items[0].Quantity.Equal(decimal.RequireFromString("2.5")) {
		t.Fatalf("replacement lines = %#v", updated.Items)
	}
	if count := client.ShipmentItem.Query().Where(shipmentitem.ShipmentID(created.ID)).CountX(ctx); count != 1 {
		t.Fatalf("replacement left %d shipment items, want 1", count)
	}
	persisted := client.Shipment.GetX(ctx, created.ID)
	if persisted.Version != updated.Version || persisted.RequestedTotalNetWeightG == nil || !persisted.RequestedTotalNetWeightG.Equal(decimal.RequireFromString("9.5")) {
		t.Fatalf("persisted header = %#v", persisted)
	}

	stale := *in
	stale.ShipmentNo = "SHIP-STALE-MUST-NOT-WRITE"
	if _, err := uc.SaveShipmentDraftWithItems(ctx, &stale); !errors.Is(err, biz.ErrOperationalFactVersionConflict) {
		t.Fatalf("stale save error=%v, want version conflict", err)
	}
	current, err := uc.GetShipment(ctx, created.ID)
	if err != nil || current.ShipmentNo != updated.ShipmentNo || current.Version != updated.Version {
		t.Fatalf("stale save changed aggregate: %#v err=%v", current, err)
	}

	if _, err := repo.CancelShippedShipment(ctx, created.ID); err != nil {
		t.Fatalf("cancel editable draft: %v", err)
	}
	cancelled, err := uc.GetShipment(ctx, created.ID)
	if err != nil {
		t.Fatalf("reload cancelled draft: %v", err)
	}
	nonDraft := shipmentDraftSaveInput(cancelled, source, otherWarehouse.ID)
	if _, err := uc.SaveShipmentDraftWithItems(ctx, nonDraft); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("non-draft save error=%v, want ErrBadParam", err)
	}
}

func TestOperationalFactRepoSaveShipmentDraftFreezesAfterDownstreamDependency(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_draft_save_dependencies")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	repo := NewOperationalFactRepo(data, logger)
	uc := biz.NewOperationalFactUsecase(repo)
	source := createEditableShipmentSourceFixture(t, ctx, data, client, fixtures)

	tests := []struct {
		name string
		seed func(*biz.Shipment)
	}{
		{
			name: "process runtime",
			seed: func(shipment *biz.Shipment) {
				client.ProcessInstance.Create().
					SetProcessKey(biz.ProcessKeyFinishedGoodsDelivery).
					SetProcessVersion("v1").
					SetConfigRevision("shipment-edit-test").
					SetDefinitionHash("shipment-edit-test").
					SetBusinessRefType("shipment").
					SetBusinessRefID(shipment.ID).
					SetIdempotencyKey(fmt.Sprintf("shipment-edit-process/%d", shipment.ID)).
					SaveX(ctx)
			},
		},
		{
			name: "quality inspection",
			seed: func(shipment *biz.Shipment) {
				lot := client.InventoryLot.Create().
					SetSubjectType(biz.InventorySubjectProduct).
					SetSubjectID(source.productID).
					SetLotNo(fmt.Sprintf("SHIP-EDIT-QI-%d", shipment.ID)).
					SetStatus(biz.InventoryLotActive).
					SaveX(ctx)
				client.QualityInspection.Create().
					SetInspectionNo(fmt.Sprintf("QI-SHIP-EDIT-%d", shipment.ID)).
					SetInventoryLotID(lot.ID).
					SetWarehouseID(source.warehouseID).
					SetSourceType(biz.QualityInspectionSourceShipment).
					SetSourceID(shipment.ID).
					SetInspectionType(biz.QualityInspectionTypeFinishedGoods).
					SetSubjectType(biz.QualityInspectionSubjectProduct).
					SetSubjectID(source.productID).
					SetStatus(biz.QualityInspectionStatusDraft).
					SaveX(ctx)
			},
		},
		{
			name: "release workflow task",
			seed: func(shipment *biz.Shipment) {
				actor := shipmentReleaseActorForTest(t, ctx, client, shipment.ID)
				if _, _, err := uc.SubmitShipmentRelease(ctx, shipment.ID, actor.ID); err != nil {
					t.Fatalf("submit shipment release: %v", err)
				}
			},
		},
	}

	for index, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shipment := createEditableShipmentDraft(t, ctx, uc, source, fmt.Sprintf("DEPENDENCY-%d", index), nil)
			tt.seed(shipment)
			in := shipmentDraftSaveInput(shipment, source, source.warehouseID)
			if _, err := uc.SaveShipmentDraftWithItems(ctx, in); !errors.Is(err, biz.ErrShipmentDraftDependency) {
				t.Fatalf("save with %s error=%v, want dependency freeze", tt.name, err)
			}
			current, err := uc.GetShipment(ctx, shipment.ID)
			if err != nil || current.ShipmentNo != shipment.ShipmentNo || current.Version != shipment.Version || len(current.Items) != len(shipment.Items) {
				t.Fatalf("dependency save changed aggregate: %#v err=%v", current, err)
			}
		})
	}
}
