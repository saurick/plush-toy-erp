package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestSalesOrderSummaryUsesShippedFactsAndPreservesUnknownBalance(t *testing.T) {
	ctx := context.Background()
	f := newShipmentSourceSnapshotFixture(t, "sales-summary-shipped")
	defer mustCloseEntClient(t, f.client)
	order := f.createOrder(t, "SO-SUM-SHIPPED", biz.SalesOrderStatusActive)
	line := f.createOrderItem(t, order.ID, 1, "open", 10)
	f.createShipmentItem(t, "SHIP-SUM-DRAFT", biz.ShipmentStatusDraft, order.ID, line.ID, 8)
	f.createShipmentItem(t, "SHIP-SUM-POSTED", biz.ShipmentStatusShipped, order.ID, line.ID, 4)
	uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(&Data{postgres: f.client}, log.NewStdLogger(io.Discard)))
	filter := biz.SalesOrderSummaryFilter{SalesOrderFilter: biz.SalesOrderFilter{Keyword: order.OrderNo, Limit: 20, LifecycleScope: "all"}}
	rows, _, err := uc.ListSalesOrderSummary(ctx, filter)
	if err != nil || len(rows) != 1 || rows[0].Item.ShippedQuantity.String() != "4" || rows[0].Item.UnshippedQuantity.String() != "6" {
		t.Fatalf("draft shipment changed balance: %+v %v", rows, err)
	}
	other := f.createOrder(t, "SO-SUM-OTHER", biz.SalesOrderStatusActive)
	f.createShipmentItem(t, "SHIP-SUM-MISMATCH", biz.ShipmentStatusShipped, other.ID, line.ID, 1)
	rows, _, err = uc.ListSalesOrderSummary(ctx, filter)
	if err != nil || len(rows) != 1 || rows[0].Item.UnshippedQuantity != nil || rows[0].Item.ShippedQuantity != nil {
		t.Fatalf("ambiguous source must not invent a balance: %+v %v", rows, err)
	}
}

func TestSalesOrderSummaryRowsFiltersAndSourceDisplay(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_summary")
	defer mustCloseEntClient(t, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SUMMARY", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SUMMARY", true)
	date := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	headerDate, lineDate := date.AddDate(0, 0, 8), date.AddDate(0, 0, 11)
	owner, name, number, process := "模拟跟单员", "模拟小熊", "CUSTOM-01", "刺绣"
	older, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
		OrderNo: "SO-SUM-OLD", CustomerID: customer.ID, CustomerSnapshot: map[string]any{"name": customer.Name}, OrderDate: date, SalesOwner: &owner, PlannedDeliveryDate: &headerDate,
	}, []*biz.SalesOrderItemSaveMutation{
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, UnitID: unit.ID, RequestedProductName: &name, CustomerProductNo: &number, OrderedQuantity: decimal.NewFromInt(10), PreShipmentSampleQuantity: decimal.NewFromInt(2), ProcessRequirement: &process}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, UnitID: unit.ID, RequestedProductName: &name, OrderedQuantity: decimal.NewFromInt(20), PlannedDeliveryDate: &lineDate}},
	})
	if err != nil {
		t.Fatal(err)
	}
	newer, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
		OrderNo: "SO-SUM-NEW", CustomerID: customer.ID, CustomerSnapshot: map[string]any{"name": customer.Name}, OrderDate: date.AddDate(0, 0, 1),
	}, []*biz.SalesOrderItemSaveMutation{{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, UnitID: unit.ID, RequestedProductName: &name, OrderedQuantity: decimal.NewFromInt(30)}}})
	if err != nil {
		t.Fatal(err)
	}
	// Closed records remain queryable and visibly retain their source status.
	client.SalesOrder.UpdateOneID(older.Order.ID).SetLifecycleStatus(biz.SalesOrderStatusClosed).SaveX(ctx)
	base := biz.SalesOrderSummaryFilter{SalesOrderFilter: biz.SalesOrderFilter{Limit: 2, LifecycleScope: "all"}}
	rows, total, err := uc.ListSalesOrderSummary(ctx, base)
	if err != nil || total != 3 || len(rows) != 2 {
		t.Fatalf("rows=%+v total=%d error=%v", rows, total, err)
	}
	if rows[0].Item.ID != newer.Items[0].ID || rows[1].Item.ID != older.Items[0].ID {
		t.Fatal("summary must paginate ordered product lines across orders")
	}
	row := rows[1]
	if row.Order.LifecycleStatus != biz.SalesOrderStatusClosed || row.UnitName != unit.Name || row.Order.CustomerSnapshot["name"] != customer.Name || row.Item.CustomerProductNo == nil || *row.Item.CustomerProductNo != number || !row.Item.PlannedDeliveryDate.Equal(headerDate) {
		t.Fatalf("lost source fields: order=%+v item=%+v unit=%s", row.Order, row.Item, row.UnitName)
	}
	if row.Item.Designer != nil || row.Item.UnshippedQuantity == nil || row.Item.UnshippedQuantity.String() != "10" || row.Item.PreShipmentSampleQuantity.String() != "2" {
		t.Fatalf("invalid derived fields: %+v", row.Item)
	}
	base.Offset = 2
	rows, total, err = uc.ListSalesOrderSummary(ctx, base)
	if err != nil || total != 3 || len(rows) != 1 || rows[0].Item.ID != older.Items[1].ID {
		t.Fatalf("second page: %+v %d %v", rows, total, err)
	}
	base.Offset = 0
	for _, tc := range []struct {
		name      string
		change    func(*biz.SalesOrderSummaryFilter)
		count, id int
	}{
		{"customer", func(f *biz.SalesOrderSummaryFilter) { f.Customer = customer.Name }, 3, 0},
		{"owner", func(f *biz.SalesOrderSummaryFilter) { f.SalesOwner = owner }, 2, older.Items[0].ID},
		{"product number", func(f *biz.SalesOrderSummaryFilter) { f.Keyword = number }, 1, older.Items[0].ID},
		{"order", func(f *biz.SalesOrderSummaryFilter) { f.Keyword = "SO-SUM-NEW" }, 1, newer.Items[0].ID},
		{"status", func(f *biz.SalesOrderSummaryFilter) { f.LifecycleStatus = biz.SalesOrderStatusDraft }, 1, newer.Items[0].ID},
		{"header date", func(f *biz.SalesOrderSummaryFilter) {
			f.DateField = "planned_delivery_date"
			f.DateFrom = &headerDate
			f.DateTo = &headerDate
		}, 1, older.Items[0].ID},
		{"line date", func(f *biz.SalesOrderSummaryFilter) {
			f.DateField = "planned_delivery_date"
			f.DateFrom = &lineDate
			f.DateTo = &lineDate
		}, 1, older.Items[1].ID},
		{"empty", func(f *biz.SalesOrderSummaryFilter) { f.Customer = "not present" }, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			filter := base
			filter.Limit = 20
			tc.change(&filter)
			items, count, err := uc.ListSalesOrderSummary(ctx, filter)
			if err != nil || count != tc.count || len(items) != tc.count || (tc.id > 0 && items[0].Item.ID != tc.id) {
				t.Fatalf("count=%d rows=%+v err=%v", count, items, err)
			}
		})
	}
	base.DateFrom, base.DateTo = &lineDate, &headerDate
	if _, _, err := uc.ListSalesOrderSummary(ctx, base); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("reversed dates: %v", err)
	}
}
