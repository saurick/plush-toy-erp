package service

import (
	"context"
	stdsql "database/sql"
	"testing"

	datarepo "server/internal/data"
	"server/internal/data/model/ent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

type inventoryTestFixtures struct {
	unitID             int
	materialID         int
	productID          int
	warehouseID        int
	productWarehouseID int
}

func openInventoryRepoTestData(t *testing.T, name string) (*datarepo.Data, *ent.Client) {
	t.Helper()
	db, err := stdsql.Open("sqlite3", "file:"+name+"?mode=memory&cache=shared&_fk=1&_busy_timeout=5000")
	if err != nil {
		t.Fatalf("open sqlite db failed: %v", err)
	}
	db.SetMaxOpenConns(1)
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.SQLite, db)))
	if err := client.Schema.Create(context.Background()); err != nil {
		_ = client.Close()
		_ = db.Close()
		t.Fatalf("create ent schema failed: %v", err)
	}
	t.Cleanup(func() {
		_ = client.Close()
		_ = db.Close()
	})
	return datarepo.NewDataForTesting(client, db), client
}

func createInventoryTestFixtures(t *testing.T, ctx context.Context, client *ent.Client) inventoryTestFixtures {
	t.Helper()
	unit := createTestUnit(t, ctx, client, "PCS")
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-INV-001")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-INV-001")
	warehouse := createTestWarehouse(t, ctx, client, "WH-INV-001")
	productWarehouse := client.Warehouse.Create().SetCode("WH-FINISHED-001").SetName("成品仓").SetType("FINISHED_GOODS").SaveX(ctx)
	return inventoryTestFixtures{
		productWarehouseID: productWarehouse.ID,
		unitID:             unit.ID,
		materialID:         material.ID,
		productID:          product.ID,
		warehouseID:        warehouse.ID,
	}
}

func createTestUnit(t *testing.T, ctx context.Context, client *ent.Client, code string) *ent.Unit {
	t.Helper()
	unit, err := client.Unit.Create().
		SetCode(code).
		SetName(code + "单位").
		SetPrecision(2).
		Save(ctx)
	if err != nil {
		t.Fatalf("create unit %s failed: %v", code, err)
	}
	return unit
}

func createTestMaterial(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string) *ent.Material {
	t.Helper()
	material, err := client.Material.Create().
		SetStockCategory("MAIN").
		SetCode(code).
		SetName(code + "材料").
		SetCategory("FABRIC").
		SetSpec("10mm").
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create material %s failed: %v", code, err)
	}
	return material
}

func createTestProduct(t *testing.T, ctx context.Context, client *ent.Client, unitID int, code string) *ent.Product {
	t.Helper()
	product, err := client.Product.Create().
		SetCode(code).
		SetName(code + "成品").
		SetStyleNo("STYLE-" + code).
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product %s failed: %v", code, err)
	}
	return product
}

func createTestWarehouse(t *testing.T, ctx context.Context, client *ent.Client, code string) *ent.Warehouse {
	t.Helper()
	warehouse, err := client.Warehouse.Create().
		SetCode(code).
		SetName(code + "仓").
		SetType("MATERIAL").
		Save(ctx)
	if err != nil {
		t.Fatalf("create warehouse %s failed: %v", code, err)
	}
	return warehouse
}

func assertDecimalEqual(t *testing.T, got decimal.Decimal, want string) {
	t.Helper()
	expected, err := decimal.NewFromString(want)
	if err != nil {
		t.Fatalf("parse decimal %q failed: %v", want, err)
	}
	if got.Cmp(expected) != 0 {
		t.Fatalf("expected decimal %s, got %s", expected.String(), got.String())
	}
}
