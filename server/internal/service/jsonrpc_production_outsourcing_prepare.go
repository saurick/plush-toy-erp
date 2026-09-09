package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"time"
)

func (d *jsonrpcDispatcher) prepareProductionOutsourcing(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return res
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionProductionWIPAssign); res != nil {
		return res
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderRead); res != nil {
		return res
	}
	if res := d.requireSourceActionReadPermissions(ctx, "production_wip", "prepare_production_outsourcing_order"); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", productionOrderModuleKey, "outsourcing_orders"); res != nil {
		return res
	}
	if !productionOrderAllowsOnly(pm, "production_wip_batch_id", "expected_version", "supplier_id", "requirement_ids", "expected_return_date") {
		return invalidParamResult()
	}
	batch, ok := getRequiredJSONRPCPositiveInt(pm, "production_wip_batch_id")
	if !ok {
		return invalidParamResult()
	}
	version, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	if !ok {
		return invalidParamResult()
	}
	vendor, ok := getRequiredJSONRPCPositiveInt(pm, "supplier_id")
	if !ok {
		return invalidParamResult()
	}
	returnDate, err := time.Parse("2006-01-02", getString(pm, "expected_return_date"))
	if err != nil {
		return invalidParamResult()
	}
	in := &biz.ProductionOutsourcingPrepare{BatchID: batch, ExpectedVersion: version, SupplierID: vendor, ExpectedReturnDate: returnDate, ActorID: claims.UserID}
	if raw, exists := pm["requirement_ids"]; exists {
		values, ok := raw.([]any)
		if !ok {
			return invalidParamResult()
		}
		for _, value := range values {
			id, ok := getRequiredJSONRPCPositiveInt(map[string]any{"id": value}, "id")
			if !ok {
				return invalidParamResult()
			}
			in.RequirementIDs = append(in.RequirementIDs, id)
		}
	}
	result, err := d.productionOrderUC.PrepareProductionOutsourcing(ctx, in)
	if err != nil {
		return d.productionWIPAggregateResult(ctx, nil, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"outsourcing_order_id": result.OutsourcingOrderID, "outsourcing_order_no": result.OutsourcingOrderNo})}
}
