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
	"server/internal/data/model/ent/bomheader"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryLotPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryLotPostgresTestData(t)

	for _, table := range []string{
		"inventory_lots",
		"bom_headers",
		"bom_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}

	assertPostgresColumnExists(t, data.sqldb, "inventory_txns", "lot_id")
	assertPostgresColumnExists(t, data.sqldb, "inventory_balances", "lot_id")
	assertPostgresNumericColumn(t, data.sqldb, "bom_items", "quantity", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "bom_items", "loss_rate", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "inventory_lots", "inventorylot_subject_type_subject_id_lot_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id", "lot_id IS NULL")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l", "lot_id IS NOT NULL")
	assertPostgresUniqueIndex(t, data.sqldb, "bom_headers", "bomheader_product_id_version")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "bom_headers", "bomheader_product_id", "status = 'ACTIVE'")
	assertPostgresCheckConstraint(t, data.sqldb, "bom_items", "bom_items_quantity_positive", "quantity > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "bom_items", "bom_items_loss_rate_non_negative", "loss_rate >= 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "inventory_txns", "inventory_txns_inventory_lots_inventory_txns", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "inventory_balances", "inventory_balances_inventory_lots_inventory_balances", "NO ACTION")

	fixtures := createInventoryLotPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lotA := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-SHAPE-LOT-A-"+fixtures.suffix)
	lotB := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-SHAPE-LOT-B-"+fixtures.suffix)
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("create postgres nil-lot balance failed: %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotA.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("create postgres lot balance failed: %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotA.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres same-lot partial unique constraint, got %v", err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lotB.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); err != nil {
		t.Fatalf("expected postgres different-lot balance to be allowed, got %v", err)
	}
}

func TestInventoryLotPostgresFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryLotPostgresTestData(t)

	fixtures := createInventoryLotPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-MAT-LOT-"+fixtures.suffix)

	lotIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_lot_pg",
		IdempotencyKey: "inventory-lot-pg-lot-in-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres lot inbound failed: %v", err)
	}
	assertDecimalEqual(t, lotIn.Balance.Quantity, "10")
	assertPostgresLotID(t, data.sqldb, "inventory_txns", lotIn.Txn.ID, lot.ID)
	assertPostgresLotID(t, data.sqldb, "inventory_balances", lotIn.Balance.ID, lot.ID)

	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM inventory_lots WHERE id = $1`, lot.ID); err == nil {
		t.Fatalf("expected direct postgres delete of referenced inventory lot to fail")
	}
	assertPostgresLotID(t, data.sqldb, "inventory_txns", lotIn.Txn.ID, lot.ID)
	assertPostgresLotID(t, data.sqldb, "inventory_balances", lotIn.Balance.ID, lot.ID)

	replayed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_lot_pg",
		IdempotencyKey: "inventory-lot-pg-lot-in-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres lot inbound replay failed: %v", err)
	}
	if !replayed.IdempotentReplay {
		t.Fatalf("expected postgres lot replay to be idempotent")
	}
	assertDecimalEqual(t, replayed.Balance.Quantity, "10")

	nilLotIn, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "4"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_lot_pg",
		IdempotencyKey: "inventory-lot-pg-no-lot-in-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres non-lot inbound failed: %v", err)
	}
	assertDecimalEqual(t, nilLotIn.Balance.Quantity, "4")

	lotOut, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "3"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_lot_pg",
		IdempotencyKey: "inventory-lot-pg-lot-out-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("postgres lot outbound failed: %v", err)
	}
	assertDecimalEqual(t, lotOut.Balance.Quantity, "7")
	assertPostgresLotID(t, data.sqldb, "inventory_txns", lotOut.Txn.ID, lot.ID)

	reversalOf := lotOut.Txn.ID
	reversed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:     biz.InventorySubjectMaterial,
		SubjectID:       fixtures.materialID,
		WarehouseID:     fixtures.warehouseID,
		TxnType:         biz.InventoryTxnReversal,
		Direction:       1,
		Quantity:        mustDecimal(t, "3"),
		UnitID:          fixtures.unitID,
		SourceType:      "inventory_lot_pg",
		IdempotencyKey:  "inventory-lot-pg-lot-reversal-" + fixtures.suffix,
		ReversalOfTxnID: &reversalOf,
	})
	if err != nil {
		t.Fatalf("postgres lot reversal failed: %v", err)
	}
	assertOptionalIntEqual(t, reversed.Txn.LotID, lot.ID)
	assertDecimalEqual(t, reversed.Balance.Quantity, "10")
	assertPostgresLotID(t, data.sqldb, "inventory_txns", reversed.Txn.ID, lot.ID)

	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(lot.ID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres lot balance partial unique constraint, got %v", err)
	}
}

func TestBOMPostgresConstraints(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryLotPostgresTestData(t)

	fixtures := createInventoryLotPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	header, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V1",
		Status:    biz.BOMStatusDraft,
	})
	if err != nil {
		t.Fatalf("create postgres draft bom header failed: %v", err)
	}
	item, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1.25"),
		UnitID:      fixtures.unitID,
		LossRate:    mustDecimal(t, "0.10"),
	})
	if err != nil {
		t.Fatalf("create postgres bom item failed: %v", err)
	}
	assertDecimalEqual(t, item.Quantity, "1.25")
	assertDecimalEqual(t, item.LossRate, "0.10")
	if _, err := uc.ActivateBOMVersion(ctx, header.ID); err != nil {
		t.Fatalf("activate postgres bom failed: %v", err)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V3",
		Status:    biz.BOMStatusActive,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected normal postgres create to reject ACTIVE BOM, got %v", err)
	}
	if _, err := client.BOMHeader.Create().
		SetProductID(fixtures.productID).
		SetVersion("V3").
		SetStatus(biz.BOMStatusActive).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres one ACTIVE BOM per product constraint, got %v", err)
	}
	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBOMActiveImmutable) {
		t.Fatalf("expected active BOM item mutation to be rejected, got %v", err)
	}

	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(decimal.Zero).
		SetUnitID(fixtures.unitID).
		SetLossRate(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres DB check for quantity > 0, got %v", err)
	}
	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitID(fixtures.unitID).
		SetLossRate(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres DB check for loss_rate >= 0, got %v", err)
	}
}

func TestBOMPostgresConcurrentActivateKeepsSingleActive(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryLotPostgresTestData(t)
	fixtures := createInventoryLotPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	headers := make([]*biz.BOMHeader, 0, 2)
	for _, version := range []string{"CONCURRENT-A", "CONCURRENT-B"} {
		header, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
			ProductID: fixtures.productID,
			Version:   version,
		})
		if err != nil {
			t.Fatalf("create concurrent BOM %s: %v", version, err)
		}
		if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
			BOMHeaderID: header.ID,
			MaterialID:  fixtures.materialID,
			Quantity:    mustDecimal(t, "1"),
			UnitID:      fixtures.unitID,
			LossRate:    decimal.Zero,
		}); err != nil {
			t.Fatalf("create concurrent BOM item %s: %v", version, err)
		}
		headers = append(headers, header)
	}

	start := make(chan struct{})
	errs := make(chan error, len(headers))
	var wg sync.WaitGroup
	for _, header := range headers {
		header := header
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := uc.ActivateBOMVersion(ctx, header.ID)
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil && !errors.Is(err, biz.ErrBOMActiveConflict) {
			t.Fatalf("concurrent activation must return a stable domain result, got %v", err)
		}
	}
	count, err := client.BOMHeader.Query().
		Where(
			bomheader.ProductID(fixtures.productID),
			bomheader.Status(biz.BOMStatusActive),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count active BOMs after concurrent activation: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one ACTIVE BOM after concurrent activation, got %d", count)
	}
}

func TestInventoryLotPostgresConcurrentOutbound(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryLotPostgresTestData(t)

	fixtures := createInventoryLotPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-MAT-LOT-CONCURRENT-"+fixtures.suffix)

	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &lot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "10"),
		UnitID:         fixtures.unitID,
		SourceType:     "inventory_lot_pg_concurrent",
		IdempotencyKey: "inventory-lot-pg-concurrent-in-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("postgres lot concurrent inbound failed: %v", err)
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
				LotID:          &lot.ID,
				TxnType:        biz.InventoryTxnOut,
				Direction:      -1,
				Quantity:       decimal.NewFromInt(1),
				UnitID:         fixtures.unitID,
				SourceType:     "inventory_lot_pg_concurrent",
				IdempotencyKey: fmt.Sprintf("inventory-lot-pg-concurrent-out-%s-%02d", fixtures.suffix, i),
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
			t.Fatalf("unexpected postgres lot concurrent outbound error: %v", err)
		}
	}
	if successes > 10 {
		t.Fatalf("postgres lot concurrent outbound successes must be <= 10, got %d", successes)
	}
	if failures < 10 {
		t.Fatalf("postgres lot concurrent outbound failures must be >= 10, got %d", failures)
	}

	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after concurrent outbound failed: %v", err)
	}
	if balance.Quantity.Cmp(decimal.Zero) < 0 {
		t.Fatalf("postgres lot concurrent outbound produced negative balance: %s", balance.Quantity)
	}
	assertDecimalEqual(t, balance.Quantity, fmt.Sprintf("%d", 10-successes))
}
