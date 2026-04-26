package data

import (
	"testing"

	"server/internal/conf"
)

func TestNewDebugSafetyConfigFromEnv_DefaultsEnabledForSQL(t *testing.T) {
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{Debug: false},
	}, func(string) string { return "" })

	if config.Environment != "sql" {
		t.Fatalf("expected sql environment, got %q", config.Environment)
	}
	if !config.SeedEnabled || !config.CleanupEnabled {
		t.Fatalf("expected SQL debug mutations enabled by default, got %#v", config)
	}
}

func TestNewDebugSafetyConfigFromEnv_ExplicitEnvironmentDefaultsEnabled(t *testing.T) {
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
	if !config.SeedEnabled || !config.CleanupEnabled {
		t.Fatalf("expected debug mutations enabled by default for explicit environment, got %#v", config)
	}
}

func TestNewDebugSafetyConfigFromEnv_ExplicitFalseKeepsDisabled(t *testing.T) {
	config := newDebugSafetyConfigFromEnv(&conf.Data{
		Postgres: &conf.Data_Postgres{Debug: true},
	}, func(key string) string {
		switch key {
		case "ERP_DEBUG_SEED_ENABLED", "ERP_DEBUG_CLEANUP_ENABLED":
			return "false"
		default:
			return ""
		}
	})

	if config.SeedEnabled || config.CleanupEnabled {
		t.Fatalf("expected explicit false to keep debug mutations disabled, got %#v", config)
	}
}
