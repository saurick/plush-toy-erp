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
	paymentMethod := "60天月结"
	paymentTermDays := 60
	priceConditionNote := "原始报价"
	taxMode := biz.SalesOrderTaxModeNone
	freightTerms := biz.SalesOrderFreightTermsExcluded
	quotedFreightAmount := decimal.Zero
	note := "首单"
	order, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:             "SO-001",
		CustomerID:          customer.ID,
		Currency:            biz.FinanceCurrencyUSD,
		CustomerOrderNo:     &customerOrderNo,
		CustomerSnapshot:    map[string]any{"name": customer.Name},
		PaymentMethod:       &paymentMethod,
		PaymentTermDays:     &paymentTermDays,
		PriceConditionNote:  &priceConditionNote,
		TaxMode:             &taxMode,
		FreightTerms:        &freightTerms,
		QuotedFreightAmount: &quotedFreightAmount,
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
	if order.Currency != biz.FinanceCurrencyUSD {
		t.Fatalf("expected USD create currency persisted, got %#v", order)
	}
	if order.PaymentMethod == nil || *order.PaymentMethod != paymentMethod || order.PaymentTermDays == nil || *order.PaymentTermDays != paymentTermDays || order.PriceConditionNote == nil || *order.PriceConditionNote != priceConditionNote {
		t.Fatalf("expected payment condition retained, got %#v", order)
	}

	updatedNote := "更新备注"
	updated, err := uc.UpdateSalesOrder(ctx, order.ID, &biz.SalesOrderMutation{
		OrderNo:             "SO-001-A",
		CustomerID:          customer.ID,
		Currency:            biz.FinanceCurrencyHKD,
		CustomerSnapshot:    map[string]any{"name": "updated"},
		TaxMode:             &taxMode,
		FreightTerms:        &freightTerms,
		QuotedFreightAmount: &quotedFreightAmount,
		OrderDate:           orderDate,
		Note:                &updatedNote,
	})
	if err != nil {
		t.Fatalf("update sales order failed: %v", err)
	}
	if updated.CustomerOrderNo != nil || updated.PaymentMethod != nil || updated.PaymentTermDays != nil || updated.PriceConditionNote != nil || updated.PlannedDeliveryDate != nil || updated.Note == nil || *updated.Note != updatedNote {
		t.Fatalf("expected nullable fields updated and cleared, got %#v", updated)
	}
	if updated.Currency != biz.FinanceCurrencyHKD {
		t.Fatalf("expected HKD update currency persisted, got %#v", updated)
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
		TaxMode:             &taxMode,
		FreightTerms:        &freightTerms,
		QuotedFreightAmount: &quotedFreightAmount,
		OrderDate:           nextOrderDate,
		PlannedDeliveryDate: &nextPlannedDate,
	})
	if err != nil {
		t.Fatalf("create second sales order failed: %v", err)
	}
	if nextOrder.Currency != biz.FinanceCurrencyCNY {
		t.Fatalf("expected omitted create currency to default CNY, got %#v", nextOrder)
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

	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-LIFECYCLE", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-LIFECYCLE", true)
	unitPrice := decimal.NewFromInt(1)
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: decimal.NewFromInt(1), UnitPrice: &unitPrice,
	}); err != nil {
		t.Fatalf("add submittable sales order item failed: %v", err)
	}
	submitted, err := uc.SubmitSalesOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("submit sales order failed: %v", err)
	}
	if submitted.LifecycleStatus != biz.SalesOrderStatusSubmitted {
		t.Fatalf("expected submitted order, got %#v", submitted)
	}
	replayedSubmitted, err := uc.SubmitSalesOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("repeat sales order submit failed: %v", err)
	}
	if replayedSubmitted.LifecycleStatus != biz.SalesOrderStatusSubmitted {
		t.Fatalf("repeat sales order submit must keep one submitted state, got %#v", replayedSubmitted)
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
	_, client := openSalesOrderRepoTest(t, "sales_order_repo_save_rollback")
	defer mustCloseEntClient(t, client)
	repo := NewSalesOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-TX-ROLLBACK", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-TX-ROLLBACK", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-TX-ROLLBACK", true)
	orderDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(10)

	_, err := repo.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
		OrderNo:    "SO-TX-ROLLBACK",
		CustomerID: customer.ID,
		Currency:   biz.FinanceCurrencyCNY,
		OrderDate:  orderDate,
	}, []*biz.SalesOrderItemSaveMutation{
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, ProductID: product.ID + 1000000, UnitID: unit.ID, OrderedQuantity: qty}},
	})
	if err == nil {
		t.Fatalf("expected foreign-key failure")
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

func TestSalesOrderRepoSaveWithItemsKeepsLineIdentityWhileReordering(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_display_order")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-ORDER", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-ORDER", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-ORDER", true)
	orderDate := time.Date(2026, 8, 22, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(10)
	created, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
		OrderNo:    "SO-DISPLAY-ORDER",
		CustomerID: customer.ID,
		OrderDate:  orderDate,
	}, []*biz.SalesOrderItemSaveMutation{
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 3, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
	})
	if err != nil {
		t.Fatalf("create sales order with items: %v", err)
	}
	first, second, third := created.Items[0], created.Items[1], created.Items[2]

	reordered, err := uc.ReorderSalesOrderItems(ctx, created.Order.ID, &biz.SourceDocumentItemOrderMutation{
		ExpectedVersion: created.Order.Version,
		ItemIDs:         []int{third.ID, first.ID, second.ID},
	})
	if err != nil {
		t.Fatalf("reorder sales order items: %v", err)
	}
	if len(reordered.Items) != 3 || reordered.Items[0].ID != third.ID || reordered.Items[1].ID != first.ID || reordered.Items[2].ID != second.ID {
		t.Fatalf("unexpected reordered items: %#v", reordered.Items)
	}
	if reordered.Items[0].LineNo != third.LineNo || reordered.Items[1].LineNo != first.LineNo || reordered.Items[2].LineNo != second.LineNo {
		t.Fatalf("line identity changed during reorder: %#v", reordered.Items)
	}
	for itemID, expectedOrder := range map[int]int{third.ID: 1, first.ID: 2, second.ID: 3} {
		row := client.SalesOrderItem.GetX(ctx, itemID)
		if row.DisplayOrder == nil || *row.DisplayOrder != expectedOrder {
			t.Fatalf("item %d display_order = %v, want %d", itemID, row.DisplayOrder, expectedOrder)
		}
	}
	if _, err := uc.ReorderSalesOrderItems(ctx, created.Order.ID, &biz.SourceDocumentItemOrderMutation{
		ExpectedVersion: reordered.Order.Version,
		ItemIDs:         []int{third.ID, first.ID},
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("incomplete sales order item permutation must fail: %v", err)
	}
	if current := client.SalesOrder.GetX(ctx, created.Order.ID); current.Version != reordered.Order.Version {
		t.Fatalf("failed sales reorder must roll back parent version: got %d want %d", current.Version, reordered.Order.Version)
	}

	withReplacement, err := uc.SaveSalesOrderWithItems(ctx, created.Order.ID, &biz.SalesOrderMutation{
		OrderNo:         created.Order.OrderNo,
		CustomerID:      customer.ID,
		Currency:        created.Order.Currency,
		OrderDate:       orderDate,
		ExpectedVersion: reordered.Order.Version,
	}, []*biz.SalesOrderItemSaveMutation{
		{ID: third.ID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{ID: first.ID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 3, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
	})
	if err != nil {
		t.Fatalf("replace sales order item: %v", err)
	}
	openItems, _, err := uc.ListSalesOrderItems(ctx, biz.SalesOrderItemFilter{
		SalesOrderID: created.Order.ID,
		LineStatus:   biz.SalesOrderItemStatusOpen,
		Limit:        20,
	})
	if err != nil {
		t.Fatalf("list reordered sales order items: %v", err)
	}
	if len(openItems) != 3 || openItems[0].ID != third.ID || openItems[2].ID != first.ID || openItems[1].LineNo != 4 {
		t.Fatalf("new line must use the next stable identity: %#v", openItems)
	}

	replacedID := openItems[1].ID
	_, err = uc.SaveSalesOrderWithItems(ctx, created.Order.ID, &biz.SalesOrderMutation{
		OrderNo:         created.Order.OrderNo,
		CustomerID:      customer.ID,
		Currency:        created.Order.Currency,
		OrderDate:       orderDate,
		ExpectedVersion: withReplacement.Order.Version,
	}, []*biz.SalesOrderItemSaveMutation{
		{ID: third.ID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
		{ID: first.ID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 3, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: qty}},
	})
	if err != nil {
		t.Fatalf("replace sales order item again: %v", err)
	}
	openItems, _, err = uc.ListSalesOrderItems(ctx, biz.SalesOrderItemFilter{
		SalesOrderID: created.Order.ID,
		LineStatus:   biz.SalesOrderItemStatusOpen,
		Limit:        20,
	})
	if err != nil {
		t.Fatalf("list second replacement: %v", err)
	}
	if len(openItems) != 3 || openItems[1].ID == replacedID || openItems[1].LineNo != 5 {
		t.Fatalf("canceled line number must not be reused: %#v", openItems)
	}

	current := client.SalesOrder.GetX(ctx, created.Order.ID)
	client.SalesOrder.UpdateOneID(created.Order.ID).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	activeOrder, err := uc.ReorderSalesOrderItems(ctx, created.Order.ID, &biz.SourceDocumentItemOrderMutation{
		ExpectedVersion: current.Version,
		ItemIDs:         []int{openItems[2].ID, openItems[0].ID, openItems[1].ID},
	})
	if err != nil {
		t.Fatalf("reorder active sales order items: %v", err)
	}
	if activeOrder.Order.LifecycleStatus != biz.SalesOrderStatusActive || activeOrder.Order.Version != current.Version+1 {
		t.Fatalf("active sales reorder changed lifecycle or version unexpectedly: %#v", activeOrder.Order)
	}

	repo := NewSalesOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	client.SalesOrder.UpdateOneID(created.Order.ID).
		SetLifecycleStatus(biz.SalesOrderStatusClosed).
		SaveX(ctx)
	if _, err := repo.ReorderSalesOrderItems(ctx, created.Order.ID, activeOrder.Order.Version, []int{openItems[0].ID, openItems[1].ID, openItems[2].ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("closed sales order reorder must fail: %v", err)
	}
	if current := client.SalesOrder.GetX(ctx, created.Order.ID); current.Version != activeOrder.Order.Version {
		t.Fatalf("blocked sales reorder changed parent version: got %d want %d", current.Version, activeOrder.Order.Version)
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
		OrderNo:         "SO-TX-UPDATE-A",
		CustomerID:      customer.ID,
		Currency:        biz.FinanceCurrencyUSD,
		OrderDate:       orderDate,
		ExpectedVersion: order.Order.Version,
	}, []*biz.SalesOrderItemSaveMutation{
		{ID: order.Items[0].ID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: updatedQty}},
	})
	if err != nil {
		t.Fatalf("update order with items failed: %v", err)
	}
	if result.Order.OrderNo != "SO-TX-UPDATE-A" || len(result.Items) != 2 {
		t.Fatalf("expected updated order and two historical lines, got %#v", result)
	}
	if result.Order.Version != 2 {
		t.Fatalf("expected updated order version 2, got %#v", result.Order)
	}
	if result.Items[0].LineStatus != biz.SalesOrderItemStatusOpen || !result.Items[0].OrderedQuantity.Equal(updatedQty) {
		t.Fatalf("expected first line updated and open, got %#v", result.Items[0])
	}
	if result.Items[1].LineStatus != biz.SalesOrderItemStatusCanceled {
		t.Fatalf("expected omitted open line canceled, got %#v", result.Items[1])
	}
}

func TestSalesOrderRepoSubmitRequiresCommercialClosure(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_repo_commercial_closure")
	defer mustCloseEntClient(t, client)

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SO-COMMERCIAL", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-SO-COMMERCIAL", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PRD-SO-COMMERCIAL", true)
	orderDate := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)
	unitPrice := decimal.NewFromInt(50)

	missingTerms, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-COMMERCIAL-MISSING-TERMS", CustomerID: customer.ID, OrderDate: orderDate,
	})
	if err != nil {
		t.Fatalf("create missing-terms order: %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: missingTerms.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: decimal.NewFromInt(1), UnitPrice: &unitPrice,
	}); err != nil {
		t.Fatalf("add priced missing-terms line: %v", err)
	}
	if _, err := uc.SubmitSalesOrder(ctx, missingTerms.ID); !errors.Is(err, biz.ErrSalesOrderCommercialTermsIncomplete) {
		t.Fatalf("missing commercial terms error=%v, want ErrSalesOrderCommercialTermsIncomplete", err)
	}

	zeroQuotedFreight := decimal.Zero
	missingPrice, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-COMMERCIAL-MISSING-PRICE", CustomerID: customer.ID, OrderDate: orderDate,
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &zeroQuotedFreight,
	})
	if err != nil {
		t.Fatalf("create missing-price order: %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: missingPrice.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: decimal.NewFromInt(1),
	}); err != nil {
		t.Fatalf("add missing-price line: %v", err)
	}
	if _, err := uc.SubmitSalesOrder(ctx, missingPrice.ID); !errors.Is(err, biz.ErrSalesOrderItemPriceMissing) {
		t.Fatalf("missing item price error=%v, want ErrSalesOrderItemPriceMissing", err)
	}

	missingLines, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-COMMERCIAL-MISSING-LINES", CustomerID: customer.ID, OrderDate: orderDate,
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsIncluded),
	})
	if err != nil {
		t.Fatalf("create missing-lines order: %v", err)
	}
	if _, err := uc.SubmitSalesOrder(ctx, missingLines.ID); !errors.Is(err, biz.ErrSalesOrderCommercialTermsIncomplete) {
		t.Fatalf("missing lines error=%v, want ErrSalesOrderCommercialTermsIncomplete", err)
	}

	missingQuotedFreight, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-COMMERCIAL-MISSING-QUOTED-FREIGHT", CustomerID: customer.ID, OrderDate: orderDate,
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded),
	})
	if err != nil {
		t.Fatalf("create missing-quoted-freight order: %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: missingQuotedFreight.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: decimal.NewFromInt(1), UnitPrice: &unitPrice,
	}); err != nil {
		t.Fatalf("add priced missing-quoted-freight line: %v", err)
	}
	if _, err := uc.SubmitSalesOrder(ctx, missingQuotedFreight.ID); !errors.Is(err, biz.ErrSalesOrderCommercialTermsIncomplete) {
		t.Fatalf("missing quoted freight error=%v, want ErrSalesOrderCommercialTermsIncomplete", err)
	}

	taxMode := biz.SalesOrderTaxModeExclusive
	taxRate := decimal.NewFromInt(13)
	quotedFreight := decimal.NewFromInt(10)
	complete, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-COMMERCIAL-COMPLETE", CustomerID: customer.ID, OrderDate: orderDate,
		TaxMode: &taxMode, TaxRate: &taxRate, FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &quotedFreight,
	})
	if err != nil {
		t.Fatalf("create complete order: %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: complete.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: decimal.NewFromInt(2), UnitPrice: &unitPrice,
	}); err != nil {
		t.Fatalf("add complete order line: %v", err)
	}
	complete, err = uc.SubmitSalesOrder(ctx, complete.ID)
	if err != nil {
		t.Fatalf("submit complete order: %v", err)
	}
	if complete.GoodsAmount == nil || !complete.GoodsAmount.Equal(decimal.NewFromInt(100)) ||
		complete.QuotedFreightAmount == nil || !complete.QuotedFreightAmount.Equal(decimal.NewFromInt(10)) ||
		complete.TaxAmount == nil || !complete.TaxAmount.Equal(decimal.RequireFromString("14.3")) ||
		complete.OrderTotal == nil || !complete.OrderTotal.Equal(decimal.RequireFromString("124.3")) {
		t.Fatalf("submitted commercial totals=%#v", complete)
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
