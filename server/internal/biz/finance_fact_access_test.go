package biz

import (
	"reflect"
	"testing"
)

func TestFinanceFactConfirmAccessScope(t *testing.T) {
	tests := []struct {
		name        string
		permissions []string
		allowed     []string
	}{
		{name: "none", allowed: []string{}},
		{
			name:        "receivable only",
			permissions: []string{PermissionFinanceReceivableConfirm},
			allowed:     []string{FinanceFactReceivable, FinanceFactInvoice},
		},
		{
			name:        "payable only",
			permissions: []string{PermissionFinancePayableConfirm},
			allowed:     []string{FinanceFactPayable},
		},
		{
			name: "both sides unlock shared facts",
			permissions: []string{
				PermissionFinanceReceivableConfirm,
				PermissionFinancePayableConfirm,
			},
			allowed: []string{
				FinanceFactReceivable,
				FinanceFactInvoice,
				FinanceFactPayable,
				FinanceFactPayment,
				FinanceFactReconciliation,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			scope := FinanceFactConfirmAccessScope(tt.permissions)
			if got := scope.AllowedTypes(); !reflect.DeepEqual(got, tt.allowed) {
				t.Fatalf("AllowedTypes() = %v, want %v", got, tt.allowed)
			}
		})
	}
}

func TestFinanceFactReadAccessScopeKeepsSharedFactsFailClosed(t *testing.T) {
	receivable := FinanceFactReadAccessScope([]string{PermissionFinanceReceivableRead})
	if !receivable.AllowsType(FinanceFactReceivable) || !receivable.AllowsType(FinanceFactInvoice) {
		t.Fatal("receivable read must allow receivable and invoice facts")
	}
	if receivable.AllowsType(FinanceFactPayable) {
		t.Fatal("one-sided receivable read must not expose payable facts")
	}
	if !receivable.AllowsType(FinanceFactPayment) || !receivable.AllowsType(FinanceFactReconciliation) {
		t.Fatal("shared payment and reconciliation facts must remain readable from either finance side")
	}

	report := FinanceFactReadAccessScope([]string{PermissionFinanceReportRead})
	if !report.AllowsType(FinanceFactPayment) || !report.AllowsType(FinanceFactReconciliation) {
		t.Fatal("finance report read must allow shared payment and reconciliation facts")
	}
	if report.AllowsType(FinanceFactReceivable) || report.AllowsType(FinanceFactPayable) {
		t.Fatal("report read alone must not expose receivable or payable ledgers")
	}

	if FinanceFactReadAccessScope(nil).AllowsType("UNKNOWN") {
		t.Fatal("unknown finance fact types must fail closed")
	}
}
