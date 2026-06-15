package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/devdbguard"

	_ "github.com/jackc/pgx/v5/stdlib"
	"gopkg.in/yaml.v3"
)

const (
	simulationPrefix = "SIM-YOYOOSUN-TRIAL"
	defaultUnitCode  = simulationPrefix + "-PCS"
	defaultProduct   = simulationPrefix + "-PRODUCT"
)

type bootstrapConfig struct {
	Data struct {
		Postgres struct {
			DSN string `yaml:"dsn"`
		} `yaml:"postgres"`
	} `yaml:"data"`
}

func main() {
	confPath := flag.String("conf", "./configs/dev/config.yaml", "config yaml path")
	unitCode := flag.String("unit-code", defaultUnitCode, "simulated unit code")
	unitName := flag.String("unit-name", "试用模拟单位", "simulated unit name")
	productCode := flag.String("product-code", defaultProduct, "simulated product code")
	productName := flag.String("product-name", "试用模拟产品", "simulated product name")
	allowProd := flag.Bool("allow-prod", false, "allow seeding when config path or environment looks like production")
	timeout := flag.Duration("timeout", 15*time.Second, "database operation timeout")
	flag.Parse()

	if err := guardProduction(*confPath, *allowProd); err != nil {
		fail("%v", err)
	}
	if !strings.HasPrefix(*unitCode, simulationPrefix) || !strings.HasPrefix(*productCode, simulationPrefix) {
		fail("unit-code and product-code must start with %s", simulationPrefix)
	}

	dsn, err := resolvePostgresDSN(*confPath)
	if err != nil {
		fail("%v", err)
	}
	dsn, err = normalizePostgresURL(dsn)
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
	fmt.Println("simulated_only=true real_customer_import=false no_business_records=true no_shipment_inventory_finance_facts=true")
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

func resolvePostgresDSN(confPath string) (string, error) {
	if dsn := strings.TrimSpace(os.Getenv("POSTGRES_DSN")); dsn != "" {
		return dsn, nil
	}
	cfg, err := readBootstrapConfig(confPath)
	if err != nil {
		return "", err
	}
	dsn := strings.TrimSpace(cfg.Data.Postgres.DSN)
	if localPath := resolveLocalConfPath(confPath); localPath != "" {
		localCfg, err := readBootstrapConfig(localPath)
		if err != nil {
			return "", err
		}
		if localDSN := strings.TrimSpace(localCfg.Data.Postgres.DSN); localDSN != "" {
			dsn = localDSN
		}
	}
	if dsn == "" {
		return "", fmt.Errorf("postgres dsn is empty in %s", confPath)
	}
	return dsn, nil
}

func readBootstrapConfig(path string) (*bootstrapConfig, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config failed: %w", err)
	}
	var cfg bootstrapConfig
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config failed: %w", err)
	}
	return &cfg, nil
}

func normalizePostgresURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", err
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", fmt.Errorf("unsupported scheme %q", u.Scheme)
	}
	if strings.TrimPrefix(u.Path, "/") == "" {
		return "", fmt.Errorf("postgres dsn missing db name")
	}
	q := u.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "disable")
	}
	u.Scheme = "postgres"
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func resolveLocalConfPath(confPath string) string {
	ext := filepath.Ext(confPath)
	if ext == "" {
		return ""
	}
	if strings.HasSuffix(confPath, ".local"+ext) {
		return ""
	}
	localPath := strings.TrimSuffix(confPath, ext) + ".local" + ext
	if fi, err := os.Stat(localPath); err == nil && !fi.IsDir() {
		return localPath
	}
	return ""
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
