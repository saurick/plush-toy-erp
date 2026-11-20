package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
)

func TestSalesOrderCreateReplayAndRollback(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "sales_order_create_replay")
	verifySalesOrderCreateReplay(t, data, client)
}

func TestSalesOrderNumberPostgresCreateReplayAndConcurrency(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	verifySalesOrderCreateReplay(t, data, client)
	ctx := context.Background()
	header, items := salesOrderCreateReplayInput(t, ctx, client)
	const writers = 12
	start := make(chan struct{})
	ids := make(chan int, writers)
	errs := make(chan error, writers)
	var workers sync.WaitGroup
	for range writers {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
			result, err := uc.SaveSalesOrderWithItems(ctx, 0, &header, items)
			errs <- err
			if err == nil {
				ids <- result.Order.ID
			}
		}()
	}
	close(start)
	workers.Wait()
	close(errs)
	close(ids)
	for err := range errs {
		if err != nil {
			t.Fatalf("same-intent concurrent create failed: %v", err)
		}
	}
	winner := 0
	for id := range ids {
		if winner != 0 && id != winner {
			t.Fatalf("same intent created two orders: %d and %d", winner, id)
		}
		winner = id
	}
	if winner == 0 || client.SalesOrder.Query().Where(salesorder.CustomerID(header.CustomerID)).CountX(ctx) != 1 ||
		client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(winner)).CountX(ctx) != 1 {
		t.Fatal("concurrent create must persist one header and one line")
	}

	conflictingHeader, conflictingItems := salesOrderCreateReplayInput(t, ctx, client)
	start = make(chan struct{})
	conflicts := make(chan error, 2)
	for _, note := range []string{"first intent", "other intent"} {
		workers.Add(1)
		go func() {
			defer workers.Done()
			in := conflictingHeader
			in.Note = &note
			<-start
			uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
			_, err := uc.SaveSalesOrderWithItems(ctx, 0, &in, conflictingItems)
			conflicts <- err
		}()
	}
	close(start)
	workers.Wait()
	close(conflicts)
	succeeded, rejected := 0, 0
	for err := range conflicts {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, biz.ErrIdempotencyConflict):
			rejected++
		default:
			t.Fatalf("unexpected concurrent intent error: %v", err)
		}
	}
	if succeeded != 1 || rejected != 1 || client.SalesOrder.Query().Where(salesorder.CustomerID(conflictingHeader.CustomerID)).CountX(ctx) != 1 {
		t.Fatalf("same key with different concurrent contents: success=%d conflict=%d", succeeded, rejected)
	}
}

func salesOrderCreateReplayInput(t *testing.T, ctx context.Context, client *ent.Client) (biz.SalesOrderMutation, []*biz.SalesOrderItemSaveMutation) {
	t.Helper()
	suffix := postgresTestSuffix()
	customer := createSalesOrderTestCustomer(t, ctx, client, "CR-C-"+suffix, true)
	unit := createTestUnit(t, ctx, client, "CR-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "CR-P-"+suffix)
	header := biz.SalesOrderMutation{IdempotencyKey: "sales-create-" + suffix, ActorID: 1,
		CustomerID: customer.ID, Currency: biz.FinanceCurrencyCNY, OrderDate: time.Date(2032, 1, 5, 0, 0, 0, 0, time.UTC),
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsIncluded)}
	items := []*biz.SalesOrderItemSaveMutation{{SalesOrderItemMutation: biz.SalesOrderItemMutation{
		LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: decimal.NewFromInt(3), UnitPrice: new(decimal.NewFromInt(2)),
	}}}
	return header, items
}

func verifySalesOrderCreateReplay(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	header, items := salesOrderCreateReplayInput(t, ctx, client)
	uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	// Failure after the line was written must roll back identity, number and rows.
	injected := errors.New("injected line failure")
	fail := true
	client.SalesOrderItem.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
			value, err := next.Mutate(ctx, mutation)
			if err == nil && fail && mutation.Op().Is(ent.OpCreate) {
				return nil, injected
			}
			return value, err
		})
	})
	if _, err := uc.SaveSalesOrderWithItems(ctx, 0, &header, items); !errors.Is(err, injected) {
		t.Fatalf("rollback injection: %v", err)
	}
	if client.SalesOrder.Query().Where(salesorder.CreateIdempotencyKey(header.IdempotencyKey)).CountX(ctx) != 0 {
		t.Fatal("failed creation retained its identity")
	}
	fail = false
	created, err := uc.SaveSalesOrderWithItems(ctx, 0, &header, items)
	if err != nil {
		t.Fatal(err)
	}
	// Discard the first response and use a new repository, as after a lost response.
	uc = biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	replayed, err := uc.SaveSalesOrderWithItems(ctx, 0, &header, items)
	if err != nil || replayed.Order.ID != created.Order.ID || replayed.Order.OrderNo != created.Order.OrderNo || replayed.Items[0].ID != created.Items[0].ID || replayed.Order.Version != 1 {
		t.Fatalf("lost-response replay must recover the same aggregate: %v", err)
	}
	for _, changed := range []biz.SalesOrderMutation{
		func() biz.SalesOrderMutation { v := header; v.ActorID = 2; return v }(),
		func() biz.SalesOrderMutation { v := header; v.Note = stringPtr("different intent"); return v }(),
	} {
		if _, err := uc.SaveSalesOrderWithItems(ctx, 0, &changed, items); !errors.Is(err, biz.ErrIdempotencyConflict) {
			t.Fatalf("changed actor or payload must conflict: %v", err)
		}
	}
	changedItem := *items[0]
	changedItem.OrderedQuantity = decimal.NewFromInt(4)
	if _, err := uc.SaveSalesOrderWithItems(ctx, 0, &header, []*biz.SalesOrderItemSaveMutation{&changedItem}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed line must conflict: %v", err)
	}
	edit := header
	edit.IdempotencyKey = ""
	edit.OrderNo = created.Order.OrderNo
	edit.ExpectedVersion = created.Order.Version
	edit.Note = stringPtr("later edit")
	editItem := *items[0]
	editItem.ID = created.Items[0].ID
	if _, err := uc.SaveSalesOrderWithItems(ctx, created.Order.ID, &edit, []*biz.SalesOrderItemSaveMutation{&editItem}); err != nil {
		t.Fatalf("normal versioned edit: %v", err)
	}
	client.Customer.UpdateOneID(header.CustomerID).SetIsActive(false).SaveX(ctx)
	client.Product.UpdateOneID(items[0].ProductID).SetIsActive(false).SaveX(ctx)
	client.SalesOrder.UpdateOneID(created.Order.ID).SetLifecycleStatus(biz.SalesOrderStatusCanceled).SaveX(ctx)
	replayed, err = uc.SaveSalesOrderWithItems(ctx, 0, &header, items)
	if err != nil || replayed.Order.ID != created.Order.ID || replayed.Order.LifecycleStatus != biz.SalesOrderStatusCanceled ||
		replayed.Order.Note == nil || *replayed.Order.Note != "later edit" || replayed.Order.Version != created.Order.Version+1 {
		t.Fatalf("replay must recover the current record without revalidating creation or reopening it: %v", err)
	}
	if client.SalesOrder.Query().Where(salesorder.CustomerID(header.CustomerID)).CountX(ctx) != 1 {
		t.Fatal("replay created a second order")
	}
}
