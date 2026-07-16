package data

import (
	"context"
	"errors"
	"reflect"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestDefaultCoreDemoReferenceSeedDatasetIsExact(t *testing.T) {
	want := CoreDemoReferenceSeedDataset{
		Prefix: CoreDemoReferenceSeedPrefix,
		Units: []CoreDemoUnitSeed{
			{Code: "YS5-DW-01", Name: "件", Precision: 0},
		},
		Warehouses: []CoreDemoWarehouseSeed{
			{Code: "YS5-CK-01", Name: "原料仓", Type: "RAW_MATERIAL"},
			{Code: "YS5-CK-02", Name: "成品仓", Type: "FINISHED_GOODS"},
			{Code: "YS5-CK-03", Name: "待检仓", Type: "QC_HOLD"},
			{Code: "YS5-CK-04", Name: "在制仓", Type: "WORK_IN_PROCESS"},
		},
	}
	got := DefaultCoreDemoReferenceSeedDataset()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected references-only dataset\n got: %#v\nwant: %#v", got, want)
	}
	if err := validateCoreDemoReferenceSeedDataset(got); err != nil {
		t.Fatalf("validateCoreDemoReferenceSeedDataset() error = %v", err)
	}
}

func TestCoreDemoReferenceSeedRejectsAnythingOutsideExactAllowlist(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*CoreDemoReferenceSeedDataset)
	}{
		{
			name: "alternate prefix",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Prefix = "SIM-OTHER"
			},
		},
		{
			name: "extra unit",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Units = append(dataset.Units, CoreDemoUnitSeed{Code: "YS5-DW-02", Name: "箱"})
			},
		},
		{
			name: "changed unit",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Units[0].Name = "只"
			},
		},
		{
			name: "missing warehouse",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Warehouses = dataset.Warehouses[:3]
			},
		},
		{
			name: "extra warehouse",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Warehouses = append(dataset.Warehouses, CoreDemoWarehouseSeed{Code: "YS5-CK-05", Name: "其他仓", Type: "OTHER"})
			},
		},
		{
			name: "changed warehouse",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Warehouses[0].Type = "FINISHED_GOODS"
			},
		},
		{
			name: "duplicate warehouse",
			mutate: func(dataset *CoreDemoReferenceSeedDataset) {
				dataset.Warehouses[1] = dataset.Warehouses[0]
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dataset := DefaultCoreDemoReferenceSeedDataset()
			tt.mutate(&dataset)
			if err := validateCoreDemoReferenceSeedDataset(dataset); !errors.Is(err, ErrCoreDemoSeedInvalidRecord) {
				t.Fatalf("expected ErrCoreDemoSeedInvalidRecord, got %v", err)
			}
		})
	}
}

func TestSeedCoreDemoReferencesUpsertsOnlyExactReferencesIdempotently(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	dataset := DefaultCoreDemoReferenceSeedDataset()

	expectRun := func() {
		mock.ExpectBegin()
		mock.ExpectQuery("INSERT INTO units").
			WithArgs("YS5-DW-01", "件", 0).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11))
		warehouseIDs := []int{21, 22, 23, 24}
		for index, warehouse := range dataset.Warehouses {
			mock.ExpectQuery("INSERT INTO warehouses").
				WithArgs(warehouse.Code, warehouse.Name, warehouse.Type).
				WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(warehouseIDs[index]))
		}
		mock.ExpectCommit()
	}
	expectRun()
	expectRun()
	mock.ExpectClose()

	for run := 0; run < 2; run++ {
		result, err := SeedCoreDemoReferences(context.Background(), db, dataset)
		if err != nil {
			t.Fatalf("SeedCoreDemoReferences() run %d error = %v", run+1, err)
		}
		if result.PrimaryUnitID != 11 || result.PrimaryWarehouseID != 22 {
			t.Fatalf("unexpected primary ids on run %d: %#v", run+1, result)
		}
		if len(result.UnitIDs) != 1 || len(result.WarehouseIDs) != 4 {
			t.Fatalf("unexpected reference counts on run %d: %#v", run+1, result)
		}
		if len(result.MaterialIDs) != 0 || len(result.ProductIDs) != 0 || len(result.ProcessIDs) != 0 || len(result.BOMHeaderIDs) != 0 {
			t.Fatalf("references-only seed wrote an unrelated record kind on run %d: %#v", run+1, result)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSeedCoreDemoReferencesRejectsMissingDB(t *testing.T) {
	if _, err := SeedCoreDemoReferences(context.Background(), nil, DefaultCoreDemoReferenceSeedDataset()); !errors.Is(err, ErrCoreDemoSeedMissingDB) {
		t.Fatalf("expected ErrCoreDemoSeedMissingDB, got %v", err)
	}
}

func TestSeedCoreDemoReferencesRollsBackAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	dataset := DefaultCoreDemoReferenceSeedDataset()
	wantErr := errors.New("warehouse write failed")

	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO units").
		WithArgs("YS5-DW-01", "件", 0).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11))
	mock.ExpectQuery("INSERT INTO warehouses").
		WithArgs(dataset.Warehouses[0].Code, dataset.Warehouses[0].Name, dataset.Warehouses[0].Type).
		WillReturnError(wantErr)
	mock.ExpectRollback()
	mock.ExpectClose()

	if _, err := SeedCoreDemoReferences(context.Background(), db, dataset); !errors.Is(err, wantErr) {
		t.Fatalf("expected warehouse error, got %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("db.Close() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestDefaultCoreDemoSeedDatasetIsSimulatedAndComplete(t *testing.T) {
	dataset := DefaultCoreDemoSeedDataset("")
	if dataset.Prefix != CoreDemoSeedPrefix {
		t.Fatalf("unexpected prefix %q", dataset.Prefix)
	}
	if len(dataset.Units) < 4 || len(dataset.Materials) < 7 || len(dataset.Products) < 4 || len(dataset.Warehouses) < 4 || len(dataset.Processes) < 9 || len(dataset.BOMs) < 2 {
		t.Fatalf("default core demo dataset is too small: %#v", dataset)
	}
	if err := validateCoreDemoSeedDataset(dataset); err != nil {
		t.Fatalf("validateCoreDemoSeedDataset() error = %v", err)
	}
	requiredProcesses := map[string]struct {
		outsourcing bool
		inhouse     bool
		quality     bool
	}{
		"查货": {outsourcing: true, inhouse: true, quality: true},
		"手工": {outsourcing: true, inhouse: true},
		"车缝": {outsourcing: true, inhouse: true},
		"包装": {outsourcing: true, inhouse: true},
	}
	for _, process := range dataset.Processes {
		expected, ok := requiredProcesses[process.Name]
		if !ok {
			continue
		}
		if process.Category != process.Name ||
			process.OutsourcingEnabled != expected.outsourcing ||
			process.InhouseEnabled != expected.inhouse ||
			process.QualityRequired != expected.quality {
			t.Fatalf("unexpected default plush process %q: %#v", process.Name, process)
		}
		delete(requiredProcesses, process.Name)
	}
	if len(requiredProcesses) > 0 {
		t.Fatalf("missing default plush processes: %#v", requiredProcesses)
	}
	requiredMaterialCategories := map[string]bool{
		"fabric":    false,
		"filling":   false,
		"accessory": false,
		"packing":   false,
		"label":     false,
	}
	for _, material := range dataset.Materials {
		if _, ok := requiredMaterialCategories[material.Category]; ok {
			requiredMaterialCategories[material.Category] = true
		}
	}
	for category, found := range requiredMaterialCategories {
		if !found {
			t.Fatalf("missing material category %q in default core demo dataset", category)
		}
	}
	for _, bom := range dataset.BOMs {
		if len(bom.Items) < 3 {
			t.Fatalf("BOM %q should cover multiple materials, got %#v", bom.Version, bom.Items)
		}
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

func TestCoreDemoSeedRejectsNumberedImplementationStageLabels(t *testing.T) {
	dataset := DefaultCoreDemoSeedDataset("")
	dataset.Units[0].Name = "Phase" + " 8 模拟单位"
	if err := validateCoreDemoSeedDataset(dataset); !errors.Is(err, ErrCoreDemoSeedInvalidRecord) {
		t.Fatalf("expected numbered implementation stage label rejected, got %v", err)
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
