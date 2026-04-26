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
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"
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
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_receipt_items", "purchasereceiptitem_receipt_id_source_line_no", "source_line_no IS NOT NULL AND source_line_no <> ''")
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
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_return_items", "purchasereturnitem_return_id_source_line_no", "source_line_no IS NOT NULL AND source_line_no <> ''")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_quantity_positive", "quantity > 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_unit_price_non_negative", "unit_price IS NULL OR unit_price >= 0")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_return_items", "purchase_return_items_amount_non_negative", "amount IS NULL OR amount >= 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_return_items", "purchase_return_items_inventory_lots_purchase_return_items", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_returns", "purchase_returns_purchase_receipts_purchase_returns", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_return_items", "purchase_return_items_purchase_receipt_items_purchase_return_it", "NO ACTION")
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

func TestPhase2DBPostgresPurchaseReceiptAdjustmentShapeAndFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2DPostgresTestData(t)

	for _, table := range []string{
		"purchase_receipt_adjustments",
		"purchase_receipt_adjustment_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_adjustment_items", "quantity", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_receipt_adjustments", "purchasereceiptadjustment_adjustment_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_receipt_adjustment_items", "purchasereceiptadjustmentitem_adjustment_id_source_line_no", "source_line_no IS NOT NULL AND source_line_no <> ''")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_adjustment_items", "purchase_receipt_adjustment_items_quantity_positive", "quantity > 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_adjustments", "purchase_receipt_adjustments_purchase_receipts_purchase_receipt", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_adjustment_items", "purchase_receipt_adjustment_items_purchase_receipt_items_purcha", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_adjustment_items", "purchase_receipt_adjustment_items_inventory_lots_purchase_recei", "NO ACTION")

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

	headerOnlyReceipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("PG-PRA-FK-HEAD-" + fixtures.suffix).
		SetSupplierName("PG调整供应商").
		SetStatus(biz.PurchaseReceiptStatusPosted).
		SetReceivedAt(time.Date(2026, 4, 26, 20, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create header-only receipt for adjustment FK test failed: %v", err)
	}
	headerAdjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PG-PRA-FK-HEAD-" + fixtures.suffix,
		PurchaseReceiptID: headerOnlyReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 20, 10, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create header adjustment failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipts WHERE id = $1`, headerOnlyReceipt.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt referenced by adjustment to fail")
	}
	if _, err := client.PurchaseReceiptAdjustment.Get(ctx, headerAdjustment.ID); err != nil {
		t.Fatalf("adjustment should remain after failed receipt delete: %v", err)
	}
	if _, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PG-PRA-FK-HEAD-" + fixtures.suffix,
		PurchaseReceiptID: headerOnlyReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 20, 20, 0, 0, time.UTC),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected adjustment_no unique constraint, got %v", err)
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-FLOW-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-FLOW-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres adjustment receipt lot_id")
	}
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-FLOW-DEC-"+fixtures.suffix, postedReceipt.ID)
	item, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
		SourceLineNo:          stringPtr("same-line"),
	})
	if err != nil {
		t.Fatalf("add postgres adjustment item failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
		SourceLineNo:          stringPtr("same-line"),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected adjustment source_line_no partial unique constraint, got %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(adjustment.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentQuantityDecrease).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetLotID(*receiptItem.LotID).
		SetQuantity(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected adjustment quantity DB check, got %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipt_items WHERE id = $1`, receiptItem.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt_item referenced by adjustment item to fail")
	}

	postedAdjustment, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("post postgres adjustment failed: %v", err)
	}
	if postedAdjustment.Status != biz.PurchaseReceiptAdjustmentStatusPosted {
		t.Fatalf("expected postgres posted adjustment, got %s", postedAdjustment.Status)
	}
	adjustOutTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres adjustment adjust-out txn failed: %v", err)
	}
	assertOptionalIntEqual(t, adjustOutTxn.LotID, *receiptItem.LotID)
	if adjustOutTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentIdempotencyKey(adjustment.ID, item.ID, biz.InventoryTxnAdjustOut) {
		t.Fatalf("unexpected postgres adjustment idempotency key %s", adjustOutTxn.IdempotencyKey)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat postgres adjustment post failed: %v", err)
	}
	adjustOutCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated postgres adjust-out txns failed: %v", err)
	}
	if adjustOutCount != 1 {
		t.Fatalf("repeat adjustment post should keep one adjust-out txn, got %d", adjustOutCount)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres balance after adjustment failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "6")

	if _, err := client.PurchaseReceiptAdjustment.UpdateOneID(adjustment.ID).SetStatus(biz.PurchaseReceiptAdjustmentStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted adjustment status update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "5")).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted adjustment item quantity update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustment.Delete().Where(purchasereceiptadjustment.ID(adjustment.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres adjustment delete to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Delete().Where(purchasereceiptadjustmentitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres adjustment item delete to be rejected")
	}

	cancelledAdjustment, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("cancel postgres adjustment failed: %v", err)
	}
	if cancelledAdjustment.Status != biz.PurchaseReceiptAdjustmentStatusCancelled {
		t.Fatalf("expected postgres cancelled adjustment, got %s", cancelledAdjustment.Status)
	}
	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustOutTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres adjustment reversal txn failed: %v", err)
	}
	if reversalTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentReversalIdempotencyKey(adjustment.ID, item.ID, adjustOutTxn.ID) {
		t.Fatalf("unexpected postgres adjustment reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}
	assertOptionalIntEqual(t, reversalTxn.SourceID, adjustment.ID)
	assertOptionalIntEqual(t, reversalTxn.SourceLineID, item.ID)
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat postgres adjustment cancel failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustOutTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated postgres adjustment reversals failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat adjustment cancel should keep one reversal txn, got %d", reversalCount)
	}
}

func TestPhase2DBPostgresEffectiveReceiptQuantityAndConcurrentAdjustOut(t *testing.T) {
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

	effectiveReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-EFF-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-EFF-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	effectiveItem := effectiveReceipt.Items[0]
	if effectiveItem.LotID == nil {
		t.Fatalf("expected postgres effective receipt lot_id")
	}
	decreaseAdjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-EFF-DEC-"+fixtures.suffix, effectiveReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decreaseAdjustment.ID, effectiveItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, effectiveItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decreaseAdjustment.ID); err != nil {
		t.Fatalf("post postgres effective decrease adjustment failed: %v", err)
	}
	extraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-EFF-EXTRA-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-EFF-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	assertOptionalIntEqual(t, extraStock.Items[0].LotID, *effectiveItem.LotID)
	overEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-EFF-RET-71-"+fixtures.suffix, effectiveReceipt.ID, effectiveItem, invFixtures, mustDecimal(t, "71"))
	if _, err := uc.PostPurchaseReturn(ctx, overEffectiveReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres return over effective receipt quantity to be rejected, got %v", err)
	}
	okEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-EFF-RET-70-"+fixtures.suffix, effectiveReceipt.ID, effectiveItem, invFixtures, mustDecimal(t, "70"))
	if _, err := uc.PostPurchaseReturn(ctx, okEffectiveReturn.ID); err != nil {
		t.Fatalf("post postgres return within effective receipt quantity failed: %v", err)
	}

	increaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-EFF-INCREASE-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-EFF-INCREASE-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	increaseItem := increaseReceipt.Items[0]
	increaseAdjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-EFF-INCREASE-ADJ-"+fixtures.suffix, increaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, increaseAdjustment.ID, increaseItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, increaseItem.LotID, mustDecimal(t, "10"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, increaseAdjustment.ID); err != nil {
		t.Fatalf("post postgres increase adjustment failed: %v", err)
	}
	return110 := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-EFF-INCREASE-RET-110-"+fixtures.suffix, increaseReceipt.ID, increaseItem, invFixtures, mustDecimal(t, "110"))
	if _, err := uc.PostPurchaseReturn(ctx, return110.ID); err != nil {
		t.Fatalf("post postgres return against increased quantity failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, increaseAdjustment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelling increase below returned quantity to be rejected, got %v", err)
	}

	returnLimitReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-RET-LIMIT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-RET-LIMIT-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	returnLimitItem := returnLimitReceipt.Items[0]
	return80 := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-RET-LIMIT-80-"+fixtures.suffix, returnLimitReceipt.ID, returnLimitItem, invFixtures, mustDecimal(t, "80"))
	if _, err := uc.PostPurchaseReturn(ctx, return80.ID); err != nil {
		t.Fatalf("post postgres return 80 before adjustment failed: %v", err)
	}
	decrease21 := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-RET-LIMIT-DEC21-"+fixtures.suffix, returnLimitReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decrease21.ID, returnLimitItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnLimitItem.LotID, mustDecimal(t, "21"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease21.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres adjustment decrease below returned quantity to be rejected, got %v", err)
	}

	rollbackReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-ROLLBACK-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-ROLLBACK-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	rollbackItem := rollbackReceipt.Items[0]
	if rollbackItem.LotID == nil {
		t.Fatalf("expected postgres rollback receipt lot_id")
	}
	rollbackNewLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-PRA-ROLLBACK-NEW-LOT-"+fixtures.suffix)
	rollbackAdjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-ROLLBACK-ADJ-"+fixtures.suffix, rollbackReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, rollbackAdjustment.ID, rollbackItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, rollbackItem.LotID, mustDecimal(t, "1"), nil)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, rollbackAdjustment.ID, rollbackItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, rollbackItem.LotID, mustDecimal(t, "12"), stringPtr("ROLLBACK"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, rollbackAdjustment.ID, rollbackItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &rollbackNewLot.ID, mustDecimal(t, "12"), stringPtr("ROLLBACK"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, rollbackAdjustment.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres partial adjustment to rollback on later insufficient stock, got %v", err)
	}
	rollbackTxnCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(rollbackAdjustment.ID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres rollback adjustment txns failed: %v", err)
	}
	if rollbackTxnCount != 0 {
		t.Fatalf("failed postgres adjustment should not leave partial txns, got %d", rollbackTxnCount)
	}
	rollbackOldBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       rollbackItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get rollback old lot balance failed: %v", err)
	}
	assertDecimalEqual(t, rollbackOldBalance.Quantity, "10")
	if rollbackNewBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &rollbackNewLot.ID,
		UnitID:      fixtures.unitID,
	}); err == nil {
		assertDecimalEqual(t, rollbackNewBalance.Quantity, "0")
	} else if !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("unexpected rollback new lot balance error: %v", err)
	}

	concurrentReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-CONCURRENT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-CONCURRENT-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	concurrentItem := concurrentReceipt.Items[0]
	if concurrentItem.LotID == nil {
		t.Fatalf("expected postgres concurrent adjustment lot_id")
	}
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			adj, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
				AdjustmentNo:      fmt.Sprintf("PG-PRA-CONCURRENT-%s-%02d", fixtures.suffix, i),
				PurchaseReceiptID: concurrentReceipt.ID,
				AdjustedAt:        time.Date(2026, 4, 26, 21, 0, 0, 0, time.UTC),
			})
			if err != nil {
				errs <- err
				return
			}
			if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
				AdjustmentID:          adj.ID,
				PurchaseReceiptItemID: concurrentItem.ID,
				AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease,
				MaterialID:            fixtures.materialID,
				WarehouseID:           fixtures.warehouseID,
				UnitID:                fixtures.unitID,
				LotID:                 concurrentItem.LotID,
				Quantity:              mustDecimal(t, "1"),
			}); err != nil {
				errs <- err
				return
			}
			_, err = uc.PostPurchaseReceiptAdjustment(ctx, adj.ID)
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
		case errors.Is(err, biz.ErrInventoryInsufficientStock) || errors.Is(err, biz.ErrBadParam):
			failures++
		default:
			t.Fatalf("unexpected postgres concurrent adjustment error: %v", err)
		}
	}
	if successes > 10 {
		t.Fatalf("postgres concurrent adjustments must not exceed stock, successes=%d", successes)
	}
	if failures < 10 {
		t.Fatalf("expected at least 10 postgres concurrent adjustment failures, got %d", failures)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       concurrentItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres concurrent adjustment balance failed: %v", err)
	}
	if balance.Quantity.Cmp(decimal.Zero) < 0 {
		t.Fatalf("postgres concurrent adjustments produced negative balance: %s", balance.Quantity)
	}
	assertDecimalEqual(t, balance.Quantity, fmt.Sprintf("%d", 10-successes))
}

func TestPhase2DPostgresLotStatusGuardAndReturnException(t *testing.T) {
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

	for _, status := range []string{biz.InventoryLotHold, biz.InventoryLotRejected} {
		status := status
		receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-GUARD-IN-"+status+"-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-GUARD-LOT-"+status+"-"+fixtures.suffix), mustDecimal(t, "5"))
		item := receipt.Items[0]
		if item.LotID == nil {
			t.Fatalf("expected postgres %s guard lot_id", status)
		}
		changeLotToStatus(t, ctx, uc, *item.LotID, status)
		if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      fixtures.materialID,
			WarehouseID:    fixtures.warehouseID,
			LotID:          item.LotID,
			TxnType:        biz.InventoryTxnAdjustOut,
			Direction:      -1,
			Quantity:       mustDecimal(t, "1"),
			UnitID:         fixtures.unitID,
			SourceType:     "PG_STATUS_GUARD",
			IdempotencyKey: "pg-status-guard-adjust-out-" + status + "-" + fixtures.suffix,
		}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
			t.Fatalf("expected postgres %s ADJUST_OUT to be blocked, got %v", status, err)
		}
	}

	for _, status := range []string{biz.InventoryLotHold, biz.InventoryLotRejected} {
		status := status
		receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-RETURN-IN-"+status+"-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-RETURN-LOT-"+status+"-"+fixtures.suffix), mustDecimal(t, "5"))
		item := receipt.Items[0]
		if item.LotID == nil {
			t.Fatalf("expected postgres %s return lot_id", status)
		}
		changeLotToStatus(t, ctx, uc, *item.LotID, status)
		purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-STATUS-RETURN-"+status+"-"+fixtures.suffix, receipt.ID, item, invFixtures, mustDecimal(t, "2"))
		if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
			t.Fatalf("expected postgres %s purchase return to succeed, got %v", status, err)
		}
		balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
			SubjectType: biz.InventorySubjectMaterial,
			SubjectID:   fixtures.materialID,
			WarehouseID: fixtures.warehouseID,
			LotID:       item.LotID,
			UnitID:      fixtures.unitID,
		})
		if err != nil {
			t.Fatalf("get postgres %s return balance failed: %v", status, err)
		}
		assertDecimalEqual(t, balance.Quantity, "3")
	}

	disabledReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-RETURN-DISABLED-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-RETURN-DISABLED-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	disabledItem := disabledReceipt.Items[0]
	if disabledItem.LotID == nil {
		t.Fatalf("expected postgres DISABLED return lot_id")
	}
	if _, err := client.InventoryLot.UpdateOneID(*disabledItem.LotID).SetStatus(biz.InventoryLotDisabled).Save(ctx); err != nil {
		t.Fatalf("force postgres lot to DISABLED fixture failed: %v", err)
	}
	disabledReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-STATUS-RETURN-DISABLED-"+fixtures.suffix, disabledReceipt.ID, disabledItem, invFixtures, mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReturn(ctx, disabledReturn.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected postgres DISABLED purchase return to be blocked, got %v", err)
	}

	receiptCancel := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-REV-RECEIPT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-REV-RECEIPT-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	receiptCancelItem := receiptCancel.Items[0]
	if receiptCancelItem.LotID == nil {
		t.Fatalf("expected postgres receipt reversal lot_id")
	}
	changeLotToStatus(t, ctx, uc, *receiptCancelItem.LotID, biz.InventoryLotHold)
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receiptCancel.ID); err != nil {
		t.Fatalf("expected postgres purchase receipt reversal to ignore HOLD lot status, got %v", err)
	}

	returnCancelReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-REV-RETURN-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-REV-RETURN-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	returnCancelItem := returnCancelReceipt.Items[0]
	if returnCancelItem.LotID == nil {
		t.Fatalf("expected postgres return reversal lot_id")
	}
	returnCancel := createLinkedPurchaseReturn(t, ctx, uc, "PG-STATUS-REV-RETURN-"+fixtures.suffix, returnCancelReceipt.ID, returnCancelItem, invFixtures, mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReturn(ctx, returnCancel.ID); err != nil {
		t.Fatalf("post postgres return before reversal status failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *returnCancelItem.LotID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReturn(ctx, returnCancel.ID); err != nil {
		t.Fatalf("expected postgres purchase return reversal to ignore REJECTED lot status, got %v", err)
	}

	adjustmentReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-REV-ADJ-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-REV-ADJ-OLD-"+fixtures.suffix), mustDecimal(t, "5"))
	adjustmentItem := adjustmentReceipt.Items[0]
	if adjustmentItem.LotID == nil {
		t.Fatalf("expected postgres adjustment reversal lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-STATUS-REV-ADJ-NEW-"+fixtures.suffix)
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-STATUS-REV-ADJ-"+fixtures.suffix, adjustmentReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, adjustmentItem.LotID, mustDecimal(t, "2"), stringPtr("PG-STATUS-REV-ADJ"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "2"), stringPtr("PG-STATUS-REV-ADJ"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("post postgres adjustment before reversal status failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *adjustmentItem.LotID, biz.InventoryLotHold)
	changeLotToStatus(t, ctx, uc, newLot.ID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("expected postgres adjustment reversal to ignore HOLD/REJECTED lot status, got %v", err)
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

func TestPhase2DPostgresPurchaseReturnOriginFKDeleteRules(t *testing.T) {
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

	headerOnlyReceipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("PG-PRTN-FK-HEAD-" + fixtures.suffix).
		SetSupplierName("PG退货供应商").
		SetStatus(biz.PurchaseReceiptStatusPosted).
		SetReceivedAt(time.Date(2026, 4, 26, 16, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create header-only receipt for return FK test failed: %v", err)
	}
	purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-FK-HEAD-RET-" + fixtures.suffix,
		PurchaseReceiptID: &headerOnlyReceipt.ID,
		SupplierName:      "PG退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 16, 10, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create return linked to header-only receipt failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipts WHERE id = $1`, headerOnlyReceipt.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt referenced by purchase_return to fail")
	}
	persistedReturn, err := client.PurchaseReturn.Get(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("get purchase return after failed origin receipt delete failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedReturn.PurchaseReceiptID, headerOnlyReceipt.ID)

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-FK-ITEM-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-FK-ITEM-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected receipt item FK test lot_id")
	}
	itemReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PG-PRTN-FK-ITEM-RET-" + fixtures.suffix,
		SupplierName: "PG退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 16, 20, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create return for receipt item FK test failed: %v", err)
	}
	returnItem, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              itemReturn.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	})
	if err != nil {
		t.Fatalf("add return item linked to receipt item failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipt_items WHERE id = $1`, receiptItem.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt_item referenced by purchase_return_item to fail")
	}
	persistedReturnItem, err := client.PurchaseReturnItem.Get(ctx, returnItem.ID)
	if err != nil {
		t.Fatalf("get purchase return item after failed origin receipt item delete failed: %v", err)
	}
	assertOptionalIntEqual(t, persistedReturnItem.PurchaseReceiptItemID, receiptItem.ID)
}

func TestPhase2DPostgresPurchaseReturnReceiptItemCumulativeLimit(t *testing.T) {
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

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres cumulative receipt lot_id")
	}
	createLinkedReturn := func(returnNo string, quantity decimal.Decimal) *biz.PurchaseReturn {
		t.Helper()
		purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
			ReturnNo:          returnNo,
			PurchaseReceiptID: &postedReceipt.ID,
			SupplierName:      "PG累计退货供应商",
			ReturnedAt:        time.Date(2026, 4, 26, 17, 0, 0, 0, time.UTC),
		})
		if err != nil {
			t.Fatalf("create postgres linked return %s failed: %v", returnNo, err)
		}
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              purchaseReturn.ID,
			PurchaseReceiptItemID: &receiptItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 receiptItem.LotID,
			Quantity:              quantity,
		}); err != nil {
			t.Fatalf("add postgres linked return item %s failed: %v", returnNo, err)
		}
		return purchaseReturn
	}

	return60 := createLinkedReturn("PG-PRTN-CUM-060-"+fixtures.suffix, mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("post postgres 60 cumulative return failed: %v", err)
	}
	return40 := createLinkedReturn("PG-PRTN-CUM-040-"+fixtures.suffix, mustDecimal(t, "40"))
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("post postgres 40 cumulative return failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("repeat postgres post 40 cumulative return should be idempotent, got %v", err)
	}
	outCount40, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(return40.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres repeated cumulative return out txns failed: %v", err)
	}
	if outCount40 != 1 {
		t.Fatalf("repeat postgres post should keep one out txn, got %d", outCount40)
	}

	extraStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-EXTRA-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	assertOptionalIntEqual(t, extraStockReceipt.Items[0].LotID, *receiptItem.LotID)
	overOriginal := createLinkedReturn("PG-PRTN-CUM-OVER-"+fixtures.suffix, mustDecimal(t, "1"))
	if _, err := uc.PostPurchaseReturn(ctx, overOriginal.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cumulative over-return to be rejected even with stock available, got %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("cancel postgres 60 cumulative return failed: %v", err)
	}
	releasedReturn := createLinkedReturn("PG-PRTN-CUM-RELEASED-"+fixtures.suffix, mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, releasedReturn.ID); err != nil {
		t.Fatalf("post postgres return after cancellation released quantity failed: %v", err)
	}

	multiLineReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-MULTI-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-MULTI-"+fixtures.suffix), mustDecimal(t, "100"))
	multiLineItem := multiLineReceipt.Items[0]
	if multiLineItem.LotID == nil {
		t.Fatalf("expected postgres multi-line receipt lot_id")
	}
	multiLineReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-CUM-MULTI-" + fixtures.suffix,
		PurchaseReceiptID: &multiLineReceipt.ID,
		SupplierName:      "PG累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres multi-line cumulative return failed: %v", err)
	}
	for _, quantity := range []string{"70", "31"} {
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              multiLineReturn.ID,
			PurchaseReceiptItemID: &multiLineItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 multiLineItem.LotID,
			Quantity:              mustDecimal(t, quantity),
		}); err != nil {
			t.Fatalf("add postgres multi-line cumulative item %s failed: %v", quantity, err)
		}
	}
	if _, err := uc.PostPurchaseReturn(ctx, multiLineReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres same-return multi-line over original receipt item to be rejected, got %v", err)
	}

	lowStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRTN-CUM-IN-LOW-"+fixtures.suffix, invFixtures, stringPtr("PG-PRTN-CUM-LOT-LOW-"+fixtures.suffix), mustDecimal(t, "100"))
	lowStockItem := lowStockReceipt.Items[0]
	if lowStockItem.LotID == nil {
		t.Fatalf("expected postgres low-stock receipt lot_id")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          lowStockItem.LotID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "95"),
		UnitID:         fixtures.unitID,
		SourceType:     "PG_TEST_LOW_STOCK_CONSUME",
		IdempotencyKey: "pg-test-low-stock-before-linked-return-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("consume postgres low-stock lot before linked return failed: %v", err)
	}
	lowStockReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PG-PRTN-CUM-LOW-STOCK-" + fixtures.suffix,
		PurchaseReceiptID: &lowStockReceipt.ID,
		SupplierName:      "PG累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 19, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create postgres low-stock return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              lowStockReturn.ID,
		PurchaseReceiptItemID: &lowStockItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 lowStockItem.LotID,
		Quantity:              mustDecimal(t, "10"),
	}); err != nil {
		t.Fatalf("add postgres low-stock return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, lowStockReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres linked return within original quantity but over current stock to be rejected, got %v", err)
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
		case errors.Is(err, biz.ErrInventoryInsufficientStock) || errors.Is(err, biz.ErrBadParam):
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

func TestPhase2DC2PostgresQualityInspectionShapeAndFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPhase2DPostgresTestData(t)

	for _, table := range []string{"quality_inspections"} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	for _, column := range []string{
		"inspection_no",
		"purchase_receipt_id",
		"purchase_receipt_item_id",
		"inventory_lot_id",
		"material_id",
		"warehouse_id",
		"status",
		"result",
		"original_lot_status",
		"inspected_at",
		"inspector_id",
		"decision_note",
		"created_at",
		"updated_at",
	} {
		assertPostgresColumnExists(t, data.sqldb, "quality_inspections", column)
	}
	assertPostgresUniqueIndex(t, data.sqldb, "quality_inspections", "qualityinspection_inspection_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "quality_inspections", "qualityinspection_inventory_lot_id_submitted", "status = 'SUBMITTED'")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_purchase_receipts_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_purchase_receipt_items_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_inventory_lots_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_materials_quality_inspections", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "quality_inspections", "quality_inspections_warehouses_quality_inspections", "NO ACTION")

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

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-QI-PASS-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-QI-PASS-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres quality receipt lot_id")
	}
	qualityTxnCount := inventoryTxnCount(t, ctx, client)
	draft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "PG-QI-PASS-"+fixtures.suffix, postedReceipt, invFixtures)
	assertInventoryTxnCount(t, ctx, client, qualityTxnCount)
	if _, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          "PG-QI-PASS-" + fixtures.suffix,
		PurchaseReceiptID:     postedReceipt.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		InventoryLotID:        *receiptItem.LotID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres inspection_no unique constraint, got %v", err)
	}
	submitted, err := uc.SubmitQualityInspection(ctx, draft.ID)
	if err != nil {
		t.Fatalf("submit postgres quality inspection failed: %v", err)
	}
	if submitted.Status != biz.QualityInspectionStatusSubmitted || submitted.OriginalLotStatus != biz.InventoryLotActive {
		t.Fatalf("unexpected postgres submitted quality state: %+v", submitted)
	}
	assertLotStatus(t, ctx, uc, *receiptItem.LotID, biz.InventoryLotHold)
	assertInventoryTxnCount(t, ctx, client, qualityTxnCount)
	if _, err := client.QualityInspection.Create().
		SetInspectionNo("PG-QI-PASS-SUBMITTED-DUP-" + fixtures.suffix).
		SetPurchaseReceiptID(postedReceipt.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetInventoryLotID(*receiptItem.LotID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetStatus(biz.QualityInspectionStatusSubmitted).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres SUBMITTED partial unique constraint, got %v", err)
	}
	passed, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: draft.ID,
		Result:       biz.QualityInspectionResultConcession,
		InspectedAt:  time.Date(2026, 4, 26, 12, 30, 0, 0, time.UTC),
		DecisionNote: stringPtr("让步接收"),
	})
	if err != nil {
		t.Fatalf("pass postgres quality inspection failed: %v", err)
	}
	if passed.Status != biz.QualityInspectionStatusPassed || passed.Result == nil || *passed.Result != biz.QualityInspectionResultConcession {
		t.Fatalf("unexpected postgres passed quality state: %+v", passed)
	}
	assertLotStatus(t, ctx, uc, *receiptItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, qualityTxnCount)

	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipt_items WHERE id = $1`, receiptItem.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt_item referenced by quality_inspection to fail")
	}
	if _, err := client.PurchaseReceiptItem.Get(ctx, receiptItem.ID); err != nil {
		t.Fatalf("receipt item should remain after failed quality FK delete: %v", err)
	}

	headerReceipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("PG-QI-FK-HEAD-" + fixtures.suffix).
		SetSupplierName("PG质检供应商").
		SetStatus(biz.PurchaseReceiptStatusPosted).
		SetReceivedAt(time.Date(2026, 4, 26, 13, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create header receipt for postgres quality FK test failed: %v", err)
	}
	manualLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-QI-FK-LOT-"+fixtures.suffix)
	headerInspection, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:      "PG-QI-FK-HEAD-" + fixtures.suffix,
		PurchaseReceiptID: headerReceipt.ID,
		InventoryLotID:    manualLot.ID,
		MaterialID:        fixtures.materialID,
		WarehouseID:       fixtures.warehouseID,
	})
	if err != nil {
		t.Fatalf("create header quality inspection for FK test failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipts WHERE id = $1`, headerReceipt.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt referenced by quality_inspection to fail")
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM inventory_lots WHERE id = $1`, manualLot.ID); err == nil {
		t.Fatalf("expected direct SQL delete of inventory_lot referenced by quality_inspection to fail")
	}
	if _, err := client.QualityInspection.Get(ctx, headerInspection.ID); err != nil {
		t.Fatalf("quality inspection should remain after failed FK deletes: %v", err)
	}

	rejectReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-QI-REJECT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-QI-REJECT-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	rejectDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "PG-QI-REJECT-"+fixtures.suffix, rejectReceipt, invFixtures)
	if _, err := uc.SubmitQualityInspection(ctx, rejectDraft.ID); err != nil {
		t.Fatalf("submit postgres reject quality fixture failed: %v", err)
	}
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID}); err != nil {
		t.Fatalf("reject postgres quality inspection failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *rejectReceipt.Items[0].LotID, biz.InventoryLotRejected)

	cancelReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-QI-CANCEL-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-QI-CANCEL-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	cancelDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "PG-QI-CANCEL-"+fixtures.suffix, cancelReceipt, invFixtures)
	if _, err := uc.SubmitQualityInspection(ctx, cancelDraft.ID); err != nil {
		t.Fatalf("submit postgres cancel quality fixture failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *cancelReceipt.Items[0].LotID, biz.InventoryLotHold)
	cancelled, err := uc.CancelQualityInspection(ctx, cancelDraft.ID, nil)
	if err != nil {
		t.Fatalf("cancel postgres submitted quality inspection failed: %v", err)
	}
	if cancelled.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected postgres cancelled quality inspection, got %s", cancelled.Status)
	}
	assertLotStatus(t, ctx, uc, *cancelReceipt.Items[0].LotID, biz.InventoryLotActive)
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
