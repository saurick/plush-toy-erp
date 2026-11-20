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
)

func TestFinanceStatementSQLite(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "finance_statement")
	runFinanceStatementProjection(t, data, client, "SQLITE")
}
func TestFinanceStatementPostgres(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	runFinanceStatementProjection(t, data, client, postgresTestSuffix())
}
func runFinanceStatementProjection(t *testing.T, data *Data, client *ent.Client, suffix string) {
	t.Helper()
	ctx := context.Background()
	date := func(s string) time.Time {
		value, err := time.Parse(time.RFC3339, s)
		if err != nil {
			t.Fatal(err)
		}
		return value.UTC()
	}
	before := date("2026-08-31T23:30:00+08:00")
	during := date("2026-09-01T00:30:00+08:00")
	after := date("2026-10-01T00:30:00+08:00")
	customer := client.Customer.Create().SetCode("ST-" + suffix).SetName("模拟对账客户").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("ST-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	checker := client.AdminUser.Create().SetUsername("ST-C-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "ST-AR-"+suffix, 100)
	if _, err := data.sqldb.ExecContext(ctx, "UPDATE finance_facts SET posted_at=$1 WHERE id=$2", during, fact.ID); err != nil {
		t.Fatal(err)
	}

	createPayment := func(no string, amount int64, at time.Time) *ent.FinancePaymentCreate {
		return client.FinancePayment.Create().SetPaymentNo(no + suffix).SetDirection("RECEIPT").SetCounterpartyType("CUSTOMER").SetCounterpartyID(customer.ID).SetAmount(decimal.NewFromInt(amount)).SetCurrency("CNY").SetStatus("POSTED").SetAccountRef("模拟账户").SetEvidenceRef("模拟凭据" + no).SetIdempotencyKey(no + suffix).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SetCreatedBy(actor.ID).SetApprovedBy(checker.ID).SetApprovedAt(at).SetPostedBy(actor.ID).SetPostedAt(at).SetOccurredAt(at)
	}
	createPayment("ST-ADV-", 30, before).SetKind("ADVANCE").SetSourceType("sales_order").SetSourceID(1).SaveX(ctx)
	payment := createPayment("ST-PAY-", 70, during).SetStatus("REVERSED").SetReversedAt(after).SetReversedBy(actor.ID).SetReverseReason("次月冲销").SaveX(ctx)
	// Allocation affects invoice outstanding, but must not double-count money in a statement.
	client.FinanceAllocation.Create().SetPaymentID(payment.ID).SetFinanceFactID(fact.ID).SetAmount(decimal.NewFromInt(70)).SetCurrency("CNY").SetStatus("POSTED").SetIdempotencyKey("ST-ALLOC-" + suffix).SetCreatedBy(actor.ID).SetCreatedAt(during).SaveX(ctx)
	credit := client.FinanceCreditNote.Create().SetCreditNoteNo("ST-CREDIT-" + suffix).SetFinanceFactID(fact.ID).SetAmount(decimal.NewFromInt(10)).SetCurrency("CNY").SetReason("模拟折让").SetIdempotencyKey("ST-CREDIT-" + suffix).SetIdempotencyPayloadHash(strings.Repeat("b", 64)).SetCreatedBy(actor.ID).SetCreatedAt(during).SaveX(ctx)
	client.FinanceCreditNote.Create().SetCreditNoteNo("ST-CREDIT-R-" + suffix).SetFinanceFactID(fact.ID).SetReversalOfCreditNoteID(credit.ID).SetAmount(credit.Amount).SetCurrency("CNY").SetStatus("REVERSED").SetReason("次月冲销折让").SetIdempotencyKey("ST-CREDIT-R-" + suffix).SetIdempotencyPayloadHash(strings.Repeat("c", 64)).SetCreatedBy(actor.ID).SetCreatedAt(after).SaveX(ctx)
	createPayment("ST-USD-", 999, during).SetCurrency("USD").SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	query := biz.FinanceStatementQuery{CounterpartyType: "CUSTOMER", CounterpartyID: customer.ID, Currency: "CNY", DateFrom: "2026-09-01", DateTo: "2026-09-30", SnapshotAt: after.Add(time.Hour), Limit: 2}
	statement, err := uc.GetFinanceStatement(ctx, query)
	if err != nil {
		t.Fatal(err)
	}
	if statement.Opening.String() != "-30" || statement.Increase.String() != "100" || statement.Decrease.String() != "80" || statement.Closing.String() != "-10" || statement.Total != 3 || len(statement.Entries) != 2 {
		t.Fatalf("statement=%+v", statement)
	}
	for _, entry := range statement.Entries {
		if entry.Date != "2026-09-01" {
			t.Fatalf("statement must expose the China business date, got %q", entry.Date)
		}
	}
	query.Offset = 2
	second, err := uc.GetFinanceStatement(ctx, query)
	if err != nil || len(second.Entries) != 1 || second.Entries[0].Balance.String() != "-10" {
		t.Fatalf("second page=%+v err=%v", second, err)
	}
	query.DateFrom, query.DateTo, query.Offset = "2026-10-01", "2026-10-01", 0
	next, err := uc.GetFinanceStatement(ctx, query)
	if err != nil || next.Opening.String() != "-10" || next.Closing.String() != "70" || next.Total != 2 {
		t.Fatalf("reversal period=%+v err=%v", next, err)
	}
	filtered, total, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{Currency: "CNY", DateFrom: "2026-09-01", DateTo: "2026-09-30", CounterpartyType: "CUSTOMER", CounterpartyID: customer.ID, EvidenceRef: "模拟凭据ST-PAY-", Limit: 1})
	if err != nil || total != 1 || len(filtered) != 1 || filtered[0].ID != payment.ID {
		t.Fatalf("filtered payment=%+v total=%d err=%v", filtered, total, err)
	}
	totals, err := uc.FinancePaymentTotals(ctx, biz.FinancePaymentFilter{Currency: "CNY", CounterpartyType: "CUSTOMER", CounterpartyID: customer.ID, DateTo: "2026-09-30"})
	if err != nil || len(totals) != 2 {
		t.Fatalf("totals=%+v err=%v", totals, err)
	}
}
