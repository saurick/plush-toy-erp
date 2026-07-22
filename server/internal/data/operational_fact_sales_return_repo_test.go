package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSalesReturnLifecyclePostsAndReversesInventory(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "sales_return_lifecycle")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	customer := client.Customer.Create().SetCode("C-RMA-1").SetName("退货客户").SetIsActive(true).SaveX(ctx)
	shipment := client.Shipment.Create().SetShipmentNo("SHP-RMA-1").SetCustomerID(customer.ID).SetCustomerSnapshot(customer.Name).SetStatus(biz.ShipmentStatusShipped).SetIdempotencyKey("shipment-rma-1").SaveX(ctx)
	shipmentItem := client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetProductID(fixtures.productID).SetWarehouseID(fixtures.warehouseID).SetUnitID(fixtures.unitID).SetQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	input := &biz.SalesReturnCreate{ReturnNo: "RMA-1", ShipmentID: shipment.ID, Reason: "客户退回", IdempotencyKey: "rma-create-1", Items: []biz.SalesReturnItemCreate{{ShipmentItemID: shipmentItem.ID, Quantity: decimal.NewFromInt(2)}}}
	created, err := uc.CreateSalesReturn(ctx, input, 7)
	if err != nil || created.Status != biz.SalesReturnStatusDraft {
		t.Fatalf("create sales return = %#v, err=%v", created, err)
	}
	if len(created.Items) != 1 || created.Items[0].LotID == nil || created.Items[0].QualityInspectionID <= 0 {
		t.Fatalf("return quarantine anchors=%#v", created.Items)
	}
	if lot := client.InventoryLot.GetX(ctx, *created.Items[0].LotID); lot.Status != biz.InventoryLotHold {
		t.Fatalf("draft return lot status=%s", lot.Status)
	}
	if inspection := client.QualityInspection.GetX(ctx, created.Items[0].QualityInspectionID); inspection.Status != biz.QualityInspectionStatusDraft || inspection.SourceType == nil || *inspection.SourceType != biz.QualityInspectionSourceSalesReturn {
		t.Fatalf("draft return inspection=%#v", inspection)
	}
	replayed, err := uc.CreateSalesReturn(ctx, input, 7)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("exact replay = %#v, err=%v", replayed, err)
	}
	changed := *input
	changed.Items = []biz.SalesReturnItemCreate{{ShipmentItemID: shipmentItem.ID, Quantity: decimal.NewFromInt(3)}}
	if _, err := uc.CreateSalesReturn(ctx, &changed, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed replay error=%v", err)
	}

	approved, err := uc.ApproveSalesReturn(ctx, &biz.SalesReturnTransition{ID: created.ID, ExpectedVersion: created.Version}, 8)
	if err != nil || approved.Status != biz.SalesReturnStatusApproved {
		t.Fatalf("approve = %#v, err=%v", approved, err)
	}
	received, err := uc.ReceiveSalesReturn(ctx, &biz.SalesReturnTransition{ID: approved.ID, ExpectedVersion: approved.Version}, 9)
	if err != nil || received.Status != biz.SalesReturnStatusReceived {
		t.Fatalf("receive = %#v, err=%v", received, err)
	}
	if got := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.SalesReturnSourceType), inventorytxn.SourceID(received.ID)).CountX(ctx); got != 1 {
		t.Fatalf("received inventory txns=%d, want 1", got)
	}
	if inspection := client.QualityInspection.GetX(ctx, received.Items[0].QualityInspectionID); inspection.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("received return inspection status=%s", inspection.Status)
	}
	cancelled, err := uc.CancelSalesReturn(ctx, &biz.SalesReturnTransition{ID: received.ID, ExpectedVersion: received.Version, Reason: "客户撤销退货"}, 10)
	if err != nil || cancelled.Status != biz.SalesReturnStatusCancelled {
		t.Fatalf("cancel = %#v, err=%v", cancelled, err)
	}
	if got := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.SalesReturnSourceType), inventorytxn.SourceID(received.ID)).CountX(ctx); got != 2 {
		t.Fatalf("cancel inventory txns=%d, want in+reversal", got)
	}
	if inspection := client.QualityInspection.GetX(ctx, cancelled.Items[0].QualityInspectionID); inspection.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("cancelled return inspection status=%s", inspection.Status)
	}
	if lot := client.InventoryLot.GetX(ctx, *cancelled.Items[0].LotID); lot.Status != biz.InventoryLotDisabled {
		t.Fatalf("cancelled return lot status=%s", lot.Status)
	}
}

func TestSalesReturnCumulativeQuantityCannotExceedShipment(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "sales_return_quantity")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	customer := client.Customer.Create().SetCode("C-RMA-2").SetName("累计退货客户").SetIsActive(true).SaveX(ctx)
	shipment := client.Shipment.Create().SetShipmentNo("SHP-RMA-2").SetCustomerID(customer.ID).SetCustomerSnapshot(customer.Name).SetStatus(biz.ShipmentStatusShipped).SetIdempotencyKey("shipment-rma-2").SaveX(ctx)
	item := client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetProductID(fixtures.productID).SetWarehouseID(fixtures.warehouseID).SetUnitID(fixtures.unitID).SetQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	create := func(no string, qty int64) error {
		_, err := uc.CreateSalesReturn(ctx, &biz.SalesReturnCreate{ReturnNo: no, ShipmentID: shipment.ID, Reason: "退货", IdempotencyKey: no, Items: []biz.SalesReturnItemCreate{{ShipmentItemID: item.ID, Quantity: decimal.NewFromInt(qty)}}}, 7)
		return err
	}
	if err := create("RMA-Q-1", 4); err != nil {
		t.Fatal(err)
	}
	if err := create("RMA-Q-2", 2); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("over-return error=%v", err)
	}
}

func TestSalesReturnCannotCancelAfterQualityDisposition(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "sales_return_quality_disposition")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	customer := client.Customer.Create().SetCode("C-RMA-3").SetName("退货质检客户").SetIsActive(true).SaveX(ctx)
	shipment := client.Shipment.Create().SetShipmentNo("SHP-RMA-3").SetCustomerID(customer.ID).SetCustomerSnapshot(customer.Name).SetStatus(biz.ShipmentStatusShipped).SetIdempotencyKey("shipment-rma-3").SaveX(ctx)
	item := client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetProductID(fixtures.productID).SetWarehouseID(fixtures.warehouseID).SetUnitID(fixtures.unitID).SetQuantity(decimal.NewFromInt(2)).SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	operationalUC := biz.NewOperationalFactUsecase(repo)
	created, err := operationalUC.CreateSalesReturn(ctx, &biz.SalesReturnCreate{ReturnNo: "RMA-3", ShipmentID: shipment.ID, Reason: "客户退回", IdempotencyKey: "rma-create-3", Items: []biz.SalesReturnItemCreate{{ShipmentItemID: item.ID, Quantity: decimal.NewFromInt(1)}}}, 7)
	if err != nil {
		t.Fatal(err)
	}
	approved, err := operationalUC.ApproveSalesReturn(ctx, &biz.SalesReturnTransition{ID: created.ID, ExpectedVersion: created.Version}, 8)
	if err != nil {
		t.Fatal(err)
	}
	received, err := operationalUC.ReceiveSalesReturn(ctx, &biz.SalesReturnTransition{ID: approved.ID, ExpectedVersion: approved.Version}, 9)
	if err != nil {
		t.Fatal(err)
	}
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := inventoryUC.PassQualityInspection(ctx, approximateQualityInspectionDecision(received.Items[0].QualityInspectionID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatalf("pass return inspection: %v", err)
	}
	if lot := client.InventoryLot.GetX(ctx, *received.Items[0].LotID); lot.Status != biz.InventoryLotActive {
		t.Fatalf("passed return lot status=%s", lot.Status)
	}
	if _, err := operationalUC.CancelSalesReturn(ctx, &biz.SalesReturnTransition{ID: received.ID, ExpectedVersion: received.Version, Reason: "不应越过已完成质检"}, 10); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancel after quality disposition error=%v", err)
	}
}
