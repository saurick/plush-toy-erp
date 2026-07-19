package biz

import "testing"

func TestPurchaseOrderReadPermissionUsageCoversPurchaseReceiptSourceMethods(t *testing.T) {
	usage, ok := PermissionUsageFor(PermissionPurchaseOrderRead)
	if !ok {
		t.Fatal("purchase_order.read permission usage missing")
	}
	found := map[string]bool{}
	for _, surface := range usage.Surfaces {
		for _, method := range surface.BackendMethods {
			if method.Domain == "purchase" {
				found[method.Method] = true
			}
		}
	}
	for _, method := range []string{
		"create_purchase_receipt_from_purchase_order",
		"add_purchase_receipt_item",
	} {
		if !found[method] {
			t.Errorf("purchase_order.read permission usage does not describe %s", method)
		}
	}
}
