package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type purchaseTermsRPCRepo struct {
	*stubPurchaseOrderJSONRPCRepo
	calls    int
	received *biz.PurchaseOrderTermsCompletion
}

func (r *purchaseTermsRPCRepo) CompletePurchaseOrderTerms(_ context.Context, in *biz.PurchaseOrderTermsCompletion) (*biz.PurchaseOrder, error) {
	r.calls++
	r.received = in
	return &biz.PurchaseOrder{ID: in.ID, Version: in.ExpectedVersion + 1, LifecycleStatus: biz.PurchaseOrderStatusApproved}, nil
}

func purchaseTermsRPCParams() map[string]any {
	return map[string]any{"id": float64(1), "expected_version": float64(2), "idempotency_key": "purchase-terms-rpc", "expected_arrival_date": nil, "supplier_confirmed_arrival_date": nil, "items": []any{map[string]any{"id": float64(3), "unit_price": "2.50", "expected_arrival_date": nil}}}
}

func TestPurchaseOrderTermsRPCRequiresReadUpdateAndCommercialPermissions(t *testing.T) {
	permissions := []string{biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseOrderUpdate, biz.PermissionFieldProcurementCommercialRead}
	for omitted := -1; omitted < len(permissions); omitted++ {
		allowed := []string{}
		for i, permission := range permissions {
			if i != omitted {
				allowed = append(allowed, permission)
			}
		}
		repo := &purchaseTermsRPCRepo{stubPurchaseOrderJSONRPCRepo: newStubPurchaseOrderJSONRPCRepo()}
		d := newPurchaseOrderJSONRPCTestData(t, repo.stubPurchaseOrderJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, allowed...))
		d.purchaseOrderUC = biz.NewPurchaseOrderUsecase(repo)
		_, result, err := d.handlePurchaseOrder(workflowJSONRPCAdminContext(), "complete_purchase_order_terms", "terms", mustJSONRPCStruct(t, purchaseTermsRPCParams()))
		if err != nil {
			t.Fatal(err)
		}
		if omitted < 0 {
			if result.Code != errcode.OK.Code || repo.calls != 1 || repo.received.ActorID <= 0 {
				t.Fatalf("authorized terms result=%+v calls=%d", result, repo.calls)
			}
		} else if result.Code != errcode.PermissionDenied.Code || repo.calls != 0 {
			t.Fatalf("missing permission %s: %+v calls=%d", permissions[omitted], result, repo.calls)
		}
	}
}

func TestPurchaseOrderTermsRPCRejectsIdentityAndQuantityMutations(t *testing.T) {
	repo := &purchaseTermsRPCRepo{stubPurchaseOrderJSONRPCRepo: newStubPurchaseOrderJSONRPCRepo()}
	d := newPurchaseOrderJSONRPCTestData(t, repo.stubPurchaseOrderJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseOrderUpdate, biz.PermissionFieldProcurementCommercialRead))
	d.purchaseOrderUC = biz.NewPurchaseOrderUsecase(repo)
	for _, mutate := range []func(map[string]any){
		func(p map[string]any) { p["actor_id"] = float64(99) },
		func(p map[string]any) { p["supplier_id"] = float64(2) },
		func(p map[string]any) { p["items"].([]any)[0].(map[string]any)["purchased_quantity"] = "999" },
		func(p map[string]any) { p["items"].([]any)[0].(map[string]any)["unit_price"] = "-1" },
		func(p map[string]any) { delete(p, "expected_arrival_date") },
		func(p map[string]any) { delete(p["items"].([]any)[0].(map[string]any), "expected_arrival_date") },
	} {
		params := purchaseTermsRPCParams()
		mutate(params)
		_, result, err := d.handlePurchaseOrder(workflowJSONRPCAdminContext(), "complete_purchase_order_terms", "terms", mustJSONRPCStruct(t, params))
		if err != nil || result.Code != errcode.InvalidParam.Code || repo.calls != 0 {
			t.Fatalf("invalid mutation result=%+v err=%v calls=%d", result, err, repo.calls)
		}
	}
}

func TestPurchaseReceiptRPCProjectsLineInboundAndLatePriceProvenance(t *testing.T) {
	row := purchaseReceiptToAny(&biz.PurchaseReceipt{ID: 1, PostedLines: 1, PendingInboundLines: 1, CanPost: true, Items: []*biz.PurchaseReceiptItem{{ID: 2, Posted: true, PriceConfirmedLater: true}, {ID: 3, RejectionDisposed: true}}})
	if row["posted_lines"] != 1 || row["pending_inbound_lines"] != 1 || row["can_post"] != true {
		t.Fatalf("receipt projection=%+v", row)
	}
	items := row["items"].([]any)
	if items[0].(map[string]any)["posted"] != true || items[0].(map[string]any)["price_confirmed_later"] != true || items[1].(map[string]any)["posted"] != false || items[1].(map[string]any)["rejection_disposed"] != true {
		t.Fatalf("line projection=%+v", items)
	}
}

func TestPurchaseOrderDeliveryRPCDoesNotRequireOrAcceptPrices(t *testing.T) {
	repo := &purchaseTermsRPCRepo{stubPurchaseOrderJSONRPCRepo: newStubPurchaseOrderJSONRPCRepo()}
	d := newPurchaseOrderJSONRPCTestData(t, repo.stubPurchaseOrderJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseOrderUpdate))
	d.purchaseOrderUC = biz.NewPurchaseOrderUsecase(repo)
	params := purchaseTermsRPCParams()
	delete(params["items"].([]any)[0].(map[string]any), "unit_price")
	_, result, err := d.Handle(workflowJSONRPCAdminContext(), "purchase_order", "2.0", "update_purchase_order_delivery", "delivery", mustJSONRPCStruct(t, params))
	if err != nil || result.Code != errcode.OK.Code || repo.calls != 1 || !repo.received.DeliveryOnly || repo.received.Items[0].UnitPrice != nil {
		t.Fatalf("date-only result=%+v err=%v calls=%d", result, err, repo.calls)
	}
	params["items"].([]any)[0].(map[string]any)["unit_price"] = nil
	_, result, err = d.Handle(workflowJSONRPCAdminContext(), "purchase_order", "2.0", "update_purchase_order_delivery", "delivery", mustJSONRPCStruct(t, params))
	if err != nil || result.Code != errcode.InvalidParam.Code || repo.calls != 1 {
		t.Fatalf("price field injection result=%+v err=%v", result, err)
	}
}
