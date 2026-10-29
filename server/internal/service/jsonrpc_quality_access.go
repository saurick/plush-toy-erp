package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) requireQualityInspectionSourceRead(ctx context.Context, item *biz.QualityInspection) *v1.JsonrpcResult {
	if item == nil || item.SourceType == nil {
		return invalidParamResult()
	}
	condition := ""
	switch *item.SourceType {
	case biz.QualityInspectionSourcePurchaseReceipt:
		condition = biz.SourceReadConditionQualityPurchase
	case biz.QualityInspectionSourceOutsourcingFact:
		condition = biz.SourceReadConditionQualityOutsourcing
	case biz.QualityInspectionSourceShipment:
		condition = biz.SourceReadConditionQualityShipment
	case biz.QualityInspectionSourceProductionWIP:
		condition = biz.SourceReadConditionQualityWIP
	default:
		return invalidParamResult()
	}
	return d.requireSourceActionReadPermissions(ctx, "quality", "get_quality_inspection", condition)
}

func (d *jsonrpcDispatcher) requireQualityInspectionMutationRead(ctx context.Context, inspectionID int) *v1.JsonrpcResult {
	if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
		return res
	}
	item, err := d.inventoryUC.GetQualityInspection(ctx, inspectionID)
	if err != nil {
		return d.mapQualityError(ctx, err)
	}
	return d.requireQualityInspectionSourceRead(ctx, item)
}
