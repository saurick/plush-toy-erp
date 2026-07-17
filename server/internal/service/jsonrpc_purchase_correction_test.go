package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
)

func TestPurchaseCorrectionCreateParsersOwnIdempotencyPayload(t *testing.T) {
	returnParams := map[string]any{
		"return_no":           "RET-PARSER",
		"purchase_receipt_id": float64(1),
		"returned_at":         "2026-07-14",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(2),
			"quantity":                 "1",
		}},
	}
	if _, ok := purchaseReturnFromReceiptCreateFromParams(returnParams); ok {
		t.Fatal("purchase return aggregate create must require idempotency_key")
	}
	qualityReturnParams := map[string]any{
		"return_no":             "RET-QI-PARSER",
		"quality_inspection_id": float64(3),
		"quantity":              "1",
		"returned_at":           "2026-07-14",
		"reason":                "来料不合格",
		"idempotency_key":       "return-quality-parser",
	}
	if in, ok := purchaseReturnFromQualityInspectionCreateFromParams(qualityReturnParams); !ok || in.QualityInspectionID != 3 || in.Reason != "来料不合格" {
		t.Fatalf("quality return parser in=%#v ok=%v", in, ok)
	}
	for _, field := range []string{"purchase_receipt_id", "purchase_receipt_item_id", "material_id", "warehouse_id", "unit_id", "lot_id", "supplier_name", "source_type", "source_id", "idempotency_payload_hash"} {
		forged := make(map[string]any, len(qualityReturnParams)+1)
		for key, value := range qualityReturnParams {
			forged[key] = value
		}
		forged[field] = "forged"
		if _, ok := purchaseReturnFromQualityInspectionCreateFromParams(forged); ok {
			t.Fatalf("quality return derived field %s must be rejected", field)
		}
	}
	returnParams["idempotency_key"] = "return-parser"
	returnParams["idempotency_payload_hash"] = "client-controlled"
	if _, ok := purchaseReturnFromReceiptCreateFromParams(returnParams); ok {
		t.Fatal("purchase return aggregate create must reject client idempotency_payload_hash")
	}

	adjustmentParams := map[string]any{
		"adjustment_no":       "ADJ-PARSER",
		"purchase_receipt_id": float64(1),
		"adjusted_at":         "2026-07-14",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(2),
			"adjust_type":              biz.PurchaseReceiptAdjustmentQuantityIncrease,
			"quantity":                 "1",
		}},
	}
	if _, ok := purchaseReceiptAdjustmentFromReceiptCreateFromParams(adjustmentParams); ok {
		t.Fatal("purchase receipt adjustment aggregate create must require idempotency_key")
	}
	adjustmentParams["idempotency_key"] = "adjustment-parser"
	adjustmentParams["idempotency_item_count"] = float64(1)
	if _, ok := purchaseReceiptAdjustmentFromReceiptCreateFromParams(adjustmentParams); ok {
		t.Fatal("purchase receipt adjustment aggregate create must reject client idempotency_item_count")
	}
}

func TestJsonrpcDispatcher_RejectedQualityInspectionCreatesTraceablePurchaseReturn(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_return_quality_source")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey, biz.QualityRoleKey},
		biz.PermissionPurchaseReturnRead,
		biz.PermissionPurchaseReturnCreate,
		biz.PermissionPurchaseReturnPost,
		biz.PermissionPurchaseReceiptRead,
	))
	receipt, item, lotID := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "PR-JSONRPC-QI-RETURN", "PR-JSONRPC-QI-RETURN-LOT")
	draft, err := j.inventoryUC.CreateQualityInspectionFromPurchaseReceipt(ctx, &biz.QualityInspectionFromPurchaseReceiptCreate{
		InspectionNo:          "QI-JSONRPC-QI-RETURN",
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: item.ID,
	})
	if err != nil {
		t.Fatalf("create quality return source: %v", err)
	}
	if _, err := j.inventoryUC.SubmitQualityInspection(ctx, draft.ID); err != nil {
		t.Fatalf("submit quality return source: %v", err)
	}
	operator := biz.QualityInspectionDefectRateOperatorApprox
	percent := decimal.NewFromInt(20)
	rejected, err := j.inventoryUC.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID:       draft.ID,
		DefectRateOperator: &operator,
		DefectRatePercent:  &percent,
		DecisionNote:       stringPtr("尺寸不合格"),
	})
	if err != nil {
		t.Fatalf("reject quality return source: %v", err)
	}

	params := map[string]any{
		"return_no":             "RET-JSONRPC-QI-SOURCE",
		"quality_inspection_id": float64(rejected.ID),
		"quantity":              "2",
		"returned_at":           "2026-07-14",
		"reason":                "尺寸不合格退供应商",
		"note":                  "供应商复核",
		"idempotency_key":       "return-jsonrpc-quality-source",
	}
	_, createRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_return_from_quality_inspection", "quality-return-create", mustJSONRPCStruct(t, params))
	if err != nil || createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("create quality-sourced return result=%#v err=%v", createRes, err)
	}
	payload := jsonRPCNestedMap(t, createRes, "purchase_return")
	returnID := jsonRPCInt(t, payload, "id")
	if jsonRPCInt(t, payload, "quality_inspection_id") != rejected.ID ||
		jsonRPCInt(t, payload, "purchase_receipt_id") != receipt.ID ||
		payload["supplier_name"] != receipt.SupplierName || payload["return_reason"] != "尺寸不合格退供应商" {
		t.Fatalf("quality return header source not derived: %#v", payload)
	}
	line := payload["items"].([]any)[0].(map[string]any)
	if jsonRPCInt(t, line, "purchase_receipt_item_id") != item.ID || jsonRPCInt(t, line, "material_id") != item.MaterialID ||
		jsonRPCInt(t, line, "warehouse_id") != item.WarehouseID || jsonRPCInt(t, line, "lot_id") != lotID {
		t.Fatalf("quality return line source not derived: %#v", line)
	}
	_, replayRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_return_from_quality_inspection", "quality-return-replay", mustJSONRPCStruct(t, params))
	if err != nil || replayRes == nil || replayRes.Code != errcode.OK.Code || jsonRPCInt(t, jsonRPCNestedMap(t, replayRes, "purchase_return"), "id") != returnID {
		t.Fatalf("quality return replay result=%#v err=%v", replayRes, err)
	}
	forged := make(map[string]any, len(params)+1)
	for key, value := range params {
		forged[key] = value
	}
	forged["material_id"] = float64(999)
	_, forgedRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_return_from_quality_inspection", "quality-return-forged", mustJSONRPCStruct(t, forged))
	if err != nil || forgedRes == nil || forgedRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("forged quality return source result=%#v err=%v", forgedRes, err)
	}
	_, listRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "list_purchase_returns", "quality-return-list", mustJSONRPCStruct(t, map[string]any{
		"quality_inspection_id": float64(rejected.ID),
	}))
	if err != nil || listRes == nil || listRes.Code != errcode.OK.Code || jsonRPCInt(t, listRes.Data.AsMap(), "total") != 1 {
		t.Fatalf("list quality return source result=%#v err=%v", listRes, err)
	}
	_, postRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "post_purchase_return", "quality-return-post", mustJSONRPCStruct(t, map[string]any{"id": float64(returnID)}))
	if err != nil || postRes == nil || postRes.Code != errcode.OK.Code || jsonRPCNestedMap(t, postRes, "purchase_return")["status"] != biz.PurchaseReturnStatusPosted {
		t.Fatalf("post quality-sourced return result=%#v err=%v", postRes, err)
	}
	assertPurchaseCorrectionBalance(t, ctx, j, fixtures, lotID, "8")
	if client.PurchaseReturn.GetX(ctx, returnID).QualityInspectionID == nil {
		t.Fatal("persisted purchase return lost quality inspection trace")
	}
}

func TestJsonrpcDispatcher_PurchaseCorrectionAPILifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_correction_lifecycle")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey, biz.WarehouseRoleKey},
		biz.PermissionPurchaseReturnRead,
		biz.PermissionPurchaseReturnCreate,
		biz.PermissionPurchaseReturnPost,
		biz.PermissionPurchaseReturnCancel,
		biz.PermissionPurchaseReceiptRead,
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseReceiptAdjustmentRead,
		biz.PermissionPurchaseReceiptAdjustmentCreate,
		biz.PermissionPurchaseReceiptAdjustmentPost,
		biz.PermissionPurchaseReceiptAdjustmentCancel,
		biz.PermissionWarehouseInventoryRead,
	))
	adminCtx := workflowJSONRPCAdminContext()
	draftReceipt, err := j.inventoryUC.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-JSONRPC-CORRECTION-DRAFT",
		SupplierName: "未过账供应商",
	})
	if err != nil {
		t.Fatalf("create source-state draft receipt failed: %v", err)
	}
	_, invalidSourceReturn, err := j.handlePurchase(adminCtx, "create_purchase_return_from_receipt", "draft-source-return", mustJSONRPCStruct(t, map[string]any{
		"return_no":           "RET-DRAFT-SOURCE",
		"purchase_receipt_id": float64(draftReceipt.ID),
		"returned_at":         "2026-07-14",
		"idempotency_key":     "return-draft-source",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(1),
			"quantity":                 "1",
		}},
	}))
	if err != nil || invalidSourceReturn == nil || invalidSourceReturn.Code != errcode.InvalidParam.Code {
		t.Fatalf("non-posted return source must be rejected, result=%#v err=%v", invalidSourceReturn, err)
	}
	_, invalidSourceAdjustment, err := j.handlePurchase(adminCtx, "create_purchase_receipt_adjustment_from_receipt", "draft-source-adjustment", mustJSONRPCStruct(t, map[string]any{
		"adjustment_no":       "ADJ-DRAFT-SOURCE",
		"purchase_receipt_id": float64(draftReceipt.ID),
		"adjusted_at":         "2026-07-14",
		"idempotency_key":     "adjustment-draft-source",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(1),
			"adjust_type":              biz.PurchaseReceiptAdjustmentQuantityIncrease,
			"quantity":                 "1",
		}},
	}))
	if err != nil || invalidSourceAdjustment == nil || invalidSourceAdjustment.Code != errcode.InvalidParam.Code {
		t.Fatalf("non-posted adjustment source must be rejected, result=%#v err=%v", invalidSourceAdjustment, err)
	}
	receipt, receiptItem, lotID := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "PR-JSONRPC-CORRECTION", "PR-JSONRPC-CORRECTION-LOT")

	beforeReturns := client.PurchaseReturn.Query().CountX(ctx)
	_, invalidCreate, err := j.handlePurchase(adminCtx, "create_purchase_return_from_receipt", "invalid-return", mustJSONRPCStruct(t, map[string]any{
		"return_no":           "RET-JSONRPC-INVALID",
		"purchase_receipt_id": float64(receipt.ID),
		"returned_at":         "2026-07-14",
		"idempotency_key":     "return-jsonrpc-invalid",
		"material_id":         float64(fixtures.materialID),
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"quantity":                 "2",
		}},
	}))
	if err != nil || invalidCreate == nil || invalidCreate.Code != errcode.InvalidParam.Code {
		t.Fatalf("unknown technical source field must be rejected, result=%#v err=%v", invalidCreate, err)
	}
	if got := client.PurchaseReturn.Query().CountX(ctx); got != beforeReturns {
		t.Fatalf("invalid aggregate return changed header count %d -> %d", beforeReturns, got)
	}

	_, createReturn, err := j.handlePurchase(adminCtx, "create_purchase_return_from_receipt", "create-return", mustJSONRPCStruct(t, map[string]any{
		"return_no":           "RET-JSONRPC-CORRECTION",
		"purchase_receipt_id": float64(receipt.ID),
		"returned_at":         "2026-07-14",
		"idempotency_key":     "return-jsonrpc-correction",
		"note":                "供应商退货",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"quantity":                 "2",
		}},
	}))
	if err != nil || createReturn == nil || createReturn.Code != errcode.OK.Code {
		t.Fatalf("create source-driven return failed, result=%#v err=%v", createReturn, err)
	}
	returnPayload := jsonRPCNestedMap(t, createReturn, "purchase_return")
	returnID := jsonRPCInt(t, returnPayload, "id")
	if returnPayload["status"] != biz.PurchaseReturnStatusDraft || returnPayload["supplier_name"] != receipt.SupplierName {
		t.Fatalf("unexpected return header: %#v", returnPayload)
	}
	_, replayReturn, err := j.handlePurchase(adminCtx, "create_purchase_return_from_receipt", "replay-return", mustJSONRPCStruct(t, map[string]any{
		"return_no":           "RET-JSONRPC-CORRECTION",
		"purchase_receipt_id": float64(receipt.ID),
		"returned_at":         "2026-07-14",
		"idempotency_key":     "return-jsonrpc-correction",
		"note":                "供应商退货",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"quantity":                 "2.000000",
		}},
	}))
	if err != nil || replayReturn == nil || replayReturn.Code != errcode.OK.Code || jsonRPCInt(t, jsonRPCNestedMap(t, replayReturn, "purchase_return"), "id") != returnID {
		t.Fatalf("same return intent did not replay original, result=%#v err=%v", replayReturn, err)
	}
	_, conflictReturn, err := j.handlePurchase(adminCtx, "create_purchase_return_from_receipt", "conflict-return", mustJSONRPCStruct(t, map[string]any{
		"return_no":           "RET-JSONRPC-CORRECTION",
		"purchase_receipt_id": float64(receipt.ID),
		"returned_at":         "2026-07-14",
		"idempotency_key":     "return-jsonrpc-correction",
		"note":                "供应商退货",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"quantity":                 "3",
		}},
	}))
	if err != nil || conflictReturn == nil || conflictReturn.Code != errcode.IdempotencyConflict.Code {
		t.Fatalf("changed return intent must conflict, result=%#v err=%v", conflictReturn, err)
	}
	returnItems := returnPayload["items"].([]any)
	returnLine := returnItems[0].(map[string]any)
	if jsonRPCInt(t, returnLine, "purchase_receipt_item_id") != receiptItem.ID || jsonRPCInt(t, returnLine, "material_id") != receiptItem.MaterialID || jsonRPCInt(t, returnLine, "warehouse_id") != receiptItem.WarehouseID || jsonRPCInt(t, returnLine, "lot_id") != lotID {
		t.Fatalf("return source grain was not server-derived: %#v", returnLine)
	}

	_, listReturns, err := j.handlePurchase(adminCtx, "list_purchase_returns", "list-returns", mustJSONRPCStruct(t, map[string]any{
		"status":              biz.PurchaseReturnStatusDraft,
		"purchase_receipt_id": float64(receipt.ID),
		"material_id":         float64(receiptItem.MaterialID),
		"warehouse_id":        float64(receiptItem.WarehouseID),
		"lot_id":              float64(lotID),
		"date_from":           "2026-07-14",
		"date_to":             "2026-07-14",
	}))
	if err != nil || listReturns == nil || listReturns.Code != errcode.OK.Code || jsonRPCInt(t, listReturns.Data.AsMap(), "total") != 1 {
		t.Fatalf("list source-driven returns failed, result=%#v err=%v", listReturns, err)
	}

	_, postReturn, err := j.handlePurchase(adminCtx, "post_purchase_return", "post-return", mustJSONRPCStruct(t, map[string]any{"id": float64(returnID)}))
	if err != nil || postReturn == nil || postReturn.Code != errcode.OK.Code || jsonRPCNestedMap(t, postReturn, "purchase_return")["status"] != biz.PurchaseReturnStatusPosted {
		t.Fatalf("post purchase return failed, result=%#v err=%v", postReturn, err)
	}
	assertPurchaseCorrectionBalance(t, ctx, j, fixtures, lotID, "8")

	_, cancelReturn, err := j.handlePurchase(adminCtx, "cancel_purchase_return", "cancel-return", mustJSONRPCStruct(t, map[string]any{"id": float64(returnID)}))
	if err != nil || cancelReturn == nil || cancelReturn.Code != errcode.OK.Code || jsonRPCNestedMap(t, cancelReturn, "purchase_return")["status"] != biz.PurchaseReturnStatusCancelled {
		t.Fatalf("cancel purchase return failed, result=%#v err=%v", cancelReturn, err)
	}
	assertPurchaseCorrectionBalance(t, ctx, j, fixtures, lotID, "10")

	_, createAdjustment, err := j.handlePurchase(adminCtx, "create_purchase_receipt_adjustment_from_receipt", "create-adjustment", mustJSONRPCStruct(t, map[string]any{
		"adjustment_no":       "ADJ-JSONRPC-CORRECTION",
		"purchase_receipt_id": float64(receipt.ID),
		"adjusted_at":         "2026-07-14",
		"idempotency_key":     "adjustment-jsonrpc-correction",
		"reason":              "补记实收数量",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"adjust_type":              biz.PurchaseReceiptAdjustmentQuantityIncrease,
			"quantity":                 "3",
		}},
	}))
	if err != nil || createAdjustment == nil || createAdjustment.Code != errcode.OK.Code {
		t.Fatalf("create source-driven adjustment failed, result=%#v err=%v", createAdjustment, err)
	}
	adjustmentPayload := jsonRPCNestedMap(t, createAdjustment, "purchase_receipt_adjustment")
	adjustmentID := jsonRPCInt(t, adjustmentPayload, "id")
	adjustmentLine := adjustmentPayload["items"].([]any)[0].(map[string]any)
	if jsonRPCInt(t, adjustmentLine, "material_id") != receiptItem.MaterialID || jsonRPCInt(t, adjustmentLine, "warehouse_id") != receiptItem.WarehouseID || jsonRPCInt(t, adjustmentLine, "lot_id") != lotID {
		t.Fatalf("adjustment source grain was not server-derived: %#v", adjustmentLine)
	}
	_, replayAdjustment, err := j.handlePurchase(adminCtx, "create_purchase_receipt_adjustment_from_receipt", "replay-adjustment", mustJSONRPCStruct(t, map[string]any{
		"adjustment_no":       "ADJ-JSONRPC-CORRECTION",
		"purchase_receipt_id": float64(receipt.ID),
		"adjusted_at":         "2026-07-14",
		"idempotency_key":     "adjustment-jsonrpc-correction",
		"reason":              "补记实收数量",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"adjust_type":              biz.PurchaseReceiptAdjustmentQuantityIncrease,
			"quantity":                 "3.000000",
		}},
	}))
	if err != nil || replayAdjustment == nil || replayAdjustment.Code != errcode.OK.Code || jsonRPCInt(t, jsonRPCNestedMap(t, replayAdjustment, "purchase_receipt_adjustment"), "id") != adjustmentID {
		t.Fatalf("same adjustment intent did not replay original, result=%#v err=%v", replayAdjustment, err)
	}
	_, conflictAdjustment, err := j.handlePurchase(adminCtx, "create_purchase_receipt_adjustment_from_receipt", "conflict-adjustment", mustJSONRPCStruct(t, map[string]any{
		"adjustment_no":       "ADJ-JSONRPC-CORRECTION",
		"purchase_receipt_id": float64(receipt.ID),
		"adjusted_at":         "2026-07-14",
		"idempotency_key":     "adjustment-jsonrpc-correction",
		"reason":              "补记实收数量",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(receiptItem.ID),
			"adjust_type":              biz.PurchaseReceiptAdjustmentQuantityIncrease,
			"quantity":                 "4",
		}},
	}))
	if err != nil || conflictAdjustment == nil || conflictAdjustment.Code != errcode.IdempotencyConflict.Code {
		t.Fatalf("changed adjustment intent must conflict, result=%#v err=%v", conflictAdjustment, err)
	}

	_, listAdjustments, err := j.handlePurchase(adminCtx, "list_purchase_receipt_adjustments", "list-adjustments", mustJSONRPCStruct(t, map[string]any{
		"status":              biz.PurchaseReceiptAdjustmentStatusDraft,
		"purchase_receipt_id": float64(receipt.ID),
		"adjust_type":         biz.PurchaseReceiptAdjustmentQuantityIncrease,
		"material_id":         float64(receiptItem.MaterialID),
		"lot_id":              float64(lotID),
	}))
	if err != nil || listAdjustments == nil || listAdjustments.Code != errcode.OK.Code || jsonRPCInt(t, listAdjustments.Data.AsMap(), "total") != 1 {
		t.Fatalf("list source-driven adjustments failed, result=%#v err=%v", listAdjustments, err)
	}

	_, postAdjustment, err := j.handlePurchase(adminCtx, "post_purchase_receipt_adjustment", "post-adjustment", mustJSONRPCStruct(t, map[string]any{"id": float64(adjustmentID)}))
	if err != nil || postAdjustment == nil || postAdjustment.Code != errcode.OK.Code || jsonRPCNestedMap(t, postAdjustment, "purchase_receipt_adjustment")["status"] != biz.PurchaseReceiptAdjustmentStatusPosted {
		t.Fatalf("post adjustment failed, result=%#v err=%v", postAdjustment, err)
	}
	assertPurchaseCorrectionBalance(t, ctx, j, fixtures, lotID, "13")

	_, cancelAdjustment, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt_adjustment", "cancel-adjustment", mustJSONRPCStruct(t, map[string]any{"id": float64(adjustmentID)}))
	if err != nil || cancelAdjustment == nil || cancelAdjustment.Code != errcode.OK.Code || jsonRPCNestedMap(t, cancelAdjustment, "purchase_receipt_adjustment")["status"] != biz.PurchaseReceiptAdjustmentStatusCancelled {
		t.Fatalf("cancel adjustment failed, result=%#v err=%v", cancelAdjustment, err)
	}
	assertPurchaseCorrectionBalance(t, ctx, j, fixtures, lotID, "10")
}

func TestJsonrpcDispatcher_PurchaseCorrectionAPIRequiresPermissionsAndMapsErrors(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_correction_permissions")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseReturnRead,
		biz.PermissionPurchaseReceiptAdjustmentRead,
		biz.PermissionPurchaseReceiptRead,
	))
	adminCtx := workflowJSONRPCAdminContext()
	receipt, item, _ := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "PR-JSONRPC-CORRECTION-PERM", "PR-JSONRPC-CORRECTION-PERM-LOT")

	_, deniedReturn, err := j.handlePurchase(adminCtx, "create_purchase_return_from_receipt", "denied-return", mustJSONRPCStruct(t, map[string]any{
		"return_no":           "RET-DENIED",
		"purchase_receipt_id": float64(receipt.ID),
		"returned_at":         "2026-07-14",
		"idempotency_key":     "return-denied",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(item.ID),
			"quantity":                 "1",
		}},
	}))
	if err != nil || deniedReturn == nil || deniedReturn.Code != errcode.PermissionDenied.Code {
		t.Fatalf("return create without write permission = result=%#v err=%v", deniedReturn, err)
	}

	_, deniedAdjustment, err := j.handlePurchase(adminCtx, "create_purchase_receipt_adjustment_from_receipt", "denied-adjustment", mustJSONRPCStruct(t, map[string]any{
		"adjustment_no":       "ADJ-DENIED",
		"purchase_receipt_id": float64(receipt.ID),
		"adjusted_at":         "2026-07-14",
		"idempotency_key":     "adjustment-denied",
		"items": []any{map[string]any{
			"purchase_receipt_item_id": float64(item.ID),
			"adjust_type":              biz.PurchaseReceiptAdjustmentQuantityIncrease,
			"quantity":                 "1",
		}},
	}))
	if err != nil || deniedAdjustment == nil || deniedAdjustment.Code != errcode.PermissionDenied.Code {
		t.Fatalf("adjustment create without write permission = result=%#v err=%v", deniedAdjustment, err)
	}

	_, missingReturn, err := j.handlePurchase(adminCtx, "get_purchase_return", "missing-return", mustJSONRPCStruct(t, map[string]any{"id": float64(999999)}))
	if err != nil || missingReturn == nil || missingReturn.Code != errcode.InvalidParam.Code || missingReturn.Message != "采购退货单不存在" {
		t.Fatalf("missing return mapping = result=%#v err=%v", missingReturn, err)
	}
	_, missingAdjustment, err := j.handlePurchase(adminCtx, "get_purchase_receipt_adjustment", "missing-adjustment", mustJSONRPCStruct(t, map[string]any{"id": float64(999999)}))
	if err != nil || missingAdjustment == nil || missingAdjustment.Code != errcode.InvalidParam.Code || missingAdjustment.Message != "采购入库调整单不存在" {
		t.Fatalf("missing adjustment mapping = result=%#v err=%v", missingAdjustment, err)
	}
}

func assertPurchaseCorrectionBalance(t *testing.T, ctx context.Context, j *jsonrpcDispatcher, fixtures inventoryTestFixtures, lotID int, want string) {
	t.Helper()
	balance, err := j.inventoryUC.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get purchase correction balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, want)
}
