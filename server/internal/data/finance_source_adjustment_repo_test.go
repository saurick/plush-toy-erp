package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

// Invoked by both the SQLite and real PostgreSQL source-chain tests.
func runPostedPurchaseSourceAdjustments(t *testing.T, ctx context.Context, data *Data, client *ent.Client, inv *biz.InventoryUsecase, uc *biz.OperationalFactUsecase, payable *biz.FinanceFact, receipt *biz.PurchaseReceipt, returnID, actorID int, suffix string) *biz.FinanceFact {
	t.Helper()
	// A settled cash payment must not block the warehouse return. Finance must
	// first undo the allocation; source adjustment never rewrites actual cash.
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	approver := client.AdminUser.Create().SetUsername("src-approver-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "SRC-PAY-" + suffix, Direction: biz.FinancePaymentDirectionDisbursement, Kind: biz.FinancePaymentKindSettlement, CounterpartyType: biz.FinanceCounterpartySupplier, CounterpartyID: *payable.CounterpartyID, Currency: payable.Currency, Amount: payable.Amount, AccountRef: "模拟付款账户", EvidenceRef: "模拟付款回单", IdempotencyKey: "SRC-PAY-" + suffix}, actorID)
	if err != nil {
		t.Fatal(err)
	}
	approved := approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	payment, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: approved.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: payable.ID, Amount: payable.Amount}}}, actorID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inv.PostPurchaseReturn(ctx, returnID); err != nil {
		t.Fatalf("return after posted payable: %v", err)
	}
	rows, total, err := uc.ListFinanceSourceAdjustments(ctx, biz.FinanceSourceAdjustmentFilter{FinanceFactID: payable.ID, Limit: 20})
	if err != nil || total != 1 || len(rows) != 1 || rows[0].SourceID != returnID || rows[0].Amount.String() != "10" || rows[0].BalanceDirection != biz.FinanceAdjustmentDecrease {
		t.Fatalf("pending difference=%+v total=%d err=%v", rows, total, err)
	}
	in := &biz.FinanceSourceAdjustmentCreate{SourceType: biz.PurchaseReturnSourceType, SourceID: returnID, CreditNoteNo: "SRC-" + suffix, Reason: "采购退货差额", IdempotencyKey: "SRC-" + suffix}
	if _, err := uc.CreateFinanceSourceAdjustment(ctx, in, actorID); !errors.Is(err, biz.ErrFinanceAllocationDependency) {
		t.Fatalf("paid return must request unallocation: %v", err)
	}
	payment, err = uc.ReverseFinanceAllocation(ctx, &biz.FinanceAllocationReverse{PaymentID: payment.ID, AllocationID: payment.Allocations[0].ID, ExpectedVersion: payment.Version, Reason: "退货前撤销原核销"}, actorID)
	if err != nil {
		t.Fatal(err)
	}
	credit, err := uc.CreateFinanceSourceAdjustment(ctx, in, actorID)
	if err != nil || credit.FinanceFactOutstandingAmount.String() != "40" || credit.Currency != payable.Currency {
		t.Fatalf("return credit=%+v err=%v", credit, err)
	}
	replay, err := uc.CreateFinanceSourceAdjustment(ctx, in, actorID)
	if err != nil || replay.ID != credit.ID {
		t.Fatalf("return replay=%+v err=%v", replay, err)
	}
	other := *in
	other.CreditNoteNo += "-DUP"
	other.IdempotencyKey += "-DUP"
	if _, err := uc.CreateFinanceSourceAdjustment(ctx, &other, actorID); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("duplicate source error=%v", err)
	}
	if _, err := inv.CancelPostedPurchaseReturn(ctx, returnID); !errors.Is(err, biz.ErrPurchaseReceiptFinanceDependency) {
		t.Fatalf("cancel financially adjusted return error=%v", err)
	}
	_, total, err = uc.ListFinanceSourceAdjustments(ctx, biz.FinanceSourceAdjustmentFilter{FinanceFactID: payable.ID, Limit: 20})
	if err != nil || total != 0 {
		t.Fatalf("adjusted source remains pending total=%d err=%v", total, err)
	}
	reversed, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: credit.ID, CreditNoteNo: "SRC-R-" + suffix, Reason: "撤销退货财务差额", IdempotencyKey: "SRC-R-" + suffix}, actorID)
	if err != nil || reversed.SourceID == nil || *reversed.SourceID != returnID || reversed.FinanceFactOutstandingAmount.String() != "50" {
		t.Fatalf("source credit reversal=%+v err=%v", reversed, err)
	}
	if _, err := inv.CancelPostedPurchaseReturn(ctx, returnID); err != nil {
		t.Fatalf("cancel return after reversing credit: %v", err)
	}
	payment, err = uc.GetFinancePayment(ctx, payment.ID)
	if err != nil || payment.Status != biz.FinancePaymentStatusPosted || !payment.AvailableAmount.Equal(payable.Amount) {
		t.Fatalf("source changes rewrote cash: %+v %v", payment, err)
	}
	// An increase can reopen a fully settled payable without changing its frozen amount.
	settling, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{FinanceFactID: payable.ID, CreditNoteNo: "ZERO-" + suffix, Amount: payable.Amount, Reason: "测试结清后数量差额", IdempotencyKey: "ZERO-" + suffix}, actorID)
	if err != nil {
		t.Fatal(err)
	}
	adjustment, err := inv.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, &biz.PurchaseReceiptAdjustmentFromReceiptCreate{AdjustmentNo: "INC-" + suffix, PurchaseReceiptID: receipt.ID, AdjustedAt: time.Now().UTC(), IdempotencyKey: "INC-" + suffix, Items: []biz.PurchaseReceiptAdjustmentFromReceiptItemCreate{{PurchaseReceiptItemID: receipt.Items[0].ID, AdjustType: biz.PurchaseReceiptAdjustmentQuantityIncrease, Quantity: decimal.NewFromInt(1)}}})
	if err != nil {
		t.Fatalf("create increase: %v", err)
	}
	if _, err := inv.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("post increase with settled payable: %v", err)
	}
	inc, err := uc.CreateFinanceSourceAdjustment(ctx, &biz.FinanceSourceAdjustmentCreate{SourceType: biz.PurchaseReceiptAdjustmentSourceType, SourceID: adjustment.ID, CreditNoteNo: "INC-CREDIT-" + suffix, Reason: "数量增加", IdempotencyKey: "INC-CREDIT-" + suffix}, actorID)
	if err != nil || inc.BalanceDirection != biz.FinanceAdjustmentIncrease || inc.FinanceFactOutstandingAmount.String() != "10" {
		t.Fatalf("increase=%+v err=%v", inc, err)
	}
	loaded, err := uc.GetFinanceFact(ctx, payable.ID)
	if err != nil || loaded.Status != biz.OperationalFactStatusPosted || !loaded.Amount.Equal(payable.Amount) {
		t.Fatalf("reopened payable=%+v err=%v", loaded, err)
	}
	consumed, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{FinanceFactID: payable.ID, CreditNoteNo: "CONSUMED-" + suffix, Amount: inc.Amount, Reason: "模拟调增余额被使用", IdempotencyKey: "CONSUMED-" + suffix}, actorID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: inc.ID, CreditNoteNo: "INC-R-" + suffix, Reason: "撤销数量差额", IdempotencyKey: "INC-R-" + suffix}, actorID); !errors.Is(err, biz.ErrFinanceAllocationDependency) {
		t.Fatalf("consumed increase reversed: %v", err)
	}
	if _, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: consumed.ID, CreditNoteNo: "CONSUMED-R-" + suffix, Reason: "恢复调增余额", IdempotencyKey: "CONSUMED-R-" + suffix}, actorID); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: inc.ID, CreditNoteNo: "INC-R-" + suffix, Reason: "撤销数量差额", IdempotencyKey: "INC-R-" + suffix}, actorID); err != nil {
		t.Fatal(err)
	}
	if _, err := inv.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: settling.ID, CreditNoteNo: "ZERO-R-" + suffix, Reason: "恢复原账款", IdempotencyKey: "ZERO-R-" + suffix}, actorID); err != nil {
		t.Fatal(err)
	}
	loaded, err = uc.GetFinanceFact(ctx, payable.ID)
	if err != nil || loaded.OutstandingAmount.String() != "50" {
		t.Fatalf("restored payable=%+v err=%v", loaded, err)
	}
	return loaded
}
