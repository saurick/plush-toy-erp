package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/stockreservation"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryPostgresSKUGrainMigrationShape(t *testing.T) {
	data, _ := openInventoryPostgresTestData(t)

	for _, table := range []string{
		"inventory_lots",
		"inventory_txns",
		"inventory_balances",
		"production_facts",
		"outsourcing_facts",
	} {
		assertPostgresColumnExists(t, data.sqldb, table, "product_sku_id")
	}
	assertPostgresPartialUniqueIndex(
		t, data.sqldb, "inventory_balances",
		"inventorybalance_subject_type_subject_id_warehouse_id_unit_id",
		"product_sku_id IS NULL AND lot_id IS NULL",
	)
	assertPostgresPartialUniqueIndex(
		t, data.sqldb, "inventory_balances",
		"inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l",
		"product_sku_id IS NULL AND lot_id IS NOT NULL",
	)
	assertPostgresPartialUniqueIndex(
		t, data.sqldb, "inventory_balances", "inventorybalance_sku_no_lot",
		"product_sku_id IS NOT NULL AND lot_id IS NULL",
	)
	assertPostgresPartialUniqueIndex(
		t, data.sqldb, "inventory_balances", "inventorybalance_sku_lot",
		"product_sku_id IS NOT NULL AND lot_id IS NOT NULL",
	)
	assertPostgresCheckConstraint(
		t, data.sqldb, "inventory_lots", "inventory_lots_sku_subject_allowed",
		"product_sku_id IS NULL OR subject_type::text = 'PRODUCT'::text",
	)
	assertPostgresCheckConstraint(
		t, data.sqldb, "inventory_txns", "inventory_txns_sku_subject_allowed",
		"product_sku_id IS NULL OR subject_type::text = 'PRODUCT'::text",
	)
	assertPostgresCheckConstraint(
		t, data.sqldb, "inventory_balances", "inventory_balances_sku_subject_allowed",
		"product_sku_id IS NULL OR subject_type::text = 'PRODUCT'::text",
	)
}

func TestInventoryPostgresSKUGrainsDoNotShareAvailability(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	skuA := createInventoryPostgresSKU(t, ctx, client, fixtures, "A")
	skuB := createInventoryPostgresSKU(t, ctx, client, fixtures, "B")

	apply := func(key string, skuID *int, txnType string, direction int, quantity int64) error {
		_, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: skuID,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			TxnType: txnType, Direction: direction, Quantity: decimal.NewFromInt(quantity),
			SourceType: "SKU_GRAIN_PG", IdempotencyKey: key + "-" + fixtures.suffix,
		})
		return err
	}
	if err := apply("legacy-in", nil, biz.InventoryTxnIn, 1, 10); err != nil {
		t.Fatalf("seed unclassified product stock: %v", err)
	}
	if err := apply("sku-a-in", &skuA.ID, biz.InventoryTxnIn, 1, 2); err != nil {
		t.Fatalf("seed SKU A stock: %v", err)
	}
	if err := apply("sku-b-in", &skuB.ID, biz.InventoryTxnIn, 1, 5); err != nil {
		t.Fatalf("seed SKU B stock: %v", err)
	}

	reservation, err := operationalUC.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo: "PG-SKU-A-RSV-" + fixtures.suffix,
		ProductID:     fixtures.productID, ProductSkuID: &skuA.ID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		Quantity: decimal.NewFromInt(2), IdempotencyKey: "pg-sku-a-rsv-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("reserve SKU A: %v", err)
	}
	if err := apply("sku-b-out", &skuB.ID, biz.InventoryTxnOut, -1, 5); err != nil {
		t.Fatalf("SKU A reservation must not reduce SKU B availability: %v", err)
	}
	if err := apply("legacy-out", nil, biz.InventoryTxnOut, -1, 10); err != nil {
		t.Fatalf("SKU A reservation must not reduce unclassified product availability: %v", err)
	}
	if err := apply("sku-a-blocked", &skuA.ID, biz.InventoryTxnOut, -1, 1); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("SKU A must not borrow SKU B or unclassified stock, got %v", err)
	}
	if _, err := operationalUC.ReleaseStockReservation(ctx, reservation.ID); err != nil {
		t.Fatalf("release SKU A reservation: %v", err)
	}
	if err := apply("sku-a-out", &skuA.ID, biz.InventoryTxnOut, -1, 2); err != nil {
		t.Fatalf("deduct released SKU A stock: %v", err)
	}

	for name, skuID := range map[string]*int{"unclassified": nil, "sku_a": &skuA.ID, "sku_b": &skuB.ID} {
		balance, err := inventoryUC.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: skuID,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		})
		if err != nil {
			t.Fatalf("get %s balance: %v", name, err)
		}
		if !balance.Quantity.IsZero() {
			t.Fatalf("%s balance=%s, want 0", name, balance.Quantity)
		}
	}
}

func TestInventoryPostgresConcurrentSKUReservationsDoNotUseUnclassifiedStock(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(data, logger)
	operationalRepo := NewOperationalFactRepo(data, logger)
	sku := createInventoryPostgresSKU(t, ctx, client, fixtures, "CONCURRENT")

	for key, item := range map[string]struct {
		sku      *int
		quantity int64
	}{
		"sku":          {sku: &sku.ID, quantity: 10},
		"unclassified": {sku: nil, quantity: 100},
	} {
		if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: item.sku,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(item.quantity),
			SourceType: "SKU_RESERVATION_PG", IdempotencyKey: "sku-rsv-" + key + "-" + fixtures.suffix,
		}); err != nil {
			t.Fatalf("seed %s stock: %v", key, err)
		}
	}

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
			_, err := operationalRepo.CreateStockReservation(ctx, &biz.StockReservationCreate{
				ReservationNo: fmt.Sprintf("PG-SKU-RSV-%s-%02d", fixtures.suffix, index),
				ProductID:     fixtures.productID, ProductSkuID: &sku.ID,
				WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
				Quantity:       decimal.NewFromInt(1),
				IdempotencyKey: fmt.Sprintf("pg-sku-rsv-%s-%02d", fixtures.suffix, index),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes, failures := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			failures++
		default:
			t.Fatalf("unexpected concurrent SKU reservation error: %v", err)
		}
	}
	if successes != 10 || failures != 10 {
		t.Fatalf("SKU reservations successes=%d failures=%d, want 10/10 despite 100 unclassified units", successes, failures)
	}
	rows, err := client.StockReservation.Query().Where(
		stockreservation.ProductID(fixtures.productID),
		stockreservation.ProductSkuID(sku.ID),
		stockreservation.WarehouseID(fixtures.warehouseID),
		stockreservation.UnitID(fixtures.unitID),
		stockreservation.Status(biz.StockReservationStatusActive),
	).All(ctx)
	if err != nil {
		t.Fatalf("list active SKU reservations: %v", err)
	}
	total := decimal.Zero
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	if !total.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("active SKU reservation total=%s, want 10", total)
	}
}

func createInventoryPostgresSKU(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	fixtures inventoryPostgresFixtures,
	label string,
) *ent.ProductSKU {
	t.Helper()
	row, err := client.ProductSKU.Create().
		SetProductID(fixtures.productID).
		SetSkuCode("PG-SKU-" + label + "-" + fixtures.suffix).
		SetDefaultUnitID(fixtures.unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create PostgreSQL SKU %s: %v", label, err)
	}
	return row
}
