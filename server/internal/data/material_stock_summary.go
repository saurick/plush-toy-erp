package data

import (
	"context"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorybalance"
)

func (r *inventoryRepo) SummarizeMaterialStockForAccess(ctx context.Context, ids []int, scope biz.WarehouseDataScope) ([]biz.MaterialStockSummary, error) {
	scope = biz.NormalizeWarehouseDataScope(scope)
	query := r.data.postgres.InventoryBalance.Query().Where(
		inventorybalance.SubjectType(biz.InventorySubjectMaterial),
		inventorybalance.SubjectIDIn(ids...),
	)
	switch scope.Mode {
	case biz.DataScopeModeAssigned:
		query.Where(inventorybalance.WarehouseIDIn(scope.WarehouseIDs...))
	case biz.DataScopeModeAll:
	default:
		return nil, biz.ErrDataScopeForbidden
	}
	var rows []struct {
		SubjectID int    `json:"subject_id"`
		UnitID    int    `json:"unit_id"`
		Quantity  string `json:"quantity"`
	}
	err := query.GroupBy(inventorybalance.FieldSubjectID, inventorybalance.FieldUnitID).
		Aggregate(ent.As(ent.Sum(inventorybalance.FieldQuantity), "quantity")).Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}
	result := make([]biz.MaterialStockSummary, 0, len(rows))
	for _, row := range rows {
		quantity, err := decimal.NewFromString(row.Quantity)
		if err != nil {
			return nil, err
		}
		result = append(result, biz.MaterialStockSummary{MaterialID: row.SubjectID, UnitID: row.UnitID, Quantity: quantity})
	}
	return result, nil
}
