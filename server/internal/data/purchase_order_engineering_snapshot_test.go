package data

import (
	"context"
	"io"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/bomitem"

	"github.com/go-kratos/kratos/v2/log"
)

func TestPurchaseOrderEngineeringSnapshotFromApproval(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "purchase_engineering_snapshot")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "PRINT-SOURCE")
	request := submitMaterialRequestFixture(t, ctx, f)
	request, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	request, err = f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(request))
	if err != nil {
		t.Fatal(err)
	}
	product := client.Product.GetX(ctx, f.bom.ProductID)
	client.Product.UpdateOneID(product.ID).SetName("后续产品名称").SaveX(ctx)
	client.BOMItem.Update().Where(bomitem.BomHeaderID(f.bom.ID)).SetNote("后续材料备注").SaveX(ctx)
	repo := NewPurchaseOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	for _, po := range request.PurchaseOrders {
		items, total, err := repo.ListPurchaseOrderItems(ctx, biz.PurchaseOrderItemFilter{PurchaseOrderID: po.ID, Limit: 50})
		if err != nil || total != 1 || len(items) != 1 {
			t.Fatalf("read generated order: %v, total=%d, items=%+v", err, total, items)
		}
		item := items[0]
		for name, check := range map[string]struct {
			got  *string
			want string
		}{
			"product no":   {item.ProductNoSnapshot, "PRINT-SOURCE-STYLE"},
			"product name": {item.ProductNameSnapshot, product.Name},
			"source order": {item.ProductOrderNoSnapshot, "PRINT-SOURCE"},
		} {
			if check.got == nil || *check.got != check.want {
				t.Fatalf("%s: got %v, want %s", name, check.got, check.want)
			}
		}
		if item.Note == nil || !strings.HasPrefix(*item.Note, "按样核对部位0") || strings.Contains(*item.Note, "后续") {
			t.Fatalf("lost frozen material requirements: %+v", item)
		}
		one, err := repo.GetPurchaseOrderItem(ctx, item.ID)
		if err != nil || one.ProductNoSnapshot == nil || one.Note == nil || *one.ProductNoSnapshot != *item.ProductNoSnapshot || *one.Note != *item.Note {
			t.Fatalf("detail/list disagree: %v, %+v", err, one)
		}
		stored := client.PurchaseOrderItem.GetX(ctx, item.ID)
		if stored.ProductNoSnapshot != nil || stored.ProductNameSnapshot != nil || stored.Note != nil || !stored.PurchasedQuantity.Equal(item.PurchasedQuantity) {
			t.Fatal("reading an approved source rewrote the purchase order")
		}
		if item.UnitPrice != nil || item.Amount != nil || item.ExpectedArrivalDate != nil {
			t.Fatal("printing invented commercial terms")
		}
	}
}

func TestPurchaseOrderEngineeringSnapshotGroupsProductsAndPreservesManualOrders(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "purchase_engineering_grouped_snapshot")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "PRINT-GROUP")
	request := submitMaterialRequestFixture(t, ctx, f)
	request, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	request, err = f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(request))
	if err != nil {
		t.Fatal(err)
	}
	order := client.PurchaseOrder.GetX(ctx, request.PurchaseOrders[0].ID)
	line := order.QueryItems().OnlyX(ctx)
	longName := strings.Repeat("另一款产品", 60)
	sources := []map[string]any{
		{"material_id": line.MaterialID, "unit_id": line.UnitID, "customer_product_no": " A# ", "product_code": "INTERNAL-A", "product_name": "产品 A", "material_note": "按样板"},
		{"material_id": line.MaterialID, "unit_id": line.UnitID, "customer_product_no": "A#", "product_name": "产品 A", "material_note": "按样板"},
		{"material_id": line.MaterialID, "unit_id": line.UnitID, "product_code": "B#", "product_name": longName, "material_note": "单独包装"},
		{"material_id": line.MaterialID + 100, "unit_id": line.UnitID, "product_name": "其他材料产品"},
		{"material_id": line.MaterialID, "unit_id": line.UnitID + 100, "product_name": "其他单位产品"},
	}
	// A persisted fixture represents a multi-product approval, including JSON
	// number decoding and display values longer than a single product field.
	client.EngineeringMaterialRequest.UpdateOneID(request.ID).SetSourceSnapshot(sources).SaveX(ctx)
	repo := NewPurchaseOrderRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	item, err := repo.GetPurchaseOrderItem(ctx, line.ID)
	if err != nil {
		t.Fatal(err)
	}
	if item.ProductNoSnapshot == nil || *item.ProductNoSnapshot != "A#\nB#" || item.ProductNameSnapshot == nil || *item.ProductNameSnapshot != "产品 A\n"+longName || item.Note == nil || *item.Note != "按样板\n单独包装" {
		t.Fatalf("grouped fields lost, duplicated or crossed material/unit: %+v", item)
	}
	reordered, err := repo.ReorderPurchaseOrderItems(ctx, order.ID, order.Version, []int{line.ID})
	if err != nil || reordered.Items[0].Note == nil || *reordered.Items[0].Note != *item.Note {
		t.Fatalf("reordering lost the approved display source: %v %+v", err, reordered)
	}
	client.EngineeringMaterialRequest.UpdateOneID(request.ID).SetSourceSnapshot([]map[string]any{{"material_id": line.MaterialID, "unit_id": line.UnitID}}).SaveX(ctx)
	empty, err := repo.GetPurchaseOrderItem(ctx, line.ID)
	if err != nil || empty.ProductNoSnapshot != nil || empty.ProductNameSnapshot != nil || empty.Note != nil {
		t.Fatalf("missing source resurrected old values: %v %+v", err, empty)
	}
	client.EngineeringMaterialRequest.UpdateOneID(request.ID).SetSourceSnapshot(sources[3:]).SaveX(ctx)
	if _, err := repo.GetPurchaseOrderItem(ctx, line.ID); err != biz.ErrMaterialRequestNotReady {
		t.Fatalf("unmatched source should block incomplete output: %v", err)
	}
	client.PurchaseOrder.UpdateOneID(order.ID).ClearEngineeringMaterialRequestID().SaveX(ctx)
	client.PurchaseOrderItem.UpdateOneID(line.ID).SetProductNoSnapshot("手工款号").SetProductNameSnapshot("手工产品").SetNote("手工备注").SaveX(ctx)
	manual, err := repo.GetPurchaseOrderItem(ctx, line.ID)
	if err != nil || *manual.ProductNoSnapshot != "手工款号" || *manual.ProductNameSnapshot != "手工产品" || *manual.Note != "手工备注" {
		t.Fatalf("order number pattern overrode a manual order: %v %+v", err, manual)
	}
	client.PurchaseOrderItem.UpdateOneID(line.ID).ClearProductNoSnapshot().ClearProductNameSnapshot().ClearNote().SaveX(ctx)
	manual, err = repo.GetPurchaseOrderItem(ctx, line.ID)
	if err != nil || manual.ProductNoSnapshot != nil || manual.ProductNameSnapshot != nil || manual.Note != nil {
		t.Fatalf("cleared manual fields resurrected: %v %+v", err, manual)
	}
}
