package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"time"

	"github.com/shopspring/decimal"
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
	if in.DispositionType != biz.OutsourcingDispositionReturnToVendor {
		return nil, biz.ErrProcessRuntimeRequired
	}
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
	if batchID > 0 {
		in.ProductionWIPBatchID = &batchID
	} else {
		in.ProductionWIPBatchID = nil
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	order, err := lockOutsourcingDispositionSource(ctx, tx, factPreview, in.ProductionWIPBatchID, nil)
	if err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "quality_inspections", inspection.ID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return nil, err
	}
	if order != nil && order.Status != biz.ProductionOrderStatusReleased {
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
	inspection, fact, err := validateOutsourcingDispositionSource(ctx, tx.client, in, 0)
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
	if err := validateOutsourcingDispositionAccess(ctx, client, row); err != nil {
		return nil, false, err
	}
	return entOutsourcingDispositionToBiz(row), true, nil
}

func validateOutsourcingDispositionSource(ctx context.Context, client *ent.Client, in *biz.OutsourcingReturnDispositionCreate, excludeID int) (*ent.QualityInspection, *ent.OutsourcingFact, error) {
	inspection, err := client.QualityInspection.Get(ctx, in.QualityInspectionID)
	if err != nil || inspection.SupersededAt != nil || inspection.SourceType == nil || *inspection.SourceType != biz.QualityInspectionSourceOutsourcingFact || inspection.SourceID == nil || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	fact, err := client.OutsourcingFact.Get(ctx, *inspection.SourceID)
	if err != nil || fact.FactType != biz.OutsourcingFactReturnReceipt || fact.Status != biz.OperationalFactStatusPosted || fact.LotID == nil || in.Quantity.GreaterThan(fact.Quantity) {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	if fact.SourceType == nil || *fact.SourceType != biz.OutsourcingOrderSourceType || fact.SourceID == nil || fact.SourceLineID == nil {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	if err := validateOutsourcingFactAccess(ctx, fact); err != nil {
		return nil, nil, err
	}
	limit := fact.Quantity
	batchID, err := resolveOutsourcingDispositionSourceBatch(ctx, client, fact)
	if err != nil || batchID != optionalIntValue(in.ProductionWIPBatchID) {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	if batchID > 0 {
		batch, err := client.ProductionWIPBatch.Get(ctx, batchID)
		if err != nil || batch.Status != biz.ProductionWIPStatusRejected {
			return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
		}
		limit = decimal.Min(limit, batch.Quantity)
	}
	active, err := client.OutsourcingReturnDisposition.Query().Where(
		outsourcingreturndisposition.OutsourcingReturnFactID(fact.ID),
		outsourcingreturndisposition.StatusNEQ(biz.OutsourcingDispositionCancelled),
		outsourcingreturndisposition.IDNEQ(excludeID),
	).All(ctx)
	if err != nil {
		return nil, nil, err
	}
	allocated := decimal.Zero
	for _, disposition := range active {
		allocated = allocated.Add(disposition.Quantity)
	}
	if allocated.Add(in.Quantity).GreaterThan(limit) {
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
	if matched == 0 && len(allocations) > 0 {
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
	factPreview, err := r.data.postgres.OutsourcingFact.Get(ctx, preview.OutsourcingReturnFactID)
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
	order, err := lockOutsourcingDispositionSource(ctx, tx, factPreview, preview.ProductionWipBatchID, preview.ResultWipBatchID)
	if err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "quality_inspections", preview.QualityInspectionID, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_return_dispositions", id, biz.ErrOutsourcingDispositionNotFound); err != nil {
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
	if err := validateOutsourcingDispositionAccess(ctx, tx.client, row); err != nil {
		return fail(err)
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
	if order != nil && order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrOutsourcingDispositionState
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	if row.Status != biz.OutsourcingDispositionDraft {
		return nil, biz.ErrOutsourcingDispositionState
	}
	if row.DispositionType != biz.OutsourcingDispositionReturnToVendor {
		return nil, biz.ErrProcessRuntimeRequired
	}
	create := &biz.OutsourcingReturnDispositionCreate{QualityInspectionID: row.QualityInspectionID, DispositionType: row.DispositionType, Quantity: row.Quantity, ProductionWIPBatchID: row.ProductionWipBatchID}
	_, fact, err := validateOutsourcingDispositionSource(ctx, tx.client, create, row.ID)
	if err != nil {
		return nil, err
	}
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
	now := time.Now()
	update := tx.client.OutsourcingReturnDisposition.Update().Where(outsourcingreturndisposition.ID(row.ID), outsourcingreturndisposition.StatusEQ(biz.OutsourcingDispositionDraft), outsourcingreturndisposition.Version(in.ExpectedVersion)).SetStatus(biz.OutsourcingDispositionPosted).SetPostedAt(now).SetPostedBy(in.ActorID).AddVersion(1)
	affected, err := update.Save(ctx)
	if err != nil || affected != 1 {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	return commitOutsourcingDisposition(ctx, tx, row.ID)
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
	if order != nil && order.Status != biz.ProductionOrderStatusReleased && (order.Status != biz.ProductionOrderStatusClosed || row.Status != biz.OutsourcingDispositionPosted || row.DispositionType != biz.OutsourcingDispositionReturnToVendor) {
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
			fact, err := tx.client.OutsourcingFact.Get(ctx, row.OutsourcingReturnFactID)
			if err != nil {
				return nil, err
			}
			_, itemID, err := outsourcingOrderSourceIDsFromFact(fact)
			if err != nil {
				return nil, err
			}
			item, err := tx.client.OutsourcingOrderItem.Get(ctx, itemID)
			if err != nil {
				return nil, err
			}
			// Revoking return credit must not make already-posted replacements excessive.
			if err := validateOutsourcingOrderFactQuantity(ctx, tx.client, item, biz.OutsourcingFactReturnReceipt, row.Quantity); err != nil {
				return nil, err
			}
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
	if err != nil {
		return nil, err
	}
	if err := validateOutsourcingDispositionAccess(ctx, r.data.postgres, row); err != nil {
		return nil, err
	}
	return entOutsourcingDispositionToBiz(row), nil
}
func (r *operationalFactRepo) ListOutsourcingReturnDispositions(ctx context.Context, filter biz.OutsourcingReturnDispositionFilter) ([]*biz.OutsourcingReturnDisposition, int, error) {
	query := r.data.postgres.OutsourcingReturnDisposition.Query().Where(outsourcingDispositionWarehousePredicate(ctx)...)
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

// Match the WIP -> contract -> receipt -> inspection lock order used by
// assignment, source receipts and quality. Ordinary returns have no WIP owner.
func lockOutsourcingDispositionSource(ctx context.Context, tx *inventoryDBTx, fact *ent.OutsourcingFact, batchID, resultID *int) (*ent.ProductionOrder, error) {
	var order *ent.ProductionOrder
	if batchID != nil {
		batch, err := tx.client.ProductionWIPBatch.Get(ctx, *batchID)
		if err != nil {
			return nil, biz.ErrOutsourcingDispositionSourceInvalid
		}
		for _, lock := range []struct {
			table string
			id    int
		}{{"production_orders", batch.ProductionOrderID}, {"production_order_items", batch.ProductionOrderItemID}, {"production_order_operations", batch.ProductionOrderOperationID}} {
			if err := lockOperationalFactRow(ctx, tx, lock.table, lock.id, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
				return nil, err
			}
		}
		ids := []int{*batchID}
		if resultID != nil {
			ids = append(ids, *resultID)
		}
		sort.Ints(ids)
		for i, id := range ids {
			if i > 0 && id == ids[i-1] {
				continue
			}
			if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", id, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
				return nil, err
			}
		}
		order, err = tx.client.ProductionOrder.Get(ctx, batch.ProductionOrderID)
		if err != nil {
			return nil, err
		}
	}
	orderID, itemID, err := outsourcingOrderSourceIDsFromFact(fact)
	if err != nil {
		return nil, err
	}
	for _, lock := range []struct {
		table string
		id    int
	}{{"outsourcing_orders", orderID}, {"outsourcing_order_items", itemID}, {"outsourcing_facts", fact.ID}} {
		if err := lockOperationalFactRow(ctx, tx, lock.table, lock.id, biz.ErrOutsourcingDispositionSourceInvalid); err != nil {
			return nil, err
		}
	}
	return order, nil
}

func commitOutsourcingDisposition(ctx context.Context, tx *inventoryDBTx, id int) (*biz.OutsourcingReturnDisposition, error) {
	row, err := tx.client.OutsourcingReturnDisposition.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := syncOutsourcingFactHandoffs(ctx, tx.client, row.OutsourcingReturnFactID); err != nil {
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
