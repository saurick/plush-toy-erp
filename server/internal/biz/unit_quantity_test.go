package biz

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestValidateUnitQuantity(t *testing.T) {
	for _, tt := range []struct {
		raw       string
		precision int
		valid     bool
	}{
		{"1", 0, true}, {"1.000000", 0, true}, {"0.1", 0, false},
		{"-2", 0, true}, {"-2.5", 0, false}, {"0", 0, true},
		{"0.001", 3, true}, {"0.0001", 3, false},
		{"0.000001", 6, true}, {"0.0000001", 6, false},
		{"99999999999999.999999", 6, true}, {"100000000000000", 6, false},
		{"1", -1, false}, {"1", 7, false},
	} {
		t.Run(tt.raw+"/"+string(rune('0'+tt.precision)), func(t *testing.T) {
			err := ValidateUnitQuantity(decimal.RequireFromString(tt.raw), tt.precision)
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v, error=%v", tt.valid, err)
			}
			if err != nil && !errors.Is(err, ErrBadParam) {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestRoundRequiredUnitQuantity(t *testing.T) {
	for _, tt := range []struct {
		raw       string
		precision int
		want      string
	}{
		{"26.4", 0, "27"}, {"26", 0, "26"},
		{"0.000001", 3, "0.001"}, {"1.001001", 3, "1.002"},
		{"0.00438037654384971", 6, "0.004381"},
	} {
		got, err := RoundRequiredUnitQuantity(decimal.RequireFromString(tt.raw), tt.precision)
		if err != nil || got.String() != tt.want {
			t.Fatalf("%s scale %d: got %s, %v", tt.raw, tt.precision, got, err)
		}
	}
	for _, raw := range []string{"0", "-1", "99999999999999.1"} {
		if _, err := RoundRequiredUnitQuantity(decimal.RequireFromString(raw), 0); err == nil {
			t.Fatalf("accepted invalid/overflow demand %s", raw)
		}
	}
}
