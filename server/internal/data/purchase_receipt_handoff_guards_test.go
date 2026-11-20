package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchaserejectiondisposition"

	"github.com/go-kratos/kratos/v2/log"
)

func TestPurchaseReceiptMixedQualityPreservesAggregateOutcome(t *testing.T) {
	for _, remaining := range []string{"pending", "rejected", "passed"} {
		t.Run(remaining, func(t *testing.T) {
			f := newPartialInboundFixture(t, "aggregate_"+remaining)
			testPurchaseReceiptMixedQualityAggregate(t, f, remaining)
		})
	}
}

func testPurchaseReceiptMixedQualityAggregate(t *testing.T, f partialInboundFixture, remaining string) {
	t.Helper()
	f.decide(t, 4, true)
	wantOutcome := biz.PurchaseReceiptQualityGatePending
	if remaining != "pending" {
		f.decide(t, 6, remaining == "passed")
		wantOutcome = biz.PurchaseReceiptQualityGateRejected
		if remaining == "passed" {
			wantOutcome = biz.PurchaseReceiptQualityGateReady
		}
	}
	gate, err := f.inv.EvaluatePurchaseReceiptQualityGate(t.Context(), f.receipt.ID)
	if err != nil || gate.Outcome != wantOutcome {
		t.Fatalf("aggregate=%+v want=%s err=%v", gate, wantOutcome, err)
	}
	processRepo := NewProcessRuntimeRepo(f.data, log.NewStdLogger(io.Discard))
	command := claimedPostgresProcessCommandForBusinessRef(t, t.Context(), processRepo,
		biz.ProcessDomainCommandIncomingQualityGate, "aggregate-"+f.receipt.ReceiptNo,
		map[string]any{"purchase_receipt_id": f.receipt.ID}, biz.PurchaseReceiptSourceType, f.receipt.ID)
	repo := NewInventoryRepo(f.data, log.NewStdLogger(io.Discard))
	commandGate, err := repo.EvaluatePurchaseReceiptQualityGateForProcessCommand(t.Context(), f.receipt.ID, command, 7)
	node, nodeErr := processRepo.GetProcessNodeInstance(t.Context(), command.Node.ID)
	if nodeErr != nil {
		t.Fatal(nodeErr)
	}
	if remaining == "pending" {
		if !errors.Is(err, biz.ErrPurchaseReceiptQualityPending) || commandGate != nil || node.DomainCommandResultHash != nil {
			t.Fatalf("pending aggregate was completed: gate=%+v node=%+v err=%v", commandGate, node, err)
		}
	} else {
		if err != nil {
			t.Fatal(err)
		}
		result, err := biz.IncomingQualityGateProcessCommandResult(commandGate)
		want := biz.IncomingQualityGateProcessCommandOutcomeRejected
		if remaining == "passed" {
			want = biz.IncomingQualityGateProcessCommandOutcomePassed
		}
		if err != nil || result.Outcome != want || node.DomainCommandResultHash == nil || node.DomainCommandResult["outcome"] != want {
			t.Fatalf("aggregate command result=%+v stored=%+v want=%s err=%v", result, node.DomainCommandResult, want, err)
		}
	}
	current, err := f.inv.GetPurchaseReceipt(t.Context(), f.receipt.ID)
	if err != nil || !current.CanPost {
		t.Fatalf("passed line became unavailable: %+v err=%v", current, err)
	}
	posted, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID)
	wantPosted := 1
	if remaining == "passed" {
		wantPosted = 2
	}
	if err != nil || posted.PostedLines != wantPosted {
		t.Fatalf("ordinary warehouse posting=%+v err=%v", posted, err)
	}
}

func TestPurchaseReceiptInboundCommandCompletesWithDisposedRejection(t *testing.T) {
	f := newPartialInboundFixture(t, "command_disposed_rejection")
	testPurchaseReceiptInboundCommandCompletesWithDisposedRejection(t, f)
}

func testPurchaseReceiptInboundCommandCompletesWithDisposedRejection(t *testing.T, f partialInboundFixture) {
	t.Helper()
	f.decide(t, 4, true)
	f.decide(t, 6, false)
	f.dispose(t)
	ctx := t.Context()
	processRepo := NewProcessRuntimeRepo(f.data, log.NewStdLogger(io.Discard))
	command := claimedPostgresProcessCommandForBusinessRef(t, ctx, processRepo,
		biz.ProcessDomainCommandInventoryPostInbound, "inbound-"+f.receipt.ReceiptNo,
		map[string]any{"purchase_receipt_id": f.receipt.ID}, biz.PurchaseReceiptSourceType, f.receipt.ID)
	result := &biz.ProcessDomainCommandResult{Outcome: biz.InventoryProcessCommandOutcomeInboundPosted,
		EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef:   &biz.ProcessBusinessRef{RefType: biz.PurchaseReceiptSourceType, RefID: f.receipt.ID}}
	repo := NewInventoryRepo(f.data, log.NewStdLogger(io.Discard))
	for attempt := range 2 {
		posted, err := repo.PostPurchaseReceiptForProcessCommand(ctx, f.receipt.ID, command, result, 7)
		if err != nil || posted.PostedLines != 1 || posted.PendingInboundLines != 0 {
			t.Fatalf("inbound command attempt=%d receipt=%+v err=%v", attempt, posted, err)
		}
	}
	assertPostgresProcessEffect(t, ctx, processRepo, command.Node.ID, biz.ProcessDomainCommandEffectStateApplied, biz.PurchaseReceiptSourceType, f.receipt.ID)
	if count := f.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(f.receipt.ID), inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(ctx); count != 1 {
		t.Fatalf("inbound command replay duplicated IN facts: count=%d", count)
	}
	gate, err := f.inv.EvaluatePurchaseReceiptQualityGate(ctx, f.receipt.ID)
	if err != nil || gate.Outcome != biz.PurchaseReceiptQualityGateRejected {
		t.Fatalf("inbound command rewrote aggregate rejection: %+v err=%v", gate, err)
	}
}

func TestPurchaseRejectionCancellationRejectsClosedOrder(t *testing.T) {
	f := newPartialInboundFixture(t, "cancel_closed_order")
	testPurchaseRejectionCancellationRejectsClosedOrder(t, f)
}

func testPurchaseRejectionCancellationRejectsClosedOrder(t *testing.T, f partialInboundFixture) {
	t.Helper()
	f.decide(t, 4, true)
	f.decide(t, 6, false)
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	f.dispose(t)
	ctx := t.Context()
	order := f.client.PurchaseOrder.GetX(ctx, f.orderID)
	po := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(f.data, log.NewStdLogger(io.Discard)))
	if _, err := po.ClosePurchaseOrderWithAction(ctx, &biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version, ActorID: 1, IdempotencyKey: "close-" + order.PurchaseOrderNo, CloseMode: biz.SourceOrderCloseModeShort, Reason: "拒收部分不再采购"}); err != nil {
		t.Fatal(err)
	}
	disposition := f.client.PurchaseRejectionDisposition.Query().Where(purchaserejectiondisposition.PurchaseReceiptID(f.receipt.ID)).OnlyX(ctx)
	_, err := f.inv.CancelPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: disposition.ID, ExpectedVersion: disposition.Version, ActorID: 3, Reason: "撤销登记"})
	if !errors.Is(err, biz.ErrPurchaseRejectionCancelOrderState) {
		t.Fatalf("closed order cancellation=%v", err)
	}
	unchanged := f.client.PurchaseRejectionDisposition.GetX(ctx, disposition.ID)
	if unchanged.Status != biz.PurchaseRejectionStatusPosted || unchanged.Version != disposition.Version || unchanged.CancelledAt != nil {
		t.Fatalf("rejected cancellation changed disposition: %+v", unchanged)
	}
	receipt, err := f.inv.GetPurchaseReceipt(ctx, f.receipt.ID)
	if err != nil || receipt.PendingInboundLines != 0 || receipt.CanPost {
		t.Fatalf("closed source handoff reopened: %+v err=%v", receipt, err)
	}
	assertFulfillmentTask(t, ctx, f.client, "receipt_inbound", receipt.ID, "done", biz.WarehouseRoleKey)
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	ap, err := facts.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{PurchaseReceiptID: receipt.ID, FactNo: "AP-" + order.PurchaseOrderNo, IdempotencyKey: "ap-" + order.PurchaseOrderNo})
	if err != nil || ap.Amount.String() != "8" {
		t.Fatalf("settled receipt payable=%+v err=%v", ap, err)
	}
}

func TestPurchaseRejectionCancellationKeepsOpenOrderRecoveryAndClosedReplay(t *testing.T) {
	f := newPartialInboundFixture(t, "cancel_open_order")
	testPurchaseRejectionCancellationKeepsOpenOrderRecoveryAndClosedReplay(t, f)
}

func testPurchaseRejectionCancellationKeepsOpenOrderRecoveryAndClosedReplay(t *testing.T, f partialInboundFixture) {
	t.Helper()
	f.decide(t, 4, true)
	f.decide(t, 6, false)
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	f.dispose(t)
	ctx := t.Context()
	disposition := f.client.PurchaseRejectionDisposition.Query().Where(purchaserejectiondisposition.PurchaseReceiptID(f.receipt.ID)).OnlyX(ctx)
	input := &biz.PurchaseRejectionDispositionMutation{ID: disposition.ID, ExpectedVersion: disposition.Version, ActorID: 3, Reason: "重新核对来源"}
	if _, err := f.inv.CancelPurchaseRejectionDisposition(ctx, input); err != nil {
		t.Fatal(err)
	}
	current, err := f.inv.GetPurchaseReceipt(ctx, f.receipt.ID)
	if err != nil || current.PendingInboundLines != 1 {
		t.Fatalf("open source did not reopen: %+v err=%v", current, err)
	}
	correction, err := f.inv.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{InspectionID: f.inspections[6].ID, CorrectionInspectionNo: "QI-" + f.receipt.ReceiptNo + "-RECOVERY", Reason: "复核合格"}, 3)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(correction.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.PostPurchaseReceipt(ctx, f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	order := f.client.PurchaseOrder.GetX(ctx, f.orderID)
	po := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(f.data, log.NewStdLogger(io.Discard)))
	if _, err := po.ClosePurchaseOrderWithAction(ctx, &biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version, ActorID: 1, IdempotencyKey: "close-open-recovered", CloseMode: biz.SourceOrderCloseModeNormal}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.CancelPurchaseRejectionDisposition(ctx, input); err != nil {
		t.Fatalf("exact cancellation replay after close=%v", err)
	}
	receipt, err := f.inv.GetPurchaseReceipt(ctx, f.receipt.ID)
	if err != nil || receipt.PendingInboundLines != 0 || receipt.PostedLines != 2 {
		t.Fatalf("replay changed completed inbound: %+v err=%v", receipt, err)
	}
}

func testPurchaseRejectionCancellationRacesOrderClose(t *testing.T, f partialInboundFixture) {
	t.Helper()
	f.decide(t, 4, true)
	f.decide(t, 6, false)
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	f.dispose(t)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	order := f.client.PurchaseOrder.GetX(ctx, f.orderID)
	disposition := f.client.PurchaseRejectionDisposition.Query().Where(purchaserejectiondisposition.PurchaseReceiptID(f.receipt.ID)).OnlyX(ctx)
	po := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(f.data, log.NewStdLogger(io.Discard)))
	start := make(chan struct{})
	closed, cancelled := make(chan error, 1), make(chan error, 1)
	go func() {
		<-start
		_, err := po.ClosePurchaseOrderWithAction(ctx, &biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version, ActorID: 1, IdempotencyKey: "race-close-" + order.PurchaseOrderNo, CloseMode: biz.SourceOrderCloseModeShort, Reason: "结束拒收部分"})
		closed <- err
	}()
	go func() {
		<-start
		_, err := f.inv.CancelPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: disposition.ID, ExpectedVersion: disposition.Version, ActorID: 3, Reason: "重新核对来源"})
		cancelled <- err
	}()
	close(start)
	closeErr, cancelErr := <-closed, <-cancelled
	finalOrder := f.client.PurchaseOrder.GetX(ctx, order.ID)
	finalDisposition := f.client.PurchaseRejectionDisposition.GetX(ctx, disposition.ID)
	if closeErr == nil {
		if !errors.Is(cancelErr, biz.ErrPurchaseRejectionCancelOrderState) || finalOrder.LifecycleStatus != biz.PurchaseOrderStatusClosed || finalDisposition.Status != biz.PurchaseRejectionStatusPosted {
			t.Fatalf("close won but source reopened: close=%v cancel=%v order=%s disposition=%s", closeErr, cancelErr, finalOrder.LifecycleStatus, finalDisposition.Status)
		}
	} else if cancelErr != nil || !errors.Is(closeErr, biz.ErrPurchaseOrderCloseDraftReceiptDependency) || finalOrder.LifecycleStatus != biz.PurchaseOrderStatusApproved || finalDisposition.Status != biz.PurchaseRejectionStatusCancelled {
		t.Fatalf("cancel won but order closed: close=%v cancel=%v order=%s disposition=%s", closeErr, cancelErr, finalOrder.LifecycleStatus, finalDisposition.Status)
	}
}
