package biz

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type materialNoteTestRepo struct{ SalesOrderRepo }

func (*materialNoteTestRepo) GetEngineeringMaterialRequest(context.Context, int, bool) (*EngineeringMaterialRequest, error) {
	return nil, nil
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
