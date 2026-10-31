package data

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestDocumentProductPreviewsGroupAcrossLinesAndSources(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "document_product_previews")
	defer closeRepo()
	ctx := context.Background()
	client := repo.data.postgres
	unit := client.Unit.Create().SetCode("PCS").SetName("只").SaveX(ctx)
	customer := client.Customer.Create().SetCode("GALLERY-CUSTOMER").SetName("模拟客户").SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("GALLERY-SUPPLIER").SetName("模拟加工厂").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("gallery-test").SetPasswordHash("not-a-login-hash").SaveX(ctx)
	process := client.Process.Create().SetCode("GALLERY-PROCESS").SetName("模拟加工").SaveX(ctx)
	material := client.Material.Create().SetCode("GALLERY-MATERIAL").SetName("模拟面料").SetDefaultUnitID(unit.ID).SaveX(ctx)
	one := client.Product.Create().SetCode("GALLERY-ONE").SetName("模拟蓝熊").SetDefaultUnitID(unit.ID).SaveX(ctx)
	two := client.Product.Create().SetCode("GALLERY-TWO").SetName("模拟兔子").SetDefaultUnitID(unit.ID).SaveX(ctx)
	sales := client.SalesOrder.Create().SetOrderNo("SO-GALLERY").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	empty := client.SalesOrder.Create().SetOrderNo("SO-EMPTY").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	production := client.ProductionOrder.Create().SetOrderNo("PO-GALLERY").SetCreatedBy(actor.ID).SaveX(ctx)
	outsourcing := client.OutsourcingOrder.Create().SetOutsourcingOrderNo("OO-GALLERY").SetSupplierID(supplier.ID).SetOrderDate(time.Now()).SaveX(ctx)
	for i, productID := range []int{two.ID, one.ID, one.ID} {
		client.SalesOrderItem.Create().SetSalesOrderID(sales.ID).SetLineNo(i + 1).SetProductID(productID).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
		client.ProductionOrderItem.Create().SetProductionOrderID(production.ID).SetLineNo(i + 1).SetProductID(productID).SetUnitID(unit.ID).SetPlannedQuantity(decimal.NewFromInt(1)).SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).SaveX(ctx)
		client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(outsourcing.ID).SetLineNo(i + 1).SetSubjectType(biz.OutsourcingOrderSubjectProduct).SetProductID(productID).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	}
	client.SalesOrderItem.Create().SetSalesOrderID(sales.ID).SetLineNo(4).SetRequestedProductName("尚未建立产品").SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(outsourcing.ID).SetLineNo(4).SetSubjectType(biz.OutsourcingOrderSubjectMaterial).SetMaterialID(material.ID).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	for _, test := range []struct {
		source string
		id     int
	}{{biz.DocumentProductPreviewSalesOrder, sales.ID}, {biz.DocumentProductPreviewProductionOrder, production.ID}, {biz.DocumentProductPreviewOutsourcingOrder, outsourcing.ID}} {
		rows, err := repo.ListDocumentProductPreviews(ctx, test.source, []int{test.id, 9999})
		if err != nil || len(rows) != 2 || rows[0].ProductCount != 2 || rows[0].ProductID != one.ID || rows[0].ProductName != one.Name || rows[0].ProductCode != one.Code || rows[1].ProductCount != 0 || rows[1].DocumentID != 9999 {
			t.Fatalf("source %s: %#v %v", test.source, rows, err)
		}
	}
	rows, err := repo.ListDocumentProductPreviews(ctx, biz.DocumentProductPreviewSalesOrder, []int{empty.ID})
	if err != nil || rows[0].ProductCount != 0 || rows[0].ProductName != "" {
		t.Fatalf("empty document borrowed product: %#v %v", rows, err)
	}
	client.SalesOrderItem.Update().ClearProductID().SaveX(ctx)
	rows, err = repo.ListDocumentProductPreviews(ctx, biz.DocumentProductPreviewSalesOrder, []int{sales.ID})
	if err != nil || rows[0].ProductCount != 0 || rows[0].ProductID != 0 {
		t.Fatalf("cleared relations retained products: %#v %v", rows, err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := repo.ListDocumentProductPreviews(canceled, biz.DocumentProductPreviewSalesOrder, []int{sales.ID}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation hidden: %v", err)
	}
}
