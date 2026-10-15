package data

import (
	"context"
	"fmt"
	"io"
	"reflect"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func assertBusinessCounts(t *testing.T, got map[string]int, err error, want map[string]int) {
	t.Helper()
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("counts=%v err=%v want=%v", got, err, want)
	}
}

func TestBusinessStatusCountsSourceOrderScopeAndPagination(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "business_status_counts_source")
	logger := log.NewStdLogger(io.Discard)
	customer := createSalesOrderTestCustomer(t, ctx, client, "COUNT-C", true)
	otherCustomer := createSalesOrderTestCustomer(t, ctx, client, "COUNT-OTHER-C", true)
	supplier := client.Supplier.Create().SetCode("COUNT-S").SetName("统计供应商").SaveX(ctx)
	otherSupplier := client.Supplier.Create().SetCode("COUNT-OTHER-S").SetName("其他供应商").SaveX(ctx)
	date := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)
	for index, status := range []string{"draft", "draft", "submitted", "closed", "canceled"} {
		no := fmt.Sprintf("MATCH-%d", index)
		client.SalesOrder.Create().SetOrderNo(no).SetCustomerID(customer.ID).SetOrderDate(date).SetLifecycleStatus(status).SaveX(ctx)
		client.PurchaseOrder.Create().SetPurchaseOrderNo(no).SetSupplierID(supplier.ID).SetPurchaseDate(date).SetLifecycleStatus(status).SaveX(ctx)
		client.OutsourcingOrder.Create().SetOutsourcingOrderNo(no).SetSupplierID(supplier.ID).SetOrderDate(date).SetLifecycleStatus(status).SaveX(ctx)
	}
	for index, ids := range [][2]int{{customer.ID, supplier.ID}, {otherCustomer.ID, otherSupplier.ID}} {
		client.SalesOrder.Create().SetOrderNo(fmt.Sprintf("OTHER-%d", index)).SetCustomerID(ids[0]).SetOrderDate(date).SaveX(ctx)
		client.PurchaseOrder.Create().SetPurchaseOrderNo(fmt.Sprintf("OTHER-%d", index)).SetSupplierID(ids[1]).SetPurchaseDate(date).SaveX(ctx)
		client.OutsourcingOrder.Create().SetOutsourcingOrderNo(fmt.Sprintf("OTHER-%d", index)).SetSupplierID(ids[1]).SetOrderDate(date).SaveX(ctx)
	}
	sales := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	purchase := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, logger))
	outsourcing := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(data, logger))
	for _, scope := range []struct {
		name string
		want map[string]int
	}{
		{"current", map[string]int{"draft": 2, "submitted": 1}},
		{"history", map[string]int{"closed": 1, "canceled": 1}},
		{"all", map[string]int{"draft": 2, "submitted": 1, "closed": 1, "canceled": 1}},
	} {
		t.Run(scope.name, func(t *testing.T) {
			// A selected status and an offset beyond the result must not truncate any group.
			selected := "draft"
			if scope.name == "history" {
				selected = "closed"
			}
			sf := biz.SalesOrderFilter{Keyword: "MATCH", CustomerID: customer.ID, LifecycleScope: scope.name, LifecycleStatus: selected, DateField: "order_date", DateFrom: &date, DateTo: &date, Limit: 1, Offset: 200}
			got, err := sales.CountSalesOrdersByStatus(ctx, sf)
			assertBusinessCounts(t, got, err, scope.want)
			got, err = purchase.CountPurchaseOrdersByStatus(ctx, biz.PurchaseOrderFilter{Keyword: "MATCH", SupplierID: supplier.ID, LifecycleScope: scope.name, LifecycleStatus: selected, DateField: "purchase_date", DateFrom: &date, DateTo: &date, Limit: 1, Offset: 200})
			assertBusinessCounts(t, got, err, scope.want)
			got, err = outsourcing.CountOutsourcingOrdersByStatus(ctx, biz.OutsourcingOrderFilter{Keyword: "MATCH", SupplierID: supplier.ID, LifecycleScope: scope.name, LifecycleStatus: selected, DateField: "order_date", DateFrom: &date, DateTo: &date, Limit: 1, Offset: 200})
			assertBusinessCounts(t, got, err, scope.want)
		})
	}
	got, err := sales.CountSalesOrdersByStatus(ctx, biz.SalesOrderFilter{CustomerID: otherCustomer.ID})
	assertBusinessCounts(t, got, err, map[string]int{"draft": 1})
	tomorrow := date.AddDate(0, 0, 1)
	got, err = sales.CountSalesOrdersByStatus(ctx, biz.SalesOrderFilter{DateField: "order_date", DateFrom: &tomorrow})
	assertBusinessCounts(t, got, err, map[string]int{})
}

func TestBusinessStatusCountsProductionAndShipments(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "business_status_counts_production")
	for index := 0; index < 3; index++ {
		key := fmt.Sprintf("COUNT-MO-%d", index)
		row, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft(key, 1), ActorID: f.actorID, IdempotencyKey: key})
		if err != nil {
			t.Fatal(err)
		}
		if index == 2 {
			reason := "模拟取消"
			_, err = f.uc.Cancel(ctx, &biz.ProductionOrderAction{ID: row.Order.ID, ExpectedVersion: row.Order.Version, ActorID: f.actorID, IdempotencyKey: key + "-cancel", Reason: &reason})
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	got, err := f.uc.CountProductionOrdersByStatus(ctx, biz.ProductionOrderFilter{Status: "DRAFT", Keyword: "COUNT-MO", Limit: 1, Offset: 100})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 2, "CANCELLED": 1})
	repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	counter := repo
	date := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)
	for index := 0; index < 3; index++ {
		planned := date.AddDate(0, 0, index)
		no := fmt.Sprintf("COUNT-SHIP-%d", index)
		clientRow := f.client.Shipment.Create().SetShipmentNo(no).SetPlannedShipAt(planned).SetIdempotencyKey(no)
		clientRow.SaveX(ctx)
	}
	got, err = counter.CountShipmentsByStatus(ctx, biz.OperationalFactFilter{Status: "SHIPPED", Keyword: "COUNT-SHIP", DateField: "planned_ship_at", DateFrom: &date, DateTo: &date, Limit: 1, Offset: 100})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 1})
}

func TestBusinessStatusCountsQualityScopes(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "business_status_counts_quality")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	for index := 0; index < 3; index++ {
		no := fmt.Sprintf("COUNT-QI-%d", index)
		receipt := createAndPostPurchaseReceipt(t, ctx, uc, no+"-RCV", fixtures, stringPtr(no+"-LOT"), decimal.NewFromInt(10))
		row := createQualityInspectionDraftFromReceipt(t, ctx, uc, "TARGET-"+no, receipt, fixtures)
		if index == 2 {
			if _, err := uc.SubmitQualityInspection(ctx, row.ID); err != nil {
				t.Fatal(err)
			}
		}
	}
	filter := biz.QualityInspectionFilter{Status: "DRAFT", Keyword: "TARGET-COUNT-QI", Limit: 1, Offset: 100}
	got, err := uc.CountQualityInspectionsByStatus(ctx, filter)
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 2, "SUBMITTED": 1})
	for name, count := range map[string]func(context.Context, biz.QualityInspectionFilter) (map[string]int, error){
		"finished":    uc.CountFinishedGoodsQualityInspectionsByStatus,
		"outsourcing": uc.CountOutsourcingReturnQualityInspectionsByStatus,
		"production":  uc.CountProductionStageQualityInspectionsByStatus,
	} {
		t.Run(name, func(t *testing.T) {
			got, err := count(ctx, filter)
			assertBusinessCounts(t, got, err, map[string]int{})
		})
	}
}

func TestBusinessStatusCountsFinancePermissionAndFilters(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "business_status_counts_finance")
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	actor := client.AdminUser.Create().SetUsername("counts-finance-actor").SetPasswordHash("test-only").SaveX(ctx)
	customer := createSalesOrderTestCustomer(t, ctx, client, "COUNT-FIN-C", true)
	date := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)
	for index, kind := range []string{biz.FinanceFactReceivable, biz.FinanceFactReceivable, biz.FinanceFactPayable} {
		no := fmt.Sprintf("COUNT-FIN-%d", index)
		counterparty := biz.FinanceCounterpartyCustomer
		if kind == biz.FinanceFactPayable {
			counterparty = biz.FinanceCounterpartySupplier
		}
		client.FinanceFact.Create().SetFactNo(no).SetFactType(kind).SetCounterpartyType(counterparty).SetCounterpartyID(customer.ID).
			SetAmount(decimal.NewFromInt(1)).SetFeeAmount(decimal.Zero).SetCurrency("CNY").SetOccurredAt(date).
			SetPaymentTerm(biz.FinancePaymentTermDueOnOccurrence).SetPaymentTermDays(0).SetDueAt(date).
			SetSourceType(biz.ShipmentSourceType).SetSourceID(index + 1001).SetIdempotencyKey(no).SaveX(ctx)
	}
	filter := biz.OperationalFactFilter{Status: "POSTED", Keyword: "COUNT-FIN", Limit: 1, Offset: 100}
	got, err := uc.CountFinanceFactsByStatusForAccess(ctx, filter, biz.FinanceFactAccessScope{Receivable: true})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 2})
	got, err = uc.CountFinanceFactsByStatusForAccess(ctx, filter, biz.FinanceFactAccessScope{Payable: true})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 1})
	filter.SourceID = 1002
	got, err = uc.CountFinanceFactsByStatusForAccess(ctx, filter, biz.FinanceFactAccessScope{Receivable: true})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 1})
	got, err = repo.CountFinanceFactsByStatusForAccess(ctx, filter, biz.FinanceFactAccessScope{})
	assertBusinessCounts(t, got, err, map[string]int{})
	for index := 0; index < 2; index++ {
		no := fmt.Sprintf("COUNT-PAY-%d", index)
		_, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: no, Direction: biz.FinancePaymentDirectionReceipt,
			CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.NewFromInt(1), Currency: "CNY", AccountRef: "TEST", EvidenceRef: "TEST", IdempotencyKey: no}, actor.ID)
		if err != nil {
			t.Fatal(err)
		}
	}
	got, err = uc.CountFinancePaymentsByStatus(ctx, biz.FinancePaymentFilter{Status: "POSTED", Keyword: "COUNT-PAY", Direction: biz.FinancePaymentDirectionReceipt, Limit: 1, Offset: 100})
	assertBusinessCounts(t, got, err, map[string]int{"DRAFT": 2})
	got, err = uc.CountFinancePaymentsByStatus(ctx, biz.FinancePaymentFilter{Direction: biz.FinancePaymentDirectionDisbursement})
	assertBusinessCounts(t, got, err, map[string]int{})
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-COUNT-CREDIT", 100)
	credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "CN-COUNT", FinanceFactID: fact.ID, Amount: decimal.NewFromInt(10), Reason: "模拟折让", IdempotencyKey: "CN-COUNT"}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	reverser := client.AdminUser.Create().SetUsername("counts-credit-reverser").SetPasswordHash("test-only").SaveX(ctx)
	if _, err = uc.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: credit.ID, CreditNoteNo: "CN-COUNT-R", Reason: "模拟撤销", IdempotencyKey: "CN-COUNT-R"}, reverser.ID); err != nil {
		t.Fatal(err)
	}
	got, err = uc.CountFinanceCreditNotesByStatus(ctx, biz.FinanceCreditNoteFilter{Status: "POSTED", FinanceFactID: fact.ID, Limit: 1, Offset: 100})
	assertBusinessCounts(t, got, err, map[string]int{"POSTED": 1, "REVERSED": 1})
	got, err = uc.CountFinanceCreditNotesByStatus(ctx, biz.FinanceCreditNoteFilter{FinanceFactID: fact.ID + 100})
	assertBusinessCounts(t, got, err, map[string]int{})
}
