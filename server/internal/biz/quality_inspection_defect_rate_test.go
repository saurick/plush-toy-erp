package biz

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestNormalizeQualityInspectionDefectRateCanonicalizesValidPair(t *testing.T) {
	operator := " approx "
	percent := decimal.RequireFromString("5.000000")
	normalizedOperator, normalizedPercent, err := NormalizeQualityInspectionDefectRate(&operator, &percent, true)
	if err != nil {
		t.Fatalf("normalize valid defect rate: %v", err)
	}
	if normalizedOperator == nil || *normalizedOperator != QualityInspectionDefectRateOperatorApprox {
		t.Fatalf("operator = %#v", normalizedOperator)
	}
	if normalizedPercent == nil || normalizedPercent.String() != "5" {
		t.Fatalf("percent = %#v", normalizedPercent)
	}
}

func TestNormalizeQualityInspectionDefectRateRejectsInvalidPairs(t *testing.T) {
	approx := QualityInspectionDefectRateOperatorApprox
	gt := QualityInspectionDefectRateOperatorGT
	unknown := "ESTIMATE"
	five := decimal.NewFromInt(5)
	negative := decimal.NewFromInt(-1)
	over := decimal.RequireFromString("100.000001")
	hundred := decimal.NewFromInt(100)
	tooPrecise := decimal.RequireFromString("5.1234567")

	tests := []struct {
		name     string
		operator *string
		percent  *decimal.Decimal
		required bool
	}{
		{name: "required missing pair", required: true},
		{name: "missing percent", operator: &approx},
		{name: "missing operator", percent: &five},
		{name: "unknown operator", operator: &unknown, percent: &five},
		{name: "negative", operator: &approx, percent: &negative},
		{name: "over one hundred", operator: &approx, percent: &over},
		{name: "greater than one hundred", operator: &gt, percent: &hundred},
		{name: "over six decimals", operator: &approx, percent: &tooPrecise},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := NormalizeQualityInspectionDefectRate(tt.operator, tt.percent, tt.required); !errors.Is(err, ErrBadParam) {
				t.Fatalf("error = %v, want ErrBadParam", err)
			}
		})
	}
}

func TestNormalizeQualityInspectionDefectRateAllowsHistoricalMissingPair(t *testing.T) {
	operator, percent, err := NormalizeQualityInspectionDefectRate(nil, nil, false)
	if err != nil || operator != nil || percent != nil {
		t.Fatalf("historical pair = (%#v, %#v), err=%v", operator, percent, err)
	}
}
