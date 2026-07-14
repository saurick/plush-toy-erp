package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSourceDocumentPostgresDraftVersionCAS(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	suffix := postgresTestSuffix()
	orderDate := time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC)

	t.Run("sales_order", func(t *testing.T) {
		unit := createTestUnit(t, ctx, client, "SO-CAS-U-"+suffix)
		product := createTestProduct(t, ctx, client, unit.ID, "SO-CAS-P-"+suffix)
		customer := createSalesOrderTestCustomer(t, ctx, client, "SO-CAS-C-"+suffix, true)
		uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
		created, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
			OrderNo:    "SO-CAS-BASE-" + suffix,
			CustomerID: customer.ID,
			OrderDate:  orderDate,
		}, []*biz.SalesOrderItemSaveMutation{{
			SalesOrderItemMutation: biz.SalesOrderItemMutation{
				LineNo:          1,
				ProductID:       product.ID,
				UnitID:          unit.ID,
				OrderedQuantity: decimal.NewFromInt(1),
			},
		}})
		if err != nil {
			t.Fatalf("create sales order: %v", err)
		}
		if created.Order.Version != 1 {
			t.Fatalf("new sales order version = %d, want 1", created.Order.Version)
		}

		start := make(chan struct{})
		results := make(chan sourceDocumentCASAttempt[*biz.SalesOrderWithItems], 2)
		for attempt, quantity := range map[string]int64{"A": 11, "B": 22} {
			attempt, quantity := attempt, quantity
			go func() {
				<-start
				row, saveErr := uc.SaveSalesOrderWithItems(ctx, created.Order.ID, &biz.SalesOrderMutation{
					OrderNo:         fmt.Sprintf("SO-CAS-%s-%s", attempt, suffix),
					CustomerID:      customer.ID,
					OrderDate:       orderDate,
					ExpectedVersion: created.Order.Version,
				}, []*biz.SalesOrderItemSaveMutation{
					{
						ID: created.Items[0].ID,
						SalesOrderItemMutation: biz.SalesOrderItemMutation{
							LineNo:          1,
							ProductID:       product.ID,
							UnitID:          unit.ID,
							OrderedQuantity: decimal.NewFromInt(quantity),
						},
					},
					{SalesOrderItemMutation: biz.SalesOrderItemMutation{
						LineNo:          2,
						ProductID:       product.ID,
						UnitID:          unit.ID,
						OrderedQuantity: decimal.NewFromInt(quantity + 100),
					}},
				})
				results <- sourceDocumentCASAttempt[*biz.SalesOrderWithItems]{label: attempt, value: row, err: saveErr}
			}()
		}
		close(start)
		first, second := <-results, <-results
		winner, loser := requireSingleSourceDocumentCASWinner(t, first, second, biz.ErrSalesOrderConflict)

		storedOrder, err := client.SalesOrder.Get(ctx, created.Order.ID)
		if err != nil {
			t.Fatalf("reload sales order: %v", err)
		}
		storedItems, err := client.SalesOrderItem.Query().
			Where(salesorderitem.SalesOrderID(created.Order.ID)).
			All(ctx)
		if err != nil {
			t.Fatalf("reload sales order items: %v", err)
		}
		winnerQuantity := map[string]int64{"A": 11, "B": 22}[winner.label]
		if storedOrder.Version != 2 || storedOrder.OrderNo != fmt.Sprintf("SO-CAS-%s-%s", winner.label, suffix) {
			t.Fatalf("sales winner header not retained: winner=%s loser=%s order=%#v", winner.label, loser.label, storedOrder)
		}
		assertSalesOrderCASItems(t, storedItems, winnerQuantity)
		if winner.value == nil || winner.value.Order == nil || winner.value.Order.Version != 2 {
			t.Fatalf("sales winner response missing version 2: %#v", winner.value)
		}
	})

	t.Run("purchase_order", func(t *testing.T) {
		unit := createTestUnit(t, ctx, client, "PO-CAS-U-"+suffix)
		material := createTestMaterial(t, ctx, client, unit.ID, "PO-CAS-M-"+suffix)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, "PO-CAS-S-"+suffix, true)
		uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, logger))
		created, err := uc.SavePurchaseOrderWithItems(ctx, 0, &biz.PurchaseOrderMutation{
			PurchaseOrderNo: "PO-CAS-BASE-" + suffix,
			SupplierID:      supplier.ID,
			PurchaseDate:    orderDate,
		}, []*biz.PurchaseOrderItemSaveMutation{{
			PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
				LineNo:            1,
				MaterialID:        material.ID,
				UnitID:            unit.ID,
				PurchasedQuantity: decimal.NewFromInt(1),
			},
		}})
		if err != nil {
			t.Fatalf("create purchase order: %v", err)
		}
		if created.Order.Version != 1 {
			t.Fatalf("new purchase order version = %d, want 1", created.Order.Version)
		}

		start := make(chan struct{})
		results := make(chan sourceDocumentCASAttempt[*biz.PurchaseOrderWithItems], 2)
		for attempt, quantity := range map[string]int64{"A": 31, "B": 42} {
			attempt, quantity := attempt, quantity
			go func() {
				<-start
				row, saveErr := uc.SavePurchaseOrderWithItems(ctx, created.Order.ID, &biz.PurchaseOrderMutation{
					PurchaseOrderNo: "PO-CAS-" + attempt + "-" + suffix,
					SupplierID:      supplier.ID,
					PurchaseDate:    orderDate,
					ExpectedVersion: created.Order.Version,
				}, []*biz.PurchaseOrderItemSaveMutation{
					{
						ID: created.Items[0].ID,
						PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
							LineNo:            1,
							MaterialID:        material.ID,
							UnitID:            unit.ID,
							PurchasedQuantity: decimal.NewFromInt(quantity),
						},
					},
					{PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
						LineNo:            2,
						MaterialID:        material.ID,
						UnitID:            unit.ID,
						PurchasedQuantity: decimal.NewFromInt(quantity + 100),
					}},
				})
				results <- sourceDocumentCASAttempt[*biz.PurchaseOrderWithItems]{label: attempt, value: row, err: saveErr}
			}()
		}
		close(start)
		first, second := <-results, <-results
		winner, loser := requireSingleSourceDocumentCASWinner(t, first, second, biz.ErrPurchaseOrderConflict)

		storedOrder, err := client.PurchaseOrder.Get(ctx, created.Order.ID)
		if err != nil {
			t.Fatalf("reload purchase order: %v", err)
		}
		storedItems, err := client.PurchaseOrderItem.Query().
			Where(purchaseorderitem.PurchaseOrderID(created.Order.ID)).
			All(ctx)
		if err != nil {
			t.Fatalf("reload purchase order items: %v", err)
		}
		winnerQuantity := map[string]int64{"A": 31, "B": 42}[winner.label]
		if storedOrder.Version != 2 || storedOrder.PurchaseOrderNo != "PO-CAS-"+winner.label+"-"+suffix {
			t.Fatalf("purchase winner header not retained: winner=%s loser=%s order=%#v", winner.label, loser.label, storedOrder)
		}
		assertPurchaseOrderCASItems(t, storedItems, winnerQuantity)
		if winner.value == nil || winner.value.Order == nil || winner.value.Order.Version != 2 {
			t.Fatalf("purchase winner response missing version 2: %#v", winner.value)
		}
	})

	t.Run("outsourcing_order", func(t *testing.T) {
		unit := createTestUnit(t, ctx, client, "OUT-CAS-U-"+suffix)
		product := createTestProduct(t, ctx, client, unit.ID, "OUT-CAS-P-"+suffix)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, "OUT-CAS-S-"+suffix, true)
		process, err := client.Process.Create().
			SetCode("OUT-CAS-PROC-" + suffix).
			SetName("车缝加工").
			SetOutsourcingEnabled(true).
			Save(ctx)
		if err != nil {
			t.Fatalf("create outsourcing process: %v", err)
		}
		uc := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(data, logger))
		created, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &biz.OutsourcingOrderMutation{
			OutsourcingOrderNo: "OUT-CAS-BASE-" + suffix,
			SupplierID:         supplier.ID,
			OrderDate:          orderDate,
		}, []*biz.OutsourcingOrderItemSaveMutation{{
			OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
				LineNo:              1,
				SubjectType:         biz.OutsourcingOrderSubjectProduct,
				ProductID:           &product.ID,
				ProcessID:           process.ID,
				UnitID:              unit.ID,
				OutsourcingQuantity: decimal.NewFromInt(1),
			},
		}})
		if err != nil {
			t.Fatalf("create outsourcing order: %v", err)
		}
		if created.Order.Version != 1 {
			t.Fatalf("new outsourcing order version = %d, want 1", created.Order.Version)
		}

		start := make(chan struct{})
		results := make(chan sourceDocumentCASAttempt[*biz.OutsourcingOrderWithItems], 2)
		for attempt, quantity := range map[string]int64{"A": 51, "B": 62} {
			attempt, quantity := attempt, quantity
			go func() {
				<-start
				row, saveErr := uc.SaveOutsourcingOrderWithItems(ctx, created.Order.ID, &biz.OutsourcingOrderMutation{
					OutsourcingOrderNo: "OUT-CAS-" + attempt + "-" + suffix,
					SupplierID:         supplier.ID,
					OrderDate:          orderDate,
					ExpectedVersion:    created.Order.Version,
				}, []*biz.OutsourcingOrderItemSaveMutation{
					{
						ID: created.Items[0].ID,
						OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
							LineNo:              1,
							SubjectType:         biz.OutsourcingOrderSubjectProduct,
							ProductID:           &product.ID,
							ProcessID:           process.ID,
							UnitID:              unit.ID,
							OutsourcingQuantity: decimal.NewFromInt(quantity),
						},
					},
					{OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
						LineNo:              2,
						SubjectType:         biz.OutsourcingOrderSubjectProduct,
						ProductID:           &product.ID,
						ProcessID:           process.ID,
						UnitID:              unit.ID,
						OutsourcingQuantity: decimal.NewFromInt(quantity + 100),
					}},
				})
				results <- sourceDocumentCASAttempt[*biz.OutsourcingOrderWithItems]{label: attempt, value: row, err: saveErr}
			}()
		}
		close(start)
		first, second := <-results, <-results
		winner, loser := requireSingleSourceDocumentCASWinner(t, first, second, biz.ErrOutsourcingOrderConflict)

		storedOrder, err := client.OutsourcingOrder.Get(ctx, created.Order.ID)
		if err != nil {
			t.Fatalf("reload outsourcing order: %v", err)
		}
		storedItems, err := client.OutsourcingOrderItem.Query().
			Where(outsourcingorderitem.OutsourcingOrderID(created.Order.ID)).
			All(ctx)
		if err != nil {
			t.Fatalf("reload outsourcing order items: %v", err)
		}
		winnerQuantity := map[string]int64{"A": 51, "B": 62}[winner.label]
		if storedOrder.Version != 2 || storedOrder.OutsourcingOrderNo != "OUT-CAS-"+winner.label+"-"+suffix {
			t.Fatalf("outsourcing winner header not retained: winner=%s loser=%s order=%#v", winner.label, loser.label, storedOrder)
		}
		assertOutsourcingOrderCASItems(t, storedItems, winnerQuantity)
		if winner.value == nil || winner.value.Order == nil || winner.value.Order.Version != 2 {
			t.Fatalf("outsourcing winner response missing version 2: %#v", winner.value)
		}
	})
}

type sourceDocumentCASAttempt[T any] struct {
	label string
	value T
	err   error
}

func requireSingleSourceDocumentCASWinner[T any](t *testing.T, first, second sourceDocumentCASAttempt[T], conflict error) (sourceDocumentCASAttempt[T], sourceDocumentCASAttempt[T]) {
	t.Helper()
	if first.err == nil && errors.Is(second.err, conflict) {
		return first, second
	}
	if second.err == nil && errors.Is(first.err, conflict) {
		return second, first
	}
	t.Fatalf("CAS must produce one winner and one version conflict: first=%v second=%v", first.err, second.err)
	return first, second
}

func assertSalesOrderCASItems(t *testing.T, items []*ent.SalesOrderItem, winnerQuantity int64) {
	t.Helper()
	if len(items) != 2 {
		t.Fatalf("sales winner must retain exactly two items, got %#v", items)
	}
	want := map[int]decimal.Decimal{1: decimal.NewFromInt(winnerQuantity), 2: decimal.NewFromInt(winnerQuantity + 100)}
	for _, item := range items {
		if item.LineStatus != biz.SalesOrderItemStatusOpen || !item.OrderedQuantity.Equal(want[item.LineNo]) {
			t.Fatalf("sales loser changed or canceled an item: %#v", items)
		}
		delete(want, item.LineNo)
	}
	if len(want) != 0 {
		t.Fatalf("sales winner items missing lines: %#v", want)
	}
}

func assertPurchaseOrderCASItems(t *testing.T, items []*ent.PurchaseOrderItem, winnerQuantity int64) {
	t.Helper()
	if len(items) != 2 {
		t.Fatalf("purchase winner must retain exactly two items, got %#v", items)
	}
	want := map[int]decimal.Decimal{1: decimal.NewFromInt(winnerQuantity), 2: decimal.NewFromInt(winnerQuantity + 100)}
	for _, item := range items {
		if item.LineStatus != biz.PurchaseOrderItemStatusOpen || !item.PurchasedQuantity.Equal(want[item.LineNo]) {
			t.Fatalf("purchase loser changed or canceled an item: %#v", items)
		}
		delete(want, item.LineNo)
	}
	if len(want) != 0 {
		t.Fatalf("purchase winner items missing lines: %#v", want)
	}
}

func assertOutsourcingOrderCASItems(t *testing.T, items []*ent.OutsourcingOrderItem, winnerQuantity int64) {
	t.Helper()
	if len(items) != 2 {
		t.Fatalf("outsourcing winner must retain exactly two items, got %#v", items)
	}
	want := map[int]decimal.Decimal{1: decimal.NewFromInt(winnerQuantity), 2: decimal.NewFromInt(winnerQuantity + 100)}
	for _, item := range items {
		if item.LineStatus != biz.OutsourcingOrderItemStatusOpen || !item.OutsourcingQuantity.Equal(want[item.LineNo]) {
			t.Fatalf("outsourcing loser changed or canceled an item: %#v", items)
		}
		delete(want, item.LineNo)
	}
	if len(want) != 0 {
		t.Fatalf("outsourcing winner items missing lines: %#v", want)
	}
}
