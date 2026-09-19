package service

import (
	"context"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
	"testing"
	"time"
)

type outsourcingSummaryJSONRPCRepo struct {
	*stubOutsourcingOrderJSONRPCRepo
	filter *biz.OutsourcingOrderSummaryFilter
}

func (r *outsourcingSummaryJSONRPCRepo) ListOutsourcingOrderSummary(_ context.Context, filter biz.OutsourcingOrderSummaryFilter) ([]*biz.OutsourcingOrderSummaryRow, int, error) {
	r.filter = &filter
	price := decimal.NewFromInt(3)
	return []*biz.OutsourcingOrderSummaryRow{{Order: &biz.OutsourcingOrder{ID: 1, OutsourcingOrderNo: "OUT-SUM", SupplierID: 5, Currency: "CNY", OrderDate: time.Now(), SupplierSnapshot: map[string]any{"name": "模拟加工厂", "address": "private address"}, ContractPartySnapshot: map[string]any{"buyerContact": "模拟委托人", "buyerPhone": "private phone"}}, Item: &biz.OutsourcingOrderItem{ID: 2, OutsourcingOrderID: 1, OutsourcingQuantity: decimal.NewFromInt(1), UnitPrice: &price, Amount: &price}}}, 1, nil
}
func TestOutsourcingOrderSummaryJSONRPCPermissionsFiltersAndRedaction(t *testing.T) {
	reads := []string{biz.PermissionOutsourcingOrderRead}
	for _, tc := range []struct {
		name                                string
		params                              map[string]any
		permissions                         []string
		allowed, disabled, anonymous, super bool
	}{
		{name: "source reader", permissions: reads, allowed: true, params: map[string]any{"keyword": " 内容 ", "supplier_id": 5, "process_id": 2, "limit": 20, "offset": 20}},
		{name: "commercial reader", permissions: []string{reads[0], biz.PermissionFieldProcurementCommercialRead}, allowed: true},
		{name: "private reader", permissions: []string{reads[0], biz.PermissionFieldPartyPrivateRead}, allowed: true},
		{name: "super admin", super: true, allowed: true},
		{name: "no permission"},
		{name: "disabled", permissions: reads, disabled: true},
		{name: "anonymous", permissions: reads, anonymous: true},
		{name: "unknown field", permissions: reads, params: map[string]any{"actor_id": 1}},
		{name: "bad limit", permissions: reads, params: map[string]any{"limit": 201}},
		{name: "zero limit", permissions: reads, params: map[string]any{"limit": 0}},
		{name: "fractional offset", permissions: reads, params: map[string]any{"offset": 1.2}},
		{name: "negative supplier", permissions: reads, params: map[string]any{"supplier_id": -1}},
		{name: "text process", permissions: reads, params: map[string]any{"process_id": "2"}},
		{name: "bad keyword type", permissions: reads, params: map[string]any{"keyword": true}},
		{name: "long keyword", permissions: reads, params: map[string]any{"keyword": strings.Repeat("长", 101)}},
		{name: "bad status", permissions: reads, params: map[string]any{"lifecycle_status": "shipped"}},
		{name: "bad scope", permissions: reads, params: map[string]any{"lifecycle_scope": "deleted"}},
		{name: "bad date type", permissions: reads, params: map[string]any{"date_from": true}},
		{name: "reversed dates", permissions: reads, params: map[string]any{"date_from": "2026-09-03", "date_to": "2026-09-01"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			admin := workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, tc.permissions...)
			admin.Disabled, admin.IsSuperAdmin = tc.disabled, tc.super
			base := newStubOutsourcingOrderJSONRPCRepo()
			d := newOutsourcingOrderJSONRPCTestData(t, base, admin)
			repo := &outsourcingSummaryJSONRPCRepo{stubOutsourcingOrderJSONRPCRepo: base}
			d.outsourcingOrderUC = biz.NewOutsourcingOrderUsecase(repo)
			ctx := workflowJSONRPCAdminContext()
			if tc.anonymous {
				ctx = context.Background()
			}
			_, result, err := d.handleOutsourcingOrder(ctx, "list_outsourcing_order_summary", "summary", mustJSONRPCStruct(t, tc.params))
			if err != nil || (result.Code == errcode.OK.Code) != tc.allowed || (repo.filter != nil) != tc.allowed {
				t.Fatalf("result=%+v err=%v filter=%+v", result, err, repo.filter)
			}
			if !tc.allowed {
				return
			}
			d.applySensitiveFieldReadPolicy(ctx, "outsourcing_order", "list_outsourcing_order_summary", result)
			row := result.Data.AsMap()["items"].([]any)[0].(map[string]any)
			if row["supplier_name"] != "模拟加工厂" || row["buyer_contact"] != "模拟委托人" || row["supplier_snapshot"] != nil || row["contract_party_snapshot"] != nil {
				t.Fatalf("summary mapping leaked a full snapshot: %+v", row)
			}
			money := tc.super || tc.name == "commercial reader"
			private := tc.super || tc.name == "private reader"
			if (row["unit_price"] != nil) != money || (row["amount"] != nil) != money || (row["buyer_phone"] != nil) != private || (row["currency"] != nil) != tc.super {
				t.Fatalf("sensitive field leak: %+v", row)
			}
			if tc.name == "source reader" && (repo.filter.Keyword != "内容" || repo.filter.SupplierID != 5 || repo.filter.ProcessID != 2 || repo.filter.Offset != 20) {
				t.Fatalf("filters not forwarded: %+v", repo.filter)
			}
		})
	}
}
func TestOutsourcingOrderSummaryRemainsReadableForModuleHistory(t *testing.T) {
	base := newStubOutsourcingOrderJSONRPCRepo()
	d := newOutsourcingOrderJSONRPCTestData(t, base, &biz.AdminUser{ID: 1, IsSuperAdmin: true})
	repo := &outsourcingSummaryJSONRPCRepo{stubOutsourcingOrderJSONRPCRepo: base}
	d.outsourcingOrderUC = biz.NewOutsourcingOrderUsecase(repo)
	d.customerConfigUC = sourceModuleGateCustomerConfig(map[string]string{"outsourcing_orders": "disabled"})
	_, result, err := d.handleOutsourcingOrder(workflowJSONRPCAdminContext(), "list_outsourcing_order_summary", "summary", mustJSONRPCStruct(t, nil))
	if err != nil || result.Code != errcode.OK.Code || repo.filter == nil {
		t.Fatalf("history unexpectedly unavailable: %+v %v", result, err)
	}
}
