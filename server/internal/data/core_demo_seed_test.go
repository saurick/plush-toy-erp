package data

import (
	"context"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestDefaultCoreDemoSeedDatasetIsSimulatedAndComplete(t *testing.T) {
	dataset := DefaultCoreDemoSeedDataset("")
	if dataset.Prefix != CoreDemoSeedPrefix {
		t.Fatalf("unexpected prefix %q", dataset.Prefix)
	}
	if len(dataset.Units) < 3 || len(dataset.Materials) < 3 || len(dataset.Products) < 2 || len(dataset.Warehouses) < 3 || len(dataset.Processes) < 6 || len(dataset.BOMs) == 0 {
		t.Fatalf("default core demo dataset is too small: %#v", dataset)
	}
	if err := validateCoreDemoSeedDataset(dataset); err != nil {
		t.Fatalf("validateCoreDemoSeedDataset() error = %v", err)
	}
	for _, product := range dataset.Products {
		if !regexp.MustCompile(`^SIM-`).MatchString(product.Code) {
			t.Fatalf("product code must stay simulated, got %q", product.Code)
		}
	}
}

func TestSeedCoreDemoDataRejectsUnsafePrefixAndMissingDB(t *testing.T) {
	if _, err := SeedCoreDemoData(context.Background(), nil, DefaultCoreDemoSeedDataset("")); !errors.Is(err, ErrCoreDemoSeedMissingDB) {
		t.Fatalf("expected ErrCoreDemoSeedMissingDB, got %v", err)
	}
	dataset := DefaultCoreDemoSeedDataset("REAL")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	mock.ExpectClose()
	if _, err := SeedCoreDemoData(context.Background(), db, dataset); !errors.Is(err, ErrCoreDemoSeedUnsafePrefix) {
		t.Fatalf("expected ErrCoreDemoSeedUnsafePrefix, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSeedCoreDemoDataUpsertsMinimalDataset(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	dataset := CoreDemoSeedDataset{
		Prefix: "SIM-TEST",
		Units: []CoreDemoUnitSeed{
			{Code: "SIM-TEST-PCS", Name: "件", Precision: 0},
		},
		Materials: []CoreDemoMaterialSeed{
			{Code: "SIM-TEST-MAT", Name: "演示材料", Category: "fabric", DefaultUnitCode: "SIM-TEST-PCS"},
		},
		Products: []CoreDemoProductSeed{
			{Code: "SIM-TEST-PROD", Name: "演示产品", StyleNo: "SIM-TEST-STYLE", DefaultUnitCode: "SIM-TEST-PCS"},
		},
		Warehouses: []CoreDemoWarehouseSeed{
			{Code: "SIM-TEST-FG", Name: "成品仓", Type: "FINISHED_GOODS"},
		},
		Processes: []CoreDemoProcessSeed{
			{Code: "SIM-TEST-PROC-SEWING", Name: "车缝", Category: "车缝", OutsourcingEnabled: true, SortOrder: 10},
		},
		BOMs: []CoreDemoBOMSeed{
			{
				ProductCode: "SIM-TEST-PROD",
				Version:     "SIM-TEST-BOM-V1",
				Status:      "ACTIVE",
				Items: []CoreDemoBOMItemSeed{
					{MaterialCode: "SIM-TEST-MAT", Quantity: "1.000000", UnitCode: "SIM-TEST-PCS", LossRate: "0.000000"},
				},
			},
		},
	}

	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO units").
		WithArgs("SIM-TEST-PCS", "件", 0).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11))
	mock.ExpectQuery("INSERT INTO materials").
		WithArgs("SIM-TEST-MAT", "演示材料", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), 11).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(21))
	mock.ExpectQuery("INSERT INTO products").
		WithArgs("SIM-TEST-PROD", "演示产品", sqlmock.AnyArg(), sqlmock.AnyArg(), 11).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(31))
	mock.ExpectQuery("INSERT INTO warehouses").
		WithArgs("SIM-TEST-FG", "成品仓", "FINISHED_GOODS").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(41))
	mock.ExpectQuery("INSERT INTO processes").
		WithArgs("SIM-TEST-PROC-SEWING", "车缝", sqlmock.AnyArg(), true, false, false, 10, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(45))
	mock.ExpectQuery("INSERT INTO bom_headers").
		WithArgs(31, "SIM-TEST-BOM-V1", "ACTIVE", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(51))
	mock.ExpectQuery("SELECT id\nFROM bom_items").
		WithArgs(51, 21).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectExec("INSERT INTO bom_items").
		WithArgs(51, 21, "1.000000", 11, "0.000000", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(61, 1))
	mock.ExpectCommit()
	mock.ExpectClose()

	result, err := SeedCoreDemoData(context.Background(), db, dataset)
	if err != nil {
		t.Fatalf("SeedCoreDemoData() error = %v", err)
	}
	if result.PrimaryProductID != 31 || result.PrimaryUnitID != 11 || result.PrimaryWarehouseID != 41 {
		t.Fatalf("unexpected primary ids %#v", result)
	}
	if result.MaterialIDs["SIM-TEST-MAT"] != 21 || result.BOMHeaderIDs["SIM-TEST-PROD"] != 51 {
		t.Fatalf("unexpected seeded ids %#v", result)
	}
	if result.ProcessIDs["SIM-TEST-PROC-SEWING"] != 45 {
		t.Fatalf("unexpected process ids %#v", result.ProcessIDs)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}
