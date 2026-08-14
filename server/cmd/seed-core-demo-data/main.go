package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"server/internal/data"
	"server/internal/devdbguard"
	"server/internal/manualacceptance"

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

var manualAcceptanceReferenceDatabasePattern = regexp.MustCompile(`^plush_erp_acceptance_([a-z0-9][a-z0-9_]{2,39})_dev$`)
var scenarioDemoReferenceDatabases = map[string]struct{}{
	"plush_erp":           {},
	"plush_erp_simon_dev": {},
}

func main() {
	confPath := flag.String("conf", "./configs/dev/config.yaml", "config yaml path")
	prefix := flag.String("prefix", data.CoreDemoSeedPrefix, "simulated seed code prefix; must start with SIM-")
	referencesOnly := flag.Bool("references-only", false, "seed only the exact current acceptance units and four warehouses")
	scenarioReferences := flag.Bool("scenario-references", false, "seed only the exact current units and four warehouses in a registered long-lived development database")
	expectedDatabase := flag.String("expected-database", "", "exact guarded database; required with --references-only or --scenario-references")
	confirmation := flag.String("confirm", "", "exact non-secret reference confirmation; required with --references-only or --scenario-references")
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
	if *referencesOnly && *scenarioReferences {
		fail("--references-only and --scenario-references are mutually exclusive")
	}
	if *referencesOnly {
		if err := validateManualAcceptanceReferenceTarget(dsn, *expectedDatabase, *confirmation); err != nil {
			fail("%v", err)
		}
	} else if *scenarioReferences {
		if err := validateScenarioDemoReferenceTarget(dsn, *expectedDatabase, *confirmation); err != nil {
			fail("%v", err)
		}
	} else if strings.TrimSpace(*expectedDatabase) != "" || strings.TrimSpace(*confirmation) != "" {
		fail("--expected-database and --confirm require --references-only or --scenario-references")
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

	referenceMode := *referencesOnly || *scenarioReferences
	result, err := seedCoreDemo(ctx, db, *prefix, referenceMode)
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
	fmt.Println("simulated_only=true real_customer_import=false no_direct_fact_posting=true")
	if referenceMode {
		fmt.Println(referenceModeReadback(*referencesOnly, *scenarioReferences))
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

func referenceModeReadback(referencesOnly, scenarioReferences bool) string {
	return fmt.Sprintf(
		"references_only=%t scenario_references=%t exact_allowlist=true materials=0 products=0 processes=0 bom_headers=0",
		referencesOnly,
		scenarioReferences,
	)
}

func validateScenarioDemoReferenceTarget(dsn, expectedDatabase, confirmation string) error {
	expectedDatabase = strings.TrimSpace(expectedDatabase)
	if _, ok := scenarioDemoReferenceDatabases[expectedDatabase]; !ok {
		return fmt.Errorf("scenario-references expected database must be a registered long-lived development database")
	}
	contract := manualacceptance.Current()
	expectedConfirmation := "SEED_SCENARIO_DEMO_CORE_REFERENCES:scenario-demo:" + expectedDatabase + ":" + contract.DataVersion + ":" + contract.RunID
	if confirmation != expectedConfirmation {
		return fmt.Errorf("scenario-references confirmation must equal %s", expectedConfirmation)
	}
	parsed, err := url.Parse(strings.TrimSpace(dsn))
	if err != nil || parsed == nil ||
		(parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") ||
		parsed.Opaque != "" || parsed.Fragment != "" ||
		strings.TrimSpace(parsed.Hostname()) != devdbguard.CustomerConfigLocalTestHost ||
		strings.TrimSpace(parsed.Port()) != fmt.Sprint(devdbguard.CustomerConfigLocalTestPort) ||
		parsed.Path != "/"+expectedDatabase {
		return fmt.Errorf("scenario-references DSN must target the declared registered development database")
	}
	query := parsed.Query()
	sslModes, ok := query["sslmode"]
	if len(query) != 1 || !ok || len(sslModes) != 1 || sslModes[0] != "disable" {
		return fmt.Errorf("scenario-references DSN query must contain only sslmode=disable")
	}
	config, err := pgconn.ParseConfig(dsn)
	if err != nil || config == nil ||
		strings.TrimSpace(config.Host) != devdbguard.CustomerConfigLocalTestHost ||
		config.Port != devdbguard.CustomerConfigLocalTestPort ||
		strings.TrimSpace(config.Database) != expectedDatabase ||
		len(config.Fallbacks) != 0 || config.TLSConfig != nil {
		return fmt.Errorf("scenario-references resolved DSN must be the single declared registered development database")
	}
	return nil
}

func validateManualAcceptanceReferenceTarget(dsn, expectedDatabase, confirmation string) error {
	expectedDatabase = strings.TrimSpace(expectedDatabase)
	matches := manualAcceptanceReferenceDatabasePattern.FindStringSubmatch(expectedDatabase)
	if len(matches) != 2 || strings.HasSuffix(matches[1], "_browser_actions") {
		return fmt.Errorf("references-only expected database must match plush_erp_acceptance_<run-id>_dev")
	}
	contract := manualacceptance.Current()
	expectedConfirmation := "SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES:local-dev:" + expectedDatabase + ":" + contract.DataVersion + ":" + contract.RunID
	if confirmation != expectedConfirmation {
		return fmt.Errorf("references-only confirmation must equal %s", expectedConfirmation)
	}
	parsed, err := url.Parse(strings.TrimSpace(dsn))
	host := ""
	port := ""
	if parsed != nil {
		host = strings.TrimSpace(parsed.Hostname())
		port = strings.TrimSpace(parsed.Port())
	}
	loopbackHost := host == "127.0.0.1" || host == "localhost" || host == "::1"
	registeredDevelopmentHost := host == devdbguard.CustomerConfigLocalTestHost &&
		port == fmt.Sprint(devdbguard.CustomerConfigLocalTestPort)
	if err != nil || parsed == nil ||
		(parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") ||
		parsed.Opaque != "" || parsed.Fragment != "" ||
		(!loopbackHost && !registeredDevelopmentHost) ||
		parsed.Path != "/"+expectedDatabase {
		return fmt.Errorf("references-only DSN must target the declared local acceptance database")
	}
	query := parsed.Query()
	sslModes, ok := query["sslmode"]
	if len(query) != 1 || !ok || len(sslModes) != 1 || sslModes[0] != "disable" {
		return fmt.Errorf("references-only DSN query must contain only sslmode=disable")
	}
	config, err := pgconn.ParseConfig(dsn)
	resolvedHost := ""
	resolvedPort := uint16(0)
	if config != nil {
		resolvedHost = strings.TrimSpace(config.Host)
		resolvedPort = config.Port
	}
	resolvedLoopback := resolvedHost == "127.0.0.1" || resolvedHost == "localhost" || resolvedHost == "::1"
	resolvedRegisteredDevelopment := resolvedHost == devdbguard.CustomerConfigLocalTestHost &&
		resolvedPort == devdbguard.CustomerConfigLocalTestPort
	if err != nil || config == nil ||
		(!resolvedLoopback && !resolvedRegisteredDevelopment) ||
		strings.TrimSpace(config.Database) != expectedDatabase ||
		len(config.Fallbacks) != 0 || config.TLSConfig != nil {
		return fmt.Errorf("references-only resolved DSN must be the single declared local acceptance database")
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
