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
