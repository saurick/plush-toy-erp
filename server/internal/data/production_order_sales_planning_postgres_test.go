package data

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderevent"

	"github.com/shopspring/decimal"
)

func TestProductionOrderPostgresSalesPlanningConcurrentCreatesSingleWinner(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	results := runConcurrentProductionOrderPG(2, func(index int) (*biz.ProductionOrderAggregate, error) {
		draft := f.draft(fmt.Sprintf("PLAN-CREATE-%d-%s", index, f.suffix))
		draft.Items[0].PlannedQuantity = decimal.NewFromInt(60)
		return f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo})
	})
	winners, rejected := 0, 0
	for index, result := range results {
		if result.err == nil {
			winners++
			assertProductionOrderPGReceiptCount(t, ctx, f.client, result.aggregate.Order.ID, biz.ProductionOrderCommandCreate, 1)
		} else if errors.Is(result.err, biz.ErrProductionOrderPlannedQuantityExceeded) {
			rejected++
			no := fmt.Sprintf("PLAN-CREATE-%d-%s", index, f.suffix)
			if f.client.ProductionOrder.Query().Where(productionorder.OrderNo(no)).CountX(ctx) != 0 ||
				f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey(no)).CountX(ctx) != 0 {
				t.Fatal("rejected concurrent create left order or receipt")
			}
		} else {
			t.Fatalf("unexpected concurrent create result: %#v", result)
		}
	}
	totals, err := readProductionOrderSalesPlanning(ctx, f.client, []int{f.salesItemID}, 0)
	if err != nil || winners != 1 || rejected != 1 || !totals[f.salesItemID].Equal(decimal.NewFromInt(60)) {
		t.Fatalf("create capacity race: winners=%d rejected=%d totals=%v err=%v", winners, rejected, totals, err)
	}
}

func TestProductionOrderPostgresSalesPlanningConcurrentEditsSingleWinner(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	orders := make([]*biz.ProductionOrderAggregate, 2)
	for index := range orders {
		draft := f.draft(fmt.Sprintf("PLAN-EDIT-%d-%s", index, f.suffix))
		draft.Items[0].PlannedQuantity = decimal.NewFromInt(40)
		var err error
		orders[index], err = f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo})
		if err != nil {
			t.Fatal(err)
		}
	}
	results := runConcurrentProductionOrderPG(2, func(index int) (*biz.ProductionOrderAggregate, error) {
		draft := f.draft(orders[index].Order.OrderNo)
		draft.Items[0].PlannedQuantity = decimal.NewFromInt(60)
		return f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: orders[index].Order.ID, ExpectedVersion: 1, Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo + "-SAVE"})
	})
	winners, rejected := 0, 0
	for index, result := range results {
		if result.err == nil {
			winners++
		} else if errors.Is(result.err, biz.ErrProductionOrderPlannedQuantityExceeded) {
			rejected++
			unchanged, err := f.uc.Get(ctx, orders[index].Order.ID)
			if err != nil || unchanged.Order.Version != 1 || !unchanged.Items[0].PlannedQuantity.Equal(decimal.NewFromInt(40)) {
				t.Fatalf("rejected concurrent edit changed its draft: %#v %v", unchanged, err)
			}
			assertProductionOrderPGReceiptCount(t, ctx, f.client, orders[index].Order.ID, biz.ProductionOrderCommandSave, 0)
		} else {
			t.Fatalf("unexpected concurrent edit result: %#v", result)
		}
	}
	totals, err := readProductionOrderSalesPlanning(ctx, f.client, []int{f.salesItemID}, 0)
	if err != nil || winners != 1 || rejected != 1 || !totals[f.salesItemID].Equal(decimal.NewFromInt(100)) {
		t.Fatalf("edit capacity race: winners=%d rejected=%d totals=%v err=%v", winners, rejected, totals, err)
	}
}

func TestProductionOrderPostgresSalesPlanningCancelAndReplayCapacity(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	draft := f.draft("PLAN-CANCEL-" + f.suffix)
	draft.Items[0].PlannedQuantity = decimal.NewFromInt(100)
	a, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo})
	if err != nil {
		t.Fatal(err)
	}
	cancel := &biz.ProductionOrderAction{ID: a.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: draft.OrderNo + "-CANCEL", Reason: productionOrderStringPtr("重新安排生产")}
	if _, err := f.uc.Cancel(ctx, cancel); err != nil {
		t.Fatal(err)
	}
	draft.OrderNo += "-NEW"
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo})
	if err != nil {
		t.Fatalf("cancelled plan still consumed capacity: %v", err)
	}
	if _, err := f.uc.Cancel(ctx, cancel); err != nil {
		t.Fatalf("cancel receipt replay: %v", err)
	}
	for i := 0; i < 2; i++ {
		replay, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo})
		if err != nil || replay.Order.ID != created.Order.ID {
			t.Fatalf("create replay after cancellation: %#v %v", replay, err)
		}
	}
	totals, err := readProductionOrderSalesPlanning(ctx, f.client, []int{f.salesItemID}, 0)
	if err != nil || !totals[f.salesItemID].Equal(decimal.NewFromInt(100)) {
		t.Fatalf("receipt replay changed planning capacity: totals=%v err=%v", totals, err)
	}
}
