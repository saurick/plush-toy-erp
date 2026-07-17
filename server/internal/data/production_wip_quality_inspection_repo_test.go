package data

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type productionWIPQualityTestFixture struct {
	ctx       context.Context
	data      *Data
	client    *ent.Client
	uc        *biz.InventoryUsecase
	actorID   int
	unitID    int
	productID int
}

type productionWIPQualityBatchFixture struct {
	order      *ent.ProductionOrder
	item       *ent.ProductionOrderItem
	operation  *ent.ProductionOrderOperation
	batch      *ent.ProductionWIPBatch
	inspection *ent.QualityInspection
}

func openProductionWIPQualityTestFixture(t *testing.T, name string) productionWIPQualityTestFixture {
	t.Helper()
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, name)
	return newProductionWIPQualityTestFixture(t, ctx, data, client, "SQLITE")
}

func newProductionWIPQualityTestFixture(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	suffix string,
) productionWIPQualityTestFixture {
	t.Helper()
	actor := client.AdminUser.Create().
		SetUsername("wip-quality-actor-" + suffix).
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	unit := createTestUnit(t, ctx, client, "WQ-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "WQ-P-"+suffix)
	return productionWIPQualityTestFixture{
		ctx: ctx, data: data, client: client,
		uc:        biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard))),
		actorID:   actor.ID,
		unitID:    unit.ID,
		productID: product.ID,
	}
}

func (f productionWIPQualityTestFixture) createWaitingBatch(
	t *testing.T,
	label string,
	gates []string,
) productionWIPQualityBatchFixture {
	t.Helper()
	if len(gates) == 0 {
		t.Fatal("WIP quality fixture requires at least one gate")
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	order := f.client.ProductionOrder.Create().
		SetOrderNo("MO-WIP-Q-" + label).
		SetStatus(biz.ProductionOrderStatusReleased).
		SetVersion(2).
		SetCreatedBy(f.actorID).
		SetReleasedBy(f.actorID).
		SetReleasedAt(now).
		SaveX(f.ctx)
	item := f.client.ProductionOrderItem.Create().
		SetProductionOrderID(order.ID).
		SetLineNo(1).
		SetProductID(f.productID).
		SetUnitID(f.unitID).
		SetPlannedQuantity(decimal.NewFromInt(12)).
		SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).
		SetProductCodeSnapshot("WQ-P-" + label).
		SetProductNameSnapshot("在制品质检产品").
		SetUnitNameSnapshot("件").
		SaveX(f.ctx)
	process := f.client.Process.Create().
		SetCode("WIP-Q-PROC-" + label).
		SetName("手工-" + label).
		SetCategory(biz.ProductionWIPOperationHandwork).
		SetInhouseEnabled(true).
		SetOutsourcingEnabled(true).
		SetQualityRequired(true).
		SaveX(f.ctx)
	operation := f.client.ProductionOrderOperation.Create().
		SetProductionOrderID(order.ID).
		SetProductionOrderItemID(item.ID).
		SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).
		SetRouteVersion(biz.ProductionWIPRoutePlushSewHandV1Version).
		SetStepNo(30).
		SetOperationCode(biz.ProductionWIPOperationHandwork).
		SetProcessID(process.ID).
		SetProcessCodeSnapshot(process.Code).
		SetProcessNameSnapshot(process.Name).
		SetOutputCode(biz.ProductionWIPOutputFinishedGoods).
		SetInhouseAllowed(true).
		SetOutsourcingAllowed(true).
		SetPlannedQuantity(decimal.NewFromInt(12)).
		SetRequiredQualityGates(gates).
		SaveX(f.ctx)
	batch := f.client.ProductionWIPBatch.Create().
		SetProductionOrderID(order.ID).
		SetProductionOrderItemID(item.ID).
		SetProductionOrderOperationID(operation.ID).
		SetBatchNo("WIP-BATCH-" + label).
		SetFlowType(biz.ProductionWIPFlowNormal).
		SetExecutionMode(biz.ProductionWIPExecutionInHouse).
		SetStatus(biz.ProductionWIPStatusWaitingQuality).
		SetVersion(3).
		SetQuantity(decimal.NewFromInt(12)).
		SetCreatedBy(f.actorID).
		SetStartedAt(now).
		SetCompletedAt(now).
		SaveX(f.ctx)
	inspection, err := createProductionWIPQualityGateDraft(f.ctx, f.client, batch.ID, gates[0], false)
	if err != nil {
		t.Fatalf("create initial WIP quality gate: %v", err)
	}
	return productionWIPQualityBatchFixture{
		order: order, item: item, operation: operation, batch: batch, inspection: inspection,
	}
}

func TestProductionWIPQualityInspectionSequentialPassAndProjection(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_quality_sequential")
	gates := []string{
		biz.ProductionWIPQualityGateFinishedGoods,
		biz.ProductionWIPQualityGateNeedle,
		biz.ProductionWIPQualityGateSampling,
	}
	fixture := f.createWaitingBatch(t, "SEQ", gates)
	initialBatchVersion := fixture.batch.Version
	current := fixture.inspection

	for index, gate := range gates {
		if current.GateCode == nil || *current.GateCode != gate || current.Status != biz.QualityInspectionStatusDraft {
			t.Fatalf("gate %d draft = %+v, want %s/DRAFT", index, current, gate)
		}
		submitted, err := f.uc.SubmitQualityInspection(f.ctx, current.ID)
		if err != nil || submitted.Status != biz.QualityInspectionStatusSubmitted || submitted.InventoryLotID != 0 || submitted.WarehouseID != 0 {
			t.Fatalf("submit WIP gate %s row=%+v err=%v", gate, submitted, err)
		}
		decision := approximateQualityInspectionDecision(current.ID, biz.QualityInspectionResultPass)
		passed, err := f.uc.PassQualityInspection(f.ctx, decision)
		if err != nil || passed.Status != biz.QualityInspectionStatusPassed || passed.Result == nil || *passed.Result != decision.Result {
			t.Fatalf("pass WIP gate %s row=%+v err=%v", gate, passed, err)
		}
		batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID)
		if index < len(gates)-1 {
			if batch.Status != biz.ProductionWIPStatusWaitingQuality || batch.Version != initialBatchVersion {
				t.Fatalf("intermediate gate changed batch early: %+v", batch)
			}
			current = f.client.QualityInspection.Query().Where(
				qualityinspection.ProductionWipBatchID(batch.ID),
				qualityinspection.GateCode(gates[index+1]),
				qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
			).OnlyX(f.ctx)
		} else if batch.Status != biz.ProductionWIPStatusAccepted || batch.Version != initialBatchVersion+1 {
			t.Fatalf("final gate did not accept batch: %+v", batch)
		}
	}

	if _, err := f.uc.PassQualityInspection(f.ctx, approximateQualityInspectionDecision(current.ID, biz.QualityInspectionResultPass)); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("duplicate WIP decision must fail closed, got %v", err)
	}
	if count := f.client.InventoryLot.Query().CountX(f.ctx); count != 0 {
		t.Fatalf("WIP quality must not create or mutate inventory lots, count=%d", count)
	}
	for _, keyword := range []string{fixture.order.OrderNo, fixture.batch.BatchNo, "在制品质检产品", fixture.operation.ProcessNameSnapshot} {
		rows, total, err := f.uc.ListProductionStageQualityInspections(f.ctx, biz.QualityInspectionFilter{Keyword: keyword, Limit: 20})
		if err != nil || total != len(gates) || len(rows) != len(gates) {
			t.Fatalf("keyword %q WIP list total=%d len=%d err=%v", keyword, total, len(rows), err)
		}
		row := rows[0]
		if row.ProductionOrderNo == nil || *row.ProductionOrderNo != fixture.order.OrderNo ||
			row.ProductionOrderItemID == nil || *row.ProductionOrderItemID != fixture.item.ID ||
			row.ProductCode == nil || *row.ProductCode != "WQ-P-SEQ" ||
			row.ProductName == nil || *row.ProductName != "在制品质检产品" ||
			row.OperationCode == nil || *row.OperationCode != biz.ProductionWIPOperationHandwork ||
			row.OperationName == nil || *row.OperationName != fixture.operation.ProcessNameSnapshot ||
			row.WIPBatchNo == nil || *row.WIPBatchNo != fixture.batch.BatchNo ||
			row.BatchQuantity == nil || !row.BatchQuantity.Equal(decimal.NewFromInt(12)) {
			t.Fatalf("missing WIP quality projection: %+v", row)
		}
	}
	got, err := f.uc.GetQualityInspection(f.ctx, fixture.inspection.ID)
	if err != nil || got.SourceNo == nil || *got.SourceNo != fixture.order.OrderNo || got.WIPBatchNo == nil || *got.WIPBatchNo != fixture.batch.BatchNo {
		t.Fatalf("get WIP quality projection row=%+v err=%v", got, err)
	}
}

func TestProductionWIPQualityInspectionRejectsUnapprovedConcession(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_quality_concession")
	fixture := f.createWaitingBatch(t, "CONCESSION", []string{biz.ProductionWIPQualityGateNeedle})
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatalf("submit WIP gate: %v", err)
	}
	decision := approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultConcession)
	if _, err := f.uc.PassQualityInspection(f.ctx, decision); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("unapproved WIP concession must fail closed, got %v", err)
	}
	inspection := f.client.QualityInspection.GetX(f.ctx, fixture.inspection.ID)
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID)
	if inspection.Status != biz.QualityInspectionStatusSubmitted || inspection.Result != nil || batch.Status != biz.ProductionWIPStatusWaitingQuality {
		t.Fatalf("failed concession changed WIP gate or batch: inspection=%+v batch=%+v", inspection, batch)
	}
}

func TestProductionWIPQualityInspectionRejectsPersistedConcessionOnReadAndAdvance(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_quality_persisted_concession")
	fixture := f.createWaitingBatch(t, "DRIFT-CONCESSION", []string{
		biz.ProductionWIPQualityGateFinishedGoods,
		biz.ProductionWIPQualityGateNeedle,
	})
	if _, err := f.data.sqldb.ExecContext(
		f.ctx,
		"UPDATE quality_inspections SET status = ?, result = ? WHERE id = ?",
		biz.QualityInspectionStatusPassed,
		biz.QualityInspectionResultConcession,
		fixture.inspection.ID,
	); err != nil {
		t.Fatalf("seed persisted WIP concession: %v", err)
	}
	next, err := createProductionWIPQualityGateDraft(
		f.ctx,
		f.client,
		fixture.batch.ID,
		biz.ProductionWIPQualityGateNeedle,
		false,
	)
	if err != nil {
		t.Fatalf("create later gate fixture: %v", err)
	}
	if _, err := f.uc.SubmitQualityInspection(f.ctx, next.ID); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("persisted concession advance error = %v", err)
	}
	if _, err := f.uc.GetQualityInspection(f.ctx, fixture.inspection.ID); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("persisted concession get error = %v", err)
	}
	if _, _, err := f.uc.ListProductionStageQualityInspections(f.ctx, biz.QualityInspectionFilter{
		ProductionWIPBatchID: fixture.batch.ID,
		Limit:                20,
	}); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("persisted concession list error = %v", err)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID)
	if batch.Status != biz.ProductionWIPStatusWaitingQuality || batch.Version != fixture.batch.Version {
		t.Fatalf("persisted concession changed WIP batch: %+v", batch)
	}
}

func TestProductionWIPQualityInspectionRejectsBatch(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_quality_reject")
	fixture := f.createWaitingBatch(t, "REJECT", []string{biz.ProductionWIPQualityGateFinishedGoods})
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatalf("submit WIP rejection fixture: %v", err)
	}
	rejected, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject))
	if err != nil || rejected.Status != biz.QualityInspectionStatusRejected {
		t.Fatalf("reject WIP inspection row=%+v err=%v", rejected, err)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID)
	if batch.Status != biz.ProductionWIPStatusRejected || batch.Version != fixture.batch.Version+1 {
		t.Fatalf("rejected inspection did not reject batch: %+v", batch)
	}
	if _, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject)); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("duplicate reject must fail closed, got %v", err)
	}
}

func TestProductionWIPQualityInspectionCancelCreatesReplacement(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_quality_cancel")
	fixture := f.createWaitingBatch(t, "CANCEL", []string{biz.ProductionWIPQualityGateFinishedGoods})

	cancelled, err := f.uc.CancelQualityInspection(f.ctx, fixture.inspection.ID, stringPtr("重新送检"))
	if err != nil || cancelled.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("cancel WIP draft row=%+v err=%v", cancelled, err)
	}
	replacement := f.client.QualityInspection.Query().Where(
		qualityinspection.ProductionWipBatchID(fixture.batch.ID),
		qualityinspection.GateCode(biz.ProductionWIPQualityGateFinishedGoods),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).OnlyX(f.ctx)
	if replacement.ID == fixture.inspection.ID || replacement.Status != biz.QualityInspectionStatusDraft || !strings.Contains(replacement.InspectionNo, "-R02") {
		t.Fatalf("unexpected WIP draft replacement: %+v", replacement)
	}
	if _, err := f.uc.SubmitQualityInspection(f.ctx, replacement.ID); err != nil {
		t.Fatalf("submit replacement: %v", err)
	}
	if _, err := f.uc.CancelQualityInspection(f.ctx, replacement.ID, nil); err != nil {
		t.Fatalf("cancel submitted replacement: %v", err)
	}
	secondReplacement := f.client.QualityInspection.Query().Where(
		qualityinspection.ProductionWipBatchID(fixture.batch.ID),
		qualityinspection.GateCode(biz.ProductionWIPQualityGateFinishedGoods),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).OnlyX(f.ctx)
	if secondReplacement.ID == replacement.ID || secondReplacement.Status != biz.QualityInspectionStatusDraft || !strings.Contains(secondReplacement.InspectionNo, "-R03") {
		t.Fatalf("unexpected second WIP replacement: %+v", secondReplacement)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID)
	if batch.Status != biz.ProductionWIPStatusWaitingQuality || batch.Version != fixture.batch.Version {
		t.Fatalf("cancelling a WIP inspection must keep batch waiting: %+v", batch)
	}
}

func TestProductionWIPQualityInspectionRejectsOutOfOrderGate(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_quality_order")
	fixture := f.createWaitingBatch(t, "ORDER", []string{
		biz.ProductionWIPQualityGateFinishedGoods,
		biz.ProductionWIPQualityGateNeedle,
		biz.ProductionWIPQualityGateSampling,
	})
	later, err := createProductionWIPQualityGateDraft(
		f.ctx,
		f.client,
		fixture.batch.ID,
		biz.ProductionWIPQualityGateSampling,
		false,
	)
	if err != nil {
		t.Fatalf("create out-of-order gate fixture: %v", err)
	}
	if _, err := f.uc.SubmitQualityInspection(f.ctx, later.ID); !errors.Is(err, biz.ErrProductionWIPInvalidTransition) {
		t.Fatalf("out-of-order WIP gate must be rejected, got %v", err)
	}
	if batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID); batch.Status != biz.ProductionWIPStatusWaitingQuality || batch.Version != fixture.batch.Version {
		t.Fatalf("out-of-order attempt changed batch: %+v", batch)
	}
}

func TestProductionWIPQualityInspectionPostgresConcurrentDecision(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	suffix := postgresTestSuffix()
	f := newProductionWIPQualityTestFixture(t, ctx, data, client, suffix)
	fixture := f.createWaitingBatch(t, "PG-"+suffix, []string{biz.ProductionWIPQualityGateFinishedGoods})
	if _, err := f.uc.SubmitQualityInspection(ctx, fixture.inspection.ID); err != nil {
		t.Fatalf("submit postgres WIP quality fixture: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := f.uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultPass))
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	succeeded := 0
	rejected := 0
	for err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, biz.ErrProductionWIPInvalidTransition):
			rejected++
		default:
			t.Fatalf("unexpected concurrent WIP quality decision error: %v", err)
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("concurrent decision outcomes succeeded=%d rejected=%d", succeeded, rejected)
	}
	batch := client.ProductionWIPBatch.GetX(ctx, fixture.batch.ID)
	inspection := client.QualityInspection.GetX(ctx, fixture.inspection.ID)
	if batch.Status != biz.ProductionWIPStatusAccepted || batch.Version != fixture.batch.Version+1 || inspection.Status != biz.QualityInspectionStatusPassed {
		t.Fatalf("concurrent decision did not converge: batch=%+v inspection=%+v", batch, inspection)
	}
}
