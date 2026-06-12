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
		ReceiptID:   1,
		MaterialID:  2,
		WarehouseID: 3,
		Quantity:    decimal.NewFromInt(4),
		UnitID:      5,
		UnitPrice:   &price,
		Amount:      &price,
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
	negative := decimal.NewFromInt(-1)
	in := SalesOrderItemMutation{
		SalesOrderID:    1,
		LineNo:          1,
		ProductID:       2,
		UnitID:          3,
		OrderedQuantity: decimal.NewFromInt(4),
		UnitPrice:       &price,
		Amount:          &price,
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

func TestNormalizePhase8InputsUseCoreValueGuards(t *testing.T) {
	fact := &Phase8FactMutation{
		FactNo:         "  PF-1  ",
		FactType:       ProductionFactMaterialIssue,
		SubjectType:    InventorySubjectMaterial,
		SubjectID:      1,
		WarehouseID:    2,
		UnitID:         3,
		Quantity:       decimal.NewFromInt(4),
		IdempotencyKey: "  PRODUCTION_FACT:1:1:OUT  ",
	}
	normalizedFact, err := normalizePhase8FactMutation(fact, productionFactTypes)
	if err != nil {
		t.Fatalf("normalizePhase8FactMutation() error = %v", err)
	}
	if normalizedFact.IdempotencyKey != "PRODUCTION_FACT:1:1:OUT" {
		t.Fatalf("expected phase8 idempotency key trimmed, got %q", normalizedFact.IdempotencyKey)
	}
	fact.Quantity = decimal.Zero
	if _, err := normalizePhase8FactMutation(fact, productionFactTypes); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero production quantity rejected, got %v", err)
	}

	shipment := &ShipmentCreate{ShipmentNo: "SHIP-1", IdempotencyKey: "  SHIPMENT:1:create  "}
	normalizedShipment, err := normalizeShipmentCreate(shipment)
	if err != nil {
		t.Fatalf("normalizeShipmentCreate() error = %v", err)
	}
	if normalizedShipment.IdempotencyKey != "SHIPMENT:1:create" {
		t.Fatalf("expected shipment idempotency key trimmed, got %q", normalizedShipment.IdempotencyKey)
	}
	shipment.IdempotencyKey = " "
	if _, err := normalizeShipmentCreate(shipment); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected blank shipment idempotency key rejected, got %v", err)
	}

	if _, err := normalizeShipmentItemCreate(&ShipmentItemCreate{ShipmentID: 1, ProductID: 2, WarehouseID: 3, UnitID: 4, Quantity: decimal.Zero}); !errors.Is(err, ErrBadParam) {
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
	finance.Amount = decimal.Zero
	if _, err := normalizeFinanceFactCreate(finance); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero finance amount rejected, got %v", err)
	}
}
