package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionexceptiondecision"
	"server/internal/data/model/ent/qualityinspection"
)

// A concession is evidence for one rejected inspection, never for the entire
// frozen route. Reversed or merely approved decisions do not waive a gate.
func productionWIPQualityConcessions(ctx context.Context, client *ent.Client, batch *ent.ProductionWIPBatch) (map[int]bool, error) {
	rows, err := client.ProductionExceptionDecision.Query().Where(
		productionexceptiondecision.ProductionWipBatchID(batch.ID),
		productionexceptiondecision.DecisionType(biz.ProductionExceptionWIPConcession),
		productionexceptiondecision.Status(biz.ProductionExceptionApproved),
		productionexceptiondecision.ExecutionStatus(biz.ProductionExceptionExecutionApplied),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int]bool, len(rows))
	for _, row := range rows {
		if row.QualityInspectionID == nil || row.ApprovedQuantity == nil || !row.ApprovedQuantity.Equal(batch.Quantity) ||
			row.ProductionOrderID != batch.ProductionOrderID || row.ProductionOrderItemID != batch.ProductionOrderItemID {
			return nil, biz.ErrProductionExceptionSourceInvalid
		}
		out[*row.QualityInspectionID] = true
	}
	return out, nil
}

func advanceProductionWIPConcededGate(ctx context.Context, client *ent.Client, batch *ent.ProductionWIPBatch, inspection *ent.QualityInspection) (string, error) {
	operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		return "", err
	}
	rows, err := client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).All(ctx)
	if err != nil {
		return "", err
	}
	concessions, err := productionWIPQualityConcessions(ctx, client, batch)
	if err != nil {
		return "", err
	}
	index, currentID, err := currentProductionWIPQualityGate(batch, operation, rows, concessions)
	if err != nil {
		return "", err
	}
	if currentID != inspection.ID {
		return "", biz.ErrProductionExceptionSourceInvalid
	}
	if index+1 == len(operation.RequiredQualityGates) {
		return biz.ProductionWIPStatusAccepted, nil
	}
	next, err := createProductionWIPQualityGateDraft(ctx, client, batch.ID, operation.RequiredQualityGates[index+1], false)
	if err != nil {
		return "", err
	}
	if err := fulfillmentInspectionTask(ctx, client, next); err != nil {
		return "", err
	}
	return biz.ProductionWIPStatusWaitingQuality, nil
}

// Reversal can remove an untouched next draft. Once another gate has been
// submitted or decided, its evidence must not be invalidated by this reversal.
func prepareProductionWIPConcessionReversal(ctx context.Context, tx *inventoryDBTx, decision *ent.ProductionExceptionDecision, reason string) (string, error) {
	if decision.ProductionWipBatchID == nil || decision.QualityInspectionID == nil {
		return "", biz.ErrProductionExceptionSourceInvalid
	}
	if err := lockProductionWIPBatchForQuality(ctx, tx, *decision.ProductionWipBatchID); err != nil {
		return "", err
	}
	batch, inspection, err := productionExceptionWIPSource(ctx, tx.client, *decision.ProductionWipBatchID, *decision.QualityInspectionID)
	if err != nil || inspection.Status != biz.QualityInspectionStatusRejected {
		return "", biz.ErrProductionExceptionSourceInvalid
	}
	operation, err := tx.client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		return "", err
	}
	rows, err := tx.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).All(ctx)
	if err != nil {
		return "", err
	}
	concessions, err := productionWIPQualityConcessions(ctx, tx.client, batch)
	if err != nil {
		return "", err
	}
	// Check the original route with this concession removed. Later drafts are
	// inspected separately so no submitted or completed work is discarded.
	delete(concessions, inspection.ID)
	prior := make([]*ent.QualityInspection, 0, len(rows))
	gateIndex := -1
	for index, gate := range operation.RequiredQualityGates {
		if gate == optionalStringValueOrEmpty(inspection.GateCode) {
			gateIndex = index
		}
	}
	if gateIndex < 0 {
		return "", biz.ErrProductionWIPInvalidRoute
	}
	var nextDraft *ent.QualityInspection
	for _, row := range rows {
		later := false
		for index := gateIndex + 1; index < len(operation.RequiredQualityGates); index++ {
			if optionalStringValueOrEmpty(row.GateCode) != operation.RequiredQualityGates[index] || row.Status == biz.QualityInspectionStatusCancelled {
				continue
			}
			if index != gateIndex+1 || row.Status != biz.QualityInspectionStatusDraft || nextDraft != nil {
				return "", biz.ErrProductionExceptionWIPDependency
			}
			nextDraft, later = row, true
		}
		if !later {
			prior = append(prior, row)
		}
	}
	_, currentID, err := currentProductionWIPQualityGate(batch, operation, prior, concessions)
	if err != nil {
		return "", err
	}
	if currentID != inspection.ID {
		return "", biz.ErrProductionExceptionWIPDependency
	}
	expected := biz.ProductionWIPStatusAccepted
	if gateIndex+1 < len(operation.RequiredQualityGates) {
		expected = biz.ProductionWIPStatusWaitingQuality
		if nextDraft == nil {
			return "", biz.ErrProductionExceptionWIPDependency
		}
	}
	if batch.Status != expected {
		return "", biz.ErrProductionExceptionWIPDependency
	}
	if nextDraft != nil {
		if err := updateQualityInspectionCancelled(ctx, tx, nextDraft.ID, &reason); err != nil {
			return "", err
		}
		cancelled, err := tx.client.QualityInspection.Get(ctx, nextDraft.ID)
		if err != nil {
			return "", err
		}
		if err := fulfillmentInspectionTask(ctx, tx.client, cancelled); err != nil {
			return "", err
		}
	}
	return expected, nil
}
