package biz

import (
	"errors"
	"testing"
)

func TestNormalizeAdminERPPreferences(t *testing.T) {
	got := NormalizeAdminERPPreferences(AdminERPPreferences{
		ColumnOrders: map[string][]string{
			" project-orders ": {" customer_name ", "", "document_no", "customer_name"},
			"":                 {"ignored"},
		},
		HiddenColumns: map[string][]string{
			" project-orders ": {" status ", "", "status"},
			"empty":            {" "},
		},
	})

	order := got.ColumnOrders["project-orders"]
	if len(order) != 2 || order[0] != "customer_name" || order[1] != "document_no" {
		t.Fatalf("unexpected normalized order: %#v", got.ColumnOrders)
	}
	if len(got.HiddenColumns) != 1 || len(got.HiddenColumns["project-orders"]) != 1 || got.HiddenColumns["project-orders"][0] != "status" {
		t.Fatalf("unexpected hidden columns: %#v", got.HiddenColumns)
	}
}

func TestNormalizeAdminERPPreferencesDropsEmptyOrders(t *testing.T) {
	got := NormalizeAdminERPPreferences(AdminERPPreferences{
		ColumnOrders: map[string][]string{
			"project-orders": {"", " "},
		},
	})

	if got.ColumnOrders != nil {
		t.Fatalf("expected nil column orders, got %#v", got.ColumnOrders)
	}
}

func TestAdminERPAppearancePatchPreservesUnchangedFields(t *testing.T) {
	current := AdminERPAppearance{ThemeMode: "dark", Accent: "purple", Density: "compact", TableLines: "grid"}
	green := "green"
	patch := AdminERPAppearancePatch{Accent: &green}
	if err := patch.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := patch.Apply(current); got != (AdminERPAppearance{ThemeMode: "dark", Accent: "green", Density: "compact", TableLines: "grid"}) {
		t.Fatalf("mobile color update lost desktop preferences: %+v", got)
	}
	if got := NormalizeAdminERPPreferences(AdminERPPreferences{}).Appearance; got != adminERPAppearanceContract.Defaults {
		t.Fatalf("account without appearance must receive defaults: %+v", got)
	}
	simple := "simple"
	linesPatch := AdminERPAppearancePatch{TableLines: &simple}
	if err := linesPatch.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := linesPatch.Apply(current); got != (AdminERPAppearance{ThemeMode: "dark", Accent: "purple", Density: "compact", TableLines: "simple"}) {
		t.Fatalf("table line update lost other preferences: %+v", got)
	}
	for _, invalid := range []string{"", "Dark", " dark ", "__proto__", "unknown"} {
		for _, patch := range []AdminERPAppearancePatch{{ThemeMode: &invalid}, {Accent: &invalid}, {Density: &invalid}, {TableLines: &invalid}} {
			if !errors.Is(patch.Validate(), ErrBadParam) {
				t.Fatalf("invalid appearance accepted: %+v", patch)
			}
		}
	}
	if !errors.Is((AdminERPAppearancePatch{}).Validate(), ErrBadParam) {
		t.Fatal("empty patch accepted")
	}
}
