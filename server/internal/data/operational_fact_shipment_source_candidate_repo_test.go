package data

import (
	"context"
	"fmt"
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

type shipmentSourceCandidateFixture struct {
	client       *ent.Client
	repo         *operationalFactRepo
	customerID   int
	unitID       int
	productID    int
	productSkuID int
	warehouseID  int
}

func newShipmentSourceCandidateFixture(t *testing.T, name string) *shipmentSourceCandidateFixture {
	t.Helper()
	client := enttest.Open(t, dialect.SQLite, "file:"+name+"?mode=memory&cache=shared&_fk=1")
	t.Cleanup(func() { mustCloseEntClient(t, client) })
	ctx := context.Background()
	unitRow := client.Unit.Create().SetCode("PCS-" + name).SetName("只").SaveX(ctx)
	customerRow := client.Customer.Create().SetCode("CUS-" + name).SetName("候选客户-" + name).SaveX(ctx)
	productRow := client.Product.Create().SetCode("PROD-" + name).SetName("候选产品-" + name).SetDefaultUnitID(unitRow.ID).SaveX(ctx)
	skuRow := client.ProductSKU.Create().SetProductID(productRow.ID).SetSkuCode("SKU-" + name).SetSkuName("蓝色").SetColor("蓝").SetDefaultUnitID(unitRow.ID).SaveX(ctx)
	warehouseRow := client.Warehouse.Create().SetCode("WH-" + name).SetName("成品仓").SetType("finished_goods").SaveX(ctx)
	data := NewDataForTesting(client, nil)
	return &shipmentSourceCandidateFixture{
		client:       client,
		repo:         NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)),
		customerID:   customerRow.ID,
		unitID:       unitRow.ID,
		productID:    productRow.ID,
		productSkuID: skuRow.ID,
		warehouseID:  warehouseRow.ID,
	}
}

func (f *shipmentSourceCandidateFixture) createOrder(t *testing.T, no, status string) *ent.SalesOrder {
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

func (f *shipmentSourceCandidateFixture) createOrderItem(
	t *testing.T,
	orderID, lineNo int,
	status string,
	quantity int64,
) *ent.SalesOrderItem {
	t.Helper()
	productCode := "SNAP-PROD"
	productName := "订单产品快照"
	color := "蓝"
	return f.client.SalesOrderItem.Create().
		SetSalesOrderID(orderID).
		SetLineNo(lineNo).
		SetProductID(f.productID).
		SetProductSkuID(f.productSkuID).
		SetUnitID(f.unitID).
		SetProductCodeSnapshot(productCode).
		SetProductNameSnapshot(productName).
		SetColorSnapshot(color).
		SetOrderedQuantity(decimal.NewFromInt(quantity)).
		SetLineStatus(status).
		SaveX(context.Background())
}

func (f *shipmentSourceCandidateFixture) createShipmentItem(
	t *testing.T,
	no, status string,
	orderID, orderItemID int,
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

func TestOperationalFactRepoListShipmentSourceCandidatesUsesShippedTruth(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceCandidateFixture(t, "shipment_source_truth")
	order := f.createOrder(t, "SO-SOURCE-001", biz.SalesOrderStatusActive)
	otherOrder := f.createOrder(t, "SO-SOURCE-002", biz.SalesOrderStatusActive)
	closedOrder := f.createOrder(t, "SO-SOURCE-CLOSED", biz.SalesOrderStatusClosed)

	partial := f.createOrderItem(t, order.ID, 1, biz.SalesOrderItemStatusOpen, 10)
	fullyShipped := f.createOrderItem(t, order.ID, 2, biz.SalesOrderItemStatusOpen, 5)
	_ = f.createOrderItem(t, order.ID, 3, biz.SalesOrderItemStatusClosed, 4)
	mismatchLine := f.createOrderItem(t, order.ID, 4, biz.SalesOrderItemStatusOpen, 3)
	overShippedLine := f.createOrderItem(t, order.ID, 5, biz.SalesOrderItemStatusOpen, 1)
	otherLine := f.createOrderItem(t, otherOrder.ID, 1, biz.SalesOrderItemStatusOpen, 7)
	_ = f.createOrderItem(t, closedOrder.ID, 1, biz.SalesOrderItemStatusOpen, 9)

	f.createShipmentItem(t, "SHP-PARTIAL-SHIPPED", biz.ShipmentStatusShipped, order.ID, partial.ID, 2)
	f.createShipmentItem(t, "SHP-PARTIAL-DRAFT", biz.ShipmentStatusDraft, order.ID, partial.ID, 3)
	f.createShipmentItem(t, "SHP-PARTIAL-CANCELLED", biz.ShipmentStatusCancelled, order.ID, partial.ID, 4)
	f.createShipmentItem(t, "SHP-FULL", biz.ShipmentStatusShipped, order.ID, fullyShipped.ID, 5)
	f.createShipmentItem(t, "SHP-MISMATCH", biz.ShipmentStatusShipped, otherOrder.ID, mismatchLine.ID, 1)
	f.createShipmentItem(t, "SHP-OVER", biz.ShipmentStatusShipped, order.ID, overShippedLine.ID, 2)
	f.createShipmentItem(t, "SHP-OTHER", biz.ShipmentStatusShipped, otherOrder.ID, otherLine.ID, 2)

	items, total, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
		SalesOrderID: order.ID,
		Limit:        50,
	})
	if err != nil {
		t.Fatalf("list shipment source candidates: %v", err)
	}
	if total != 5 || len(items) != 5 {
		t.Fatalf("candidate total=%d len=%d, want 5", total, len(items))
	}
	byLine := make(map[int]*biz.ShipmentSourceCandidate, len(items))
	for _, item := range items {
		byLine[item.LineNo] = item
		if item.SalesOrderID != order.ID || item.OrderStatus != biz.SalesOrderStatusActive || item.OrderVersion <= 0 {
			t.Fatalf("invalid order projection: %#v", item)
		}
		if item.CustomerSnapshot["name"] != "订单客户快照-SO-SOURCE-001" || item.CustomerName == "" || item.SKUCode == nil || item.UnitName != "只" {
			t.Fatalf("source/display projection incomplete: %#v", item)
		}
	}
	if got := byLine[1]; got == nil || !got.ShippedQuantity.Equal(decimal.NewFromInt(2)) || !got.RemainingQuantity.Equal(decimal.NewFromInt(8)) || !got.Selectable || got.DisabledReason != "" {
		t.Fatalf("partial candidate=%#v", got)
	}
	if got := byLine[2]; got == nil || got.Selectable || got.DisabledReason != biz.ShipmentSourceCandidateDisabledFullyShipped || !got.RemainingQuantity.IsZero() {
		t.Fatalf("fully shipped candidate=%#v", got)
	}
	if got := byLine[3]; got == nil || got.Selectable || got.DisabledReason != biz.ShipmentSourceCandidateDisabledLineNotOpen {
		t.Fatalf("closed-line candidate=%#v", got)
	}
	if got := byLine[4]; got == nil || got.Selectable || got.DisabledReason != biz.ShipmentSourceCandidateDisabledSourceMismatch {
		t.Fatalf("source-mismatch candidate=%#v", got)
	}
	if got := byLine[5]; got == nil || got.Selectable || got.DisabledReason != biz.ShipmentSourceCandidateDisabledShippedQuantityExceeded || !got.RemainingQuantity.IsZero() {
		t.Fatalf("over-shipped candidate=%#v", got)
	}

	searchItems, searchTotal, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{Keyword: "SO-SOURCE-002", Limit: 50})
	if err != nil || searchTotal != 1 || len(searchItems) != 1 || searchItems[0].SalesOrderID != otherOrder.ID {
		t.Fatalf("keyword/cross-order result total=%d items=%#v err=%v", searchTotal, searchItems, err)
	}
	closedItems, closedTotal, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{SalesOrderID: closedOrder.ID, Limit: 50})
	if err != nil || closedTotal != 0 || len(closedItems) != 0 {
		t.Fatalf("closed order must be excluded: total=%d items=%#v err=%v", closedTotal, closedItems, err)
	}

	legacyOrder := f.client.SalesOrder.Create().
		SetOrderNo("LEGACY-EMPTY-SNAPSHOT").
		SetCustomerID(f.customerID).
		SetCustomerSnapshot(map[string]any{}).
		SetContactSnapshot(map[string]any{}).
		SetOrderDate(time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	legacyLine := f.client.SalesOrderItem.Create().
		SetSalesOrderID(legacyOrder.ID).
		SetLineNo(1).
		SetProductID(f.productID).
		SetUnitID(f.unitID).
		SetOrderedQuantity(decimal.NewFromInt(2)).
		SetLineStatus(biz.SalesOrderItemStatusOpen).
		SaveX(ctx)
	legacyItems, legacyTotal, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{SalesOrderID: legacyOrder.ID, Limit: 50})
	if err != nil || legacyTotal != 1 || len(legacyItems) != 1 {
		t.Fatalf("legacy snapshot candidate total=%d items=%#v err=%v", legacyTotal, legacyItems, err)
	}
	legacy := legacyItems[0]
	if legacy.SalesOrderItemID != legacyLine.ID || len(legacy.CustomerSnapshot) != 0 || legacy.CustomerName == "" || legacy.ProductCode == "" || legacy.ProductName == "" || legacy.ProductCodeSnapshot != nil || legacy.ProductNameSnapshot != nil || legacy.ColorSnapshot != nil || !legacy.Selectable {
		t.Fatalf("legacy missing snapshots must use explicit current-master fallback fields: %#v", legacy)
	}
}

func TestOperationalFactRepoListShipmentSourceCandidatesFailsClosedForOrderLevelSourceCorruption(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceCandidateFixture(t, "ship_src_corrupt")
	headerOrder := f.createOrder(t, "SO-CORRUPT-HEADER", biz.SalesOrderStatusActive)
	headerLine1 := f.createOrderItem(t, headerOrder.ID, 1, biz.SalesOrderItemStatusOpen, 10)
	headerLine2 := f.createOrderItem(t, headerOrder.ID, 2, biz.SalesOrderItemStatusOpen, 10)
	foreignOrder := f.createOrder(t, "SO-CORRUPT-FOREIGN", biz.SalesOrderStatusActive)
	foreignLine := f.createOrderItem(t, foreignOrder.ID, 1, biz.SalesOrderItemStatusOpen, 10)
	nilSourceOrder := f.createOrder(t, "SO-CORRUPT-NIL", biz.SalesOrderStatusActive)
	nilSourceLine := f.createOrderItem(t, nilSourceOrder.ID, 1, biz.SalesOrderItemStatusOpen, 10)

	foreignShipment := f.client.Shipment.Create().
		SetShipmentNo("SHP-CORRUPT-FOREIGN").
		SetSalesOrderID(headerOrder.ID).
		SetCustomerID(f.customerID).
		SetStatus(biz.ShipmentStatusShipped).
		SetIdempotencyKey("SHP-CORRUPT-FOREIGN").
		SaveX(ctx)
	f.client.ShipmentItem.Create().
		SetShipmentID(foreignShipment.ID).
		SetSalesOrderItemID(foreignLine.ID).
		SetProductID(f.productID).
		SetProductSkuID(f.productSkuID).
		SetWarehouseID(f.warehouseID).
		SetUnitID(f.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SaveX(ctx)

	nilSourceShipment := f.client.Shipment.Create().
		SetShipmentNo("SHP-CORRUPT-NIL").
		SetSalesOrderID(nilSourceOrder.ID).
		SetCustomerID(f.customerID).
		SetStatus(biz.ShipmentStatusShipped).
		SetIdempotencyKey("SHP-CORRUPT-NIL").
		SaveX(ctx)
	f.client.ShipmentItem.Create().
		SetShipmentID(nilSourceShipment.ID).
		SetProductID(f.productID).
		SetProductSkuID(f.productSkuID).
		SetWarehouseID(f.warehouseID).
		SetUnitID(f.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SaveX(ctx)

	headerCandidates, _, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
		SalesOrderID: headerOrder.ID,
		Limit:        50,
	})
	if err != nil || len(headerCandidates) != 2 {
		t.Fatalf("header corruption candidates len=%d err=%v", len(headerCandidates), err)
	}
	for _, item := range headerCandidates {
		if item.Selectable || item.DisabledReason != biz.ShipmentSourceCandidateDisabledSourceMismatch {
			t.Fatalf("header line %d must fail closed: %#v", item.LineNo, item)
		}
	}
	if headerCandidates[0].SalesOrderItemID != headerLine1.ID || headerCandidates[1].SalesOrderItemID != headerLine2.ID {
		t.Fatalf("unexpected header candidate order: %#v", headerCandidates)
	}

	foreignCandidates, _, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
		SalesOrderID: foreignOrder.ID,
		Limit:        50,
	})
	if err != nil || len(foreignCandidates) != 1 || foreignCandidates[0].SalesOrderItemID != foreignLine.ID ||
		foreignCandidates[0].Selectable || foreignCandidates[0].DisabledReason != biz.ShipmentSourceCandidateDisabledSourceMismatch {
		t.Fatalf("foreign source line must fail closed: %#v err=%v", foreignCandidates, err)
	}

	nilSourceCandidates, _, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
		SalesOrderID: nilSourceOrder.ID,
		Limit:        50,
	})
	if err != nil || len(nilSourceCandidates) != 1 || nilSourceCandidates[0].SalesOrderItemID != nilSourceLine.ID ||
		nilSourceCandidates[0].Selectable || nilSourceCandidates[0].DisabledReason != biz.ShipmentSourceCandidateDisabledSourceMismatch {
		t.Fatalf("nil source line must fail closed: %#v err=%v", nilSourceCandidates, err)
	}
}

func TestOperationalFactRepoListShipmentSourceCandidatesPaginatesAt50And200(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceCandidateFixture(t, "shipment_source_paging")
	order := f.createOrder(t, "SO-PAGING", biz.SalesOrderStatusActive)
	for lineNo := 1; lineNo <= 205; lineNo++ {
		f.createOrderItem(t, order.ID, lineNo, biz.SalesOrderItemStatusOpen, 1)
	}

	first, total, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{SalesOrderID: order.ID, Limit: 50})
	if err != nil || total != 205 || len(first) != 50 || first[0].LineNo != 1 || first[49].LineNo != 50 {
		t.Fatalf("50-row page total=%d len=%d first/last=%v/%v err=%v", total, len(first), candidateLine(first, 0), candidateLine(first, 49), err)
	}
	maxPage, total, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{SalesOrderID: order.ID, Limit: 200, Offset: 5})
	if err != nil || total != 205 || len(maxPage) != 200 || maxPage[0].LineNo != 6 || maxPage[199].LineNo != 205 {
		t.Fatalf("200-row page total=%d len=%d first/last=%v/%v err=%v", total, len(maxPage), candidateLine(maxPage, 0), candidateLine(maxPage, 199), err)
	}
	search, searchTotal, err := f.repo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{Keyword: fmt.Sprint(order.ID), SalesOrderID: order.ID, Limit: 50})
	if err != nil || searchTotal != 205 || len(search) != 50 {
		t.Fatalf("numeric order search total=%d len=%d err=%v", searchTotal, len(search), err)
	}
}

func candidateLine(items []*biz.ShipmentSourceCandidate, index int) any {
	if index < 0 || index >= len(items) {
		return nil
	}
	return items[index].LineNo
}
