package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func createShippedShipmentForFinanceFactFixture(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	customer *ent.Customer,
	no string,
	amount int64,
) (*operationalFactRepo, *biz.Shipment, *ent.AdminUser) {
	t.Helper()
	if customer == nil || customer.ID <= 0 || amount <= 0 {
		t.Fatal("invalid shipment finance fact fixture")
	}
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "P-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "W-"+suffix)
	actor := client.AdminUser.Create().
		SetUsername("finance-fixture-actor-" + suffix).
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	paymentTermDays := 30
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:         "SO-" + suffix,
		CustomerID:      customer.ID,
		OrderDate:       time.Now().UTC(),
		PaymentTermDays: &paymentTermDays,
	})
	if err != nil {
		t.Fatalf("create finance fixture sales order: %v", err)
	}
	quantity := decimal.NewFromInt(1)
	unitPrice := decimal.NewFromInt(amount)
	lineAmount := decimal.NewFromInt(amount)
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          1,
		ProductID:       product.ID,
		UnitID:          unit.ID,
		OrderedQuantity: quantity,
		UnitPrice:       &unitPrice,
		Amount:          &lineAmount,
	})
	if err != nil {
		t.Fatalf("create finance fixture sales item: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit finance fixture sales order: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate finance fixture sales order: %v", err)
	}
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      product.ID,
		WarehouseID:    warehouse.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       quantity,
		UnitID:         unit.ID,
		SourceType:     "TEST_FINANCE_PAYMENT_SOURCE",
		IdempotencyKey: "inventory-" + suffix,
	}); err != nil {
		t.Fatalf("seed finance fixture inventory: %v", err)
	}
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	manualWeight := decimal.NewFromInt(1)
	shipment, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:      "SHP-" + suffix,
			SalesOrderID:    &order.ID,
			CustomerID:      &customer.ID,
			IdempotencyKey:  "shipment-" + suffix,
			TotalNetWeightG: &manualWeight,
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &item.ID,
			ProductID:        product.ID,
			WarehouseID:      warehouse.ID,
			UnitID:           unit.ID,
			Quantity:         quantity,
		}},
	})
	if err != nil {
		t.Fatalf("create finance fixture shipment: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shipment.ID)
	shipment, err = repo.ShipShipmentWithActor(ctx, shipment.ID, actor.ID)
	if err != nil {
		t.Fatalf("ship finance fixture shipment: %v", err)
	}
	return repo, shipment, actor
}

func createPostedReceivableFinanceFactFixture(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	customer *ent.Customer,
	no string,
	amount int64,
) *biz.FinanceFact {
	t.Helper()
	repo, shipment, actor := createShippedShipmentForFinanceFactFixture(t, ctx, data, client, customer, no, amount)
	draft := createReceivableViaProcessCommandForTest(t, ctx, data, repo, shipment, actor.ID, no, no)
	posted, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(draft.ID, draft.Version, actor.ID, ""))
	if err != nil {
		t.Fatalf("post receivable finance fixture: %v", err)
	}
	return posted
}

func createPostedFinanceFactForCreditType(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	factType string,
) *biz.FinanceFact {
	t.Helper()
	suffix := factType + "-" + postgresTestSuffix()
	switch factType {
	case biz.FinanceFactReceivable:
		customer := client.Customer.Create().
			SetCode("C-CREDIT-TYPE-" + suffix).
			SetName("贷项类型应收客户").
			SetIsActive(true).
			SaveX(ctx)
		return createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-"+suffix, 10)
	case biz.FinanceFactPayable:
		fixtures := createFinanceBusinessSourceFixtures(t, ctx, client, "CREDIT-"+suffix)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, "CREDIT-SUP-"+suffix, true)
		inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
		unitPrice := decimal.NewFromInt(10)
		amount := decimal.NewFromInt(10)
		lotNo := "CREDIT-LOT-" + suffix
		receipt, err := inventoryUC.CreatePurchaseReceiptWithItems(ctx, &biz.PurchaseReceiptCreate{
			ReceiptNo:    "CREDIT-RECEIPT-" + suffix,
			SupplierID:   &supplier.ID,
			SupplierName: supplier.Name,
			ReceivedAt:   time.Now().UTC(),
		}, []*biz.PurchaseReceiptItemCreate{{
			MaterialID:  fixtures.materialID,
			WarehouseID: fixtures.warehouseID,
			UnitID:      fixtures.unitID,
			LotNo:       &lotNo,
			Quantity:    decimal.NewFromInt(1),
			UnitPrice:   &unitPrice,
			Amount:      &amount,
		}})
		if err != nil {
			t.Fatalf("create payable source for credit type: %v", err)
		}
		passAllPurchaseReceiptQualityInspections(t, ctx, inventoryUC, receipt.ID)
		receipt, err = inventoryUC.PostPurchaseReceipt(ctx, receipt.ID)
		if err != nil {
			t.Fatalf("post payable source for credit type: %v", err)
		}
		repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
		uc := biz.NewOperationalFactUsecase(repo)
		draft, err := uc.CreatePayableFromPurchaseReceipt(ctx, &biz.FinanceFactFromPurchaseReceiptCreate{
			FactNo:            "AP-" + suffix,
			PurchaseReceiptID: receipt.ID,
			IdempotencyKey:    "ap-" + suffix,
		})
		if err != nil {
			t.Fatalf("create payable for credit type: %v", err)
		}
		actor := client.AdminUser.Create().
			SetUsername("credit-type-payable-actor-" + suffix).
			SetPasswordHash("test-password-hash").
			SaveX(ctx)
		posted, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(draft.ID, draft.Version, actor.ID, ""))
		if err != nil {
			t.Fatalf("post payable for credit type: %v", err)
		}
		return posted
	case biz.FinanceFactInvoice:
		customer := client.Customer.Create().
			SetCode("C-CREDIT-TYPE-" + suffix).
			SetName("贷项类型开票客户").
			SetIsActive(true).
			SaveX(ctx)
		repo, shipment, actor := createShippedShipmentForFinanceFactFixture(t, ctx, data, client, customer, "INV-"+suffix, 10)
		uc := biz.NewOperationalFactUsecase(repo)
		draft, err := uc.CreateInvoiceFromShipment(ctx, &biz.FinanceFactFromShipmentCreate{
			FactNo:          "INV-" + suffix,
			ShipmentID:      shipment.ID,
			IdempotencyKey:  "inv-" + suffix,
			InvoiceCategory: stringPointer(biz.FinanceInvoiceCategoryVATGeneral1),
		})
		if err != nil {
			t.Fatalf("create invoice for credit type: %v", err)
		}
		posted, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(draft.ID, draft.Version, actor.ID, ""))
		if err != nil {
			t.Fatalf("post invoice for credit type: %v", err)
		}
		return posted
	case biz.FinanceFactReconciliation:
		customer := client.Customer.Create().
			SetCode("C-CREDIT-TYPE-" + suffix).
			SetName("贷项类型核对客户").
			SetIsActive(true).
			SaveX(ctx)
		source := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-SOURCE-"+suffix, 10)
		repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
		uc := biz.NewOperationalFactUsecase(repo)
		draft, err := uc.CreateReconciliationFromFinanceFact(ctx, &biz.FinanceReconciliationFromFactCreate{
			FactNo:         "REC-" + suffix,
			FinanceFactID:  source.ID,
			IdempotencyKey: "rec-" + suffix,
		})
		if err != nil {
			t.Fatalf("create reconciliation for credit type: %v", err)
		}
		actor := client.AdminUser.Create().
			SetUsername("credit-type-reconciliation-actor-" + suffix).
			SetPasswordHash("test-password-hash").
			SaveX(ctx)
		posted, err := repo.PostFinanceFact(ctx, operationalFactStatusMutation(draft.ID, draft.Version, actor.ID, ""))
		if err != nil {
			t.Fatalf("post reconciliation for credit type: %v", err)
		}
		return posted
	default:
		t.Fatalf("unsupported finance fact type %q", factType)
		return nil
	}
}

func TestFinancePaymentMultiAllocationAndReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_payment_allocation")
	customer := client.Customer.Create().SetCode("C-FIN-1").SetName("核销客户").SetIsActive(true).SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("finance-payment-creator").SetPasswordHash("test-password-hash").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("finance-payment-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	poster := client.AdminUser.Create().SetUsername("finance-payment-poster").SetPasswordHash("test-password-hash").SaveX(ctx)
	reverser := client.AdminUser.Create().SetUsername("finance-payment-reverser").SetPasswordHash("test-password-hash").SaveX(ctx)
	createFact := func(no string, amount int64) int {
		return createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, no, amount).ID
	}
	fact1, fact2 := createFact("AR-PAY-1", 60), createFact("AR-PAY-2", 40)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	input := &biz.FinancePaymentCreate{PaymentNo: "PAY-1", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "BANK-001", EvidenceRef: "流水-001", IdempotencyKey: "pay-create-1"}
	created, err := uc.CreateFinancePayment(ctx, input, creator.ID)
	if err != nil || created.Status != biz.FinancePaymentStatusDraft {
		t.Fatalf("create=%#v err=%v", created, err)
	}
	replayed, err := uc.CreateFinancePayment(ctx, input, creator.ID)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("replay=%#v err=%v", replayed, err)
	}
	client.Customer.UpdateOneID(customer.ID).SetIsActive(false).ExecX(ctx)
	replayedAfterDisable, err := uc.CreateFinancePayment(ctx, input, creator.ID)
	if err != nil || replayedAfterDisable.ID != created.ID {
		t.Fatalf("replay after customer disabled=%#v err=%v", replayedAfterDisable, err)
	}
	client.Customer.UpdateOneID(customer.ID).SetIsActive(true).ExecX(ctx)
	postInput := &biz.FinancePaymentPost{ID: created.ID, ExpectedVersion: created.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact2, Amount: decimal.NewFromInt(40)}, {FinanceFactID: fact1, Amount: decimal.NewFromInt(60)}}}
	if _, err := uc.PostFinancePayment(ctx, postInput, poster.ID); !errors.Is(err, biz.ErrProcessRuntimeRequired) {
		t.Fatalf("direct payment post guard err=%v", err)
	}
	approved := approveFinancePaymentForRepoTest(t, ctx, client, created.ID, approver.ID)
	postInput.ExpectedVersion = approved.Version
	posted, err := repo.postFinancePayment(ctx, postInput, poster.ID, nil, nil)
	if err != nil || posted.Status != biz.FinancePaymentStatusPosted || len(posted.Allocations) != 2 {
		t.Fatalf("post=%#v err=%v", posted, err)
	}
	if client.FinanceFact.GetX(ctx, fact1).Status != biz.OperationalFactStatusSettled || client.FinanceFact.GetX(ctx, fact2).Status != biz.OperationalFactStatusSettled {
		t.Fatal("fully allocated facts must settle")
	}
	postReplay, err := repo.postFinancePayment(ctx, postInput, poster.ID, nil, nil)
	if err != nil || postReplay.ID != posted.ID || postReplay.Version != posted.Version || len(postReplay.Allocations) != 2 {
		t.Fatalf("post replay=%#v err=%v", postReplay, err)
	}
	changedPost := *postInput
	changedPost.Allocations = []biz.FinancePaymentAllocationInput{{FinanceFactID: fact1, Amount: decimal.NewFromInt(50)}, {FinanceFactID: fact2, Amount: decimal.NewFromInt(40)}}
	if _, err := repo.postFinancePayment(ctx, &changedPost, poster.ID, nil, nil); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed post replay err=%v", err)
	}
	reverseInput := &biz.FinancePaymentReverse{ID: posted.ID, ExpectedVersion: posted.Version, Reason: "银行退回"}
	reversed, err := uc.ReverseFinancePayment(ctx, reverseInput, reverser.ID)
	if err != nil || reversed.Status != biz.FinancePaymentStatusReversed || len(reversed.Allocations) != 4 {
		t.Fatalf("reverse=%#v err=%v", reversed, err)
	}
	if client.FinanceFact.GetX(ctx, fact1).Status != biz.OperationalFactStatusPosted || client.FinanceFact.GetX(ctx, fact2).Status != biz.OperationalFactStatusPosted {
		t.Fatal("reversal must reopen source facts")
	}
	reverseReplay, err := uc.ReverseFinancePayment(ctx, reverseInput, reverser.ID)
	if err != nil || reverseReplay.ID != reversed.ID || reverseReplay.Version != reversed.Version || len(reverseReplay.Allocations) != 4 {
		t.Fatalf("reverse replay=%#v err=%v", reverseReplay, err)
	}
	changedReverse := *reverseInput
	changedReverse.Reason = "不同原因"
	if _, err := uc.ReverseFinancePayment(ctx, &changedReverse, reverser.ID); !errors.Is(err, biz.ErrIdempotencyConflict) {
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
	creator := client.AdminUser.Create().SetUsername("finance-cross-creator").SetPasswordHash("test-password-hash").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("finance-cross-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	poster := client.AdminUser.Create().SetUsername("finance-cross-poster").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, b, "AR-CROSS", 50)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "PAY-CROSS", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: a.ID, Amount: decimal.NewFromInt(50), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "PAY-CROSS"}, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	payment = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	_, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(50)}}}, poster.ID, nil, nil)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cross counterparty err=%v", err)
	}
}

func TestFinancePaymentRequiresExactDirectionPartyAndFullAllocation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_payment_exact_contract")
	customer := client.Customer.Create().SetCode("C-FIN-EXACT").SetName("核销客户").SetIsActive(true).SaveX(ctx)
	inactive := client.Customer.Create().SetCode("C-FIN-INACTIVE").SetName("停用客户").SetIsActive(false).SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("S-FIN-EXACT").SetName("付款供应商").SetIsActive(true).SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("finance-exact-creator").SetPasswordHash("test-password-hash").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("finance-exact-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	poster := client.AdminUser.Create().SetUsername("finance-exact-poster").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-EXACT", 100)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)

	for _, input := range []*biz.FinancePaymentCreate{
		{PaymentNo: "PAY-WRONG-SUPPLIER", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartySupplier, CounterpartyID: supplier.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "PAY-WRONG-SUPPLIER"},
		{PaymentNo: "PAY-WRONG-CUSTOMER", Direction: biz.FinancePaymentDirectionDisbursement, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "PAY-WRONG-CUSTOMER"},
	} {
		if _, err := uc.CreateFinancePayment(ctx, input, creator.ID); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("invalid direction/party pairing error=%v", err)
		}
	}
	if _, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "PAY-INACTIVE", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: inactive.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "PAY-INACTIVE"}, creator.ID); !errors.Is(err, biz.ErrCustomerInactive) {
		t.Fatalf("inactive customer error=%v", err)
	}

	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "PAY-PARTIAL", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.NewFromInt(100), Currency: "CNY", AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: "PAY-PARTIAL"}, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	payment = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	if _, err := repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(90)}}}, poster.ID, nil, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("partial allocation error=%v", err)
	}
	if got := client.FinancePayment.GetX(ctx, payment.ID); got.Status != biz.FinancePaymentStatusApproved || got.Version != payment.Version {
		t.Fatalf("partial allocation mutated payment: %#v", got)
	}
	if count := client.FinanceAllocation.Query().CountX(ctx); count != 0 {
		t.Fatalf("partial allocation leaked rows=%d", count)
	}
}

func TestFinanceCreditNoteAndReversalPreserveOriginal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_credit_note")
	customer := client.Customer.Create().SetCode("C-CREDIT").SetName("红冲客户").SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("finance-credit-creator").SetPasswordHash("test-password-hash").SaveX(ctx)
	reverser := client.AdminUser.Create().SetUsername("finance-credit-reverser").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-CREDIT", 100)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "CN-1", FinanceFactID: fact.ID, Amount: decimal.NewFromInt(30), Reason: "折让红冲", IdempotencyKey: "CN-1"}, creator.ID)
	if err != nil || credit.Status != "POSTED" {
		t.Fatalf("credit=%#v err=%v", credit, err)
	}
	creditReplay, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "CN-1", FinanceFactID: fact.ID, Amount: decimal.NewFromInt(30), Reason: "折让红冲", IdempotencyKey: "CN-1"}, creator.ID)
	if err != nil || creditReplay.ID != credit.ID {
		t.Fatalf("credit replay=%#v err=%v", creditReplay, err)
	}
	reverse, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: credit.ID, CreditNoteNo: "CN-1-R", Reason: "红冲撤销", IdempotencyKey: "CN-1-R"}, reverser.ID)
	if err != nil || reverse.Status != "REVERSED" || reverse.ReversalOfCreditNoteID == nil || *reverse.ReversalOfCreditNoteID != credit.ID {
		t.Fatalf("reverse=%#v err=%v", reverse, err)
	}
	reverseReplay, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: credit.ID, CreditNoteNo: "CN-1-R", Reason: "红冲撤销", IdempotencyKey: "CN-1-R"}, reverser.ID)
	if err != nil || reverseReplay.ID != reverse.ID {
		t.Fatalf("reverse replay=%#v err=%v", reverseReplay, err)
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

func TestFinanceFactCancellationRequiresPaymentAndCreditReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_fact_cancellation_dependencies")
	customer := client.Customer.Create().SetCode("C-FIN-CANCEL-DEPS").SetName("财务取消依赖客户").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("finance-cancel-dependency-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("finance-cancel-dependency-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-CANCEL-DEPS", 100)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)

	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{
		PaymentNo: "PAY-CANCEL-DEPS", Direction: biz.FinancePaymentDirectionReceipt,
		CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID,
		Amount: decimal.NewFromInt(30), Currency: "CNY", AccountRef: "BANK",
		EvidenceRef: "FLOW", IdempotencyKey: "PAY-CANCEL-DEPS",
	}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	payment = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	payment, err = repo.postFinancePayment(ctx, &biz.FinancePaymentPost{
		ID: payment.ID, ExpectedVersion: payment.Version,
		Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(30)}},
	}, actor.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	factState, err := uc.GetFinanceFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("read finance fact after payment post: %v", err)
	}
	if _, err := uc.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(factState.ID, factState.Version, actor.ID, "来源更正")); !errors.Is(err, biz.ErrFinanceAllocationDependency) {
		t.Fatalf("cancel with active payment allocation error=%v", err)
	}
	if _, err := uc.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{
		ID: payment.ID, ExpectedVersion: payment.Version, Reason: "收款冲正",
	}, actor.ID); err != nil {
		t.Fatal(err)
	}

	credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{
		CreditNoteNo: "CN-CANCEL-DEPS", FinanceFactID: fact.ID,
		Amount: decimal.NewFromInt(20), Reason: "折让", IdempotencyKey: "CN-CANCEL-DEPS",
	}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	factState, err = uc.GetFinanceFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("read finance fact after credit note: %v", err)
	}
	if _, err := uc.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(factState.ID, factState.Version, actor.ID, "来源更正")); !errors.Is(err, biz.ErrFinanceCreditNoteDependency) {
		t.Fatalf("cancel with active credit note error=%v", err)
	}
	if _, err := uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{
		CreditNoteID: credit.ID, CreditNoteNo: "CN-CANCEL-DEPS-R",
		Reason: "贷项反向", IdempotencyKey: "CN-CANCEL-DEPS-R",
	}, actor.ID); err != nil {
		t.Fatal(err)
	}
	factState, err = uc.GetFinanceFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("read finance fact after credit reversal: %v", err)
	}
	cancelled, err := uc.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(factState.ID, factState.Version, actor.ID, "来源更正"))
	if err != nil || cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("cancel after reversing all settlement evidence=%#v err=%v", cancelled, err)
	}
}

func TestFinanceCreditNoteAllowsOnlyReceivableAndPayable(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_credit_note_exact_types")
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	actor := client.AdminUser.Create().SetUsername("finance-credit-type-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	for _, factType := range []string{biz.FinanceFactReceivable, biz.FinanceFactPayable, biz.FinanceFactInvoice, biz.FinanceFactReconciliation} {
		fact := createPostedFinanceFactForCreditType(t, ctx, data, client, factType)
		credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "CN-TYPE-" + factType, FinanceFactID: fact.ID, Amount: decimal.NewFromInt(1), Reason: "来源类型门禁", IdempotencyKey: "cn-type-" + factType}, actor.ID)
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

func approveFinancePaymentForRepoTest(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	paymentID int,
	approverID int,
) *biz.FinancePayment {
	t.Helper()
	row := client.FinancePayment.GetX(ctx, paymentID)
	updated := client.FinancePayment.UpdateOneID(paymentID).
		SetStatus(biz.FinancePaymentStatusApproved).
		SetApprovedAt(time.Now().UTC()).
		SetApprovedBy(approverID).
		SetVersion(row.Version + 1).
		SaveX(ctx)
	return entFinancePaymentToBiz(updated, nil)
}
