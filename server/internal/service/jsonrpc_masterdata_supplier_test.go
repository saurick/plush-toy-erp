package service

import (
	"testing"

	"server/internal/biz"
)

func TestSupplierMutationFromParamsRequiresAndValidatesPaymentTermDays(t *testing.T) {
	tests := []struct {
		name     string
		value    any
		hasValue bool
		want     int
		wantOK   bool
	}{
		{name: "missing"},
		{name: "null", value: nil, hasValue: true},
		{name: "zero", value: float64(0), hasValue: true, wantOK: true},
		{name: "positive", value: float64(30), hasValue: true, want: 30, wantOK: true},
		{name: "negative", value: float64(-1), hasValue: true},
		{name: "fractional", value: 30.5, hasValue: true},
		{name: "wrong type", value: "30", hasValue: true},
		{name: "boolean", value: true, hasValue: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := map[string]any{"code": "S-001", "name": "供应商"}
			if tt.hasValue {
				params["default_payment_term_days"] = tt.value
			}
			mutation, ok := supplierMutationFromParams(params)
			if ok != tt.wantOK {
				t.Fatalf("expected ok=%v, got %v mutation=%#v", tt.wantOK, ok, mutation)
			}
			if ok && mutation.DefaultPaymentTermDays != tt.want {
				t.Fatalf("expected payment term %d, got %d", tt.want, mutation.DefaultPaymentTermDays)
			}
		})
	}
}

func TestSupplierToMapIncludesPaymentTermDays(t *testing.T) {
	result := supplierToMap(&biz.Supplier{
		ID:                     1,
		Code:                   "S-001",
		Name:                   "供应商",
		DefaultPaymentTermDays: 45,
	})
	if result["default_payment_term_days"] != 45 {
		t.Fatalf("expected payment term in supplier response, got %#v", result)
	}
}
