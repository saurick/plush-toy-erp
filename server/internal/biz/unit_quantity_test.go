package biz

import (
	"errors"
	"math"
	"testing"

	"github.com/shopspring/decimal"
)

// Integer division is an independent oracle for quantities expressed in millionths.
// The bounded input stays below the storage maximum; overflow has explicit examples below.
func FuzzRoundRequiredUnitQuantity(f *testing.F) {
	for _, coefficient := range []int64{0, -1, 1, 26_400_000, 1_001_001, math.MaxInt64, math.MinInt64} {
		for precision := uint8(0); precision < 9; precision++ {
			f.Add(coefficient, precision)
		}
	}
	f.Fuzz(func(t *testing.T, coefficient int64, scale uint8) {
		precision := int(scale%9) - 1
		quantity := decimal.New(coefficient, -6)
		got, err := RoundRequiredUnitQuantity(quantity, precision)
		if precision < 0 || precision > 6 || coefficient <= 0 {
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("invalid demand accepted: coefficient=%d precision=%d err=%v", coefficient, precision, err)
			}
			return
		}
		step := int64(1)
		for digit := precision; digit < 6; digit++ {
			step *= 10
		}
		units := coefficient / step
		if coefficient%step != 0 {
			units++
		}
		want := decimal.New(units, -int32(precision))
		if err != nil || !got.Equal(want) {
			t.Fatalf("coefficient=%d precision=%d got=%s want=%s err=%v", coefficient, precision, got, want, err)
		}
		if valid := ValidateUnitQuantity(quantity, precision) == nil; valid != (coefficient%step == 0) {
			t.Fatalf("quantity precision changed silently: coefficient=%d precision=%d valid=%v", coefficient, precision, valid)
		}
	})
}

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
