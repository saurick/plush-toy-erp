package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSalesOrderDraftSQLTransactionRollsBackUpdatedItems(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "sales_draft_sql_transaction")
	verifySalesOrderDraftSQLTransaction(t, data, client)
}

func TestSalesOrderNumberPostgresDraftUpdateTransaction(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	verifySalesOrderDraftSQLTransaction(t, data, client)
}

func verifySalesOrderDraftSQLTransaction(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	suffix := postgresTestSuffix()
	customer := createSalesOrderTestCustomer(t, ctx, client, "TX-C-"+suffix, true)
	unit := createTestUnit(t, ctx, client, "TX-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "TX-P-"+suffix)
	price := decimal.NewFromInt(3)
	header := &biz.SalesOrderMutation{OrderNo: "TX-SO-" + suffix, CustomerID: customer.ID, OrderDate: time.Now(), Currency: biz.FinanceCurrencyCNY, TaxMode: stringPtr(biz.SalesOrderTaxModeNone), FreightTerms: stringPtr(biz.SalesOrderFreightTermsIncluded)}
	item := &biz.SalesOrderItemSaveMutation{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: decimal.NewFromInt(10), UnitPrice: &price}}
	draft, err := uc.SaveSalesOrderWithItems(ctx, 0, header, []*biz.SalesOrderItemSaveMutation{item})
	if err != nil {
		t.Fatal(err)
	}
	itemUpdates := 0
	injected := errors.New("simulated item write failure")
	failUpdate := true
	client.SalesOrderItem.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
			if mutation.Op().Is(ent.OpUpdateOne) {
				itemUpdates++
			}
			value, err := next.Mutate(ctx, mutation)
			if err == nil && failUpdate && mutation.Op().Is(ent.OpUpdateOne) {
				return nil, injected
			}
			return value, err
		})
	})
	header.ExpectedVersion = draft.Order.Version
	header.Note = stringPtr("核对后修改")
	item.ID = draft.Items[0].ID
	item.OrderedQuantity = decimal.NewFromInt(12)
	// A completed UpdateOne must stay in the outer transaction when a hook
	// rejects the save; retry must retain the same header and line identities.
	if _, err := uc.SaveSalesOrderWithItems(ctx, draft.Order.ID, header, []*biz.SalesOrderItemSaveMutation{item}); !errors.Is(err, injected) {
		t.Fatalf("item hook should reject the save after writing: %v", err)
	}
	if itemUpdates != 1 {
		t.Fatalf("transaction must invoke the registered item hook once: %d", itemUpdates)
	}
	stored := client.SalesOrder.GetX(ctx, draft.Order.ID)
	storedItem := client.SalesOrderItem.GetX(ctx, item.ID)
	if stored.Version != draft.Order.Version || stored.Note != nil || stored.OrderTotal == nil || !stored.OrderTotal.Equal(decimal.NewFromInt(30)) || !storedItem.OrderedQuantity.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("failed aggregate save left partial changes: order=%+v item=%+v", stored, storedItem)
	}
	if count := client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(stored.ID)).CountX(ctx); count != 1 {
		t.Fatalf("failed save left %d items", count)
	}
	failUpdate = false
	saved, err := uc.SaveSalesOrderWithItems(ctx, draft.Order.ID, header, []*biz.SalesOrderItemSaveMutation{item})
	if err != nil {
		t.Fatalf("retry after rollback: %v", err)
	}
	if itemUpdates != 2 {
		t.Fatalf("retry must preserve the registered item hook: %d", itemUpdates)
	}
	if saved.Order.Version != draft.Order.Version+1 || saved.Order.Note == nil || *saved.Order.Note != *header.Note || saved.Order.OrderTotal == nil || !saved.Order.OrderTotal.Equal(decimal.NewFromInt(36)) || !saved.Items[0].OrderedQuantity.Equal(decimal.NewFromInt(12)) {
		t.Fatalf("retry did not commit header and item together: %+v", saved)
	}
}
