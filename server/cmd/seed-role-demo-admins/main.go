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

	"server/internal/data"
	"server/internal/devdbguard"

	"github.com/go-kratos/kratos/v2/log"
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

const resetLocalSuperAdminConfirm = "RESET_LOCAL_SUPER_ADMIN_PASSWORD"

func main() {
	confPath := flag.String("conf", "./configs/dev/config.yaml", "config yaml path")
	password := flag.String("password", "", "demo account password; ERP_ROLE_DEMO_PASSWORD is preferred for local use")
	resetPassword := flag.Bool("reset-password", false, "reset password for existing demo accounts")
	includeDebug := flag.Bool("include-debug", false, "also seed demo_debug with debug_operator role")
	includeManualAcceptanceScenarios := flag.Bool("include-manual-acceptance-scenarios", false, "also reset the three existing manual acceptance scenario account passwords without changing roles or status")
	resetLocalSuperAdmin := flag.Bool("reset-local-super-admin", false, "also reset the existing local admin password without changing its status or permissions")
	resetLocalSuperAdminConfirmation := flag.String("reset-local-super-admin-confirm", "", "exact confirmation required with --reset-local-super-admin")
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

	effectivePassword := strings.TrimSpace(*password)
	source := "--password"
	if effectivePassword == "" {
		effectivePassword = strings.TrimSpace(os.Getenv("ERP_ROLE_DEMO_PASSWORD"))
		source = "ERP_ROLE_DEMO_PASSWORD"
	}
	if effectivePassword == "" {
		fail("missing role demo password: set ERP_ROLE_DEMO_PASSWORD or pass --password")
	}
	if len(effectivePassword) < 8 {
		fail("role demo password must be at least 8 characters")
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

	logger := log.NewHelper(log.With(log.NewStdLogger(os.Stdout), "module", "cmd.seed_role_demo_admins"))
	if err := data.SeedBuiltinRBACIfNeeded(ctx, db, logger); err != nil {
		fail("seed builtin rbac failed: %v", err)
	}
	result, err := data.SeedRoleDemoAdminAccounts(ctx, db, data.RoleDemoAdminSeedOptions{
		Password:      effectivePassword,
		ResetPassword: *resetPassword,
		IncludeDebug:  *includeDebug,
	})
	if err != nil {
		fail("seed role demo admins failed: %v", err)
	}
	if *includeManualAcceptanceScenarios {
		if err := data.ResetRoleDemoAdminPasswords(ctx, db, []string{
			"demo_uat_disabled",
			"demo_uat_sales_purchase",
			"demo_uat_no_entry",
		}, effectivePassword); err != nil {
			fail("reset manual acceptance scenario passwords failed: %v", err)
		}
	}
	if *resetLocalSuperAdmin {
		if strings.TrimSpace(*resetLocalSuperAdminConfirmation) != resetLocalSuperAdminConfirm {
			fail("reset local super admin requires --reset-local-super-admin-confirm %s", resetLocalSuperAdminConfirm)
		}
		if err := data.ResetRoleDemoAdminPasswords(ctx, db, []string{"admin"}, effectivePassword); err != nil {
			fail("reset local super admin password failed: %v", err)
		}
	}

	fmt.Printf("role demo admin seed completed accounts=%d password_source=%s password_reset=%t include_debug=%t include_manual_acceptance_scenarios=%t reset_local_super_admin=%t\n",
		len(result.Accounts),
		source,
		*resetPassword,
		*includeDebug,
		*includeManualAcceptanceScenarios,
		*resetLocalSuperAdmin,
	)
	for _, account := range result.Accounts {
		action := "updated"
		if account.Created {
			action = "created"
		}
		fmt.Printf("- %s role=%s %s password_reset=%t\n", account.Username, account.RoleKey, action, account.PasswordReset)
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
		return fmt.Errorf("refuse to seed role demo admins with prod config; pass --allow-prod only for an intentional controlled operation")
	}
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV"} {
		if strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "prod") || strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "production") {
			return fmt.Errorf("refuse to seed role demo admins when %s=%s; pass --allow-prod only for an intentional controlled operation", key, os.Getenv(key))
		}
	}
	return nil
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
