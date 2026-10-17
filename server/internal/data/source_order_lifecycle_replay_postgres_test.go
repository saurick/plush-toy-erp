package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/sourceorderlifecycleevent"

	"github.com/go-kratos/kratos/v2/log"
)

func TestSourceOrderLifecyclePostgresConcurrentReplayKeepsOneReceipt(t *testing.T) {
	for _, scenario := range []string{"same-intent", "changed-intent", "different-key"} {
		t.Run(scenario, func(t *testing.T) {
			ctx := context.Background()
			data, client := openPurchaseReceiptPostgresTestData(t)
			repo := NewSalesOrderRepo(data, log.NewStdLogger(io.Discard))
			suffix := postgresTestSuffix()
			customer := createSalesOrderTestCustomer(t, ctx, client, "CONTRACT-C-"+suffix, true)
			order := client.SalesOrder.Create().SetOrderNo("SO-CONTRACT-" + suffix).
				SetCustomerID(customer.ID).SetOrderDate(time.Now().UTC()).
				SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
			actions := make([]biz.SourceOrderLifecycleAction, 2)
			for index := range actions {
				in := biz.SourceOrderLifecycleAction{ID: order.ID, ExpectedVersion: order.Version,
					IdempotencyKey: "contract-cancel/" + suffix, Reason: "客户取消订单", ActorID: 7}
				if index == 1 && scenario == "changed-intent" {
					in.Reason = "更改取消意图"
				}
				if index == 1 && scenario == "different-key" {
					in.IdempotencyKey += "/another-attempt"
				}
				var err error
				actions[index], err = biz.NormalizeSourceOrderLifecycleAction(in, biz.SourceOrderActionCancel)
				if err != nil {
					t.Fatal(err)
				}
			}
			orders := make([]*biz.SalesOrder, 2)
			apply := func(index int) func() error {
				return func() error {
					var err error
					orders[index], err = repo.ApplySalesOrderLifecycleAction(ctx, &actions[index], biz.SalesOrderStatusCanceled)
					return err
				}
			}
			firstErr, secondErr := runPostgresSourceLockRace(t, ctx, data, "sales_orders", order.ID, apply(0), apply(1))
			var successes, failures int
			var winner int
			for index, err := range []error{firstErr, secondErr} {
				if err == nil {
					successes++
					winner = index
					if result := orders[index]; result == nil || result.Version != order.Version+1 || result.LifecycleStatus != biz.SalesOrderStatusCanceled {
						t.Fatalf("unexpected result: %#v", result)
					}
					continue
				}
				failures++
				want := biz.ErrIdempotencyConflict
				if scenario == "different-key" {
					want = biz.ErrSalesOrderConflict
				}
				if !errors.Is(err, want) {
					t.Fatalf("concurrent loser error=%v, want %v", err, want)
				}
			}
			wantSuccesses := 1
			if scenario == "same-intent" {
				wantSuccesses = 2
			}
			if successes != wantSuccesses || failures != 2-wantSuccesses {
				t.Fatalf("successes=%d failures=%d", successes, failures)
			}
			event := client.SourceOrderLifecycleEvent.Query().Where(
				sourceorderlifecycleevent.SourceType("sales_order"), sourceorderlifecycleevent.SourceID(order.ID),
			).OnlyX(ctx)
			if event.ActorID != 7 || event.IntentHash != actions[winner].IntentHash || event.SourceVersion != order.Version+1 {
				t.Fatalf("unexpected persisted receipt: %#v", event)
			}
			// A lost response is retried with its original version and intent.
			if replay, err := repo.ApplySalesOrderLifecycleAction(ctx, &actions[winner], biz.SalesOrderStatusCanceled); err != nil || replay.Version != event.SourceVersion {
				t.Fatalf("lost-response recovery=%#v err=%v", replay, err)
			}
			changedActor := actions[winner]
			changedActor.ActorID = 8
			changedActor, err := biz.NormalizeSourceOrderLifecycleAction(changedActor, biz.SourceOrderActionCancel)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := repo.ApplySalesOrderLifecycleAction(ctx, &changedActor, biz.SalesOrderStatusCanceled); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("cross-actor replay error=%v", err)
			}
			if stored := client.SalesOrder.GetX(ctx, order.ID); stored.Version != order.Version+1 {
				t.Fatalf("replay changed the version: %d", stored.Version)
			}
		})
	}
}
