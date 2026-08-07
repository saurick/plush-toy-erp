package service

import (
	"testing"
	"time"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestOperationalFactReadProjectionMapsUseExactDecimalStrings(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	originalAmount := decimal.RequireFromString("100.000001")
	outstandingAmount := decimal.RequireFromString("99.876543")
	factProjection := financeFactToAny(&biz.FinanceFact{
		ID:                10,
		FactNo:            "AR-PROJECTION",
		FactType:          biz.FinanceFactReceivable,
		Amount:            originalAmount,
		OutstandingAmount: outstandingAmount,
		OccurredAt:        now,
		CreatedAt:         now,
		UpdatedAt:         now,
	})
	if got := factProjection["outstanding_amount"]; got != outstandingAmount.String() {
		t.Fatalf("finance fact outstanding_amount=%#v want=%q", got, outstandingAmount.String())
	}

	paymentProjection := financePaymentToMap(&biz.FinancePayment{
		ID:         20,
		PaymentNo:  "PAY-PROJECTION",
		Amount:     decimal.RequireFromString("0.123458"),
		OccurredAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
		Allocations: []*biz.FinanceAllocation{{
			ID:                           21,
			FinanceFactID:                10,
			FinanceFactNo:                "AR-PROJECTION",
			FinanceFactType:              biz.FinanceFactReceivable,
			FinanceFactOriginalAmount:    originalAmount,
			FinanceFactOutstandingAmount: outstandingAmount,
			Amount:                       decimal.RequireFromString("0.123458"),
		}},
	})
	rawAllocations, ok := paymentProjection["allocations"].([]any)
	if !ok || len(rawAllocations) != 1 {
		t.Fatalf("payment allocations=%#v", paymentProjection["allocations"])
	}
	allocation, ok := rawAllocations[0].(map[string]any)
	if !ok {
		t.Fatalf("payment allocation=%#v", rawAllocations[0])
	}
	if allocation["finance_fact_no"] != "AR-PROJECTION" ||
		allocation["finance_fact_type"] != biz.FinanceFactReceivable ||
		allocation["finance_fact_original_amount"] != originalAmount.String() ||
		allocation["finance_fact_outstanding_amount"] != outstandingAmount.String() {
		t.Fatalf("payment allocation projection=%#v", allocation)
	}

	creditProjection := financeCreditNoteToMap(&biz.FinanceCreditNote{
		ID:                           30,
		CreditNoteNo:                 "CN-PROJECTION",
		FinanceFactID:                10,
		FinanceFactNo:                "AR-PROJECTION",
		FinanceFactType:              biz.FinanceFactReceivable,
		FinanceFactOriginalAmount:    originalAmount,
		FinanceFactOutstandingAmount: outstandingAmount,
		Amount:                       decimal.RequireFromString("0.000001"),
		CreatedAt:                    now,
	})
	if creditProjection["finance_fact_no"] != "AR-PROJECTION" ||
		creditProjection["finance_fact_type"] != biz.FinanceFactReceivable ||
		creditProjection["finance_fact_original_amount"] != originalAmount.String() ||
		creditProjection["finance_fact_outstanding_amount"] != outstandingAmount.String() {
		t.Fatalf("credit projection=%#v", creditProjection)
	}
}
