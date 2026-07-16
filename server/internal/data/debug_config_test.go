package data

import (
	"fmt"
	"strings"
	"testing"

	"server/internal/conf"
)

func TestNewDebugSafetyConfigFromEnv_UsesEffectiveConfigDatabaseNameWithoutCredentials(t *testing.T) {
	const (
		effectivePassword = "effective-runtime-secret"
		staleEnvPassword  = "stale-env-secret"
	)
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{
			Dsn: "postgresql://effective_user:" + effectivePassword + "@192.168.0.133:5435/plush_erp_uat_20260716_v5?sslmode=disable",
		},
	}, func(key string) string {
		if key == "POSTGRES_DSN" {
			return "postgres://stale_user:" + staleEnvPassword + "@127.0.0.1:5432/wrong_database?sslmode=disable"
		}
		return ""
	})

	if config.DatabaseName != "plush_erp_uat_20260716_v5" {
		t.Fatalf("database name = %q, want effective config database", config.DatabaseName)
	}
	exposed := fmt.Sprintf("%#v", config)
	for _, secret := range []string{effectivePassword, staleEnvPassword, "effective_user", "stale_user", "192.168.0.133"} {
		if strings.Contains(exposed, secret) {
			t.Fatalf("debug safety config exposed connection detail %q: %s", secret, exposed)
		}
	}
}

func TestDebugDatabaseNameFailsClosedForMalformedOrAmbiguousDSN(t *testing.T) {
	tests := []struct {
		name string
		data *conf.Data
	}{
		{name: "nil config"},
		{name: "missing postgres", data: &conf.Data{}},
		{name: "empty dsn", data: &conf.Data{Postgres: &conf.Data_Postgres{}}},
		{name: "unsupported scheme", data: &conf.Data{Postgres: &conf.Data_Postgres{Dsn: "mysql://user:secret@db/plush_erp"}}},
		{name: "missing host", data: &conf.Data{Postgres: &conf.Data_Postgres{Dsn: "postgres:///plush_erp"}}},
		{name: "missing database", data: &conf.Data{Postgres: &conf.Data_Postgres{Dsn: "postgres://user:secret@db:5432"}}},
		{name: "multiple path segments", data: &conf.Data{Postgres: &conf.Data_Postgres{Dsn: "postgres://user:secret@db:5432/plush/erp"}}},
		{name: "fragment", data: &conf.Data{Postgres: &conf.Data_Postgres{Dsn: "postgres://user:secret@db:5432/plush_erp#secret"}}},
		{name: "keyword dsn", data: &conf.Data{Postgres: &conf.Data_Postgres{Dsn: "host=db dbname=plush_erp password=secret"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := debugDatabaseName(tt.data); got != "" {
				t.Fatalf("debugDatabaseName() = %q, want empty", got)
			}
		})
	}
}

func TestNewDebugSafetyConfigFromEnv_DefaultsFailClosedForSQL(t *testing.T) {
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{Debug: false},
	}, func(string) string { return "" })

	if config.Environment != "sql" {
		t.Fatalf("expected sql environment, got %q", config.Environment)
	}
	if config.SeedEnabled || config.CleanupEnabled || config.BusinessDataClearEnabled {
		t.Fatalf("expected SQL debug mutations disabled by default, got %#v", config)
	}
}

func TestNewDebugSafetyConfigFromEnv_ExplicitEnvironmentStillDefaultsFailClosed(t *testing.T) {
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{Debug: false},
	}, func(key string) string {
		if key == "ERP_DEBUG_ENV" {
			return "remote"
		}
		return ""
	})

	if config.Environment != "remote" {
		t.Fatalf("expected remote environment, got %q", config.Environment)
	}
	if config.SeedEnabled || config.CleanupEnabled || config.BusinessDataClearEnabled {
		t.Fatalf("expected explicit environment to keep debug mutations disabled by default, got %#v", config)
	}
}

func TestNewDebugSafetyConfigFromEnv_ExplicitTrueEnablesIndependentLocalCapabilities(t *testing.T) {
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{Debug: false},
	}, func(key string) string {
		switch key {
		case "ERP_DEBUG_ENV":
			return "local"
		case "ERP_DEBUG_SEED_ENABLED", "ERP_DEBUG_CLEANUP_ENABLED", "ERP_DEBUG_BUSINESS_CLEAR_ENABLED":
			return "true"
		default:
			return ""
		}
	})

	if !config.SeedEnabled || !config.CleanupEnabled || !config.BusinessDataClearEnabled {
		t.Fatalf("expected explicitly enabled local debug capabilities, got %#v", config)
	}
}

func TestNewDebugSafetyConfigFromEnv_ExplicitFalseKeepsDisabled(t *testing.T) {
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{Debug: true},
	}, func(key string) string {
		switch key {
		case "ERP_DEBUG_SEED_ENABLED", "ERP_DEBUG_CLEANUP_ENABLED", "ERP_DEBUG_BUSINESS_CLEAR_ENABLED":
			return "false"
		default:
			return ""
		}
	})

	if config.SeedEnabled || config.CleanupEnabled || config.BusinessDataClearEnabled {
		t.Fatalf("expected explicit false to keep debug mutations disabled, got %#v", config)
	}
}
