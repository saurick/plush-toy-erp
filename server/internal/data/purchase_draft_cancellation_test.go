package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
)

func TestInventoryRepo_PurchaseReceiptDraftCancellationSettlesQualityAndPreparedLots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt_draft_cancel")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-DRAFT-CANCEL-SETTLE",
		SupplierName: "草稿退出供应商",
		ReceivedAt:   time.Date(2026, 7, 18, 8, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft purchase receipt failed: %v", err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("PR-DRAFT-CANCEL-LOT"),
		Quantity:       mustDecimal(t, "10"),
		IdempotencyKey: "test:purchase-receipt:draft-cancel:item",
	})
	if err != nil || item.LotID == nil {
		t.Fatalf("add draft purchase receipt item = %#v, err=%v", item, err)
	}
	initial := client.QualityInspection.Query().Where(
		qualityinspection.PurchaseReceiptID(receipt.ID),
	).OnlyX(ctx)
	decision := approximateQualityInspectionDecision(initial.ID, biz.QualityInspectionResultPass)
	decision.DecisionNote = stringPtr("终态质检历史必须保留")
	if passed, err := uc.PassQualityInspection(ctx, decision); err != nil || passed.Status != biz.QualityInspectionStatusPassed {
		t.Fatalf("pass initial incoming inspection = %#v, err=%v", passed, err)
	}
	additional, err := uc.CreateQualityInspectionFromPurchaseReceipt(ctx, &biz.QualityInspectionFromPurchaseReceiptCreate{
		InspectionNo:          "QI-PR-DRAFT-CANCEL-APPEND",
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: item.ID,
	})
	if err != nil || additional.Status != biz.QualityInspectionStatusDraft {
		t.Fatalf("create appended incoming inspection = %#v, err=%v", additional, err)
	}
	submittedDraft, err := uc.CreateQualityInspectionFromPurchaseReceipt(ctx, &biz.QualityInspectionFromPurchaseReceiptCreate{
		InspectionNo:          "QI-PR-DRAFT-CANCEL-APPEND-SUBMITTED",
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: item.ID,
	})
	if err != nil {
		t.Fatalf("create second appended incoming inspection failed: %v", err)
	}
	submitted, err := uc.SubmitQualityInspection(ctx, submittedDraft.ID)
	if err != nil || submitted.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("submit appended incoming inspection = %#v, err=%v", submitted, err)
	}

	beforeTxnCount, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
		inventorytxn.SourceID(receipt.ID),
	).Count(ctx)
	if err != nil || beforeTxnCount != 0 {
		t.Fatalf("draft receipt inventory txn count before cancellation=%d, err=%v", beforeTxnCount, err)
	}
	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID)
	if err != nil || cancelled.Status != biz.PurchaseReceiptStatusCancelled || cancelled.PostedAt != nil {
		t.Fatalf("cancel draft purchase receipt = %#v, err=%v", cancelled, err)
	}

	rows, err := client.QualityInspection.Query().Where(
		qualityinspection.PurchaseReceiptID(receipt.ID),
	).All(ctx)
	if err != nil || len(rows) != 3 {
		t.Fatalf("persisted incoming inspections=%d, err=%v", len(rows), err)
	}
	for _, row := range rows {
		if row.ID == initial.ID {
			if row.Status != biz.QualityInspectionStatusPassed || row.Result == nil || *row.Result != biz.QualityInspectionResultPass || row.DecisionNote == nil || *row.DecisionNote != "终态质检历史必须保留" {
				t.Fatalf("terminal inspection history changed: %#v", row)
			}
			continue
		}
		if row.Status != biz.QualityInspectionStatusCancelled {
			t.Fatalf("unfinished inspection %d status=%s, want CANCELLED", row.ID, row.Status)
		}
	}
	lot := client.InventoryLot.GetX(ctx, *item.LotID)
	if lot.Status != biz.InventoryLotDisabled {
		t.Fatalf("prepared lot status=%s, want DISABLED", lot.Status)
	}
	balances, err := client.InventoryBalance.Query().Where(inventorybalance.LotID(*item.LotID)).All(ctx)
	if err != nil {
		t.Fatalf("query prepared lot balances failed: %v", err)
	}
	for _, balance := range balances {
		if !balance.Quantity.IsZero() {
			t.Fatalf("prepared lot balance=%s, want exact zero", balance.Quantity)
		}
	}
	afterTxnCount, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
		inventorytxn.SourceID(receipt.ID),
	).Count(ctx)
	if err != nil || afterTxnCount != 0 {
		t.Fatalf("draft receipt cancellation inventory txn count=%d, err=%v", afterTxnCount, err)
	}
	if replay, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil || replay.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("repeat draft receipt cancellation = %#v, err=%v", replay, err)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled draft receipt must not post, got %v", err)
	}
}

func TestInventoryRepo_PurchaseReceiptDraftCancellationRequiresExactZeroPreparedLotBalance(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt_draft_cancel_balance")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-DRAFT-CANCEL-NONZERO",
		SupplierName: "草稿退出供应商",
		ReceivedAt:   time.Date(2026, 7, 18, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft purchase receipt failed: %v", err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("PR-DRAFT-CANCEL-NONZERO-LOT"),
		Quantity:       mustDecimal(t, "10"),
		IdempotencyKey: "test:purchase-receipt:draft-cancel:nonzero",
	})
	if err != nil || item.LotID == nil {
		t.Fatalf("add draft purchase receipt item = %#v, err=%v", item, err)
	}
	if _, err := client.InventoryBalance.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetLotID(*item.LotID).
		SetUnitID(fixtures.unitID).
		SetQuantity(mustDecimal(t, "0.000001")).
		Save(ctx); err != nil {
		t.Fatalf("create non-zero prepared lot balance fixture failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("non-zero prepared lot balance must reject draft cancellation, got %v", err)
	}
	persisted := client.PurchaseReceipt.GetX(ctx, receipt.ID)
	if persisted.Status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("receipt status after rejected cancellation=%s, want DRAFT", persisted.Status)
	}
	lot := client.InventoryLot.GetX(ctx, *item.LotID)
	if lot.Status != biz.InventoryLotHold {
		t.Fatalf("lot status after rejected cancellation=%s, want HOLD", lot.Status)
	}
	inspection := client.QualityInspection.Query().Where(
		qualityinspection.PurchaseReceiptID(receipt.ID),
	).OnlyX(ctx)
	if inspection.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("inspection status after rejected cancellation=%s, want SUBMITTED", inspection.Status)
	}
}

func TestInventoryRepo_DraftPurchaseCorrectionsCancelWithoutStockAndReleaseReceipt(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_correction_draft_cancel")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-CORRECTION-DRAFT-CANCEL", fixtures, stringPtr("PR-CORRECTION-DRAFT-CANCEL-LOT"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "PR-RETURN-DRAFT-CANCEL", postedReceipt.ID, receiptItem, fixtures, mustDecimal(t, "2"))
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PR-ADJUST-DRAFT-CANCEL", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, receiptItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "1"), nil)

	cancelledReturn, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID)
	if err != nil || cancelledReturn.Status != biz.PurchaseReturnStatusCancelled || cancelledReturn.PostedAt != nil {
		t.Fatalf("cancel draft purchase return = %#v, err=%v", cancelledReturn, err)
	}
	cancelledAdjustment, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil || cancelledAdjustment.Status != biz.PurchaseReceiptAdjustmentStatusCancelled || cancelledAdjustment.PostedAt != nil {
		t.Fatalf("cancel draft receipt adjustment = %#v, err=%v", cancelledAdjustment, err)
	}
	for sourceType, sourceID := range map[string]int{
		biz.PurchaseReturnSourceType:            purchaseReturn.ID,
		biz.PurchaseReceiptAdjustmentSourceType: adjustment.ID,
	} {
		count, err := client.InventoryTxn.Query().Where(
			inventorytxn.SourceType(sourceType),
			inventorytxn.SourceID(sourceID),
		).Count(ctx)
		if err != nil || count != 0 {
			t.Fatalf("draft cancellation source=%s id=%d inventory txn count=%d, err=%v", sourceType, sourceID, count, err)
		}
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat cancel draft purchase return failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat cancel draft receipt adjustment failed: %v", err)
	}
	cancelledReceipt, err := uc.CancelPostedPurchaseReceipt(ctx, postedReceipt.ID)
	if err != nil || cancelledReceipt.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("cancel receipt after draft corrections settled = %#v, err=%v", cancelledReceipt, err)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get receipt balance after parent cancellation failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "0")
}

func TestInventoryRepo_DraftPurchaseReceiptCancellationReleasesPurchaseOrderSettlement(t *testing.T) {
	ctx := context.Background()
	for _, targetStatus := range []string{biz.PurchaseOrderStatusClosed, biz.PurchaseOrderStatusCanceled} {
		t.Run(targetStatus, func(t *testing.T) {
			data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt_parent_"+targetStatus)
			fixtures := createInventoryTestFixtures(t, ctx, client)
			orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "DRAFT-CANCEL-"+targetStatus, mustDecimal(t, "5"))
			inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
			purchaseOrderUC := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
			receipt, err := inventoryUC.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
				PurchaseOrderID: orderItem.PurchaseOrderID,
				ReceiptNo:       "PR-PO-DRAFT-CANCEL-" + targetStatus,
				WarehouseID:     fixtures.warehouseID,
				ReceivedAt:      time.Date(2026, 7, 18, 11, 0, 0, 0, time.UTC),
			})
			if err != nil {
				t.Fatalf("create purchase-order receipt draft failed: %v", err)
			}
			switch targetStatus {
			case biz.PurchaseOrderStatusClosed:
				if _, err := purchaseOrderUC.ClosePurchaseOrder(ctx, orderItem.PurchaseOrderID); !errors.Is(err, biz.ErrPurchaseOrderCloseDraftReceiptDependency) {
					t.Fatalf("draft receipt must block purchase order close, got %v", err)
				}
			case biz.PurchaseOrderStatusCanceled:
				if _, err := purchaseOrderUC.CancelPurchaseOrder(ctx, orderItem.PurchaseOrderID); !errors.Is(err, biz.ErrPurchaseOrderCancelReceiptDependency) {
					t.Fatalf("draft receipt must block purchase order cancellation, got %v", err)
				}
			}
			if _, err := inventoryUC.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
				t.Fatalf("cancel purchase receipt draft failed: %v", err)
			}
			var settled *biz.PurchaseOrder
			switch targetStatus {
			case biz.PurchaseOrderStatusClosed:
				settled, err = purchaseOrderUC.ClosePurchaseOrder(ctx, orderItem.PurchaseOrderID)
			case biz.PurchaseOrderStatusCanceled:
				settled, err = purchaseOrderUC.CancelPurchaseOrder(ctx, orderItem.PurchaseOrderID)
			}
			if err != nil || settled.LifecycleStatus != targetStatus {
				t.Fatalf("settle purchase order after receipt cancellation = %#v, err=%v", settled, err)
			}
		})
	}
}
