package service

import (
	"testing"
	"time"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestBusinessSourceNumberProjections(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	sourceNo := "SOURCE-2026-001"
	tests := []struct {
		name    string
		project func() map[string]any
	}{
		{
			name: "production fact",
			project: func() map[string]any {
				return productionFactToAny(&biz.ProductionFact{
					SourceNo: &sourceNo, Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now,
				})
			},
		},
		{
			name: "outsourcing fact",
			project: func() map[string]any {
				return outsourcingFactToAny(&biz.OutsourcingFact{
					SourceNo: &sourceNo, Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now,
				})
			},
		},
		{
			name: "finance fact",
			project: func() map[string]any {
				return financeFactToAny(&biz.FinanceFact{
					SourceNo: &sourceNo, Amount: decimal.NewFromInt(1), CreatedAt: now, OccurredAt: now, UpdatedAt: now,
				})
			},
		},
		{
			name: "quality inspection",
			project: func() map[string]any {
				return qualityInspectionToAny(&biz.QualityInspection{SourceNo: &sourceNo, CreatedAt: now, UpdatedAt: now})
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := test.project()["source_no"]; got != sourceNo {
				t.Fatalf("source_no = %#v, want %q", got, sourceNo)
			}
		})
	}

	if got := productionFactToAny(&biz.ProductionFact{
		Quantity: decimal.NewFromInt(1), OccurredAt: now, CreatedAt: now, UpdatedAt: now,
	})["source_no"]; got != nil {
		t.Fatalf("missing source number projection = %#v, want nil", got)
	}
}
