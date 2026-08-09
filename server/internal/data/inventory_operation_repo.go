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
	"server/internal/data/model/ent/processinstance"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

var _ biz.InventoryOperationRepo = (*inventoryRepo)(nil)
var _ biz.InventoryOperationDraftSaveRepo = (*inventoryRepo)(nil)

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
	row, err := tx.client.InventoryOperation.Create().SetOperationNo(in.OperationNo).SetOperationType(in.OperationType).SetStatus(biz.InventoryOperationStatusDraft).SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(intentHash).SetIdempotencyItemCount(len(in.Items)).SetCreatedBy(in.CreatedBy).Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := r.resolveInventoryOperationReplay(ctx, r.data.postgres, in, intentHash); replayErr != nil || found {
				return replay, replayErr
			}
		}
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

func (r *inventoryRepo) SaveInventoryOperationDraft(ctx context.Context, in *biz.InventoryOperationDraftSave) (*biz.InventoryOperation, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || len(in.Items) == 0 {
		return nil, biz.ErrBadParam
	}
	tx, row, err := r.beginLockedInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if row.Status != biz.InventoryOperationStatusDraft || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.CreatedBy != in.ActorID {
		return nil, biz.ErrInventoryOperationSaveOwner
	}
	if row.OperationType == biz.InventoryOperationManualAdjustment {
		hasProcess, err := tx.client.ProcessInstance.Query().Where(
			processinstance.ProcessKey(biz.ProcessKeyInventoryAdjustmentApproval),
			processinstance.BusinessRefType("inventory_operation"),
			processinstance.BusinessRefID(row.ID),
		).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasProcess {
			return nil, biz.ErrProcessSourceLifecycleDependency
		}
	}
	items, err := tx.client.InventoryOperationItem.Query().Where(
		inventoryoperationitem.OperationID(row.ID),
	).Order(ent.Asc(inventoryoperationitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 || len(items) != len(in.Items) {
		return nil, biz.ErrBadParam
	}
	requestedByID := make(map[int]biz.InventoryOperationDraftItemSave, len(in.Items))
	for _, requested := range in.Items {
		requestedByID[requested.ID] = requested
	}
	for _, current := range items {
		requested, exists := requestedByID[current.ID]
		if !exists {
			return nil, biz.ErrBadParam
		}
		expectedQuantity, countedQuantity, adjustmentQuantity, toWarehouseID, toLotID, err := r.inventoryOperationDraftItemValues(ctx, tx, row, current, requested)
		if err != nil {
			return nil, err
		}
		if err := updateInventoryOperationDraftItem(ctx, tx, current.ID, row.ID, expectedQuantity, countedQuantity, adjustmentQuantity, toWarehouseID, toLotID, requested.Note); err != nil {
			return nil, err
		}
	}
	if err := updateInventoryOperationDraftHeader(ctx, tx, row.ID, in); err != nil {
		return nil, err
	}
	return commitInventoryOperation(ctx, tx, row.ID)
}

func (r *inventoryRepo) inventoryOperationDraftItemValues(
	ctx context.Context,
	tx *inventoryDBTx,
	operation *ent.InventoryOperation,
	item *ent.InventoryOperationItem,
	requested biz.InventoryOperationDraftItemSave,
) (*decimal.Decimal, *decimal.Decimal, decimal.Decimal, *int, *int, error) {
	if tx == nil || operation == nil || item == nil {
		return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
	}
	switch operation.OperationType {
	case biz.InventoryOperationCycleCount:
		if requested.CountedQuantity == nil || requested.CountedQuantity.IsNegative() || requested.ToWarehouseID != nil || !requested.AdjustmentQuantity.IsZero() {
			return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
		}
		expected, err := lockAndReadInventoryOperationBalance(ctx, tx, biz.InventoryBalanceKey{
			SubjectType: item.SubjectType, SubjectID: item.SubjectID, ProductSkuID: item.ProductSkuID,
			WarehouseID: item.FromWarehouseID, LotID: item.FromLotID, UnitID: item.UnitID,
		})
		if err != nil {
			return nil, nil, decimal.Zero, nil, nil, err
		}
		adjustment := requested.CountedQuantity.Sub(expected)
		if adjustment.IsZero() {
			return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
		}
		return &expected, requested.CountedQuantity, adjustment, nil, nil, nil
	case biz.InventoryOperationTransfer:
		if requested.CountedQuantity != nil || !requested.AdjustmentQuantity.IsPositive() || requested.ToWarehouseID == nil || *requested.ToWarehouseID == item.FromWarehouseID {
			return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
		}
		warehouseRow, err := tx.client.Warehouse.Get(ctx, *requested.ToWarehouseID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
			}
			return nil, nil, decimal.Zero, nil, nil, err
		}
		if !warehouseRow.IsActive {
			return nil, nil, decimal.Zero, nil, nil, biz.ErrWarehouseInactive
		}
		return nil, nil, requested.AdjustmentQuantity, requested.ToWarehouseID, item.FromLotID, nil
	case biz.InventoryOperationManualAdjustment:
		if requested.CountedQuantity != nil || requested.ToWarehouseID != nil || requested.AdjustmentQuantity.IsZero() {
			return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
		}
		return nil, nil, requested.AdjustmentQuantity, nil, nil, nil
	default:
		return nil, nil, decimal.Zero, nil, nil, biz.ErrBadParam
	}
}

func updateInventoryOperationDraftItem(
	ctx context.Context,
	tx *inventoryDBTx,
	itemID int,
	operationID int,
	expectedQuantity *decimal.Decimal,
	countedQuantity *decimal.Decimal,
	adjustmentQuantity decimal.Decimal,
	toWarehouseID *int,
	toLotID *int,
	note *string,
) error {
	if tx == nil || tx.sqlTx == nil || itemID <= 0 || operationID <= 0 {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 8)
	query := fmt.Sprintf(`UPDATE inventory_operation_items SET expected_quantity = %s, counted_quantity = %s, adjustment_quantity = %s, to_warehouse_id = %s, to_lot_id = %s, note = %s WHERE id = %s AND operation_id = %s`, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7])
	result, err := tx.sqlTx.ExecContext(
		ctx,
		query,
		optionalDecimalSQLValue(expectedQuantity),
		optionalDecimalSQLValue(countedQuantity),
		adjustmentQuantity,
		optionalIntSQLValue(toWarehouseID),
		optionalIntSQLValue(toLotID),
		optionalStringSQLValue(note),
		itemID,
		operationID,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrInventoryOperationVersionConflict
	}
	return nil
}

func updateInventoryOperationDraftHeader(ctx context.Context, tx *inventoryDBTx, operationID int, in *biz.InventoryOperationDraftSave) error {
	if tx == nil || tx.sqlTx == nil || operationID <= 0 || in == nil {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 5)
	query := fmt.Sprintf(`UPDATE inventory_operations SET operation_no = %s, reason = %s, version = version + 1, updated_at = %s WHERE id = %s AND status = 'DRAFT' AND version = %s`, p[0], p[1], p[2], p[3], p[4])
	result, err := tx.sqlTx.ExecContext(ctx, query, in.OperationNo, in.Reason, time.Now(), operationID, in.ExpectedVersion)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrInventoryOperationVersionConflict
	}
	return nil
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

func (r *inventoryRepo) SubmitInventoryOperation(ctx context.Context, in *biz.InventoryOperationMutation) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *inventoryRepo) SubmitInventoryOperationForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.InventoryOperation, error) {
	return r.submitInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: id, ActorID: actorID}, command, result)
}

func (r *inventoryRepo) submitInventoryOperation(
	ctx context.Context,
	in *biz.InventoryOperationMutation,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.InventoryOperation, error) {
	tx, row, err := r.beginLockedInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.Status == biz.InventoryOperationStatusSubmitted && row.Version == in.ExpectedVersion+1 && row.SubmittedBy != nil && *row.SubmittedBy == in.ActorID {
		if command != nil {
			if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
				return nil, err
			}
		}
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	if row.OperationType != biz.InventoryOperationManualAdjustment || row.Status != biz.InventoryOperationStatusDraft || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.CreatedBy != in.ActorID {
		return nil, biz.ErrInventoryOperationSubmitOwner
	}
	now := time.Now()
	affected, err := tx.client.InventoryOperation.Update().
		Where(inventoryoperation.ID(row.ID), inventoryoperation.StatusEQ(biz.InventoryOperationStatusDraft), inventoryoperation.VersionEQ(in.ExpectedVersion)).
		SetStatus(biz.InventoryOperationStatusSubmitted).
		SetSubmittedAt(now).
		SetSubmittedBy(in.ActorID).
		AddVersion(1).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
			return nil, err
		}
	}
	return commitInventoryOperation(ctx, tx, row.ID)
}

func (r *inventoryRepo) ApproveInventoryOperation(ctx context.Context, in *biz.InventoryOperationMutation) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *inventoryRepo) ApproveInventoryOperationForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.InventoryOperation, error) {
	return r.approveInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: id, ActorID: actorID, Reason: reason}, command, result)
}

func (r *inventoryRepo) approveInventoryOperation(
	ctx context.Context,
	in *biz.InventoryOperationMutation,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.InventoryOperation, error) {
	tx, row, err := r.beginLockedInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.Status == biz.InventoryOperationStatusApproved && row.Version == in.ExpectedVersion+1 && row.ApprovedBy != nil && *row.ApprovedBy == in.ActorID {
		if command != nil {
			if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
				return nil, err
			}
		}
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	if row.OperationType != biz.InventoryOperationManualAdjustment || row.Status != biz.InventoryOperationStatusSubmitted || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.CreatedBy == in.ActorID {
		return nil, biz.ErrInventoryOperationSelfApproval
	}
	now := time.Now()
	affected, err := tx.client.InventoryOperation.Update().
		Where(inventoryoperation.ID(row.ID), inventoryoperation.StatusEQ(biz.InventoryOperationStatusSubmitted), inventoryoperation.VersionEQ(in.ExpectedVersion)).
		SetStatus(biz.InventoryOperationStatusApproved).
		SetApprovedAt(now).
		SetApprovedBy(in.ActorID).
		AddVersion(1).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
			return nil, err
		}
	}
	return commitInventoryOperation(ctx, tx, row.ID)
}

func (r *inventoryRepo) RejectInventoryOperation(ctx context.Context, in *biz.InventoryOperationMutation) (*biz.InventoryOperation, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *inventoryRepo) RejectInventoryOperationForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.InventoryOperation, error) {
	return r.rejectInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: id, ActorID: actorID, Reason: reason}, command, result)
}

func (r *inventoryRepo) rejectInventoryOperation(
	ctx context.Context,
	in *biz.InventoryOperationMutation,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.InventoryOperation, error) {
	tx, row, err := r.beginLockedInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.Status == biz.InventoryOperationStatusRejected && row.Version == in.ExpectedVersion+1 && row.RejectedBy != nil && *row.RejectedBy == in.ActorID && row.RejectReason != nil && *row.RejectReason == in.Reason {
		if command != nil {
			if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
				return nil, err
			}
		}
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	if row.OperationType != biz.InventoryOperationManualAdjustment || row.Status != biz.InventoryOperationStatusSubmitted || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.CreatedBy == in.ActorID {
		return nil, biz.ErrInventoryOperationSelfApproval
	}
	now := time.Now()
	affected, err := tx.client.InventoryOperation.Update().
		Where(inventoryoperation.ID(row.ID), inventoryoperation.StatusEQ(biz.InventoryOperationStatusSubmitted), inventoryoperation.VersionEQ(in.ExpectedVersion)).
		SetStatus(biz.InventoryOperationStatusRejected).
		SetRejectedAt(now).
		SetRejectedBy(in.ActorID).
		SetRejectReason(in.Reason).
		AddVersion(1).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
			return nil, err
		}
	}
	return commitInventoryOperation(ctx, tx, row.ID)
}

func (r *inventoryRepo) PostInventoryOperation(ctx context.Context, in *biz.InventoryOperationMutation) (*biz.InventoryOperation, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	item, err := r.GetInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if item.OperationType == biz.InventoryOperationManualAdjustment {
		return nil, biz.ErrProcessRuntimeRequired
	}
	return r.postInventoryOperation(ctx, in, nil, nil)
}

func (r *inventoryRepo) PostInventoryOperationForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.InventoryOperation, error) {
	return r.postInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: id, ActorID: actorID}, command, result)
}

func (r *inventoryRepo) postInventoryOperation(
	ctx context.Context,
	in *biz.InventoryOperationMutation,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.InventoryOperation, error) {
	tx, row, err := r.beginLockedInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.Status == biz.InventoryOperationStatusPosted && row.Version == in.ExpectedVersion+1 && row.PostedBy != nil && *row.PostedBy == in.ActorID {
		if command != nil {
			if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
				return nil, err
			}
		}
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	expectedStatus := biz.InventoryOperationStatusDraft
	if row.OperationType == biz.InventoryOperationManualAdjustment {
		expectedStatus = biz.InventoryOperationStatusApproved
	}
	if row.Status != expectedStatus || row.Version != in.ExpectedVersion {
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
	affected, err := tx.client.InventoryOperation.Update().Where(inventoryoperation.ID(row.ID), inventoryoperation.StatusEQ(expectedStatus), inventoryoperation.VersionEQ(in.ExpectedVersion)).SetStatus(biz.InventoryOperationStatusPosted).SetPostedAt(now).SetPostedBy(in.ActorID).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
			return nil, err
		}
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
	tx, row, err := r.beginLockedInventoryOperation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if row.Status == biz.InventoryOperationStatusCancelled && row.Version == in.ExpectedVersion+1 && row.CancelledBy != nil && *row.CancelledBy == in.ActorID && row.CancelReason != nil && *row.CancelReason == in.Reason {
		return commitInventoryOperation(ctx, tx, row.ID)
	}
	if (row.Status != biz.InventoryOperationStatusDraft && row.Status != biz.InventoryOperationStatusSubmitted && row.Status != biz.InventoryOperationStatusApproved && row.Status != biz.InventoryOperationStatusPosted) || row.Version != in.ExpectedVersion {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.CreatedBy != in.ActorID && (row.Status != biz.InventoryOperationStatusPosted || row.PostedBy == nil || *row.PostedBy != in.ActorID) {
		return nil, biz.ErrInventoryOperationCancelOwner
	}
	if row.OperationType == biz.InventoryOperationManualAdjustment &&
		row.Status != biz.InventoryOperationStatusPosted {
		processQuery := tx.client.ProcessInstance.Query().Where(
			processinstance.ProcessKey(biz.ProcessKeyInventoryAdjustmentApproval),
			processinstance.BusinessRefType("inventory_operation"),
			processinstance.BusinessRefID(row.ID),
		)
		hasProcess, err := processQuery.Clone().Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasProcess {
			blocked, err := processQuery.Clone().Where(
				processinstance.Status(biz.ProcessStatusBlocked),
			).Exist(ctx)
			if err != nil {
				return nil, err
			}
			if !blocked {
				return nil, biz.ErrProcessSourceLifecycleDependency
			}
		}
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
	affected, err := tx.client.InventoryOperation.Update().Where(inventoryoperation.ID(row.ID), inventoryoperation.StatusEQ(row.Status), inventoryoperation.VersionEQ(in.ExpectedVersion)).SetStatus(biz.InventoryOperationStatusCancelled).SetCancelledAt(now).SetCancelledBy(in.ActorID).SetCancelReason(in.Reason).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrInventoryOperationVersionConflict
	}
	if row.OperationType == biz.InventoryOperationManualAdjustment {
		compensatedCommands := []string{}
		switch row.Status {
		case biz.InventoryOperationStatusSubmitted:
			compensatedCommands = []string{biz.ProcessDomainCommandInventoryAdjustmentSubmit}
		case biz.InventoryOperationStatusApproved:
			compensatedCommands = []string{
				biz.ProcessDomainCommandInventoryAdjustmentSubmit,
				biz.ProcessDomainCommandInventoryAdjustmentApprove,
			}
		case biz.InventoryOperationStatusPosted:
			compensatedCommands = []string{
				biz.ProcessDomainCommandInventoryAdjustmentSubmit,
				biz.ProcessDomainCommandInventoryAdjustmentApprove,
				biz.ProcessDomainCommandInventoryAdjustmentPost,
			}
		}
		if err := markProcessDomainCommandEffectsCompensatedWithClient(
			ctx,
			tx.client,
			compensatedCommands,
			"inventory_operation",
			row.ID,
			in.Reason,
			in.ActorID,
		); err != nil {
			return nil, err
		}
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

func (r *inventoryRepo) ListInventoryOperationsForAccess(ctx context.Context, filter biz.InventoryOperationFilter, scope biz.WarehouseDataScope) ([]*biz.InventoryOperation, int, error) {
	query := r.data.postgres.InventoryOperation.Query()
	switch scope.Mode {
	case biz.DataScopeModeAssigned:
		query = query.Where(inventoryoperation.Not(inventoryoperation.HasItemsWith(inventoryoperationitem.Or(
			inventoryoperationitem.FromWarehouseIDNotIn(scope.WarehouseIDs...),
			inventoryoperationitem.And(inventoryoperationitem.ToWarehouseIDNotNil(), inventoryoperationitem.ToWarehouseIDNotIn(scope.WarehouseIDs...)),
		))))
	case biz.DataScopeModeAll:
	default:
		return []*biz.InventoryOperation{}, 0, nil
	}
	if filter.OperationType != "" {
		query = query.Where(inventoryoperation.OperationTypeEQ(filter.OperationType))
	}
	if filter.Status != "" {
		query = query.Where(inventoryoperation.StatusEQ(filter.Status))
	}
	if filter.CreatedBy > 0 {
		query = query.Where(inventoryoperation.CreatedBy(filter.CreatedBy))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(inventoryoperation.FieldUpdatedAt), ent.Desc(inventoryoperation.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.InventoryOperation, 0, len(rows))
	for _, row := range rows {
		item, err := inventoryOperationByID(ctx, r.data.postgres, row.ID)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
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
	out := &biz.InventoryOperation{ID: row.ID, OperationNo: row.OperationNo, OperationType: row.OperationType, Status: row.Status, Reason: row.Reason, Version: row.Version, SubmittedAt: row.SubmittedAt, SubmittedBy: row.SubmittedBy, ApprovedAt: row.ApprovedAt, ApprovedBy: row.ApprovedBy, RejectedAt: row.RejectedAt, RejectedBy: row.RejectedBy, RejectReason: row.RejectReason, PostedAt: row.PostedAt, PostedBy: row.PostedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	for _, item := range row.Edges.Items {
		out.Items = append(out.Items, &biz.InventoryOperationItem{ID: item.ID, OperationID: item.OperationID, LineNo: item.LineNo, SubjectType: item.SubjectType, SubjectID: item.SubjectID, ProductSkuID: item.ProductSkuID, FromWarehouseID: item.FromWarehouseID, FromLotID: item.FromLotID, ToWarehouseID: item.ToWarehouseID, ToLotID: item.ToLotID, UnitID: item.UnitID, ExpectedQuantity: item.ExpectedQuantity, CountedQuantity: item.CountedQuantity, AdjustmentQuantity: item.AdjustmentQuantity, Note: item.Note})
	}
	return out, nil
}

func (r *inventoryRepo) beginLockedInventoryOperation(ctx context.Context, id int) (*inventoryDBTx, *ent.InventoryOperation, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, nil, err
	}
	if err := lockInventoryOperation(ctx, tx, id); err != nil {
		rollbackInventoryDBTx(ctx, tx, r.log)
		return nil, nil, err
	}
	row, err := tx.client.InventoryOperation.Get(ctx, id)
	if ent.IsNotFound(err) {
		err = biz.ErrInventoryOperationNotFound
	}
	if err != nil {
		rollbackInventoryDBTx(ctx, tx, r.log)
		return nil, nil, err
	}
	return tx, row, nil
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
