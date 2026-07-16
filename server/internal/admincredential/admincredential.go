package admincredential

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data"
	"server/internal/devdbguard"

	_ "github.com/jackc/pgx/v5/stdlib"
	"gopkg.in/yaml.v3"
)

const (
	DefaultLocalUsername = "admin"
	DefaultLocalPassword = "adminadmin"
	DefaultConfigPath    = "./configs/dev/config.yaml"

	AdminUsernameEnv = "APP_ADMIN_USERNAME"
	AdminPasswordEnv = "APP_ADMIN_PASSWORD"
	PostgresDSNEnv   = "POSTGRES_DSN"

	confirmationPrefix = "RESET_LOCAL_ADMIN_PASSWORD:"
	defaultTimeout     = 15 * time.Second
)

type options struct {
	confPath string
	username string
	password string
	confirm  string
	timeout  time.Duration
}

type bootstrapConfig struct {
	Data struct {
		Postgres struct {
			DSN string `yaml:"dsn"`
		} `yaml:"postgres"`
	} `yaml:"data"`
}

// ExpectedConfirmation binds the destructive confirmation to the one account
// selected for this invocation.
func ExpectedConfirmation(username string) string {
	return confirmationPrefix + strings.TrimSpace(username)
}

// Run resets exactly one local-development administrator credential. It does
// not create accounts, assign roles, or touch any demo-account seed path.
func Run(ctx context.Context, args []string, stdout io.Writer, getenv func(string) string) error {
	opts, err := parseOptions(args, getenv)
	if err != nil {
		return err
	}
	dsn, err := resolvePostgresDSN(opts.confPath, getenv)
	if err != nil {
		return err
	}
	if err := requireLocalDevelopmentTarget(opts.confPath, dsn, getenv); err != nil {
		return err
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return errors.New("open local development PostgreSQL failed")
	}
	defer func() { _ = db.Close() }()

	if ctx == nil {
		ctx = context.Background()
	}
	opCtx, cancel := context.WithTimeout(ctx, opts.timeout)
	defer cancel()
	if err := db.PingContext(opCtx); err != nil {
		return errors.New("connect to local development PostgreSQL failed")
	}
	if err := data.ResetManualAcceptancePasswords(opCtx, db, []string{opts.username}, opts.password, nil, ""); err != nil {
		return fmt.Errorf("reset local admin credential failed: %w", err)
	}

	if stdout == nil {
		stdout = io.Discard
	}
	_, err = fmtSuccess(stdout, opts.username)
	return err
}

func fmtSuccess(w io.Writer, username string) (int, error) {
	return fmt.Fprintf(
		w,
		"local admin credential reset completed username=%s auth_version_incremented=true active_sessions_revoked=true\n",
		username,
	)
}

func parseOptions(args []string, getenv func(string) string) (options, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	fs := flag.NewFlagSet("reset-local-admin-password", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	confPath := fs.String("conf", DefaultConfigPath, "development config yaml path")
	usernameFlag := fs.String("username", "", "admin username; overrides APP_ADMIN_USERNAME")
	passwordFlag := fs.String("password", "", "admin password; overrides APP_ADMIN_PASSWORD")
	confirm := fs.String("confirm", "", "exact confirmation RESET_LOCAL_ADMIN_PASSWORD:<username>")
	timeout := fs.Duration("timeout", defaultTimeout, "database operation timeout")
	if err := fs.Parse(args); err != nil {
		return options{}, err
	}
	if fs.NArg() != 0 {
		return options{}, errors.New("positional arguments are not supported")
	}

	username := firstConfigured(*usernameFlag, getenv(AdminUsernameEnv), DefaultLocalUsername)
	password := firstConfigured(*passwordFlag, getenv(AdminPasswordEnv), DefaultLocalPassword)
	opts := options{
		confPath: strings.TrimSpace(*confPath),
		username: strings.TrimSpace(username),
		password: strings.TrimSpace(password),
		confirm:  *confirm,
		timeout:  *timeout,
	}
	if err := validateOptions(opts); err != nil {
		return options{}, err
	}
	return opts, nil
}

func firstConfigured(flagValue, envValue, fallback string) string {
	if value := strings.TrimSpace(flagValue); value != "" {
		return value
	}
	if value := strings.TrimSpace(envValue); value != "" {
		return value
	}
	return fallback
}

func validateOptions(opts options) error {
	if opts.confPath == "" {
		return errors.New("development config path is required")
	}
	if opts.username == "" || strings.ContainsAny(opts.username, " \t\r\n") {
		return errors.New("admin username must be non-empty and contain no whitespace")
	}
	if err := biz.ValidateAdminPassword(opts.password); err != nil {
		return fmt.Errorf(
			"admin password must contain %d-%d characters",
			biz.AdminPasswordMinLength,
			biz.AdminPasswordMaxLength,
		)
	}
	if opts.confirm != ExpectedConfirmation(opts.username) {
		return fmt.Errorf("confirmation mismatch; pass --confirm %s", ExpectedConfirmation(opts.username))
	}
	if opts.timeout <= 0 || opts.timeout > time.Minute {
		return errors.New("timeout must be greater than zero and no more than one minute")
	}
	return nil
}

func resolvePostgresDSN(confPath string, getenv func(string) string) (string, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	if dsn := strings.TrimSpace(getenv(PostgresDSNEnv)); dsn != "" {
		return dsn, nil
	}

	cfg, err := readBootstrapConfig(confPath)
	if err != nil {
		return "", err
	}
	dsn := strings.TrimSpace(cfg.Data.Postgres.DSN)
	localPath := resolveLocalConfigPath(confPath)
	if localPath != "" {
		localCfg, err := readBootstrapConfig(localPath)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		if err == nil {
			if localDSN := strings.TrimSpace(localCfg.Data.Postgres.DSN); localDSN != "" {
				dsn = localDSN
			}
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
		return nil, fmt.Errorf("read config %s failed: %w", path, err)
	}
	var cfg bootstrapConfig
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s failed", path)
	}
	return &cfg, nil
}

func resolveLocalConfigPath(confPath string) string {
	ext := filepath.Ext(confPath)
	if ext == "" || strings.HasSuffix(confPath, ".local"+ext) {
		return ""
	}
	return strings.TrimSuffix(confPath, ext) + ".local" + ext
}

func requireLocalDevelopmentTarget(confPath, dsn string, getenv func(string) string) error {
	if !devdbguard.IsDevConfigPath(confPath) {
		return errors.New("refuse local admin credential reset: config path must be under configs/dev")
	}
	if getenv == nil {
		getenv = os.Getenv
	}
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV", "ERP_DEBUG_ENV"} {
		value := strings.ToLower(strings.TrimSpace(getenv(key)))
		if value == "prod" || value == "production" {
			return fmt.Errorf("refuse local admin credential reset: %s marks a production runtime", key)
		}
	}
	// This strict guard accepts only the registered 192.168.0.106:5432
	// development database family. It intentionally has no production or 133
	// escape hatch and ignores ERP_ALLOW_TEST_DB_AS_DEV.
	if err := devdbguard.RequireCustomerConfigLocalTestDSN(dsn); err != nil {
		return errors.New("refuse local admin credential reset: PostgreSQL target is not a registered local development database")
	}
	return nil
}
