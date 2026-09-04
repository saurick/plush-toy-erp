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

func normalizeSalesOrderQuotedFreightAmount(
	freightTerms *string,
	amount *decimal.Decimal,
) (*decimal.Decimal, error) {
	if freightTerms == nil {
		if amount != nil {
			return nil, ErrBadParam
		}
		return nil, nil
	}
	if *freightTerms != SalesOrderFreightTermsExcluded {
		return nil, nil
	}
	if amount == nil {
		return nil, nil
	}
	normalized := amount.Truncate(lineAmountScale)
	if !amount.Equal(normalized) || normalized.IsNegative() || normalized.GreaterThan(maxPositiveNumeric20Scale6) {
		return nil, ErrBadParam
	}
	return &normalized, nil
}

func CalculateSalesOrderAmounts(
	taxMode *string,
	taxRate *decimal.Decimal,
	freightTerms *string,
	quotedFreightAmount *decimal.Decimal,
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
	if freightTerms == nil {
		return goodsAmount, nil, nil, nil
	}
	terms := strings.ToUpper(strings.TrimSpace(*freightTerms))
	commercialBase := goods
	switch terms {
	case SalesOrderFreightTermsIncluded:
		if quotedFreightAmount != nil {
			return nil, nil, nil, ErrBadParam
		}
	case SalesOrderFreightTermsExcluded:
		if quotedFreightAmount == nil {
			return goodsAmount, nil, nil, nil
		}
		normalizedFreight, normalizeErr := normalizeSalesOrderQuotedFreightAmount(&terms, quotedFreightAmount)
		if normalizeErr != nil {
			return nil, nil, nil, normalizeErr
		}
		commercialBase = commercialBase.Add(*normalizedFreight).Round(lineAmountScale)
	default:
		return nil, nil, nil, ErrBadParam
	}
	if taxMode == nil {
		return goodsAmount, nil, nil, nil
	}
	mode := strings.ToUpper(strings.TrimSpace(*taxMode))
	switch mode {
	case SalesOrderTaxModeNone:
		tax := decimal.Zero
		total := commercialBase
		return goodsAmount, &tax, &total, nil
	case SalesOrderTaxModeInclusive, SalesOrderTaxModeExclusive:
		if taxRate == nil || !taxRate.IsPositive() || taxRate.GreaterThan(decimal.NewFromInt(100)) {
			return goodsAmount, nil, nil, nil
		}
		var tax decimal.Decimal
		if mode == SalesOrderTaxModeInclusive {
			tax = commercialBase.Mul(*taxRate).Div(decimal.NewFromInt(100).Add(*taxRate)).Round(lineAmountScale)
		} else {
			tax = commercialBase.Mul(*taxRate).Div(decimal.NewFromInt(100)).Round(lineAmountScale)
		}
		total := commercialBase
		if mode == SalesOrderTaxModeExclusive {
			total = commercialBase.Add(tax).Round(lineAmountScale)
		}
		return goodsAmount, &tax, &total, nil
	default:
		return nil, nil, nil, ErrBadParam
	}
}
