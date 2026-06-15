package service

import (
	"context"
	stdsql "database/sql"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/data/model/ent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

type inventoryTestFixtures struct {
	unitID      int
	materialID  int
	productID   int
	warehouseID int
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
	return inventoryTestFixtures{
		unitID:      unit.ID,
		materialID:  material.ID,
		productID:   product.ID,
		warehouseID: warehouse.ID,
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
		SetType("RAW_MATERIAL").
		Save(ctx)
	if err != nil {
		t.Fatalf("create warehouse %s failed: %v", code, err)
	}
	return warehouse
}

func mustCloseEntClient(t *testing.T, client interface{ Close() error }) {
	t.Helper()
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
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

func createFinishedGoodsQCTask(t *testing.T, ctx context.Context, repo biz.WorkflowRepo, sourceID int) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "FG-QC-001"
	statusKey := "qc_pending"
	qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "FINISHED-GOODS-QC-001",
		TaskGroup:         "finished_goods_qc",
		TaskName:          "成品抽检",
		SourceType:        "production-progress",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          3,
		Payload: map[string]any{
			"record_title":          "小熊公仔完工",
			"source_no":             "SO-2026-101",
			"customer_name":         "成慧怡",
			"style_no":              "ST-001",
			"product_no":            "SKU-101",
			"product_name":          "小熊公仔",
			"quantity":              float64(1200),
			"unit":                  "只",
			"due_date":              "2026-04-28",
			"shipment_date":         "2026-04-30",
			"packaging_requirement": "彩盒 12 只/箱",
			"shipping_requirement":  "客户唛头",
			"finished_goods":        true,
		},
	}, 7)
	if err != nil {
		t.Fatalf("create finished goods QC task failed: %v", err)
	}
	return qcTask
}

func createFinishedGoodsInboundTask(t *testing.T, ctx context.Context, repo biz.WorkflowRepo, sourceID int, payloadOverrides map[string]any) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "FG-IN-001"
	statusKey := "warehouse_inbound_pending"
	payload := map[string]any{
		"record_title":               "小熊公仔入库",
		"source_no":                  "SO-2026-101",
		"customer_name":              "成慧怡",
		"style_no":                   "ST-001",
		"product_no":                 "SKU-101",
		"product_name":               "小熊公仔",
		"quantity":                   float64(1200),
		"unit":                       "只",
		"due_date":                   "2026-04-28",
		"shipment_date":              "2026-04-30",
		"packaging_requirement":      "彩盒 12 只/箱",
		"shipping_requirement":       "客户唛头",
		"finished_goods":             true,
		"inventory_balance_deferred": true,
	}
	for key, value := range payloadOverrides {
		payload[key] = value
	}
	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "FINISHED-GOODS-INBOUND-001",
		TaskGroup:         "finished_goods_inbound",
		TaskName:          "成品入库",
		SourceType:        "production-progress",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          3,
		Payload:           payload,
	}, 7)
	if err != nil {
		t.Fatalf("create finished goods inbound task failed: %v", err)
	}
	return task
}

func createShipmentReleaseTask(t *testing.T, ctx context.Context, repo biz.WorkflowRepo, sourceID int, payloadOverrides map[string]any) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "SHIP-REL-001"
	statusKey := "shipment_pending"
	payload := map[string]any{
		"record_title":          "小熊公仔出货放行",
		"source_no":             "SO-2026-101",
		"customer_name":         "成慧怡",
		"style_no":              "ST-001",
		"product_no":            "SKU-101",
		"product_name":          "小熊公仔",
		"quantity":              float64(1200),
		"unit":                  "只",
		"due_date":              "2026-04-28",
		"shipment_date":         "2026-04-30",
		"warehouse_location":    "FG-A-01",
		"packaging_requirement": "彩盒 12 只/箱",
		"shipping_requirement":  "客户唛头",
		"finished_goods":        true,
		"shipment_release":      true,
	}
	for key, value := range payloadOverrides {
		payload[key] = value
	}
	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "SHIPMENT-RELEASE-001",
		TaskGroup:         "shipment_release",
		TaskName:          "出货放行 / 出货准备",
		SourceType:        "shipping-release",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          3,
		Payload:           payload,
	}, 7)
	if err != nil {
		t.Fatalf("create shipment release task failed: %v", err)
	}
	return task
}
