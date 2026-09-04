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
	"server/internal/data/model/ent/financefact"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func mustFinanceFactDueAt(t *testing.T, occurredAt time.Time, days int) time.Time {
	t.Helper()
	dueAt, err := biz.FinanceFactDueAtFromDays(occurredAt, &days)
	if err != nil || dueAt == nil {
		t.Fatalf("derive finance due_at occurred_at=%v days=%d error=%v", occurredAt, days, err)
	}
	return *dueAt
}

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
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &decimal.Zero,
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
	// Simulate a historical active order whose second line predates persisted
	// amount snapshots. New orders cannot pass submit with this shape.
	if _, err := client.SalesOrder.UpdateOneID(order.ID).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		Save(ctx); err != nil {
		t.Fatalf("activate historical sales order fixture: %v", err)
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

func TestOperationalFactRepoShipShipmentKeepsFinanceSnapshotsFromActiveSalesOrder(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_snapshot_refresh")
	unit := createTestUnit(t, ctx, client, "PCS-SNAPSHOT-REFRESH")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-SNAPSHOT-REFRESH")
	warehouse := createTestWarehouse(t, ctx, client, "WH-SNAPSHOT-REFRESH")
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SNAPSHOT-REFRESH", true)
	logger := log.NewStdLogger(io.Discard)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	paymentTermDays := 60
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-SNAPSHOT-REFRESH", CustomerID: customer.ID, OrderDate: time.Now().UTC(), Currency: biz.FinanceCurrencyUSD, PaymentTermDays: &paymentTermDays,
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &decimal.Zero,
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
	if shipment.Items[0].AmountSnapshot == nil || !shipment.Items[0].AmountSnapshot.Equal(decimal.NewFromInt(24)) ||
		shipment.Items[0].CurrencySnapshot == nil || *shipment.Items[0].CurrencySnapshot != biz.FinanceCurrencyUSD {
		t.Fatalf("active-order shipment finance snapshot=%#v, want 24 USD", shipment.Items[0])
	}
	inventoryRepo := NewInventoryRepo(data, logger)
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: product.ID, WarehouseID: warehouse.ID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: unit.ID,
		SourceType: "TEST_SHIPMENT_SNAPSHOT_REFRESH", IdempotencyKey: "inventory-shipment-snapshot-refresh",
	}); err != nil {
		t.Fatalf("seed inventory: %v", err)
	}

	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shipment.ID)
	shipment, err = operationalUC.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment: %v", err)
	}
	shippedItem := shipment.Items[0]
	if shippedItem.UnitPriceSnapshot == nil || !shippedItem.UnitPriceSnapshot.Equal(updatedUnitPrice) ||
		shippedItem.AmountSnapshot == nil || !shippedItem.AmountSnapshot.Equal(decimal.NewFromInt(24)) ||
		shippedItem.CurrencySnapshot == nil || *shippedItem.CurrencySnapshot != biz.FinanceCurrencyUSD {
		t.Fatalf("shipped finance snapshots=%#v, want unit price 12 and amount 24 USD", shippedItem)
	}
	receivable, err := operationalUC.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-SNAPSHOT-REFRESH", ShipmentID: shipment.ID, IdempotencyKey: "ar-snapshot-refresh",
	})
	if err != nil {
		t.Fatalf("create receivable: %v", err)
	}
	invoice, err := operationalUC.CreateInvoiceFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "INV-SNAPSHOT-REFRESH", ShipmentID: shipment.ID, IdempotencyKey: "inv-snapshot-refresh", InvoiceCategory: stringPointer(biz.FinanceInvoiceCategoryVATSpecial13),
	})
	if err != nil {
		t.Fatalf("create invoice: %v", err)
	}
	if !receivable.Amount.Equal(decimal.NewFromInt(24)) || !invoice.Amount.Equal(decimal.NewFromInt(24)) ||
		receivable.Currency != biz.FinanceCurrencyUSD || invoice.Currency != biz.FinanceCurrencyUSD {
		t.Fatalf("derived finance facts receivable=%#v invoice=%#v, want 24 USD", receivable, invoice)
	}
	wantReceivableOccurredAt := shipment.ShippedAt.UTC().Truncate(time.Microsecond)
	wantReceivableDueAt := mustFinanceFactDueAt(t, wantReceivableOccurredAt, 60)
	if receivable.CollectionType == nil || *receivable.CollectionType != biz.FinanceCollectionAccountsReceivable ||
		receivable.PaymentTerm == nil || *receivable.PaymentTerm != biz.FinancePaymentTermEOMDays ||
		receivable.PaymentTermDays == nil || *receivable.PaymentTermDays != 60 || receivable.DueAt == nil || shipment.ShippedAt == nil ||
		!receivable.OccurredAt.Equal(wantReceivableOccurredAt) || !receivable.DueAt.Equal(wantReceivableDueAt) || receivable.InvoiceCategory != nil {
		t.Fatalf("derived receivable dimensions=%#v", receivable)
	}
	if invoice.InvoiceCategory == nil || *invoice.InvoiceCategory != biz.FinanceInvoiceCategoryVATSpecial13 ||
		invoice.CollectionType != nil || invoice.PaymentTerm != nil || invoice.PaymentTermDays != nil {
		t.Fatalf("derived invoice dimensions=%#v", invoice)
	}
	replayed, err := operationalUC.CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-SNAPSHOT-REFRESH", ShipmentID: shipment.ID, IdempotencyKey: "ar-snapshot-refresh",
	})
	if err != nil || replayed.ID != receivable.ID || replayed.Currency != biz.FinanceCurrencyUSD {
		t.Fatalf("USD receivable replay=%#v err=%v", replayed, err)
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

func TestOperationalFactRepoFinalShipmentAbsorbsFinanceRoundingTail(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_rounding_tail")
	unit := createTestUnit(t, ctx, client, "PCS-ROUNDING-TAIL")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-ROUNDING-TAIL")
	warehouse := createTestWarehouse(t, ctx, client, "WH-ROUNDING-TAIL")
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-ROUNDING-TAIL", true)
	logger := log.NewStdLogger(io.Discard)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	paymentTermDays := 30
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-ROUNDING-TAIL", CustomerID: customer.ID, OrderDate: time.Now().UTC(), PaymentTermDays: &paymentTermDays,
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &decimal.Zero,
	})
	if err != nil {
		t.Fatalf("create sales order: %v", err)
	}
	orderedQuantity := decimal.RequireFromString("3.5")
	unitPrice := decimal.RequireFromString("0.333333")
	lineAmount := decimal.RequireFromString("1.166666")
	orderItem, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
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
	inventoryRepo := NewInventoryRepo(data, logger)
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: product.ID, WarehouseID: warehouse.ID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(4), UnitID: unit.ID,
		SourceType: "TEST_SHIPMENT_ROUNDING_TAIL", IdempotencyKey: "inventory-shipment-rounding-tail",
	}); err != nil {
		t.Fatalf("seed inventory: %v", err)
	}
	repo := NewOperationalFactRepo(data, logger)
	operationalUC := biz.NewOperationalFactUsecase(repo)
	quantities := []decimal.Decimal{
		decimal.RequireFromString("0.5"),
		decimal.RequireFromString("0.5"),
		decimal.RequireFromString("2.5"),
	}
	wantAmounts := []decimal.Decimal{
		decimal.RequireFromString("0.166667"),
		decimal.RequireFromString("0.166667"),
		decimal.RequireFromString("0.833332"),
	}
	total := decimal.Zero
	for index, quantity := range quantities {
		shipmentNo := fmt.Sprintf("SHP-ROUNDING-TAIL-%d", index+1)
		shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{
				ShipmentNo: shipmentNo, SalesOrderID: &order.ID, CustomerID: &customer.ID, IdempotencyKey: shipmentNo,
			},
			Items: []*biz.ShipmentItemCreate{{
				SalesOrderItemID: &orderItem.ID, ProductID: product.ID, WarehouseID: warehouse.ID,
				UnitID: unit.ID, Quantity: quantity,
			}},
		})
		if err != nil {
			t.Fatalf("create shipment %d: %v", index+1, err)
		}
		submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shipment.ID)
		shipment, err = operationalUC.ShipShipment(ctx, shipment.ID)
		if err != nil {
			t.Fatalf("ship shipment %d: %v", index+1, err)
		}
		amount := shipment.Items[0].AmountSnapshot
		if amount == nil || !amount.Equal(wantAmounts[index]) {
			t.Fatalf("shipment %d amount snapshot=%v want=%s", index+1, amount, wantAmounts[index])
		}
		total = total.Add(*amount)
	}
	if !total.Equal(lineAmount) {
		t.Fatalf("split shipment amount total=%s want sales-order amount=%s", total, lineAmount)
	}
}

func TestShipmentFinanceAmountRejectsSnapshotCurrencyMismatch(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_finance_currency_mismatch")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-CURRENCY-MISMATCH", true)
	paymentTermDays := 30
	order := client.SalesOrder.Create().
		SetOrderNo("SO-CURRENCY-MISMATCH").
		SetCustomerID(customer.ID).
		SetCustomerSnapshot(map[string]any{"name": customer.Name}).
		SetContactSnapshot(map[string]any{}).
		SetOrderDate(time.Now().UTC()).
		SetCurrency(biz.FinanceCurrencyCNY).
		SetPaymentTermDays(paymentTermDays).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	amount := decimal.NewFromInt(20)
	orderItem := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(1).
		SetProductID(fixtures.productID).
		SetUnitID(fixtures.unitID).
		SetOrderedQuantity(decimal.NewFromInt(2)).
		SetUnitPrice(decimal.NewFromInt(10)).
		SetAmount(amount).
		SetLineStatus(biz.SalesOrderItemStatusOpen).
		SaveX(ctx)
	shippedAt := time.Date(2026, time.January, 2, 3, 4, 5, 0, time.UTC)
	shipment := client.Shipment.Create().
		SetShipmentNo("SHP-CURRENCY-MISMATCH").
		SetSalesOrderID(order.ID).
		SetCustomerID(customer.ID).
		SetStatus(biz.ShipmentStatusShipped).
		SetShippedAt(shippedAt).
		SetIdempotencyKey("SHP-CURRENCY-MISMATCH").
		SaveX(ctx)
	client.ShipmentItem.Create().
		SetShipmentID(shipment.ID).
		SetSalesOrderItemID(orderItem.ID).
		SetProductID(fixtures.productID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.NewFromInt(2)).
		SetUnitPriceSnapshot(decimal.NewFromInt(10)).
		SetAmountSnapshot(amount).
		SetCurrencySnapshot(biz.FinanceCurrencyHKD).
		SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	if _, err := repo.GetShipmentFinanceAmountSnapshot(ctx, shipment.ID); !errors.Is(err, biz.ErrFinanceFactShipmentAmountInvalid) {
		t.Fatalf("mismatched shipment snapshot currency error=%v", err)
	}
	if _, err := biz.NewOperationalFactUsecase(repo).CreateReceivableFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "AR-CURRENCY-MISMATCH", ShipmentID: shipment.ID, IdempotencyKey: "AR-CURRENCY-MISMATCH",
	}); !errors.Is(err, biz.ErrFinanceFactShipmentAmountInvalid) {
		t.Fatalf("mismatched shipment snapshot created receivable: %v", err)
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
	wantOccurredAt := shipment.ShippedAt.UTC().Truncate(time.Microsecond)
	wantDueAt := mustFinanceFactDueAt(t, wantOccurredAt, 30)
	if created.Status != biz.OperationalFactStatusDraft || !created.Amount.Equal(decimal.NewFromInt(20)) || created.CounterpartyID == nil || *created.CounterpartyID != *shipment.CustomerID ||
		created.CollectionType == nil || *created.CollectionType != biz.FinanceCollectionAccountsReceivable ||
		created.PaymentTerm == nil || *created.PaymentTerm != biz.FinancePaymentTermEOMDays ||
		created.PaymentTermDays == nil || *created.PaymentTermDays != 30 || created.DueAt == nil || shipment.ShippedAt == nil ||
		!created.OccurredAt.Equal(wantOccurredAt) || !created.DueAt.Equal(wantDueAt) || created.InvoiceCategory != nil {
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
	posted, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(created.ID, created.Version, actor.ID, ""))
	if err != nil {
		t.Fatalf("post receivable: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(posted.ID, posted.Version, actor.ID, "来源业务撤销")); err != nil {
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
	recreated, err = repo.PostFinanceFact(ctx, operationalFactStatusMutation(recreated.ID, recreated.Version, actor.ID, ""))
	if err != nil {
		t.Fatalf("post recreated receivable: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(recreated.ID, recreated.Version, actor.ID, "来源业务最终撤销")); err != nil {
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
		map[string]any{"shipment_id": shipment.ID},
		"shipment",
		shipment.ID,
	)
	collectionType := biz.FinanceCollectionAccountsReceivable
	sourceType := biz.ShipmentSourceType
	paymentTermDays, err := repo.GetShipmentPaymentTermDays(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("read shipment payment term: %v", err)
	}
	paymentTerm, paymentTermDays, err := biz.FinancePaymentTermSnapshotFromDays(paymentTermDays)
	if err != nil {
		t.Fatalf("build shipment payment term snapshot: %v", err)
	}
	if shipment.ShippedAt == nil {
		t.Fatal("shipped shipment is missing shipped_at")
	}
	dueAt, err := biz.FinanceFactDueAtFromDays(*shipment.ShippedAt, paymentTermDays)
	if err != nil {
		t.Fatalf("derive shipment due_at: %v", err)
	}
	_, err = repo.CreateFinanceFactDraftForProcessCommand(ctx, &biz.FinanceFactCreate{
		FactNo:              "AR-PROCESS-SNAPSHOT-RECHECK",
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      shipment.CustomerID,
		Amount:              decimal.NewFromInt(21),
		Currency:            biz.FinanceCurrencyCNY,
		CollectionType:      &collectionType,
		PaymentTerm:         paymentTerm,
		PaymentTermDays:     paymentTermDays,
		DueAt:               dueAt,
		SourceType:          &sourceType,
		SourceID:            &shipment.ID,
		IdempotencyKey:      idempotencyKey,
		OccurredAt:          *shipment.ShippedAt,
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

func TestOperationalFactRepoSettleRejectsInvoice(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_settle_type_guard")
	repo, uc, shipment, actor := prepareShipmentFinanceSource(t, ctx, data, client, "settle-guard")
	invoice, err := uc.CreateInvoiceFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
		FactNo: "INV-SETTLE-GUARD", ShipmentID: shipment.ID, IdempotencyKey: "inv-settle-guard", InvoiceCategory: stringPointer(biz.FinanceInvoiceCategoryVATGeneral1),
	})
	if err != nil {
		t.Fatalf("create invoice: %v", err)
	}
	postedInvoice, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(invoice.ID, invoice.Version, actor.ID, ""))
	if err != nil {
		t.Fatalf("post invoice: %v", err)
	}
	if _, err := repo.SettleFinanceFact(ctx, operationalFactStatusMutation(postedInvoice.ID, postedInvoice.Version, actor.ID, "")); !errors.Is(err, biz.ErrFinanceFactSettlementNotAllowed) {
		t.Fatalf("invoice settle error=%v", err)
	}
	guardTerm := biz.FinancePaymentTermDueOnOccurrence
	guardDays := 0
	guardOccurredAt := time.Now().UTC().Truncate(time.Microsecond)
	guardDueAt := guardOccurredAt
	sourceLessReceivable, err := repo.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo: "AR-SOURCELESS-GUARD", FactType: biz.FinanceFactReceivable, CounterpartyType: biz.FinanceCounterpartyCustomer,
		CounterpartyID: shipment.CustomerID, Amount: decimal.NewFromInt(1), Currency: biz.FinanceCurrencyCNY,
		PaymentTerm: &guardTerm, PaymentTermDays: &guardDays, DueAt: &guardDueAt,
		IdempotencyKey: "ar-sourceless-guard", OccurredAt: guardOccurredAt, OccurredAtSpecified: true,
	})
	if err != nil {
		t.Fatalf("create source-less receivable fixture: %v", err)
	}
	if _, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(sourceLessReceivable.ID, sourceLessReceivable.Version, actor.ID, "")); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("source-less receivable post error=%v", err)
	}
	receivable := createReceivableViaProcessCommandForTest(
		t,
		ctx,
		data,
		repo,
		shipment,
		actor.ID,
		"AR-SETTLE-GUARD",
		"ar-settle-guard",
	)
	postedReceivable, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(receivable.ID, receivable.Version, actor.ID, ""))
	if err != nil {
		t.Fatalf("post receivable: %v", err)
	}
	if _, err := repo.SettleFinanceFact(ctx, operationalFactStatusMutation(postedReceivable.ID, postedReceivable.Version, actor.ID, "")); !errors.Is(err, biz.ErrFinanceFactSettlementNotAllowed) {
		t.Fatalf("receivable manual settle error=%v", err)
	}
}

func createReceivableViaProcessCommandForTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	repo *operationalFactRepo,
	shipment *biz.Shipment,
	actorID int,
	factNo string,
	idempotencyKey string,
) *biz.FinanceFact {
	t.Helper()
	if data == nil || repo == nil || shipment == nil || shipment.ID <= 0 || actorID <= 0 {
		t.Fatal("invalid finance process command fixture")
	}
	amount, err := repo.GetShipmentFinanceAmountSnapshot(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("read shipment finance amount snapshot: %v", err)
	}
	paymentTermDays, err := repo.GetShipmentPaymentTermDays(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("read shipment payment term: %v", err)
	}
	paymentTerm, paymentTermDays, err := biz.FinancePaymentTermSnapshotFromDays(paymentTermDays)
	if err != nil {
		t.Fatalf("build shipment payment term snapshot: %v", err)
	}
	if shipment.ShippedAt == nil {
		t.Fatal("shipped shipment is missing shipped_at")
	}
	occurredAt := shipment.ShippedAt.UTC().Truncate(time.Microsecond)
	dueAt, err := biz.FinanceFactDueAtFromDays(occurredAt, paymentTermDays)
	if err != nil {
		t.Fatalf("derive shipment due_at: %v", err)
	}
	processRepo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	command := claimedPostgresProcessCommandForBusinessRef(
		t,
		ctx,
		processRepo,
		biz.ProcessDomainCommandFinanceReceivableLead,
		idempotencyKey,
		map[string]any{"shipment_id": shipment.ID},
		"shipment",
		shipment.ID,
	)
	collectionType := biz.FinanceCollectionAccountsReceivable
	sourceType := biz.ShipmentSourceType
	fact, err := repo.CreateFinanceFactDraftForProcessCommand(ctx, &biz.FinanceFactCreate{
		FactNo:              factNo,
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      shipment.CustomerID,
		Amount:              amount,
		FeeAmount:           decimal.Zero,
		Currency:            biz.FinanceCurrencyCNY,
		CollectionType:      &collectionType,
		PaymentTerm:         paymentTerm,
		PaymentTermDays:     paymentTermDays,
		DueAt:               dueAt,
		SourceType:          &sourceType,
		SourceID:            &shipment.ID,
		IdempotencyKey:      idempotencyKey,
		OccurredAt:          occurredAt,
		OccurredAtSpecified: true,
	}, command, actorID)
	if err != nil {
		t.Fatalf("create receivable via process command: %v", err)
	}
	return fact
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
	paymentTermDays, err := repo.GetShipmentPaymentTermDays(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("read shipment payment term: %v", err)
	}
	paymentTerm, paymentTermDays, err := biz.FinancePaymentTermSnapshotFromDays(paymentTermDays)
	if err != nil {
		t.Fatalf("build shipment payment term snapshot: %v", err)
	}
	if shipment.ShippedAt == nil {
		t.Fatal("shipped shipment is missing shipped_at")
	}
	dueAt, err := biz.FinanceFactDueAtFromDays(*shipment.ShippedAt, paymentTermDays)
	if err != nil {
		t.Fatalf("derive shipment due_at: %v", err)
	}
	factInput := &biz.FinanceFactCreate{
		FactNo:              "AR-PROCESS-RACE-" + suffix,
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      shipment.CustomerID,
		Amount:              decimal.NewFromInt(20),
		Currency:            biz.FinanceCurrencyCNY,
		CollectionType:      &collectionType,
		PaymentTerm:         paymentTerm,
		PaymentTermDays:     paymentTermDays,
		DueAt:               dueAt,
		SourceType:          &sourceType,
		SourceID:            &shipment.ID,
		IdempotencyKey:      idempotencyKey,
		OccurredAt:          *shipment.ShippedAt,
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
	paymentTermDays := 30
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-" + suffix, CustomerID: customer.ID, OrderDate: time.Now().UTC(), PaymentTermDays: &paymentTermDays,
		TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsExcluded), QuotedFreightAmount: &decimal.Zero,
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
			IdempotencyKey: "shipment-" + suffix, TotalNetWeightG: &manualWeight,
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &item.ID, ProductID: product.ID, WarehouseID: warehouse.ID,
			UnitID: unit.ID, Quantity: decimal.NewFromInt(2),
		}},
	})
	if err != nil {
		t.Fatalf("create shipment: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shipment.ID)
	shipment, err = repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment: %v", err)
	}
	if shipment.Items[0].AmountSnapshot == nil || !shipment.Items[0].AmountSnapshot.Equal(decimal.NewFromInt(20)) {
		t.Fatalf("shipment amount snapshot=%#v", shipment.Items[0])
	}
	return repo, biz.NewOperationalFactUsecase(repo), shipment, actor
}
