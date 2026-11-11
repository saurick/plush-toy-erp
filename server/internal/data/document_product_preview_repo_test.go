package data

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
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
	one := client.Product.Create().SetCode("GALLERY-ONE").SetName("模拟蓝熊").
		SetStyleNo("INTERNAL-ONE").SetCustomerStyleNo("CUSTOMER-ONE").SetDefaultUnitID(unit.ID).SaveX(ctx)
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
		rows, err := repo.ListDocumentProductPreviews(ctx, test.source, []int{test.id, 9999}, biz.DocumentProductPreviewOptions{})
		if err != nil || len(rows) != 2 || rows[0].ProductCount != 2 || rows[0].ProductID != one.ID || rows[0].ProductName != one.Name || rows[0].ProductCode != one.Code || rows[1].ProductCount != 0 || rows[1].DocumentID != 9999 {
			t.Fatalf("source %s: %#v %v", test.source, rows, err)
		}
		if rows[0].StyleNo != "INTERNAL-ONE" || rows[0].CustomerStyleNo != "CUSTOMER-ONE" || rows[1].StyleNo != "" || rows[1].CustomerStyleNo != "" {
			t.Fatalf("source %s: style numbers must belong to the displayed product: %#v", test.source, rows)
		}
	}
	rows, err := repo.ListDocumentProductPreviews(ctx, biz.DocumentProductPreviewSalesOrder, []int{empty.ID}, biz.DocumentProductPreviewOptions{})
	if err != nil || rows[0].ProductCount != 0 || rows[0].ProductName != "" {
		t.Fatalf("empty document borrowed product: %#v %v", rows, err)
	}
	client.SalesOrderItem.Update().ClearProductID().SaveX(ctx)
	rows, err = repo.ListDocumentProductPreviews(ctx, biz.DocumentProductPreviewSalesOrder, []int{sales.ID}, biz.DocumentProductPreviewOptions{})
	if err != nil || rows[0].ProductCount != 0 || rows[0].ProductID != 0 {
		t.Fatalf("cleared relations retained products: %#v %v", rows, err)
	}
	client.Product.UpdateOneID(one.ID).ClearStyleNo().ClearCustomerStyleNo().SaveX(ctx)
	rows, err = repo.ListDocumentProductPreviews(ctx, biz.DocumentProductPreviewProductionOrder, []int{production.ID}, biz.DocumentProductPreviewOptions{})
	if err != nil || len(rows) != 1 || rows[0].ProductID != one.ID || rows[0].StyleNo != "" || rows[0].CustomerStyleNo != "" {
		t.Fatalf("cleared style numbers retained old values: %#v %v", rows, err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := repo.ListDocumentProductPreviews(canceled, biz.DocumentProductPreviewSalesOrder, []int{sales.ID}, biz.DocumentProductPreviewOptions{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation hidden: %v", err)
	}
}

func TestOutsourcingProductPreviewsUsePersistedProductionLinks(t *testing.T) {
	repo, closeRepo := newBusinessAttachmentRepoTest(t, "outsourcing_product_links")
	defer closeRepo()
	ctx := context.Background()
	client := repo.data.postgres
	unit := client.Unit.Create().SetCode("EA").SetName("个").SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("cutting-gallery").SetPasswordHash("not-a-login-hash").SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("CUTTING-SUPPLIER").SetName("演练加工厂").SaveX(ctx)
	process := client.Process.Create().SetCode("CUTTING").SetName("裁片").SaveX(ctx)
	material := client.Material.Create().SetCode("CUTTING-CLOTH").SetName("演练面料").SetDefaultUnitID(unit.ID).SaveX(ctx)
	quantity := decimal.NewFromInt(2)
	makeBatch := func(code string) (int, int, int) {
		p := client.Product.Create().SetCode(code).SetName(code).SetDefaultUnitID(unit.ID).SaveX(ctx)
		po := client.ProductionOrder.Create().SetOrderNo("PO-" + code).SetCreatedBy(actor.ID).SaveX(ctx)
		item := client.ProductionOrderItem.Create().SetProductionOrderID(po.ID).SetLineNo(1).SetProductID(p.ID).SetUnitID(unit.ID).SetPlannedQuantity(quantity).SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).SaveX(ctx)
		op := client.ProductionOrderOperation.Create().SetProductionOrderID(po.ID).SetProductionOrderItemID(item.ID).SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).
			SetRouteVersion(1).SetStepNo(10).SetOperationCode(biz.ProductionWIPOperationFabricProcessing).SetProcessID(process.ID).SetProcessCodeSnapshot(process.Code).SetProcessNameSnapshot(process.Name).
			SetOutputCode(biz.ProductionWIPOutputCutPiece).SetOutsourcingAllowed(true).SetPlannedQuantity(quantity).SaveX(ctx)
		batch := client.ProductionWIPBatch.Create().SetProductionOrderID(po.ID).SetProductionOrderItemID(item.ID).SetProductionOrderOperationID(op.ID).SetBatchNo("WIP-" + code).SetQuantity(quantity).SetCreatedBy(actor.ID).SaveX(ctx)
		bom := client.BOMHeader.Create().SetProductID(p.ID).SetVersion("v1").SaveX(ctx)
		component := client.BOMItem.Create().SetBomHeaderID(bom.ID).SetMaterialID(material.ID).SetUnitID(unit.ID).SetQuantity(quantity).SetLossRate(decimal.Zero).SaveX(ctx)
		requirement := client.ProductionOrderMaterialRequirement.Create().SetProductionOrderID(po.ID).SetProductionOrderItemID(item.ID).SetBomHeaderID(bom.ID).SetBomItemID(component.ID).
			SetMaterialID(material.ID).SetUnitID(unit.ID).SetUnitQuantitySnapshot(quantity).SetLossRateSnapshot(decimal.Zero).SetPlannedQuantity(quantity).
			SetMaterialCodeSnapshot(material.Code).SetMaterialNameSnapshot(material.Name).SetUnitCodeSnapshot(unit.Code).SetUnitNameSnapshot(unit.Name).SaveX(ctx)
		return p.ID, batch.ID, requirement.ID
	}
	product1, batch1, requirement1 := makeBatch("CUTTING-STYLE-ONE")
	product2, batch2, requirement2 := makeBatch("CUTTING-STYLE-TWO")
	makeContract := func(code string, batchID *int) (*ent.OutsourcingOrder, int) {
		order := client.OutsourcingOrder.Create().SetOutsourcingOrderNo(code).SetSupplierID(supplier.ID).SetOrderDate(time.Now()).
			SetSourceOrderNo("SAME-REFERENCE").SetNillableSourceWipBatchID(batchID).SaveX(ctx)
		line := client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(order.ID).SetLineNo(1).SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
			SetMaterialID(material.ID).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(quantity).SaveX(ctx)
		return order, line.ID
	}
	linked, line := makeContract("CUTTING-ALLOCATED", nil)
	draft, _ := makeContract("CUTTING-SOURCE-DRAFT", &batch2)
	unrelated, _ := makeContract("CUTTING-MATERIAL-ONLY", nil)
	second := client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(linked.ID).SetLineNo(2).SetSubjectType(biz.OutsourcingOrderSubjectMaterial).
		SetMaterialID(material.ID).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(quantity).SaveX(ctx)
	for _, allocation := range [][3]int{{batch1, requirement1, line}, {batch2, requirement2, second.ID}} {
		client.ProductionWIPOutsourcingAllocation.Create().SetProductionWipBatchID(allocation[0]).SetOutsourcingOrderItemID(allocation[2]).
			SetSubjectType(biz.OutsourcingOrderSubjectMaterial).SetProductionOrderMaterialRequirementID(allocation[1]).SetAllocatedQuantity(decimal.NewFromInt(1)).SetUnitID(unit.ID).SetCreatedBy(actor.ID).SaveX(ctx)
	}
	client.OutsourcingOrderItem.Create().SetOutsourcingOrderID(linked.ID).SetLineNo(3).SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProductID(product1).SetProcessID(process.ID).SetUnitID(unit.ID).SetOutsourcingQuantity(quantity).SaveX(ctx)
	const source = biz.DocumentProductPreviewOutsourcingOrder
	rows, err := repo.ListDocumentProductPreviews(ctx, source, []int{linked.ID, draft.ID, unrelated.ID}, biz.DocumentProductPreviewOptions{})
	if err != nil || len(rows) != 3 || rows[0].ProductCount != 2 || rows[0].ProductID != product1 || rows[1].ProductID != product2 || rows[2].ProductCount != 0 {
		t.Fatalf("summary must follow and deduplicate real product links: %#v %v", rows, err)
	}
	options := biz.DocumentProductPreviewOptions{IncludeProducts: true, ExpectedVersion: linked.Version}
	rows, err = repo.ListDocumentProductPreviews(ctx, source, []int{linked.ID}, options)
	if err != nil || len(rows) != 1 || len(rows[0].Products) != 2 || rows[0].Products[0].ProductID != product1 || rows[0].Products[1].ProductID != product2 {
		t.Fatalf("gallery must use exactly the same set as the summary: %#v %v", rows, err)
	}
	options.ExpectedVersion++
	if _, err := repo.ListDocumentProductPreviews(ctx, source, []int{linked.ID}, options); !errors.Is(err, biz.ErrOutsourcingOrderConflict) {
		t.Fatalf("stale version read gallery: %v", err)
	}
	search := NewOutsourcingOrderRepo(repo.data, log.DefaultLogger)
	orders, count, err := search.ListOutsourcingOrders(ctx, biz.OutsourcingOrderFilter{Keyword: "CUTTING-STYLE-TWO", Limit: 10})
	if err != nil || count != 2 || len(orders) != 2 {
		t.Fatalf("search must find the allocated and source-bound orders only: %#v %d %v", orders, count, err)
	}
}
