package biz

import (
	"errors"
	"testing"
	"time"
)

func TestOperationalFactFiltersRejectInvalidContract(t *testing.T) {
	from := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name      string
		normalize func(OperationalFactFilter) (OperationalFactFilter, error)
		filter    OperationalFactFilter
	}{
		{
			name:      "production status outside schema",
			normalize: normalizeProductionFactFilter,
			filter:    OperationalFactFilter{Status: OperationalFactStatusSettled},
		},
		{
			name:      "production fact type outside domain",
			normalize: normalizeProductionFactFilter,
			filter:    OperationalFactFilter{FactType: FinanceFactReceivable},
		},
		{
			name:      "production date range reversed",
			normalize: normalizeProductionFactFilter,
			filter:    OperationalFactFilter{DateFrom: &from, DateTo: &to},
		},
		{
			name:      "production date field outside query contract",
			normalize: normalizeProductionFactFilter,
			filter:    OperationalFactFilter{DateField: "posted_at"},
		},
		{
			name:      "outsourcing fact type outside domain",
			normalize: normalizeOutsourcingFactFilter,
			filter:    OperationalFactFilter{FactType: ProductionFactFinishedGoodsReceipt},
		},
		{
			name:      "shipment status outside schema",
			normalize: normalizeShipmentFilter,
			filter:    OperationalFactFilter{Status: OperationalFactStatusPosted},
		},
		{
			name:      "shipment date field outside query contract",
			normalize: normalizeShipmentFilter,
			filter:    OperationalFactFilter{DateField: "occurred_at"},
		},
		{
			name:      "shipment date range reversed",
			normalize: normalizeShipmentFilter,
			filter:    OperationalFactFilter{DateField: "planned_ship_at", DateFrom: &from, DateTo: &to},
		},
		{
			name:      "stock reservation status outside schema",
			normalize: normalizeStockReservationFilter,
			filter:    OperationalFactFilter{Status: OperationalFactStatusPosted},
		},
		{
			name:      "stock reservation date field outside query contract",
			normalize: normalizeStockReservationFilter,
			filter:    OperationalFactFilter{DateField: "occurred_at"},
		},
		{
			name:      "stock reservation date range reversed",
			normalize: normalizeStockReservationFilter,
			filter:    OperationalFactFilter{DateFrom: &from, DateTo: &to},
		},
		{
			name:      "finance status outside schema",
			normalize: normalizeFinanceFactFilter,
			filter:    OperationalFactFilter{Status: StockReservationStatusActive},
		},
		{
			name:      "finance fact type outside domain",
			normalize: normalizeFinanceFactFilter,
			filter:    OperationalFactFilter{FactType: ProductionFactMaterialIssue},
		},
		{
			name:      "finance date field outside query contract",
			normalize: normalizeFinanceFactFilter,
			filter:    OperationalFactFilter{DateField: "reserved_at"},
		},
		{
			name:      "finance date range reversed",
			normalize: normalizeFinanceFactFilter,
			filter:    OperationalFactFilter{DateFrom: &from, DateTo: &to},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := tc.normalize(tc.filter); !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected ErrBadParam, got %v", err)
			}
		})
	}
}

func TestOperationalFactFiltersAcceptDomainSpecificStatusesAndDefaultDateFields(t *testing.T) {
	from := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name              string
		normalize         func(OperationalFactFilter) (OperationalFactFilter, error)
		filter            OperationalFactFilter
		expectedDateField string
	}{
		{
			name:              "production defaults occurred_at",
			normalize:         normalizeProductionFactFilter,
			filter:            OperationalFactFilter{Status: OperationalFactStatusPosted, FactType: ProductionFactMaterialIssue, DateFrom: &from},
			expectedDateField: "occurred_at",
		},
		{
			name:              "outsourcing defaults occurred_at",
			normalize:         normalizeOutsourcingFactFilter,
			filter:            OperationalFactFilter{Status: OperationalFactStatusCancelled, FactType: OutsourcingFactReturnReceipt, DateFrom: &from},
			expectedDateField: "occurred_at",
		},
		{
			name:              "stock reservation defaults reserved_at",
			normalize:         normalizeStockReservationFilter,
			filter:            OperationalFactFilter{Status: StockReservationStatusActive, DateFrom: &from},
			expectedDateField: "reserved_at",
		},
		{
			name:              "finance accepts settled and defaults occurred_at",
			normalize:         normalizeFinanceFactFilter,
			filter:            OperationalFactFilter{Status: OperationalFactStatusSettled, FactType: FinanceFactReceivable, DateFrom: &from},
			expectedDateField: "occurred_at",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.normalize(tc.filter)
			if err != nil {
				t.Fatalf("expected filter to normalize, got %v", err)
			}
			if got.DateField != tc.expectedDateField {
				t.Fatalf("expected date field %q, got %q", tc.expectedDateField, got.DateField)
			}
		})
	}
}
