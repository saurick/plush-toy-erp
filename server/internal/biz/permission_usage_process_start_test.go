package biz

import "testing"

func TestPermissionUsageCoversCanonicalProcessStartRequirements(t *testing.T) {
	tests := []struct {
		permission string
		method     string
	}{
		{PermissionSalesOrderSubmit, "start_sales_order_acceptance_process"},
		{PermissionSalesOrderRead, "start_sales_order_acceptance_process"},
		{PermissionPurchaseReceiptCreate, "start_material_supply_purchase_order_process"},
		{PermissionPurchaseOrderRead, "start_material_supply_purchase_order_process"},
		{PermissionShipmentCreate, "start_finished_goods_delivery_process"},
		{PermissionShipmentRead, "start_finished_goods_delivery_process"},
	}
	for _, tt := range tests {
		t.Run(tt.permission, func(t *testing.T) {
			usage, ok := PermissionUsageFor(tt.permission)
			if !ok {
				t.Fatalf("permission usage %q missing", tt.permission)
			}
			for _, surface := range usage.Surfaces {
				for _, method := range surface.BackendMethods {
					if method.Domain == "customer_config" && method.Method == tt.method {
						return
					}
				}
			}
			t.Fatalf("permission %q does not describe customer_config.%s", tt.permission, tt.method)
		})
	}
}

func TestPermissionUsageDoesNotExposeRetiredDirectReceiptProcessStart(t *testing.T) {
	for _, usage := range BuiltinPermissionUsages() {
		for _, surface := range usage.Surfaces {
			for _, method := range surface.BackendMethods {
				if method.Domain == "customer_config" && method.Method == "start_material_supply_process" {
					t.Fatalf("retired direct receipt start remains on permission %q", usage.PermissionKey)
				}
			}
		}
	}
}
