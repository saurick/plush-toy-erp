package service

import (
	"context"
	"errors"
	"google.golang.org/protobuf/types/known/structpb"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

func TestRequestedBusinessStatusCountsContract(t *testing.T) {
	for _, test := range []struct {
		name    string
		value   any
		calls   int
		invalid bool
	}{
		{"omitted", nil, 0, false}, {"false", false, 0, false}, {"true", true, 1, false}, {"string", "true", 0, true}, {"number", 1, 0, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			counts, err := requestedBusinessStatusCounts(map[string]any{"include_status_counts": test.value}, func() (map[string]int, error) { calls++; return map[string]int{"DRAFT": 42, "POSTED": 3}, nil })
			if calls != test.calls || errors.Is(err, biz.ErrBadParam) != test.invalid {
				t.Fatalf("counts=%v err=%v calls=%d", counts, err, calls)
			}
			if test.calls == 1 {
				if _, err := structpb.NewStruct(map[string]any{"status_counts": counts}); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
	sentinel := errors.New("unavailable")
	if _, err := requestedBusinessStatusCounts(map[string]any{"include_status_counts": true}, func() (map[string]int, error) { return nil, sentinel }); !errors.Is(err, sentinel) {
		t.Fatal(err)
	}
}

type countedFinanceServiceRepo struct {
	financePaymentServiceRepo
	countCalls int
	scope      biz.FinanceFactAccessScope
}

func (r *countedFinanceServiceRepo) CountFinancePaymentsByStatus(_ context.Context, f biz.FinancePaymentFilter) (map[string]int, error) {
	r.countCalls++
	r.paymentFilter = f
	return map[string]int{"DRAFT": 42, "POSTED": 3}, nil
}
func (r *countedFinanceServiceRepo) CountFinanceFactsByStatusForAccess(_ context.Context, _ biz.OperationalFactFilter, scope biz.FinanceFactAccessScope) (map[string]int, error) {
	r.countCalls++
	r.scope = scope
	return map[string]int{"DRAFT": 2}, nil
}

func TestBusinessStatusCountsRPCPermissionBoundary(t *testing.T) {
	for _, allowed := range []bool{false, true} {
		t.Run(map[bool]string{false: "denied", true: "allowed"}[allowed], func(t *testing.T) {
			repo := &countedFinanceServiceRepo{}
			permissions := []string{}
			if allowed {
				permissions = append(permissions, biz.PermissionFinancePaymentRead, biz.PermissionFinanceReceivableRead)
			}
			d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, permissions...), repo)
			_, result, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "list_finance_payments", "counts", mustJSONRPCStruct(t, map[string]any{"include_status_counts": true, "status": "DRAFT", "offset": float64(20), "limit": float64(1)}))
			if err != nil || result == nil {
				t.Fatalf("result=%#v err=%v", result, err)
			}
			if !allowed {
				if result.Code == errcode.OK.Code || repo.countCalls != 0 {
					t.Fatal("denied requests must not read counts")
				}
				return
			}
			if result.Code != errcode.OK.Code || repo.countCalls != 1 || repo.paymentFilter.Offset != 20 {
				t.Fatalf("result=%#v calls=%d", result, repo.countCalls)
			}
			if jsonRPCInt(t, jsonRPCNestedMap(t, result, "status_counts"), "DRAFT") != 42 {
				t.Fatal("counts were truncated to the listed page")
			}
			_, result, err = d.handleOperationalFact(workflowJSONRPCAdminContext(), "list_finance_facts", "counts", mustJSONRPCStruct(t, map[string]any{"include_status_counts": true}))
			if err != nil || result.Code != errcode.OK.Code || !repo.scope.Receivable || repo.scope.Payable || repo.scope.Invoice || repo.scope.Reconciliation {
				t.Fatalf("scope=%#v result=%#v err=%v", repo.scope, result, err)
			}
		})
	}
}

func TestBusinessStatusCountsOmittedUnlessRequested(t *testing.T) {
	fields := withBusinessStatusCounts(map[string]any{"total": 2}, nil)
	if _, exists := fields["status_counts"]; exists {
		t.Fatal("unrequested counts must not imply an empty result")
	}
	fields = withBusinessStatusCounts(fields, map[string]any{})
	if _, exists := fields["status_counts"]; !exists {
		t.Fatal("a requested empty result must have known zero counts")
	}
}
