package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOutsourcingFactFromOrderPostgresConcurrentPostsDoNotExceedSourceLine(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	order, line := createPostgresOutsourcingProductSource(t, ctx, client, fixtures, "POST-"+fixtures.suffix, decimal.NewFromInt(5))
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	create := func(suffix string) *biz.OutsourcingFact {
		t.Helper()
		lotNo := "PG-OUT-RETURN-LOT-" + suffix + "-" + fixtures.suffix
		fact, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
			FactNo:                 "PG-OUT-RETURN-" + suffix + "-" + fixtures.suffix,
			OutsourcingOrderID:     order.ID,
			OutsourcingOrderItemID: line.ID,
			WarehouseID:            fixtures.warehouseID,
			NewLotNo:               &lotNo,
			Quantity:               decimal.NewFromInt(3),
			IdempotencyKey:         "PG-OUT-RETURN-" + suffix + "-" + fixtures.suffix,
		})
		if err != nil {
			t.Fatalf("create return draft %s: %v", suffix, err)
		}
		return fact
	}
	first := create("A")
	second := create("B")

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, factID := range []int{first.ID, second.ID} {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			<-start
			_, err := uc.PostOutsourcingFact(ctx, id)
			errs <- err
		}(factID)
	}
	close(start)
	wg.Wait()
	close(errs)
	successes := 0
	quantityFailures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrOutsourcingOrderFactQuantityExceeded):
			quantityFailures++
		default:
			t.Fatalf("unexpected concurrent post error: %v", err)
		}
	}
	if successes != 1 || quantityFailures != 1 {
		t.Fatalf("concurrent post outcomes success=%d quantity_exceeded=%d", successes, quantityFailures)
	}
	posted, err := client.OutsourcingFact.Query().Where(
		outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
		outsourcingfact.SourceID(order.ID),
		outsourcingfact.SourceLineID(line.ID),
		outsourcingfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		t.Fatalf("query posted facts: %v", err)
	}
	if len(posted) != 1 || posted[0].Quantity.GreaterThan(line.OutsourcingQuantity) {
		t.Fatalf("posted source quantity escaped guard: %#v", posted)
	}
}

func TestOutsourcingFactFromOrderPostgresOrderCancelRaceKeepsValidState(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	order, line := createPostgresOutsourcingProductSource(t, ctx, client, fixtures, "CANCEL-"+fixtures.suffix, decimal.NewFromInt(5))
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	orderRepo := NewOutsourcingOrderRepo(data, logger)
	lotNo := "PG-OUT-CANCEL-RACE-LOT-" + fixtures.suffix
	fact, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "PG-OUT-CANCEL-RACE-" + fixtures.suffix,
		OutsourcingOrderID:     order.ID,
		OutsourcingOrderItemID: line.ID,
		WarehouseID:            fixtures.warehouseID,
		NewLotNo:               &lotNo,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "PG-OUT-CANCEL-RACE-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create race draft: %v", err)
	}

	start := make(chan struct{})
	postErr := make(chan error, 1)
	cancelErr := make(chan error, 1)
	go func() {
		<-start
		_, err := uc.PostOutsourcingFact(ctx, fact.ID)
		postErr <- err
	}()
	go func() {
		<-start
		_, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, order.ID, biz.OutsourcingOrderStatusCanceled)
		cancelErr <- err
	}()
	close(start)
	pErr := <-postErr
	cErr := <-cancelErr

	storedOrder, err := client.OutsourcingOrder.Get(ctx, order.ID)
	if err != nil {
		t.Fatalf("reload race order: %v", err)
	}
	storedFact, err := client.OutsourcingFact.Get(ctx, fact.ID)
	if err != nil {
		t.Fatalf("reload race fact: %v", err)
	}
	if pErr != nil || !errors.Is(cErr, biz.ErrOutsourcingOrderFactDependency) {
		t.Fatalf("existing draft must post and reject parent cancellation: post=%v cancel=%v", pErr, cErr)
	}
	if storedOrder.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed || storedFact.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("invalid final state: order=%s fact=%s", storedOrder.LifecycleStatus, storedFact.Status)
	}
}

func TestOutsourcingFactFromOrderPostgresCreateAndSettleNeverLeavesActiveDraftOnSettledOrder(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	orderRepo := NewOutsourcingOrderRepo(data, logger)

	for _, target := range []string{biz.OutsourcingOrderStatusClosed, biz.OutsourcingOrderStatusCanceled} {
		for iteration := 0; iteration < 8; iteration++ {
			label := fmt.Sprintf("CREATE-SETTLE-%s-%d-%s", target, iteration, fixtures.suffix)
			order, line := createPostgresOutsourcingProductSource(t, ctx, client, fixtures, label, decimal.NewFromInt(5))
			lotNo := "PG-OUT-" + label
			input := &biz.OutsourcingFactFromOrderCreate{
				FactNo: "PG-OUT-" + label, OutsourcingOrderID: order.ID, OutsourcingOrderItemID: line.ID,
				WarehouseID: fixtures.warehouseID, NewLotNo: &lotNo, Quantity: decimal.NewFromInt(2),
				IdempotencyKey: "PG-OUT-" + label,
			}
			start := make(chan struct{})
			var fact *biz.OutsourcingFact
			var createErr, settleErr error
			var wg sync.WaitGroup
			wg.Add(2)
			go func() {
				defer wg.Done()
				<-start
				fact, createErr = uc.CreateOutsourcingReturnReceiptFromOrder(ctx, input)
			}()
			go func() {
				defer wg.Done()
				<-start
				_, settleErr = orderRepo.UpdateOutsourcingOrderLifecycle(ctx, order.ID, target)
			}()
			close(start)
			wg.Wait()

			orderRow := client.OutsourcingOrder.GetX(ctx, order.ID)
			facts := client.OutsourcingFact.Query().Where(
				outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
				outsourcingfact.SourceID(order.ID),
			).AllX(ctx)
			switch {
			case settleErr == nil:
				if !errors.Is(createErr, biz.ErrOutsourcingOrderFactInvalidState) || orderRow.LifecycleStatus != target || len(facts) != 0 || fact != nil {
					t.Fatalf("%s settle winner escaped invariant: create=%v settle=%v order=%s facts=%#v fact=%#v", target, createErr, settleErr, orderRow.LifecycleStatus, facts, fact)
				}
			case createErr == nil:
				if !errors.Is(settleErr, biz.ErrOutsourcingOrderFactDependency) || orderRow.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed || len(facts) != 1 || facts[0].Status != biz.OperationalFactStatusDraft || fact == nil || fact.ID != facts[0].ID {
					t.Fatalf("%s create winner escaped invariant: create=%v settle=%v order=%s facts=%#v fact=%#v", target, createErr, settleErr, orderRow.LifecycleStatus, facts, fact)
				}
			default:
				t.Fatalf("%s race has no legal winner: create=%v settle=%v order=%s facts=%#v", target, createErr, settleErr, orderRow.LifecycleStatus, facts)
			}
		}
	}
}

func createPostgresOutsourcingProductSource(t *testing.T, ctx context.Context, client *ent.Client, fixtures inventoryPostgresFixtures, suffix string, quantity decimal.Decimal) (*ent.OutsourcingOrder, *ent.OutsourcingOrderItem) {
	t.Helper()
	process, err := client.Process.Create().
		SetCode("PG-OUT-PROC-" + suffix).
		SetName("PG 委外工序").
		SetOutsourcingEnabled(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create postgres outsourcing process: %v", err)
	}
	supplier, err := client.Supplier.Create().
		SetCode("PG-OUT-SUP-" + suffix).
		SetName("PG 委外加工厂").
		SetSupplierType("outsourcing").
		Save(ctx)
	if err != nil {
		t.Fatalf("create postgres outsourcing supplier: %v", err)
	}
	order, err := client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("PG-OUT-ORDER-" + suffix).
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetOrderDate(time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).
		Save(ctx)
	if err != nil {
		t.Fatalf("create postgres outsourcing order: %v", err)
	}
	line, err := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(order.ID).
		SetLineNo(1).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProductID(fixtures.productID).
		SetProcessID(process.ID).
		SetUnitID(fixtures.unitID).
		SetOutsourcingQuantity(quantity).
		SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
		Save(ctx)
	if err != nil {
		t.Fatalf("create postgres outsourcing line: %v", err)
	}
	return order, line
}
