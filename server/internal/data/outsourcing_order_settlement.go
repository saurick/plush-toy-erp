package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingreturndisposition"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"

	"github.com/shopspring/decimal"
)

// Effective receipts retain the original receipt and deduct only posted returns.
// Draft/cancelled dispositions never release replacement capacity.
func outsourcingFactEffectiveQuantities(ctx context.Context, client *ent.Client, facts []*ent.OutsourcingFact) (map[int]decimal.Decimal, error) {
	totals := map[int]decimal.Decimal{}
	ids := []int{}
	for _, fact := range facts {
		totals[fact.ID] = fact.Quantity
		if fact.FactType == biz.OutsourcingFactReturnReceipt {
			ids = append(ids, fact.ID)
		}
	}
	if len(ids) == 0 {
		return totals, nil
	}
	rows, err := client.OutsourcingReturnDisposition.Query().Where(
		outsourcingreturndisposition.OutsourcingReturnFactIDIn(ids...),
		outsourcingreturndisposition.DispositionType(biz.OutsourcingDispositionReturnToVendor),
		outsourcingreturndisposition.Status(biz.OutsourcingDispositionPosted),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		totals[row.OutsourcingReturnFactID] = totals[row.OutsourcingReturnFactID].Sub(row.Quantity)
	}
	return totals, nil
}

// Stage work settles against its accepted WIP allocation. Ordinary receipts
// settle against inventory facts, net of returns to the vendor. These paths
// never manufacture one another's facts.
func outsourcingOrderSettledQuantities(ctx context.Context, client *ent.Client, orderID int, items []*ent.OutsourcingOrderItem) (map[int]decimal.Decimal, error) {
	totals := map[int]decimal.Decimal{}
	ids := []int{}
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	if len(ids) == 0 {
		return totals, nil
	}
	allocations, err := client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.OutsourcingOrderItemIDIn(ids...)).WithProductionWipBatch().All(ctx)
	if err != nil {
		return nil, err
	}
	stageLines := map[int]*ent.ProductionWIPOutsourcingAllocation{}
	for _, allocation := range allocations {
		stageLines[allocation.OutsourcingOrderItemID] = allocation
		if allocation.SubjectType == biz.OutsourcingOrderSubjectProduct && allocation.Edges.ProductionWipBatch.Status == biz.ProductionWIPStatusAccepted {
			totals[allocation.OutsourcingOrderItemID] = allocation.AllocatedQuantity
		}
	}
	facts, err := client.OutsourcingFact.Query().Where(outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceID(orderID), outsourcingfact.SourceLineIDIn(ids...), outsourcingfact.Status(biz.OperationalFactStatusPosted), outsourcingfact.FactTypeIn(biz.OutsourcingFactReturnReceipt, biz.OutsourcingFactMaterialIssue)).All(ctx)
	if err != nil {
		return nil, err
	}
	effective, err := outsourcingFactEffectiveQuantities(ctx, client, facts)
	if err != nil {
		return nil, err
	}
	for _, fact := range facts {
		allocation := stageLines[*fact.SourceLineID]
		if allocation == nil && fact.FactType == biz.OutsourcingFactReturnReceipt || allocation != nil && allocation.SubjectType == biz.OutsourcingOrderSubjectMaterial && allocation.Edges.ProductionWipBatch.Status == biz.ProductionWIPStatusAccepted && fact.FactType == biz.OutsourcingFactMaterialIssue {
			totals[*fact.SourceLineID] = totals[*fact.SourceLineID].Add(effective[fact.ID])
		}
	}
	return totals, nil
}
