package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionFactDisplay_SourceSnapshotAndStockIdentity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "production_fact_display")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	actor := client.AdminUser.Create().SetUsername("display-actor").SetPasswordHash("test").SaveX(ctx)
	order := client.ProductionOrder.Create().SetOrderNo("SIM-DISPLAY-ORDER").SetCreatedBy(actor.ID).SaveX(ctx)
	item := client.ProductionOrderItem.Create().SetRouteCode(biz.ProductionWIPRoutePlushSewHandV1).SetProductionOrderID(order.ID).SetLineNo(1).
		SetProductID(fixtures.productID).SetUnitID(fixtures.unitID).SetPlannedQuantity(decimal.NewFromInt(2)).
		SetProductNameSnapshot("下单时产品名称").SetProductCodeSnapshot("SOURCE-PRODUCT").SetUnitNameSnapshot("下单时单位").SaveX(ctx)
	row := client.ProductionFact.Create().SetFactNo("SIM-DISPLAY-RECEIPT").SetFactType(biz.ProductionFactFinishedGoodsReceipt).
		SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(fixtures.productID).
		SetWarehouseID(fixtures.productWarehouseID).SetUnitID(fixtures.unitID).SetQuantity(decimal.NewFromInt(1)).
		SetSourceType(biz.ProductionOrderSourceType).SetSourceID(order.ID).SetSourceLineID(item.ID).
		SetIdempotencyKey("SIM-DISPLAY-RECEIPT").SaveX(ctx)
	client.Product.UpdateOneID(fixtures.productID).SetName("改名后的产品").SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	rows, total, err := repo.ListProductionFacts(ctx, biz.OperationalFactFilter{SourceType: biz.ProductionOrderSourceType, SourceID: order.ID, Limit: 20})
	if err != nil || total != 1 || len(rows) != 1 {
		t.Fatalf("list = %d/%d, err=%v", len(rows), total, err)
	}
	got := rows[0]
	warehouse := client.Warehouse.GetX(ctx, fixtures.productWarehouseID)
	if got.ID != row.ID || got.SubjectName != "下单时产品名称" || got.SubjectCode != "SOURCE-PRODUCT" || got.UnitName != "下单时单位" || got.WarehouseName != warehouse.Name || got.WarehouseCode != warehouse.Code {
		t.Fatalf("source and warehouse identities = %#v", got)
	}
	client.ProductionOrderItem.UpdateOneID(item.ID).ClearProductNameSnapshot().ClearProductCodeSnapshot().ClearUnitNameSnapshot().SaveX(ctx)
	rows, _, err = repo.ListProductionFacts(ctx, biz.OperationalFactFilter{SourceID: order.ID, Limit: 20})
	if err != nil || rows[0].SubjectName != "改名后的产品" || rows[0].UnitName != client.Unit.GetX(ctx, fixtures.unitID).Name {
		t.Fatalf("missing snapshot must read current identity, rows=%#v err=%v", rows, err)
	}
	material := client.Material.GetX(ctx, fixtures.materialID)
	facts := []*biz.ProductionFact{
		{SubjectType: biz.InventorySubjectMaterial, SubjectID: material.ID, ProductionOrderID: &order.ID, ProductionOrderItemID: &item.ID},
		{SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID},
	}
	if err := hydrateProductionFactIdentities(ctx, client, facts); err != nil {
		t.Fatal(err)
	}
	if facts[0].SubjectName != material.Name || facts[1].SubjectName != "改名后的产品" || facts[1].SKUCodeSnapshot != "" {
		t.Fatalf("different subject kinds must not share or fabricate identities: %#v", facts)
	}
}

func TestProductionFactDisplay_LotAndSKUAreReadFromExactEdges(t *testing.T) {
	row := &ent.ProductionFact{Edges: ent.ProductionFactEdges{
		InventoryLot: &ent.InventoryLot{LotNo: "LOT-A"},
		ProductSku:   &ent.ProductSKU{SkuCode: "SKU-A"},
	}}
	got := entProductionFactToBiz(row)
	if got.LotNo != "LOT-A" || got.SKUCodeSnapshot != "SKU-A" {
		t.Fatalf("lot/SKU projection = %#v", got)
	}
	got = entProductionFactToBiz(&ent.ProductionFact{})
	if got.LotNo != "" || got.SKUCodeSnapshot != "" || got.SubjectName != "" {
		t.Fatalf("missing identities must stay missing: %#v", got)
	}
}
