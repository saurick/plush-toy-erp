package data

import (
	"context"
	"errors"
	"io"
	"slices"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseRejectionDispositionPostsWithoutInventoryAndKeepsDraftReceipt(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_rejection_disposition")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "PR-REJECT-1", SupplierName: "拒收供应商"})
	if err != nil {
		t.Fatal(err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: fixtures.materialID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, LotNo: stringPtr("REJECT-LOT-1"), Quantity: decimal.NewFromInt(5), IdempotencyKey: "reject-item-1"})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, SourceType: biz.QualityInspectionSourcePurchaseReceipt, InspectionType: biz.QualityInspectionTypeIncoming, Limit: 10})
	if err != nil || len(inspections) != 1 || inspections[0].Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("generated inspections=%#v err=%v", inspections, err)
	}
	inspection := inspections[0]
	decision := approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject)
	rejected, err := uc.RejectQualityInspection(ctx, decision)
	if err != nil {
		t.Fatal(err)
	}
	in := &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-1", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(5), Reason: "首次来料不合格退厂", IdempotencyKey: "prd-1", CreatedBy: 1}
	created, err := uc.CreatePurchaseRejectionDisposition(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := uc.CreatePurchaseRejectionDisposition(ctx, in)
	if err != nil || replay.ID != created.ID {
		t.Fatalf("replay=%#v err=%v", replay, err)
	}
	before, _ := client.InventoryTxn.Query().Count(ctx)
	posted, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || posted.Status != biz.PurchaseRejectionStatusPosted {
		t.Fatalf("posted=%#v err=%v", posted, err)
	}
	if replay, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2}); err != nil || replay.ID != posted.ID {
		t.Fatalf("post replay=%#v err=%v", replay, err)
	}
	if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 9}); !errors.Is(err, biz.ErrPurchaseRejectionConflict) {
		t.Fatalf("different-actor post replay err=%v", err)
	}
	if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: posted.Version + 1, ActorID: 2}); !errors.Is(err, biz.ErrPurchaseRejectionConflict) {
		t.Fatalf("stale post err=%v", err)
	}
	after, _ := client.InventoryTxn.Query().Count(ctx)
	if after != before {
		t.Fatalf("disposition wrote inventory before=%d after=%d", before, after)
	}
	assertFulfillmentTask(t, ctx, client, "receipt_exception", receipt.ID, "done", biz.PurchaseRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "withdrawn", biz.WarehouseRoleKey)
	gotReceipt, err := uc.GetPurchaseReceipt(ctx, receipt.ID)
	if err != nil || gotReceipt.Status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("receipt=%#v err=%v", gotReceipt, err)
	}
	lot, err := uc.GetInventoryLot(ctx, *item.LotID)
	if err != nil || lot.Status != biz.InventoryLotRejected {
		t.Fatalf("lot=%#v err=%v", lot, err)
	}
	if cancelled, err := uc.CancelPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: posted.ID, ExpectedVersion: posted.Version, ActorID: 3, Reason: "错误撤销"}); err != nil || cancelled.Status != biz.PurchaseRejectionStatusCancelled {
		t.Fatalf("posted cancellation=%#v err=%v", cancelled, err)
	}
	assertFulfillmentTask(t, ctx, client, "receipt_exception", receipt.ID, "ready", biz.PurchaseRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "blocked", biz.WarehouseRoleKey)
}

func TestPurchaseRejectionDispositionRejectsPostedReceiptSource(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_rejection_posted_source")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-POSTED-REJECT", fixtures, stringPtr("POSTED-REJECT-LOT"), decimal.NewFromInt(2))
	rejected := createRejectedPurchaseReceiptInspection(t, ctx, uc, receipt, "QI-POSTED-REJECT")
	_, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-POSTED", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "不得复用已入库退货", IdempotencyKey: "prd-posted", CreatedBy: 1})
	if !errors.Is(err, biz.ErrPurchaseRejectionSourceState) {
		t.Fatalf("posted source err=%v", err)
	}
}

func TestPurchaseRejectionDispositionAccumulatesAndCreatesReplacementReceipt(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "purchase_rejection_partial_replace")
	testPurchaseRejectionDispositionAccumulatesAndCreatesReplacementReceipt(t, data, client)
}

func TestPurchaseReceiptPostgresReplacementCountHandoff(t *testing.T) {
	data, client := openPurchaseOperationalPostgresTestData(t)
	testPurchaseRejectionDispositionAccumulatesAndCreatesReplacementReceipt(t, data, client)
}

func testPurchaseRejectionDispositionAccumulatesAndCreatesReplacementReceipt(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	pgFixtures := createInventoryPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{unitID: pgFixtures.unitID, materialID: pgFixtures.materialID, productID: pgFixtures.productID, warehouseID: pgFixtures.warehouseID, productWarehouseID: pgFixtures.productWarehouseID}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "REPLACEMENT-COUNT", decimal.NewFromInt(10))
	if _, err := NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)).UpdatePurchaseOrderLifecycle(ctx, orderItem.PurchaseOrderID, biz.PurchaseOrderStatusApproved); err != nil {
		t.Fatal(err)
	}
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: orderItem.PurchaseOrderID, AllRemaining: true, ReceiptNo: "PR-REJECT-PARTIAL", WarehouseID: fixtures.warehouseID, IdempotencyKey: "replacement-count-original"})
	if err != nil {
		t.Fatal(err)
	}
	inspection := receipt.QualityInspections[0]
	rejected, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	first, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-PARTIAL-RETURN", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(4), Reason: "部分退厂", IdempotencyKey: "prd-partial-return", CreatedBy: 1})
	if err != nil {
		t.Fatal(err)
	}
	second, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-PARTIAL-REPLACE", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReplace, Quantity: decimal.NewFromInt(6), Reason: "剩余补换", IdempotencyKey: "prd-partial-replace", CreatedBy: 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-OVER", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "不得超量", IdempotencyKey: "prd-over", CreatedBy: 1}); !errors.Is(err, biz.ErrPurchaseRejectionSourceInvalid) {
		t.Fatalf("over allocation err=%v", err)
	}
	if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: first.ID, ExpectedVersion: first.Version, ActorID: 2}); err != nil {
		t.Fatal(err)
	}
	countTask := assertFulfillmentTask(t, ctx, client, "receipt_replacement", second.ID, "ready", biz.WarehouseRoleKey)
	workflow := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	allRoles := &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}
	assertProjection := func(state string, scope *biz.WorkflowTaskVisibilityScope, taskIDs ...int) {
		t.Helper()
		board, err := workflow.ListWorkflowExceptions(ctx, biz.WorkflowExceptionQuery{Limit: 10, Visibility: scope, TrackingRef: &biz.WorkflowTrackingRef{Kind: "task", ID: countTask.ID}})
		if err != nil || board.Total != 1 || len(board.Items) != 1 || board.Items[0].State != state {
			t.Fatalf("replacement exception expected %s: %+v err=%v", state, board, err)
		}
		for _, id := range taskIDs {
			if !slices.Contains(board.Items[0].TaskIDs, id) {
				t.Fatalf("replacement exception lost task %d: %+v", id, board.Items[0])
			}
		}
		if !scope.StandaloneAllowAllOwnerRoles {
			for _, task := range board.Items[0].Tasks {
				if !slices.Contains(scope.StandaloneVisibleOwnerRoleKeys, task.OwnerRoleKey) {
					t.Fatalf("replacement exception exposed another role: %+v", task)
				}
			}
		}
	}
	assertProjection("open", &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.WarehouseRoleKey}}, countTask.ID)
	orderChain, err := workflow.GetWorkflowHandlingChain(ctx, countTask.ID, biz.WorkflowHandlingChainOrderView, allRoles)
	if err != nil || !slices.ContainsFunc(orderChain.Items, func(item biz.WorkflowHandlingChainItem) bool { return item.SourceType == "purchase_order" }) {
		t.Fatalf("warehouse count lost the purchase order relation: %+v err=%v", orderChain, err)
	}
	beforeInventory := client.InventoryTxn.Query().CountX(ctx)
	beforeReceipts, beforeInspections := client.PurchaseReceipt.Query().CountX(ctx), client.QualityInspection.Query().CountX(ctx)
	for _, quantity := range []*decimal.Decimal{nil, testCountedQuantity(5)} {
		if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: second.ID, ExpectedVersion: second.Version, ActorID: 2, CountedQuantity: quantity}); !errors.Is(err, biz.ErrPurchaseRejectionSourceInvalid) {
			t.Fatalf("missing or mismatched warehouse count accepted: %v", err)
		}
	}
	counted := decimal.NewFromInt(6)
	deniedScope := biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
	if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: second.ID, ExpectedVersion: second.Version, ActorID: 2, CountedQuantity: &counted, WarehouseScope: &deniedScope}); !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("out-of-scope warehouse accepted: %v", err)
	}
	if client.PurchaseReceipt.Query().CountX(ctx) != beforeReceipts || client.QualityInspection.Query().CountX(ctx) != beforeInspections || client.InventoryTxn.Query().CountX(ctx) != beforeInventory {
		t.Fatal("unconfirmed replacement created receipt, inspection or stock")
	}
	posted, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: second.ID, ExpectedVersion: second.Version, ActorID: 2, CountedQuantity: &counted})
	if err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, client, "receipt_replacement", second.ID, "done", biz.WarehouseRoleKey)
	if posted.ReplacementReceiptID == nil {
		t.Fatal("replacement receipt link is required")
	}
	replacement, err := uc.GetPurchaseReceipt(ctx, *posted.ReplacementReceiptID)
	if err != nil {
		t.Fatal(err)
	}
	replacementInspections, _, inspectionErr := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: replacement.ID, Limit: 10})
	if replacement.Status != biz.PurchaseReceiptStatusDraft || len(replacement.Items) != 1 || !replacement.Items[0].Quantity.Equal(decimal.NewFromInt(6)) || inspectionErr != nil || len(replacementInspections) != 1 {
		t.Fatalf("replacement=%#v", replacement)
	}
	if original, _ := uc.GetPurchaseReceipt(ctx, receipt.ID); original.Status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("original status=%s", original.Status)
	}
	inbound := assertFulfillmentTask(t, ctx, client, "receipt_inbound", replacement.ID, "blocked", biz.WarehouseRoleKey)
	iqc := assertFulfillmentTask(t, ctx, client, "receipt_quality", replacementInspections[0].ID, "ready", biz.QualityRoleKey)
	assertProjection("open", allRoles, countTask.ID, inbound.ID, iqc.ID)
	chain, err := workflow.GetWorkflowHandlingChain(ctx, countTask.ID, biz.WorkflowHandlingChainTaskView, allRoles)
	if err != nil || !slices.ContainsFunc(chain.Items, func(item biz.WorkflowHandlingChainItem) bool { return item.ID == iqc.ID }) {
		t.Fatalf("count task lost replacement IQC chain: %+v err=%v", chain, err)
	}
	if replay, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: second.ID, ExpectedVersion: second.Version, ActorID: 2, CountedQuantity: &counted}); err != nil || replay.ReplacementReceiptID == nil || *replay.ReplacementReceiptID != replacement.ID {
		t.Fatalf("warehouse count replay=%+v err=%v", replay, err)
	}
	if _, err := uc.CancelPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: posted.ID, ExpectedVersion: posted.Version, ActorID: 3, Reason: "补换到货登记有误"}); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, client, "receipt_replacement", second.ID, "withdrawn", biz.WarehouseRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", replacement.ID, "withdrawn", biz.WarehouseRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_exception", receipt.ID, "ready", biz.PurchaseRoleKey)
	assertProjection("open", allRoles, countTask.ID)
	// A rejected replacement starts another counted delivery. The original
	// incident stays open until every active branch has a final business result.
	createReplacement := func(qualityID int, number string) *biz.PurchaseRejectionDisposition {
		t.Helper()
		draft, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: number, QualityInspectionID: qualityID, DispositionType: biz.PurchaseRejectionReplace, Quantity: counted, Reason: "重新补换", IdempotencyKey: number, CreatedBy: 1})
		if err != nil {
			t.Fatal(err)
		}
		posted, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: draft.ID, ExpectedVersion: draft.Version, ActorID: 2, CountedQuantity: &counted})
		if err != nil {
			t.Fatal(err)
		}
		return posted
	}
	active := createReplacement(rejected.ID, "PRD-REPLACEMENT-RETRY")
	nextIQCs, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: *active.ReplacementReceiptID, Limit: 10})
	if err != nil || len(nextIQCs) != 1 {
		t.Fatalf("next IQC: %+v %v", nextIQCs, err)
	}
	if _, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(nextIQCs[0].ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatal(err)
	}
	finalReplacement := createReplacement(nextIQCs[0].ID, "PRD-REPLACEMENT-SECOND-ROUND")
	finalInbound := assertFulfillmentTask(t, ctx, client, "receipt_inbound", *finalReplacement.ReplacementReceiptID, "blocked", biz.WarehouseRoleKey)
	assertProjection("open", allRoles, finalInbound.ID)
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, *finalReplacement.ReplacementReceiptID)
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", *finalReplacement.ReplacementReceiptID, "ready", biz.WarehouseRoleKey)
	assertProjection("open", allRoles, finalInbound.ID)
	if _, err := uc.PostPurchaseReceipt(ctx, *finalReplacement.ReplacementReceiptID); err != nil {
		t.Fatal(err)
	}
	assertProjection("closed", allRoles, finalInbound.ID)
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, *finalReplacement.ReplacementReceiptID); !errors.Is(err, biz.ErrPurchaseReceiptCorrectionDependency) {
		t.Fatalf("posted replacement must retain its disposition source: %v", err)
	}
	assertProjection("closed", allRoles, finalInbound.ID)
}

func testCountedQuantity(value int64) *decimal.Decimal {
	result := decimal.NewFromInt(value)
	return &result
}
