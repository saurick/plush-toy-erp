package data

import (
	"os"
	"strings"

	"server/internal/biz"
	"server/internal/conf"
)

func newDebugSafetyConfig(c *conf.Data) biz.DebugSafetyConfig {
	return newDebugSafetyConfigFromEnv(c, os.Getenv)
}

func newDebugSafetyConfigFromEnv(c *conf.Data, getenv func(string) string) biz.DebugSafetyConfig {
	if getenv == nil {
		getenv = os.Getenv
	}
	environment := firstNonEmptyEnv(getenv, "ERP_DEBUG_ENV", "ERP_ENV", "APP_ENV")
	if environment == "" {
		environment = "remote"
		if c != nil && c.Postgres != nil && c.Postgres.Debug {
			environment = "dev"
		}
	}
	cleanupScope := strings.TrimSpace(getenv("ERP_DEBUG_CLEANUP_SCOPE"))
	if cleanupScope == "" {
		cleanupScope = biz.DebugDefaultCleanupScope
	}
	return biz.NormalizeDebugSafetyConfig(biz.DebugSafetyConfig{
		Environment:    environment,
		SeedEnabled:    envBool(getenv("ERP_DEBUG_SEED_ENABLED")),
		CleanupEnabled: envBool(getenv("ERP_DEBUG_CLEANUP_ENABLED")),
		CleanupScope:   cleanupScope,
	})
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
