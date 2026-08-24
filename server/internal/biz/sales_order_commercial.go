package biz

import (
	"strings"

	"github.com/shopspring/decimal"
)

var salesOrderTaxModes = map[string]struct{}{
	SalesOrderTaxModeInclusive: {},
	SalesOrderTaxModeExclusive: {},
	SalesOrderTaxModeNone:      {},
}

var salesOrderFreightTerms = map[string]struct{}{
	SalesOrderFreightTermsIncluded: {},
	SalesOrderFreightTermsExcluded: {},
}

func normalizeSalesOrderCommercialTerms(
	taxMode *string,
	taxRate *decimal.Decimal,
	freightTerms *string,
) (*string, *decimal.Decimal, *string, error) {
	taxMode = normalizeOptionalUpperString(taxMode)
	freightTerms = normalizeOptionalUpperString(freightTerms)
	if taxMode != nil {
		if _, ok := salesOrderTaxModes[*taxMode]; !ok {
			return nil, nil, nil, ErrBadParam
		}
	}
	if freightTerms != nil {
		if _, ok := salesOrderFreightTerms[*freightTerms]; !ok {
			return nil, nil, nil, ErrBadParam
		}
	}
	if taxMode == nil || *taxMode == SalesOrderTaxModeNone {
		taxRate = nil
	} else if taxRate != nil {
		normalizedRate := taxRate.Truncate(lineAmountScale)
		if !taxRate.Equal(normalizedRate) || !normalizedRate.IsPositive() || normalizedRate.GreaterThan(decimal.NewFromInt(100)) {
			return nil, nil, nil, ErrBadParam
		}
		taxRate = &normalizedRate
	}
	return taxMode, taxRate, freightTerms, nil
}

func CalculateSalesOrderAmounts(
	taxMode *string,
	taxRate *decimal.Decimal,
	amounts []*decimal.Decimal,
) (goodsAmount, taxAmount, orderTotal *decimal.Decimal, err error) {
	if len(amounts) == 0 {
		return nil, nil, nil, nil
	}
	goods := decimal.Zero
	for _, amount := range amounts {
		if amount == nil {
			return nil, nil, nil, nil
		}
		if amount.IsNegative() {
			return nil, nil, nil, ErrBadParam
		}
		goods = goods.Add(*amount)
	}
	goods = goods.Round(lineAmountScale)
	goodsAmount = &goods
	if taxMode == nil {
		return goodsAmount, nil, nil, nil
	}
	mode := strings.ToUpper(strings.TrimSpace(*taxMode))
	switch mode {
	case SalesOrderTaxModeNone:
		tax := decimal.Zero
		total := goods
		return goodsAmount, &tax, &total, nil
	case SalesOrderTaxModeInclusive, SalesOrderTaxModeExclusive:
		if taxRate == nil || !taxRate.IsPositive() || taxRate.GreaterThan(decimal.NewFromInt(100)) {
			return goodsAmount, nil, nil, nil
		}
		var tax decimal.Decimal
		if mode == SalesOrderTaxModeInclusive {
			tax = goods.Mul(*taxRate).Div(decimal.NewFromInt(100).Add(*taxRate)).Round(lineAmountScale)
		} else {
			tax = goods.Mul(*taxRate).Div(decimal.NewFromInt(100)).Round(lineAmountScale)
		}
		total := goods
		if mode == SalesOrderTaxModeExclusive {
			total = goods.Add(tax).Round(lineAmountScale)
		}
		return goodsAmount, &tax, &total, nil
	default:
		return nil, nil, nil, ErrBadParam
	}
}
