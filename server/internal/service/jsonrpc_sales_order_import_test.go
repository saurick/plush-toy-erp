package service

import "testing"

func TestSalesOrderImportSourceCannotBypassReadPolicies(t *testing.T) {
	for _, policy := range []sensitiveFieldReadPolicy{{}, {partyPrivate: true, salesCommercial: true}, {partyPrivate: true, financeSettlement: true}, {salesCommercial: true, financeSettlement: true}} {
		data := map[string]any{"import_source": map[string]any{"cells": []any{map[string]any{"label": "单价", "value": "99"}}}}
		redactSensitiveFieldMap(data, "sales", policy)
		if _, present := data["import_source"]; present {
			t.Fatal("import evidence exposed a restricted field")
		}
	}
	data := map[string]any{"import_source": map[string]any{"file_name": "订单.xlsx"}}
	redactSensitiveFieldMap(data, "sales", sensitiveFieldReadPolicy{partyPrivate: true, salesCommercial: true, financeSettlement: true})
	if data["import_source"] == nil {
		t.Fatal("authorized evidence was dropped")
	}
}

func TestSalesOrderImportSourceRejectsNonObjectParameters(t *testing.T) {
	for _, value := range []any{"text", []any{"bad"}, true, 123} {
		_, ok := salesOrderItemMutationFromParams(map[string]any{"line_no": 1, "unit_id": 1, "ordered_quantity": "1", "requested_product_name": "模拟产品", "import_source": value})
		if ok {
			t.Fatal("accepted malformed original-file evidence")
		}
	}
}
