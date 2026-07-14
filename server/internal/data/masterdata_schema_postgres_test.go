package data

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

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
  AND column_name = 'unit_net_weight_kg'`).Scan(&dataType, &nullable, &precision, &scale); err != nil {
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
  AND conname = 'products_unit_net_weight_kg_positive'`).Scan(&constraintDefinition); err != nil {
		t.Fatalf("read product unit net weight constraint: %v", err)
	}
	if !strings.Contains(constraintDefinition, "unit_net_weight_kg") || !strings.Contains(constraintDefinition, ">") {
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
INSERT INTO products (code, name, default_unit_id, unit_net_weight_kg, created_at, updated_at)
VALUES ($1, '单重约束测试产品', $2, $3, $4, $4)
RETURNING id`, code, unitID, weight, now).Scan(&productID)
		return productID, err
	}
	assertPositiveConstraint := func(name string, err error) {
		t.Helper()
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" || pgErr.ConstraintName != "products_unit_net_weight_kg_positive" {
			t.Fatalf("%s error = %v, want products_unit_net_weight_kg_positive PostgreSQL 23514", name, err)
		}
	}

	nullProductID, err := insertProduct("WEIGHT-NULL-"+suffix, nil)
	if err != nil {
		t.Fatalf("insert product with unknown unit net weight: %v", err)
	}
	var nullWeight *string
	if err := data.sqldb.QueryRowContext(ctx, `SELECT unit_net_weight_kg::text FROM products WHERE id = $1`, nullProductID).Scan(&nullWeight); err != nil {
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
	if err := data.sqldb.QueryRowContext(ctx, `SELECT unit_net_weight_kg::text FROM products WHERE id = $1`, weightedProductID).Scan(&storedWeight); err != nil {
		t.Fatalf("read product unit net weight: %v", err)
	}
	if storedWeight != "0.425000" {
		t.Fatalf("stored product unit net weight = %q, want %q", storedWeight, "0.425000")
	}

	_, err = insertProduct("WEIGHT-ZERO-"+suffix, "0")
	assertPositiveConstraint("insert zero product unit net weight", err)
	_, err = insertProduct("WEIGHT-NEGATIVE-"+suffix, "-0.1")
	assertPositiveConstraint("insert negative product unit net weight", err)
	_, err = data.sqldb.ExecContext(ctx, `UPDATE products SET unit_net_weight_kg = 0 WHERE id = $1`, weightedProductID)
	assertPositiveConstraint("update product unit net weight to zero", err)
}
