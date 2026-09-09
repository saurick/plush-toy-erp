package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleSalesOrderEngineering(ctx context.Context, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderEngineeringUpdate); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders"); res != nil {
		return id, res, nil
	}
	if !sourceOrderAllowsOnly(pm, "customer_key", "id", "expected_version", "items") {
		return id, invalidParamResult(), nil
	}
	orderID, ok := getRequiredJSONRPCPositiveInt(pm, "id")
	if !ok {
		return id, invalidParamResult(), nil
	}
	version, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	if !ok {
		return id, invalidParamResult(), nil
	}
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return id, invalidParamResult(), nil
	}
	in := &biz.SalesOrderEngineeringMutation{SalesOrderID: orderID, ExpectedVersion: version, ActorID: actorID}
	for _, raw := range rawItems {
		fields, ok := raw.(map[string]any)
		if !ok || !sourceOrderAllowsOnly(fields, "id", "product_id", "product_sku_id", "sample_bom_id", "expected_bom_version", "reuse_confirmed_sample", "engineering_status", "sample_note") {
			return id, invalidParamResult(), nil
		}
		itemID, ok := getRequiredJSONRPCPositiveInt(fields, "id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		productID, ok := getOptionalJSONRPCNonNegativeInt(fields, "product_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		skuID, ok := getOptionalJSONRPCNonNegativeInt(fields, "product_sku_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		bomID, ok := getOptionalJSONRPCNonNegativeInt(fields, "sample_bom_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		item := biz.SalesOrderEngineeringItemMutation{ID: itemID, ProductSkuID: skuID, SampleBOMID: bomID, EngineeringStatus: getString(fields, "engineering_status"), SampleNote: getWorkflowStringPtr(fields, "sample_note")}
		if raw, exists := fields["reuse_confirmed_sample"]; exists {
			value, valid := raw.(bool)
			if !valid {
				return id, invalidParamResult(), nil
			}
			item.ReuseConfirmedSample = value
		}
		if bomID != nil {
			version, valid := getRequiredJSONRPCPositiveInt(fields, "expected_bom_version")
			if !valid {
				return id, invalidParamResult(), nil
			}
			item.ExpectedBOMVersion = int64(version)
		}
		if productID != nil {
			item.ProductID = *productID
		}
		in.Items = append(in.Items, item)
	}
	result, err := d.salesOrderUC.SaveSalesOrderEngineering(ctx, in)
	if err != nil {
		return id, d.mapSalesOrderError(ctx, err), nil
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_order_id": result.Order.ID, "version": result.Order.Version})}, nil
}
