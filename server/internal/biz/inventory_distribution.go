package biz

import "context"

type InventoryDistributionRow struct {
	WarehouseID            int    `json:"warehouse_id"`
	WarehouseName          string `json:"warehouse_name"`
	WarehouseCode          string `json:"warehouse_code"`
	RecordCount            int    `json:"record_count"`
	StockCount             int    `json:"stock_count"`
	AvailableRecordCount   int    `json:"available_record_count"`
	UnavailableRecordCount int    `json:"unavailable_record_count"`
}

type InventoryDistributionRepo interface {
	GetInventoryDistributionForAccess(context.Context, InventoryBalanceFilter, WarehouseDataScope) ([]InventoryDistributionRow, error)
}

func (uc *InventoryUsecase) GetInventoryDistributionForAccess(ctx context.Context, filter InventoryBalanceFilter, scope WarehouseDataScope) ([]InventoryDistributionRow, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	filter, err := normalizeInventoryBalanceFilter(filter)
	if err != nil {
		return nil, err
	}
	scope = NormalizeWarehouseDataScope(scope)
	if err := ValidateWarehouseDataScopeAccess(scope, filter.WarehouseID); err != nil {
		return nil, err
	}
	repo, ok := uc.repo.(InventoryDistributionRepo)
	if !ok {
		return nil, ErrDataScopeForbidden
	}
	return repo.GetInventoryDistributionForAccess(ctx, filter, scope)
}
