package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data/model/ent/productionexceptiondecision"
)

func TestProductionExceptionRedecision(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_exception_redecision")
	testProductionExceptionRedecision(t, f, "REDECISION", false)
}

func TestProductionWIPQualityInspectionPostgresExceptionRedecision(t *testing.T) {
	data, client := openPurchaseOperationalPostgresTestData(t)
	suffix := postgresTestSuffix()
	f := newProductionWIPQualityTestFixture(t, context.Background(), data, client, suffix)
	testProductionExceptionRedecision(t, f, suffix, true)
}

func testProductionExceptionRedecision(t *testing.T, f productionWIPQualityTestFixture, suffix string, concurrent bool) {
	t.Helper()
	fixture := f.createWaitingBatch(t, suffix, []string{biz.ProductionWIPQualityGateFinishedGoods})
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatal(err)
	}
	repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	approver := f.client.AdminUser.Create().SetUsername("redecision-approver-" + suffix).SetPasswordHash("test-password-hash").SaveX(f.ctx)
	batchID, inspectionID := fixture.batch.ID, fixture.inspection.ID
	newInput := func(key, kind string) *biz.ProductionExceptionSubmit {
		return &biz.ProductionExceptionSubmit{DecisionNo: suffix + "-" + key, DecisionType: kind, ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID, ProductionWIPBatchID: &batchID, QualityInspectionID: &inspectionID, RequestedQuantity: fixture.batch.Quantity, Reason: "纠错后重新处置", IdempotencyKey: suffix + "-" + key, RequestedBy: f.actorID}
	}
	for _, kind := range []string{biz.ProductionExceptionWIPConcession, biz.ProductionExceptionScrap} {
		input := newInput(kind, kind)
		decision, err := uc.SubmitProductionException(f.ctx, input)
		if err != nil {
			t.Fatalf("submit %s after prior reversal: %v", kind, err)
		}
		replay, err := uc.SubmitProductionException(f.ctx, input)
		if err != nil || replay.ID != decision.ID {
			t.Fatalf("submission replay=%+v err=%v", replay, err)
		}
		if _, err := uc.SubmitProductionException(f.ctx, newInput(kind+"-duplicate", kind)); !errors.Is(err, biz.ErrProductionExceptionConflict) {
			t.Fatalf("active decision must return business conflict, got %v", err)
		}
		changed := *input
		changed.Reason = "不同意图"
		if _, err := uc.SubmitProductionException(f.ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
			t.Fatalf("changed intent: %v", err)
		}
		approved, err := repo.decideProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准重新处置"}, biz.ProductionExceptionApproved, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID); batch.Status != biz.ProductionWIPStatusRejected {
			t.Fatal("approval changed WIP before execution")
		}
		applied, err := repo.executeProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "执行重新处置"}, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		want := biz.ProductionWIPStatusAccepted
		if kind == biz.ProductionExceptionScrap {
			want = biz.ProductionWIPStatusCancelled
		}
		if batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID); batch.Status != want {
			t.Fatalf("executed batch=%s want=%s", batch.Status, want)
		}
		reverseInput := &biz.ProductionExceptionMutation{ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "撤销处置以便纠错"}
		reversed, err := uc.ReverseProductionException(f.ctx, reverseInput)
		if err != nil {
			t.Fatal(err)
		}
		if reversed.Status != biz.ProductionExceptionApproved || reversed.ExecutionStatus != biz.ProductionExceptionExecutionReversed || reversed.ExecutedAt == nil || reversed.ReversedAt == nil || reversed.ReverseReason == nil || *reversed.ReverseReason != reverseInput.Reason {
			t.Fatalf("reversal must preserve decision and execution audit: %+v", reversed)
		}
		if batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID); batch.Status != biz.ProductionWIPStatusRejected {
			t.Fatal("reversal did not restore rejected WIP")
		}
		if qi := f.client.QualityInspection.GetX(f.ctx, inspectionID); qi.Status != biz.QualityInspectionStatusRejected {
			t.Fatal("exception changed original quality evidence")
		}
		if again, err := uc.ReverseProductionException(f.ctx, reverseInput); err != nil || again.Version != reversed.Version {
			t.Fatalf("reversal replay=%+v err=%v", again, err)
		}
		if replay, err := uc.SubmitProductionException(f.ctx, input); err != nil || replay.ID != reversed.ID || replay.ExecutionStatus != biz.ProductionExceptionExecutionReversed {
			t.Fatalf("old submission must replay historical reversal: %+v err=%v", replay, err)
		}
		if _, err := repo.executeProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: reversed.ID, ExpectedVersion: reversed.Version, ActorID: f.actorID, Reason: "不可重新执行旧单"}, nil, nil); !errors.Is(err, biz.ErrProductionExceptionInvalidState) {
			t.Fatalf("reversed decision was executable: %v", err)
		}
	}
	if count := f.client.ProductionExceptionDecision.Query().Where(productionexceptiondecision.QualityInspectionID(inspectionID)).CountX(f.ctx); count != 2 {
		t.Fatalf("expected both historical decisions, got %d", count)
	}
	if concurrent {
		start := make(chan struct{})
		errs := make(chan error, 2)
		for _, kind := range []string{biz.ProductionExceptionWIPConcession, biz.ProductionExceptionScrap} {
			go func(kind string) {
				<-start
				_, err := uc.SubmitProductionException(f.ctx, newInput(kind+"-race", kind))
				errs <- err
			}(kind)
		}
		close(start)
		success, conflicts := 0, 0
		for range 2 {
			switch err := <-errs; {
			case err == nil:
				success++
			case errors.Is(err, biz.ErrProductionExceptionConflict):
				conflicts++
			default:
				t.Fatalf("unexpected concurrent decision result: %v", err)
			}
		}
		if success != 1 || conflicts != 1 {
			t.Fatalf("concurrent decisions: success=%d conflicts=%d", success, conflicts)
		}
	}
}
