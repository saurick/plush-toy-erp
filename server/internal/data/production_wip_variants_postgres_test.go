package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipevent"
	"server/internal/data/model/ent/qualityinspection"
)

func postgresWIPVariantBatch(t *testing.T, code string) (productionOrderTestFixture, *biz.ProductionWIPAggregate, *biz.ProductionWIPBatch, string) {
	t.Helper()
	ctx := context.Background()
	pg := openProductionOrderPGFixture(t)
	f := productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID}
	flow := releaseProductionWIPRoute(t, ctx, f, "PG-VARIANT-"+pg.suffix, 2, false)
	current := flow.Batches[0]
	// The upstream accepted batch is fixture state. The target assignment,
	// completion, quality verdict and exception under test use normal usecases.
	for _, targetCode := range []string{biz.ProductionWIPOperationSewing, biz.ProductionWIPOperationHandwork} {
		accepted := f.client.ProductionWIPBatch.UpdateOneID(current.ID).SetStatus(biz.ProductionWIPStatusAccepted).AddVersion(1).SaveX(ctx)
		target := productionWIPOperationForCode(t, flow, targetCode)
		next, err := f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: current.ID, TargetOperationID: target.ID, ExpectedVersion: accepted.Version, ActorID: f.actorID, Quantity: current.Quantity, IdempotencyKey: pg.suffix + "-fixture-" + targetCode})
		if err != nil {
			t.Fatal(err)
		}
		flow = next
		current = productionWIPBatchForOperation(t, flow, target.ID)
		if targetCode == code {
			return f, flow, current, pg.suffix
		}
	}
	t.Fatalf("unsupported target %s", code)
	return f, flow, nil, pg.suffix
}

func TestProductionOrderPostgresOutsourcedStageReturnRollbackAndReplay(t *testing.T) {
	for _, code := range []string{biz.ProductionWIPOperationSewing, biz.ProductionWIPOperationHandwork} {
		t.Run(code, func(t *testing.T) {
			ctx := context.Background()
			f, flow, batch, suffix := postgresWIPVariantBatch(t, code)
			operation := productionWIPOperationForCode(t, flow, code)
			vendor := f.client.Supplier.Create().SetCode("PG-WIP-V-" + suffix).SetName("模拟加工厂").SetSupplierType("outsourcing").SaveX(ctx)
			contract := f.client.OutsourcingOrder.Create().SetOutsourcingOrderNo("PG-WIP-O-" + suffix).SetSupplierID(vendor.ID).SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx)
			line := f.client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(contract.ID).SetLineNo(1).SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetProductID(f.productID).SetProductSkuID(f.skuID).SetProcessID(operation.ProcessID).SetUnitID(f.unitID).SetOutsourcingQuantity(batch.Quantity).SetLineStatus(biz.OutsourcingOrderItemStatusOpen).SaveX(ctx)
			assigned, err := f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: suffix + "-assign", ExecutionMode: biz.ProductionWIPExecutionOutsourced, OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: line.ID}}})
			if err != nil {
				t.Fatal(err)
			}
			batch = productionWIPBatchByID(t, assigned, batch.ID)
			started, err := f.uc.StartProductionWIPOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: suffix + "-start"})
			if err != nil {
				t.Fatal(err)
			}
			batch = productionWIPBatchByID(t, started, batch.ID)
			if batch.Status != biz.ProductionWIPStatusOutsourced {
				t.Fatalf("status=%s", batch.Status)
			}
			input := &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: suffix + "-return", Quantity: batch.Quantity}
			short := *input
			short.Quantity = decimal.NewFromInt(1)
			if _, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, &short); !errors.Is(err, biz.ErrProductionWIPReturnQuantityMismatch) {
				t.Fatalf("short return=%v", err)
			}
			injected := errors.New("isolated first-quality-draft failure")
			fail := true
			failures := 0
			receivingInjectStoredRowFailure(t, f.data, "quality_inspections", &fail, &failures, injected)
			if _, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, input); !errors.Is(err, injected) {
				t.Fatalf("injected failure=%v", err)
			}
			if failures != 1 {
				t.Fatalf("injected writes=%d", failures)
			}
			current := f.client.ProductionWIPBatch.GetX(ctx, batch.ID)
			if current.Status != biz.ProductionWIPStatusOutsourced || current.Version != batch.Version {
				t.Fatal("failed quality draft changed source batch")
			}
			if n := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).CountX(ctx); n != 0 {
				t.Fatalf("failed quality rows=%d", n)
			}
			if n := f.client.ProductionWIPEvent.Query().Where(productionwipevent.ProductionWipBatchID(batch.ID), productionwipevent.Action(biz.ProductionWIPEventActionOutsourcingReturn)).CountX(ctx); n != 0 {
				t.Fatalf("failed event rows=%d", n)
			}
			fail = false
			received, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			nextBatch := productionWIPBatchByID(t, received, batch.ID)
			if nextBatch.Status != biz.ProductionWIPStatusWaitingQuality {
				t.Fatalf("received=%s", nextBatch.Status)
			}
			inspection := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).OnlyX(ctx)
			expectedGate := biz.ProductionWIPQualityGateShell
			if code == biz.ProductionWIPOperationHandwork {
				expectedGate = biz.ProductionWIPQualityGateFinishedGoods
			}
			if inspection.GateCode == nil || *inspection.GateCode != expectedGate || inspection.Status != biz.QualityInspectionStatusDraft {
				t.Fatalf("inspection=%+v", inspection)
			}
			replay, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, input)
			if err != nil || productionWIPBatchByID(t, replay, batch.ID).Version != nextBatch.Version {
				t.Fatalf("replay=%+v err=%v", replay, err)
			}
			if _, err := f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, &short); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("changed intent=%v", err)
			}
			if n := f.client.ProductionWIPEvent.Query().Where(productionwipevent.ProductionWipBatchID(batch.ID), productionwipevent.Action(biz.ProductionWIPEventActionOutsourcingReturn)).CountX(ctx); n != 1 {
				t.Fatalf("return events=%d", n)
			}
		})
	}
}

func TestProductionOrderPostgresShellDispositionRollbackReplayAndReversal(t *testing.T) {
	for _, kind := range []string{biz.ProductionExceptionWIPConcession, biz.ProductionExceptionScrap, biz.ProductionExceptionReworkOriginal, biz.ProductionExceptionReworkSwitch, biz.ProductionExceptionRemake} {
		t.Run(kind, func(t *testing.T) {
			ctx := context.Background()
			f, flow, batch, suffix := postgresWIPVariantBatch(t, biz.ProductionWIPOperationSewing)
			action := func(key string) *biz.ProductionWIPAction {
				input := &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: suffix + key}
				if key == "-assign" {
					input.ExecutionMode = biz.ProductionWIPExecutionInHouse
				}
				return input
			}
			assigned, err := f.uc.AssignProductionWIPExecution(ctx, action("-assign"))
			if err != nil {
				t.Fatal(err)
			}
			batch = productionWIPBatchByID(t, assigned, batch.ID)
			started, err := f.uc.StartProductionWIPOperation(ctx, action("-start"))
			if err != nil {
				t.Fatal(err)
			}
			batch = productionWIPBatchByID(t, started, batch.ID)
			completed, err := f.uc.CompleteProductionWIPOperation(ctx, action("-complete"))
			if err != nil {
				t.Fatal(err)
			}
			batch = productionWIPBatchByID(t, completed, batch.ID)
			inspection := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID)).OnlyX(ctx)
			if inspection.GateCode == nil || *inspection.GateCode != biz.ProductionWIPQualityGateShell {
				t.Fatalf("gate=%v", inspection.GateCode)
			}
			quality := biz.NewInventoryUsecase(NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)))
			if _, err = quality.SubmitQualityInspection(ctx, inspection.ID); err != nil {
				t.Fatal(err)
			}
			if _, err = quality.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject)); err != nil {
				t.Fatal(err)
			}
			repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
			uc := biz.NewOperationalFactUsecase(repo)
			input := &biz.ProductionExceptionSubmit{DecisionNo: "PG-SHELL-" + suffix, DecisionType: kind, ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: batch.ProductionOrderItemID, ProductionWIPBatchID: &batch.ID, QualityInspectionID: &inspection.ID, RequestedQuantity: batch.Quantity, Reason: "模拟皮套不合格处置", IdempotencyKey: suffix + "-request", RequestedBy: f.actorID}
			if biz.ProductionExceptionCreatesBatch(kind) {
				operation := productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationSewing)
				if kind == biz.ProductionExceptionRemake {
					operation = productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationFabricProcessing)
				}
				input.TargetOperationID = &operation.ID
				if kind != biz.ProductionExceptionReworkOriginal {
					v := f.client.Supplier.Create().SetCode("PG-SHELL-V-" + suffix).SetName("模拟新加工厂").SetSupplierType("outsourcing").SaveX(ctx)
					input.TargetSupplierID = &v.ID
				}
			}
			decision, err := uc.SubmitProductionException(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			approver := f.client.AdminUser.Create().SetUsername("pg-shell-boss-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
			approved, err := repo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准模拟方案"}, biz.ProductionExceptionApproved, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			if f.client.ProductionWIPBatch.GetX(ctx, batch.ID).Status != biz.ProductionWIPStatusRejected {
				t.Fatal("approval changed WIP fact")
			}
			injected := errors.New("isolated exception receipt failure")
			fail := true
			failures := 0
			receivingInjectStoredRowFailure(t, f.data, "production_wip_events", &fail, &failures, injected)
			command := &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "执行模拟方案"}
			if _, err = repo.executeProductionException(ctx, command, nil, nil); !errors.Is(err, injected) {
				t.Fatalf("injected error=%v", err)
			}
			if failures != 1 {
				t.Fatalf("injected writes=%d", failures)
			}
			if f.client.ProductionWIPBatch.GetX(ctx, batch.ID).Status != biz.ProductionWIPStatusRejected {
				t.Fatal("failed receipt changed WIP")
			}
			if n := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.OriginExceptionDecisionID(decision.ID)).CountX(ctx); n != 0 {
				t.Fatalf("failed branch rows=%d", n)
			}
			fail = false
			applied, err := repo.executeProductionException(ctx, command, nil, nil)
			if err != nil || applied.ExecutionStatus != biz.ProductionExceptionExecutionApplied {
				t.Fatalf("applied=%+v err=%v", applied, err)
			}
			want := biz.ProductionWIPStatusCancelled
			if kind == biz.ProductionExceptionWIPConcession {
				want = biz.ProductionWIPStatusAccepted
			}
			if got := f.client.ProductionWIPBatch.GetX(ctx, batch.ID).Status; got != want {
				t.Fatalf("batch=%s want=%s", got, want)
			}
			replay, err := repo.executeProductionException(ctx, command, nil, nil)
			if err != nil || replay.Version != applied.Version {
				t.Fatalf("replay=%+v err=%v", replay, err)
			}
			reversed, err := uc.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "撤销尚未开工的处置"})
			if err != nil || reversed.ExecutionStatus != biz.ProductionExceptionExecutionReversed {
				t.Fatalf("reversed=%+v err=%v", reversed, err)
			}
			if f.client.ProductionWIPBatch.GetX(ctx, batch.ID).Status != biz.ProductionWIPStatusRejected {
				t.Fatal("reverse did not restore rejected batch")
			}
			original := f.client.QualityInspection.GetX(ctx, inspection.ID)
			if original.Status != biz.QualityInspectionStatusRejected || original.Result == nil || *original.Result != biz.QualityInspectionResultReject {
				t.Fatal("original inspection rewritten")
			}
		})
	}
}
