package biz

import (
	"fmt"

	corevalue "server/internal/core/value"

	"github.com/shopspring/decimal"
)

// UnitQuantityError describes a quantity that cannot be represented in its unit.
// The caller supplies the persisted unit precision, never a client-side value.
type UnitQuantityError struct {
	Precision int
}

func (e *UnitQuantityError) Error() string {
	if e.Precision == 0 {
		return "当前单位只允许整数数量"
	}
	if e.Precision < 0 || e.Precision > 6 {
		return "单位精度配置无效，请核对单位资料"
	}
	return fmt.Sprintf("当前单位最多允许 %d 位小数", e.Precision)
}

func (e *UnitQuantityError) Unwrap() error { return ErrBadParam }

// ValidateUnitQuantity checks the value without rounding it. Signs and zero are
// governed by the owning operation (e.g. a stock adjustment may be negative).
func ValidateUnitQuantity(quantity decimal.Decimal, precision int) error {
	if precision < 0 || precision > corevalue.NumericScale || !quantity.Equal(quantity.Truncate(int32(precision))) {
		return &UnitQuantityError{Precision: precision}
	}
	if quantity.Abs().GreaterThan(decimal.RequireFromString(corevalue.NumericMaximum)) {
		return ErrBadParam
	}
	return nil
}

// RoundRequiredUnitQuantity rounds calculated demand upward only when turning
// a BOM coefficient into an executable purchase/issue quantity. Entered facts
// must use ValidateUnitQuantity instead so user input is never silently changed.
func RoundRequiredUnitQuantity(quantity decimal.Decimal, precision int) (decimal.Decimal, error) {
	if precision < 0 || precision > corevalue.NumericScale {
		return decimal.Zero, &UnitQuantityError{Precision: precision}
	}
	if !quantity.IsPositive() {
		return decimal.Zero, ErrBadParam
	}
	result := quantity.RoundCeil(int32(precision))
	return result, ValidateUnitQuantity(result, precision)
}
