package data

import (
	"context"
	"errors"
	"server/internal/biz"
	"testing"
)

func TestEngineeringMaterialListKeepsExactSnapshotsAndPagination(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_request_list")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "REQUEST-LIST")
	client.SalesOrderItem.UpdateOneID(f.line.ID).SetProductNameSnapshot("原提交产品").SaveX(ctx)
	first := submitMaterialRequestFixture(t, ctx, f)
	note := "请工程核对用量"
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: first.ID, ExpectedVersion: first.Version, ActorID: 22, Action: "REJECT", ReviewStage: "BOSS", Note: &note}); err != nil {
		t.Fatal(err)
	}
	second := submitMaterialRequestFixture(t, ctx, f)
	filter := biz.EngineeringMaterialListFilter{Keyword: "  request-list  ", Page: 1, Limit: 1}
	list, err := f.uc.ListEngineeringMaterialRequests(ctx, filter)
	if err != nil || list.Total != 2 || len(list.Items) != 1 || list.Items[0].ID != second.ID {
		t.Fatalf("first page: %+v %v", list, err)
	}
	if list.Items[0].OrderStatus != biz.SalesOrderStatusActive {
		t.Fatalf("order state: %+v", list.Items[0])
	}
	filter.Page = 2
	list, err = f.uc.ListEngineeringMaterialRequests(ctx, filter)
	if err != nil || list.Items[0].ID != first.ID || list.Items[0].Status != biz.MaterialRequestRejected {
		t.Fatalf("history page: %+v %v", list, err)
	}
	filter.Status, filter.Page = biz.MaterialRequestRejected, 1
	list, err = f.uc.ListEngineeringMaterialRequests(ctx, filter)
	if err != nil || list.Total != 1 || list.Items[0].ID != first.ID {
		t.Fatalf("status filter: %+v %v", list, err)
	}
	filter.Keyword = "does-not-exist"
	list, err = f.uc.ListEngineeringMaterialRequests(ctx, filter)
	if err != nil || list.Total != 0 || list.Items == nil || len(list.Items) != 0 {
		t.Fatalf("empty list: %+v %v", list, err)
	}
	for _, invalid := range []biz.EngineeringMaterialListFilter{{Page: 0, Limit: 20}, {Page: 1, Limit: 101}, {Page: 1, Limit: 20, Status: "PREVIEW"}} {
		if _, err := f.uc.ListEngineeringMaterialRequests(ctx, invalid); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("invalid filter: %v", err)
		}
	}
	// A later product rename cannot rewrite the submitted summary's product label.
	client.SalesOrderItem.UpdateOneID(f.line.ID).SetProductNameSnapshot("修改后的产品名").SaveX(ctx)
	list, err = f.uc.ListEngineeringMaterialRequests(ctx, biz.EngineeringMaterialListFilter{Page: 1, Limit: 20})
	if err != nil || len(list.Items[0].Products) != 1 || list.Items[0].Products[0] != "原提交产品" {
		t.Fatalf("snapshot identity: %+v %v", list, err)
	}
}
