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

func TestAdminERPAppearanceDefaultsPreserveSavedChoices(t *testing.T) {
	want := AdminERPAppearance{ThemeMode: "system", Accent: "blue", Density: "compact", TableLines: "grid"}
	if got := NormalizeAdminERPPreferences(AdminERPPreferences{}).Appearance; got != want {
		t.Fatalf("account without saved preferences = %+v, want %+v", got, want)
	}
	for _, density := range []string{"standard", "compact"} {
		for _, lines := range []string{"simple", "grid"} {
			t.Run(density+"/"+lines, func(t *testing.T) {
				saved := AdminERPAppearance{ThemeMode: "dark", Accent: "purple", Density: density, TableLines: lines}
				if got := NormalizeAdminERPAppearance(saved); got != saved {
					t.Fatalf("saved appearance changed: got %+v, want %+v", got, saved)
				}
			})
		}
	}
	partial := AdminERPAppearance{ThemeMode: "light", Accent: "teal", Density: "standard"}
	if got := NormalizeAdminERPAppearance(partial); got != (AdminERPAppearance{ThemeMode: "light", Accent: "teal", Density: "standard", TableLines: "grid"}) {
		t.Fatalf("only missing fields should receive defaults: %+v", got)
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

func TestAdminERPAppearanceNewAccentsPreserveAccountPreferences(t *testing.T) {
	current := AdminERPAppearance{ThemeMode: "dark", Accent: "purple", Density: "compact", TableLines: "grid"}
	for _, accent := range []string{"teal", "mauve"} {
		t.Run(accent, func(t *testing.T) {
			patch := AdminERPAppearancePatch{Accent: &accent}
			if err := patch.Validate(); err != nil {
				t.Fatal(err)
			}
			want := AdminERPAppearance{ThemeMode: "dark", Accent: accent, Density: "compact", TableLines: "grid"}
			if got := NormalizeAdminERPPreferences(AdminERPPreferences{Appearance: patch.Apply(current)}).Appearance; got != want {
				t.Fatalf("accent preference was lost or changed other appearance fields: %+v", got)
			}
		})
	}
	if got := NormalizeAdminERPAppearance(AdminERPAppearance{}).Accent; got != "blue" {
		t.Fatalf("default accent changed: %q", got)
	}
}
