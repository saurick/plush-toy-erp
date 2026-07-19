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
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/go-kratos/kratos/v2/log"
)

func TestPurchaseReceiptCancelRequiresActiveAdjustmentsToBeCancelledFirst(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_receipt_adjustment_cancel_order")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	posted := createAndPostPurchaseReceipt(
		t,
		ctx,
		uc,
		"PR-ADJUSTMENT-CANCEL-ORDER",
		fixtures,
		nil,
		mustDecimal(t, "10"),
	)
	adjustment := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		uc,
		fixtures,
		posted.Items[0],
		"PRA-CANCEL-ORDER",
		biz.PurchaseReceiptAdjustmentQuantityDecrease,
		mustDecimal(t, "1"),
	)
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID); !errors.Is(err, biz.ErrPurchaseReceiptCorrectionDependency) {
		t.Fatalf("receipt with a draft adjustment must not be cancelled, got %v", err)
	}
	if status := purchaseReceiptStatusForTest(t, ctx, client, posted.ID); status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("draft dependency rejection must keep receipt POSTED, got %s", status)
	}
	if status := purchaseReceiptAdjustmentStatusForTest(t, ctx, client, adjustment.ID); status != biz.PurchaseReceiptAdjustmentStatusDraft {
		t.Fatalf("draft dependency rejection changed adjustment, got %s", status)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("post purchase receipt adjustment failed: %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID); !errors.Is(err, biz.ErrPurchaseReceiptCorrectionDependency) {
		t.Fatalf("receipt with a posted adjustment must not be cancelled, got %v", err)
	}
	if status := purchaseReceiptStatusForTest(t, ctx, client, posted.ID); status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("rejected receipt cancellation must keep POSTED status, got %s", status)
	}
	if status := purchaseReceiptAdjustmentStatusForTest(t, ctx, client, adjustment.ID); status != biz.PurchaseReceiptAdjustmentStatusPosted {
		t.Fatalf("rejected receipt cancellation must keep adjustment POSTED, got %s", status)
	}

	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("cancel purchase receipt adjustment failed: %v", err)
	}
	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID)
	if err != nil {
		t.Fatalf("receipt cancellation should succeed after its adjustment is cancelled: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected cancelled receipt, got %s", cancelled.Status)
	}
}

func TestPurchaseReceiptPostgresConcurrentAutomaticDraftGeneration(t *testing.T) {
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
		"PG-AUTO-DRAFT-"+postgresFixtures.suffix,
		mustDecimal(t, "10"),
	)

	start := make(chan struct{})
	receiptNos := []string{
		"PR-PO-PG-AUTO-DRAFT-" + postgresFixtures.suffix + "-1",
		"PR-PO-PG-AUTO-DRAFT-" + postgresFixtures.suffix + "-2",
	}
	results := make([]purchaseReceiptDraftResult, 2)
	var wg sync.WaitGroup
	for index := range results {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			results[index].receipt, results[index].err = uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
				PurchaseOrderID: orderItem.PurchaseOrderID,
				ReceiptNo:       receiptNos[index],
				WarehouseID:     fixtures.warehouseID,
				ReceivedAt:      time.Date(2026, 7, 10, 16+index, 0, 0, 0, time.UTC),
			})
		}(index)
	}
	close(start)
	wg.Wait()

	successes := 0
	rejections := 0
	for _, result := range results {
		switch {
		case result.err == nil:
			successes++
			if result.receipt == nil || len(result.receipt.Items) != 1 {
				t.Fatalf("successful automatic draft must contain one line, got %#v", result.receipt)
			}
			assertDecimalEqual(t, result.receipt.Items[0].Quantity, "10")
		case errors.Is(result.err, biz.ErrBadParam):
			rejections++
		default:
			t.Fatalf("unexpected concurrent automatic draft error: %v", result.err)
		}
	}
	if successes != 1 || rejections != 1 {
		t.Fatalf("expected one automatic draft and one reserved-quantity rejection, successes=%d rejections=%d", successes, rejections)
	}

	draftItems, err := client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.PurchaseOrderItemID(orderItem.ID)).
		All(ctx)
	if err != nil {
		t.Fatalf("load generated receipt draft lines failed: %v", err)
	}
	if len(draftItems) != 1 {
		t.Fatalf("concurrent automatic generation must persist one reserved draft line, got %d", len(draftItems))
	}
	assertDecimalEqual(t, draftItems[0].Quantity, "10")
	receiptCount, err := client.PurchaseReceipt.Query().
		Where(purchasereceipt.ReceiptNoIn(receiptNos...)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count concurrent automatic receipt drafts failed: %v", err)
	}
	if receiptCount != 1 {
		t.Fatalf("rejected automatic generation must roll back its receipt header, got %d headers", receiptCount)
	}
}

func TestPurchaseReceiptPostgresConcurrentCommandReplayReturnsOneFactSet(t *testing.T) {
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
		"PG-COMMAND-IDEMPOTENCY-"+postgresFixtures.suffix,
		mustDecimal(t, "10"),
	)
	input := biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       "PR-PG-COMMAND-IDEMPOTENCY-" + postgresFixtures.suffix,
		WarehouseID:     fixtures.warehouseID,
		IdempotencyKey:  "process:pg:" + postgresFixtures.suffix + ":purchase-receipt-create",
	}

	start := make(chan struct{})
	results := make([]purchaseReceiptDraftResult, 2)
	var wg sync.WaitGroup
	for index := range results {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			next := input
			results[index].receipt, results[index].err = uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &next)
		}(index)
	}
	close(start)
	wg.Wait()

	for index, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent command replay %d failed: %v", index, result.err)
		}
		if result.receipt == nil || len(result.receipt.Items) != 1 || len(result.receipt.QualityInspections) != 1 {
			t.Fatalf("concurrent command replay %d returned incomplete fact set: %#v", index, result.receipt)
		}
	}
	if results[0].receipt.ID != results[1].receipt.ID ||
		results[0].receipt.Items[0].ID != results[1].receipt.Items[0].ID ||
		results[0].receipt.QualityInspections[0].ID != results[1].receipt.QualityInspections[0].ID {
		t.Fatalf("concurrent command replays returned different fact refs: %#v %#v", results[0].receipt, results[1].receipt)
	}
	receiptCount, err := client.PurchaseReceipt.Query().
		Where(purchasereceipt.IdempotencyKey(input.IdempotencyKey)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres command receipt facts failed: %v", err)
	}
	if receiptCount != 1 {
		t.Fatalf("concurrent command replay must persist one receipt fact, got %d", receiptCount)
	}
}

func TestPurchaseReceiptPostgresConcurrentCommandPayloadConflictPersistsOneFactSet(t *testing.T) {
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
	firstOrderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t, ctx, client, fixtures, "PG-COMMAND-CONFLICT-A-"+postgresFixtures.suffix, mustDecimal(t, "3"),
	)
	secondOrderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t, ctx, client, fixtures, "PG-COMMAND-CONFLICT-B-"+postgresFixtures.suffix, mustDecimal(t, "4"),
	)
	key := "process:pg:" + postgresFixtures.suffix + ":purchase-receipt-conflict"
	inputs := []biz.PurchaseReceiptFromPurchaseOrderCreate{
		{
			PurchaseOrderID: firstOrderItem.PurchaseOrderID,
			ReceiptNo:       "PR-PG-COMMAND-CONFLICT-A-" + postgresFixtures.suffix,
			WarehouseID:     fixtures.warehouseID,
			IdempotencyKey:  key,
		},
		{
			PurchaseOrderID: secondOrderItem.PurchaseOrderID,
			ReceiptNo:       "PR-PG-COMMAND-CONFLICT-B-" + postgresFixtures.suffix,
			WarehouseID:     fixtures.warehouseID,
			IdempotencyKey:  key,
		},
	}

	start := make(chan struct{})
	results := make([]purchaseReceiptDraftResult, len(inputs))
	var wg sync.WaitGroup
	for index := range inputs {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			results[index].receipt, results[index].err = uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &inputs[index])
		}(index)
	}
	close(start)
	wg.Wait()

	successes := 0
	conflicts := 0
	for _, result := range results {
		switch {
		case result.err == nil:
			successes++
			if result.receipt == nil || len(result.receipt.Items) != 1 || len(result.receipt.QualityInspections) != 1 {
				t.Fatalf("successful conflicting command returned incomplete facts: %#v", result.receipt)
			}
		case errors.Is(result.err, biz.ErrIdempotencyConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent idempotency conflict result: %v", result.err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected one command success and one payload conflict, successes=%d conflicts=%d", successes, conflicts)
	}
	receiptCount, err := client.PurchaseReceipt.Query().Where(purchasereceipt.IdempotencyKey(key)).Count(ctx)
	if err != nil {
		t.Fatalf("count postgres conflicting command facts failed: %v", err)
	}
	if receiptCount != 1 {
		t.Fatalf("concurrent payload conflict must persist one receipt fact, got %d", receiptCount)
	}
}

func TestPurchaseReceiptPostgresAdjustmentPostAndReceiptCancelSerialize(t *testing.T) {
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
	posted := createAndPostPurchaseReceipt(
		t,
		ctx,
		uc,
		"PR-PG-ADJUST-CANCEL-RACE-"+postgresFixtures.suffix,
		fixtures,
		nil,
		mustDecimal(t, "10"),
	)
	adjustment := createPurchaseReceiptQuantityAdjustmentForTest(
		t,
		ctx,
		uc,
		fixtures,
		posted.Items[0],
		"PRA-PG-ADJUST-CANCEL-RACE-"+postgresFixtures.suffix,
		biz.PurchaseReceiptAdjustmentQuantityDecrease,
		mustDecimal(t, "1"),
	)

	start := make(chan struct{})
	var postErr error
	var cancelErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, postErr = uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID)
	}()
	go func() {
		defer wg.Done()
		<-start
		_, cancelErr = uc.CancelPostedPurchaseReceipt(ctx, posted.ID)
	}()
	close(start)
	wg.Wait()

	if postErr != nil {
		t.Fatalf("existing draft adjustment must remain postable: %v", postErr)
	}
	if !errors.Is(cancelErr, biz.ErrPurchaseReceiptCorrectionDependency) {
		t.Fatalf("active adjustment must make concurrent receipt cancellation reject, got %v", cancelErr)
	}
	if status := purchaseReceiptStatusForTest(t, ctx, client, posted.ID); status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("active adjustment outcome must keep receipt POSTED, got %s", status)
	}
	if status := purchaseReceiptAdjustmentStatusForTest(t, ctx, client, adjustment.ID); status != biz.PurchaseReceiptAdjustmentStatusPosted {
		t.Fatalf("expected adjustment POSTED, got %s", status)
	}
}

type purchaseReceiptDraftResult struct {
	receipt *biz.PurchaseReceipt
	err     error
}

func purchaseReceiptAdjustmentStatusForTest(t *testing.T, ctx context.Context, client *ent.Client, adjustmentID int) string {
	t.Helper()
	adjustment, err := client.PurchaseReceiptAdjustment.Query().
		Where(purchasereceiptadjustment.ID(adjustmentID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("load purchase receipt adjustment status failed: %v", err)
	}
	return adjustment.Status
}
