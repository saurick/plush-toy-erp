package biz

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestNormalizeCalculatedLineAmount(t *testing.T) {
	quantity := decimal.RequireFromString("12.5")
	unitPrice := decimal.RequireFromString("3.2")
	want := decimal.RequireFromString("40")

	got, err := normalizeCalculatedLineAmount(quantity, &unitPrice, nil)
	if err != nil || got == nil || !got.Equal(want) {
		t.Fatalf("calculated amount = %v, %v", got, err)
	}
	matching := decimal.RequireFromString("40.000")
	if got, err := normalizeCalculatedLineAmount(quantity, &unitPrice, &matching); err != nil || got == nil || !got.Equal(want) {
		t.Fatalf("matching amount = %v, %v", got, err)
	}
	mismatch := decimal.RequireFromString("41")
	if _, err := normalizeCalculatedLineAmount(quantity, &unitPrice, &mismatch); err == nil {
		t.Fatal("mismatched client amount must be rejected")
	}
	if _, err := normalizeCalculatedLineAmount(quantity, nil, &matching); err == nil {
		t.Fatal("amount without unit price must be rejected")
	}
	highPrecisionQuantity := decimal.RequireFromString("0.1234567")
	highPrecisionPrice := decimal.RequireFromString("0.7654321")
	rounded := decimal.RequireFromString("0.094498")
	if got, err := normalizeCalculatedLineAmount(highPrecisionQuantity, &highPrecisionPrice, &rounded); err != nil || got == nil || !got.Equal(rounded) {
		t.Fatalf("high precision amount must round to database scale: %v, %v", got, err)
	}
}

func TestCalculatedLineAmountStorageBoundary(t *testing.T) {
	for _, tc := range []struct {
		quantity, price, want string
		reject                bool
	}{
		{"1", "99999999999999.999999", "99999999999999.999999", false},
		{"2", "60000000000000", "", true},
		{"0.123456", "0.123456", "0.015241", false},
		{"1", "0", "0", false},
	} {
		t.Run(tc.quantity+"x"+tc.price, func(t *testing.T) {
			price := decimal.RequireFromString(tc.price)
			got, err := normalizeCalculatedLineAmount(decimal.RequireFromString(tc.quantity), &price, nil)
			if tc.reject {
				if err == nil {
					t.Fatal("overflow accepted")
				}
				return
			}
			if err != nil || got == nil || got.String() != tc.want {
				t.Fatalf("got %v %v, want %s", got, err, tc.want)
			}
		})
	}
}
