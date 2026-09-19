package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestJsonrpcIncomingAcceptanceRoleBoundary(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_iqc_acceptance")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.QualityRoleKey},
		biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptCreate, biz.PermissionPurchaseReceiptRead, biz.PermissionPurchaseReceiptCancelDraft))
	_, source := createPurchaseReceiptAppendSourceForServiceTest(t, ctx, client, j.inventoryUC, fixtures, "IQC-ROLE")
	params := map[string]any{"purchase_order_id": source.PurchaseOrderID, "receipt_no": "IQC-ROLE-ARRIVAL", "idempotency_key": "iqc-role-arrival",
		"items": []any{map[string]any{"purchase_order_item_id": source.ID, "warehouse_id": fixtures.warehouseID, "quantity": "3.25", "declared_quantity": "4"}}}
	adminCtx := workflowJSONRPCAdminContext()
	_, created, err := j.handlePurchase(adminCtx, "create_purchase_receipt_from_purchase_order", "iqc-create", mustJSONRPCStruct(t, params))
	if err != nil || created == nil || created.Code != errcode.OK.Code {
		t.Fatalf("IQC registration: %+v %v", created, err)
	}
	receipt := jsonRPCNestedMap(t, created, "purchase_receipt")
	id := jsonRPCInt(t, receipt, "id")
	rows := receipt["items"].([]any)
	if rows[0].(map[string]any)["declared_quantity"] != "4" || rows[0].(map[string]any)["quantity"] != "3.25" {
		t.Fatalf("quantity evidence lost: %+v", rows)
	}
	for _, method := range []string{"post_purchase_receipt", "cancel_purchase_receipt"} {
		_, denied, err := j.handlePurchase(adminCtx, method, "iqc-denied", mustJSONRPCStruct(t, map[string]any{"id": id}))
		if err != nil || denied == nil || denied.Code != errcode.PermissionDenied.Code {
			t.Fatalf("IQC stock write %s: %+v %v", method, denied, err)
		}
	}
	_, cancelled, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt_draft", "iqc-cancel", mustJSONRPCStruct(t, map[string]any{"id": id}))
	if err != nil || cancelled == nil || cancelled.Code != errcode.OK.Code {
		t.Fatalf("IQC draft cancellation: %+v %v", cancelled, err)
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 {
		t.Fatal("IQC registration or cancellation wrote stock")
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
