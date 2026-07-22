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
			"items": []any{map[string]any{
				"product_name": "玩偶", "unit_price": "12.5", "amount": "25",
			}},
		},
	}
	redactSensitiveFieldMap(data, "sales", sensitiveFieldReadPolicy{})
	customer := data["customer"].(map[string]any)
	if customer["name"] != "客户甲" || customer["phone"] != nil || customer["tax_no"] != nil {
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
