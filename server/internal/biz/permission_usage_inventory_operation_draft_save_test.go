package biz

import "testing"

func TestInventoryOperationDraftSavePermissionUsageUsesExistingManageCapability(t *testing.T) {
	usage, ok := PermissionUsageFor(PermissionWarehouseAdjustmentCreate)
	if !ok {
		t.Fatal("warehouse.adjustment.create permission usage missing")
	}
	for _, surface := range usage.Surfaces {
		for _, method := range surface.BackendMethods {
			if method.Domain == "inventory" && method.Method == "save_inventory_operation_draft" {
				return
			}
		}
	}
	t.Fatal("warehouse.adjustment.create must describe inventory.save_inventory_operation_draft")
}
