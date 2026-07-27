package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/productionexceptiondecision"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/shopspring/decimal"
)

var _ biz.ProductionExceptionDecisionRepo = (*operationalFactRepo)(nil)

func activeProductionOverIssuePredicates() []predicate.ProductionExceptionDecision {
	return []predicate.ProductionExceptionDecision{
		productionexceptiondecision.DecisionType(biz.ProductionExceptionOverIssue),
		productionexceptiondecision.Status(biz.ProductionExceptionApproved),
		productionexceptiondecision.ExecutionStatus(biz.ProductionExceptionExecutionPending),
	}
}

func (r *operationalFactRepo) ResolveProductionExceptionSource(ctx context.Context, in *biz.ProductionExceptionSubmit) error {
	if in == nil || in.ProductionWIPBatchID == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	batch, err := r.data.postgres.ProductionWIPBatch.Get(ctx, *in.ProductionWIPBatchID)
	if err != nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	in.ProductionOrderID, in.ProductionOrderItemID = batch.ProductionOrderID, batch.ProductionOrderItemID
	return nil
}

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
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", in.ProductionOrderItemID, biz.ErrProductionExceptionSourceInvalid); err != nil {
		return nil, err
	}
	if in.ProductionMaterialRequirementID != nil {
		if err := lockOperationalFactRow(ctx, tx, "production_order_material_requirements", *in.ProductionMaterialRequirementID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return nil, err
		}
	}
	if in.ProductionWIPBatchID != nil {
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *in.ProductionWIPBatchID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return nil, err
		}
	}
	if in.QualityInspectionID != nil {
		if err := lockOperationalFactRow(ctx, tx, "quality_inspections", *in.QualityInspectionID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return nil, err
		}
	}
	order, err := tx.client.ProductionOrder.Get(ctx, in.ProductionOrderID)
	if err != nil || order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionExceptionInvalidState
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
	case biz.ProductionExceptionWIPConcession, biz.ProductionExceptionScrap:
		batch, inspection, err := productionExceptionWIPSource(ctx, client, *in.ProductionWIPBatchID, *in.QualityInspectionID)
		if err != nil || batch.ProductionOrderID != in.ProductionOrderID || batch.ProductionOrderItemID != in.ProductionOrderItemID || batch.Status != biz.ProductionWIPStatusRejected || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject || !batch.Quantity.Equal(in.RequestedQuantity) {
			return biz.ErrProductionExceptionSourceInvalid
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
	if err != nil || inspection.SupersededAt != nil || inspection.ProductionWipBatchID == nil || *inspection.ProductionWipBatchID != batchID || inspection.SourceType == nil || *inspection.SourceType != biz.ProductionWIPQualitySourceType || inspection.SourceID == nil || *inspection.SourceID != batchID {
		return nil, nil, biz.ErrProductionExceptionSourceInvalid
	}
	return batch, inspection, nil
}

func (r *operationalFactRepo) ApproveProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrProcessRuntimeRequired
}
func (r *operationalFactRepo) RejectProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrProcessRuntimeRequired
}
func (r *operationalFactRepo) CancelProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return r.decideProductionException(ctx, in, biz.ProductionExceptionCancelled, nil, nil)
}

func (r *operationalFactRepo) ApproveProductionExceptionForProcessCommand(
	ctx context.Context,
	in *biz.ProductionExceptionMutation,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	return r.decideProductionException(ctx, in, biz.ProductionExceptionApproved, command, result)
}

func (r *operationalFactRepo) RejectProductionExceptionForProcessCommand(
	ctx context.Context,
	in *biz.ProductionExceptionMutation,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	return r.decideProductionException(ctx, in, biz.ProductionExceptionRejected, command, result)
}

func (r *operationalFactRepo) decideProductionException(
	ctx context.Context,
	in *biz.ProductionExceptionMutation,
	target string,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	tx, order, row, err := r.beginProductionExceptionMutation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.Status == target && row.Version == in.ExpectedVersion+1 && row.DecidedBy != nil && *row.DecidedBy == in.ActorID && row.DecisionReason != nil && *row.DecisionReason == in.Reason {
		if target != biz.ProductionExceptionApproved || productionExceptionApprovalReplayMatches(row, in.ApprovedQuantity) {
			return commitProductionException(ctx, tx, row.ID)
		}
	}
	if order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if row.Status != biz.ProductionExceptionSubmitted || row.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if (target == biz.ProductionExceptionApproved || target == biz.ProductionExceptionRejected) && row.RequestedBy == in.ActorID {
		return nil, biz.ErrProductionExceptionSelfApproval
	}
	if target == biz.ProductionExceptionCancelled && row.RequestedBy != in.ActorID {
		return nil, biz.ErrProductionExceptionCancelOwner
	}
	if target == biz.ProductionExceptionCancelled {
		processQuery := tx.client.ProcessInstance.Query().Where(
			processinstance.ProcessKey(biz.ProcessKeyProductionExceptionApproval),
			processinstance.BusinessRefType("production_exception_decision"),
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
	if target == biz.ProductionExceptionApproved {
		approved := row.RequestedQuantity
		if in.ApprovedQuantity != nil {
			approved = *in.ApprovedQuantity
		}
		if !approved.IsPositive() || approved.GreaterThan(row.RequestedQuantity) ||
			(row.DecisionType != biz.ProductionExceptionOverIssue && !approved.Equal(row.RequestedQuantity)) {
			return nil, biz.ErrProductionExceptionApprovalAmount
		}
		if row.DecisionType == biz.ProductionExceptionOverIssue {
			if err := validateProductionOverIssueApprovalCapacity(ctx, tx.client, row, approved); err != nil {
				return nil, err
			}
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
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
			return nil, err
		}
	}
	return commitProductionException(ctx, tx, row.ID)
}

func validateProductionOverIssueApprovalCapacity(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionExceptionDecision,
	approved decimal.Decimal,
) error {
	if client == nil || row == nil || row.ProductionMaterialRequirementID == nil || !approved.IsPositive() {
		return biz.ErrProductionExceptionSourceInvalid
	}
	requirement, err := client.ProductionOrderMaterialRequirement.Get(ctx, *row.ProductionMaterialRequirementID)
	if err != nil ||
		requirement.ProductionOrderID != row.ProductionOrderID ||
		requirement.ProductionOrderItemID != row.ProductionOrderItemID {
		return biz.ErrProductionExceptionSourceInvalid
	}
	allowancePredicates := append(
		activeProductionOverIssuePredicates(),
		productionexceptiondecision.IDNEQ(row.ID),
		productionexceptiondecision.ProductionMaterialRequirementID(requirement.ID),
	)
	allowances, err := client.ProductionExceptionDecision.Query().
		Where(allowancePredicates...).
		All(ctx)
	if err != nil {
		return err
	}
	effectiveLimit := requirement.PlannedQuantity.Add(approved)
	for _, allowance := range allowances {
		if allowance.ProductionOrderID != row.ProductionOrderID ||
			allowance.ProductionOrderItemID != row.ProductionOrderItemID ||
			allowance.ApprovedQuantity == nil ||
			!allowance.ApprovedQuantity.IsPositive() {
			return biz.ErrProductionExceptionSourceInvalid
		}
		effectiveLimit = effectiveLimit.Add(*allowance.ApprovedQuantity)
	}
	if effectiveLimit.GreaterThan(maxProductionNumericQuantity) {
		return biz.ErrProductionExceptionApprovalAmount
	}
	return nil
}

func (r *operationalFactRepo) ExecuteProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	return nil, biz.ErrProcessRuntimeRequired
}

func (r *operationalFactRepo) ExecuteProductionExceptionForProcessCommand(
	ctx context.Context,
	in *biz.ProductionExceptionMutation,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	return r.executeProductionException(ctx, in, command, result)
}

func (r *operationalFactRepo) executeProductionException(
	ctx context.Context,
	in *biz.ProductionExceptionMutation,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.ProductionExceptionDecision, error) {
	tx, order, row, err := r.beginProductionExceptionMutation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.ExecutionStatus == biz.ProductionExceptionExecutionApplied && row.ExecutedBy != nil && *row.ExecutedBy == in.ActorID &&
		row.ExecutionReason != nil && *row.ExecutionReason == in.Reason && row.Version == in.ExpectedVersion+1 {
		return commitProductionException(ctx, tx, row.ID)
	}
	if order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if row.Status != biz.ProductionExceptionApproved || row.ExecutionStatus != biz.ProductionExceptionExecutionPending || row.Version != in.ExpectedVersion || row.ApprovedQuantity == nil {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if row.DecisionType == biz.ProductionExceptionOverIssue {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if err := r.applyProductionExceptionApproval(ctx, tx, row, *row.ApprovedQuantity, in.ActorID, in.Reason); err != nil {
		return nil, err
	}
	now := time.Now()
	affected, err := tx.client.ProductionExceptionDecision.Update().Where(productionexceptiondecision.ID(row.ID), productionexceptiondecision.StatusEQ(biz.ProductionExceptionApproved), productionexceptiondecision.ExecutionStatusEQ(biz.ProductionExceptionExecutionPending), productionexceptiondecision.VersionEQ(in.ExpectedVersion)).SetExecutionStatus(biz.ProductionExceptionExecutionApplied).SetExecutedAt(now).SetExecutedBy(in.ActorID).SetExecutionReason(in.Reason).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return nil, biz.ErrProductionExceptionConflict
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, in.ActorID); err != nil {
			return nil, err
		}
	}
	return commitProductionException(ctx, tx, row.ID)
}

func (r *operationalFactRepo) ReverseProductionException(ctx context.Context, in *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	tx, order, row, err := r.beginProductionExceptionMutation(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if row.ExecutionStatus == biz.ProductionExceptionExecutionReversed && row.ReversedBy != nil && *row.ReversedBy == in.ActorID && row.ReverseReason != nil && *row.ReverseReason == in.Reason && row.Version == in.ExpectedVersion+1 {
		return commitProductionException(ctx, tx, row.ID)
	}
	if order.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	if row.Status != biz.ProductionExceptionApproved || row.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	expectedExecutionStatus := biz.ProductionExceptionExecutionApplied
	if row.DecisionType == biz.ProductionExceptionOverIssue {
		expectedExecutionStatus = biz.ProductionExceptionExecutionPending
	}
	if row.ExecutionStatus != expectedExecutionStatus {
		return nil, biz.ErrProductionExceptionInvalidState
	}
	switch row.DecisionType {
	case biz.ProductionExceptionOverIssue:
		if err := ensureProductionExceptionOverIssueUnused(ctx, tx.client, row); err != nil {
			return nil, err
		}
	case biz.ProductionExceptionScrap:
		if err := reverseProductionExceptionWIPStatus(ctx, tx, row, biz.ProductionWIPStatusCancelled, biz.ProductionWIPStatusRejected, in.ActorID, in.Reason); err != nil {
			return nil, err
		}
	case biz.ProductionExceptionWIPConcession:
		if err := ensureProductionExceptionConcessionReverseCapacity(ctx, tx, row); err != nil {
			return nil, err
		}
		if err := reverseProductionExceptionWIPStatus(ctx, tx, row, biz.ProductionWIPStatusAccepted, biz.ProductionWIPStatusRejected, in.ActorID, in.Reason); err != nil {
			return nil, err
		}
	default:
		return nil, biz.ErrProductionExceptionInvalidState
	}
	now := time.Now()
	affected, err := tx.client.ProductionExceptionDecision.Update().Where(productionexceptiondecision.ID(row.ID), productionexceptiondecision.ExecutionStatusEQ(expectedExecutionStatus), productionexceptiondecision.VersionEQ(in.ExpectedVersion)).SetExecutionStatus(biz.ProductionExceptionExecutionReversed).SetReversedAt(now).SetReversedBy(in.ActorID).SetReverseReason(in.Reason).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return nil, biz.ErrProductionExceptionConflict
	}
	compensatedCommands := []string{biz.ProcessDomainCommandProductionExceptionApprove}
	if row.DecisionType != biz.ProductionExceptionOverIssue {
		compensatedCommands = append(compensatedCommands, biz.ProcessDomainCommandProductionExceptionExecute)
	}
	if err := markProcessDomainCommandEffectsCompensatedWithClient(
		ctx,
		tx.client,
		compensatedCommands,
		"production_exception_decision",
		row.ID,
		in.Reason,
		in.ActorID,
	); err != nil {
		return nil, err
	}
	return commitProductionException(ctx, tx, row.ID)
}

func ensureProductionExceptionOverIssueUnused(ctx context.Context, client *ent.Client, row *ent.ProductionExceptionDecision) error {
	if row == nil || row.ProductionMaterialRequirementID == nil || row.ApprovedQuantity == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	requirement, err := client.ProductionOrderMaterialRequirement.Get(ctx, *row.ProductionMaterialRequirementID)
	if err != nil || requirement.ProductionOrderID != row.ProductionOrderID || requirement.ProductionOrderItemID != row.ProductionOrderItemID {
		return biz.ErrProductionExceptionSourceInvalid
	}
	facts, err := client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(requirement.ProductionOrderID),
		productionfact.SourceLineID(requirement.ID),
		productionfact.FactType(biz.ProductionFactMaterialIssue),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return err
	}
	issued := decimal.Zero
	for _, fact := range facts {
		if fact.SubjectType != biz.InventorySubjectMaterial || fact.SubjectID != requirement.MaterialID || fact.ProductSkuID != nil || fact.UnitID != requirement.UnitID {
			return biz.ErrProductionExceptionSourceInvalid
		}
		issued = issued.Add(fact.Quantity)
	}
	allowancePredicates := append(
		activeProductionOverIssuePredicates(),
		productionexceptiondecision.IDNEQ(row.ID),
		productionexceptiondecision.ProductionMaterialRequirementID(requirement.ID),
	)
	otherAllowances, err := client.ProductionExceptionDecision.Query().
		Where(allowancePredicates...).
		All(ctx)
	if err != nil {
		return err
	}
	availableWithoutCurrent := requirement.PlannedQuantity
	for _, allowance := range otherAllowances {
		if allowance.ProductionOrderID != row.ProductionOrderID || allowance.ProductionOrderItemID != row.ProductionOrderItemID || allowance.ApprovedQuantity == nil {
			return biz.ErrProductionExceptionSourceInvalid
		}
		availableWithoutCurrent = availableWithoutCurrent.Add(*allowance.ApprovedQuantity)
	}
	if issued.GreaterThan(availableWithoutCurrent) {
		return biz.ErrProductionExceptionAllowanceUsed
	}
	return nil
}

func (r *operationalFactRepo) beginProductionExceptionMutation(
	ctx context.Context,
	id int,
) (*inventoryDBTx, *ent.ProductionOrder, *ent.ProductionExceptionDecision, error) {
	preview, err := r.data.postgres.ProductionExceptionDecision.Get(ctx, id)
	if ent.IsNotFound(err) {
		return nil, nil, nil, biz.ErrProductionExceptionNotFound
	}
	if err != nil {
		return nil, nil, nil, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	fail := func(err error) (*inventoryDBTx, *ent.ProductionOrder, *ent.ProductionExceptionDecision, error) {
		rollbackInventoryDBTx(ctx, tx, r.log)
		return nil, nil, nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_orders", preview.ProductionOrderID, biz.ErrProductionOrderNotFound); err != nil {
		return fail(err)
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", preview.ProductionOrderItemID, biz.ErrProductionExceptionSourceInvalid); err != nil {
		return fail(err)
	}
	if preview.ProductionMaterialRequirementID != nil {
		if err := lockOperationalFactRow(ctx, tx, "production_order_material_requirements", *preview.ProductionMaterialRequirementID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return fail(err)
		}
	}
	if preview.ProductionWipBatchID != nil {
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *preview.ProductionWipBatchID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return fail(err)
		}
	}
	if preview.QualityInspectionID != nil {
		if err := lockOperationalFactRow(ctx, tx, "quality_inspections", *preview.QualityInspectionID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return fail(err)
		}
	}
	if err := lockOperationalFactRow(ctx, tx, "production_exception_decisions", id, biz.ErrProductionExceptionNotFound); err != nil {
		return fail(err)
	}
	order, err := tx.client.ProductionOrder.Get(ctx, preview.ProductionOrderID)
	if err != nil {
		return fail(err)
	}
	row, err := tx.client.ProductionExceptionDecision.Get(ctx, id)
	if err != nil {
		return fail(err)
	}
	if row.ProductionOrderID != preview.ProductionOrderID ||
		row.ProductionOrderItemID != preview.ProductionOrderItemID ||
		!sameOptionalInt(row.ProductionMaterialRequirementID, preview.ProductionMaterialRequirementID) ||
		!sameOptionalInt(row.ProductionWipBatchID, preview.ProductionWipBatchID) ||
		!sameOptionalInt(row.QualityInspectionID, preview.QualityInspectionID) {
		return fail(biz.ErrProductionExceptionConflict)
	}
	return tx, order, row, nil
}

func reverseProductionExceptionWIPStatus(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionExceptionDecision, from, to string, actorID int, reason string) error {
	if row.ProductionWipBatchID == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *row.ProductionWipBatchID, biz.ErrProductionExceptionSourceInvalid); err != nil {
		return err
	}
	batch, err := tx.client.ProductionWIPBatch.Get(ctx, *row.ProductionWipBatchID)
	if err != nil || batch.Status != from {
		return biz.ErrProductionExceptionSourceInvalid
	}
	if err := ensureProductionExceptionWIPNoActiveChild(ctx, tx.client, batch.ID); err != nil {
		return err
	}
	affected, err := tx.client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.StatusEQ(from), productionwipbatch.VersionEQ(batch.Version)).SetStatus(to).AddVersion(1).Save(ctx)
	if err != nil || affected != 1 {
		return biz.ErrProductionExceptionConflict
	}
	updated, err := tx.client.ProductionWIPBatch.Get(ctx, batch.ID)
	if err != nil {
		return err
	}
	return appendProductionExceptionWIPEvent(ctx, tx, row, updated, from, to, actorID, biz.ProductionWIPEventActionExceptionReverse, reason)
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

func (r *operationalFactRepo) applyProductionExceptionApproval(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionExceptionDecision, approved decimal.Decimal, actorID int, executionReason string) error {
	switch row.DecisionType {
	case biz.ProductionExceptionOverIssue:
		return lockOperationalFactRow(ctx, tx, "production_order_material_requirements", *row.ProductionMaterialRequirementID, biz.ErrProductionExceptionSourceInvalid)
	case biz.ProductionExceptionWIPConcession, biz.ProductionExceptionScrap:
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *row.ProductionWipBatchID, biz.ErrProductionExceptionSourceInvalid); err != nil {
			return err
		}
		batch, inspection, err := productionExceptionWIPSource(ctx, tx.client, *row.ProductionWipBatchID, *row.QualityInspectionID)
		if err != nil || batch.Status != biz.ProductionWIPStatusRejected || inspection.Status != biz.QualityInspectionStatusRejected || !approved.Equal(batch.Quantity) {
			return biz.ErrProductionExceptionSourceInvalid
		}
		if err := ensureProductionExceptionWIPNoActiveChild(ctx, tx.client, batch.ID); err != nil {
			return err
		}
		target := biz.ProductionWIPStatusAccepted
		if row.DecisionType == biz.ProductionExceptionScrap {
			target = biz.ProductionWIPStatusCancelled
		}
		affected, err := tx.client.ProductionWIPBatch.Update().Where(productionwipbatch.ID(batch.ID), productionwipbatch.StatusEQ(biz.ProductionWIPStatusRejected), productionwipbatch.VersionEQ(batch.Version)).SetStatus(target).AddVersion(1).Save(ctx)
		if err != nil || affected != 1 {
			return biz.ErrProductionExceptionConflict
		}
		updated, err := tx.client.ProductionWIPBatch.Get(ctx, batch.ID)
		if err != nil {
			return err
		}
		return appendProductionExceptionWIPEvent(ctx, tx, row, updated, biz.ProductionWIPStatusRejected, target, actorID, biz.ProductionWIPEventActionExceptionApply, executionReason)
	}
	return nil
}

func ensureProductionExceptionWIPNoActiveChild(ctx context.Context, client *ent.Client, batchID int) error {
	hasActiveChild, err := client.ProductionWIPBatch.Query().Where(
		productionwipbatch.SourceBatchID(batchID),
		productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasActiveChild {
		return biz.ErrProductionExceptionWIPDependency
	}
	return nil
}

func ensureProductionExceptionConcessionReverseCapacity(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionExceptionDecision) error {
	if row == nil || row.ProductionWipBatchID == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	batch, err := tx.client.ProductionWIPBatch.Get(ctx, *row.ProductionWipBatchID)
	if err != nil {
		return err
	}
	operation, err := tx.client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		return err
	}
	if operation.OperationCode != biz.ProductionWIPOperationPackaging {
		return nil
	}
	item, err := tx.client.ProductionOrderItem.Get(ctx, row.ProductionOrderItemID)
	if err != nil {
		return err
	}
	acceptedRows, err := tx.client.ProductionWIPBatch.Query().Where(
		productionwipbatch.ProductionOrderID(row.ProductionOrderID),
		productionwipbatch.ProductionOrderItemID(row.ProductionOrderItemID),
		productionwipbatch.ProductionOrderOperationID(operation.ID),
		productionwipbatch.Status(biz.ProductionWIPStatusAccepted),
	).All(ctx)
	if err != nil {
		return err
	}
	acceptedAfterReverse := decimal.Zero
	for _, accepted := range acceptedRows {
		if accepted.ID != batch.ID {
			acceptedAfterReverse = acceptedAfterReverse.Add(accepted.Quantity)
		}
	}
	effectiveCompleted, err := productionOrderEffectiveCompletedQuantity(ctx, tx.client, item)
	if err != nil {
		return err
	}
	if acceptedAfterReverse.LessThan(effectiveCompleted) {
		return biz.ErrProductionExceptionFactDependency
	}
	return nil
}

func appendProductionExceptionWIPEvent(
	ctx context.Context,
	tx *inventoryDBTx,
	row *ent.ProductionExceptionDecision,
	batch *ent.ProductionWIPBatch,
	fromStatus, toStatus string,
	actorID int,
	action, reason string,
) error {
	if tx == nil || row == nil || batch == nil || row.ApprovedQuantity == nil {
		return biz.ErrProductionExceptionSourceInvalid
	}
	payload := fmt.Sprintf("%d:%d:%s:%d:%d:%s", row.ID, row.Version, action, batch.Version, actorID, reason)
	sum := sha256.Sum256([]byte(payload))
	result := map[string]any{
		"production_exception_id":      row.ID,
		"production_exception_version": row.Version + 1,
		"decision_type":                row.DecisionType,
		"production_wip_batch_id":      batch.ID,
		"quality_inspection_id":        optionalIntValue(row.QualityInspectionID),
		"from_status":                  fromStatus,
		"to_status":                    toStatus,
	}
	return tx.client.ProductionWIPEvent.Create().
		SetProductionWipBatchID(batch.ID).
		SetActorID(actorID).
		SetAction(action).
		SetFromStatus(fromStatus).
		SetToStatus(toStatus).
		SetBatchVersion(batch.Version).
		SetQuantity(*row.ApprovedQuantity).
		SetIdempotencyKey(fmt.Sprintf("PRODUCTION_EXCEPTION:%d:%s:%d", row.ID, action, row.Version)).
		SetIntentHash(hex.EncodeToString(sum[:])).
		SetResultContract(biz.ProductionWIPMutationResultV1).
		SetMutationResult(result).
		SetReason(reason).
		Exec(ctx)
}

func (r *operationalFactRepo) GetProductionException(ctx context.Context, id int) (*biz.ProductionExceptionDecision, error) {
	row, err := r.data.postgres.ProductionExceptionDecision.Get(ctx, id)
	if ent.IsNotFound(err) {
		return nil, biz.ErrProductionExceptionNotFound
	}
	return entProductionExceptionToBiz(row), err
}
func (r *operationalFactRepo) ListProductionExceptions(ctx context.Context, filter biz.ProductionExceptionFilter) ([]*biz.ProductionExceptionDecision, int, error) {
	query := r.data.postgres.ProductionExceptionDecision.Query()
	if filter.Status != "" {
		query = query.Where(productionexceptiondecision.Status(filter.Status))
	}
	if filter.ExecutionStatus != "" {
		query = query.Where(productionexceptiondecision.ExecutionStatus(filter.ExecutionStatus))
	}
	if filter.DecisionType != "" {
		query = query.Where(productionexceptiondecision.DecisionType(filter.DecisionType))
	}
	if filter.ProductionOrderID > 0 {
		query = query.Where(productionexceptiondecision.ProductionOrderID(filter.ProductionOrderID))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(productionexceptiondecision.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.ProductionExceptionDecision, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProductionExceptionToBiz(row))
	}
	return out, total, nil
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
	return &biz.ProductionExceptionDecision{ID: row.ID, DecisionNo: row.DecisionNo, DecisionType: row.DecisionType, Status: row.Status, ExecutionStatus: row.ExecutionStatus, ProductionOrderID: row.ProductionOrderID, ProductionOrderItemID: row.ProductionOrderItemID, ProductionMaterialRequirementID: row.ProductionMaterialRequirementID, ProductionWIPBatchID: row.ProductionWipBatchID, QualityInspectionID: row.QualityInspectionID, RequestedQuantity: row.RequestedQuantity, ApprovedQuantity: row.ApprovedQuantity, Reason: row.Reason, Version: row.Version, RequestedBy: row.RequestedBy, RequestedAt: row.RequestedAt, DecidedBy: row.DecidedBy, DecidedAt: row.DecidedAt, DecisionReason: row.DecisionReason, ExecutedBy: row.ExecutedBy, ExecutedAt: row.ExecutedAt, ExecutionReason: row.ExecutionReason, ReversedBy: row.ReversedBy, ReversedAt: row.ReversedAt, ReverseReason: row.ReverseReason}
}
