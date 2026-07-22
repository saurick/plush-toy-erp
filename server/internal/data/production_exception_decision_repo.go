package data

import (
	"context"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionexceptiondecision"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/shopspring/decimal"
)

var _ biz.ProductionExceptionDecisionRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) SubmitProductionException(ctx context.Context, in *biz.ProductionExceptionSubmit, hash string) (*biz.ProductionExceptionDecision, error) {
	if replay, found, err := findProductionExceptionReplay(ctx, r.data.postgres, in, hash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", in.ProductionOrderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if err := validateProductionExceptionSource(ctx, tx.client, in); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionExceptionDecision.Create().SetDecisionNo(in.DecisionNo).SetDecisionType(in.DecisionType).SetStatus(biz.ProductionExceptionSubmitted).SetProductionOrderID(in.ProductionOrderID).SetProductionOrderItemID(in.ProductionOrderItemID).SetNillableProductionMaterialRequirementID(in.ProductionMaterialRequirementID).SetNillableProductionWipBatchID(in.ProductionWIPBatchID).SetNillableQualityInspectionID(in.QualityInspectionID).SetRequestedQuantity(in.RequestedQuantity).SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(hash).SetRequestedBy(in.RequestedBy).Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := findProductionExceptionReplay(ctx, r.data.postgres, in, hash); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	return commitProductionException(ctx, tx, row.ID)
}

func findProductionExceptionReplay(ctx context.Context, client *ent.Client, in *biz.ProductionExceptionSubmit, hash string) (*biz.ProductionExceptionDecision, bool, error) {
	row, err := client.ProductionExceptionDecision.Query().Where(productionexceptiondecision.RequestedBy(in.RequestedBy), productionexceptiondecision.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entProductionExceptionToBiz(row), true, nil
}

func validateProductionExceptionSource(ctx context.Context, client *ent.Client, in *biz.ProductionExceptionSubmit) error {
	item, err := client.ProductionOrderItem.Get(ctx, in.ProductionOrderItemID)
	if err != nil || item.ProductionOrderID != in.ProductionOrderID {
		return biz.ErrProductionExceptionSourceInvalid
	}
	switch in.DecisionType {
	case biz.ProductionExceptionOverIssue:
		requirement, err := client.ProductionOrderMaterialRequirement.Get(ctx, *in.ProductionMaterialRequirementID)
		if err != nil || requirement.ProductionOrderID != in.ProductionOrderID || requirement.ProductionOrderItemID != in.ProductionOrderItemID {
			return biz.ErrProductionExceptionSourceInvalid
		}
	case biz.ProductionExceptionWIPConcession:
		batch, inspection, err := productionExceptionWIPSource(ctx, client, *in.ProductionWIPBatchID, *in.QualityInspectionID)
		if err != nil || batch.ProductionOrderID != in.ProductionOrderID || batch.ProductionOrderItemID != in.ProductionOrderItemID || batch.Status != biz.ProductionWIPStatusRejected || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject || !batch.Quantity.Equal(in.RequestedQuantity) {
			return biz.ErrProductionExceptionSourceInvalid
		}
	case biz.ProductionExceptionScrap:
		if in.ProductionWIPBatchID != nil {
			batch, err := client.ProductionWIPBatch.Get(ctx, *in.ProductionWIPBatchID)
			if err != nil || batch.ProductionOrderID != in.ProductionOrderID || batch.ProductionOrderItemID != in.ProductionOrderItemID || batch.Status == biz.ProductionWIPStatusCancelled || in.RequestedQuantity.GreaterThan(batch.Quantity) {
				return biz.ErrProductionExceptionSourceInvalid
			}
		} else if _, _, err := validateStockedScrapSource(ctx, client, in.ProductionOrderID, in.ProductionOrderItemID, *in.QualityInspectionID, in.RequestedQuantity); err != nil {
			return err
		}
	}
	return nil
}

func productionExceptionWIPSource(ctx context.Context, client *ent.Client, batchID, inspectionID int) (*ent.ProductionWIPBatch, *ent.QualityInspection, error) {
	batch, err := client.ProductionWIPBatch.Get(ctx, batchID)
	if err != nil {
		return nil, nil, err
	}
	inspection, err := client.QualityInspection.Get(ctx, inspectionID)
	if err != nil || inspection.ProductionWipBatchID == nil || *inspection.ProductionWipBatchID != batchID || inspection.SourceType == nil || *inspection.SourceType != biz.ProductionWIPQualitySourceType || inspection.SourceID == nil || *inspection.SourceID != batchID {
		return nil, nil, biz.ErrProductionExceptionSourceInvalid
	}
	return batch, inspection, nil
}

func validateStockedScrapSource(ctx context.Context, client *ent.Client, orderID, itemID, inspectionID int, quantity decimal.Decimal) (*ent.QualityInspection, *ent.ProductionFact, error) {
	inspection, err := client.QualityInspection.Get(ctx, inspectionID)
	if err != nil || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject || inspection.InventoryLotID == nil {
		return nil, nil, biz.ErrProductionExceptionSourceInvalid
	}
	fact, err := client.ProductionFact.Query().Where(productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt), productionfact.Status(biz.OperationalFactStatusPosted), productionfact.SourceType(biz.ProductionOrderSourceType), productionfact.SourceID(orderID), productionfact.SourceLineID(itemID), productionfact.LotID(*inspection.InventoryLotID)).Only(ctx)
	if err != nil || quantity.GreaterThan(fact.Quantity) {
		return nil, nil, biz.ErrProductionExceptionSourceInvalid
	}
	return inspection, fact, nil
}

func (r *operationalFactRepo) ApproveProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return r.decideProductionException(ctx, in, biz.ProductionExceptionApproved)
}
func (r *operationalFactRepo) RejectProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return r.decideProductionException(ctx, in, biz.ProductionExceptionRejected)
}
func (r *operationalFactRepo) CancelProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return r.decideProductionException(ctx, in, biz.ProductionExceptionCancelled)
}

func (r *operationalFactRepo) decideProductionException(ctx context.Context, in *biz.ProductionExceptionMutation, target string) (*biz.ProductionExceptionDecision, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_exception_decisions", in.ID, biz.ErrProductionExceptionNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionExceptionDecision.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if row.Status == target && row.Version == in.ExpectedVersion+1 && row.DecidedBy != nil && *row.DecidedBy == in.ActorID && row.DecisionReason != nil && *row.DecisionReason == in.Reason {
		if target != biz.ProductionExceptionApproved || productionExceptionApprovalReplayMatches(row, in.ApprovedQuantity) {
			return commitProductionException(ctx, tx, row.ID)
		}
	}
	canCancelPostedScrap := target == biz.ProductionExceptionCancelled && row.Status == biz.ProductionExceptionApproved && row.DecisionType == biz.ProductionExceptionScrap && row.QualityInspectionID != nil
	if (row.Status != biz.ProductionExceptionSubmitted && !canCancelPostedScrap) || row.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if target == biz.ProductionExceptionApproved {
		approved := row.RequestedQuantity
		if in.ApprovedQuantity != nil {
			approved = *in.ApprovedQuantity
		}
		if !approved.IsPositive() || approved.GreaterThan(row.RequestedQuantity) {
			return nil, biz.ErrProductionExceptionApprovalAmount
		}
		if err := r.applyProductionExceptionApproval(ctx, tx, row, approved, in.ActorID); err != nil {
			return nil, err
		}
	} else if canCancelPostedScrap {
		if err := r.reverseStockedProductionScrap(ctx, tx, row, in.ActorID, in.Reason); err != nil {
			return nil, err
		}
	}
	now := time.Now()
	update := tx.client.ProductionExceptionDecision.Update().Where(productionexceptiondecision.ID(row.ID), productionexceptiondecision.StatusEQ(row.Status), productionexceptiondecision.VersionEQ(in.ExpectedVersion)).SetStatus(target).SetDecidedAt(now).SetDecidedBy(in.ActorID).SetDecisionReason(in.Reason).AddVersion(1)
	if target == biz.ProductionExceptionApproved {
		approved := row.RequestedQuantity
		if in.ApprovedQuantity != nil {
			approved = *in.ApprovedQuantity
		}
		update.SetApprovedQuantity(approved)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrProductionExceptionConflict
	}
	return commitProductionException(ctx, tx, row.ID)
}

func productionExceptionApprovalReplayMatches(row *ent.ProductionExceptionDecision, requested *decimal.Decimal) bool {
	if row == nil || row.ApprovedQuantity == nil {
		return false
	}
	want := row.RequestedQuantity
	if requested != nil {
		want = *requested
	}
	return row.ApprovedQuantity.Equal(want)
}

func (r *operationalFactRepo) reverseStockedProductionScrap(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionExceptionDecision, actorID int, reason string) error {
	fact, err := tx.client.ProductionFact.Query().Where(productionfact.FactType(biz.ProductionFactScrap), productionfact.Status(biz.OperationalFactStatusPosted), productionfact.SourceType(biz.ProductionExceptionSourceType), productionfact.SourceID(row.ID)).Only(ctx)
	if err != nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if err := r.applyProductionFactInventory(ctx, tx, fact, true); err != nil {
		return err
	}
	if err := updateOperationalFactStatus(ctx, tx, "production_facts", fact.ID, biz.OperationalFactStatusCancelled, "posted_at", nil); err != nil {
		return err
	}
	_ = actorID
	_ = reason
	return nil
}

func (r *operationalFactRepo) applyProductionExceptionApproval(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionExceptionDecision, approved decimal.Decimal, actorID int) error {
	switch row.DecisionType {
	case biz.ProductionExceptionOverIssue:
		return lockOperationalFactRow(ctx, tx, "production_order_material_requirements", *row.ProductionMaterialRequirementID, biz.ErrProductionExceptionSourceInvalid)
	case biz.ProductionExceptionWIPConcession:
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *row.ProductionWipBatchID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return err
		}
		batch, inspection, err := productionExceptionWIPSource(ctx, tx.client, *row.ProductionWipBatchID, *row.QualityInspectionID)
		if err != nil || batch.Status != biz.ProductionWIPStatusRejected || inspection.Status != biz.QualityInspectionStatusRejected || !approved.Equal(batch.Quantity) {
			return biz.ErrProductionExceptionSourceInvalid
		}
		affected, err := tx.client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.StatusEQ(biz.ProductionWIPStatusRejected), productionwipbatch.VersionEQ(batch.Version)).SetStatus(biz.ProductionWIPStatusAccepted).AddVersion(1).Save(ctx)
		if err != nil || affected != 1 {
			return biz.ErrProductionExceptionConflict
		}
	case biz.ProductionExceptionScrap:
		if row.ProductionWipBatchID != nil {
			if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *row.ProductionWipBatchID, biz.ErrProductionExceptionSourceInvalid); err != nil {
				return err
			}
			batch, err := tx.client.ProductionWIPBatch.Get(ctx, *row.ProductionWipBatchID)
			if err != nil || approved.GreaterThan(batch.Quantity) || !approved.Equal(batch.Quantity) {
				return biz.ErrProductionExceptionApprovalAmount
			}
			affected, err := tx.client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.StatusEQ(batch.Status), productionwipbatch.VersionEQ(batch.Version)).SetStatus(biz.ProductionWIPStatusCancelled).AddVersion(1).Save(ctx)
			if err != nil || affected != 1 {
				return biz.ErrProductionExceptionConflict
			}
			return nil
		}
		inspection, source, err := validateStockedScrapSource(ctx, tx.client, row.ProductionOrderID, row.ProductionOrderItemID, *row.QualityInspectionID, approved)
		if err != nil {
			return err
		}
		sourceType, sourceID, lineID, note := biz.ProductionExceptionSourceType, row.ID, inspection.ID, row.Reason
		fact, err := tx.client.ProductionFact.Create().SetFactNo("SCRAP-" + row.DecisionNo).SetFactType(biz.ProductionFactScrap).SetStatus(biz.OperationalFactStatusDraft).SetSubjectType(source.SubjectType).SetSubjectID(source.SubjectID).SetNillableProductSkuID(source.ProductSkuID).SetWarehouseID(source.WarehouseID).SetUnitID(source.UnitID).SetNillableLotID(source.LotID).SetQuantity(approved).SetSourceType(sourceType).SetSourceID(sourceID).SetSourceLineID(lineID).SetIdempotencyKey(fmt.Sprintf("PRODUCTION_EXCEPTION:%d:SCRAP", row.ID)).SetOccurredAt(time.Now()).SetNote(note).Save(ctx)
		if err != nil {
			return err
		}
		if err := r.applyProductionFactInventory(ctx, tx, fact, false); err != nil {
			return err
		}
		now := time.Now()
		return updateOperationalFactStatus(ctx, tx, "production_facts", fact.ID, biz.OperationalFactStatusPosted, "posted_at", &now)
	}
	return nil
}

func (r *operationalFactRepo) GetProductionException(ctx context.Context, id int) (*biz.ProductionExceptionDecision, error) {
	row, err := r.data.postgres.ProductionExceptionDecision.Get(ctx, id)
	if ent.IsNotFound(err) {
		return nil, biz.ErrProductionExceptionNotFound
	}
	return entProductionExceptionToBiz(row), err
}

func commitProductionException(ctx context.Context, tx *inventoryDBTx, id int) (*biz.ProductionExceptionDecision, error) {
	row, err := tx.client.ProductionExceptionDecision.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entProductionExceptionToBiz(row), nil
}

func entProductionExceptionToBiz(row *ent.ProductionExceptionDecision) *biz.ProductionExceptionDecision {
	if row == nil {
		return nil
	}
	return &biz.ProductionExceptionDecision{ID: row.ID, DecisionNo: row.DecisionNo, DecisionType: row.DecisionType, Status: row.Status, ProductionOrderID: row.ProductionOrderID, ProductionOrderItemID: row.ProductionOrderItemID, ProductionMaterialRequirementID: row.ProductionMaterialRequirementID, ProductionWIPBatchID: row.ProductionWipBatchID, QualityInspectionID: row.QualityInspectionID, RequestedQuantity: row.RequestedQuantity, ApprovedQuantity: row.ApprovedQuantity, Reason: row.Reason, Version: row.Version, RequestedBy: row.RequestedBy, RequestedAt: row.RequestedAt, DecidedBy: row.DecidedBy, DecidedAt: row.DecidedAt, DecisionReason: row.DecisionReason}
}
