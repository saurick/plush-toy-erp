package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func salesOrderExportRPCCall(t *testing.T, d *jsonrpcDispatcher, ctx context.Context, _ string, params map[string]any) *v1.JsonrpcResult {
	t.Helper()
	_, result, err := d.Handle(ctx, "sales_order", "2.0", "export_sales_orders", "export-fixture", mustJSONRPCStruct(t, params))
	if err != nil || result == nil {
		t.Fatalf("export result=%v err=%v", result, err)
	}
	return result
}

type salesOrderExportRPCRepo struct {
	biz.SalesOrderRepo
	query biz.SalesOrderExportQuery
	calls int
	rows  []*biz.SalesOrder
	err   error
}

func (r *salesOrderExportRPCRepo) ExportSalesOrders(_ context.Context, query biz.SalesOrderExportQuery) ([]*biz.SalesOrder, error) {
	r.query, r.calls = query, r.calls+1
	return r.rows, r.err
}

func salesOrderExportRPCFixture(t *testing.T, permissions ...string) (*jsonrpcDispatcher, *salesOrderExportRPCRepo) {
	t.Helper()
	base := &stubSalesOrderJSONRPCRepo{}
	d := newSalesOrderJSONRPCTestData(t, base, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, permissions...))
	count, total := 3, decimal.NewFromInt(100)
	repo := &salesOrderExportRPCRepo{SalesOrderRepo: base, rows: []*biz.SalesOrder{{
		ID: 1, OrderNo: "SO-EXPORT-001", CustomerID: 1, Currency: "CNY", OrderDate: time.Unix(1, 0),
		LifecycleStatus: biz.SalesOrderStatusDraft, ItemCount: &count, OrderTotal: &total,
		ContactSnapshot: map[string]any{"name": "模拟联系人", "phone": "private-fixture"},
	}}}
	d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
	return d, repo
}

func TestSalesOrderExportRedaction(t *testing.T) {
	d, _ := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
	result := salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "", nil)
	if result.Code != errcode.OK.Code {
		t.Fatalf("result=%v", result)
	}
	row := result.Data.AsMap()["sales_orders"].([]any)[0].(map[string]any)
	for _, field := range []string{"item_count", "order_total", "goods_amount", "currency"} {
		if _, exists := row[field]; exists {
			t.Fatalf("missing permission leaked %s", field)
		}
	}
	if _, exists := row["contact_snapshot"].(map[string]any)["phone"]; exists {
		t.Fatal("private snapshot field leaked")
	}
}

func TestSalesOrderExportFiltersAndPermissions(t *testing.T) {
	d, repo := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead, biz.PermissionFieldSalesCommercialRead, biz.PermissionFieldPartyPrivateRead)
	params := map[string]any{"keyword": "SO", "customer_id": 17, "sample_bom_id": 27, "lifecycle_scope": "all", "lifecycle_status": "closed", "date_field": "planned_delivery_date", "date_from": 1700000000, "date_to": 1800000000, "sort_by": "updated_at", "sort_direction": "asc"}
	result := salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "sales_order.export_sales_orders", params)
	filter := repo.query.Filter
	if result.Code != 0 || filter.CustomerID != 17 || filter.SampleBOMID != 27 || filter.Keyword != "SO" || filter.LifecycleScope != "all" || filter.LifecycleStatus != "closed" || filter.DateField != "planned_delivery_date" || filter.DateFrom.Unix() != 1700000000 || filter.DateTo.Unix() != 1800000000 || filter.SortBy != "updated_at" || filter.SortDirection != "asc" {
		t.Fatalf("result=%v filter=%+v", result, filter)
	}
	row := result.Data.AsMap()["sales_orders"].([]any)[0].(map[string]any)
	if row["item_count"] != float64(3) || row["order_total"] != "100" || row["currency"] != "CNY" {
		t.Fatalf("authorized fields missing: %v", row)
	}
	result = salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "sales_order.export_sales_orders", map[string]any{"id": 1})
	if result.Code != 0 || repo.query.ID != 1 || repo.query.Filter.LifecycleScope != "all" {
		t.Fatalf("exact historical export lost: %v %+v", result, repo.query)
	}
	for _, mode := range []string{"anonymous", "disabled", "no permission"} {
		t.Run(mode, func(t *testing.T) {
			d, repo := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
			ctx := workflowJSONRPCAdminContext()
			switch mode {
			case "anonymous":
				ctx = context.Background()
			case "disabled":
				d.adminReader = stubAdminAccountReader{admin: &biz.AdminUser{Disabled: true}}
			case "no permission":
				d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin(nil)}
			}
			result := salesOrderExportRPCCall(t, d, ctx, "sales_order.export_sales_orders", nil)
			if result.Code == 0 || repo.calls != 0 || result.Data != nil {
				t.Fatalf("unauthorized export: %v calls=%d", result, repo.calls)
			}
		})
	}
}

func TestSalesOrderExportRejectsPartialAndInvalidRequests(t *testing.T) {
	for _, params := range []map[string]any{{"limit": 200}, {"offset": 0}, {"id": 0}, {"id": 1, "keyword": "SO"}, {"customer_id": "17"}, {"sample_bom_id": nil}, {"sort_by": "unknown"}} {
		d, repo := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
		result := salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "sales_order.export_sales_orders", params)
		if result.Code != errcode.InvalidParam.Code || repo.calls != 0 || result.Data != nil {
			t.Fatalf("params=%v result=%v calls=%d", params, result, repo.calls)
		}
	}
	for _, tc := range []struct {
		err  error
		code int32
	}{{biz.ErrSalesOrderExportLimit, errcode.SalesOrderExportLimit.Code}, {biz.ErrSalesOrderExportBusy, errcode.SalesOrderExportBusy.Code}, {biz.ErrSalesOrderExportTimeout, errcode.SalesOrderExportTimeout.Code}} {
		d, repo := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
		repo.err = tc.err
		result := salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "sales_order.export_sales_orders", nil)
		if result.Code != tc.code || result.Data != nil {
			t.Fatalf("export error must not carry partial data: %v", result)
		}
	}
	d, repo := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
	repo.rows[0].CustomerSnapshot = map[string]any{"escaped": strings.Repeat("<", biz.SalesOrderExportMaxBytes/6+1)}
	result := salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "sales_order.export_sales_orders", nil)
	if result.Code != errcode.SalesOrderExportLimit.Code || result.Data != nil {
		t.Fatalf("encoded result budget bypassed: %v", result.Code)
	}
}

func TestSalesOrderExportServiceReleasesAdmissionAfterFailure(t *testing.T) {
	d, repo := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
	releases := []func(){}
	for i := 0; i < biz.SalesOrderExportConcurrency; i++ {
		_, release, err := d.salesOrderUC.BeginSalesOrderExport(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		releases = append(releases, release)
	}
	result := salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "", nil)
	if result.Code != errcode.SalesOrderExportBusy.Code || repo.calls != 0 {
		t.Fatalf("busy read was admitted: %v calls=%d", result, repo.calls)
	}
	for _, release := range releases {
		release()
	}
	for i := 0; i < biz.SalesOrderExportConcurrency+1; i++ {
		repo.err = biz.ErrSalesOrderExportLimit
		result = salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "", nil)
		if result.Code != errcode.SalesOrderExportLimit.Code {
			t.Fatalf("failed request leaked its slot: %v", result)
		}
	}
	repo.err = nil
	result = salesOrderExportRPCCall(t, d, workflowJSONRPCAdminContext(), "", nil)
	if result.Code != 0 {
		t.Fatalf("retry after failure: %v", result)
	}
}
