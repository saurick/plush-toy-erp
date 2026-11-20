package service

import (
	"strings"
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
			if !tc.update {
				params["idempotency_key"] = "number-request"
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

func TestSalesOrderJSONRPCCreateIdempotencyBoundary(t *testing.T) {
	for _, tc := range []struct {
		name                        string
		key                         any
		omit, edit, forged, allowed bool
	}{
		{name: "valid", key: " create-once ", allowed: true},
		{name: "missing", omit: true},
		{name: "blank", key: " "},
		{name: "null", key: nil},
		{name: "number", key: 123},
		{name: "boolean", key: true},
		{name: "too long", key: strings.Repeat("x", 129)},
		{name: "edit with creation key", key: "create-once", edit: true},
		{name: "forged actor", key: "create-once", forged: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubSalesOrderJSONRPCRepo{customerActive: true, unitActive: true, lifecycleStatus: biz.SalesOrderStatusDraft}
			d := newSalesOrderJSONRPCTestData(t, repo, &biz.AdminUser{ID: 1, IsSuperAdmin: true})
			params := map[string]any{"customer_id": 1, "order_date": "2026-11-15", "tax_mode": "NONE", "freight_terms": "INCLUDED", "items": []any{}}
			if !tc.omit {
				params["idempotency_key"] = tc.key
			}
			if tc.edit {
				params["id"], params["expected_version"], params["order_no"] = 1, 1, "SO-EDIT"
			}
			if tc.forged {
				params["actor_id"] = 2
			}
			_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_with_items", "create", mustJSONRPCStruct(t, params))
			if err != nil || (result.Code == errcode.OK.Code) != tc.allowed || (repo.savedOrder != nil) != tc.allowed {
				t.Fatalf("result=%+v err=%v", result, err)
			}
			if tc.allowed && (repo.savedOrder.IdempotencyKey != "create-once" || repo.savedOrder.ActorID != 7 || len(repo.savedOrder.CreateIntentHash) != 64) {
				t.Fatalf("identity not bound to authenticated actor: %+v", repo.savedOrder)
			}
		})
	}
}
