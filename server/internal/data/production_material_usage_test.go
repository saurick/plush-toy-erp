package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionwipbatch"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type productionMaterialUsageFixture struct {
	productionOrderTestFixture
	order              *biz.ProductionOrderAggregate
	facts              *biz.OperationalFactUsecase
	outside            *ent.OutsourcingOrderItem
	assignment         *biz.ProductionWIPAction
	warehouseID, lotID int
}

func openProductionMaterialUsageFixture(t *testing.T, name string, bind bool) productionMaterialUsageFixture {
	t.Helper()
	ctx := context.Background()
	f, warehouseID, lotID, facts := openProductionMaterialIssueFixture(t, name)
	order := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-CROSS", "cross")
	processes := createProductionWIPRouteProcesses(t, ctx, f.client)
	supplier := f.client.Supplier.Create().SetCode("CROSS-SUP").SetName("模拟外发厂").SetSupplierType("outsourcing").SaveX(ctx)
	outside := f.client.OutsourcingOrder.Create().SetOutsourcingOrderNo("CROSS-OUT").SetSupplierID(supplier.ID).
		SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx)
	line := f.client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(outside.ID).SetLineNo(1).
		SetSubjectType(biz.OutsourcingOrderSubjectMaterial).SetMaterialID(f.materialID).SetUnitID(f.unitID).
		SetProcessID(processes[biz.ProductionWIPOperationFabricProcessing].ID).
		SetOutsourcingQuantity(order.MaterialRequirements[0].PlannedQuantity).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
	batch := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderID(order.Order.ID)).OnlyX(ctx)
	assignment := &biz.ProductionWIPAction{
		ProductionOrderID: order.Order.ID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID,
		IdempotencyKey: "cross-assign", ExecutionMode: biz.ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: line.ID, ProductionOrderMaterialRequirementID: &order.MaterialRequirements[0].ID}},
	}
	if bind {
		if _, err := f.uc.AssignProductionWIPExecution(ctx, assignment); err != nil {
			t.Fatal(err)
		}
	}
	// Leave enough stock for both issues so quota assertions cannot pass merely
	// because an unrelated inventory shortage rejected the second writer.
	if _, err := NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)).ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: warehouseID, LotID: &lotID,
		UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(70),
		SourceType: "TEST_CROSS_ISSUE", IdempotencyKey: "cross-opening",
	}); err != nil {
		t.Fatal(err)
	}
	return productionMaterialUsageFixture{f, order, facts, line, assignment, warehouseID, lotID}
}

func (f productionMaterialUsageFixture) productionInput(no string, quantity int64) *biz.ProductionMaterialIssueFromOrderCreate {
	return productionMaterialIssueInput(no, no, f.order.Order.ID, f.order.Items[0].ID, f.order.MaterialRequirements[0].ID, f.warehouseID, f.lotID, decimal.NewFromInt(quantity))
}

func (f productionMaterialUsageFixture) outsourcingInput(no string, quantity int64) *biz.OutsourcingFactFromOrderCreate {
	return &biz.OutsourcingFactFromOrderCreate{FactNo: no, IdempotencyKey: no, OutsourcingOrderID: f.outside.OutsourcingOrderID,
		OutsourcingOrderItemID: f.outside.ID, WarehouseID: f.warehouseID, LotID: &f.lotID, Quantity: decimal.NewFromInt(quantity)}
}

func (f productionMaterialUsageFixture) assertUsage(t *testing.T, issued int64) {
	t.Helper()
	rows, err := f.facts.ListProductionOrderMaterialRequirements(context.Background(), f.order.Order.ID)
	if err != nil || len(rows) != 1 || !rows[0].IssuedQuantity.Equal(decimal.NewFromInt(issued)) ||
		!rows[0].RemainingQuantity.Equal(rows[0].EffectiveLimitQuantity.Sub(decimal.NewFromInt(issued))) {
		t.Fatalf("common material usage: rows=%#v err=%v", rows, err)
	}
	aggregate, err := f.uc.Get(context.Background(), f.order.Order.ID)
	if err != nil || !aggregate.MaterialRequirements[0].IssuedQuantity.Equal(decimal.NewFromInt(issued)) {
		t.Fatalf("order usage disagrees: %v", err)
	}
}

func TestProductionMaterialUsageRejectsCrossChainDuplicateAndReleasesOnReversal(t *testing.T) {
	for _, outsideFirst := range []bool{true, false} {
		name := "production_first"
		if outsideFirst {
			name = "outsourcing_first"
		}
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			f := openProductionMaterialUsageFixture(t, name, true)
			production, err := f.facts.CreateProductionMaterialIssueFromOrder(ctx, f.productionInput("P", 22))
			if err != nil {
				t.Fatal(err)
			}
			outside, err := f.facts.CreateOutsourcingMaterialIssueFromOrder(ctx, f.outsourcingInput("O", 22))
			if err != nil {
				t.Fatal(err)
			}
			if outsideFirst {
				outside, err = f.facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(outside.ID, outside.Version, f.actorID, ""))
			} else {
				production, err = f.facts.PostProductionFact(ctx, operationalFactStatusMutation(production.ID, production.Version, f.actorID, ""))
			}
			if err != nil {
				t.Fatal(err)
			}
			f.assertUsage(t, 22)
			txnCount := f.client.InventoryTxn.Query().CountX(ctx)
			if outsideFirst {
				_, err = f.facts.PostProductionFact(ctx, operationalFactStatusMutation(production.ID, production.Version, f.actorID, ""))
			} else {
				_, err = f.facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(outside.ID, outside.Version, f.actorID, ""))
			}
			if !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
				t.Fatalf("second path must reject combined over-issue: %v", err)
			}
			if f.client.InventoryTxn.Query().CountX(ctx) != txnCount {
				t.Fatal("rejected second issue wrote inventory")
			}
			if _, err = f.facts.CreateProductionMaterialIssueFromOrder(ctx, f.productionInput("P-extra", 1)); !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
				t.Fatalf("new production draft: %v", err)
			}
			if outsideFirst {
				_, err = f.facts.CancelPostedOutsourcingFact(ctx, operationalFactStatusMutation(outside.ID, outside.Version, f.actorID, "改由普通生产领料"))
			} else {
				_, err = f.facts.CancelPostedProductionFact(ctx, operationalFactStatusMutation(production.ID, production.Version, f.actorID, "改由委外发料"))
			}
			if err != nil {
				t.Fatal(err)
			}
			f.assertUsage(t, 0)
			if outsideFirst {
				_, err = f.facts.PostProductionFact(ctx, operationalFactStatusMutation(production.ID, production.Version, f.actorID, ""))
			} else {
				_, err = f.facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(outside.ID, outside.Version, f.actorID, ""))
			}
			if err != nil {
				t.Fatal(err)
			}
			f.assertUsage(t, 22)
		})
	}
}

func TestProductionMaterialUsageRejectsBindingPreviouslyOverIssuedSource(t *testing.T) {
	ctx := context.Background()
	f := openProductionMaterialUsageFixture(t, "cross_late_binding", false)
	p, err := f.facts.CreateProductionMaterialIssueFromOrder(ctx, f.productionInput("P", 22))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.facts.PostProductionFact(ctx, operationalFactStatusMutation(p.ID, p.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	o, err := f.facts.CreateOutsourcingMaterialIssueFromOrder(ctx, f.outsourcingInput("O", 22))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(o.ID, o.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	if _, err = f.uc.AssignProductionWIPExecution(ctx, f.assignment); !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
		t.Fatalf("late allocation exceeded frozen demand: %v", err)
	}
	if f.client.ProductionWIPOutsourcingAllocation.Query().CountX(ctx) != 0 {
		t.Fatal("failed assignment persisted allocation")
	}
	batch := f.client.ProductionWIPBatch.GetX(ctx, f.assignment.BatchID)
	if batch.Version != f.assignment.ExpectedVersion || batch.ExecutionMode != nil {
		t.Fatal("failed assignment changed batch")
	}
	f.assertUsage(t, 22)
}

func TestProductionMaterialUsageOverIssueReversalIncludesOutsourcing(t *testing.T) {
	ctx := context.Background()
	f := openProductionMaterialUsageFixture(t, "cross_allowance", true)
	repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	d, err := f.facts.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-CROSS", DecisionType: biz.ProductionExceptionOverIssue,
		ProductionOrderID: f.order.Order.ID, ProductionOrderItemID: f.order.Items[0].ID, ProductionMaterialRequirementID: &f.order.MaterialRequirements[0].ID,
		RequestedQuantity: decimal.NewFromInt(3), Reason: "材料损耗补领", IdempotencyKey: "cross-allowance", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("cross-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	d, err = repo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: d.ID, ExpectedVersion: d.Version, ActorID: approver.ID, Reason: "批准"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	p, err := f.facts.CreateProductionMaterialIssueFromOrder(ctx, f.productionInput("P", 3))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.facts.PostProductionFact(ctx, operationalFactStatusMutation(p.ID, p.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	o, err := f.facts.CreateOutsourcingMaterialIssueFromOrder(ctx, f.outsourcingInput("O", 22))
	if err != nil {
		t.Fatal(err)
	}
	o, err = f.facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(o.ID, o.Version, f.actorID, ""))
	if err != nil {
		t.Fatal(err)
	}
	f.assertUsage(t, 25)
	if _, err = f.facts.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: d.ID, ExpectedVersion: d.Version, ActorID: f.actorID, Reason: "撤销额度"}); !errors.Is(err, biz.ErrProductionExceptionAllowanceUsed) {
		t.Fatalf("consumed outside allowance reversed: %v", err)
	}
	if _, err = f.facts.CancelPostedOutsourcingFact(ctx, operationalFactStatusMutation(o.ID, o.Version, f.actorID, "委外取消")); err != nil {
		t.Fatal(err)
	}
	if _, err = f.facts.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: d.ID, ExpectedVersion: d.Version, ActorID: f.actorID, Reason: "撤销额度"}); err != nil {
		t.Fatal(err)
	}
	f.assertUsage(t, 3)
}
