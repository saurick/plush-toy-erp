package value

import (
	"errors"
	"testing"

	domainerrors "server/internal/core/errors"

	"github.com/shopspring/decimal"
)

func TestNewPositiveQuantity(t *testing.T) {
	tests := []struct {
		name    string
		raw     decimal.Decimal
		wantErr bool
	}{
		{name: "positive", raw: decimal.NewFromInt(1)},
		{name: "zero", raw: decimal.Zero, wantErr: true},
		{name: "negative", raw: decimal.NewFromInt(-1), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			quantity, err := NewPositiveQuantity(tt.raw)
			if tt.wantErr {
				if !errors.Is(err, domainerrors.ErrInvalidQuantity) {
					t.Fatalf("expected ErrInvalidQuantity, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("NewPositiveQuantity() error = %v", err)
			}
			if !quantity.Decimal().Equal(tt.raw) {
				t.Fatalf("quantity = %s, want %s", quantity.Decimal(), tt.raw)
			}
		})
	}
}

func TestMoney(t *testing.T) {
	tests := []struct {
		name        string
		raw         decimal.Decimal
		constructor func(decimal.Decimal) (Money, error)
		wantErr     bool
	}{
		{name: "non-negative allows zero", raw: decimal.Zero, constructor: NewNonNegativeMoney},
		{name: "non-negative rejects negative", raw: decimal.NewFromInt(-1), constructor: NewNonNegativeMoney, wantErr: true},
		{name: "positive allows positive", raw: decimal.NewFromInt(1), constructor: NewPositiveMoney},
		{name: "positive rejects zero", raw: decimal.Zero, constructor: NewPositiveMoney, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			money, err := tt.constructor(tt.raw)
			if tt.wantErr {
				if !errors.Is(err, domainerrors.ErrInvalidMoney) {
					t.Fatalf("expected ErrInvalidMoney, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("money constructor error = %v", err)
			}
			if !money.Decimal().Equal(tt.raw) {
				t.Fatalf("money = %s, want %s", money.Decimal(), tt.raw)
			}
		})
	}
}

func TestValidateOptionalNonNegativeMoney(t *testing.T) {
	negative := decimal.NewFromInt(-1)
	zero := decimal.Zero

	if err := ValidateOptionalNonNegativeMoney(nil); err != nil {
		t.Fatalf("nil optional money should pass, got %v", err)
	}
	if err := ValidateOptionalNonNegativeMoney(&zero); err != nil {
		t.Fatalf("zero optional money should pass, got %v", err)
	}
	if err := ValidateOptionalNonNegativeMoney(&negative); !errors.Is(err, domainerrors.ErrInvalidMoney) {
		t.Fatalf("negative optional money should return ErrInvalidMoney, got %v", err)
	}
}

func TestNewIdempotencyKey(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    string
		wantErr bool
	}{
		{name: "trimmed", raw: "  source:1:action  ", want: "source:1:action"},
		{name: "empty", raw: "", wantErr: true},
		{name: "blank", raw: "   ", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := NewIdempotencyKey(tt.raw)
			if tt.wantErr {
				if !errors.Is(err, domainerrors.ErrInvalidIdempotencyKey) {
					t.Fatalf("expected ErrInvalidIdempotencyKey, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("NewIdempotencyKey() error = %v", err)
			}
			if key.String() != tt.want {
				t.Fatalf("key = %q, want %q", key.String(), tt.want)
			}
		})
	}
}
