package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/process"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"

	"github.com/go-kratos/kratos/v2/log"
)

type outsourcingWIPPostgresRaceFixture struct {
	production productionOrderTestFixture
	data       *Data
	client     *ent.Client
	processes  map[string]*ent.Process
	supplierID int
	suffix     string
}

func TestOutsourcingFactFromOrderPostgresWIPAllocationAndLifecycleSettlementStayAtomic(t *testing.T) {
	ctx, cancelContext := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancelContext()
	f := openOutsourcingWIPPostgresRaceFixture(t, ctx)
	logger := log.NewStdLogger(io.Discard)
	orderRepo := NewOutsourcingOrderRepo(f.data, logger)

	t.Run("close_rechecks_the_exact_batch_set_after_parent_lock", func(t *testing.T) {
		settledAggregate := releaseProductionWIPRoute(t, ctx, f.production, "MO-WIP-PG-SETTLED-"+f.suffix, 10, false)
		activeAggregate := releaseProductionWIPRoute(t, ctx, f.production, "MO-WIP-PG-ACTIVE-"+f.suffix, 10, false)
		order, lines := f.createConfirmedOutsourcingOrder(t, ctx, "CLOSE", settledAggregate, activeAggregate)
		settledRoot := settledAggregate.Batches[0]
		settledRequirement := settledAggregate.MaterialRequirements[0]
		f.client.ProductionWIPBatch.UpdateOneID(settledRoot.ID).
			SetExecutionMode(biz.ProductionWIPExecutionOutsourced).
			SetStatus(biz.ProductionWIPStatusAccepted).
			AddVersion(1).
			SaveX(ctx)
		f.client.ProductionWIPOutsourcingAllocation.Create().
			SetProductionWipBatchID(settledRoot.ID).
			SetOutsourcingOrderItemID(lines[0].ID).
			SetProductionOrderMaterialRequirementID(settledRequirement.ID).
			SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
			SetAllocatedQuantity(settledRequirement.PlannedQuantity).
			SetUnitID(f.production.unitID).
			SetCreatedBy(f.production.actorID).
			SaveX(ctx)

		blocker, err := f.data.sqldb.BeginTx(ctx, nil)
		if err != nil {
			t.Fatalf("begin settled batch blocker: %v", err)
		}
		blockerOpen := true
		defer func() {
			if blockerOpen {
				_ = blocker.Rollback()
			}
		}()
		if _, err := blocker.ExecContext(ctx, "SELECT id FROM production_wip_batches WHERE id = $1 FOR UPDATE", settledRoot.ID); err != nil {
			t.Fatalf("lock settled dependency batch: %v", err)
		}
		closeDone := make(chan error, 1)
		go func() {
			_, closeErr := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, order.ID, biz.OutsourcingOrderStatusClosed)
			closeDone <- closeErr
		}()
		waitForPostgresBlockedQueryCount(t, ctx, f.data.sqldb, "production_wip_batches", 1)

		if _, err := f.assignOutsourcedExecution(ctx, activeAggregate, lines[1], "close-race"); err != nil {
			t.Fatalf("assign new WIP dependency while close waits on preflight batch: %v", err)
		}
		if err := blocker.Commit(); err != nil {
			t.Fatalf("release settled batch blocker: %v", err)
		}
		blockerOpen = false
		if closeErr := receivePurchaseOperationError(t, closeDone, "outsourcing close dependency recheck"); !errors.Is(closeErr, biz.ErrProductionWIPOutsourcingSourceDependency) {
			t.Fatalf("close after new dependency error = %v", closeErr)
		}
		if current := f.client.OutsourcingOrder.GetX(ctx, order.ID); current.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed {
			t.Fatalf("failed close changed order status = %s", current.LifecycleStatus)
		}
		if count := f.outsourcingAllocationCount(ctx, order.ID); count != 2 {
			t.Fatalf("dependency allocations after close race = %d, want 2", count)
		}
	})

	for _, cancelFirst := range []bool{true, false} {
		name := "allocation_first"
		if cancelFirst {
			name = "cancel_first"
		}
		t.Run(name, func(t *testing.T) {
			aggregate := releaseProductionWIPRoute(t, ctx, f.production, "MO-WIP-PG-CANCEL-"+name+"-"+f.suffix, 10, false)
			order, lines := f.createConfirmedOutsourcingOrder(t, ctx, "CANCEL-"+name, aggregate)
			assign := func() error {
				_, err := f.assignOutsourcedExecution(ctx, aggregate, lines[0], "cancel-"+name)
				return err
			}
			cancel := func() error {
				_, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, order.ID, biz.OutsourcingOrderStatusCanceled)
				return err
			}
			first, second := assign, cancel
			if cancelFirst {
				first, second = cancel, assign
			}
			firstErr, secondErr := runPostgresSourceLockRace(t, ctx, f.data, "outsourcing_orders", order.ID, first, second)
			current := f.client.OutsourcingOrder.GetX(ctx, order.ID)
			allocationCount := f.outsourcingAllocationCount(ctx, order.ID)
			if cancelFirst {
				if firstErr != nil || !errors.Is(secondErr, biz.ErrProductionWIPOutsourcingAllocationInvalid) || current.LifecycleStatus != biz.OutsourcingOrderStatusCanceled || allocationCount != 0 {
					t.Fatalf("cancel-first first=%v second=%v status=%s allocations=%d", firstErr, secondErr, current.LifecycleStatus, allocationCount)
				}
				return
			}
			if firstErr != nil || !errors.Is(secondErr, biz.ErrProductionWIPOutsourcingSourceDependency) || current.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed || allocationCount != 1 {
				t.Fatalf("allocation-first first=%v second=%v status=%s allocations=%d", firstErr, secondErr, current.LifecycleStatus, allocationCount)
			}
		})
	}
}

func openOutsourcingWIPPostgresRaceFixture(t *testing.T, ctx context.Context) outsourcingWIPPostgresRaceFixture {
	t.Helper()
	pg := openProductionOrderPGFixture(t)
	processes := ensureProductionWIPRouteProcessesForPostgresRace(t, ctx, pg.client, pg.suffix)
	if pg.item.BOMHeaderID == nil {
		t.Fatal("postgres production fixture is missing active BOM")
	}
	bomID := *pg.item.BOMHeaderID
	if affected := pg.client.BOMItem.Update().Where(bomitem.BomHeaderID(bomID)).
		SetProductionOperationCode(biz.ProductionWIPOperationFabricProcessing).
		SaveX(ctx); affected != 1 {
		t.Fatalf("active BOM %d item count = %d, want 1", bomID, affected)
	}
	supplier := pg.client.Supplier.Create().
		SetCode("WIP-PG-SUP-" + pg.suffix).
		SetName("WIP PostgreSQL 竞态供应商").
		SetSupplierType("outsourcing").
		SaveX(ctx)
	return outsourcingWIPPostgresRaceFixture{
		production: productionOrderTestFixture{
			uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID,
			unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID,
			salesItemID: pg.salesItemID, bomID: bomID,
		},
		data: pg.data, client: pg.client, processes: processes, supplierID: supplier.ID, suffix: pg.suffix,
	}
}

func ensureProductionWIPRouteProcessesForPostgresRace(t *testing.T, ctx context.Context, client *ent.Client, suffix string) map[string]*ent.Process {
	t.Helper()
	type processSpec struct {
		name       string
		inhouse    bool
		outsourced bool
	}
	specs := map[string]processSpec{
		biz.ProductionWIPOperationFabricProcessing: {name: "机裁", outsourced: true},
		biz.ProductionWIPOperationSewing:           {name: "车缝", inhouse: true, outsourced: true},
		biz.ProductionWIPOperationHandwork:         {name: "手工", inhouse: true, outsourced: true},
		biz.ProductionWIPOperationPackaging:        {name: "包装", inhouse: true},
	}
	result := make(map[string]*ent.Process, len(specs))
	for operationCode, spec := range specs {
		rows := client.Process.Query().Where(process.ProductionRouteOperationCode(operationCode)).AllX(ctx)
		if len(rows) > 1 {
			t.Fatalf("production route operation %s has %d process rows", operationCode, len(rows))
		}
		if len(rows) == 1 {
			row := rows[0]
			if !row.IsActive || row.InhouseEnabled != spec.inhouse || row.OutsourcingEnabled != spec.outsourced {
				t.Fatalf("existing production route process %s has incompatible capabilities: %#v", operationCode, row)
			}
			result[operationCode] = row
			continue
		}
		result[operationCode] = client.Process.Create().
			SetCode(fmt.Sprintf("WIP-PG-%s-%s", operationCode, suffix)).
			SetName(spec.name).
			SetProductionRouteOperationCode(operationCode).
			SetInhouseEnabled(spec.inhouse).
			SetOutsourcingEnabled(spec.outsourced).
			SetIsActive(true).
			SaveX(ctx)
	}
	return result
}

func (f outsourcingWIPPostgresRaceFixture) createConfirmedOutsourcingOrder(
	t *testing.T,
	ctx context.Context,
	label string,
	aggregates ...*biz.ProductionWIPAggregate,
) (*ent.OutsourcingOrder, []*ent.OutsourcingOrderItem) {
	t.Helper()
	order := f.client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("WIP-PG-OUT-" + label + "-" + f.suffix).
		SetSupplierID(f.supplierID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).
		SaveX(ctx)
	lines := make([]*ent.OutsourcingOrderItem, 0, len(aggregates))
	for index, aggregate := range aggregates {
		if aggregate == nil || len(aggregate.MaterialRequirements) != 1 {
			t.Fatalf("invalid WIP aggregate for outsourcing line: %#v", aggregate)
		}
		requirement := aggregate.MaterialRequirements[0]
		lines = append(lines, f.client.OutsourcingOrderItem.Create().
			SetOutsourcingOrderID(order.ID).
			SetLineNo(index+1).
			SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
			SetMaterialID(f.production.materialID).
			SetProcessID(f.processes[biz.ProductionWIPOperationFabricProcessing].ID).
			SetUnitID(f.production.unitID).
			SetOutsourcingQuantity(requirement.PlannedQuantity).
			SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
			SaveX(ctx))
	}
	return order, lines
}

func (f outsourcingWIPPostgresRaceFixture) assignOutsourcedExecution(
	ctx context.Context,
	aggregate *biz.ProductionWIPAggregate,
	line *ent.OutsourcingOrderItem,
	key string,
) (*biz.ProductionWIPAggregate, error) {
	root := aggregate.Batches[0]
	requirementID := aggregate.MaterialRequirements[0].ID
	return f.production.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{
		ProductionOrderID: aggregate.ProductionOrderID,
		BatchID:           root.ID,
		ExpectedVersion:   root.Version,
		ActorID:           f.production.actorID,
		IdempotencyKey:    "wip-pg-assign/" + key + "/" + f.suffix,
		ExecutionMode:     biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{
			OutsourcingOrderItemID:               line.ID,
			ProductionOrderMaterialRequirementID: &requirementID,
		}},
	})
}

func (f outsourcingWIPPostgresRaceFixture) outsourcingAllocationCount(ctx context.Context, orderID int) int {
	itemIDs := f.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(orderID)).IDsX(ctx)
	if len(itemIDs) == 0 {
		return 0
	}
	return f.client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.OutsourcingOrderItemIDIn(itemIDs...),
	).CountX(ctx)
}
