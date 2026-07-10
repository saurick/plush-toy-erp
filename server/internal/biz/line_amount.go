package biz

import (
	domainerrors "server/internal/core/errors"

	"github.com/shopspring/decimal"
)

const lineAmountScale int32 = 6

func normalizeCalculatedLineAmount(quantity decimal.Decimal, unitPrice, amount *decimal.Decimal) (*decimal.Decimal, error) {
	if unitPrice == nil {
		if amount != nil {
			return nil, domainerrors.ErrInvalidMoney
		}
		return nil, nil
	}
	calculated := quantity.Mul(*unitPrice).Round(lineAmountScale)
	if amount != nil && !amount.Equal(calculated) {
		return nil, domainerrors.ErrInvalidMoney
	}
	return &calculated, nil
}
