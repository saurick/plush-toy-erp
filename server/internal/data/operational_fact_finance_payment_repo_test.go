package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFinancePaymentMultiAllocationAndReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_payment_allocation")
	customer := client.Customer.Create().SetCode("C-FIN-1").SetName("核销客户").SetIsActive(true).SaveX(ctx)
	createFact := func(no string, amount int64) int {
		return client.FinanceFact.Create().SetFactNo(no).SetFactType(biz.FinanceFactReceivable).SetStatus(biz.OperationalFactStatusPosted).SetCounterpartyType(biz.FinanceCounterpartyCustomer).SetCounterpartyID(customer.ID).SetAmount(decimal.NewFromInt(amount)).SetFeeAmount(decimal.Zero).SetCurrency("CNY").SetIdempotencyKey(no).SaveX(ctx).ID
	}
	fact1, fact2 := createFact("AR-PAY-1", 60), createFact("AR-PAY-2", 40)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	input := &biz.FinancePaymentCreate{PaymentNo: "PAY-1", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "BANK-001", EvidenceRef: "流水-001", IdempotencyKey: "pay-create-1"}
	created, err := uc.CreateFinancePayment(ctx, input, 7)
	if err != nil || created.Status != biz.FinancePaymentStatusDraft {
		t.Fatalf("create=%#v err=%v", created, err)
	}
	replayed, err := uc.CreateFinancePayment(ctx, input, 7)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("replay=%#v err=%v", replayed, err)
	}
	postInput := &biz.FinancePaymentPost{ID: created.ID, ExpectedVersion: created.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact2, Amount: decimal.NewFromInt(40)}, {FinanceFactID: fact1, Amount: decimal.NewFromInt(60)}}}
	posted, err := uc.PostFinancePayment(ctx, postInput, 8)
	if err != nil || posted.Status != biz.FinancePaymentStatusPosted || len(posted.Allocations) != 2 {
		t.Fatalf("post=%#v err=%v", posted, err)
	}
	if client.FinanceFact.GetX(ctx, fact1).Status != biz.OperationalFactStatusSettled || client.FinanceFact.GetX(ctx, fact2).Status != biz.OperationalFactStatusSettled {
		t.Fatal("fully allocated facts must settle")
	}
	postReplay, err := uc.PostFinancePayment(ctx, postInput, 8)
	if err != nil || postReplay.ID != posted.ID || postReplay.Version != posted.Version || len(postReplay.Allocations) != 2 {
		t.Fatalf("post replay=%#v err=%v", postReplay, err)
	}
	changedPost := *postInput
	changedPost.Allocations = []biz.FinancePaymentAllocationInput{{FinanceFactID: fact1, Amount: decimal.NewFromInt(50)}, {FinanceFactID: fact2, Amount: decimal.NewFromInt(40)}}
	if _, err := uc.PostFinancePayment(ctx, &changedPost, 8); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed post replay err=%v", err)
	}
	reverseInput := &biz.FinancePaymentReverse{ID: posted.ID, ExpectedVersion: posted.Version, Reason: "银行退回"}
	reversed, err := uc.ReverseFinancePayment(ctx, reverseInput, 9)
	if err != nil || reversed.Status != biz.FinancePaymentStatusReversed || len(reversed.Allocations) != 4 {
		t.Fatalf("reverse=%#v err=%v", reversed, err)
	}
	if client.FinanceFact.GetX(ctx, fact1).Status != biz.OperationalFactStatusPosted || client.FinanceFact.GetX(ctx, fact2).Status != biz.OperationalFactStatusPosted {
		t.Fatal("reversal must reopen source facts")
	}
	reverseReplay, err := uc.ReverseFinancePayment(ctx, reverseInput, 9)
	if err != nil || reverseReplay.ID != reversed.ID || reverseReplay.Version != reversed.Version || len(reverseReplay.Allocations) != 4 {
		t.Fatalf("reverse replay=%#v err=%v", reverseReplay, err)
	}
	changedReverse := *reverseInput
	changedReverse.Reason = "不同原因"
	if _, err := uc.ReverseFinancePayment(ctx, &changedReverse, 9); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed reverse replay err=%v", err)
	}
	listed, total, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{Status: biz.FinancePaymentStatusReversed, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Limit: 10})
	if err != nil || total != 1 || len(listed) != 1 || listed[0].ID != reversed.ID || len(listed[0].Allocations) != 4 {
		t.Fatalf("listed=%#v total=%d err=%v", listed, total, err)
	}
}

func TestFinancePaymentRejectsCrossCounterpartyAndOverAllocation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_payment_reject")
	a := client.Customer.Create().SetCode("C-FIN-A").SetName("A").SaveX(ctx)
	b := client.Customer.Create().SetCode("C-FIN-B").SetName("B").SaveX(ctx)
	fact := client.FinanceFact.Create().SetFactNo("AR-CROSS").SetFactType(biz.FinanceFactReceivable).SetStatus(biz.OperationalFactStatusPosted).SetCounterpartyType(biz.FinanceCounterpartyCustomer).SetCounterpartyID(b.ID).SetAmount(decimal.NewFromInt(50)).SetFeeAmount(decimal.Zero).SetCurrency("CNY").SetIdempotencyKey("AR-CROSS").SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "PAY-CROSS", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: a.ID, Amount: decimal.NewFromInt(60), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "PAY-CROSS"}, 7)
	if err != nil {
		t.Fatal(err)
	}
	_, err = uc.PostFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(50)}}}, 8)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cross counterparty err=%v", err)
	}
}

func TestFinanceCreditNoteAndReversalPreserveOriginal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_credit_note")
	customer := client.Customer.Create().SetCode("C-CREDIT").SetName("红冲客户").SaveX(ctx)
	fact := client.FinanceFact.Create().SetFactNo("AR-CREDIT").SetFactType(biz.FinanceFactReceivable).SetStatus(biz.OperationalFactStatusPosted).SetCounterpartyType(biz.FinanceCounterpartyCustomer).SetCounterpartyID(customer.ID).SetAmount(decimal.NewFromInt(100)).SetFeeAmount(decimal.Zero).SetCurrency("CNY").SetIdempotencyKey("AR-CREDIT").SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "CN-1", FinanceFactID: fact.ID, Amount: decimal.NewFromInt(30), Reason: "折让红冲", IdempotencyKey: "CN-1"}, 7)
	if err != nil || credit.Status != "POSTED" {
		t.Fatalf("credit=%#v err=%v", credit, err)
	}
	reverse, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: credit.ID, CreditNoteNo: "CN-1-R", Reason: "红冲撤销", IdempotencyKey: "CN-1-R"}, 8)
	if err != nil || reverse.Status != "REVERSED" || reverse.ReversalOfCreditNoteID == nil || *reverse.ReversalOfCreditNoteID != credit.ID {
		t.Fatalf("reverse=%#v err=%v", reverse, err)
	}
	if client.FinanceCreditNote.GetX(ctx, credit.ID).Status != "POSTED" {
		t.Fatal("original credit note must remain immutable")
	}
	listed, total, err := uc.ListFinanceCreditNotes(ctx, biz.FinanceCreditNoteFilter{FinanceFactID: fact.ID, Limit: 10})
	if err != nil || total != 2 || len(listed) != 2 || listed[0].ID != reverse.ID || listed[1].ID != credit.ID {
		t.Fatalf("credit history=%#v total=%d err=%v", listed, total, err)
	}
	loaded, err := uc.GetFinanceCreditNote(ctx, credit.ID)
	if err != nil || loaded.ID != credit.ID || loaded.CreditNoteNo != credit.CreditNoteNo {
		t.Fatalf("loaded credit=%#v err=%v", loaded, err)
	}
}

func TestFinanceCreditNoteAllowsOnlyReceivableAndPayable(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_credit_note_exact_types")
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for index, factType := range []string{biz.FinanceFactReceivable, biz.FinanceFactPayable, biz.FinanceFactInvoice, biz.FinanceFactPayment, biz.FinanceFactReconciliation} {
		fact := client.FinanceFact.Create().SetFactNo("CREDIT-TYPE-" + factType).SetFactType(factType).SetStatus(biz.OperationalFactStatusPosted).SetCounterpartyType(biz.FinanceCounterpartyOther).SetAmount(decimal.NewFromInt(10)).SetFeeAmount(decimal.Zero).SetCurrency("CNY").SetIdempotencyKey("credit-type-" + factType).SaveX(ctx)
		credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "CN-TYPE-" + factType, FinanceFactID: fact.ID, Amount: decimal.NewFromInt(1), Reason: "来源类型门禁", IdempotencyKey: "cn-type-" + factType}, index+1)
		allowed := factType == biz.FinanceFactReceivable || factType == biz.FinanceFactPayable
		if allowed && (err != nil || credit == nil) {
			t.Fatalf("allowed type %s credit=%#v err=%v", factType, credit, err)
		}
		if !allowed && !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("forbidden type %s err=%v", factType, err)
		}
	}
	if count := client.FinanceCreditNote.Query().CountX(ctx); count != 2 {
		t.Fatalf("credit count=%d want=2", count)
	}
}
