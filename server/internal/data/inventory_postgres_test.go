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
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPhase2APostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2APostgresTestData(t)

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

	suffix := phase2APostgresSuffix()
	unit := createTestUnit(t, ctx, client, "PGU"+suffix)
	if _, err := client.Unit.Create().SetCode(unit.Code).SetName("重复单位").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres unit code unique constraint, got %v", err)
	}
}

func TestPhase2APostgresInventoryFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2APostgresTestData(t)

	fixtures := createPhase2APostgresFixtures(t, ctx, client)
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-decimal-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-decimal-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-product-in-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-mat-in-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-mat-out-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-overdraw-" + fixtures.suffix,
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
		SourceType:      "phase2a_pg",
		IdempotencyKey:  "phase2a-pg-reversal-" + fixtures.suffix,
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
		SourceType:      "phase2a_pg",
		IdempotencyKey:  "phase2a-pg-reversal-duplicate-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-invalid-material-" + fixtures.suffix,
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
		SourceType:     "phase2a_pg",
		IdempotencyKey: "phase2a-pg-invalid-product-" + fixtures.suffix,
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

func TestPhase2APostgresConcurrentOutbound(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2APostgresTestData(t)

	fixtures := createPhase2APostgresFixtures(t, ctx, client)
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
		SourceType:     "phase2a_pg_concurrent",
		IdempotencyKey: "phase2a-pg-concurrent-in-" + fixtures.suffix,
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
				SourceType:     "phase2a_pg_concurrent",
				IdempotencyKey: fmt.Sprintf("phase2a-pg-concurrent-out-%s-%02d", fixtures.suffix, i),
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
			inventorytxn.SourceType("PHASE2A_PG_CONCURRENT"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres concurrent outbound txns failed: %v", err)
	}
	if txnCount != successes {
		t.Fatalf("postgres outbound txn count=%d, successes=%d", txnCount, successes)
	}
}

func TestPhase2BPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2BPostgresTestData(t)

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

	fixtures := createPhase2BPostgresFixtures(t, ctx, client)
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

func TestPhase2BPostgresLotInventoryFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2BPostgresTestData(t)

	fixtures := createPhase2BPostgresFixtures(t, ctx, client)
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
		SourceType:     "phase2b_pg",
		IdempotencyKey: "phase2b-pg-lot-in-" + fixtures.suffix,
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
		SourceType:     "phase2b_pg",
		IdempotencyKey: "phase2b-pg-lot-in-" + fixtures.suffix,
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
		SourceType:     "phase2b_pg",
		IdempotencyKey: "phase2b-pg-no-lot-in-" + fixtures.suffix,
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
		SourceType:     "phase2b_pg",
		IdempotencyKey: "phase2b-pg-lot-out-" + fixtures.suffix,
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
		SourceType:      "phase2b_pg",
		IdempotencyKey:  "phase2b-pg-lot-reversal-" + fixtures.suffix,
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

func TestPhase2BPostgresBOMConstraints(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2BPostgresTestData(t)

	fixtures := createPhase2BPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	header, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V1",
		Status:    biz.BOMStatusActive,
	})
	if err != nil {
		t.Fatalf("create postgres active bom header failed: %v", err)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V2",
		Status:    biz.BOMStatusActive,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres one ACTIVE BOM per product constraint, got %v", err)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V2",
		Status:    biz.BOMStatusDisabled,
	}); err != nil {
		t.Fatalf("expected postgres disabled BOM with different version to be allowed, got %v", err)
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

func TestPhase2BPostgresLotConcurrentOutbound(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2BPostgresTestData(t)

	fixtures := createPhase2BPostgresFixtures(t, ctx, client)
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
		SourceType:     "phase2b_pg_concurrent",
		IdempotencyKey: "phase2b-pg-concurrent-in-" + fixtures.suffix,
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
				SourceType:     "phase2b_pg_concurrent",
				IdempotencyKey: fmt.Sprintf("phase2b-pg-concurrent-out-%s-%02d", fixtures.suffix, i),
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

func TestPhase2CPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2CPostgresTestData(t)

	for _, table := range []string{
		"purchase_receipts",
		"purchase_receipt_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_items", "quantity", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_items", "unit_price", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_items", "amount", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_receipts", "purchasereceipt_receipt_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_receipt_items", "purchasereceiptitem_receipt_id_source_line_no", "source_line_no IS NOT NULL")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_quantity_positive", "quantity > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_unit_price_non_negative", "unit_price IS NULL OR unit_price >= 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_amount_non_negative", "amount IS NULL OR amount >= 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_items", "purchase_receipt_items_inventory_lots_purchase_receipt_items", "NO ACTION")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id", "lot_id IS NULL")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l", "lot_id IS NOT NULL")

	fixtures := createPhase2CPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PG-PR-SHAPE-" + fixtures.suffix,
		SupplierName: "PG供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase receipt shape draft failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres draft receipt cancel to be rejected, got %v", err)
	}
	if _, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PG-PR-SHAPE-" + fixtures.suffix,
		SupplierName: "PG供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres receipt_no unique constraint, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:    receipt.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     mustDecimal(t, "1"),
		SourceLineNo: stringPtr("same-line"),
	}); err != nil {
		t.Fatalf("create postgres source line item failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:    receipt.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     mustDecimal(t, "1"),
		SourceLineNo: stringPtr("same-line"),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres receipt source_line_no unique constraint, got %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres quantity DB check, got %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitPrice(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres unit_price DB check, got %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetAmount(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres amount DB check, got %v", err)
	}
}

func TestPhase2CPostgresPurchaseReceiptFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2CPostgresTestData(t)

	fixtures := createPhase2CPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	posted := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PR-FLOW-"+fixtures.suffix, invFixtures, stringPtr("PG-LOT-FLOW-"+fixtures.suffix), mustDecimal(t, "10"))
	lotID := posted.Items[0].LotID
	if lotID == nil {
		t.Fatalf("expected postgres posted purchase receipt lot_id")
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres purchase receipt lot balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "10")

	inboundTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(posted.ID),
			inventorytxn.SourceLineID(posted.Items[0].ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres purchase receipt inbound txn failed: %v", err)
	}
	assertOptionalIntEqual(t, inboundTxn.LotID, *lotID)
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   posted.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres posted receipt item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(posted.ID).SetStatus(biz.PurchaseReceiptStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt status update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(posted.Items[0].ID).SetQuantity(mustDecimal(t, "11")).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt item quantity update to be rejected")
	}
	if _, err := client.PurchaseReceipt.Delete().Where(purchasereceipt.ID(posted.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt bulk delete to be rejected")
	}
	if err := client.PurchaseReceiptItem.DeleteOneID(posted.Items[0].ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted receipt item delete-one to be rejected")
	}

	if _, err := uc.PostPurchaseReceipt(ctx, posted.ID); err != nil {
		t.Fatalf("repeat postgres purchase receipt post failed: %v", err)
	}
	inboundCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(posted.ID),
			inventorytxn.SourceLineID(posted.Items[0].ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase receipt inbound txns failed: %v", err)
	}
	if inboundCount != 1 {
		t.Fatalf("expected one postgres inbound txn after repeat post, got %d", inboundCount)
	}

	second := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PR-FLOW-REUSE-"+fixtures.suffix, invFixtures, stringPtr("PG-LOT-FLOW-"+fixtures.suffix), mustDecimal(t, "2"))
	assertOptionalIntEqual(t, second.Items[0].LotID, *lotID)
	reusedBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres reused lot balance failed: %v", err)
	}
	assertDecimalEqual(t, reusedBalance.Quantity, "12")

	nonLot := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PR-FLOW-NOLOT-"+fixtures.suffix, invFixtures, nil, mustDecimal(t, "4"))
	if nonLot.Items[0].LotID != nil {
		t.Fatalf("expected postgres non-lot purchase receipt item lot_id nil")
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres non-lot purchase balance failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "4")

	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID)
	if err != nil {
		t.Fatalf("cancel postgres posted purchase receipt failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected postgres cancelled receipt, got %s", cancelled.Status)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, posted.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled receipt post to be rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   posted.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled receipt item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(posted.ID).SetSupplierName("PG修改供应商").Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt protected update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(posted.Items[0].ID).SetLotNo("PG-LOT-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt item lot_no update to be rejected")
	}
	if err := client.PurchaseReceipt.DeleteOneID(posted.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt delete-one to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.Delete().Where(purchasereceiptitem.ID(posted.Items[0].ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled receipt item bulk delete to be rejected")
	}
	afterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after cancel failed: %v", err)
	}
	assertDecimalEqual(t, afterCancel.Quantity, "2")
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase receipt reversal failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres reversal, got %d", reversalCount)
	}
	traceTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(posted.ID),
			inventorytxn.SourceLineID(posted.Items[0].ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query postgres purchase receipt trace txns failed: %v", err)
	}
	if len(traceTxns) != 2 {
		t.Fatalf("expected postgres inbound and reversal trace txns, got %d", len(traceTxns))
	}
	for _, txn := range traceTxns {
		assertOptionalIntEqual(t, txn.SourceID, posted.ID)
		assertOptionalIntEqual(t, txn.SourceLineID, posted.Items[0].ID)
		assertOptionalIntEqual(t, txn.LotID, *lotID)
		if err := client.InventoryTxn.DeleteOneID(txn.ID).Exec(ctx); err == nil {
			t.Fatalf("expected postgres trace inventory txn delete to be rejected")
		}
	}
	if _, err := client.PurchaseReceipt.Get(ctx, posted.ID); err != nil {
		t.Fatalf("postgres receipt should remain after failed deletes: %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Get(ctx, posted.Items[0].ID); err != nil {
		t.Fatalf("postgres receipt item should remain after failed deletes: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID); err != nil {
		t.Fatalf("repeat postgres purchase receipt cancel failed: %v", err)
	}
	reversalCount, err = client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase receipt reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres reversal after repeat cancel, got %d", reversalCount)
	}
}

func TestPhase2DPostgresMigrationShape(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2DPostgresTestData(t)

	for _, table := range []string{
		"purchase_returns",
		"purchase_return_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	assertPostgresNumericColumn(t, data.sqldb, "purchase_return_items", "quantity", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_return_items", "unit_price", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "purchase_return_items", "amount", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_returns", "purchasereturn_return_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_return_items", "purchasereturnitem_return_id_source_line_no", "source_line_no IS NOT NULL")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_quantity_positive", "quantity > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_unit_price_non_negative", "unit_price IS NULL OR unit_price >= 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_amount_non_negative", "amount IS NULL OR amount >= 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_return_items", "purchase_return_items_inventory_lots_purchase_return_items", "NO ACTION")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id", "lot_id IS NULL")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "inventory_balances", "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l", "lot_id IS NOT NULL")

	fixtures := createPhase2DPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	returnDraft, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-SHAPE-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase return shape draft failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, returnDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres draft return cancel to be rejected, got %v", err)
	}
	if _, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-SHAPE-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return_no unique constraint, got %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:     returnDraft.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     mustDecimal(t, "1"),
		SourceLineNo: stringPtr("same-line"),
	}); err != nil {
		t.Fatalf("create postgres return source line item failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:     returnDraft.ID,
		MaterialID:   fixtures.materialID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     mustDecimal(t, "1"),
		SourceLineNo: stringPtr("same-line"),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return source_line_no unique constraint, got %v", err)
	}
	if _, err := client.PurchaseReturnItem.Create().
		SetReturnID(returnDraft.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return quantity DB check, got %v", err)
	}
	if _, err := client.PurchaseReturnItem.Create().
		SetReturnID(returnDraft.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitPrice(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return unit_price DB check, got %v", err)
	}
	if _, err := client.PurchaseReturnItem.Create().
		SetReturnID(returnDraft.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "1")).
		SetAmount(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres return amount DB check, got %v", err)
	}
}

func TestPhase2DPostgresPurchaseReturnFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2DPostgresTestData(t)

	fixtures := createPhase2DPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres posted receipt lot_id")
	}
	purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-FLOW-" + fixtures.suffix,
		PurchaseReceiptID: &postedReceipt.ID,
		SupplierName:      "PG退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres purchase return failed: %v", err)
	}
	item, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              purchaseReturn.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
		SourceLineNo:          stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add postgres purchase return item failed: %v", err)
	}

	postedReturn, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("post postgres purchase return failed: %v", err)
	}
	if postedReturn.Status != biz.PurchaseReturnStatusPosted {
		t.Fatalf("expected postgres posted return, got %s", postedReturn.Status)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after return failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "6")

	outTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres purchase return out txn failed: %v", err)
	}
	assertOptionalIntEqual(t, outTxn.LotID, *receiptItem.LotID)

	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    purchaseReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres posted return item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(purchaseReturn.ID).SetStatus(biz.PurchaseReturnStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted return status update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "5")).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted return item quantity update to be rejected")
	}
	if _, err := client.PurchaseReturn.Delete().Where(purchasereturn.ID(purchaseReturn.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted return bulk delete to be rejected")
	}
	if err := client.PurchaseReturnItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres posted return item delete-one to be rejected")
	}

	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat postgres purchase return post failed: %v", err)
	}
	outCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres purchase return out txns failed: %v", err)
	}
	if outCount != 1 {
		t.Fatalf("expected one postgres return out txn after repeat post, got %d", outCount)
	}

	overReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-OVER-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 14, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres over return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    overReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "7"),
	}); err != nil {
		t.Fatalf("add postgres over return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, overReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres over return to fail as insufficient stock, got %v", err)
	}

	cancelled, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("cancel postgres posted purchase return failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReturnStatusCancelled {
		t.Fatalf("expected postgres cancelled return, got %s", cancelled.Status)
	}
	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled return post to be rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    purchaseReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelled return item add to be rejected, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(purchaseReturn.ID).SetSupplierName("PG修改退货供应商").Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return protected update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return item protected update to be rejected")
	}
	if err := client.PurchaseReturn.DeleteOneID(purchaseReturn.ID).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return delete-one to be rejected")
	}
	if _, err := client.PurchaseReturnItem.Delete().Where(purchasereturnitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres cancelled return item bulk delete to be rejected")
	}
	afterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after return cancel failed: %v", err)
	}
	assertDecimalEqual(t, afterCancel.Quantity, "10")
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres return reversal failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres return reversal, got %d", reversalCount)
	}
	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres return reversal failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *receiptItem.LotID)
	traceTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.SourceLineID(item.ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query postgres return trace txns failed: %v", err)
	}
	if len(traceTxns) != 2 {
		t.Fatalf("expected postgres return out and reversal trace txns, got %d", len(traceTxns))
	}
	for _, txn := range traceTxns {
		assertOptionalIntEqual(t, txn.SourceID, purchaseReturn.ID)
		assertOptionalIntEqual(t, txn.SourceLineID, item.ID)
		assertOptionalIntEqual(t, txn.LotID, *receiptItem.LotID)
		if err := client.InventoryTxn.DeleteOneID(txn.ID).Exec(ctx); err == nil {
			t.Fatalf("expected postgres return trace inventory txn delete to be rejected")
		}
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat postgres purchase return cancel failed: %v", err)
	}
	reversalCount, err = client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres return reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("expected one postgres return reversal after repeat cancel, got %d", reversalCount)
	}
}

func TestPhase2DPostgresPurchaseReturnConcurrentLotOutbound(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2DPostgresTestData(t)

	fixtures := createPhase2DPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}
	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CONCURRENT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CONCURRENT-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres concurrent receipt lot_id")
	}

	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			ret, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
				ReturnNo:     fmt.Sprintf("PG-PRTN-CONCURRENT-%s-%02d", fixtures.suffix, i),
				SupplierName: "PG退货供应商",
				ReturnedAt:   time.Date(2026, 4, 26, 15, 0, 0, 0, time.UTC),
			})
			if err != nil {
				errs <- err
				return
			}
			if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
				ReturnID:              ret.ID,
				PurchaseReceiptItemID: &receiptItem.ID,
				MaterialID:            fixtures.materialID,
				WarehouseID:           fixtures.warehouseID,
				UnitID:                fixtures.unitID,
				LotID:                 receiptItem.LotID,
				Quantity:              mustDecimal(t, "1"),
			}); err != nil {
				errs <- err
				return
			}
			_, err = uc.PostPurchaseReturn(ctx, ret.ID)
			errs <- err
		}()
	}
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
			t.Fatalf("unexpected postgres concurrent return error: %v", err)
		}
	}
	if successes > 10 {
		t.Fatalf("postgres concurrent purchase returns must not exceed stock, successes=%d", successes)
	}
	if failures < 10 {
		t.Fatalf("expected at least 10 postgres concurrent return failures, got %d", failures)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres lot balance after concurrent returns failed: %v", err)
	}
	if balance.Quantity.Cmp(decimal.Zero) < 0 {
		t.Fatalf("postgres concurrent purchase returns produced negative balance: %s", balance.Quantity)
	}
	assertDecimalEqual(t, balance.Quantity, fmt.Sprintf("%d", 10-successes))
}

type phase2APostgresFixtures struct {
	suffix      string
	unitID      int
	materialID  int
	productID   int
	warehouseID int
}

type phase2BPostgresFixtures = phase2APostgresFixtures
type phase2CPostgresFixtures = phase2APostgresFixtures
type phase2DPostgresFixtures = phase2APostgresFixtures

func openPhase2APostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PHASE2A_PG_TEST") != "1" {
		t.Skip("set PHASE2A_PG_TEST=1 and PHASE2A_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PHASE2A_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PHASE2A_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PHASE2A_PG_TEST_DB_URL or PHASE2A_DB_URL is required")
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

func openPhase2BPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PHASE2B_PG_TEST") != "1" {
		t.Skip("set PHASE2B_PG_TEST=1 and PHASE2B_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PHASE2B_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PHASE2B_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PHASE2B_PG_TEST_DB_URL or PHASE2B_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open phase2b postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping phase2b postgres failed: %v", err)
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

func openPhase2CPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PHASE2C_PG_TEST") != "1" {
		t.Skip("set PHASE2C_PG_TEST=1 and PHASE2C_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PHASE2C_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PHASE2C_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PHASE2C_PG_TEST_DB_URL or PHASE2C_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open phase2c postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping phase2c postgres failed: %v", err)
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

func openPhase2DPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PHASE2D_PG_TEST") != "1" {
		t.Skip("set PHASE2D_PG_TEST=1 and PHASE2D_PG_TEST_DB_URL to run PostgreSQL integration tests")
	}
	dsn := os.Getenv("PHASE2D_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PHASE2D_DB_URL")
	}
	if dsn == "" {
		t.Fatal("PHASE2D_PG_TEST_DB_URL or PHASE2D_DB_URL is required")
	}

	db, err := stdsql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open phase2d postgres failed: %v", err)
	}
	db.SetMaxOpenConns(30)
	db.SetMaxIdleConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping phase2d postgres failed: %v", err)
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

func createPhase2APostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) phase2APostgresFixtures {
	t.Helper()
	suffix := phase2APostgresSuffix()
	unit := createTestUnit(t, ctx, client, "PGU"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "PG-MAT-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "PG-PRD-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "PG-WH-"+suffix)
	return phase2APostgresFixtures{
		suffix:      suffix,
		unitID:      unit.ID,
		materialID:  material.ID,
		productID:   product.ID,
		warehouseID: warehouse.ID,
	}
}

func createPhase2BPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) phase2BPostgresFixtures {
	t.Helper()
	fixtures := createPhase2APostgresFixtures(t, ctx, client)
	return phase2BPostgresFixtures(fixtures)
}

func createPhase2CPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) phase2CPostgresFixtures {
	t.Helper()
	fixtures := createPhase2APostgresFixtures(t, ctx, client)
	return phase2CPostgresFixtures(fixtures)
}

func createPhase2DPostgresFixtures(t *testing.T, ctx context.Context, client *ent.Client) phase2DPostgresFixtures {
	t.Helper()
	fixtures := createPhase2APostgresFixtures(t, ctx, client)
	return phase2DPostgresFixtures(fixtures)
}

func phase2APostgresSuffix() string {
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
