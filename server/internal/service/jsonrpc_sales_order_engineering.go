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
	if !sourceOrderAllowsOnly(pm, "customer_key", "id", "expected_version", "items", "complete") {
		return id, invalidParamResult(), nil
	}
	complete := false
	if raw, exists := pm["complete"]; exists {
		value, valid := raw.(bool)
		if !valid {
			return id, invalidParamResult(), nil
		}
		complete = value
	}
	if complete {
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMActivate); res != nil {
			return id, res, nil
		}
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
	in := &biz.SalesOrderEngineeringMutation{SalesOrderID: orderID, ExpectedVersion: version, ActorID: actorID, Complete: complete}
	for _, raw := range rawItems {
		fields, ok := raw.(map[string]any)
		if !ok || !sourceOrderAllowsOnly(fields, "id", "product_id", "product_sku_id", "bom_id", "expected_bom_version") {
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
		bomID, ok := getOptionalJSONRPCNonNegativeInt(fields, "bom_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		item := biz.SalesOrderEngineeringItemMutation{ID: itemID, ProductSkuID: skuID, BOMID: bomID}
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
