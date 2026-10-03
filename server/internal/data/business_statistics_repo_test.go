package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func statisticsDeliveryFixture(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	unit := createSalesOrderTestUnit(t, ctx, client, "STAT-PCS", true)
	box := createSalesOrderTestUnit(t, ctx, client, "STAT-BOX", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "STAT-BEAR", true)
	warehouse := createTestProductWarehouse(t, ctx, client, "STAT-WH")
	due := time.Date(2026, 10, 1, 16, 0, 0, 0, time.UTC) // October 2 in China.
	for i := 0; i < 3; i++ {
		customer := createSalesOrderTestCustomer(t, ctx, client, fmt.Sprintf("STAT-%d", i), true)
		client.Customer.UpdateOneID(customer.ID).SetName("STAT-同名客户").SaveX(ctx)
		order := client.SalesOrder.Create().SetOrderNo(fmt.Sprintf("STAT-SO-%d", i)).SetCustomerID(customer.ID).SetOrderDate(due).SetPlannedDeliveryDate(due).SetLifecycleStatus("active").SetCurrency("CNY").SetOrderTotal(decimal.RequireFromString("100.01")).SaveX(ctx)
		line := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(10)).SetAmount(decimal.RequireFromString("80.01")).SaveX(ctx)
		switch i {
		case 0:
			shipment := client.Shipment.Create().SetShipmentNo("STAT-SHIPPED").SetSalesOrderID(order.ID).SetStatus("SHIPPED").SetIdempotencyKey("stat-shipped").SaveX(ctx)
			client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetSalesOrderItemID(line.ID).SetProductID(product.ID).SetWarehouseID(warehouse.ID).SetUnitID(unit.ID).SetQuantity(decimal.NewFromInt(10)).SetAmountSnapshot(decimal.RequireFromString("80.01")).SetCurrencySnapshot("CNY").SaveX(ctx)
		case 1:
			client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(2).SetRequestedProductName("STAT-未建档产品").SetUnitID(box.ID).SetOrderedQuantity(decimal.NewFromInt(2)).SaveX(ctx)
			shipment := client.Shipment.Create().SetShipmentNo("STAT-CANCELLED").SetSalesOrderID(order.ID).SetStatus("CANCELLED").SetIdempotencyKey("stat-cancelled").SaveX(ctx)
			client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetSalesOrderItemID(line.ID).SetProductID(product.ID).SetWarehouseID(warehouse.ID).SetUnitID(unit.ID).SetQuantity(decimal.NewFromInt(10)).SaveX(ctx)
		default:
			client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus("closed").SaveX(ctx)
		}
	}
}

func assertStatisticsDelivery(t *testing.T, data *Data, client *ent.Client, keyword string) {
	t.Helper()
	statisticsDeliveryFixture(t, data, client)
	ctx := context.Background()
	uc := biz.NewBusinessStatisticsUsecase(NewBusinessStatisticsRepo(data))
	q := biz.BusinessStatisticsQuery{Period: "all", Keyword: keyword, Limit: 1, SnapshotAt: time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC), Access: biz.BusinessStatisticsAccess{Sales: true, SalesAmounts: true}}
	board, err := uc.Board(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if board.Total != 3 || len(board.Groups) != 1 || board.Totals.Count != 3 || board.Totals.Done != 1 || board.Totals.Pending != 1 || board.Totals.Closed != 1 || board.Totals.Overdue != 1 || board.Totals.Amount == nil || *board.Totals.Amount != "300.03" || *board.Totals.ShippedAmount != "80.01" {
		t.Fatalf("board=%+v metrics=%+v amount=%v shipped=%v", board, board.Totals, board.Totals.Amount, board.Totals.ShippedAmount)
	}
	q.Status = "overdue"
	board, err = uc.Board(ctx, q)
	if err != nil || board.Totals.Count != 1 || board.Counts.Count != 3 {
		t.Fatalf("filtered=%+v %v", board, err)
	}
	q.GroupKey = board.Groups[0].Key
	sources, err := uc.Sources(ctx, q)
	if err != nil || sources.Total != 1 || sources.Rows[0].OrderedQuantity != nil || sources.Rows[0].ShippedQuantity != nil || sources.Rows[0].Unit != "" {
		t.Fatalf("mixed unit=%+v %v", sources, err)
	}
	q.GroupKey = ""
	q.Status = "all"
	q.GroupBy = "product"
	board, err = uc.Board(ctx, q)
	if err != nil || board.Total != 2 || board.Totals.Count != 3 || board.Totals.Amount != nil || board.Totals.MissingAmount != 1 {
		t.Fatalf("products=%+v %v", board, err)
	}
	q.GroupKey = board.Groups[0].Key
	q.Limit = 100
	sources, err = uc.Sources(ctx, q)
	if err != nil || sources.Total != board.Groups[0].Count || len(sources.Rows) != 3 {
		t.Fatalf("product sources=%+v %v", sources, err)
	}
	q.GroupKey = ""
	q.GroupBy = "customer"
	q.Access.SalesAmounts = false
	board, err = uc.Board(ctx, q)
	if err != nil || board.Totals.Amount != nil || board.Totals.ShippedAmount != nil {
		t.Fatalf("restricted=%+v %v", board, err)
	}
	q.Keyword = "%' OR 1=1 --"
	board, err = uc.Board(ctx, q)
	if err != nil || board.Total != 0 {
		t.Fatalf("literal search=%+v %v", board, err)
	}
	q.Keyword = keyword
	q.Period = "custom"
	q.DateFrom = "2026-10-02"
	q.DateTo = "2026-10-02"
	board, err = uc.Board(ctx, q)
	if err != nil || board.Totals.Count != 3 {
		t.Fatalf("China day=%+v %v", board, err)
	}
}

func TestBusinessStatisticsDelivery(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "business_statistics")
	assertStatisticsDelivery(t, data, client, "")
}

func TestBusinessDocumentSearchPostgresStatisticsDelivery(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	// PostgreSQL 矩阵共用迁移库，按本场景单号限定统计范围。
	assertStatisticsDelivery(t, data, client, "STAT-")
}

func assertStatisticsReceivableAging(t *testing.T, data *Data, client *ent.Client, keyword string) {
	t.Helper()
	ctx := context.Background()
	customer := createSalesOrderTestCustomer(t, ctx, client, "STAT-FIN", true)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "STAT-AR", 100)
	uc := biz.NewBusinessStatisticsUsecase(NewBusinessStatisticsRepo(data))
	for _, test := range []struct {
		days   int
		status string
	}{{0, "not_due"}, {1, "late_7"}, {7, "late_7"}, {8, "late_30"}, {30, "late_30"}, {31, "late_60"}, {60, "late_60"}, {61, "late_more"}} {
		q := biz.BusinessStatisticsQuery{Report: "receivables", Keyword: keyword, Status: test.status, SnapshotAt: fact.DueAt.AddDate(0, 0, test.days), Access: biz.BusinessStatisticsAccess{Receivables: true}}
		board, err := uc.Board(ctx, q)
		if err != nil || board.Total != 1 || board.Totals.Balance == nil || *board.Totals.Balance != "100" {
			t.Fatalf("bucket %s=%+v %v", test.status, board, err)
		}
		q.GroupKey = board.Groups[0].Key
		sources, err := uc.Sources(ctx, q)
		if err != nil || sources.Total != 1 || sources.Rows[0].Status != test.status || sources.Rows[0].SourceNumber == "" {
			t.Fatalf("sources=%+v %v", sources, err)
		}
	}
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	actor := client.AdminUser.Create().SetUsername("statistics-credit-actor").SetPasswordHash("fixture").SaveX(ctx)
	ucFinance := biz.NewOperationalFactUsecase(repo)
	credit, err := ucFinance.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "STAT-CN", FinanceFactID: fact.ID, Amount: decimal.RequireFromString("0.3"), Reason: "模拟折让", IdempotencyKey: "STAT-CN"}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	q := biz.BusinessStatisticsQuery{Report: "receivables", Keyword: keyword, SnapshotAt: fact.DueAt.AddDate(0, 0, 2), Access: biz.BusinessStatisticsAccess{Receivables: true}}
	board, err := uc.Board(ctx, q)
	if err != nil || *board.Totals.Balance != "99.7" || *board.Totals.Late7 != "99.7" {
		t.Fatalf("credit=%+v %v", board, err)
	}
	_, err = ucFinance.ReverseFinanceCreditNote(ctx, &biz.FinanceCreditNoteReverse{CreditNoteID: credit.ID, CreditNoteNo: "STAT-CN-R", Reason: "撤销模拟折让", IdempotencyKey: "STAT-CN-R"}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	board, err = uc.Board(ctx, q)
	if err != nil || *board.Totals.Balance != "100" {
		t.Fatalf("reversal=%+v %v", board, err)
	}
	payment, err := ucFinance.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "STAT-PAY", Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.RequireFromString("30.01"), Currency: "CNY", AccountRef: "模拟银行", EvidenceRef: "模拟流水", IdempotencyKey: "STAT-PAY"}, actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	approver := client.AdminUser.Create().SetUsername("statistics-pay-approver").SetPasswordHash("fixture").SaveX(ctx)
	approved := approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	posted, err := repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: approved.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.RequireFromString("30.01")}}}, actor.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	board, err = uc.Board(ctx, q)
	if err != nil || *board.Totals.Balance != "69.99" {
		t.Fatalf("allocation=%+v %v", board, err)
	}
	outstanding, err := financeFactOutstandingAmounts(ctx, client, []*ent.FinanceFact{client.FinanceFact.GetX(ctx, fact.ID)})
	if err != nil || outstanding[fact.ID].String() != *board.Totals.Balance {
		t.Fatalf("ledger mismatch=%v %v", outstanding, err)
	}

	_, err = ucFinance.ReverseFinancePayment(ctx, &biz.FinancePaymentReverse{ID: posted.ID, ExpectedVersion: posted.Version, Reason: "撤销模拟收款"}, approver.ID)
	if err != nil {
		t.Fatal(err)
	}
	board, err = uc.Board(ctx, q)
	if err != nil || *board.Totals.Balance != "100" {
		t.Fatalf("allocation reversal=%+v %v", board, err)
	}

}

func TestBusinessStatisticsReceivableAging(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "statistics_receivable")
	assertStatisticsReceivableAging(t, data, client, "")
}
func TestBusinessDocumentSearchPostgresStatisticsReceivable(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	assertStatisticsReceivableAging(t, data, client, "STAT-FIN")
}
