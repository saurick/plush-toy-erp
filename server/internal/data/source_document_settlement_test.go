package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func TestSalesOrderCancellationRejectsLiveDownstreamAndAllowsSettledDownstream(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:sales_order_settlement?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewSalesOrderRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	fixtures := createInventoryTestFixtures(t, ctx, client)
	actor := client.AdminUser.Create().SetUsername("sales-settlement-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	customer := createSalesOrderTestCustomer(t, ctx, client, "SALES-SETTLEMENT", true)

	tests := []struct {
		name string
		seed func(*ent.SalesOrder, *ent.SalesOrderItem)
		want error
	}{
		{name: "draft shipment blocks", want: biz.ErrSalesOrderCancellationShipmentDependency, seed: func(order *ent.SalesOrder, _ *ent.SalesOrderItem) {
			client.Shipment.Create().SetShipmentNo("SHIP-DRAFT-" + order.OrderNo).SetSalesOrderID(order.ID).SetStatus(biz.ShipmentStatusDraft).SetIdempotencyKey("ship-draft-" + order.OrderNo).SaveX(ctx)
		}},
		{name: "cancelled shipment allows", seed: func(order *ent.SalesOrder, _ *ent.SalesOrderItem) {
			client.Shipment.Create().SetShipmentNo("SHIP-CANCELLED-" + order.OrderNo).SetSalesOrderID(order.ID).SetStatus(biz.ShipmentStatusCancelled).SetIdempotencyKey("ship-cancelled-" + order.OrderNo).SaveX(ctx)
		}},
		{name: "active reservation blocks", want: biz.ErrSalesOrderCancellationReservationDependency, seed: func(order *ent.SalesOrder, item *ent.SalesOrderItem) {
			client.StockReservation.Create().SetReservationNo("RSV-ACTIVE-" + order.OrderNo).SetStatus(biz.StockReservationStatusActive).SetSalesOrderID(order.ID).SetSalesOrderItemID(item.ID).SetProductID(fixtures.productID).SetWarehouseID(fixtures.warehouseID).SetUnitID(fixtures.unitID).SetQuantity(decimal.NewFromInt(1)).SetIdempotencyKey("rsv-active-" + order.OrderNo).SaveX(ctx)
		}},
		{name: "released reservation allows", seed: func(order *ent.SalesOrder, item *ent.SalesOrderItem) {
			now := time.Now().UTC()
			client.StockReservation.Create().SetReservationNo("RSV-RELEASED-" + order.OrderNo).SetStatus(biz.StockReservationStatusReleased).SetSalesOrderID(order.ID).SetSalesOrderItemID(item.ID).SetProductID(fixtures.productID).SetWarehouseID(fixtures.warehouseID).SetUnitID(fixtures.unitID).SetQuantity(decimal.NewFromInt(1)).SetIdempotencyKey("rsv-released-" + order.OrderNo).SetReleasedAt(now).SaveX(ctx)
		}},
		{name: "draft production blocks", want: biz.ErrSalesOrderCancellationProductionDependency, seed: func(order *ent.SalesOrder, item *ent.SalesOrderItem) {
			production := client.ProductionOrder.Create().SetOrderNo("PROD-DRAFT-" + order.OrderNo).SetStatus(biz.ProductionOrderStatusDraft).SetCreatedBy(actor.ID).SaveX(ctx)
			client.ProductionOrderItem.Create().SetProductionOrderID(production.ID).SetLineNo(1).SetProductID(fixtures.productID).SetUnitID(fixtures.unitID).SetPlannedQuantity(decimal.NewFromInt(1)).SetSalesOrderItemID(item.ID).SaveX(ctx)
		}},
		{name: "cancelled production allows", seed: func(order *ent.SalesOrder, item *ent.SalesOrderItem) {
			now := time.Now().UTC()
			production := client.ProductionOrder.Create().SetOrderNo("PROD-CANCELLED-" + order.OrderNo).SetStatus(biz.ProductionOrderStatusCancelled).SetCreatedBy(actor.ID).SetCancelledBy(actor.ID).SetCancelledAt(now).SetCancelReason("test settled dependency").SaveX(ctx)
			client.ProductionOrderItem.Create().SetProductionOrderID(production.ID).SetLineNo(1).SetProductID(fixtures.productID).SetUnitID(fixtures.unitID).SetPlannedQuantity(decimal.NewFromInt(1)).SetSalesOrderItemID(item.ID).SaveX(ctx)
		}},
		{name: "active process blocks", want: biz.ErrSalesOrderCancellationProcessDependency, seed: func(order *ent.SalesOrder, _ *ent.SalesOrderItem) {
			createSettlementProcessInstance(t, ctx, client, biz.ProcessKeySalesOrderAcceptance, "sales_order", order.ID, biz.ProcessStatusActive, "sales-active-"+order.OrderNo)
		}},
		{name: "blocked process allows", seed: func(order *ent.SalesOrder, _ *ent.SalesOrderItem) {
			createSettlementProcessInstance(t, ctx, client, biz.ProcessKeySalesOrderAcceptance, "sales_order", order.ID, biz.ProcessStatusBlocked, "sales-blocked-"+order.OrderNo)
		}},
		{name: "completed process allows", seed: func(order *ent.SalesOrder, _ *ent.SalesOrderItem) {
			createSettlementProcessInstance(t, ctx, client, biz.ProcessKeySalesOrderAcceptance, "sales_order", order.ID, biz.ProcessStatusCompleted, "sales-completed-"+order.OrderNo)
		}},
	}
	for index, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			order := client.SalesOrder.Create().SetOrderNo("SO-SETTLE-" + string(rune('A'+index))).SetCustomerID(customer.ID).SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
			item := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(fixtures.productID).SetUnitID(fixtures.unitID).SetOrderedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
			tt.seed(order, item)
			_, err := repo.UpdateSalesOrderLifecycle(ctx, order.ID, biz.SalesOrderStatusCanceled)
			if !errors.Is(err, tt.want) {
				t.Fatalf("cancel error = %v, want %v", err, tt.want)
			}
			got := client.SalesOrder.GetX(ctx, order.ID)
			wantStatus := biz.SalesOrderStatusCanceled
			if tt.want != nil {
				wantStatus = biz.SalesOrderStatusActive
			}
			if got.LifecycleStatus != wantStatus {
				t.Fatalf("source status = %s, want %s", got.LifecycleStatus, wantStatus)
			}
		})
	}
}

func TestPurchaseOrderSettlementReceiptAndProcessRules(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:purchase_order_settlement?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewPurchaseOrderRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	fixtures := createInventoryTestFixtures(t, ctx, client)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "PURCHASE-SETTLEMENT", true)

	tests := []struct {
		name    string
		next    string
		receipt string
		process string
		want    error
	}{
		{name: "close blocks draft receipt", next: biz.PurchaseOrderStatusClosed, receipt: biz.PurchaseReceiptStatusDraft, want: biz.ErrPurchaseOrderCloseDraftReceiptDependency},
		{name: "close allows posted receipt", next: biz.PurchaseOrderStatusClosed, receipt: biz.PurchaseReceiptStatusPosted},
		{name: "close allows cancelled receipt", next: biz.PurchaseOrderStatusClosed, receipt: biz.PurchaseReceiptStatusCancelled},
		{name: "cancel blocks draft receipt", next: biz.PurchaseOrderStatusCanceled, receipt: biz.PurchaseReceiptStatusDraft, want: biz.ErrPurchaseOrderCancelReceiptDependency},
		{name: "cancel blocks posted receipt", next: biz.PurchaseOrderStatusCanceled, receipt: biz.PurchaseReceiptStatusPosted, want: biz.ErrPurchaseOrderCancelReceiptDependency},
		{name: "cancel allows cancelled receipt", next: biz.PurchaseOrderStatusCanceled, receipt: biz.PurchaseReceiptStatusCancelled},
		{name: "close blocks active process", next: biz.PurchaseOrderStatusClosed, process: biz.ProcessStatusActive, want: biz.ErrPurchaseOrderLifecycleProcessDependency},
		{name: "cancel blocks active process", next: biz.PurchaseOrderStatusCanceled, process: biz.ProcessStatusActive, want: biz.ErrPurchaseOrderLifecycleProcessDependency},
		{name: "close allows blocked process", next: biz.PurchaseOrderStatusClosed, process: biz.ProcessStatusBlocked},
		{name: "cancel allows completed process", next: biz.PurchaseOrderStatusCanceled, process: biz.ProcessStatusCompleted},
	}
	for index, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			no := "PO-SETTLE-" + string(rune('A'+index))
			order := client.PurchaseOrder.Create().SetPurchaseOrderNo(no).SetSupplierID(supplier.ID).SetSupplierSnapshot(map[string]any{"name": "supplier"}).SetPurchaseDate(time.Now().UTC()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx)
			item := client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(1).SetMaterialID(fixtures.materialID).SetUnitID(fixtures.unitID).SetPurchasedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
			if tt.receipt != "" {
				receipt := client.PurchaseReceipt.Create().SetReceiptNo("RECEIPT-" + no).SetSupplierID(supplier.ID).SetSupplierName("supplier").SetStatus(tt.receipt).SetReceivedAt(time.Now().UTC()).SaveX(ctx)
				client.PurchaseReceiptItem.Create().SetReceiptID(receipt.ID).SetMaterialID(fixtures.materialID).SetWarehouseID(fixtures.warehouseID).SetUnitID(fixtures.unitID).SetPurchaseOrderItemID(item.ID).SetQuantity(decimal.NewFromInt(1)).SaveX(ctx)
			}
			if tt.process != "" {
				createSettlementProcessInstance(t, ctx, client, biz.ProcessKeyMaterialSupply, "purchase_order", order.ID, tt.process, "purchase-"+no)
			}
			_, err := repo.UpdatePurchaseOrderLifecycle(ctx, order.ID, tt.next)
			if !errors.Is(err, tt.want) {
				t.Fatalf("settlement error = %v, want %v", err, tt.want)
			}
			got := client.PurchaseOrder.GetX(ctx, order.ID)
			wantStatus := tt.next
			if tt.want != nil {
				wantStatus = biz.PurchaseOrderStatusApproved
			}
			if got.LifecycleStatus != wantStatus {
				t.Fatalf("source status = %s, want %s", got.LifecycleStatus, wantStatus)
			}
		})
	}
}

func createSettlementProcessInstance(t *testing.T, ctx context.Context, client *ent.Client, processKey, refType string, refID int, status, idempotency string) {
	t.Helper()
	builder := client.ProcessInstance.Create().SetProcessKey(processKey).SetProcessVersion("v1").SetConfigRevision("settlement-test").SetDefinitionHash("sha256:settlement-test").SetBusinessRefType(refType).SetBusinessRefID(refID).SetIdempotencyKey(idempotency).SetStatus(status)
	if status == biz.ProcessStatusCompleted {
		builder.SetCompletedAt(time.Now().UTC())
	}
	builder.SaveX(ctx)
}
