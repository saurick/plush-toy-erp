package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/stockreservation"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactRepoCreateStockReservationFromSalesOrderDerivesSourceAndReplaysIntent(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_reservation_source")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	productSKU, err := client.ProductSKU.Create().
		SetProductID(fixtures.productID).
		SetSkuCode("SKU-RSV-SOURCE").
		SetSkuName("库存预留来源 SKU").
		SetDefaultUnitID(fixtures.unitID).
		SetIsActive(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create reservation source SKU failed: %v", err)
	}
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		ProductSkuID:   &productSKU.ID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_RESERVATION_SOURCE",
		IdempotencyKey: "TEST_RESERVATION_SOURCE:IN",
	}); err != nil {
		t.Fatalf("seed sourced reservation inventory failed: %v", err)
	}

	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-RSV-SOURCE", true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:    "SO-RSV-SOURCE",
		CustomerID: customer.ID,
		OrderDate:  time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create reservation source order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          1,
		ProductID:       fixtures.productID,
		ProductSkuID:    &productSKU.ID,
		UnitID:          fixtures.unitID,
		OrderedQuantity: decimal.NewFromInt(5),
	})
	if err != nil {
		t.Fatalf("create reservation source order item failed: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit reservation source order failed: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate reservation source order failed: %v", err)
	}

	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	input := &biz.StockReservationFromSalesOrderCreate{
		ReservationNo:    "RSV-SOURCE-001",
		SalesOrderID:     order.ID,
		SalesOrderItemID: item.ID,
		WarehouseID:      fixtures.warehouseID,
		Quantity:         decimal.NewFromInt(2),
		IdempotencyKey:   "reservation-source-001",
		ReservedAt:       time.Date(2026, 7, 14, 9, 30, 0, 0, time.UTC),
	}
	first, err := uc.CreateStockReservationFromSalesOrder(ctx, input)
	if err != nil {
		t.Fatalf("create sourced stock reservation failed: %v", err)
	}
	if first.SalesOrderID == nil || *first.SalesOrderID != order.ID || first.SalesOrderItemID == nil || *first.SalesOrderItemID != item.ID {
		t.Fatalf("reservation source linkage = %#v", first)
	}
	if first.ProductID != fixtures.productID || first.ProductSkuID == nil || *first.ProductSkuID != productSKU.ID || first.UnitID != fixtures.unitID {
		t.Fatalf("reservation fields were not derived from source item: %#v", first)
	}
	replayed, err := uc.CreateStockReservationFromSalesOrder(ctx, input)
	if err != nil || replayed.ID != first.ID {
		t.Fatalf("same sourced reservation intent replay=%#v first=%#v err=%v", replayed, first, err)
	}
	conflict := *input
	conflict.Quantity = decimal.NewFromInt(3)
	if _, err := uc.CreateStockReservationFromSalesOrder(ctx, &conflict); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed sourced reservation intent error=%v, want ErrIdempotencyConflict", err)
	}
	if count := client.StockReservation.Query().Where(stockreservation.IdempotencyKey(input.IdempotencyKey)).CountX(ctx); count != 1 {
		t.Fatalf("sourced reservation replay left %d rows, want 1", count)
	}
}

func TestOperationalFactRepoCreateStockReservationFromSalesOrderRejectsInvalidSourceState(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_reservation_source_state")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-RSV-SOURCE-STATE", true)
	draftOrder, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:    "SO-RSV-SOURCE-DRAFT",
		CustomerID: customer.ID,
		OrderDate:  time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft source order failed: %v", err)
	}
	draftItem, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    draftOrder.ID,
		LineNo:          1,
		ProductID:       fixtures.productID,
		UnitID:          fixtures.unitID,
		OrderedQuantity: decimal.NewFromInt(2),
	})
	if err != nil {
		t.Fatalf("create draft source item failed: %v", err)
	}
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := uc.CreateStockReservationFromSalesOrder(ctx, &biz.StockReservationFromSalesOrderCreate{
		ReservationNo:    "RSV-SOURCE-DRAFT",
		SalesOrderID:     draftOrder.ID,
		SalesOrderItemID: draftItem.ID,
		WarehouseID:      fixtures.warehouseID,
		Quantity:         decimal.NewFromInt(1),
		IdempotencyKey:   "reservation-source-draft",
	}); !errors.Is(err, biz.ErrShipmentOrderNotActive) {
		t.Fatalf("draft source order error=%v, want ErrShipmentOrderNotActive", err)
	}
	if count := client.StockReservation.Query().CountX(ctx); count != 0 {
		t.Fatalf("invalid source state created %d reservations", count)
	}
}
