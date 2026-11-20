package data

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestSalesDeliveryProgressUsesExactSourcesAndRedactsCrossRoleText(t *testing.T) {
	f := openProductionOrderRepoTest(t, "sales_delivery_exact")
	ctx, now := t.Context(), time.Now()
	order := f.client.SalesOrder.Query().OnlyX(ctx)
	f.client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	actor := f.client.AdminUser.Create().SetUsername("delivery-engineer").SetDisplayName("工程经办").SetPasswordHash("fixture").SaveX(ctx)
	f.client.WorkflowTask.Create().SetTaskCode("delivery-engineering").SetTaskName("内部工程事项").
		SetTaskGroup("engineering_data").SetOwnerRoleKey("engineering").SetAssigneeID(actor.ID).
		SetSourceType("sales_order").SetSourceID(order.ID).SetTaskStatusKey("blocked").SetBlockedReason("内部原因").SaveX(ctx)
	approved := f.client.WorkflowTask.Create().SetTaskCode("delivery-approved").SetTaskName("订单审批").
		SetTaskGroup("sales_order_approval").SetOwnerRoleKey("boss").
		SetSourceType("sales_order").SetSourceID(order.ID).SetTaskStatusKey("done").SetCompletedAt(now).SaveX(ctx)
	f.client.WorkflowTaskEvent.Create().SetTaskID(approved.ID).SetEventType("status_changed").SetToStatusKey("done").
		SetPayload(map[string]any{"feedback": "客户已确认最终交期"}).SaveX(ctx)
	other := f.client.SalesOrder.Create().SetOrderNo("SO-OTHER-DELIVERY").SetOrderDate(now).SetCustomerID(order.CustomerID).SaveX(ctx)
	f.client.WorkflowTask.Create().SetTaskCode("delivery-other").SetTaskName("另一张单的卡点").
		SetTaskGroup("engineering_data").SetOwnerRoleKey("engineering").
		SetSourceType("sales_order").SetSourceID(other.ID).SetTaskStatusKey("blocked").SetDueAt(now.Add(-time.Hour)).SaveX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "SALES-DELIVERY-WH")
	for _, shipmentStatus := range []string{"SHIPPED", "DRAFT"} {
		shipment := f.client.Shipment.Create().SetShipmentNo(shipmentStatus).SetSalesOrderID(order.ID).
			SetStatus(shipmentStatus).SetIdempotencyKey(shipmentStatus).SaveX(ctx)
		f.client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetSalesOrderItemID(f.salesItemID).
			SetProductID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(4)).SaveX(ctx)
	}
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	read := func(scope *biz.WorkflowTaskVisibilityScope) *biz.SalesDeliveryProgress {
		t.Helper()
		result, err := uc.SalesDelivery(ctx, order.ID, 20, 0, scope)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	sales := read(&biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"sales"}})
	if sales.Total != 1 || *sales.Lines[0].ShippedQuantity != "4" || *sales.Lines[0].Line.RemainingQuantity != "16" ||
		sales.Current == nil || sales.Current.Label != "工程资料与 BOM" || sales.Current.Assignee != "工程经办" ||
		sales.Current.Reason != "" || !slices.ContainsFunc(sales.Recent, func(item biz.SalesDeliveryMilestone) bool {
		return item.Label == "接单与订单审批" && item.Status == "done" && item.Reason == ""
	}) {
		t.Fatalf("sales delivery = %+v, current = %+v", sales, sales.Current)
	}
	engineering := read(&biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"engineering"}})
	if engineering.Current == nil || engineering.Current.Label != "内部工程事项" || engineering.Current.Reason != "内部原因" {
		t.Fatalf("readable milestone = %+v", engineering.Current)
	}
	boss := read(&biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"boss"}})
	if !slices.ContainsFunc(boss.Recent, func(item biz.SalesDeliveryMilestone) bool {
		return item.Label == "订单审批" && item.Reason == "客户已确认最终交期"
	}) {
		t.Fatalf("readable completion feedback = %+v", boss.Recent)
	}
	if noWorkflow := read(nil); noWorkflow.TasksAvailable || noWorkflow.Current != nil || len(noWorkflow.Recent) != 0 {
		t.Fatalf("unexpected workflow access: %+v", noWorkflow)
	}
	if _, err := uc.SalesDelivery(ctx, order.ID+10000, 20, 0, nil); !errors.Is(err, biz.ErrSalesOrderNotFound) {
		t.Fatalf("unavailable order returned %v", err)
	}
}
