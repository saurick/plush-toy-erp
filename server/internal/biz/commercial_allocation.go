package biz

import "github.com/shopspring/decimal"

// AllocateProportionalAmount freezes one batch's share. Cancelled batches are
// excluded by the caller; the last effective batch receives the exact remainder.
func AllocateProportionalAmount(total, basis, part, priorBasis, priorAmount decimal.Decimal) (decimal.Decimal, error) {
	for _, v := range []decimal.Decimal{total, basis, part, priorBasis, priorAmount} {
		if v.IsNegative() || !v.Equal(v.Truncate(6)) || v.GreaterThan(maxPositiveNumeric20Scale6) {
			return decimal.Zero, ErrBadParam
		}
	}
	if !basis.IsPositive() || !part.IsPositive() || priorBasis.Add(part).GreaterThan(basis) || priorAmount.GreaterThan(total) {
		return decimal.Zero, ErrBadParam
	}
	remaining := total.Sub(priorAmount)
	if priorBasis.Add(part).Equal(basis) {
		return remaining, nil
	}
	share := total.Mul(part).DivRound(basis, 6)
	if share.GreaterThan(remaining) {
		share = remaining
	}
	return share, nil
}
