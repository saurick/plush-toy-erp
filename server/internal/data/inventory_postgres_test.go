package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/stockreservation"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)

	for _, table := range []string{
		"units",
		"materials",
		"products",
		"warehouses",
		"inventory_txns",
		"inventory_balances",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}

	assertPostgresNumericColumn(t, data.sqldb, "inventory_txns", "quantity", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "inventory_balances", "quantity", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "inventory_txns", "inventorytxn_idempotency_key")
	assertPostgresUniqueIndex(t, data.sqldb, "inventory_txns", "inventorytxn_reversal_of_txn_id")
	assertPostgresUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id")
	for table, column := range map[string]string{
		"inventory_txns":     "occurred_at_specified",
		"production_facts":   "occurred_at_specified",
		"outsourcing_facts":  "occurred_at_specified",
		"finance_facts":      "occurred_at_specified",
		"stock_reservations": "reserved_at_specified",
	} {
		assertPostgresColumnExists(t, data.sqldb, table, column)
	}

	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "PGU"+suffix)
	if _, err := client.Unit.Create().SetCode(unit.Code).SetName("重复单位").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres unit code unique constraint, got %v", err)
	}
}

func TestOperationalFactPostgresShipmentNetWeightFreeze(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	unitNetWeightG := decimal.RequireFromString("0.425000")
	if _, err := client.Product.UpdateOneID(fixtures.productID).SetUnitNetWeightG(unitNetWeightG).Save(ctx); err != nil {
		t.Fatalf("set postgres product unit net weight: %v", err)
	}
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "PG_SHIPMENT_WEIGHT",
		IdempotencyKey: "pg-shipment-weight-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres shipment inventory: %v", err)
	}

	shipmentNo := "PG-SHP-WEIGHT-" + fixtures.suffix
	requestedTotal := decimal.RequireFromString("9.900000")
	shipmentInput := &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: shipmentNo, IdempotencyKey: shipmentNo, TotalNetWeightG: &requestedTotal},
		Items:    []*biz.ShipmentItemCreate{{ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(2)}},
	}
	created, err := repo.CreateShipmentDraftWithItems(ctx, shipmentInput)
	if err != nil {
		t.Fatalf("create postgres weighted shipment: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, created.ID)
	shipped, err := repo.ShipShipment(ctx, created.ID)
	if err != nil {
		t.Fatalf("ship postgres weighted shipment: %v", err)
	}
	if shipped.TotalNetWeightG == nil || !shipped.TotalNetWeightG.Equal(decimal.RequireFromString("0.850000")) || len(shipped.Items) != 1 || shipped.Items[0].UnitNetWeightGSnapshot == nil || !shipped.Items[0].UnitNetWeightGSnapshot.Equal(unitNetWeightG) {
		t.Fatalf("postgres frozen shipment weights = %#v", shipped)
	}
	replayed, err := repo.CreateShipmentDraftWithItems(ctx, shipmentInput)
	if err != nil || replayed.ID != created.ID || replayed.Status != biz.ShipmentStatusShipped {
		t.Fatalf("postgres same create intent after ship replay = %#v err=%v", replayed, err)
	}
	changedRequestedTotal := decimal.RequireFromString("8.800000")
	changedShipment := *shipmentInput.Shipment
	changedShipment.TotalNetWeightG = &changedRequestedTotal
	changedInput := &biz.ShipmentCreateWithItems{Shipment: &changedShipment, Items: shipmentInput.Items}
	if _, err := repo.CreateShipmentDraftWithItems(ctx, changedInput); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("postgres changed create intent after ship error = %v, want ErrIdempotencyConflict", err)
	}

	changedWeight := decimal.RequireFromString("0.900000")
	if _, err := client.Product.UpdateOneID(fixtures.productID).SetUnitNetWeightG(changedWeight).Save(ctx); err != nil {
		t.Fatalf("change postgres product unit net weight: %v", err)
	}
	repeated, err := repo.ShipShipment(ctx, created.ID)
	if err != nil {
		t.Fatalf("repeat postgres shipment: %v", err)
	}
	if repeated.TotalNetWeightG == nil || !repeated.TotalNetWeightG.Equal(decimal.RequireFromString("0.850000")) || repeated.Items[0].UnitNetWeightGSnapshot == nil || !repeated.Items[0].UnitNetWeightGSnapshot.Equal(unitNetWeightG) {
		t.Fatalf("postgres repeat shipment recalculated weight: %#v", repeated)
	}
	cancelled, err := repo.CancelShippedShipment(ctx, created.ID)
	if err != nil {
		t.Fatalf("cancel postgres shipment: %v", err)
	}
	if cancelled.TotalNetWeightG == nil || !cancelled.TotalNetWeightG.Equal(decimal.RequireFromString("0.850000")) || cancelled.Items[0].UnitNetWeightGSnapshot == nil || !cancelled.Items[0].UnitNetWeightGSnapshot.Equal(unitNetWeightG) {
		t.Fatalf("postgres cancellation changed frozen weight: %#v", cancelled)
	}
	replayed, err = repo.CreateShipmentDraftWithItems(ctx, shipmentInput)
	if err != nil || replayed.ID != created.ID || replayed.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("postgres same create intent after cancellation replay = %#v err=%v", replayed, err)
	}
	if _, err := repo.CreateShipmentDraftWithItems(ctx, changedInput); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("postgres changed create intent after cancellation error = %v, want ErrIdempotencyConflict", err)
	}

	if _, err := client.Product.UpdateOneID(fixtures.productID).ClearUnitNetWeightG().Save(ctx); err != nil {
		t.Fatalf("clear postgres product unit net weight: %v", err)
	}
	manualTotal := decimal.RequireFromString("7.700000")
	incompleteNo := "PG-SHP-WEIGHT-MANUAL-" + fixtures.suffix
	incomplete, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: incompleteNo, IdempotencyKey: incompleteNo, TotalNetWeightG: &manualTotal},
		Items:    []*biz.ShipmentItemCreate{{ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(1)}},
	})
	if err != nil {
		t.Fatalf("create postgres manual-weight shipment: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, incomplete.ID)
	incomplete, err = repo.ShipShipment(ctx, incomplete.ID)
	if err != nil {
		t.Fatalf("ship postgres manual-weight shipment: %v", err)
	}
	if incomplete.TotalNetWeightG == nil || !incomplete.TotalNetWeightG.Equal(manualTotal) || len(incomplete.Items) != 1 || incomplete.Items[0].UnitNetWeightGSnapshot != nil {
		t.Fatalf("postgres incomplete shipment did not preserve manual total: %#v", incomplete)
	}

	rejectedProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PG-PRD-WEIGHT-ROLLBACK-"+fixtures.suffix)
	rejectedWeight := decimal.RequireFromString("0.500000")
	if _, err := client.Product.UpdateOneID(rejectedProduct.ID).SetUnitNetWeightG(rejectedWeight).Save(ctx); err != nil {
		t.Fatalf("set postgres rollback product unit net weight: %v", err)
	}
	rejectedManualTotal := decimal.RequireFromString("6.600000")
	rejectedNo := "PG-SHP-WEIGHT-ROLLBACK-" + fixtures.suffix
	rejected, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: rejectedNo, IdempotencyKey: rejectedNo, TotalNetWeightG: &rejectedManualTotal},
		Items:    []*biz.ShipmentItemCreate{{ProductID: rejectedProduct.ID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(1)}},
	})
	if err != nil {
		t.Fatalf("create postgres rollback shipment: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, rejected.ID)
	if _, err := repo.ShipShipment(ctx, rejected.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("ship postgres rollback shipment error = %v, want ErrInventoryInsufficientStock", err)
	}
	rejected, err = repo.GetShipment(ctx, rejected.ID)
	if err != nil {
		t.Fatalf("reload postgres rollback shipment: %v", err)
	}
	if rejected.Status != biz.ShipmentStatusDraft || rejected.TotalNetWeightG == nil || !rejected.TotalNetWeightG.Equal(rejectedManualTotal) || len(rejected.Items) != 1 || rejected.Items[0].UnitNetWeightGSnapshot != nil {
		t.Fatalf("postgres failed shipment leaked weight writes: %#v", rejected)
	}
}

func TestInventoryPostgresFactTimeIdempotency(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	explicit := time.Date(2026, 7, 10, 10, 11, 12, 345678901, time.FixedZone("UTC+8", 8*60*60))
	wantExplicit := explicit.UTC().Truncate(time.Microsecond)

	inventoryKey := "pg-time-inventory-" + fixtures.suffix
	createInventory := func(at time.Time) (*biz.InventoryTxnApplyResult, error) {
		return inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
			WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1,
			Quantity: decimal.NewFromInt(20), UnitID: fixtures.unitID,
			SourceType: "PG_TIME_TEST", IdempotencyKey: inventoryKey, OccurredAt: at,
		})
	}
	inventoryResult, err := createInventory(explicit)
	if err != nil {
		t.Fatalf("create explicit-time inventory txn: %v", err)
	}
	if replay, err := createInventory(explicit); err != nil || !replay.IdempotentReplay || replay.Txn.ID != inventoryResult.Txn.ID {
		t.Fatalf("explicit same-time inventory replay = %#v, err=%v", replay, err)
	}
	inventoryRow := client.InventoryTxn.GetX(ctx, inventoryResult.Txn.ID)
	if !inventoryRow.OccurredAtSpecified || !inventoryRow.OccurredAt.Equal(wantExplicit) {
		t.Fatalf("inventory marker=%v time=%v, want true/%v", inventoryRow.OccurredAtSpecified, inventoryRow.OccurredAt, wantExplicit)
	}
	if _, err := createInventory(explicit.Add(time.Second)); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed inventory occurred_at error = %v, want ErrIdempotencyConflict", err)
	}
	if _, err := createInventory(time.Time{}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("explicit then omitted inventory occurred_at error = %v, want ErrIdempotencyConflict", err)
	}

	type factTimeCase struct {
		name   string
		create func(key string, at time.Time) (int, error)
		load   func(id int) (bool, time.Time, error)
	}
	cases := []factTimeCase{
		{
			name: "production",
			create: func(key string, at time.Time) (int, error) {
				row, err := operationalUC.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
					FactNo: key, FactType: biz.ProductionFactFinishedGoodsReceipt,
					SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
					WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
					Quantity: decimal.NewFromInt(1), IdempotencyKey: key, OccurredAt: at,
				})
				if err != nil {
					return 0, err
				}
				return row.ID, nil
			},
			load: func(id int) (bool, time.Time, error) {
				row, err := client.ProductionFact.Get(ctx, id)
				if err != nil {
					return false, time.Time{}, err
				}
				return row.OccurredAtSpecified, row.OccurredAt, nil
			},
		},
		{
			name: "outsourcing",
			create: func(key string, at time.Time) (int, error) {
				row, err := operationalUC.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
					FactNo: key, FactType: biz.OutsourcingFactReturnReceipt,
					SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID,
					WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
					Quantity: decimal.NewFromInt(1), IdempotencyKey: key, OccurredAt: at,
				})
				if err != nil {
					return 0, err
				}
				return row.ID, nil
			},
			load: func(id int) (bool, time.Time, error) {
				row, err := client.OutsourcingFact.Get(ctx, id)
				if err != nil {
					return false, time.Time{}, err
				}
				return row.OccurredAtSpecified, row.OccurredAt, nil
			},
		},
		{
			name: "finance",
			create: func(key string, at time.Time) (int, error) {
				row, err := operationalUC.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
					FactNo: key, FactType: biz.FinanceFactPayable,
					CounterpartyType: biz.FinanceCounterpartyOther,
					Amount:           decimal.NewFromInt(1), IdempotencyKey: key, OccurredAt: at,
				})
				if err != nil {
					return 0, err
				}
				return row.ID, nil
			},
			load: func(id int) (bool, time.Time, error) {
				row, err := client.FinanceFact.Get(ctx, id)
				if err != nil {
					return false, time.Time{}, err
				}
				return row.OccurredAtSpecified, row.OccurredAt, nil
			},
		},
		{
			name: "stock_reservation",
			create: func(key string, at time.Time) (int, error) {
				row, err := operationalUC.CreateStockReservation(ctx, &biz.StockReservationCreate{
					ReservationNo: key, ProductID: fixtures.productID,
					WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
					Quantity: decimal.NewFromInt(1), IdempotencyKey: key, ReservedAt: at,
				})
				if err != nil {
					return 0, err
				}
				return row.ID, nil
			},
			load: func(id int) (bool, time.Time, error) {
				row, err := client.StockReservation.Get(ctx, id)
				if err != nil {
					return false, time.Time{}, err
				}
				return row.ReservedAtSpecified, row.ReservedAt, nil
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			key := "PG-TIME-" + tc.name + "-" + fixtures.suffix
			id, err := tc.create(key, explicit)
			if err != nil {
				t.Fatalf("create explicit-time fact: %v", err)
			}
			if replayID, err := tc.create(key, explicit); err != nil || replayID != id {
				t.Fatalf("explicit same-time replay id=%d, want %d, err=%v", replayID, id, err)
			}
			specified, persistedAt, err := tc.load(id)
			if err != nil {
				t.Fatalf("load explicit-time fact: %v", err)
			}
			if !specified || !persistedAt.Equal(wantExplicit) {
				t.Fatalf("persisted marker=%v time=%v, want true/%v", specified, persistedAt, wantExplicit)
			}
			if _, err := tc.create(key, explicit.Add(time.Second)); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("changed explicit time error = %v, want ErrIdempotencyConflict", err)
			}
			if _, err := tc.create(key, time.Time{}); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("explicit then omitted time error = %v, want ErrIdempotencyConflict", err)
			}
		})
	}
}

func TestInventoryPostgresFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)

	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	decimalIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1.234567"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-decimal-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres decimal inbound failed: %v", err)
	}
	assertDecimalEqual(t, decimalIn.Balance.Quantity, "1.234567")

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1.234567"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-decimal-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres idempotency replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected postgres replay to be idempotent")
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "1.234567")

	productIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "4"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-product-in-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres product inbound failed: %v", err)
	}
	assertDecimalEqual(t, productIn.Balance.Quantity, "4")

	materialIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "8.765433"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-mat-in-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres material inbound failed: %v", err)
	}
	assertDecimalEqual(t, materialIn.Balance.Quantity, "10")

	materialOut, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-mat-out-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres material outbound failed: %v", err)
	}
	assertDecimalEqual(t, materialOut.Balance.Quantity, "7")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "8"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-overdraw-" + fixtures.suffix,
	})
	if !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres insufficient stock, got %v", err)
	}

	reversalOf := materialOut.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "inventory_pg",
		IdempotencyKey:  "inventory-pg-reversal-" + fixtures.suffix,
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("postgres reversal failed: %v", err)
	}
	assertDecimalEqual(t, reversed.Balance.Quantity, "10")

	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "inventory_pg",
		IdempotencyKey:  "inventory-pg-reversal-duplicate-" + fixtures.suffix,
		ReversalOfTxnID: &reversalOf,
	})
	if !errors.Is(err, biz.ErrInventoryTxnAlreadyReversed) {
		t.Fatalf("expected postgres duplicate reversal to be rejected, got %v", err)
	}

	productOnlyID := createPostgresProductIDWithoutMaterial(t, ctx, client, fixtures.unitID, fixtures.suffix)
	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      productOnlyID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-invalid-material-" + fixtures.suffix,
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres MATERIAL with product id to be rejected, got %v", err)
	}

	materialOnlyID := createPostgresMaterialIDWithoutProduct(t, ctx, client, fixtures.unitID, fixtures.suffix)
	_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      materialOnlyID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg",
		IdempotencyKey: "inventory-pg-invalid-product-" + fixtures.suffix,
	})
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres PRODUCT with material id to be rejected, got %v", err)
	}

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres inventory balance unique constraint, got %v", err)
	}

	if _, err := client.InventoryTxn.Update().Where(inventorytxn.ID(materialIn.Txn.ID)).Save(ctx); err == nil {
		t.Fatalf("expected postgres inventory txn update to be rejected")
	}
	if err := client.InventoryTxn.DeleteOneID(materialIn.Txn.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres inventory txn delete to be rejected")
	}
}

func TestOperationalFactPostgresOutsourcingMaterialIssueWithoutLotPostAndCancel(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	source := createOutsourcingFactSourceFixture(
		t,
		ctx,
		client,
		inventoryTestFixtures{
			unitID: fixtures.unitID, materialID: fixtures.materialID,
			productID: fixtures.productID, warehouseID: fixtures.warehouseID,
		},
		"PG-MATERIAL-"+fixtures.suffix,
		decimal.NewFromInt(5),
	)

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "operational_fact_pg_outsourcing_seed",
		IdempotencyKey: "operational-fact-pg-outsourcing-seed-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres material inventory failed: %v", err)
	}
	fact, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "PG-OF-" + fixtures.suffix,
		OutsourcingOrderID:     source.order.ID,
		OutsourcingOrderItemID: source.materialLine.ID,
		WarehouseID:            fixtures.warehouseID,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "operational-fact-pg-outsourcing-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create postgres outsourcing fact failed: %v", err)
	}
	posted, err := repo.PostOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post postgres outsourcing fact failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	cancelled, err := repo.CancelPostedOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel postgres outsourcing fact failed: %v", err)
	}
	if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
}

func TestInventoryPostgresConcurrentOutbound(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)

	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_pg_concurrent",
		IdempotencyKey: "inventory-pg-concurrent-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("postgres concurrent inbound failed: %v", err)
	}

	const attempts = 20
	start := make(chan struct{})
	errs := make(chan error, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType:    biz.InventorySubjectMaterial,
				SubjectID:      fixtures.materialID,
				WarehouseID:    fixtures.warehouseID,
				TxnType:        biz.InventoryTxnOut,
				Direction:      -1,
				Quantity:       decimal.NewFromInt(1),
				UnitID:         fixtures.unitID,
				SourceType:     "inventory_pg_concurrent",
				IdempotencyKey: fmt.Sprintf("inventory-pg-concurrent-out-%s-%02d", fixtures.suffix, i),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	failures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			failures++
		default:
			t.Fatalf("unexpected postgres concurrent outbound error: %v", err)
		}
	}
	if successes > 10 {
		t.Fatalf("postgres concurrent outbound successes must be <= 10, got %d", successes)
	}
	if failures < 10 {
		t.Fatalf("postgres concurrent outbound failures must be >= 10, got %d", failures)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres balance after concurrent outbound failed: %v", err)
	}
	if balance.Quantity.Cmp(decimal.Zero) < 0 {
		t.Fatalf("postgres concurrent outbound produced negative balance: %s", balance.Quantity)
	}
	assertDecimalEqual(t, balance.Quantity, fmt.Sprintf("%d", 10-successes))

	txnCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SubjectType(biz.InventorySubjectMaterial),
			inventorytxn.SubjectID(fixtures.materialID),
			inventorytxn.WarehouseID(fixtures.warehouseID),
			inventorytxn.UnitID(fixtures.unitID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
			inventorytxn.SourceType("INVENTORY_PG_CONCURRENT"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres concurrent outbound txns failed: %v", err)
	}
	if txnCount != successes {
		t.Fatalf("postgres outbound txn count=%d, successes=%d", txnCount, successes)
	}
}

func TestOperationalFactPostgresConcurrentStockReservationDoesNotOversubscribe(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(10),
		UnitID:         fixtures.unitID,
		SourceType:     "RESERVATION_PG_CONCURRENT",
		IdempotencyKey: "reservation-pg-concurrent-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres product inventory failed: %v", err)
	}

	const attempts = 20
	start := make(chan struct{})
	errs := make(chan error, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := operationalRepo.CreateStockReservation(ctx, &biz.StockReservationCreate{
				ReservationNo:  fmt.Sprintf("PG-RSV-%s-%02d", fixtures.suffix, i),
				ProductID:      fixtures.productID,
				WarehouseID:    fixtures.warehouseID,
				UnitID:         fixtures.unitID,
				Quantity:       decimal.NewFromInt(1),
				IdempotencyKey: fmt.Sprintf("reservation-pg-concurrent-%s-%02d", fixtures.suffix, i),
			})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	failures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock):
			failures++
		default:
			t.Fatalf("unexpected concurrent reservation error: %v", err)
		}
	}
	if successes != 10 || failures != 10 {
		t.Fatalf("concurrent reservations successes=%d failures=%d, want 10/10", successes, failures)
	}
	rows, err := client.StockReservation.Query().
		Where(
			stockreservation.ProductID(fixtures.productID),
			stockreservation.WarehouseID(fixtures.warehouseID),
			stockreservation.UnitID(fixtures.unitID),
			stockreservation.Status(biz.StockReservationStatusActive),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("list concurrent reservations failed: %v", err)
	}
	total := decimal.Zero
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	if !total.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("active reservation total=%s, want 10", total)
	}
}

func TestOperationalFactPostgresConcurrentShipmentsDoNotExceedSalesOrderLine(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(3), UnitID: fixtures.unitID,
		SourceType: "SHIPMENT_PG_CONCURRENT", IdempotencyKey: "shipment-pg-concurrent-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres shipment inventory failed: %v", err)
	}
	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-C-SHIP-"+fixtures.suffix, true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "PG-SO-SHIP-" + fixtures.suffix, CustomerID: customer.ID, OrderDate: time.Now(),
	})
	if err != nil {
		t.Fatalf("create postgres sales order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: fixtures.productID, UnitID: fixtures.unitID, OrderedQuantity: decimal.NewFromInt(3),
	})
	if err != nil {
		t.Fatalf("create postgres sales order item failed: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit postgres sales order failed: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate postgres sales order failed: %v", err)
	}
	shipmentIDs := make([]int, 0, 2)
	for index := 0; index < 2; index++ {
		no := fmt.Sprintf("PG-SHP-%s-%d", fixtures.suffix, index)
		created, err := operationalRepo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{ShipmentNo: no, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: no},
			Items:    []*biz.ShipmentItemCreate{{SalesOrderItemID: &item.ID, ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(2)}},
		})
		if err != nil {
			t.Fatalf("create postgres shipment %d failed: %v", index, err)
		}
		submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, created.ID)
		shipmentIDs = append(shipmentIDs, created.ID)
	}
	draftCandidates, draftTotal, err := operationalRepo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
		SalesOrderID: order.ID,
		Limit:        50,
	})
	if err != nil || draftTotal != 1 || len(draftCandidates) != 1 {
		t.Fatalf("list postgres shipment candidates before ship total=%d rows=%#v err=%v", draftTotal, draftCandidates, err)
	}
	if !draftCandidates[0].ShippedQuantity.IsZero() || !draftCandidates[0].RemainingQuantity.Equal(decimal.NewFromInt(3)) || !draftCandidates[0].Selectable {
		t.Fatalf("draft shipments must not consume source candidate quantity: %#v", draftCandidates[0])
	}

	start := make(chan struct{})
	errs := make(chan error, len(shipmentIDs))
	var wg sync.WaitGroup
	for _, shipmentID := range shipmentIDs {
		shipmentID := shipmentID
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := operationalRepo.ShipShipment(ctx, shipmentID)
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	successes, quantityFailures := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrShipmentQuantityExceeded):
			quantityFailures++
		default:
			t.Fatalf("unexpected concurrent shipment error: %v", err)
		}
	}
	if successes != 1 || quantityFailures != 1 {
		t.Fatalf("concurrent shipments successes=%d quantity_failures=%d, want 1/1", successes, quantityFailures)
	}
	if shippedCount := client.Shipment.Query().Where(shipment.IDIn(shipmentIDs...), shipment.Status(biz.ShipmentStatusShipped)).CountX(ctx); shippedCount != 1 {
		t.Fatalf("shipped count=%d, want 1", shippedCount)
	}
	if draftCount := client.Shipment.Query().Where(shipment.IDIn(shipmentIDs...), shipment.Status(biz.ShipmentStatusDraft)).CountX(ctx); draftCount != 1 {
		t.Fatalf("draft count=%d, want 1", draftCount)
	}
	shippedCandidates, shippedTotal, err := operationalRepo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
		SalesOrderID: order.ID,
		Limit:        50,
	})
	if err != nil || shippedTotal != 1 || len(shippedCandidates) != 1 {
		t.Fatalf("list postgres shipment candidates after ship total=%d rows=%#v err=%v", shippedTotal, shippedCandidates, err)
	}
	if !shippedCandidates[0].ShippedQuantity.Equal(decimal.NewFromInt(2)) || !shippedCandidates[0].RemainingQuantity.Equal(decimal.NewFromInt(1)) || !shippedCandidates[0].Selectable {
		t.Fatalf("candidate must reflect only committed SHIPPED quantity: %#v", shippedCandidates[0])
	}
	balance, err := inventoryRepo.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID})
	if err != nil {
		t.Fatalf("get postgres shipment balance failed: %v", err)
	}
	if !balance.Quantity.Equal(decimal.NewFromInt(1)) {
		t.Fatalf("shipment balance=%s, want 1", balance.Quantity)
	}
}

func TestOperationalFactPostgresCancelledShipmentRestoresSourceCandidateQuantity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(4), UnitID: fixtures.unitID,
		SourceType: "SHIPMENT_CANCEL_RESTORE_PG", IdempotencyKey: "shipment-cancel-restore-pg-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres shipment inventory failed: %v", err)
	}
	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-C-SHIP-CANCEL-"+fixtures.suffix, true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "PG-SO-SHIP-CANCEL-" + fixtures.suffix, CustomerID: customer.ID, OrderDate: time.Now(),
	})
	if err != nil {
		t.Fatalf("create postgres sales order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: fixtures.productID, UnitID: fixtures.unitID, OrderedQuantity: decimal.NewFromInt(2),
	})
	if err != nil {
		t.Fatalf("create postgres sales order item failed: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit postgres sales order failed: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate postgres sales order failed: %v", err)
	}

	createShipment := func(sequence int) *biz.Shipment {
		t.Helper()
		shipmentNo := fmt.Sprintf("PG-SHP-CANCEL-%s-%d", fixtures.suffix, sequence)
		created, createErr := operationalRepo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{
				ShipmentNo: shipmentNo, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: shipmentNo,
			},
			Items: []*biz.ShipmentItemCreate{{
				SalesOrderItemID: &item.ID, ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID,
				UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(2),
			}},
		})
		if createErr != nil {
			t.Fatalf("create postgres shipment %d failed: %v", sequence, createErr)
		}
		submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, created.ID)
		return created
	}
	assertCandidate := func(stage string, shipped, remaining int64, selectable bool, disabledReason string) {
		t.Helper()
		candidates, total, listErr := operationalRepo.ListShipmentSourceCandidates(ctx, biz.ShipmentSourceCandidateFilter{
			SalesOrderID: order.ID,
			Limit:        50,
		})
		if listErr != nil || total != 1 || len(candidates) != 1 {
			t.Fatalf("%s candidate total=%d rows=%#v err=%v", stage, total, candidates, listErr)
		}
		candidate := candidates[0]
		if !candidate.ShippedQuantity.Equal(decimal.NewFromInt(shipped)) ||
			!candidate.RemainingQuantity.Equal(decimal.NewFromInt(remaining)) ||
			candidate.Selectable != selectable || candidate.DisabledReason != disabledReason {
			t.Fatalf("%s candidate=%#v", stage, candidate)
		}
	}

	first := createShipment(1)
	first, err = operationalRepo.ShipShipment(ctx, first.ID)
	if err != nil || first.Status != biz.ShipmentStatusShipped {
		t.Fatalf("ship first postgres shipment=%#v err=%v", first, err)
	}
	assertCandidate("after first ship", 2, 0, false, biz.ShipmentSourceCandidateDisabledFullyShipped)
	firstOutbound, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.ShipmentSourceType),
		inventorytxn.SourceID(first.ID),
		inventorytxn.TxnType(biz.InventoryTxnOut),
	).Only(ctx)
	if err != nil {
		t.Fatalf("load first shipment outbound inventory transaction failed: %v", err)
	}

	first, err = operationalRepo.CancelShippedShipment(ctx, first.ID)
	if err != nil || first.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("cancel first postgres shipment=%#v err=%v", first, err)
	}
	assertCandidate("after cancellation", 0, 2, true, "")
	reversal, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.ShipmentSourceType),
		inventorytxn.SourceID(first.ID),
		inventorytxn.TxnType(biz.InventoryTxnReversal),
		inventorytxn.ReversalOfTxnID(firstOutbound.ID),
	).Only(ctx)
	if err != nil {
		t.Fatalf("load first shipment reversal inventory transaction failed: %v", err)
	}
	if reversal.Direction != 1 || !reversal.Quantity.Equal(decimal.NewFromInt(2)) || reversal.ReversalOfTxnID == nil || *reversal.ReversalOfTxnID != firstOutbound.ID {
		t.Fatalf("first shipment reversal=%#v, outbound=%#v", reversal, firstOutbound)
	}
	if balance, balanceErr := inventoryRepo.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
	}); balanceErr != nil || !balance.Quantity.Equal(decimal.NewFromInt(4)) {
		t.Fatalf("restored inventory balance=%#v err=%v, want 4", balance, balanceErr)
	}

	second := createShipment(2)
	second, err = operationalRepo.ShipShipment(ctx, second.ID)
	if err != nil || second.Status != biz.ShipmentStatusShipped {
		t.Fatalf("ship replacement postgres shipment=%#v err=%v", second, err)
	}
	assertCandidate("after replacement ship", 2, 0, false, biz.ShipmentSourceCandidateDisabledFullyShipped)
	if cancelledCount := client.Shipment.Query().Where(shipment.ID(first.ID), shipment.Status(biz.ShipmentStatusCancelled)).CountX(ctx); cancelledCount != 1 {
		t.Fatalf("cancelled shipment count=%d, want 1", cancelledCount)
	}
	if shippedCount := client.Shipment.Query().Where(shipment.ID(second.ID), shipment.Status(biz.ShipmentStatusShipped)).CountX(ctx); shippedCount != 1 {
		t.Fatalf("replacement shipped count=%d, want 1", shippedCount)
	}
	if transactionCount := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.ShipmentSourceType),
		inventorytxn.SourceIDIn(first.ID, second.ID),
	).CountX(ctx); transactionCount != 3 {
		t.Fatalf("shipment inventory transaction count=%d, want outbound + reversal + outbound", transactionCount)
	}
	if balance, balanceErr := inventoryRepo.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
	}); balanceErr != nil || !balance.Quantity.Equal(decimal.NewFromInt(2)) {
		t.Fatalf("final inventory balance=%#v err=%v, want 2", balance, balanceErr)
	}
}

func TestInventoryPostgresConcurrentReservationAndOutboundPreserveAvailableStock(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), UnitID: fixtures.unitID,
		SourceType: "RESERVE_OUT_PG", IdempotencyKey: "reserve-out-pg-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres product inventory failed: %v", err)
	}
	type operationResult struct {
		kind string
		err  error
	}
	const perKind = 10
	start := make(chan struct{})
	results := make(chan operationResult, perKind*2)
	var wg sync.WaitGroup
	for index := 0; index < perKind; index++ {
		index := index
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, err := operationalRepo.CreateStockReservation(ctx, &biz.StockReservationCreate{
				ReservationNo: fmt.Sprintf("PG-MIX-RSV-%s-%02d", fixtures.suffix, index), ProductID: fixtures.productID,
				WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(1),
				IdempotencyKey: fmt.Sprintf("pg-mix-rsv-%s-%02d", fixtures.suffix, index),
			})
			results <- operationResult{kind: "reservation", err: err}
		}()
		go func() {
			defer wg.Done()
			<-start
			_, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
				SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
				TxnType: biz.InventoryTxnOut, Direction: -1, Quantity: decimal.NewFromInt(1), UnitID: fixtures.unitID,
				SourceType: "RESERVE_OUT_PG", IdempotencyKey: fmt.Sprintf("pg-mix-out-%s-%02d", fixtures.suffix, index),
			})
			results <- operationResult{kind: "outbound", err: err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	successes := map[string]int{"reservation": 0, "outbound": 0}
	for result := range results {
		if result.err == nil {
			successes[result.kind]++
			continue
		}
		if !errors.Is(result.err, biz.ErrInventoryInsufficientStock) {
			t.Fatalf("unexpected mixed %s error: %v", result.kind, result.err)
		}
	}
	if successes["reservation"]+successes["outbound"] > 10 {
		t.Fatalf("mixed successes exceed inventory: %#v", successes)
	}
	balance, err := inventoryRepo.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID})
	if err != nil {
		t.Fatalf("get mixed-operation balance failed: %v", err)
	}
	active, err := client.StockReservation.Query().Where(
		stockreservation.ProductID(fixtures.productID), stockreservation.WarehouseID(fixtures.warehouseID),
		stockreservation.UnitID(fixtures.unitID), stockreservation.Status(biz.StockReservationStatusActive),
	).All(ctx)
	if err != nil {
		t.Fatalf("list mixed-operation reservations failed: %v", err)
	}
	reserved := decimal.Zero
	for _, row := range active {
		reserved = reserved.Add(row.Quantity)
	}
	if balance.Quantity.LessThan(reserved) {
		t.Fatalf("mixed operations produced negative available stock: balance=%s reserved=%s successes=%#v", balance.Quantity, reserved, successes)
	}
	if !balance.Quantity.Equal(decimal.NewFromInt(int64(10-successes["outbound"]))) || !reserved.Equal(decimal.NewFromInt(int64(successes["reservation"]))) {
		t.Fatalf("mixed operation facts mismatch balance=%s reserved=%s successes=%#v", balance.Quantity, reserved, successes)
	}
}

func TestOperationalFactPostgresConcurrentReservationReleaseAndShipmentPreserveReleasedStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: fixtures.unitID,
		SourceType: "RELEASE_SHIP_PG", IdempotencyKey: "release-ship-pg-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres product inventory failed: %v", err)
	}
	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-C-RELEASE-SHIP-"+fixtures.suffix, true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{OrderNo: "PG-SO-RELEASE-SHIP-" + fixtures.suffix, CustomerID: customer.ID, OrderDate: time.Now()})
	if err != nil {
		t.Fatalf("create postgres sales order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: fixtures.productID, UnitID: fixtures.unitID, OrderedQuantity: decimal.NewFromInt(5),
	})
	if err != nil {
		t.Fatalf("create postgres sales order item failed: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit postgres sales order failed: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate postgres sales order failed: %v", err)
	}
	reservation, err := operationalUC.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo: "PG-RSV-RELEASE-SHIP-" + fixtures.suffix, SalesOrderID: &order.ID, SalesOrderItemID: &item.ID,
		ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		Quantity: decimal.NewFromInt(5), IdempotencyKey: "pg-rsv-release-ship-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create postgres reservation failed: %v", err)
	}
	shipmentRow, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: "PG-SHP-RELEASE-SHIP-" + fixtures.suffix, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: "pg-shp-release-ship-" + fixtures.suffix},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &item.ID, ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID,
			UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(5),
		}},
	})
	if err != nil {
		t.Fatalf("create postgres shipment failed: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shipmentRow.ID)

	releaseTx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin postgres release transaction failed: %v", err)
	}
	defer func() { _ = releaseTx.Rollback() }()
	var releaseBackendPID int
	if err := releaseTx.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&releaseBackendPID); err != nil {
		t.Fatalf("read release backend pid failed: %v", err)
	}
	var lockedReservationID int
	if err := releaseTx.QueryRowContext(ctx, `SELECT id FROM stock_reservations WHERE id = $1 FOR UPDATE`, reservation.ID).Scan(&lockedReservationID); err != nil {
		t.Fatalf("lock reservation for concurrent release failed: %v", err)
	}
	shipResult := make(chan error, 1)
	go func() {
		_, shipErr := operationalUC.ShipShipment(ctx, shipmentRow.ID)
		shipResult <- shipErr
	}()
	_ = waitForPostgresSessionBlockedByPID(t, ctx, data.sqldb, releaseBackendPID)
	now := time.Now()
	if _, err := releaseTx.ExecContext(ctx, `
UPDATE stock_reservations
SET status = $1, released_at = $2, updated_at = $2
WHERE id = $3 AND status = $4`, biz.StockReservationStatusReleased, now, reservation.ID, biz.StockReservationStatusActive); err != nil {
		t.Fatalf("release reservation in concurrent transaction failed: %v", err)
	}
	if err := releaseTx.Commit(); err != nil {
		t.Fatalf("commit concurrent release failed: %v", err)
	}
	if err := <-shipResult; err != nil {
		t.Fatalf("shipment after concurrent release failed: %v", err)
	}
	if got := client.StockReservation.GetX(ctx, reservation.ID).Status; got != biz.StockReservationStatusReleased {
		t.Fatalf("concurrently released reservation status = %s, want RELEASED", got)
	}
	if got := client.Shipment.GetX(ctx, shipmentRow.ID).Status; got != biz.ShipmentStatusShipped {
		t.Fatalf("shipment status = %s, want SHIPPED", got)
	}
}

func TestOperationalFactPostgresShipmentRejectsRemainingReservationAcrossInventoryGrains(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	otherWarehouse := createTestWarehouse(t, ctx, client, "PG-WH-CROSS-"+fixtures.suffix)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	for index, warehouseID := range []int{fixtures.warehouseID, otherWarehouse.ID} {
		if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: warehouseID,
			TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: fixtures.unitID,
			SourceType: "CROSS_GRAIN_PG", IdempotencyKey: fmt.Sprintf("cross-grain-pg-in-%s-%d", fixtures.suffix, index),
		}); err != nil {
			t.Fatalf("seed postgres cross-grain inventory failed: %v", err)
		}
	}
	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-C-CROSS-"+fixtures.suffix, true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{OrderNo: "PG-SO-CROSS-" + fixtures.suffix, CustomerID: customer.ID, OrderDate: time.Now()})
	if err != nil {
		t.Fatalf("create postgres sales order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: fixtures.productID, UnitID: fixtures.unitID, OrderedQuantity: decimal.NewFromInt(5),
	})
	if err != nil {
		t.Fatalf("create postgres sales order item failed: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit postgres sales order failed: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate postgres sales order failed: %v", err)
	}
	reservation, err := operationalUC.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo: "PG-RSV-CROSS-" + fixtures.suffix, SalesOrderID: &order.ID, SalesOrderItemID: &item.ID,
		ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		Quantity: decimal.NewFromInt(5), IdempotencyKey: "pg-rsv-cross-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create postgres source reservation failed: %v", err)
	}
	shipmentRow, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: "PG-SHP-CROSS-" + fixtures.suffix, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: "pg-shp-cross-" + fixtures.suffix},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &item.ID, ProductID: fixtures.productID, WarehouseID: otherWarehouse.ID,
			UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(5),
		}},
	})
	if err != nil {
		t.Fatalf("create postgres cross-grain shipment failed: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shipmentRow.ID)
	if _, err := operationalUC.ShipShipment(ctx, shipmentRow.ID); !errors.Is(err, biz.ErrShipmentQuantityExceeded) {
		t.Fatalf("postgres cross-grain shipment error = %v, want ErrShipmentQuantityExceeded", err)
	}
	if got := client.StockReservation.GetX(ctx, reservation.ID).Status; got != biz.StockReservationStatusActive {
		t.Fatalf("postgres cross-grain reservation status = %s, want ACTIVE", got)
	}
	if got := client.Shipment.GetX(ctx, shipmentRow.ID).Status; got != biz.ShipmentStatusDraft {
		t.Fatalf("postgres cross-grain shipment status = %s, want DRAFT", got)
	}
}

func waitForPostgresSessionBlockedByPID(t *testing.T, ctx context.Context, db *stdsql.DB, blockerPID int) int {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var blockedPID int
		err := db.QueryRowContext(ctx, `
SELECT COALESCE((
  SELECT pid
  FROM pg_stat_activity
  WHERE pid <> $1
    AND wait_event_type = 'Lock'
    AND $1 = ANY(pg_blocking_pids(pid))
  ORDER BY pid
  LIMIT 1
), 0)`, blockerPID).Scan(&blockedPID)
		if err != nil {
			t.Fatalf("inspect postgres blocked session failed: %v", err)
		}
		if blockedPID > 0 {
			return blockedPID
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("database session did not block on the expected transaction lock")
	return 0
}

type inventoryPostgresFixtures struct {
	suffix      string
	unitID      int
	materialID  int
	productID   int
	warehouseID int
}

type inventoryLotPostgresFixtures = inventoryPostgresFixtures
type purchaseReceiptPostgresFixtures = inventoryPostgresFixtures
type purchaseOperationalPostgresFixtures = inventoryPostgresFixtures

func openInventoryPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("INVENTORY_PG_TEST") != "1" {
		t.Skip("set INVENTORY_PG_TEST=1 and INVENTORY_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("INVENTORY_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("INVENTORY_PG_DB_URL")
	}
	if dsn == "" {
		t.Fatal("INVENTORY_PG_TEST_DB_URL or INVENTORY_PG_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping postgres failed: %v", err)
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.Postgres,
	}, client
}

func openInventoryLotPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("BOM_LOT_PG_TEST") != "1" {
		t.Skip("set BOM_LOT_PG_TEST=1 and BOM_LOT_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("BOM_LOT_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("BOM_LOT_PG_DB_URL")
	}
	if dsn == "" {
		t.Fatal("BOM_LOT_PG_TEST_DB_URL or BOM_LOT_PG_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open bom_lot postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping bom_lot postgres failed: %v", err)
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.Postgres,
	}, client
}

func openPurchaseReceiptPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PURCHASE_RECEIPT_PG_TEST") != "1" {
		t.Skip("set PURCHASE_RECEIPT_PG_TEST=1 and PURCHASE_RECEIPT_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PURCHASE_RECEIPT_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PURCHASE_RECEIPT_PG_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PURCHASE_RECEIPT_PG_TEST_DB_URL or PURCHASE_RECEIPT_PG_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open purchase_receipt postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping purchase_receipt postgres failed: %v", err)
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.Postgres,
	}, client
}

func openPurchaseOperationalPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PURCHASE_RETURN_PG_TEST") != "1" {
		t.Skip("set PURCHASE_RETURN_PG_TEST=1 and PURCHASE_RETURN_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PURCHASE_RETURN_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PURCHASE_RETURN_PG_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PURCHASE_RETURN_PG_TEST_DB_URL or PURCHASE_RETURN_PG_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open purchase_return postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping purchase_return postgres failed: %v", err)
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.Postgres,
	}, client
}

func createInventoryPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) inventoryPostgresFixtures {
	t.Helper()
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "PGU"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "PG-MAT-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "PG-PRD-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "PG-WH-"+suffix)
	return inventoryPostgresFixtures{
		suffix:      suffix,
		unitID:      unit.ID,
		materialID:  material.ID,
		productID:   product.ID,
		warehouseID: warehouse.ID,
	}
}

func createInventoryLotPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) inventoryLotPostgresFixtures {
	t.Helper()
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	return inventoryLotPostgresFixtures(fixtures)
}

func createPurchaseReceiptPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) purchaseReceiptPostgresFixtures {
	t.Helper()
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	return purchaseReceiptPostgresFixtures(fixtures)
}

func createPurchaseOperationalPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) purchaseOperationalPostgresFixtures {
	t.Helper()
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	return purchaseOperationalPostgresFixtures(fixtures)
}

func postgresTestSuffix() string {
	return fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000_000)
}

func createPostgresProductIDWithoutMaterial(t *testing.T, ctx context.Context, client *ent.Client, unitID int, suffix string) int {
	t.Helper()
	for i := 0; i < 50; i++ {
		product := createTestProduct(t, ctx, client, unitID, fmt.Sprintf("PG-PRD-ONLY-%s-%02d", suffix, i))
		if _, err := client.Material.Get(ctx, product.ID); ent.IsNotFound(err) {
			return product.ID
		} else if err != nil {
			t.Fatalf("check product-only id failed: %v", err)
		}
	}
	t.Fatalf("could not create product id without matching material id")
	return 0
}

func createPostgresMaterialIDWithoutProduct(t *testing.T, ctx context.Context, client *ent.Client, unitID int, suffix string) int {
	t.Helper()
	for i := 0; i < 50; i++ {
		material := createTestMaterial(t, ctx, client, unitID, fmt.Sprintf("PG-MAT-ONLY-%s-%02d", suffix, i))
		if _, err := client.Product.Get(ctx, material.ID); ent.IsNotFound(err) {
			return material.ID
		} else if err != nil {
			t.Fatalf("check material-only id failed: %v", err)
		}
	}
	t.Fatalf("could not create material id without matching product id")
	return 0
}

func assertPostgresTableExists(t *testing.T, db *stdsql.DB, table string) {
	t.Helper()
	var exists bool
	if err := db.QueryRow(`SELECT to_regclass($1) IS NOT NULL`, table).Scan(&exists); err != nil {
		t.Fatalf("check postgres table %s failed: %v", table, err)
	}
	if !exists {
		t.Fatalf("expected postgres table %s to exist", table)
	}
}

func assertPostgresColumnExists(t *testing.T, db *stdsql.DB, table, column string) {
	t.Helper()
	var exists bool
	err := db.QueryRow(`
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
)`,
		table, column,
	).Scan(&exists)
	if err != nil {
		t.Fatalf("check postgres column %s.%s failed: %v", table, column, err)
	}
	if !exists {
		t.Fatalf("expected postgres column %s.%s to exist", table, column)
	}
}

func assertPostgresNumericColumn(t *testing.T, db *stdsql.DB, table, column string, precision, scale int) {
	t.Helper()
	var dataType string
	var gotPrecision, gotScale int
	err := db.QueryRow(`
SELECT data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
		table, column,
	).Scan(&dataType, &gotPrecision, &gotScale)
	if err != nil {
		t.Fatalf("read postgres column %s.%s failed: %v", table, column, err)
	}
	if dataType != "numeric" || gotPrecision != precision || gotScale != scale {
		t.Fatalf("expected %s.%s numeric(%d,%d), got %s(%d,%d)", table, column, precision, scale, dataType, gotPrecision, gotScale)
	}
}

func assertPostgresPartialUniqueIndex(t *testing.T, db *stdsql.DB, table, indexName, predicate string) {
	t.Helper()
	var indexDef string
	err := db.QueryRow(`
SELECT indexdef
FROM pg_indexes
WHERE schemaname = current_schema() AND tablename = $1 AND indexname = $2`,
		table, indexName,
	).Scan(&indexDef)
	if err != nil {
		t.Fatalf("read postgres partial index %s.%s failed: %v", table, indexName, err)
	}
	upperDef := strings.ToUpper(indexDef)
	if !strings.Contains(upperDef, "UNIQUE") {
		t.Fatalf("expected postgres index %s.%s to be unique, got %s", table, indexName, indexDef)
	}
	normalizedDef := strings.NewReplacer("(", "", ")", "", "\"", "").Replace(upperDef)
	normalizedPredicate := strings.NewReplacer("(", "", ")", "", "\"", "").Replace(strings.ToUpper(predicate))
	normalizedDef = strings.ReplaceAll(normalizedDef, "::TEXT", "")
	normalizedPredicate = strings.ReplaceAll(normalizedPredicate, "::TEXT", "")
	if !strings.Contains(normalizedDef, normalizedPredicate) {
		t.Fatalf("expected postgres index %s.%s predicate %q, got %s", table, indexName, predicate, indexDef)
	}
}

func assertPostgresCheckConstraint(t *testing.T, db *stdsql.DB, table, constraintName, expression string) {
	t.Helper()
	var constraintDef string
	err := db.QueryRow(`
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = $1::regclass AND conname = $2 AND contype = 'c'`,
		table, constraintName,
	).Scan(&constraintDef)
	if err != nil {
		t.Fatalf("read postgres check constraint %s.%s failed: %v", table, constraintName, err)
	}
	normalizedDef := strings.NewReplacer("(", "", ")", "", "\"", "").Replace(strings.ToUpper(constraintDef))
	normalizedExpression := strings.NewReplacer("(", "", ")", "", "\"", "").Replace(strings.ToUpper(expression))
	normalizedDef = strings.ReplaceAll(normalizedDef, "::NUMERIC", "")
	normalizedExpression = strings.ReplaceAll(normalizedExpression, "::NUMERIC", "")
	normalizedDef = strings.ReplaceAll(normalizedDef, "::TEXT", "")
	normalizedExpression = strings.ReplaceAll(normalizedExpression, "::TEXT", "")
	if !strings.Contains(normalizedDef, normalizedExpression) {
		t.Fatalf("expected postgres check %s.%s expression %q, got %s", table, constraintName, expression, constraintDef)
	}
}

func assertPostgresForeignKeyDeleteRule(t *testing.T, db *stdsql.DB, table, constraintName, want string) {
	t.Helper()
	var got string
	err := db.QueryRow(`
SELECT CASE confdeltype
  WHEN 'a' THEN 'NO ACTION'
  WHEN 'r' THEN 'RESTRICT'
  WHEN 'c' THEN 'CASCADE'
  WHEN 'n' THEN 'SET NULL'
  WHEN 'd' THEN 'SET DEFAULT'
END
FROM pg_constraint
WHERE conrelid = $1::regclass AND conname = $2 AND contype = 'f'`,
		table, constraintName,
	).Scan(&got)
	if err != nil {
		t.Fatalf("read postgres fk delete rule %s.%s failed: %v", table, constraintName, err)
	}
	if got != want {
		t.Fatalf("expected postgres fk %s.%s delete rule %s, got %s", table, constraintName, want, got)
	}
}

func assertPostgresLotID(t *testing.T, db *stdsql.DB, table string, id, wantLotID int) {
	t.Helper()
	var got stdsql.NullInt64
	if err := db.QueryRow(`SELECT lot_id FROM `+table+` WHERE id = $1`, id).Scan(&got); err != nil {
		t.Fatalf("read postgres %s.id=%d lot_id failed: %v", table, id, err)
	}
	if !got.Valid {
		t.Fatalf("expected postgres %s.id=%d lot_id=%d, got NULL", table, id, wantLotID)
	}
	if int(got.Int64) != wantLotID {
		t.Fatalf("expected postgres %s.id=%d lot_id=%d, got %d", table, id, wantLotID, got.Int64)
	}
}

func assertPostgresUniqueIndex(t *testing.T, db *stdsql.DB, table, indexName string) {
	t.Helper()
	var indexDef string
	err := db.QueryRow(`
SELECT indexdef
FROM pg_indexes
WHERE schemaname = current_schema() AND tablename = $1 AND indexname = $2`,
		table, indexName,
	).Scan(&indexDef)
	if err != nil {
		t.Fatalf("read postgres index %s.%s failed: %v", table, indexName, err)
	}
	if !strings.Contains(strings.ToUpper(indexDef), "UNIQUE") {
		t.Fatalf("expected postgres index %s.%s to be unique, got %s", table, indexName, indexDef)
	}
}
