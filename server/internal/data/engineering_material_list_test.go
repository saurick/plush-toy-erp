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
	// Model a rejected submission for a different style with the same display name.
	oldProduct := createSalesOrderTestProduct(t, ctx, client, f.line.UnitID, "REQUEST-LIST-OLD", true)
	frozen := client.EngineeringMaterialRequest.GetX(ctx, first.ID).SourceSnapshot
	for _, part := range frozen {
		part["product_id"] = oldProduct.ID
		part["product_code"] = oldProduct.Code
	}
	client.EngineeringMaterialRequest.UpdateOneID(first.ID).SetSourceSnapshot(frozen).SaveX(ctx)
	filter := biz.EngineeringMaterialListFilter{Keyword: "  request-list  ", Page: 1, Limit: 1}
	list, err := f.uc.ListEngineeringMaterialRequests(ctx, filter)
	if err != nil || list.Total != 2 || len(list.Items) != 1 || list.Items[0].ID != second.ID {
		t.Fatalf("first page: %+v %v", list, err)
	}
	if list.Items[0].OrderStatus != biz.SalesOrderStatusActive {
		t.Fatalf("order state: %+v", list.Items[0])
	}
	sorted := filter
	sorted.SortBy, sorted.SortDirection = biz.WorkbenchSummarySortSubmittedAt, "asc"
	for offset, want := range []int{first.ID, second.ID} {
		sorted.Page = offset + 1
		page, err := f.uc.ListEngineeringMaterialRequests(ctx, sorted)
		if err != nil || page.Total != 2 || len(page.Items) != 1 || page.Items[0].ID != want {
			t.Fatalf("submission order page=%d want=%d list=%+v err=%v", sorted.Page, want, page, err)
		}
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
	if len(list.Items[0].ProductRefs) != 0 {
		t.Fatal("product references returned without product access")
	}
	withRefs, err := f.uc.ListEngineeringMaterialRequests(ctx, biz.EngineeringMaterialListFilter{Page: 1, Limit: 20, IncludeProductRefs: true})
	if err != nil || len(withRefs.Items) != 2 {
		t.Fatalf("snapshot rows: %+v %v", withRefs, err)
	}
	for index, expectedID := range []int{f.bom.ProductID, oldProduct.ID} {
		refs := withRefs.Items[index].ProductRefs
		if len(refs) != 1 || refs[0].ProductID != expectedID || refs[0].ProductName != "原提交产品" || (index == 1 && refs[0].ProductCode != oldProduct.Code) {
			t.Fatalf("submission %d: got %+v, want one reference to product %d", withRefs.Items[index].ID, refs, expectedID)
		}
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
