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
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func openSalesOrderRepoTest(t *testing.T, name string) (*biz.SalesOrderUsecase, *ent.Client) {
	t.Helper()
	client := enttest.Open(t, dialect.SQLite, "file:"+name+"?mode=memory&cache=shared&_fk=1")
	repo := NewSalesOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	return biz.NewSalesOrderUsecase(repo), client
}

func TestSalesOrderRepoOrderLifecycleAndList(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_lifecycle")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-001", true)
	orderDate := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
	plannedDate := orderDate.AddDate(0, 0, 14)
	customerOrderNo := "PO-001"
	note := "首单"
	order, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:             "SO-001",
		CustomerID:          customer.ID,
		CustomerOrderNo:     &customerOrderNo,
		CustomerSnapshot:    map[string]any{"name": customer.Name},
		OrderDate:           orderDate,
		PlannedDeliveryDate: &plannedDate,
		Note:                &note,
	})
	if err != nil {
		t.Fatalf("create sales order failed: %v", err)
	}
	if order.LifecycleStatus != biz.SalesOrderStatusDraft {
		t.Fatalf("expected draft order, got %#v", order)
	}

	updatedNote := "更新备注"
	updated, err := uc.UpdateSalesOrder(ctx, order.ID, &biz.SalesOrderMutation{
		OrderNo:          "SO-001-A",
		CustomerID:       customer.ID,
		CustomerSnapshot: map[string]any{"name": "updated"},
		OrderDate:        orderDate,
		Note:             &updatedNote,
	})
	if err != nil {
		t.Fatalf("update sales order failed: %v", err)
	}
	if updated.CustomerOrderNo != nil || updated.PlannedDeliveryDate != nil || updated.Note == nil || *updated.Note != updatedNote {
		t.Fatalf("expected nullable fields updated and cleared, got %#v", updated)
	}

	list, total, err := uc.ListSalesOrders(ctx, biz.SalesOrderFilter{Keyword: "SO-001-A", Limit: 20})
	if err != nil {
		t.Fatalf("list sales orders failed: %v", err)
	}
	if total != 1 || len(list) != 1 || list[0].ID != order.ID {
		t.Fatalf("expected updated order in list, total=%d rows=%#v", total, list)
	}

	nextOrderDate := orderDate.AddDate(0, 0, 7)
	nextPlannedDate := orderDate.AddDate(0, 0, 21)
	nextOrder, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:             "SO-002",
		CustomerID:          customer.ID,
		CustomerSnapshot:    map[string]any{"name": customer.Name},
		OrderDate:           nextOrderDate,
		PlannedDeliveryDate: &nextPlannedDate,
	})
	if err != nil {
		t.Fatalf("create second sales order failed: %v", err)
	}
	datedList, datedTotal, err := uc.ListSalesOrders(ctx, biz.SalesOrderFilter{
		DateField: "order_date",
		DateFrom:  &nextOrderDate,
		DateTo:    &nextOrderDate,
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list sales orders by date range failed: %v", err)
	}
	if datedTotal != 1 || len(datedList) != 1 || datedList[0].ID != nextOrder.ID {
		t.Fatalf("expected second order in date range, total=%d rows=%#v", datedTotal, datedList)
	}
	sortedList, _, err := uc.ListSalesOrders(ctx, biz.SalesOrderFilter{
		SortBy:        "order_date",
		SortDirection: "asc",
		Limit:         20,
	})
	if err != nil {
		t.Fatalf("list sales orders sorted by order date failed: %v", err)
	}
	if len(sortedList) < 2 || sortedList[0].ID != order.ID || sortedList[1].ID != nextOrder.ID {
		t.Fatalf("expected order_date asc sort, got %#v", sortedList)
	}
	if _, _, err := uc.ListSalesOrders(ctx, biz.SalesOrderFilter{
		DateField: "order_date",
		DateFrom:  &nextOrderDate,
		DateTo:    &orderDate,
		Limit:     20,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected reversed date range rejected, got %v", err)
	}

	submitted, err := uc.SubmitSalesOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("submit sales order failed: %v", err)
	}
	if submitted.LifecycleStatus != biz.SalesOrderStatusSubmitted {
		t.Fatalf("expected submitted order, got %#v", submitted)
	}
	active, err := uc.ActivateSalesOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("activate sales order failed: %v", err)
	}
	if active.LifecycleStatus != biz.SalesOrderStatusActive {
		t.Fatalf("expected active order, got %#v", active)
	}
	closed, err := uc.CloseSalesOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("close sales order failed: %v", err)
	}
	if closed.LifecycleStatus != biz.SalesOrderStatusClosed {
		t.Fatalf("expected closed order, got %#v", closed)
	}
	if _, err := uc.UpdateSalesOrder(ctx, order.ID, &biz.SalesOrderMutation{OrderNo: "SO-001-B", CustomerID: customer.ID, OrderDate: orderDate}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected closed sales order update rejected, got %v", err)
	}
}

func TestSalesOrderRepoItemGuardsAndCancel(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_items")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-ITEM", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-001", true)
	productSKU := createSalesOrderTestProductSKU(t, ctx, client, product.ID, unit.ID, "SKU-SO-001")
	inactiveProduct := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-OFF", false)
	inactiveUnit := createSalesOrderTestUnit(t, ctx, client, "BOX-SO", false)
	orderDate := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
	order, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:    "SO-ITEM-001",
		CustomerID: customer.ID,
		OrderDate:  orderDate,
	})
	if err != nil {
		t.Fatalf("create sales order failed: %v", err)
	}

	qty := decimal.NewFromInt(10)
	price := decimal.NewFromFloat(12.5)
	amount := qty.Mul(price)
	codeSnapshot := "PRD-SO-001"
	item, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:        order.ID,
		LineNo:              1,
		ProductID:           product.ID,
		ProductSkuID:        &productSKU.ID,
		UnitID:              unit.ID,
		ProductCodeSnapshot: &codeSnapshot,
		OrderedQuantity:     qty,
		UnitPrice:           &price,
		Amount:              &amount,
	})
	if err != nil {
		t.Fatalf("add sales order item failed: %v", err)
	}
	if item.LineStatus != biz.SalesOrderItemStatusOpen || !item.OrderedQuantity.Equal(qty) {
		t.Fatalf("expected open ordered item, got %#v", item)
	}
	if item.ProductSkuID == nil || *item.ProductSkuID != productSKU.ID {
		t.Fatalf("expected product SKU traceability saved, got %#v", item)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          1,
		ProductID:       product.ID,
		UnitID:          unit.ID,
		OrderedQuantity: qty,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate order line rejected by unique constraint, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          2,
		ProductID:       inactiveProduct.ID,
		UnitID:          unit.ID,
		OrderedQuantity: qty,
	}); !errors.Is(err, biz.ErrProductInactive) {
		t.Fatalf("expected inactive product rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          2,
		ProductID:       product.ID,
		UnitID:          inactiveUnit.ID,
		OrderedQuantity: qty,
	}); !errors.Is(err, biz.ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}

	updatedQty := decimal.NewFromInt(12)
	updated, err := uc.UpdateSalesOrderItem(ctx, item.ID, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          2,
		ProductID:       product.ID,
		UnitID:          unit.ID,
		OrderedQuantity: updatedQty,
	})
	if err != nil {
		t.Fatalf("update sales order item failed: %v", err)
	}
	if updated.LineNo != 2 || !updated.OrderedQuantity.Equal(updatedQty) || updated.ProductCodeSnapshot != nil || updated.Amount != nil {
		t.Fatalf("expected item updated and optional fields cleared, got %#v", updated)
	}
	if updated.ProductSkuID != nil {
		t.Fatalf("expected product SKU traceability cleared on update without source, got %#v", updated)
	}

	removed, err := uc.RemoveSalesOrderItem(ctx, item.ID)
	if err != nil {
		t.Fatalf("remove sales order item failed: %v", err)
	}
	if removed.LineStatus != biz.SalesOrderItemStatusCanceled {
		t.Fatalf("expected canceled line after remove, got %#v", removed)
	}
	count, err := client.SalesOrderItem.Query().
		Where(salesorderitem.SalesOrderID(order.ID), salesorderitem.LineStatus(biz.SalesOrderItemStatusCanceled)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count canceled sales order items failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected one canceled line, got %d", count)
	}
}

func TestSalesOrderRepoSaveWithItemsRollsBackOnItemFailure(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_save_rollback")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-TX-ROLLBACK", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-TX-ROLLBACK", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-TX-ROLLBACK", true)
	orderDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(10)

	_, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
		OrderNo:    "SO-TX-ROLLBACK",
		CustomerID: customer.ID,
		OrderDate:  orderDate,
	}, []*biz.SalesOrderItemSaveMutation{
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
	})
	if err == nil {
		t.Fatalf("expected duplicate line failure")
	}
	count, countErr := client.SalesOrder.Query().
		Where(salesorder.OrderNo("SO-TX-ROLLBACK")).
		Count(ctx)
	if countErr != nil {
		t.Fatalf("count sales order after rollback failed: %v", countErr)
	}
	if count != 0 {
		t.Fatalf("expected transaction rollback to remove order header, got count=%d", count)
	}
}

func TestSalesOrderRepoSaveWithItemsUpdatesAndCancelsMissingOpenLines(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_save_update")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-TX-UPDATE", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-TX-UPDATE", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-TX-UPDATE", true)
	orderDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(10)
	order, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
		OrderNo:    "SO-TX-UPDATE",
		CustomerID: customer.ID,
		OrderDate:  orderDate,
	}, []*biz.SalesOrderItemSaveMutation{
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
	})
	if err != nil {
		t.Fatalf("create order with items failed: %v", err)
	}
	if len(order.Items) != 2 {
		t.Fatalf("expected two initial items, got %#v", order.Items)
	}

	updatedQty := decimal.NewFromInt(12)
	result, err := uc.SaveSalesOrderWithItems(ctx, order.Order.ID, &biz.SalesOrderMutation{
		OrderNo:    "SO-TX-UPDATE-A",
		CustomerID: customer.ID,
		OrderDate:  orderDate,
	}, []*biz.SalesOrderItemSaveMutation{
		{ID: order.Items[0].ID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: updatedQty}},
	})
	if err != nil {
		t.Fatalf("update order with items failed: %v", err)
	}
	if result.Order.OrderNo != "SO-TX-UPDATE-A" || len(result.Items) != 2 {
		t.Fatalf("expected updated order and two historical lines, got %#v", result)
	}
	if result.Items[0].LineStatus != biz.SalesOrderItemStatusOpen || !result.Items[0].OrderedQuantity.Equal(updatedQty) {
		t.Fatalf("expected first line updated and open, got %#v", result.Items[0])
	}
	if result.Items[1].LineStatus != biz.SalesOrderItemStatusCanceled {
		t.Fatalf("expected omitted open line canceled, got %#v", result.Items[1])
	}
}

func TestSalesOrderRepoCustomerGuard(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_customer_guard")
	defer mustCloseEntClient(t, client)

	inactiveCustomer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-OFF", false)
	orderDate := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
	if _, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{OrderNo: "SO-MISSING-CUSTOMER", CustomerID: 999999, OrderDate: orderDate}); !errors.Is(err, biz.ErrCustomerNotFound) {
		t.Fatalf("expected missing customer rejected, got %v", err)
	}
	if _, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{OrderNo: "SO-INACTIVE-CUSTOMER", CustomerID: inactiveCustomer.ID, OrderDate: orderDate}); !errors.Is(err, biz.ErrCustomerInactive) {
		t.Fatalf("expected inactive customer rejected, got %v", err)
	}
}

func createSalesOrderTestCustomer(t *testing.T, ctx context.Context, client *ent.Client, code string, active bool) *ent.Customer {
	t.Helper()
	row, err := client.Customer.Create().
		SetCode(code).
		SetName(code + " 客户").
		SetIsActive(active).
		Save(ctx)
	if err != nil {
		t.Fatalf("create test customer failed: %v", err)
	}
	return row
}

func createSalesOrderTestUnit(t *testing.T, ctx context.Context, client *ent.Client, code string, active bool) *ent.Unit {
	t.Helper()
	row, err := client.Unit.Create().
		SetCode(code).
		SetName(code + " 单位").
		SetIsActive(active).
		Save(ctx)
	if err != nil {
		t.Fatalf("create test unit failed: %v", err)
	}
	return row
}

func createSalesOrderTestProduct(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string, active bool) *ent.Product {
	t.Helper()
	row, err := client.Product.Create().
		SetCode(code).
		SetName(code + " 成品").
		SetDefaultUnitID(unitID).
		SetIsActive(active).
		Save(ctx)
	if err != nil {
		t.Fatalf("create test product failed: %v", err)
	}
	return row
}

func createSalesOrderTestProductSKU(t *testing.T, ctx context.Context, client *ent.Client, productID int, unitID int, code string) *ent.ProductSKU {
	t.Helper()
	row, err := client.ProductSKU.Create().
		SetProductID(productID).
		SetSkuCode(code).
		SetSkuName(code).
		SetDefaultUnitID(unitID).
		SetIsActive(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product SKU failed: %v", err)
	}
	return row
}
