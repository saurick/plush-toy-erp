package biz

import (
	"context"
	"strings"
)

// FinanceFactAccessScope is the server-side data and mutation boundary for the
// finance fact families. PAYMENT remains read-only under report access until a
// verified payment source contract exists; invoice and reconciliation actions
// use their own permissions instead of inheriting receivable/payable access.
type FinanceFactAccessScope struct {
	Receivable     bool
	Payable        bool
	Invoice        bool
	Reconciliation bool
	Shared         bool
}

func FinanceFactReadAccessScope(permissionKeys []string) FinanceFactAccessScope {
	permissionSet := PermissionKeySet(permissionKeys)
	receivable := PermissionSetHasAny(permissionSet, PermissionFinanceReceivableRead)
	payable := PermissionSetHasAny(permissionSet, PermissionFinancePayableRead)
	invoice := PermissionSetHasAny(permissionSet, PermissionFinanceInvoiceRead)
	reconciliation := PermissionSetHasAny(permissionSet, PermissionFinanceReconciliationRead)
	report := PermissionSetHasAny(permissionSet, PermissionFinanceReportRead)
	return FinanceFactAccessScope{
		Receivable:     receivable,
		Payable:        payable,
		Invoice:        invoice,
		Reconciliation: reconciliation,
		Shared:         report,
	}
}

func FinanceFactConfirmAccessScope(permissionKeys []string) FinanceFactAccessScope {
	permissionSet := PermissionKeySet(permissionKeys)
	receivable := PermissionSetHasAny(permissionSet, PermissionFinanceReceivableConfirm)
	payable := PermissionSetHasAny(permissionSet, PermissionFinancePayableConfirm)
	invoice := PermissionSetHasAny(permissionSet, PermissionFinanceInvoiceConfirm)
	reconciliation := PermissionSetHasAny(permissionSet, PermissionFinanceReconciliationConfirm)
	return FinanceFactAccessScope{
		Receivable:     receivable,
		Payable:        payable,
		Invoice:        invoice,
		Reconciliation: reconciliation,
	}
}

func (scope FinanceFactAccessScope) Empty() bool {
	return !scope.Receivable && !scope.Payable && !scope.Invoice && !scope.Reconciliation && !scope.Shared
}

func (scope FinanceFactAccessScope) AllowsType(factType string) bool {
	switch strings.ToUpper(strings.TrimSpace(factType)) {
	case FinanceFactReceivable:
		return scope.Receivable
	case FinanceFactPayable:
		return scope.Payable
	case FinanceFactInvoice:
		return scope.Invoice
	case FinanceFactPayment:
		return scope.Shared
	case FinanceFactReconciliation:
		return scope.Reconciliation
	default:
		return false
	}
}

func (scope FinanceFactAccessScope) AllowedTypes() []string {
	out := make([]string, 0, 5)
	if scope.Receivable {
		out = append(out, FinanceFactReceivable)
	}
	if scope.Payable {
		out = append(out, FinanceFactPayable)
	}
	if scope.Invoice {
		out = append(out, FinanceFactInvoice)
	}
	if scope.Shared {
		out = append(out, FinanceFactPayment)
	}
	if scope.Reconciliation {
		out = append(out, FinanceFactReconciliation)
	}
	return out
}

// FinanceFactAccessRepo keeps exact reads and access-scoped list queries out
// of the broad operational-fact interface used by trusted domain commands.
type FinanceFactAccessRepo interface {
	GetFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	ListFinanceFactsForAccess(ctx context.Context, filter OperationalFactFilter, scope FinanceFactAccessScope) ([]*FinanceFact, int, error)
}

func (uc *OperationalFactUsecase) GetFinanceFact(ctx context.Context, id int) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinanceFactAccessRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.GetFinanceFact(ctx, id)
}

func (uc *OperationalFactUsecase) ListFinanceFactsForAccess(
	ctx context.Context,
	filter OperationalFactFilter,
	scope FinanceFactAccessScope,
) ([]*FinanceFact, int, error) {
	if uc == nil || uc.repo == nil || scope.Empty() {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeFinanceFactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	repo, ok := uc.repo.(FinanceFactAccessRepo)
	if !ok {
		return nil, 0, ErrBadParam
	}
	return repo.ListFinanceFactsForAccess(ctx, normalized, scope)
}
