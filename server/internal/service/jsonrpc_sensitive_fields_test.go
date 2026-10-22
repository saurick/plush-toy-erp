package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestRedactSensitiveFieldMapRemovesNestedPrivateAndCommercialFields(t *testing.T) {
	data := map[string]any{
		"customer": map[string]any{
			"name": "客户甲", "phone": "13800138000", "tax_no": "TAX-1",
			"quoted_freight_amount": "88.5", "goods_amount": "25", "order_total": "113.5",
			"items": []any{map[string]any{
				"product_name": "玩偶", "unit_price": "12.5", "amount": "25",
			}},
		},
	}
	redactSensitiveFieldMap(data, "sales", sensitiveFieldReadPolicy{})
	customer := data["customer"].(map[string]any)
	if customer["name"] != "客户甲" || customer["phone"] != nil || customer["tax_no"] != nil || customer["quoted_freight_amount"] != nil || customer["goods_amount"] != nil || customer["order_total"] != nil {
		t.Fatalf("party redaction mismatch: %#v", customer)
	}
	item := customer["items"].([]any)[0].(map[string]any)
	if item["product_name"] != "玩偶" || item["unit_price"] != nil || item["amount"] != nil {
		t.Fatalf("commercial redaction mismatch: %#v", item)
	}
}

func TestRedactSensitiveFieldMapSeparatesSalesProcurementAndFinance(t *testing.T) {
	policy := sensitiveFieldReadPolicy{
		salesCommercial: true,
	}
	for _, tt := range []struct {
		name   string
		domain string
		keep   bool
	}{
		{name: "sales", domain: "sales", keep: true},
		{name: "procurement", domain: "procurement", keep: false},
		{name: "finance", domain: "finance", keep: false},
		{name: "ambiguous", domain: "strict", keep: false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			data := map[string]any{"unit_price": "1", "amount": "2"}
			redactSensitiveFieldMap(data, tt.domain, policy)
			_, kept := data["unit_price"]
			if kept != tt.keep {
				t.Fatalf("unit_price kept=%v want=%v data=%#v", kept, tt.keep, data)
			}
		})
	}
}

func TestSensitiveCommercialDomainUsesBusinessSource(t *testing.T) {
	for _, tt := range []struct {
		url, method, want string
	}{
		{"sales_order", "list_sales_orders", "sales"},
		{"purchase_order", "list_purchase_orders", "procurement"},
		{"operational_fact", "list_shipments", "sales"},
		{"operational_fact", "list_outsourcing_facts", "procurement"},
		{"operational_fact", "list_finance_facts", "finance"},
		{"workflow", "get_task_board", "strict"},
	} {
		if got := sensitiveCommercialDomain(tt.url, tt.method); got != tt.want {
			t.Fatalf("domain(%s,%s)=%s want=%s", tt.url, tt.method, got, tt.want)
		}
	}
}

func TestSensitiveFieldMutationPermissionFailsClosed(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderCreate,
	)
	ctx := biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
	dispatcher := &jsonrpcDispatcher{}
	denied := dispatcher.requireSensitiveFieldMutationPermission(
		withAdminPermissionCache(ctx),
		"sales_order",
		"save_sales_order_with_items",
	)
	if denied == nil || denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("missing field permission must fail closed, got %#v", denied)
	}

	admin.Permissions = append(
		admin.Permissions,
		biz.PermissionFieldSalesCommercialRead,
	)
	ctx = biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
	if allowed := dispatcher.requireSensitiveFieldMutationPermission(
		withAdminPermissionCache(ctx),
		"sales_order",
		"save_sales_order_with_items",
	); allowed != nil {
		t.Fatalf("field permission should allow mutation precondition, got %#v", allowed)
	}
}

func TestSensitiveFieldOrderCurrencyFollowsCommercialPermission(t *testing.T) {
	for _, domain := range []string{"sales", "procurement"} {
		value := map[string]any{"currency": "USD", "currency_snapshot": "USD", "payment_term_days": 30, "bank_account": "private", "paid_amount": "20"}
		policy := sensitiveFieldReadPolicy{salesCommercial: domain == "sales", procurementCommercial: domain == "procurement"}
		redactSensitiveFieldMap(value, domain, policy)
		if value["currency"] != "USD" || value["currency_snapshot"] != "USD" || value["payment_term_days"] != 30 {
			t.Fatalf("contract fields lost: %v", value)
		}
		if _, ok := value["paid_amount"]; ok {
			t.Fatal("finance settlement leaked")
		}
		if _, ok := value["bank_account"]; ok {
			t.Fatal("private bank data leaked")
		}
	}
}

func TestSensitiveFieldWarehouseCommandsKeepCommercialMutationsProtected(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey})
	dispatcher := &jsonrpcDispatcher{}
	for _, method := range []string{
		"create_outsourcing_material_issue_from_order",
		"create_outsourcing_return_receipt_from_order",
		"save_outsourcing_material_issue_draft",
		"save_outsourcing_return_receipt_draft",
	} {
		ctx := biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
		if got := dispatcher.requireSensitiveFieldMutationPermission(withAdminPermissionCache(ctx), "operational_fact", method); got != nil {
			t.Errorf("warehouse command %s must use its own business permission, got %#v", method, got)
		}
	}
	for _, command := range [][2]string{
		{"outsourcing_order", "save_outsourcing_order_with_items"},
		{"operational_fact", "create_payable_from_outsourcing_return"},
		{"operational_fact", "create_outsourcing_unknown_command"},
	} {
		ctx := biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
		if got := dispatcher.requireSensitiveFieldMutationPermission(withAdminPermissionCache(ctx), command[0], command[1]); got == nil || got.Code != errcode.PermissionDenied.Code {
			t.Errorf("commercial command %s must retain the field permission, got %#v", command[1], got)
		}
	}
}

func TestOutsourcingWarehouseDraftSaveRejectsClientCommercialFields(t *testing.T) {
	for _, method := range []string{"save_outsourcing_material_issue_draft", "save_outsourcing_return_receipt_draft"} {
		params := map[string]any{
			"id": float64(21), "expected_version": float64(1), "warehouse_id": float64(2),
			"lot_id": float64(3), "quantity": "2", "occurred_at": "2026-10-16T10:00:00Z",
		}
		if _, ok := outsourcingFactDraftSaveFromParams(params, method); !ok {
			t.Fatalf("valid warehouse draft %s rejected", method)
		}
		for _, field := range []string{"unit_price", "amount"} {
			params[field] = "1"
			if _, ok := outsourcingFactDraftSaveFromParams(params, method); ok {
				t.Fatalf("%s must reject client commercial field %s", method, field)
			}
			delete(params, field)
		}
	}
}

func TestSensitiveFieldPurchaseReturnsUseSourcePermissionsWithoutExposingPrices(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionPurchaseReceiptRead, biz.PermissionPurchaseReturnCreate)
	dispatcher := &jsonrpcDispatcher{}
	for _, method := range []string{"create_purchase_return_from_receipt", "create_purchase_return_from_quality_inspection"} {
		ctx := biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
		if result := dispatcher.requireSensitiveFieldMutationPermission(withAdminPermissionCache(ctx), "purchase", method); result != nil {
			t.Fatalf("source-only return %s requires an unrelated field permission: %#v", method, result)
		}
	}
	for _, method := range []string{"create_purchase_return_draft", "create_purchase_unknown_command"} {
		ctx := biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin)
		if result := dispatcher.requireSensitiveFieldMutationPermission(withAdminPermissionCache(ctx), "purchase", method); result == nil || result.Code != errcode.PermissionDenied.Code {
			t.Fatalf("unregistered purchase mutation must fail closed: %s %#v", method, result)
		}
	}
	receipt := map[string]any{"return_no": "RETURN-SOURCE", "purchase_receipt_id": float64(11), "returned_at": "2026-10-17T10:00:00Z", "idempotency_key": "return-source", "items": []any{map[string]any{"purchase_receipt_item_id": float64(12), "quantity": "2"}}}
	quality := map[string]any{"return_no": "RETURN-QUALITY", "quality_inspection_id": float64(13), "quantity": "2", "returned_at": "2026-10-17T10:00:00Z", "reason": "尺寸不合格", "idempotency_key": "return-quality"}
	if _, ok := purchaseReturnFromReceiptCreateFromParams(receipt); !ok {
		t.Fatal("valid receipt return rejected")
	}
	if _, ok := purchaseReturnFromQualityInspectionCreateFromParams(quality); !ok {
		t.Fatal("valid quality return rejected")
	}
	for _, field := range []string{"unit_price", "amount", "supplier_name", "warehouse_id", "lot_id"} {
		receipt[field] = "forged"
		if _, ok := purchaseReturnFromReceiptCreateFromParams(receipt); ok {
			t.Fatalf("receipt return accepted caller-owned %s", field)
		}
		delete(receipt, field)
		quality[field] = "forged"
		if _, ok := purchaseReturnFromQualityInspectionCreateFromParams(quality); ok {
			t.Fatalf("quality return accepted caller-owned %s", field)
		}
		delete(quality, field)
		line := receipt["items"].([]any)[0].(map[string]any)
		line[field] = "forged"
		if _, ok := purchaseReturnFromReceiptCreateFromParams(receipt); ok {
			t.Fatalf("return line accepted caller-owned %s", field)
		}
		delete(line, field)
	}
	line := map[string]any{"purchase_receipt_item_id": 12, "quantity": "2", "unit_price": "3.5", "amount": "7"}
	payload := map[string]any{"purchase_return": map[string]any{"items": []any{line}}}
	redactSensitiveFieldMap(payload, "procurement", sensitiveFieldReadPolicy{})
	if _, ok := line["unit_price"]; ok {
		t.Fatal("return price leaked")
	}
	if _, ok := line["amount"]; ok {
		t.Fatal("return amount leaked")
	}
	if line["quantity"] != "2" || line["purchase_receipt_item_id"] != 12 {
		t.Fatal("redaction removed warehouse facts")
	}
}
