package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type salesDeliveryAPIRepo struct {
	progressAPIRepo
}

func (r *salesDeliveryAPIRepo) GetSalesDeliveryProgress(_ context.Context, q biz.BusinessProgressQuery) (*biz.SalesDeliveryProgress, error) {
	r.query, r.calls = q, r.calls+1
	return &biz.SalesDeliveryProgress{
		OrderID: q.ID, Label: "SO-DEMO-7", Status: "active", SnapshotAt: q.SnapshotAt,
		Lines: []*biz.BusinessProgressRow{}, Recent: []biz.SalesDeliveryMilestone{},
	}, nil
}

func TestSalesDeliveryProgressRequiresOrderAndLineReadsWithoutDashboard(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	for _, tc := range []struct {
		name string
		keys []string
		want int32
	}{
		{"sales reader", []string{biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead}, errcode.OK.Code},
		{"order only", []string{biz.PermissionSalesOrderRead}, errcode.PermissionDenied.Code},
		{"dashboard only", []string{biz.PermissionERPBusinessDashboardRead}, errcode.PermissionDenied.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d, _, _, _ := newProductionOrderJSONRPCTestData(t, tc.keys...)
			repo := &salesDeliveryAPIRepo{}
			d.businessProgressUC = biz.NewBusinessProgressUsecase(repo)
			_, res, err := d.handleSalesDeliveryProgress(ctx, "sales-progress", map[string]any{
				"id": float64(7), "limit": float64(20), "offset": float64(0),
			})
			if err != nil || res == nil || res.Code != tc.want || (repo.calls == 1) != (tc.want == errcode.OK.Code) {
				t.Fatalf("read result %v, calls %d, error %v", res, repo.calls, err)
			}
			if repo.calls == 1 && (repo.query.ID != 7 || repo.query.Access.Production || repo.query.TaskVisibility != nil) {
				t.Fatalf("unexpected sales source or workflow scope: %+v", repo.query)
			}
		})
	}
	d, _, _, _ := newProductionOrderJSONRPCTestData(t, biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead)
	repo := &salesDeliveryAPIRepo{}
	d.businessProgressUC = biz.NewBusinessProgressUsecase(repo)
	_, result, err := d.handleSalesDeliveryProgress(ctx, "invalid-source", map[string]any{
		"id": float64(7), "kind": "product",
	})
	if err != nil || result == nil || result.Code != errcode.InvalidParam.Code || repo.calls != 0 {
		t.Fatalf("delivery must only accept an order ID: result %v error %v", result, err)
	}
}
