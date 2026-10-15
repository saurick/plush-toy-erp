package data

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestSalesOrderBOMTaskSourcesUseEngineeringRelation(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_bom_task_sources")
	defer mustCloseEntClient(t, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "BOM-TASK-CUSTOMER", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "BOM-TASK-UNIT", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "BOM-TASK-PRODUCT", true)
	bom := client.BOMHeader.Create().SetProductID(product.ID).SetVersion("V1").SetSourceOrderNo("SO-UNRELATED").SaveX(ctx)
	other := client.BOMHeader.Create().SetProductID(product.ID).SetVersion("V2").SaveX(ctx)
	var linkedItemIDs []int
	for index, no := range []string{"SO-BOM-A", "SO-BOM-HISTORY", "SO-UNRELATED"} {
		status := biz.SalesOrderStatusDraft
		if index == 1 {
			status = biz.SalesOrderStatusClosed
		}
		order := client.SalesOrder.Create().SetOrderNo(no).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus(status).SaveX(ctx)
		bomID := bom.ID
		if index == 2 {
			bomID = other.ID
		}
		for line := 1; line <= 2; line++ {
			item := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(line).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SetSampleBomID(bomID).SaveX(ctx)
			if index == 0 {
				linkedItemIDs = append(linkedItemIDs, item.ID)
			}
		}
	}
	filter := biz.SalesOrderFilter{SampleBOMID: bom.ID, LifecycleScope: biz.LifecycleScopeAll, Limit: 1}
	first, total, err := uc.ListSalesOrders(ctx, filter)
	if err != nil || total != 2 || len(first) != 1 || first[0].OrderNo == "SO-UNRELATED" {
		t.Fatalf("exact relation must include history, deduplicate lines and ignore printed source number: total=%d rows=%+v err=%v", total, first, err)
	}
	filter.Offset = 1
	second, total, err := uc.ListSalesOrders(ctx, filter)
	if err != nil || total != 2 || len(second) != 1 || second[0].ID == first[0].ID || second[0].OrderNo == "SO-UNRELATED" {
		t.Fatalf("pagination escaped BOM relation: total=%d rows=%+v err=%v", total, second, err)
	}
	counts, err := uc.CountSalesOrdersByStatus(ctx, filter)
	if err != nil || counts[biz.SalesOrderStatusDraft] != 1 || counts[biz.SalesOrderStatusClosed] != 1 {
		t.Fatalf("status counts must use same relation: %v %v", counts, err)
	}
	client.SalesOrderItem.UpdateOneID(linkedItemIDs[0]).SetSampleBomID(other.ID).SaveX(ctx)
	client.SalesOrderItem.UpdateOneID(linkedItemIDs[1]).ClearSampleBomID().SaveX(ctx)
	filter.Offset = 0
	rows, total, err := uc.ListSalesOrders(ctx, filter)
	if err != nil || total != 1 || len(rows) != 1 || rows[0].OrderNo != "SO-BOM-HISTORY" {
		t.Fatalf("switching/clearing BOM must not leave a stale task source: total=%d rows=%+v err=%v", total, rows, err)
	}
	filter.SampleBOMID = other.ID + 100
	if rows, total, err := uc.ListSalesOrders(ctx, filter); err != nil || total != 0 || len(rows) != 0 {
		t.Fatalf("unlinked BOM must be empty: %d %v %v", total, rows, err)
	}
	filter.SampleBOMID = -1
	if _, _, err := uc.ListSalesOrders(ctx, filter); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("negative BOM filter must fail closed: %v", err)
	}
}
