package data

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/png"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

// The workspace uses the same aggregate writers as the business pages.
func TestEngineeringWorkspaceFromCustomerDemandToMaterialSubmission(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "engineering_workspace_chain")
	logger := log.NewStdLogger(io.Discard)
	sales := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	master := biz.NewMasterDataUsecase(NewMasterDataRepo(data, logger))
	inventory := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	media := biz.NewBusinessAttachmentUsecase(NewBusinessAttachmentRepo(data, newAttachmentMemoryStore(), logger))
	customer := createSalesOrderTestCustomer(t, ctx, client, "WORKSPACE-C", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "WORKSPACE-PCS", true)
	unit = client.Unit.UpdateOneID(unit.ID).SetPrecision(6).SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("WORKSPACE-S").SetName("模拟材料厂").SetDefaultPaymentMethod("货到付款").SetDefaultInvoiceRequired(false).SaveX(ctx)
	str := func(s string) *string { return &s }
	weight := decimal.RequireFromString("125.125")
	demand := &biz.SalesOrderMutation{OrderNo: "WORKSPACE-SO", CustomerID: customer.ID, Currency: "CNY", OrderDate: time.Now(), TaxMode: str(biz.SalesOrderTaxModeNone), FreightTerms: str(biz.SalesOrderFreightTermsIncluded)}
	price := decimal.NewFromInt(10)
	saved, err := sales.SaveSalesOrderWithItems(ctx, 0, demand, []*biz.SalesOrderItemSaveMutation{{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, UnitID: unit.ID, RequestedProductName: str("新开发玩偶"), CustomerProductNo: str("CLIENT-NEW"), OrderedQuantity: decimal.NewFromInt(100), PreShipmentSampleQuantity: decimal.NewFromInt(2), UnitPrice: &price}}})
	if err != nil {
		t.Fatal(err)
	}
	if client.Product.Query().CountX(ctx) != 0 || saved.Items[0].ProductID != 0 {
		t.Fatal("demand must not fabricate a product")
	}
	if _, err = sales.SubmitSalesOrder(ctx, saved.Order.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = sales.ActivateSalesOrder(ctx, saved.Order.ID); err != nil {
		t.Fatal(err)
	}
	product, err := master.CreateProduct(ctx, &biz.ProductMutation{Code: "WORKSPACE-P", Name: "新开发玩偶", StyleNo: str("27027#"), CustomerStyleNo: str("CLIENT-NEW"), EnglishName: str("New plush"), HSCode: str("950300"), DefaultUnitID: unit.ID, UnitNetWeightG: &weight})
	if err != nil {
		t.Fatal(err)
	}
	sku, err := master.CreateProductSKU(ctx, &biz.ProductSKUMutation{ProductID: product.ID, SKUCode: "WORKSPACE-SKU", SKUName: str("蓝色30cm"), Barcode: str("12345678"), CustomerSKU: str("C-SKU"), Color: str("蓝色"), ColorNo: str("B01"), Size: str("30cm"), PackagingVersion: str("PK-V1"), DefaultUnitID: &unit.ID, UnitNetWeightG: &weight})
	if err != nil {
		t.Fatal(err)
	}
	if sku.ProductID != product.ID || sku.ColorNo == nil || *sku.ColorNo != "B01" || product.UnitNetWeightG == nil || !product.UnitNetWeightG.Equal(weight) {
		t.Fatalf("field readback: %+v %+v", product, sku)
	}
	material, err := master.CreateMaterial(ctx, &biz.MaterialMutation{Code: "WORKSPACE-M", Name: "短绒布", SupplierID: &supplier.ID, SupplierItemNo: str("A01"), Color: str("蓝"), Spec: str("1.5m"), DefaultUnitID: unit.ID})
	if err != nil {
		t.Fatal(err)
	}
	date := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)
	end := date.AddDate(0, 0, 1)
	header := &biz.BOMVersionMutation{ProductID: product.ID, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "WORKSPACE-BOM", EffectiveFrom: &date, EffectiveTo: &end, SourceOrderNo: str("WORKSPACE-SO"), QuantityText: str("102"), SpareText: str("2"), PrintDate: &date, Designer: str("工程甲"), Maker: str("制表乙"), Auditor: str("审核丙"), HairDirection: str("向下"), Note: str("按确认样")}}
	bom, err := inventory.SaveBOMWithItems(ctx, 0, header, nil)
	if err != nil {
		t.Fatal(err)
	}
	mutation := biz.SalesOrderEngineeringItemMutation{ID: saved.Items[0].ID, ProductID: product.ID, ProductSkuID: &sku.ID, BOMID: &bom.Header.ID, ExpectedBOMVersion: bom.Header.EditVersion}
	complete := false
	apply := func(want error) {
		t.Helper()
		before := client.SalesOrder.GetX(ctx, saved.Order.ID)
		result, e := sales.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: before.ID, ExpectedVersion: before.Version, ActorID: 42, Complete: complete, Items: []biz.SalesOrderEngineeringItemMutation{mutation}})
		if !errors.Is(e, want) {
			t.Fatalf("engineering: got %v want %v", e, want)
		}
		after := client.SalesOrder.GetX(ctx, before.ID)
		if want != nil && after.Version != before.Version {
			t.Fatal("failed transition changed version")
		}
		if want == nil && (result.Order.Version != before.Version+1 || after.Version != result.Order.Version) {
			t.Fatal("CAS/readback version mismatch")
		}
	}
	apply(nil)
	complete = true
	apply(biz.ErrSalesOrderEngineeringNotReady)
	header.ExpectedVersion = bom.Header.EditVersion
	parts := []*biz.BOMItemSaveMutation{{BOMItemUpdate: biz.BOMItemUpdate{MaterialID: material.ID, UnitID: unit.ID, Quantity: decimal.RequireFromString("0.25"), LossRate: decimal.RequireFromString("0.03"), Position: str("身体"), PieceCount: str("2"), ProcessBase: str("贴衬"), ProcessMethod: str("车缝"), Note: str("按样核对")}}}
	bom, err = inventory.SaveBOMWithItems(ctx, bom.Header.ID, header, parts)
	if err != nil {
		t.Fatal(err)
	}
	mutation.ExpectedBOMVersion = bom.Header.EditVersion
	var content bytes.Buffer
	if err = png.Encode(&content, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	actor := 42
	imageFile, err := media.UploadBusinessAttachment(ctx, &biz.BusinessAttachmentUploadInput{OwnerType: biz.BusinessAttachmentOwnerProduct, OwnerID: product.ID, AttachmentType: biz.BusinessAttachmentTypeProductImage, SlotKey: str(biz.BusinessAttachmentProductImageSlotPrimary), FileName: "primary.png", MimeType: "image/png", ContentBase64: base64.StdEncoding.EncodeToString(content.Bytes()), UploadedBy: &actor})
	if err != nil {
		t.Fatal(err)
	}
	imageReadback, err := media.GetBusinessAttachmentContent(ctx, imageFile)
	if err != nil || !bytes.Equal(imageReadback, content.Bytes()) {
		t.Fatalf("image readback: %v", err)
	}
	apply(nil)
	completed := client.SalesOrderItem.GetX(ctx, mutation.ID)
	if completed.BomFingerprint == nil || client.BOMHeader.GetX(ctx, bom.Header.ID).Status != biz.BOMStatusActive {
		t.Fatal("engineering completion missing BOM or manufacturing snapshot")
	}
	preview, err := sales.GetEngineeringMaterialRequest(ctx, saved.Order.ID, true)
	if err != nil || len(preview.Issues) != 0 || len(preview.Sources) != 1 || len(preview.Items) != 1 {
		t.Fatalf("material preview: %v %+v", err, preview)
	}
	if !preview.Items[0].RequiredQuantity.Equal(decimal.RequireFromString("26.265")) {
		t.Fatalf("102 * .25 * 1.03: %s", preview.Items[0].RequiredQuantity)
	}
	if _, err = sales.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: saved.Order.ID, ExpectedVersion: preview.SourceOrderVersion - 1, ExpectedSourceHash: preview.SourceHash, ActorID: 42}); err == nil {
		t.Fatal("stale submission accepted")
	}
	request, err := sales.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: saved.Order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 42})
	if err != nil {
		t.Fatal(err)
	}
	if request.ID <= 0 || request.Status != biz.MaterialRequestSubmitted || request.SourceHash != preview.SourceHash || request.SourceOrderVersion != preview.SourceOrderVersion {
		t.Fatalf("submission receipt: %+v", request)
	}
	apply(biz.ErrSalesOrderEngineeringDependency)
	if client.InventoryTxn.Query().CountX(ctx) != 0 || client.PurchaseOrder.Query().CountX(ctx) != 0 || client.Shipment.Query().CountX(ctx) != 0 || client.FinancePayment.Query().CountX(ctx) != 0 {
		t.Fatal("engineering submission posted unrelated facts")
	}
}
