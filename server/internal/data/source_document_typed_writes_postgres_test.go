package data_test

import (
	"maps"
	"reflect"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/google/uuid"
)

// Check the committed record through a fresh RPC read after every rejected edit.
func TestSourceDocumentPostgresIntegrationTypedReplacementWrites(t *testing.T) {
	f := newIntegrationHTTP(t, "processes", "outsourcing_orders")
	caller, _ := f.actor(t, biz.SalesRoleKey, biz.PurchaseRoleKey, biz.PMCRoleKey)
	ctx := t.Context()
	suffix := uuid.NewString()[:8]
	unit := f.client.Unit.Create().SetCode("U" + suffix).SetName("个").SetPrecision(0).SaveX(ctx)
	product := f.client.Product.Create().SetCode("P" + suffix).SetName("模拟产品").SetDefaultUnitID(unit.ID).SaveX(ctx)
	customer := f.client.Customer.Create().SetCode("C" + suffix).SetName("模拟客户").SaveX(ctx)
	supplier := f.client.Supplier.Create().SetCode("S" + suffix).SetName("模拟供应商").SetSupplierType("outsourcing").SaveX(ctx)

	call := func(t *testing.T, domain, method, resultKey string, params map[string]any) map[string]any {
		t.Helper()
		return integrationResult(t, requireIntegrationCode(t, caller, domain, method, params, errcode.OK.Code), resultKey)
	}
	checkFields := func(t *testing.T, record, want map[string]any) {
		t.Helper()
		for key, value := range want {
			if got, exists := record[key]; !exists || !reflect.DeepEqual(got, value) {
				t.Fatalf("%s: got %#v, want %#v", key, got, value)
			}
		}
	}
	checkRejected := func(t *testing.T, domain, method string, request map[string]any, read func() map[string]any) {
		t.Helper()
		before := read()
		requireIntegrationCode(t, caller, domain, method, request, errcode.InvalidParam.Code)
		if after := read(); !reflect.DeepEqual(before, after) {
			t.Fatalf("%s.%s changed a stored record: before=%v after=%v", domain, method, before, after)
		}
	}

	processParams := map[string]any{"code": "PR" + suffix, "name": "模拟加工", "outsourcing_enabled": true, "inhouse_enabled": false}
	process := call(t, "masterdata", "create_process", "process", processParams)
	processParams["id"] = process["id"]
	t.Run("process switches", func(t *testing.T) {
		read := func() map[string]any {
			return call(t, "masterdata", "get_process", "process", map[string]any{"id": process["id"]})
		}
		checkFields(t, read(), map[string]any{"inhouse_enabled": false, "outsourcing_enabled": true})
		for _, key := range []string{"outsourcing_enabled", "inhouse_enabled"} {
			for _, invalid := range []any{"false", 0, []any{}} {
				edit := maps.Clone(processParams)
				edit[key] = invalid
				checkRejected(t, "masterdata", "update_process", edit, read)
			}
		}
		for _, explicitNull := range []bool{false, true} {
			edit := maps.Clone(processParams)
			for _, key := range []string{"inhouse_enabled", "outsourcing_enabled"} {
				if explicitNull {
					edit[key] = nil
				} else {
					delete(edit, key)
				}
			}
			call(t, "masterdata", "update_process", "process", edit)
			checkFields(t, read(), map[string]any{"inhouse_enabled": true, "outsourcing_enabled": false})
			call(t, "masterdata", "update_process", "process", processParams)
			checkFields(t, read(), map[string]any{"inhouse_enabled": false, "outsourcing_enabled": true})
		}
	})

	skuParams := map[string]any{"product_id": product.ID, "default_unit_id": unit.ID, "sku_code": "SKU" + suffix}
	textFields := []string{"sku_name", "barcode", "customer_sku", "color", "color_no", "size", "packaging_version"}
	for _, key := range textFields {
		skuParams[key] = "old-" + key
	}
	sku := call(t, "masterdata", "create_product_sku", "product_sku", skuParams)
	skuParams["id"] = sku["id"]
	t.Run("SKU fields", func(t *testing.T) {
		read := func() map[string]any {
			return call(t, "masterdata", "get_product_sku", "product_sku", map[string]any{"id": sku["id"]})
		}
		checkFields(t, read(), map[string]any{"default_unit_id": float64(unit.ID), "color": "old-color"})
		for _, key := range append([]string{"sku_code"}, textFields...) {
			for _, invalid := range []any{3.5, false, map[string]any{}, []any{}} {
				edit := maps.Clone(skuParams)
				edit[key] = invalid
				checkRejected(t, "masterdata", "update_product_sku", edit, read)
			}
		}
		for _, code := range []any{nil, "", "  "} {
			edit := maps.Clone(skuParams)
			edit["sku_code"] = code
			checkRejected(t, "masterdata", "update_product_sku", edit, read)
		}
		withoutCode := maps.Clone(skuParams)
		delete(withoutCode, "sku_code")
		checkRejected(t, "masterdata", "update_product_sku", withoutCode, read)
		for _, invalid := range []any{0, -1, 1.5, "1", true, float64(9007199254740992)} {
			edit := maps.Clone(skuParams)
			edit["default_unit_id"] = invalid
			checkRejected(t, "masterdata", "update_product_sku", edit, read)
		}
		for _, clear := range []string{"omit", "null", "blank text"} {
			edit := maps.Clone(skuParams)
			want := map[string]any{"default_unit_id": nil}
			delete(edit, "default_unit_id")
			if clear == "null" {
				edit["default_unit_id"] = nil
			}
			for _, key := range textFields {
				want[key] = nil
				switch clear {
				case "omit":
					delete(edit, key)
				case "null":
					edit[key] = nil
				case "blank text":
					edit[key] = "  "
				}
			}
			call(t, "masterdata", "update_product_sku", "product_sku", edit)
			checkFields(t, read(), want)
			call(t, "masterdata", "update_product_sku", "product_sku", skuParams)
			for _, key := range textFields {
				want[key] = skuParams[key]
			}
			want["default_unit_id"] = float64(unit.ID)
			checkFields(t, read(), want)
		}
	})

	for _, domain := range []string{"sales_order", "purchase_order", "outsourcing_order"} {
		t.Run(domain, func(t *testing.T) {
			method := "save_" + domain + "_with_items"
			request := map[string]any{"currency": "CNY", "payment_term_days": 0}
			snapshots := map[string]any{"supplier_snapshot": map[string]any{"name": "模拟供应商"}, "contract_party_snapshot": map[string]any{"buyerCompany": "模拟采购方"}}
			var line map[string]any
			switch domain {
			case "sales_order":
				snapshots = map[string]any{"customer_snapshot": map[string]any{"name": "模拟客户"}, "contact_snapshot": map[string]any{"name": "原联系人"}, "delivery_snapshot": map[string]any{"recipient": "原收货人"}}
				request["customer_id"], request["order_no"], request["order_date"] = customer.ID, "SO"+suffix, "2026-11-19"
				request["tax_mode"], request["freight_terms"] = biz.SalesOrderTaxModeNone, biz.SalesOrderFreightTermsIncluded
			case "purchase_order":
				request["supplier_id"], request["purchase_order_no"], request["purchase_date"] = supplier.ID, "PO"+suffix, "2026-11-19"
			case "outsourcing_order":
				request["supplier_id"], request["outsourcing_order_no"], request["order_date"] = supplier.ID, "OO"+suffix, "2026-11-19"
				line = map[string]any{"line_no": 1, "subject_type": biz.OutsourcingOrderSubjectProduct, "product_id": product.ID, "product_sku_id": sku["id"], "unit_id": unit.ID, "process_id": process["id"], "outsourcing_quantity": "2", "processing_item": "模拟加工"}
				request["items"] = []any{line}
			}
			maps.Copy(request, snapshots)
			created := requireIntegrationCode(t, caller, domain, method, request, errcode.OK.Code)
			header := integrationResult(t, created, domain)
			request["id"], request["expected_version"] = header["id"], header["version"]
			read := func() map[string]any {
				return call(t, domain, "get_"+domain, domain, map[string]any{"id": header["id"]})
			}
			checkFields(t, read(), snapshots)
			if line != nil {
				rows := created.Result.Data.AsMap()["outsourcing_order_items"].([]any)
				line["id"] = rows[0].(map[string]any)["id"]
				readLines := func() map[string]any {
					return requireIntegrationCode(t, caller, domain, "list_outsourcing_order_items", map[string]any{"outsourcing_order_id": header["id"]}, errcode.OK.Code).Result.Data.AsMap()
				}
				before := readLines()
				for _, key := range []string{"product_id", "product_sku_id", "material_id"} {
					for _, invalid := range []any{"1", -1, 1.5, 0, true, float64(9007199254740992)} {
						badLine := maps.Clone(line)
						badLine[key] = invalid
						edit := maps.Clone(request)
						edit["items"] = []any{badLine}
						checkRejected(t, domain, method, edit, read)
					}
				}
				if !reflect.DeepEqual(before, readLines()) {
					t.Fatal("rejected writes changed the outsourcing lines")
				}
				for _, explicitNull := range []bool{false, true} {
					editLine := maps.Clone(line)
					delete(editLine, "product_sku_id")
					if explicitNull {
						editLine["product_sku_id"] = nil
					}
					edit := maps.Clone(request)
					edit["items"] = []any{editLine}
					saved := call(t, domain, method, domain, edit)
					got := readLines()["outsourcing_order_items"].([]any)[0].(map[string]any)
					checkFields(t, got, map[string]any{"id": line["id"], "product_id": float64(product.ID), "product_sku_id": nil})
					request["expected_version"] = saved["version"]
					saved = call(t, domain, method, domain, request)
					request["expected_version"] = saved["version"]
					got = readLines()["outsourcing_order_items"].([]any)[0].(map[string]any)
					checkFields(t, got, map[string]any{"product_sku_id": sku["id"]})
				}
			}
			for key := range snapshots {
				for _, invalid := range []any{"", false, 2, []any{}} {
					edit := maps.Clone(request)
					edit[key] = invalid
					checkRejected(t, domain, method, edit, read)
				}
			}
			for _, clear := range []string{"omit", "null", "empty object"} {
				edit := maps.Clone(request)
				want := make(map[string]any, len(snapshots))
				for key := range snapshots {
					want[key] = map[string]any{}
					switch clear {
					case "omit":
						delete(edit, key)
					case "null":
						edit[key] = nil
					case "empty object":
						edit[key] = map[string]any{}
					}
				}
				saved := call(t, domain, method, domain, edit)
				checkFields(t, read(), want)
				request["expected_version"] = saved["version"]
				// Start every clear case with populated fields, not a previously cleared row.
				saved = call(t, domain, method, domain, request)
				request["expected_version"] = saved["version"]
				checkFields(t, read(), snapshots)
			}
		})
	}
}
