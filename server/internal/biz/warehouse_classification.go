package biz

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

const (
	MaterialStockMain          = "MAIN"
	MaterialStockAuxiliary     = "AUXILIARY"
	MaterialStockPackaging     = "PACKAGING"
	MaterialStockOther         = "OTHER"
	MaterialStockUnclassified  = "UNCLASSIFIED"
	WarehouseMainMaterial      = "MAIN_MATERIAL"
	WarehouseAuxiliaryMaterial = "AUXILIARY_MATERIAL"
	WarehousePackagingMaterial = "PACKAGING_MATERIAL"
	WarehouseOtherMaterial     = "OTHER_MATERIAL"
	WarehouseMaterial          = "MATERIAL"
	WarehouseFinishedGoods     = "FINISHED_GOODS"
	WarehouseUnclassified      = "UNCLASSIFIED"
)

var (
	ErrStockCategoryRequired        = errors.New("stock category required")
	ErrWarehouseCategoryMismatch    = errors.New("warehouse category mismatch")
	ErrWarehouseClassificationInUse = errors.New("warehouse classification conflicts with stock or defaults")
	ErrWarehouseCodeConflict        = errors.New("warehouse code already exists")
)

func ValidMaterialStockCategory(category string) bool {
	switch category {
	case MaterialStockMain, MaterialStockAuxiliary, MaterialStockPackaging, MaterialStockOther, MaterialStockUnclassified:
		return true
	}
	return false
}

func ValidWarehouseType(value string) bool {
	switch value {
	case WarehouseMainMaterial, WarehouseAuxiliaryMaterial, WarehousePackagingMaterial, WarehouseOtherMaterial, WarehouseMaterial, WarehouseFinishedGoods, WarehouseUnclassified:
		return true
	}
	return false
}

func ValidateWarehouseCategory(warehouseType, subjectType, materialCategory string) error {
	if warehouseType == WarehouseUnclassified || (subjectType == InventorySubjectMaterial && materialCategory == MaterialStockUnclassified) {
		return ErrStockCategoryRequired
	}
	if subjectType == InventorySubjectProduct && warehouseType == WarehouseFinishedGoods {
		return nil
	}
	if subjectType == InventorySubjectMaterial && ValidMaterialStockCategory(materialCategory) {
		if warehouseType == WarehouseMaterial {
			return nil
		}
		matched := map[string]string{MaterialStockMain: WarehouseMainMaterial, MaterialStockAuxiliary: WarehouseAuxiliaryMaterial, MaterialStockPackaging: WarehousePackagingMaterial, MaterialStockOther: WarehouseOtherMaterial}
		if matched[materialCategory] == warehouseType {
			return nil
		}
	}
	return ErrWarehouseCategoryMismatch
}

type WarehouseMutation struct {
	Code     string
	Name     string
	Type     string
	IsActive bool
}

type WarehouseManagementRepo interface {
	SaveWarehouse(context.Context, int, *WarehouseMutation, WarehouseDataScope) (*Warehouse, error)
}

func (uc *MasterDataUsecase) SaveWarehouseForAccess(ctx context.Context, id int, in *WarehouseMutation, scope WarehouseDataScope) (*Warehouse, error) {
	if uc == nil || uc.repo == nil || in == nil || id < 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(WarehouseManagementRepo)
	if !ok {
		return nil, ErrDataScopeForbidden
	}
	scope = NormalizeWarehouseDataScope(scope)
	// Creating a warehouse changes the global warehouse catalog.
	if id == 0 && scope.Mode != DataScopeModeAll {
		return nil, ErrDataScopeForbidden
	}
	if id > 0 && !scope.Allows(id) {
		return nil, ErrDataScopeForbidden
	}
	normalized := *in
	normalized.Code, normalized.Name, normalized.Type = strings.TrimSpace(in.Code), strings.TrimSpace(in.Name), strings.TrimSpace(in.Type)
	if normalized.Code == "" || utf8.RuneCountInString(normalized.Code) > 64 || normalized.Name == "" || utf8.RuneCountInString(normalized.Name) > 128 || !ValidWarehouseType(normalized.Type) {
		return nil, ErrBadParam
	}
	return repo.SaveWarehouse(ctx, id, &normalized, scope)
}
