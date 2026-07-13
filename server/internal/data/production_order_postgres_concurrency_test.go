package data

import (
	"context"
	"errors"
	"io"
	"sync"
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

type productionOrderPGFixture struct {
	uc           *biz.ProductionOrderUsecase
	factUC       *biz.OperationalFactUsecase
	data         *Data
	client       *ent.Client
	actorID      int
	unitID       int
	productID    int
	skuID        int
	salesOrderID int
	salesItemID  int
	warehouseID  int
	item         biz.ProductionOrderDraftItem
	suffix       string
}

func openProductionOrderPGFixture(t *testing.T) productionOrderPGFixture {
	t.Helper()
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("production-order-pg-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	unitRow := createTestUnit(t, ctx, client, "POU-"+suffix)
	productRow := createTestProduct(t, ctx, client, unitRow.ID, "POP-"+suffix)
	skuRow := createInventoryTestSKU(t, ctx, client, productRow.ID, unitRow.ID, "POS-"+suffix)
	customer := createSalesOrderTestCustomer(t, ctx, client, "POC-"+suffix, true)
	salesOrder := client.SalesOrder.Create().SetOrderNo("POSO-" + suffix).SetCustomerID(customer.ID).SetOrderDate(time.Now().UTC()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	salesItem := client.SalesOrderItem.Create().SetSalesOrderID(salesOrder.ID).SetLineNo(1).
		SetProductID(productRow.ID).SetProductSkuID(skuRow.ID).SetUnitID(unitRow.ID).
		SetOrderedQuantity(decimal.NewFromInt(100)).SaveX(ctx)
	bom := client.BOMHeader.Create().SetProductID(productRow.ID).SetVersion("PG-ACTIVE").SetStatus("ACTIVE").SaveX(ctx)
	warehouse := createTestWarehouse(t, ctx, client, "POW-"+suffix)
	logger := log.NewStdLogger(io.Discard)
	return productionOrderPGFixture{
		uc:     biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, logger)),
		factUC: biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger)), data: data,
		client: client, actorID: actor.ID, unitID: unitRow.ID, productID: productRow.ID,
		skuID: skuRow.ID, salesOrderID: salesOrder.ID, salesItemID: salesItem.ID, warehouseID: warehouse.ID, suffix: suffix,
		item: biz.ProductionOrderDraftItem{LineNo: 1, ProductID: productRow.ID, ProductSKUID: &skuRow.ID, UnitID: unitRow.ID,
			PlannedQuantity: decimal.NewFromInt(10), SalesOrderItemID: &salesItem.ID, BOMHeaderID: &bom.ID},
	}
}

func TestProductionOrderPostgresSalesEligibilityLocksAndRollsBack(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)

	blocker, err := f.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin sales parent blocker: %v", err)
	}
	if _, err := blocker.ExecContext(ctx, "SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE", f.salesOrderID); err != nil {
		t.Fatalf("lock sales parent: %v", err)
	}
	result := make(chan productionOrderPGResult, 1)
	go func() {
		aggregate, createErr := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-PG-SOURCE-RACE-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-source-race-" + f.suffix})
		result <- productionOrderPGResult{aggregate: aggregate, err: createErr}
	}()
	if _, err := blocker.ExecContext(ctx, "UPDATE sales_orders SET lifecycle_status = $1 WHERE id = $2", biz.SalesOrderStatusClosed, f.salesOrderID); err != nil {
		t.Fatalf("close sales parent: %v", err)
	}
	if err := blocker.Commit(); err != nil {
		t.Fatalf("commit sales parent transition: %v", err)
	}
	createResult := <-result
	if !errors.Is(createResult.err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("create after concurrent source transition=%#v", createResult)
	}
	if count := f.client.ProductionOrder.Query().Where(productionorder.OrderNo("MO-PG-SOURCE-RACE-" + f.suffix)).CountX(ctx); count != 0 {
		t.Fatalf("failed concurrent create order count=%d", count)
	}
	if count := f.client.ProductionOrderEvent.Query().Where(productionorderevent.IdempotencyKey("pg-source-race-" + f.suffix)).CountX(ctx); count != 0 {
		t.Fatalf("failed concurrent create receipt count=%d", count)
	}

	f.client.SalesOrder.UpdateOneID(f.salesOrderID).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-PG-LINE-RACE-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-line-race-create-" + f.suffix})
	if err != nil {
		t.Fatalf("create release fixture: %v", err)
	}
	lineBlocker, err := f.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin sales line blocker: %v", err)
	}
	if _, err := lineBlocker.ExecContext(ctx, "SELECT id FROM sales_order_items WHERE id = $1 FOR UPDATE", f.salesItemID); err != nil {
		t.Fatalf("lock sales line: %v", err)
	}
	go func() {
		aggregate, releaseErr := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "pg-line-race-release-" + f.suffix})
		result <- productionOrderPGResult{aggregate: aggregate, err: releaseErr}
	}()
	if _, err := lineBlocker.ExecContext(ctx, "UPDATE sales_order_items SET line_status = $1 WHERE id = $2", biz.SalesOrderItemStatusClosed, f.salesItemID); err != nil {
		t.Fatalf("close sales line: %v", err)
	}
	if err := lineBlocker.Commit(); err != nil {
		t.Fatalf("commit sales line transition: %v", err)
	}
	releaseResult := <-result
	if !errors.Is(releaseResult.err, biz.ErrProductionOrderReferenceInvalid) {
		t.Fatalf("release after concurrent source transition=%#v", releaseResult)
	}
	order := f.client.ProductionOrder.GetX(ctx, created.Order.ID)
	if order.Status != biz.ProductionOrderStatusDraft || order.Version != 1 {
		t.Fatalf("failed concurrent release changed order=%#v", order)
	}
	assertProductionOrderPGReceiptCount(t, ctx, f.client, created.Order.ID, biz.ProductionOrderCommandRelease, 0)
}

func (f productionOrderPGFixture) draft(no string) biz.ProductionOrderDraft {
	return biz.ProductionOrderDraft{OrderNo: no, Items: []biz.ProductionOrderDraftItem{f.item}}
}

type productionOrderPGResult struct {
	aggregate *biz.ProductionOrderAggregate
	err       error
}

func runConcurrentProductionOrderPG(count int, call func(int) (*biz.ProductionOrderAggregate, error)) []productionOrderPGResult {
	start := make(chan struct{})
	results := make([]productionOrderPGResult, count)
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			results[index].aggregate, results[index].err = call(index)
		}(i)
	}
	close(start)
	wg.Wait()
	return results
}

func TestProductionOrderPostgresConcurrentCreateAndMutationWinners(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)

	sameCreate := biz.ProductionOrderCreate{Draft: f.draft("MO-PG-SAME-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-create-same-" + f.suffix}
	sameResults := runConcurrentProductionOrderPG(2, func(int) (*biz.ProductionOrderAggregate, error) { return f.uc.CreateDraft(ctx, &sameCreate) })
	if sameResults[0].err != nil || sameResults[1].err != nil || sameResults[0].aggregate.Order.ID != sameResults[1].aggregate.Order.ID {
		t.Fatalf("same CREATE results=%#v", sameResults)
	}
	assertProductionOrderPGReceiptCount(t, ctx, f.client, sameResults[0].aggregate.Order.ID, biz.ProductionOrderCommandCreate, 1)

	conflictKey := "pg-create-conflict-" + f.suffix
	conflictOrderNos := []string{"MO-PG-CONFLICT-A-" + f.suffix, "MO-PG-CONFLICT-B-" + f.suffix}
	changedResults := runConcurrentProductionOrderPG(2, func(index int) (*biz.ProductionOrderAggregate, error) {
		return f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
			Draft: f.draft(conflictOrderNos[index]), ActorID: f.actorID, IdempotencyKey: conflictKey,
		})
	})
	assertOneProductionOrderWinner(t, changedResults, biz.ErrIdempotencyConflict)
	if count := f.client.ProductionOrder.Query().Where(productionorder.OrderNoIn(conflictOrderNos...)).CountX(ctx); count != 1 {
		t.Fatalf("changed CREATE loser must roll back, count=%d", count)
	}

	releaseOrder, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-PG-RELEASE-SAME-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-release-create-" + f.suffix})
	if err != nil {
		t.Fatalf("create release fixture: %v", err)
	}
	sameRelease := biz.ProductionOrderAction{ID: releaseOrder.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "pg-release-same-" + f.suffix}
	releaseResults := runConcurrentProductionOrderPG(2, func(int) (*biz.ProductionOrderAggregate, error) { return f.uc.Release(ctx, &sameRelease) })
	if releaseResults[0].err != nil || releaseResults[1].err != nil || releaseResults[0].aggregate.Order.Version != 2 || releaseResults[1].aggregate.Order.Version != 2 {
		t.Fatalf("same RELEASE results=%#v", releaseResults)
	}
	assertProductionOrderPGReceiptCount(t, ctx, f.client, releaseOrder.Order.ID, biz.ProductionOrderCommandRelease, 1)

	casOrder, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-PG-CAS-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-cas-create-" + f.suffix})
	if err != nil {
		t.Fatalf("create CAS fixture: %v", err)
	}
	casResults := runConcurrentProductionOrderPG(2, func(index int) (*biz.ProductionOrderAggregate, error) {
		return f.uc.Release(ctx, &biz.ProductionOrderAction{ID: casOrder.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "pg-cas-" + string(rune('A'+index)) + "-" + f.suffix})
	})
	assertOneProductionOrderWinner(t, casResults, biz.ErrProductionOrderConflict)
	assertProductionOrderPGReceiptCount(t, ctx, f.client, casOrder.Order.ID, biz.ProductionOrderCommandRelease, 1)
}

func TestProductionOrderPostgresFailedAggregateSaveRollsBack(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	first, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-PG-ROLLBACK-A-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-rollback-a-" + f.suffix})
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	secondNo := "MO-PG-ROLLBACK-B-" + f.suffix
	if _, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft(secondNo), ActorID: f.actorID, IdempotencyKey: "pg-rollback-b-" + f.suffix}); err != nil {
		t.Fatalf("create second: %v", err)
	}
	changed := f.draft(secondNo)
	changed.Items[0].PlannedQuantity = decimal.NewFromInt(99)
	if _, err := f.uc.SaveDraft(ctx, &biz.ProductionOrderSave{ID: first.Order.ID, ExpectedVersion: 1, Draft: changed, ActorID: f.actorID, IdempotencyKey: "pg-rollback-save-" + f.suffix}); err == nil {
		t.Fatal("duplicate order number save must fail")
	}
	order := f.client.ProductionOrder.GetX(ctx, first.Order.ID)
	items := f.client.ProductionOrderItem.Query().Where(productionorderitem.ProductionOrderID(first.Order.ID)).AllX(ctx)
	if order.OrderNo != first.Order.OrderNo || order.Version != 1 || len(items) != 1 || !items[0].PlannedQuantity.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("failed save must roll back aggregate: order=%#v items=%#v", order, items)
	}
	assertProductionOrderPGReceiptCount(t, ctx, f.client, first.Order.ID, biz.ProductionOrderCommandSave, 0)
}

func TestProductionOrderPostgresGetAndListReadContract(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("MO-PG-READ-" + f.suffix), ActorID: f.actorID, IdempotencyKey: "pg-read-create-" + f.suffix})
	if err != nil {
		t.Fatalf("create read fixture: %v", err)
	}
	aggregate, err := f.uc.Get(ctx, created.Order.ID)
	if err != nil || aggregate.Order.ID != created.Order.ID || len(aggregate.Items) != 1 || aggregate.Items[0].ProductionOrderID != created.Order.ID {
		t.Fatalf("repeatable-read aggregate=%#v err=%v", aggregate, err)
	}
	items, total, err := f.uc.List(ctx, biz.ProductionOrderFilter{Keyword: "MO-PG-READ-", Status: biz.ProductionOrderStatusDraft, SortBy: "updated_at", SortDirection: "desc", Limit: 20})
	if err != nil || total < 1 || len(items) < 1 {
		t.Fatalf("postgres list items=%#v total=%d err=%v", items, total, err)
	}
	found := false
	for _, item := range items {
		if item.ID == created.Order.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("created order missing from controlled list: %#v", items)
	}
}

func assertOneProductionOrderWinner(t *testing.T, results []productionOrderPGResult, loserError error) {
	t.Helper()
	successes, losers := 0, 0
	for _, result := range results {
		if result.err == nil {
			successes++
		} else if errors.Is(result.err, loserError) {
			losers++
		} else {
			t.Fatalf("unexpected concurrent result=%#v", result)
		}
	}
	if successes != 1 || losers != 1 {
		t.Fatalf("winners=%d losers=%d results=%#v", successes, losers, results)
	}
}

func assertProductionOrderPGReceiptCount(t *testing.T, ctx context.Context, client *ent.Client, orderID int, command string, want int) {
	t.Helper()
	count := client.ProductionOrderEvent.Query().Where(productionorderevent.ProductionOrderID(orderID), productionorderevent.CommandKey(command)).CountX(ctx)
	if count != want {
		t.Fatalf("%s receipt count=%d want=%d", command, count, want)
	}
}
