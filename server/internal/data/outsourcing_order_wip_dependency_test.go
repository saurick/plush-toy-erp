package data

import (
	"context"
	"errors"
	"testing"
	"time"

	"server/internal/biz"
)

func TestOutsourcingOrderLifecycleDependencySetRecheckFailsClosedOnNewWIPBatch(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "outsourcing_order_wip_dependency_recheck")
	processes := createProductionWIPRouteProcesses(t, ctx, f.client)
	aggregate := releaseProductionWIPRoute(t, ctx, f, "MO-OUT-DEPENDENCY-RECHECK", 10, false)
	root := aggregate.Batches[0]
	requirement := aggregate.MaterialRequirements[0]

	supplier := f.client.Supplier.Create().
		SetCode("OUT-DEPENDENCY-SUP").
		SetName("委外依赖集合测试供应商").
		SetSupplierType("outsourcing").
		SaveX(ctx)
	order := f.client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("OUT-DEPENDENCY-ORDER").
		SetSupplierID(supplier.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).
		SaveX(ctx)
	line := f.client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(order.ID).
		SetLineNo(1).
		SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
		SetMaterialID(f.materialID).
		SetProcessID(processes[biz.ProductionWIPOperationFabricProcessing].ID).
		SetUnitID(f.unitID).
		SetOutsourcingQuantity(requirement.PlannedQuantity).
		SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
		SaveX(ctx)
	f.client.ProductionWIPOutsourcingAllocation.Create().
		SetProductionWipBatchID(root.ID).
		SetOutsourcingOrderItemID(line.ID).
		SetProductionOrderMaterialRequirementID(requirement.ID).
		SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
		SetAllocatedQuantity(requirement.PlannedQuantity).
		SetUnitID(f.unitID).
		SetCreatedBy(f.actorID).
		SaveX(ctx)

	if err := requireStableOutsourcingOrderWIPDependencySet(ctx, f.client, order.ID, []int{root.ID}); err != nil {
		t.Fatalf("exact locked dependency set rejected: %v", err)
	}
	if err := requireStableOutsourcingOrderWIPDependencySet(ctx, f.client, order.ID, nil); !errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency) {
		t.Fatalf("stale empty dependency set error = %v", err)
	}
	if err := requireStableOutsourcingOrderWIPDependencySet(ctx, f.client, order.ID, []int{root.ID + 1}); !errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency) {
		t.Fatalf("changed dependency set error = %v", err)
	}
}
