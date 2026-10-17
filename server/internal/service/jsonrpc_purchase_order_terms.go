package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handlePurchaseOrderTerms(ctx context.Context, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionFieldProcurementCommercialRead); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders"); res != nil {
		return id, res, nil
	}
	if !sourceOrderAllowsOnly(pm, "customer_key", "id", "expected_version", "idempotency_key", "expected_arrival_date", "supplier_confirmed_arrival_date", "items") {
		return id, invalidParamResult(), nil
	}
	if _, ok := pm["expected_arrival_date"]; !ok {
		return id, invalidParamResult(), nil
	}
	if _, ok := pm["supplier_confirmed_arrival_date"]; !ok {
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
	expected, ok := getOptionalJSONRPCTime(pm, "expected_arrival_date")
	if !ok {
		return id, invalidParamResult(), nil
	}
	confirmed, ok := getOptionalJSONRPCTime(pm, "supplier_confirmed_arrival_date")
	if !ok {
		return id, invalidParamResult(), nil
	}
	rawItems, ok := pm["items"].([]any)
	if !ok {
		return id, invalidParamResult(), nil
	}
	in := &biz.PurchaseOrderTermsCompletion{ID: orderID, ExpectedVersion: version, ActorID: actorID, IdempotencyKey: getString(pm, "idempotency_key"), ExpectedArrivalDate: expected, SupplierConfirmedArrivalDate: confirmed}
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok || !sourceOrderAllowsOnly(item, "id", "unit_price", "expected_arrival_date") {
			return id, invalidParamResult(), nil
		}
		if _, ok := item["expected_arrival_date"]; !ok {
			return id, invalidParamResult(), nil
		}
		itemID, ok := getRequiredJSONRPCPositiveInt(item, "id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		price, ok := getOptionalJSONRPCDecimalString(item, "unit_price")
		if !ok || price == nil {
			return id, invalidParamResult(), nil
		}
		date, ok := getOptionalJSONRPCTime(item, "expected_arrival_date")
		if !ok {
			return id, invalidParamResult(), nil
		}
		in.Items = append(in.Items, biz.PurchaseOrderTermsItem{ID: itemID, UnitPrice: price, ExpectedArrivalDate: date})
	}
	order, err := d.purchaseOrderUC.CompletePurchaseOrderTerms(ctx, in)
	return id, purchaseOrderMutationResult(ctx, d, order, err), nil
}
