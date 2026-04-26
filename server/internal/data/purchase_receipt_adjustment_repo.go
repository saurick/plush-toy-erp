package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

func (r *inventoryRepo) CreatePurchaseReceiptAdjustmentDraft(ctx context.Context, in *biz.PurchaseReceiptAdjustmentCreate) (*biz.PurchaseReceiptAdjustment, error) {
	receipt, err := r.data.postgres.PurchaseReceipt.Get(ctx, in.PurchaseReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if receipt.Status != biz.PurchaseReceiptStatusPosted {
		return nil, biz.ErrBadParam
	}
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
	row, err := r.data.postgres.PurchaseReceiptAdjustment.Create().
		SetAdjustmentNo(in.AdjustmentNo).
		SetPurchaseReceiptID(in.PurchaseReceiptID).
		SetNillableBusinessRecordID(in.BusinessRecordID).
		SetNillableReason(in.Reason).
		SetStatus(biz.PurchaseReceiptAdjustmentStatusDraft).
		SetAdjustedAt(in.AdjustedAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptAdjustmentToBiz(row, nil), nil
}

func (r *inventoryRepo) AddPurchaseReceiptAdjustmentItem(ctx context.Context, in *biz.PurchaseReceiptAdjustmentItemCreate) (*biz.PurchaseReceiptAdjustmentItem, error) {
	adjustment, err := r.data.postgres.PurchaseReceiptAdjustment.Get(ctx, in.AdjustmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptAdjustmentNotFound
		}
		return nil, err
	}
	if adjustment.Status != biz.PurchaseReceiptAdjustmentStatusDraft {
		return nil, biz.ErrBadParam
	}
	if err := validatePurchaseReceiptAdjustmentItemReferences(ctx, r.data.postgres, adjustment.PurchaseReceiptID, in); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(in.AdjustmentID).
		SetPurchaseReceiptItemID(in.PurchaseReceiptItemID).
		SetAdjustType(in.AdjustType).
		SetMaterialID(in.MaterialID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableSourceLineNo(in.SourceLineNo).
		SetNillableCorrectionGroup(in.CorrectionGroup).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptAdjustmentItemToBiz(row), nil
}

func (r *inventoryRepo) PostPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*biz.PurchaseReceiptAdjustment, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceiptAdjustment(ctx, tx, adjustmentID); err != nil {
		return nil, err
	}
	adjustment, err := tx.client.PurchaseReceiptAdjustment.Get(ctx, adjustmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptAdjustmentNotFound
		}
		return nil, err
	}
	if adjustment.Status == biz.PurchaseReceiptAdjustmentStatusPosted {
		out, err := purchaseReceiptAdjustmentWithItems(ctx, tx.client, adjustment)
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	if adjustment.Status != biz.PurchaseReceiptAdjustmentStatusDraft {
		return nil, biz.ErrBadParam
	}

	items, err := tx.client.PurchaseReceiptAdjustmentItem.Query().
		Where(purchasereceiptadjustmentitem.AdjustmentID(adjustment.ID)).
		Order(ent.Asc(purchasereceiptadjustmentitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	for _, item := range items {
		if err := validatePurchaseReceiptAdjustmentItemReferences(ctx, tx.client, adjustment.PurchaseReceiptID, entPurchaseReceiptAdjustmentItemToCreate(item)); err != nil {
			return nil, err
		}
	}
	if err := validatePurchaseReceiptAdjustmentCorrectionGroups(items); err != nil {
		return nil, err
	}
	if err := validatePurchaseReceiptAdjustmentEffectiveQuantities(ctx, tx, adjustment.ID, items); err != nil {
		return nil, err
	}
	for _, item := range items {
		txnType, direction, err := purchaseReceiptAdjustmentInventoryEffect(item.AdjustType)
		if err != nil {
			return nil, err
		}
		sourceID := adjustment.ID
		sourceLineID := item.ID
		_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      item.MaterialID,
			WarehouseID:    item.WarehouseID,
			LotID:          item.LotID,
			TxnType:        txnType,
			Direction:      direction,
			Quantity:       item.Quantity,
			UnitID:         item.UnitID,
			SourceType:     biz.PurchaseReceiptAdjustmentSourceType,
			SourceID:       &sourceID,
			SourceLineID:   &sourceLineID,
			IdempotencyKey: biz.PurchaseReceiptAdjustmentIdempotencyKey(adjustment.ID, item.ID, txnType),
			OccurredAt:     adjustment.AdjustedAt,
		})
		if err != nil {
			return nil, err
		}
	}
	now := time.Now()
	if err := updatePurchaseReceiptAdjustmentPosted(ctx, tx, adjustment.ID, now); err != nil {
		return nil, err
	}
	adjustment, err = tx.client.PurchaseReceiptAdjustment.Get(ctx, adjustment.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReceiptAdjustmentWithItems(ctx, tx.client, adjustment)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) CancelPostedPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*biz.PurchaseReceiptAdjustment, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceiptAdjustment(ctx, tx, adjustmentID); err != nil {
		return nil, err
	}
	adjustment, err := tx.client.PurchaseReceiptAdjustment.Get(ctx, adjustmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptAdjustmentNotFound
		}
		return nil, err
	}
	if adjustment.Status == biz.PurchaseReceiptAdjustmentStatusCancelled {
		out, err := purchaseReceiptAdjustmentWithItems(ctx, tx.client, adjustment)
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	if adjustment.Status != biz.PurchaseReceiptAdjustmentStatusPosted {
		return nil, biz.ErrBadParam
	}

	items, err := tx.client.PurchaseReceiptAdjustmentItem.Query().
		Where(purchasereceiptadjustmentitem.AdjustmentID(adjustment.ID)).
		Order(ent.Asc(purchasereceiptadjustmentitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if err := validatePurchaseReceiptAdjustmentCancelEffectiveQuantities(ctx, tx, adjustment.ID, items); err != nil {
		return nil, err
	}
	for _, item := range items {
		txnType, _, err := purchaseReceiptAdjustmentInventoryEffect(item.AdjustType)
		if err != nil {
			return nil, err
		}
		original, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.PurchaseReceiptAdjustmentIdempotencyKey(adjustment.ID, item.ID, txnType))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryTxnNotFound
			}
			return nil, err
		}
		sourceID := adjustment.ID
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
			SourceType:      biz.PurchaseReceiptAdjustmentSourceType,
			SourceID:        &sourceID,
			SourceLineID:    &sourceLineID,
			IdempotencyKey:  biz.PurchaseReceiptAdjustmentReversalIdempotencyKey(adjustment.ID, item.ID, original.ID),
			ReversalOfTxnID: &reversalOf,
			OccurredAt:      time.Now(),
		})
		if err != nil {
			return nil, err
		}
	}
	if err := updatePurchaseReceiptAdjustmentCancelled(ctx, tx, adjustment.ID); err != nil {
		return nil, err
	}
	adjustment, err = tx.client.PurchaseReceiptAdjustment.Get(ctx, adjustment.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReceiptAdjustmentWithItems(ctx, tx.client, adjustment)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) GetPurchaseReceiptAdjustment(ctx context.Context, id int) (*biz.PurchaseReceiptAdjustment, error) {
	adjustment, err := r.data.postgres.PurchaseReceiptAdjustment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptAdjustmentNotFound
		}
		return nil, err
	}
	return purchaseReceiptAdjustmentWithItems(ctx, r.data.postgres, adjustment)
}

func validatePurchaseReceiptAdjustmentItemReferences(ctx context.Context, client *ent.Client, receiptID int, in *biz.PurchaseReceiptAdjustmentItemCreate) error {
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
	if in.LotID != nil {
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
	}
	receiptItem, err := client.PurchaseReceiptItem.Get(ctx, in.PurchaseReceiptItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptItemNotFound
		}
		return err
	}
	if receiptItem.ReceiptID != receiptID {
		return biz.ErrBadParam
	}
	receipt, err := client.PurchaseReceipt.Get(ctx, receiptItem.ReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptNotFound
		}
		return err
	}
	if receipt.Status != biz.PurchaseReceiptStatusPosted ||
		receiptItem.MaterialID != in.MaterialID ||
		receiptItem.UnitID != in.UnitID {
		return biz.ErrBadParam
	}

	switch in.AdjustType {
	case biz.PurchaseReceiptAdjustmentQuantityIncrease,
		biz.PurchaseReceiptAdjustmentQuantityDecrease:
		if receiptItem.WarehouseID != in.WarehouseID || !sameOptionalInt(receiptItem.LotID, in.LotID) {
			return biz.ErrBadParam
		}
	case biz.PurchaseReceiptAdjustmentLotCorrectionOut:
		if receiptItem.WarehouseID != in.WarehouseID || !sameOptionalInt(receiptItem.LotID, in.LotID) {
			return biz.ErrBadParam
		}
	case biz.PurchaseReceiptAdjustmentLotCorrectionIn:
		if receiptItem.WarehouseID != in.WarehouseID {
			return biz.ErrBadParam
		}
	case biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut:
		if receiptItem.WarehouseID != in.WarehouseID || !sameOptionalInt(receiptItem.LotID, in.LotID) {
			return biz.ErrBadParam
		}
	case biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn:
		if !sameOptionalInt(receiptItem.LotID, in.LotID) {
			return biz.ErrBadParam
		}
	default:
		return biz.ErrBadParam
	}
	return nil
}

func validatePurchaseReceiptAdjustmentCorrectionGroups(items []*ent.PurchaseReceiptAdjustmentItem) error {
	groups := make(map[string][]*ent.PurchaseReceiptAdjustmentItem)
	for _, item := range items {
		switch item.AdjustType {
		case biz.PurchaseReceiptAdjustmentLotCorrectionOut,
			biz.PurchaseReceiptAdjustmentLotCorrectionIn,
			biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut,
			biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn:
			if item.CorrectionGroup == nil || strings.TrimSpace(*item.CorrectionGroup) == "" {
				return biz.ErrBadParam
			}
			key := strings.TrimSpace(*item.CorrectionGroup)
			groups[key] = append(groups[key], item)
		}
	}
	for _, groupItems := range groups {
		if len(groupItems) != 2 {
			return biz.ErrBadParam
		}
		a, b := groupItems[0], groupItems[1]
		if a.PurchaseReceiptItemID != b.PurchaseReceiptItemID ||
			a.MaterialID != b.MaterialID ||
			a.UnitID != b.UnitID ||
			a.Quantity.Cmp(b.Quantity) != 0 {
			return biz.ErrBadParam
		}
		switch {
		case isAdjustmentPair(a, b, biz.PurchaseReceiptAdjustmentLotCorrectionOut, biz.PurchaseReceiptAdjustmentLotCorrectionIn):
			if a.WarehouseID != b.WarehouseID || sameOptionalInt(a.LotID, b.LotID) {
				return biz.ErrBadParam
			}
		case isAdjustmentPair(a, b, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn):
			if !sameOptionalInt(a.LotID, b.LotID) || a.WarehouseID == b.WarehouseID {
				return biz.ErrBadParam
			}
		default:
			return biz.ErrBadParam
		}
	}
	return nil
}

func validatePurchaseReceiptAdjustmentEffectiveQuantities(ctx context.Context, tx *inventoryDBTx, adjustmentID int, items []*ent.PurchaseReceiptAdjustmentItem) error {
	currentDeltaByReceiptItem := make(map[int]decimal.Decimal)
	seenReceiptItems := make(map[int]struct{})
	for _, item := range items {
		seenReceiptItems[item.PurchaseReceiptItemID] = struct{}{}
		switch item.AdjustType {
		case biz.PurchaseReceiptAdjustmentQuantityIncrease:
			currentDeltaByReceiptItem[item.PurchaseReceiptItemID] = currentDeltaByReceiptItem[item.PurchaseReceiptItemID].Add(item.Quantity)
		case biz.PurchaseReceiptAdjustmentQuantityDecrease:
			currentDeltaByReceiptItem[item.PurchaseReceiptItemID] = currentDeltaByReceiptItem[item.PurchaseReceiptItemID].Sub(item.Quantity)
		}
	}
	if len(seenReceiptItems) == 0 {
		return nil
	}

	receiptItemIDs := make([]int, 0, len(seenReceiptItems))
	for receiptItemID := range seenReceiptItems {
		receiptItemIDs = append(receiptItemIDs, receiptItemID)
	}
	sort.Ints(receiptItemIDs)
	if err := lockPurchaseReceiptItems(ctx, tx, receiptItemIDs); err != nil {
		return err
	}

	for _, receiptItemID := range receiptItemIDs {
		effectiveQty, err := effectivePurchaseReceiptItemQuantity(ctx, tx.client, receiptItemID, adjustmentID, currentDeltaByReceiptItem[receiptItemID])
		if err != nil {
			return err
		}
		if effectiveQty.Cmp(decimal.Zero) < 0 {
			return biz.ErrBadParam
		}
		returnedQty, err := postedPurchaseReturnQuantityByReceiptItem(ctx, tx.client, 0, receiptItemID)
		if err != nil {
			return err
		}
		if effectiveQty.Cmp(returnedQty) < 0 {
			return biz.ErrBadParam
		}
	}
	return nil
}

func validatePurchaseReceiptAdjustmentCancelEffectiveQuantities(ctx context.Context, tx *inventoryDBTx, adjustmentID int, items []*ent.PurchaseReceiptAdjustmentItem) error {
	seenReceiptItems := make(map[int]struct{})
	for _, item := range items {
		seenReceiptItems[item.PurchaseReceiptItemID] = struct{}{}
	}
	if len(seenReceiptItems) == 0 {
		return nil
	}

	receiptItemIDs := make([]int, 0, len(seenReceiptItems))
	for receiptItemID := range seenReceiptItems {
		receiptItemIDs = append(receiptItemIDs, receiptItemID)
	}
	sort.Ints(receiptItemIDs)
	if err := lockPurchaseReceiptItems(ctx, tx, receiptItemIDs); err != nil {
		return err
	}

	for _, receiptItemID := range receiptItemIDs {
		effectiveQty, err := effectivePurchaseReceiptItemQuantity(ctx, tx.client, receiptItemID, adjustmentID, decimal.Zero)
		if err != nil {
			return err
		}
		returnedQty, err := postedPurchaseReturnQuantityByReceiptItem(ctx, tx.client, 0, receiptItemID)
		if err != nil {
			return err
		}
		if effectiveQty.Cmp(returnedQty) < 0 {
			return biz.ErrBadParam
		}
	}
	return nil
}

func effectivePurchaseReceiptItemQuantity(ctx context.Context, client *ent.Client, receiptItemID, excludeAdjustmentID int, currentDelta decimal.Decimal) (decimal.Decimal, error) {
	receiptItem, err := client.PurchaseReceiptItem.Get(ctx, receiptItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return decimal.Zero, biz.ErrPurchaseReceiptItemNotFound
		}
		return decimal.Zero, err
	}
	effectiveQty := receiptItem.Quantity
	postedItems, err := client.PurchaseReceiptAdjustmentItem.Query().
		Where(
			purchasereceiptadjustmentitem.PurchaseReceiptItemID(receiptItemID),
			purchasereceiptadjustmentitem.HasPurchaseReceiptAdjustmentWith(
				purchasereceiptadjustment.Status(biz.PurchaseReceiptAdjustmentStatusPosted),
			),
		).
		All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	for _, item := range postedItems {
		if excludeAdjustmentID > 0 && item.AdjustmentID == excludeAdjustmentID {
			continue
		}
		switch item.AdjustType {
		case biz.PurchaseReceiptAdjustmentQuantityIncrease:
			effectiveQty = effectiveQty.Add(item.Quantity)
		case biz.PurchaseReceiptAdjustmentQuantityDecrease:
			effectiveQty = effectiveQty.Sub(item.Quantity)
		}
	}
	return effectiveQty.Add(currentDelta), nil
}

func postedPurchaseReturnQuantityByReceiptItem(ctx context.Context, client *ent.Client, excludeReturnID, receiptItemID int) (decimal.Decimal, error) {
	predicates := []predicate.PurchaseReturnItem{
		purchasereturnitem.PurchaseReceiptItemID(receiptItemID),
		purchasereturnitem.HasPurchaseReturnWith(
			purchasereturn.Status(biz.PurchaseReturnStatusPosted),
		),
	}
	if excludeReturnID > 0 {
		predicates = append(predicates, purchasereturnitem.ReturnIDNEQ(excludeReturnID))
	}
	postedItems, err := client.PurchaseReturnItem.Query().
		Where(predicates...).
		All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	quantity := decimal.Zero
	for _, item := range postedItems {
		quantity = quantity.Add(item.Quantity)
	}
	return quantity, nil
}

func isAdjustmentPair(a, b *ent.PurchaseReceiptAdjustmentItem, outType, inType string) bool {
	return (a.AdjustType == outType && b.AdjustType == inType) ||
		(a.AdjustType == inType && b.AdjustType == outType)
}

func purchaseReceiptAdjustmentInventoryEffect(adjustType string) (string, int, error) {
	switch adjustType {
	case biz.PurchaseReceiptAdjustmentQuantityIncrease,
		biz.PurchaseReceiptAdjustmentLotCorrectionIn,
		biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn:
		return biz.InventoryTxnAdjustIn, 1, nil
	case biz.PurchaseReceiptAdjustmentQuantityDecrease,
		biz.PurchaseReceiptAdjustmentLotCorrectionOut,
		biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut:
		return biz.InventoryTxnAdjustOut, -1, nil
	default:
		return "", 0, biz.ErrBadParam
	}
}

func entPurchaseReceiptAdjustmentItemToCreate(row *ent.PurchaseReceiptAdjustmentItem) *biz.PurchaseReceiptAdjustmentItemCreate {
	if row == nil {
		return nil
	}
	return &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          row.AdjustmentID,
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		AdjustType:            row.AdjustType,
		MaterialID:            row.MaterialID,
		WarehouseID:           row.WarehouseID,
		UnitID:                row.UnitID,
		LotID:                 row.LotID,
		Quantity:              row.Quantity,
		SourceLineNo:          row.SourceLineNo,
		CorrectionGroup:       row.CorrectionGroup,
		Note:                  row.Note,
	}
}

func updatePurchaseReceiptAdjustmentPosted(ctx context.Context, tx *inventoryDBTx, adjustmentID int, postedAt time.Time) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	query := fmt.Sprintf(`UPDATE purchase_receipt_adjustments SET status = %s, posted_at = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2], p[3])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReceiptAdjustmentStatusPosted, postedAt, time.Now(), adjustmentID)
	return err
}

func updatePurchaseReceiptAdjustmentCancelled(ctx context.Context, tx *inventoryDBTx, adjustmentID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE purchase_receipt_adjustments SET status = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReceiptAdjustmentStatusCancelled, time.Now(), adjustmentID)
	return err
}

func lockPurchaseReceiptAdjustment(ctx context.Context, tx *inventoryDBTx, adjustmentID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM purchase_receipt_adjustments WHERE id = $1 FOR UPDATE`, adjustmentID).Scan(&id); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrPurchaseReceiptAdjustmentNotFound
		}
		return err
	}
	return nil
}

func purchaseReceiptAdjustmentWithItems(ctx context.Context, client *ent.Client, adjustment *ent.PurchaseReceiptAdjustment) (*biz.PurchaseReceiptAdjustment, error) {
	items, err := client.PurchaseReceiptAdjustmentItem.Query().
		Where(purchasereceiptadjustmentitem.AdjustmentID(adjustment.ID)).
		Order(ent.Asc(purchasereceiptadjustmentitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptAdjustmentToBiz(adjustment, items), nil
}

func entPurchaseReceiptAdjustmentToBiz(row *ent.PurchaseReceiptAdjustment, items []*ent.PurchaseReceiptAdjustmentItem) *biz.PurchaseReceiptAdjustment {
	if row == nil {
		return nil
	}
	out := &biz.PurchaseReceiptAdjustment{
		ID:                row.ID,
		AdjustmentNo:      row.AdjustmentNo,
		PurchaseReceiptID: row.PurchaseReceiptID,
		BusinessRecordID:  row.BusinessRecordID,
		Reason:            row.Reason,
		Status:            row.Status,
		AdjustedAt:        row.AdjustedAt,
		PostedAt:          row.PostedAt,
		Note:              row.Note,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
	if len(items) > 0 {
		out.Items = make([]*biz.PurchaseReceiptAdjustmentItem, 0, len(items))
		for _, item := range items {
			out.Items = append(out.Items, entPurchaseReceiptAdjustmentItemToBiz(item))
		}
	}
	return out
}

func entPurchaseReceiptAdjustmentItemToBiz(row *ent.PurchaseReceiptAdjustmentItem) *biz.PurchaseReceiptAdjustmentItem {
	if row == nil {
		return nil
	}
	return &biz.PurchaseReceiptAdjustmentItem{
		ID:                    row.ID,
		AdjustmentID:          row.AdjustmentID,
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		AdjustType:            row.AdjustType,
		MaterialID:            row.MaterialID,
		WarehouseID:           row.WarehouseID,
		UnitID:                row.UnitID,
		LotID:                 row.LotID,
		Quantity:              row.Quantity,
		SourceLineNo:          row.SourceLineNo,
		CorrectionGroup:       row.CorrectionGroup,
		Note:                  row.Note,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}
