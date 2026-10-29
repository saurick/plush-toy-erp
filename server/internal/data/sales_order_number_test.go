package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorder"

	"github.com/go-kratos/kratos/v2/log"
)

func TestSalesOrderNumberAllocationAndRollback(t *testing.T) {
	uc, client := openSalesOrderRepoTest(t, "sales-number")
	defer mustCloseEntClient(t, client)
	repo := NewSalesOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	verifySalesOrderNumbers(t, uc, repo, client)
}

func verifySalesOrderNumbers(t *testing.T, uc *biz.SalesOrderUsecase, repo *salesOrderRepo, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-NUMBER-"+postgresTestSuffix(), true)
	date := time.Date(2031, 2, 3, 0, 0, 0, 0, time.UTC)
	input := biz.SalesOrderMutation{CustomerID: customer.ID, OrderDate: date, Currency: biz.FinanceCurrencyCNY,
		TaxMode: new(biz.SalesOrderTaxModeNone), FreightTerms: new(biz.SalesOrderFreightTermsIncluded)}
	for _, seed := range []struct{ number, status string }{
		{"SO-20310203-001", biz.SalesOrderStatusDraft},
		{"SO-20310203-009", biz.SalesOrderStatusCanceled},
		{"SO-20310202-999", biz.SalesOrderStatusDraft},
		{"SO-20310203-MANUAL", biz.SalesOrderStatusDraft},
	} {
		client.SalesOrder.Create().SetOrderNo(seed.number).SetCustomerID(customer.ID).SetOrderDate(date).SetLifecycleStatus(seed.status).SaveX(ctx)
	}
	created, err := uc.SaveSalesOrderWithItems(ctx, 0, &input, nil)
	if err != nil || created.Order.OrderNo != "SO-20310203-010" {
		t.Fatalf("automatic number must include orders outside the current list: result=%+v err=%v", created, err)
	}
	if input.OrderNo != "" {
		t.Fatal("allocation mutated the caller's draft intent")
	}
	manual := input
	manual.OrderNo = "SO-20310203-999"
	if _, err := uc.CreateSalesOrder(ctx, &manual); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.SaveSalesOrderWithItems(ctx, 0, &manual, nil); err == nil {
		t.Fatal("explicit duplicate number must be rejected, never silently renumbered")
	}
	before := client.SalesOrder.Query().CountX(ctx)
	// Reach a failure after header insertion to prove allocation and the
	// aggregate save roll back together.
	if _, err := repo.SaveSalesOrderWithItems(ctx, 0, &input, []*biz.SalesOrderItemSaveMutation{{ID: 999999}}); !errors.Is(err, biz.ErrSalesOrderItemNotFound) {
		t.Fatalf("expected aggregate save failure, got %v", err)
	}
	if count := client.SalesOrder.Query().CountX(ctx); count != before {
		t.Fatalf("failed save left an orphan header: before=%d after=%d", before, count)
	}
	next, err := uc.CreateSalesOrder(ctx, &input)
	if err != nil || next.OrderNo != "SO-20310203-1000" {
		t.Fatalf("rolled back number or three-digit overflow: result=%+v err=%v", next, err)
	}
	edit := input
	edit.ExpectedVersion = created.Order.Version
	if _, err := uc.SaveSalesOrderWithItems(ctx, created.Order.ID, &edit, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("editing must not silently renumber a cleared number: %v", err)
	}
	edit.OrderNo = created.Order.OrderNo
	updated, err := uc.SaveSalesOrderWithItems(ctx, created.Order.ID, &edit, nil)
	if err != nil || updated.Order.OrderNo != created.Order.OrderNo || updated.Order.Version != created.Order.Version+1 {
		t.Fatalf("edit changed number or failed: result=%+v err=%v", updated, err)
	}
	input.OrderDate = date.AddDate(0, 0, 1)
	newDay, err := uc.SaveSalesOrderWithItems(ctx, 0, &input, nil)
	if err != nil || newDay.Order.OrderNo != "SO-20310204-001" {
		t.Fatalf("new order date must start its own sequence: result=%+v err=%v", newDay, err)
	}
}

func TestSalesOrderNumberPostgresConcurrentAllocation(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewSalesOrderRepo(data, log.NewStdLogger(io.Discard))
	verifySalesOrderNumbers(t, biz.NewSalesOrderUsecase(repo), repo, client)
	ctx := context.Background()
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-NUMBER-RACE-"+postgresTestSuffix(), true)
	const writers = 12
	start := make(chan struct{})
	results := make(chan *biz.SalesOrderWithItems, writers)
	errors := make(chan error, writers)
	var wg sync.WaitGroup
	for range writers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			// Independent repository instances model separate server requests.
			uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
			result, err := uc.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
				CustomerID: customer.ID, OrderDate: time.Date(2031, 3, 4, 0, 0, 0, 0, time.UTC),
				TaxMode: new(biz.SalesOrderTaxModeNone), FreightTerms: new(biz.SalesOrderFreightTermsIncluded),
			}, nil)
			results <- result
			errors <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent automatic save failed: %v", err)
		}
	}
	seen := map[string]bool{}
	for result := range results {
		if result == nil || result.Order == nil || seen[result.Order.OrderNo] {
			t.Fatalf("missing or duplicate result: %+v", result)
		}
		seen[result.Order.OrderNo] = true
	}
	for number := 1; number <= writers; number++ {
		if !seen[fmt.Sprintf("SO-20310304-%03d", number)] {
			t.Fatalf("missing committed number %d: %v", number, seen)
		}
	}
	if count := client.SalesOrder.Query().Where(salesorder.CustomerID(customer.ID)).CountX(ctx); count != writers {
		t.Fatalf("concurrent saves left missing or extra orders: %d", count)
	}
}
