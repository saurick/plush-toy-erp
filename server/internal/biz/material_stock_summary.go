package biz

import (
	"context"
	"github.com/shopspring/decimal"
)

// MaterialStockSummary is a current warehouse balance reference, not an
// approval snapshot or a reservation available for automatic deduction.
type MaterialStockSummary struct {
	MaterialID int             `json:"material_id"`
	UnitID     int             `json:"unit_id"`
	Quantity   decimal.Decimal `json:"quantity"`
}

func (uc *InventoryUsecase) SummarizeMaterialStockForAccess(ctx context.Context, ids []int, scope WarehouseDataScope) ([]MaterialStockSummary, error) {
	if uc == nil || len(ids) == 0 || len(ids) > 2000 {
		return nil, ErrBadParam
	}
	for _, id := range ids {
		if id <= 0 {
			return nil, ErrBadParam
		}
	}
	scope = NormalizeWarehouseDataScope(scope)
	if scope.Mode == DataScopeModeNone {
		return nil, ErrDataScopeForbidden
	}
	repo, ok := uc.repo.(interface {
		SummarizeMaterialStockForAccess(context.Context, []int, WarehouseDataScope) ([]MaterialStockSummary, error)
	})
	if !ok {
		return nil, ErrDataScopeForbidden
	}
	return repo.SummarizeMaterialStockForAccess(ctx, normalizePositiveIDs(ids), scope)
}
