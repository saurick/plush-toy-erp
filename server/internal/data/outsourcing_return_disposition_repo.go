package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/outsourcingreturndisposition"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipevent"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
	"server/internal/data/model/ent/qualityinspection"
)

var _ biz.OutsourcingReturnDispositionRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CreateOutsourcingReturnDisposition(ctx context.Context, in *biz.OutsourcingReturnDispositionCreate, hash string) (*biz.OutsourcingReturnDisposition, error) {
	if replay, found, err := findOutsourcingDispositionReplay(ctx, r.data.postgres, in, hash); err != nil || found {
		return replay, err
	}
	inspection, err := r.data.postgres.QualityInspection.Get(ctx, in.QualityInspectionID)
	if err != nil || inspection.SourceID == nil {
		return nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	factPreview, err := r.data.postgres.OutsourcingFact.Get(ctx, *inspection.SourceID)
	if err != nil {
		return nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	batchID, err := resolveOutsourcingDispositionSourceBatch(ctx, r.data.postgres, factPreview)
	if err != nil {
		return nil, err
	}
	if in.ProductionWIPBatchID != nil && *in.ProductionWIPBatchID != batchID {
		return nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	in.ProductionWIPBatchID = &batchID
	batchPreview, err := r.data.postgres.ProductionWIPBatch.Get(ctx, batchID)
	if err != nil {
		return nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", batchPreview.ProductionOrderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", batchPreview.ProductionOrderItemID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_operations", batchPreview.ProductionOrderOperationID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", batchID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", *inspection.SourceID, biz.ErrOutsourcingFactNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "quality_inspections", inspection.ID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return nil, err
	}
	order, err := tx.client.ProductionOrder.Get(ctx, batchPreview.ProductionOrderID)
	if err != nil || order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrOutsourcingDispositionState
	}
	lockedFact, err := tx.client.OutsourcingFact.Get(ctx, *inspection.SourceID)
	if err != nil {
		return nil, err
	}
	lockedBatchID, err := resolveOutsourcingDispositionSourceBatch(ctx, tx.client, lockedFact)
	if err != nil || lockedBatchID != batchID {
		return nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	inspection, fact, err := validateOutsourcingDispositionSource(ctx, tx.client, in)
	if err != nil {
		return nil, err
	}
	row, err := tx.client.OutsourcingReturnDisposition.Create().SetDispositionNo(in.DispositionNo).SetQualityInspectionID(inspection.ID).SetOutsourcingReturnFactID(fact.ID).SetDispositionType(in.DispositionType).SetStatus(biz.OutsourcingDispositionDraft).SetQuantity(in.Quantity).SetNillableProductionWipBatchID(in.ProductionWIPBatchID).SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(hash).SetCreatedBy(in.CreatedBy).Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := findOutsourcingDispositionReplay(ctx, r.data.postgres, in, hash); replayErr != nil || found {
				return replay, replayErr
			}
			return nil, biz.ErrOutsourcingDispositionConflict
		}
		return nil, err
	}
	return commitOutsourcingDisposition(ctx, tx, row.ID)
}

func findOutsourcingDispositionReplay(ctx context.Context, client *ent.Client, in *biz.OutsourcingReturnDispositionCreate, hash string) (*biz.OutsourcingReturnDisposition, bool, error) {
	row, err := client.OutsourcingReturnDisposition.Query().Where(outsourcingreturndisposition.CreatedBy(in.CreatedBy), outsourcingreturndisposition.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entOutsourcingDispositionToBiz(row), true, nil
}

func validateOutsourcingDispositionSource(ctx context.Context, client *ent.Client, in *biz.OutsourcingReturnDispositionCreate) (*ent.QualityInspection, *ent.OutsourcingFact, error) {
	inspection, err := client.QualityInspection.Get(ctx, in.QualityInspectionID)
	if err != nil || inspection.SupersededAt != nil || inspection.SourceType == nil || *inspection.SourceType != biz.QualityInspectionSourceOutsourcingFact || inspection.SourceID == nil || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	fact, err := client.OutsourcingFact.Get(ctx, *inspection.SourceID)
	if err != nil || fact.FactType != biz.OutsourcingFactReturnReceipt || fact.Status != biz.OperationalFactStatusPosted || fact.LotID == nil || in.Quantity.GreaterThan(fact.Quantity) {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	if fact.SourceLineID == nil || in.ProductionWIPBatchID == nil {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	batch, err := client.ProductionWIPBatch.Get(ctx, *in.ProductionWIPBatchID)
	if err != nil || batch.Status != biz.ProductionWIPStatusRejected || in.Quantity.GreaterThan(batch.Quantity) {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	linked, err := client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.ProductionWipBatchID(batch.ID), productionwipoutsourcingallocation.OutsourcingOrderItemID(*fact.SourceLineID)).Exist(ctx)
	if err != nil || !linked {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	return inspection, fact, nil
}

func resolveOutsourcingDispositionSourceBatch(ctx context.Context, client *ent.Client, fact *ent.OutsourcingFact) (int, error) {
	if fact == nil || fact.SourceLineID == nil {
		return 0, biz.ErrOutsourcingDispositionSourceInvalid
	}
	allocations, err := client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.OutsourcingOrderItemID(*fact.SourceLineID)).All(ctx)
	if err != nil {
		return 0, err
	}
	matched := 0
	for _, allocation := range allocations {
		batch, err := client.ProductionWIPBatch.Get(ctx, allocation.ProductionWipBatchID)
		if err != nil {
			return 0, err
		}
		if batch.Status == biz.ProductionWIPStatusRejected {
			if matched != 0 && matched != batch.ID {
				return 0, biz.ErrOutsourcingDispositionSourceInvalid
			}
			matched = batch.ID
		}
	}
	if matched == 0 {
		return 0, biz.ErrOutsourcingDispositionSourceInvalid
	}
	return matched, nil
}

func (r *operationalFactRepo) beginOutsourcingDispositionMutation(
	ctx context.Context,
	id int,
) (*inventoryDBTx, *ent.ProductionOrder, *ent.OutsourcingReturnDisposition, error) {
	preview, err := r.data.postgres.OutsourcingReturnDisposition.Get(ctx, id)
	if ent.IsNotFound(err) {
		return nil, nil, nil, biz.ErrOutsourcingDispositionNotFound
	}
	if err != nil {
		return nil, nil, nil, err
	}
	if preview.ProductionWipBatchID == nil {
		return nil, nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	sourcePreview, err := r.data.postgres.ProductionWIPBatch.Get(ctx, *preview.ProductionWipBatchID)
	if err != nil {
		return nil, nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	fail := func(err error) (*inventoryDBTx, *ent.ProductionOrder, *ent.OutsourcingReturnDisposition, error) {
		rollbackInventoryDBTx(ctx, tx, r.log)
		return nil, nil, nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_orders", sourcePreview.ProductionOrderID, biz.ErrProductionOrderNotFound); err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", sourcePreview.ProductionOrderItemID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_operations", sourcePreview.ProductionOrderOperationID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return fail(err)
	}
	wipIDs := []int{sourcePreview.ID}
	if preview.ResultWipBatchID != nil {
		wipIDs = append(wipIDs, *preview.ResultWipBatchID)
	}
	sort.Ints(wipIDs)
	for index, wipID := range wipIDs {
		if index > 0 && wipID == wipIDs[index-1] {
			continue
		}
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", wipID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
			return fail(err)
		}
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", preview.OutsourcingReturnFactID, biz.ErrOutsourcingFactNotFound); err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "quality_inspections", preview.QualityInspectionID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_return_dispositions", id, biz.ErrOutsourcingDispositionNotFound); err != nil {
		return fail(err)
	}
	order, err := tx.client.ProductionOrder.Get(ctx, sourcePreview.ProductionOrderID)
	if err != nil {
		return fail(err)
	}
	row, err := tx.client.OutsourcingReturnDisposition.Get(ctx, id)
	if err != nil {
		return fail(err)
	}
	if !sameOptionalInt(row.ProductionWipBatchID, preview.ProductionWipBatchID) ||
		!sameOptionalInt(row.ResultWipBatchID, preview.ResultWipBatchID) ||
		row.QualityInspectionID != preview.QualityInspectionID ||
		row.OutsourcingReturnFactID != preview.OutsourcingReturnFactID {
		return fail(biz.ErrOutsourcingDispositionConflict)
	}
	return tx, order, row, nil
}

func (r *operationalFactRepo) PostOutsourcingReturnDisposition(ctx context.Context, in *biz.OutsourcingReturnDispositionMutation) (*biz.OutsourcingReturnDisposition, error) {
	tx, order, row, err := r.beginOutsourcingDispositionMutation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if row.Status == biz.OutsourcingDispositionPosted && row.PostedBy != nil && *row.PostedBy == in.ActorID && row.Version == in.ExpectedVersion+1 {
		return commitOutsourcingDisposition(ctx, tx, row.ID)
	}
	if order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrOutsourcingDispositionState
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	if row.Status != biz.OutsourcingDispositionDraft {
		return nil, biz.ErrOutsourcingDispositionState
	}
	create := &biz.OutsourcingReturnDispositionCreate{QualityInspectionID: row.QualityInspectionID, DispositionType: row.DispositionType, Quantity: row.Quantity, ProductionWIPBatchID: row.ProductionWipBatchID}
	_, fact, err := validateOutsourcingDispositionSource(ctx, tx.client, create)
	if err != nil {
		return nil, err
	}
	if row.DispositionType == biz.OutsourcingDispositionReturnToVendor {
		activePayable, err := hasActiveFinanceFactForSource(ctx, tx.client, biz.FinanceFactPayable, biz.OutsourcingFactSourceType, fact.ID)
		if err != nil {
			return nil, err
		}
		if activePayable {
			return nil, biz.ErrOutsourcingReturnFinanceDependency
		}
		actor, sourceID, lineID := in.ActorID, row.ID, row.QualityInspectionID
		_, err = r.inv.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{SubjectType: fact.SubjectType, SubjectID: fact.SubjectID, ProductSkuID: fact.ProductSkuID, WarehouseID: fact.WarehouseID, LotID: fact.LotID, TxnType: biz.InventoryTxnOut, Direction: -1, Quantity: row.Quantity, UnitID: fact.UnitID, SourceType: biz.OutsourcingDispositionSourceType, SourceID: &sourceID, SourceLineID: &lineID, IdempotencyKey: fmt.Sprintf("OUTSOURCING_DISPOSITION:%d:OUT", row.ID), OccurredAt: time.Now(), CreatedBy: &actor, Note: &row.Reason})
		if err != nil {
			return nil, err
		}
	} else {
		resultID, err := postOutsourcingDispositionRework(ctx, tx, row, in.ActorID)
		if err != nil {
			return nil, err
		}
		row.ResultWipBatchID = &resultID
	}
	now := time.Now()
	update := tx.client.OutsourcingReturnDisposition.Update().Where(outsourcingreturndisposition.ID(row.ID), outsourcingreturndisposition.StatusEQ(biz.OutsourcingDispositionDraft), outsourcingreturndisposition.Version(in.ExpectedVersion)).SetStatus(biz.OutsourcingDispositionPosted).SetPostedAt(now).SetPostedBy(in.ActorID).AddVersion(1)
	if row.ResultWipBatchID != nil {
		update.SetResultWipBatchID(*row.ResultWipBatchID)
	}
	affected, err := update.Save(ctx)
	if err != nil || affected != 1 {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	return commitOutsourcingDisposition(ctx, tx, row.ID)
}

func postOutsourcingDispositionRework(ctx context.Context, tx *inventoryDBTx, row *ent.OutsourcingReturnDisposition, actorID int) (int, error) {
	if row.ProductionWipBatchID == nil {
		return 0, biz.ErrOutsourcingDispositionSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *row.ProductionWipBatchID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return 0, err
	}
	batchRow, err := tx.client.ProductionWIPBatch.Get(ctx, *row.ProductionWipBatchID)
	if err != nil {
		return 0, err
	}
	operationRow, err := tx.client.ProductionOrderOperation.Get(ctx, batchRow.ProductionOrderOperationID)
	if err != nil {
		return 0, err
	}
	children, err := tx.client.ProductionWIPBatch.Query().Where(productionwipbatch.SourceBatchID(batchRow.ID), productionwipbatch.FlowType(biz.ProductionWIPFlowRework), productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled)).All(ctx)
	if err != nil {
		return 0, err
	}
	batch, operation := entProductionWIPBatchToBiz(batchRow), entProductionOrderOperationToBiz(operationRow)
	if err := biz.ValidateProductionWIPRework(batch, operation, operation, sumProductionWIPBatchQuantity(children), row.Quantity, row.Reason); err != nil {
		return 0, err
	}
	batchNo, err := biz.BuildProductionWIPLineageBatchNo(batch.BatchNo, biz.ProductionWIPActionRework, 0, len(children)+1)
	if err != nil {
		return 0, err
	}
	affected, err := tx.client.ProductionWIPBatch.Update().Where(
		productionwipbatch.ID(batchRow.ID),
		productionwipbatch.StatusEQ(biz.ProductionWIPStatusRejected),
		productionwipbatch.VersionEQ(batchRow.Version),
	).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return 0, biz.ErrOutsourcingDispositionConflict
	}
	child, err := createProductionWIPChildBatch(ctx, tx.client, batchRow, operationRow.ID, batchNo, biz.ProductionWIPFlowRework, row.Quantity, actorID, &row.Reason)
	if err != nil {
		return 0, err
	}
	updatedParent, err := tx.client.ProductionWIPBatch.Get(ctx, batchRow.ID)
	if err != nil {
		return 0, err
	}
	if err := appendOutsourcingDispositionWIPEvent(
		ctx,
		tx,
		row,
		updatedParent,
		biz.ProductionWIPStatusRejected,
		biz.ProductionWIPStatusRejected,
		actorID,
		biz.ProductionWIPEventActionOutsourceRework,
		row.Reason,
		child.ID,
	); err != nil {
		return 0, err
	}
	return child.ID, nil
}

func (r *operationalFactRepo) CancelOutsourcingReturnDisposition(ctx context.Context, in *biz.OutsourcingReturnDispositionMutation) (*biz.OutsourcingReturnDisposition, error) {
	tx, order, row, err := r.beginOutsourcingDispositionMutation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if row.Status == biz.OutsourcingDispositionCancelled && row.CancelledBy != nil && *row.CancelledBy == in.ActorID && row.CancelReason != nil && *row.CancelReason == in.Reason && row.Version == in.ExpectedVersion+1 {
		return commitOutsourcingDisposition(ctx, tx, row.ID)
	}
	if order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrOutsourcingDispositionState
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	if row.Status != biz.OutsourcingDispositionDraft && row.Status != biz.OutsourcingDispositionPosted {
		return nil, biz.ErrOutsourcingDispositionState
	}
	if row.Status == biz.OutsourcingDispositionPosted {
		if row.DispositionType == biz.OutsourcingDispositionRework {
			if row.ResultWipBatchID == nil {
				return nil, biz.ErrOutsourcingDispositionState
			}
			if err := cancelOutsourcingDispositionRework(ctx, tx, row, *row.ResultWipBatchID, in.ActorID, in.Reason); err != nil {
				return nil, err
			}
		} else {
			original, err := tx.client.InventoryTxn.Query().Where(inventoryTxnCreatePredicate(biz.OutsourcingDispositionSourceType, row.ID, fmt.Sprintf("OUTSOURCING_DISPOSITION:%d:OUT", row.ID))).Only(ctx)
			if err != nil {
				return nil, err
			}
			actor, sourceID, lineID, reversalID := in.ActorID, row.ID, row.QualityInspectionID, original.ID
			_, err = r.inv.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{SubjectType: original.SubjectType, SubjectID: original.SubjectID, ProductSkuID: original.ProductSkuID, WarehouseID: original.WarehouseID, LotID: original.LotID, TxnType: biz.InventoryTxnReversal, Direction: 1, Quantity: original.Quantity, UnitID: original.UnitID, SourceType: biz.OutsourcingDispositionSourceType, SourceID: &sourceID, SourceLineID: &lineID, IdempotencyKey: fmt.Sprintf("OUTSOURCING_DISPOSITION:%d:REVERSAL", row.ID), ReversalOfTxnID: &reversalID, OccurredAt: time.Now(), CreatedBy: &actor, Note: &in.Reason})
			if err != nil {
				return nil, err
			}
		}
	}
	now := time.Now()
	affected, err := tx.client.OutsourcingReturnDisposition.Update().Where(outsourcingreturndisposition.ID(row.ID), outsourcingreturndisposition.StatusEQ(row.Status), outsourcingreturndisposition.Version(in.ExpectedVersion)).SetStatus(biz.OutsourcingDispositionCancelled).SetCancelledAt(now).SetCancelledBy(in.ActorID).SetCancelReason(in.Reason).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	return commitOutsourcingDisposition(ctx, tx, row.ID)
}

func inventoryTxnCreatePredicate(sourceType string, sourceID int, key string) predicate.InventoryTxn {
	return inventorytxn.And(inventorytxn.SourceType(sourceType), inventorytxn.SourceID(sourceID), inventorytxn.IdempotencyKey(key), inventorytxn.ReversalOfTxnIDIsNil())
}

func appendOutsourcingDispositionWIPEvent(
	ctx context.Context,
	tx *inventoryDBTx,
	row *ent.OutsourcingReturnDisposition,
	batch *ent.ProductionWIPBatch,
	fromStatus, toStatus string,
	actorID int,
	action, reason string,
	resultBatchID int,
) error {
	if tx == nil || row == nil || batch == nil {
		return biz.ErrOutsourcingDispositionSourceInvalid
	}
	payload := fmt.Sprintf("%d:%d:%s:%d:%d:%s", row.ID, row.Version, action, batch.Version, actorID, reason)
	sum := sha256.Sum256([]byte(payload))
	result := map[string]any{
		"outsourcing_return_disposition_id": row.ID,
		"outsourcing_return_fact_id":        row.OutsourcingReturnFactID,
		"source_wip_batch_id":               optionalIntValue(row.ProductionWipBatchID),
		"result_wip_batch_id":               resultBatchID,
		"from_status":                       fromStatus,
		"to_status":                         toStatus,
	}
	return tx.client.ProductionWIPEvent.Create().
		SetProductionWipBatchID(batch.ID).
		SetActorID(actorID).
		SetAction(action).
		SetFromStatus(fromStatus).
		SetToStatus(toStatus).
		SetBatchVersion(batch.Version).
		SetQuantity(row.Quantity).
		SetIdempotencyKey(fmt.Sprintf("OUTSOURCING_DISPOSITION:%d:%s:%d", row.ID, action, row.Version)).
		SetIntentHash(hex.EncodeToString(sum[:])).
		SetResultContract(biz.ProductionWIPMutationResultV1).
		SetMutationResult(result).
		SetReason(reason).
		Exec(ctx)
}

func (r *operationalFactRepo) GetOutsourcingReturnDisposition(ctx context.Context, id int) (*biz.OutsourcingReturnDisposition, error) {
	row, err := r.data.postgres.OutsourcingReturnDisposition.Get(ctx, id)
	if ent.IsNotFound(err) {
		return nil, biz.ErrOutsourcingDispositionNotFound
	}
	return entOutsourcingDispositionToBiz(row), err
}
func (r *operationalFactRepo) ListOutsourcingReturnDispositions(ctx context.Context, filter biz.OutsourcingReturnDispositionFilter) ([]*biz.OutsourcingReturnDisposition, int, error) {
	query := r.data.postgres.OutsourcingReturnDisposition.Query()
	if filter.QualityInspectionID > 0 {
		query = query.Where(outsourcingreturndisposition.QualityInspectionID(filter.QualityInspectionID))
	}
	if filter.OutsourcingReturnFactID > 0 {
		query = query.Where(outsourcingreturndisposition.OutsourcingReturnFactID(filter.OutsourcingReturnFactID))
	}
	if filter.Status != "" {
		query = query.Where(outsourcingreturndisposition.Status(filter.Status))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(outsourcingreturndisposition.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.OutsourcingReturnDisposition, 0, len(rows))
	for _, row := range rows {
		out = append(out, entOutsourcingDispositionToBiz(row))
	}
	return out, total, nil
}
func commitOutsourcingDisposition(ctx context.Context, tx *inventoryDBTx, id int) (*biz.OutsourcingReturnDisposition, error) {
	row, err := tx.client.OutsourcingReturnDisposition.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entOutsourcingDispositionToBiz(row), nil
}
func entOutsourcingDispositionToBiz(row *ent.OutsourcingReturnDisposition) *biz.OutsourcingReturnDisposition {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingReturnDisposition{ID: row.ID, DispositionNo: row.DispositionNo, QualityInspectionID: row.QualityInspectionID, OutsourcingReturnFactID: row.OutsourcingReturnFactID, DispositionType: row.DispositionType, Status: row.Status, Quantity: row.Quantity, ProductionWIPBatchID: row.ProductionWipBatchID, ResultWIPBatchID: row.ResultWipBatchID, Reason: row.Reason, PostedAt: row.PostedAt, PostedBy: row.PostedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy, Version: row.Version}
}

func cancelOutsourcingDispositionRework(ctx context.Context, tx *inventoryDBTx, row *ent.OutsourcingReturnDisposition, resultBatchID, actorID int, reason string) error {
	if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", resultBatchID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return err
	}
	batch, err := tx.client.ProductionWIPBatch.Get(ctx, resultBatchID)
	if err != nil {
		return err
	}
	children, err := tx.client.ProductionWIPBatch.Query().Where(productionwipbatch.SourceBatchID(resultBatchID), productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled)).Exist(ctx)
	if err != nil {
		return err
	}
	events, err := tx.client.ProductionWIPEvent.Query().Where(productionwipevent.ProductionWipBatchID(resultBatchID)).All(ctx)
	if err != nil {
		return err
	}
	inspections, err := tx.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(resultBatchID)).Exist(ctx)
	if err != nil {
		return err
	}
	allocations, err := tx.client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.ProductionWipBatchID(resultBatchID)).Exist(ctx)
	if err != nil {
		return err
	}
	if children || inspections || allocations || len(events) != 0 ||
		batch.Status != biz.ProductionWIPStatusPlanned ||
		batch.ExecutionMode != nil ||
		batch.StartedAt != nil ||
		batch.CompletedAt != nil {
		return biz.ErrOutsourcingDispositionState
	}
	affected, err := tx.client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.VersionEQ(batch.Version), productionwipbatch.StatusEQ(biz.ProductionWIPStatusPlanned)).SetStatus(biz.ProductionWIPStatusCancelled).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return biz.ErrOutsourcingDispositionConflict
	}
	updated, err := tx.client.ProductionWIPBatch.Get(ctx, batch.ID)
	if err != nil {
		return err
	}
	return appendOutsourcingDispositionWIPEvent(
		ctx,
		tx,
		row,
		updated,
		biz.ProductionWIPStatusPlanned,
		biz.ProductionWIPStatusCancelled,
		actorID,
		biz.ProductionWIPEventActionOutsourceCancel,
		reason,
		batch.ID,
	)
}
