package data

import (
	"context"
	"errors"
	"sync"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/productionfact"

	"github.com/shopspring/decimal"
)

func TestProductionReworkPostgresConcurrentQuantityAndSourceCancellation(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)

	newPostedCompletion := func(suffix string, quantity int64) (*biz.ProductionOrderAggregate, *biz.ProductionFact) {
		t.Helper()
		created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
			Draft: f.draft("MO-PG-REWORK-" + suffix + "-" + f.suffix), ActorID: f.actorID,
			IdempotencyKey: "mo-pg-rework-create-" + suffix + "-" + f.suffix,
		})
		if err != nil {
			t.Fatalf("create rework source order %s: %v", suffix, err)
		}
		released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
			ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID,
			IdempotencyKey: "mo-pg-rework-release-" + suffix + "-" + f.suffix,
		})
		if err != nil {
			t.Fatalf("release rework source order %s: %v", suffix, err)
		}
		lotNo := "PG-REWORK-SOURCE-LOT-" + suffix + "-" + f.suffix
		completion, err := f.factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
			FactNo:            "PF-PG-REWORK-SOURCE-" + suffix + "-" + f.suffix,
			ProductionOrderID: released.Order.ID, ProductionOrderItemID: released.Items[0].ID,
			WarehouseID: f.warehouseID, NewLotNo: &lotNo, Quantity: decimal.NewFromInt(quantity),
			IdempotencyKey: "pf-pg-rework-source-" + suffix + "-" + f.suffix,
		})
		if err != nil {
			t.Fatalf("create rework source completion %s: %v", suffix, err)
		}
		completion, err = f.factUC.PostProductionFact(ctx, completion.ID)
		if err != nil {
			t.Fatalf("post rework source completion %s: %v", suffix, err)
		}
		return released, completion
	}

	_, completion := newPostedCompletion("QTY", 5)
	createRework := func(suffix string) *biz.ProductionFact {
		t.Helper()
		row, err := f.factUC.CreateProductionReworkFromCompletion(ctx, &biz.ProductionReworkFromCompletionCreate{
			FactNo: "PF-PG-REWORK-" + suffix + "-" + f.suffix, SourceCompletionFactID: completion.ID,
			Quantity: decimal.NewFromInt(3), Reason: "并发返工数量校验",
			IdempotencyKey: "pf-pg-rework-" + suffix + "-" + f.suffix,
		})
		if err != nil {
			t.Fatalf("create rework %s: %v", suffix, err)
		}
		return row
	}
	first, second := createRework("A"), createRework("B")
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, factID := range []int{first.ID, second.ID} {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			<-start
			_, err := f.factUC.PostProductionFact(ctx, id)
			errs <- err
		}(factID)
	}
	close(start)
	wg.Wait()
	close(errs)
	successes, quantityFailures := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrProductionReworkQuantityExceeded):
			quantityFailures++
		default:
			t.Fatalf("unexpected concurrent rework post error: %v", err)
		}
	}
	if successes != 1 || quantityFailures != 1 {
		t.Fatalf("concurrent rework outcomes success=%d quantity=%d", successes, quantityFailures)
	}
	if count := f.client.ProductionFact.Query().Where(
		productionfact.FactType(biz.ProductionFactRework),
		productionfact.SourceType(biz.ProductionFactSourceType),
		productionfact.SourceID(completion.ID),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).CountX(ctx); count != 1 {
		t.Fatalf("posted rework count=%d, want 1", count)
	}

	_, raceCompletion := newPostedCompletion("CANCEL", 4)
	raceRework, err := f.factUC.CreateProductionReworkFromCompletion(ctx, &biz.ProductionReworkFromCompletionCreate{
		FactNo: "PF-PG-REWORK-CANCEL-" + f.suffix, SourceCompletionFactID: raceCompletion.ID,
		Quantity: decimal.NewFromInt(2), Reason: "并发取消校验", IdempotencyKey: "pf-pg-rework-cancel-" + f.suffix,
	})
	if err != nil {
		t.Fatalf("create cancellation-race rework: %v", err)
	}
	start = make(chan struct{})
	postResult := make(chan error, 1)
	cancelResult := make(chan error, 1)
	go func() {
		<-start
		_, callErr := f.factUC.PostProductionFact(ctx, raceRework.ID)
		postResult <- callErr
	}()
	go func() {
		<-start
		_, callErr := f.factUC.CancelPostedProductionFact(ctx, raceCompletion.ID)
		cancelResult <- callErr
	}()
	close(start)
	postErr, cancelErr := <-postResult, <-cancelResult
	sourceRow := f.client.ProductionFact.GetX(ctx, raceCompletion.ID)
	reworkRow := f.client.ProductionFact.GetX(ctx, raceRework.ID)
	if postErr != nil || !errors.Is(cancelErr, biz.ErrProductionReworkDependency) || sourceRow.Status != biz.OperationalFactStatusPosted || reworkRow.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("active rework must serialize before source cancellation post=%v cancel=%v source=%s rework=%s", postErr, cancelErr, sourceRow.Status, reworkRow.Status)
	}
}
