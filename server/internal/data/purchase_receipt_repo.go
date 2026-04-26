package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceiptitem"

	"entgo.io/ent/dialect"
)

func (r *inventoryRepo) CreatePurchaseReceiptDraft(ctx context.Context, in *biz.PurchaseReceiptCreate) (*biz.PurchaseReceipt, error) {
	if in.BusinessRecordID != nil {
		if _, err := r.data.postgres.BusinessRecord.Query().
			Where(
				businessrecord.ID(*in.BusinessRecordID),
				businessrecord.DeletedAtIsNil(),
			).
			Only(ctx); err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrBadParam
			}
			return nil, err
		}
	}
	row, err := r.data.postgres.PurchaseReceipt.Create().
		SetReceiptNo(in.ReceiptNo).
		SetNillableBusinessRecordID(in.BusinessRecordID).
		SetSupplierName(in.SupplierName).
		SetStatus(biz.PurchaseReceiptStatusDraft).
		SetReceivedAt(in.ReceivedAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptToBiz(row, nil), nil
}

func (r *inventoryRepo) AddPurchaseReceiptItem(ctx context.Context, in *biz.PurchaseReceiptItemCreate) (*biz.PurchaseReceiptItem, error) {
	receipt, err := r.data.postgres.PurchaseReceipt.Get(ctx, in.ReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft {
		return nil, biz.ErrBadParam
	}
	if err := validatePurchaseReceiptItemReferences(ctx, r.data.postgres, in); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.PurchaseReceiptItem.Create().
		SetReceiptID(in.ReceiptID).
		SetMaterialID(in.MaterialID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetNillableLotNo(in.LotNo).
		SetQuantity(in.Quantity).
		SetNillableUnitPrice(in.UnitPrice).
		SetNillableAmount(in.Amount).
		SetNillableSourceLineNo(in.SourceLineNo).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptItemToBiz(row), nil
}

func (r *inventoryRepo) PostPurchaseReceipt(ctx context.Context, receiptID int) (*biz.PurchaseReceipt, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, receiptID); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if receipt.Status == biz.PurchaseReceiptStatusPosted {
		out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft {
		return nil, biz.ErrBadParam
	}

	items, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	for _, item := range items {
		lotID, err := ensurePurchaseReceiptItemLot(ctx, tx, receipt, item)
		if err != nil {
			return nil, err
		}
		sourceID := receipt.ID
		sourceLineID := item.ID
		_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      item.MaterialID,
			WarehouseID:    item.WarehouseID,
			LotID:          lotID,
			TxnType:        biz.InventoryTxnIn,
			Direction:      1,
			Quantity:       item.Quantity,
			UnitID:         item.UnitID,
			SourceType:     biz.PurchaseReceiptSourceType,
			SourceID:       &sourceID,
			SourceLineID:   &sourceLineID,
			IdempotencyKey: biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID),
			OccurredAt:     receipt.ReceivedAt,
		})
		if err != nil {
			return nil, err
		}
	}
	now := time.Now()
	if err := updatePurchaseReceiptPosted(ctx, tx, receipt.ID, now); err != nil {
		return nil, err
	}
	receipt, err = tx.client.PurchaseReceipt.Get(ctx, receipt.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*biz.PurchaseReceipt, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, receiptID); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if receipt.Status == biz.PurchaseReceiptStatusCancelled {
		out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	if receipt.Status != biz.PurchaseReceiptStatusPosted {
		return nil, biz.ErrBadParam
	}
	items, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		original, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryTxnNotFound
			}
			return nil, err
		}
		sourceID := receipt.ID
		sourceLineID := item.ID
		reversalOf := original.ID
		_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:     original.SubjectType,
			SubjectID:       original.SubjectID,
			WarehouseID:     original.WarehouseID,
			LotID:           original.LotID,
			TxnType:         biz.InventoryTxnReversal,
			Direction:       -original.Direction,
			Quantity:        original.Quantity,
			UnitID:          original.UnitID,
			SourceType:      biz.PurchaseReceiptSourceType,
			SourceID:        &sourceID,
			SourceLineID:    &sourceLineID,
			IdempotencyKey:  biz.PurchaseReceiptReversalIdempotencyKey(receipt.ID, item.ID),
			ReversalOfTxnID: &reversalOf,
			OccurredAt:      time.Now(),
		})
		if err != nil {
			return nil, err
		}
	}
	if err := updatePurchaseReceiptCancelled(ctx, tx, receipt.ID); err != nil {
		return nil, err
	}
	receipt, err = tx.client.PurchaseReceipt.Get(ctx, receipt.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) GetPurchaseReceipt(ctx context.Context, id int) (*biz.PurchaseReceipt, error) {
	receipt, err := r.data.postgres.PurchaseReceipt.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	return purchaseReceiptWithItems(ctx, r.data.postgres, receipt)
}

func (r *inventoryRepo) applyInventoryTxnAndUpdateBalanceInTx(ctx context.Context, tx *inventoryDBTx, in *biz.InventoryTxnCreate) (*biz.InventoryTxnApplyResult, error) {
	existing, err := tx.client.InventoryTxn.Query().
		Where(inventorytxn.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if err == nil {
		balance, balanceErr := getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), inventoryBalanceKeyFromEntTxn(existing))
		if balanceErr != nil && !ent.IsNotFound(balanceErr) {
			return nil, balanceErr
		}
		return &biz.InventoryTxnApplyResult{
			Txn:              entInventoryTxnToBiz(existing),
			Balance:          entInventoryBalanceToBiz(balance),
			IdempotentReplay: true,
		}, nil
	}
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if err := validateInventoryTxnReferences(ctx, tx.client, in); err != nil {
		return nil, err
	}
	row, err := createInventoryTxn(ctx, tx.client.InventoryTxn.Create(), in)
	if err != nil {
		return nil, err
	}
	balance, err := applyInventoryBalanceDelta(ctx, tx, in)
	if err != nil {
		return nil, err
	}
	return &biz.InventoryTxnApplyResult{
		Txn:     entInventoryTxnToBiz(row),
		Balance: entInventoryBalanceToBiz(balance),
	}, nil
}

func validatePurchaseReceiptItemReferences(ctx context.Context, client *ent.Client, in *biz.PurchaseReceiptItemCreate) error {
	if _, err := client.Material.Get(ctx, in.MaterialID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	if _, err := client.Warehouse.Get(ctx, in.WarehouseID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	if _, err := client.Unit.Get(ctx, in.UnitID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	if in.LotID == nil {
		return nil
	}
	lot, err := client.InventoryLot.Get(ctx, *in.LotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != in.MaterialID {
		return biz.ErrBadParam
	}
	return nil
}

func ensurePurchaseReceiptItemLot(ctx context.Context, tx *inventoryDBTx, receipt *ent.PurchaseReceipt, item *ent.PurchaseReceiptItem) (*int, error) {
	client := tx.client
	if item.LotID != nil {
		lot, err := client.InventoryLot.Get(ctx, *item.LotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryLotNotFound
			}
			return nil, err
		}
		if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != item.MaterialID {
			return nil, biz.ErrBadParam
		}
		return item.LotID, nil
	}
	if item.LotNo == nil || *item.LotNo == "" {
		return nil, nil
	}
	lot, err := client.InventoryLot.Query().
		Where(
			inventorylot.SubjectType(biz.InventorySubjectMaterial),
			inventorylot.SubjectID(item.MaterialID),
			inventorylot.LotNo(*item.LotNo),
		).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if ent.IsNotFound(err) {
		if err := insertMaterialLotIgnoreConflict(ctx, tx, item.MaterialID, *item.LotNo, receipt.ReceivedAt); err != nil {
			return nil, err
		}
		lot, err = client.InventoryLot.Query().
			Where(
				inventorylot.SubjectType(biz.InventorySubjectMaterial),
				inventorylot.SubjectID(item.MaterialID),
				inventorylot.LotNo(*item.LotNo),
			).
			Only(ctx)
		if err != nil {
			return nil, err
		}
	}
	if item.LotID == nil || *item.LotID != lot.ID {
		if err := updatePurchaseReceiptItemLotID(ctx, tx, item.ID, lot.ID); err != nil {
			return nil, err
		}
		item.LotID = &lot.ID
	}
	return &lot.ID, nil
}

func insertMaterialLotIgnoreConflict(ctx context.Context, tx *inventoryDBTx, materialID int, lotNo string, receivedAt time.Time) error {
	now := time.Now()
	p := inventorySQLPlaceholders(tx.dialect, 7)
	query := fmt.Sprintf(
		`INSERT INTO inventory_lots (subject_type, subject_id, lot_no, status, received_at, created_at, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, lot_no) DO NOTHING`,
		p[0], p[1], p[2], p[3], p[4], p[5], p[6],
	)
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.InventorySubjectMaterial, materialID, lotNo, biz.InventoryLotActive, receivedAt, now, now)
	return err
}

func updatePurchaseReceiptItemLotID(ctx context.Context, tx *inventoryDBTx, itemID, lotID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE purchase_receipt_items SET lot_id = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	_, err := tx.sqlTx.ExecContext(ctx, query, lotID, time.Now(), itemID)
	return err
}

func updatePurchaseReceiptPosted(ctx context.Context, tx *inventoryDBTx, receiptID int, postedAt time.Time) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	query := fmt.Sprintf(`UPDATE purchase_receipts SET status = %s, posted_at = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2], p[3])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReceiptStatusPosted, postedAt, time.Now(), receiptID)
	return err
}

func updatePurchaseReceiptCancelled(ctx context.Context, tx *inventoryDBTx, receiptID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE purchase_receipts SET status = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReceiptStatusCancelled, time.Now(), receiptID)
	return err
}

func lockPurchaseReceipt(ctx context.Context, tx *inventoryDBTx, receiptID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM purchase_receipts WHERE id = $1 FOR UPDATE`, receiptID).Scan(&id); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrPurchaseReceiptNotFound
		}
		return err
	}
	return nil
}

func purchaseReceiptWithItems(ctx context.Context, client *ent.Client, receipt *ent.PurchaseReceipt) (*biz.PurchaseReceipt, error) {
	items, err := client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptToBiz(receipt, items), nil
}

func entPurchaseReceiptToBiz(row *ent.PurchaseReceipt, items []*ent.PurchaseReceiptItem) *biz.PurchaseReceipt {
	if row == nil {
		return nil
	}
	out := &biz.PurchaseReceipt{
		ID:               row.ID,
		ReceiptNo:        row.ReceiptNo,
		BusinessRecordID: row.BusinessRecordID,
		SupplierName:     row.SupplierName,
		Status:           row.Status,
		ReceivedAt:       row.ReceivedAt,
		PostedAt:         row.PostedAt,
		Note:             row.Note,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
	if len(items) > 0 {
		out.Items = make([]*biz.PurchaseReceiptItem, 0, len(items))
		for _, item := range items {
			out.Items = append(out.Items, entPurchaseReceiptItemToBiz(item))
		}
	}
	return out
}

func entPurchaseReceiptItemToBiz(row *ent.PurchaseReceiptItem) *biz.PurchaseReceiptItem {
	if row == nil {
		return nil
	}
	return &biz.PurchaseReceiptItem{
		ID:           row.ID,
		ReceiptID:    row.ReceiptID,
		MaterialID:   row.MaterialID,
		WarehouseID:  row.WarehouseID,
		UnitID:       row.UnitID,
		LotID:        row.LotID,
		LotNo:        row.LotNo,
		Quantity:     row.Quantity,
		UnitPrice:    row.UnitPrice,
		Amount:       row.Amount,
		SourceLineNo: row.SourceLineNo,
		Note:         row.Note,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}
