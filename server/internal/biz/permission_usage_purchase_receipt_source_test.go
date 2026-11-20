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

func TestPurchaseOrderReceiptProgressPermissionUsageRequiresAllHandlerPermissions(t *testing.T) {
	for _, permissionKey := range []string{
		PermissionPurchaseOrderRead,
		PermissionPurchaseReceiptRead,
		PermissionWarehouseInboundRead,
	} {
		usage, ok := PermissionUsageFor(permissionKey)
		if !ok {
			t.Fatalf("%s permission usage missing", permissionKey)
		}
		found := false
		for _, surface := range usage.Surfaces {
			for _, method := range surface.BackendMethods {
				if method.Domain == "purchase_order" &&
					method.Method == "get_purchase_order_receipt_progress" {
					found = true
				}
			}
		}
		if !found {
			t.Errorf("%s permission usage does not describe get_purchase_order_receipt_progress", permissionKey)
		}
	}
}
