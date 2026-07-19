package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/shipment"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSourceDocumentPostgresShipmentCreateVsSalesCancelUsesOneSourceLock(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "SETTLE-PG-SALES-"+fixtures.suffix, true)
	actor := client.AdminUser.Create().SetUsername("settle-pg-sales-" + fixtures.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))

	for _, cancelFirst := range []bool{true, false} {
		name := "shipment_first"
		if cancelFirst {
			name = "cancel_first"
		}
		t.Run(name, func(t *testing.T) {
			order := client.SalesOrder.Create().SetOrderNo("SO-SETTLE-PG-" + name + "-" + fixtures.suffix).SetCustomerID(customer.ID).SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
			item := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(fixtures.productID).SetUnitID(fixtures.unitID).SetOrderedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
			create := func() error {
				_, err := factUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
					Shipment: &biz.ShipmentCreate{ShipmentNo: "SHIP-SETTLE-PG-" + name + "-" + fixtures.suffix, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: "ship-settle-pg-" + name + "-" + fixtures.suffix},
					Items:    []*biz.ShipmentItemCreate{{SalesOrderItemID: &item.ID, ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(1)}},
				})
				return err
			}
			cancel := func() error {
				_, err := salesUC.CancelSalesOrderWithActor(ctx, order.ID, actor.ID)
				return err
			}
			first, second := create, cancel
			if cancelFirst {
				first, second = cancel, create
			}
			firstErr, secondErr := runPostgresSourceLockRace(t, ctx, data, "sales_orders", order.ID, first, second)
			gotOrder := client.SalesOrder.GetX(ctx, order.ID)
			shipmentCount := client.Shipment.Query().Where(shipment.SalesOrderID(order.ID)).CountX(ctx)
			if cancelFirst {
				if firstErr != nil || !errors.Is(secondErr, biz.ErrShipmentOrderNotActive) || gotOrder.LifecycleStatus != biz.SalesOrderStatusCanceled || shipmentCount != 0 {
					t.Fatalf("cancel-first first=%v second=%v status=%s shipments=%d", firstErr, secondErr, gotOrder.LifecycleStatus, shipmentCount)
				}
				return
			}
			if firstErr != nil || !errors.Is(secondErr, biz.ErrSalesOrderCancellationShipmentDependency) || gotOrder.LifecycleStatus != biz.SalesOrderStatusActive || shipmentCount != 1 {
				t.Fatalf("shipment-first first=%v second=%v status=%s shipments=%d", firstErr, secondErr, gotOrder.LifecycleStatus, shipmentCount)
			}
		})
	}
}

func TestSourceDocumentPostgresReceiptCreateVsPurchaseCancelUsesOneSourceLock(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SETTLE-PG-PURCHASE-"+fixtures.suffix, true)
	purchaseUC := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, logger))
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))

	for _, cancelFirst := range []bool{true, false} {
		name := "receipt_first"
		if cancelFirst {
			name = "cancel_first"
		}
		t.Run(name, func(t *testing.T) {
			receiptNo := "RECEIPT-SETTLE-PG-" + name + "-" + fixtures.suffix
			order := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-SETTLE-PG-" + name + "-" + fixtures.suffix).SetSupplierID(supplier.ID).SetSupplierSnapshot(map[string]any{"name": "supplier"}).SetPurchaseDate(time.Now().UTC()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx)
			client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(1).SetMaterialID(fixtures.materialID).SetUnitID(fixtures.unitID).SetPurchasedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
			create := func() error {
				_, err := inventoryUC.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{ReceiptNo: receiptNo, PurchaseOrderID: order.ID, WarehouseID: fixtures.warehouseID, ReceivedAt: time.Now().UTC(), IdempotencyKey: "receipt-settle-pg-" + name + "-" + fixtures.suffix})
				return err
			}
			cancel := func() error {
				_, err := purchaseUC.CancelPurchaseOrder(ctx, order.ID)
				return err
			}
			first, second := create, cancel
			if cancelFirst {
				first, second = cancel, create
			}
			firstErr, secondErr := runPostgresSourceLockRace(t, ctx, data, "purchase_orders", order.ID, first, second)
			gotOrder := client.PurchaseOrder.GetX(ctx, order.ID)
			receiptCount := client.PurchaseReceipt.Query().Where(purchasereceipt.ReceiptNo(receiptNo)).CountX(ctx)
			if cancelFirst {
				if firstErr != nil || !errors.Is(secondErr, biz.ErrBadParam) || gotOrder.LifecycleStatus != biz.PurchaseOrderStatusCanceled || receiptCount != 0 {
					t.Fatalf("cancel-first first=%v second=%v status=%s receipts=%d", firstErr, secondErr, gotOrder.LifecycleStatus, receiptCount)
				}
				return
			}
			if firstErr != nil || !errors.Is(secondErr, biz.ErrPurchaseOrderCancelReceiptDependency) || gotOrder.LifecycleStatus != biz.PurchaseOrderStatusApproved || receiptCount != 1 {
				t.Fatalf("receipt-first first=%v second=%v status=%s receipts=%d", firstErr, secondErr, gotOrder.LifecycleStatus, receiptCount)
			}
		})
	}
}

func runPostgresSourceLockRace(t *testing.T, ctx context.Context, data *Data, table string, sourceID int, first, second func() error) (error, error) {
	t.Helper()
	blocker, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin %s source blocker: %v", table, err)
	}
	blockerOpen := true
	t.Cleanup(func() {
		if blockerOpen {
			_ = blocker.Rollback()
		}
	})
	query := "SELECT id FROM " + table + " WHERE id = $1 FOR UPDATE"
	if _, err := blocker.ExecContext(ctx, query, sourceID); err != nil {
		t.Fatalf("lock %s source: %v", table, err)
	}
	firstDone := make(chan error, 1)
	secondDone := make(chan error, 1)
	go func() { firstDone <- first() }()
	waitForPostgresBlockedQueryCount(t, ctx, data.sqldb, table, 1)
	go func() { secondDone <- second() }()
	waitForPostgresBlockedQueryCount(t, ctx, data.sqldb, table, 2)
	if err := blocker.Commit(); err != nil {
		t.Fatalf("release %s source blocker: %v", table, err)
	}
	blockerOpen = false
	return receivePurchaseOperationError(t, firstDone, table+" first operation"), receivePurchaseOperationError(t, secondDone, table+" second operation")
}
