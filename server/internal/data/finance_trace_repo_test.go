package data

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financeallocation"
)

func TestFinanceTraceRelationshipSQLite(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "finance_trace")
	runFinanceTraceRelationship(t, data, client, "SQLITE")
}
func TestOperationalFactRepoFinanceTracePostgres(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	runFinanceTraceRelationship(t, data, client, postgresTestSuffix())
}
func runFinanceTraceRelationship(t *testing.T, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	ctx := context.Background()
	customer := client.Customer.Create().SetCode("TRACE-" + suffix).SetName("模拟财务关联客户").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("TRACE-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	checker := client.AdminUser.Create().SetUsername("TRACE-C-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "TRACE-AR-"+suffix, 100)
	other := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "TRACE-OTHER-"+suffix, 100)
	at := time.Date(2026, 10, 1, 1, 0, 0, 0, time.UTC)
	payment := func(no string, amount int64, id int) *ent.FinancePayment {
		row := client.FinancePayment.Create().SetPaymentNo(no + suffix).SetDirection("RECEIPT").SetCounterpartyType("CUSTOMER").SetCounterpartyID(customer.ID).SetAmount(decimal.NewFromInt(amount)).SetCurrency("CNY").SetStatus("POSTED").SetAccountRef("模拟账户").SetEvidenceRef(no).SetIdempotencyKey(no + suffix).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SetCreatedBy(actor.ID).SetApprovedBy(checker.ID).SetApprovedAt(at).SetPostedBy(actor.ID).SetPostedAt(at).SetOccurredAt(at).SaveX(ctx)
		client.FinanceAllocation.Create().SetPaymentID(row.ID).SetFinanceFactID(id).SetAmount(decimal.NewFromInt(amount)).SetCurrency("CNY").SetStatus("POSTED").SetIdempotencyKey(no + suffix).SetCreatedBy(actor.ID).SaveX(ctx)
		return row
	}
	reversed := payment("TRACE-REVERSED-", 20, fact.ID)
	allocation := client.FinanceAllocation.Query().Where(financeallocation.PaymentID(reversed.ID)).OnlyX(ctx)
	client.FinanceAllocation.Create().SetPaymentID(reversed.ID).SetFinanceFactID(fact.ID).SetReversalOfAllocationID(allocation.ID).SetAmount(allocation.Amount).SetCurrency("CNY").SetStatus("REVERSED").SetIdempotencyKey("TRACE-UNDO-" + suffix).SetCreatedBy(actor.ID).SaveX(ctx)
	active := payment("TRACE-ACTIVE-", 30, fact.ID)
	payment("TRACE-UNRELATED-", 40, other.ID)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	detail, err := uc.GetFinanceFact(ctx, fact.ID)
	if err != nil || detail.SourceNo == nil || *detail.SourceNo == "" || detail.OutstandingAmount.String() != "70" {
		t.Fatalf("fact detail must resolve source and current balance: %+v %v", detail, err)
	}
	filter := biz.FinancePaymentFilter{FinanceFactID: fact.ID, Limit: 1}
	rows, total, err := uc.ListFinancePayments(ctx, filter)
	if err != nil || total != 2 || len(rows) != 1 || rows[0].ID != active.ID {
		t.Fatalf("first page: total=%d rows=%+v err=%v", total, rows, err)
	}
	filter.Offset = 1
	rows, total, err = uc.ListFinancePayments(ctx, filter)
	if err != nil || total != 2 || len(rows) != 1 || rows[0].ID != reversed.ID || len(rows[0].Allocations) != 2 {
		t.Fatalf("reversed relationship: total=%d rows=%+v err=%v", total, rows, err)
	}
	if rows[0].AvailableAmount.String() != "20" {
		t.Fatalf("available=%s", rows[0].AvailableAmount)
	}
	filter.FinanceFactID = -1
	if _, _, err := uc.ListFinancePayments(ctx, filter); err != biz.ErrBadParam {
		t.Fatalf("negative fact id: %v", err)
	}
}
