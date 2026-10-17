package data

import (
	"context"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/sourceorderlifecycleevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReceiptPostgresPartialInboundKeepsExactSourceQuantities(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, t.Context(), client)
	f := partialInboundFixtureWithData(t, data, client, inventoryTestFixtures{unitID: fixtures.unitID, materialID: fixtures.materialID, warehouseID: fixtures.warehouseID}, "PG-PART-"+postgresTestSuffix())
	f.decide(t, 4, true)
	f.decide(t, 6, false)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); errs <- err }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent line post=%v", err)
		}
	}
	f.dispose(t)
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(f.receipt.ID), inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(t.Context()); count != 1 {
		t.Fatalf("line ledger count=%d", count)
	}
	progress, err := NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)).GetPurchaseOrderReceiptProgress(t.Context(), f.orderID)
	if err != nil {
		t.Fatal(err)
	}
	got, reserved := decimal.Zero, decimal.Zero
	for _, line := range progress.Items {
		got = got.Add(line.EffectiveReceivedQuantity)
		reserved = reserved.Add(line.DraftReservedQuantity)
	}
	if got.String() != "4" || !reserved.IsZero() {
		t.Fatalf("posted=%s reserved=%s", got, reserved)
	}
	assertFulfillmentTask(t, t.Context(), client, "receipt_inbound", f.receipt.ID, "done", biz.WarehouseRoleKey)
}

func TestPurchaseReceiptPostgresPartialReplacementKeepsExceptionOpen(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, t.Context(), client)
	testPurchaseReceiptPartialReplacementKeepsExceptionOpen(t, data, client, inventoryTestFixtures{unitID: fixtures.unitID, materialID: fixtures.materialID, warehouseID: fixtures.warehouseID})
}

func TestSourceOrderLifecyclePostgresPurchaseTermsAndPayableUseOneLockOrder(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx, cancel := context.WithTimeout(t.Context(), 12*time.Second)
	defer cancel()
	key := "PG-TERMS-" + postgresTestSuffix()
	f := prepareMaterialRequestFixture(t, ctx, data, key)
	request := approveMaterialRequestFixture(t, ctx, f, submitMaterialRequestFixture(t, ctx, f))
	order := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).FirstX(ctx)
	line := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).FirstX(ctx)
	client.Material.UpdateOneID(line.MaterialID).SetStockCategory("MAIN").SaveX(ctx)
	warehouse := createTestWarehouse(t, ctx, client, key+"-WH")
	inv := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := inv.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: order.ID, ReceiptNo: "PR-" + key, WarehouseID: warehouse.ID, AllRemaining: true, IdempotencyKey: key})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, err := inv.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	for _, inspection := range inspections {
		if _, err := inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := inv.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatal(err)
	}
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	defer once.Do(func() { close(release) })
	client.PurchaseOrderItem.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
			select {
			case <-entered:
			default:
				close(entered)
			}
			select {
			case <-release:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			return next.Mutate(ctx, m)
		})
	})
	price := decimal.NewFromInt(3)
	input := &biz.PurchaseOrderTermsCompletion{ID: order.ID, ExpectedVersion: order.Version, ActorID: 33, IdempotencyKey: key + "-terms", Items: []biz.PurchaseOrderTermsItem{{ID: line.ID, UnitPrice: &price}}}
	terms := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	termsDone := make(chan error, 1)
	go func() { _, err := terms.CompletePurchaseOrderTerms(ctx, input); termsDone <- err }()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	payableDone := make(chan error, 1)
	go func() {
		_, err := facts.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: key + "-AP", PurchaseReceiptID: receipt.ID, IdempotencyKey: key + "-AP"})
		payableDone <- err
	}()
	select {
	case err := <-payableDone:
		t.Fatalf("payable escaped the locked terms source: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	once.Do(func() { close(release) })
	if err := <-termsDone; err != nil {
		t.Fatalf("terms=%v", err)
	}
	if err := <-payableDone; err != nil {
		t.Fatalf("payable=%v", err)
	}
	if _, err := terms.CompletePurchaseOrderTerms(ctx, input); err != nil {
		t.Fatalf("terms replay=%v", err)
	}
	if count := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.SourceType("purchase_order"), sourceorderlifecycleevent.SourceID(order.ID), sourceorderlifecycleevent.ActionKey(biz.PurchaseOrderActionCompleteTerms)).CountX(ctx); count != 1 {
		t.Fatalf("terms receipts=%d", count)
	}
}
