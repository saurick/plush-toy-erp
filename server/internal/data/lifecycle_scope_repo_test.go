package data

import (
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestLifecycleScopeRepositories(t *testing.T) {
	client := enttest.Open(t, dialect.SQLite, "file:lifecycle_scope_repositories?mode=memory&cache=shared&_fk=1")
	t.Cleanup(func() { mustCloseEntClient(t, client) })
	ctx := t.Context()
	now := time.Now().UTC()

	actor := client.AdminUser.Create().
		SetUsername("lifecycle-scope-actor").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	unit := client.Unit.Create().SetCode("LCS-PCS").SetName("件").SaveX(ctx)
	product := client.Product.Create().
		SetCode("LCS-PRODUCT").
		SetName("生命周期产品").
		SetDefaultUnitID(unit.ID).
		SaveX(ctx)
	customer := client.Customer.Create().SetCode("LCS-CUSTOMER").SetName("生命周期客户").SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("LCS-SUPPLIER").SetName("生命周期供应商").SaveX(ctx)

	client.Customer.Create().SetCode("LCS-CURRENT").SetName("当前客户").SetIsActive(true).SaveX(ctx)
	client.Customer.Create().SetCode("LCS-HISTORY").SetName("历史客户").SetIsActive(false).SaveX(ctx)

	client.SalesOrder.Create().
		SetOrderNo("LCS-SO-CURRENT").
		SetCustomerID(customer.ID).
		SetOrderDate(now).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	client.SalesOrder.Create().
		SetOrderNo("LCS-SO-HISTORY").
		SetCustomerID(customer.ID).
		SetOrderDate(now).
		SetLifecycleStatus(biz.SalesOrderStatusClosed).
		SaveX(ctx)

	client.PurchaseOrder.Create().
		SetPurchaseOrderNo("LCS-PO-CURRENT").
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetPurchaseDate(now).
		SetLifecycleStatus(biz.PurchaseOrderStatusApproved).
		SaveX(ctx)
	client.PurchaseOrder.Create().
		SetPurchaseOrderNo("LCS-PO-HISTORY").
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetPurchaseDate(now).
		SetLifecycleStatus(biz.PurchaseOrderStatusClosed).
		SaveX(ctx)

	client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("LCS-OUT-CURRENT").
		SetSupplierID(supplier.ID).
		SetOrderDate(now).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).
		SaveX(ctx)
	client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("LCS-OUT-HISTORY").
		SetSupplierID(supplier.ID).
		SetOrderDate(now).
		SetLifecycleStatus(biz.OutsourcingOrderStatusClosed).
		SaveX(ctx)

	client.ProductionOrder.Create().
		SetOrderNo("LCS-MO-CURRENT").
		SetCreatedBy(actor.ID).
		SetStatus(biz.ProductionOrderStatusReleased).
		SetReleasedBy(actor.ID).
		SetReleasedAt(now).
		SaveX(ctx)
	client.ProductionOrder.Create().
		SetOrderNo("LCS-MO-HISTORY").
		SetCreatedBy(actor.ID).
		SetStatus(biz.ProductionOrderStatusClosed).
		SetReleasedBy(actor.ID).
		SetReleasedAt(now).
		SetClosedBy(actor.ID).
		SetClosedAt(now).
		SaveX(ctx)

	client.BOMHeader.Create().
		SetProductID(product.ID).
		SetVersion("LCS-CURRENT").
		SetStatus(biz.BOMStatusActive).
		SaveX(ctx)
	client.BOMHeader.Create().
		SetProductID(product.ID).
		SetVersion("LCS-HISTORY").
		SetStatus(biz.BOMStatusArchived).
		SaveX(ctx)

	logger := log.NewStdLogger(io.Discard)
	data := &Data{postgres: client}

	masterRepo := NewMasterDataRepo(data, logger)
	currentCustomers, currentCustomerTotal, err := masterRepo.ListCustomers(ctx, biz.MasterDataFilter{Keyword: "客户", LifecycleScope: biz.LifecycleScopeCurrent, Limit: 50})
	assertLifecycleScopeRows(t, err, currentCustomerTotal, len(currentCustomers), 2, "current customers")
	historyCustomers, historyCustomerTotal, err := masterRepo.ListCustomers(ctx, biz.MasterDataFilter{Keyword: "客户", LifecycleScope: biz.LifecycleScopeHistory, Limit: 50})
	assertLifecycleScopeRows(t, err, historyCustomerTotal, len(historyCustomers), 1, "history customers")

	salesRepo := NewSalesOrderRepo(data, logger)
	salesRows, salesTotal, err := salesRepo.ListSalesOrders(ctx, biz.SalesOrderFilter{LifecycleScope: biz.LifecycleScopeHistory, Limit: 50, SortBy: "updated_at", SortDirection: "desc"})
	assertLifecycleScopeRows(t, err, salesTotal, len(salesRows), 1, "history sales orders")

	purchaseRepo := NewPurchaseOrderRepo(data, logger)
	purchaseRows, purchaseTotal, err := purchaseRepo.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{LifecycleScope: biz.LifecycleScopeHistory, Limit: 50, SortBy: "updated_at", SortDirection: "desc"})
	assertLifecycleScopeRows(t, err, purchaseTotal, len(purchaseRows), 1, "history purchase orders")

	outsourcingRepo := NewOutsourcingOrderRepo(data, logger)
	outsourcingRows, outsourcingTotal, err := outsourcingRepo.ListOutsourcingOrders(ctx, biz.OutsourcingOrderFilter{LifecycleScope: biz.LifecycleScopeHistory, Limit: 50, SortBy: "updated_at", SortDirection: "desc"})
	assertLifecycleScopeRows(t, err, outsourcingTotal, len(outsourcingRows), 1, "history outsourcing orders")

	productionRepo := NewProductionOrderRepo(data, logger)
	productionRows, productionTotal, err := productionRepo.ListProductionOrders(ctx, biz.ProductionOrderFilter{LifecycleScope: biz.LifecycleScopeHistory, Limit: 50, SortBy: "updated_at", SortDirection: "desc"})
	assertLifecycleScopeRows(t, err, productionTotal, len(productionRows), 1, "history production orders")

	inventoryRepo := NewInventoryRepo(data, logger)
	bomRows, bomTotal, err := inventoryRepo.ListBOMHeaders(ctx, biz.BOMHeaderFilter{LifecycleScope: biz.LifecycleScopeHistory, Limit: 50})
	assertLifecycleScopeRows(t, err, bomTotal, len(bomRows), 1, "history BOM versions")
}

func assertLifecycleScopeRows(t *testing.T, err error, total, rows, want int, label string) {
	t.Helper()
	if err != nil {
		t.Fatalf("list %s: %v", label, err)
	}
	if total != want || rows != want {
		t.Fatalf("%s total=%d rows=%d, want %d", label, total, rows, want)
	}
}
