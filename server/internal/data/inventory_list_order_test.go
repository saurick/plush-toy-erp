package data

import (
	"context"
	"io"
	"slices"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryPostgresListSortingBeforePagination(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	prefix := "INV-SORT-" + postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, prefix)
	otherUnit := createTestUnit(t, ctx, client, prefix+"-OTHER")
	client.Unit.UpdateOneID(unit.ID).SetName("ZuluUnit").SaveX(ctx)
	client.Unit.UpdateOneID(otherUnit.ID).SetName("AlphaUnit").SaveX(ctx)
	material := createTestMaterial(t, ctx, client, unit.ID, prefix+"-Z")
	product := createTestProduct(t, ctx, client, unit.ID, prefix+"-A")
	zuluSKU := createInventoryTestSKU(t, ctx, client, product.ID, unit.ID, prefix+"-Z")
	alphaSKU := createInventoryTestSKU(t, ctx, client, product.ID, otherUnit.ID, prefix+"-A")
	firstWarehouse := createTestWarehouse(t, ctx, client, prefix+"-Z")
	secondWarehouse := createTestProductWarehouse(t, ctx, client, prefix+"-A")
	otherWarehouse := createTestWarehouse(t, ctx, client, prefix+"-O")
	client.Warehouse.UpdateOneID(firstWarehouse.ID).SetName("Alpha").SaveX(ctx)
	client.Warehouse.UpdateOneID(secondWarehouse.ID).SetName("Zulu").SaveX(ctx)
	early := time.Date(2026, time.June, 10, 0, 0, 0, 0, time.UTC)
	late := early.AddDate(0, 0, 1)
	newLot := func(suffix string, receivedAt *time.Time) int {
		return client.InventoryLot.Create().
			SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(material.ID).
			SetLotNo(prefix + suffix).SetNillableReceivedAt(receivedAt).SetUpdatedAt(late).SaveX(ctx).ID
	}
	lotB := newLot("-B", &late)
	lotA := newLot("-A", &early)
	lotC := newLot("-C", nil)
	client.InventoryLot.UpdateOneID(lotB).SetStatus("HOLD").SaveX(ctx)
	newBalance := func(subjectType string, subjectID, warehouseID int, lotID *int, quantity string) int {
		return client.InventoryBalance.Create().
			SetSubjectType(subjectType).SetSubjectID(subjectID).SetWarehouseID(warehouseID).
			SetUnitID(unit.ID).SetNillableLotID(lotID).
			SetQuantity(decimal.RequireFromString(quantity)).SetUpdatedAt(late).SaveX(ctx).ID
	}
	a := newBalance(biz.InventorySubjectMaterial, material.ID, firstWarehouse.ID, &lotB, "2.25")
	b := newBalance(biz.InventorySubjectProduct, product.ID, secondWarehouse.ID, nil, "10.5")
	client.InventoryBalance.UpdateOneID(b).SetProductSkuID(zuluSKU.ID).SetUpdatedAt(late).SaveX(ctx)
	client.StockReservation.Create().SetReservationNo(prefix + "-RSV").SetIdempotencyKey(prefix + "-RSV").
		SetStatus(biz.StockReservationStatusActive).SetProductID(product.ID).SetProductSkuID(zuluSKU.ID).
		SetWarehouseID(secondWarehouse.ID).SetUnitID(unit.ID).SetQuantity(decimal.NewFromInt(10)).SaveX(ctx)
	c := newBalance(biz.InventorySubjectMaterial, material.ID, firstWarehouse.ID, &lotA, "2.25")
	d := client.InventoryBalance.Create().SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(product.ID).
		SetWarehouseID(secondWarehouse.ID).SetProductSkuID(alphaSKU.ID).SetUnitID(otherUnit.ID).
		SetQuantity(decimal.NewFromInt(90)).SetUpdatedAt(late).SaveX(ctx).ID
	newBalance(biz.InventorySubjectMaterial, material.ID, otherWarehouse.ID, &lotC, "100")

	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	scope := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{firstWarehouse.ID, secondWarehouse.ID}}
	for _, tc := range []struct {
		field, direction string
		want             []int
	}{
		{"", "", []int{d, c, b, a}},
		{biz.InventorySortRegistrationOrder, "asc", []int{a, b, c, d}},
		{biz.InventorySortRegistrationOrder, "desc", []int{d, c, b, a}},
		{biz.InventorySortStockKind, "asc", []int{c, a, d, b}},
		{biz.InventorySortStockKind, "desc", []int{d, b, c, a}},
		{biz.InventorySortSKUCode, "asc", []int{d, b, c, a}},
		{biz.InventorySortSKUCode, "desc", []int{b, d, c, a}},
		{biz.InventorySortUnitName, "asc", []int{d, c, b, a}},
		{biz.InventorySortUnitName, "desc", []int{c, b, a, d}},
		{biz.InventorySortQuantity, "asc", []int{c, a, b, d}},
		{biz.InventorySortQuantity, "desc", []int{b, c, a, d}},
		{biz.InventorySortReserved, "asc", []int{c, a, b, d}},
		{biz.InventorySortReserved, "desc", []int{b, c, a, d}},
		{biz.InventorySortUnreserved, "asc", []int{b, c, a, d}},
		{biz.InventorySortUnreserved, "desc", []int{c, a, b, d}},
		{biz.InventorySortIssuable, "asc", []int{a, c, b, d}},
		{biz.InventorySortIssuable, "desc", []int{c, a, b, d}},
		{biz.InventorySortRestricted, "asc", []int{c, b, a, d}},
		{biz.InventorySortRestricted, "desc", []int{a, c, b, d}},
		{biz.InventorySortPendingInspection, "asc", []int{b, d, c, a}},
		{biz.InventorySortPendingInspection, "desc", []int{b, d, c, a}},
		{biz.InventorySortPendingPackaging, "asc", []int{b, d, c, a}},
		{biz.InventorySortPendingPackaging, "desc", []int{b, d, c, a}},
		{biz.InventorySortReadyToShip, "asc", []int{b, d, c, a}},
		{biz.InventorySortReadyToShip, "desc", []int{b, d, c, a}},
		{biz.InventorySortSubjectCode, "asc", []int{d, b, c, a}},
		{biz.InventorySortSubjectCode, "desc", []int{c, a, d, b}},
		{biz.InventorySortWarehouseName, "asc", []int{c, a, d, b}},
		{biz.InventorySortWarehouseName, "desc", []int{d, b, c, a}},
		{biz.InventorySortLotNo, "asc", []int{c, a, d, b}},
		{biz.InventorySortLotNo, "desc", []int{a, c, d, b}},
	} {
		t.Run("balances/"+tc.field+"/"+tc.direction, func(t *testing.T) {
			var got []int
			for offset := 0; offset < len(tc.want); offset += 2 {
				rows, total, err := uc.ListInventoryBalancesForAccess(ctx, biz.InventoryBalanceFilter{
					Keyword: prefix, SortBy: tc.field, SortDirection: tc.direction, Limit: 2, Offset: offset,
				}, scope)
				if err != nil || total != len(tc.want) || len(rows) != min(2, len(tc.want)-offset) {
					t.Fatalf("page at offset %d: %d rows of %d, err=%v", offset, len(rows), total, err)
				}
				for _, row := range rows {
					got = append(got, row.ID)
				}
			}
			if !slices.Equal(got, tc.want) {
				t.Fatalf("across pages got %v want %v", got, tc.want)
			}
		})
	}

	for _, tc := range []struct {
		field, direction string
		want             []int
	}{
		{biz.InventorySortReceivedAt, "asc", []int{lotA, lotB, lotC}},
		{biz.InventorySortReceivedAt, "desc", []int{lotB, lotA, lotC}},
		{biz.InventorySortLotNo, "", []int{lotC, lotB, lotA}},
	} {
		t.Run("lots/"+tc.field+"/"+tc.direction, func(t *testing.T) {
			var got []int
			for offset := 0; offset < 3; offset += 2 {
				rows, total, err := uc.ListInventoryLots(ctx, biz.InventoryLotFilter{
					SubjectID: material.ID, Keyword: prefix, SortBy: tc.field, SortDirection: tc.direction, Limit: 2, Offset: offset,
				})
				if err != nil || total != 3 || len(rows) != min(2, 3-offset) {
					t.Fatalf("page at offset %d: %d rows of %d, err=%v", offset, len(rows), total, err)
				}
				for _, row := range rows {
					got = append(got, row.ID)
				}
			}
			if !slices.Equal(got, tc.want) {
				t.Fatalf("across pages got %v want %v", got, tc.want)
			}
		})
	}
}
