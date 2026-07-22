package data

import (
	"context"
	stdsql "database/sql"
	"errors"
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
	items, err := tx.client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receipt.ID)).Order(ent.Asc(purchasereceiptitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if err := settleDraftPurchaseReceiptCancellation(ctx, tx, receipt, items); err != nil {
		return nil, err
	}
	if err := updatePurchaseReceiptCancelled(ctx, tx, receipt.ID); err != nil {
		return nil, err
	}
	now := time.Now()
	affected, err := tx.client.PurchaseRejectionDisposition.Update().Where(purchaserejectiondisposition.ID(row.ID), purchaserejectiondisposition.StatusEQ(biz.PurchaseRejectionStatusDraft), purchaserejectiondisposition.Version(in.ExpectedVersion)).SetStatus(biz.PurchaseRejectionStatusPosted).SetPostedAt(now).SetPostedBy(in.ActorID).AddVersion(1).Save(ctx)
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
	if row.Status != biz.PurchaseRejectionStatusDraft {
		return nil, biz.ErrPurchaseRejectionSourceState
	}
	now := time.Now()
	affected, err := tx.client.PurchaseRejectionDisposition.Update().Where(purchaserejectiondisposition.ID(row.ID), purchaserejectiondisposition.StatusEQ(biz.PurchaseRejectionStatusDraft), purchaserejectiondisposition.Version(in.ExpectedVersion)).SetStatus(biz.PurchaseRejectionStatusCancelled).SetCancelledAt(now).SetCancelledBy(in.ActorID).SetCancelReason(in.Reason).AddVersion(1).Save(ctx)
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
	return &biz.PurchaseRejectionDisposition{ID: row.ID, DispositionNo: row.DispositionNo, QualityInspectionID: row.QualityInspectionID, PurchaseReceiptID: row.PurchaseReceiptID, PurchaseReceiptItemID: row.PurchaseReceiptItemID, DispositionType: row.DispositionType, Status: row.Status, Quantity: row.Quantity, SupplierID: row.SupplierID, SupplierName: row.SupplierName, Reason: row.Reason, PostedAt: row.PostedAt, PostedBy: row.PostedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy, Version: row.Version, CreatedAt: row.CreatedAt}
}
