package data

import (
	"errors"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"io"
	"server/internal/biz"
	"testing"
	"time"
)

func TestFinanceAdvanceCandidatesSkipAmbiguousPurchaseOrders(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "advance_candidate_orders")
	f := createFinanceBusinessSourceFixtures(t, ctx, client, "CANDIDATE")
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "CANDIDATE-SUP", true)
	actor := client.AdminUser.Create().SetUsername("candidate-create").SetPasswordHash("test-only").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("candidate-approve").SetPasswordHash("test-only").SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	orders := []int{}
	lines := []int{}
	for _, no := range []string{"CANDIDATE-PO-A", "CANDIDATE-PO-B"} {
		order := client.PurchaseOrder.Create().SetPurchaseOrderNo(no).SetSupplierID(supplier.ID).SetCurrency("CNY").SetPaymentTermDays(30).SetPurchaseDate(time.Now()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx)
		line := client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(1).SetMaterialID(f.materialID).SetUnitID(f.unitID).SetPurchasedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
		orders = append(orders, order.ID)
		lines = append(lines, line.ID)
	}
	createFact := func(no string, sourceLines []int) int {
		receipt := client.PurchaseReceipt.Create().SetReceiptNo(no).SetSupplierID(supplier.ID).SetSupplierName(supplier.Name).SetStatus(biz.PurchaseReceiptStatusPosted).SetReceivedAt(time.Now()).SetPostedAt(time.Now()).SaveX(ctx)
		for _, lineID := range sourceLines {
			client.PurchaseReceiptItem.Create().SetReceiptID(receipt.ID).SetMaterialID(f.materialID).SetWarehouseID(f.warehouseID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(1)).SetUnitPrice(decimal.NewFromInt(100)).SetAmount(decimal.NewFromInt(100)).SetPurchaseOrderItemID(lineID).SaveX(ctx)
		}
		draft, err := repo.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: no, PurchaseReceiptID: receipt.ID, IdempotencyKey: no})
		if err != nil {
			t.Fatal(err)
		}
		posted, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(draft.ID, draft.Version, actor.ID, ""))
		if err != nil {
			t.Fatal(err)
		}
		return posted.ID
	}
	ambiguous := createFact("CANDIDATE-MIXED", lines)
	valid := createFact("CANDIDATE-SINGLE", lines[:1])
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "CANDIDATE-ADV", Kind: biz.FinancePaymentKindAdvance, SourceType: "purchase_order", SourceID: orders[0], Direction: biz.FinancePaymentDirectionDisbursement, CounterpartyType: biz.FinanceCounterpartySupplier, CounterpartyID: supplier.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "模拟账户", EvidenceRef: "模拟回单", IdempotencyKey: "candidate-advance"}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	approved := approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	payment, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: approved.Version}, actor.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := repo.FinancePaymentAllocationCandidates(ctx, payment.ID)
	if err != nil || len(rows) != 1 || rows[0].ID != valid {
		t.Fatalf("valid candidate hidden by mixed order: %+v %v", rows, err)
	}
	_, err = repo.AllocateFinancePayment(ctx, &biz.FinancePaymentAllocate{ID: payment.ID, ExpectedVersion: payment.Version, IdempotencyKey: "invalid-candidate", Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: ambiguous, Amount: decimal.NewFromInt(1)}}}, 1)
	if !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("explicit invalid allocation must still fail: %v", err)
	}
}
