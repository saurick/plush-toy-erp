package service

import "testing"

func TestReferenceIDFiltersRejectUnboundedOrMalformedReads(t *testing.T) {
	parsers := map[string]func(map[string]any) bool{
		"masterdata": func(pm map[string]any) bool { _, ok := masterDataFilterFromParams(pm); return ok },
		"sku":        func(pm map[string]any) bool { _, ok := productSKUFilterFromParams(pm); return ok },
		"lots":       func(pm map[string]any) bool { _, ok := inventoryLotFilterFromParams(pm); return ok },
		"receipts":   func(pm map[string]any) bool { _, ok := purchaseReceiptFilterFromParams(pm); return ok },
		"quality": func(pm map[string]any) bool {
			_, ok := outsourcingReturnQualityInspectionFilterFromParams(pm)
			return ok
		},
	}
	for name, parse := range parsers {
		t.Run(name, func(t *testing.T) {
			key := "ids"
			if name == "quality" {
				key = "fact_ids"
			}
			if !parse(map[string]any{}) || !parse(map[string]any{key: []any{float64(1), float64(7)}}) {
				t.Fatal("omitted and valid IDs must remain readable")
			}
			for _, raw := range []any{nil, "1", []any{}, []any{0}, []any{-1}, []any{1.5}, []any{"1"}, []any{float64(1), float64(1)}, []any{float64(1 << 53)}, make([]any, 201)} {
				if parse(map[string]any{key: raw}) {
					t.Fatalf("accepted malformed IDs: %#v", raw)
				}
			}
		})
	}
}
