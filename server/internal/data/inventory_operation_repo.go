package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventoryoperation"
	"server/internal/data/model/ent/inventoryoperationitem"
	"server/internal/data/model/ent/inventorytxn"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

var _ biz.InventoryOperationRepo = (*inventoryRepo)(nil)

func (r *inventoryRepo) CreateInventoryOperation(ctx context.Context, in *biz.InventoryOperationCreate, intentHash string) (*biz.InventoryOperation, error) {
	if in == nil || intentHash == "" {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := r.resolveInventoryOperationReplay(ctx, r.data.postgres, in, intentHash); err != nil || found {
		return replay, err
	}
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	row, err := tx.client.InventoryOperation.Create().SetOperationNo(in.OperationNo).SetOperationType(in.OperationType).SetStatus(biz.InventoryOperationStatusDraft).SetReason(in.Reason).SetNillableApprovalRef(in.ApprovalRef).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(intentHash).SetIdempotencyItemCount(len(in.Items)).SetCreatedBy(in.CreatedBy).Save(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range in.Items {
		_, err = tx.client.InventoryOperationItem.Create().SetOperationID(row.ID).SetLineNo(item.LineNo).SetSubjectType(item.SubjectType).SetSubjectID(item.SubjectID).SetNillableProductSkuID(item.ProductSkuID).SetFromWarehouseID(item.FromWarehouseID).SetNillableFromLotID(item.FromLotID).SetNillableToWarehouseID(item.ToWarehouseID).SetNillableToLotID(item.ToLotID).SetUnitID(item.UnitID).SetNillableExpectedQuantity(item.ExpectedQuantity).SetNillableCountedQuantity(item.CountedQuantity).SetAdjustmentQuantity(item.AdjustmentQuantity).SetNillableNote(item.Note).Save(ctx)
		if err != nil {
			return nil, err
		}
	}
	out, err := inventoryOperationByID(ctx, tx.client, row.ID)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) resolveInventoryOperationReplay(ctx context.Context, client *ent.Client, in *biz.InventoryOperationCreate, hash string) (*biz.InventoryOperation, bool, error) {
	row, err := client.InventoryOperation.Query().Where(inventoryoperation.CreatedBy(in.CreatedBy), inventoryoperation.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash || row.IdempotencyItemCount != len(in.Items) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	out, err := inventoryOperationByID(ctx, client, row.ID)
	return out, true, err
}

func (r *inventoryRepo) PostInventoryOperation(ctx context.Context, in *biz.InventoryOperationMutation) (*biz.InventoryOperation, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockInventoryOperation(ctx, tx, in.ID); err != nil {
		return nil, err
	}
	row, err := tx.client.InventoryOperation.Get(ctx, in.ID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrInventoryOperationNotFound
	}
	if err != nil {
		return nil, err
	}
	if row.Status == biz.InventoryOperationStatusPosted && row.Version == in.ExpectedVersion+1 && row.PostedBy != nil && *row.PostedBy == in.ActorID {
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	if row.Status != biz.InventoryOperationStatusDraft || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	items, err := tx.client.InventoryOperationItem.Query().Where(inventoryoperationitem.OperationID(row.ID)).Order(ent.Asc(inventoryoperationitem.FieldID)).All(ctx)
	if err != nil || len(items) == 0 {
		if err == nil {
			err = biz.ErrBadParam
		}
		return nil, err
	}
	for _, item := range items {
		if err := r.postInventoryOperationItem(ctx, tx, row, item, in.ActorID); err != nil {
			return nil, err
		}
	}
	now := time.Now()
	affected, err := tx.client.InventoryOperation.Update().Where(inventoryoperation.ID(row.ID), inventoryoperation.StatusEQ(biz.InventoryOperationStatusDraft), inventoryoperation.VersionEQ(in.ExpectedVersion)).SetStatus(biz.InventoryOperationStatusPosted).SetPostedAt(now).SetPostedBy(in.ActorID).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	return commitInventoryOperation(ctx, tx, row.ID)
}

func (r *inventoryRepo) postInventoryOperationItem(ctx context.Context, tx *inventoryDBTx, op *ent.InventoryOperation, item *ent.InventoryOperationItem, actorID int) error {
	key := biz.InventoryBalanceKey{SubjectType: item.SubjectType, SubjectID: item.SubjectID, ProductSkuID: item.ProductSkuID, WarehouseID: item.FromWarehouseID, LotID: item.FromLotID, UnitID: item.UnitID}
	quantity := item.AdjustmentQuantity
	txnType, direction := biz.InventoryTxnAdjustIn, 1
	if op.OperationType == biz.InventoryOperationCycleCount {
		if item.ExpectedQuantity == nil || item.CountedQuantity == nil {
			return biz.ErrBadParam
		}
		current, err := lockAndReadInventoryOperationBalance(ctx, tx, key)
		if err != nil {
			return err
		}
		if !current.Equal(*item.ExpectedQuantity) {
			return biz.ErrInventoryOperationStaleCount
		}
		quantity = item.CountedQuantity.Sub(current)
		if !quantity.Equal(item.AdjustmentQuantity) || quantity.IsZero() {
			return biz.ErrIdempotencyConflict
		}
	}
	if op.OperationType == biz.InventoryOperationTransfer {
		if item.ToWarehouseID == nil {
			return biz.ErrBadParam
		}
		if _, err := r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, inventoryOperationTxn(op, item, item.FromWarehouseID, item.FromLotID, biz.InventoryTxnTransferOut, -1, quantity, actorID, "OUT")); err != nil {
			return err
		}
		_, err := r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, inventoryOperationTxn(op, item, *item.ToWarehouseID, item.ToLotID, biz.InventoryTxnTransferIn, 1, quantity, actorID, "IN"))
		return err
	}
	if quantity.IsNegative() {
		txnType, direction, quantity = biz.InventoryTxnAdjustOut, -1, quantity.Abs()
	}
	_, err := r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, inventoryOperationTxn(op, item, item.FromWarehouseID, item.FromLotID, txnType, direction, quantity, actorID, "ADJUST"))
	return err
}

func inventoryOperationTxn(op *ent.InventoryOperation, item *ent.InventoryOperationItem, warehouseID int, lotID *int, txnType string, direction int, quantity decimal.Decimal, actorID int, suffix string) *biz.InventoryTxnCreate {
	sourceID, lineID, actor := op.ID, item.ID, actorID
	return &biz.InventoryTxnCreate{SubjectType: item.SubjectType, SubjectID: item.SubjectID, ProductSkuID: item.ProductSkuID, WarehouseID: warehouseID, LotID: lotID, TxnType: txnType, Direction: direction, Quantity: quantity, UnitID: item.UnitID, SourceType: biz.InventoryOperationSourceType, SourceID: &sourceID, SourceLineID: &lineID, IdempotencyKey: fmt.Sprintf("INVENTORY_OPERATION:%d:%d:%s", op.ID, item.ID, suffix), OccurredAt: time.Now(), CreatedBy: &actor, Note: item.Note}
}

func (r *inventoryRepo) CancelInventoryOperation(ctx context.Context, in *biz.InventoryOperationMutation) (*biz.InventoryOperation, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockInventoryOperation(ctx, tx, in.ID); err != nil {
		return nil, err
	}
	row, err := tx.client.InventoryOperation.Get(ctx, in.ID)
	if ent.IsNotFound(err) {
		return nil, biz.ErrInventoryOperationNotFound
	}
	if err != nil {
		return nil, err
	}
	if row.Status == biz.InventoryOperationStatusCancelled && row.Version == in.ExpectedVersion+1 && row.CancelledBy != nil && *row.CancelledBy == in.ActorID && row.CancelReason != nil && *row.CancelReason == in.Reason {
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	if (row.Status != biz.InventoryOperationStatusDraft && row.Status != biz.InventoryOperationStatusPosted) || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.Status == biz.InventoryOperationStatusPosted {
		txns, err := tx.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.InventoryOperationSourceType), inventorytxn.SourceID(row.ID), inventorytxn.ReversalOfTxnIDIsNil()).All(ctx)
		if err != nil {
			return nil, err
		}
		sort.Slice(txns, func(i, j int) bool {
			if txns[i].Direction != txns[j].Direction {
				return txns[i].Direction > txns[j].Direction
			}
			return txns[i].ID < txns[j].ID
		})
		for _, original := range txns {
			sourceID, lineID, reversalID, actor := row.ID, original.SourceLineID, original.ID, in.ActorID
			_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{SubjectType: original.SubjectType, SubjectID: original.SubjectID, ProductSkuID: original.ProductSkuID, WarehouseID: original.WarehouseID, LotID: original.LotID, TxnType: biz.InventoryTxnReversal, Direction: -original.Direction, Quantity: original.Quantity, UnitID: original.UnitID, SourceType: biz.InventoryOperationSourceType, SourceID: &sourceID, SourceLineID: lineID, IdempotencyKey: fmt.Sprintf("INVENTORY_OPERATION:%d:REVERSAL:%d", row.ID, original.ID), ReversalOfTxnID: &reversalID, OccurredAt: time.Now(), CreatedBy: &actor, Note: &in.Reason})
			if err != nil {
				return nil, err
			}
		}
	}
	now := time.Now()
	affected, err := tx.client.InventoryOperation.Update().Where(inventoryoperation.ID(row.ID), inventoryoperation.VersionEQ(in.ExpectedVersion)).SetStatus(biz.InventoryOperationStatusCancelled).SetCancelledAt(now).SetCancelledBy(in.ActorID).SetCancelReason(in.Reason).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	return commitInventoryOperation(ctx, tx, row.ID)
}

func (r *inventoryRepo) GetInventoryOperation(ctx context.Context, id int) (*biz.InventoryOperation, error) {
	out, err := inventoryOperationByID(ctx, r.data.postgres, id)
	if ent.IsNotFound(err) {
		return nil, biz.ErrInventoryOperationNotFound
	}
	return out, err
}
func commitInventoryOperation(ctx context.Context, tx *inventoryDBTx, id int) (*biz.InventoryOperation, error) {
	out, err := inventoryOperationByID(ctx, tx.client, id)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func inventoryOperationByID(ctx context.Context, client *ent.Client, id int) (*biz.InventoryOperation, error) {
	row, err := client.InventoryOperation.Query().Where(inventoryoperation.ID(id)).WithItems(func(q *ent.InventoryOperationItemQuery) { q.Order(ent.Asc(inventoryoperationitem.FieldID)) }).Only(ctx)
	if err != nil {
		return nil, err
	}
	out := &biz.InventoryOperation{ID: row.ID, OperationNo: row.OperationNo, OperationType: row.OperationType, Status: row.Status, Reason: row.Reason, ApprovalRef: row.ApprovalRef, Version: row.Version, PostedAt: row.PostedAt, PostedBy: row.PostedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	for _, item := range row.Edges.Items {
		out.Items = append(out.Items, &biz.InventoryOperationItem{ID: item.ID, OperationID: item.OperationID, LineNo: item.LineNo, SubjectType: item.SubjectType, SubjectID: item.SubjectID, ProductSkuID: item.ProductSkuID, FromWarehouseID: item.FromWarehouseID, FromLotID: item.FromLotID, ToWarehouseID: item.ToWarehouseID, ToLotID: item.ToLotID, UnitID: item.UnitID, ExpectedQuantity: item.ExpectedQuantity, CountedQuantity: item.CountedQuantity, AdjustmentQuantity: item.AdjustmentQuantity, Note: item.Note})
	}
	return out, nil
}

func lockInventoryOperation(ctx context.Context, tx *inventoryDBTx, id int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var got int
	err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM inventory_operations WHERE id=$1 FOR UPDATE`, id).Scan(&got)
	if errors.Is(err, stdsql.ErrNoRows) {
		return biz.ErrInventoryOperationNotFound
	}
	return err
}
func lockAndReadInventoryOperationBalance(ctx context.Context, tx *inventoryDBTx, key biz.InventoryBalanceKey) (decimal.Decimal, error) {
	if tx.dialect == dialect.Postgres {
		lockErr := lockInventoryBalanceRow(ctx, tx, key)
		if lockErr != nil && !errors.Is(lockErr, biz.ErrInventoryInsufficientStock) {
			return decimal.Zero, lockErr
		}
		if errors.Is(lockErr, biz.ErrInventoryInsufficientStock) {
			var id int
			if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM warehouses WHERE id=$1 FOR UPDATE`, key.WarehouseID).Scan(&id); err != nil {
				return decimal.Zero, err
			}
		}
	}
	row, err := getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), key)
	if ent.IsNotFound(err) {
		return decimal.Zero, nil
	}
	if err != nil {
		return decimal.Zero, err
	}
	return row.Quantity, nil
}
