package calc

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestInventoryAvailableQuantity(t *testing.T) {
	tests := []struct {
		name     string
		balance  decimal.Decimal
		reserved decimal.Decimal
		want     decimal.Decimal
	}{
		{name: "no reservation", balance: decimal.NewFromInt(10), reserved: decimal.Zero, want: decimal.NewFromInt(10)},
		{name: "subtracts active reservations", balance: decimal.NewFromInt(10), reserved: decimal.NewFromInt(4), want: decimal.NewFromInt(6)},
		{name: "over reserved can be negative", balance: decimal.NewFromInt(3), reserved: decimal.NewFromInt(5), want: decimal.NewFromInt(-2)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := InventoryAvailableQuantity(tt.balance, tt.reserved); !got.Equal(tt.want) {
				t.Fatalf("available = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestHasInventoryAvailableQuantity(t *testing.T) {
	tests := []struct {
		name     string
		balance  decimal.Decimal
		reserved decimal.Decimal
		required decimal.Decimal
		want     bool
	}{
		{name: "equal available is enough", balance: decimal.NewFromInt(10), reserved: decimal.NewFromInt(4), required: decimal.NewFromInt(6), want: true},
		{name: "less than required is insufficient", balance: decimal.NewFromInt(10), reserved: decimal.NewFromInt(4), required: decimal.NewFromInt(7)},
		{name: "over reserved is insufficient", balance: decimal.NewFromInt(3), reserved: decimal.NewFromInt(5), required: decimal.NewFromInt(1)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HasInventoryAvailableQuantity(tt.balance, tt.reserved, tt.required); got != tt.want {
				t.Fatalf("has available = %v, want %v", got, tt.want)
			}
		})
	}
}
