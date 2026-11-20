package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type financeTraceServiceRepo struct {
	financePaymentServiceRepo
	fact      *biz.FinanceFact
	factErr   error
	listCalls int
}

func (r *financeTraceServiceRepo) GetFinanceFact(_ context.Context, _ int) (*biz.FinanceFact, error) {
	return r.fact, r.factErr
}
func (r *financeTraceServiceRepo) ListFinancePayments(ctx context.Context, filter biz.FinancePaymentFilter) ([]*biz.FinancePayment, int, error) {
	r.listCalls++
	return r.financePaymentServiceRepo.ListFinancePayments(ctx, filter)
}

func TestFinanceTraceReadPermissionsAndFilters(t *testing.T) {
	for _, family := range []struct{ kind, permission string }{
		{biz.FinanceFactReceivable, biz.PermissionFinanceReceivableRead},
		{biz.FinanceFactPayable, biz.PermissionFinancePayableRead},
		{biz.FinanceFactInvoice, biz.PermissionFinanceInvoiceRead},
		{biz.FinanceFactReconciliation, biz.PermissionFinanceReconciliationRead},
	} {
		for _, method := range []string{"get_finance_fact", "list_finance_payments"} {
			for _, granted := range []bool{true, false} {
				t.Run(fmt.Sprintf("%s/%s/%t", family.kind, method, granted), func(t *testing.T) {
					repo := &financeTraceServiceRepo{fact: &biz.FinanceFact{ID: 9, FactNo: "TRACE-9", FactType: family.kind, Status: "POSTED"}}
					permissions := []string{biz.PermissionFinancePaymentRead}
					if granted {
						permissions = append(permissions, family.permission)
					} else if family.kind == biz.FinanceFactReceivable {
						permissions = append(permissions, biz.PermissionFinancePayableRead)
					} else {
						permissions = append(permissions, biz.PermissionFinanceReceivableRead)
					}
					d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, permissions...), repo)
					field := "id"
					if method == "list_finance_payments" {
						field = "finance_fact_id"
					}
					params := map[string]any{field: float64(9)}
					if method == "list_finance_payments" {
						params["limit"] = float64(1)
					}
					_, result, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), method, "trace", mustJSONRPCStruct(t, params))
					want := errcode.PermissionDenied.Code
					if granted {
						want = errcode.OK.Code
					}
					if err != nil || result == nil || result.Code != want {
						t.Fatalf("result=%+v err=%v want=%d", result, err, want)
					}
					if !granted && repo.listCalls != 0 {
						t.Fatal("denied finance association reached query")
					}
					if granted && method == "list_finance_payments" && (repo.paymentFilter.FinanceFactID != 9 || repo.paymentFilter.Limit != 1) {
						t.Fatalf("filter=%+v", repo.paymentFilter)
					}
				})
			}
		}
	}
	repo := &financeTraceServiceRepo{fact: &biz.FinanceFact{ID: 9, FactType: biz.FinanceFactReceivable}}
	d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionFinanceReceivableRead), repo)
	_, denied, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "list_finance_payments", "trace", mustJSONRPCStruct(t, map[string]any{"finance_fact_id": float64(9)}))
	if err != nil || denied.Code != errcode.PermissionDenied.Code || repo.listCalls != 0 {
		t.Fatalf("missing payment read: %v %v", denied, err)
	}
}

func TestFinanceTraceRejectsInvalidOrMissingRecord(t *testing.T) {
	repo := &financeTraceServiceRepo{}
	d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionFinancePaymentRead, biz.PermissionFinanceReceivableRead), repo)
	for _, method := range []string{"get_finance_fact", "list_finance_payments"} {
		field := "id"
		if method == "list_finance_payments" {
			field = "finance_fact_id"
		}
		for _, value := range []any{nil, float64(0), float64(-1), 1.5, "9", 9007199254740992.0} {
			_, result, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), method, "trace", mustJSONRPCStruct(t, map[string]any{field: value}))
			if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("%s %v: %v %v", method, value, result, err)
			}
		}
	}
	repo.factErr = biz.ErrBadParam
	_, result, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "get_finance_fact", "trace", mustJSONRPCStruct(t, map[string]any{"id": float64(9)}))
	if err != nil || result.Code == errcode.OK.Code {
		t.Fatalf("missing record: %v %v", result, err)
	}
}

func TestFinanceTraceDocumentedExample(t *testing.T) {
	raw, err := os.ReadFile("../../cmd/public-contracts/testdata/rpc_examples.json")
	if err != nil {
		t.Fatal(err)
	}
	var examples map[string]documentedRPCExample
	if err := json.Unmarshal(raw, &examples); err != nil {
		t.Fatal(err)
	}
	example := examples["operational_fact.get_finance_fact"]
	repo := &financePaymentServiceRepo{}
	d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionFinanceReceivableRead), repo)
	_, result, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "get_finance_fact", "trace-example", mustJSONRPCStruct(t, example.Params))
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("%v %v", result, err)
	}
	if err := documentedRPCProjection(example.Data, result.Data.AsMap(), "result.data"); err != nil {
		t.Fatal(err)
	}
}
