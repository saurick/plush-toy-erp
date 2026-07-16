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
	valid := "postgres://acceptance:secret@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable"
	if err := validateManualAcceptanceReferenceTarget(
		valid,
		manualAcceptanceReferenceDatabase,
		manualAcceptanceReferenceConfirm,
	); err != nil {
		t.Fatalf("valid target rejected: %v", err)
	}
	for name, input := range map[string]struct {
		dsn      string
		database string
		confirm  string
	}{
		"shared database": {
			dsn:      "postgres://acceptance:secret@192.168.0.106:5432/plush_erp?sslmode=disable",
			database: manualAcceptanceReferenceDatabase,
			confirm:  manualAcceptanceReferenceConfirm,
		},
		"other dev database": {
			dsn:      "postgres://acceptance:secret@192.168.0.106:5432/plush_erp_other_dev?sslmode=disable",
			database: manualAcceptanceReferenceDatabase,
			confirm:  manualAcceptanceReferenceConfirm,
		},
		"loopback tunnel": {
			dsn:      "postgres://acceptance:secret@127.0.0.1:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable",
			database: manualAcceptanceReferenceDatabase,
			confirm:  manualAcceptanceReferenceConfirm,
		},
		"query override": {
			dsn:      valid + "&host=192.168.0.133",
			database: manualAcceptanceReferenceDatabase,
			confirm:  manualAcceptanceReferenceConfirm,
		},
		"wrong explicit database": {
			dsn:      valid,
			database: "plush_erp_acceptance_other_dev",
			confirm:  manualAcceptanceReferenceConfirm,
		},
		"wrong confirmation": {
			dsn:      valid,
			database: manualAcceptanceReferenceDatabase,
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
