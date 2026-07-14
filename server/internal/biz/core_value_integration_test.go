package biz

import (
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestNormalizeInventoryTxnCreateUsesCoreValueGuards(t *testing.T) {
	sourceID := -1
	in := InventoryTxnCreate{
		SubjectType:    InventorySubjectMaterial,
		SubjectID:      1,
		WarehouseID:    2,
		TxnType:        InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         3,
		SourceType:     " purchase_receipt ",
		SourceID:       &sourceID,
		IdempotencyKey: "  PURCHASE_RECEIPT:1:1:IN  ",
	}

	normalized, err := normalizeInventoryTxnCreate(in)
	if err != nil {
		t.Fatalf("normalizeInventoryTxnCreate() error = %v", err)
	}
	if normalized.IdempotencyKey != "PURCHASE_RECEIPT:1:1:IN" {
		t.Fatalf("expected idempotency key trimmed, got %q", normalized.IdempotencyKey)
	}
	if normalized.SourceID != nil {
		t.Fatalf("non-positive optional source id should be cleared, got %v", *normalized.SourceID)
	}

	in.Quantity = decimal.Zero
	if _, err := normalizeInventoryTxnCreate(in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero quantity rejected, got %v", err)
	}
	in.Quantity = decimal.NewFromInt(5)
	in.IdempotencyKey = "   "
	if _, err := normalizeInventoryTxnCreate(in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected blank idempotency key rejected, got %v", err)
	}
}

func TestNormalizeFactCreateTracksExplicitIntentTimes(t *testing.T) {
	explicit := time.Date(2026, 7, 10, 9, 8, 7, 654321987, time.FixedZone("UTC+8", 8*60*60))
	wantExplicit := explicit.UTC().Truncate(time.Microsecond)

	inventoryBase := InventoryTxnCreate{
		SubjectType: InventorySubjectProduct, SubjectID: 1, WarehouseID: 2,
		TxnType: InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(1),
		UnitID: 3, SourceType: "TEST", IdempotencyKey: "inventory-time",
	}
	inventoryOmitted, err := normalizeInventoryTxnCreate(inventoryBase)
	if err != nil {
		t.Fatalf("normalize omitted inventory time: %v", err)
	}
	if inventoryOmitted.OccurredAtSpecified || inventoryOmitted.OccurredAt.IsZero() {
		t.Fatalf("omitted inventory time marker=%v time=%v", inventoryOmitted.OccurredAtSpecified, inventoryOmitted.OccurredAt)
	}
	inventoryBase.OccurredAt = explicit
	inventoryExplicit, err := normalizeInventoryTxnCreate(inventoryBase)
	if err != nil {
		t.Fatalf("normalize explicit inventory time: %v", err)
	}
	if !inventoryExplicit.OccurredAtSpecified || !inventoryExplicit.OccurredAt.Equal(wantExplicit) {
		t.Fatalf("explicit inventory time marker=%v time=%v, want %v", inventoryExplicit.OccurredAtSpecified, inventoryExplicit.OccurredAt, wantExplicit)
	}

	operationalBase := &OperationalFactMutation{
		FactNo: "PF-TIME", FactType: ProductionFactFinishedGoodsReceipt,
		SubjectType: InventorySubjectProduct, SubjectID: 1, WarehouseID: 2, UnitID: 3,
		Quantity: decimal.NewFromInt(1), IdempotencyKey: "operational-time",
	}
	operationalOmitted, err := normalizeOperationalFactMutation(operationalBase, productionFactTypes)
	if err != nil {
		t.Fatalf("normalize omitted operational fact time: %v", err)
	}
	if operationalOmitted.OccurredAtSpecified || operationalOmitted.OccurredAt.IsZero() {
		t.Fatalf("omitted operational fact time marker=%v time=%v", operationalOmitted.OccurredAtSpecified, operationalOmitted.OccurredAt)
	}
	operationalBase.OccurredAt = explicit
	operationalExplicit, err := normalizeOperationalFactMutation(operationalBase, productionFactTypes)
	if err != nil {
		t.Fatalf("normalize explicit operational fact time: %v", err)
	}
	if !operationalExplicit.OccurredAtSpecified || !operationalExplicit.OccurredAt.Equal(wantExplicit) {
		t.Fatalf("explicit operational fact time marker=%v time=%v, want %v", operationalExplicit.OccurredAtSpecified, operationalExplicit.OccurredAt, wantExplicit)
	}

	reservationBase := &StockReservationCreate{
		ReservationNo: "RSV-TIME", ProductID: 1, WarehouseID: 2, UnitID: 3,
		Quantity: decimal.NewFromInt(1), IdempotencyKey: "reservation-time",
	}
	reservationOmitted, err := normalizeStockReservationCreate(reservationBase)
	if err != nil {
		t.Fatalf("normalize omitted reservation time: %v", err)
	}
	if reservationOmitted.ReservedAtSpecified || reservationOmitted.ReservedAt.IsZero() {
		t.Fatalf("omitted reservation time marker=%v time=%v", reservationOmitted.ReservedAtSpecified, reservationOmitted.ReservedAt)
	}
	reservationBase.ReservedAt = explicit
	reservationExplicit, err := normalizeStockReservationCreate(reservationBase)
	if err != nil {
		t.Fatalf("normalize explicit reservation time: %v", err)
	}
	if !reservationExplicit.ReservedAtSpecified || !reservationExplicit.ReservedAt.Equal(wantExplicit) {
		t.Fatalf("explicit reservation time marker=%v time=%v, want %v", reservationExplicit.ReservedAtSpecified, reservationExplicit.ReservedAt, wantExplicit)
	}

	financeBase := &FinanceFactCreate{
		FactNo: "FIN-TIME", FactType: FinanceFactReceivable,
		CounterpartyType: FinanceCounterpartyOther, Amount: decimal.NewFromInt(1),
		IdempotencyKey: "finance-time",
	}
	financeOmitted, err := normalizeFinanceFactCreate(financeBase)
	if err != nil {
		t.Fatalf("normalize omitted finance fact time: %v", err)
	}
	if financeOmitted.OccurredAtSpecified || financeOmitted.OccurredAt.IsZero() {
		t.Fatalf("omitted finance fact time marker=%v time=%v", financeOmitted.OccurredAtSpecified, financeOmitted.OccurredAt)
	}
	financeBase.OccurredAt = explicit
	financeExplicit, err := normalizeFinanceFactCreate(financeBase)
	if err != nil {
		t.Fatalf("normalize explicit finance fact time: %v", err)
	}
	if !financeExplicit.OccurredAtSpecified || !financeExplicit.OccurredAt.Equal(wantExplicit) {
		t.Fatalf("explicit finance fact time marker=%v time=%v, want %v", financeExplicit.OccurredAtSpecified, financeExplicit.OccurredAt, wantExplicit)
	}
}

func TestNormalizeBOMItemCreateUsesCoreQuantityGuard(t *testing.T) {
	in := BOMItemCreate{
		BOMHeaderID: 1,
		MaterialID:  2,
		Quantity:    decimal.NewFromInt(1),
		UnitID:      3,
		LossRate:    decimal.Zero,
	}

	if _, err := normalizeBOMItemCreate(in); err != nil {
		t.Fatalf("normalizeBOMItemCreate() error = %v", err)
	}
	in.Quantity = decimal.Zero
	if _, err := normalizeBOMItemCreate(in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero BOM item quantity rejected, got %v", err)
	}
}

func TestNormalizePurchaseItemsUseCoreMoneyAndQuantityGuards(t *testing.T) {
	price := decimal.NewFromInt(3)
	negative := decimal.NewFromInt(-1)
	receiptItem := PurchaseReceiptItemCreate{
		ReceiptID:      1,
		MaterialID:     2,
		WarehouseID:    3,
		Quantity:       decimal.NewFromInt(4),
		UnitID:         5,
		UnitPrice:      &price,
		Amount:         &price,
		IdempotencyKey: "test:receipt-item:core-value",
	}
	if _, err := normalizePurchaseReceiptItemCreate(receiptItem); err != nil {
		t.Fatalf("normalizePurchaseReceiptItemCreate() error = %v", err)
	}
	receiptItem.UnitPrice = &negative
	if _, err := normalizePurchaseReceiptItemCreate(receiptItem); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected negative receipt unit price rejected, got %v", err)
	}
	receiptItem.UnitPrice = &price
	receiptItem.Quantity = decimal.Zero
	if _, err := normalizePurchaseReceiptItemCreate(receiptItem); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero receipt quantity rejected, got %v", err)
	}

	returnItem := PurchaseReturnItemCreate{
		ReturnID:    1,
		MaterialID:  2,
		WarehouseID: 3,
		Quantity:    decimal.NewFromInt(4),
		UnitID:      5,
		Amount:      &negative,
	}
	if _, err := normalizePurchaseReturnItemCreate(returnItem); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected negative return amount rejected, got %v", err)
	}

	adjustmentItem := PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          1,
		PurchaseReceiptItemID: 2,
		AdjustType:            PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            3,
		WarehouseID:           4,
		Quantity:              decimal.Zero,
		UnitID:                5,
	}
	if _, err := normalizePurchaseReceiptAdjustmentItemCreate(adjustmentItem); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero adjustment quantity rejected, got %v", err)
	}
}

func TestNormalizeSalesOrderItemUsesCoreMoneyAndQuantityGuards(t *testing.T) {
	price := decimal.NewFromInt(3)
	amount := decimal.NewFromInt(12)
	negative := decimal.NewFromInt(-1)
	in := SalesOrderItemMutation{
		SalesOrderID:    1,
		LineNo:          1,
		ProductID:       2,
		UnitID:          3,
		OrderedQuantity: decimal.NewFromInt(4),
		UnitPrice:       &price,
		Amount:          &amount,
	}
	if _, err := normalizeSalesOrderItemMutation(in); err != nil {
		t.Fatalf("normalizeSalesOrderItemMutation() error = %v", err)
	}
	in.UnitPrice = &negative
	if _, err := normalizeSalesOrderItemMutation(in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected negative unit price rejected, got %v", err)
	}
	in.UnitPrice = &price
	in.OrderedQuantity = decimal.Zero
	if _, err := normalizeSalesOrderItemMutation(in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero ordered quantity rejected, got %v", err)
	}
}

func TestNormalizeOperationalFactInputsUseCoreValueGuards(t *testing.T) {
	fact := &OperationalFactMutation{
		FactNo:         "  PF-1  ",
		FactType:       ProductionFactMaterialIssue,
		SubjectType:    InventorySubjectMaterial,
		SubjectID:      1,
		WarehouseID:    2,
		UnitID:         3,
		Quantity:       decimal.NewFromInt(4),
		IdempotencyKey: "  PRODUCTION_FACT:1:1:OUT  ",
	}
	normalizedFact, err := normalizeOperationalFactMutation(fact, productionFactTypes)
	if err != nil {
		t.Fatalf("normalizeOperationalFactMutation() error = %v", err)
	}
	if normalizedFact.IdempotencyKey != "PRODUCTION_FACT:1:1:OUT" {
		t.Fatalf("expected operational fact idempotency key trimmed, got %q", normalizedFact.IdempotencyKey)
	}
	fact.Quantity = decimal.Zero
	if _, err := normalizeOperationalFactMutation(fact, productionFactTypes); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero production quantity rejected, got %v", err)
	}

	plannedShipAt := time.Date(2026, 7, 10, 12, 34, 56, 123456789, time.FixedZone("UTC+8", 8*60*60))
	shipment := &ShipmentCreate{ShipmentNo: "SHIP-1", IdempotencyKey: "  SHIPMENT:1:create  ", PlannedShipAt: &plannedShipAt}
	normalizedShipment, err := normalizeShipmentCreate(shipment)
	if err != nil {
		t.Fatalf("normalizeShipmentCreate() error = %v", err)
	}
	if normalizedShipment.IdempotencyKey != "SHIPMENT:1:create" {
		t.Fatalf("expected shipment idempotency key trimmed, got %q", normalizedShipment.IdempotencyKey)
	}
	expectedPlannedShipAt := plannedShipAt.UTC().Truncate(time.Microsecond)
	if normalizedShipment.PlannedShipAt == nil || normalizedShipment.PlannedShipAt.Location() != time.UTC || !normalizedShipment.PlannedShipAt.Equal(expectedPlannedShipAt) || normalizedShipment.PlannedShipAt.Nanosecond()%1000 != 0 {
		t.Fatalf("planned_ship_at must canonicalize to UTC microseconds, got %#v", normalizedShipment.PlannedShipAt)
	}
	shipment.IdempotencyKey = " "
	if _, err := normalizeShipmentCreate(shipment); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected blank shipment idempotency key rejected, got %v", err)
	}

	if _, err := normalizeShipmentItemCreate(&ShipmentItemCreate{ProductID: 2, WarehouseID: 3, UnitID: 4, Quantity: decimal.Zero}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero shipment item quantity rejected, got %v", err)
	}

	reservation := &StockReservationCreate{
		ReservationNo:  "RES-1",
		ProductID:      1,
		WarehouseID:    2,
		UnitID:         3,
		Quantity:       decimal.NewFromInt(4),
		IdempotencyKey: "  RES:1:create  ",
		ReservedAt:     time.Now(),
	}
	normalizedReservation, err := normalizeStockReservationCreate(reservation)
	if err != nil {
		t.Fatalf("normalizeStockReservationCreate() error = %v", err)
	}
	if normalizedReservation.IdempotencyKey != "RES:1:create" {
		t.Fatalf("expected reservation idempotency key trimmed, got %q", normalizedReservation.IdempotencyKey)
	}
	reservation.Quantity = decimal.Zero
	if _, err := normalizeStockReservationCreate(reservation); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero reservation quantity rejected, got %v", err)
	}

	finance := &FinanceFactCreate{
		FactNo:           "AR-1",
		FactType:         FinanceFactReceivable,
		CounterpartyType: FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		FeeAmount:        decimal.NewFromFloat(1.5),
		Currency:         " hkd ",
		CollectionType:   ptrString(" accounts_receivable "),
		PaymentTerm:      ptrString(" eom_45 "),
		InvoiceCategory:  ptrString(" vat_special_13 "),
		IdempotencyKey:   "  FINANCE:1:create  ",
		OccurredAt:       time.Now(),
	}
	normalizedFinance, err := normalizeFinanceFactCreate(finance)
	if err != nil {
		t.Fatalf("normalizeFinanceFactCreate() error = %v", err)
	}
	if normalizedFinance.IdempotencyKey != "FINANCE:1:create" {
		t.Fatalf("expected finance idempotency key trimmed, got %q", normalizedFinance.IdempotencyKey)
	}
	if normalizedFinance.Currency != FinanceCurrencyHKD {
		t.Fatalf("expected finance currency normalized to HKD, got %q", normalizedFinance.Currency)
	}
	if normalizedFinance.CollectionType == nil || *normalizedFinance.CollectionType != FinanceCollectionAccountsReceivable {
		t.Fatalf("expected collection type normalized, got %#v", normalizedFinance.CollectionType)
	}
	if normalizedFinance.PaymentTerm == nil || *normalizedFinance.PaymentTerm != FinancePaymentTermEOM45 {
		t.Fatalf("expected payment term normalized, got %#v", normalizedFinance.PaymentTerm)
	}
	if normalizedFinance.PaymentTermDays == nil || *normalizedFinance.PaymentTermDays != 45 {
		t.Fatalf("expected payment term days auto-filled to 45, got %#v", normalizedFinance.PaymentTermDays)
	}
	if normalizedFinance.InvoiceCategory == nil || *normalizedFinance.InvoiceCategory != FinanceInvoiceCategoryVATSpecial13 {
		t.Fatalf("expected invoice category normalized, got %#v", normalizedFinance.InvoiceCategory)
	}
	finance.Amount = decimal.Zero
	if _, err := normalizeFinanceFactCreate(finance); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero finance amount rejected, got %v", err)
	}
	finance.Amount = decimal.NewFromInt(100)
	finance.FeeAmount = decimal.NewFromInt(-1)
	if _, err := normalizeFinanceFactCreate(finance); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected negative finance fee rejected, got %v", err)
	}
	finance.FeeAmount = decimal.Zero
	finance.Currency = "EUR"
	if _, err := normalizeFinanceFactCreate(finance); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected unsupported finance currency rejected, got %v", err)
	}
	finance.Currency = FinanceCurrencyCNY
	finance.PaymentTerm = ptrString(FinancePaymentTermCashOnShipment)
	finance.PaymentTermDays = nil
	normalizedFinance, err = normalizeFinanceFactCreate(finance)
	if err != nil {
		t.Fatalf("normalize cash-on-shipment finance fact error = %v", err)
	}
	if normalizedFinance.PaymentTermDays == nil || *normalizedFinance.PaymentTermDays != 0 {
		t.Fatalf("expected cash-on-shipment days 0, got %#v", normalizedFinance.PaymentTermDays)
	}
	finance.PaymentTerm = ptrString("NET_90")
	if _, err := normalizeFinanceFactCreate(finance); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected unsupported finance payment term rejected, got %v", err)
	}
}
