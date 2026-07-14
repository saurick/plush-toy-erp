package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestQualityInspectionFromOutsourcingReturnPostgresConcurrentCreateIsSourceUnique(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostgresOutsourcingReturnForQuality(t, ctx, client, inventoryUC, operationalUC, fixtures, "CREATE-"+fixtures.suffix)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, inspectionNo := range []string{"PG-QI-OUT-A-" + fixtures.suffix, "PG-QI-OUT-B-" + fixtures.suffix} {
		wg.Add(1)
		go func(no string) {
			defer wg.Done()
			<-start
			_, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{
				InspectionNo:      no,
				OutsourcingFactID: fact.ID,
			})
			errs <- err
		}(inspectionNo)
	}
	close(start)
	wg.Wait()
	close(errs)
	successes := 0
	conflicts := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrQualityInspectionSourceConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent quality create error: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent quality outcomes success=%d conflict=%d", successes, conflicts)
	}
	if got := client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact),
		qualityinspection.SourceID(fact.ID),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).CountX(ctx); got != 1 {
		t.Fatalf("active outsourcing quality count=%d, want 1", got)
	}
}

func TestQualityInspectionFromOutsourcingReturnPostgresCreateCancelRaceKeepsValidState(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	fact := createPostgresOutsourcingReturnForQuality(t, ctx, client, inventoryUC, operationalUC, fixtures, "CANCEL-"+fixtures.suffix)

	start := make(chan struct{})
	createErr := make(chan error, 1)
	cancelErr := make(chan error, 1)
	go func() {
		<-start
		_, err := inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{
			InspectionNo:      "PG-QI-OUT-CANCEL-" + fixtures.suffix,
			OutsourcingFactID: fact.ID,
		})
		createErr <- err
	}()
	go func() {
		<-start
		_, err := operationalUC.CancelPostedOutsourcingFact(ctx, fact.ID)
		cancelErr <- err
	}()
	close(start)
	cErr := <-createErr
	xErr := <-cancelErr

	stored, err := client.OutsourcingFact.Get(ctx, fact.ID)
	if err != nil {
		t.Fatalf("reload outsourcing return: %v", err)
	}
	active := client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact),
		qualityinspection.SourceID(fact.ID),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).CountX(ctx)
	switch {
	case cErr == nil:
		if !errors.Is(xErr, biz.ErrOutsourcingReturnQualityDependency) || stored.Status != biz.OperationalFactStatusPosted || active != 1 {
			t.Fatalf("quality-create-won state create=%v cancel=%v status=%s active=%d", cErr, xErr, stored.Status, active)
		}
	case xErr == nil:
		if !errors.Is(cErr, biz.ErrQualityInspectionSourceState) || stored.Status != biz.OperationalFactStatusCancelled || active != 0 {
			t.Fatalf("return-cancel-won state create=%v cancel=%v status=%s active=%d", cErr, xErr, stored.Status, active)
		}
	default:
		t.Fatalf("race must have one successful command: create=%v cancel=%v", cErr, xErr)
	}
}

func createPostgresOutsourcingReturnForQuality(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	inventoryUC *biz.InventoryUsecase,
	operationalUC *biz.OperationalFactUsecase,
	fixtures inventoryPostgresFixtures,
	suffix string,
) *biz.OutsourcingFact {
	t.Helper()
	order, line := createPostgresOutsourcingProductSource(t, ctx, client, fixtures, suffix, decimal.NewFromInt(5))
	lot, err := inventoryUC.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		LotNo:       "PG-QI-OUT-LOT-" + suffix,
	})
	if err != nil {
		t.Fatalf("create postgres outsourcing quality lot: %v", err)
	}
	fact, err := operationalUC.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 "PG-QI-OUT-RETURN-" + suffix,
		OutsourcingOrderID:     order.ID,
		OutsourcingOrderItemID: line.ID,
		WarehouseID:            fixtures.warehouseID,
		LotID:                  &lot.ID,
		Quantity:               decimal.NewFromInt(2),
		IdempotencyKey:         "PG-QI-OUT-RETURN-" + suffix,
	})
	if err != nil {
		t.Fatalf("create postgres outsourcing return: %v", err)
	}
	posted, err := operationalUC.PostOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post postgres outsourcing return: %v", err)
	}
	return posted
}
