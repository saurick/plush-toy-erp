package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/qualityinspection"
)

// In-process WIP inspections have no warehouse or stock ownership. Their
// source-read permission is enforced separately; warehouse-bound inspections
// always use the authoritative warehouse, never the caller's list filter.
func validateQualityWarehouseAccess(ctx context.Context, sourceType string, warehouseID int) error {
	if sourceType == biz.QualityInspectionSourceProductionWIP && warehouseID == 0 {
		return nil
	}
	return biz.ValidateContextWarehouseAccess(ctx, []int{warehouseID})
}

func validateQualityInspectionAccess(ctx context.Context, row *ent.QualityInspection) error {
	if row == nil {
		return biz.ErrQualityInspectionNotFound
	}
	return validateQualityWarehouseAccess(ctx, optionalStringValueOrEmpty(row.SourceType), optionalIntValueOrZero(row.WarehouseID))
}

func qualityWarehousePredicate(ctx context.Context) []predicate.QualityInspection {
	scope, scoped := biz.WarehouseDataScopeFromContext(ctx)
	if !scoped || scope.IsAll() {
		return nil
	}
	warehouses := []int{}
	if scope.Mode == biz.DataScopeModeAssigned {
		warehouses = scope.WarehouseIDs
	}
	return []predicate.QualityInspection{qualityinspection.Or(
		qualityinspection.And(qualityinspection.SourceType(biz.QualityInspectionSourceProductionWIP), qualityinspection.WarehouseIDIsNil()),
		qualityinspection.WarehouseIDIn(warehouses...),
	)}
}
