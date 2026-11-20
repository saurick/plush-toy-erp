package data

import (
	"context"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"io"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"testing"
)

func TestInventoryDistributionUsesScopedBalancesAndReservations(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "inventory_distribution")
	checkInventoryDistribution(t, data, client)
}

func TestInventoryPostgresDistribution(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	checkInventoryDistribution(t, data, client)
}

func checkInventoryDistribution(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	prefix := "DIST-" + postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, prefix)
	material := createTestMaterial(t, ctx, client, unit.ID, prefix+"-M")
	product := createTestProduct(t, ctx, client, unit.ID, prefix+"-P")
	warehouse := createTestWarehouse(t, ctx, client, prefix+"-M")
	finished := createTestProductWarehouse(t, ctx, client, prefix+"-P")
	f := inventoryTestFixtures{unitID: unit.ID, materialID: material.ID, productID: product.ID, warehouseID: warehouse.ID, productWarehouseID: finished.ID}
	sku := createInventoryTestSKU(t, ctx, client, f.productID, f.unitID, prefix+"-S")
	lot := client.InventoryLot.Create().SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(f.materialID).SetLotNo(prefix + "-L").SaveX(ctx)
	for _, n := range []struct {
		subject       string
		id, warehouse int
		sku, lot      *int
		quantity      int64
	}{
		{biz.InventorySubjectMaterial, f.materialID, f.warehouseID, nil, nil, 5},
		{biz.InventorySubjectMaterial, f.materialID, f.warehouseID, nil, &lot.ID, 0},
		{biz.InventorySubjectProduct, f.productID, f.productWarehouseID, &sku.ID, nil, 4},
	} {
		client.InventoryBalance.Create().SetSubjectType(n.subject).SetSubjectID(n.id).SetWarehouseID(n.warehouse).
			SetNillableProductSkuID(n.sku).SetNillableLotID(n.lot).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(n.quantity)).SaveX(ctx)
	}
	client.StockReservation.Create().SetReservationNo(prefix + "-R").SetIdempotencyKey(prefix + "-R").SetStatus(biz.StockReservationStatusActive).
		SetProductID(f.productID).SetProductSkuID(sku.ID).SetWarehouseID(f.productWarehouseID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(4)).SaveX(ctx)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	all := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID, f.productWarehouseID}}
	rows, err := repo.GetInventoryDistributionForAccess(ctx, biz.InventoryBalanceFilter{}, all)
	if err != nil || len(rows) != 2 {
		t.Fatalf("distribution=%+v err=%v", rows, err)
	}
	if rows[0].WarehouseID != f.warehouseID || rows[0].RecordCount != 2 || rows[0].StockCount != 1 || rows[0].AvailableRecordCount != 1 || rows[0].UnavailableRecordCount != 1 {
		t.Fatalf("material aggregation=%+v", rows[0])
	}
	if rows[1].AvailableRecordCount != 0 || rows[1].UnavailableRecordCount != 1 {
		t.Fatalf("reservation ignored: %+v", rows[1])
	}
	scope := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.productWarehouseID}}
	rows, err = repo.GetInventoryDistributionForAccess(ctx, biz.InventoryBalanceFilter{}, scope)
	if err != nil || len(rows) != 1 || rows[0].WarehouseID != f.productWarehouseID {
		t.Fatalf("scope leak: %+v %v", rows, err)
	}
	rows, err = repo.GetInventoryDistributionForAccess(ctx, biz.InventoryBalanceFilter{SubjectType: biz.InventorySubjectMaterial}, scope)
	if err != nil || len(rows) != 0 {
		t.Fatalf("filter leak: %+v %v", rows, err)
	}
}
