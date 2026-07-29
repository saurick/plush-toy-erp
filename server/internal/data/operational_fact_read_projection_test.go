package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFinanceReadProjectionsPreserveExactOutstandingAmount(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_read_projection")
	customer := client.Customer.Create().
		SetCode("C-FIN-PROJECTION").
		SetName("核销投影客户").
		SetIsActive(true).
		SaveX(ctx)
	creator := client.AdminUser.Create().
		SetUsername("finance-projection-creator").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	approver := client.AdminUser.Create().
		SetUsername("finance-projection-approver").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	poster := client.AdminUser.Create().
		SetUsername("finance-projection-poster").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
	creditActor := client.AdminUser.Create().
		SetUsername("finance-projection-credit").
		SetPasswordHash("test-password-hash").
		SaveX(ctx)

	fact := createPostedReceivableFinanceFactFixture(
		t,
		ctx,
		data,
		client,
		customer,
		"AR-PROJECTION",
		100,
	)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	paymentAmount := decimal.RequireFromString("0.123456")
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{
		PaymentNo:        "PAY-PROJECTION",
		Direction:        biz.FinancePaymentDirectionReceipt,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		CounterpartyID:   customer.ID,
		Amount:           paymentAmount,
		Currency:         biz.FinanceCurrencyCNY,
		AccountRef:       "BANK-PROJECTION",
		EvidenceRef:      "FLOW-PROJECTION",
		IdempotencyKey:   "pay-projection",
	}, creator.ID)
	if err != nil {
		t.Fatalf("create payment: %v", err)
	}
	payment = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	posted, err := repo.postFinancePayment(ctx, &biz.FinancePaymentPost{
		ID:              payment.ID,
		ExpectedVersion: payment.Version,
		Allocations: []biz.FinancePaymentAllocationInput{{
			FinanceFactID: fact.ID,
			Amount:        paymentAmount,
		}},
	}, poster.ID, nil, nil)
	if err != nil {
		t.Fatalf("post payment: %v", err)
	}
	wantAfterPayment := decimal.RequireFromString("99.876544")
	assertFinanceAllocationProjection(
		t,
		posted.Allocations,
		fact,
		wantAfterPayment,
	)

	creditAmount := decimal.RequireFromString("0.000001")
	credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{
		CreditNoteNo:   "CN-PROJECTION",
		FinanceFactID:  fact.ID,
		Amount:         creditAmount,
		Reason:         "精确余额投影",
		IdempotencyKey: "credit-projection",
	}, creditActor.ID)
	if err != nil {
		t.Fatalf("create credit note: %v", err)
	}
	wantOutstanding := decimal.RequireFromString("99.876543")
	assertFinanceCreditProjection(t, credit, fact, wantOutstanding)

	gotFact, err := uc.GetFinanceFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("get finance fact: %v", err)
	}
	if !gotFact.OutstandingAmount.Equal(wantOutstanding) {
		t.Fatalf("get outstanding=%s want=%s", gotFact.OutstandingAmount, wantOutstanding)
	}
	listedFacts, total, err := uc.ListFinanceFacts(ctx, biz.OperationalFactFilter{
		FactType: biz.FinanceFactReceivable,
		Limit:    20,
	})
	if err != nil || total != 1 || len(listedFacts) != 1 {
		t.Fatalf("list finance facts=%#v total=%d err=%v", listedFacts, total, err)
	}
	if !listedFacts[0].OutstandingAmount.Equal(wantOutstanding) {
		t.Fatalf("list outstanding=%s want=%s", listedFacts[0].OutstandingAmount, wantOutstanding)
	}

	gotPayment, err := uc.GetFinancePayment(ctx, payment.ID)
	if err != nil {
		t.Fatalf("get finance payment: %v", err)
	}
	assertFinanceAllocationProjection(t, gotPayment.Allocations, fact, wantOutstanding)
	listedPayments, total, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{
		Status: biz.FinancePaymentStatusPosted,
		Limit:  20,
	})
	if err != nil || total != 1 || len(listedPayments) != 1 {
		t.Fatalf("list payments=%#v total=%d err=%v", listedPayments, total, err)
	}
	assertFinanceAllocationProjection(t, listedPayments[0].Allocations, fact, wantOutstanding)

	gotCredit, err := uc.GetFinanceCreditNote(ctx, credit.ID)
	if err != nil {
		t.Fatalf("get credit note: %v", err)
	}
	assertFinanceCreditProjection(t, gotCredit, fact, wantOutstanding)
	listedCredits, total, err := uc.ListFinanceCreditNotes(ctx, biz.FinanceCreditNoteFilter{
		Status: "POSTED",
		Limit:  20,
	})
	if err != nil || total != 1 || len(listedCredits) != 1 {
		t.Fatalf("list credit notes=%#v total=%d err=%v", listedCredits, total, err)
	}
	assertFinanceCreditProjection(t, listedCredits[0], fact, wantOutstanding)
}

func assertFinanceAllocationProjection(
	t *testing.T,
	allocations []*biz.FinanceAllocation,
	fact *biz.FinanceFact,
	wantOutstanding decimal.Decimal,
) {
	t.Helper()
	if len(allocations) != 1 {
		t.Fatalf("allocations=%#v want one", allocations)
	}
	allocation := allocations[0]
	if allocation.FinanceFactNo != fact.FactNo ||
		allocation.FinanceFactType != fact.FactType ||
		!allocation.FinanceFactOriginalAmount.Equal(fact.Amount) ||
		!allocation.FinanceFactOutstandingAmount.Equal(wantOutstanding) {
		t.Fatalf("allocation projection=%#v fact=%#v want outstanding=%s", allocation, fact, wantOutstanding)
	}
}

func assertFinanceCreditProjection(
	t *testing.T,
	credit *biz.FinanceCreditNote,
	fact *biz.FinanceFact,
	wantOutstanding decimal.Decimal,
) {
	t.Helper()
	if credit == nil ||
		credit.FinanceFactNo != fact.FactNo ||
		credit.FinanceFactType != fact.FactType ||
		!credit.FinanceFactOriginalAmount.Equal(fact.Amount) ||
		!credit.FinanceFactOutstandingAmount.Equal(wantOutstanding) {
		t.Fatalf("credit projection=%#v fact=%#v want outstanding=%s", credit, fact, wantOutstanding)
	}
}

func TestSalesReturnReadProjectionUsesSourceAndMasterDataInBatches(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "sales_return_read_projection")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	product := client.Product.GetX(ctx, fixtures.productID)
	warehouse := client.Warehouse.GetX(ctx, fixtures.warehouseID)
	unit := client.Unit.GetX(ctx, fixtures.unitID)
	sku := client.ProductSKU.Create().
		SetProductID(product.ID).
		SetSkuCode("SKU-RMA-PROJECTION").
		SetSkuName("退货投影规格").
		SaveX(ctx)
	customer := client.Customer.Create().
		SetCode("C-RMA-PROJECTION").
		SetName("退货投影客户").
		SetIsActive(true).
		SaveX(ctx)
	shipment := client.Shipment.Create().
		SetShipmentNo("SHP-RMA-PROJECTION").
		SetCustomerID(customer.ID).
		SetCustomerSnapshot(customer.Name).
		SetStatus(biz.ShipmentStatusShipped).
		SetIdempotencyKey("shipment-rma-projection").
		SaveX(ctx)
	sourceQuantity := decimal.RequireFromString("5.500001")
	shipmentItem := client.ShipmentItem.Create().
		SetShipmentID(shipment.ID).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetQuantity(sourceQuantity).
		SaveX(ctx)

	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	firstQuantity := decimal.RequireFromString("1.200001")
	first, err := uc.CreateSalesReturn(ctx, &biz.SalesReturnCreate{
		ReturnNo:       "RMA-PROJECTION-1",
		ShipmentID:     shipment.ID,
		Reason:         "第一笔退货",
		IdempotencyKey: "rma-projection-1",
		Items: []biz.SalesReturnItemCreate{{
			ShipmentItemID: shipmentItem.ID,
			Quantity:       firstQuantity,
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create first return: %v", err)
	}
	secondQuantity := decimal.RequireFromString("0.300002")
	second, err := uc.CreateSalesReturn(ctx, &biz.SalesReturnCreate{
		ReturnNo:       "RMA-PROJECTION-2",
		ShipmentID:     shipment.ID,
		Reason:         "第二笔退货",
		IdempotencyKey: "rma-projection-2",
		Items: []biz.SalesReturnItemCreate{{
			ShipmentItemID: shipmentItem.ID,
			Quantity:       secondQuantity,
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create second return: %v", err)
	}

	activeReturned := firstQuantity.Add(secondQuantity)
	remaining := sourceQuantity.Sub(activeReturned)
	gotFirst, err := uc.GetSalesReturn(ctx, first.ID)
	if err != nil {
		t.Fatalf("get first return: %v", err)
	}
	assertSalesReturnReadProjection(
		t,
		gotFirst,
		shipment.ShipmentNo,
		product.Code,
		product.Name,
		sku.SkuCode,
		*sku.SkuName,
		warehouse.Code,
		warehouse.Name,
		unit.Code,
		unit.Name,
		sourceQuantity,
		activeReturned,
		remaining,
	)

	listed, total, err := uc.ListSalesReturns(ctx, biz.SalesReturnFilter{Limit: 20})
	if err != nil || total != 2 || len(listed) != 2 {
		t.Fatalf("list returns=%#v total=%d err=%v", listed, total, err)
	}
	for _, item := range listed {
		assertSalesReturnReadProjection(
			t,
			item,
			shipment.ShipmentNo,
			product.Code,
			product.Name,
			sku.SkuCode,
			*sku.SkuName,
			warehouse.Code,
			warehouse.Name,
			unit.Code,
			unit.Name,
			sourceQuantity,
			activeReturned,
			remaining,
		)
	}

	if _, err := uc.CancelSalesReturn(ctx, &biz.SalesReturnTransition{
		ID:              second.ID,
		ExpectedVersion: second.Version,
		Reason:          "取消第二笔",
	}, 9); err != nil {
		t.Fatalf("cancel second return: %v", err)
	}
	gotFirst, err = uc.GetSalesReturn(ctx, first.ID)
	if err != nil {
		t.Fatalf("get first after cancellation: %v", err)
	}
	assertSalesReturnReadProjection(
		t,
		gotFirst,
		shipment.ShipmentNo,
		product.Code,
		product.Name,
		sku.SkuCode,
		*sku.SkuName,
		warehouse.Code,
		warehouse.Name,
		unit.Code,
		unit.Name,
		sourceQuantity,
		firstQuantity,
		sourceQuantity.Sub(firstQuantity),
	)
}

func assertSalesReturnReadProjection(
	t *testing.T,
	item *biz.SalesReturn,
	shipmentNo string,
	productCode string,
	productName string,
	skuCode string,
	skuName string,
	warehouseCode string,
	warehouseName string,
	unitCode string,
	unitName string,
	sourceQuantity decimal.Decimal,
	activeReturned decimal.Decimal,
	remaining decimal.Decimal,
) {
	t.Helper()
	if item == nil || item.ShipmentNo != shipmentNo || len(item.Items) != 1 {
		t.Fatalf("return projection=%#v", item)
	}
	line := item.Items[0]
	if line.ProductCode != productCode ||
		line.ProductName != productName ||
		line.ProductSkuCode == nil ||
		*line.ProductSkuCode != skuCode ||
		line.ProductSkuName == nil ||
		*line.ProductSkuName != skuName ||
		line.WarehouseCode != warehouseCode ||
		line.WarehouseName != warehouseName ||
		line.UnitCode != unitCode ||
		line.UnitName != unitName ||
		line.LotNo == nil ||
		*line.LotNo == "" ||
		!line.SourceShippedQuantity.Equal(sourceQuantity) ||
		!line.ActiveReturnedQuantity.Equal(activeReturned) ||
		!line.RemainingReturnableQuantity.Equal(remaining) {
		t.Fatalf(
			"line projection=%#v want source=%s active=%s remaining=%s",
			line,
			sourceQuantity,
			activeReturned,
			remaining,
		)
	}
}
