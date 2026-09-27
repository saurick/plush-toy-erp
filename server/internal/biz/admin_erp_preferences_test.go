package biz

import "testing"

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
