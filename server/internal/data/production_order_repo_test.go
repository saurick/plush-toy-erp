package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderevent"
	"server/internal/data/model/ent/productionorderitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type productionOrderTestFixture struct {
	uc          *biz.ProductionOrderUsecase
	client      *ent.Client
	actorID     int
	unitID      int
	productID   int
	skuID       int
	salesItemID int
	bomID       int
}

func openProductionOrderRepoTest(t *testing.T, name string) productionOrderTestFixture {
	t.Helper()
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, name)
	actor := client.AdminUser.Create().SetUsername(name + "-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	unitRow := createSalesOrderTestUnit(t, ctx, client, "POR-U", true)
	productRow := createSalesOrderTestProduct(t, ctx, client, unitRow.ID, "POR-P", true)
	skuRow := createSalesOrderTestProductSKU(t, ctx, client, productRow.ID, unitRow.ID, "POR-SKU")
	customer := createSalesOrderTestCustomer(t, ctx, client, "POR-C", true)
	salesOrder := client.SalesOrder.Create().
		SetOrderNo("POR-SO").
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	salesItem := client.SalesOrderItem.Create().
		SetSalesOrderID(salesOrder.ID).
		SetLineNo(1).
		SetProductID(productRow.ID).
		SetProductSkuID(skuRow.ID).
		SetUnitID(unitRow.ID).
		SetOrderedQuantity(decimal.NewFromInt(20)).
		SaveX(ctx)
	bom := client.BOMHeader.Create().
		SetProductID(productRow.ID).
		SetVersion("ACTIVE-V1").
		SetStatus("ACTIVE").
		SaveX(ctx)
	repo := NewProductionOrderRepo(data, log.NewStdLogger(io.Discard))
	return productionOrderTestFixture{
		uc: biz.NewProductionOrderUsecase(repo), client: client, actorID: actor.ID,
		unitID: unitRow.ID, productID: productRow.ID, skuID: skuRow.ID, salesItemID: salesItem.ID, bomID: bom.ID,
	}
}

func (f productionOrderTestFixture) draft(orderNo string, quantity int64) biz.ProductionOrderDraft {
	return biz.ProductionOrderDraft{
		OrderNo: orderNo,
		Items: []biz.ProductionOrderDraftItem{{
			LineNo: 1, ProductID: f.productID, ProductSKUID: &f.skuID, UnitID: f.unitID,
			PlannedQuantity: decimal.NewFromInt(quantity), SalesOrderItemID: &f.salesItemID, BOMHeaderID: &f.bomID,
		}},
	}
}

func TestProductionOrderReferenceOptionsSelectedModeAndSalesSourceFirst(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_reference_options")

	for _, test := range []struct {
		referenceType string
		filter        biz.ProductionOrderReferenceFilter
		wantValue     int
	}{
		{biz.ProductionOrderReferenceProduct, biz.ProductionOrderReferenceFilter{Keyword: "POR-P"}, f.productID},
		{biz.ProductionOrderReferenceProductSKU, biz.ProductionOrderReferenceFilter{ProductID: f.productID, Keyword: "POR-SKU"}, f.skuID},
		{biz.ProductionOrderReferenceUnit, biz.ProductionOrderReferenceFilter{Keyword: "POR-U"}, f.unitID},
		{biz.ProductionOrderReferenceSalesOrderItem, biz.ProductionOrderReferenceFilter{Keyword: "POR-SO"}, f.salesItemID},
		{biz.ProductionOrderReferenceActiveBOM, biz.ProductionOrderReferenceFilter{ProductID: f.productID, Keyword: "ACTIVE-V1"}, f.bomID},
	} {
		t.Run(test.referenceType, func(t *testing.T) {
			test.filter.ReferenceType = test.referenceType
			test.filter.Limit = 20
			options, total, err := f.uc.ListReferenceOptions(ctx, test.filter)
			if err != nil || total != 1 || len(options) != 1 || options[0].Value != test.wantValue || !options[0].Selectable || options[0].Label == "" {
				t.Fatalf("options=%#v total=%d err=%v", options, total, err)
			}
		})
	}

	// 销售来源可先选，产品、规格和单位由同一个 option projection 一次带回。
	options, total, err := f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{
		ReferenceType: biz.ProductionOrderReferenceSalesOrderItem,
		Keyword:       "POR-SO",
		Limit:         20,
	})
	if err != nil || total != 1 || len(options) != 1 {
		t.Fatalf("source-first sales options total=%d len=%d err=%v", total, len(options), err)
	}
	option := options[0]
	if option.Value != f.salesItemID || option.ProductValue == nil || *option.ProductValue != f.productID || option.SKUValue == nil || *option.SKUValue != f.skuID || option.UnitValue == nil || *option.UnitValue != f.unitID {
		t.Fatalf("source-first projection = %#v", option)
	}
	f.client.ProductSKU.UpdateOneID(f.skuID).SetIsActive(false).SaveX(ctx)
	options, total, err = f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{
		ReferenceType: biz.ProductionOrderReferenceSalesOrderItem,
		Keyword:       "POR-SO",
		Limit:         20,
	})
	if err != nil || total != 0 || len(options) != 0 {
		t.Fatalf("inactive SKU must stay out of search options=%#v total=%d err=%v", options, total, err)
	}
	f.client.ProductSKU.UpdateOneID(f.skuID).SetIsActive(true).SaveX(ctx)

	// 历史回显只持有已保存 ID；当前来源失效后仍可读，但不可再次选择。
	salesItem := f.client.SalesOrderItem.GetX(ctx, f.salesItemID)
	f.client.SalesOrder.UpdateOneID(salesItem.SalesOrderID).SetLifecycleStatus(biz.SalesOrderStatusClosed).SaveX(ctx)
	options, total, err = f.uc.ListReferenceOptions(ctx, biz.ProductionOrderReferenceFilter{
		ReferenceType: biz.ProductionOrderReferenceSalesOrderItem,
		SelectedIDs:   []int{f.salesItemID, 999999},
		Limit:         1,
	})
	if err != nil || total != 2 || len(options) != 2 {
		t.Fatalf("selected history options total=%d len=%d err=%v", total, len(options), err)
	}
	if options[0].Selectable || options[0].SalesOrderNo == nil || options[0].Reason == nil {
		t.Fatalf("stale history projection = %#v", options[0])
	}
	if options[1].Selectable || options[1].Reason == nil || options[1].Label != "原关联记录已不可用" {
		t.Fatalf("missing history projection = %#v", options[1])
	}
}

func TestProductionOrderRepoAggregateLifecycleCASAndExactReplay(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_repo_lifecycle")
	create := &biz.ProductionOrderCreate{Draft: f.draft("MO-REPO-001", 10), ActorID: f.actorID, IdempotencyKey: "create-replay"}
	created, err := f.uc.CreateDraft(ctx, create)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if created.Order.Status != biz.ProductionOrderStatusDraft || created.Order.Version != 1 || len(created.Items) != 1 {
		t.Fatalf("unexpected created aggregate: %#v", created)
	}
	if created.Items[0].ProductCodeSnapshot == nil || created.Items[0].SKUCodeSnapshot == nil || created.Items[0].UnitNameSnapshot == nil || created.Items[0].BOMVersionSnapshot == nil {
		t.Fatalf("reference snapshots must come from master data: %#v", created.Items[0])
	}
	replayedCreate, err := f.uc.CreateDraft(ctx, create)
	if err != nil || replayedCreate.Order.ID != created.Order.ID || replayedCreate.Items[0].ID != created.Items[0].ID {
		t.Fatalf("CREATE exact replay = %#v, %v", replayedCreate, err)
	}
	changedCreate := *create
	changedCreate.Draft = f.draft("MO-REPO-CHANGED", 11)
	if _, err := f.uc.CreateDraft(ctx, &changedCreate); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed CREATE intent error = %v", err)
	}

	save := &biz.ProductionOrderSave{ID: created.Order.ID, ExpectedVersion: 1, Draft: f.draft("MO-REPO-001", 12), ActorID: f.actorID, IdempotencyKey: "save-replay"}
	saved, err := f.uc.SaveDraft(ctx, save)
	if err != nil || saved.Order.Version != 2 || !saved.Items[0].PlannedQuantity.Equal(decimal.NewFromInt(12)) {
		t.Fatalf("save draft = %#v, %v", saved, err)
	}
	replayedSaveInput := *save
	replayedSaveInput.ExpectedVersion = 999
	replayedSave, err := f.uc.SaveDraft(ctx, &replayedSaveInput)
	if err != nil || replayedSave.Order.Version != 2 || replayedSave.Items[0].ID != saved.Items[0].ID {
		t.Fatalf("SAVE unknown-result replay = %#v, %v", replayedSave, err)
	}
	changedSave := replayedSaveInput
	changedSave.Draft = f.draft("MO-REPO-001", 13)
	if _, err := f.uc.SaveDraft(ctx, &changedSave); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed SAVE intent error = %v", err)
	}

	released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 2, ActorID: f.actorID, IdempotencyKey: "release-replay"})
	if err != nil || released.Order.Status != biz.ProductionOrderStatusReleased || released.Order.Version != 3 {
		t.Fatalf("release = %#v, %v", released, err)
	}
	replayedRelease, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 999, ActorID: f.actorID, IdempotencyKey: "release-replay"})
	if err != nil || replayedRelease.Order.Version != 3 {
		t.Fatalf("release exact replay = %#v, %v", replayedRelease, err)
	}
	if _, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: created.Order.ID, ExpectedVersion: 3, Draft: f.draft("MO-REPO-001", 14), ActorID: f.actorID, IdempotencyKey: "save-after-release"}); !errors.Is(err, biz.ErrProductionOrderInvalidState) {
		t.Fatalf("save after release error = %v", err)
	}
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 3, ActorID: f.actorID, IdempotencyKey: "close-incomplete-without-reason"}); !errors.Is(err, biz.ErrProductionOrderCloseReasonRequired) {
		t.Fatalf("incomplete close without reason error = %v", err)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(productionorderevent.ProductionOrderID(created.Order.ID), productionorderevent.CommandKey(biz.ProductionOrderCommandClose)).CountX(ctx); count != 0 {
		t.Fatalf("failed close must write zero receipt, count=%d", count)
	}
	reason := "计划已完成"
	closed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 3, ActorID: f.actorID, IdempotencyKey: "close-replay", Reason: &reason})
	if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed || closed.Order.Version != 4 {
		t.Fatalf("close = %#v, %v", closed, err)
	}
	changedCloseReason := "另一个关闭原因"
	if _, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 999, ActorID: f.actorID, IdempotencyKey: "close-replay", Reason: &changedCloseReason}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed CLOSE reason error = %v", err)
	}
	if _, err := f.uc.Cancel(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 4, ActorID: f.actorID, IdempotencyKey: "cancel-closed", Reason: &reason}); !errors.Is(err, biz.ErrProductionOrderInvalidState) {
		t.Fatalf("cancel closed error = %v", err)
	}
}

func TestProductionOrderRepoReferenceOwnershipAndTransactionRollback(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_repo_rollback")
	otherProduct := createSalesOrderTestProduct(t, ctx, f.client, f.unitID, "production-order-other-product", true)
	badSKU := createSalesOrderTestProductSKU(t, ctx, f.client, otherProduct.ID, f.unitID, "production-order-other-sku")

	badDraft := f.draft("MO-BAD-REF", 10)
	badDraft.Items[0].ProductSKUID = &badSKU.ID
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: badDraft, ActorID: f.actorID, IdempotencyKey: "bad-sku"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("cross-product SKU error = %v", err)
	}
	if count := f.client.ProductionOrder.Query().Where(productionorder.OrderNo("MO-BAD-REF")).CountX(ctx); count != 0 {
		t.Fatalf("invalid reference must create zero orders, count=%d", count)
	}
	otherSalesOrder := f.client.SalesOrder.Create().SetOrderNo("POR-SO-OTHER").SetCustomerID(
		f.client.SalesOrder.GetX(ctx, f.client.SalesOrderItem.GetX(ctx, f.salesItemID).SalesOrderID).CustomerID,
	).SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	otherSalesItem := f.client.SalesOrderItem.Create().SetSalesOrderID(otherSalesOrder.ID).SetLineNo(1).
		SetProductID(otherProduct.ID).SetUnitID(f.unitID).SetOrderedQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	badSalesDraft := f.draft("MO-BAD-SALES", 10)
	badSalesDraft.Items[0].ProductSKUID = nil
	badSalesDraft.Items[0].SalesOrderItemID = &otherSalesItem.ID
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: badSalesDraft, ActorID: f.actorID, IdempotencyKey: "bad-sales"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("cross-product sales line error = %v", err)
	}
	otherBOM := f.client.BOMHeader.Create().SetProductID(otherProduct.ID).SetVersion("OTHER-ACTIVE").SetStatus("ACTIVE").SaveX(ctx)
	badBOMDraft := f.draft("MO-BAD-BOM", 10)
	badBOMDraft.Items[0].BOMHeaderID = &otherBOM.ID
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: badBOMDraft, ActorID: f.actorID, IdempotencyKey: "bad-bom"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("cross-product BOM error = %v", err)
	}
	revalidate, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-REVALIDATE", 10), ActorID: f.actorID, IdempotencyKey: "revalidate-create"})
	if err != nil {
		t.Fatalf("create release revalidation fixture: %v", err)
	}
	f.client.ProductSKU.UpdateOneID(f.skuID).SetIsActive(false).ExecX(ctx)
	if _, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: revalidate.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "revalidate-release"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("release with inactive SKU error = %v", err)
	}
	reloaded := f.client.ProductionOrder.GetX(ctx, revalidate.Order.ID)
	if reloaded.Status != biz.ProductionOrderStatusDraft || reloaded.Version != 1 {
		t.Fatalf("failed release must roll back status/version: %#v", reloaded)
	}
	f.client.ProductSKU.UpdateOneID(f.skuID).SetIsActive(true).ExecX(ctx)

	first, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-ROLLBACK-1", 10), ActorID: f.actorID, IdempotencyKey: "rollback-create-1"})
	if err != nil {
		t.Fatalf("create first order: %v", err)
	}
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-ROLLBACK-2", 10), ActorID: f.actorID, IdempotencyKey: "rollback-create-2"}); err != nil {
		t.Fatalf("create second order: %v", err)
	}
	failedDraft := f.draft("MO-ROLLBACK-2", 99)
	if _, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: first.Order.ID, ExpectedVersion: 1, Draft: failedDraft, ActorID: f.actorID, IdempotencyKey: "rollback-save"}); err == nil {
		t.Fatal("duplicate order number save must fail")
	}
	order := f.client.ProductionOrder.GetX(ctx, first.Order.ID)
	items := f.client.ProductionOrderItem.Query().Where(productionorderitem.ProductionOrderID(first.Order.ID)).AllX(ctx)
	if order.OrderNo != "MO-ROLLBACK-1" || order.Version != 1 || len(items) != 1 || !items[0].PlannedQuantity.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("failed save must roll back aggregate: order=%#v items=%#v", order, items)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(productionorderevent.ProductionOrderID(first.Order.ID), productionorderevent.CommandKey(biz.ProductionOrderCommandSave)).CountX(ctx); count != 0 {
		t.Fatalf("failed save must write zero receipt, count=%d", count)
	}

	cancelReason := "计划取消"
	cancelled, err := f.uc.Cancel(ctx, &biz.ProductionOrderAction{ID: first.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "cancel-draft", Reason: &cancelReason})
	if err != nil || cancelled.Order.Status != biz.ProductionOrderStatusCancelled {
		t.Fatalf("cancel draft = %#v, %v", cancelled, err)
	}
	replayedCancel, err := f.uc.Cancel(ctx, &biz.ProductionOrderAction{ID: first.Order.ID, ExpectedVersion: 999, ActorID: f.actorID, IdempotencyKey: "cancel-draft", Reason: &cancelReason})
	if err != nil || replayedCancel.Order.Version != cancelled.Order.Version {
		t.Fatalf("cancel exact replay = %#v, %v", replayedCancel, err)
	}
}

func TestProductionOrderSalesSourceEligibilityIsRecheckedForCreateSaveRelease(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_sales_eligibility")
	salesItem := f.client.SalesOrderItem.GetX(ctx, f.salesItemID)
	setParentStatus := func(status string) {
		f.client.SalesOrder.UpdateOneID(salesItem.SalesOrderID).SetLifecycleStatus(status).SaveX(ctx)
	}

	setParentStatus(biz.SalesOrderStatusClosed)
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-INELIGIBLE-CREATE", 10), ActorID: f.actorID, IdempotencyKey: "ineligible-create"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("create with closed sales parent error=%v", err)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("ineligible-create")).CountX(ctx); count != 0 {
		t.Fatalf("failed create receipt count=%d", count)
	}

	setParentStatus(biz.SalesOrderStatusActive)
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-ELIGIBILITY", 10), ActorID: f.actorID, IdempotencyKey: "eligible-create"})
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetLineStatus(biz.SalesOrderItemStatusClosed).SaveX(ctx)
	if _, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: created.Order.ID, ExpectedVersion: 1, Draft: f.draft("MO-ELIGIBILITY-SAVE", 10), ActorID: f.actorID, IdempotencyKey: "ineligible-save"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("save with closed sales line error=%v", err)
	}
	if _, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "ineligible-release"}); !errors.Is(err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("release with closed sales line error=%v", err)
	}
	order := f.client.ProductionOrder.GetX(ctx, created.Order.ID)
	if order.Status != biz.ProductionOrderStatusDraft || order.Version != 1 {
		t.Fatalf("failed commands changed order=%#v", order)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKeyIn("ineligible-save", "ineligible-release")).CountX(ctx); count != 0 {
		t.Fatalf("failed command receipt count=%d", count)
	}

	// 精确重放优先于当前来源状态，不把已提交结果误判为新命令。
	replayed, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-ELIGIBILITY", 10), ActorID: f.actorID, IdempotencyKey: "eligible-create"})
	if err != nil || replayed.Order.ID != created.Order.ID {
		t.Fatalf("create replay after source closure=%#v err=%v", replayed, err)
	}
}

func TestProductionOrderRepoGetAndListUseControlledAggregateRead(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_repo_read")
	first, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-READ-001", 10), ActorID: f.actorID, IdempotencyKey: "read-create-1"})
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	secondDraft := f.draft("MO-READ-002", 20)
	note := "第二张生产订单"
	secondDraft.Note = &note
	second, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: secondDraft, ActorID: f.actorID, IdempotencyKey: "read-create-2"})
	if err != nil {
		t.Fatalf("create second: %v", err)
	}
	loaded, err := f.uc.Get(ctx, first.Order.ID)
	if err != nil || loaded.Order.ID != first.Order.ID || len(loaded.Items) != 1 || loaded.Items[0].ProductionOrderID != first.Order.ID {
		t.Fatalf("get aggregate=%#v err=%v", loaded, err)
	}
	if _, err := f.uc.Get(ctx, 999999); !errors.Is(err, biz.ErrProductionOrderNotFound) {
		t.Fatalf("missing get error=%v", err)
	}
	items, total, err := f.uc.List(ctx, biz.ProductionOrderFilter{Keyword: "第二张", Status: biz.ProductionOrderStatusDraft, SortBy: "order_no", SortDirection: "desc", Limit: 20})
	if err != nil || total != 1 || len(items) != 1 || items[0].ID != second.Order.ID {
		t.Fatalf("filtered list items=%#v total=%d err=%v", items, total, err)
	}
	items, total, err = f.uc.List(ctx, biz.ProductionOrderFilter{SortBy: "order_no", SortDirection: "asc", Limit: 1, Offset: 1})
	if err != nil || total != 2 || len(items) != 1 || items[0].OrderNo != "MO-READ-002" {
		t.Fatalf("paged list items=%#v total=%d err=%v", items, total, err)
	}
	if _, _, err := f.uc.List(ctx, biz.ProductionOrderFilter{SortBy: "unsupported", Limit: 20}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("invalid list error=%v", err)
	}
}
