package data

import (
	"context"
	"github.com/go-kratos/kratos/v2/log"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestBusinessProgressMaterialTaskUsesRequirementLine(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "progress_material_task", func(ctx context.Context, client *ent.Client, unitID, bomID int) {
		material := createTestMaterial(t, ctx, client, unitID, "PROGRESS-SECOND-MATERIAL")
		client.BOMItem.Create().SetBomHeaderID(bomID).SetMaterialID(material.ID).SetQuantity(decimal.NewFromInt(1)).SetUnitID(unitID).SetLossRate(decimal.Zero).SaveX(ctx)
	})
	createProductionWIPRouteProcesses(t, ctx, f.client)
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-MATERIAL-TASK", 10, false)
	other := f.client.ProductionOrder.Create().SetOrderNo("MO-UNRELATED").SetCreatedBy(f.actorID).SaveX(ctx)
	otherLine := f.client.ProductionOrderItem.Create().SetProductionOrderID(other.ID).SetLineNo(1).SetProductID(f.productID).SetUnitID(f.unitID).SetPlannedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	var requirementID int
	for _, requirement := range flow.MaterialRequirements {
		if requirement.ID == otherLine.ID {
			requirementID = requirement.ID
		}
	}
	if requirementID == 0 {
		t.Fatal("fixture must cover a material requirement ID colliding with another order item ID")
	}
	warehouse := createTestProductWarehouse(t, ctx, f.client, "PROGRESS-MATERIAL-WH")
	fact := f.client.ProductionFact.Create().SetFactNo("PROGRESS-MATERIAL-ISSUE").SetFactType("MATERIAL_ISSUE").SetSubjectType("MATERIAL").SetSubjectID(f.materialID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(1)).SetSourceType("PRODUCTION_ORDER").SetSourceID(flow.ProductionOrderID).SetSourceLineID(requirementID).SetIdempotencyKey("progress-material-issue").SaveX(ctx)
	task := f.client.WorkflowTask.Create().SetTaskCode("PROGRESS-MATERIAL-TASK").SetTaskName("核对领料").SetTaskGroup("production_material_issue").SetSourceType("production-progress").SetSourceID(fact.ID).SetOwnerRoleKey("pmc").SetTaskStatusKey("ready").SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	q := biz.BusinessProgressQuery{View: "production", ID: flow.ProductionOrderID, Access: biz.BusinessProgressAccess{Production: true, Tasks: true}, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}}
	detail, err := uc.Detail(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, record := range detail.Sections["tasks"] {
		found = found || record.ID == task.ID
	}
	if !found {
		t.Fatal("material issue task must follow its material requirement to the owning production item")
	}
	q.ID = other.ID
	detail, err = uc.Detail(ctx, q)
	if err != nil || len(detail.Sections["tasks"]) != 0 {
		t.Fatalf("unrelated order must not inherit material task: %+v %v", detail, err)
	}
}

func TestBusinessProgressPaginationFactsAndVisibility(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "progress_board")
	now := time.Date(2026, 9, 23, 4, 0, 0, 0, time.UTC)
	so := f.client.SalesOrder.Query().OnlyX(ctx)
	f.client.SalesOrder.UpdateOneID(so.ID).SetPlannedDeliveryDate(now.AddDate(0, 0, -2)).SetSalesOwner("业务小陈").SaveX(ctx)
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetProductNameSnapshot("进度小熊").SaveX(ctx)
	customer := createSalesOrderTestCustomer(t, ctx, f.client, "ProgressOther", true)
	second := f.client.SalesOrder.Create().SetOrderNo("SO-SECOND").SetCustomerID(customer.ID).SetOrderDate(now).SetLifecycleStatus("active").SetPlannedDeliveryDate(now.AddDate(0, 0, 2)).SaveX(ctx)
	f.client.SalesOrderItem.Create().SetSalesOrderID(second.ID).SetLineNo(1).SetProductID(f.productID).SetUnitID(f.unitID).SetOrderedQuantity(decimal.NewFromInt(8)).SaveX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "PROGRESS-WH")
	shipment := f.client.Shipment.Create().SetShipmentNo("SHIP-POSTED").SetSalesOrderID(so.ID).SetStatus("SHIPPED").SetIdempotencyKey("progress-shipment").SaveX(ctx)
	f.client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetSalesOrderItemID(f.salesItemID).SetProductID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(6)).SaveX(ctx)
	cancelled := f.client.Shipment.Create().SetShipmentNo("SHIP-CANCELLED").SetSalesOrderID(so.ID).SetStatus("CANCELLED").SetIdempotencyKey("progress-cancelled").SaveX(ctx)
	f.client.ShipmentItem.Create().SetShipmentID(cancelled.ID).SetSalesOrderItemID(f.salesItemID).SetProductID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(9)).SaveX(ctx)
	f.client.WorkflowTask.Create().SetTaskCode("progress-visible").SetTaskName("面料待确认").SetTaskGroup("test").SetSourceType("sales_order").SetSourceID(so.ID).SetTaskStatusKey("blocked").SetOwnerRoleKey("pmc").SetBlockedReason("需确认交期").SaveX(ctx)
	f.client.WorkflowTask.Create().SetTaskCode("progress-hidden").SetTaskName("隐藏任务").SetTaskGroup("test").SetSourceType("sales_order").SetSourceID(second.ID).SetTaskStatusKey("blocked").SetOwnerRoleKey("finance").SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	q := biz.BusinessProgressQuery{View: "orders", Limit: 1, SnapshotAt: now, Access: biz.BusinessProgressAccess{Sales: true, Production: true, Tasks: true}, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"pmc"}}}
	board, err := uc.List(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if board.Total != 2 || board.Counts.Overdue != 1 || board.Counts.DueSoon != 1 || board.Counts.Blocked != 1 || len(board.Rows) != 1 {
		t.Fatalf("counts=%+v rows=%+v", board.Counts, board.Rows)
	}
	row := board.Rows[0]
	if row.ID != so.ID || row.ProductID != f.productID || row.ShippedQuantity == nil || *row.ShippedQuantity != "6" || row.OrderedQuantity == nil || *row.OrderedQuantity != "20" || row.AttentionTask != "面料待确认" || row.UnassignedTasks != 1 {
		t.Fatalf("row=%+v", row)
	}
	q.Offset = 1
	board, err = uc.List(ctx, q)
	if err != nil || board.Rows[0].Blocked || board.Rows[0].OpenTasks != 0 {
		t.Fatalf("second=%+v err=%v", board, err)
	}
	q.Offset = 0
	q.Risk = "blocked"
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 1 || board.Counts.Total != 2 {
		t.Fatalf("filter=%+v err=%v", board, err)
	}
	q.ID = so.ID
	detail, err := uc.Detail(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Sections["lines"]) != 1 || len(detail.Sections["tasks"]) != 1 || detail.Sections["lines"][0].Note != "已出货 6" {
		t.Fatalf("detail=%+v", detail)
	}
	q.ID = 0
	q.Keyword = "不存在"
	q.Risk = "all"
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 0 || len(board.Rows) != 0 {
		t.Fatalf("empty=%+v err=%v", board, err)
	}
}

func TestBusinessProgressMixedUnitsAndIndependentProduction(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "progress_mixed")
	so := f.client.SalesOrder.Query().OnlyX(ctx)
	unit := createSalesOrderTestUnit(t, ctx, f.client, "BOX", true)
	f.client.SalesOrderItem.Create().SetSalesOrderID(so.ID).SetLineNo(2).SetRequestedProductName("搜索第二产品").SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(2)).SaveX(ctx)
	now := time.Now().UTC()
	po := f.client.ProductionOrder.Create().SetOrderNo("MO-INDEPENDENT").SetCreatedBy(f.actorID).SaveX(ctx)
	f.client.ProductionOrderItem.Create().SetProductionOrderID(po.ID).SetLineNo(1).SetProductID(f.productID).SetUnitID(f.unitID).SetPlannedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	closed := f.client.ProductionOrder.Create().SetOrderNo("MO-CLOSED").SetStatus("CLOSED").SetCreatedBy(f.actorID).SetReleasedBy(f.actorID).SetReleasedAt(now).SetClosedBy(f.actorID).SetClosedAt(now).SetCloseReason("停止生产").SaveX(ctx)
	f.client.ProductionOrderItem.Create().SetProductionOrderID(closed.ID).SetLineNo(1).SetProductID(f.productID).SetUnitID(f.unitID).SetPlannedQuantity(decimal.NewFromInt(10)).SetSalesOrderItemID(f.salesItemID).SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	q := biz.BusinessProgressQuery{View: "orders", Keyword: "搜索第二产品", Access: biz.BusinessProgressAccess{Sales: true, Production: true}}
	board, err := uc.List(ctx, q)
	if err != nil || board.Total != 1 {
		t.Fatalf("search=%+v err=%v", board, err)
	}
	row := board.Rows[0]
	if row.OrderedQuantity != nil || row.ShippedQuantity != nil || row.ProductCount != 2 || row.ProductionClosed != 1 || !row.Active {
		t.Fatalf("mixed row=%+v", row)
	}
	q.View = "production"
	q.Keyword = ""
	q.Risk = "unlinked"
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 1 || board.Rows[0].ID != po.ID || board.Rows[0].ProductID != f.productID {
		t.Fatalf("independent=%+v err=%v", board, err)
	}
	q.Risk = "all"
	q.Scope = "ended"
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 1 || board.Rows[0].Status != "CLOSED" || board.Rows[0].Active {
		t.Fatalf("closed=%+v err=%v", board, err)
	}
	q.ID = closed.ID
	q.Access.Sales = false
	detail, err := uc.Detail(ctx, q)
	if err != nil || detail.Row.Customer != "" || detail.Row.SalesOwner != "" {
		t.Fatalf("restricted=%+v err=%v", detail, err)
	}
	otherCustomer := createSalesOrderTestCustomer(t, ctx, f.client, "PROGRESS-MULTI-CUSTOMER", true)
	otherSales := f.client.SalesOrder.Create().SetOrderNo("SO-ANOTHER-CUSTOMER").SetCustomerID(otherCustomer.ID).SetOrderDate(now).SetLifecycleStatus("active").SetSalesOwner("第二位负责人").SaveX(ctx)
	f.client.SalesOrder.UpdateOneID(so.ID).SetSalesOwner("首位负责人").SaveX(ctx)
	otherSalesLine := f.client.SalesOrderItem.Create().SetSalesOrderID(otherSales.ID).SetLineNo(1).SetProductID(f.productID).SetUnitID(f.unitID).SetOrderedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	f.client.ProductionOrderItem.Create().SetProductionOrderID(closed.ID).SetLineNo(2).SetProductID(f.productID).SetUnitID(f.unitID).SetPlannedQuantity(decimal.NewFromInt(10)).SetSalesOrderItemID(otherSalesLine.ID).SaveX(ctx)
	q.Access.Sales = true
	detail, err = uc.Detail(ctx, q)
	if err != nil || detail.Row.Customer != "多客户 · 查看明细" || len(detail.Sections["lines"]) != 2 || !strings.Contains(detail.Sections["lines"][1].Note, otherSales.OrderNo) {
		t.Fatalf("multi-customer=%+v err=%v", detail, err)
	}
	q.ID = 0
	q.Owner = "第二位负责人"
	for _, keyword := range []string{otherSales.OrderNo, otherCustomer.Name} {
		q.Keyword = keyword
		board, err = uc.List(ctx, q)
		if err != nil || board.Total != 1 || board.Rows[0].ID != closed.ID || board.Rows[0].SalesOwner != "多位业务负责人" {
			t.Fatalf("search every source: %+v %v", board, err)
		}
	}
	q.Owner = ""
	q.Keyword = "第二位负责人"
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 1 || board.Rows[0].ID != closed.ID {
		t.Fatalf("primary owner search: %+v %v", board, err)
	}
	q.Access.Sales = false
	board, err = uc.List(ctx, q)
	if err != nil || board.Total != 0 {
		t.Fatalf("hidden sales identity must not be searchable: %+v %v", board, err)
	}
	q.ID = closed.ID
	detail, err = uc.Detail(ctx, q)
	if err != nil || detail.Row.Customer != "" || detail.Sections["lines"][1].Note != "已关联销售明细" {
		t.Fatalf("restricted source identity=%+v err=%v", detail, err)
	}
}

func TestBusinessProgressMissingShipmentLinkIsUnknown(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "progress_bad_link")
	so := f.client.SalesOrder.Query().OnlyX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "PROGRESS-BAD-WH")
	shipment := f.client.Shipment.Create().SetShipmentNo("SHIP-NO-LINE").SetSalesOrderID(so.ID).SetStatus("SHIPPED").SetIdempotencyKey("progress-no-line").SaveX(ctx)
	f.client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetProductID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(20)).SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	board, err := uc.List(ctx, biz.BusinessProgressQuery{Access: biz.BusinessProgressAccess{Sales: true}})
	if err != nil {
		t.Fatal(err)
	}
	if board.Total != 1 || board.Rows[0].DeliveryKnown || board.Rows[0].ShippedQuantity != nil {
		t.Fatalf("row=%+v", board.Rows)
	}
}

func TestBusinessProgressCompletionReworkAndWIPPermission(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "progress_completion")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "PROGRESS-COMPLETION-WH")
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-PROGRESS-DONE", 10, false)
	flow, packaging := acceptProductionPackagingBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "progress-done")
	lot := "PROGRESS-DONE-LOT"
	completion, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
		FactNo: "PROGRESS-DONE", ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: flow.ProductionOrderItems[0].ID,
		ProductionWIPBatchID: packaging.ID, WarehouseID: warehouse.ID, NewLotNo: &lot, Quantity: decimal.NewFromInt(6), IdempotencyKey: "progress-done"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = factUC.PostProductionFact(ctx, operationalFactStatusMutation(completion.ID, completion.Version, f.actorID, ""))
	if err != nil {
		t.Fatal(err)
	}
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	q := biz.BusinessProgressQuery{View: "production", ID: flow.ProductionOrderID, Access: biz.BusinessProgressAccess{Production: true, WIP: true}}
	detail, err := uc.Detail(ctx, q)
	if err != nil || detail.Row.CompletedQuantity == nil || *detail.Row.CompletedQuantity != "6" || len(detail.Sections["batches"]) == 0 {
		t.Fatalf("completion=%+v err=%v", detail, err)
	}
	f.client.InventoryLot.UpdateOneID(*completion.LotID).SetStatus(biz.InventoryLotRejected).SaveX(ctx)
	rework, err := factUC.CreateProductionReworkFromCompletion(ctx, &biz.ProductionReworkFromCompletionCreate{FactNo: "PROGRESS-REWORK", SourceCompletionFactID: completion.ID, Quantity: decimal.NewFromInt(4), Reason: "抽检返工", IdempotencyKey: "progress-rework"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = factUC.PostProductionFact(ctx, operationalFactStatusMutation(rework.ID, rework.Version, f.actorID, ""))
	if err != nil {
		t.Fatal(err)
	}
	detail, err = uc.Detail(ctx, q)
	if err != nil || detail.Row.CompletedQuantity == nil || *detail.Row.CompletedQuantity != "2" {
		t.Fatalf("rework=%+v err=%v", detail, err)
	}
	q.Access.Tasks = true
	q.TaskVisibility = &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}
	detail, err = uc.Detail(ctx, q)
	if err != nil || len(detail.Sections["tasks"]) == 0 {
		t.Fatalf("formal production tasks absent: %+v %v", detail, err)
	}
	q.Access.WIP = false
	detail, err = uc.Detail(ctx, q)
	if err != nil || detail.Row.CompletedQuantity != nil || detail.Row.CurrentOperation != "" || detail.Row.OperationCount != 0 || detail.Sections["batches"] != nil {
		t.Fatalf("restricted=%+v err=%v", detail, err)
	}
}

func TestBusinessProgressCivilDateAndAllProductSearch(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "progress_dates")
	due := time.Date(2026, 9, 24, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600)).UTC()
	f.client.SalesOrderItem.UpdateOneID(f.salesItemID).SetPlannedDeliveryDate(due).SetProductNameSnapshot("快照产品").SetRequestedProductName("原始产品").SetCustomerProductNo("客户款号").SaveX(ctx)
	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(f.data))
	q := biz.BusinessProgressQuery{SnapshotAt: due.Add(time.Hour), Access: biz.BusinessProgressAccess{Sales: true}, DateFrom: "2026-09-24", DateTo: "2026-09-24"}
	for _, keyword := range []string{"原始产品", "客户款号", "POR-P"} {
		q.Keyword = keyword
		board, err := uc.List(ctx, q)
		if err != nil || board.Total != 1 || board.Rows[0].DueDate != "2026-09-24" || board.Rows[0].Overdue || !board.Rows[0].DueSoon {
			t.Fatalf("%s board=%+v err=%v", keyword, board, err)
		}
	}
}
