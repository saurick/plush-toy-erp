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
	filter *biz.SalesOrderSummaryFilter
}

func (r *salesOrderSummaryJSONRPCRepo) ListSalesOrderSummary(_ context.Context, f biz.SalesOrderSummaryFilter) ([]*biz.SalesOrderSummaryRow, int, error) {
	r.filter = &f
	price := decimal.NewFromInt(3)
	return []*biz.SalesOrderSummaryRow{{Order: &biz.SalesOrder{ID: 1, OrderNo: "SO-SUM", OrderDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), CustomerSnapshot: map[string]any{"name": "模拟客户"}, Currency: "USD"},
		Item: &biz.SalesOrderItem{ID: 2, SalesOrderID: 1, OrderedQuantity: decimal.NewFromInt(10), PreShipmentSampleQuantity: decimal.NewFromInt(2), UnitPrice: &price, ImportSource: map[string]any{"private": "source evidence"}}, UnitName: "只"}}, 1, nil
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
			admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, tc.permissions...)
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
			d.applySensitiveFieldReadPolicy(ctx, "sales_order", "list_sales_order_summary", result)
			row := result.Data.AsMap()["items"].([]any)[0].(map[string]any)
			if row["production_quantity"] != "12" || row["customer_name"] != "模拟客户" || row["unit_name"] != "只" || row["import_source"] != nil {
				t.Fatalf("wrong summary mapping: %+v", row)
			}
			priceAllowed := tc.super || tc.name == "commercial role"
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
