package biz

import "testing"

func TestShipmentSourcePermissionUsageRequiresAllHandlerPermissions(t *testing.T) {
	tests := []struct {
		methodName     string
		permissionKeys []string
	}{
		{
			methodName: "list_shipment_source_candidates",
			permissionKeys: []string{
				PermissionShipmentCreate,
				PermissionShipmentUpdate,
				PermissionSalesOrderRead,
				PermissionSalesOrderItemRead,
			},
		},
		{
			methodName: "create_shipment_with_items",
			permissionKeys: []string{
				PermissionShipmentCreate,
				PermissionSalesOrderRead,
				PermissionSalesOrderItemRead,
			},
		},
		{
			methodName: "save_shipment_draft",
			permissionKeys: []string{
				PermissionShipmentUpdate,
				PermissionSalesOrderRead,
				PermissionSalesOrderItemRead,
			},
		},
	}
	for _, tt := range tests {
		for _, permissionKey := range tt.permissionKeys {
			usage, ok := PermissionUsageFor(permissionKey)
			if !ok {
				t.Fatalf("permission usage missing for %s", permissionKey)
			}
			found := false
			for _, surface := range usage.Surfaces {
				for _, method := range surface.BackendMethods {
					if method.Domain == "operational_fact" && method.Method == tt.methodName {
						found = true
					}
				}
			}
			if !found {
				t.Errorf("permission %s does not describe %s", permissionKey, tt.methodName)
			}
		}
	}
}
