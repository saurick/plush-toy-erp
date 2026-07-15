package data

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
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

type sourceDocumentListQueryCapture struct {
	mu   sync.Mutex
	logs []string
}

func (c *sourceDocumentListQueryCapture) log(args ...any) {
	c.mu.Lock()
	c.logs = append(c.logs, fmt.Sprint(args...))
	c.mu.Unlock()
}

func (c *sourceDocumentListQueryCapture) reset() {
	c.mu.Lock()
	c.logs = nil
	c.mu.Unlock()
}

func (c *sourceDocumentListQueryCapture) selectCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	count := 0
	for _, line := range c.logs {
		upper := strings.ToUpper(line)
		if strings.Contains(upper, "DRIVER.QUERY") && strings.Contains(upper, "SELECT") {
			count++
		}
	}
	return count
}

func openSourceDocumentListQueryTest(t *testing.T, name string) (*ent.Client, *sourceDocumentListQueryCapture) {
	t.Helper()
	capture := &sourceDocumentListQueryCapture{}
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+name+"?mode=memory&cache=shared&_fk=1",
		enttest.WithOptions(ent.Debug(), ent.Log(capture.log)),
	)
	return client, capture
}

func assertBoundedItemCountListQueries(t *testing.T, capture *sourceDocumentListQueryCapture, recordLabel string) {
	t.Helper()
	if got := capture.selectCount(); got != 3 {
		t.Fatalf("%s list must use one total query, one page query, and one grouped item-count query; got %d SELECTs", recordLabel, got)
	}
}

func assertSourceDocumentItemCounts(t *testing.T, got map[int]*int, want map[int]int) {
	t.Helper()
	for id, expected := range want {
		count, ok := got[id]
		if !ok || count == nil || *count != expected {
			t.Fatalf("item count for source document %d = %#v, want %d; all counts=%#v", id, count, expected, got)
		}
	}
}

func TestSalesOrderRepoListProjectsItemCountsWithOneGroupedQuery(t *testing.T) {
	ctx := context.Background()
	client, capture := openSourceDocumentListQueryTest(t, "sales_order_list_item_counts")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-COUNT", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-COUNT", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-COUNT", true)
	orderDate := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	first, err := client.SalesOrder.Create().SetOrderNo("SO-COUNT-001").SetCustomerID(customer.ID).SetOrderDate(orderDate).Save(ctx)
	if err != nil {
		t.Fatalf("create first sales order: %v", err)
	}
	second, err := client.SalesOrder.Create().SetOrderNo("SO-COUNT-002").SetCustomerID(customer.ID).SetOrderDate(orderDate).Save(ctx)
	if err != nil {
		t.Fatalf("create second sales order: %v", err)
	}
	if _, err := client.SalesOrderItem.CreateBulk(
		client.SalesOrderItem.Create().SetSalesOrderID(first.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)),
		client.SalesOrderItem.Create().SetSalesOrderID(first.ID).SetLineNo(2).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(2)).SetLineStatus(biz.SalesOrderItemStatusCanceled),
	).Save(ctx); err != nil {
		t.Fatalf("create sales order items: %v", err)
	}

	repo := NewSalesOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	capture.reset()
	orders, total, err := repo.ListSalesOrders(ctx, biz.SalesOrderFilter{Limit: 50})
	if err != nil {
		t.Fatalf("list sales orders: %v", err)
	}
	if total != 2 || len(orders) != 2 {
		t.Fatalf("sales order list total=%d rows=%d, want 2", total, len(orders))
	}
	counts := make(map[int]*int, len(orders))
	for _, order := range orders {
		counts[order.ID] = order.ItemCount
	}
	assertSourceDocumentItemCounts(t, counts, map[int]int{first.ID: 2, second.ID: 0})
	assertBoundedItemCountListQueries(t, capture, "sales order")
}

func TestPurchaseOrderRepoListProjectsItemCountsWithOneGroupedQuery(t *testing.T) {
	ctx := context.Background()
	client, capture := openSourceDocumentListQueryTest(t, "purchase_order_list_item_counts")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS-PO-COUNT")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-PO-COUNT")
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-PO-COUNT", true)
	purchaseDate := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	first, err := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-COUNT-001").SetSupplierID(supplier.ID).SetPurchaseDate(purchaseDate).Save(ctx)
	if err != nil {
		t.Fatalf("create first purchase order: %v", err)
	}
	second, err := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-COUNT-002").SetSupplierID(supplier.ID).SetPurchaseDate(purchaseDate).Save(ctx)
	if err != nil {
		t.Fatalf("create second purchase order: %v", err)
	}
	if _, err := client.PurchaseOrderItem.CreateBulk(
		client.PurchaseOrderItem.Create().SetPurchaseOrderID(first.ID).SetLineNo(1).SetMaterialID(material.ID).SetUnitID(unit.ID).SetPurchasedQuantity(decimal.NewFromInt(1)),
		client.PurchaseOrderItem.Create().SetPurchaseOrderID(first.ID).SetLineNo(2).SetMaterialID(material.ID).SetUnitID(unit.ID).SetPurchasedQuantity(decimal.NewFromInt(2)).SetLineStatus(biz.PurchaseOrderItemStatusCanceled),
	).Save(ctx); err != nil {
		t.Fatalf("create purchase order items: %v", err)
	}

	repo := NewPurchaseOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	capture.reset()
	orders, total, err := repo.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{Limit: 50})
	if err != nil {
		t.Fatalf("list purchase orders: %v", err)
	}
	if total != 2 || len(orders) != 2 {
		t.Fatalf("purchase order list total=%d rows=%d, want 2", total, len(orders))
	}
	counts := make(map[int]*int, len(orders))
	for _, order := range orders {
		counts[order.ID] = order.ItemCount
	}
	assertSourceDocumentItemCounts(t, counts, map[int]int{first.ID: 2, second.ID: 0})
	assertBoundedItemCountListQueries(t, capture, "purchase order")
}

func TestOutsourcingOrderRepoListProjectsItemCountsWithOneGroupedQuery(t *testing.T) {
	ctx := context.Background()
	client, capture := openSourceDocumentListQueryTest(t, "outsourcing_order_list_item_counts")
	defer mustCloseEntClient(t, client)

	unit, err := client.Unit.Create().SetCode("PCS-OUT-COUNT").SetName("件").Save(ctx)
	if err != nil {
		t.Fatalf("create unit: %v", err)
	}
	product, err := client.Product.Create().SetCode("PRD-OUT-COUNT").SetName("计数产品").SetDefaultUnitID(unit.ID).Save(ctx)
	if err != nil {
		t.Fatalf("create product: %v", err)
	}
	process, err := client.Process.Create().SetCode("PROC-OUT-COUNT").SetName("计数工序").SetOutsourcingEnabled(true).Save(ctx)
	if err != nil {
		t.Fatalf("create process: %v", err)
	}
	supplier, err := client.Supplier.Create().SetCode("SUP-OUT-COUNT").SetName("计数加工厂").SetSupplierType("outsourcing").Save(ctx)
	if err != nil {
		t.Fatalf("create supplier: %v", err)
	}
	orderDate := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	first, err := client.OutsourcingOrder.Create().SetOutsourcingOrderNo("OUT-COUNT-001").SetSupplierID(supplier.ID).SetOrderDate(orderDate).Save(ctx)
	if err != nil {
		t.Fatalf("create first outsourcing order: %v", err)
	}
	second, err := client.OutsourcingOrder.Create().SetOutsourcingOrderNo("OUT-COUNT-002").SetSupplierID(supplier.ID).SetOrderDate(orderDate).Save(ctx)
	if err != nil {
		t.Fatalf("create second outsourcing order: %v", err)
	}
	if _, err := client.OutsourcingOrderItem.CreateBulk(
		client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(first.ID).SetLineNo(1).SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetProductID(product.ID).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(decimal.NewFromInt(1)),
		client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(first.ID).SetLineNo(2).SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetProductID(product.ID).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(decimal.NewFromInt(2)).SetLineStatus(biz.OutsourcingOrderItemStatusCanceled),
	).Save(ctx); err != nil {
		t.Fatalf("create outsourcing order items: %v", err)
	}

	repo := NewOutsourcingOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	capture.reset()
	orders, total, err := repo.ListOutsourcingOrders(ctx, biz.OutsourcingOrderFilter{Limit: 50})
	if err != nil {
		t.Fatalf("list outsourcing orders: %v", err)
	}
	if total != 2 || len(orders) != 2 {
		t.Fatalf("outsourcing order list total=%d rows=%d, want 2", total, len(orders))
	}
	counts := make(map[int]*int, len(orders))
	for _, order := range orders {
		counts[order.ID] = order.ItemCount
	}
	assertSourceDocumentItemCounts(t, counts, map[int]int{first.ID: 2, second.ID: 0})
	assertBoundedItemCountListQueries(t, capture, "outsourcing order")
}

func TestProductionOrderRepoListProjectsItemCountsWithOneGroupedQuery(t *testing.T) {
	ctx := context.Background()
	client, capture := openSourceDocumentListQueryTest(t, "production_order_list_item_counts")
	defer mustCloseEntClient(t, client)

	actor, err := client.AdminUser.Create().
		SetUsername("production-order-count-actor").
		SetPasswordHash("test-password-hash").
		Save(ctx)
	if err != nil {
		t.Fatalf("create production order actor: %v", err)
	}
	unit := createTestUnit(t, ctx, client, "PCS-MO-COUNT")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-MO-COUNT")
	first, err := client.ProductionOrder.Create().
		SetOrderNo("MO-COUNT-001").
		SetCreatedBy(actor.ID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create first production order: %v", err)
	}
	second, err := client.ProductionOrder.Create().
		SetOrderNo("MO-COUNT-002").
		SetCreatedBy(actor.ID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create second production order: %v", err)
	}
	if _, err := client.ProductionOrderItem.CreateBulk(
		client.ProductionOrderItem.Create().SetProductionOrderID(first.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetPlannedQuantity(decimal.NewFromInt(1)),
		client.ProductionOrderItem.Create().SetProductionOrderID(first.ID).SetLineNo(2).SetProductID(product.ID).SetUnitID(unit.ID).SetPlannedQuantity(decimal.NewFromInt(2)),
	).Save(ctx); err != nil {
		t.Fatalf("create production order items: %v", err)
	}

	repo := NewProductionOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	capture.reset()
	orders, total, err := repo.ListProductionOrders(ctx, biz.ProductionOrderFilter{
		SortBy:        "updated_at",
		SortDirection: "desc",
		Limit:         50,
	})
	if err != nil {
		t.Fatalf("list production orders: %v", err)
	}
	if total != 2 || len(orders) != 2 {
		t.Fatalf("production order list total=%d rows=%d, want 2", total, len(orders))
	}
	counts := make(map[int]*int, len(orders))
	for _, order := range orders {
		counts[order.ID] = order.ItemCount
	}
	assertSourceDocumentItemCounts(t, counts, map[int]int{first.ID: 2, second.ID: 0})
	assertBoundedItemCountListQueries(t, capture, "production order")
}

func TestBOMHeaderRepoListProjectsItemCountsWithOneGroupedQuery(t *testing.T) {
	ctx := context.Background()
	client, capture := openSourceDocumentListQueryTest(t, "bom_header_list_item_counts")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS-BOM-COUNT")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-BOM-COUNT")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-BOM-COUNT")
	first, err := client.BOMHeader.Create().
		SetProductID(product.ID).
		SetVersion("COUNT-V1").
		Save(ctx)
	if err != nil {
		t.Fatalf("create first BOM header: %v", err)
	}
	second, err := client.BOMHeader.Create().
		SetProductID(product.ID).
		SetVersion("COUNT-V2").
		Save(ctx)
	if err != nil {
		t.Fatalf("create second BOM header: %v", err)
	}
	if _, err := client.BOMItem.CreateBulk(
		client.BOMItem.Create().SetBomHeaderID(first.ID).SetMaterialID(material.ID).SetUnitID(unit.ID).SetQuantity(decimal.NewFromInt(1)).SetLossRate(decimal.Zero),
		client.BOMItem.Create().SetBomHeaderID(first.ID).SetMaterialID(material.ID).SetUnitID(unit.ID).SetQuantity(decimal.NewFromInt(2)).SetLossRate(decimal.Zero),
	).Save(ctx); err != nil {
		t.Fatalf("create BOM items: %v", err)
	}

	repo := NewInventoryRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	capture.reset()
	headers, total, err := repo.ListBOMHeaders(ctx, biz.BOMHeaderFilter{ProductID: product.ID, Limit: 50})
	if err != nil {
		t.Fatalf("list BOM headers: %v", err)
	}
	if total != 2 || len(headers) != 2 {
		t.Fatalf("BOM header list total=%d rows=%d, want 2", total, len(headers))
	}
	counts := make(map[int]*int, len(headers))
	for _, header := range headers {
		counts[header.ID] = header.ItemCount
	}
	assertSourceDocumentItemCounts(t, counts, map[int]int{first.ID: 2, second.ID: 0})
	assertBoundedItemCountListQueries(t, capture, "BOM header")
}
