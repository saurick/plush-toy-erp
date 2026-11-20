package biz

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestNormalizeFinancePaymentCreateRequiresSupportedCurrency(t *testing.T) {
	tests := []struct {
		name         string
		currency     string
		wantCurrency string
		wantErr      bool
	}{
		{name: "CNY", currency: " cny ", wantCurrency: FinanceCurrencyCNY},
		{name: "USD", currency: " usd ", wantCurrency: FinanceCurrencyUSD},
		{name: "HKD", currency: "hkd", wantCurrency: FinanceCurrencyHKD},
		{name: "missing", currency: " ", wantErr: true},
		{name: "unsupported", currency: "EUR", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := FinancePaymentCreate{
				PaymentNo:        "PAY-001",
				Direction:        FinancePaymentDirectionReceipt,
				CounterpartyType: FinanceCounterpartyCustomer,
				CounterpartyID:   1,
				Amount:           decimal.NewFromInt(100),
				Currency:         tt.currency,
				AccountRef:       "银行账户",
				EvidenceRef:      "回单-001",
				IdempotencyKey:   "payment-cny-001",
			}

			normalized, hash, err := normalizeFinancePaymentCreate(input)
			if tt.wantErr {
				if !errors.Is(err, ErrBadParam) {
					t.Fatalf("expected missing or unsupported currency rejected, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("expected supported currency accepted, got %v", err)
			}
			if normalized.Currency != tt.wantCurrency || hash == "" {
				t.Fatalf("expected normalized currency %q and hash, got currency=%q hash=%q", tt.wantCurrency, normalized.Currency, hash)
			}
		})
	}
}
