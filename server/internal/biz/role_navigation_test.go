package biz

import (
	"errors"
	"reflect"
	"testing"
)

func TestNormalizeRoleNavigationSettings(t *testing.T) {
	t.Run("recommended clears only with an empty custom list", func(t *testing.T) {
		got, err := NormalizeRoleNavigationSettings(RoleNavigationModeRecommended, nil, nil)
		if err != nil {
			t.Fatalf("NormalizeRoleNavigationSettings() error = %v", err)
		}
		if got.Mode != RoleNavigationModeRecommended || len(got.PrimaryMenuPaths) != 0 {
			t.Fatalf("recommended settings = %#v", got)
		}
	})

	t.Run("custom preserves a unique ordered business path list", func(t *testing.T) {
		got, err := NormalizeRoleNavigationSettings(
			RoleNavigationModeCustom,
			[]string{
				" /erp/finance/payables ",
				"/erp/finance/reconciliation",
			},
			[]string{"/erp/finance/receivables"},
		)
		if err != nil {
			t.Fatalf("NormalizeRoleNavigationSettings() error = %v", err)
		}
		want := []string{
			"/erp/finance/payables",
			"/erp/finance/reconciliation",
		}
		if got.Mode != RoleNavigationModeCustom ||
			!reflect.DeepEqual(got.PrimaryMenuPaths, want) ||
			!reflect.DeepEqual(got.SecondaryMenuPaths, []string{"/erp/finance/receivables"}) {
			t.Fatalf("custom settings = %#v, want paths %#v", got, want)
		}
	})
}

func TestNormalizeRoleNavigationSettingsRejectsUnsafeOrAmbiguousInput(t *testing.T) {
	tests := []struct {
		name      string
		mode      RoleNavigationMode
		primary   []string
		secondary []string
	}{
		{name: "unknown mode", mode: "manual"},
		{name: "recommended with primary", mode: RoleNavigationModeRecommended, primary: []string{"/erp/finance/payables"}},
		{name: "recommended with secondary", mode: RoleNavigationModeRecommended, secondary: []string{"/erp/finance/payables"}},
		{name: "custom without primary", mode: RoleNavigationModeCustom, secondary: []string{"/erp/finance/payables"}},
		{name: "duplicate primary", mode: RoleNavigationModeCustom, primary: []string{"/erp/finance/payables", "/erp/finance/payables"}},
		{name: "duplicate secondary", mode: RoleNavigationModeCustom, primary: []string{"/erp/finance/payables"}, secondary: []string{"/erp/finance/reconciliation", "/erp/finance/reconciliation"}},
		{name: "cross list duplicate", mode: RoleNavigationModeCustom, primary: []string{"/erp/finance/payables"}, secondary: []string{"/erp/finance/payables"}},
		{name: "dashboard is fixed", mode: RoleNavigationModeCustom, primary: []string{"/erp/dashboard"}},
		{name: "help is fixed", mode: RoleNavigationModeCustom, primary: []string{"/erp/help-center"}},
		{name: "query is rejected", mode: RoleNavigationModeCustom, primary: []string{"/erp/finance/payables?tab=1"}},
		{name: "unknown page is rejected", mode: RoleNavigationModeCustom, primary: []string{"/erp/not-registered"}},
		{
			name: "more than five",
			mode: RoleNavigationModeCustom,
			primary: []string{
				"/erp/finance/payables",
				"/erp/finance/reconciliation",
				"/erp/finance/receivables",
				"/erp/finance/payments",
				"/erp/finance/invoices",
				"/erp/warehouse/inventory",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := NormalizeRoleNavigationSettings(tt.mode, tt.primary, tt.secondary); !errors.Is(err, ErrBadParam) {
				t.Fatalf("error = %v, want ErrBadParam", err)
			}
		})
	}
}

func TestValidateRoleNavigationPartitionRequiresEveryEffectivePageExactlyOnce(t *testing.T) {
	valid := RoleNavigationSettings{
		Mode:               RoleNavigationModeCustom,
		PrimaryMenuPaths:   []string{"/erp/finance/receivables"},
		SecondaryMenuPaths: []string{"/erp/finance/payables", "/erp/finance/reconciliation"},
	}
	effective := []string{
		"/erp/dashboard",
		"/erp/finance/receivables",
		"/erp/finance/payables",
		"/erp/finance/reconciliation",
		"/erp/help-center",
	}
	if err := ValidateRoleNavigationPartition(valid, effective); err != nil {
		t.Fatalf("ValidateRoleNavigationPartition() error = %v", err)
	}
	valid.SecondaryMenuPaths = []string{"/erp/finance/payables"}
	if err := ValidateRoleNavigationPartition(valid, effective); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing effective page error = %v, want ErrBadParam", err)
	}
}

func TestNormalizePersistedRoleNavigationSettingsFailsClosed(t *testing.T) {
	got := NormalizePersistedRoleNavigationSettings(
		RoleNavigationModeCustom,
		[]string{"/erp/dashboard"},
		nil,
	)
	if got.Mode != RoleNavigationModeRecommended ||
		len(got.PrimaryMenuPaths) != 0 ||
		len(got.SecondaryMenuPaths) != 0 {
		t.Fatalf("persisted invalid settings = %#v", got)
	}
}
