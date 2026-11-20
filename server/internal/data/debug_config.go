package data

import (
	"net/url"
	"os"
	"strings"

	"server/internal/biz"
	"server/internal/conf"
)

func NewDebugSafetyConfig(c *conf.Data) biz.DebugSafetyConfig {
	return newDebugSafetyConfigFromEnv(c, os.Getenv)
}

func newDebugSafetyConfigFromEnv(c *conf.Data, getenv func(string) string) biz.DebugSafetyConfig {
	if getenv == nil {
		getenv = os.Getenv
	}
	environment := firstNonEmptyEnv(getenv, "ERP_DEBUG_ENV", "ERP_ENV", "APP_ENV")
	if environment == "" {
		environment = "sql"
	}
	cleanupScope := strings.TrimSpace(getenv("ERP_DEBUG_CLEANUP_SCOPE"))
	if cleanupScope == "" {
		cleanupScope = biz.DebugDefaultCleanupScope
	}
	return biz.NormalizeDebugSafetyConfig(biz.DebugSafetyConfig{
		Environment:              environment,
		DatabaseName:             debugDatabaseName(c),
		SeedEnabled:              envBoolDefault(getenv("ERP_DEBUG_SEED_ENABLED"), false),
		CleanupEnabled:           envBoolDefault(getenv("ERP_DEBUG_CLEANUP_ENABLED"), false),
		BusinessDataClearEnabled: envBoolDefault(getenv("ERP_DEBUG_BUSINESS_CLEAR_ENABLED"), false),
		CleanupScope:             cleanupScope,
	})
}

// debugDatabaseName extracts only the database identity from the already-effective
// runtime configuration. It deliberately returns no connection, host, user, or
// password details and fails closed for malformed or ambiguous DSNs.
func debugDatabaseName(c *conf.Data) string {
	if c == nil || c.Postgres == nil {
		return ""
	}
	rawDSN := strings.TrimSpace(c.Postgres.Dsn)
	if rawDSN == "" {
		return ""
	}
	parsed, err := url.Parse(rawDSN)
	if err != nil || parsed == nil {
		return ""
	}
	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		return ""
	}
	if parsed.Opaque != "" || parsed.Host == "" || parsed.Fragment != "" || parsed.RawFragment != "" {
		return ""
	}
	databaseName := strings.TrimPrefix(parsed.Path, "/")
	if databaseName == "" || parsed.Path != "/"+databaseName || strings.Contains(databaseName, "/") || strings.TrimSpace(databaseName) != databaseName {
		return ""
	}
	return databaseName
}

func firstNonEmptyEnv(getenv func(string) string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func envBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "t", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func envBoolDefault(value string, defaultValue bool) bool {
	if strings.TrimSpace(value) == "" {
		return defaultValue
	}
	return envBool(value)
}
