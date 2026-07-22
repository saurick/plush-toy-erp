package data

import (
	"context"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/outsourcingreturndisposition"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
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
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", *inspection.SourceID, biz.ErrOutsourcingFactNotFound); err != nil {
		return nil, err
	}
	if in.DispositionType == biz.OutsourcingDispositionRework && in.ProductionWIPBatchID == nil {
		lockedFact, err := tx.client.OutsourcingFact.Get(ctx, *inspection.SourceID)
		if err != nil {
			return nil, err
		}
		batchID, err := resolveOutsourcingDispositionReworkBatch(ctx, tx.client, lockedFact)
		if err != nil {
			return nil, err
		}
		in.ProductionWIPBatchID = &batchID
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
	if err != nil || inspection.SourceType == nil || *inspection.SourceType != biz.QualityInspectionSourceOutsourcingFact || inspection.SourceID == nil || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	fact, err := client.OutsourcingFact.Get(ctx, *inspection.SourceID)
	if err != nil || fact.FactType != biz.OutsourcingFactReturnReceipt || fact.Status != biz.OperationalFactStatusPosted || fact.LotID == nil || in.Quantity.GreaterThan(fact.Quantity) {
		return nil, nil, biz.ErrOutsourcingDispositionSourceInvalid
	}
	if in.DispositionType == biz.OutsourcingDispositionRework {
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
	}
	return inspection, fact, nil
}

func resolveOutsourcingDispositionReworkBatch(ctx context.Context, client *ent.Client, fact *ent.OutsourcingFact) (int, error) {
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

func (r *operationalFactRepo) PostOutsourcingReturnDisposition(ctx context.Context, in *biz.OutsourcingReturnDispositionMutation) (*biz.OutsourcingReturnDisposition, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_return_dispositions", in.ID, biz.ErrOutsourcingDispositionNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.OutsourcingReturnDisposition.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if row.Status == biz.OutsourcingDispositionPosted && row.PostedBy != nil && *row.PostedBy == in.ActorID && row.Version == in.ExpectedVersion+1 {
		return commitOutsourcingDisposition(ctx, tx, row.ID)
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrOutsourcingDispositionConflict
	}
	if row.Status != biz.OutsourcingDispositionDraft {
		return nil, biz.ErrOutsourcingDispositionState
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", row.OutsourcingReturnFactID, biz.ErrOutsourcingFactNotFound); err != nil {
		return nil, err
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
	child, err := createProductionWIPChildBatch(ctx, tx.client, batchRow, operationRow.ID, batchNo, biz.ProductionWIPFlowRework, row.Quantity, actorID, &row.Reason)
	if err != nil {
		return 0, err
	}
	return child.ID, nil
}

func (r *operationalFactRepo) CancelOutsourcingReturnDisposition(ctx context.Context, in *biz.OutsourcingReturnDispositionMutation) (*biz.OutsourcingReturnDisposition, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_return_dispositions", in.ID, biz.ErrOutsourcingDispositionNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.OutsourcingReturnDisposition.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if row.Status == biz.OutsourcingDispositionCancelled && row.CancelledBy != nil && *row.CancelledBy == in.ActorID && row.CancelReason != nil && *row.CancelReason == in.Reason && row.Version == in.ExpectedVersion+1 {
		return commitOutsourcingDisposition(ctx, tx, row.ID)
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
			if err := cancelOutsourcingDispositionRework(ctx, tx, *row.ResultWipBatchID); err != nil {
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

func cancelOutsourcingDispositionRework(ctx context.Context, tx *inventoryDBTx, resultBatchID int) error {
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
	if children || batch.Status == biz.ProductionWIPStatusCancelled {
		return biz.ErrOutsourcingDispositionState
	}
	affected, err := tx.client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.VersionEQ(batch.Version), productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled)).SetStatus(biz.ProductionWIPStatusCancelled).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return biz.ErrOutsourcingDispositionConflict
	}
	return nil
}
