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
	"server/internal/data/model/ent/financefact"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactRepoShipmentItemFinanceSnapshotsComeFromSalesOrderLine(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_item_finance_snapshots")
	unit := createTestUnit(t, ctx, client, "PCS-SNAPSHOT")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-SNAPSHOT")
	warehouse := createTestWarehouse(t, ctx, client, "WH-SNAPSHOT")
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SNAPSHOT", true)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-SNAPSHOT", CustomerID: customer.ID, OrderDate: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("create sales order: %v", err)
	}
	orderedQuantity := decimal.NewFromInt(4)
	unitPrice := decimal.NewFromInt(99)
	lineAmount := decimal.NewFromInt(40)
	orderItem, err := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(1).
		SetProductID(product.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(orderedQuantity).
		SetUnitPrice(unitPrice).
		SetAmount(lineAmount).
		Save(ctx)
	if err != nil {
		t.Fatalf("create sales order item: %v", err)
	}
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	quantity := decimal.RequireFromString("1.5")
	shipment, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo: "SHP-SNAPSHOT", SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: "SHP-SNAPSHOT",
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &orderItem.ID, ProductID: product.ID, WarehouseID: warehouse.ID,
			UnitID: unit.ID, Quantity: quantity,
		}},
	})
	if err != nil {
		t.Fatalf("create source-linked shipment: %v", err)
	}
	item := shipment.Items[0]
	if item.UnitPriceSnapshot == nil || !item.UnitPriceSnapshot.Equal(unitPrice) {
		t.Fatalf("unit price snapshot=%v want=%s", item.UnitPriceSnapshot, unitPrice)
	}
	wantAmount := decimal.NewFromInt(15)
	if item.AmountSnapshot == nil || !item.AmountSnapshot.Equal(wantAmount) || item.CurrencySnapshot == nil || *item.CurrencySnapshot != biz.FinanceCurrencyCNY {
		t.Fatalf("amount/currency snapshots=%#v want amount=%s CNY", item, wantAmount)
	}
	fallbackUnitPrice := decimal.NewFromInt(7)
	fallbackOrderItem, err := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(2).
		SetProductID(product.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(orderedQuantity).
		SetUnitPrice(fallbackUnitPrice).
		Save(ctx)
	if err != nil {
		t.Fatalf("create unit-price-only sales order item: %v", err)
	}
	fallbackShipment, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo: "SHP-SNAPSHOT-FALLBACK", SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: "SHP-SNAPSHOT-FALLBACK",
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &fallbackOrderItem.ID, ProductID: product.ID, WarehouseID: warehouse.ID,
			UnitID: unit.ID, Quantity: decimal.NewFromInt(2),
		}},
	})
	if err != nil {
		t.Fatalf("create unit-price fallback shipment: %v", err)
	}
	if fallbackShipment.Items[0].AmountSnapshot == nil || !fallbackShipment.Items[0].AmountSnapshot.Equal(decimal.NewFromInt(14)) {
		t.Fatalf("unit-price fallback amount snapshot=%#v", fallbackShipment.Items[0])
	}

	manual, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{ShipmentNo: "SHP-SNAPSHOT-MANUAL", CustomerID: &customer.ID, IdempotencyKey: "SHP-SNAPSHOT-MANUAL"},
		Items:    []*biz.ShipmentItemCreate{{ProductID: product.ID, WarehouseID: warehouse.ID, UnitID: unit.ID, Quantity: decimal.NewFromInt(1)}},
	})
	if err != nil {
		t.Fatalf("create manual shipment: %v", err)
	}
	if manual.Items[0].UnitPriceSnapshot != nil || manual.Items[0].AmountSnapshot != nil || manual.Items[0].CurrencySnapshot != nil {
		t.Fatalf("manual shipment leaked finance snapshots: %#v", manual.Items[0])
	}
}

func TestOperationalFactRepoShipShipmentRefreshesFinanceSnapshotsAfterDraftSalesOrderPriceChange(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_snapshot_refresh")
	unit := createTestUnit(t, ctx, client, "PCS-SNAPSHOT-REFRESH")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-SNAPSHOT-REFRESH")
	warehouse := createTestWarehouse(t, ctx, client, "WH-SNAPSHOT-REFRESH")
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SNAPSHOT-REFRESH", true)
	logger := log.NewStdLogger(io.Discard)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-SNAPSHOT-REFRESH", CustomerID: customer.ID, OrderDate: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("create sales order: %v", err)
	}
	orderedQuantity := decimal.NewFromInt(5)
	initialUnitPrice := decimal.NewFromInt(10)
	initialAmount := decimal.NewFromInt(50)
	orderItem, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: orderedQuantity, UnitPrice: &initialUnitPrice, Amount: &initialAmount,
	})
	if err != nil {
		t.Fatalf("create sales order item: %v", err)
	}

	operationalRepo := NewOperationalFactRepo(data, logger)
	operationalUC := biz.NewOperationalFactUsecase(operationalRepo)
	shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo: "SHP-SNAPSHOT-REFRESH", SalesOrderID: &order.ID, CustomerID: &customer.ID,
			IdempotencyKey: "shipment-snapshot-refresh",
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &orderItem.ID, ProductID: product.ID, WarehouseID: warehouse.ID,
			UnitID: unit.ID, Quantity: decimal.NewFromInt(2),
		}},
	})
	if err != nil {
		t.Fatalf("create shipment draft: %v", err)
	}
	if shipment.Items[0].AmountSnapshot == nil || !shipment.Items[0].AmountSnapshot.Equal(decimal.NewFromInt(20)) {
		t.Fatalf("initial shipment amount snapshot=%#v, want 20", shipment.Items[0].AmountSnapshot)
	}

	updatedUnitPrice := decimal.NewFromInt(12)
	updatedAmount := decimal.NewFromInt(60)
	if _, err := salesUC.UpdateSalesOrderItem(ctx, orderItem.ID, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: orderedQuantity, UnitPrice: &updatedUnitPrice, Amount: &updatedAmount,
	}); err != nil {
		t.Fatalf("update draft sales order price: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit sales order: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate sales order: %v", err)
	}
	inventoryRepo := NewInventoryRepo(data, logger)
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: product.ID, WarehouseID: warehouse.ID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: unit.ID,
		SourceType: "TEST_SHIPMENT_SNAPSHOT_REFRESH", IdempotencyKey: "inventory-shipment-snapshot-refresh",
	}); err != nil {
		t.Fatalf("seed inventory: %v", err)
	}

	shipment, err = operationalUC.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment: %v", err)
	}
	shippedItem := shipment.Items[0]
	if shippedItem.UnitPriceSnapshot == nil || !shippedItem.UnitPriceSnapshot.Equal(updatedUnitPrice) ||
		shippedItem.AmountSnapshot == nil || !shippedItem.AmountSnapshot.Equal(decimal.NewFromInt(24)) {
		t.Fatalf("shipped finance snapshots=%#v, want unit price 12 and amount 24", shippedItem)
	}
	receivable, err := operationalUC.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-SNAPSHOT-REFRESH", ShipmentID: shipment.ID, IdempotencyKey: "ar-snapshot-refresh",
	})
	if err != nil {
		t.Fatalf("create receivable: %v", err)
	}
	invoice, err := operationalUC.CreateInvoiceFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "INV-SNAPSHOT-REFRESH", ShipmentID: shipment.ID, IdempotencyKey: "inv-snapshot-refresh",
	})
	if err != nil {
		t.Fatalf("create invoice: %v", err)
	}
	if !receivable.Amount.Equal(decimal.NewFromInt(24)) || !invoice.Amount.Equal(decimal.NewFromInt(24)) {
		t.Fatalf("derived finance amounts receivable=%s invoice=%s, want 24", receivable.Amount, invoice.Amount)
	}
	listed, total, err := operationalUC.ListFinanceFacts(ctx, biz.OperationalFactFilter{
		SourceType: biz.ShipmentSourceType,
		SourceID:   shipment.ID,
	})
	if err != nil || total != 2 || len(listed) != 2 {
		t.Fatalf("listed shipment finance facts rows=%#v total=%d err=%v", listed, total, err)
	}
	for _, item := range listed {
		if item.SourceNo == nil || *item.SourceNo != shipment.ShipmentNo {
			t.Fatalf("listed finance source number = %#v, want %q", item.SourceNo, shipment.ShipmentNo)
		}
	}
}

func TestOperationalFactRepoFinanceFromShipmentLifecycleAndCancellationGuardSQLite(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_lifecycle")
	repo, uc, shipment, actor := prepareShipmentFinanceSource(t, ctx, data, client, "sqlite-lifecycle")
	input := &biz.FinanceFactFromShipmentCreate{FactNo: "AR-SQLITE-001", ShipmentID: shipment.ID, IdempotencyKey: "ar-sqlite-001"}

	created, err := uc.CreateReceivableFromShipment(ctx, input)
	if err != nil {
		t.Fatalf("create receivable: %v", err)
	}
	if created.Status != biz.OperationalFactStatusDraft || !created.Amount.Equal(decimal.NewFromInt(20)) || created.CounterpartyID == nil || *created.CounterpartyID != *shipment.CustomerID {
		t.Fatalf("source-derived receivable=%#v", created)
	}
	replayed, err := uc.CreateReceivableFromShipment(ctx, input)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("same-key replay=%#v err=%v", replayed, err)
	}
	if _, err := uc.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-SQLITE-DUP", ShipmentID: shipment.ID, IdempotencyKey: "ar-sqlite-dup",
	}); !errors.Is(err, biz.ErrFinanceFactSourceConflict) {
		t.Fatalf("duplicate active source error=%v", err)
	}
	if _, err := repo.CancelShippedShipment(ctx, shipment.ID); !errors.Is(err, biz.ErrShipmentFinanceDependency) {
		t.Fatalf("shipment cancellation with active finance error=%v", err)
	}
	posted, err := repo.PostFinanceFact(ctx, created.ID)
	if err != nil {
		t.Fatalf("post receivable: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, posted.ID, actor.ID, "来源业务撤销"); err != nil {
		t.Fatalf("cancel receivable: %v", err)
	}
	oldReplay, err := uc.CreateReceivableFromShipment(ctx, input)
	if err != nil || oldReplay.ID != created.ID || oldReplay.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("cancelled old-key replay=%#v err=%v", oldReplay, err)
	}

	recreated, err := uc.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-SQLITE-002", ShipmentID: shipment.ID, IdempotencyKey: "ar-sqlite-002",
	})
	if err != nil || recreated.ID == created.ID {
		t.Fatalf("recreate after cancellation=%#v err=%v", recreated, err)
	}
	recreated, err = repo.PostFinanceFact(ctx, recreated.ID)
	if err != nil {
		t.Fatalf("post recreated receivable: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, recreated.ID, actor.ID, "来源业务最终撤销"); err != nil {
		t.Fatalf("cancel recreated receivable: %v", err)
	}
	if _, err := repo.CancelShippedShipment(ctx, shipment.ID); err != nil {
		t.Fatalf("cancel shipment after finance cancellation: %v", err)
	}
}

func TestOperationalFactRepoFinanceShipmentCreateCancelRaceSQLite(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_cancel_race")
	runFinanceShipmentCancelRace(t, ctx, data, client, "sqlite-race")
}

func TestOperationalFactRepoFinanceShipmentSameKeyRaceSQLite(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_same_key_race")
	runFinanceShipmentSameKeyRace(t, ctx, data, client, "sqlite-same-key")
}

func TestOperationalFactRepoFinanceProcessShipmentCreateCancelRaceSQLite(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_process_cancel_race")
	runFinanceProcessShipmentCancelRace(t, ctx, data, client, "sqlite-process-race")
}

func TestOperationalFactRepoFinanceProcessShipmentRevalidatesAmountSnapshotsSQLite(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_process_snapshot_recheck")
	repo, _, shipment, actor := prepareShipmentFinanceSource(t, ctx, data, client, "sqlite-process-snapshot")
	processRepo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	idempotencyKey := "finance-process-snapshot-recheck"
	command := claimedPostgresProcessCommandForBusinessRef(
		t,
		ctx,
		processRepo,
		biz.ProcessDomainCommandFinanceReceivableLead,
		idempotencyKey,
		map[string]any{"shipment_id": shipment.ID, "expected_amount": "21"},
		biz.ShipmentSourceType,
		shipment.ID,
	)
	collectionType := biz.FinanceCollectionAccountsReceivable
	sourceType := biz.ShipmentSourceType
	_, err := repo.CreateFinanceFactDraftForProcessCommand(ctx, &biz.FinanceFactCreate{
		FactNo:              "AR-PROCESS-SNAPSHOT-RECHECK",
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      shipment.CustomerID,
		Amount:              decimal.NewFromInt(21),
		Currency:            biz.FinanceCurrencyCNY,
		CollectionType:      &collectionType,
		SourceType:          &sourceType,
		SourceID:            &shipment.ID,
		IdempotencyKey:      idempotencyKey,
		OccurredAt:          time.Now().UTC().Truncate(time.Microsecond),
		OccurredAtSpecified: true,
	}, command, actor.ID)
	if !errors.Is(err, biz.ErrFinanceFactShipmentAmountInvalid) {
		t.Fatalf("process command trusted payload amount instead of shipment snapshots: %v", err)
	}
	if count := client.FinanceFact.Query().Where(
		financefact.SourceType(biz.ShipmentSourceType),
		financefact.SourceID(shipment.ID),
	).CountX(ctx); count != 0 {
		t.Fatalf("snapshot mismatch left %d finance facts", count)
	}
}

func TestOperationalFactRepoFinanceShipmentCreateCancelRacePostgres(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	runFinanceShipmentCancelRace(t, ctx, data, client, "pg-race-"+postgresTestSuffix())
}

func TestOperationalFactRepoFinanceShipmentSameKeyRacePostgres(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	runFinanceShipmentSameKeyRace(t, ctx, data, client, "pg-same-key-"+postgresTestSuffix())
}

func TestOperationalFactRepoFinanceProcessShipmentCreateCancelRacePostgres(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	runFinanceProcessShipmentCancelRace(t, ctx, data, client, "pg-process-race-"+postgresTestSuffix())
}

func TestOperationalFactRepoSettleRejectsInvoiceAndPayment(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_settle_type_guard")
	repo, uc, shipment, _ := prepareShipmentFinanceSource(t, ctx, data, client, "settle-guard")
	invoice, err := uc.CreateInvoiceFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "INV-SETTLE-GUARD", ShipmentID: shipment.ID, IdempotencyKey: "inv-settle-guard",
	})
	if err != nil {
		t.Fatalf("create invoice: %v", err)
	}
	if _, err := repo.PostFinanceFact(ctx, invoice.ID); err != nil {
		t.Fatalf("post invoice: %v", err)
	}
	if _, err := repo.SettleFinanceFact(ctx, invoice.ID); !errors.Is(err, biz.ErrFinanceFactSettlementNotAllowed) {
		t.Fatalf("invoice settle error=%v", err)
	}
	sourceLessReceivable, err := repo.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo: "AR-SOURCELESS-GUARD", FactType: biz.FinanceFactReceivable, CounterpartyType: biz.FinanceCounterpartyOther,
		Amount: decimal.NewFromInt(1), Currency: biz.FinanceCurrencyCNY, IdempotencyKey: "ar-sourceless-guard",
	})
	if err != nil {
		t.Fatalf("create source-less receivable fixture: %v", err)
	}
	if _, err := repo.PostFinanceFact(ctx, sourceLessReceivable.ID); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("source-less receivable post error=%v", err)
	}
	payment, err := repo.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo: "PAY-SETTLE-GUARD", FactType: biz.FinanceFactPayment, CounterpartyType: biz.FinanceCounterpartyOther,
		Amount: decimal.NewFromInt(1), Currency: biz.FinanceCurrencyCNY, IdempotencyKey: "pay-settle-guard",
	})
	if err != nil {
		t.Fatalf("create payment: %v", err)
	}
	if _, err := repo.PostFinanceFact(ctx, payment.ID); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("source-less payment post error=%v", err)
	}
	if _, err := repo.SettleFinanceFact(ctx, payment.ID); !errors.Is(err, biz.ErrFinanceFactSettlementNotAllowed) {
		t.Fatalf("payment settle error=%v", err)
	}
}

func runFinanceShipmentCancelRace(t *testing.T, ctx context.Context, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	repo, uc, shipment, _ := prepareShipmentFinanceSource(t, ctx, data, client, suffix)
	start := make(chan struct{})
	var createErr error
	var cancelErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, createErr = uc.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
			FactNo: "AR-RACE-" + suffix, ShipmentID: shipment.ID, IdempotencyKey: "ar-race-" + suffix,
		})
	}()
	go func() {
		defer wg.Done()
		<-start
		_, cancelErr = repo.CancelShippedShipment(ctx, shipment.ID)
	}()
	close(start)
	wg.Wait()

	if createErr == nil {
		if !errors.Is(cancelErr, biz.ErrShipmentFinanceDependency) {
			t.Fatalf("create won but cancel error=%v", cancelErr)
		}
	} else {
		if !errors.Is(createErr, biz.ErrBadParam) || cancelErr != nil {
			t.Fatalf("cancel won but create error=%v cancel error=%v", createErr, cancelErr)
		}
	}
	current, err := repo.GetShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("reload shipment: %v", err)
	}
	activeFacts := client.FinanceFact.Query().Where(
		financefact.SourceType(biz.ShipmentSourceType),
		financefact.SourceID(shipment.ID),
		financefact.StatusNEQ(biz.OperationalFactStatusCancelled),
	).CountX(ctx)
	if current.Status == biz.ShipmentStatusShipped && activeFacts != 1 {
		t.Fatalf("shipped race result has %d active finance facts", activeFacts)
	}
	if current.Status == biz.ShipmentStatusCancelled && activeFacts != 0 {
		t.Fatalf("cancelled race result has %d active finance facts", activeFacts)
	}
}

func runFinanceShipmentSameKeyRace(t *testing.T, ctx context.Context, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	_, uc, shipment, _ := prepareShipmentFinanceSource(t, ctx, data, client, suffix)
	input := &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-SAME-KEY-" + suffix, ShipmentID: shipment.ID, IdempotencyKey: "ar-same-key-" + suffix,
	}
	start := make(chan struct{})
	results := make([]*biz.FinanceFact, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for index := range results {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			results[index], errs[index] = uc.CreateReceivableFromShipment(ctx, input)
		}(index)
	}
	close(start)
	wg.Wait()
	if errs[0] != nil || errs[1] != nil || results[0] == nil || results[1] == nil || results[0].ID != results[1].ID {
		t.Fatalf("same-key race results=%#v errors=%v", results, errs)
	}
}

func runFinanceProcessShipmentCancelRace(t *testing.T, ctx context.Context, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	repo, _, shipment, actor := prepareShipmentFinanceSource(t, ctx, data, client, suffix)
	processRepo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	idempotencyKey := "finance-process-race-" + suffix
	command := claimedPostgresProcessCommandForBusinessRef(
		t,
		ctx,
		processRepo,
		biz.ProcessDomainCommandFinanceReceivableLead,
		idempotencyKey,
		map[string]any{"shipment_id": shipment.ID, "expected_amount": "20"},
		biz.ShipmentSourceType,
		shipment.ID,
	)
	collectionType := biz.FinanceCollectionAccountsReceivable
	sourceType := biz.ShipmentSourceType
	factInput := &biz.FinanceFactCreate{
		FactNo:              "AR-PROCESS-RACE-" + suffix,
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      shipment.CustomerID,
		Amount:              decimal.NewFromInt(20),
		Currency:            biz.FinanceCurrencyCNY,
		CollectionType:      &collectionType,
		SourceType:          &sourceType,
		SourceID:            &shipment.ID,
		IdempotencyKey:      idempotencyKey,
		OccurredAt:          time.Now().UTC().Truncate(time.Microsecond),
		OccurredAtSpecified: true,
	}
	start := make(chan struct{})
	var createErr error
	var cancelErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, createErr = repo.CreateFinanceFactDraftForProcessCommand(ctx, factInput, command, actor.ID)
	}()
	go func() {
		defer wg.Done()
		<-start
		_, cancelErr = repo.CancelShippedShipment(ctx, shipment.ID)
	}()
	close(start)
	wg.Wait()

	if createErr == nil {
		if !errors.Is(cancelErr, biz.ErrShipmentFinanceDependency) {
			t.Fatalf("process create won but cancel error=%v", cancelErr)
		}
	} else if !errors.Is(createErr, biz.ErrBadParam) || cancelErr != nil {
		t.Fatalf("cancel won but process create error=%v cancel error=%v", createErr, cancelErr)
	}
	current, err := repo.GetShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("reload process-race shipment: %v", err)
	}
	activeFacts := client.FinanceFact.Query().Where(
		financefact.SourceType(biz.ShipmentSourceType),
		financefact.SourceID(shipment.ID),
		financefact.StatusNEQ(biz.OperationalFactStatusCancelled),
	).CountX(ctx)
	if current.Status == biz.ShipmentStatusShipped && activeFacts != 1 {
		t.Fatalf("shipped process-race result has %d active finance facts", activeFacts)
	}
	if current.Status == biz.ShipmentStatusCancelled && activeFacts != 0 {
		t.Fatalf("cancelled process-race result has %d active finance facts", activeFacts)
	}
}

func prepareShipmentFinanceSource(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	suffix string,
) (*operationalFactRepo, *biz.OperationalFactUsecase, *biz.Shipment, *ent.AdminUser) {
	t.Helper()
	unit := createTestUnit(t, ctx, client, "U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "P-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "W-"+suffix)
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-"+suffix, true)
	actor := client.AdminUser.Create().SetUsername("finance-actor-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-" + suffix, CustomerID: customer.ID, OrderDate: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("create sales order: %v", err)
	}
	orderedQuantity := decimal.NewFromInt(5)
	unitPrice := decimal.NewFromInt(10)
	lineAmount := decimal.NewFromInt(50)
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: product.ID, UnitID: unit.ID,
		OrderedQuantity: orderedQuantity, UnitPrice: &unitPrice, Amount: &lineAmount,
	})
	if err != nil {
		t.Fatalf("create sales order item: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit sales order: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate sales order: %v", err)
	}
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: product.ID, WarehouseID: warehouse.ID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), UnitID: unit.ID,
		SourceType: "TEST_SHIPMENT_FINANCE_SOURCE", IdempotencyKey: "inventory-" + suffix,
	}); err != nil {
		t.Fatalf("seed inventory: %v", err)
	}
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	manualWeight := decimal.NewFromInt(1)
	shipment, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo: "SHP-" + suffix, SalesOrderID: &order.ID, CustomerID: &customer.ID,
			IdempotencyKey: "shipment-" + suffix, TotalNetWeightKg: &manualWeight,
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &item.ID, ProductID: product.ID, WarehouseID: warehouse.ID,
			UnitID: unit.ID, Quantity: decimal.NewFromInt(2),
		}},
	})
	if err != nil {
		t.Fatalf("create shipment: %v", err)
	}
	shipment, err = repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment: %v", err)
	}
	if shipment.Items[0].AmountSnapshot == nil || !shipment.Items[0].AmountSnapshot.Equal(decimal.NewFromInt(20)) {
		t.Fatalf("shipment amount snapshot=%#v", shipment.Items[0])
	}
	return repo, biz.NewOperationalFactUsecase(repo), shipment, actor
}
