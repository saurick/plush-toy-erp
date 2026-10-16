package service

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/errcode"
)

func TestJsonrpcIncomingAcceptanceRoleBoundary(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_iqc_acceptance")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey},
		biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptCreate, biz.PermissionPurchaseReceiptRead, biz.PermissionPurchaseReceiptCancelDraft))
	_, source := createPurchaseReceiptAppendSourceForServiceTest(t, ctx, client, j.inventoryUC, fixtures, "IQC-ROLE")
	params := map[string]any{"purchase_order_id": source.PurchaseOrderID, "receipt_no": "IQC-ROLE-ARRIVAL", "idempotency_key": "iqc-role-arrival",
		"items": []any{map[string]any{"purchase_order_item_id": source.ID, "warehouse_id": fixtures.warehouseID, "quantity": "3.25", "declared_quantity": "4"}}}
	adminCtx := workflowJSONRPCAdminContext()
	_, created, err := j.handlePurchase(adminCtx, "create_purchase_receipt_from_purchase_order", "iqc-create", mustJSONRPCStruct(t, params))
	if err != nil || created == nil || created.Code != errcode.OK.Code {
		t.Fatalf("warehouse count: %+v %v", created, err)
	}
	receipt := jsonRPCNestedMap(t, created, "purchase_receipt")
	id := jsonRPCInt(t, receipt, "id")
	rows := receipt["items"].([]any)
	if rows[0].(map[string]any)["declared_quantity"] != "4" || rows[0].(map[string]any)["quantity"] != "3.25" {
		t.Fatalf("quantity evidence lost: %+v", rows)
	}
	j.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionQualityInspectionUpdate, biz.PermissionQualityInspectionRead)}
	for _, method := range []string{"post_purchase_receipt", "cancel_purchase_receipt"} {
		_, denied, err := j.handlePurchase(adminCtx, method, "iqc-denied", mustJSONRPCStruct(t, map[string]any{"id": id}))
		if err != nil || denied == nil || denied.Code != errcode.PermissionDenied.Code {
			t.Fatalf("IQC stock write %s: %+v %v", method, denied, err)
		}
	}
	j.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionPurchaseReceiptRead, biz.PermissionPurchaseReceiptCancelDraft)}
	_, cancelled, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt_draft", "iqc-cancel", mustJSONRPCStruct(t, map[string]any{"id": id}))
	if err != nil || cancelled == nil || cancelled.Code != errcode.OK.Code {
		t.Fatalf("warehouse draft cancellation: %+v %v", cancelled, err)
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 {
		t.Fatal("warehouse count or cancellation wrote stock")
	}
	if mapped := j.mapPurchaseError(ctx, biz.ErrDataScopeForbidden); mapped.Code != errcode.PermissionDenied.Code {
		t.Fatalf("scope denial: %+v", mapped)
	}
}

func TestJsonrpcIncomingAcceptanceRejectsAmbiguousPayload(t *testing.T) {
	for _, items := range []any{
		nil, []any{}, []any{map[string]any{"quantity": 1.25}},
		[]any{map[string]any{"quantity": "1", "declared_quantity": nil}},
		[]any{map[string]any{"quantity": "1", "unknown": true}},
	} {
		if _, ok := purchaseReceiptLinesFromParams(map[string]any{"items": items}); ok {
			t.Fatalf("accepted ambiguous lines: %+v", items)
		}
	}
	if _, ok := qualityCheckItemsFromParams(map[string]any{"check_items": []any{map[string]any{"name": "自定义", "automatic_pass": true}}}); ok {
		t.Fatal("accepted unknown check evidence")
	}
}

func TestJsonrpcReplacementRequiresWarehouseCountAndStartsFreshInspection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_replacement_handoff")
	f := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseReturnPost))
	receipt, err := j.inventoryUC.CreatePurchaseReceiptWithItems(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "PR-REPLACEMENT-HANDOFF", SupplierName: "模拟补换供应商"}, []*biz.PurchaseReceiptItemCreate{{MaterialID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(3)}})
	if err != nil {
		t.Fatal(err)
	}
	rate := decimal.NewFromInt(40)
	qi, err := j.inventoryUC.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: receipt.QualityInspections[0].ID, Result: biz.QualityInspectionResultReject, CheckItems: rpcIncomingEvidence("FAIL"), DefectRateOperator: stringPtr(biz.QualityInspectionDefectRateOperatorGT), DefectRatePercent: &rate})
	if err != nil {
		t.Fatal(err)
	}
	draft, err := j.inventoryUC.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "RPL-HANDOFF", QualityInspectionID: qi.ID, DispositionType: biz.PurchaseRejectionReplace, Quantity: decimal.NewFromInt(3), Reason: "供应商补换", IdempotencyKey: "rpl-handoff", CreatedBy: 7})
	if err != nil {
		t.Fatal(err)
	}
	params := map[string]any{"id": draft.ID, "expected_version": draft.Version, "counted_quantity": "3"}
	invoke := func(want int32) {
		t.Helper()
		_, result, err := j.handlePurchase(workflowJSONRPCAdminContext(), "post_purchase_rejection_disposition", "replacement", mustJSONRPCStruct(t, params))
		if err != nil || result == nil || result.Code != want {
			t.Fatalf("result=%+v err=%v want=%v", result, err, want)
		}
	}
	invoke(errcode.PermissionDenied.Code)
	if client.PurchaseReceipt.Query().CountX(ctx) != 1 {
		t.Fatal("purchase operator created an uncounted arrival")
	}
	j.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionPurchaseReturnPost, biz.PermissionPurchaseReceiptCreate)}
	scopeRepo := &receiptWarehouseScopeAdminRepo{memAdminManageRepoForData: newMemAdminManageRepoForData(), scope: biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}}
	j.adminManageUC = biz.NewAdminManageUsecase(scopeRepo, log.NewStdLogger(io.Discard), nil)
	delete(params, "counted_quantity")
	invoke(errcode.InvalidParam.Code)
	params["counted_quantity"] = "2"
	invoke(errcode.InvalidParam.Code)
	params["counted_quantity"] = "3"
	scopeRepo.scope = biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
	invoke(errcode.PermissionDenied.Code)
	scopeRepo.scope = biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}
	invoke(errcode.OK.Code)
	invoke(errcode.OK.Code)
	confirmed, err := j.inventoryUC.GetPurchaseRejectionDisposition(ctx, draft.ID)
	if err != nil || confirmed.ReplacementReceiptID == nil {
		t.Fatalf("confirmed=%+v err=%v", confirmed, err)
	}
	replacement, err := j.inventoryUC.GetPurchaseReceipt(ctx, *confirmed.ReplacementReceiptID)
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, inspectionErr := j.inventoryUC.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: replacement.ID, Limit: 10})
	if err != nil || replacement.Status != biz.PurchaseReceiptStatusDraft || inspectionErr != nil || len(inspections) != 1 || inspections[0].Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("fresh arrival=%+v err=%v", replacement, err)
	}
	if client.PurchaseReceipt.Query().CountX(ctx) != 2 || client.InventoryTxn.Query().CountX(ctx) != 0 {
		t.Fatal("count replay duplicated arrival or wrote inventory")
	}
}
