package data

import (
	"server/internal/attachmentstore"
	"context"
	"errors"
	"fmt"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"io"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/engineeringmaterialrequest"
	"server/internal/data/model/ent/purchaseorder"
	"strings"
	"sync"
	"testing"
	"time"
)

type materialRequestFixture struct {
	repo  *salesOrderRepo
	uc    *biz.SalesOrderUsecase
	order *ent.SalesOrder
	line  *ent.SalesOrderItem
	bom   *ent.BOMHeader
}

func prepareProductionEngineeringFixture(t *testing.T, ctx context.Context, data *Data, itemID, bomID int) {
	t.Helper()
	client := data.postgres
	line := client.SalesOrderItem.GetX(ctx, itemID)
	bom := client.BOMHeader.GetX(ctx, bomID)
	parts := client.BOMItem.Query().Where(bomitem.BomHeaderID(bomID)).AllX(ctx)
	for _, part := range parts {
		m := client.Material.GetX(ctx, part.MaterialID)
		if m.SupplierID == nil {
			s := client.Supplier.Create().SetCode(fmt.Sprintf("PRODUCTION-V-%d", m.ID)).SetName("生产测试材料厂").SaveX(ctx)
			client.Material.UpdateOneID(m.ID).SetSupplierID(s.ID).SaveX(ctx)
		}
	}
	client.BusinessAttachment.Create().SetOwnerType(biz.BusinessAttachmentOwnerProduct).SetOwnerID(line.ProductID).SetAttachmentType(biz.BusinessAttachmentTypeProductImage).SetSlotKey(biz.BusinessAttachmentProductImageSlotPrimary).SetFileName("fixture.png").SetMimeType("image/png").SetFileSize(1).SetObjectKey(attachmentstore.NewKey()).SetSha256(strings.Repeat("b", 64)).SaveX(ctx)
	uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	for _, state := range []string{biz.SalesOrderEngineeringPreparing, biz.SalesOrderEngineeringSampling, biz.SalesOrderEngineeringConfirmed} {
		order := client.SalesOrder.GetX(ctx, line.SalesOrderID)
		note := "测试样品已确认"
		_, err := uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: order.ID, ExpectedVersion: order.Version, ActorID: 11, Items: []biz.SalesOrderEngineeringItemMutation{{ID: line.ID, ProductID: line.ProductID, ProductSkuID: line.ProductSkuID, SampleBOMID: &bom.ID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro(), EngineeringStatus: state, SampleNote: &note}}})
		if err != nil {
			t.Fatal(err)
		}
	}
	preview, err := uc.GetEngineeringMaterialRequest(ctx, line.SalesOrderID, true)
	if err != nil || len(preview.Issues) > 0 {
		t.Fatalf("production engineering fixture: %v %+v", err, preview)
	}
	request, err := uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: line.SalesOrderID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11})
	if err != nil {
		t.Fatal(err)
	}
	request, err = uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(request)); err != nil {
		t.Fatal(err)
	}
}

func prepareMaterialRequestFixture(t *testing.T, ctx context.Context, data *Data, key string) materialRequestFixture {
	t.Helper()
	client := data.postgres
	repo := NewSalesOrderRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewSalesOrderUsecase(repo)
	customer := createSalesOrderTestCustomer(t, ctx, client, key+"-C", true)
	unit := createSalesOrderTestUnit(t, ctx, client, key+"-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, key+"-P", true)
	order := client.SalesOrder.Create().SetOrderNo(key).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetCurrency("CNY").SaveX(ctx)
	line := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetUnitID(unit.ID).SetRequestedProductName("定制玩偶").SetOrderedQuantity(decimal.NewFromInt(1000)).SetPreShipmentSampleQuantity(decimal.NewFromInt(12)).SaveX(ctx)
	bom := client.BOMHeader.Create().SetProductID(product.ID).SetVersion("V1").SaveX(ctx)
	for i := 0; i < 2; i++ {
		vendor := client.Supplier.Create().SetCode(fmt.Sprintf("%s-V%d", key, i)).SetName(fmt.Sprintf("材料厂%d", i)).SetDefaultPaymentMethod("货到付款").SetDefaultInvoiceRequired(false).SaveX(ctx)
		material := client.Material.Create().SetCode(fmt.Sprintf("%s-M%d", key, i)).SetName("短绒").SetDefaultUnitID(unit.ID).SetSupplierID(vendor.ID).SetSupplierItemNo("A10").SetColor("01").SaveX(ctx)
		for j := 0; j < 2-i; j++ {
			client.BOMItem.Create().SetBomHeaderID(bom.ID).SetMaterialID(material.ID).SetUnitID(unit.ID).SetPosition(fmt.Sprintf("部位%d", j)).SetPieceCount("2").SetQuantity(decimal.RequireFromString("0.1")).SetLossRate(decimal.RequireFromString("0.1")).SaveX(ctx)
		}
	}
	client.BusinessAttachment.Create().SetOwnerType(biz.BusinessAttachmentOwnerProduct).SetOwnerID(product.ID).SetAttachmentType(biz.BusinessAttachmentTypeProductImage).SetSlotKey(biz.BusinessAttachmentProductImageSlotPrimary).SetFileName("sample.png").SetMimeType("image/png").SetFileSize(1).SetObjectKey(attachmentstore.NewKey()).SetSha256(strings.Repeat("a", 64)).SaveX(ctx)
	for _, state := range []string{biz.SalesOrderEngineeringPreparing, biz.SalesOrderEngineeringSampling, biz.SalesOrderEngineeringConfirmed} {
		note := "样品已核对"
		order = client.SalesOrder.GetX(ctx, order.ID)
		_, err := uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: order.ID, ExpectedVersion: order.Version, ActorID: 11, Items: []biz.SalesOrderEngineeringItemMutation{{ID: line.ID, ProductID: product.ID, SampleBOMID: &bom.ID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro(), EngineeringStatus: state, SampleNote: &note}}})
		if err != nil {
			t.Fatalf("draft engineering %s: %v", state, err)
		}
	}
	// Status activation is not a change to the sampled manufacturing content.
	client.BOMHeader.UpdateOneID(bom.ID).SetStatus(biz.BOMStatusActive).SaveX(ctx)
	order = client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	return materialRequestFixture{repo: repo, uc: uc, order: order, line: line, bom: bom}
}
func submitMaterialRequestFixture(t *testing.T, ctx context.Context, f materialRequestFixture) *biz.EngineeringMaterialRequest {
	t.Helper()
	preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 0 || len(preview.Items) != 2 || len(preview.Sources) != 3 {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	if preview.Items[0].RequiredQuantity.String() != "222.64" || preview.Items[1].RequiredQuantity.String() != "111.32" {
		t.Fatalf("grouped source quantities: %+v", preview.Items)
	}
	submitted, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11})
	if err != nil {
		t.Fatal(err)
	}
	if submitted.SourceHash != preview.SourceHash {
		t.Fatalf("stored source changed hash: %s %s", submitted.SourceHash, preview.SourceHash)
	}
	return submitted
}
func financeMaterialRequestInput(request *biz.EngineeringMaterialRequest) *biz.EngineeringMaterialReview {
	in := &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 33, Action: "FINANCE_APPROVE"}
	for _, item := range request.Items {
		in.Items = append(in.Items, biz.EngineeringMaterialFinanceLine{ID: item.ID, PurchaseQuantity: item.RequiredQuantity, UnitPrice: decimal.NewFromInt(10), ExpectedArrivalDate: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)})
	}
	return in
}
func TestEngineeringMaterialRequestApprovalAndPurchaseGeneration(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_request_flow")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "REQUEST-FLOW")
	request := submitMaterialRequestFixture(t, ctx, f)
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(request)); !errors.Is(err, biz.ErrMaterialRequestReviewInvalid) {
		t.Fatalf("finance before boss: %v", err)
	}
	boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	in := financeMaterialRequestInput(boss)
	in.ActorID = 22
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); !errors.Is(err, biz.ErrMaterialRequestReviewInvalid) {
		t.Fatalf("same reviewer twice: %v", err)
	}
	in.ActorID = 33
	in.Items[0].PurchaseQuantity = decimal.NewFromInt(200)
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); !errors.Is(err, biz.ErrMaterialRequestReviewInvalid) {
		t.Fatalf("quantity change without reason: %v", err)
	}
	if client.PurchaseOrder.Query().CountX(ctx) != 0 {
		t.Fatal("invalid approval generated a purchase order")
	}
	note := "使用已核对的库存 22.64"
	in.Items[0].Note = &note
	approved, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if approved.Status != biz.MaterialRequestApproved || len(approved.PurchaseOrders) != 2 {
		t.Fatalf("approval result: %+v", approved)
	}
	for _, po := range approved.PurchaseOrders {
		row := client.PurchaseOrder.GetX(ctx, po.ID)
		if row.LifecycleStatus != biz.PurchaseOrderStatusApproved || row.EngineeringMaterialRequestID == nil || *row.EngineeringMaterialRequestID != request.ID {
			t.Fatalf("purchase trace: %+v", row)
		}
	}
	again, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in)
	if err != nil || again.ID != approved.ID || client.PurchaseOrder.Query().CountX(ctx) != 2 {
		t.Fatalf("approval replay duplicated orders: %v", err)
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 || client.PurchaseReceipt.Query().CountX(ctx) != 0 {
		t.Fatal("approval fabricated warehouse facts")
	}
	before := client.SalesOrder.GetX(ctx, f.order.ID)
	_, err = f.uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: before.ID, ExpectedVersion: before.Version, ActorID: 11, Items: []biz.SalesOrderEngineeringItemMutation{{ID: f.line.ID, EngineeringStatus: biz.SalesOrderEngineeringPreparing, SampleNote: &note}}})
	if !errors.Is(err, biz.ErrSalesOrderEngineeringDependency) {
		t.Fatalf("approved source replacement: %v", err)
	}
}
func TestEngineeringMaterialRequestSourceChangeAndRejection(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_request_source")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "REQUEST-SOURCE")
	request := submitMaterialRequestFixture(t, ctx, f)
	original := request.Items[0].SupplierID
	replacement := client.Supplier.Create().SetCode("OTHER-SUPPLIER").SetName("其他厂商").SaveX(ctx)
	client.Material.UpdateOneID(request.Items[0].MaterialID).SetSupplierID(replacement.ID).SaveX(ctx)
	_, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if !errors.Is(err, biz.ErrMaterialRequestConflict) {
		t.Fatalf("changed source approved: %v", err)
	}
	note := "核对厂商后重新提交"
	rejected, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "REJECT", ReviewStage: "BOSS", Note: &note})
	if err != nil || rejected.Status != biz.MaterialRequestRejected {
		t.Fatalf("reject source: %v", err)
	}
	client.Material.UpdateOneID(request.Items[0].MaterialID).SetSupplierID(original).SaveX(ctx)
	resubmitted := submitMaterialRequestFixture(t, ctx, f)
	if resubmitted.ID == request.ID {
		t.Fatal("rejection history overwritten")
	}
	if client.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(f.order.ID)).CountX(ctx) != 2 {
		t.Fatal("review history missing")
	}
}

func TestSalesOrderRepeatReusesOnlySameCustomerConfirmedSample(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "repeat_sample")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "REPEAT-SOURCE")
	prior := client.SalesOrderItem.GetX(ctx, f.line.ID)
	bom := client.BOMHeader.GetX(ctx, f.bom.ID)
	order := client.SalesOrder.Create().SetOrderNo("REPEAT-NEXT").SetCustomerID(f.order.CustomerID).SetOrderDate(time.Now()).SaveX(ctx)
	line := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetRequestedProductName("同款返单").SetOrderCategory("REPEAT").SetUnitID(prior.UnitID).SetOrderedQuantity(decimal.NewFromInt(20)).SaveX(ctx)
	note := "客户确认资料无变化，沿用已确认样品"
	in := &biz.SalesOrderEngineeringMutation{SalesOrderID: order.ID, ExpectedVersion: order.Version, ActorID: 11, Items: []biz.SalesOrderEngineeringItemMutation{{ID: line.ID, ProductID: prior.ProductID, ProductSkuID: prior.ProductSkuID, SampleBOMID: &bom.ID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro(), ReuseConfirmedSample: true, EngineeringStatus: biz.SalesOrderEngineeringConfirmed, SampleNote: &note}}}
	if _, err := f.uc.SaveSalesOrderEngineering(ctx, in); err != nil {
		t.Fatal(err)
	}
	actual := client.SalesOrderItem.GetX(ctx, line.ID)
	if actual.SampleReusedFromItemID == nil || *actual.SampleReusedFromItemID != prior.ID {
		t.Fatal("repeat did not preserve confirmation source")
	}
	other := createSalesOrderTestCustomer(t, ctx, client, "REPEAT-OTHER-CUSTOMER", true)
	client.SalesOrder.UpdateOneID(order.ID).SetCustomerID(other.ID).SaveX(ctx)
	in.ExpectedVersion = client.SalesOrder.GetX(ctx, order.ID).Version
	if _, err := f.uc.SaveSalesOrderEngineering(ctx, in); !errors.Is(err, biz.ErrSalesOrderEngineeringNotReady) {
		t.Fatalf("another customer's sample was reused: %v", err)
	}
}
func TestSourceDocumentPostgresEngineeringMaterialConcurrentApproval(t *testing.T) {
	data, _ := openPurchaseReceiptPostgresTestData(t)
	ctx := context.Background()
	f := prepareMaterialRequestFixture(t, ctx, data, "PG-MATERIAL-"+postgresTestSuffix())
	request := submitMaterialRequestFixture(t, ctx, f)
	boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	in := financeMaterialRequestInput(boss)
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func(i int) { defer wg.Done(); <-start; _, errs[i] = f.uc.ReviewEngineeringMaterialRequest(ctx, in) }(i)
	}
	close(start)
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if count := data.postgres.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).CountX(ctx); count != 2 {
		t.Fatalf("concurrent approval created %d orders", count)
	}
}

func TestProductionReleaseRequiresMaterialApprovalAndCurrentSample(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_engineering_gate")
	defer mustCloseEntClient(t, client)
	actor := client.AdminUser.Create().SetUsername("engineering-gate-actor").SetPasswordHash("test-hash").SaveX(ctx)
	f := prepareMaterialRequestFixture(t, ctx, data, "ENGINEERING-GATE")
	line := client.SalesOrderItem.GetX(ctx, f.line.ID)
	production := biz.NewProductionOrderUsecase(NewProductionOrderRepo(data, log.NewStdLogger(io.Discard)))
	created, err := production.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: biz.ProductionOrderDraft{OrderNo: "MO-ENGINEERING-GATE", Items: []biz.ProductionOrderDraftItem{{LineNo: 1, ProductID: line.ProductID, UnitID: line.UnitID, SalesOrderItemID: &line.ID, BOMHeaderID: &f.bom.ID, PlannedQuantity: decimal.NewFromInt(10)}}}, ActorID: actor.ID, IdempotencyKey: "engineering-gate-create"})
	if err != nil {
		t.Fatal(err)
	}
	action := &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: actor.ID, IdempotencyKey: "engineering-gate-release"}
	if _, err = production.Release(ctx, action); !errors.Is(err, biz.ErrMaterialRequestNotReady) {
		t.Fatalf("release before material approval: %v", err)
	}
	request := submitMaterialRequestFixture(t, ctx, f)
	request, err = f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(request)); err != nil {
		t.Fatal(err)
	}
	part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
	client.BOMItem.UpdateOneID(part.ID).SetQuantity(decimal.NewFromInt(9)).SaveX(ctx)
	if _, err = production.Release(ctx, action); !errors.Is(err, biz.ErrSalesOrderEngineeringNotReady) {
		t.Fatalf("release using changed sampled BOM: %v", err)
	}
	if client.ProductionOrder.GetX(ctx, created.Order.ID).Status != biz.ProductionOrderStatusDraft {
		t.Fatal("failed release changed order")
	}
}
