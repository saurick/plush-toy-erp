package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionOverIssueApprovalExtendsAndCapsMaterialIssue(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_over_issue")
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-OVER-ISSUE", "over-issue")
	requirement := released.MaterialRequirements[0]
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-OVER-1", DecisionType: biz.ProductionExceptionOverIssue, ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID, ProductionMaterialRequirementID: &requirement.ID, RequestedQuantity: decimal.NewFromInt(5), Reason: "损耗超领", IdempotencyKey: "ex-over-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("over-issue-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	approved := decimal.NewFromInt(3)
	if _, guardErr := factUC.ApproveProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, ApprovedQuantity: &approved, Reason: "批准三件"}); !errors.Is(guardErr, biz.ErrProcessRuntimeRequired) {
		t.Fatalf("direct production exception approval guard err=%v", guardErr)
	}
	decision, err = factRepo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, ApprovedQuantity: &approved, Reason: "批准三件"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil || decision.Status != biz.ProductionExceptionApproved || decision.ApprovedQuantity == nil || !decision.ApprovedQuantity.Equal(approved) {
		t.Fatalf("decision=%#v err=%v", decision, err)
	}
	requirements, err := factUC.ListProductionOrderMaterialRequirements(ctx, released.Order.ID)
	if err != nil || len(requirements) != 1 ||
		!requirements[0].ApprovedOverIssueQuantity.Equal(approved) ||
		!requirements[0].EffectiveLimitQuantity.Equal(decimal.NewFromInt(25)) ||
		!requirements[0].RemainingQuantity.Equal(decimal.NewFromInt(25)) {
		t.Fatalf("approved over-issue requirement projection=%#v err=%v", requirements, err)
	}
	fact, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-1", "pf-over-1", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(25)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(fact.ID, fact.Version, f.actorID, "")); err != nil {
		t.Fatalf("approved issue post err=%v", err)
	}
	requirements, err = factUC.ListProductionOrderMaterialRequirements(ctx, released.Order.ID)
	if err != nil || len(requirements) != 1 ||
		!requirements[0].IssuedQuantity.Equal(decimal.NewFromInt(25)) ||
		!requirements[0].EffectiveLimitQuantity.Equal(decimal.NewFromInt(25)) ||
		!requirements[0].RemainingQuantity.IsZero() {
		t.Fatalf("consumed over-issue requirement projection=%#v err=%v", requirements, err)
	}
	if _, err := factUC.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: f.actorID, Reason: "撤销已使用额度"}); !errors.Is(err, biz.ErrProductionExceptionAllowanceUsed) {
		t.Fatalf("reverse consumed allowance err=%v", err)
	}
	excess, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-2", "pf-over-2", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(1)))
	if err == nil {
		_, err = factUC.PostProductionFact(ctx, operationalFactStatusMutation(excess.ID, excess.Version, f.actorID, ""))
	}
	if !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
		t.Fatalf("allowance overspend err=%v", err)
	}
}

func TestProductionOverIssueAllowanceCanBeRevokedBeforeUse(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_over_issue_revoke")
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-OVER-REVOKE", "over-revoke")
	requirement := released.MaterialRequirements[0]
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-OVER-REVOKE", DecisionType: biz.ProductionExceptionOverIssue, ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID, ProductionMaterialRequirementID: &requirement.ID, RequestedQuantity: decimal.NewFromInt(2), Reason: "临时损耗", IdempotencyKey: "ex-over-revoke", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("over-revoke-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	approved, err := factRepo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	reversed, err := factUC.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "不再需要"})
	if err != nil || reversed.ExecutionStatus != biz.ProductionExceptionExecutionReversed || reversed.ExecutedAt != nil || reversed.ExecutedBy != nil {
		t.Fatalf("reversed=%#v err=%v", reversed, err)
	}
	requirements, err := factUC.ListProductionOrderMaterialRequirements(ctx, released.Order.ID)
	if err != nil || len(requirements) != 1 ||
		!requirements[0].ApprovedOverIssueQuantity.IsZero() ||
		!requirements[0].EffectiveLimitQuantity.Equal(requirement.PlannedQuantity) ||
		!requirements[0].RemainingQuantity.Equal(requirement.PlannedQuantity) {
		t.Fatalf("reversed over-issue requirement projection=%#v err=%v", requirements, err)
	}
	replay, err := factUC.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "不再需要"})
	if err != nil || replay.ID != reversed.ID {
		t.Fatalf("reverse replay=%#v err=%v", replay, err)
	}
	excess, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-REVOKED", "pf-over-revoked", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, requirement.PlannedQuantity.Add(decimal.NewFromInt(1))))
	if err == nil {
		_, err = factUC.PostProductionFact(ctx, operationalFactStatusMutation(excess.ID, excess.Version, f.actorID, ""))
	}
	if !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
		t.Fatalf("revoked allowance still spendable err=%v", err)
	}
}

func TestProductionOverIssueApprovalRejectsEffectiveLimitOverflow(t *testing.T) {
	ctx := context.Background()
	f, _, _, factUC := openProductionMaterialIssueFixture(t, "production_over_issue_overflow")
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-OVER-OVERFLOW", "over-overflow")
	requirement := released.MaterialRequirements[0]
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{
		DecisionNo: "EX-OVER-OVERFLOW", DecisionType: biz.ProductionExceptionOverIssue,
		ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID,
		ProductionMaterialRequirementID: &requirement.ID,
		RequestedQuantity:               maxProductionNumericQuantity,
		Reason:                          "极值超领", IdempotencyKey: "ex-over-overflow", RequestedBy: f.actorID,
	})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().
		SetUsername("over-overflow-approver").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	_, err = factRepo.decideProductionException(
		ctx,
		&biz.ProductionExceptionMutation{
			ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID,
			Reason: "拒绝超出 numeric 上限",
		},
		biz.ProductionExceptionApproved,
		nil,
		nil,
	)
	if !errors.Is(err, biz.ErrProductionExceptionApprovalAmount) {
		t.Fatalf("over-issue overflow approval err=%v", err)
	}
	current, getErr := factUC.GetProductionException(ctx, decision.ID)
	if getErr != nil || current.Status != biz.ProductionExceptionSubmitted || current.ApprovedQuantity != nil {
		t.Fatalf("overflow approval changed decision=%#v err=%v", current, getErr)
	}
}

func TestProductionOverIssueApprovalCannotBeSpentTwiceConcurrently(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_over_issue_concurrent")
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-OVER-CONCURRENT", "over-concurrent")
	requirement := released.MaterialRequirements[0]
	base, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-BASE", "pf-over-base", released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, requirement.PlannedQuantity))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.PostProductionFact(ctx, operationalFactStatusMutation(base.ID, base.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	decision, err := factUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-OVER-CONCURRENT", DecisionType: biz.ProductionExceptionOverIssue, ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID, ProductionMaterialRequirementID: &requirement.ID, RequestedQuantity: decimal.NewFromInt(1), Reason: "只批准一件", IdempotencyKey: "ex-over-concurrent", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("over-issue-concurrent-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	if _, err := factRepo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准"}, biz.ProductionExceptionApproved, nil, nil); err != nil {
		t.Fatal(err)
	}
	facts := make([]*biz.ProductionFact, 2)
	for index := range facts {
		fact, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput("PF-OVER-RACE-"+string(rune('A'+index)), "pf-over-race-"+string(rune('a'+index)), released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(1)))
		if err != nil {
			t.Fatal(err)
		}
		facts[index] = fact
	}
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, fact := range facts {
		postRequest := operationalFactStatusMutation(fact.ID, fact.Version, f.actorID, "")
		wg.Add(1)
		go func(in *biz.OperationalFactStatusMutation) {
			defer wg.Done()
			<-start
			_, err := factUC.PostProductionFact(ctx, in)
			errs <- err
		}(postRequest)
	}
	close(start)
	wg.Wait()
	close(errs)
	success, exceeded := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			success++
		case errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded):
			exceeded++
		default:
			t.Fatalf("unexpected error=%v", err)
		}
	}
	if success != 1 || exceeded != 1 {
		t.Fatalf("success=%d exceeded=%d", success, exceeded)
	}
}

func TestProductionWIPConcessionKeepsRejectedInspectionAndAcceptsBatch(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_concession_decision")
	fixture := f.createWaitingBatch(t, "CONCESSION-DECISION", []string{biz.ProductionWIPQualityGateFinishedGoods})
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	factUC := biz.NewOperationalFactUsecase(factRepo)
	batchID, inspectionID := fixture.batch.ID, rejected.ID
	decision, err := factUC.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-CONCESSION-1", DecisionType: biz.ProductionExceptionWIPConcession, ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID, ProductionWIPBatchID: &batchID, QualityInspectionID: &inspectionID, RequestedQuantity: fixture.batch.Quantity, Reason: "客户让步接收", IdempotencyKey: "ex-concession-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("wip-concession-approver").SetPasswordHash("test-password-hash").SaveX(f.ctx)
	approved, err := factRepo.decideProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准让步"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil || approved.Status != biz.ProductionExceptionApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	if current := f.client.ProductionWIPBatch.GetX(f.ctx, batchID); current.Status != biz.ProductionWIPStatusRejected {
		t.Fatalf("approval must not change WIP, got %s", current.Status)
	}
	applied, err := factRepo.executeProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "执行让步"}, nil, nil)
	if err != nil || applied.ExecutionStatus != biz.ProductionExceptionExecutionApplied {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID)
	inspection := f.client.QualityInspection.GetX(f.ctx, inspectionID)
	if batch.Status != biz.ProductionWIPStatusAccepted || inspection.Status != biz.QualityInspectionStatusRejected || inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
		t.Fatalf("batch=%#v inspection=%#v", batch, inspection)
	}
	child, err := createProductionWIPChildBatch(f.ctx, f.client, batch, batch.ProductionOrderOperationID, "CONCESSION-DOWNSTREAM", biz.ProductionWIPFlowNormal, batch.Quantity, f.actorID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.ReverseProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "撤销让步"}); !errors.Is(err, biz.ErrProductionExceptionWIPDependency) {
		t.Fatalf("reverse with active downstream err=%v", err)
	}
	f.client.ProductionWIPBatch.UpdateOneID(child.ID).SetStatus(biz.ProductionWIPStatusCancelled).AddVersion(1).SaveX(f.ctx)
	reversed, err := factUC.ReverseProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "撤销让步"})
	if err != nil || reversed.ExecutionStatus != biz.ProductionExceptionExecutionReversed || f.client.ProductionWIPBatch.GetX(f.ctx, batchID).Status != biz.ProductionWIPStatusRejected {
		t.Fatalf("reversed=%#v err=%v", reversed, err)
	}
}

func TestProductionWIPScrapIsNonInventoryAndCancelsWholeBatch(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_wip_scrap_decision")
	fixture := f.createWaitingBatch(t, "SCRAP-DECISION", []string{biz.ProductionWIPQualityGateFinishedGoods})
	factRepo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	factUC := biz.NewOperationalFactUsecase(factRepo)
	if _, err := f.uc.SubmitQualityInspection(f.ctx, fixture.inspection.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := f.uc.RejectQualityInspection(f.ctx, approximateQualityInspectionDecision(fixture.inspection.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	batchID, inspectionID := fixture.batch.ID, rejected.ID
	before := f.client.InventoryTxn.Query().CountX(f.ctx)
	decision, err := factUC.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-SCRAP-WIP-1", DecisionType: biz.ProductionExceptionScrap, ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID, ProductionWIPBatchID: &batchID, QualityInspectionID: &inspectionID, RequestedQuantity: fixture.batch.Quantity, Reason: "在制整批报废", IdempotencyKey: "ex-scrap-wip-1", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("wip-scrap-approver").SetPasswordHash("test-password-hash").SaveX(f.ctx)
	approved, err := factRepo.decideProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准报废"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factRepo.executeProductionException(f.ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "执行报废"}, nil, nil); err != nil {
		t.Fatal(err)
	}
	batch := f.client.ProductionWIPBatch.GetX(f.ctx, batchID)
	after := f.client.InventoryTxn.Query().CountX(f.ctx)
	if batch.Status != biz.ProductionWIPStatusCancelled || after != before {
		t.Fatalf("batch=%#v inventory before=%d after=%d", batch, before, after)
	}
}

func TestProductionStockedScrapSourceIsRejected(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "production_stocked_scrap_decision")
	fixture := f.createWaitingBatch(t, "STOCKED-SCRAP", []string{biz.ProductionWIPQualityGateFinishedGoods})
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	_, err := factUC.SubmitProductionException(f.ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-SCRAP-FG-1", DecisionType: biz.ProductionExceptionScrap, ProductionOrderID: fixture.order.ID, ProductionOrderItemID: fixture.item.ID, RequestedQuantity: decimal.NewFromInt(1), Reason: "成品报废", IdempotencyKey: "ex-scrap-fg-1", RequestedBy: f.actorID})
	if !errors.Is(err, biz.ErrProductionExceptionSourceInvalid) {
		t.Fatalf("stocked scrap source err=%v", err)
	}
}
