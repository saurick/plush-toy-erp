package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"server/internal/data"
	"server/internal/devdbguard"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
	"gopkg.in/yaml.v3"
)

type bootstrapConfig struct {
	Data struct {
		Postgres struct {
			DSN string `yaml:"dsn"`
		} `yaml:"postgres"`
	} `yaml:"data"`
}

const (
	manualAcceptanceReferenceDatabase = "plush_erp_acceptance_20260716_v5_dev"
	manualAcceptanceReferenceConfirm  = "SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES:local-dev:plush_erp_acceptance_20260716_v5_dev:2026.07.16-v5:20260716-V5"
)

func main() {
	confPath := flag.String("conf", "./configs/dev/config.yaml", "config yaml path")
	prefix := flag.String("prefix", data.CoreDemoSeedPrefix, "simulated seed code prefix; must start with SIM-")
	referencesOnly := flag.Bool("references-only", false, "seed only the exact V5 acceptance unit and four warehouses")
	expectedDatabase := flag.String("expected-database", "", "exact dedicated acceptance database; required with --references-only")
	confirmation := flag.String("confirm", "", "exact non-secret acceptance reference confirmation; required with --references-only")
	allowProd := flag.Bool("allow-prod", false, "allow seeding when config path or environment looks like production")
	timeout := flag.Duration("timeout", 15*time.Second, "database operation timeout")
	flag.Parse()

	if err := guardProduction(*confPath, *allowProd); err != nil {
		fail("%v", err)
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
	if *referencesOnly {
		if err := validateManualAcceptanceReferenceTarget(dsn, *expectedDatabase, *confirmation); err != nil {
			fail("%v", err)
		}
	} else if strings.TrimSpace(*expectedDatabase) != "" || strings.TrimSpace(*confirmation) != "" {
		fail("--expected-database and --confirm are only valid with --references-only")
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

	result, err := seedCoreDemo(ctx, db, *prefix, *referencesOnly)
	if err != nil {
		fail("seed core demo data failed: %v", err)
	}

	fmt.Printf("core demo seed completed prefix=%s units=%d materials=%d products=%d warehouses=%d processes=%d bom_headers=%d\n",
		result.Prefix,
		len(result.UnitIDs),
		len(result.MaterialIDs),
		len(result.ProductIDs),
		len(result.WarehouseIDs),
		len(result.ProcessIDs),
		len(result.BOMHeaderIDs),
	)
	fmt.Println("simulated_only=true real_customer_import=false no_business_records=true no_direct_fact_posting=true")
	if *referencesOnly {
		fmt.Println("references_only=true exact_allowlist=true materials=0 products=0 processes=0 bom_headers=0")
		fmt.Printf("primary_unit_id=%d primary_warehouse_id=%d\n",
			result.PrimaryUnitID,
			result.PrimaryWarehouseID,
		)
		printIDs("unit", result.UnitIDs)
		printIDs("warehouse", result.WarehouseIDs)
		return
	}
	fmt.Printf("primary_unit_id=%d primary_product_id=%d primary_warehouse_id=%d\n",
		result.PrimaryUnitID,
		result.PrimaryProductID,
		result.PrimaryWarehouseID,
	)
	fmt.Printf("trial_sim_args=--product-id %d --unit-id %d\n", result.PrimaryProductID, result.PrimaryUnitID)
	fmt.Printf("operational_fact_args=--product-id %d --unit-id %d --warehouse-id %d\n",
		result.PrimaryProductID,
		result.PrimaryUnitID,
		result.PrimaryWarehouseID,
	)
	printIDs("unit", result.UnitIDs)
	printIDs("material", result.MaterialIDs)
	printIDs("product", result.ProductIDs)
	printIDs("warehouse", result.WarehouseIDs)
	printIDs("process", result.ProcessIDs)
	printIDs("bom_header_by_product", result.BOMHeaderIDs)
}

func validateManualAcceptanceReferenceTarget(dsn, expectedDatabase, confirmation string) error {
	if strings.TrimSpace(expectedDatabase) != manualAcceptanceReferenceDatabase {
		return fmt.Errorf("references-only expected database must be %q", manualAcceptanceReferenceDatabase)
	}
	if confirmation != manualAcceptanceReferenceConfirm {
		return fmt.Errorf("references-only confirmation must equal %s", manualAcceptanceReferenceConfirm)
	}
	parsed, err := url.Parse(strings.TrimSpace(dsn))
	if err != nil || parsed == nil ||
		(parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") ||
		parsed.Opaque != "" || parsed.Fragment != "" ||
		parsed.Hostname() != "192.168.0.106" || parsed.Port() != "5432" ||
		parsed.Path != "/"+manualAcceptanceReferenceDatabase {
		return fmt.Errorf("references-only DSN must target the registered local acceptance database")
	}
	query := parsed.Query()
	sslModes, ok := query["sslmode"]
	if len(query) != 1 || !ok || len(sslModes) != 1 || sslModes[0] != "disable" {
		return fmt.Errorf("references-only DSN query must contain only sslmode=disable")
	}
	config, err := pgconn.ParseConfig(dsn)
	if err != nil || config == nil || strings.TrimSpace(config.Host) != "192.168.0.106" ||
		config.Port != 5432 || strings.TrimSpace(config.Database) != manualAcceptanceReferenceDatabase ||
		len(config.Fallbacks) != 0 || config.TLSConfig != nil {
		return fmt.Errorf("references-only resolved DSN must be the single registered local acceptance database")
	}
	return nil
}

func seedCoreDemo(ctx context.Context, db *sql.DB, prefix string, referencesOnly bool) (*data.CoreDemoSeedResult, error) {
	if referencesOnly {
		if strings.TrimSpace(prefix) != data.CoreDemoSeedPrefix {
			return nil, fmt.Errorf("references-only does not accept a custom prefix")
		}
		return data.SeedCoreDemoReferences(ctx, db, data.DefaultCoreDemoReferenceSeedDataset())
	}
	return data.SeedCoreDemoData(ctx, db, data.DefaultCoreDemoSeedDataset(prefix))
}

func printIDs(label string, ids map[string]int) {
	keys := make([]string, 0, len(ids))
	for key := range ids {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		fmt.Printf("%s_id[%s]=%d\n", label, key, ids[key])
	}
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
		return fmt.Errorf("refuse to seed core demo data with prod config; pass --allow-prod only for an intentional controlled operation")
	}
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV"} {
		if strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "prod") || strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "production") {
			return fmt.Errorf("refuse to seed core demo data when %s=%s; pass --allow-prod only for an intentional controlled operation", key, os.Getenv(key))
		}
	}
	return nil
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
