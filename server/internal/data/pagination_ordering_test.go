package data

import (
	"context"
	"fmt"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionorder"
)

func TestMasterDataRepoProductsNewestFirstAcrossPages(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_products_newest_first_across_pages")
	defer mustCloseEntClient(t, client)

	unitRow := client.Unit.Create().SetCode("PAGE-PCS").SetName("件").SaveX(ctx)
	const pageSize = 20
	createdIDs := make([]int, 0, pageSize+2)
	for index := 0; index < pageSize+2; index++ {
		row := client.Product.Create().
			SetCode(fmt.Sprintf("PAGE-P-%02d", index+1)).
			SetName(fmt.Sprintf("分页产品 %02d", index+1)).
			SetDefaultUnitID(unitRow.ID).
			SaveX(ctx)
		createdIDs = append(createdIDs, row.ID)
	}

	firstPage, firstTotal, err := uc.ListProducts(ctx, biz.MasterDataFilter{Limit: pageSize})
	if err != nil {
		t.Fatalf("list first product page: %v", err)
	}
	secondPage, secondTotal, err := uc.ListProducts(ctx, biz.MasterDataFilter{Limit: pageSize, Offset: pageSize})
	if err != nil {
		t.Fatalf("list second product page: %v", err)
	}
	if firstTotal != len(createdIDs) || secondTotal != len(createdIDs) {
		t.Fatalf("product totals first=%d second=%d want=%d", firstTotal, secondTotal, len(createdIDs))
	}
	if len(firstPage) != pageSize || len(secondPage) != 2 {
		t.Fatalf("product page sizes first=%d second=%d want=%d/2", len(firstPage), len(secondPage), pageSize)
	}
	if firstPage[0].ID != createdIDs[len(createdIDs)-1] {
		t.Fatalf("first product id=%d want newest id=%d", firstPage[0].ID, createdIDs[len(createdIDs)-1])
	}

	listedIDs := make([]int, 0, len(createdIDs))
	seen := make(map[int]struct{}, len(createdIDs))
	for _, row := range append(firstPage, secondPage...) {
		if _, exists := seen[row.ID]; exists {
			t.Fatalf("duplicate product id across pages: %d", row.ID)
		}
		seen[row.ID] = struct{}{}
		listedIDs = append(listedIDs, row.ID)
	}
	assertNewestFirstIDs(t, listedIDs, createdIDs)
}

func TestMasterDataRepoPaginatedListsDefaultToNewestFirst(t *testing.T) {
	tests := []struct {
		name string
		seed func(context.Context, *ent.Client) []int
		list func(context.Context, *biz.MasterDataUsecase) ([]int, int, error)
	}{
		{
			name: "customers",
			seed: func(ctx context.Context, client *ent.Client) []int {
				ids := make([]int, 0, 3)
				for index := 1; index <= 3; index++ {
					row := client.Customer.Create().SetCode(fmt.Sprintf("PAGE-C-%d", index)).SetName(fmt.Sprintf("分页客户 %d", index)).SaveX(ctx)
					ids = append(ids, row.ID)
				}
				return ids
			},
			list: func(ctx context.Context, uc *biz.MasterDataUsecase) ([]int, int, error) {
				rows, total, err := uc.ListCustomers(ctx, biz.MasterDataFilter{Limit: 20})
				ids := make([]int, 0, len(rows))
				for _, row := range rows {
					ids = append(ids, row.ID)
				}
				return ids, total, err
			},
		},
		{
			name: "suppliers",
			seed: func(ctx context.Context, client *ent.Client) []int {
				ids := make([]int, 0, 3)
				for index := 1; index <= 3; index++ {
					row := client.Supplier.Create().SetCode(fmt.Sprintf("PAGE-S-%d", index)).SetName(fmt.Sprintf("分页供应商 %d", index)).SaveX(ctx)
					ids = append(ids, row.ID)
				}
				return ids
			},
			list: func(ctx context.Context, uc *biz.MasterDataUsecase) ([]int, int, error) {
				rows, total, err := uc.ListSuppliers(ctx, biz.MasterDataFilter{Limit: 20})
				ids := make([]int, 0, len(rows))
				for _, row := range rows {
					ids = append(ids, row.ID)
				}
				return ids, total, err
			},
		},
		{
			name: "materials",
			seed: func(ctx context.Context, client *ent.Client) []int {
				unitRow := client.Unit.Create().SetCode("MAT-PCS").SetName("件").SaveX(ctx)
				ids := make([]int, 0, 3)
				for index := 1; index <= 3; index++ {
					row := client.Material.Create().SetCode(fmt.Sprintf("PAGE-M-%d", index)).SetName(fmt.Sprintf("分页材料 %d", index)).SetDefaultUnitID(unitRow.ID).SaveX(ctx)
					ids = append(ids, row.ID)
				}
				return ids
			},
			list: func(ctx context.Context, uc *biz.MasterDataUsecase) ([]int, int, error) {
				rows, total, err := uc.ListMaterials(ctx, biz.MasterDataFilter{Limit: 20})
				ids := make([]int, 0, len(rows))
				for _, row := range rows {
					ids = append(ids, row.ID)
				}
				return ids, total, err
			},
		},
		{
			name: "units",
			seed: func(ctx context.Context, client *ent.Client) []int {
				ids := make([]int, 0, 3)
				for index := 1; index <= 3; index++ {
					row := client.Unit.Create().SetCode(fmt.Sprintf("PAGE-U-%d", index)).SetName(fmt.Sprintf("分页单位 %d", index)).SaveX(ctx)
					ids = append(ids, row.ID)
				}
				return ids
			},
			list: func(ctx context.Context, uc *biz.MasterDataUsecase) ([]int, int, error) {
				rows, total, err := uc.ListUnits(ctx, biz.MasterDataFilter{Limit: 20})
				ids := make([]int, 0, len(rows))
				for _, row := range rows {
					ids = append(ids, row.ID)
				}
				return ids, total, err
			},
		},
		{
			name: "warehouses",
			seed: func(ctx context.Context, client *ent.Client) []int {
				ids := make([]int, 0, 3)
				for index := 1; index <= 3; index++ {
					row := client.Warehouse.Create().SetCode(fmt.Sprintf("PAGE-W-%d", index)).SetName(fmt.Sprintf("分页仓库 %d", index)).SetType("RAW_MATERIAL").SaveX(ctx)
					ids = append(ids, row.ID)
				}
				return ids
			},
			list: func(ctx context.Context, uc *biz.MasterDataUsecase) ([]int, int, error) {
				rows, total, err := uc.ListWarehouses(ctx, biz.MasterDataFilter{Limit: 20})
				ids := make([]int, 0, len(rows))
				for _, row := range rows {
					ids = append(ids, row.ID)
				}
				return ids, total, err
			},
		},
		{
			name: "product skus",
			seed: func(ctx context.Context, client *ent.Client) []int {
				unitRow := client.Unit.Create().SetCode("SKU-PCS").SetName("件").SaveX(ctx)
				productRow := client.Product.Create().SetCode("SKU-P").SetName("SKU 所属产品").SetDefaultUnitID(unitRow.ID).SaveX(ctx)
				ids := make([]int, 0, 3)
				for index := 1; index <= 3; index++ {
					row := client.ProductSKU.Create().SetProductID(productRow.ID).SetSkuCode(fmt.Sprintf("PAGE-SKU-%d", index)).SaveX(ctx)
					ids = append(ids, row.ID)
				}
				return ids
			},
			list: func(ctx context.Context, uc *biz.MasterDataUsecase) ([]int, int, error) {
				rows, total, err := uc.ListProductSKUs(ctx, biz.ProductSKUFilter{Limit: 20})
				ids := make([]int, 0, len(rows))
				for _, row := range rows {
					ids = append(ids, row.ID)
				}
				return ids, total, err
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			uc, client := openMasterDataRepoTest(t, "masterdata_newest_first_"+test.name)
			defer mustCloseEntClient(t, client)

			createdIDs := test.seed(ctx, client)
			listedIDs, total, err := test.list(ctx, uc)
			if err != nil {
				t.Fatalf("list %s: %v", test.name, err)
			}
			if total != len(createdIDs) {
				t.Fatalf("%s total=%d want=%d", test.name, total, len(createdIDs))
			}
			assertNewestFirstIDs(t, listedIDs, createdIDs)
		})
	}
}

func TestProductionOrderRepoDefaultSortUsesDescendingIDTieBreaker(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_default_sort_id_tie_breaker")

	first, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-PAGE-001", 1), ActorID: f.actorID, IdempotencyKey: "create-page-order-1",
	})
	if err != nil {
		t.Fatalf("create first production order: %v", err)
	}
	second, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-PAGE-002", 1), ActorID: f.actorID, IdempotencyKey: "create-page-order-2",
	})
	if err != nil {
		t.Fatalf("create second production order: %v", err)
	}

	tiedUpdatedAt := time.Date(2026, time.July, 18, 12, 0, 0, 0, time.UTC)
	if _, err := f.client.ProductionOrder.Update().
		Where(productionorder.IDIn(first.Order.ID, second.Order.ID)).
		SetUpdatedAt(tiedUpdatedAt).
		Save(ctx); err != nil {
		t.Fatalf("tie production order updated_at values: %v", err)
	}

	rows, total, err := f.uc.List(ctx, biz.ProductionOrderFilter{Limit: 20})
	if err != nil {
		t.Fatalf("list production orders: %v", err)
	}
	if total != 2 || len(rows) != 2 {
		t.Fatalf("production order total=%d len=%d want=2", total, len(rows))
	}
	if rows[0].ID != second.Order.ID || rows[1].ID != first.Order.ID {
		t.Fatalf("production order ids=%v want=[%d %d]", []int{rows[0].ID, rows[1].ID}, second.Order.ID, first.Order.ID)
	}
}

func assertNewestFirstIDs(t *testing.T, listedIDs, createdIDs []int) {
	t.Helper()
	if len(listedIDs) != len(createdIDs) {
		t.Fatalf("listed ids len=%d want=%d: %v", len(listedIDs), len(createdIDs), listedIDs)
	}
	for index, listedID := range listedIDs {
		wantID := createdIDs[len(createdIDs)-1-index]
		if listedID != wantID {
			t.Fatalf("listed ids=%v want descending creation ids=%v", listedIDs, createdIDs)
		}
	}
}
