package biz

import (
	"strings"

	"github.com/shopspring/decimal"
)

// parsePositiveNumeric20Scale6Contract validates the canonical public quantity
// shape before a workflow payload can reach a numeric(20,6) database column.
func parsePositiveNumeric20Scale6Contract(value string) (decimal.Decimal, bool) {
	if value == "" || strings.TrimSpace(value) != value {
		return decimal.Zero, false
	}
	index := 0
	integerDigits := 0
	for index < len(value) && value[index] >= '0' && value[index] <= '9' {
		integerDigits++
		index++
	}
	if integerDigits == 0 || integerDigits > 14 {
		return decimal.Zero, false
	}
	if index < len(value) {
		if value[index] != '.' {
			return decimal.Zero, false
		}
		index++
		fractionDigits := 0
		for index < len(value) && value[index] >= '0' && value[index] <= '9' {
			fractionDigits++
			index++
		}
		if fractionDigits == 0 || fractionDigits > 6 {
			return decimal.Zero, false
		}
	}
	if index != len(value) {
		return decimal.Zero, false
	}
	quantity, err := decimal.NewFromString(value)
	return quantity, err == nil && quantity.IsPositive()
}
