package biz

import "testing"

func TestShipmentSourcePermissionUsageRequiresAllHandlerPermissions(t *testing.T) {
	for _, methodName := range []string{
		"list_shipment_source_candidates",
		"create_shipment_with_items",
	} {
		for _, permissionKey := range []string{
			PermissionShipmentCreate,
			PermissionSalesOrderRead,
			PermissionSalesOrderItemRead,
		} {
			usage, ok := PermissionUsageFor(permissionKey)
			if !ok {
				t.Fatalf("permission usage missing for %s", permissionKey)
			}
			found := false
			for _, surface := range usage.Surfaces {
				for _, method := range surface.BackendMethods {
					if method.Domain == "operational_fact" && method.Method == methodName {
						found = true
					}
				}
			}
			if !found {
				t.Errorf("permission %s does not describe %s", permissionKey, methodName)
			}
		}
	}
}
