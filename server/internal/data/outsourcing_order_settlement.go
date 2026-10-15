package data

import (
	"context"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
)

// Fabric contracts deliver material into a production batch. Their settlement
// requires the posted issue and the accepted batch to which that line belongs;
// no product receipt or workflow-completion proxy is fabricated.
func outsourcingOrderSettledQuantities(ctx context.Context, client *ent.Client, orderID int, items []*ent.OutsourcingOrderItem) (map[int]decimal.Decimal, error) {
	totals := map[int]decimal.Decimal{}
	order, err := client.OutsourcingOrder.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	materialLines := map[int]bool{}
	if order.SourceWipBatchID != nil {
		batch, err := client.ProductionWIPBatch.Get(ctx, *order.SourceWipBatchID)
		if err != nil {
			return nil, err
		}
		operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
		if err != nil {
			return nil, err
		}
		if batch.Status == biz.ProductionWIPStatusAccepted && productionWIPNeedsFreshMaterial(operation.OperationCode, batch.FlowType) {
			allocations, err := client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.ProductionWipBatchID(batch.ID)).All(ctx)
			if err != nil {
				return nil, err
			}
			for _, a := range allocations {
				if a.SubjectType == biz.OutsourcingOrderSubjectMaterial {
					materialLines[a.OutsourcingOrderItemID] = true
				}
			}
		}
	}
	ids := []int{}
	byID := map[int]*ent.OutsourcingOrderItem{}
	for _, item := range items {
		ids = append(ids, item.ID)
		byID[item.ID] = item
	}
	if len(ids) == 0 {
		return totals, nil
	}
	facts, err := client.OutsourcingFact.Query().Where(outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceID(orderID), outsourcingfact.SourceLineIDIn(ids...), outsourcingfact.Status(biz.OperationalFactStatusPosted), outsourcingfact.FactTypeIn(biz.OutsourcingFactReturnReceipt, biz.OutsourcingFactMaterialIssue)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, fact := range facts {
		item := byID[*fact.SourceLineID]
		if !materialLines[item.ID] && fact.FactType == biz.OutsourcingFactReturnReceipt || item.SubjectType == biz.OutsourcingOrderSubjectMaterial && materialLines[item.ID] && fact.FactType == biz.OutsourcingFactMaterialIssue {
			totals[item.ID] = totals[item.ID].Add(fact.Quantity)
		}
	}
	return totals, nil
}
