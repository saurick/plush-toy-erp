package data

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereturn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_PurchaseCorrectionAggregateCreateAndList(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_correction_api")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-CORRECTION-API", fixtures, stringPtr("PR-CORRECTION-LOT"), decimal.NewFromInt(10))
	receiptItem := postedReceipt.Items[0]
	when := time.Date(2026, 7, 14, 10, 0, 0, 0, time.UTC)

	returnCommand := &biz.PurchaseReturnFromReceiptCreate{
		ReturnNo:          "RET-CORRECTION-API",
		PurchaseReceiptID: postedReceipt.ID,
		ReturnedAt:        when,
		IdempotencyKey:    "return-correction-api",
		Items: []biz.PurchaseReturnFromReceiptItemCreate{{
			PurchaseReceiptItemID: receiptItem.ID,
			Quantity:              decimal.NewFromInt(2),
		}},
	}
	purchaseReturn, err := uc.CreatePurchaseReturnFromReceipt(ctx, returnCommand)
	if err != nil {
		t.Fatalf("create aggregate purchase return failed: %v", err)
	}
	if purchaseReturn.Status != biz.PurchaseReturnStatusDraft || len(purchaseReturn.Items) != 1 || purchaseReturn.Items[0].MaterialID != receiptItem.MaterialID {
		t.Fatalf("unexpected aggregate purchase return: %#v", purchaseReturn)
	}
	replayedReturn, err := uc.CreatePurchaseReturnFromReceipt(ctx, returnCommand)
	if err != nil || replayedReturn.ID != purchaseReturn.ID {
		t.Fatalf("same return intent did not replay original id=%d replay=%#v err=%v", purchaseReturn.ID, replayedReturn, err)
	}
	changedReturn := *returnCommand
	changedReturn.Items = append([]biz.PurchaseReturnFromReceiptItemCreate(nil), returnCommand.Items...)
	changedReturn.Items[0].Quantity = decimal.NewFromInt(3)
	if _, err := uc.CreatePurchaseReturnFromReceipt(ctx, &changedReturn); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed return intent error=%v, want ErrIdempotencyConflict", err)
	}
	returns, total, err := uc.ListPurchaseReturns(ctx, biz.PurchaseReturnFilter{
		Status:            biz.PurchaseReturnStatusDraft,
		PurchaseReceiptID: postedReceipt.ID,
		MaterialID:        receiptItem.MaterialID,
		WarehouseID:       receiptItem.WarehouseID,
		LotID:             *receiptItem.LotID,
		DateFrom:          &when,
		DateTo:            &when,
		Limit:             10,
	})
	if err != nil || total != 1 || len(returns) != 1 || returns[0].ID != purchaseReturn.ID {
		t.Fatalf("list aggregate purchase returns = items=%#v total=%d err=%v", returns, total, err)
	}

	adjustmentCommand := &biz.PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo:      "ADJ-CORRECTION-API",
		PurchaseReceiptID: postedReceipt.ID,
		AdjustedAt:        when,
		IdempotencyKey:    "adjustment-correction-api",
		Items: []biz.PurchaseReceiptAdjustmentFromReceiptItemCreate{{
			PurchaseReceiptItemID: receiptItem.ID,
			AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
			Quantity:              decimal.NewFromInt(3),
		}},
	}
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, adjustmentCommand)
	if err != nil {
		t.Fatalf("create aggregate purchase receipt adjustment failed: %v", err)
	}
	if adjustment.Status != biz.PurchaseReceiptAdjustmentStatusDraft || len(adjustment.Items) != 1 || adjustment.Items[0].WarehouseID != receiptItem.WarehouseID {
		t.Fatalf("unexpected aggregate adjustment: %#v", adjustment)
	}
	replayedAdjustment, err := uc.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, adjustmentCommand)
	if err != nil || replayedAdjustment.ID != adjustment.ID {
		t.Fatalf("same adjustment intent did not replay original id=%d replay=%#v err=%v", adjustment.ID, replayedAdjustment, err)
	}
	changedAdjustment := *adjustmentCommand
	changedAdjustment.Items = append([]biz.PurchaseReceiptAdjustmentFromReceiptItemCreate(nil), adjustmentCommand.Items...)
	changedAdjustment.Items[0].Quantity = decimal.NewFromInt(4)
	if _, err := uc.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, &changedAdjustment); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed adjustment intent error=%v, want ErrIdempotencyConflict", err)
	}
	adjustments, total, err := uc.ListPurchaseReceiptAdjustments(ctx, biz.PurchaseReceiptAdjustmentFilter{
		Status:            biz.PurchaseReceiptAdjustmentStatusDraft,
		PurchaseReceiptID: postedReceipt.ID,
		AdjustType:        biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:        receiptItem.MaterialID,
		WarehouseID:       receiptItem.WarehouseID,
		LotID:             *receiptItem.LotID,
		DateFrom:          &when,
		DateTo:            &when,
		Limit:             10,
	})
	if err != nil || total != 1 || len(adjustments) != 1 || adjustments[0].ID != adjustment.ID {
		t.Fatalf("list aggregate adjustments = items=%#v total=%d err=%v", adjustments, total, err)
	}
}

func TestInventoryRepo_PurchaseCorrectionAggregateCreateRollsBackHeaderOnInvalidLine(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_correction_rollback")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-CORRECTION-ROLLBACK", fixtures, stringPtr("PR-CORRECTION-ROLLBACK-LOT"), decimal.NewFromInt(10))
	receiptItem := postedReceipt.Items[0]
	receiptID := postedReceipt.ID
	invalidReceiptItemID := 999999

	_, err := repo.CreatePurchaseReturnWithItems(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:               "RET-CORRECTION-ROLLBACK",
		PurchaseReceiptID:      &receiptID,
		SupplierName:           postedReceipt.SupplierName,
		ReturnedAt:             time.Now(),
		IdempotencyKey:         "return-correction-rollback",
		IdempotencyPayloadHash: strings.Repeat("a", 64),
	}, []*biz.PurchaseReturnItemCreate{
		{
			PurchaseReceiptItemID: &receiptItem.ID,
			MaterialID:            receiptItem.MaterialID,
			WarehouseID:           receiptItem.WarehouseID,
			UnitID:                receiptItem.UnitID,
			LotID:                 receiptItem.LotID,
			Quantity:              decimal.NewFromInt(1),
		},
		{
			PurchaseReceiptItemID: &invalidReceiptItemID,
			MaterialID:            receiptItem.MaterialID,
			WarehouseID:           receiptItem.WarehouseID,
			UnitID:                receiptItem.UnitID,
			LotID:                 receiptItem.LotID,
			Quantity:              decimal.NewFromInt(1),
		},
	})
	if err == nil {
		t.Fatal("invalid aggregate return line must fail")
	}
	if count := client.PurchaseReturn.Query().Where(purchasereturn.ReturnNo("RET-CORRECTION-ROLLBACK")).CountX(ctx); count != 0 {
		t.Fatalf("failed aggregate return left %d headers", count)
	}

	_, err = repo.CreatePurchaseReceiptAdjustmentWithItems(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:           "ADJ-CORRECTION-ROLLBACK",
		PurchaseReceiptID:      postedReceipt.ID,
		AdjustedAt:             time.Now(),
		IdempotencyKey:         "adjustment-correction-rollback",
		IdempotencyPayloadHash: strings.Repeat("b", 64),
	}, []*biz.PurchaseReceiptAdjustmentItemCreate{{
		PurchaseReceiptItemID: invalidReceiptItemID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            receiptItem.MaterialID,
		WarehouseID:           receiptItem.WarehouseID,
		UnitID:                receiptItem.UnitID,
		LotID:                 receiptItem.LotID,
		Quantity:              decimal.NewFromInt(1),
	}})
	if err == nil {
		t.Fatal("invalid aggregate adjustment line must fail")
	}
	if count := client.PurchaseReceiptAdjustment.Query().Where(purchasereceiptadjustment.AdjustmentNo("ADJ-CORRECTION-ROLLBACK")).CountX(ctx); count != 0 {
		t.Fatalf("failed aggregate adjustment left %d headers", count)
	}
}
