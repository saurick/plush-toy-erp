package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReceiptOrderQuantityGuard(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_receipt_order_quantity_guard")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "SQLITE", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	first := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-PARTIAL-1", mustDecimal(t, "4"))
	if _, err := uc.PostPurchaseReceipt(ctx, first.ID); err != nil {
		t.Fatalf("post first partial receipt failed: %v", err)
	}

	second := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-PARTIAL-2", mustDecimal(t, "6"))
	if _, err := uc.PostPurchaseReceipt(ctx, second.ID); err != nil {
		t.Fatalf("post exact remaining receipt failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, second.ID); err != nil {
		t.Fatalf("repeat post should remain idempotent: %v", err)
	}

	over := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-OVER", mustDecimal(t, "0.000001"))
	if _, err := uc.PostPurchaseReceipt(ctx, over.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected over-receipt to be rejected, got %v", err)
	}
	if status := purchaseReceiptStatusForTest(t, ctx, client, over.ID); status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("rejected over-receipt must stay draft, got %s", status)
	}

	if _, err := uc.CancelPostedPurchaseReceipt(ctx, second.ID); err != nil {
		t.Fatalf("cancel exact receipt failed: %v", err)
	}
	replacement := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-REPLACEMENT", mustDecimal(t, "6"))
	if _, err := uc.PostPurchaseReceipt(ctx, replacement.ID); err != nil {
		t.Fatalf("cancelled receipt quantity should be receivable again: %v", err)
	}

	unlinked := createUnlinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, "PR-NO-PO", mustDecimal(t, "1000"))
	if _, err := uc.PostPurchaseReceipt(ctx, unlinked.ID); err != nil {
		t.Fatalf("receipt without purchase-order source should keep the supported quick-receipt boundary: %v", err)
	}
}

func TestCreatePurchaseReceiptFromPurchaseOrderIdempotencyReturnsOriginalFacts(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_receipt_order_idempotency")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "IDEMPOTENCY", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	note := "流程自动生成"
	input := &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PR-PO-IDEMPOTENCY",
		WarehouseID:     fixtures.warehouseID,
		Note:            &note,
		IdempotencyKey:  "process:10:node:20:purchase-receipt-create",
	}

	created, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input)
	if err != nil {
		t.Fatalf("create idempotent purchase receipt failed: %v", err)
	}
	if len(created.Items) != 1 || len(created.QualityInspections) != 1 {
		t.Fatalf("expected one generated receipt line and quality fact, got %#v", created)
	}
	originalInspectionID := created.QualityInspections[0].ID
	originalInspection := created.QualityInspections[0]
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   created.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    mustDecimal(t, "1"),
	}); err != nil {
		t.Fatalf("append later draft line failed: %v", err)
	}
	if _, err := client.QualityInspection.Create().
		SetInspectionNo("QI-REPLACEMENT-IDEMPOTENCY").
		SetPurchaseReceiptID(created.ID).
		SetPurchaseReceiptItemID(created.Items[0].ID).
		SetInventoryLotID(originalInspection.InventoryLotID).
		SetMaterialID(originalInspection.MaterialID).
		SetWarehouseID(originalInspection.WarehouseID).
		SetSourceType(biz.QualityInspectionSourcePurchaseReceipt).
		SetSourceID(created.ID).
		SetInspectionType(biz.QualityInspectionTypeIncoming).
		SetSubjectType(biz.QualityInspectionSubjectMaterial).
		SetSubjectID(originalInspection.MaterialID).
		SetStatus(biz.QualityInspectionStatusDraft).
		Save(ctx); err != nil {
		t.Fatalf("create later replacement quality fact failed: %v", err)
	}

	if _, err := client.Warehouse.UpdateOneID(fixtures.warehouseID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("deactivate warehouse after first creation failed: %v", err)
	}
	replayed, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, input)
	if err != nil {
		t.Fatalf("same-payload replay must return the original facts even after reference deactivation: %v", err)
	}
	if replayed.ID != created.ID || len(replayed.Items) != 1 || replayed.Items[0].ID != created.Items[0].ID {
		t.Fatalf("same-payload replay returned different receipt facts: created=%#v replayed=%#v", created, replayed)
	}
	if len(replayed.QualityInspections) != 1 || replayed.QualityInspections[0].ID != originalInspectionID {
		t.Fatalf("same-payload replay returned different quality refs: %#v", replayed.QualityInspections)
	}

	changedNote := "相同 key 的不同内容"
	conflict := *input
	conflict.Note = &changedNote
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &conflict); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("same key with different payload must conflict, got %v", err)
	}

	receiptCount, err := client.PurchaseReceipt.Query().
		Where(purchasereceipt.IdempotencyKey("process:10:node:20:purchase-receipt-create")).
		Count(ctx)
	if err != nil {
		t.Fatalf("count idempotent purchase receipts failed: %v", err)
	}
	if receiptCount != 1 {
		t.Fatalf("idempotent retries must persist one receipt, got %d", receiptCount)
	}
	persisted, err := client.PurchaseReceipt.Query().
		Where(purchasereceipt.IdempotencyKey("process:10:node:20:purchase-receipt-create")).
		Only(ctx)
	if err != nil {
		t.Fatalf("load persisted idempotency intent failed: %v", err)
	}
	if persisted.IdempotencyPayloadHash == nil || len(*persisted.IdempotencyPayloadHash) != 64 {
		t.Fatalf("expected persisted SHA-256 payload hash, got %#v", persisted.IdempotencyPayloadHash)
	}
	if persisted.IdempotencyItemCount == nil || *persisted.IdempotencyItemCount != 1 {
		t.Fatalf("expected persisted initial item result boundary, got %#v", persisted.IdempotencyItemCount)
	}
}

func TestCreatePurchaseReceiptFromPurchaseOrderReservesDraftWithoutCountingItAsPosted(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_receipt_order_remaining")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "REMAINING", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	firstDraft, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PR-PO-AUTO-DRAFT-1",
		WarehouseID:     fixtures.warehouseID,
		ReceivedAt:      time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create first receipt from purchase order failed: %v", err)
	}
	assertDecimalEqual(t, firstDraft.Items[0].Quantity, "10")
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, firstDraft.ID)

	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PR-PO-AUTO-DRAFT-2",
		WarehouseID:     fixtures.warehouseID,
		ReceivedAt:      time.Date(2026, 7, 10, 10, 0, 0, 0, time.UTC),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("automatic generation should reserve an existing draft and reject a duplicate, got %v", err)
	}

	manualDraft := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-MANUAL-DRAFT", mustDecimal(t, "10"))
	if _, err := uc.PostPurchaseReceipt(ctx, manualDraft.ID); err != nil {
		t.Fatalf("an existing draft must not be counted as posted quantity at the posting boundary: %v", err)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, firstDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("reserved draft must fail once another receipt has consumed the quantity, got %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReceipt(ctx, manualDraft.ID); err != nil {
		t.Fatalf("cancel manual receipt failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, firstDraft.ID); err != nil {
		t.Fatalf("reserved draft should post after the other receipt is reversed: %v", err)
	}
}

func TestMaterialSupplyReceiptCreatesLineQualityGateBeforeInventoryPost(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "material_supply_line_quality_gate")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	firstOrderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "QUALITY-GATE", mustDecimal(t, "10"))
	secondMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "MAT-QUALITY-GATE-2")
	if _, err := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(firstOrderItem.PurchaseOrderID).
		SetLineNo(2).
		SetMaterialID(secondMaterial.ID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(mustDecimal(t, "4")).
		SetLineStatus(biz.PurchaseOrderItemStatusOpen).
		Save(ctx); err != nil {
		t.Fatalf("create second purchase order line failed: %v", err)
	}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: firstOrderItem.PurchaseOrderID,
		ReceiptNo:       "PR-QUALITY-GATE",
		WarehouseID:     fixtures.warehouseID,
		ReceivedAt:      time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create material supply receipt failed: %v", err)
	}
	if len(receipt.Items) != 2 || len(receipt.QualityInspections) != 2 {
		t.Fatalf("expected one submitted inspection per receipt line, items=%d inspections=%d", len(receipt.Items), len(receipt.QualityInspections))
	}
	for _, item := range receipt.Items {
		if item.LotID == nil {
			t.Fatalf("receipt line %d missing HOLD lot identity", item.ID)
		}
		lot, err := uc.GetInventoryLot(ctx, *item.LotID)
		if err != nil || lot.Status != biz.InventoryLotHold {
			t.Fatalf("receipt line %d lot must be HOLD before decision, lot=%#v err=%v", item.ID, lot, err)
		}
	}
	for _, inspection := range receipt.QualityInspections {
		if inspection.Status != biz.QualityInspectionStatusSubmitted || inspection.PurchaseReceiptItemID == nil {
			t.Fatalf("expected submitted line inspection, got %#v", inspection)
		}
	}
	gate, err := uc.EvaluatePurchaseReceiptQualityGate(ctx, receipt.ID)
	if err != nil || gate.Outcome != biz.PurchaseReceiptQualityGatePending || len(gate.PendingLineIDs) != 2 {
		t.Fatalf("expected pending two-line quality gate, gate=%#v err=%v", gate, err)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptQualityPending) {
		t.Fatalf("uninspected receipt must not post inventory, got %v", err)
	}
	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("pending quality must keep inventory empty, got %d txns", count)
	}
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: receipt.QualityInspections[0].ID,
		Result:       biz.QualityInspectionResultConcession,
	}); err != nil {
		t.Fatalf("concession decision failed: %v", err)
	}
	gate, err = uc.EvaluatePurchaseReceiptQualityGate(ctx, receipt.ID)
	if err != nil || gate.Outcome != biz.PurchaseReceiptQualityGatePending || gate.PassedLines != 1 {
		t.Fatalf("one decided line must keep aggregate pending, gate=%#v err=%v", gate, err)
	}
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: receipt.QualityInspections[1].ID,
		Result:       biz.QualityInspectionResultPass,
	}); err != nil {
		t.Fatalf("pass decision failed: %v", err)
	}
	gate, err = uc.EvaluatePurchaseReceiptQualityGate(ctx, receipt.ID)
	if err != nil || gate.Outcome != biz.PurchaseReceiptQualityGateReady || gate.PassedLines != 2 {
		t.Fatalf("all passed/concession lines must open gate, gate=%#v err=%v", gate, err)
	}
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil || posted.Status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("quality-ready receipt post failed: receipt=%#v err=%v", posted, err)
	}
	if count := client.InventoryTxn.Query().CountX(ctx); count != 2 {
		t.Fatalf("expected one inbound txn per qualified line, got %d", count)
	}
}

func TestMaterialSupplyRejectedLineBlocksReceiptPost(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "material_supply_rejected_quality_gate")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "QUALITY-REJECT", mustDecimal(t, "5"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PR-QUALITY-REJECT",
		WarehouseID:     fixtures.warehouseID,
	})
	if err != nil {
		t.Fatalf("create rejected quality fixture failed: %v", err)
	}
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: receipt.QualityInspections[0].ID,
		Result:       biz.QualityInspectionResultReject,
		DecisionNote: stringPtr("来料拒收"),
	}); err != nil {
		t.Fatalf("reject incoming inspection failed: %v", err)
	}
	gate, err := uc.EvaluatePurchaseReceiptQualityGate(ctx, receipt.ID)
	if err != nil || gate.Outcome != biz.PurchaseReceiptQualityGateRejected || len(gate.RejectedLineIDs) != 1 {
		t.Fatalf("expected rejected aggregate gate, gate=%#v err=%v", gate, err)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptQualityRejected) {
		t.Fatalf("rejected receipt must not post inventory, got %v", err)
	}
	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("rejected receipt must keep inventory empty, got %d txns", count)
	}
}

func TestPurchaseReceiptOrderQuantityGuardIncludesPostedQuantityAdjustments(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_receipt_order_adjustment_quantity_guard")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "ADJUSTMENT", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	receipt := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-ADJUST-BASE", mustDecimal(t, "8"))
	postedReceipt, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post base receipt failed: %v", err)
	}
	receiptItem := postedReceipt.Items[0]

	overIncrease := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		uc,
		fixtures,
		receiptItem,
		"PRA-PO-OVER-INCREASE",
		biz.PurchaseReceiptAdjustmentQuantityIncrease,
		mustDecimal(t, "3"),
	)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, overIncrease.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("quantity increase must not over-receive the purchase order line, got %v", err)
	}

	exactIncrease := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		uc,
		fixtures,
		receiptItem,
		"PRA-PO-EXACT-INCREASE",
		biz.PurchaseReceiptAdjustmentQuantityIncrease,
		mustDecimal(t, "2"),
	)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, exactIncrease.ID); err != nil {
		t.Fatalf("quantity increase to exact purchase quantity failed: %v", err)
	}
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PR-PO-ADJUST-FULL",
		WarehouseID:     fixtures.warehouseID,
		ReceivedAt:      time.Date(2026, 7, 10, 14, 0, 0, 0, time.UTC),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted quantity increase must consume remaining receivable quantity, got %v", err)
	}

	decrease := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		uc,
		fixtures,
		receiptItem,
		"PRA-PO-DECREASE",
		biz.PurchaseReceiptAdjustmentQuantityDecrease,
		mustDecimal(t, "2"),
	)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease.ID); err != nil {
		t.Fatalf("post quantity decrease failed: %v", err)
	}
	replacement := createLinkedPurchaseReceiptDraftForTest(t, ctx, uc, fixtures, orderItem.ID, "PR-PO-ADJUST-REPLACEMENT", mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReceipt(ctx, replacement.ID); err != nil {
		t.Fatalf("quantity decrease should release receivable quantity: %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, decrease.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelling a decrease must not make the purchase order line over-received, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, replacement.ID); err != nil {
		t.Fatalf("cancel replacement receipt failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, decrease.ID); err != nil {
		t.Fatalf("decrease cancellation should succeed after receipt reversal releases capacity: %v", err)
	}
	assertDecimalEqual(t, postedPurchaseOrderReceiptQuantityForTest(t, ctx, client, orderItem.ID), "8")
	effective, err := purchaseOrderEffectiveReceivedQuantities(ctx, client, []int{orderItem.ID}, 0, 0)
	if err != nil {
		t.Fatalf("load effective purchase order received quantity failed: %v", err)
	}
	assertDecimalEqual(t, effective[orderItem.ID], "10")
}

func TestPurchaseReceiptPostgresOrderQuantityGuardConcurrent(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	postgresFixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{
		unitID:      postgresFixtures.unitID,
		materialID:  postgresFixtures.materialID,
		productID:   postgresFixtures.productID,
		warehouseID: postgresFixtures.warehouseID,
	}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	orderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t,
		ctx,
		client,
		fixtures,
		"PG-CONCURRENT-"+postgresFixtures.suffix,
		mustDecimal(t, "10"),
	)
	first := createLinkedPurchaseReceiptDraftForTest(
		t,
		ctx,
		uc,
		fixtures,
		orderItem.ID,
		"PR-PO-PG-CONCURRENT-1-"+postgresFixtures.suffix,
		mustDecimal(t, "6"),
	)
	second := createLinkedPurchaseReceiptDraftForTest(
		t,
		ctx,
		uc,
		fixtures,
		orderItem.ID,
		"PR-PO-PG-CONCURRENT-2-"+postgresFixtures.suffix,
		mustDecimal(t, "6"),
	)

	errs := postPurchaseReceiptsConcurrently(ctx, uc, first.ID, second.ID)
	successes := 0
	rejections := 0
	for _, err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrBadParam):
			rejections++
		default:
			t.Fatalf("unexpected concurrent post error: %v", err)
		}
	}
	if successes != 1 || rejections != 1 {
		t.Fatalf("expected one concurrent receipt to post and one to be rejected, successes=%d rejections=%d", successes, rejections)
	}
	assertDecimalEqual(t, postedPurchaseOrderReceiptQuantityForTest(t, ctx, client, orderItem.ID), "6")

	duplicateOrderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t,
		ctx,
		client,
		fixtures,
		"PG-DUPLICATE-"+postgresFixtures.suffix,
		mustDecimal(t, "10"),
	)
	duplicate := createLinkedPurchaseReceiptDraftForTest(
		t,
		ctx,
		uc,
		fixtures,
		duplicateOrderItem.ID,
		"PR-PO-PG-DUPLICATE-"+postgresFixtures.suffix,
		mustDecimal(t, "10"),
	)
	duplicateErrs := postPurchaseReceiptsConcurrently(ctx, uc, duplicate.ID, duplicate.ID)
	for _, err := range duplicateErrs {
		if err != nil {
			t.Fatalf("concurrent duplicate post should be idempotent: %v", err)
		}
	}
	assertDecimalEqual(t, postedPurchaseOrderReceiptQuantityForTest(t, ctx, client, duplicateOrderItem.ID), "10")
	inboundCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(duplicate.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count duplicate receipt inventory txns failed: %v", err)
	}
	if inboundCount != 1 {
		t.Fatalf("concurrent duplicate post must create one inventory txn, got %d", inboundCount)
	}
}

func postPurchaseReceiptsConcurrently(ctx context.Context, uc *biz.InventoryUsecase, receiptIDs ...int) []error {
	start := make(chan struct{})
	errs := make([]error, len(receiptIDs))
	var wg sync.WaitGroup
	for index, receiptID := range receiptIDs {
		wg.Add(1)
		go func(index, receiptID int) {
			defer wg.Done()
			<-start
			_, errs[index] = uc.PostPurchaseReceipt(ctx, receiptID)
		}(index, receiptID)
	}
	close(start)
	wg.Wait()
	return errs
}

func createPurchaseReceiptQuantityAdjustmentForTest(
	t *testing.T,
	ctx context.Context,
	uc *biz.InventoryUsecase,
	fixtures inventoryTestFixtures,
	receiptItem *biz.PurchaseReceiptItem,
	adjustmentNo string,
	adjustType string,
	quantity decimal.Decimal,
) *biz.PurchaseReceiptAdjustment {
	t.Helper()
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      adjustmentNo,
		PurchaseReceiptID: receiptItem.ReceiptID,
		AdjustedAt:        time.Date(2026, 7, 10, 15, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt quantity adjustment failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            adjustType,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              quantity,
	}); err != nil {
		t.Fatalf("add purchase receipt quantity adjustment item failed: %v", err)
	}
	return adjustment
}

func createApprovedPurchaseOrderItemForReceiptTest(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	fixtures inventoryTestFixtures,
	suffix string,
	quantity decimal.Decimal,
) *ent.PurchaseOrderItem {
	t.Helper()
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-RECEIPT-"+suffix, true)
	order, err := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PO-RECEIPT-" + suffix).
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetPurchaseDate(time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(biz.PurchaseOrderStatusApproved).
		Save(ctx)
	if err != nil {
		t.Fatalf("create approved purchase order failed: %v", err)
	}
	item, err := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(order.ID).
		SetLineNo(1).
		SetMaterialID(fixtures.materialID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(quantity).
		SetLineStatus(biz.PurchaseOrderItemStatusOpen).
		Save(ctx)
	if err != nil {
		t.Fatalf("create purchase order item failed: %v", err)
	}
	return item
}

func createLinkedPurchaseReceiptDraftForTest(
	t *testing.T,
	ctx context.Context,
	uc *biz.InventoryUsecase,
	fixtures inventoryTestFixtures,
	orderItemID int,
	receiptNo string,
	quantity decimal.Decimal,
) *biz.PurchaseReceipt {
	t.Helper()
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    receiptNo,
		SupplierName: "采购供应商",
		ReceivedAt:   time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create linked purchase receipt draft failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:           receipt.ID,
		MaterialID:          fixtures.materialID,
		WarehouseID:         fixtures.warehouseID,
		UnitID:              fixtures.unitID,
		PurchaseOrderItemID: &orderItemID,
		Quantity:            quantity,
	}); err != nil {
		t.Fatalf("add linked purchase receipt item failed: %v", err)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	return receipt
}

func createUnlinkedPurchaseReceiptDraftForTest(
	t *testing.T,
	ctx context.Context,
	uc *biz.InventoryUsecase,
	fixtures inventoryTestFixtures,
	receiptNo string,
	quantity decimal.Decimal,
) *biz.PurchaseReceipt {
	t.Helper()
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    receiptNo,
		SupplierName: "历史快速入库供应商",
		ReceivedAt:   time.Date(2026, 7, 10, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create unlinked purchase receipt draft failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:   receipt.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    quantity,
	}); err != nil {
		t.Fatalf("add unlinked purchase receipt item failed: %v", err)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	return receipt
}

func purchaseReceiptStatusForTest(t *testing.T, ctx context.Context, client *ent.Client, receiptID int) string {
	t.Helper()
	receipt, err := client.PurchaseReceipt.Query().
		Where(purchasereceipt.ID(receiptID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("load purchase receipt status failed: %v", err)
	}
	return receipt.Status
}

func postedPurchaseOrderReceiptQuantityForTest(t *testing.T, ctx context.Context, client *ent.Client, orderItemID int) decimal.Decimal {
	t.Helper()
	items, err := client.PurchaseReceiptItem.Query().
		Where(
			purchasereceiptitem.PurchaseOrderItemID(orderItemID),
			purchasereceiptitem.HasReceiptWith(purchasereceipt.Status(biz.PurchaseReceiptStatusPosted)),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("load posted purchase receipt quantities failed: %v", err)
	}
	total := decimal.Zero
	for _, item := range items {
		total = total.Add(item.Quantity)
	}
	return total
}
