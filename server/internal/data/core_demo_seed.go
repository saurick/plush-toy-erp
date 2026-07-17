package data

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"server/internal/biz"
)

const CoreDemoSeedPrefix = "SIM-PLUSH-CORE"
const CoreDemoReferenceSeedPrefix = "YS5"

var (
	ErrCoreDemoSeedMissingDB     = errors.New("SeedCoreDemoData: missing db")
	ErrCoreDemoSeedUnsafePrefix  = errors.New("core demo seed prefix must start with SIM-")
	ErrCoreDemoSeedInvalidRecord = errors.New("core demo seed record is invalid")
)

type CoreDemoUnitSeed struct {
	Code      string
	Name      string
	Precision int
}

type CoreDemoMaterialSeed struct {
	Code            string
	Name            string
	Category        string
	Spec            string
	Color           string
	DefaultUnitCode string
}

type CoreDemoProductSeed struct {
	Code            string
	Name            string
	StyleNo         string
	CustomerStyleNo string
	DefaultUnitCode string
}

type CoreDemoWarehouseSeed struct {
	Code string
	Name string
	Type string
}

type CoreDemoProcessSeed struct {
	Code               string
	Name               string
	Category           string
	OutsourcingEnabled bool
	InhouseEnabled     bool
	QualityRequired    bool
	SortOrder          int
	Note               string
}

type CoreDemoBOMItemSeed struct {
	MaterialCode            string
	Quantity                string
	UnitCode                string
	LossRate                string
	Position                string
	ProductionOperationCode string
	Note                    string
}

type CoreDemoBOMSeed struct {
	ProductCode string
	Version     string
	Status      string
	Note        string
	Items       []CoreDemoBOMItemSeed
}

type CoreDemoSeedDataset struct {
	Prefix     string
	Units      []CoreDemoUnitSeed
	Materials  []CoreDemoMaterialSeed
	Products   []CoreDemoProductSeed
	Warehouses []CoreDemoWarehouseSeed
	Processes  []CoreDemoProcessSeed
	BOMs       []CoreDemoBOMSeed
}

// CoreDemoReferenceSeedDataset is the exact, minimal foundation required by
// manual-acceptance source data. It intentionally excludes materials,
// products, processes and BOMs so a fresh acceptance database does not gain
// unrelated demo records before its versioned dataset is applied.
type CoreDemoReferenceSeedDataset struct {
	Prefix     string
	Units      []CoreDemoUnitSeed
	Warehouses []CoreDemoWarehouseSeed
}

type CoreDemoSeedResult struct {
	Prefix             string
	UnitIDs            map[string]int
	MaterialIDs        map[string]int
	ProductIDs         map[string]int
	WarehouseIDs       map[string]int
	ProcessIDs         map[string]int
	BOMHeaderIDs       map[string]int
	PrimaryUnitID      int
	PrimaryProductID   int
	PrimaryWarehouseID int
}

func DefaultCoreDemoReferenceSeedDataset() CoreDemoReferenceSeedDataset {
	return CoreDemoReferenceSeedDataset{
		Prefix: CoreDemoReferenceSeedPrefix,
		Units: []CoreDemoUnitSeed{
			{Code: CoreDemoReferenceSeedPrefix + "-DW-01", Name: "件", Precision: 0},
		},
		Warehouses: []CoreDemoWarehouseSeed{
			{Code: CoreDemoReferenceSeedPrefix + "-CK-01", Name: "原料仓", Type: "RAW_MATERIAL"},
			{Code: CoreDemoReferenceSeedPrefix + "-CK-02", Name: "成品仓", Type: "FINISHED_GOODS"},
			{Code: CoreDemoReferenceSeedPrefix + "-CK-03", Name: "待检仓", Type: "QC_HOLD"},
			{Code: CoreDemoReferenceSeedPrefix + "-CK-04", Name: "在制仓", Type: "WORK_IN_PROCESS"},
		},
	}
}

func DefaultCoreDemoSeedDataset(prefix string) CoreDemoSeedDataset {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		prefix = CoreDemoSeedPrefix
	}
	pcs := prefix + "-PCS"
	meter := prefix + "-M"
	kg := prefix + "-KG"
	box := prefix + "-BOX"
	productA := prefix + "-PRODUCT-A"
	productB := prefix + "-PRODUCT-B"
	productC := prefix + "-PRODUCT-C"
	productD := prefix + "-PRODUCT-D"
	return CoreDemoSeedDataset{
		Prefix: prefix,
		Units: []CoreDemoUnitSeed{
			{Code: pcs, Name: "核心演示单位-件", Precision: 0},
			{Code: meter, Name: "核心演示单位-米", Precision: 2},
			{Code: kg, Name: "核心演示单位-千克", Precision: 3},
			{Code: box, Name: "核心演示单位-箱", Precision: 0},
		},
		Materials: []CoreDemoMaterialSeed{
			{
				Code:            prefix + "-MAT-FABRIC",
				Name:            "核心演示短毛绒面料",
				Category:        "fabric",
				Spec:            "150cm 幅宽",
				Color:           "米白",
				DefaultUnitCode: meter,
			},
			{
				Code:            prefix + "-MAT-FILLING",
				Name:            "核心演示 PP 棉",
				Category:        "filling",
				Spec:            "7D",
				Color:           "白",
				DefaultUnitCode: kg,
			},
			{
				Code:            prefix + "-MAT-EYE",
				Name:            "核心演示安全眼",
				Category:        "accessory",
				Spec:            "12mm",
				Color:           "黑",
				DefaultUnitCode: pcs,
			},
			{
				Code:            prefix + "-MAT-THREAD",
				Name:            "核心演示绣花线",
				Category:        "accessory",
				Spec:            "120D",
				Color:           "棕色",
				DefaultUnitCode: meter,
			},
			{
				Code:            prefix + "-MAT-PACKING",
				Name:            "核心演示包装袋",
				Category:        "packing",
				Spec:            "单只装",
				DefaultUnitCode: pcs,
			},
			{
				Code:            prefix + "-MAT-CARTON",
				Name:            "核心演示外箱",
				Category:        "packing",
				Spec:            "60x40x50cm",
				DefaultUnitCode: box,
			},
			{
				Code:            prefix + "-MAT-LABEL",
				Name:            "核心演示洗水标",
				Category:        "label",
				Spec:            "双语",
				DefaultUnitCode: pcs,
			},
		},
		Products: []CoreDemoProductSeed{
			{
				Code:            productA,
				Name:            "核心演示毛绒抱枕",
				StyleNo:         prefix + "-STYLE-A",
				CustomerStyleNo: prefix + "-CUST-STYLE-A",
				DefaultUnitCode: pcs,
			},
			{
				Code:            productB,
				Name:            "核心演示毛绒挂件",
				StyleNo:         prefix + "-STYLE-B",
				CustomerStyleNo: prefix + "-CUST-STYLE-B",
				DefaultUnitCode: pcs,
			},
			{
				Code:            productC,
				Name:            "核心演示安抚熊",
				StyleNo:         prefix + "-STYLE-C",
				CustomerStyleNo: prefix + "-CUST-STYLE-C",
				DefaultUnitCode: pcs,
			},
			{
				Code:            productD,
				Name:            "核心演示节日钥匙扣",
				StyleNo:         prefix + "-STYLE-D",
				CustomerStyleNo: prefix + "-CUST-STYLE-D",
				DefaultUnitCode: pcs,
			},
		},
		Warehouses: []CoreDemoWarehouseSeed{
			{Code: prefix + "-RM-WH", Name: "核心演示原料仓", Type: "RAW_MATERIAL"},
			{Code: prefix + "-FG-WH", Name: "核心演示成品仓", Type: "FINISHED_GOODS"},
			{Code: prefix + "-QC-HOLD", Name: "核心演示待检仓", Type: "QC_HOLD"},
			{Code: prefix + "-WIP-WH", Name: "核心演示在制仓", Type: "WORK_IN_PROCESS"},
		},
		Processes: []CoreDemoProcessSeed{
			{Code: prefix + "-PROC-CHECKING", Name: "查货", Category: "查货", OutsourcingEnabled: true, InhouseEnabled: true, QualityRequired: true, SortOrder: 10, Note: "毛绒玩具行业默认候选工序；排序仅供列表展示，不代表工艺路线，可按实际工厂调整委外 / 内制 / 质检标记。"},
			{Code: prefix + "-PROC-SEWING", Name: "车缝", Category: "车缝", OutsourcingEnabled: true, InhouseEnabled: true, SortOrder: 20, Note: "毛绒玩具行业默认候选工序；排序仅供列表展示，不代表工艺路线，可按实际工厂调整委外 / 内制 / 质检标记。"},
			{Code: prefix + "-PROC-HANDWORK", Name: "手工", Category: "手工", OutsourcingEnabled: true, InhouseEnabled: true, SortOrder: 30, Note: "毛绒玩具行业默认候选工序；排序仅供列表展示，不代表工艺路线，可按实际工厂调整委外 / 内制 / 质检标记。"},
			{Code: prefix + "-PROC-PACKAGING", Name: "包装", Category: "包装", OutsourcingEnabled: true, InhouseEnabled: true, SortOrder: 40, Note: "毛绒玩具行业默认候选工序；排序仅供列表展示，不代表工艺路线，可按实际工厂调整委外 / 内制 / 质检标记。"},
			{Code: prefix + "-PROC-CUTTING-DIE", Name: "制作刀模", Category: "刀模", OutsourcingEnabled: true, SortOrder: 50, Note: "核心演示委外工序，可按实际工厂继续扩展。"},
			{Code: prefix + "-PROC-CUT-PIECE-IQC", Name: "裁片IQC", Category: "裁片质检", OutsourcingEnabled: true, QualityRequired: true, SortOrder: 60, Note: "核心演示委外工序，可按实际工厂继续扩展。"},
			{Code: prefix + "-PROC-MACHINE-CUTTING", Name: "机裁", Category: "裁片", OutsourcingEnabled: true, SortOrder: 70, Note: "核心演示委外工序，可按实际工厂继续扩展。"},
			{Code: prefix + "-PROC-SILKSCREEN", Name: "丝印", Category: "印刷", OutsourcingEnabled: true, SortOrder: 80, Note: "核心演示委外工序，可按实际工厂继续扩展。"},
			{Code: prefix + "-PROC-LAMINATION", Name: "贴合", Category: "贴合", OutsourcingEnabled: true, SortOrder: 90, Note: "核心演示委外工序，可按实际工厂继续扩展。"},
		},
		BOMs: []CoreDemoBOMSeed{
			{
				ProductCode: productA,
				Version:     prefix + "-BOM-V1",
				Status:      "ACTIVE",
				Note:        "核心演示 BOM，只用于本地试用和 QA，不代表真实客户资料。",
				Items: []CoreDemoBOMItemSeed{
					{
						MaterialCode:            prefix + "-MAT-FABRIC",
						Quantity:                "0.650000",
						UnitCode:                meter,
						LossRate:                "0.050000",
						Position:                "面料",
						ProductionOperationCode: biz.ProductionWIPOperationFabricProcessing,
					},
					{
						MaterialCode: prefix + "-MAT-FILLING",
						Quantity:     "0.250000",
						UnitCode:     kg,
						LossRate:     "0.030000",
						Position:     "填充",
					},
					{
						MaterialCode: prefix + "-MAT-EYE",
						Quantity:     "2.000000",
						UnitCode:     pcs,
						LossRate:     "0.010000",
						Position:     "五金配件",
					},
					{
						MaterialCode: prefix + "-MAT-PACKING",
						Quantity:     "1.000000",
						UnitCode:     pcs,
						LossRate:     "0.000000",
						Position:     "包装",
					},
				},
			},
			{
				ProductCode: productC,
				Version:     prefix + "-BOM-C-V1",
				Status:      "ACTIVE",
				Note:        "核心演示 BOM，用于覆盖多材料、多单位和包装箱场景。",
				Items: []CoreDemoBOMItemSeed{
					{
						MaterialCode:            prefix + "-MAT-FABRIC",
						Quantity:                "0.950000",
						UnitCode:                meter,
						LossRate:                "0.060000",
						Position:                "面料",
						ProductionOperationCode: biz.ProductionWIPOperationFabricProcessing,
					},
					{
						MaterialCode: prefix + "-MAT-FILLING",
						Quantity:     "0.420000",
						UnitCode:     kg,
						LossRate:     "0.030000",
						Position:     "填充",
					},
					{
						MaterialCode: prefix + "-MAT-THREAD",
						Quantity:     "3.500000",
						UnitCode:     meter,
						LossRate:     "0.020000",
						Position:     "绣花",
					},
					{
						MaterialCode: prefix + "-MAT-LABEL",
						Quantity:     "1.000000",
						UnitCode:     pcs,
						LossRate:     "0.000000",
						Position:     "标识",
					},
					{
						MaterialCode: prefix + "-MAT-CARTON",
						Quantity:     "0.083333",
						UnitCode:     box,
						LossRate:     "0.000000",
						Position:     "外箱",
						Note:         "12 只装外箱折算。",
					},
				},
			},
		},
	}
}

func SeedCoreDemoReferences(ctx context.Context, db *sql.DB, dataset CoreDemoReferenceSeedDataset) (*CoreDemoSeedResult, error) {
	if db == nil {
		return nil, ErrCoreDemoSeedMissingDB
	}
	if err := validateCoreDemoReferenceSeedDataset(dataset); err != nil {
		return nil, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer rollbackSQLTx(ctx, tx, nil)

	result := &CoreDemoSeedResult{
		Prefix:       dataset.Prefix,
		UnitIDs:      map[string]int{},
		MaterialIDs:  map[string]int{},
		ProductIDs:   map[string]int{},
		WarehouseIDs: map[string]int{},
		ProcessIDs:   map[string]int{},
		BOMHeaderIDs: map[string]int{},
	}
	for _, unit := range dataset.Units {
		id, err := upsertCoreDemoUnit(ctx, tx, unit)
		if err != nil {
			return nil, err
		}
		result.UnitIDs[unit.Code] = id
	}
	for _, warehouse := range dataset.Warehouses {
		id, err := upsertCoreDemoWarehouse(ctx, tx, warehouse)
		if err != nil {
			return nil, err
		}
		result.WarehouseIDs[warehouse.Code] = id
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	result.PrimaryUnitID = result.UnitIDs[dataset.Units[0].Code]
	for _, warehouse := range dataset.Warehouses {
		if warehouse.Type == "FINISHED_GOODS" {
			result.PrimaryWarehouseID = result.WarehouseIDs[warehouse.Code]
			break
		}
	}
	return result, nil
}

func SeedCoreDemoData(ctx context.Context, db *sql.DB, dataset CoreDemoSeedDataset) (*CoreDemoSeedResult, error) {
	if db == nil {
		return nil, ErrCoreDemoSeedMissingDB
	}
	if strings.TrimSpace(dataset.Prefix) == "" {
		dataset = DefaultCoreDemoSeedDataset(CoreDemoSeedPrefix)
	}
	if err := validateCoreDemoSeedDataset(dataset); err != nil {
		return nil, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer rollbackSQLTx(ctx, tx, nil)

	result := &CoreDemoSeedResult{
		Prefix:       dataset.Prefix,
		UnitIDs:      map[string]int{},
		MaterialIDs:  map[string]int{},
		ProductIDs:   map[string]int{},
		WarehouseIDs: map[string]int{},
		ProcessIDs:   map[string]int{},
		BOMHeaderIDs: map[string]int{},
	}

	for _, unit := range dataset.Units {
		id, err := upsertCoreDemoUnit(ctx, tx, unit)
		if err != nil {
			return nil, err
		}
		result.UnitIDs[unit.Code] = id
	}
	for _, material := range dataset.Materials {
		unitID := result.UnitIDs[material.DefaultUnitCode]
		id, err := upsertCoreDemoMaterial(ctx, tx, material, unitID)
		if err != nil {
			return nil, err
		}
		result.MaterialIDs[material.Code] = id
	}
	for _, product := range dataset.Products {
		unitID := result.UnitIDs[product.DefaultUnitCode]
		id, err := upsertCoreDemoProduct(ctx, tx, product, unitID)
		if err != nil {
			return nil, err
		}
		result.ProductIDs[product.Code] = id
	}
	for _, warehouse := range dataset.Warehouses {
		id, err := upsertCoreDemoWarehouse(ctx, tx, warehouse)
		if err != nil {
			return nil, err
		}
		result.WarehouseIDs[warehouse.Code] = id
	}
	for _, process := range dataset.Processes {
		id, err := upsertCoreDemoProcess(ctx, tx, process)
		if err != nil {
			return nil, err
		}
		result.ProcessIDs[process.Code] = id
	}
	for _, bom := range dataset.BOMs {
		productID := result.ProductIDs[bom.ProductCode]
		headerID, err := upsertCoreDemoBOMHeader(ctx, tx, bom, productID)
		if err != nil {
			return nil, err
		}
		result.BOMHeaderIDs[bom.ProductCode] = headerID
		for _, item := range bom.Items {
			materialID := result.MaterialIDs[item.MaterialCode]
			unitID := result.UnitIDs[item.UnitCode]
			if err := upsertCoreDemoBOMItem(ctx, tx, headerID, materialID, unitID, item); err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	if len(dataset.Units) > 0 {
		result.PrimaryUnitID = result.UnitIDs[dataset.Units[0].Code]
	}
	if len(dataset.Products) > 0 {
		result.PrimaryProductID = result.ProductIDs[dataset.Products[0].Code]
	}
	for _, warehouse := range dataset.Warehouses {
		if warehouse.Type == "FINISHED_GOODS" {
			result.PrimaryWarehouseID = result.WarehouseIDs[warehouse.Code]
			break
		}
	}
	if result.PrimaryWarehouseID == 0 && len(dataset.Warehouses) > 0 {
		result.PrimaryWarehouseID = result.WarehouseIDs[dataset.Warehouses[0].Code]
	}

	return result, nil
}

func validateCoreDemoSeedDataset(dataset CoreDemoSeedDataset) error {
	prefix := strings.TrimSpace(dataset.Prefix)
	if !strings.HasPrefix(prefix, "SIM-") {
		return ErrCoreDemoSeedUnsafePrefix
	}
	if len(dataset.Units) == 0 || len(dataset.Products) == 0 || len(dataset.Warehouses) == 0 {
		return fmt.Errorf("%w: units, products and warehouses are required", ErrCoreDemoSeedInvalidRecord)
	}
	unitCodes := map[string]struct{}{}
	materialCodes := map[string]struct{}{}
	productCodes := map[string]struct{}{}
	for _, unit := range dataset.Units {
		if !safeSeedCode(unit.Code, prefix) || strings.TrimSpace(unit.Name) == "" || unit.Precision < 0 {
			return fmt.Errorf("%w: unit %q", ErrCoreDemoSeedInvalidRecord, unit.Code)
		}
		if err := biz.ValidateNoNumberedImplementationStageLabels(unit.Code, unit.Name); err != nil {
			return fmt.Errorf("%w: unit %q naming: %v", ErrCoreDemoSeedInvalidRecord, unit.Code, err)
		}
		unitCodes[unit.Code] = struct{}{}
	}
	for _, material := range dataset.Materials {
		if !safeSeedCode(material.Code, prefix) || strings.TrimSpace(material.Name) == "" {
			return fmt.Errorf("%w: material %q", ErrCoreDemoSeedInvalidRecord, material.Code)
		}
		if _, ok := unitCodes[material.DefaultUnitCode]; !ok {
			return fmt.Errorf("%w: material %q references unknown unit %q", ErrCoreDemoSeedInvalidRecord, material.Code, material.DefaultUnitCode)
		}
		if err := biz.ValidateNoNumberedImplementationStageLabels(material.Code, material.Name, material.Category, material.Spec, material.Color); err != nil {
			return fmt.Errorf("%w: material %q naming: %v", ErrCoreDemoSeedInvalidRecord, material.Code, err)
		}
		materialCodes[material.Code] = struct{}{}
	}
	for _, product := range dataset.Products {
		if !safeSeedCode(product.Code, prefix) || strings.TrimSpace(product.Name) == "" {
			return fmt.Errorf("%w: product %q", ErrCoreDemoSeedInvalidRecord, product.Code)
		}
		if _, ok := unitCodes[product.DefaultUnitCode]; !ok {
			return fmt.Errorf("%w: product %q references unknown unit %q", ErrCoreDemoSeedInvalidRecord, product.Code, product.DefaultUnitCode)
		}
		if err := biz.ValidateNoNumberedImplementationStageLabels(product.Code, product.Name, product.StyleNo, product.CustomerStyleNo); err != nil {
			return fmt.Errorf("%w: product %q naming: %v", ErrCoreDemoSeedInvalidRecord, product.Code, err)
		}
		productCodes[product.Code] = struct{}{}
	}
	for _, warehouse := range dataset.Warehouses {
		if !safeSeedCode(warehouse.Code, prefix) || strings.TrimSpace(warehouse.Name) == "" || strings.TrimSpace(warehouse.Type) == "" {
			return fmt.Errorf("%w: warehouse %q", ErrCoreDemoSeedInvalidRecord, warehouse.Code)
		}
		if err := biz.ValidateNoNumberedImplementationStageLabels(warehouse.Code, warehouse.Name, warehouse.Type); err != nil {
			return fmt.Errorf("%w: warehouse %q naming: %v", ErrCoreDemoSeedInvalidRecord, warehouse.Code, err)
		}
	}
	for _, process := range dataset.Processes {
		if !safeSeedCode(process.Code, prefix) || strings.TrimSpace(process.Name) == "" || process.SortOrder < 0 {
			return fmt.Errorf("%w: process %q", ErrCoreDemoSeedInvalidRecord, process.Code)
		}
		if err := biz.ValidateNoNumberedImplementationStageLabels(process.Code, process.Name, process.Category, process.Note); err != nil {
			return fmt.Errorf("%w: process %q naming: %v", ErrCoreDemoSeedInvalidRecord, process.Code, err)
		}
	}
	for _, bom := range dataset.BOMs {
		if _, ok := productCodes[bom.ProductCode]; !ok {
			return fmt.Errorf("%w: bom references unknown product %q", ErrCoreDemoSeedInvalidRecord, bom.ProductCode)
		}
		if !safeSeedCode(bom.Version, prefix) || strings.TrimSpace(bom.Status) == "" {
			return fmt.Errorf("%w: bom version %q", ErrCoreDemoSeedInvalidRecord, bom.Version)
		}
		if err := biz.ValidateNoNumberedImplementationStageLabels(bom.ProductCode, bom.Version, bom.Note); err != nil {
			return fmt.Errorf("%w: bom %q naming: %v", ErrCoreDemoSeedInvalidRecord, bom.Version, err)
		}
		for _, item := range bom.Items {
			if _, ok := materialCodes[item.MaterialCode]; !ok {
				return fmt.Errorf("%w: bom item references unknown material %q", ErrCoreDemoSeedInvalidRecord, item.MaterialCode)
			}
			if _, ok := unitCodes[item.UnitCode]; !ok {
				return fmt.Errorf("%w: bom item references unknown unit %q", ErrCoreDemoSeedInvalidRecord, item.UnitCode)
			}
			if strings.TrimSpace(item.Quantity) == "" || strings.TrimSpace(item.LossRate) == "" {
				return fmt.Errorf("%w: bom item quantity and loss_rate are required", ErrCoreDemoSeedInvalidRecord)
			}
			if err := biz.ValidateNoNumberedImplementationStageLabels(item.MaterialCode, item.UnitCode, item.Position, item.Note); err != nil {
				return fmt.Errorf("%w: bom item naming: %v", ErrCoreDemoSeedInvalidRecord, err)
			}
		}
	}
	return nil
}

func validateCoreDemoReferenceSeedDataset(dataset CoreDemoReferenceSeedDataset) error {
	expected := DefaultCoreDemoReferenceSeedDataset()
	if strings.TrimSpace(dataset.Prefix) != expected.Prefix {
		return fmt.Errorf("%w: references-only prefix must be %q", ErrCoreDemoSeedInvalidRecord, expected.Prefix)
	}
	if len(dataset.Units) != len(expected.Units) || len(dataset.Warehouses) != len(expected.Warehouses) {
		return fmt.Errorf("%w: references-only requires exactly one unit and four warehouses", ErrCoreDemoSeedInvalidRecord)
	}

	expectedUnits := make(map[string]CoreDemoUnitSeed, len(expected.Units))
	for _, unit := range expected.Units {
		expectedUnits[unit.Code] = unit
	}
	seenUnits := make(map[string]struct{}, len(dataset.Units))
	for _, unit := range dataset.Units {
		want, ok := expectedUnits[unit.Code]
		if !ok || unit != want {
			return fmt.Errorf("%w: references-only unit %q is outside the exact allowlist", ErrCoreDemoSeedInvalidRecord, unit.Code)
		}
		if _, duplicate := seenUnits[unit.Code]; duplicate {
			return fmt.Errorf("%w: duplicate references-only unit %q", ErrCoreDemoSeedInvalidRecord, unit.Code)
		}
		seenUnits[unit.Code] = struct{}{}
	}

	expectedWarehouses := make(map[string]CoreDemoWarehouseSeed, len(expected.Warehouses))
	for _, warehouse := range expected.Warehouses {
		expectedWarehouses[warehouse.Code] = warehouse
	}
	seenWarehouses := make(map[string]struct{}, len(dataset.Warehouses))
	for _, warehouse := range dataset.Warehouses {
		want, ok := expectedWarehouses[warehouse.Code]
		if !ok || warehouse != want {
			return fmt.Errorf("%w: references-only warehouse %q is outside the exact allowlist", ErrCoreDemoSeedInvalidRecord, warehouse.Code)
		}
		if _, duplicate := seenWarehouses[warehouse.Code]; duplicate {
			return fmt.Errorf("%w: duplicate references-only warehouse %q", ErrCoreDemoSeedInvalidRecord, warehouse.Code)
		}
		seenWarehouses[warehouse.Code] = struct{}{}
	}
	return nil
}

func safeSeedCode(value, prefix string) bool {
	value = strings.TrimSpace(value)
	return value != "" && strings.HasPrefix(value, prefix)
}

func upsertCoreDemoUnit(ctx context.Context, tx *sql.Tx, unit CoreDemoUnitSeed) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO units (code, name, precision, is_active, created_at, updated_at)
VALUES ($1, $2, $3, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  precision = EXCLUDED.precision,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`, unit.Code, unit.Name, unit.Precision).Scan(&id)
	return id, err
}

func upsertCoreDemoMaterial(ctx context.Context, tx *sql.Tx, material CoreDemoMaterialSeed, unitID int) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO materials (code, name, category, spec, color, default_unit_id, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  spec = EXCLUDED.spec,
  color = EXCLUDED.color,
  default_unit_id = EXCLUDED.default_unit_id,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`,
		material.Code,
		material.Name,
		nullString(material.Category),
		nullString(material.Spec),
		nullString(material.Color),
		unitID,
	).Scan(&id)
	return id, err
}

func upsertCoreDemoProduct(ctx context.Context, tx *sql.Tx, product CoreDemoProductSeed, unitID int) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO products (code, name, style_no, customer_style_no, default_unit_id, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  style_no = EXCLUDED.style_no,
  customer_style_no = EXCLUDED.customer_style_no,
  default_unit_id = EXCLUDED.default_unit_id,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`,
		product.Code,
		product.Name,
		nullString(product.StyleNo),
		nullString(product.CustomerStyleNo),
		unitID,
	).Scan(&id)
	return id, err
}

func upsertCoreDemoWarehouse(ctx context.Context, tx *sql.Tx, warehouse CoreDemoWarehouseSeed) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO warehouses (code, name, type, is_active, created_at, updated_at)
VALUES ($1, $2, $3, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`, warehouse.Code, warehouse.Name, warehouse.Type).Scan(&id)
	return id, err
}

func upsertCoreDemoProcess(ctx context.Context, tx *sql.Tx, process CoreDemoProcessSeed) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO processes (code, name, category, outsourcing_enabled, inhouse_enabled, quality_required, sort_order, note, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  outsourcing_enabled = EXCLUDED.outsourcing_enabled,
  inhouse_enabled = EXCLUDED.inhouse_enabled,
  quality_required = EXCLUDED.quality_required,
  sort_order = EXCLUDED.sort_order,
  note = EXCLUDED.note,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id`,
		process.Code,
		process.Name,
		nullString(process.Category),
		process.OutsourcingEnabled,
		process.InhouseEnabled,
		process.QualityRequired,
		process.SortOrder,
		nullString(process.Note),
	).Scan(&id)
	return id, err
}

func upsertCoreDemoBOMHeader(ctx context.Context, tx *sql.Tx, bom CoreDemoBOMSeed, productID int) (int, error) {
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO bom_headers (product_id, version, status, note, created_at, updated_at)
VALUES ($1, $2, $3, $4, NOW(), NOW())
ON CONFLICT (product_id, version) DO UPDATE SET
  status = EXCLUDED.status,
  note = EXCLUDED.note,
  updated_at = NOW()
RETURNING id`, productID, bom.Version, bom.Status, nullString(bom.Note)).Scan(&id)
	return id, err
}

func upsertCoreDemoBOMItem(ctx context.Context, tx *sql.Tx, headerID int, materialID int, unitID int, item CoreDemoBOMItemSeed) error {
	var id int
	err := tx.QueryRowContext(ctx, `
SELECT id
FROM bom_items
WHERE bom_header_id = $1 AND material_id = $2
LIMIT 1`, headerID, materialID).Scan(&id)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == sql.ErrNoRows {
		_, err = tx.ExecContext(ctx, `
INSERT INTO bom_items (bom_header_id, material_id, quantity, unit_id, loss_rate, position, production_operation_code, note, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
			headerID,
			materialID,
			item.Quantity,
			unitID,
			item.LossRate,
			nullString(item.Position),
			nullString(item.ProductionOperationCode),
			nullString(item.Note),
		)
		return err
	}
	_, err = tx.ExecContext(ctx, `
UPDATE bom_items
SET quantity = $3,
  unit_id = $4,
	  loss_rate = $5,
	  position = $6,
	  production_operation_code = $7,
	  note = $8,
  updated_at = NOW()
WHERE id = $1 AND material_id = $2`,
		id,
		materialID,
		item.Quantity,
		unitID,
		item.LossRate,
		nullString(item.Position),
		nullString(item.ProductionOperationCode),
		nullString(item.Note),
	)
	return err
}

func nullString(value string) sql.NullString {
	value = strings.TrimSpace(value)
	return sql.NullString{String: value, Valid: value != ""}
}
