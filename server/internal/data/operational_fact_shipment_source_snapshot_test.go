package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/shipment"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type shipmentSourceSnapshotFixture struct {
	client       *ent.Client
	repo         *operationalFactRepo
	customerID   int
	unitID       int
	productID    int
	productSkuID int
	warehouseID  int
}

func newShipmentSourceSnapshotFixture(t *testing.T, name string) *shipmentSourceSnapshotFixture {
	t.Helper()
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, name)
	fixtures := createInventoryTestFixtures(t, ctx, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-"+name, true)
	sku := createSalesOrderTestProductSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-"+name)
	return &shipmentSourceSnapshotFixture{
		client:       client,
		repo:         NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)),
		customerID:   customer.ID,
		unitID:       fixtures.unitID,
		productID:    fixtures.productID,
		productSkuID: sku.ID,
		warehouseID:  fixtures.warehouseID,
	}
}

func (f *shipmentSourceSnapshotFixture) createOrder(t *testing.T, no, status string) *ent.SalesOrder {
	t.Helper()
	return f.client.SalesOrder.Create().
		SetOrderNo(no).
		SetCustomerID(f.customerID).
		SetCustomerSnapshot(map[string]any{"name": "订单客户快照-" + no}).
		SetContactSnapshot(map[string]any{}).
		SetOrderDate(time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(status).
		SaveX(context.Background())
}

func (f *shipmentSourceSnapshotFixture) createOrderItem(
	t *testing.T,
	orderID int,
	lineNo int,
	status string,
	quantity int64,
) *ent.SalesOrderItem {
	t.Helper()
	return f.client.SalesOrderItem.Create().
		SetSalesOrderID(orderID).
		SetLineNo(lineNo).
		SetProductID(f.productID).
		SetProductSkuID(f.productSkuID).
		SetUnitID(f.unitID).
		SetOrderedQuantity(decimal.NewFromInt(quantity)).
		SetLineStatus(status).
		SaveX(context.Background())
}

func (f *shipmentSourceSnapshotFixture) createShipmentItem(
	t *testing.T,
	no string,
	status string,
	orderID int,
	orderItemID int,
	quantity int64,
) {
	t.Helper()
	ctx := context.Background()
	shipmentRow := f.client.Shipment.Create().
		SetShipmentNo(no).
		SetSalesOrderID(orderID).
		SetCustomerID(f.customerID).
		SetStatus(status).
		SetIdempotencyKey(no).
		SaveX(ctx)
	f.client.ShipmentItem.Create().
		SetShipmentID(shipmentRow.ID).
		SetSalesOrderItemID(orderItemID).
		SetProductID(f.productID).
		SetProductSkuID(f.productSkuID).
		SetWarehouseID(f.warehouseID).
		SetUnitID(f.unitID).
		SetQuantity(decimal.NewFromInt(quantity)).
		SaveX(ctx)
}

func shipmentSourceSnapshotInput(
	f *shipmentSourceSnapshotFixture,
	orderID int,
	orderItemID int,
	shipmentNo string,
	customerID *int,
	customerSnapshot *string,
) *biz.ShipmentCreateWithItems {
	return &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:       shipmentNo,
			SalesOrderID:     &orderID,
			CustomerID:       customerID,
			CustomerSnapshot: customerSnapshot,
			IdempotencyKey:   shipmentNo,
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &orderItemID,
			ProductID:        f.productID,
			ProductSkuID:     &f.productSkuID,
			WarehouseID:      f.warehouseID,
			UnitID:           f.unitID,
			Quantity:         decimal.NewFromInt(1),
		}},
	}
}

func TestOperationalFactRepoCreateSourceShipmentOwnsCustomerSnapshotAndReplay(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "snapshot_truth")
	order := f.createOrder(t, "SO-SNAPSHOT-TRUTH", biz.SalesOrderStatusActive)
	line := f.createOrderItem(t, order.ID, 1, biz.SalesOrderItemStatusOpen, 3)
	if _, err := f.client.Customer.UpdateOneID(f.customerID).SetName("当前客户已改名").Save(ctx); err != nil {
		t.Fatalf("rename current customer: %v", err)
	}

	forged := "客户端伪造客户"
	input := shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SNAPSHOT-TRUTH", &f.customerID, &forged)
	created, err := f.repo.CreateShipmentDraftWithItems(ctx, input)
	if err != nil {
		t.Fatalf("create source-bound shipment: %v", err)
	}
	if created.CustomerSnapshot == nil || *created.CustomerSnapshot != "订单客户快照-SO-SNAPSHOT-TRUTH" {
		t.Fatalf("shipment customer snapshot = %v, want frozen sales-order snapshot", created.CustomerSnapshot)
	}

	stale := "当前客户已改名"
	retry := shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SNAPSHOT-TRUTH", &f.customerID, &stale)
	replayed, err := f.repo.CreateShipmentDraftWithItems(ctx, retry)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("client-snapshot-only retry must replay id=%d: result=%#v err=%v", created.ID, replayed, err)
	}
	if replayed.CustomerSnapshot == nil || *replayed.CustomerSnapshot != "订单客户快照-SO-SNAPSHOT-TRUTH" {
		t.Fatalf("replayed customer snapshot = %v, want original server-owned snapshot", replayed.CustomerSnapshot)
	}

	conflicting := shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SNAPSHOT-CONFLICT", &f.customerID, &stale)
	conflicting.Shipment.IdempotencyKey = input.Shipment.IdempotencyKey
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, conflicting); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("different shipment intent with reused key error = %v, want ErrIdempotencyConflict", err)
	}
	if count := f.client.Shipment.Query().Where(shipment.IdempotencyKey(input.Shipment.IdempotencyKey)).CountX(ctx); count != 1 {
		t.Fatalf("idempotency key wrote %d shipment rows, want 1", count)
	}
	if _, err := f.client.Shipment.UpdateOneID(created.ID).SetCustomerSnapshot("被篡改快照").Save(ctx); err != nil {
		t.Fatalf("tamper stored snapshot for replay guard: %v", err)
	}
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, retry); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("stored snapshot drift replay error = %v, want ErrIdempotencyConflict", err)
	}
}

func TestOperationalFactRepoCreateSourceShipmentPreservesMissingOrderSnapshot(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "snapshot_empty")
	order := f.client.SalesOrder.Create().
		SetOrderNo("SO-SNAPSHOT-EMPTY").
		SetCustomerID(f.customerID).
		SetCustomerSnapshot(map[string]any{}).
		SetContactSnapshot(map[string]any{}).
		SetOrderDate(time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	line := f.createOrderItem(t, order.ID, 1, biz.SalesOrderItemStatusOpen, 2)
	forged := "客户端不应替空快照补值"

	created, err := f.repo.CreateShipmentDraftWithItems(
		ctx,
		shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SNAPSHOT-EMPTY", &f.customerID, &forged),
	)
	if err != nil {
		t.Fatalf("create source-bound shipment with empty order snapshot: %v", err)
	}
	if created.CustomerSnapshot != nil {
		t.Fatalf("empty order snapshot was replaced by client value: %v", created.CustomerSnapshot)
	}

	replayed, err := f.repo.CreateShipmentDraftWithItems(
		ctx,
		shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SNAPSHOT-EMPTY", &f.customerID, nil),
	)
	if err != nil || replayed.ID != created.ID || replayed.CustomerSnapshot != nil {
		t.Fatalf("empty snapshot replay = %#v err=%v, want same nil snapshot", replayed, err)
	}
}

func TestOperationalFactRepoCreateSourceShipmentRejectsOrderBoundaryMismatch(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "snapshot_boundary")
	activeOrder := f.createOrder(t, "SO-SNAPSHOT-ACTIVE", biz.SalesOrderStatusActive)
	activeLine := f.createOrderItem(t, activeOrder.ID, 1, biz.SalesOrderItemStatusOpen, 2)
	otherCustomer := f.client.Customer.Create().SetCode("C-OTHER-SNAPSHOT").SetName("其他客户").SaveX(ctx)
	forged := "伪造"
	if _, err := f.repo.CreateShipmentDraftWithItems(
		ctx,
		shipmentSourceSnapshotInput(f, activeOrder.ID, activeLine.ID, "SHP-SNAPSHOT-WRONG-CUSTOMER", &otherCustomer.ID, &forged),
	); !errors.Is(err, biz.ErrShipmentSourceMismatch) {
		t.Fatalf("mismatched order/customer error = %v, want ErrShipmentSourceMismatch", err)
	}

	draftOrder := f.createOrder(t, "SO-SNAPSHOT-DRAFT", biz.SalesOrderStatusDraft)
	draftLine := f.createOrderItem(t, draftOrder.ID, 1, biz.SalesOrderItemStatusOpen, 2)
	if _, err := f.repo.CreateShipmentDraftWithItems(
		ctx,
		shipmentSourceSnapshotInput(f, draftOrder.ID, draftLine.ID, "SHP-SNAPSHOT-INACTIVE", &f.customerID, &forged),
	); !errors.Is(err, biz.ErrShipmentOrderNotActive) {
		t.Fatalf("inactive order error = %v, want ErrShipmentOrderNotActive", err)
	}
	if count := f.client.Shipment.Query().Where(
		shipment.ShipmentNoIn("SHP-SNAPSHOT-WRONG-CUSTOMER", "SHP-SNAPSHOT-INACTIVE"),
	).CountX(ctx); count != 0 {
		t.Fatalf("rejected source boundaries wrote %d shipment rows", count)
	}
}

func TestOperationalFactRepoCreateSourceShipmentRequiresCompleteOpenSourceLines(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "source_line")
	order := f.createOrder(t, "SO-SOURCE-LINE", biz.SalesOrderStatusActive)
	openLine := f.createOrderItem(t, order.ID, 1, biz.SalesOrderItemStatusOpen, 3)
	closedLine := f.createOrderItem(t, order.ID, 2, biz.SalesOrderItemStatusClosed, 3)
	forged := "客户端快照"

	missingLine := shipmentSourceSnapshotInput(f, order.ID, openLine.ID, "SHP-SOURCE-LINE-MISSING", &f.customerID, &forged)
	missingLine.Items[0].SalesOrderItemID = nil
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, missingLine); !errors.Is(err, biz.ErrShipmentSourceMismatch) {
		t.Fatalf("header-only source binding error = %v, want ErrShipmentSourceMismatch", err)
	}

	lineWithoutHeader := shipmentSourceSnapshotInput(f, order.ID, openLine.ID, "SHP-SOURCE-LINE-NO-HEADER", &f.customerID, &forged)
	lineWithoutHeader.Shipment.SalesOrderID = nil
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, lineWithoutHeader); !errors.Is(err, biz.ErrShipmentSourceMismatch) {
		t.Fatalf("line-only source binding error = %v, want ErrShipmentSourceMismatch", err)
	}

	closed := shipmentSourceSnapshotInput(f, order.ID, closedLine.ID, "SHP-SOURCE-LINE-CLOSED", &f.customerID, &forged)
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, closed); !errors.Is(err, biz.ErrShipmentSourceMismatch) {
		t.Fatalf("closed source line error = %v, want ErrShipmentSourceMismatch", err)
	}

	mismatchedProduct := shipmentSourceSnapshotInput(f, order.ID, openLine.ID, "SHP-SOURCE-LINE-PRODUCT", &f.customerID, &forged)
	otherProduct := f.client.Product.Create().
		SetCode("P-SOURCE-LINE-OTHER").
		SetName("其他产品").
		SetDefaultUnitID(f.unitID).
		SaveX(ctx)
	mismatchedProduct.Items[0].ProductID = otherProduct.ID
	mismatchedProduct.Items[0].ProductSkuID = nil
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, mismatchedProduct); !errors.Is(err, biz.ErrShipmentSourceMismatch) {
		t.Fatalf("mismatched source product error = %v, want ErrShipmentSourceMismatch", err)
	}

	if count := f.client.Shipment.Query().Where(shipment.ShipmentNoIn(
		"SHP-SOURCE-LINE-MISSING",
		"SHP-SOURCE-LINE-NO-HEADER",
		"SHP-SOURCE-LINE-CLOSED",
		"SHP-SOURCE-LINE-PRODUCT",
	)).CountX(ctx); count != 0 {
		t.Fatalf("rejected source line boundaries wrote %d shipment rows", count)
	}
}

func TestOperationalFactRepoCreateSourceShipmentUsesOnlyShippedRemainingQuantity(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "source_remaining")
	order := f.createOrder(t, "SO-SOURCE-REMAINING", biz.SalesOrderStatusActive)
	line := f.createOrderItem(t, order.ID, 1, biz.SalesOrderItemStatusOpen, 3)
	f.createShipmentItem(t, "SHP-SOURCE-REMAINING-SHIPPED", biz.ShipmentStatusShipped, order.ID, line.ID, 1)
	f.createShipmentItem(t, "SHP-SOURCE-REMAINING-DRAFT", biz.ShipmentStatusDraft, order.ID, line.ID, 20)
	clientSnapshot := "客户端快照"

	overRemaining := shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SOURCE-REMAINING-OVER", &f.customerID, &clientSnapshot)
	overRemaining.Items = append(overRemaining.Items, &biz.ShipmentItemCreate{
		SalesOrderItemID: &line.ID,
		ProductID:        f.productID,
		ProductSkuID:     &f.productSkuID,
		WarehouseID:      f.warehouseID,
		UnitID:           f.unitID,
		Quantity:         decimal.NewFromInt(2),
	})
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, overRemaining); !errors.Is(err, biz.ErrShipmentQuantityExceeded) {
		t.Fatalf("aggregated quantity above SHIPPED remaining error = %v, want ErrShipmentQuantityExceeded", err)
	}

	withinRemaining := shipmentSourceSnapshotInput(f, order.ID, line.ID, "SHP-SOURCE-REMAINING-OK", &f.customerID, &clientSnapshot)
	withinRemaining.Items[0].Quantity = decimal.NewFromInt(2)
	created, err := f.repo.CreateShipmentDraftWithItems(ctx, withinRemaining)
	if err != nil {
		t.Fatalf("DRAFT quantities must not occupy source remaining: %v", err)
	}
	if created.ID <= 0 || len(created.Items) != 1 || !created.Items[0].Quantity.Equal(decimal.NewFromInt(2)) {
		t.Fatalf("unexpected remaining-quantity draft: %#v", created)
	}
	if count := f.client.Shipment.Query().Where(shipment.ShipmentNo("SHP-SOURCE-REMAINING-OVER")).CountX(ctx); count != 0 {
		t.Fatalf("over-remaining create wrote %d shipment rows", count)
	}
}

func TestOperationalFactRepoCreateManualShipmentKeepsClientSnapshotBoundary(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "manual_snapshot")
	manualSnapshot := "手工草稿客户快照"
	input := &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:       "SHP-MANUAL-SNAPSHOT",
			CustomerID:       &f.customerID,
			CustomerSnapshot: &manualSnapshot,
			IdempotencyKey:   "SHP-MANUAL-SNAPSHOT",
		},
		Items: []*biz.ShipmentItemCreate{{
			ProductID:    f.productID,
			ProductSkuID: &f.productSkuID,
			WarehouseID:  f.warehouseID,
			UnitID:       f.unitID,
			Quantity:     decimal.NewFromInt(1),
		}},
	}
	created, err := f.repo.CreateShipmentDraftWithItems(ctx, input)
	if err != nil {
		t.Fatalf("create manual shipment: %v", err)
	}
	if created.CustomerSnapshot == nil || *created.CustomerSnapshot != manualSnapshot {
		t.Fatalf("manual shipment snapshot = %v, want client-owned manual snapshot", created.CustomerSnapshot)
	}

	changedSnapshot := "另一手工快照"
	changed := *input.Shipment
	changed.CustomerSnapshot = &changedSnapshot
	if _, err := f.repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &changed,
		Items:    input.Items,
	}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("manual snapshot change error = %v, want ErrIdempotencyConflict", err)
	}
}
