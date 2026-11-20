package main

import (
	"strings"
	"testing"
)

func TestRPCInspectionPartnerAccountAndReadContracts(t *testing.T) {
	methods, err := rpcMethods("../../..")
	if err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection("../../..", methods)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		domain, method string
		fields         []string
	}{
		{"admin", "create_partner", []string{"account_kind", "customer_id", "display_name", "password", "supplier_id", "username"}},
		{"auth", "partner_login", []string{"password", "username"}},
		{"partner", "get_sales_order", []string{"id"}},
		{"partner", "get_purchase_order", []string{"id"}},
		{"partner", "list_sales_orders", []string{"keyword", "limit", "offset"}},
		{"partner", "list_purchase_orders", []string{"keyword", "limit", "offset"}},
	} {
		found := map[string]bool{}
		for _, f := range index[tc.domain][tc.method].Parameters {
			found[f.Name] = true
		}
		for _, name := range tc.fields {
			if !found[name] {
				t.Errorf("%s.%s missing %s, fields=%v", tc.domain, tc.method, name, found)
			}
		}
	}
	for _, field := range index["admin"]["create_partner"].Parameters {
		if field.Name == "supplier_id" || field.Name == "customer_id" {
			if !strings.Contains(field.Required, "条件必填") || len(field.RequiredWhen) != 1 || field.RequiredWhen[0].Field != "account_kind" {
				t.Fatalf("organization binding lost conditional requirement: %#v", field)
			}
		}
	}
	fields := index["admin"]["create_partner"].Parameters
	for _, kind := range []string{"supplier", "customer"} {
		params := map[string]any{"account_kind": kind, "display_name": "模拟合作账号", "username": "sim_partner", "password": "Sim-password-1"}
		if err := validateRPCParameterExample(fields, params, "partner-binding"); err == nil {
			t.Fatalf("missing %s binding passed example validation", kind)
		}
		params[kind+"_id"] = float64(7)
		if err := validateRPCParameterExample(fields, params, "partner-binding"); err != nil {
			t.Fatalf("valid %s binding rejected: %v", kind, err)
		}
	}
}
