package data

import (
	"fmt"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowtask"
)

func TestBusinessProgressTaskPagesKeepOrderAndRoleScope(t *testing.T) {
	f := openProductionOrderRepoTest(t, "progress_task_pages")
	ctx := t.Context()
	order := f.client.SalesOrder.Query().OnlyX(ctx)
	other := f.client.SalesOrder.Create().SetOrderNo("SO-TASK-OTHER").SetCustomerID(order.CustomerID).SetOrderDate(time.Now()).SaveX(ctx)
	add := func(code string, orderID int, role, status string) *ent.WorkflowTask {
		return f.client.WorkflowTask.Create().SetTaskCode(code).SetTaskName("核对来源").
			SetSourceType("sales_order").SetSourceID(orderID).SetTaskGroup("manual").SetOwnerRoleKey(role).SetTaskStatusKey(status).SaveX(ctx)
	}
	for i := 0; i < 104; i++ {
		add(fmt.Sprintf("PAGE-%03d", i), order.ID, "quality", "ready")
	}
	last := add("ENDED", order.ID, "quality", "done")
	blocked := add("BLOCKED", order.ID, "quality", "blocked")
	add("HIDDEN", order.ID, "finance", "blocked")
	add("OTHER", other.ID, "quality", "blocked")
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	q := biz.BusinessProgressQuery{ID: order.ID, View: "orders", Limit: 100,
		Access: biz.BusinessProgressAccess{Sales: true, Tasks: true}, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"quality"}}}
	d, err := uc.Detail(ctx, q)
	if err != nil || d.TaskTotal != 106 || len(d.Sections["tasks"]) != biz.WorkCenterDefaultLimit || !d.HasMore["tasks"] || d.Sections["tasks"][0].ID != blocked.ID {
		t.Fatalf("first page: detail=%+v err=%v", d, err)
	}
	page := func() *biz.BusinessProgressTaskPage {
		t.Helper()
		p, err := uc.Tasks(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	q.Offset = 100
	if p := page(); p.Total != 106 || len(p.Rows) != 6 || p.Rows[5].ID != last.ID || p.Rows[5].Number != last.TaskNo {
		t.Fatalf("last page=%+v", p)
	}
	q.TaskStatus, q.Offset = "ended", 20
	if p := page(); p.Total != 1 || len(p.Rows) != 0 {
		t.Fatalf("past end=%+v", p)
	}
	q.TaskStatus, q.Offset, q.TaskRole = "open", 0, "finance"
	if p := page(); p.Total != 0 || len(p.Rows) != 0 {
		t.Fatalf("hidden role=%+v", p)
	}
}

func TestShipmentQualityBackfillLinksOnlyExistingPendingInspections(t *testing.T) {
	f := openProductionOrderRepoTest(t, "shipment_quality_backfill_progress")
	ctx := t.Context()
	sales := f.client.SalesOrder.Query().OnlyX(ctx)
	shipment := f.client.Shipment.Create().SetShipmentNo("SHIP-QA-BACKFILL").SetSalesOrderID(sales.ID).SetIdempotencyKey("backfill-shipment").SaveX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "SHIP-QUALITY-WH")
	lot := f.client.InventoryLot.Create().SetLotNo("SHIP-QA-LOT").SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(f.productID).SaveX(ctx)
	f.client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetSalesOrderItemID(f.salesItemID).SetProductID(f.productID).
		SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetLotID(lot.ID).SetQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	create := func(no, status string) *ent.QualityInspection {
		return f.client.QualityInspection.Create().SetInspectionNo(no).SetSourceType(biz.QualityInspectionSourceShipment).SetSourceID(shipment.ID).
			SetInspectionType(biz.QualityInspectionTypeFinishedGoods).SetInventoryLotID(lot.ID).SetWarehouseID(warehouse.ID).
			SetSubjectType(biz.QualityInspectionSubjectProduct).SetSubjectID(f.productID).SetStatus(status).SaveX(ctx)
	}
	cancelled := create("QA-CLOSED", biz.QualityInspectionStatusCancelled)
	pending := create("QA-PENDING", biz.QualityInspectionStatusDraft)
	apply := func() {
		t.Helper()
		out, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, f.client)
		if err != nil || out.ShipmentQualityScanned != 1 {
			t.Fatalf("backfill=%+v err=%v", out, err)
		}
	}
	apply()
	task := assertFulfillmentTask(t, ctx, f.client, "shipment_quality", pending.ID, "ready", biz.QualityRoleKey)
	apply()
	again := assertFulfillmentTask(t, ctx, f.client, "shipment_quality", pending.ID, "ready", biz.QualityRoleKey)
	if task.ID != again.ID || task.Version != again.Version || f.client.WorkflowTask.Query().Where(workflowtask.TaskCode(biz.WorkflowSourceTaskCode("handoff_shipment_quality", cancelled.ID))).ExistX(ctx) {
		t.Fatal("backfill duplicated an inspection task or fabricated history")
	}
	q := biz.BusinessProgressQuery{View: "orders", ID: sales.ID, Access: biz.BusinessProgressAccess{Sales: true, Tasks: true},
		TaskRole: biz.QualityRoleKey, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.QualityRoleKey}}}
	page, err := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data)).Tasks(ctx, q)
	if err != nil || page.Total != 1 || page.Rows[0].ID != task.ID || page.Rows[0].TaskGroup != task.TaskGroup {
		t.Fatalf("inspection order link=%+v err=%v", page, err)
	}
}
