package service

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/errcode"
)

type financeReportingServiceRepo struct {
	financePaymentServiceRepo
	statementQuery                                    biz.FinanceStatementQuery
	statementReads, adjustmentReads, adjustmentWrites int
}

func (r *financeReportingServiceRepo) GetFinanceStatement(_ context.Context, q biz.FinanceStatementQuery) (*biz.FinanceStatement, error) {
	r.statementQuery = q
	r.statementReads++
	return &biz.FinanceStatement{Currency: q.Currency, CounterpartyType: q.CounterpartyType, CounterpartyID: q.CounterpartyID, DateFrom: q.DateFrom, DateTo: q.DateTo, SnapshotAt: q.SnapshotAt, Entries: []*biz.FinanceStatementEntry{}}, nil
}
func (r *financeReportingServiceRepo) ListFinanceSourceAdjustments(context.Context, biz.FinanceSourceAdjustmentFilter) ([]*biz.FinanceSourceAdjustment, int, error) {
	r.adjustmentReads++
	return []*biz.FinanceSourceAdjustment{{SourceType: biz.PurchaseReturnSourceType, SourceID: 4, SourceNo: "RET-SIM-4", FinanceFactID: 9, FinanceFactNo: "AP-SIM-9", CounterpartyID: 2, CounterpartyName: "模拟供应商", Currency: "CNY", BalanceDirection: biz.FinanceAdjustmentDecrease, Amount: decimal.NewFromInt(10), OutstandingAmount: decimal.NewFromInt(50), OccurredAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)}}, 1, nil
}
func (r *financeReportingServiceRepo) CreateFinanceSourceAdjustment(_ context.Context, in *biz.FinanceSourceAdjustmentCreate, _ int, _ string) (*biz.FinanceCreditNote, error) {
	r.adjustmentWrites++
	return &biz.FinanceCreditNote{ID: 1, CreditNoteNo: in.CreditNoteNo, FinanceFactID: 9, SourceType: &in.SourceType, SourceID: &in.SourceID, BalanceDirection: biz.FinanceAdjustmentDecrease, Status: "POSTED", Currency: "CNY", Amount: decimal.NewFromInt(10), Reason: in.Reason}, nil
}
func (r *financeReportingServiceRepo) FinancePaymentTotals(context.Context, biz.FinancePaymentFilter) ([]*biz.FinancePaymentTotal, error) {
	return []*biz.FinancePaymentTotal{{Currency: "CNY", Direction: "RECEIPT", Status: "POSTED", Amount: decimal.NewFromInt(10), Count: 1}}, nil
}

func TestFinanceStatementPermissionsAndContract(t *testing.T) {
	for _, party := range []string{"CUSTOMER", "SUPPLIER"} {
		permission := biz.PermissionFinanceReceivableRead
		if party == "SUPPLIER" {
			permission = biz.PermissionFinancePayableRead
		}
		for _, allowed := range []bool{false, true} {
			repo := &financeReportingServiceRepo{}
			permissions := []string{biz.PermissionFinancePaymentRead}
			if allowed {
				permissions = append(permissions, permission)
			}
			d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, permissions...), repo)
			params := map[string]any{"counterparty_type": party, "counterparty_id": float64(2), "currency": "CNY", "date_from": "2026-09-01", "date_to": "2026-09-30", "limit": float64(20)}
			_, res, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "get_finance_statement", "statement", mustJSONRPCStruct(t, params))
			want := errcode.PermissionDenied.Code
			if allowed {
				want = errcode.OK.Code
			}
			if err != nil || res.Code != want || (repo.statementReads > 0) != allowed {
				t.Fatalf("party=%s allowed=%v result=%+v err=%v", party, allowed, res, err)
			}
			if allowed {
				if res.Data == nil {
					t.Fatal("statement success has no serialized data")
				}
				statement := res.Data.AsMap()["statement"].(map[string]any)
				if statement["counterparty_type"] != party || statement["opening"] != "0" {
					t.Fatalf("statement serialization: %+v", statement)
				}
				params["date_to"] = "2026-08-31"
				_, bad, _ := d.handleOperationalFact(workflowJSONRPCAdminContext(), "get_finance_statement", "bad-date", mustJSONRPCStruct(t, params))
				if bad.Code != errcode.InvalidParam.Code || repo.statementReads != 1 {
					t.Fatalf("invalid range reached repo: %+v", bad)
				}
			}
		}
	}
}

func TestFinanceSourceAdjustmentPermissionsAndContract(t *testing.T) {
	all := []string{biz.PermissionFinancePaymentRead, biz.PermissionFinanceCreditNoteCreate, biz.PermissionFinancePayableRead, biz.PermissionPurchaseReceiptRead, biz.PermissionPurchaseReturnRead, biz.PermissionPurchaseReceiptAdjustmentRead}
	for missing := -1; missing < len(all); missing++ {
		permissions := []string{}
		for i, p := range all {
			if i != missing {
				permissions = append(permissions, p)
			}
		}
		repo := &financeReportingServiceRepo{}
		d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, permissions...), repo)
		_, listed, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "list_finance_source_adjustments", "list", mustJSONRPCStruct(t, map[string]any{"limit": float64(20)}))
		readAllowed := missing == -1 || missing == 1
		if err != nil || (listed.Code == errcode.OK.Code) != readAllowed || (repo.adjustmentReads > 0) != readAllowed {
			t.Fatalf("missing=%d list=%+v err=%v", missing, listed, err)
		}
		if readAllowed {
			if listed.Data == nil {
				t.Fatal("source adjustments success has no serialized data")
			}
			row := listed.Data.AsMap()["adjustments"].([]any)[0].(map[string]any)
			if row["amount"] != "10" || row["source_no"] != "RET-SIM-4" {
				t.Fatalf("adjustment serialization: %+v", row)
			}
		}
		params := map[string]any{"source_type": "PURCHASE_RETURN", "source_id": float64(4), "credit_note_no": "ADJ-SIM-4", "reason": "采购退货差额", "idempotency_key": "source-adjustment-sim-4"}
		_, created, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "create_finance_source_adjustment", "create", mustJSONRPCStruct(t, params))
		writeAllowed := missing == -1 || missing == 0
		if err != nil || (created.Code == errcode.OK.Code) != writeAllowed || (repo.adjustmentWrites > 0) != writeAllowed {
			t.Fatalf("missing=%d create=%+v err=%v", missing, created, err)
		}
		if writeAllowed {
			params["amount"] = "1"
			_, bad, _ := d.handleOperationalFact(workflowJSONRPCAdminContext(), "create_finance_source_adjustment", "manual-amount", mustJSONRPCStruct(t, params))
			if bad.Code != errcode.InvalidParam.Code || repo.adjustmentWrites != 1 {
				t.Fatalf("manual source amount accepted: %+v", bad)
			}
		}
	}
}

func TestFinancePaymentListTotalsSerialization(t *testing.T) {
	repo := &financeReportingServiceRepo{}
	d := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionFinancePaymentRead), repo)
	_, result, err := d.handleOperationalFact(workflowJSONRPCAdminContext(), "list_finance_payments", "totals", mustJSONRPCStruct(t, map[string]any{"include_totals": true}))
	if err != nil || result.Code != errcode.OK.Code || result.Data == nil {
		t.Fatalf("totals response=%+v err=%v", result, err)
	}
	data := result.Data.AsMap()
	if _, ok := data["payments"].([]any); !ok {
		t.Fatalf("payment rows missing: %+v", data)
	}
	row := data["totals"].([]any)[0].(map[string]any)
	if row["amount"] != "10" || row["currency"] != "CNY" || row["count"] != float64(1) {
		t.Fatalf("total serialization=%+v", row)
	}
}
