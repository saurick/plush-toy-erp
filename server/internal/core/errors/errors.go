// Package domainerrors defines domain-rule errors shared by pure core values.
package domainerrors

import "errors"

var (
	ErrInvalidQuantity       = errors.New("invalid quantity")
	ErrInvalidMoney          = errors.New("invalid money")
	ErrInvalidIdempotencyKey = errors.New("invalid idempotency key")
)

func IsDomainError(err error) bool {
	return errors.Is(err, ErrInvalidQuantity) ||
		errors.Is(err, ErrInvalidMoney) ||
		errors.Is(err, ErrInvalidIdempotencyKey)
}
