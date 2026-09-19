package data

import (
	"context"
	"io"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
)

func TestOutsourcingOrderSummaryPaginationFiltersAndSnapshots(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:outsourcing_summary?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	uc := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))
	unit := client.Unit.Create().SetCode("UNIT-SUM").SetName("件").SaveX(ctx)
	product := client.Product.Create().SetCode("INTERNAL-SUM").SetStyleNo("22040").SetName("模拟玩具").SetDefaultUnitID(unit.ID).SaveX(ctx)
	material := client.Material.Create().SetCode("MAT-SUM").SetName("模拟布料").SetDefaultUnitID(unit.ID).SaveX(ctx)
	process := client.Process.Create().SetCode("PROC-SUM").SetName("电绣").SetOutsourcingEnabled(true).SaveX(ctx)
	process2 := client.Process.Create().SetCode("PROC-SUM-2").SetName("激光").SetOutsourcingEnabled(true).SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("SUP-SUM").SetName("模拟甲厂").SetShortName("甲厂").SetDefaultPaymentTermDays(30).SaveX(ctx)
	supplier2 := client.Supplier.Create().SetCode("SUP-SUM-2").SetName("模拟乙厂").SetDefaultPaymentTermDays(45).SaveX(ctx)
	date := func(day int) time.Time { return time.Date(2026, 9, day, 0, 0, 0, 0, time.UTC) }
	headerDate, lineDate := date(10), date(12)
	trace, content, note := "ORDER-SOURCE", "耳*2", "单独包装"
	price := decimal.NewFromInt(2)
	productLine := func(lineNo int) *biz.OutsourcingOrderItemSaveMutation {
		return &biz.OutsourcingOrderItemSaveMutation{OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
			LineNo: lineNo, SubjectType: biz.OutsourcingOrderSubjectProduct, ProductID: &product.ID, ProcessID: process.ID, UnitID: unit.ID,
			OutsourcingQuantity: decimal.NewFromInt(3), ProductOrderNoSnapshot: &trace, ProcessingItem: &content, UnitPrice: &price,
		}}
	}
	save := func(no string, supplierID int, items ...*biz.OutsourcingOrderItemSaveMutation) *biz.OutsourcingOrderWithItems {
		t.Helper()
		factory := client.Supplier.GetX(ctx, supplierID)
		result, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &biz.OutsourcingOrderMutation{OutsourcingOrderNo: no, SupplierID: supplierID, SupplierSnapshot: map[string]any{"name": factory.Name}, OrderDate: date(1), ExpectedReturnDate: &headerDate}, items)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	order := save("OUT-SUM-1", supplier.ID, productLine(1), &biz.OutsourcingOrderItemSaveMutation{OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
		LineNo: 2, SubjectType: biz.OutsourcingOrderSubjectMaterial, MaterialID: &material.ID, ProcessID: process2.ID, UnitID: unit.ID,
		OutsourcingQuantity: decimal.NewFromInt(4), ExpectedReturnDate: &lineDate, Note: &note,
	}})
	second := save("OUT-SUM-2", supplier2.ID, productLine(1))
	canceled := save("OUT-SUM-CANCELED", supplier.ID, productLine(1))
	client.OutsourcingOrder.UpdateOneID(canceled.Order.ID).SetLifecycleStatus(biz.OutsourcingOrderStatusCanceled).SaveX(ctx)
	_, err := uc.ReorderOutsourcingOrderItems(ctx, order.Order.ID, &biz.SourceDocumentItemOrderMutation{ExpectedVersion: order.Order.Version, ItemIDs: []int{order.Items[1].ID, order.Items[0].ID}})
	if err != nil {
		t.Fatal(err)
	}
	// Queries must keep source snapshots after master-data edits.
	client.Supplier.UpdateOneID(supplier.ID).SetName("改名后加工厂").SaveX(ctx)
	client.Product.UpdateOneID(product.ID).SetName("改名后产品").SaveX(ctx)

	query := func(filter biz.OutsourcingOrderSummaryFilter, count int) []*biz.OutsourcingOrderSummaryRow {
		t.Helper()
		if filter.Limit == 0 {
			filter.Limit = 20
		}
		rows, total, err := uc.ListOutsourcingOrderSummary(ctx, filter)
		if err != nil || total != count {
			t.Fatalf("filter=%+v total=%d expected=%d err=%v", filter, total, count, err)
		}
		return rows
	}
	all := query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{LifecycleScope: "all"}}, 4)
	if all[0].Order.ID != canceled.Order.ID || all[1].Order.ID != second.Order.ID || all[2].Item.ID != order.Items[1].ID || all[3].Item.ID != order.Items[0].ID {
		t.Fatalf("unstable contract/line display order: %+v", all)
	}
	for i, expected := range all {
		page := query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{LifecycleScope: "all", Limit: 1, Offset: i}}, 4)
		if len(page) != 1 || page[0].Item.ID != expected.Item.ID {
			t.Fatalf("pagination duplicated or skipped row %d", i)
		}
	}
	if rows := query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{LifecycleScope: "all", Offset: 4}}, 4); len(rows) != 0 {
		t.Fatal("offset beyond end must be empty")
	}
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{LifecycleScope: biz.LifecycleScopeCurrent}}, 3)
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{LifecycleScope: "history"}}, 1)
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{LifecycleStatus: "canceled"}}, 1)
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{SupplierID: supplier2.ID}}, 1)
	materialRows := query(biz.OutsourcingOrderSummaryFilter{ProcessID: process2.ID}, 1)
	materialRow := materialRows[0].Item
	if materialRow.SubjectType != biz.OutsourcingOrderSubjectMaterial || materialRow.ProductID != nil || materialRow.UnitPrice != nil || materialRow.Amount != nil || *materialRow.Note != note || !materialRow.ExpectedReturnDate.Equal(lineDate) {
		t.Fatalf("material or missing price/date mapping changed: %+v", materialRow)
	}
	productRow := all[3]
	if *productRow.Item.ProductNoSnapshot != "22040" || *productRow.Item.ProductNameSnapshot != "模拟玩具" || productRow.Order.SupplierSnapshot["name"] != "模拟甲厂" || !productRow.Item.Amount.Equal(decimal.NewFromInt(6)) || !productRow.Item.ExpectedReturnDate.Equal(headerDate) {
		t.Fatalf("canonical snapshots/default date missing: order=%+v item=%+v number=%q name=%q amount=%v date=%v", productRow.Order, productRow.Item, *productRow.Item.ProductNoSnapshot, *productRow.Item.ProductNameSnapshot, productRow.Item.Amount, productRow.Item.ExpectedReturnDate)
	}
	for keyword, count := range map[string]int{"22040": 3, "模拟玩具": 3, "ORDER-SOURCE": 3, "耳*2": 3, "MAT-SUM": 1, "模拟布料": 1, "激光": 1, "模拟甲厂": 3, "OUT-SUM-2": 1, "改名后": 0} {
		query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{Keyword: keyword, LifecycleScope: "all"}}, count)
	}
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{DateField: "expected_return_date", DateFrom: &headerDate, DateTo: &headerDate, LifecycleScope: "all"}}, 3)
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{DateField: "expected_return_date", DateFrom: &lineDate, DateTo: &lineDate, LifecycleScope: "all"}}, 1)
	query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{DateField: "order_date", DateFrom: &headerDate, LifecycleScope: "all"}}, 0)
	stored := client.OutsourcingOrderItem.GetX(ctx, order.Items[0].ID)
	if stored.ExpectedReturnDate != nil {
		t.Fatal("effective date projection must not write the contract default into the source line")
	}
	clearedLine := productLine(1)
	clearedLine.ID = second.Items[0].ID
	clearedLine.UnitPrice = nil
	_, err = uc.SaveOutsourcingOrderWithItems(ctx, second.Order.ID, &biz.OutsourcingOrderMutation{
		OutsourcingOrderNo: second.Order.OutsourcingOrderNo, SupplierID: supplier2.ID,
		Currency: second.Order.Currency, PaymentTermDays: second.Order.PaymentTermDays,
		OrderDate: date(1), ExpectedVersion: second.Order.Version, SupplierSnapshot: second.Order.SupplierSnapshot,
	}, []*biz.OutsourcingOrderItemSaveMutation{clearedLine})
	if err != nil {
		t.Fatal(err)
	}
	cleared := query(biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{SupplierID: supplier2.ID}}, 1)[0].Item
	if cleared.UnitPrice != nil || cleared.Amount != nil || cleared.ExpectedReturnDate != nil {
		t.Fatal("cleared price, amount and default return date must remain absent in the summary")
	}
}
