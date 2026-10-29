package main

import "testing"

func TestRPCInspectionPurchaseDeliveryDoesNotAdvertisePriceWrites(t *testing.T) {
	methods, err := rpcMethods("../../..")
	if err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection("../../..", methods)
	if err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"complete_purchase_order_terms", "update_purchase_order_delivery"} {
		fields := map[string]bool{}
		for _, field := range index["purchase_order"][method].Parameters {
			fields[field.Name] = true
		}
		for _, name := range []string{"id", "expected_version", "idempotency_key", "items[].id", "items[].expected_arrival_date"} {
			if !fields[name] {
				t.Errorf("%s missing %s", method, name)
			}
		}
		if fields["items[].unit_price"] != (method == "complete_purchase_order_terms") {
			t.Errorf("%s price contract=%v", method, fields)
		}
	}
}
