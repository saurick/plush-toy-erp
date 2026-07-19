package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestOutsourcingFactFromOrderParamsRejectDerivedFields(t *testing.T) {
	base := map[string]any{
		"customer_key":              "yoyoosun",
		"fact_no":                   "OUT-SOURCE-PARAMS",
		"outsourcing_order_id":      float64(10),
		"outsourcing_order_item_id": float64(11),
		"warehouse_id":              float64(12),
		"quantity":                  "3",
		"idempotency_key":           "OUT-SOURCE-PARAMS",
	}
	if in, ok := outsourcingFactFromOrderCreateFromParams(base); !ok || in.OutsourcingOrderID != 10 || in.OutsourcingOrderItemID != 11 {
		t.Fatalf("allowed source params not parsed: in=%#v ok=%v", in, ok)
	}
	for _, derived := range []string{
		"fact_type",
		"subject_type",
		"subject_id",
		"product_sku_id",
		"unit_id",
		"supplier_id",
		"supplier_name",
		"source_type",
		"source_id",
		"source_line_id",
	} {
		t.Run(derived, func(t *testing.T) {
			params := make(map[string]any, len(base)+1)
			for key, value := range base {
				params[key] = value
			}
			params[derived] = "forged"
			if _, ok := outsourcingFactFromOrderCreateFromParams(params); ok {
				t.Fatalf("derived field %s must be rejected", derived)
			}
		})
	}
}

func TestOutsourcingFactRPCUsesExactPermissionsAndRetiresGenericCreate(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	oldAdmin := workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey, biz.WarehouseRoleKey},
		biz.PermissionPurchaseOrderCreate,
		biz.PermissionPurchaseOrderUpdate,
		biz.PermissionPurchaseOrderRead,
		biz.PermissionWarehouseAdjustmentCreate,
		biz.PermissionWarehouseInventoryRead,
	)
	repo := &outsourcingModuleGateOperationalFactRepo{}
	denied := newOperationalFactJSONRPCTestDataWithRepo(t, oldAdmin, repo)
	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.07.14.outsourcing-exact-permission",
		"outsourcing_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, denied, enabledConfig)
	for _, tc := range []struct {
		method string
		params map[string]any
	}{
		{method: "create_outsourcing_material_issue_from_order", params: outsourcingFactModuleGateParams(t).AsMap()},
		{method: "create_outsourcing_return_receipt_from_order", params: outsourcingFactModuleGateParams(t).AsMap()},
		{method: "post_outsourcing_fact", params: map[string]any{"id": float64(600)}},
		{method: "cancel_outsourcing_fact", params: map[string]any{"id": float64(600)}},
		{method: "list_outsourcing_facts", params: map[string]any{"limit": float64(20)}},
	} {
		_, res, err := denied.handleOperationalFact(ctx, tc.method, tc.method, mustJSONRPCStruct(t, tc.params))
		if err != nil {
			t.Fatalf("%s transport error: %v", tc.method, err)
		}
		if res == nil || res.Code != errcode.PermissionDenied.Code {
			t.Fatalf("old broad permissions must not authorize %s: %#v", tc.method, res)
		}
	}
	_, retired, err := denied.handleOperationalFact(ctx, "create_outsourcing_fact", "retired", outsourcingFactModuleGateParams(t))
	if err != nil {
		t.Fatalf("retired create transport error: %v", err)
	}
	if retired == nil || retired.Code != errcode.UnknownMethod.Code {
		t.Fatalf("generic create must be retired: %#v", retired)
	}

	returnAdmin := workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionOutsourcingReturnReceiptCreate,
		biz.PermissionOutsourcingOrderRead,
	)
	allowed := newOperationalFactJSONRPCTestDataWithRepo(t, returnAdmin, repo)
	activateOperationalFactTestCustomerConfig(t, allowed, customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.07.14.outsourcing-return-permission",
		"outsourcing_orders",
		"enabled",
	))
	returnParams := outsourcingFactModuleGateParams(t).AsMap()
	returnParams["new_lot_no"] = "OUT-MODULE-GATE-LOT"
	_, res, err := allowed.handleOperationalFact(ctx, "create_outsourcing_return_receipt_from_order", "return", mustJSONRPCStruct(t, returnParams))
	if err != nil {
		t.Fatalf("return receipt transport error: %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code || repo.createOutsourcingReturnReceiptCalls != 1 {
		t.Fatalf("exact return permission result=%#v calls=%d", res, repo.createOutsourcingReturnReceiptCalls)
	}
}
