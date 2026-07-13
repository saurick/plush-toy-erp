package data

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderevent"

	"github.com/shopspring/decimal"
)

func (f productionOrderPGFixture) createReleasedOrder(t *testing.T, ctx context.Context, label string) *biz.ProductionOrderAggregate {
	t.Helper()
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-PF-" + label + "-" + f.suffix), ActorID: f.actorID,
		IdempotencyKey: "mo-pf-create-" + label + "-" + f.suffix,
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID,
		IdempotencyKey: "mo-pf-release-" + label + "-" + f.suffix,
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	return released
}

func (f productionOrderPGFixture) linkedFactInput(order *biz.ProductionOrderAggregate, label string, quantity int64) biz.OperationalFactMutation {
	return f.linkedFactInputForLine(order, 0, label, quantity)
}

func (f productionOrderPGFixture) linkedFactInputForLine(order *biz.ProductionOrderAggregate, lineIndex int, label string, quantity int64) biz.OperationalFactMutation {
	sourceType, sourceID, sourceLineID := biz.ProductionOrderSourceType, order.Order.ID, order.Items[lineIndex].ID
	skuID := f.skuID
	return biz.OperationalFactMutation{
		FactNo: "PF-" + label + "-" + f.suffix, FactType: biz.ProductionFactFinishedGoodsReceipt,
		SubjectType: biz.InventorySubjectProduct, SubjectID: f.productID, ProductSkuID: &skuID,
		WarehouseID: f.warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(quantity),
		SourceType: &sourceType, SourceID: &sourceID, SourceLineID: &sourceLineID,
		OccurredAt: time.Now().UTC(), OccurredAtSpecified: true,
		IdempotencyKey: "pf-" + label + "-" + f.suffix,
	}
}

func (f productionOrderPGFixture) createAndPostLinkedFact(t *testing.T, ctx context.Context, order *biz.ProductionOrderAggregate, lineIndex int, label string, quantity int64) *biz.ProductionFact {
	t.Helper()
	input := f.linkedFactInputForLine(order, lineIndex, label, quantity)
	fact, err := f.factUC.CreateProductionFactDraft(ctx, &input)
	if err != nil {
		t.Fatalf("create linked fact: %v", err)
	}
	posted, err := f.factUC.PostProductionFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post linked fact: %v", err)
	}
	return posted
}

func (f productionOrderPGFixture) assertProductionFactReversed(t *testing.T, ctx context.Context, factID int) {
	t.Helper()
	fact := f.client.ProductionFact.GetX(ctx, factID)
	if fact.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("production fact %d status=%s, want CANCELLED", factID, fact.Status)
	}
	postKey := biz.OperationalFactInventoryIdempotencyKey(biz.ProductionFactSourceType, factID, factID, "POST")
	original := f.client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey(postKey)).OnlyX(ctx)
	reversalKey := biz.OperationalFactInventoryIdempotencyKey(biz.ProductionFactSourceType, factID, factID, "REVERSAL")
	reversal := f.client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey(reversalKey)).OnlyX(ctx)
	if reversal.TxnType != biz.InventoryTxnReversal || reversal.ReversalOfTxnID == nil || *reversal.ReversalOfTxnID != original.ID {
		t.Fatalf("production fact %d reversal=%#v original=%#v", factID, reversal, original)
	}
}

func TestProductionOrderPostgresConcurrentFactReplayAndQuantityWinner(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	order := f.createReleasedOrder(t, ctx, "quantity")

	input := f.linkedFactInput(order, "same", 6)
	start := make(chan struct{})
	created := make([]*biz.ProductionFact, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range created {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			created[index], errs[index] = f.factUC.CreateProductionFactDraft(ctx, &input)
		}(i)
	}
	close(start)
	wg.Wait()
	if errs[0] != nil || errs[1] != nil || created[0].ID != created[1].ID {
		t.Fatalf("exact fact replay mismatch: facts=%#v errs=%#v", created, errs)
	}
	if count := f.client.ProductionFact.Query().Where(productionfact.IdempotencyKey(input.IdempotencyKey)).CountX(ctx); count != 1 {
		t.Fatalf("exact replay created %d facts", count)
	}

	secondInput := f.linkedFactInput(order, "second", 6)
	second, err := f.factUC.CreateProductionFactDraft(ctx, &secondInput)
	if err != nil {
		t.Fatalf("create second fact: %v", err)
	}
	postIDs := []int{created[0].ID, second.ID}
	postErrs := make([]error, 2)
	start = make(chan struct{})
	for i := range postIDs {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			_, postErrs[index] = f.factUC.PostProductionFact(ctx, postIDs[index])
		}(i)
	}
	close(start)
	wg.Wait()
	successes, exceeded := 0, 0
	for _, err := range postErrs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrProductionOrderQuantityExceeded):
			exceeded++
		default:
			t.Fatalf("unexpected concurrent post error: %v", err)
		}
	}
	if successes != 1 || exceeded != 1 {
		t.Fatalf("post winners=%d exceeded=%d errors=%#v", successes, exceeded, postErrs)
	}
	rows := f.client.ProductionFact.Query().Where(productionfact.IDIn(postIDs...)).AllX(ctx)
	posted, drafts := 0, 0
	for _, row := range rows {
		switch row.Status {
		case biz.OperationalFactStatusPosted:
			posted++
			if replay, err := f.factUC.PostProductionFact(ctx, row.ID); err != nil || replay.Status != biz.OperationalFactStatusPosted {
				t.Fatalf("posted fact replay failed: fact=%#v err=%v", replay, err)
			}
		case biz.OperationalFactStatusDraft:
			drafts++
		default:
			t.Fatalf("unexpected fact status %s", row.Status)
		}
	}
	if posted != 1 || drafts != 1 {
		t.Fatalf("failed post must roll back: posted=%d drafts=%d", posted, drafts)
	}
}

func TestProductionOrderPostgresCancellationAndFactPostingOneWinner(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	for iteration := 0; iteration < 8; iteration++ {
		label := fmt.Sprintf("race-%d", iteration)
		order := f.createReleasedOrder(t, ctx, label)
		input := f.linkedFactInput(order, label, 1)
		fact, err := f.factUC.CreateProductionFactDraft(ctx, &input)
		if err != nil {
			t.Fatalf("create linked fact: %v", err)
		}

		start := make(chan struct{})
		var postErr, cancelErr error
		reason := "并发取消验证"
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = f.factUC.PostProductionFact(ctx, fact.ID)
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = f.uc.Cancel(ctx, &biz.ProductionOrderAction{
				ID: order.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
				IdempotencyKey: "mo-pf-cancel-" + label + "-" + f.suffix,
				Reason:         &reason,
			})
		}()
		close(start)
		wg.Wait()

		orderRow := f.client.ProductionOrder.Query().Where(productionorder.ID(order.Order.ID)).OnlyX(ctx)
		factRow := f.client.ProductionFact.GetX(ctx, fact.ID)
		switch {
		case postErr == nil && errors.Is(cancelErr, biz.ErrProductionOrderHasPostedFacts):
			if orderRow.Status != biz.ProductionOrderStatusReleased || factRow.Status != biz.OperationalFactStatusPosted {
				t.Fatalf("post winner state mismatch: order=%s fact=%s", orderRow.Status, factRow.Status)
			}
		case cancelErr == nil && errors.Is(postErr, biz.ErrProductionOrderInvalidState):
			if orderRow.Status != biz.ProductionOrderStatusCancelled || factRow.Status != biz.OperationalFactStatusDraft {
				t.Fatalf("cancel winner state mismatch: order=%s fact=%s", orderRow.Status, factRow.Status)
			}
		default:
			t.Fatalf("iteration %d must have one legal winner: post=%v cancel=%v order=%s fact=%s", iteration, postErr, cancelErr, orderRow.Status, factRow.Status)
		}
	}
}

func TestProductionOrderPostgresCloseRequiresCompletionOrReasonAndReplaysExactly(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)

	complete := f.createReleasedOrder(t, ctx, "close-complete")
	f.createAndPostLinkedFact(t, ctx, complete, 0, "close-complete", 10)
	closed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: complete.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-complete-" + f.suffix,
	})
	if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed || closed.Order.CloseReason != nil {
		t.Fatalf("complete close without reason = %#v, %v", closed, err)
	}
	replayed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: complete.Order.ID, ExpectedVersion: 999, ActorID: f.actorID,
		IdempotencyKey: "close-complete-" + f.suffix,
	})
	if err != nil || replayed.Order.Version != closed.Order.Version {
		t.Fatalf("close exact replay = %#v, %v", replayed, err)
	}
	changedReason := "改变首次关闭意图"
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: complete.Order.ID, ExpectedVersion: 999, ActorID: f.actorID,
		IdempotencyKey: "close-complete-" + f.suffix, Reason: &changedReason,
	}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed close reason error = %v", err)
	}
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: complete.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-complete-stale-" + f.suffix,
	}); !errors.Is(err, biz.ErrProductionOrderConflict) {
		t.Fatalf("stale close version error = %v", err)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(
		productionorderevent.ProductionOrderID(complete.Order.ID),
		productionorderevent.CommandKey(biz.ProductionOrderCommandClose),
	).CountX(ctx); count != 1 {
		t.Fatalf("close replay/CAS receipt count=%d", count)
	}

	incomplete := f.createReleasedOrder(t, ctx, "close-incomplete")
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: incomplete.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-incomplete-missing-" + f.suffix,
	}); !errors.Is(err, biz.ErrProductionOrderCloseReasonRequired) {
		t.Fatalf("incomplete close without reason error = %v", err)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(
		productionorderevent.ProductionOrderID(incomplete.Order.ID),
		productionorderevent.CommandKey(biz.ProductionOrderCommandClose),
	).CountX(ctx); count != 0 {
		t.Fatalf("failed close receipt count=%d", count)
	}
	row := f.client.ProductionOrder.GetX(ctx, incomplete.Order.ID)
	if row.Status != biz.ProductionOrderStatusReleased || row.Version != 2 {
		t.Fatalf("failed close must roll back order: %#v", row)
	}
	reason := "计划调整，按当前完成量短关闭"
	shortClosed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: incomplete.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-incomplete-reason-" + f.suffix, Reason: &reason,
	})
	if err != nil || shortClosed.Order.CloseReason == nil || *shortClosed.Order.CloseReason != reason {
		t.Fatalf("short close with reason = %#v, %v", shortClosed, err)
	}

	reversed := f.createReleasedOrder(t, ctx, "close-reversed")
	fact := f.createAndPostLinkedFact(t, ctx, reversed, 0, "close-reversed", 10)
	if _, err := f.factUC.CancelPostedProductionFact(ctx, fact.ID); err != nil {
		t.Fatalf("reverse completed fact: %v", err)
	}
	f.assertProductionFactReversed(t, ctx, fact.ID)
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: reversed.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-after-reversal-missing-" + f.suffix,
	}); !errors.Is(err, biz.ErrProductionOrderCloseReasonRequired) {
		t.Fatalf("reversal must make order incomplete: %v", err)
	}
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: reversed.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-after-reversal-reason-" + f.suffix, Reason: &reason,
	}); err != nil {
		t.Fatalf("short close after reversal: %v", err)
	}

	closedThenReversed := f.createReleasedOrder(t, ctx, "close-then-reversed")
	closedFact := f.createAndPostLinkedFact(t, ctx, closedThenReversed, 0, "close-then-reversed", 10)
	closedOrder, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: closedThenReversed.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-then-reversed-" + f.suffix,
	})
	if err != nil || closedOrder.Order.Status != biz.ProductionOrderStatusClosed || closedOrder.Order.CloseReason != nil {
		t.Fatalf("close before correction = %#v, %v", closedOrder, err)
	}
	if _, err := f.factUC.CancelPostedProductionFact(ctx, closedFact.ID); err != nil {
		t.Fatalf("closed order fact must remain reversible: %v", err)
	}
	f.assertProductionFactReversed(t, ctx, closedFact.ID)
	closedRow := f.client.ProductionOrder.GetX(ctx, closedThenReversed.Order.ID)
	if closedRow.Status != biz.ProductionOrderStatusClosed || closedRow.Version != 3 || closedRow.CloseReason != nil {
		t.Fatalf("correction must preserve original close decision: %#v", closedRow)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(
		productionorderevent.ProductionOrderID(closedThenReversed.Order.ID),
		productionorderevent.CommandKey(biz.ProductionOrderCommandClose),
	).CountX(ctx); count != 1 {
		t.Fatalf("correction must preserve one close receipt, got %d", count)
	}
}

func TestProductionOrderPostgresCloseChecksEveryLineIndependently(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	draft := f.draft("MO-PF-CLOSE-MULTI-" + f.suffix)
	draft.Items[0].PlannedQuantity = decimal.NewFromInt(3)
	second := draft.Items[0]
	second.LineNo = 2
	second.PlannedQuantity = decimal.NewFromInt(4)
	draft.Items = append(draft.Items, second)
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: "close-multi-create-" + f.suffix})
	if err != nil {
		t.Fatalf("create multi-line order: %v", err)
	}
	order, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "close-multi-release-" + f.suffix})
	if err != nil {
		t.Fatalf("release multi-line order: %v", err)
	}
	f.createAndPostLinkedFact(t, ctx, order, 0, "close-multi-line-1", 3)
	f.createAndPostLinkedFact(t, ctx, order, 1, "close-multi-line-2-part", 3)
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: order.Order.ID, ExpectedVersion: 2, ActorID: f.actorID, IdempotencyKey: "close-multi-incomplete-" + f.suffix}); !errors.Is(err, biz.ErrProductionOrderCloseReasonRequired) {
		t.Fatalf("one incomplete line must reject normal close: %v", err)
	}
	f.createAndPostLinkedFact(t, ctx, order, 1, "close-multi-line-2-rest", 1)
	closed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: order.Order.ID, ExpectedVersion: 2, ActorID: f.actorID, IdempotencyKey: "close-multi-complete-" + f.suffix})
	if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed {
		t.Fatalf("multi-line completed close = %#v, %v", closed, err)
	}
}

func TestProductionOrderPostgresCloseFailsClosedForCorruptOrExcessFacts(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	reason := "异常数据人工核对"

	wrong := f.createReleasedOrder(t, ctx, "close-wrong-source")
	wrongLineID := wrong.Items[0].ID + 999999
	f.client.ProductionFact.Create().
		SetFactNo("PF-CLOSE-WRONG-" + f.suffix).
		SetFactType(biz.ProductionFactFinishedGoodsReceipt).
		SetStatus(biz.OperationalFactStatusPosted).
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(f.productID).
		SetProductSkuID(f.skuID).
		SetWarehouseID(f.warehouseID).
		SetUnitID(f.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		SetIdempotencyKey("pf-close-wrong-" + f.suffix).
		SetSourceType(biz.ProductionOrderSourceType).
		SetSourceID(wrong.Order.ID).
		SetSourceLineID(wrongLineID).
		SetOccurredAt(time.Now().UTC()).
		SetOccurredAtSpecified(true).
		SaveX(ctx)
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: wrong.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-wrong-source-" + f.suffix, Reason: &reason,
	}); !errors.Is(err, biz.ErrProductionOrderFactSourceInvalid) {
		t.Fatalf("wrong source close error = %v", err)
	}

	excess := f.createReleasedOrder(t, ctx, "close-excess")
	f.client.ProductionFact.Create().
		SetFactNo("PF-CLOSE-EXCESS-" + f.suffix).
		SetFactType(biz.ProductionFactFinishedGoodsReceipt).
		SetStatus(biz.OperationalFactStatusPosted).
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(f.productID).
		SetProductSkuID(f.skuID).
		SetWarehouseID(f.warehouseID).
		SetUnitID(f.unitID).
		SetQuantity(decimal.NewFromInt(11)).
		SetIdempotencyKey("pf-close-excess-" + f.suffix).
		SetSourceType(biz.ProductionOrderSourceType).
		SetSourceID(excess.Order.ID).
		SetSourceLineID(excess.Items[0].ID).
		SetOccurredAt(time.Now().UTC()).
		SetOccurredAtSpecified(true).
		SaveX(ctx)
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{
		ID: excess.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
		IdempotencyKey: "close-excess-" + f.suffix, Reason: &reason,
	}); !errors.Is(err, biz.ErrProductionOrderQuantityExceeded) {
		t.Fatalf("excess quantity close error = %v", err)
	}
	for _, orderID := range []int{wrong.Order.ID, excess.Order.ID} {
		row := f.client.ProductionOrder.GetX(ctx, orderID)
		if row.Status != biz.ProductionOrderStatusReleased || row.Version != 2 {
			t.Fatalf("failed close must preserve order %d: %#v", orderID, row)
		}
		if count := f.client.ProductionOrderEvent.Query().Where(
			productionorderevent.ProductionOrderID(orderID),
			productionorderevent.CommandKey(biz.ProductionOrderCommandClose),
		).CountX(ctx); count != 0 {
			t.Fatalf("failed close order %d receipt count=%d", orderID, count)
		}
	}
}

func TestProductionOrderPostgresCloseSerializesWithFactPostAndReversal(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	for iteration := 0; iteration < 8; iteration++ {
		label := fmt.Sprintf("close-post-race-%d", iteration)
		order := f.createReleasedOrder(t, ctx, label)
		input := f.linkedFactInput(order, label, 10)
		fact, err := f.factUC.CreateProductionFactDraft(ctx, &input)
		if err != nil {
			t.Fatalf("create post-race fact: %v", err)
		}
		start := make(chan struct{})
		var postErr, closeErr error
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); <-start; _, postErr = f.factUC.PostProductionFact(ctx, fact.ID) }()
		go func() {
			defer wg.Done()
			<-start
			_, closeErr = f.uc.Close(ctx, &biz.ProductionOrderAction{ID: order.Order.ID, ExpectedVersion: 2, ActorID: f.actorID, IdempotencyKey: "close-post-race-" + label + "-" + f.suffix})
		}()
		close(start)
		wg.Wait()
		orderRow := f.client.ProductionOrder.GetX(ctx, order.Order.ID)
		factRow := f.client.ProductionFact.GetX(ctx, fact.ID)
		if postErr != nil {
			t.Fatalf("fact post must remain legal while order is released: %v", postErr)
		}
		switch {
		case closeErr == nil:
			if orderRow.Status != biz.ProductionOrderStatusClosed || factRow.Status != biz.OperationalFactStatusPosted {
				t.Fatalf("serialized post then close mismatch: order=%s fact=%s", orderRow.Status, factRow.Status)
			}
		case errors.Is(closeErr, biz.ErrProductionOrderCloseReasonRequired):
			if orderRow.Status != biz.ProductionOrderStatusReleased || factRow.Status != biz.OperationalFactStatusPosted {
				t.Fatalf("close-before-post failure mismatch: order=%s fact=%s", orderRow.Status, factRow.Status)
			}
		default:
			t.Fatalf("unexpected close/post race result: close=%v post=%v", closeErr, postErr)
		}
	}

	for iteration := 0; iteration < 8; iteration++ {
		label := fmt.Sprintf("close-reverse-race-%d", iteration)
		order := f.createReleasedOrder(t, ctx, label)
		fact := f.createAndPostLinkedFact(t, ctx, order, 0, label, 10)
		start := make(chan struct{})
		var reverseErr, closeErr error
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); <-start; _, reverseErr = f.factUC.CancelPostedProductionFact(ctx, fact.ID) }()
		go func() {
			defer wg.Done()
			<-start
			_, closeErr = f.uc.Close(ctx, &biz.ProductionOrderAction{ID: order.Order.ID, ExpectedVersion: 2, ActorID: f.actorID, IdempotencyKey: "close-reverse-race-" + label + "-" + f.suffix})
		}()
		close(start)
		wg.Wait()
		orderRow := f.client.ProductionOrder.GetX(ctx, order.Order.ID)
		factRow := f.client.ProductionFact.GetX(ctx, fact.ID)
		switch {
		case closeErr == nil && reverseErr == nil:
			if orderRow.Status != biz.ProductionOrderStatusClosed || factRow.Status != biz.OperationalFactStatusCancelled {
				t.Fatalf("close then reversal mismatch: order=%s fact=%s", orderRow.Status, factRow.Status)
			}
		case reverseErr == nil && errors.Is(closeErr, biz.ErrProductionOrderCloseReasonRequired):
			if orderRow.Status != biz.ProductionOrderStatusReleased || factRow.Status != biz.OperationalFactStatusCancelled {
				t.Fatalf("reversal winner mismatch: order=%s fact=%s", orderRow.Status, factRow.Status)
			}
		default:
			t.Fatalf("close/reversal race must have one legal winner: close=%v reverse=%v", closeErr, reverseErr)
		}
		f.assertProductionFactReversed(t, ctx, fact.ID)
		closeReceiptCount := f.client.ProductionOrderEvent.Query().Where(
			productionorderevent.ProductionOrderID(order.Order.ID),
			productionorderevent.CommandKey(biz.ProductionOrderCommandClose),
		).CountX(ctx)
		if closeErr == nil && closeReceiptCount != 1 {
			t.Fatalf("successful concurrent close receipt count=%d", closeReceiptCount)
		}
		if errors.Is(closeErr, biz.ErrProductionOrderCloseReasonRequired) && closeReceiptCount != 0 {
			t.Fatalf("failed concurrent close receipt count=%d", closeReceiptCount)
		}
	}
}
