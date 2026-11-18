package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/errcode"
)

type salesOrderSummaryJSONRPCRepo struct {
	*stubSalesOrderJSONRPCRepo
	filter      *biz.SalesOrderSummaryFilter
	optionsRead bool
}

func (r *salesOrderSummaryJSONRPCRepo) ListSalesOrderSummary(_ context.Context, f biz.SalesOrderSummaryFilter) ([]*biz.SalesOrderSummaryRow, int, error) {
	r.filter = &f
	price := decimal.NewFromInt(3)
	return []*biz.SalesOrderSummaryRow{{Order: &biz.SalesOrder{ID: 1, OrderNo: "SO-SUM", OrderDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), CustomerSnapshot: map[string]any{"name": "模拟客户"}, Currency: "USD"},
		Item: &biz.SalesOrderItem{ID: 2, SalesOrderID: 1, OrderedQuantity: decimal.NewFromInt(10), PreShipmentSampleQuantity: decimal.NewFromInt(2), UnitPrice: &price, ImportSource: map[string]any{"private": "source evidence"}}, UnitName: "只"}}, 1, nil
}

func (r *salesOrderSummaryJSONRPCRepo) ListSalesOrderSummaryFilterOptions(context.Context) (*biz.SalesOrderSummaryOptions, error) {
	r.optionsRead = true
	return &biz.SalesOrderSummaryOptions{
		Customers:   []biz.SalesSummaryCustomerOption{{ID: 42, Code: "C-42", Name: "模拟客户", PreviousNames: []string{"模拟旧名"}}},
		SalesOwners: []string{"模拟跟单员"},
	}, nil
}

func TestSalesOrderSummaryFilterOptionsJSONRPC(t *testing.T) {
	reads := []string{biz.PermissionERPWorkbenchRead, biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead}
	for _, tc := range []struct {
		name                    string
		permissions             []string
		params                  map[string]any
		moduleDisabled, allowed bool
	}{
		{"summary reader", reads, nil, false, true},
		{"missing workbench", reads[1:], nil, false, false},
		{"missing order", []string{reads[0], reads[2]}, nil, false, false},
		{"missing item", reads[:2], nil, false, false},
		{"unknown field", reads, map[string]any{"actor_id": 1}, false, false},
		{"disabled module", reads, nil, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := &stubSalesOrderJSONRPCRepo{}
			d := newSalesOrderJSONRPCTestData(t, base, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, tc.permissions...))
			repo := &salesOrderSummaryJSONRPCRepo{stubSalesOrderJSONRPCRepo: base}
			d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
			if tc.moduleDisabled {
				d.customerConfigUC = sourceModuleGateCustomerConfig(map[string]string{"sales_orders": "disabled"})
			}
			_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "list_sales_order_summary_filter_options", "options", mustJSONRPCStruct(t, tc.params))
			if err != nil || (result.Code == errcode.OK.Code) != tc.allowed || repo.optionsRead != tc.allowed {
				t.Fatalf("result=%v err=%v read=%v", result, err, repo.optionsRead)
			}
			if tc.allowed {
				data := result.Data.AsMap()
				c := data["customers"].([]any)[0].(map[string]any)
				if len(c) != 4 || c["id"] != float64(42) || c["code"] != "C-42" || c["name"] != "模拟客户" || c["previous_names"].([]any)[0] != "模拟旧名" || data["sales_owners"].([]any)[0] != "模拟跟单员" {
					t.Fatal(data)
				}
			}
		})
	}
}

func TestSalesOrderSummaryJSONRPCPermissionsFiltersAndRedaction(t *testing.T) {
	reads := []string{biz.PermissionERPWorkbenchRead, biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead}
	for _, tc := range []struct {
		name                                string
		permissions                         []string
		params                              map[string]any
		allowed, disabled, anonymous, super bool
	}{
		{name: "source reader", permissions: reads, allowed: true, params: map[string]any{"customer": " 模拟客户 ", "offset": 20, "limit": 20}},
		{name: "exact customer", permissions: reads, allowed: true, params: map[string]any{"customer_id": 42, "sales_owner_name": "模拟跟单员", "sort_by": "customer_name", "sort_direction": "asc"}},
		{name: "unsupported sort", permissions: reads, params: map[string]any{"sort_by": "unknown", "sort_direction": "desc"}},
		{name: "cleared customer", permissions: reads, allowed: true, params: map[string]any{"customer_id": 0}},
		{name: "negative customer", permissions: reads, params: map[string]any{"customer_id": -1}},
		{name: "fractional customer", permissions: reads, params: map[string]any{"customer_id": 1.5}},
		{name: "string customer", permissions: reads, params: map[string]any{"customer_id": "42"}},
		{name: "null customer", permissions: reads, params: map[string]any{"customer_id": nil}},
		{name: "restricted price", permissions: reads, params: map[string]any{"sort_by": " unit_price ", "sort_direction": "asc"}},
		{name: "restricted currency", permissions: append(append([]string{}, reads...), biz.PermissionFieldSalesCommercialRead), params: map[string]any{"sort_by": "currency", "sort_direction": "desc"}},
		{name: "commercial price", permissions: append(append([]string{}, reads...), biz.PermissionFieldSalesCommercialRead), params: map[string]any{"sort_by": "unit_price", "sort_direction": "asc"}, allowed: true},
		{name: "settlement currency", permissions: append(append([]string{}, reads...), biz.PermissionFieldSalesCommercialRead, biz.PermissionFieldFinanceSettlementRead), params: map[string]any{"sort_by": "currency", "sort_direction": "desc"}, allowed: true},
		{name: "commercial role", permissions: append(append([]string{}, reads...), biz.PermissionFieldSalesCommercialRead), allowed: true},
		{name: "super admin", super: true, allowed: true},
		{name: "missing workbench", permissions: reads[1:]},
		{name: "missing item read", permissions: reads[:2]},
		{name: "missing order read", permissions: []string{reads[0], reads[2]}},
		{name: "disabled", permissions: reads, disabled: true},
		{name: "anonymous", permissions: reads, anonymous: true},
		{name: "unknown filter", permissions: reads, params: map[string]any{"actor_id": 3}},
		{name: "bad limit", permissions: reads, params: map[string]any{"limit": 201}},
		{name: "zero limit", permissions: reads, params: map[string]any{"limit": 0}},
		{name: "fractional page", permissions: reads, params: map[string]any{"offset": 1.5}},
		{name: "bad filter type", permissions: reads, params: map[string]any{"customer": 1}},
		{name: "long keyword", permissions: reads, params: map[string]any{"keyword": strings.Repeat("长", 101)}},
		{name: "bad status", permissions: reads, params: map[string]any{"lifecycle_status": "shipped"}},
		{name: "bad date type", permissions: reads, params: map[string]any{"date_from": true}},
		{name: "reversed dates", permissions: reads, params: map[string]any{"date_from": "2026-09-03", "date_to": "2026-09-01"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			roles := []string{biz.SalesRoleKey}
			if tc.name == "settlement currency" {
				roles = append(roles, biz.FinanceRoleKey)
			}
			admin := workflowJSONRPCAdmin(roles, tc.permissions...)
			admin.Disabled, admin.IsSuperAdmin = tc.disabled, tc.super
			base := &stubSalesOrderJSONRPCRepo{}
			d := newSalesOrderJSONRPCTestData(t, base, admin)
			repo := &salesOrderSummaryJSONRPCRepo{stubSalesOrderJSONRPCRepo: base}
			d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
			ctx := workflowJSONRPCAdminContext()
			if tc.anonymous {
				ctx = context.Background()
			}
			_, result, err := d.handleSalesOrder(ctx, "list_sales_order_summary", "summary", mustJSONRPCStruct(t, tc.params))
			if err != nil || (result.Code == errcode.OK.Code) != tc.allowed || (repo.filter != nil) != tc.allowed {
				t.Fatalf("result=%+v err=%v query=%+v", result, err, repo.filter)
			}
			if !tc.allowed {
				return
			}
			if tc.name == "exact customer" && (repo.filter.CustomerID != 42 || repo.filter.SalesOwnerName != "模拟跟单员" || repo.filter.SortBy != "customer_name" || repo.filter.SortDirection != "asc") {
				t.Fatalf("exact customer filter was lost: %+v", repo.filter)
			}
			d.applySensitiveFieldReadPolicy(ctx, "sales_order", "list_sales_order_summary", result)
			row := result.Data.AsMap()["items"].([]any)[0].(map[string]any)
			if row["production_quantity"] != "12" || row["customer_name"] != "模拟客户" || row["unit_name"] != "只" || row["import_source"] != nil {
				t.Fatalf("wrong summary mapping: %+v", row)
			}
			priceAllowed := tc.super || biz.PermissionSetHasAny(biz.PermissionKeySet(tc.permissions), biz.PermissionFieldSalesCommercialRead)
			if (row["unit_price"] != nil) != priceAllowed {
				t.Fatalf("commercial field leak: %+v", row)
			}
		})
	}
}

func TestSalesOrderSummaryJSONRPCModuleGate(t *testing.T) {
	base := &stubSalesOrderJSONRPCRepo{}
	d := newSalesOrderJSONRPCTestData(t, base, &biz.AdminUser{ID: 1, IsSuperAdmin: true})
	repo := &salesOrderSummaryJSONRPCRepo{stubSalesOrderJSONRPCRepo: base}
	d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
	d.customerConfigUC = sourceModuleGateCustomerConfig(map[string]string{"sales_orders": "disabled"})
	_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "list_sales_order_summary", "summary", mustJSONRPCStruct(t, nil))
	if err != nil || result.Code == errcode.OK.Code || repo.filter != nil {
		t.Fatalf("disabled source module reached summary: %+v %v", result, err)
	}
}
