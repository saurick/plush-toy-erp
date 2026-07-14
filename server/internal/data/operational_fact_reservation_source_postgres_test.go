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
	"server/internal/data/model/ent/stockreservation"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactPostgresConcurrentSalesOrderStockReservationDoesNotExceedLine(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(20),
		UnitID:         fixtures.unitID,
		SourceType:     "RESERVATION_SOURCE_PG_CONCURRENT",
		IdempotencyKey: "reservation-source-pg-concurrent-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed sourced reservation inventory failed: %v", err)
	}

	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-C-RSV-SOURCE-"+fixtures.suffix, true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:    "PG-SO-RSV-SOURCE-" + fixtures.suffix,
		CustomerID: customer.ID,
		OrderDate:  time.Now(),
	})
	if err != nil {
		t.Fatalf("create sourced reservation order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          1,
		ProductID:       fixtures.productID,
		UnitID:          fixtures.unitID,
		OrderedQuantity: decimal.NewFromInt(10),
	})
	if err != nil {
		t.Fatalf("create sourced reservation order item failed: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit sourced reservation order failed: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate sourced reservation order failed: %v", err)
	}

	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	const attempts = 20
	start := make(chan struct{})
	errs := make(chan error, attempts)
	var wg sync.WaitGroup
	for index := 0; index < attempts; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := operationalUC.CreateStockReservationFromSalesOrder(ctx, &biz.StockReservationFromSalesOrderCreate{
				ReservationNo:    fmt.Sprintf("PG-RSV-SOURCE-%s-%02d", fixtures.suffix, index),
				SalesOrderID:     order.ID,
				SalesOrderItemID: item.ID,
				WarehouseID:      fixtures.warehouseID,
				Quantity:         decimal.NewFromInt(1),
				IdempotencyKey:   fmt.Sprintf("reservation-source-pg-%s-%02d", fixtures.suffix, index),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	quantityFailures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrStockReservationQuantityExceeded):
			quantityFailures++
		default:
			t.Fatalf("unexpected concurrent sourced reservation error: %v", err)
		}
	}
	if successes != 10 || quantityFailures != 10 {
		t.Fatalf("concurrent sourced reservations successes=%d quantity_failures=%d, want 10/10", successes, quantityFailures)
	}
	rows, err := client.StockReservation.Query().
		Where(
			stockreservation.SalesOrderItemID(item.ID),
			stockreservation.Status(biz.StockReservationStatusActive),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("list concurrent sourced reservations failed: %v", err)
	}
	total := decimal.Zero
	for _, row := range rows {
		if row.SalesOrderID == nil || *row.SalesOrderID != order.ID || row.ProductID != fixtures.productID || row.UnitID != fixtures.unitID {
			t.Fatalf("reservation did not retain server-derived source fields: %#v", row)
		}
		total = total.Add(row.Quantity)
	}
	if !total.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("active sourced reservation total=%s, want 10", total)
	}
}
