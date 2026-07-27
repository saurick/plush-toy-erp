package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"server/internal/data"
)

func TestSeedCoreDemoModeSelection(t *testing.T) {
	if _, err := seedCoreDemo(context.Background(), nil, data.CoreDemoSeedPrefix, true); !errors.Is(err, data.ErrCoreDemoSeedMissingDB) {
		t.Fatalf("expected exact references-only mode to reach the references writer, got %v", err)
	}
	if _, err := seedCoreDemo(context.Background(), nil, "SIM-CUSTOM", false); !errors.Is(err, data.ErrCoreDemoSeedMissingDB) {
		t.Fatalf("expected default mode to retain the complete seed writer, got %v", err)
	}
}

func TestSeedCoreDemoReferencesOnlyRejectsAlternatePrefix(t *testing.T) {
	_, err := seedCoreDemo(context.Background(), nil, "SIM-CUSTOM", true)
	if err == nil || !strings.Contains(err.Error(), "does not accept a custom prefix") {
		t.Fatalf("expected references-only mode to reject alternate prefix, got %v", err)
	}
}

func TestManualAcceptanceReferenceTargetIsBoundToTheExactFreshDatabase(t *testing.T) {
	const database = "plush_erp_acceptance_20260728_delivery_dev"
	const confirmation = "SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES:local-dev:" + database + ":2026.07.16-v5:20260716-V5"
	validLoopback := "postgres://acceptance:secret@127.0.0.1:55432/" + database + "?sslmode=disable"
	validRegisteredDevelopment := "postgres://acceptance:secret@192.168.0.106:5432/" + database + "?sslmode=disable"
	for _, valid := range []string{validLoopback, validRegisteredDevelopment} {
		if err := validateManualAcceptanceReferenceTarget(
			valid,
			database,
			confirmation,
		); err != nil {
			t.Fatalf("valid target rejected: %v", err)
		}
	}
	for name, input := range map[string]struct {
		dsn      string
		database string
		confirm  string
	}{
		"shared database": {
			dsn:      "postgres://acceptance:secret@127.0.0.1:55432/plush_erp?sslmode=disable",
			database: database,
			confirm:  confirmation,
		},
		"other dev database": {
			dsn:      "postgres://acceptance:secret@127.0.0.1:55432/plush_erp_other_dev?sslmode=disable",
			database: database,
			confirm:  confirmation,
		},
		"target endpoint": {
			dsn:      "postgres://acceptance:secret@192.168.0.133:5435/" + database + "?sslmode=disable",
			database: database,
			confirm:  confirmation,
		},
		"query override": {
			dsn:      validLoopback + "&host=192.168.0.133",
			database: database,
			confirm:  confirmation,
		},
		"wrong explicit database": {
			dsn:      validLoopback,
			database: "plush_erp_acceptance_other_dev",
			confirm:  confirmation,
		},
		"wrong confirmation": {
			dsn:      validLoopback,
			database: database,
			confirm:  "SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateManualAcceptanceReferenceTarget(input.dsn, input.database, input.confirm); err == nil {
				t.Fatal("unsafe target unexpectedly accepted")
			}
		})
	}
}
