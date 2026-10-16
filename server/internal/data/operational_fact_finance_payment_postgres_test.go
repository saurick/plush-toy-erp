package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/financeallocation"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactRepoFinancePaymentPostgresAllocationRollbackAndRecovery(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, client := openInventoryPostgresTestData(t)
	suffix := postgresTestSuffix()
	customer := client.Customer.Create().SetCode("PG-PAY-" + suffix).SetName("核销事务客户").SetIsActive(true).SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("pg-pay-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("pg-pay-approve-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	first := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "PG-AR-1-"+suffix, 60)
	second := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "PG-AR-2-"+suffix, 40)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{
		PaymentNo: "PG-PAY-" + suffix, Direction: biz.FinancePaymentDirectionReceipt,
		CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID,
		Amount: decimal.NewFromInt(110), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "pg-pay-" + suffix,
	}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	payment = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	input := &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version, Allocations: []biz.FinancePaymentAllocationInput{
		{FinanceFactID: second.ID, Amount: decimal.NewFromInt(50)},
		{FinanceFactID: first.ID, Amount: decimal.NewFromInt(60)},
	}}
	// The first fact is settled before the second allocation exceeds its outstanding amount.
	if _, err := repo.postFinancePayment(ctx, input, actor.ID, nil, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("over-allocation error=%v", err)
	}
	if count := client.FinanceAllocation.Query().Where(financeallocation.PaymentID(payment.ID)).CountX(ctx); count != 0 {
		t.Fatalf("failed post left %d allocations", count)
	}
	for _, fact := range []*biz.FinanceFact{first, second} {
		row := client.FinanceFact.GetX(ctx, fact.ID)
		if row.Status != fact.Status || row.Version != fact.Version || row.SettledAt != nil || row.SettledBy != nil {
			t.Fatalf("failed post changed source fact: %+v", row)
		}
	}
	row := client.FinancePayment.GetX(ctx, payment.ID)
	if row.Status != payment.Status || row.Version != payment.Version || row.PostedAt != nil || row.PostedBy != nil {
		t.Fatalf("failed post changed payment: %+v", row)
	}
	// Reallocate the same payment across an additional valid receivable; the failed intent consumed no version or key.
	third := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "PG-AR-3-"+suffix, 10)
	input.Allocations = []biz.FinancePaymentAllocationInput{{FinanceFactID: first.ID, Amount: first.Amount}, {FinanceFactID: second.ID, Amount: second.Amount}, {FinanceFactID: third.ID, Amount: third.Amount}}
	posted, err := repo.postFinancePayment(ctx, input, actor.ID, nil, nil)
	if err != nil || posted.Status != biz.FinancePaymentStatusPosted || posted.Version != payment.Version+1 || len(posted.Allocations) != 3 {
		t.Fatalf("retry payment=%+v err=%v", posted, err)
	}
	for _, fact := range []*biz.FinanceFact{first, second, third} {
		if got := client.FinanceFact.GetX(ctx, fact.ID); got.Status != biz.OperationalFactStatusSettled || got.SettledAt == nil || got.SettledBy == nil || *got.SettledBy != actor.ID {
			t.Fatalf("successful retry did not settle fact: %+v", got)
		}
	}
	replay, err := repo.postFinancePayment(ctx, input, actor.ID, nil, nil)
	if err != nil || replay.Version != posted.Version || len(replay.Allocations) != 3 {
		t.Fatalf("post replay=%+v err=%v", replay, err)
	}
	reverse := &biz.FinancePaymentReverse{ID: posted.ID, ExpectedVersion: posted.Version, Reason: "银行退回"}
	reversed, err := uc.ReverseFinancePayment(ctx, reverse, approver.ID)
	if err != nil || reversed.Status != biz.FinancePaymentStatusReversed || reversed.Version != posted.Version+1 || len(reversed.Allocations) != 6 {
		t.Fatalf("reverse=%+v err=%v", reversed, err)
	}
	for _, fact := range []*biz.FinanceFact{first, second, third} {
		if got := client.FinanceFact.GetX(ctx, fact.ID); got.Status != biz.OperationalFactStatusPosted || got.SettledAt != nil || got.SettledBy != nil {
			t.Fatalf("reversal did not reopen fact: %+v", got)
		}
	}
	replay, err = uc.ReverseFinancePayment(ctx, reverse, approver.ID)
	if err != nil || replay.Version != reversed.Version || len(replay.Allocations) != 6 {
		t.Fatalf("reverse replay=%+v err=%v", replay, err)
	}
	reverse.Reason = "不同冲正意图"
	if _, err := uc.ReverseFinancePayment(ctx, reverse, approver.ID); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed reversal error=%v", err)
	}
	if count := client.FinanceAllocation.Query().Where(financeallocation.PaymentID(payment.ID)).CountX(ctx); count != 6 {
		t.Fatalf("replay changed allocation evidence: %d", count)
	}
}

func TestOperationalFactRepoFinancePaymentPostgresConcurrentOutstanding(t *testing.T) {
	for _, factType := range []string{biz.FinanceFactReceivable, biz.FinanceFactPayable} {
		t.Run(factType, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			data, client := openInventoryPostgresTestData(t)
			fact := createPostedFinanceFactForCreditType(t, ctx, data, client, factType)
			suffix := postgresTestSuffix()
			actor := client.AdminUser.Create().SetUsername("pg-contention-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
			approver := client.AdminUser.Create().SetUsername("pg-contention-approve-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
			repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
			uc := biz.NewOperationalFactUsecase(repo)
			direction, partyType, partyID := biz.FinancePaymentDirectionReceipt, biz.FinanceCounterpartyCustomer, fact.CounterpartyID
			if factType == biz.FinanceFactPayable {
				direction, partyType, partyID = biz.FinancePaymentDirectionDisbursement, biz.FinanceCounterpartySupplier, fact.CounterpartyID
			}
			if partyID == nil {
				t.Fatal("source fact has no counterparty")
			}
			payments := make([]*biz.FinancePayment, 2)
			for i := range payments {
				key := fmt.Sprintf("PG-CONCURRENT-%s-%d", suffix, i)
				payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: key, Direction: direction,
					CounterpartyType: partyType, CounterpartyID: *partyID, Amount: decimal.NewFromInt(6), Currency: "CNY", AccountRef: "BANK", EvidenceRef: key, IdempotencyKey: key}, actor.ID)
				if err != nil {
					t.Fatal(err)
				}
				payments[i] = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
			}
			holder, err := repo.inv.beginInventoryDBTx(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer rollbackInventoryDBTx(ctx, holder, repo.log)
			if err := lockOperationalFactRow(ctx, holder, "finance_facts", fact.ID, biz.ErrBadParam); err != nil {
				t.Fatal(err)
			}
			done := make(chan error, 2)
			for _, payment := range payments {
				go func() {
					_, err := repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version,
						Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(6)}}}, actor.ID, nil, nil)
					done <- err
				}()
			}
			waitInventoryPostgresBlocked(t, ctx, data.sqldb, inventoryPostgresTxPID(t, ctx, holder), 2)
			if err := holder.sqlTx.Commit(); err != nil {
				t.Fatal(err)
			}
			holder.sqlTx = nil
			passed, rejected := 0, 0
			for range payments {
				switch err := <-done; {
				case err == nil:
					passed++
				case errors.Is(err, biz.ErrBadParam):
					rejected++
				default:
					t.Fatalf("concurrent post error=%v", err)
				}
			}
			if passed != 1 || rejected != 1 {
				t.Fatalf("success=%d rejected=%d, want exactly one of each", passed, rejected)
			}
			allocations := client.FinanceAllocation.Query().Where(financeallocation.FinanceFactID(fact.ID)).AllX(ctx)
			if len(allocations) != 1 || !allocations[0].Amount.Equal(decimal.NewFromInt(6)) || client.FinanceFact.GetX(ctx, fact.ID).Status != biz.OperationalFactStatusPosted {
				t.Fatalf("concurrent allocations=%+v", allocations)
			}
			for _, payment := range payments {
				row := client.FinancePayment.GetX(ctx, payment.ID)
				if payment.ID == allocations[0].PaymentID {
					if row.Status != biz.FinancePaymentStatusPosted || row.Version != payment.Version+1 {
						t.Fatalf("winner=%+v", row)
					}
				} else if row.Status != payment.Status || row.Version != payment.Version || row.PostedAt != nil {
					t.Fatalf("loser changed despite rollback: %+v", row)
				}
			}
		})
	}
}
