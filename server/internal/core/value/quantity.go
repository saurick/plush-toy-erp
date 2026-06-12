package value

import (
	domainerrors "server/internal/core/errors"

	"github.com/shopspring/decimal"
)

type Quantity struct {
	value decimal.Decimal
}

func NewPositiveQuantity(raw decimal.Decimal) (Quantity, error) {
	if !raw.IsPositive() {
		return Quantity{}, domainerrors.ErrInvalidQuantity
	}
	return Quantity{value: raw}, nil
}

func (quantity Quantity) Decimal() decimal.Decimal {
	return quantity.value
}
