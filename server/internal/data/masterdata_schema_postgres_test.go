package data

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/shopspring/decimal"
)

func TestNetWeightGramMigrationPreservesAndConvertsExistingValues(t *testing.T) {
	migrationSQL, err := os.ReadFile(filepath.Join("model", "migrate", "20260715161753_migrate.sql"))
	if err != nil {
		t.Fatalf("read net-weight gram migration: %v", err)
	}
	sql := string(migrationSQL)
	for _, fragment := range []string{
		`RENAME COLUMN "unit_net_weight_kg" TO "unit_net_weight_g"`,
		`RENAME COLUMN "unit_net_weight_kg_snapshot" TO "unit_net_weight_g_snapshot"`,
		`RENAME COLUMN "total_net_weight_kg" TO "total_net_weight_g"`,
		`RENAME COLUMN "requested_total_net_weight_kg" TO "requested_total_net_weight_g"`,
		`SET "unit_net_weight_g" = "unit_net_weight_g" * 1000`,
		`SET "total_net_weight_g" = "total_net_weight_g" * 1000`,
		`"requested_total_net_weight_g" = "requested_total_net_weight_g" * 1000`,
	} {
		if !strings.Contains(sql, fragment) {
			t.Errorf("net-weight gram migration missing %q", fragment)
		}
	}
	if strings.Contains(sql, `DROP COLUMN "unit_net_weight_kg`) ||
		strings.Contains(sql, `DROP COLUMN "total_net_weight_kg`) ||
		strings.Contains(sql, `DROP COLUMN "requested_total_net_weight_kg`) {
		t.Fatal("net-weight gram migration must rename and convert existing values instead of dropping weight columns")
	}
}

func TestMasterDataSchemaPostgresProductUnitNetWeightConstraint(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	suffix := strings.ToUpper(postgresTestSuffix())
	now := time.Now().UTC()

	var dataType, nullable string
	var precision, scale int
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT data_type, is_nullable, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'products'
  AND column_name = 'unit_net_weight_g'`).Scan(&dataType, &nullable, &precision, &scale); err != nil {
		t.Fatalf("read product unit net weight column shape: %v", err)
	}
	if dataType != "numeric" || nullable != "YES" || precision != 20 || scale != 6 {
		t.Fatalf("unexpected product unit net weight shape: type=%s nullable=%s precision=%d scale=%d", dataType, nullable, precision, scale)
	}

	var constraintDefinition string
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'products'::regclass
  AND conname = 'products_unit_net_weight_g_positive'`).Scan(&constraintDefinition); err != nil {
		t.Fatalf("read product unit net weight constraint: %v", err)
	}
	if !strings.Contains(constraintDefinition, "unit_net_weight_g") || !strings.Contains(constraintDefinition, ">") {
		t.Fatalf("unexpected product unit net weight constraint: %s", constraintDefinition)
	}

	var unitID int
	if err := data.sqldb.QueryRowContext(ctx, `
INSERT INTO units (code, name, created_at, updated_at)
VALUES ($1, '件', $2, $2)
RETURNING id`, "WEIGHT-UNIT-"+suffix, now).Scan(&unitID); err != nil {
		t.Fatalf("insert product weight unit: %v", err)
	}

	insertProduct := func(code string, weight any) (int, error) {
		t.Helper()
		var productID int
		err := data.sqldb.QueryRowContext(ctx, `
INSERT INTO products (code, name, default_unit_id, unit_net_weight_g, created_at, updated_at)
VALUES ($1, '单重约束测试产品', $2, $3, $4, $4)
RETURNING id`, code, unitID, weight, now).Scan(&productID)
		return productID, err
	}
	assertPositiveConstraint := func(name string, err error) {
		t.Helper()
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" || pgErr.ConstraintName != "products_unit_net_weight_g_positive" {
			t.Fatalf("%s error = %v, want products_unit_net_weight_g_positive PostgreSQL 23514", name, err)
		}
	}

	nullProductID, err := insertProduct("WEIGHT-NULL-"+suffix, nil)
	if err != nil {
		t.Fatalf("insert product with unknown unit net weight: %v", err)
	}
	var nullWeight *string
	if err := data.sqldb.QueryRowContext(ctx, `SELECT unit_net_weight_g::text FROM products WHERE id = $1`, nullProductID).Scan(&nullWeight); err != nil {
		t.Fatalf("read nullable product unit net weight: %v", err)
	}
	if nullWeight != nil {
		t.Fatalf("unknown product unit net weight = %v, want NULL", *nullWeight)
	}

	weightedProductID, err := insertProduct("WEIGHT-VALUE-"+suffix, "0.425000")
	if err != nil {
		t.Fatalf("insert product with unit net weight: %v", err)
	}
	var storedWeight string
	if err := data.sqldb.QueryRowContext(ctx, `SELECT unit_net_weight_g::text FROM products WHERE id = $1`, weightedProductID).Scan(&storedWeight); err != nil {
		t.Fatalf("read product unit net weight: %v", err)
	}
	if storedWeight != "0.425000" {
		t.Fatalf("stored product unit net weight = %q, want %q", storedWeight, "0.425000")
	}

	_, err = insertProduct("WEIGHT-ZERO-"+suffix, "0")
	assertPositiveConstraint("insert zero product unit net weight", err)
	_, err = insertProduct("WEIGHT-NEGATIVE-"+suffix, "-0.1")
	assertPositiveConstraint("insert negative product unit net weight", err)
	_, err = data.sqldb.ExecContext(ctx, `UPDATE products SET unit_net_weight_g = 0 WHERE id = $1`, weightedProductID)
	assertPositiveConstraint("update product unit net weight to zero", err)
}

func TestMasterDataSchemaPostgresSKUAndShipmentNetWeightConstraints(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	suffix := strings.ToUpper(postgresTestSuffix())

	assertPostgresNumericColumn(t, data.sqldb, "product_skus", "unit_net_weight_g", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "shipments", "total_net_weight_g", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "shipments", "requested_total_net_weight_g", 20, 6)
	assertPostgresNumericColumn(t, data.sqldb, "shipment_items", "unit_net_weight_g_snapshot", 20, 6)

	assertCheckConstraint := func(table, name, column string) {
		t.Helper()
		var definition string
		if err := data.sqldb.QueryRowContext(ctx, `
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = $1::regclass
  AND conname = $2`, table, name).Scan(&definition); err != nil {
			t.Fatalf("read %s constraint: %v", name, err)
		}
		if !strings.Contains(definition, column) {
			t.Fatalf("constraint %s definition = %q, want column %s", name, definition, column)
		}
	}
	assertCheckConstraint("product_skus", "product_skus_unit_net_weight_g_positive", "unit_net_weight_g")
	assertCheckConstraint("product_skus", "product_skus_unit_net_weight_g_requires_default_unit", "default_unit_id")
	assertCheckConstraint("shipments", "shipments_total_net_weight_g_positive", "total_net_weight_g")
	assertCheckConstraint("shipments", "shipments_requested_total_net_weight_g_positive", "requested_total_net_weight_g")
	assertCheckConstraint("shipment_items", "shipment_items_unit_net_weight_g_snapshot_positive", "unit_net_weight_g_snapshot")

	assertConstraintViolation := func(name string, err error) {
		t.Helper()
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" || pgErr.ConstraintName != name {
			t.Fatalf("constraint error = %v, want %s PostgreSQL 23514", err, name)
		}
	}

	unit := createTestUnit(t, ctx, client, "PG-WEIGHT-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "PG-WEIGHT-P-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "PG-WEIGHT-W-"+suffix)
	weight := decimal.RequireFromString("0.425000")
	weightedSKU, err := client.ProductSKU.Create().
		SetProductID(product.ID).
		SetSkuCode("PG-WEIGHT-SKU-" + suffix).
		SetDefaultUnitID(unit.ID).
		SetUnitNetWeightG(weight).
		Save(ctx)
	if err != nil {
		t.Fatalf("create weighted postgres SKU: %v", err)
	}
	if _, err := client.ProductSKU.Create().SetProductID(product.ID).SetSkuCode("PG-WEIGHT-SKU-NULL-" + suffix).Save(ctx); err != nil {
		t.Fatalf("create postgres SKU with unknown weight and unit: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE product_skus SET unit_net_weight_g = 0 WHERE id = $1`, weightedSKU.ID)
	assertConstraintViolation("product_skus_unit_net_weight_g_positive", err)
	_, err = data.sqldb.ExecContext(ctx, `UPDATE product_skus SET default_unit_id = NULL WHERE id = $1`, weightedSKU.ID)
	assertConstraintViolation("product_skus_unit_net_weight_g_requires_default_unit", err)

	shipmentNo := "PG-WEIGHT-SHP-" + suffix
	weightedShipment, err := client.Shipment.Create().
		SetShipmentNo(shipmentNo).
		SetIdempotencyKey(shipmentNo).
		SetTotalNetWeightG(decimal.RequireFromString("4.250000")).
		SetRequestedTotalNetWeightG(decimal.RequireFromString("4.250000")).
		Save(ctx)
	if err != nil {
		t.Fatalf("create weighted postgres shipment: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE shipments SET total_net_weight_g = 0 WHERE id = $1`, weightedShipment.ID)
	assertConstraintViolation("shipments_total_net_weight_g_positive", err)
	_, err = data.sqldb.ExecContext(ctx, `UPDATE shipments SET requested_total_net_weight_g = 0 WHERE id = $1`, weightedShipment.ID)
	assertConstraintViolation("shipments_requested_total_net_weight_g_positive", err)

	historicalNo := "PG-WEIGHT-HISTORY-" + suffix
	historical, err := client.Shipment.Create().SetShipmentNo(historicalNo).SetIdempotencyKey(historicalNo).Save(ctx)
	if err != nil {
		t.Fatalf("create postgres historical-null shipment: %v", err)
	}
	historicalItem, err := client.ShipmentItem.Create().
		SetShipmentID(historical.ID).
		SetProductID(product.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetQuantity(decimal.NewFromInt(1)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create postgres historical-null shipment item: %v", err)
	}
	if historical.TotalNetWeightG != nil || historical.RequestedTotalNetWeightG != nil || historicalItem.UnitNetWeightGSnapshot != nil {
		t.Fatalf("historical nullable shipment weights = current %v requested %v item %v, want nil", historical.TotalNetWeightG, historical.RequestedTotalNetWeightG, historicalItem.UnitNetWeightGSnapshot)
	}

	weightedItem, err := client.ShipmentItem.Create().
		SetShipmentID(weightedShipment.ID).
		SetProductID(product.ID).
		SetProductSkuID(weightedSKU.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetQuantity(decimal.NewFromInt(1)).
		SetUnitNetWeightGSnapshot(weight).
		Save(ctx)
	if err != nil {
		t.Fatalf("create postgres weighted shipment item: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE shipment_items SET unit_net_weight_g_snapshot = 0 WHERE id = $1`, weightedItem.ID)
	assertConstraintViolation("shipment_items_unit_net_weight_g_snapshot_positive", err)
}
