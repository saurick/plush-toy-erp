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
			allowed:     []string{FinanceFactReceivable},
		},
		{
			name:        "payable only",
			permissions: []string{PermissionFinancePayableConfirm},
			allowed:     []string{FinanceFactPayable},
		},
		{name: "invoice only", permissions: []string{PermissionFinanceInvoiceConfirm}, allowed: []string{FinanceFactInvoice}},
		{name: "reconciliation only", permissions: []string{PermissionFinanceReconciliationConfirm}, allowed: []string{FinanceFactReconciliation}},
		{name: "payment remains read only", permissions: []string{PermissionFinanceReceivableConfirm, PermissionFinancePayableConfirm}, allowed: []string{FinanceFactReceivable, FinanceFactPayable}},
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

func TestFinanceFactReadAccessScopeKeepsFamiliesSeparated(t *testing.T) {
	receivable := FinanceFactReadAccessScope([]string{PermissionFinanceReceivableRead})
	if !receivable.AllowsType(FinanceFactReceivable) {
		t.Fatal("receivable read must allow receivable facts")
	}
	if receivable.AllowsType(FinanceFactPayable) || receivable.AllowsType(FinanceFactInvoice) || receivable.AllowsType(FinanceFactReconciliation) {
		t.Fatal("receivable read must not expose other finance families")
	}

	invoice := FinanceFactReadAccessScope([]string{PermissionFinanceInvoiceRead})
	if !invoice.AllowsType(FinanceFactInvoice) || invoice.AllowsType(FinanceFactReceivable) {
		t.Fatal("invoice read must only expose invoice facts")
	}
	reconciliation := FinanceFactReadAccessScope([]string{PermissionFinanceReconciliationRead})
	if !reconciliation.AllowsType(FinanceFactReconciliation) || reconciliation.AllowsType(FinanceFactPayment) {
		t.Fatal("reconciliation read must only expose reconciliation facts")
	}

	report := FinanceFactReadAccessScope([]string{PermissionFinanceReportRead})
	if !report.AllowsType(FinanceFactPayment) {
		t.Fatal("finance report read must allow legacy payment facts")
	}
	if report.AllowsType(FinanceFactReceivable) || report.AllowsType(FinanceFactPayable) || report.AllowsType(FinanceFactInvoice) || report.AllowsType(FinanceFactReconciliation) {
		t.Fatal("report read alone must not expose operational finance ledgers")
	}

	if FinanceFactReadAccessScope(nil).AllowsType("UNKNOWN") {
		t.Fatal("unknown finance fact types must fail closed")
	}
}
