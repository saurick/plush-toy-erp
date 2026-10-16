package service

import (
	"context"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

type statisticsAPIRepo struct {
	query biz.BusinessStatisticsQuery
	calls int
}

func (r *statisticsAPIRepo) Statistics(_ context.Context, q biz.BusinessStatisticsQuery) (*biz.BusinessStatisticsBoard, error) {
	r.query = q
	r.calls++
	amount := "100.01"
	return &biz.BusinessStatisticsBoard{Report: q.Report, GroupBy: q.GroupBy, SnapshotAt: q.SnapshotAt, Access: q.Access, Totals: biz.BusinessStatisticsMetrics{Amount: &amount}, Groups: []biz.BusinessStatisticsGroup{}}, nil
}
func (r *statisticsAPIRepo) StatisticsSources(_ context.Context, q biz.BusinessStatisticsQuery) (*biz.BusinessStatisticsSources, error) {
	r.query = q
	r.calls++
	return &biz.BusinessStatisticsSources{Rows: []biz.BusinessStatisticsSource{}, Access: q.Access, SnapshotAt: q.SnapshotAt}, nil
}

func TestBusinessStatisticsJSONRPC(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	var permissions []string
	for _, role := range biz.BuiltinRoles() {
		if role.Key == biz.BossRoleKey {
			permissions = role.Permissions
		}
	}
	d, _, _ := newProductionOrderJSONRPCTestData(t, permissions...)
	d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, permissions...)}
	r := &statisticsAPIRepo{}
	d.businessStatisticsUC = biz.NewBusinessStatisticsUsecase(r)
	ctx := workflowJSONRPCAdminContext()
	_, res, err := d.handleBusiness(ctx, "get_delivery_statistics", "1", nil)
	if err != nil || res.Code != 0 || r.calls != 1 || !r.query.Access.SalesAmounts {
		t.Fatalf("result=%+v query=%+v %v", res, r.query, err)
	}
	d.applySensitiveFieldReadPolicy(ctx, "business", "get_delivery_statistics", res)
	if res.Data.AsMap()["totals"].(map[string]any)["amount"] != "100.01" {
		t.Fatal("sales amount redacted by unrelated procurement permission")
	}
	for _, test := range []struct {
		method string
		params map[string]any
		code   int32
	}{
		{"get_delivery_statistics", map[string]any{"access": map[string]any{"sales": true}}, errcode.InvalidParam.Code},
		{"get_delivery_statistics", map[string]any{"snapshot_at": "2020-01-01"}, errcode.InvalidParam.Code},
		{"get_delivery_statistics", map[string]any{"group_key": "c:1"}, errcode.InvalidParam.Code},
		{"get_delivery_statistics", map[string]any{"limit": 101}, errcode.InvalidParam.Code},
		{"get_delivery_statistics", map[string]any{"period": "custom", "date_from": "2026-02-30"}, errcode.InvalidParam.Code},
		{"list_delivery_statistics_sources", map[string]any{"group_key": "p:1"}, errcode.InvalidParam.Code},
	} {
		_, res, err = d.handleBusiness(ctx, test.method, "invalid", newDataStruct(test.params))
		if err != nil || res.Code != test.code || r.calls != 1 {
			t.Fatalf("%+v result=%+v calls=%d %v", test, res, r.calls, err)
		}
	}
	for _, state := range []string{"anonymous", "disabled", "denied"} {
		admin := workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionSalesOrderRead)
		callCtx, want := ctx, errcode.PermissionDenied.Code
		if state == "anonymous" {
			callCtx, want = context.Background(), errcode.AuthRequired.Code
		}
		if state == "disabled" {
			admin.Disabled = true
			want = errcode.AdminDisabled.Code
		}
		d.adminReader = stubAdminAccountReader{admin: admin}
		_, res, err = d.handleBusiness(callCtx, "get_delivery_statistics", state, nil)
		if err != nil || res.Code != want || r.calls != 1 {
			t.Fatalf("%s=%+v %v", state, res, err)
		}
	}
}

func TestBusinessStatisticsQuantityPermissions(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	permissions := []string{biz.PermissionERPBusinessDashboardRead, biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead}
	d, _, _ := newProductionOrderJSONRPCTestData(t, permissions...)
	r := &statisticsAPIRepo{}
	d.businessStatisticsUC = biz.NewBusinessStatisticsUsecase(r)
	ctx := workflowJSONRPCAdminContext()
	_, res, err := d.handleBusiness(ctx, "get_delivery_statistics", "quantity", nil)
	if err != nil || res.Code != 0 || r.calls != 1 || r.query.Access.SalesAmounts || r.query.Access.Receivables {
		t.Fatalf("quantity=%+v %v", res, err)
	}
	d.applySensitiveFieldReadPolicy(ctx, "business", "get_delivery_statistics", res)
	if _, visible := res.Data.AsMap()["totals"].(map[string]any)["amount"]; visible {
		t.Fatal("quantity reader received commercial amount")
	}
	for _, method := range []string{"get_receivable_statistics", "list_receivable_statistics_sources"} {
		_, res, err = d.handleBusiness(ctx, method, "finance-denied", newDataStruct(map[string]any{"group_key": "c:1"}))
		if method == "get_receivable_statistics" {
			_, res, err = d.handleBusiness(ctx, method, "finance-denied", nil)
		}
		if err != nil || res.Code != errcode.PermissionDenied.Code || r.calls != 1 {
			t.Fatalf("finance=%+v %v", res, err)
		}
	}
	_, res, err = d.handleBusiness(ctx, "get_delivery_statistics", "amount-sort", newDataStruct(map[string]any{"sort": "amount"}))
	if err != nil || res.Code != errcode.PermissionDenied.Code || r.calls != 1 {
		t.Fatalf("sort=%+v %v", res, err)
	}
}
