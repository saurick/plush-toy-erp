package data

import (
	"testing"
	"time"

	"server/internal/conf"

	"google.golang.org/protobuf/types/known/durationpb"
)

func TestResolvePostgresPoolSettingsUsesBoundedDefaults(t *testing.T) {
	settings, err := resolvePostgresPoolSettings(&conf.Data_Postgres{})
	if err != nil {
		t.Fatalf("resolvePostgresPoolSettings() error = %v", err)
	}

	if settings.maxOpenConns != 20 || settings.maxIdleConns != 5 {
		t.Fatalf("connection limits = %d/%d, want 20/5", settings.maxOpenConns, settings.maxIdleConns)
	}
	if settings.connMaxLifetime != 30*time.Minute {
		t.Fatalf("conn max lifetime = %s, want 30m", settings.connMaxLifetime)
	}
	if settings.connMaxIdleTime != 5*time.Minute {
		t.Fatalf("conn max idle time = %s, want 5m", settings.connMaxIdleTime)
	}
	if settings.startupTimeout != 60*time.Second {
		t.Fatalf("startup timeout = %s, want 60s", settings.startupTimeout)
	}
}

func TestResolvePostgresPoolSettingsUsesConfiguredValues(t *testing.T) {
	settings, err := resolvePostgresPoolSettings(&conf.Data_Postgres{
		MaxOpenConns:    12,
		MaxIdleConns:    3,
		ConnMaxLifetime: durationpb.New(20 * time.Minute),
		ConnMaxIdleTime: durationpb.New(2 * time.Minute),
		StartupTimeout:  durationpb.New(45 * time.Second),
	})
	if err != nil {
		t.Fatalf("resolvePostgresPoolSettings() error = %v", err)
	}

	if settings.maxOpenConns != 12 || settings.maxIdleConns != 3 {
		t.Fatalf("connection limits = %d/%d, want 12/3", settings.maxOpenConns, settings.maxIdleConns)
	}
	if settings.connMaxLifetime != 20*time.Minute || settings.connMaxIdleTime != 2*time.Minute {
		t.Fatalf("connection recycling = %s/%s, want 20m/2m", settings.connMaxLifetime, settings.connMaxIdleTime)
	}
	if settings.startupTimeout != 45*time.Second {
		t.Fatalf("startup timeout = %s, want 45s", settings.startupTimeout)
	}
}

func TestResolvePostgresPoolSettingsRejectsIdleAboveOpen(t *testing.T) {
	_, err := resolvePostgresPoolSettings(&conf.Data_Postgres{
		MaxOpenConns: 4,
		MaxIdleConns: 5,
	})
	if err == nil {
		t.Fatal("resolvePostgresPoolSettings() error = nil, want max idle validation error")
	}
}
