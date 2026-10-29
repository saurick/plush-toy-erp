package data

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/attachmentstore"
	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
)

func TestWorkflowTaskDisplayContextProductionBatch(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "workflow_display_wip")
	product := createSalesOrderTestProduct(t, f.ctx, f.client, f.unitID, "WIP-DISPLAY-P", true)
	f.productID = product.ID
	batch := f.createWaitingBatch(t, "DISPLAY", []string{biz.ProductionWIPQualityGateFinishedGoods})
	product.Update().SetStyleNo("WIP-DISPLAY-STYLE").SaveX(f.ctx)
	batch.item.Update().SetProductNameSnapshot("批次投产时的小熊").SetProductCodeSnapshot("WIP-SNAPSHOT-P").SaveX(f.ctx)
	primary := f.client.BusinessAttachment.Create().SetOwnerType("product").SetOwnerID(product.ID).SetAttachmentType("product_image").SetSlotKey("primary").SetFileName("wip-product.png").SetMimeType("image/png").SetFileSize(1).SetSha256("4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a").SetObjectKey(attachmentstore.NewKey()).SaveX(f.ctx)
	in, err := biz.BuildFulfillmentTask("production_exception", batch.batch.ID, batch.batch.BatchNo, "/erp/production/orders")
	if err != nil {
		t.Fatal(err)
	}
	in.Payload["source_task_intent_hash"] = strings.Repeat("a", 64)
	row := f.client.WorkflowTask.Create().SetTaskCode(in.TaskCode).SetTaskName(in.TaskName).SetTaskGroup(in.TaskGroup).SetSourceType(in.SourceType).SetSourceID(in.SourceID).SetSourceNo(*in.SourceNo).SetOwnerRoleKey(in.OwnerRoleKey).SetRequiredCapabilityKey(*in.RequiredCapabilityKey).SetTaskStatusKey("ready").SetPayload(in.Payload).SaveX(f.ctx)
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	read := func() *biz.WorkflowTaskDisplayContext {
		t.Helper()
		task, readErr := repo.GetWorkflowTask(f.ctx, row.ID)
		if readErr != nil {
			t.Fatal(readErr)
		}
		return task.DisplayContext
	}
	context := read()
	if context == nil || !context.Available || context.SourceNo != batch.batch.BatchNo || len(context.Items) != 1 {
		t.Fatalf("batch identity=%#v", context)
	}
	item := context.Items[0]
	if item.ProductID != product.ID || item.ProductID == batch.batch.ID || item.Name != "批次投产时的小熊" || item.Code != "WIP-SNAPSHOT-P" || item.StyleNo != "WIP-DISPLAY-STYLE" || item.ImageAttachmentID != primary.ID {
		t.Fatalf("batch product identity=%#v", item)
	}
	for _, keyword := range []string{batch.batch.BatchNo, "批次投产时的小熊", "WIP-SNAPSHOT-P", "WIP-DISPLAY-STYLE"} {
		items, total, searchErr := repo.ListWorkflowTasks(f.ctx, biz.WorkflowTaskFilter{Keyword: keyword, Limit: 10})
		if searchErr != nil || total != 1 || len(items) != 1 || items[0].ID != row.ID {
			t.Fatalf("batch search %q total=%d items=%d err=%v", keyword, total, len(items), searchErr)
		}
		page, searchErr := repo.ListWorkflowRoleTaskView(f.ctx, biz.WorkflowRoleTaskViewQuery{RoleKey: "sales", ViewKey: "todo", Keyword: keyword, Limit: 10, IncludeCounts: true, SnapshotAt: time.Now()})
		if searchErr != nil || page.Counts == nil || page.Counts.Todo != 1 || len(page.Items) != 1 || page.Items[0].DisplayContext == nil {
			t.Fatalf("mobile batch search %q page=%#v err=%v", keyword, page, searchErr)
		}
	}
	f.client.BusinessAttachment.DeleteOne(primary).ExecX(f.ctx)
	if read().Items[0].ImageAttachmentID != 0 {
		t.Fatal("cleared batch product image retained")
	}
	other := createSalesOrderTestProduct(t, f.ctx, f.client, f.unitID, "WIP-REPLACED-P", true)
	batch.item.Update().SetProductID(other.ID).ClearProductNameSnapshot().ClearProductCodeSnapshot().SaveX(f.ctx)
	if got := read().Items[0]; got.ProductID != other.ID || got.Name != other.Name || got.Code != other.Code || got.ImageAttachmentID != 0 || got.StyleNo != "" {
		t.Fatalf("batch product replacement retained stale values=%#v", got)
	}
	row.Update().SetPayload(map[string]any{"product_name": "不可信任务快照"}).SaveX(f.ctx)
	if got := read(); got != nil {
		t.Fatalf("unbound batch revealed identity=%#v", got)
	}
	_, total, err := repo.ListWorkflowTasks(f.ctx, biz.WorkflowTaskFilter{Keyword: other.Code, Limit: 10})
	if err != nil || total != 0 {
		t.Fatalf("unbound batch leaked through search: total=%d err=%v", total, err)
	}
	missingID := batch.batch.ID + 10000
	in, err = biz.BuildFulfillmentTask("production_exception", missingID, "WIP-MISSING", "/erp/production/orders")
	if err != nil {
		t.Fatal(err)
	}
	in.Payload["source_task_intent_hash"] = strings.Repeat("b", 64)
	row.Update().SetSourceID(missingID).SetTaskCode(in.TaskCode).SetPayload(in.Payload).SaveX(f.ctx)
	if got := read(); got == nil || got.Available || len(got.Items) != 0 || got.SourceNo != "" {
		t.Fatalf("missing batch retained stale identity=%#v", got)
	}
}

func TestWorkflowTaskDisplayContextSourceIdentityAndSearch(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_display_identity?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	customer := createSalesOrderTestCustomer(t, ctx, client, "DISPLAY-C", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "DISPLAY-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "DISPLAY-P", true)
	product = product.Update().SetName("产品档案名称").SetStyleNo("STYLE-UNIQUE").SaveX(ctx)
	other := createSalesOrderTestProduct(t, ctx, client, unit.ID, "DISPLAY-OTHER", true)
	order := client.SalesOrder.Create().SetOrderNo("SO-DISPLAY").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	item := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(2)).SetProductNameSnapshot("订单时的小熊").SetProductCodeSnapshot("ORDER-P").SaveX(ctx)
	client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(2).SetProductID(other.ID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	instance := client.ProcessInstance.Create().SetProcessKey("display-identity").SetProcessVersion("v1").SetConfigRevision("display-test").SetDefinitionHash("display-test-hash").SetBusinessRefType("sales_order").SetBusinessRefID(order.ID).SetIdempotencyKey("display-source").SaveX(ctx)
	node := client.ProcessNodeInstance.Create().SetProcessInstanceID(instance.ID).SetNodeKey("check").SetNodeType("human_task").SaveX(ctx)
	row := client.WorkflowTask.Create().SetTaskCode("DISPLAY-TASK").SetTaskName("核对资料").SetTaskGroup("engineering_check").SetSourceType("sales_order").SetSourceID(order.ID).SetSourceNo("SO-STALE").SetOwnerRoleKey("engineering").SetTaskStatusKey("ready").SetProcessInstanceID(instance.ID).SetProcessNodeInstanceID(node.ID).SetPayload(map[string]any{"product_name": "旧任务快照", "style_no": "OLD"}).SaveX(ctx)
	read := func() *biz.WorkflowTask {
		t.Helper()
		task, err := repo.GetWorkflowTask(ctx, row.ID)
		if err != nil {
			t.Fatal(err)
		}
		return task
	}

	primary := client.BusinessAttachment.Create().SetOwnerType("product").SetOwnerID(product.ID).SetAttachmentType("product_image").SetSlotKey("primary").SetFileName("bear.png").SetMimeType("image/png").SetFileSize(1).SetSha256("4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a").SetObjectKey(attachmentstore.NewKey()).SaveX(ctx)
	client.BusinessAttachment.Create().SetOwnerType("product").SetOwnerID(other.ID).SetAttachmentType("product_image").SetSlotKey("secondary").SetFileName("other.png").SetMimeType("image/png").SetFileSize(1).SetSha256("4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a").SetObjectKey(attachmentstore.NewKey()).SaveX(ctx)
	task := read()
	if task.DisplayContext == nil || !task.DisplayContext.Available || task.DisplayContext.SourceNo != order.OrderNo || len(task.DisplayContext.Items) != 2 {
		t.Fatalf("context=%#v", task.DisplayContext)
	}
	first := task.DisplayContext.Items[0]
	if first.Name != "订单时的小熊" || first.Code != "ORDER-P" || first.StyleNo != "STYLE-UNIQUE" || first.ProductID != product.ID || first.ImageAttachmentID != primary.ID {
		t.Fatalf("identity=%#v", first)
	}
	if task.Payload["product_name"] != "旧任务快照" {
		t.Fatal("read projection changed the stored task snapshot")
	}
	for _, keyword := range []string{"STYLE-UNIQUE", "订单时的小熊", "ORDER-P", "SO-DISPLAY"} {
		items, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: keyword, Limit: 1})
		if err != nil || total != 1 || len(items) != 1 || items[0].DisplayContext == nil {
			t.Fatalf("search %q: total=%d items=%d err=%v", keyword, total, len(items), err)
		}
	}
	_, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "产品档案名称", Limit: 1})
	if err != nil || total != 0 {
		t.Fatalf("non-displayed current name matched snapshot: total=%d err=%v", total, err)
	}
	for _, keyword := range []string{"旧任务快照", "OLD"} {
		_, count, searchErr := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: keyword, Limit: 1})
		if searchErr != nil || count != 0 {
			t.Fatalf("stale snapshot matched %q: total=%d err=%v", keyword, count, searchErr)
		}
	}
	client.WorkflowTask.Create().SetTaskCode("DISPLAY-UNRELATED").SetSourceType("sales_order").SetSourceID(999).SetTaskName("其他任务").SetTaskGroup("engineering_check").SetOwnerRoleKey("engineering").SetTaskStatusKey("ready").SaveX(ctx)
	for _, keyword := range []string{"STYLE-UNIQUE", "SO-DISPLAY", "旧任务快照"} {
		page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{RoleKey: "engineering", ViewKey: "todo", Keyword: keyword, Limit: 1, IncludeCounts: true, SnapshotAt: time.Now()})
		want := 1
		if keyword == "旧任务快照" {
			want = 0
		}
		if err != nil || page.Counts == nil || page.Counts.Todo != want || len(page.Items) != want || page.HasMore {
			t.Fatalf("mobile search %s page=%#v err=%v", keyword, page, err)
		}
	}
	client.BusinessAttachment.DeleteOne(primary).ExecX(ctx)
	if read().DisplayContext.Items[0].ImageAttachmentID != 0 {
		t.Fatal("cleared primary image retained in projection")
	}
	product.Update().ClearStyleNo().SaveX(ctx)
	if read().DisplayContext.Items[0].StyleNo != "" {
		t.Fatal("cleared style resurrected from code or task payload")
	}
	item.Update().SetProductID(other.ID).ClearProductNameSnapshot().ClearProductCodeSnapshot().SaveX(ctx)
	if got := read().DisplayContext.Items; len(got) != 1 || got[0].Name != other.Name || got[0].Code != other.Code || got[0].ProductID != other.ID || got[0].ImageAttachmentID != 0 {
		t.Fatalf("source replacement retained old identity: %#v", got)
	}
	row.Update().ClearProcessInstanceID().ClearProcessNodeInstanceID().SaveX(ctx)
	if read().DisplayContext != nil {
		t.Fatal("unbound source must not reveal source identities")
	}
	_, total, err = repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: other.Code, Limit: 1})
	if err != nil || total != 0 {
		t.Fatalf("unbound source leaked through search: total=%d err=%v", total, err)
	}
	row.Update().SetProcessInstanceID(instance.ID).SetProcessNodeInstanceID(node.ID).SetSourceID(order.ID + 100).SaveX(ctx)
	if read().DisplayContext != nil {
		t.Fatal("mismatched process binding must not expose a source")
	}
	instance.Update().SetBusinessRefID(order.ID + 100).SaveX(ctx)
	if got := read().DisplayContext; got == nil || got.Available || len(got.Items) != 0 {
		t.Fatalf("missing source must clear identity: %#v", got)
	}
}

func TestWorkflowTaskDisplayContextMaterialSource(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_display_material?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	unit := createSalesOrderTestUnit(t, ctx, client, "M-U", true)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "M-S", true)
	material := client.Material.Create().SetCode("ML-DISPLAY").SetName("短毛绒").SetDefaultUnitID(unit.ID).SaveX(ctx)
	otherMaterial := client.Material.Create().SetCode("ML-DISPLAY-2").SetName("填充棉").SetDefaultUnitID(unit.ID).SaveX(ctx)
	order := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-DISPLAY").SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SaveX(ctx)
	client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(1).SetMaterialID(material.ID).SetUnitID(unit.ID).SetProductNameSnapshot("奶咖钥匙圈").SetProductNoSnapshot("P-1").SetPurchasedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(2).SetMaterialID(otherMaterial.ID).SetUnitID(unit.ID).SetProductNameSnapshot("浅咖钥匙圈").SetProductNoSnapshot("P-2").SetPurchasedQuantity(decimal.NewFromInt(5)).SaveX(ctx)
	instance := client.ProcessInstance.Create().SetProcessKey("material-display").SetProcessVersion("v1").SetConfigRevision("display-test").SetDefinitionHash("display-test-hash").SetBusinessRefType("purchase_order").SetBusinessRefID(order.ID).SetIdempotencyKey("material-source").SaveX(ctx)
	tasks := []*biz.WorkflowTask{{SourceID: order.ID, SourceType: "purchase_order", ProcessInstanceID: &instance.ID}}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, tasks); err != nil {
		t.Fatal(err)
	}
	got := tasks[0].DisplayContext
	if got == nil || got.SourceLineCount == nil || *got.SourceLineCount != 2 || len(got.Items) != 4 || got.Items[0].Kind != "material" || got.Items[0].Code != material.Code || got.Items[0].StyleNo != "" {
		t.Fatalf("material identity=%#v", got)
	}
}

func TestWorkflowTaskDisplayContextSourceProducerSearch(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_display_producer?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	unit := createSalesOrderTestUnit(t, ctx, client, "SOURCE-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "SOURCE-P", true)
	product.Update().SetStyleNo("SOURCE-STYLE").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("display-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	order := client.ProductionOrder.Create().SetOrderNo("MO-SOURCE").SetCreatedBy(actor.ID).SaveX(ctx)
	client.ProductionOrderItem.Create().SetProductionOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).SetPlannedQuantity(decimal.NewFromInt(1)).SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).SaveX(ctx)
	row := client.WorkflowTask.Create().SetTaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionSchedulingGroup, order.ID)).SetTaskName("安排生产").SetTaskGroup(biz.WorkflowSourceTaskProductionSchedulingGroup).SetSourceType(biz.WorkflowSourceTaskProductionOrderSourceType).SetSourceID(order.ID).SetOwnerRoleKey("pmc").SetTaskStatusKey("ready").SetPayload(map[string]any{
		"source_task_contract": biz.WorkflowSourceTaskContractV1,
		"source_task_producer": biz.WorkflowSourceTaskProductionOrderReleaseProducer,
	}).SaveX(ctx)
	items, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "SOURCE-STYLE", Limit: 1})
	if err != nil || total != 1 || len(items) != 1 || items[0].DisplayContext == nil || items[0].DisplayContext.Items[0].StyleNo != "SOURCE-STYLE" {
		t.Fatalf("producer identity: total=%d items=%#v err=%v", total, items, err)
	}
	row.Update().SetTaskCode("untrusted-source-copy").SaveX(ctx)
	_, total, err = repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "SOURCE-STYLE", Limit: 1})
	if err != nil || total != 0 {
		t.Fatalf("invalid producer code leaked identity: total=%d err=%v", total, err)
	}
}

func TestWorkflowTaskDisplayContextFulfillmentSourceSearch(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "display_fulfillment")
	f.client.Product.UpdateOneID(f.productID).SetName("发货小熊").SaveX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "DISPLAY-SHIP-WH")
	shipment := f.client.Shipment.Create().SetShipmentNo("SHIP-DISPLAY-FULFILLMENT").SetIdempotencyKey("display-fulfillment").SaveX(ctx)
	f.client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetProductID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	if err := syncFulfillmentTask(ctx, f.client, "shipment_execute", shipment.ID, shipment.ShipmentNo, "", "ready", "", f.actorID); err != nil {
		t.Fatal(err)
	}
	row := assertFulfillmentTask(t, ctx, f.client, "shipment_execute", shipment.ID, "ready", biz.SalesRoleKey)
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	items, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "发货小熊", Limit: 1})
	if err != nil || total != 1 || len(items) != 1 || items[0].DisplayContext == nil || len(items[0].DisplayContext.Items) != 1 {
		t.Fatalf("fulfillment search lacks source identity: items=%#v total=%d err=%v", items, total, err)
	}
	item := items[0].DisplayContext.Items[0]
	if item.ProductID != f.productID || item.Name != "发货小熊" || item.ImageAttachmentID == 0 {
		t.Fatalf("fulfillment product and image must follow source: %#v", item)
	}
	forged := entWorkflowTaskToBiz(row)
	forged.TaskCode = "untrusted-fulfillment-copy"
	if err := hydrateWorkflowTaskDisplayContexts(ctx, f.client, []*biz.WorkflowTask{forged}); err != nil || forged.DisplayContext != nil {
		t.Fatalf("untrusted fulfillment cannot read source identity: %#v err=%v", forged.DisplayContext, err)
	}
}

func TestWorkflowTaskDisplayContextQualityProduct(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_display_quality?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	unit := createSalesOrderTestUnit(t, ctx, client, "QUALITY-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "QUALITY-P", true)
	product.Update().SetStyleNo("QUALITY-STYLE").SaveX(ctx)
	warehouse := client.Warehouse.Create().SetCode("DISPLAY-WH").SetName("成品仓").SetType("FINISHED_GOODS").SaveX(ctx)
	lot := client.InventoryLot.Create().SetSubjectType("PRODUCT").SetSubjectID(product.ID).SetLotNo("DISPLAY-LOT").SaveX(ctx)
	inspection := client.QualityInspection.Create().SetInspectionNo("DISPLAY-QI").SetInventoryLotID(lot.ID).SetWarehouseID(warehouse.ID).SetSubjectType("PRODUCT").SetSubjectID(product.ID).SaveX(ctx)
	instance := client.ProcessInstance.Create().SetProcessKey("quality-display").SetProcessVersion("v1").SetConfigRevision("display-test").SetDefinitionHash("display-test-hash").SetBusinessRefType("quality_inspection").SetBusinessRefID(inspection.ID).SetIdempotencyKey("quality-source").SaveX(ctx)
	node := client.ProcessNodeInstance.Create().SetProcessInstanceID(instance.ID).SetNodeKey("check").SetNodeType("human_task").SaveX(ctx)
	client.WorkflowTask.Create().SetTaskCode("QUALITY-DISPLAY-TASK").SetTaskName("核对检验").SetTaskGroup("quality_check").SetSourceType("quality_inspection").SetSourceID(inspection.ID).SetOwnerRoleKey("quality").SetTaskStatusKey("ready").SetProcessInstanceID(instance.ID).SetProcessNodeInstanceID(node.ID).SaveX(ctx)
	items, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "QUALITY-STYLE", Limit: 1})
	if err != nil || total != 1 || len(items) != 1 || items[0].DisplayContext == nil || len(items[0].DisplayContext.Items) != 1 || items[0].DisplayContext.Items[0].Kind != "product" {
		t.Fatalf("quality product identity: total=%d items=%#v err=%v", total, items, err)
	}
}
