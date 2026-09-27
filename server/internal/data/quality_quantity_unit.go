package data

import (
	"context"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/purchasereceiptitem"
)

// Resolve the inspected source in batches. Quality operators need its unit to
// enter a disposition; they do not need access to the full source document.
func enrichQualityQuantityUnits(ctx context.Context, client *ent.Client, inspections []*biz.QualityInspection) error {
	receiptIDs, factIDs, batchIDs := []int{}, []int{}, []int{}
	for _, item := range inspections {
		if item.PurchaseReceiptItemID != nil {
			receiptIDs = append(receiptIDs, *item.PurchaseReceiptItemID)
		}
		if item.ProductionWIPBatchID != nil {
			batchIDs = append(batchIDs, *item.ProductionWIPBatchID)
		}
		if item.SourceType != nil && *item.SourceType == biz.QualityInspectionSourceOutsourcingFact && item.SourceID != nil {
			factIDs = append(factIDs, *item.SourceID)
		}
	}
	receiptUnits, factUnits, batchUnits := map[int]*ent.Unit{}, map[int]*ent.Unit{}, map[int]*ent.Unit{}
	if len(receiptIDs) > 0 {
		rows, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.IDIn(receiptIDs...)).WithUnit().All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			receiptUnits[row.ID] = row.Edges.Unit
		}
	}
	if len(factIDs) > 0 {
		rows, err := client.OutsourcingFact.Query().Where(outsourcingfact.IDIn(factIDs...)).WithUnit().All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			factUnits[row.ID] = row.Edges.Unit
		}
	}
	if len(batchIDs) > 0 {
		rows, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.IDIn(batchIDs...)).WithProductionOrderItem(func(q *ent.ProductionOrderItemQuery) { q.WithUnit() }).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			if row.Edges.ProductionOrderItem != nil {
				batchUnits[row.ID] = row.Edges.ProductionOrderItem.Edges.Unit
			}
		}
	}
	for _, item := range inspections {
		var unit *ent.Unit
		switch {
		case item.ProductionWIPBatchID != nil:
			unit = batchUnits[*item.ProductionWIPBatchID]
		case item.SourceType != nil && *item.SourceType == biz.QualityInspectionSourceOutsourcingFact && item.SourceID != nil:
			unit = factUnits[*item.SourceID]
		case item.PurchaseReceiptItemID != nil:
			unit = receiptUnits[*item.PurchaseReceiptItemID]
		}
		if unit != nil {
			id, name, precision := unit.ID, unit.Name, unit.Precision
			item.UnitID, item.UnitName, item.UnitPrecision = &id, &name, &precision
		}
	}
	return nil
}
