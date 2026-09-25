package data

import (
	"context"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"testing"
	"time"
)

func TestBusinessDocumentSearchPostgresProgress(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx := context.Background()
	suffix := time.Now().Format("150405.000000000")
	actor := client.AdminUser.Create().SetUsername("progress-pg-" + suffix).SetPasswordHash("fixture").SaveX(ctx)
	unit := createSalesOrderTestUnit(t, ctx, client, "PG-PROGRESS-"+suffix, true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "PG-PROGRESS-"+suffix, true)
	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-PROGRESS-"+suffix, true)
	due := time.Date(2026, 9, 24, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600)).UTC()
	so := client.SalesOrder.Create().SetOrderNo("SO-PROGRESS-" + suffix).SetCustomerID(customer.ID).SetOrderDate(due).SetPlannedDeliveryDate(due).SetLifecycleStatus("active").SetSalesOwner("进度负责人").SaveX(ctx)
	line := client.SalesOrderItem.Create().SetSalesOrderID(so.ID).SetLineNo(1).SetProductID(product.ID).SetProductNameSnapshot("进度产品").SetCustomerProductNo("客户款号").SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(20)).SaveX(ctx)
	po := client.ProductionOrder.Create().SetOrderNo("MO-PROGRESS-" + suffix).SetCreatedBy(actor.ID).SetPlannedEndAt(due).SaveX(ctx)
	client.ProductionOrderItem.Create().SetProductionOrderID(po.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetSalesOrderItemID(line.ID).SetPlannedQuantity(decimal.NewFromInt(20)).SaveX(ctx)
	client.WorkflowTask.Create().SetTaskCode("progress-pg-" + suffix).SetTaskName("等待确认").SetTaskGroup("test").SetSourceType("sales_order").SetSourceID(so.ID).SetOwnerRoleKey("pmc").SetTaskStatusKey("blocked").SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(data))
	q := biz.BusinessProgressQuery{Keyword: suffix, SnapshotAt: due.Add(time.Hour), DateFrom: "2026-09-24", DateTo: "2026-09-24", Access: biz.BusinessProgressAccess{Sales: true, Production: true, WIP: true, Tasks: true}, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"pmc"}}}
	board, err := uc.List(ctx, q)
	if err != nil || board.Total != 1 || board.Rows[0].ProductID != product.ID || board.Rows[0].DueDate != "2026-09-24" || board.Rows[0].Overdue || !board.Rows[0].DueSoon || board.Rows[0].OpenTasks != 1 {
		t.Fatalf("sales=%+v err=%v", board, err)
	}
	q.ID = so.ID
	detail, err := uc.Detail(ctx, q)
	if err != nil || len(detail.Sections["production"]) != 1 || len(detail.Sections["tasks"]) != 1 || detail.Sections["lines"][0].Date != "2026-09-24" {
		t.Fatalf("detail=%+v err=%v", detail, err)
	}
	q.ID = 0
	q.View = "production"
	q.Owner = "进度负责人"
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 1 || board.Rows[0].ID != po.ID || board.Rows[0].ProductID != product.ID || board.Rows[0].CompletedQuantity == nil || *board.Rows[0].CompletedQuantity != "0" {
		t.Fatalf("production=%+v err=%v", board, err)
	}
	q.ID = po.ID
	if _, err := uc.Detail(ctx, q); err != nil {
		t.Fatal(err)
	}
	q.ID = 0
	q.Owner = ""
	q.Keyword = "进度负责人"
	if board, err = uc.List(ctx, q); err != nil || board.Total != 1 || board.Rows[0].ID != po.ID {
		t.Fatalf("production primary owner search=%+v %v", board, err)
	}
	q.View = "orders"
	for _, keyword := range []string{"客户款号", "进度负责人"} {
		q.Keyword = keyword
		if board, err = uc.List(ctx, q); err != nil || board.Total != 1 {
			t.Fatalf("primary search %q=%+v %v", keyword, board, err)
		}
	}
	q.Keyword = "%' OR 1=1 --"
	if board, err = uc.List(ctx, q); err != nil || board.Total != 0 {
		t.Fatalf("literal search=%+v %v", board, err)
	}
}
