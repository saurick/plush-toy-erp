package value

import (
	"strings"

	domainerrors "server/internal/core/errors"
)

type IdempotencyKey struct {
	value string
}

func NewIdempotencyKey(raw string) (IdempotencyKey, error) {
	normalized := strings.TrimSpace(raw)
	if normalized == "" {
		return IdempotencyKey{}, domainerrors.ErrInvalidIdempotencyKey
	}
	return IdempotencyKey{value: normalized}, nil
}

func (key IdempotencyKey) String() string {
	return key.value
}
