package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func TestOutsourcingOrderRepoProductAndMaterialSubjects(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:outsourcing_order_subjects?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	uc := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))

	unit, err := client.Unit.Create().SetCode("PCS-OUT-SUBJECT").SetName("件").Save(ctx)
	if err != nil {
		t.Fatalf("create unit: %v", err)
	}
	product, err := client.Product.Create().SetCode("PROD-OUT-SUBJECT").SetName("车缝半成品").SetDefaultUnitID(unit.ID).Save(ctx)
	if err != nil {
		t.Fatalf("create product: %v", err)
	}
	productSKU, err := client.ProductSKU.Create().SetProductID(product.ID).SetSkuCode("SKU-OUT-SUBJECT").SetDefaultUnitID(unit.ID).Save(ctx)
	if err != nil {
		t.Fatalf("create product SKU: %v", err)
	}
	material, err := client.Material.Create().SetCode("MAT-OUT-SUBJECT").SetName("短毛绒布料").SetDefaultUnitID(unit.ID).Save(ctx)
	if err != nil {
		t.Fatalf("create material: %v", err)
	}
	process, err := client.Process.Create().SetCode("PROC-OUT-SUBJECT").SetName("布料加工").SetCategory("面料加工").SetOutsourcingEnabled(true).Save(ctx)
	if err != nil {
		t.Fatalf("create process: %v", err)
	}
	supplier, err := client.Supplier.Create().SetCode("SUP-OUT-SUBJECT").SetName("外协加工厂").SetSupplierType("outsourcing").Save(ctx)
	if err != nil {
		t.Fatalf("create supplier: %v", err)
	}

	orderDate := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
	staleProductCode := "STALE-PRODUCT-CODE"
	staleProductName := "客户端伪造产品名"
	staleSKUCode := "CLIENT-FORGED-SKU"
	staleProcessName := "客户端伪造工序"
	staleProcessCategory := "客户端伪造分类"
	staleUnitName := "客户端伪造单位"
	productOrderNo := "SO-TRACE-001"
	processingItem := "脸*1"
	lineNote := "客户允许的独立加工说明"
	created, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &biz.OutsourcingOrderMutation{
		OutsourcingOrderNo: "OUT-SUBJECT-001",
		SupplierID:         supplier.ID,
		OrderDate:          orderDate,
	}, []*biz.OutsourcingOrderItemSaveMutation{{
		OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
			LineNo:                  1,
			SubjectType:             biz.OutsourcingOrderSubjectProduct,
			ProductID:               &product.ID,
			ProductSKUID:            &productSKU.ID,
			ProcessID:               process.ID,
			UnitID:                  unit.ID,
			ProductNoSnapshot:       &staleProductCode,
			SKUCodeSnapshot:         &staleSKUCode,
			ProductOrderNoSnapshot:  &productOrderNo,
			ProductNameSnapshot:     &staleProductName,
			ProcessingItem:          &processingItem,
			ProcessNameSnapshot:     &staleProcessName,
			ProcessCategorySnapshot: &staleProcessCategory,
			UnitNameSnapshot:        &staleUnitName,
			OutsourcingQuantity:     decimal.NewFromInt(10),
			Note:                    &lineNote,
		},
	}})
	if err != nil {
		t.Fatalf("save product outsourcing line: %v", err)
	}
	if len(created.Items) != 1 || created.Items[0].SubjectType != biz.OutsourcingOrderSubjectProduct || created.Items[0].ProductID == nil || *created.Items[0].ProductID != product.ID || created.Items[0].ProductSKUID == nil || *created.Items[0].ProductSKUID != productSKU.ID || created.Items[0].MaterialID != nil {
		t.Fatalf("unexpected saved product subject: %#v", created.Items)
	}
	productLine := created.Items[0]
	if productLine.ProductNoSnapshot == nil || *productLine.ProductNoSnapshot != product.Code ||
		productLine.SKUCodeSnapshot == nil || *productLine.SKUCodeSnapshot != productSKU.SkuCode ||
		productLine.ProductNameSnapshot == nil || *productLine.ProductNameSnapshot != product.Name ||
		productLine.ProductOrderNoSnapshot == nil || *productLine.ProductOrderNoSnapshot != productOrderNo ||
		productLine.ProcessingItem == nil || *productLine.ProcessingItem != processingItem ||
		productLine.ProcessNameSnapshot == nil || *productLine.ProcessNameSnapshot != process.Name ||
		productLine.ProcessCategorySnapshot == nil || *productLine.ProcessCategorySnapshot != *process.Category ||
		productLine.UnitNameSnapshot == nil || *productLine.UnitNameSnapshot != unit.Name ||
		productLine.Note == nil || *productLine.Note != lineNote {
		t.Fatalf("expected canonical master-data snapshots and independent trace/note, got %#v", productLine)
	}
	if err := client.ProductSKU.DeleteOneID(productSKU.ID).Exec(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected referenced SKU delete blocked to preserve source document history, got %v", err)
	}

	staleMaterialCode := "STALE-MATERIAL-CODE"
	staleMaterialName := "客户端伪造材料名"
	updated, err := uc.SaveOutsourcingOrderWithItems(ctx, created.Order.ID, &biz.OutsourcingOrderMutation{
		OutsourcingOrderNo: created.Order.OutsourcingOrderNo,
		SupplierID:         supplier.ID,
		OrderDate:          orderDate,
		ExpectedVersion:    created.Order.Version,
	}, []*biz.OutsourcingOrderItemSaveMutation{{
		ID: created.Items[0].ID,
		OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
			OutsourcingOrderID:      created.Order.ID,
			LineNo:                  1,
			SubjectType:             biz.OutsourcingOrderSubjectMaterial,
			MaterialID:              &material.ID,
			ProcessID:               process.ID,
			UnitID:                  unit.ID,
			ProductNoSnapshot:       &staleProductCode,
			ProductSKUID:            &productSKU.ID,
			SKUCodeSnapshot:         &staleSKUCode,
			ProductOrderNoSnapshot:  &productOrderNo,
			ProductNameSnapshot:     &staleProductName,
			MaterialCodeSnapshot:    &staleMaterialCode,
			MaterialNameSnapshot:    &staleMaterialName,
			ProcessingItem:          &processingItem,
			ProcessNameSnapshot:     &staleProcessName,
			ProcessCategorySnapshot: &staleProcessCategory,
			UnitNameSnapshot:        &staleUnitName,
			OutsourcingQuantity:     decimal.NewFromInt(12),
			Note:                    &lineNote,
		},
	}})
	if err != nil {
		t.Fatalf("switch draft line to material subject: %v", err)
	}
	if len(updated.Items) != 1 {
		t.Fatalf("expected one updated item, got %#v", updated.Items)
	}
	line := updated.Items[0]
	if line.SubjectType != biz.OutsourcingOrderSubjectMaterial || line.ProductID != nil || line.ProductSKUID != nil || line.SKUCodeSnapshot != nil || line.MaterialID == nil || *line.MaterialID != material.ID {
		t.Fatalf("expected material subject exactly-one after switch, got %#v", line)
	}
	if line.ProductNoSnapshot != nil || line.ProductOrderNoSnapshot == nil || *line.ProductOrderNoSnapshot != productOrderNo || line.ProductNameSnapshot != nil || line.MaterialCodeSnapshot == nil || *line.MaterialCodeSnapshot != material.Code || line.MaterialNameSnapshot == nil || *line.MaterialNameSnapshot != material.Name {
		t.Fatalf("expected product identity residue cleared while source order trace and material snapshots persist, got %#v", line)
	}
	if line.ProcessingItem == nil || *line.ProcessingItem != processingItem || line.ProcessNameSnapshot == nil || *line.ProcessNameSnapshot != process.Name || line.ProcessCategorySnapshot == nil || *line.ProcessCategorySnapshot != *process.Category || line.UnitNameSnapshot == nil || *line.UnitNameSnapshot != unit.Name || line.Note == nil || *line.Note != lineNote {
		t.Fatalf("expected canonical process/unit snapshots and independent note after subject switch, got %#v", line)
	}
	if err := client.Material.DeleteOneID(material.ID).Exec(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected referenced material delete blocked to preserve source document history, got %v", err)
	}

	if _, err := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(created.Order.ID).
		SetLineNo(2).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProcessID(process.ID).
		SetUnitID(unit.ID).
		SetOutsourcingQuantity(decimal.NewFromInt(1)).
		SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected database exactly-one check to reject missing product id, got %v", err)
	}
	if _, err := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(created.Order.ID).
		SetLineNo(3).
		SetSubjectType(biz.OutsourcingOrderSubjectProduct).
		SetProductID(product.ID).
		SetMaterialID(material.ID).
		SetProcessID(process.ID).
		SetUnitID(unit.ID).
		SetOutsourcingQuantity(decimal.NewFromInt(1)).
		SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected database exactly-one check to reject both subject ids, got %v", err)
	}
}

func TestOutsourcingProductNoSnapshotPrefersStyleNo(t *testing.T) {
	styleNo := " 27001# "
	withStyle := outsourcingProductNoSnapshot(&ent.Product{
		Code:    "PRODUCT-INTERNAL-001",
		StyleNo: &styleNo,
	})
	if withStyle == nil || *withStyle != "27001#" {
		t.Fatalf("outsourcingProductNoSnapshot() = %v, want trimmed style no", withStyle)
	}

	withoutStyle := outsourcingProductNoSnapshot(&ent.Product{Code: "PRODUCT-002"})
	if withoutStyle == nil || *withoutStyle != "PRODUCT-002" {
		t.Fatalf("outsourcingProductNoSnapshot() = %v, want product code fallback", withoutStyle)
	}
}
