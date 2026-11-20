package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceiptitem"
)

func validatePurchaseReceiptWarehouseScope(ctx context.Context, client *ent.Client, receiptID int, scope *biz.WarehouseDataScope) error {
	if scope == nil {
		return nil
	}
	rows, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receiptID)).All(ctx)
	if err != nil {
		return err
	}
	items := make([]*biz.PurchaseReceiptItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, entPurchaseReceiptItemToBiz(row))
	}
	if err := biz.ValidatePurchaseReceiptWarehouseAccess(*scope, items); err != nil {
		return err
	}
	// Reversal and idempotent reads also use the persisted inventory evidence;
	// a line's warehouse cannot authorize a different original transaction.
	txns, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
		inventorytxn.SourceID(receiptID),
	).All(ctx)
	if err != nil {
		return err
	}
	normalized := biz.NormalizeWarehouseDataScope(*scope)
	for _, txn := range txns {
		if !normalized.Allows(txn.WarehouseID) {
			return biz.ErrDataScopeForbidden
		}
	}
	return nil
}
