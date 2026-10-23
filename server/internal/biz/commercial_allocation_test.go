package biz

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestCommercialAllocationRemainder(t *testing.T) {
	d := decimal.RequireFromString
	for _, tc := range []struct{ total, basis, part, priorBasis, priorAmount, want string }{
		{"10", "100", "30", "0", "0", "3"},
		{"14.3", "100", "70", "30", "4.29", "10.01"},
		{"1", "3", "1", "0", "0", "0.333333"},
		{"1", "3", "1", "2", "0.666666", "0.333334"},
		{"0.000001", "3", "1", "2", "0", "0.000001"},
		{"0.000002", "3", "1", "2", "0.000002", "0"},
		{"0", "3", "1", "0", "0", "0"},
		{"99999999999999.999999", "3", "1", "0", "0", "33333333333333.333333"},
	} {
		got, err := AllocateProportionalAmount(d(tc.total), d(tc.basis), d(tc.part), d(tc.priorBasis), d(tc.priorAmount))
		if err != nil || !got.Equal(d(tc.want)) {
			t.Fatalf("allocation %+v = %s, %v", tc, got, err)
		}
	}
	for _, values := range [][5]string{
		{"1", "0", "1", "0", "0"}, {"1", "1", "0", "0", "0"},
		{"1", "3", "2", "2", "0.5"}, {"1", "3", "1", "1", "1.000001"},
		{"-1", "3", "1", "0", "0"}, {"0.0000001", "3", "1", "0", "0"},
		{"100000000000000", "3", "1", "0", "0"},
	} {
		if _, err := AllocateProportionalAmount(d(values[0]), d(values[1]), d(values[2]), d(values[3]), d(values[4])); err == nil {
			t.Fatalf("invalid allocation accepted: %v", values)
		}
	}
}
