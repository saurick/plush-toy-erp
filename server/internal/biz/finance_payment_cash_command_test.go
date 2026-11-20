package biz

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
)

func TestFinancePaymentCashCommandRequiresExplicitMatchingKind(t *testing.T) {
	for _, kind := range []string{FinancePaymentKindSettlement, FinancePaymentKindAdvance, FinancePaymentKindRefund} {
		t.Run(kind, func(t *testing.T) {
			repo := &exceptionOperationalFactRepoStub{financePayment: &FinancePayment{ID: 51, Kind: kind, Status: FinancePaymentStatusApproved, Amount: decimal.NewFromInt(10)}}
			h := &financePaymentProcessCommandHandler{uc: NewOperationalFactUsecase(repo), commandKey: ProcessDomainCommandFinancePaymentPost}
			for _, cashOnly := range []bool{true, false} {
				allocations := []any{}
				if !cashOnly {
					allocations = append(allocations, map[string]any{"finance_fact_id": 1, "amount": "10"})
				}
				payload, err := h.NormalizeProcessDomainCommandPayload(map[string]any{"finance_payment_id": 51, "cash_only": cashOnly, "allocations": allocations})
				if err != nil {
					t.Fatal(err)
				}
				input := exceptionProcessCommandInput(ProcessDomainCommandFinancePaymentPost, financePaymentProcessBusinessRefType, 51, payload)
				err = h.ValidateProcessDomainCommand(context.Background(), input, 8)
				if (err == nil) != (cashOnly == (kind != FinancePaymentKindSettlement)) {
					t.Fatalf("kind=%s cashOnly=%v err=%v", kind, cashOnly, err)
				}
			}
			for _, payload := range []map[string]any{
				{"finance_payment_id": 51, "allocations": []any{}},
				{"finance_payment_id": 51, "cash_only": true},
				{"finance_payment_id": 51, "cash_only": "true", "allocations": []any{}},
				{"finance_payment_id": 51, "cash_only": true, "allocations": []any{map[string]any{"finance_fact_id": 1, "amount": "10"}}},
			} {
				if _, err := h.NormalizeProcessDomainCommandPayload(payload); err == nil {
					t.Fatalf("accepted ambiguous cash payload: %#v", payload)
				}
			}
		})
	}
}
