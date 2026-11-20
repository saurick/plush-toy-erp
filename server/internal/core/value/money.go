package value

import (
	domainerrors "server/internal/core/errors"

	"github.com/shopspring/decimal"
)

type Money struct {
	value decimal.Decimal
}

func NewNonNegativeMoney(raw decimal.Decimal) (Money, error) {
	if raw.IsNegative() {
		return Money{}, domainerrors.ErrInvalidMoney
	}
	return Money{value: raw}, nil
}

func NewPositiveMoney(raw decimal.Decimal) (Money, error) {
	if !raw.IsPositive() {
		return Money{}, domainerrors.ErrInvalidMoney
	}
	return Money{value: raw}, nil
}

func ValidateOptionalNonNegativeMoney(raw *decimal.Decimal) error {
	if raw == nil {
		return nil
	}
	_, err := NewNonNegativeMoney(*raw)
	return err
}

func (money Money) Decimal() decimal.Decimal {
	return money.value
}
