package data

import (
	"context"
	"errors"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchaserejectiondisposition"

	"entgo.io/ent/dialect/sql"
	"github.com/shopspring/decimal"
)

// Each immutable receipt line owns one IN transaction. The header records
// whether inbound has started; ledger evidence identifies the lines actually
// received when other lines are pending inspection or supplier disposition.
func purchaseReceiptItemPostedPredicate() predicate.PurchaseReceiptItem {
	return func(s *sql.Selector) {
		t := sql.Table(inventorytxn.Table).As("receipt_line_inbound")
		s.Where(sql.Exists(sql.Select(t.C(inventorytxn.FieldID)).From(t).Where(sql.And(
			sql.EQ(t.C(inventorytxn.FieldSourceType), biz.PurchaseReceiptSourceType),
			sql.EQ(t.C(inventorytxn.FieldTxnType), biz.InventoryTxnIn),
			sql.EQ(t.C(inventorytxn.FieldDirection), 1),
			sql.ColumnsEQ(t.C(inventorytxn.FieldSourceID), s.C(purchasereceiptitem.FieldReceiptID)),
			sql.ColumnsEQ(t.C(inventorytxn.FieldSourceLineID), s.C(purchasereceiptitem.FieldID)),
		))))
	}
}

func purchaseReceiptLineIsPosted(ctx context.Context, client *ent.Client, itemID int) (bool, error) {
	return client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ID(itemID), purchaseReceiptItemPostedPredicate()).Exist(ctx)
}

func purchaseReceiptItemAwaitingInboundPredicate() predicate.PurchaseReceiptItem {
	return func(s *sql.Selector) {
		purchasereceiptitem.Not(purchaseReceiptItemPostedPredicate())(s)
		t := sql.Table(purchaserejectiondisposition.Table).As("receipt_line_disposal")
		quantity := sql.Select(sql.Sum(t.C(purchaserejectiondisposition.FieldQuantity))).From(t).Where(sql.And(
			sql.ColumnsEQ(t.C(purchaserejectiondisposition.FieldPurchaseReceiptItemID), s.C(purchasereceiptitem.FieldID)),
			sql.EQ(t.C(purchaserejectiondisposition.FieldStatus), biz.PurchaseRejectionStatusPosted),
		))
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("COALESCE((").Join(quantity).WriteString("), 0) < ").Ident(s.C(purchasereceiptitem.FieldQuantity))
		}))
	}
}

func purchaseReceiptPostedLines(ctx context.Context, client *ent.Client, receiptID int) (map[int]*ent.InventoryTxn, error) {
	rows, err := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(receiptID), inventorytxn.TxnType(biz.InventoryTxnIn), inventorytxn.Direction(1)).All(ctx)
	if err != nil {
		return nil, err
	}
	result := make(map[int]*ent.InventoryTxn, len(rows))
	for _, row := range rows {
		if row.SourceLineID == nil || result[*row.SourceLineID] != nil {
			return nil, biz.ErrIdempotencyConflict
		}
		result[*row.SourceLineID] = row
	}
	return result, nil
}

func purchaseReceiptDisposedQuantities(ctx context.Context, client *ent.Client, receiptID int) (map[int]decimal.Decimal, error) {
	rows, err := client.PurchaseRejectionDisposition.Query().Where(purchaserejectiondisposition.PurchaseReceiptID(receiptID), purchaserejectiondisposition.Status(biz.PurchaseRejectionStatusPosted)).All(ctx)
	if err != nil {
		return nil, err
	}
	result := map[int]decimal.Decimal{}
	for _, row := range rows {
		result[row.PurchaseReceiptItemID] = result[row.PurchaseReceiptItemID].Add(row.Quantity)
	}
	return result, nil
}

func projectPurchaseReceiptInbound(ctx context.Context, client *ent.Client, receipt *ent.PurchaseReceipt, items []*ent.PurchaseReceiptItem, out *biz.PurchaseReceipt) error {
	posted, err := purchaseReceiptPostedLines(ctx, client, receipt.ID)
	if err != nil {
		return err
	}
	out.PostedLines = len(posted)
	prices, err := purchaseReceiptConfirmedPrices(ctx, client, items)
	if err != nil {
		return err
	}
	for i, item := range items {
		out.Items[i].Posted = posted[item.ID] != nil
		if item.UnitPrice == nil && item.Amount == nil {
			amount, price, err := confirmedPurchaseReceiptItemMoney(item, prices)
			if err == nil {
				out.Items[i].UnitPrice, out.Items[i].Amount, out.Items[i].PriceConfirmedLater = &price, &amount, true
			} else if !errors.Is(err, biz.ErrFinanceFactSourceAmountInvalid) {
				return err
			}
		}
	}
	if receipt.Status == biz.PurchaseReceiptStatusCancelled || len(items) == 0 {
		return nil
	}
	gate, err := evaluatePurchaseReceiptQualityGateInTx(ctx, &inventoryDBTx{client: client}, receipt, items, false)
	if err != nil {
		return err
	}
	out.PendingInboundLines = gate.UnresolvedLines()
	out.CanPost = len(gate.ReadyLineIDs) > 0
	disposed := make(map[int]bool, len(gate.DisposedLineIDs))
	for _, id := range gate.DisposedLineIDs {
		disposed[id] = true
	}
	for _, item := range out.Items {
		item.RejectionDisposed = disposed[item.ID]
	}
	return nil
}
