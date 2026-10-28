package biz

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

type materialNoteTestRepo struct{ SalesOrderRepo }

func (*materialNoteTestRepo) GetEngineeringMaterialRequest(context.Context, int, bool) (*EngineeringMaterialRequest, error) {
	return nil, nil
}

func TestMaterialPartUsageKeepsCoefficientPrecisionUntilUnitRounding(t *testing.T) {
	got := MaterialPartUsage(decimal.NewFromInt(100), decimal.RequireFromString("0.009090909090909"), decimal.RequireFromString("0.1"))
	if got.String() != "0.99999999999999" {
		t.Fatalf("usage rounded before the unit boundary: %s", got)
	}
	rounded, err := RoundRequiredUnitQuantity(got, 0)
	if err != nil || rounded.String() != "1" {
		t.Fatalf("unit-rounded demand = %s, %v", rounded, err)
	}
}
func (*materialNoteTestRepo) SubmitEngineeringMaterialRequest(context.Context, *EngineeringMaterialSubmit) (*EngineeringMaterialRequest, error) {
	return nil, nil
}
func (*materialNoteTestRepo) ReviewEngineeringMaterialRequest(context.Context, *EngineeringMaterialReview) (*EngineeringMaterialRequest, error) {
	return &EngineeringMaterialRequest{ID: 1}, nil
}

func TestEngineeringMaterialNotesMatchStorageLimit(t *testing.T) {
	uc := NewSalesOrderUsecase(&materialNoteTestRepo{})
	for _, tc := range []struct {
		name, note string
		valid      bool
	}{
		{"Chinese boundary", strings.Repeat("注", 85), true},
		{"Chinese overflow", strings.Repeat("注", 86), false},
		{"ASCII boundary", strings.Repeat("a", 255), true},
		{"ASCII overflow", strings.Repeat("a", 256), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := &EngineeringMaterialReview{ID: 1, ExpectedVersion: 1, ActorID: 2, Action: "BOSS_APPROVE", Note: &tc.note}
			_, err := uc.ReviewEngineeringMaterialRequest(context.Background(), in)
			if (err == nil) != tc.valid || (!tc.valid && !errors.Is(err, ErrBadParam)) {
				t.Fatal(err)
			}
			in.Action = "FINANCE_APPROVE"
			_, err = uc.ReviewEngineeringMaterialRequest(context.Background(), in)
			if (err == nil) != tc.valid || (!tc.valid && !errors.Is(err, ErrBadParam)) {
				t.Fatal(err)
			}
		})
	}
}

func TestEngineeringMaterialRejectionReasonAndStage(t *testing.T) {
	uc := NewSalesOrderUsecase(&materialNoteTestRepo{})
	for _, tc := range []struct {
		name, note, stage string
		want              error
	}{
		{"missing reason", "", "BOSS", ErrMaterialRequestReviewReasonRequired},
		{"blank reason", "  ", "FINANCE", ErrMaterialRequestReviewReasonRequired},
		{"unknown stage", "请重新核对用量", "UNKNOWN", ErrBadParam},
		{"reason supplied", "请重新核对用量", "BOSS", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := uc.ReviewEngineeringMaterialRequest(t.Context(), &EngineeringMaterialReview{
				ID: 1, ExpectedVersion: 1, ActorID: 2, Action: "REJECT", ReviewStage: tc.stage, Note: &tc.note,
			})
			if !errors.Is(err, tc.want) {
				t.Fatalf("error = %v, want %v", err, tc.want)
			}
		})
	}
}
