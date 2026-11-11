package data

import (
	"context"
	"fmt"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"

	"server/internal/biz"
)

func TestBusinessListFinanceAmountSorting(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_amount_sort")
	customer := client.Customer.Create().SetCode("C-SORT").SetName("排序客户").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("amount-sort").SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "AR-AMOUNT-SORT", 100)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for i, value := range []struct{ amount, currency string }{{"2.5", "CNY"}, {"10.25", "CNY"}, {"2.5", "CNY"}, {"1", "USD"}} {
		no := fmt.Sprintf("PAY-SORT-%d", i)
		amount := decimal.RequireFromString(value.amount)
		if _, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{
			PaymentNo: no, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer,
			CounterpartyID: customer.ID, Currency: value.currency, Amount: amount, AccountRef: "BANK", EvidenceRef: "FLOW", IdempotencyKey: no,
		}, actor.ID); err != nil {
			t.Fatal(err)
		}
		if value.currency == fact.Currency {
			no = fmt.Sprintf("CN-SORT-%d", i)
			if _, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{
				CreditNoteNo: no, FinanceFactID: fact.ID, Amount: amount, Reason: "测试排序", IdempotencyKey: no,
			}, actor.ID); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, tc := range []struct {
		direction string
		order     []int
	}{{"asc", []int{2, 0, 1, 3}}, {"desc", []int{1, 2, 0, 3}}} {
		for offset, i := range tc.order {
			payments, total, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{Keyword: "PAY-SORT", SortBy: biz.FinanceRecordSortAmount, SortDirection: tc.direction, Limit: 1, Offset: offset})
			if err != nil || total != 4 || len(payments) != 1 || payments[0].PaymentNo != fmt.Sprintf("PAY-SORT-%d", i) {
				t.Fatalf("payments %s offset=%d total=%d rows=%v err=%v want=%d", tc.direction, offset, total, payments, err, i)
			}
			if i == 3 {
				continue
			}
			credits, total, err := uc.ListFinanceCreditNotes(ctx, biz.FinanceCreditNoteFilter{FinanceFactID: fact.ID, SortBy: biz.FinanceRecordSortAmount, SortDirection: tc.direction, Limit: 1, Offset: offset})
			if err != nil || total != 3 || len(credits) != 1 || credits[0].CreditNoteNo != fmt.Sprintf("CN-SORT-%d", i) {
				t.Fatalf("credits %s offset=%d total=%d rows=%v err=%v want=%d", tc.direction, offset, total, credits, err, i)
			}
		}
	}
}

func TestBusinessListShipmentWeightSorting(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_weight_sort")
	fixture := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for i, weight := range []string{"2.25", "10.125", "", "2.25"} {
		var total *decimal.Decimal
		if weight != "" {
			value := decimal.RequireFromString(weight)
			total = &value
		}
		no := fmt.Sprintf("SHIP-WEIGHT-SORT-%d", i)
		if _, err := uc.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{ShipmentNo: no, IdempotencyKey: no, TotalNetWeightG: total},
			Items:    []*biz.ShipmentItemCreate{{ProductID: fixture.productID, WarehouseID: fixture.productWarehouseID, UnitID: fixture.unitID, Quantity: decimal.NewFromInt(1)}},
		}); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		direction string
		order     []int
	}{{"asc", []int{3, 0, 1, 2}}, {"desc", []int{1, 3, 0, 2}}} {
		for offset, i := range tc.order {
			rows, total, err := uc.ListShipments(ctx, biz.OperationalFactFilter{Keyword: "SHIP-WEIGHT-SORT", SortBy: biz.ShipmentSortNetWeight, SortDirection: tc.direction, Limit: 1, Offset: offset})
			if err != nil || total != 4 || len(rows) != 1 || rows[0].ShipmentNo != fmt.Sprintf("SHIP-WEIGHT-SORT-%d", i) {
				t.Fatalf("shipments %s offset=%d total=%d rows=%v err=%v want=%d", tc.direction, offset, total, rows, err, i)
			}
		}
	}
}
