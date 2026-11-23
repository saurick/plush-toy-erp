package data

import (
	"context"
	"errors"
	"fmt"

	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/workflowtask"
)

func receiptClosedForPayable(ctx context.Context, client *ent.Client, receipt *ent.PurchaseReceipt) (bool, error) {
	if receipt.Status != biz.PurchaseReceiptStatusPosted {
		return false, nil
	}
	items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receipt.ID)).All(ctx)
	if err != nil {
		return false, err
	}
	gate, err := evaluatePurchaseReceiptQualityGateInTx(ctx, &inventoryDBTx{client: client}, receipt, items, false)
	if err != nil {
		return false, err
	}
	return gate.UnresolvedLines() == 0 && gate.PostedLines > 0, nil
}

func refreshReceiptPayable(ctx context.Context, client *ent.Client, receiptID, actorID int) error {
	receipt, err := client.PurchaseReceipt.Query().Where(purchasereceipt.ID(receiptID), lockPurchasePayableSourceRow).Only(ctx)
	if err != nil {
		return err
	}
	closed, err := receiptClosedForPayable(ctx, client, receipt)
	if err != nil {
		return err
	}
	return syncReceiptPayable(ctx, client, receipt, closed, actorID)
}

func syncFinanceReceiptPayable(ctx context.Context, client *ent.Client, fact *ent.FinanceFact, actorID int) error {
	if fact.FactType != biz.FinanceFactPayable || optionalStringValueOrEmpty(fact.SourceType) != biz.PurchaseReceiptSourceType || fact.SourceID == nil {
		return nil
	}
	return refreshReceiptPayable(ctx, client, *fact.SourceID, actorID)
}

func syncReceiptPayable(ctx context.Context, client *ent.Client, receipt *ent.PurchaseReceipt, closed bool, actorID int) error {
	path := fmt.Sprintf("/erp/warehouse/inbound?receipt_id=%d", receipt.ID)
	task, err := biz.BuildFulfillmentTask("receipt_payable", receipt.ID, receipt.ReceiptNo, path)
	if err != nil {
		return err
	}
	status, reason := "withdrawn", ""
	if closed && receipt.Status == biz.PurchaseReceiptStatusPosted && receipt.SupplierID != nil {
		fact, err := activePurchasePayable(ctx, client, receipt.ID)
		if err != nil {
			return err
		}
		if fact != nil {
			task.Payload["entry_path"] = fmt.Sprintf("/erp/finance/payables?source_type=%s&source_id=%d&fact_id=%d", biz.PurchaseReceiptSourceType, receipt.ID, fact.ID)
			status = "done"
			if fact.Status == biz.OperationalFactStatusDraft {
				status = "ready"
				task.TaskName = "核对并过账采购应付"
			}
		} else {
			_, err = lockAndReadPurchaseReceiptPayableSource(ctx, client, receipt)
			if err == nil {
				_, err = purchaseReceiptPayableAmount(ctx, client, receipt.ID)
			}
			switch {
			case err == nil:
				vendor, err := client.Supplier.Query().Where(supplier.ID(*receipt.SupplierID), lockPurchasePayableSourceRow).Only(ctx)
				if err != nil {
					return err
				}
				status, reason = payableSupplierAvailability(vendor)
			case errors.Is(err, biz.ErrFinanceFactSourceInvalid), errors.Is(err, biz.ErrFinanceFactSourceAmountInvalid):
				// Incomplete order snapshots, missing prices and a zero net amount cannot be billed.
			default:
				return err
			}
		}
	}
	return syncFulfillmentTaskRecord(ctx, client, task, status, reason, actorID)
}

func syncPurchasePriceTask(ctx context.Context, client *ent.Client, order *ent.PurchaseOrder, actorID int) error {
	status := ""
	if order.LifecycleStatus == biz.PurchaseOrderStatusApproved || order.LifecycleStatus == biz.PurchaseOrderStatusClosed {
		missingLines := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID), purchaseorderitem.UnitPriceIsNil(), purchaseorderitem.LineStatusNEQ(biz.PurchaseOrderItemStatusCanceled))
		ids, err := missingLines.IDs(ctx)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			status = "done"
		} else {
			receipts, err := client.PurchaseReceipt.Query().Where(purchasereceipt.Status(biz.PurchaseReceiptStatusPosted), purchasereceipt.HasItemsWith(purchasereceiptitem.PurchaseOrderItemIDIn(ids...), purchaseReceiptItemPostedPredicate(), purchasereceiptitem.UnitPriceIsNil(), purchasereceiptitem.AmountIsNil())).All(ctx)
			if err != nil {
				return err
			}
			for _, receipt := range receipts {
				closed, err := receiptClosedForPayable(ctx, client, receipt)
				if err != nil {
					return err
				}
				if closed {
					status = "ready"
					break
				}
			}
		}
	}
	return syncFulfillmentTask(ctx, client, "purchase_price", order.ID, order.PurchaseOrderNo, "", status, "", actorID)
}

func refreshOrderPayables(ctx context.Context, client *ent.Client, order *ent.PurchaseOrder, actorID int) error {
	receipts, err := client.PurchaseReceipt.Query().Where(purchasereceipt.Status(biz.PurchaseReceiptStatusPosted), purchasereceipt.HasItemsWith(purchasereceiptitem.HasPurchaseOrderItemWith(purchaseorderitem.PurchaseOrderID(order.ID)))).Order(ent.Asc(purchasereceipt.FieldID)).IDs(ctx)
	if err != nil {
		return err
	}
	for _, id := range receipts {
		if err := refreshReceiptPayable(ctx, client, id, actorID); err != nil {
			return err
		}
	}
	return syncPurchasePriceTask(ctx, client, order, actorID)
}

func payableSupplierAvailability(vendor *ent.Supplier) (string, string) {
	if !vendor.IsActive {
		return "blocked", "供应商已停用，请先核对供应商状态"
	}
	return "ready", ""
}

// The supplier transaction only changes the availability of already eligible
// receipts. Source writers acquire the supplier lock before publishing them.
func syncSupplierPayableTasks(ctx context.Context, client *ent.Client, vendor *ent.Supplier) error {
	tasks, err := client.WorkflowTask.Query().Where(workflowtask.TaskGroup("handoff_receipt_payable"), workflowtask.TaskStatusKeyIn("ready", "blocked"), func(s *sql.Selector) {
		receipts := sql.Dialect(s.Dialect()).Table(purchasereceipt.Table)
		sources := sql.Dialect(s.Dialect()).Select(receipts.C(purchasereceipt.FieldID)).From(receipts).Where(sql.EQ(receipts.C(purchasereceipt.FieldSupplierID), vendor.ID))
		s.Where(sql.In(s.C(workflowtask.FieldSourceID), sources))
	}, lockPurchasePayableSourceRow).Order(ent.Asc(workflowtask.FieldID)).All(ctx)
	if err != nil {
		return err
	}
	status, reason := payableSupplierAvailability(vendor)
	for _, task := range tasks {
		path := fmt.Sprintf("/erp/warehouse/inbound?receipt_id=%d", task.SourceID)
		if task.Payload["entry_path"] != path {
			continue
		}
		if err := syncFulfillmentTask(ctx, client, "receipt_payable", task.SourceID, optionalStringValueOrEmpty(task.SourceNo), path, status, reason, 0); err != nil {
			return err
		}
	}
	return nil
}
