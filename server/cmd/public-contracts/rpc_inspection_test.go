package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestRPCInspectionKeepsFieldsRejectedOnlyInOneInputBranch(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "server/internal/service")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	source := `package service
type jsonrpcDispatcher struct{}
func(d *jsonrpcDispatcher) Handle(url,method string,pm map[string]any)(any,bool){switch url{case "orders":return d.handleOrders(method,pm)};return nil,false}
func(d *jsonrpcDispatcher) handleOrders(method string,pm map[string]any)(any,bool){switch method{case "save":
 if _,present:=pm["legacy"];present{return nil,false}
 mode,_:=pm["mode"].(string)
 if mode=="create"{if _,present:=pm["expected_version"];present{return nil,false}}
 version,_:=optionalInt(pm,"expected_version");return version,true
};return nil,false}
func optionalInt(pm map[string]any,key string)(int,bool){value,_:=pm[key].(float64);return int(value),true}
`
	if err := os.WriteFile(filepath.Join(dir, "jsonrpc.go"), []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	methods := map[string]map[string]string{"orders": {"SAVE": "save"}}
	index, err := rpcInspection(root, methods)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, field := range index["orders"]["save"].Parameters {
		if field.Name == "legacy" {
			t.Fatal("an unconditionally rejected alias must stay excluded")
		}
		if field.Name == "expected_version" {
			found = true
		}
	}
	if !found {
		t.Fatal("a field accepted by the update branch must not be removed by the create branch")
	}
}

func TestRPCInspectionFollowsMethodParamsWithoutMixingOtherActions(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "server/internal/service")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	source := `package service
 type jsonrpcDispatcher struct{}
 func(d *jsonrpcDispatcher) Handle(url,method string,pm map[string]any){switch url{case "admin":return d.handleAdmin(method,pm)}}
 func(d *jsonrpcDispatcher) handleAdmin(method string,pm map[string]any){switch method{
 case "change":rejectUnknown(pm,"password","reason");password,_:=pm["password"].(string);_ = password;return d.change(pm)
 case "list":rejectUnknown(pm);return nil
 case "remove":id:=pm["id"];_ = id;return nil
 }}
 func(d *jsonrpcDispatcher) change(pm map[string]any){value,_:=pm["reason"].(string);_ = value;rejected:=pm["legacy_alias"];_ = rejected}
 func rejectUnknown(pm map[string]any, keys ...string){}
 `
	if err := os.WriteFile(filepath.Join(dir, "jsonrpc.go"), []byte(source), 0644); err != nil {
		t.Fatal(err)
	}
	methods := map[string]map[string]string{"admin": {"CHANGE": "change", "LIST": "list", "REMOVE": "remove"}}
	index, err := rpcInspection(root, methods)
	if err != nil {
		t.Fatal(err)
	}
	var fields []string
	for _, field := range index["admin"]["change"].Parameters {
		fields = append(fields, field.Name)
		if field.Type != "string" {
			t.Fatalf("lost actual type: %#v", field)
		}
		if field.Source.Path != "server/internal/service/jsonrpc.go" || field.Source.Line <= 0 {
			t.Fatal("missing source")
		}
	}
	if !reflect.DeepEqual(fields, []string{"password", "reason"}) {
		t.Fatalf("mixed method fields: %#v", fields)
	}
	if !index["admin"]["list"].EmptyParameters || len(index["admin"]["list"].Parameters) != 0 {
		t.Fatal("empty parameter check lost")
	}
}

func TestRPCInspectionCoversCurrentMethodsAndEmptyPasswordResponse(t *testing.T) {
	methods, err := rpcMethods("../../..")
	if err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection("../../..", methods)
	if err != nil {
		t.Fatal(err)
	}
	for domain, names := range methods {
		if len(index[domain]) != len(names) {
			t.Fatal(domain)
		}
		for _, name := range names {
			if index[domain][name].Entry.Path == "" {
				t.Fatal(domain, name)
			}
		}
	}
	password := index["admin"]["change_password"]
	if !password.EmptyData || len(password.Response) != 0 || len(password.Parameters) != 2 {
		t.Fatalf("password contract drift: %#v", password)
	}
	if !index["admin"]["list"].EmptyParameters {
		t.Fatal("admin.list no longer explicitly accepts empty params")
	}
	for _, field := range index["workflow"]["urge_task"].Parameters {
		if field.Name == "id" {
			t.Fatal("rejected task id alias must not appear among request fields")
		}
	}
}

func TestRPCInspectionRetainsOmissionNullAndConditionalRules(t *testing.T) {
	methods, err := rpcMethods("../../..")
	if err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection("../../..", methods)
	if err != nil {
		t.Fatal(err)
	}
	find := func(domain, method, name string) rpcSourceField {
		t.Helper()
		for _, field := range index[domain][method].Parameters {
			if field.Name == name {
				return field
			}
		}
		t.Fatalf("missing %s.%s.%s", domain, method, name)
		return rpcSourceField{}
	}
	for _, item := range [][3]string{
		{"masterdata", "update_product_sku", "default_unit_id"},
		{"masterdata", "update_product_sku", "unit_net_weight_g"},
		{"purchase_order", "complete_purchase_order_terms", "expected_arrival_date"},
		{"purchase_order", "complete_purchase_order_terms", "supplier_confirmed_arrival_date"},
		{"purchase_order", "complete_purchase_order_terms", "items[].expected_arrival_date"},
		{"sales_order", "save_sales_order_engineering", "items[].product_id"},
	} {
		field := find(item[0], item[1], item[2])
		if !field.Nullable {
			t.Errorf("successful null-clear lost: %v", item)
		}
	}
	for _, item := range [][3]string{{"sales_order", "get_sales_order", "id"}, {"purchase_order", "get_purchase_order", "id"}, {"outsourcing_order", "get_outsourcing_order", "id"}, {"admin", "set_disabled", "disabled"}} {
		field := find(item[0], item[1], item[2])
		if field.Required != "必填" || field.Nullable {
			t.Errorf("strict required input weakened: %v %#v", item, field)
		}
	}
	optionalID := find("sales_order", "save_sales_order_with_items", "id")
	if optionalID.Required != "可选" || optionalID.Nullable {
		t.Fatal("omitted/zero ID must not imply null is valid")
	}
	due := find("workflow", "create_task", "due_at")
	if due.Required != "可选" || !due.Nullable || due.Type != "integer" {
		t.Fatalf("Unix-second optional parser: %#v", due)
	}
	for _, name := range []string{"defect_rate_operator", "defect_rate_percent"} {
		field := find("customer_config", "execute_finished_goods_delivery_quality_decide", name)
		if !field.Nullable || len(field.RequiredWhen) != 1 || field.RequiredWhen[0].Presence != "nonnull" {
			t.Fatalf("omitted/null pair lost: %#v", field)
		}
	}
	for _, name := range []string{"calendar_month", "calendar_selection"} {
		field := find("workflow", "get_task_board", name)
		if len(field.RequiredWhen) != 1 || len(field.RequiredWhen[0].AnyOf) != 3 {
			t.Fatalf("calendar partial-input rule lost: %#v", field)
		}
	}
	if field := find("workflow", "get_task_board", "calendar_revision"); field.Required != "可选" {
		t.Fatalf("optional calendar revision: %#v", field)
	}
	for _, name := range []string{"break_glass_reason", "break_glass_expires_at"} {
		field := find("workflow", "complete_task_action", name)
		if len(field.RequiredWhen) != 2 || field.RequiredWhen[1].Equals != "true" {
			t.Fatalf("emergency grant conditional input: %#v", field)
		}
	}
	for _, method := range []string{"list_finance_payment_allocation_candidates", "reverse_finance_allocation"} {
		for _, field := range index["operational_fact"][method].Parameters {
			if field.Name == "allocations" {
				t.Fatalf("return path mixed with allocation write: %s", method)
			}
		}
	}
}
