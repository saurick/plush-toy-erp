package data

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestBusinessProgressIdentitySearch(t *testing.T) {
	f := openProductionOrderRepoTest(t, "progress_identity_search")
	assertBusinessProgressIdentitySearch(t, f.data, f.client, f.unitID, f.actorID)
}

func TestBusinessDocumentSearchPostgresProgressIdentity(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx := context.Background()
	suffix := postgresTestSuffix()
	unit := createSalesOrderTestUnit(t, ctx, client, "PROGRESS-MATCH-"+suffix, true)
	actor := client.AdminUser.Create().SetUsername("progress-match-" + suffix).SetPasswordHash("fixture").SaveX(ctx)
	assertBusinessProgressIdentitySearch(t, data, client, unit.ID, actor.ID)
}

func assertBusinessProgressIdentitySearch(t *testing.T, data *Data, client *ent.Client, unitID, actorID int) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	customer := createSalesOrderTestCustomer(t, ctx, client, "IDENTITY-"+suffix, true)
	order := client.SalesOrder.Create().SetOrderNo("SO-IDENTITY-" + suffix).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus("active").SaveX(ctx)
	production := client.ProductionOrder.Create().SetOrderNo("MO-IDENTITY-" + suffix).SetCreatedBy(actorID).SaveX(ctx)
	products := make([]*ent.Product, 3)
	names := []string{"雪花小鹿", "饼干小熊", "云朵小熊"}
	for index, name := range names {
		product := createSalesOrderTestProduct(t, ctx, client, unitID, "IDENTITY-"+suffix+string(rune('A'+index)), true)
		products[index] = product.Update().SetName("主档已改名").SetStyleNo("MATCH-STYLE-" + string(rune('A'+index))).SaveX(ctx)
		line := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(index + 1).SetProductID(product.ID).SetProductNameSnapshot(name).SetProductCodeSnapshot("FROZEN-" + string(rune('A'+index))).SetUnitID(unitID).SetOrderedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
		client.ProductionOrderItem.Create().SetProductionOrderID(production.ID).SetLineNo(index + 1).SetProductID(product.ID).SetProductNameSnapshot(name).SetProductCodeSnapshot("FROZEN-" + string(rune('A'+index))).SetSalesOrderItemID(line.ID).SetUnitID(unitID).SetPlannedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	}
	// Repeated order lines for the same product remain one style; canceled
	// requirements cannot make an active order match a product search.
	client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(4).SetProductID(products[1].ID).SetProductNameSnapshot("饼干小熊").SetUnitID(unitID).SetOrderedQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(5).SetProductID(products[1].ID).SetProductNameSnapshot("取消专属产品").SetLineStatus("canceled").SetUnitID(unitID).SetOrderedQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(data))
	for _, view := range []string{"orders", "production"} {
		id := order.ID
		if view == "production" {
			id = production.ID
		}
		q := biz.BusinessProgressQuery{View: view, ID: id, Limit: 1, Access: biz.BusinessProgressAccess{Sales: view == "orders", Production: true}}
		baseline, err := uc.List(ctx, q)
		if err != nil || len(baseline.Rows) != 1 {
			t.Fatalf("%s baseline=%+v err=%v", view, baseline, err)
		}
		for _, search := range []struct {
			keyword        string
			count, product int
		}{{"熊", 2, 1}, {"鹿", 1, 0}, {"match-style-b", 1, 1}, {"FROZEN-C", 1, 2}} {
			q.Keyword = search.keyword
			board, err := uc.List(ctx, q)
			if err != nil || board.Total != 1 || len(board.Rows) != 1 {
				t.Fatalf("%s search %q board=%+v err=%v", view, search.keyword, board, err)
			}
			row := board.Rows[0]
			if row.ProductMatchCount != search.count || row.ProductTypeCount != 3 || row.ProductID != products[search.product].ID || row.Product != names[search.product] || *row.OrderedQuantity != *baseline.Rows[0].OrderedQuantity {
				t.Fatalf("%s search %q row=%+v baseline=%+v", view, search.keyword, row, baseline.Rows[0])
			}
		}
		for _, keyword := range []string{"", baseline.Rows[0].OrderNo} {
			q.Keyword = keyword
			board, err := uc.List(ctx, q)
			if err != nil || len(board.Rows) != 1 || board.Rows[0].ProductMatchCount != 0 || board.Rows[0].ProductID != baseline.Rows[0].ProductID {
				t.Fatalf("%s clear/header search=%+v err=%v", view, board, err)
			}
		}
		for _, keyword := range []string{"主档已改名", "取消专属产品", "%' OR 1=1 --"} {
			q.Keyword = keyword
			board, err := uc.List(ctx, q)
			if err != nil || board.Total != 0 {
				t.Fatalf("%s unrelated/stale keyword %q board=%+v err=%v", view, keyword, board, err)
			}
		}
	}
}
