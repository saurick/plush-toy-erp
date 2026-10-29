package data

import (
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
)

func TestProductionWIPConcessionContinuesFrozenGates(t *testing.T) {
	for _, scenario := range []string{"complete", "reverse_draft", "reverse_submitted", "reject_next"} {
		t.Run(scenario, func(t *testing.T) {
			testProductionWIPConcessionContinuesFrozenGates(t, openProductionWIPQualityTestFixture(t, "wip_concession_"+scenario), scenario)
		})
	}
}

func TestProductionWIPQualityInspectionPostgresConcession(t *testing.T) {
	for _, scenario := range []string{"complete", "reverse_draft", "reverse_submitted", "reject_next"} {
		t.Run(scenario, func(t *testing.T) {
			data, client := openPurchaseReceiptPostgresTestData(t)
			f := newProductionWIPQualityTestFixture(t, t.Context(), data, client, postgresTestSuffix())
			testProductionWIPConcessionContinuesFrozenGates(t, f, scenario)
		})
	}
}

func testProductionWIPConcessionContinuesFrozenGates(t *testing.T, f productionWIPQualityTestFixture, scenario string) {
	t.Helper()
	gates := []string{biz.ProductionWIPQualityGateFinishedGoods, biz.ProductionWIPQualityGateNeedle, biz.ProductionWIPQualityGateSampling}
	fixture := f.createWaitingBatch(t, "CONCESSION-"+scenario, gates)
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejectedInput := approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject)
	if _, err := f.uc.RejectQualityInspection(f.ctx, rejectedInput); err != nil {
		t.Fatal(err)
	}
	beforeRetry := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID).Version
	if _, err := f.uc.RejectQualityInspection(f.ctx, rejectedInput); err != nil {
		t.Fatalf("identical rejection retry: %v", err)
	}
	if f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID).Version != beforeRetry {
		t.Fatal("rejection retry mutated batch")
	}
	repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	decision, err := uc.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{
		DecisionNo: "EX-" + scenario, DecisionType: biz.ProductionExceptionWIPConcession,
		ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID,
		ProductionWIPBatchID: &fixture.batch.ID, QualityInspectionID: &fixture.inspection.ID,
		RequestedQuantity: fixture.batch.Quantity, Reason: "外观让步", IdempotencyKey: "EX-" + scenario, RequestedBy: f.actorID,
	})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("quality-approver-" + scenario).SetPasswordHash("test").SaveX(f.ctx)
	approved, err := repo.decideProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准外观让步"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	execution := &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "执行外观让步"}
	applied, err := repo.executeProductionException(f.ctx, execution, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.executeProductionException(f.ctx, execution, nil, nil); err != nil {
		t.Fatalf("execute replay: %v", err)
	}
	if batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID); batch.Status != biz.ProductionWIPStatusWaitingQuality {
		t.Fatalf("concession skipped remaining gates: %+v", batch)
	}
	original := f.client.QualityInspection.GetX(f.ctx, fixture.inspection.ID)
	if original.Status != biz.QualityInspectionStatusRejected || *original.Result != biz.QualityInspectionResultReject {
		t.Fatal("concession rewrote original rejection")
	}
	next := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(fixture.batch.ID), qualityinspection.GateCode(gates[1]), qualityinspection.Status(biz.QualityInspectionStatusDraft)).OnlyX(f.ctx)
	reverse := &biz.ProductionExceptionMutation{ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "撤销外观让步"}
	if scenario == "reverse_draft" {
		if _, err := uc.ReverseProductionException(f.ctx, reverse); err != nil {
			t.Fatal(err)
		}
		if batch := f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID); batch.Status != biz.ProductionWIPStatusRejected {
			t.Fatal("reversal did not restore rejected batch")
		}
		if f.client.QualityInspection.GetX(f.ctx, next.ID).Status != biz.QualityInspectionStatusCancelled {
			t.Fatal("orphan next draft after reversal")
		}
		return
	}
	if _, err := f.uc.SubmitQualityInspection(f.ctx, next.ID); err != nil {
		t.Fatalf("next gate after approved concession: %v", err)
	}
	if _, err := uc.ReverseProductionException(f.ctx, reverse); !errors.Is(err, biz.ErrProductionExceptionWIPDependency) {
		t.Fatalf("reversal must protect submitted next gate: %v", err)
	}
	if scenario == "reverse_submitted" {
		return
	}
	if scenario == "reject_next" {
		if _, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(next.ID, biz.QualityInspectionResultReject)); err != nil {
			t.Fatal(err)
		}
		if f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID).Status != biz.ProductionWIPStatusRejected {
			t.Fatal("next failure must reject batch despite earlier concession")
		}
		return
	}
	if _, err := f.uc.PassQualityInspection(f.ctx, approximateQualityInspectionDecision(next.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatal(err)
	}
	if f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID).Status != biz.ProductionWIPStatusWaitingQuality {
		t.Fatal("needle pass skipped sampling")
	}
	last := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(fixture.batch.ID), qualityinspection.GateCode(gates[2])).OnlyX(f.ctx)
	if _, err := f.uc.SubmitQualityInspection(f.ctx, last.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.uc.PassQualityInspection(f.ctx, approximateQualityInspectionDecision(last.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatal(err)
	}
	if f.client.ProductionWIPBatch.GetX(f.ctx, fixture.batch.ID).Status != biz.ProductionWIPStatusAccepted {
		t.Fatal("all gates completed but batch not accepted")
	}
	if _, err := uc.ReverseProductionException(f.ctx, reverse); !errors.Is(err, biz.ErrProductionExceptionWIPDependency) {
		t.Fatalf("reversal must protect later completed gates: %v", err)
	}
}
