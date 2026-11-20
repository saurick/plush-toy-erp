package data

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/attachmentstore"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func createWorkflowMediaTestPhoto(t *testing.T, ctx context.Context, client *ent.Client, productID int) int {
	t.Helper()
	return client.BusinessAttachment.Create().SetOwnerType("product").SetOwnerID(productID).SetAttachmentType("product_image").
		SetSlotKey("primary").SetFileName("sample.png").SetMimeType("image/png").SetFileSize(1).
		SetSha256("4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a").SetObjectKey(attachmentstore.NewKey()).SaveX(ctx).ID
}

func TestWorkflowTaskDisplayContextPackagingAndOutsourcingReturn(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "commercial_media_fulfillment")
	f.client.Product.UpdateOneID(f.productID).SetStyleNo("RETURN-SAMPLE-STYLE").SaveX(ctx)
	photo := createWorkflowMediaTestPhoto(t, ctx, f.client, f.productID)
	order := f.client.ProductionOrder.Create().SetOrderNo("PROD-PACK-SAMPLE").SetCreatedBy(f.actorID).SaveX(ctx)
	item := f.client.ProductionOrderItem.Create().SetProductionOrderID(order.ID).SetLineNo(1).SetProductID(f.productID).
		SetUnitID(f.unitID).SetPlannedQuantity(decimal.NewFromInt(2)).SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).SaveX(ctx)
	confirmation := f.client.ProductionPackagingConfirmation.Create().SetProductionOrderID(order.ID).SetProductionOrderItemID(item.ID).SaveX(ctx)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "RETURN-SAMPLE-WH")
	returned := f.client.OutsourcingFact.Create().SetFactNo("RETURN-SAMPLE").SetFactType(biz.OutsourcingFactReturnReceipt).
		SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(f.productID).SetWarehouseID(warehouse.ID).
		SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(2)).SetIdempotencyKey("return-sample").SaveX(ctx)
	for _, source := range []struct {
		kind, no, role string
		id             int
	}{{"production_packaging", order.OrderNo, biz.SalesRoleKey, confirmation.ID}, {"outsourcing_inbound", returned.FactNo, biz.WarehouseRoleKey, returned.ID}} {
		if err := syncFulfillmentTask(ctx, f.client, source.kind, source.id, source.no, "/erp/warehouse/inbound", "ready", "", f.actorID); err != nil {
			t.Fatal(err)
		}
		row := assertFulfillmentTask(t, ctx, f.client, source.kind, source.id, "ready", source.role)
		repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
		got, err := repo.GetWorkflowTask(ctx, row.ID)
		if err != nil || got.DisplayContext == nil || got.DisplayContext.SourceNo != source.no || len(got.DisplayContext.Items) != 1 {
			t.Fatalf("%s projection: %+v, %v", source.kind, got, err)
		}
		if shown := got.DisplayContext.Items[0]; shown.ProductID != f.productID || shown.ImageAttachmentID != photo {
			t.Fatalf("%s loaded the wrong image: %+v", source.kind, shown)
		}
		forged := entWorkflowTaskToBiz(row)
		forged.TaskCode = "FORGED-PHOTO-TASK"
		if err := hydrateWorkflowTaskDisplayContexts(ctx, f.client, []*biz.WorkflowTask{forged}); err != nil || forged.DisplayContext != nil {
			t.Fatalf("%s trusted a forged task: %+v, %v", source.kind, forged.DisplayContext, err)
		}
	}
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	if rows, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: "RETURN-SAMPLE-STYLE", Limit: 10}); err != nil || total != 2 || len(rows) != 2 {
		t.Fatalf("product style did not find the two bound tasks: %d/%d, %v", len(rows), total, err)
	}
}

func TestWorkflowTaskDisplayContextPurchaseAndFinanceFollowPersistedSources(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "commercial_media_purchase")
	photo := createWorkflowMediaTestPhoto(t, ctx, f.client, f.productID)
	other := createSalesOrderTestProduct(t, ctx, f.client, f.unitID, "UNRELATED-PHOTO", true)
	customer := createSalesOrderTestCustomer(t, ctx, f.client, "MEDIA-CUSTOMER", true)
	supplier := createPurchaseOrderTestSupplier(t, ctx, f.client, "MEDIA-SUPPLIER", true)
	material := f.client.Material.Create().SetCode("MEDIA-MATERIAL").SetName("采购面料").SetDefaultUnitID(f.unitID).SaveX(ctx)
	otherUnit := createSalesOrderTestUnit(t, ctx, f.client, "MEDIA-OTHER-UNIT", true)
	sales := f.client.SalesOrder.Create().SetOrderNo("MEDIA-SALES").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	f.client.SalesOrderItem.Create().SetSalesOrderID(sales.ID).SetProductID(f.productID).SetLineNo(1).SetUnitID(f.unitID).SetOrderedQuantity(decimal.NewFromInt(2)).SaveX(ctx)
	request := f.client.EngineeringMaterialRequest.Create().SetSalesOrderID(sales.ID).SetOrderNoSnapshot(sales.OrderNo).
		SetSourceOrderVersion(1).SetSubmittedBy(f.actorID).SetStatus(biz.MaterialRequestApproved).
		SetBossReviewedBy(f.actorID).SetBossReviewedAt(time.Now()).SetFinanceReviewedBy(f.actorID).SetFinanceReviewedAt(time.Now()).
		SetSourceSnapshot([]map[string]any{
			{"product_id": f.productID, "product_name": "审批时的款名", "product_code": "APPROVED-STYLE", "material_id": material.ID, "unit_id": f.unitID},
			{"product_id": other.ID, "product_name": "其它单位的款", "material_id": material.ID, "unit_id": otherUnit.ID},
		}).SaveX(ctx)
	makePurchase := func(no string, requestID *int) *ent.PurchaseOrder {
		row := f.client.PurchaseOrder.Create().SetPurchaseOrderNo(no).SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SetNillableEngineeringMaterialRequestID(requestID).SaveX(ctx)
		f.client.PurchaseOrderItem.Create().SetPurchaseOrderID(row.ID).SetMaterialID(material.ID).SetUnitID(f.unitID).SetLineNo(1).
			SetProductNoSnapshot("APPROVED-STYLE").SetProductNameSnapshot("手填同名").SetPurchasedQuantity(decimal.NewFromInt(4)).SaveX(ctx)
		return row
	}
	linked := makePurchase("MEDIA-PO-LINKED", &request.ID)
	manual := makePurchase("MEDIA-PO-MANUAL", nil)
	advance := f.client.FinancePayment.Create().SetKind(biz.FinancePaymentKindAdvance).SetPaymentNo("MEDIA-ADVANCE").
		SetSourceType("sales_order").SetSourceID(sales.ID).SetCounterpartyType("CUSTOMER").SetCounterpartyID(customer.ID).SetDirection("RECEIPT").
		SetCurrency("CNY").SetAmount(decimal.NewFromInt(3)).SetAccountRef("演练账户").SetEvidenceRef("回单").
		SetIdempotencyKey("media-advance").SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SetCreatedBy(f.actorID).SaveX(ctx)
	bind := func(kind, key string, id int) *biz.WorkflowTask {
		instance := f.client.ProcessInstance.Create().SetProcessKey("source-media").SetProcessVersion("v1").SetConfigRevision("source-media").
			SetDefinitionHash("source-media").SetBusinessRefType(kind).SetBusinessRefID(id).SetIdempotencyKey(key).SaveX(ctx)
		return &biz.WorkflowTask{SourceType: kind, SourceID: id, ProcessInstanceID: &instance.ID}
	}
	tasks := []*biz.WorkflowTask{bind("purchase_order", "purchase-linked", linked.ID), bind("purchase_order", "purchase-manual", manual.ID), bind("finance_payment", "finance-source", advance.ID)}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, f.client, tasks); err != nil {
		t.Fatal(err)
	}
	linkedItems := tasks[0].DisplayContext.Items
	if len(linkedItems) != 2 || linkedItems[0].Kind != "material" || linkedItems[1].Name != "审批时的款名" || linkedItems[1].ProductID != f.productID || linkedItems[1].ImageAttachmentID != photo {
		t.Fatalf("generated purchase must use the matching approved material and unit: %+v", linkedItems)
	}
	manualItems := tasks[1].DisplayContext.Items
	if len(manualItems) != 2 || manualItems[1].Name != "手填同名" || manualItems[1].ProductID != 0 || manualItems[1].ImageAttachmentID != 0 {
		t.Fatalf("typed style was treated as a product relation: %+v", manualItems)
	}
	advanceItems := tasks[2].DisplayContext.Items
	if len(advanceItems) != 1 || advanceItems[0].ProductID != f.productID || advanceItems[0].ImageAttachmentID != photo {
		t.Fatalf("advance receipt did not follow its bound sales order: %+v", advanceItems)
	}
}
