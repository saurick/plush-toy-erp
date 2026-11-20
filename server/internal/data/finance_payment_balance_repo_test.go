package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func testFinanceAdvanceLifecycle(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	customer := client.Customer.Create().SetCode("ADV-C-" + suffix).SetName("模拟预收客户").SetIsActive(true).SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("adv-create-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("adv-approve-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("ADV-SO-" + suffix).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	input := &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindAdvance, SourceType: "sales_order", SourceID: order.ID, PaymentNo: "ADV-" + suffix, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Currency: "CNY", Amount: decimal.NewFromInt(30000), AccountRef: "模拟银行", EvidenceRef: "模拟首款凭据", IdempotencyKey: "adv-" + suffix}
	payment, err := uc.CreateFinancePayment(ctx, input, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version}, creator.ID, nil, nil); err == nil {
		t.Fatal("unapproved advance posted")
	}
	approved := approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	payment, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: approved.Version}, creator.ID, nil, nil)
	if err != nil || payment == nil || !payment.AvailableAmount.Equal(input.Amount) || len(payment.Allocations) != 0 {
		t.Fatalf("advance before shipment: %+v %v", payment, err)
	}
	if payment.SourceNo != order.OrderNo {
		t.Fatal("missing order reference")
	}
	// An order cancellation never silently deletes or returns its actual receipt.
	client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus(biz.SalesOrderStatusCanceled).ExecX(ctx)
	changed := *input
	changed.PaymentNo += "-CANCEL"
	changed.IdempotencyKey += "-CANCEL"
	if _, err := uc.CreateFinancePayment(ctx, &changed, creator.ID); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("cancelled order new cash: %v", err)
	}
	refundInput := &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindRefund, RefundOfPaymentID: payment.ID, PurposeNote: "订单取消退首款", PaymentNo: "REF-" + suffix, Direction: biz.FinancePaymentDirectionDisbursement, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Currency: "CNY", Amount: decimal.NewFromInt(10000), AccountRef: "模拟银行", EvidenceRef: "模拟退款凭据", IdempotencyKey: "refund-" + suffix}
	refund, err := uc.CreateFinancePayment(ctx, refundInput, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, cash := range []*biz.FinancePayment{payment, refund} {
		task := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("CASH-TASK-%d-%s", cash.ID, suffix)).SetTaskGroup("cash-test").SetTaskName("模拟款项任务").SetSourceType("finance_payment").SetSourceID(cash.ID).SetOwnerRoleKey(biz.FinanceRoleKey).SetTaskStatusKey("ready").SetPayload(map[string]any{}).SaveX(ctx)
		var linkedOrder int
		query := fmt.Sprintf("WITH visible_tasks AS (SELECT * FROM workflow_tasks WHERE id = %d), %s SELECT board_id FROM task_sources WHERE view_key = 'orders'", task.ID, workflowTaskSourceLinksCTE)
		if err := data.sqldb.QueryRowContext(ctx, query).Scan(&linkedOrder); err != nil || linkedOrder != order.ID {
			t.Fatalf("cash task order link: order=%d error=%v", linkedOrder, err)
		}
	}
	if _, err := uc.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{ID: payment.ID, ExpectedVersion: payment.Version, Reason: "误登记"}, creator.ID); err == nil {
		t.Fatal("original reversed with open refund")
	}
	approved = approveFinancePaymentForRepoTest(t, ctx, client, refund.ID, approver.ID)
	refund, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: refund.ID, ExpectedVersion: approved.Version}, creator.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	payment, err = uc.GetFinancePayment(ctx, payment.ID)
	if err != nil || !payment.AvailableAmount.Equal(decimal.NewFromInt(20000)) || !payment.RefundedAmount.Equal(refund.Amount) {
		t.Fatalf("refund balance %+v %v", payment, err)
	}
	excess := *refundInput
	excess.PaymentNo += "-OVER"
	excess.IdempotencyKey += "-OVER"
	excess.Amount = decimal.NewFromInt(20001)
	if _, err := uc.CreateFinancePayment(ctx, &excess, creator.ID); err == nil {
		t.Fatal("over-refund accepted")
	}
	if _, err := uc.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{ID: refund.ID, ExpectedVersion: refund.Version, Reason: "退款登记错误"}, creator.ID); err != nil {
		t.Fatal(err)
	}
	payment, err = uc.GetFinancePayment(ctx, payment.ID)
	if err != nil || !payment.AvailableAmount.Equal(input.Amount) || !payment.RefundedAmount.IsZero() {
		t.Fatalf("refund reversal %+v %v", payment, err)
	}
	rows, _, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{SourceType: "sales_order", SourceID: order.ID})
	if err != nil || len(rows) != 1 || rows[0].ID != payment.ID {
		t.Fatalf("order filter %v %v", rows, err)
	}
}

func testFinanceSupplierAdvance(t *testing.T, data *Data, client *ent.Client) {
	ctx := context.Background()
	suffix := postgresTestSuffix()
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-ADV-"+suffix, true)
	creator := client.AdminUser.Create().SetUsername("sup-create-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("sup-approve-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	for _, source := range []string{"purchase_order", "outsourcing_order"} {
		t.Run(source, func(t *testing.T) {
			id := 0
			if source == "purchase_order" {
				id = client.PurchaseOrder.Create().SetPurchaseOrderNo("ADV-PO-" + suffix).SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx).ID
			} else {
				id = client.OutsourcingOrder.Create().SetOutsourcingOrderNo("ADV-OS-" + suffix).SetSupplierID(supplier.ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).SaveX(ctx).ID
			}
			in := &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindAdvance, SourceType: source, SourceID: id, PaymentNo: source + suffix, Direction: biz.FinancePaymentDirectionDisbursement, CounterpartyType: biz.FinanceCounterpartySupplier, CounterpartyID: supplier.ID, Currency: "CNY", Amount: decimal.NewFromInt(100), AccountRef: "模拟付款账户", EvidenceRef: "模拟付款回单", IdempotencyKey: source + suffix}
			wrongCurrency := *in
			wrongCurrency.Currency = "USD"
			if _, err := uc.CreateFinancePayment(ctx, &wrongCurrency, creator.ID); err == nil {
				t.Fatal("different order currency accepted")
			}
			p, err := uc.CreateFinancePayment(ctx, in, creator.ID)
			if err != nil {
				t.Fatal(err)
			}
			approved := approveFinancePaymentForRepoTest(t, ctx, client, p.ID, approver.ID)
			p, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: p.ID, ExpectedVersion: approved.Version}, creator.ID, nil, nil)
			if err != nil || !p.AvailableAmount.Equal(in.Amount) {
				t.Fatalf("supplier advance %+v %v", p, err)
			}
			refund, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindRefund, RefundOfPaymentID: p.ID, PurposeNote: "供应商退回预付款", PaymentNo: "REF-" + source + suffix, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartySupplier, CounterpartyID: supplier.ID, Currency: "CNY", Amount: in.Amount, AccountRef: "模拟账户", EvidenceRef: "模拟退款回单", IdempotencyKey: "ref-" + source + suffix}, creator.ID)
			if err != nil {
				t.Fatal(err)
			}
			approved = approveFinancePaymentForRepoTest(t, ctx, client, refund.ID, approver.ID)
			if _, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: refund.ID, ExpectedVersion: approved.Version}, creator.ID, nil, nil); err != nil {
				t.Fatal(err)
			}
			p, err = uc.GetFinancePayment(ctx, p.ID)
			if err != nil || !p.AvailableAmount.IsZero() || !p.RefundedAmount.Equal(in.Amount) {
				t.Fatalf("supplier refund balance %+v %v", p, err)
			}
		})
	}
}

func TestFinanceAdvanceSupplierPrepaymentAndReturn(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "supplier_advance")
	testFinanceSupplierAdvance(t, data, client)
}
func TestOperationalFactRepoFinanceAdvanceSupplierPrepaymentAndReturnPostgres(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	testFinanceSupplierAdvance(t, data, client)
}

func TestOperationalFactRepoFinanceAdvanceConcurrentRefundPostgres(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx := context.Background()
	suffix := postgresTestSuffix()
	customer := client.Customer.Create().SetCode("RACE-C-" + suffix).SetName("并发退款模拟客户").SetIsActive(true).SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("race-create-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("race-approve-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("RACE-SO-" + suffix).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	p, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindAdvance, SourceType: "sales_order", SourceID: order.ID, PaymentNo: "RACE-" + suffix, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Currency: "CNY", Amount: decimal.NewFromInt(100), AccountRef: "模拟账户", EvidenceRef: "模拟凭据", IdempotencyKey: "race-" + suffix}, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	approved := approveFinancePaymentForRepoTest(t, ctx, client, p.ID, approver.ID)
	p, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: p.ID, ExpectedVersion: approved.Version}, creator.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var refunds []*biz.FinancePaymentPost
	for _, key := range []string{"a", "b"} {
		r, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindRefund, RefundOfPaymentID: p.ID, PurposeNote: "模拟退首款", PaymentNo: "RACE-REF-" + key + suffix, Direction: biz.FinancePaymentDirectionDisbursement, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Currency: "CNY", Amount: decimal.NewFromInt(80), AccountRef: "模拟账户", EvidenceRef: "模拟凭据", IdempotencyKey: "race-ref-" + key + suffix}, creator.ID)
		if err != nil {
			t.Fatal(err)
		}
		a := approveFinancePaymentForRepoTest(t, ctx, client, r.ID, approver.ID)
		refunds = append(refunds, &biz.FinancePaymentPost{ID: r.ID, ExpectedVersion: a.Version})
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, in := range refunds {
		wg.Add(1)
		go func(in *biz.FinancePaymentPost) {
			defer wg.Done()
			<-start
			_, err := repo.postFinancePayment(ctx, in, creator.ID, nil, nil)
			results <- err
		}(in)
	}
	close(start)
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatalf("expected one refund, got %d", success)
	}
	p, err = uc.GetFinancePayment(ctx, p.ID)
	if err != nil || !p.AvailableAmount.Equal(decimal.NewFromInt(20)) || !p.RefundedAmount.Equal(decimal.NewFromInt(80)) {
		t.Fatalf("overspent refund balance %+v %v", p, err)
	}
}

func TestFinanceAdvanceBeforeShipmentRefundAndReversal(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "finance_advance_refund")
	testFinanceAdvanceLifecycle(t, data, client)
}

func TestOperationalFactRepoFinanceAdvanceBeforeShipmentRefundAndReversalPostgres(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	testFinanceAdvanceLifecycle(t, data, client)
}

func testFinanceAdvanceAllocation(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	customer := client.Customer.Create().SetCode("ALLOC-C-" + suffix).SetName("模拟抵扣客户").SetIsActive(true).SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("alloc-create-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("alloc-approve-" + suffix).SetPasswordHash("test-only").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "ADV-AR-"+suffix, 100000)
	other := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "OTHER-AR-"+suffix, 50000)
	shipment := client.Shipment.GetX(ctx, *fact.SourceID)
	sourceType, sourceID := "sales_order", *shipment.SalesOrderID
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{Kind: biz.FinancePaymentKindAdvance, SourceType: sourceType, SourceID: sourceID, PaymentNo: "ALLOC-" + suffix, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Currency: "CNY", Amount: decimal.NewFromInt(30000), AccountRef: "模拟账户", EvidenceRef: "模拟到账凭据", IdempotencyKey: "alloc-" + suffix}, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	approved := approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	payment, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: approved.Version}, creator.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	candidates, err := uc.FinancePaymentAllocationCandidates(ctx, payment.ID)
	if err != nil || len(candidates) != 1 || candidates[0].ID != fact.ID {
		t.Fatalf("candidates %+v %v", candidates, err)
	}
	in := &biz.FinancePaymentAllocate{ID: payment.ID, ExpectedVersion: payment.Version, IdempotencyKey: "allocate-" + suffix, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: other.ID, Amount: decimal.NewFromInt(20000)}}}
	if _, err := uc.AllocateFinancePayment(ctx, in, creator.ID); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("different order %v", err)
	}
	in.Allocations[0].FinanceFactID = fact.ID
	payment, err = uc.AllocateFinancePayment(ctx, in, creator.ID)
	if err != nil || !payment.AvailableAmount.Equal(decimal.NewFromInt(10000)) {
		t.Fatalf("allocation %+v %v", payment, err)
	}
	replay, err := uc.AllocateFinancePayment(ctx, in, creator.ID)
	if err != nil || len(replay.Allocations) != 1 {
		t.Fatalf("duplicate %+v %v", replay, err)
	}
	changed := *in
	changed.Allocations = []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(20001)}}
	if _, err := uc.AllocateFinancePayment(ctx, &changed, creator.ID); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed replay %v", err)
	}
	changed.ExpectedVersion = payment.Version
	changed.IdempotencyKey += "-OVER"
	if _, err := uc.AllocateFinancePayment(ctx, &changed, creator.ID); err == nil {
		t.Fatal("over-allocation accepted")
	}
	unallocate := &biz.FinanceAllocationReverse{PaymentID: payment.ID, AllocationID: payment.Allocations[0].ID, ExpectedVersion: payment.Version, Reason: "调整收款对应批次"}
	payment, err = uc.ReverseFinanceAllocation(ctx, unallocate, creator.ID)
	if err != nil || !payment.AvailableAmount.Equal(decimal.NewFromInt(30000)) {
		t.Fatalf("unallocate %+v %v", payment, err)
	}
	if _, err := uc.ReverseFinanceAllocation(ctx, unallocate, creator.ID); err != nil {
		t.Fatal(err)
	}
	updatedFact, err := uc.GetFinanceFact(ctx, fact.ID)
	if err != nil || !updatedFact.OutstandingAmount.Equal(decimal.NewFromInt(100000)) {
		t.Fatalf("fact balance %+v %v", updatedFact, err)
	}
	// Reversing the cash after a separate allocation reversal must not double-reverse it.
	if _, err := uc.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{ID: payment.ID, ExpectedVersion: payment.Version, Reason: "原到账登记错误"}, creator.ID); err != nil {
		t.Fatal(err)
	}
}

func TestFinanceAdvanceAllocationOrderScopeAndRecovery(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "finance_advance_allocation")
	testFinanceAdvanceAllocation(t, data, client)
}
func TestOperationalFactRepoFinanceAdvanceAllocationOrderScopeAndRecoveryPostgres(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	testFinanceAdvanceAllocation(t, data, client)
}
