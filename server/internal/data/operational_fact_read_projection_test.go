package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestCalculateFinanceFactOutstandingFailsClosed(t *testing.T) {
	outstanding, err := calculateFinanceFactOutstanding(
		decimal.NewFromInt(100),
		decimal.NewFromInt(70),
		decimal.NewFromInt(30),
	)
	if err != nil {
		t.Fatalf("calculate exact zero outstanding: %v", err)
	}
	if !outstanding.IsZero() {
		t.Fatalf("exact zero outstanding=%s", outstanding)
	}
	if _, err := calculateFinanceFactOutstanding(
		decimal.NewFromInt(100),
		decimal.NewFromInt(100),
		decimal.NewFromInt(1),
	); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("overconsumed outstanding error=%v want ErrBadParam", err)
	}
}

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

func TestStockReservationReadProjectionUsesOneScopedAuthoritativeSnapshot(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "stock_reservation_read_projection")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	product := client.Product.GetX(ctx, fixtures.productID)
	warehouse := client.Warehouse.GetX(ctx, fixtures.warehouseID)
	unit := client.Unit.GetX(ctx, fixtures.unitID)
	sku := client.ProductSKU.Create().
		SetProductID(product.ID).
		SetSkuCode("SKU-RESERVATION-PROJECTION").
		SetSkuName("蓝色规格").
		SetDefaultUnitID(unit.ID).
		SaveX(ctx)
	customer := client.Customer.Create().
		SetCode("C-RESERVATION-PROJECTION").
		SetName("库存预留投影客户").
		SetIsActive(true).
		SaveX(ctx)
	order := client.SalesOrder.Create().
		SetOrderNo("SO-RESERVATION-PROJECTION").
		SetCustomerID(customer.ID).
		SetCustomerSnapshot(map[string]any{"name": customer.Name}).
		SetOrderDate(time.Now()).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	orderItem := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(711).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(decimal.RequireFromString("1.000002")).
		SetLineStatus(biz.SalesOrderItemStatusOpen).
		SaveX(ctx)
	lot := client.InventoryLot.Create().
		SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(product.ID).
		SetProductSkuID(sku.ID).
		SetLotNo("LOT-RESERVATION-PROJECTION").
		SetStatus(biz.InventoryLotActive).
		SaveX(ctx)
	first := client.StockReservation.Create().
		SetReservationNo("RSV-PROJECTION-A").
		SetStatus(biz.StockReservationStatusActive).
		SetSalesOrderID(order.ID).
		SetSalesOrderItemID(orderItem.ID).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetInventoryLotID(lot.ID).
		SetQuantity(decimal.RequireFromString("0.000001")).
		SetIdempotencyKey("reservation-projection-a").
		SaveX(ctx)
	client.StockReservation.Create().
		SetReservationNo("RSV-PROJECTION-B").
		SetStatus(biz.StockReservationStatusReleased).
		SetSalesOrderID(order.ID).
		SetSalesOrderItemID(orderItem.ID).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetInventoryLotID(lot.ID).
		SetQuantity(decimal.RequireFromString("1.000001")).
		SetIdempotencyKey("reservation-projection-b").
		SetReleasedAt(time.Now()).
		SaveX(ctx)

	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	fullScope := biz.StockReservationReadScope{
		IncludeSalesOrderReferences: true,
		IncludeInventoryReferences:  true,
	}
	items, total, err := uc.ListStockReservationsForAccess(ctx, biz.OperationalFactFilter{
		Status: biz.StockReservationStatusActive,
		Limit:  20,
	}, fullScope)
	if err != nil || total != 1 || len(items) != 1 {
		t.Fatalf("full projection items=%#v total=%d err=%v", items, total, err)
	}
	got := items[0]
	if got.ID != first.ID ||
		got.SalesOrderNo == nil || *got.SalesOrderNo != order.OrderNo ||
		got.SalesOrderLineNo == nil || *got.SalesOrderLineNo != orderItem.LineNo ||
		got.ProductCode != product.Code || got.ProductName != product.Name ||
		got.ProductSkuCode == nil || *got.ProductSkuCode != sku.SkuCode ||
		got.ProductSkuName == nil || *got.ProductSkuName != *sku.SkuName ||
		got.WarehouseCode != warehouse.Code || got.WarehouseName != warehouse.Name ||
		got.UnitCode != unit.Code || got.UnitName != unit.Name ||
		got.LotNo == nil || *got.LotNo != lot.LotNo ||
		!got.Quantity.Equal(decimal.RequireFromString("0.000001")) {
		t.Fatalf("unexpected full stock reservation projection: %#v", got)
	}

	redacted, total, err := uc.ListStockReservationsForAccess(ctx, biz.OperationalFactFilter{
		Status: biz.StockReservationStatusActive,
		Limit:  20,
	}, biz.StockReservationReadScope{})
	if err != nil || total != 1 || len(redacted) != 1 {
		t.Fatalf("redacted projection items=%#v total=%d err=%v", redacted, total, err)
	}
	if redacted[0].SalesOrderNo != nil ||
		redacted[0].SalesOrderLineNo != nil ||
		redacted[0].ProductCode != "" ||
		redacted[0].ProductSkuCode != nil ||
		redacted[0].WarehouseCode != "" ||
		redacted[0].UnitCode != "" ||
		redacted[0].LotNo != nil {
		t.Fatalf("redacted projection leaked readable references: %#v", redacted[0])
	}

	for _, keyword := range []string{
		order.OrderNo,
		"711",
		product.Code,
		product.Name,
		sku.SkuCode,
		*sku.SkuName,
		warehouse.Code,
		warehouse.Name,
		unit.Code,
		unit.Name,
		lot.LotNo,
	} {
		found, keywordTotal, keywordErr := uc.ListStockReservationsForAccess(ctx, biz.OperationalFactFilter{
			Keyword: keyword,
			Limit:   20,
		}, fullScope)
		if keywordErr != nil || keywordTotal != 2 || len(found) != 2 {
			t.Fatalf("keyword %q items=%#v total=%d err=%v", keyword, found, keywordTotal, keywordErr)
		}
	}
	for _, hiddenKeyword := range []string{order.OrderNo, product.Code, lot.LotNo} {
		found, keywordTotal, keywordErr := uc.ListStockReservationsForAccess(ctx, biz.OperationalFactFilter{
			Keyword: hiddenKeyword,
			Limit:   20,
		}, biz.StockReservationReadScope{})
		if keywordErr != nil || keywordTotal != 0 || len(found) != 0 {
			t.Fatalf("redacted keyword %q items=%#v total=%d err=%v", hiddenKeyword, found, keywordTotal, keywordErr)
		}
	}
	empty, emptyTotal, err := uc.ListStockReservationsForAccess(ctx, biz.OperationalFactFilter{
		Keyword: "NO-SUCH-RESERVATION",
		Limit:   20,
	}, fullScope)
	if err != nil || emptyTotal != 0 || len(empty) != 0 {
		t.Fatalf("empty projection items=%#v total=%d err=%v", empty, emptyTotal, err)
	}
	paged, pagedTotal, err := uc.ListStockReservationsForAccess(ctx, biz.OperationalFactFilter{
		Limit:  1,
		Offset: 1,
	}, fullScope)
	if err != nil || pagedTotal != 2 || len(paged) != 1 || paged[0].ID != first.ID {
		t.Fatalf("paged projection items=%#v total=%d err=%v", paged, pagedTotal, err)
	}
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
