package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionordermaterialrequirement"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"

	"github.com/shopspring/decimal"
)

// Normal production and its material outsourcing consume the same frozen
// demand. Approved REMAKE batches own separate fresh-material allocations;
// their consumption must not silently spend the normal order's allowance.
func productionMaterialIssuedQuantities(ctx context.Context, client *ent.Client, requirements []*ent.ProductionOrderMaterialRequirement) (map[int]decimal.Decimal, error) {
	totals := make(map[int]decimal.Decimal, len(requirements))
	if len(requirements) == 0 {
		return totals, nil
	}
	ids := make([]int, 0, len(requirements))
	byID := make(map[int]*ent.ProductionOrderMaterialRequirement, len(requirements))
	for _, requirement := range requirements {
		ids = append(ids, requirement.ID)
		byID[requirement.ID] = requirement
	}
	facts, err := client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType), productionfact.SourceLineIDIn(ids...),
		productionfact.FactType(biz.ProductionFactMaterialIssue), productionfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, fact := range facts {
		requirement := byID[*fact.SourceLineID]
		if fact.SourceID == nil || *fact.SourceID != requirement.ProductionOrderID || fact.SubjectType != biz.InventorySubjectMaterial || fact.SubjectID != requirement.MaterialID || fact.ProductSkuID != nil || fact.UnitID != requirement.UnitID {
			return nil, biz.ErrProductionOrderMaterialRequirementInvalid
		}
		totals[requirement.ID] = totals[requirement.ID].Add(fact.Quantity)
	}
	allocations, err := client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.ProductionOrderMaterialRequirementIDIn(ids...),
		productionwipoutsourcingallocation.SubjectType(biz.OutsourcingOrderSubjectMaterial),
		productionwipoutsourcingallocation.HasProductionWipBatchWith(productionwipbatch.FlowType(biz.ProductionWIPFlowNormal)),
	).WithOutsourcingOrderItem().All(ctx)
	if err != nil {
		return nil, err
	}
	if len(allocations) == 0 {
		return totals, nil
	}
	lineIDs := make([]int, 0, len(allocations))
	byLine := make(map[int]*ent.ProductionWIPOutsourcingAllocation, len(allocations))
	for _, allocation := range allocations {
		if byLine[allocation.OutsourcingOrderItemID] != nil {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		lineIDs = append(lineIDs, allocation.OutsourcingOrderItemID)
		byLine[allocation.OutsourcingOrderItemID] = allocation
	}
	issues, err := client.OutsourcingFact.Query().Where(
		outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceLineIDIn(lineIDs...),
		outsourcingfact.FactType(biz.OutsourcingFactMaterialIssue), outsourcingfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, fact := range issues {
		allocation := byLine[*fact.SourceLineID]
		requirement := byID[*allocation.ProductionOrderMaterialRequirementID]
		line := allocation.Edges.OutsourcingOrderItem
		if line == nil || fact.SourceID == nil || *fact.SourceID != line.OutsourcingOrderID || fact.SubjectType != biz.InventorySubjectMaterial || fact.SubjectID != requirement.MaterialID || fact.ProductSkuID != nil || fact.UnitID != requirement.UnitID {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		totals[requirement.ID] = totals[requirement.ID].Add(fact.Quantity)
	}
	return totals, nil
}

// Discover the immutable allocation before locking the outsourcing source so
// both issue paths use production order -> item -> batch -> outsourcing locks.
// Assignment may win while an unbound source waits; that request must refresh
// instead of acquiring the production locks in reverse order.
func lockOutsourcingProductionMaterial(ctx context.Context, tx *inventoryDBTx, itemID int) (*ent.ProductionWIPOutsourcingAllocation, error) {
	allocation, err := outsourcingProductionMaterialAllocation(ctx, tx.client, itemID)
	if err != nil || allocation == nil {
		return allocation, err
	}
	requirement, err := tx.client.ProductionOrderMaterialRequirement.Get(ctx, *allocation.ProductionOrderMaterialRequirementID)
	if err != nil {
		return nil, err
	}
	for _, row := range []struct {
		table string
		id    int
	}{
		{"production_orders", requirement.ProductionOrderID},
		{"production_order_items", requirement.ProductionOrderItemID},
		{"production_wip_batches", allocation.ProductionWipBatchID},
		{"production_order_material_requirements", requirement.ID},
	} {
		if err := lockOperationalFactRow(ctx, tx, row.table, row.id, biz.ErrProductionWIPOutsourcingSourceDependency); err != nil {
			return nil, err
		}
	}
	return allocation, nil
}

func outsourcingProductionMaterialAllocation(ctx context.Context, client *ent.Client, itemID int) (*ent.ProductionWIPOutsourcingAllocation, error) {
	allocation, err := client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.OutsourcingOrderItemID(itemID),
		productionwipoutsourcingallocation.SubjectType(biz.OutsourcingOrderSubjectMaterial),
	).WithProductionWipBatch().Only(ctx)
	if ent.IsNotFound(err) {
		return nil, nil
	}
	return allocation, err
}

func verifyOutsourcingProductionMaterialLock(ctx context.Context, client *ent.Client, itemID int, locked *ent.ProductionWIPOutsourcingAllocation) error {
	current, err := outsourcingProductionMaterialAllocation(ctx, client, itemID)
	if err != nil {
		return err
	}
	if (current == nil) != (locked == nil) || (current != nil && current.ID != locked.ID) {
		return biz.ErrProductionWIPOutsourcingSourceDependency
	}
	return nil
}

func validateOutsourcingProductionMaterialQuantity(ctx context.Context, client *ent.Client, itemID int, quantity decimal.Decimal) error {
	allocation, err := outsourcingProductionMaterialAllocation(ctx, client, itemID)
	if err != nil || allocation == nil {
		return err
	}
	if allocation.Edges.ProductionWipBatch.FlowType != biz.ProductionWIPFlowNormal {
		return nil
	}
	requirement, err := client.ProductionOrderMaterialRequirement.Query().Where(productionordermaterialrequirement.ID(*allocation.ProductionOrderMaterialRequirementID)).Only(ctx)
	if err != nil {
		return err
	}
	return validateProductionOrderMaterialIssueQuantity(ctx, client, requirement, quantity)
}
