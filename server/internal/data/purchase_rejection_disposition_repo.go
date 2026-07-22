package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchaserejectiondisposition"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

var _ biz.PurchaseRejectionDispositionRepo = (*inventoryRepo)(nil)

func (r *inventoryRepo) CreatePurchaseRejectionDisposition(ctx context.Context, in *biz.PurchaseRejectionDispositionCreate, intentHash string) (*biz.PurchaseRejectionDisposition, error) {
	if in == nil || intentHash == "" {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := r.resolvePurchaseRejectionReplay(ctx, r.data.postgres, in, intentHash); err != nil || found {
		return replay, err
	}
	preview, err := r.data.postgres.QualityInspection.Get(ctx, in.QualityInspectionID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrQualityInspectionNotFound
	}
	if err != nil {
		return nil, err
	}
	if preview.PurchaseReceiptID == nil {
		return nil, biz.ErrPurchaseRejectionSourceInvalid
	}
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockPurchaseReceipt(ctx, tx, *preview.PurchaseReceiptID); err != nil {
		return nil, err
	}
	inspection, err := getLockedQualityInspection(ctx, tx, in.QualityInspectionID)
	if err != nil {
		return nil, err
	}
	receipt, item, err := validatePurchaseRejectionSource(ctx, tx.client, inspection, in.Quantity)
	if err != nil {
		return nil, err
	}
	active, err := tx.client.PurchaseRejectionDisposition.Query().Where(
		purchaserejectiondisposition.QualityInspectionID(inspection.ID),
		purchaserejectiondisposition.StatusNEQ(biz.PurchaseRejectionStatusCancelled),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	allocated := decimal.Zero
	for _, disposition := range active {
		allocated = allocated.Add(disposition.Quantity)
	}
	if allocated.Add(in.Quantity).GreaterThan(item.Quantity) {
		return nil, biz.ErrPurchaseRejectionSourceInvalid
	}
	row, err := tx.client.PurchaseRejectionDisposition.Create().SetDispositionNo(in.DispositionNo).SetQualityInspectionID(inspection.ID).SetPurchaseReceiptID(receipt.ID).SetPurchaseReceiptItemID(item.ID).SetDispositionType(in.DispositionType).SetStatus(biz.PurchaseRejectionStatusDraft).SetQuantity(in.Quantity).SetNillableSupplierID(receipt.SupplierID).SetSupplierName(receipt.SupplierName).SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(intentHash).SetCreatedBy(in.CreatedBy).Save(ctx)
	if err != nil {
		return nil, err
	}
	out := entPurchaseRejectionDispositionToBiz(row)
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) resolvePurchaseRejectionReplay(ctx context.Context, client *ent.Client, in *biz.PurchaseRejectionDispositionCreate, hash string) (*biz.PurchaseRejectionDisposition, bool, error) {
	row, err := client.PurchaseRejectionDisposition.Query().Where(purchaserejectiondisposition.CreatedBy(in.CreatedBy), purchaserejectiondisposition.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entPurchaseRejectionDispositionToBiz(row), true, nil
}

func (r *inventoryRepo) PostPurchaseRejectionDisposition(ctx context.Context, in *biz.PurchaseRejectionDispositionMutation) (*biz.PurchaseRejectionDisposition, error) {
	preview, err := r.data.postgres.PurchaseRejectionDisposition.Get(ctx, in.ID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrPurchaseRejectionDispositionNotFound
	}
	if err != nil {
		return nil, err
	}
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockPurchaseReceipt(ctx, tx, preview.PurchaseReceiptID); err != nil {
		return nil, err
	}
	if err := lockPurchaseRejectionDisposition(ctx, tx, in.ID); err != nil {
		return nil, err
	}
	row, err := tx.client.PurchaseRejectionDisposition.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if row.Status == biz.PurchaseRejectionStatusPosted && row.PostedBy != nil && *row.PostedBy == in.ActorID && row.Version == in.ExpectedVersion+1 {
		return commitPurchaseRejectionDisposition(ctx, tx, row.ID)
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrPurchaseRejectionConflict
	}
	if row.Status == biz.PurchaseRejectionStatusPosted {
		return nil, biz.ErrPurchaseRejectionSourceState
	}
	if row.Status != biz.PurchaseRejectionStatusDraft {
		return nil, biz.ErrPurchaseRejectionSourceState
	}
	inspection, err := getLockedQualityInspection(ctx, tx, row.QualityInspectionID)
	if err != nil {
		return nil, err
	}
	receipt, _, err := validatePurchaseRejectionSource(ctx, tx.client, inspection, row.Quantity)
	if err != nil {
		return nil, err
	}
	if receipt.ID != row.PurchaseReceiptID {
		return nil, biz.ErrPurchaseRejectionSourceInvalid
	}
	if row.DispositionType == biz.PurchaseRejectionReplace {
		replacementID, err := createPurchaseReplacementReceipt(ctx, tx, receipt, row, in.ActorID)
		if err != nil {
			return nil, err
		}
		row.ReplacementReceiptID = &replacementID
	}
	now := time.Now()
	update := tx.client.PurchaseRejectionDisposition.Update().Where(purchaserejectiondisposition.ID(row.ID), purchaserejectiondisposition.StatusEQ(biz.PurchaseRejectionStatusDraft), purchaserejectiondisposition.Version(in.ExpectedVersion)).SetStatus(biz.PurchaseRejectionStatusPosted).SetPostedAt(now).SetPostedBy(in.ActorID).AddVersion(1)
	if row.ReplacementReceiptID != nil {
		update.SetReplacementReceiptID(*row.ReplacementReceiptID)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrPurchaseRejectionConflict
	}
	return commitPurchaseRejectionDisposition(ctx, tx, row.ID)
}

func (r *inventoryRepo) CancelPurchaseRejectionDisposition(ctx context.Context, in *biz.PurchaseRejectionDispositionMutation) (*biz.PurchaseRejectionDisposition, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockPurchaseRejectionDisposition(ctx, tx, in.ID); err != nil {
		return nil, err
	}
	row, err := tx.client.PurchaseRejectionDisposition.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if row.Status == biz.PurchaseRejectionStatusCancelled && row.CancelledBy != nil && *row.CancelledBy == in.ActorID && row.CancelReason != nil && *row.CancelReason == in.Reason && row.Version == in.ExpectedVersion+1 {
		return commitPurchaseRejectionDisposition(ctx, tx, row.ID)
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrPurchaseRejectionConflict
	}
	if row.Status == biz.PurchaseRejectionStatusCancelled {
		return nil, biz.ErrPurchaseRejectionSourceState
	}
	if row.Status != biz.PurchaseRejectionStatusDraft && row.Status != biz.PurchaseRejectionStatusPosted {
		return nil, biz.ErrPurchaseRejectionSourceState
	}
	if row.Status == biz.PurchaseRejectionStatusPosted && row.ReplacementReceiptID != nil {
		replacement, err := tx.client.PurchaseReceipt.Get(ctx, *row.ReplacementReceiptID)
		if err != nil || replacement.Status != biz.PurchaseReceiptStatusDraft {
			return nil, biz.ErrPurchaseRejectionSourceState
		}
		items, err := tx.client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(replacement.ID)).All(ctx)
		if err != nil {
			return nil, err
		}
		if err := settleDraftPurchaseReceiptCancellation(ctx, tx, replacement, items); err != nil {
			return nil, err
		}
		if err := updatePurchaseReceiptCancelled(ctx, tx, replacement.ID); err != nil {
			return nil, err
		}
	}
	now := time.Now()
	affected, err := tx.client.PurchaseRejectionDisposition.Update().Where(purchaserejectiondisposition.ID(row.ID), purchaserejectiondisposition.StatusEQ(row.Status), purchaserejectiondisposition.Version(in.ExpectedVersion)).SetStatus(biz.PurchaseRejectionStatusCancelled).SetCancelledAt(now).SetCancelledBy(in.ActorID).SetCancelReason(in.Reason).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrPurchaseRejectionConflict
	}
	return commitPurchaseRejectionDisposition(ctx, tx, row.ID)
}

func (r *inventoryRepo) GetPurchaseRejectionDisposition(ctx context.Context, id int) (*biz.PurchaseRejectionDisposition, error) {
	row, err := r.data.postgres.PurchaseRejectionDisposition.Get(ctx, id)
	if ent.IsNotFound(err) {
		return nil, biz.ErrPurchaseRejectionDispositionNotFound
	}
	if err != nil {
		return nil, err
	}
	return entPurchaseRejectionDispositionToBiz(row), nil
}
func (r *inventoryRepo) ListPurchaseRejectionDispositions(ctx context.Context, filter biz.PurchaseRejectionDispositionFilter) ([]*biz.PurchaseRejectionDisposition, int, error) {
	query := r.data.postgres.PurchaseRejectionDisposition.Query()
	if filter.QualityInspectionID > 0 {
		query = query.Where(purchaserejectiondisposition.QualityInspectionID(filter.QualityInspectionID))
	}
	if filter.PurchaseReceiptID > 0 {
		query = query.Where(purchaserejectiondisposition.PurchaseReceiptID(filter.PurchaseReceiptID))
	}
	if filter.Status != "" {
		query = query.Where(purchaserejectiondisposition.Status(filter.Status))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(purchaserejectiondisposition.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.PurchaseRejectionDisposition, 0, len(rows))
	for _, row := range rows {
		out = append(out, entPurchaseRejectionDispositionToBiz(row))
	}
	return out, total, nil
}

func validatePurchaseRejectionSource(ctx context.Context, client *ent.Client, inspection *ent.QualityInspection, quantity decimal.Decimal) (*ent.PurchaseReceipt, *ent.PurchaseReceiptItem, error) {
	if client == nil || inspection == nil || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject ||
		inspection.PurchaseReceiptID == nil || inspection.PurchaseReceiptItemID == nil || inspection.SourceType == nil || *inspection.SourceType != biz.QualityInspectionSourcePurchaseReceipt ||
		inspection.SourceID == nil || *inspection.SourceID != *inspection.PurchaseReceiptID || inspection.InspectionType == nil || *inspection.InspectionType != biz.QualityInspectionTypeIncoming || !quantity.IsPositive() {
		return nil, nil, biz.ErrPurchaseRejectionSourceInvalid
	}
	receipt, err := client.PurchaseReceipt.Get(ctx, *inspection.PurchaseReceiptID)
	if ent.IsNotFound(err) {
		return nil, nil, biz.ErrPurchaseReceiptNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft {
		return nil, nil, biz.ErrPurchaseRejectionSourceState
	}
	item, err := client.PurchaseReceiptItem.Get(ctx, *inspection.PurchaseReceiptItemID)
	if ent.IsNotFound(err) {
		return nil, nil, biz.ErrPurchaseReceiptItemNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if item.ReceiptID != receipt.ID || quantity.GreaterThan(item.Quantity) || inspection.MaterialID == nil || item.MaterialID != *inspection.MaterialID || inspection.InventoryLotID == nil || item.LotID == nil || *item.LotID != *inspection.InventoryLotID {
		return nil, nil, biz.ErrPurchaseRejectionSourceInvalid
	}
	return receipt, item, nil
}

func lockPurchaseRejectionDisposition(ctx context.Context, tx *inventoryDBTx, id int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var got int
	err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM purchase_rejection_dispositions WHERE id=$1 FOR UPDATE`, id).Scan(&got)
	if errors.Is(err, stdsql.ErrNoRows) {
		return biz.ErrPurchaseRejectionDispositionNotFound
	}
	return err
}
func commitPurchaseRejectionDisposition(ctx context.Context, tx *inventoryDBTx, id int) (*biz.PurchaseRejectionDisposition, error) {
	row, err := tx.client.PurchaseRejectionDisposition.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	out := entPurchaseRejectionDispositionToBiz(row)
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}
func entPurchaseRejectionDispositionToBiz(row *ent.PurchaseRejectionDisposition) *biz.PurchaseRejectionDisposition {
	if row == nil {
		return nil
	}
	return &biz.PurchaseRejectionDisposition{ID: row.ID, DispositionNo: row.DispositionNo, QualityInspectionID: row.QualityInspectionID, PurchaseReceiptID: row.PurchaseReceiptID, PurchaseReceiptItemID: row.PurchaseReceiptItemID, ReplacementReceiptID: row.ReplacementReceiptID, DispositionType: row.DispositionType, Status: row.Status, Quantity: row.Quantity, SupplierID: row.SupplierID, SupplierName: row.SupplierName, Reason: row.Reason, PostedAt: row.PostedAt, PostedBy: row.PostedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy, Version: row.Version, CreatedAt: row.CreatedAt}
}

func createPurchaseReplacementReceipt(ctx context.Context, tx *inventoryDBTx, source *ent.PurchaseReceipt, disposition *ent.PurchaseRejectionDisposition, actorID int) (int, error) {
	item, err := tx.client.PurchaseReceiptItem.Get(ctx, disposition.PurchaseReceiptItemID)
	if err != nil {
		return 0, err
	}
	receiptNo := "RPL-" + disposition.DispositionNo
	if len(receiptNo) > 64 {
		receiptNo = receiptNo[:64]
	}
	note := "供应商补换来源：" + disposition.DispositionNo
	replacement, err := tx.client.PurchaseReceipt.Create().SetReceiptNo(receiptNo).SetNillableSupplierID(source.SupplierID).SetSupplierName(source.SupplierName).SetStatus(biz.PurchaseReceiptStatusDraft).SetReceivedAt(time.Now()).SetNote(note).SetIdempotencyKey(fmt.Sprintf("PURCHASE_REJECTION:%d:REPLACEMENT", disposition.ID)).SetIdempotencyPayloadHash(disposition.IdempotencyPayloadHash).SetIdempotencyItemCount(1).Save(ctx)
	if err != nil {
		return 0, err
	}
	amount := item.Amount
	if item.UnitPrice != nil {
		calculated := item.UnitPrice.Mul(disposition.Quantity)
		amount = &calculated
	}
	lineNote := fmt.Sprintf("由不合格处置 %s 形成待收；经办人 %d", disposition.DispositionNo, actorID)
	_, _, err = createPreparedPurchaseReceiptItem(ctx, tx, replacement, &biz.PurchaseReceiptItemCreate{MaterialID: item.MaterialID, WarehouseID: item.WarehouseID, UnitID: item.UnitID, PurchaseOrderItemID: item.PurchaseOrderItemID, Quantity: disposition.Quantity, UnitPrice: item.UnitPrice, Amount: amount, SourceLineNo: item.SourceLineNo, Note: &lineNote, IdempotencyKey: fmt.Sprintf("PURCHASE_REJECTION:%d:REPLACEMENT:ITEM", disposition.ID), IdempotencyPayloadHash: disposition.IdempotencyPayloadHash}, 1)
	if err != nil {
		return 0, err
	}
	return replacement.ID, nil
}
