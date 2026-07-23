package biz

import (
	"errors"
	"reflect"
	"testing"
)

func TestNormalizeRoleNavigationSettings(t *testing.T) {
	t.Run("recommended clears only with an empty custom list", func(t *testing.T) {
		got, err := NormalizeRoleNavigationSettings(RoleNavigationModeRecommended, nil)
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
		)
		if err != nil {
			t.Fatalf("NormalizeRoleNavigationSettings() error = %v", err)
		}
		want := []string{
			"/erp/finance/payables",
			"/erp/finance/reconciliation",
		}
		if got.Mode != RoleNavigationModeCustom || !reflect.DeepEqual(got.PrimaryMenuPaths, want) {
			t.Fatalf("custom settings = %#v, want paths %#v", got, want)
		}
	})
}

func TestNormalizeRoleNavigationSettingsRejectsUnsafeOrAmbiguousInput(t *testing.T) {
	tests := []struct {
		name  string
		mode  RoleNavigationMode
		paths []string
	}{
		{name: "unknown mode", mode: "manual", paths: nil},
		{name: "recommended with paths", mode: RoleNavigationModeRecommended, paths: []string{"/erp/finance/payables"}},
		{name: "custom without paths", mode: RoleNavigationModeCustom, paths: nil},
		{name: "duplicate path", mode: RoleNavigationModeCustom, paths: []string{"/erp/finance/payables", "/erp/finance/payables"}},
		{name: "dashboard is fixed", mode: RoleNavigationModeCustom, paths: []string{"/erp/dashboard"}},
		{name: "help is fixed", mode: RoleNavigationModeCustom, paths: []string{"/erp/help-center"}},
		{name: "query is rejected", mode: RoleNavigationModeCustom, paths: []string{"/erp/finance/payables?tab=1"}},
		{name: "unknown page is rejected", mode: RoleNavigationModeCustom, paths: []string{"/erp/not-registered"}},
		{
			name: "more than five",
			mode: RoleNavigationModeCustom,
			paths: []string{
				"/erp/a",
				"/erp/b",
				"/erp/c",
				"/erp/d",
				"/erp/e",
				"/erp/f",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := NormalizeRoleNavigationSettings(tt.mode, tt.paths); !errors.Is(err, ErrBadParam) {
				t.Fatalf("error = %v, want ErrBadParam", err)
			}
		})
	}
}

func TestNormalizePersistedRoleNavigationSettingsFailsClosed(t *testing.T) {
	got := NormalizePersistedRoleNavigationSettings(
		RoleNavigationModeCustom,
		[]string{"/erp/dashboard"},
	)
	if got.Mode != RoleNavigationModeRecommended || len(got.PrimaryMenuPaths) != 0 {
		t.Fatalf("persisted invalid settings = %#v", got)
	}
}
