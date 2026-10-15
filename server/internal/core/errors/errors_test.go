package domainerrors

import (
	"errors"
	"testing"
)

func TestIsDomainError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "quantity", err: ErrInvalidQuantity, want: true},
		{name: "money", err: ErrInvalidMoney, want: true},
		{name: "idempotency key", err: ErrInvalidIdempotencyKey, want: true},
		{name: "wrapped", err: errors.Join(errors.New("bad param"), ErrInvalidMoney), want: true},
		{name: "unknown", err: errors.New("other"), want: false},
		{name: "nil", err: nil, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsDomainError(tt.err); got != tt.want {
				t.Fatalf("IsDomainError() = %v, want %v", got, tt.want)
			}
		})
	}
}
