package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type purchaseFollowupRPCRepo struct {
	*stubPurchaseOrderJSONRPCRepo
	calls int
	query biz.PurchaseFollowupQuery
}

func (r *purchaseFollowupRPCRepo) ListPurchaseFollowups(_ context.Context, q biz.PurchaseFollowupQuery) (*biz.PurchaseFollowupBoard, error) {
	r.calls++
	r.query = q
	return &biz.PurchaseFollowupBoard{Rows: []*biz.PurchaseFollowupRow{}, Counts: map[string]int{}, Days: map[string]int{}, AsOfDate: "2026-10-26", Access: q.Access}, nil
}
func TestPurchaseFollowupsRPCEnforcesSourceAndCategoryPermissions(t *testing.T) {
	for _, tc := range []struct {
		name        string
		permissions []string
		kind        string
		want        int32
		calls       int
	}{
		{"minimal", []string{biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptRead}, "all", errcode.OK.Code, 1},
		{"no_receipt", []string{biz.PermissionPurchaseOrderRead}, "all", errcode.PermissionDenied.Code, 0},
		{"no_order", []string{biz.PermissionPurchaseReceiptRead}, "all", errcode.PermissionDenied.Code, 0},
		{"hidden_price", []string{biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptRead}, "missing_price", errcode.PermissionDenied.Code, 0},
		{"hidden_quality", []string{biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptRead}, "rejected", errcode.PermissionDenied.Code, 0},
		{"hidden_finance", []string{biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptRead}, "unsettled", errcode.PermissionDenied.Code, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &purchaseFollowupRPCRepo{stubPurchaseOrderJSONRPCRepo: newStubPurchaseOrderJSONRPCRepo()}
			d := newPurchaseOrderJSONRPCTestData(t, repo.stubPurchaseOrderJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, tc.permissions...))
			d.purchaseOrderUC = biz.NewPurchaseOrderUsecase(repo)
			d.adminManageUC = newAllWarehouseScopeAdminUsecase()
			_, res, err := d.handlePurchaseOrder(workflowJSONRPCAdminContext(), "list_purchase_followups", "followup", mustJSONRPCStruct(t, map[string]any{"view": "exceptions", "kind": tc.kind}))
			if err != nil || res.Code != tc.want || repo.calls != tc.calls {
				t.Fatalf("result=%+v err=%v calls=%d", res, err, repo.calls)
			}
			if repo.calls > 0 && (repo.query.Access.Quality || repo.query.Access.Commercial || repo.query.Access.Finance) {
				t.Fatal("ungranted categories exposed")
			}
		})
	}
}
