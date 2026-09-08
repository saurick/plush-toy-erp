package data

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestMaterialSupplierItemNoCRUDAndTaskIdentity(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "material_supplier_item_no")
	defer mustCloseEntClient(t, client)
	unit := createSalesOrderTestUnit(t, ctx, client, "SUPPLIER-ITEM-U", true)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SUPPLIER-ITEM-S", true)
	ref := "示例织造AB-001#-02#米白"
	mutation := biz.MaterialMutation{Code: "MAT-IDENTITY", Name: "短毛绒", DefaultUnitID: unit.ID, SupplierItemNo: &ref}
	material, err := uc.CreateMaterial(ctx, &mutation)
	if err != nil || material.SupplierItemNo == nil || *material.SupplierItemNo != ref {
		t.Fatalf("create: material=%#v err=%v", material, err)
	}
	order := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-SUPPLIER-ITEM").SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SaveX(ctx)
	line := client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(1).SetMaterialID(material.ID).SetMaterialNameSnapshot("下单时的短毛绒").SetMaterialCodeSnapshot("MAT-ORDER-SNAPSHOT").SetUnitID(unit.ID).SetPurchasedQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	instance := client.ProcessInstance.Create().SetProcessKey("supplier-item").SetProcessVersion("v1").SetConfigRevision("test").SetDefinitionHash("test").SetBusinessRefType("purchase_order").SetBusinessRefID(order.ID).SetIdempotencyKey("supplier-item-source").SaveX(ctx)
	node := client.ProcessNodeInstance.Create().SetProcessInstanceID(instance.ID).SetNodeKey("check").SetNodeType("human_task").SaveX(ctx)
	task := client.WorkflowTask.Create().SetTaskCode("SUPPLIER-ITEM-TASK").SetTaskName("核对材料").SetTaskGroup("purchase_check").SetSourceType("purchase_order").SetSourceID(order.ID).SetOwnerRoleKey("purchase").SetTaskStatusKey("ready").SetProcessInstanceID(instance.ID).SetProcessNodeInstanceID(node.ID).SetPayload(map[string]any{"supplier_item_no": "过期料号"}).SaveX(ctx)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	checkIdentity := func(want string) {
		t.Helper()
		got, readErr := repo.GetWorkflowTask(ctx, task.ID)
		if readErr != nil || got.DisplayContext == nil || len(got.DisplayContext.Items) != 1 {
			t.Fatalf("task read=%#v err=%v", got, readErr)
		}
		item := got.DisplayContext.Items[0]
		if item.SupplierItemNo != want || item.Code != "MAT-ORDER-SNAPSHOT" || item.Name != "下单时的短毛绒" {
			t.Fatalf("identity=%#v want supplier=%s", item, want)
		}
	}
	checkSearch := func(keyword string, want int) {
		t.Helper()
		materials, total, searchErr := uc.ListMaterials(ctx, biz.MasterDataFilter{Keyword: keyword, Limit: 20})
		if searchErr != nil || total != want || len(materials) != want {
			t.Fatalf("material search %q total=%d err=%v", keyword, total, searchErr)
		}
		tasks, total, searchErr := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: keyword, Limit: 1})
		if searchErr != nil || total != want || len(tasks) != want {
			t.Fatalf("task search %q total=%d err=%v", keyword, total, searchErr)
		}
		page, searchErr := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{RoleKey: "purchase", ViewKey: "todo", Keyword: keyword, Limit: 1, IncludeCounts: true, SnapshotAt: time.Now()})
		if searchErr != nil || len(page.Items) != want || page.Counts == nil || page.Counts.Todo != want {
			t.Fatalf("mobile search %q page=%#v err=%v", keyword, page, searchErr)
		}
	}
	checkIdentity(ref)
	checkSearch("ab-001#-02#", 1)
	checkSearch("过期料号", 0)
	if page, searchErr := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{RoleKey: "warehouse", ViewKey: "todo", Keyword: "AB-001", Limit: 1, IncludeCounts: true, SnapshotAt: time.Now()}); searchErr != nil || len(page.Items) != 0 {
		t.Fatalf("supplier keyword crossed role scope: page=%#v err=%v", page, searchErr)
	}
	ref = "另一示例CD-002#蓝"
	if _, err = uc.UpdateMaterial(ctx, material.ID, &mutation); err != nil {
		t.Fatal(err)
	}
	checkIdentity(ref)
	checkSearch("AB-001", 0)
	checkSearch("CD-002", 1)
	mutation.SupplierItemNo = nil
	if _, err = uc.UpdateMaterial(ctx, material.ID, &mutation); err != nil {
		t.Fatal(err)
	}
	readback, err := uc.GetMaterial(ctx, material.ID)
	if err != nil || readback.SupplierItemNo != nil {
		t.Fatalf("clear readback=%#v err=%v", readback, err)
	}
	checkIdentity("")
	checkSearch("CD-002", 0)
	other := client.Material.Create().SetCode("MAT-OTHER").SetName("另一面料").SetSupplierItemNo("示例EF-003#").SetDefaultUnitID(unit.ID).SaveX(ctx)
	line.Update().SetMaterialID(other.ID).SaveX(ctx)
	checkIdentity("示例EF-003#")
	task.Update().ClearProcessInstanceID().ClearProcessNodeInstanceID().SaveX(ctx)
	_, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "EF-003", Limit: 1})
	if err != nil || total != 0 {
		t.Fatalf("unbound source leaked supplier identity: total=%d err=%v", total, err)
	}
	_, total, err = repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "过期料号", Limit: 1})
	if err != nil || total != 1 {
		t.Fatalf("unlinked task cannot search its own supplier snapshot: total=%d err=%v", total, err)
	}
}
