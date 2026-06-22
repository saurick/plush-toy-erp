package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/data/model/ent"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestJsonrpcDispatcher_QualityInspectionAPIChangesLotStatusWithoutInventoryTxn(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_quality_inspection")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newQualityJSONRPCTestData(data, workflowJSONRPCAdmin(
		[]string{biz.QualityRoleKey},
		biz.PermissionQualityInspectionRead,
		biz.PermissionQualityInspectionCreate,
		biz.PermissionQualityInspectionUpdate,
	))
	adminCtx := workflowJSONRPCAdminContext()

	receipt, item, lotID := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "QI-JSONRPC-IN-PASS", "QI-JSONRPC-LOT-PASS")
	txnCount := client.InventoryTxn.Query().CountX(ctx)

	_, createRes, err := j.handleQuality(adminCtx, "create_quality_inspection_draft", "1", mustJSONRPCStruct(t, map[string]any{
		"inspection_no":            "QI-JSONRPC-PASS",
		"purchase_receipt_id":      float64(receipt.ID),
		"purchase_receipt_item_id": float64(item.ID),
		"inventory_lot_id":         float64(lotID),
		"material_id":              float64(fixtures.materialID),
		"warehouse_id":             float64(fixtures.warehouseID),
		"inspector_id":             float64(9),
		"decision_note":            "初检待判定",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("expected create OK, got %#v", createRes)
	}
	inspectionID := jsonRPCInt(t, jsonRPCNestedMap(t, createRes, "quality_inspection"), "id")
	assertInventoryTxnCountUnchanged(t, ctx, client, txnCount)

	_, submitRes, err := j.handleQuality(adminCtx, "submit_quality_inspection", "2", mustJSONRPCStruct(t, map[string]any{"id": float64(inspectionID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	submitted := jsonRPCNestedMap(t, submitRes, "quality_inspection")
	if status := submitted["status"]; status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("expected submitted status, got %#v", status)
	}
	assertLotStatus(t, ctx, client, lotID, biz.InventoryLotHold)
	assertInventoryTxnCountUnchanged(t, ctx, client, txnCount)

	_, passRes, err := j.handleQuality(adminCtx, "pass_quality_inspection", "3", mustJSONRPCStruct(t, map[string]any{
		"id":            float64(inspectionID),
		"result":        biz.QualityInspectionResultConcession,
		"inspected_at":  "2026-06-17",
		"decision_note": "让步接收",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	passed := jsonRPCNestedMap(t, passRes, "quality_inspection")
	if status := passed["status"]; status != biz.QualityInspectionStatusPassed {
		t.Fatalf("expected passed status, got %#v", status)
	}
	if result := passed["result"]; result != biz.QualityInspectionResultConcession {
		t.Fatalf("expected concession result, got %#v", result)
	}
	assertLotStatus(t, ctx, client, lotID, biz.InventoryLotActive)
	assertInventoryTxnCountUnchanged(t, ctx, client, txnCount)

	_, listRes, err := j.handleQuality(adminCtx, "list_quality_inspections", "4", mustJSONRPCStruct(t, map[string]any{
		"status":              biz.QualityInspectionStatusPassed,
		"result":              biz.QualityInspectionResultConcession,
		"date_from":           "2026-06-17",
		"date_to":             "2026-06-17",
		"purchase_receipt_id": float64(receipt.ID),
		"inventory_lot_id":    float64(lotID),
		"material_id":         float64(fixtures.materialID),
		"warehouse_id":        float64(fixtures.warehouseID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one passed inspection in list, got %d", total)
	}

	_, invalidListRes, err := j.handleQuality(adminCtx, "list_quality_inspections", "invalid-date", mustJSONRPCStruct(t, map[string]any{
		"date_to": "not-a-date",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidListRes == nil || invalidListRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for bad quality date filter, got %#v", invalidListRes)
	}

	rejectReceipt, rejectItem, rejectLotID := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "QI-JSONRPC-IN-REJECT", "QI-JSONRPC-LOT-REJECT")
	rejectDraft := createQualityDraftViaRPC(t, adminCtx, j, "QI-JSONRPC-REJECT", rejectReceipt.ID, rejectItem.ID, rejectLotID, fixtures)
	if _, submitRejectRes, err := j.handleQuality(adminCtx, "submit_quality_inspection", "5", mustJSONRPCStruct(t, map[string]any{"id": float64(rejectDraft)})); err != nil || submitRejectRes.Code != errcode.OK.Code {
		t.Fatalf("expected submit reject draft OK, res=%#v err=%v", submitRejectRes, err)
	}
	_, rejectRes, err := j.handleQuality(adminCtx, "reject_quality_inspection", "6", mustJSONRPCStruct(t, map[string]any{
		"id":            float64(rejectDraft),
		"decision_note": "尺寸不符",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	rejected := jsonRPCNestedMap(t, rejectRes, "quality_inspection")
	if status := rejected["status"]; status != biz.QualityInspectionStatusRejected {
		t.Fatalf("expected rejected status, got %#v", status)
	}
	assertLotStatus(t, ctx, client, rejectLotID, biz.InventoryLotRejected)

	cancelReceipt, cancelItem, cancelLotID := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "QI-JSONRPC-IN-CANCEL", "QI-JSONRPC-LOT-CANCEL")
	cancelDraft := createQualityDraftViaRPC(t, adminCtx, j, "QI-JSONRPC-CANCEL", cancelReceipt.ID, cancelItem.ID, cancelLotID, fixtures)
	_, cancelRes, err := j.handleQuality(adminCtx, "cancel_quality_inspection", "7", mustJSONRPCStruct(t, map[string]any{
		"id":            float64(cancelDraft),
		"decision_note": "来料批次撤检",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	cancelled := jsonRPCNestedMap(t, cancelRes, "quality_inspection")
	if status := cancelled["status"]; status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected cancelled status, got %#v", status)
	}
	assertLotStatus(t, ctx, client, cancelLotID, biz.InventoryLotActive)
}

func TestJsonrpcDispatcher_QualityInspectionAPIRequiresDomainPermissions(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_quality_permissions")
	j := newQualityJSONRPCTestData(data, workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionQualityInspectionRead))

	_, createRes, err := j.handleQuality(workflowJSONRPCAdminContext(), "create_quality_inspection_draft", "1", mustJSONRPCStruct(t, map[string]any{
		"inspection_no":       "QI-DENIED",
		"purchase_receipt_id": float64(1),
		"inventory_lot_id":    float64(1),
		"material_id":         float64(1),
		"warehouse_id":        float64(1),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected create permission denied, got %#v", createRes)
	}

	_, submitRes, err := j.handleQuality(workflowJSONRPCAdminContext(), "submit_quality_inspection", "2", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if submitRes == nil || submitRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected submit permission denied, got %#v", submitRes)
	}
}

func TestQualityInspectionFilterFromParamsForwardsContextFilters(t *testing.T) {
	filter, ok := qualityInspectionFilterFromParams(map[string]any{
		"purchase_order_id":        float64(21),
		"purchase_receipt_id":      float64(34),
		"purchase_receipt_item_id": float64(55),
	})
	if !ok {
		t.Fatal("expected quality inspection filter to parse")
	}
	if filter.PurchaseOrderID != 21 {
		t.Fatalf("expected purchase_order_id forwarded, got %d", filter.PurchaseOrderID)
	}
	if filter.PurchaseReceiptID != 34 {
		t.Fatalf("expected purchase_receipt_id forwarded, got %d", filter.PurchaseReceiptID)
	}
	if filter.PurchaseReceiptItemID != 55 {
		t.Fatalf("expected purchase_receipt_item_id forwarded, got %d", filter.PurchaseReceiptItemID)
	}
}

func newQualityJSONRPCTestData(data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	logger := log.NewStdLogger(io.Discard)
	return &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(logger, "module", "service.jsonrpc.quality.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		inventoryUC: biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
	}
}

func createPostedQualityReceipt(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, fixtures inventoryTestFixtures, receiptNo, lotNo string) (*biz.PurchaseReceipt, *biz.PurchaseReceiptItem, int) {
	t.Helper()
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    receiptNo,
		SupplierName: "质检供应商",
	})
	if err != nil {
		t.Fatalf("create receipt %s failed: %v", receiptNo, err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotNo:       stringPtr(lotNo),
		Quantity:    mustDecimal(t, "10"),
	}); err != nil {
		t.Fatalf("add receipt item %s failed: %v", receiptNo, err)
	}
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post receipt %s failed: %v", receiptNo, err)
	}
	if len(posted.Items) != 1 || posted.Items[0].LotID == nil {
		t.Fatalf("expected one posted receipt item with lot, got %#v", posted.Items)
	}
	return posted, posted.Items[0], *posted.Items[0].LotID
}

func createQualityDraftViaRPC(t *testing.T, ctx context.Context, j *jsonrpcDispatcher, inspectionNo string, receiptID, itemID, lotID int, fixtures inventoryTestFixtures) int {
	t.Helper()
	_, res, err := j.handleQuality(ctx, "create_quality_inspection_draft", inspectionNo, mustJSONRPCStruct(t, map[string]any{
		"inspection_no":            inspectionNo,
		"purchase_receipt_id":      float64(receiptID),
		"purchase_receipt_item_id": float64(itemID),
		"inventory_lot_id":         float64(lotID),
		"material_id":              float64(fixtures.materialID),
		"warehouse_id":             float64(fixtures.warehouseID),
	}))
	if err != nil {
		t.Fatalf("create quality draft %s err=%v", inspectionNo, err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("create quality draft %s got %#v", inspectionNo, res)
	}
	return jsonRPCInt(t, jsonRPCNestedMap(t, res, "quality_inspection"), "id")
}

func assertLotStatus(t *testing.T, ctx context.Context, client *ent.Client, lotID int, want string) {
	t.Helper()
	lot, err := client.InventoryLot.Get(ctx, lotID)
	if err != nil {
		t.Fatalf("get lot %d failed: %v", lotID, err)
	}
	if lot.Status != want {
		t.Fatalf("expected lot %d status %s, got %s", lotID, want, lot.Status)
	}
}

func assertInventoryTxnCountUnchanged(t *testing.T, ctx context.Context, client *ent.Client, want int) {
	t.Helper()
	if got := client.InventoryTxn.Query().CountX(ctx); got != want {
		t.Fatalf("quality action must not write inventory txns, want %d got %d", want, got)
	}
}

func stringPtr(value string) *string {
	return &value
}

func mustDecimal(t *testing.T, value string) decimal.Decimal {
	t.Helper()
	parsed, err := decimal.NewFromString(value)
	if err != nil {
		t.Fatalf("parse decimal %s failed: %v", value, err)
	}
	return parsed
}
