package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestSalesOrderJSONRPCNumberCreateAndUpdateBoundary(t *testing.T) {
	for _, tc := range []struct {
		name                     string
		value                    any
		omitted, update, allowed bool
	}{
		{name: "automatic", omitted: true, allowed: true},
		{name: "blank automatic", value: "  ", allowed: true},
		{name: "manual", value: " SO-MANUAL ", allowed: true},
		{name: "null", value: nil},
		{name: "numeric", value: 42},
		{name: "boolean", value: true},
		{name: "edit missing number", omitted: true, update: true},
		{name: "edit cleared number", value: " ", update: true},
		{name: "edit explicit number", value: " SO-MANUAL ", update: true, allowed: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubSalesOrderJSONRPCRepo{customerActive: true, unitActive: true, lifecycleStatus: biz.SalesOrderStatusDraft}
			d := newSalesOrderJSONRPCTestData(t, repo, &biz.AdminUser{ID: 1, IsSuperAdmin: true})
			params := map[string]any{"customer_id": 1, "currency": "CNY", "order_date": "2026-10-26",
				"tax_mode": biz.SalesOrderTaxModeNone, "freight_terms": biz.SalesOrderFreightTermsIncluded, "items": []any{}}
			if !tc.omitted {
				params["order_no"] = tc.value
			}
			if tc.update {
				params["id"], params["expected_version"] = 1, 1
			}
			_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_with_items", "number", mustJSONRPCStruct(t, params))
			if err != nil || (result.Code == errcode.OK.Code) != tc.allowed || (repo.savedOrder != nil) != tc.allowed {
				t.Fatalf("result=%+v saved=%+v err=%v", result, repo.savedOrder, err)
			}
			if tc.allowed {
				want := ""
				if tc.name == "manual" || tc.name == "edit explicit number" {
					want = "SO-MANUAL"
				}
				if repo.savedOrder.OrderNo != want {
					t.Fatalf("number=%q, want=%q", repo.savedOrder.OrderNo, want)
				}
			}
		})
	}
}
