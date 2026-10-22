package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/commandconfig"
	"server/internal/devdbguard"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	simulationPrefix = "SIM-YOYOOSUN-TRIAL"
	defaultUnitCode  = simulationPrefix + "-PCS"
	defaultProduct   = simulationPrefix + "-PRODUCT"
)

func main() {
	confPath := flag.String("conf", "./configs/dev/config.yaml", "config yaml path")
	unitCode := flag.String("unit-code", defaultUnitCode, "simulated unit code")
	unitName := flag.String("unit-name", "只", "simulated unit name")
	productCode := flag.String("product-code", defaultProduct, "simulated product code")
	productName := flag.String("product-name", "毛绒小熊", "simulated product name")
	allowProd := flag.Bool("allow-prod", false, "allow seeding when config path or environment looks like production")
	timeout := flag.Duration("timeout", 15*time.Second, "database operation timeout")
	flag.Parse()

	if err := guardProduction(*confPath, *allowProd); err != nil {
		fail("%v", err)
	}
	if !strings.HasPrefix(*unitCode, simulationPrefix) || !strings.HasPrefix(*productCode, simulationPrefix) {
		fail("unit-code and product-code must start with %s", simulationPrefix)
	}
	if err := biz.ValidateNoNumberedImplementationStageLabels(*unitCode, *unitName, *productCode, *productName); err != nil {
		fail("simulated masterdata naming rejected: %v", err)
	}

	dsn, err := commandconfig.ResolvePostgresDSN(*confPath)
	if err != nil {
		fail("%v", err)
	}
	dsn, err = commandconfig.NormalizePostgresURL(dsn)
	if err != nil {
		fail("parse postgres dsn failed: %v", err)
	}
	if err := devdbguard.RequireLocalDevDSN(*confPath, dsn, os.Getenv); err != nil {
		fail("%v", err)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fail("open postgres failed: %v", err)
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		fail("ping postgres failed: %v", err)
	}

	unitID, err := upsertUnit(ctx, db, *unitCode, *unitName)
	if err != nil {
		fail("seed simulated unit failed: %v", err)
	}
	productID, err := upsertProduct(ctx, db, *productCode, *productName, unitID)
	if err != nil {
		fail("seed simulated product failed: %v", err)
	}

	fmt.Printf("trial simulated masterdata seed completed prefix=%s unit_id=%d product_id=%d\n", simulationPrefix, unitID, productID)
	fmt.Println("simulated_only=true real_customer_import=false no_shipment_inventory_finance_facts=true")
}

func upsertUnit(ctx context.Context, db *sql.DB, code, name string) (int, error) {
	var id int
	err := db.QueryRowContext(ctx, `
INSERT INTO units (code, name, precision, is_active, created_at, updated_at)
VALUES ($1, $2, 0, true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  updated_at = NOW()
RETURNING id
`, strings.TrimSpace(code), strings.TrimSpace(name)).Scan(&id)
	return id, err
}

func upsertProduct(ctx context.Context, db *sql.DB, code, name string, unitID int) (int, error) {
	var id int
	err := db.QueryRowContext(ctx, `
INSERT INTO products (code, name, style_no, customer_style_no, default_unit_id, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $3, $4, true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  style_no = EXCLUDED.style_no,
  customer_style_no = EXCLUDED.customer_style_no,
  default_unit_id = EXCLUDED.default_unit_id,
  is_active = true,
  updated_at = NOW()
RETURNING id
`, strings.TrimSpace(code), strings.TrimSpace(name), code+"-STYLE", unitID).Scan(&id)
	return id, err
}

func guardProduction(confPath string, allowProd bool) error {
	if allowProd {
		return nil
	}
	normalizedConf := filepath.ToSlash(strings.ToLower(confPath))
	if strings.Contains(normalizedConf, "/prod/") || strings.Contains(normalizedConf, "configs/prod") {
		return fmt.Errorf("refuse to seed trial simulated masterdata with prod config; pass --allow-prod only for an intentional controlled operation")
	}
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV"} {
		if strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "prod") || strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "production") {
			return fmt.Errorf("refuse to seed trial simulated masterdata when %s=%s; pass --allow-prod only for an intentional controlled operation", key, os.Getenv(key))
		}
	}
	return nil
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
