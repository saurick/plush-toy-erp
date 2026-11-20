package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/process"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func prepareProductionMaterialIssuePGSource(t *testing.T, ctx context.Context, f productionOrderPGFixture) (*biz.ProductionOrderAggregate, *ent.OutsourcingOrderItem, *ent.ProductionWIPBatch) {
	t.Helper()
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("CROSS-PG-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "cross-create-" + f.suffix})
	if err != nil {
		t.Fatal(err)
	}
	order, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID, IdempotencyKey: "cross-release-" + f.suffix})
	if err != nil {
		t.Fatal(err)
	}
	requirement := order.MaterialRequirements[0]
	root := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderID(order.Order.ID)).OnlyX(ctx)
	fabric := f.client.Process.Query().Where(process.ProductionRouteOperationCode(biz.ProductionWIPOperationFabricProcessing)).OnlyX(ctx)
	supplier := f.client.Supplier.Create().SetCode("CROSS-SUP-" + f.suffix).SetName("模拟外发厂").SetSupplierType("outsourcing").SaveX(ctx)
	outside := f.client.OutsourcingOrder.Create().SetOutsourcingOrderNo("CROSS-OUT-" + f.suffix).SetSupplierID(supplier.ID).SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx)
	line := f.client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(outside.ID).SetLineNo(1).SetSubjectType(biz.OutsourcingOrderSubjectMaterial).SetMaterialID(f.materialID).SetUnitID(f.unitID).SetProcessID(fabric.ID).SetOutsourcingQuantity(requirement.PlannedQuantity).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
	return order, line, root
}

func TestProductionMaterialIssuePostgresConcurrentCrossChainIssue(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	f := openProductionOrderPGFixture(t)
	order, line, root := prepareProductionMaterialIssuePGSource(t, ctx, f)
	requirement := order.MaterialRequirements[0]
	var err error
	if _, err = f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{ProductionOrderID: order.Order.ID, BatchID: root.ID, ExpectedVersion: root.Version, ActorID: f.actorID, IdempotencyKey: "cross-assign-" + f.suffix, ExecutionMode: biz.ProductionWIPExecutionOutsourced, OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: line.ID, ProductionOrderMaterialRequirementID: &requirement.ID}}}); err != nil {
		t.Fatal(err)
	}
	lot := f.client.InventoryLot.Create().SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(f.materialID).SetLotNo("CROSS-LOT-" + f.suffix).SetStatus(biz.InventoryLotActive).SaveX(ctx)
	if _, err = NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)).ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.materialWarehouseID, LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(30), SourceType: "TEST_CROSS_ISSUE", IdempotencyKey: "cross-seed-" + f.suffix}); err != nil {
		t.Fatal(err)
	}
	p, err := f.factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("CROSS-P-"+f.suffix, "cross-p-"+f.suffix, order.Order.ID, order.Items[0].ID, requirement.ID, f.materialWarehouseID, lot.ID, requirement.PlannedQuantity))
	if err != nil {
		t.Fatal(err)
	}
	o, err := f.factUC.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: "CROSS-O-" + f.suffix, OutsourcingOrderID: line.OutsourcingOrderID, OutsourcingOrderItemID: line.ID, WarehouseID: f.materialWarehouseID, LotID: &lot.ID, Quantity: requirement.PlannedQuantity, IdempotencyKey: "cross-o-" + f.suffix})
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	errs := make([]error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, errs[0] = f.factUC.PostProductionFact(ctx, operationalFactStatusMutation(p.ID, p.Version, f.actorID, ""))
	}()
	go func() {
		defer wg.Done()
		<-start
		_, errs[1] = f.factUC.PostOutsourcingFact(ctx, operationalFactStatusMutation(o.ID, o.Version, f.actorID, ""))
	}()
	close(start)
	wg.Wait()
	winners, rejected := 0, 0
	for _, err := range errs {
		if err == nil {
			winners++
		} else if errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
			rejected++
		} else {
			t.Fatalf("unexpected concurrent outcome: %v", err)
		}
	}
	if winners != 1 || rejected != 1 {
		t.Fatalf("cross-chain winners=%d rejected=%d", winners, rejected)
	}
	usage, err := f.factUC.ListProductionOrderMaterialRequirements(ctx, order.Order.ID)
	if err != nil || !usage[0].IssuedQuantity.Equal(requirement.PlannedQuantity) || !usage[0].RemainingQuantity.IsZero() {
		t.Fatalf("concurrent usage=%+v err=%v", usage, err)
	}
	progress, err := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data)).List(ctx, biz.BusinessProgressQuery{View: "production", ID: order.Order.ID, Limit: 20, SnapshotAt: time.Now(), Access: biz.BusinessProgressAccess{Production: true, WIP: true}})
	if err != nil || len(progress.Rows) != 1 || progress.Rows[0].MaterialPending != 0 {
		t.Fatalf("progress differs from material usage: %+v err=%v", progress, err)
	}
}

func TestProductionOrderPostgresShortCloseConcurrentSupplement(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	f := openProductionOrderPGFixture(t)
	order := f.createReleasedOrder(t, ctx, "short-close")
	f.createAndPostLinkedFact(t, ctx, order, 0, "partial", 5)
	reason := "短关闭后补排剩余需求"
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: order.Order.ID, ExpectedVersion: order.Order.Version, ActorID: f.actorID, IdempotencyKey: "short-close-" + f.suffix, Reason: &reason}); err != nil {
		t.Fatal(err)
	}
	assertProductionSalesPlanningQuantity(t, f.client, f.salesItemID, 5)
	start := make(chan struct{})
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, suffix := range []string{"a", "b"} {
		wg.Add(1)
		go func(i int, suffix string) {
			defer wg.Done()
			<-start
			draft := f.draft("SUPPLEMENT-" + suffix + "-" + f.suffix)
			draft.Items[0].PlannedQuantity = decimal.NewFromInt(95)
			_, errs[i] = f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: "supplement-" + suffix + "-" + f.suffix})
		}(i, suffix)
	}
	close(start)
	wg.Wait()
	winners, rejected := 0, 0
	for _, err := range errs {
		if err == nil {
			winners++
		} else if errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
			rejected++
		} else {
			t.Fatalf("unexpected supplemental planning outcome: %v", err)
		}
	}
	if winners != 1 || rejected != 1 {
		t.Fatalf("supplement winners=%d rejected=%d", winners, rejected)
	}
	assertProductionSalesPlanningQuantity(t, f.client, f.salesItemID, 100)
}

func TestProductionMaterialIssuePostgresBindingDuringIssueRequiresRefresh(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	f := openProductionOrderPGFixture(t)
	order, line, root := prepareProductionMaterialIssuePGSource(t, ctx, f)
	requirement := order.MaterialRequirements[0]
	lot := f.client.InventoryLot.Create().SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(f.materialID).SetLotNo("BIND-LOT-" + f.suffix).SetStatus(biz.InventoryLotActive).SaveX(ctx)
	if _, err := NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)).ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.materialWarehouseID, LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(30), SourceType: "TEST_BIND_ISSUE", IdempotencyKey: "bind-seed-" + f.suffix}); err != nil {
		t.Fatal(err)
	}
	draft, err := f.factUC.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: "BIND-ISSUE-" + f.suffix, OutsourcingOrderID: line.OutsourcingOrderID, OutsourcingOrderItemID: line.ID, WarehouseID: f.materialWarehouseID, LotID: &lot.ID, Quantity: requirement.PlannedQuantity, IdempotencyKey: "bind-issue-" + f.suffix})
	if err != nil {
		t.Fatal(err)
	}
	blocker, err := f.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = blocker.Rollback() }()
	if _, err := blocker.ExecContext(ctx, "SELECT id FROM outsourcing_orders WHERE id = $1 FOR UPDATE", line.OutsourcingOrderID); err != nil {
		t.Fatal(err)
	}
	assigned := make(chan error, 1)
	go func() {
		_, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{ProductionOrderID: order.Order.ID, BatchID: root.ID, ExpectedVersion: root.Version, ActorID: f.actorID, IdempotencyKey: "bind-assign-" + f.suffix, ExecutionMode: biz.ProductionWIPExecutionOutsourced, OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: line.ID, ProductionOrderMaterialRequirementID: &requirement.ID}}})
		assigned <- err
	}()
	waitForPostgresBlockedQueryCount(t, ctx, f.data.sqldb, "SELECT id FROM outsourcing_orders", 1)
	posted := make(chan error, 1)
	request := operationalFactStatusMutation(draft.ID, draft.Version, f.actorID, "")
	go func() { _, err := f.factUC.PostOutsourcingFact(ctx, request); posted <- err }()
	waitForPostgresBlockedQueryCount(t, ctx, f.data.sqldb, "SELECT id FROM outsourcing_orders", 2)
	if err := blocker.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-assigned; err != nil {
		t.Fatalf("assignment: %v", err)
	}
	if err := <-posted; !errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency) {
		t.Fatalf("source changed while waiting must request refresh without reverse lock ordering: %v", err)
	}
	if current := f.client.OutsourcingFact.GetX(ctx, draft.ID); current.Status != biz.OperationalFactStatusDraft || current.Version != draft.Version {
		t.Fatal("refresh rejection changed fact")
	}
	if _, err := f.factUC.PostOutsourcingFact(ctx, request); err != nil {
		t.Fatalf("retry with current binding: %v", err)
	}
	usage, err := f.factUC.ListProductionOrderMaterialRequirements(ctx, order.Order.ID)
	if err != nil || !usage[0].IssuedQuantity.Equal(requirement.PlannedQuantity) {
		t.Fatalf("usage after retry: %+v %v", usage, err)
	}
}
