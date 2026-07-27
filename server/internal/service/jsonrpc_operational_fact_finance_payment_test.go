package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
)

type financePaymentServiceRepo struct {
	stubBusinessDashboardOperationalFactRepo
	item *biz.FinancePayment
}

func (r *financePaymentServiceRepo) CreateFinancePayment(_ context.Context, in *biz.FinancePaymentCreate, actorID int, _ string) (*biz.FinancePayment, error) {
	now := time.Now()
	r.item = &biz.FinancePayment{ID: 31, PaymentNo: in.PaymentNo, Direction: in.Direction, Status: biz.FinancePaymentStatusDraft, CounterpartyType: in.CounterpartyType, CounterpartyID: in.CounterpartyID, Amount: in.Amount, Currency: in.Currency, AccountRef: in.AccountRef, EvidenceRef: in.EvidenceRef, Version: 1, OccurredAt: now, CreatedBy: actorID, CreatedAt: now, UpdatedAt: now}
	return r.item, nil
}
func (r *financePaymentServiceRepo) PostFinancePayment(_ context.Context, _ *biz.FinancePaymentPost, _ int) (*biz.FinancePayment, error) {
	return r.item, nil
}
func (r *financePaymentServiceRepo) CancelFinancePayment(_ context.Context, in *biz.FinancePaymentTransition, actorID int) (*biz.FinancePayment, error) {
	now := time.Now()
	r.item.Status = biz.FinancePaymentStatusCancelled
	r.item.Version = in.ExpectedVersion + 1
	r.item.CancelledAt = &now
	r.item.CancelledBy = &actorID
	r.item.CancelReason = &in.Reason
	return r.item, nil
}
func (r *financePaymentServiceRepo) ReverseFinancePayment(_ context.Context, _ *biz.FinancePaymentReverse, _ int) (*biz.FinancePayment, error) {
	return r.item, nil
}
func (r *financePaymentServiceRepo) CreateFinanceCreditNote(_ context.Context, _ *biz.FinanceCreditNoteCreate, _ int, _ string) (*biz.FinanceCreditNote, error) {
	return &biz.FinanceCreditNote{ID: 1}, nil
}
func (r *financePaymentServiceRepo) ReverseFinanceCreditNote(_ context.Context, _ *biz.FinanceCreditNoteReverse, _ int, _ string) (*biz.FinanceCreditNote, error) {
	return &biz.FinanceCreditNote{ID: 2}, nil
}
func (r *financePaymentServiceRepo) GetFinancePayment(_ context.Context, _ int) (*biz.FinancePayment, error) {
	return r.item, nil
}
func (r *financePaymentServiceRepo) ListFinancePayments(_ context.Context, _ biz.FinancePaymentFilter) ([]*biz.FinancePayment, int, error) {
	if r.item == nil {
		return nil, 0, nil
	}
	return []*biz.FinancePayment{r.item}, 1, nil
}
func (r *financePaymentServiceRepo) GetFinanceCreditNote(_ context.Context, id int) (*biz.FinanceCreditNote, error) {
	return &biz.FinanceCreditNote{ID: id, CreditNoteNo: "CN-RPC-1", Status: "POSTED", Amount: decimal.NewFromInt(10), Currency: "CNY"}, nil
}
func (r *financePaymentServiceRepo) ListFinanceCreditNotes(_ context.Context, _ biz.FinanceCreditNoteFilter) ([]*biz.FinanceCreditNote, int, error) {
	return []*biz.FinanceCreditNote{{ID: 1, CreditNoteNo: "CN-RPC-1", Status: "POSTED", Amount: decimal.NewFromInt(10), Currency: "CNY"}}, 1, nil
}
func (r *financePaymentServiceRepo) GetFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	now := time.Now()
	return &biz.FinanceFact{
		ID:               id,
		FactNo:           "REC-RPC-1",
		FactType:         biz.FinanceFactReceivable,
		Status:           biz.OperationalFactStatusPosted,
		Version:          1,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(20),
		Currency:         biz.FinanceCurrencyCNY,
		OccurredAt:       now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}
func (r *financePaymentServiceRepo) ListFinanceFactsForAccess(_ context.Context, _ biz.OperationalFactFilter, scope biz.FinanceFactAccessScope) ([]*biz.FinanceFact, int, error) {
	if !scope.AllowsType(biz.FinanceFactReceivable) {
		return nil, 0, biz.ErrBadParam
	}
	item, err := r.GetFinanceFact(context.Background(), 9)
	if err != nil {
		return nil, 0, err
	}
	return []*biz.FinanceFact{item}, 1, nil
}

func TestOperationalFactFinancePaymentCreateAndListContract(t *testing.T) {
	repo := &financePaymentServiceRepo{}
	admin := workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionFinancePaymentRead, biz.PermissionFinancePaymentCreate, biz.PermissionFinancePaymentReverse)
	d := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
	ctx := workflowJSONRPCAdminContext()
	_, created, err := d.handleOperationalFact(ctx, "create_finance_payment", "create", mustJSONRPCStruct(t, map[string]any{
		"payment_no": "PAY-RPC-1", "direction": biz.FinancePaymentDirectionReceipt,
		"counterparty_type": biz.FinanceCounterpartyCustomer, "counterparty_id": float64(7),
		"amount": "88.50", "currency": "CNY", "account_ref": "BANK-01", "evidence_ref": "FLOW-01", "idempotency_key": "pay-rpc-1",
	}))
	if err != nil || created == nil || created.Code != errcode.OK.Code {
		t.Fatalf("created=%#v err=%v", created, err)
	}
	if amount := jsonRPCNestedMap(t, created, "payment")["amount"]; amount != decimal.RequireFromString("88.50").String() {
		t.Fatalf("amount=%v", amount)
	}
	_, listed, err := d.handleOperationalFact(ctx, "list_finance_payments", "list", mustJSONRPCStruct(t, map[string]any{"status": biz.FinancePaymentStatusDraft, "limit": float64(10), "offset": float64(0)}))
	if err != nil || listed == nil || listed.Code != errcode.OK.Code || jsonRPCInt(t, listed.Data.AsMap(), "total") != 1 {
		t.Fatalf("listed=%#v err=%v", listed, err)
	}
	_, cancelled, err := d.handleOperationalFact(ctx, "cancel_finance_payment", "cancel", mustJSONRPCStruct(t, map[string]any{
		"id": float64(31), "expected_version": float64(1), "reason": "原付款信息有误",
	}))
	if err != nil || cancelled == nil || cancelled.Code != errcode.OK.Code {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	cancelledPayment := jsonRPCNestedMap(t, cancelled, "payment")
	if cancelledPayment["status"] != biz.FinancePaymentStatusCancelled ||
		jsonRPCInt(t, cancelledPayment, "version") != 2 ||
		jsonRPCInt(t, cancelledPayment, "cancelled_by") != 7 ||
		cancelledPayment["cancel_reason"] != "原付款信息有误" {
		t.Fatalf("cancel receipt=%#v", cancelledPayment)
	}
	_, listedCredits, err := d.handleOperationalFact(ctx, "list_finance_credit_notes", "list-credit", mustJSONRPCStruct(t, map[string]any{"status": "POSTED", "limit": float64(10), "offset": float64(0)}))
	if err != nil || listedCredits == nil || listedCredits.Code != errcode.OK.Code || jsonRPCInt(t, listedCredits.Data.AsMap(), "total") != 1 {
		t.Fatalf("listed credits=%#v err=%v", listedCredits, err)
	}
	creditParams := mustJSONRPCStruct(t, map[string]any{
		"credit_note_no": "CN-RPC-DENIED", "finance_fact_id": float64(9), "amount": "10", "reason": "退货红冲", "idempotency_key": "cn-rpc-denied",
	})
	_, deniedCredit, err := d.handleOperationalFact(ctx, "create_finance_credit_note", "denied-credit", creditParams)
	if err != nil || deniedCredit == nil || deniedCredit.Code != errcode.PermissionDenied.Code {
		t.Fatalf("credit note without dedicated permission=%#v err=%v", deniedCredit, err)
	}
	creditAdmin := workflowJSONRPCAdmin(
		[]string{biz.FinanceRoleKey},
		biz.PermissionFinanceCreditNoteCreate,
		biz.PermissionFinanceReceivableRead,
	)
	creditDispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, creditAdmin, repo)
	_, allowedCredit, err := creditDispatcher.handleOperationalFact(ctx, "create_finance_credit_note", "allowed-credit", creditParams)
	if err != nil || allowedCredit == nil || allowedCredit.Code != errcode.OK.Code {
		t.Fatalf("credit note with dedicated permission=%#v err=%v", allowedCredit, err)
	}
	_, invalid, err := d.handleOperationalFact(ctx, "reverse_finance_payment", "invalid", mustJSONRPCStruct(t, map[string]any{"id": float64(31), "expected_version": float64(1), "reason": "冲正", "unexpected": true}))
	if err != nil || invalid == nil || invalid.Code != errcode.InvalidParam.Code {
		t.Fatalf("invalid=%#v err=%v", invalid, err)
	}
}
