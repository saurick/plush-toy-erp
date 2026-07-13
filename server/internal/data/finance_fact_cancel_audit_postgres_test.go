package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFinanceFactCancelAuditPostgresPreservesPostingAndReplaysExactly(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-audit-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix)
	postedAt := *fact.PostedAt

	cancelled, err := repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "客户确认账款作废")
	if err != nil {
		t.Fatalf("cancel posted finance fact: %v", err)
	}
	if cancelled.PostedAt == nil || !cancelled.PostedAt.Equal(postedAt) {
		t.Fatalf("posted_at changed during cancellation: before=%v after=%v", postedAt, cancelled.PostedAt)
	}
	if cancelled.CancelledAt == nil || cancelled.CancelledBy == nil || *cancelled.CancelledBy != actor.ID ||
		cancelled.CancelReason == nil || *cancelled.CancelReason != "客户确认账款作废" ||
		cancelled.CancelledByName == nil || *cancelled.CancelledByName != actor.Username || cancelled.CancelAuditLegacy {
		t.Fatalf("unexpected cancellation audit: %#v", cancelled)
	}
	replayed, err := repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "客户确认账款作废")
	if err != nil || replayed.CancelledAt == nil || !replayed.CancelledAt.Equal(*cancelled.CancelledAt) {
		t.Fatalf("exact replay must return original audit: replay=%#v err=%v", replayed, err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "改写后的取消原因"); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed cancellation intent error=%v, want idempotency conflict", err)
	}
}

func TestFinanceFactCancelAuditPostgresRejectsInvalidStatesWithoutPartialWrite(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-invalid-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)

	draft, err := repo.CreateFinanceFactDraft(ctx, financeFactCancelAuditInput("DRAFT-"+suffix, suffix+"-draft"))
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, draft.ID, actor.ID, "草稿不可取消"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("draft cancellation error=%v", err)
	}
	assertFinanceFactHasNoCancelAudit(t, ctx, client, draft.ID, biz.OperationalFactStatusDraft)

	settled := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix+"-settled")
	if _, err := repo.SettleFinanceFact(ctx, settled.ID); err != nil {
		t.Fatalf("settle finance fact: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, settled.ID, actor.ID, "已结清不可取消"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("settled cancellation error=%v", err)
	}
	assertFinanceFactHasNoCancelAudit(t, ctx, client, settled.ID, biz.OperationalFactStatusSettled)

	posted := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix+"-missing-actor")
	if _, err := repo.CancelPostedFinanceFact(ctx, posted.ID, actor.ID+999999, "不存在的操作者"); err == nil {
		t.Fatal("missing actor must fail foreign-key validation")
	}
	assertFinanceFactHasNoCancelAudit(t, ctx, client, posted.ID, biz.OperationalFactStatusPosted)
}

func TestFinanceFactCancelAuditPostgresConcurrentDifferentIntentHasOneWinner(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-race-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix)
	reasons := []string{"客户撤销付款安排", "供应商确认账款作废"}
	errs := make([]error, len(reasons))
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range reasons {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			_, errs[index] = repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, reasons[index])
		}(i)
	}
	close(start)
	wg.Wait()
	succeeded, conflicted := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, biz.ErrIdempotencyConflict):
			conflicted++
		default:
			t.Fatalf("unexpected concurrent cancellation error: %v", err)
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("winner/conflict=%d/%d, want 1/1", succeeded, conflicted)
	}
}

func TestFinanceFactCancelAuditPostgresConcurrentExactReplayReturnsOneAudit(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-exact-race-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix)
	results := make([]*biz.FinanceFact, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range results {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			results[index], errs[index] = repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "并发精确重放")
		}(i)
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("exact replay %d failed: %v", i, err)
		}
	}
	if results[0].CancelledAt == nil || results[1].CancelledAt == nil || !results[0].CancelledAt.Equal(*results[1].CancelledAt) {
		t.Fatalf("exact replays returned different audit timestamps: %#v %#v", results[0], results[1])
	}
}

func TestFinanceFactCancelAuditPostgresConstraintAndHistoricalProjection(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-shape-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix)
	var columnDefault string
	if err := data.sqldb.QueryRowContext(ctx, `SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_facts' AND column_name='cancel_audit_version'`).Scan(&columnDefault); err != nil {
		t.Fatalf("read cancel audit default: %v", err)
	}
	if columnDefault != "1" {
		t.Fatalf("cancel_audit_version default=%q, want 1", columnDefault)
	}
	var constraintCount int
	if err := data.sqldb.QueryRowContext(ctx, `SELECT count(*) FROM pg_constraint WHERE conrelid='finance_facts'::regclass AND conname IN ('finance_facts_cancel_audit_bundle','finance_facts_cancel_audit_version')`).Scan(&constraintCount); err != nil {
		t.Fatalf("read cancel audit constraints: %v", err)
	}
	if constraintCount != 2 {
		t.Fatalf("cancel audit constraints=%d, want 2", constraintCount)
	}

	badStatements := []string{
		`UPDATE finance_facts SET status='CANCELLED', cancel_audit_version=1, cancelled_at=now(), cancelled_by=$1, cancel_reason=NULL WHERE id=$2`,
		`UPDATE finance_facts SET status='CANCELLED', cancel_audit_version=1, cancelled_at=now(), cancelled_by=$1, cancel_reason='   ' WHERE id=$2`,
		`UPDATE finance_facts SET status='POSTED', cancelled_at=now(), cancelled_by=$1, cancel_reason='越界审计' WHERE id=$2`,
	}
	for _, statement := range badStatements {
		if _, err := data.sqldb.ExecContext(ctx, statement, actor.ID, fact.ID); err == nil {
			t.Fatalf("database accepted invalid cancellation bundle: %s", statement)
		}
	}
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE finance_facts SET status='CANCELLED', cancel_audit_version=0 WHERE id=$1`, fact.ID); err != nil {
		t.Fatalf("create pre-cutover historical row: %v", err)
	}
	items, _, err := repo.ListFinanceFacts(ctx, biz.OperationalFactFilter{Status: biz.OperationalFactStatusCancelled, Limit: 100})
	if err != nil {
		t.Fatalf("list historical finance facts: %v", err)
	}
	for _, item := range items {
		if item.ID == fact.ID {
			if !item.CancelAuditLegacy || item.CancelledAt != nil || item.CancelledBy != nil || item.CancelReason != nil {
				t.Fatalf("historical audit must remain explicitly missing: %#v", item)
			}
			return
		}
	}
	t.Fatalf("historical finance fact %d not returned", fact.ID)
}

func TestFinanceFactCancelAuditPostgresRollsBackWhenCompensationFails(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-rollback-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedFinanceFactForCancelAudit(t, ctx, repo, suffix)
	nodeID := recordAppliedProcessCommandEffect(t, ctx, data, biz.ProcessDomainCommandFinanceReceivableLead, "finance_fact", fact.ID)
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE process_node_instances SET domain_command_result_hash='broken' WHERE id=$1`, nodeID); err != nil {
		t.Fatalf("corrupt compensation fixture: %v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "测试补偿失败回滚"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("compensation failure error=%v, want ErrBadParam", err)
	}
	assertFinanceFactHasNoCancelAudit(t, ctx, client, fact.ID, biz.OperationalFactStatusPosted)
}

func createPostedFinanceFactForCancelAudit(t *testing.T, ctx context.Context, repo *operationalFactRepo, suffix string) *biz.FinanceFact {
	t.Helper()
	fact, err := repo.CreateFinanceFactDraft(ctx, financeFactCancelAuditInput("FIN-CANCEL-"+suffix, "finance-cancel-"+suffix))
	if err != nil {
		t.Fatalf("create finance fact: %v", err)
	}
	posted, err := repo.PostFinanceFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post finance fact: %v", err)
	}
	if posted.PostedAt == nil {
		t.Fatal("posted finance fact missing posted_at")
	}
	return posted
}

func financeFactCancelAuditInput(factNo, idempotencyKey string) *biz.FinanceFactCreate {
	return &biz.FinanceFactCreate{
		FactNo: factNo, FactType: biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyOther,
		Amount:           decimal.NewFromInt(100), Currency: biz.FinanceCurrencyCNY,
		IdempotencyKey: idempotencyKey, OccurredAt: time.Now().UTC(), OccurredAtSpecified: true,
	}
}

func assertFinanceFactHasNoCancelAudit(t *testing.T, ctx context.Context, client *ent.Client, id int, status string) {
	t.Helper()
	row, err := client.FinanceFact.Get(ctx, id)
	if err != nil {
		t.Fatalf("read finance fact %d: %v", id, err)
	}
	if row.Status != status || row.CancelledAt != nil || row.CancelledBy != nil || row.CancelReason != nil {
		t.Fatalf("finance fact changed partially after rejection: %#v", row)
	}
}
