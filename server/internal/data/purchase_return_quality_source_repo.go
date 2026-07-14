package data

import (
	"context"

	"server/internal/biz"
	corestatus "server/internal/core/status"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchasereturn"

	"github.com/shopspring/decimal"
)

var _ biz.PurchaseReturnFromQualityInspectionRepo = (*inventoryRepo)(nil)

func (r *inventoryRepo) CreatePurchaseReturnFromQualityInspection(
	ctx context.Context,
	in *biz.PurchaseReturnFromQualityInspectionCreate,
) (*biz.PurchaseReturn, error) {
	if in == nil || in.QualityInspectionID <= 0 {
		return nil, biz.ErrBadParam
	}
	preview, err := r.data.postgres.QualityInspection.Get(ctx, in.QualityInspectionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if preview.PurchaseReceiptID == nil || *preview.PurchaseReceiptID <= 0 {
		return nil, biz.ErrPurchaseReturnQualitySourceInvalid
	}
	receiptID := *preview.PurchaseReceiptID
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, receiptID); err != nil {
		return nil, err
	}
	inspection, err := getLockedQualityInspection(ctx, tx, in.QualityInspectionID)
	if err != nil {
		return nil, err
	}
	if inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
		return nil, biz.ErrPurchaseReturnQualitySourceState
	}
	if inspection.PurchaseReceiptID == nil || inspection.PurchaseReceiptItemID == nil || inspection.MaterialID == nil ||
		*inspection.PurchaseReceiptID != receiptID ||
		inspection.SourceType == nil || *inspection.SourceType != biz.QualityInspectionSourcePurchaseReceipt ||
		inspection.SourceID == nil || *inspection.SourceID != *inspection.PurchaseReceiptID ||
		inspection.InspectionType == nil || *inspection.InspectionType != biz.QualityInspectionTypeIncoming ||
		inspection.SubjectType == nil || *inspection.SubjectType != biz.QualityInspectionSubjectMaterial ||
		inspection.SubjectID == nil || *inspection.SubjectID != *inspection.MaterialID {
		return nil, biz.ErrPurchaseReturnQualitySourceInvalid
	}
	receiptItemID := *inspection.PurchaseReceiptItemID
	if err := lockPurchaseReceiptItems(ctx, tx, []int{receiptItemID}); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if !corestatus.IsPurchaseReceiptPosted(receipt.Status) {
		return nil, biz.ErrPurchaseReturnQualitySourceState
	}
	item, err := tx.client.PurchaseReceiptItem.Get(ctx, receiptItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptItemNotFound
		}
		return nil, err
	}
	if item.ReceiptID != receipt.ID || item.MaterialID != *inspection.MaterialID || item.WarehouseID != inspection.WarehouseID ||
		item.LotID == nil || *item.LotID != inspection.InventoryLotID {
		return nil, biz.ErrPurchaseReturnQualitySourceInvalid
	}
	lot, err := tx.client.InventoryLot.Get(ctx, inspection.InventoryLotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryLotNotFound
		}
		return nil, err
	}
	if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != item.MaterialID || lot.Status != biz.InventoryLotRejected {
		return nil, biz.ErrPurchaseReturnQualitySourceState
	}

	qualityID := inspection.ID
	reason := in.Reason
	header := &biz.PurchaseReturnCreate{
		ReturnNo:               in.ReturnNo,
		PurchaseReceiptID:      &receiptID,
		QualityInspectionID:    &qualityID,
		SupplierName:           receipt.SupplierName,
		ReturnReason:           &reason,
		ReturnedAt:             in.ReturnedAt,
		Note:                   in.Note,
		IdempotencyKey:         in.IdempotencyKey,
		IdempotencyPayloadHash: in.IdempotencyPayloadHash,
	}
	if replayed, found, err := resolvePurchaseReturnReplay(ctx, tx.client, header); err != nil || found {
		if err != nil {
			return nil, err
		}
		if replayed.QualityInspectionID == nil || *replayed.QualityInspectionID != inspection.ID {
			return nil, biz.ErrIdempotencyConflict
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replayed, nil
	}
	_, err = tx.client.PurchaseReturn.Query().Where(
		purchasereturn.QualityInspectionID(inspection.ID),
		purchasereturn.StatusNEQ(biz.PurchaseReturnStatusCancelled),
	).First(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if err == nil {
		return nil, biz.ErrPurchaseReturnQualitySourceConflict
	}
	effectiveQty, err := effectivePurchaseReceiptItemQuantity(ctx, tx.client, item.ID, 0, decimal.Zero)
	if err != nil {
		return nil, err
	}
	alreadyReturned, err := postedPurchaseReturnQuantityByReceiptItem(ctx, tx.client, 0, item.ID)
	if err != nil {
		return nil, err
	}
	if alreadyReturned.Add(in.Quantity).Cmp(effectiveQty) > 0 {
		return nil, biz.ErrPurchaseReturnQuantityExceeded
	}

	row, err := tx.client.PurchaseReturn.Create().
		SetReturnNo(in.ReturnNo).
		SetPurchaseReceiptID(receipt.ID).
		SetQualityInspectionID(inspection.ID).
		SetSupplierName(receipt.SupplierName).
		SetReturnReason(in.Reason).
		SetStatus(biz.PurchaseReturnStatusDraft).
		SetReturnedAt(in.ReturnedAt).
		SetIdempotencyKey(in.IdempotencyKey).
		SetIdempotencyPayloadHash(in.IdempotencyPayloadHash).
		SetIdempotencyItemCount(1).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		originalErr := err
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		if replayed, found, replayErr := resolvePurchaseReturnReplay(ctx, r.data.postgres, header); replayErr != nil {
			return nil, replayErr
		} else if found {
			if replayed.QualityInspectionID == nil || *replayed.QualityInspectionID != inspection.ID {
				return nil, biz.ErrIdempotencyConflict
			}
			return replayed, nil
		}
		if active, activeErr := r.data.postgres.PurchaseReturn.Query().Where(
			purchasereturn.QualityInspectionID(inspection.ID),
			purchasereturn.StatusNEQ(biz.PurchaseReturnStatusCancelled),
		).First(ctx); activeErr == nil && active != nil {
			return nil, biz.ErrPurchaseReturnQualitySourceConflict
		} else if activeErr != nil && !ent.IsNotFound(activeErr) {
			return nil, activeErr
		}
		return nil, originalErr
	}
	var amount *decimal.Decimal
	if item.UnitPrice != nil {
		calculated := item.UnitPrice.Mul(in.Quantity)
		amount = &calculated
	}
	if _, err := tx.client.PurchaseReturnItem.Create().
		SetReturnID(row.ID).
		SetPurchaseReceiptItemID(item.ID).
		SetMaterialID(item.MaterialID).
		SetWarehouseID(item.WarehouseID).
		SetUnitID(item.UnitID).
		SetLotID(*item.LotID).
		SetQuantity(in.Quantity).
		SetNillableUnitPrice(item.UnitPrice).
		SetNillableAmount(amount).
		SetNillableSourceLineNo(item.SourceLineNo).
		SetNillableNote(in.Note).
		Save(ctx); err != nil {
		return nil, err
	}
	out, err := purchaseReturnWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}
