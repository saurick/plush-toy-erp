package biz

import "testing"

func TestShipmentReadPermissionUsageCoversExactAndListMethods(t *testing.T) {
	usage, ok := PermissionUsageFor(PermissionShipmentRead)
	if !ok {
		t.Fatal("shipment.read permission usage missing")
	}

	found := map[string]bool{}
	for _, surface := range usage.Surfaces {
		for _, method := range surface.BackendMethods {
			if method.Domain == "operational_fact" {
				found[method.Method] = true
			}
		}
	}
	for _, method := range []string{"get_shipment", "list_shipments"} {
		if !found[method] {
			t.Errorf("shipment.read permission usage does not describe %s", method)
		}
	}
}
