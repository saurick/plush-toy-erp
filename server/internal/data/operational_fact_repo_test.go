package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/shipment"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactRepo_ProductionFactPostAndCancelWritesInventoryReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_production")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	fact, err := repo.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "PF-001",
		FactType:       biz.ProductionFactFinishedGoodsReceipt,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(3),
		IdempotencyKey: "PF-001",
	})
	if err != nil {
		t.Fatalf("create production fact failed: %v", err)
	}
	posted, err := repo.PostProductionFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post production fact failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionFactSourceType)).CountX(ctx); count != 1 {
		t.Fatalf("expected one production inventory txn, got %d", count)
	}
	cancelled, err := repo.CancelPostedProductionFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel production fact failed: %v", err)
	}
	if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionFactSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected original + reversal production txns, got %d", count)
	}
}

func ptrString(value string) *string {
	return &value
}

func TestOperationalFactRepo_StockReservationChecksAvailableQuantity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_reservation")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_STOCK",
		IdempotencyKey: "TEST_STOCK:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	if _, err := repo.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:  "RSV-001",
		ProductID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(4),
		IdempotencyKey: "RSV-001",
	}); err != nil {
		t.Fatalf("create stock reservation failed: %v", err)
	}
	if _, err := repo.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:  "RSV-002",
		ProductID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(2),
		IdempotencyKey: "RSV-002",
	}); err != biz.ErrInventoryInsufficientStock {
		t.Fatalf("expected insufficient stock, got %v", err)
	}
}

func TestOperationalFactRepo_OutsourcingMaterialIssueWithoutLotPostAndCancel(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_outsourcing")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_OUTSOURCING",
		IdempotencyKey: "TEST_OUTSOURCING:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	fact, err := repo.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-001",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(2),
		IdempotencyKey: "OF-001",
	})
	if err != nil {
		t.Fatalf("create outsourcing fact failed: %v", err)
	}
	posted, err := repo.PostOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post outsourcing fact failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	cancelled, err := repo.CancelPostedOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel outsourcing fact failed: %v", err)
	}
	if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.OutsourcingFactSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected outbound + reversal outsourcing txns, got %d", count)
	}
}

func TestOperationalFactRepo_ShipShipmentAndCancelWritesOutboundReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_SHIPMENT",
		IdempotencyKey: "TEST_SHIPMENT:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	shipment, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHP-001",
			IdempotencyKey: "SHP-001",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				Quantity:    decimal.NewFromInt(2),
			},
		},
	})
	if err != nil {
		t.Fatalf("create shipment with items failed: %v", err)
	}
	if len(shipment.Items) != 1 {
		t.Fatalf("expected one shipment item, got %d", len(shipment.Items))
	}
	if _, err := repo.CancelShippedShipment(ctx, shipment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancel draft shipment error = %v, want ErrBadParam", err)
	}
	shipped, err := repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment failed: %v", err)
	}
	if shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected SHIPPED, got %s", shipped.Status)
	}
	repeatedShipped, err := repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("repeat ship shipment failed: %v", err)
	}
	if repeatedShipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected repeated ship to stay SHIPPED, got %s", repeatedShipped.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ShipmentSourceType)).CountX(ctx); count != 1 {
		t.Fatalf("expected one outbound shipment txn after repeated ship, got %d", count)
	}
	cancelled, err := repo.CancelShippedShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("cancel shipped shipment failed: %v", err)
	}
	if cancelled.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	repeatedCancelled, err := repo.CancelShippedShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("repeat cancel shipment failed: %v", err)
	}
	if repeatedCancelled.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("expected repeated cancel to stay CANCELLED, got %s", repeatedCancelled.Status)
	}
	if _, err := repo.ShipShipment(ctx, shipment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("ship cancelled shipment error = %v, want ErrBadParam", err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ShipmentSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected outbound + reversal shipment txns, got %d", count)
	}
}

func TestOperationalFactRepo_CreateShipmentDraftWithItemsRollsBackWhenItemFails(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment_with_items_rollback")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	_, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHP-TX-ROLLBACK-001",
			IdempotencyKey: "SHP-TX-ROLLBACK-001",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				Quantity:    decimal.NewFromInt(1),
			},
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      0,
				Quantity:    decimal.NewFromInt(1),
			},
		},
	})
	if err == nil {
		t.Fatal("expected create shipment with invalid item to fail")
	}
	if count := client.Shipment.Query().Where(shipment.ShipmentNo("SHP-TX-ROLLBACK-001")).CountX(ctx); count != 0 {
		t.Fatalf("expected shipment header to rollback after item failure, got %d rows", count)
	}
}

func TestOperationalFactRepo_ListShipmentsFiltersByPlannedShipDate(t *testing.T) {
	ctx := context.Background()
	data, _ := openInventoryRepoTestData(t, "operational_fact_shipment_date_filter")
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	earlyDate := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	targetDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	lateDate := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)

	for _, item := range []struct {
		no            string
		plannedShipAt time.Time
	}{
		{no: "SHP-DATE-EARLY", plannedShipAt: earlyDate},
		{no: "SHP-DATE-TARGET", plannedShipAt: targetDate},
		{no: "SHP-DATE-LATE", plannedShipAt: lateDate},
	} {
		plannedShipAt := item.plannedShipAt
		if _, err := repo.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
			ShipmentNo:     item.no,
			PlannedShipAt:  &plannedShipAt,
			IdempotencyKey: item.no,
		}); err != nil {
			t.Fatalf("create shipment %s failed: %v", item.no, err)
		}
	}

	rows, total, err := repo.ListShipments(ctx, biz.OperationalFactFilter{
		DateField: "planned_ship_at",
		DateFrom:  &targetDate,
		DateTo:    &targetDate,
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list shipments by planned date failed: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].ShipmentNo != "SHP-DATE-TARGET" {
		t.Fatalf("expected only target planned shipment, total=%d rows=%#v", total, rows)
	}
}

func TestOperationalFactUsecase_ReceivableAndInvoiceRequireShippedShipment(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment_finance")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_SHIPMENT_FINANCE",
		IdempotencyKey: "TEST_SHIPMENT_FINANCE:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}

	shipmentSourceType := biz.ShipmentSourceType
	shippingReleaseSourceType := "SHIPPING-RELEASE"
	shipment, err := uc.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
		ShipmentNo:     "SHP-FIN-001",
		IdempotencyKey: "SHP-FIN-001",
	})
	if err != nil {
		t.Fatalf("create shipment failed: %v", err)
	}
	if _, err := uc.AddShipmentItem(ctx, &biz.ShipmentItemCreate{
		ShipmentID:  shipment.ID,
		ProductID:   fixtures.productID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    decimal.NewFromInt(2),
	}); err != nil {
		t.Fatalf("add shipment item failed: %v", err)
	}

	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-MISSING-SOURCE",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		IdempotencyKey:   "AR-MISSING-SOURCE",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("receivable without shipment source error = %v, want ErrBadParam", err)
	}

	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-WRONG-SOURCE",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		SourceType:       &shippingReleaseSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "AR-WRONG-SOURCE",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("receivable from shipping release source error = %v, want ErrBadParam", err)
	}

	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-DRAFT-SHIPMENT",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		SourceType:       &shipmentSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "AR-DRAFT-SHIPMENT",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("receivable from draft shipment error = %v, want ErrBadParam", err)
	}

	shipped, err := uc.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment failed: %v", err)
	}
	if shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected shipment SHIPPED, got %s", shipped.Status)
	}

	receivable, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-SHIPPED-001",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		FeeAmount:        decimal.NewFromFloat(2.5),
		Currency:         biz.FinanceCurrencyUSD,
		CollectionType:   ptrString(biz.FinanceCollectionAccountsReceivable),
		PaymentTerm:      ptrString(biz.FinancePaymentTermEOM30),
		InvoiceCategory:  ptrString(biz.FinanceInvoiceCategoryNone),
		SourceType:       &shipmentSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "AR-SHIPPED-001",
	})
	if err != nil {
		t.Fatalf("create receivable from shipped shipment failed: %v", err)
	}
	if receivable.Status != biz.OperationalFactStatusDraft || receivable.SourceID == nil || *receivable.SourceID != shipment.ID {
		t.Fatalf("unexpected receivable fact %#v", receivable)
	}
	if !receivable.FeeAmount.Equal(decimal.NewFromFloat(2.5)) || receivable.Currency != biz.FinanceCurrencyUSD {
		t.Fatalf("expected receivable fee/currency persisted, got fee=%s currency=%s", receivable.FeeAmount, receivable.Currency)
	}
	if receivable.CollectionType == nil || *receivable.CollectionType != biz.FinanceCollectionAccountsReceivable {
		t.Fatalf("expected receivable collection type persisted, got %#v", receivable.CollectionType)
	}
	if receivable.PaymentTerm == nil || *receivable.PaymentTerm != biz.FinancePaymentTermEOM30 || receivable.PaymentTermDays == nil || *receivable.PaymentTermDays != 30 {
		t.Fatalf("expected receivable payment term persisted, got term=%#v days=%#v", receivable.PaymentTerm, receivable.PaymentTermDays)
	}
	if receivable.InvoiceCategory == nil || *receivable.InvoiceCategory != biz.FinanceInvoiceCategoryNone {
		t.Fatalf("expected receivable invoice category persisted, got %#v", receivable.InvoiceCategory)
	}
	posted, err := uc.PostFinanceFact(ctx, receivable.ID)
	if err != nil {
		t.Fatalf("post receivable failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected posted receivable, got %s", posted.Status)
	}
	settled, err := uc.SettleFinanceFact(ctx, receivable.ID)
	if err != nil {
		t.Fatalf("settle receivable failed: %v", err)
	}
	if settled.Status != biz.OperationalFactStatusSettled {
		t.Fatalf("expected settled receivable, got %s", settled.Status)
	}

	invoice, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "INV-SHIPPED-001",
		FactType:         biz.FinanceFactInvoice,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		SourceType:       &shipmentSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "INV-SHIPPED-001",
	})
	if err != nil {
		t.Fatalf("create invoice from shipped shipment failed: %v", err)
	}
	if invoice.Status != biz.OperationalFactStatusDraft || invoice.SourceID == nil || *invoice.SourceID != shipment.ID {
		t.Fatalf("unexpected invoice fact %#v", invoice)
	}
	if count := client.FinanceFact.Query().Where(financefact.SourceType(biz.ShipmentSourceType), financefact.SourceID(shipment.ID)).CountX(ctx); count != 2 {
		t.Fatalf("expected two finance facts linked to shipped shipment, got %d", count)
	}
}
