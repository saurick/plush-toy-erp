package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestJsonrpcDispatcher_QualityInspectionAPIChangesLotStatusWithoutInventoryTxn(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_quality_inspection")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newQualityJSONRPCTestData(t, data, workflowJSONRPCAdmin(
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
	createdInspection := jsonRPCNestedMap(t, createRes, "quality_inspection")
	inspectionID := jsonRPCInt(t, createdInspection, "id")
	if createdInspection["source_type"] != biz.QualityInspectionSourcePurchaseReceipt ||
		jsonRPCInt(t, createdInspection, "source_id") != receipt.ID ||
		createdInspection["inspection_type"] != biz.QualityInspectionTypeIncoming ||
		createdInspection["subject_type"] != biz.QualityInspectionSubjectMaterial ||
		jsonRPCInt(t, createdInspection, "subject_id") != fixtures.materialID {
		t.Fatalf("expected incoming quality source anchor, got %#v", createdInspection)
	}
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
	_, reversedListRes, err := j.handleQuality(adminCtx, "list_quality_inspections", "reversed-date", mustJSONRPCStruct(t, map[string]any{
		"date_from": "2026-06-30",
		"date_to":   "2026-06-01",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if reversedListRes == nil || reversedListRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for reversed quality date filter, got %#v", reversedListRes)
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

func TestJsonrpcDispatcher_FinishedGoodsQualityInspectionAPIBindsShipmentFact(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_finished_goods_quality_inspection")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newQualityJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.QualityRoleKey},
		biz.PermissionQualityInspectionRead,
		biz.PermissionQualityInspectionCreate,
		biz.PermissionQualityInspectionUpdate,
	))
	adminCtx := workflowJSONRPCAdminContext()

	lot, err := j.inventoryUC.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		LotNo:       "QI-JSONRPC-FG-LOT",
	})
	if err != nil {
		t.Fatalf("create product lot failed: %v", err)
	}
	operationalUC := biz.NewOperationalFactUsecase(datarepo.NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "QI-JSONRPC-FG-SHIP",
			IdempotencyKey: "QI-JSONRPC-FG-SHIP",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				LotID:       &lot.ID,
				Quantity:    mustDecimal(t, "2"),
			},
		},
	})
	if err != nil {
		t.Fatalf("create draft shipment failed: %v", err)
	}
	txnCount := client.InventoryTxn.Query().CountX(ctx)

	_, createRes, err := j.handleQuality(adminCtx, "create_finished_goods_quality_inspection_draft", "fg-create", mustJSONRPCStruct(t, map[string]any{
		"inspection_no":         "QI-JSONRPC-FG",
		"shipment_id":           float64(shipment.ID),
		"finished_goods_lot_id": float64(lot.ID),
		"product_id":            float64(fixtures.productID),
		"warehouse_id":          float64(fixtures.warehouseID),
		"decision_note":         "成品质检待判定",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("expected create OK, got %#v", createRes)
	}
	created := jsonRPCNestedMap(t, createRes, "quality_inspection")
	inspectionID := jsonRPCInt(t, created, "id")
	if created["purchase_receipt_id"] != nil || created["material_id"] != nil {
		t.Fatalf("finished goods quality must not expose purchase/material anchors, got %#v", created)
	}
	if created["source_type"] != biz.QualityInspectionSourceShipment ||
		jsonRPCInt(t, created, "source_id") != shipment.ID ||
		created["inspection_type"] != biz.QualityInspectionTypeFinishedGoods ||
		created["subject_type"] != biz.QualityInspectionSubjectProduct ||
		jsonRPCInt(t, created, "subject_id") != fixtures.productID {
		t.Fatalf("expected shipment finished goods source anchor, got %#v", created)
	}
	assertInventoryTxnCountUnchanged(t, ctx, client, txnCount)

	_, submitRes, err := j.handleQuality(adminCtx, "submit_quality_inspection", "fg-submit", mustJSONRPCStruct(t, map[string]any{"id": float64(inspectionID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if submitRes == nil || submitRes.Code != errcode.OK.Code {
		t.Fatalf("expected submit OK, got %#v", submitRes)
	}
	assertLotStatus(t, ctx, client, lot.ID, biz.InventoryLotHold)
	assertInventoryTxnCountUnchanged(t, ctx, client, txnCount)

	_, listRes, err := j.handleQuality(adminCtx, "list_finished_goods_quality_inspections", "fg-list", mustJSONRPCStruct(t, map[string]any{
		"shipment_id": float64(shipment.ID),
		"product_id":  float64(fixtures.productID),
		"status":      biz.QualityInspectionStatusSubmitted,
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one finished goods inspection in list, got %d", total)
	}

	_, invalidRes, err := j.handleQuality(adminCtx, "list_quality_inspections", "fg-invalid-list", mustJSONRPCStruct(t, map[string]any{
		"source_type": biz.QualityInspectionSourceShipment,
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidRes == nil || invalidRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("ordinary quality list must keep incoming boundary, got %#v", invalidRes)
	}
}

func TestJsonrpcDispatcher_QualityInspectionAPIRequiresDomainPermissions(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_quality_permissions")
	j := newQualityJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionQualityInspectionRead))

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

func TestJsonrpcDispatcher_QualityInspectionAPIRequiresEnabledModules(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_quality_module_gate")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newQualityJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.QualityRoleKey},
		biz.PermissionQualityInspectionRead,
		biz.PermissionQualityInspectionCreate,
		biz.PermissionQualityInspectionUpdate,
	))
	adminCtx := workflowJSONRPCAdminContext()
	receipt, item, lotID := createPostedQualityReceipt(t, ctx, j.inventoryUC, fixtures, "QI-MODULE-IN-READONLY", "QI-MODULE-LOT-READONLY")

	readOnlyQualityConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.quality-read-only",
		"quality_inspections",
		"read_only",
	)
	activateQualityTestCustomerConfig(t, j, readOnlyQualityConfig)

	_, createRes, err := j.handleQuality(adminCtx, "create_quality_inspection_draft", "quality-read-only-create", mustJSONRPCStruct(t, map[string]any{
		"inspection_no":            "QI-MODULE-READONLY",
		"purchase_receipt_id":      float64(receipt.ID),
		"purchase_receipt_item_id": float64(item.ID),
		"inventory_lot_id":         float64(lotID),
		"material_id":              float64(fixtures.materialID),
		"warehouse_id":             float64(fixtures.warehouseID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only quality_inspections to reject create, got %#v", createRes)
	}
	if count := client.QualityInspection.Query().
		Where(qualityinspection.InspectionNo("QI-MODULE-READONLY")).
		CountX(ctx); count != 0 {
		t.Fatalf("read_only quality_inspections must not create quality inspection, got %d", count)
	}

	activateQualityTestCustomerConfig(t, j, customerConfigPublishParamsForRevision(t, "2026.06.28.quality-enabled"))
	createdID := createQualityDraftViaRPC(t, adminCtx, j, "QI-MODULE-ENABLED", receipt.ID, item.ID, lotID, fixtures)

	readOnlyQualityUpdateConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.quality-update-read-only",
		"quality_inspections",
		"read_only",
	)
	activateQualityTestCustomerConfig(t, j, readOnlyQualityUpdateConfig)

	_, submitRes, err := j.handleQuality(adminCtx, "submit_quality_inspection", "quality-read-only-submit", mustJSONRPCStruct(t, map[string]any{
		"id": float64(createdID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if submitRes == nil || submitRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only quality_inspections to reject submit, got %#v", submitRes)
	}
	stored := client.QualityInspection.GetX(ctx, createdID)
	if stored.Status != biz.QualityInspectionStatusDraft {
		t.Fatalf("read_only quality_inspections must not change status, got %s", stored.Status)
	}

	_, getRes, err := j.handleQuality(adminCtx, "get_quality_inspection", "quality-read-only-get", mustJSONRPCStruct(t, map[string]any{
		"id": float64(createdID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if getRes == nil || getRes.Code != errcode.OK.Code {
		t.Fatalf("expected get to remain available for historical read, got %#v", getRes)
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

func newQualityJSONRPCTestData(t *testing.T, data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	customerConfigUC := biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(logger, "module", "service.jsonrpc.quality.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		inventoryUC:      biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
		customerConfigUC: customerConfigUC,
	}
	activateQualityTestCustomerConfig(t, dispatcher, customerConfigPublishParams(t))
	return dispatcher
}

func activateQualityTestCustomerConfig(t *testing.T, dispatcher *jsonrpcDispatcher, params *structpb.Struct) {
	t.Helper()
	if dispatcher == nil || dispatcher.customerConfigUC == nil {
		t.Fatalf("customerConfigUC missing")
	}
	in, ok := customerConfigPublishInputFromParams(params.AsMap())
	if !ok {
		t.Fatalf("invalid customer config params: %#v", params.AsMap())
	}
	published, err := dispatcher.customerConfigUC.PublishCustomerConfig(context.Background(), in, 1)
	if err != nil {
		t.Fatalf("publish customer config %s err = %v", in.Revision, err)
	}
	activatePublishedCustomerConfigForTest(t, dispatcher.customerConfigUC, in, published, 1)
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
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr(lotNo),
		Quantity:       mustDecimal(t, "10"),
		IdempotencyKey: "test:quality-receipt:" + receiptNo,
	}); err != nil {
		t.Fatalf("add receipt item %s failed: %v", receiptNo, err)
	}
	passPurchaseReceiptQualityForServiceTest(t, ctx, uc, receipt.ID)
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post receipt %s failed: %v", receiptNo, err)
	}
	if len(posted.Items) != 1 || posted.Items[0].LotID == nil {
		t.Fatalf("expected one posted receipt item with lot, got %#v", posted.Items)
	}
	return posted, posted.Items[0], *posted.Items[0].LotID
}

func passPurchaseReceiptQualityForServiceTest(t *testing.T, ctx context.Context, uc *biz.InventoryUsecase, receiptID int) {
	t.Helper()
	inspections, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{
		PurchaseReceiptID: receiptID,
		SourceType:        biz.QualityInspectionSourcePurchaseReceipt,
		InspectionType:    biz.QualityInspectionTypeIncoming,
		Limit:             200,
	})
	if err != nil || len(inspections) == 0 {
		t.Fatalf("load generated incoming inspections for receipt %d failed: count=%d err=%v", receiptID, len(inspections), err)
	}
	for _, inspection := range inspections {
		if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
			InspectionID: inspection.ID,
			Result:       biz.QualityInspectionResultPass,
		}); err != nil {
			t.Fatalf("pass generated incoming inspection %d failed: %v", inspection.ID, err)
		}
	}
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
