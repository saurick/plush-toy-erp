package data

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderevent"
	"server/internal/data/model/ent/productionordermaterialrequirement"
	"server/internal/data/model/ent/workflowtask"

	"github.com/shopspring/decimal"
)

func TestProductionOrderSalesPlanningCreateAndEditReplaceOwnQuantity(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_replace")
	create := func(no string, quantity int64) *biz.ProductionOrderAggregate {
		t.Helper()
		result, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft(no, quantity), ActorID: f.actorID, IdempotencyKey: no})
		if err != nil {
			t.Fatalf("create %s: %v", no, err)
		}
		return result
	}
	a, b := create("PLAN-A", 12), create("PLAN-B", 8)
	// Receipt replay must not consume capacity a second time, even when full.
	replay := create("PLAN-A", 12)
	if replay.Order.ID != a.Order.ID {
		t.Fatalf("create replay changed order: %#v", replay.Order)
	}
	_, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("PLAN-OVER", 1), ActorID: f.actorID, IdempotencyKey: "PLAN-OVER"})
	if !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("over-capacity create: %v", err)
	}
	if f.client.ProductionOrder.Query().Where(productionorder.OrderNo("PLAN-OVER")).CountX(ctx) != 0 ||
		f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("PLAN-OVER")).CountX(ctx) != 0 {
		t.Fatal("rejected create left an order or receipt")
	}
	save := &biz.ProductionOrderSave{ID: a.Order.ID, ExpectedVersion: 1, Draft: f.draft("PLAN-A", 12), ActorID: f.actorID, IdempotencyKey: "PLAN-A-SAVE"}
	saved, err := f.uc.SaveDraft(ctx, save)
	if err != nil || saved.Order.Version != 2 {
		t.Fatalf("unchanged quantity must exclude its old plan: result=%#v err=%v", saved, err)
	}
	if _, err = f.uc.SaveDraft(ctx, save); err != nil {
		t.Fatalf("save receipt replay: %v", err)
	}
	_, err = f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: a.Order.ID, ExpectedVersion: 2, Draft: f.draft("PLAN-A", 13), ActorID: f.actorID, IdempotencyKey: "PLAN-A-OVER"})
	if !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("over-capacity save: %v", err)
	}
	unchanged, err := f.uc.Get(ctx, a.Order.ID)
	if err != nil || unchanged.Order.Version != 2 || !unchanged.Items[0].PlannedQuantity.Equal(decimal.NewFromInt(12)) ||
		f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("PLAN-A-OVER")).CountX(ctx) != 0 {
		t.Fatalf("rejected save changed persisted draft: result=%#v err=%v", unchanged, err)
	}
	if _, err := f.uc.Cancel(ctx, &biz.ProductionOrderAction{ID: b.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "PLAN-B-CANCEL", Reason: productionOrderStringPtr("调整计划")}); err != nil {
		t.Fatalf("cancel releases capacity: %v", err)
	}
	create("PLAN-C", 8)
}

func TestProductionOrderSalesPlanningAggregatesRepeatedSourceLines(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_repeated")
	draft := f.draft("PLAN-MULTI", 11)
	second := draft.Items[0]
	second.LineNo = 2
	draft.Items = append(draft.Items, second)
	_, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: "PLAN-MULTI"})
	if !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("same-source incoming lines must sum before validation: %v", err)
	}
	if f.client.ProductionOrder.Query().CountX(ctx) != 0 || f.client.ProductionOrderEvent.Query().CountX(ctx) != 0 {
		t.Fatal("rejected repeated-source draft left side effects")
	}
	// Standalone production remains valid without a sales source.
	draft.Items[0].SalesOrderItemID = nil
	draft.Items = draft.Items[:1]
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: "PLAN-STANDALONE"}); err != nil {
		t.Fatalf("standalone production: %v", err)
	}
}

func TestProductionOrderSalesPlanningIncludesPreShipmentSamples(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_samples")
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).
		SetOrderedQuantity(decimal.NewFromInt(100)).SetPreShipmentSampleQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	create := func(no string, quantities ...int64) (*biz.ProductionOrderAggregate, error) {
		t.Helper()
		draft := f.draft(no, quantities[0])
		for index, quantity := range quantities[1:] {
			item := draft.Items[0]
			item.LineNo = index + 2
			item.PlannedQuantity = decimal.NewFromInt(quantity)
			draft.Items = append(draft.Items, item)
		}
		return f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: no})
	}
	query := func(orderID int) *biz.ProductionOrderReferenceOption {
		t.Helper()
		options, total, err := f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{
			ReferenceType: biz.ProductionOrderReferenceSalesOrderItem, ProductionOrderID: orderID, SelectedIDs: []int{f.salesItemID}, Limit: 20,
		})
		if err != nil || total != 1 || len(options) != 1 {
			t.Fatalf("sample capacity option: options=%#v total=%d err=%v", options, total, err)
		}
		return options[0]
	}
	a, err := create("PLAN-SAMPLE-A", 100)
	if err != nil {
		t.Fatal(err)
	}
	available := query(0)
	if !available.Selectable || *available.OrderedQuantity != "100" || *available.RemainingPlannableQuantity != "5" || !strings.Contains(available.Label, "生产需求 105") {
		t.Fatalf("samples must remain plannable after ordered goods: %#v", available)
	}
	if _, err := create("PLAN-SAMPLE-OVER", 3, 3); !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("cross-order repeated source total 106 must fail: %v", err)
	}
	if f.client.ProductionOrder.Query().Where(productionorder.OrderNo("PLAN-SAMPLE-OVER")).CountX(ctx) != 0 ||
		f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("PLAN-SAMPLE-OVER")).CountX(ctx) != 0 {
		t.Fatal("rejected sample plan left order or receipt")
	}
	b, err := create("PLAN-SAMPLE-B", 2, 3)
	if err != nil {
		t.Fatalf("cross-order repeated source total 105 must pass: %v", err)
	}
	full := query(0)
	if full.Selectable || full.Reason == nil || *full.PlannedProductionQuantity != "105" || *full.RemainingPlannableQuantity != "0" {
		t.Fatalf("full sample capacity must be disabled: %#v", full)
	}
	edit := query(a.Order.ID)
	if !edit.Selectable || *edit.PlannedProductionQuantity != "5" || *edit.RemainingPlannableQuantity != "100" {
		t.Fatalf("sample editing context counted itself: %#v", edit)
	}
	saved, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: a.Order.ID, ExpectedVersion: 1, Draft: f.draft("PLAN-SAMPLE-A", 100), ActorID: f.actorID, IdempotencyKey: "PLAN-SAMPLE-SAVE"})
	if err != nil {
		t.Fatalf("unchanged sample plan: %v", err)
	}
	_, err = f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: a.Order.ID, ExpectedVersion: saved.Order.Version, Draft: f.draft("PLAN-SAMPLE-A", 101), ActorID: f.actorID, IdempotencyKey: "PLAN-SAMPLE-SAVE-OVER"})
	if !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("sample edit total 106 must fail: %v", err)
	}
	unchanged, err := f.uc.Get(ctx, a.Order.ID)
	if err != nil || unchanged.Order.Version != saved.Order.Version || !unchanged.Items[0].PlannedQuantity.Equal(decimal.NewFromInt(100)) ||
		f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("PLAN-SAMPLE-SAVE-OVER")).CountX(ctx) != 0 {
		t.Fatalf("rejected sample edit changed draft or receipt: %#v %v", unchanged, err)
	}
	// Source corrections must be checked before freezing requirements or tasks.
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetPreShipmentSampleQuantity(decimal.NewFromInt(4)).SaveX(ctx)
	_, err = f.uc.Release(ctx, &biz.ProductionOrderAction{ID: a.Order.ID, ExpectedVersion: saved.Order.Version, ActorID: f.actorID, IdempotencyKey: "PLAN-SAMPLE-RELEASE-OVER"})
	if !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("release must reread corrected sample quantity: %v", err)
	}
	if f.client.ProductionOrder.GetX(ctx, a.Order.ID).Status != biz.ProductionOrderStatusDraft ||
		f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("PLAN-SAMPLE-RELEASE-OVER")).CountX(ctx) != 0 ||
		f.client.ProductionOrderMaterialRequirement.Query().Where(productionordermaterialrequirement.ProductionOrderID(a.Order.ID)).CountX(ctx) != 0 ||
		f.client.WorkflowTask.Query().Where(workflowtask.SourceType(biz.WorkflowSourceTaskProductionOrderSourceType), workflowtask.SourceID(a.Order.ID)).CountX(ctx) != 0 {
		t.Fatal("rejected sample release changed status, snapshot, task or receipt")
	}
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetPreShipmentSampleQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	cancel := &biz.ProductionOrderAction{ID: b.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "PLAN-SAMPLE-CANCEL", Reason: productionOrderStringPtr("调整船头样计划")}
	for i := 0; i < 2; i++ {
		if _, err := f.uc.Cancel(ctx, cancel); err != nil {
			t.Fatalf("sample cancellation and receipt replay: %v", err)
		}
	}
	if option := query(0); !option.Selectable || *option.RemainingPlannableQuantity != "5" {
		t.Fatalf("cancelled sample plan still consumes capacity: %#v", option)
	}
	c, err := create("PLAN-SAMPLE-C", 5)
	if err != nil {
		t.Fatal(err)
	}
	if replay, err := create("PLAN-SAMPLE-C", 5); err != nil || replay.Order.ID != c.Order.ID {
		t.Fatalf("sample receipt replay at full capacity: %#v %v", replay, err)
	}
}

func TestProductionOrderSalesPlanningUsesExactDecimalCapacity(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_decimal")
	f.client.Unit.UpdateOneID(f.unitID).SetPrecision(4).SaveX(ctx)
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetOrderedQuantity(decimal.RequireFromString("0.1")).SetPreShipmentSampleQuantity(decimal.RequireFromString("0.2")).SaveX(ctx)
	for index, quantity := range []string{"0.1", "0.2", "0.0001"} {
		draft := f.draft("PLAN-DECIMAL-"+quantity, 1)
		draft.Items[0].PlannedQuantity = decimal.RequireFromString(quantity)
		_, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: f.actorID, IdempotencyKey: draft.OrderNo})
		if index < 2 && err != nil {
			t.Fatalf("exact decimal plan %s: %v", quantity, err)
		}
		if index == 2 && !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
			t.Fatalf("smallest supported excess must be rejected: %v", err)
		}
	}
	totals, err := readProductionOrderSalesPlanning(ctx, f.client, []int{f.salesItemID}, 0)
	if err != nil || !totals[f.salesItemID].Equal(decimal.RequireFromString("0.3")) {
		t.Fatalf("decimal capacity drift: totals=%v err=%v", totals, err)
	}
}

func TestProductionOrderSalesPlanningSourceSwitchAndClearReleaseOldCapacity(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_switch")
	a, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("PLAN-SWITCH", 12), ActorID: f.actorID, IdempotencyKey: "PLAN-SWITCH"})
	if err != nil {
		t.Fatal(err)
	}
	oldLine := f.client.SalesOrderItem.GetX(ctx, f.salesItemID)
	newLine := f.client.SalesOrderItem.Create().SetSalesOrderID(oldLine.SalesOrderID).SetLineNo(2).
		SetProductID(f.productID).SetProductSkuID(f.skuID).SetUnitID(f.unitID).SetOrderedQuantity(decimal.NewFromInt(20)).SaveX(ctx)
	draft := f.draft("PLAN-SWITCH", 12)
	draft.Items[0].SalesOrderItemID = &newLine.ID
	saved, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: a.Order.ID, ExpectedVersion: 1, Draft: draft, ActorID: f.actorID, IdempotencyKey: "PLAN-SWITCH-SAVE"})
	if err != nil {
		t.Fatal(err)
	}
	totals, err := readProductionOrderSalesPlanning(ctx, f.client, []int{f.salesItemID, newLine.ID}, 0)
	if err != nil || !totals[f.salesItemID].IsZero() || !totals[newLine.ID].Equal(decimal.NewFromInt(12)) {
		t.Fatalf("source switch retained old capacity: totals=%v err=%v", totals, err)
	}
	draft.Items[0].SalesOrderItemID = nil
	if _, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: a.Order.ID, ExpectedVersion: saved.Order.Version, Draft: draft, ActorID: f.actorID, IdempotencyKey: "PLAN-SOURCE-CLEAR"}); err != nil {
		t.Fatal(err)
	}
	totals, err = readProductionOrderSalesPlanning(ctx, f.client, []int{newLine.ID}, 0)
	if err != nil || !totals[newLine.ID].IsZero() {
		t.Fatalf("cleared source retained capacity: totals=%v err=%v", totals, err)
	}
}

func TestProductionOrderSalesPlanningReleaseRevalidatesPersistedPlans(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_release")
	a, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("PLAN-RELEASE", 12), ActorID: f.actorID, IdempotencyKey: "PLAN-RELEASE"})
	if err != nil {
		t.Fatal(err)
	}
	// A stored source correction must not be bypassed by releasing an old draft.
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetOrderedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	_, err = f.uc.Release(ctx, &biz.ProductionOrderAction{ID: a.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "PLAN-RELEASE-OVER"})
	if !errors.Is(err, biz.ErrProductionOrderPlannedQuantityExceeded) {
		t.Fatalf("release must revalidate the source capacity: %v", err)
	}
	if f.client.ProductionOrder.GetX(ctx, a.Order.ID).Status != biz.ProductionOrderStatusDraft ||
		f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("PLAN-RELEASE-OVER")).CountX(ctx) != 0 ||
		f.client.ProductionOrderMaterialRequirement.Query().Where(productionordermaterialrequirement.ProductionOrderID(a.Order.ID)).CountX(ctx) != 0 ||
		f.client.WorkflowTask.Query().Where(workflowtask.SourceType(biz.WorkflowSourceTaskProductionOrderSourceType), workflowtask.SourceID(a.Order.ID)).CountX(ctx) != 0 {
		t.Fatal("rejected release changed status, snapshot, task or receipt")
	}
}

func TestProductionOrderSalesPlanningOptionsKeepFullLinesVisibleAndEditingContext(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_sales_plan_options")
	create := func(no string, quantity int64) *biz.ProductionOrderAggregate {
		t.Helper()
		a, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft(no, quantity), ActorID: f.actorID, IdempotencyKey: no})
		if err != nil {
			t.Fatal(err)
		}
		return a
	}
	a, b := create("PLAN-OPTION-A", 12), create("PLAN-OPTION-B", 8)
	query := func(orderID int) *biz.ProductionOrderReferenceOption {
		t.Helper()
		options, total, err := f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{
			ReferenceType: biz.ProductionOrderReferenceSalesOrderItem, ProductionOrderID: orderID, Keyword: "POR-SO", Limit: 20,
		})
		if err != nil || total != 1 || len(options) != 1 {
			t.Fatalf("capacity option: options=%#v total=%d err=%v", options, total, err)
		}
		return options[0]
	}
	full := query(0)
	if full.Selectable || full.Reason == nil || !strings.Contains(*full.Reason, "无剩余可排产") ||
		*full.PlannedProductionQuantity != "20" || *full.RemainingPlannableQuantity != "0" || !strings.Contains(full.Label, "已计划 20") {
		t.Fatalf("fully planned line must remain visible with a specific reason: %#v", full)
	}
	edit := query(a.Order.ID)
	if !edit.Selectable || *edit.PlannedProductionQuantity != "8" || *edit.RemainingPlannableQuantity != "12" || !strings.Contains(edit.Label, "其他单已计划 8") {
		t.Fatalf("editing capacity double-counted current draft: %#v", edit)
	}
	if _, _, err := f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{ReferenceType: biz.ProductionOrderReferenceSalesOrderItem, ProductionOrderID: 99999, Limit: 20}); !errors.Is(err, biz.ErrProductionOrderNotFound) {
		t.Fatalf("unknown editing context: %v", err)
	}
	// Closed production has already used its planning capacity; it is not a cancellation.
	now := time.Now().UTC()
	f.client.ProductionOrder.UpdateOneID(b.Order.ID).SetStatus(biz.ProductionOrderStatusClosed).
		SetReleasedBy(f.actorID).SetReleasedAt(now).SetClosedBy(f.actorID).SetClosedAt(now).SaveX(ctx)
	if *query(0).PlannedProductionQuantity != "20" {
		t.Fatal("closed order incorrectly released planning capacity")
	}
	if _, _, err := f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{ReferenceType: biz.ProductionOrderReferenceSalesOrderItem, ProductionOrderID: b.Order.ID, Limit: 20}); !errors.Is(err, biz.ErrProductionOrderInvalidState) {
		t.Fatalf("non-draft editing context: %v", err)
	}
}
