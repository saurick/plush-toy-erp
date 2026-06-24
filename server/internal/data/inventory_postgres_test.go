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

	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "PGU"+suffix)
	if _, err := client.Unit.Create().SetCode(unit.Code).SetName("重复单位").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected postgres unit code unique constraint, got %v", err)
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

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "operational_fact_pg_outsourcing_seed",
		IdempotencyKey: "operational-fact-pg-outsourcing-seed-" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed postgres product inventory failed: %v", err)
	}
	fact, err := repo.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "PG-OF-" + fixtures.suffix,
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(2),
		IdempotencyKey: "operational-fact-pg-outsourcing-" + fixtures.suffix,
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
