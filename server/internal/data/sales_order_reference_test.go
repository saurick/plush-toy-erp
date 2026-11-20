package data

import (
	"context"
	"server/internal/biz"
	"testing"
	"time"
)

func TestSalesOrderReferenceIDsRetainHistoricalLifecycle(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_references")
	defer mustCloseEntClient(t, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "REF-C", true)
	old := client.SalesOrder.Create().SetOrderNo("REF-HISTORY").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus("closed").SaveX(ctx)
	client.SalesOrder.Create().SetOrderNo("REF-OTHER").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus("active").SaveX(ctx)
	rows, total, err := uc.ListSalesOrders(ctx, biz.SalesOrderFilter{IDs: []int{old.ID}, LifecycleScope: "all", Limit: 200})
	if err != nil || total != 1 || len(rows) != 1 || rows[0].ID != old.ID {
		t.Fatalf("historical reference was missing or unbounded: total=%d rows=%d err=%v", total, len(rows), err)
	}
	rows, total, err = uc.ListSalesOrders(ctx, biz.SalesOrderFilter{IDs: []int{old.ID}, LifecycleScope: biz.LifecycleScopeCurrent, Limit: 200})
	if err != nil || total != 0 || len(rows) != 0 {
		t.Fatalf("candidate lifecycle was widened: total=%d err=%v", total, err)
	}
}
