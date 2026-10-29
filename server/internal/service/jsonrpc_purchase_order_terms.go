package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) requirePurchaseOrderScheduleWrite(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
		return res
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
		return res
	}
	return d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders")
}

func (d *jsonrpcDispatcher) handlePurchaseOrderDelivery(ctx context.Context, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	if res := d.requirePurchaseOrderScheduleWrite(ctx, pm); res != nil {
		return id, res, nil
	}
	in, valid := parsePurchaseOrderSchedule(pm, actorID)
	if !valid {
		return id, invalidParamResult(), nil
	}
	for _, raw := range pm["items"].([]any) {
		if !sourceOrderAllowsOnly(raw.(map[string]any), "id", "expected_arrival_date") {
			return id, invalidParamResult(), nil
		}
	}
	in.DeliveryOnly = true
	order, err := d.purchaseOrderUC.CompletePurchaseOrderTerms(ctx, in)
	return id, purchaseOrderMutationResult(ctx, d, order, err), nil
}

func (d *jsonrpcDispatcher) handlePurchaseOrderTerms(ctx context.Context, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	if res := d.requirePurchaseOrderScheduleWrite(ctx, pm); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionFieldProcurementCommercialRead); res != nil {
		return id, res, nil
	}
	in, valid := parsePurchaseOrderSchedule(pm, actorID)
	if !valid {
		return id, invalidParamResult(), nil
	}
	rawItems, ok := pm["items"].([]any)
	if !ok {
		return id, invalidParamResult(), nil
	}
	for index, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if !sourceOrderAllowsOnly(item, "id", "unit_price", "expected_arrival_date") {
			return id, invalidParamResult(), nil
		}
		price, ok := getOptionalJSONRPCDecimalString(item, "unit_price")
		if !ok || price == nil {
			return id, invalidParamResult(), nil
		}
		in.Items[index].UnitPrice = price
	}
	order, err := d.purchaseOrderUC.CompletePurchaseOrderTerms(ctx, in)
	return id, purchaseOrderMutationResult(ctx, d, order, err), nil
}

// Date parsing is shared; each public command admits only its own mutable fields.
func parsePurchaseOrderSchedule(pm map[string]any, actorID int) (*biz.PurchaseOrderTermsCompletion, bool) {
	if !sourceOrderAllowsOnly(pm, "customer_key", "id", "expected_version", "idempotency_key", "expected_arrival_date", "supplier_confirmed_arrival_date", "items") {
		return nil, false
	}
	if _, ok := pm["expected_arrival_date"]; !ok {
		return nil, false
	}
	if _, ok := pm["supplier_confirmed_arrival_date"]; !ok {
		return nil, false
	}
	orderID, ok := getRequiredJSONRPCPositiveInt(pm, "id")
	if !ok {
		return nil, false
	}
	version, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	if !ok {
		return nil, false
	}
	expected, ok := getOptionalJSONRPCTime(pm, "expected_arrival_date")
	if !ok {
		return nil, false
	}
	confirmed, ok := getOptionalJSONRPCTime(pm, "supplier_confirmed_arrival_date")
	if !ok {
		return nil, false
	}
	rawItems, ok := pm["items"].([]any)
	if !ok {
		return nil, false
	}
	in := &biz.PurchaseOrderTermsCompletion{ID: orderID, ExpectedVersion: version, ActorID: actorID, IdempotencyKey: getString(pm, "idempotency_key"), ExpectedArrivalDate: expected, SupplierConfirmedArrivalDate: confirmed}
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			return nil, false
		}
		if _, ok := item["expected_arrival_date"]; !ok {
			return nil, false
		}
		itemID, ok := getRequiredJSONRPCPositiveInt(item, "id")
		if !ok {
			return nil, false
		}
		date, ok := getOptionalJSONRPCTime(item, "expected_arrival_date")
		if !ok {
			return nil, false
		}
		in.Items = append(in.Items, biz.PurchaseOrderTermsItem{ID: itemID, ExpectedArrivalDate: date})
	}
	return in, true
}
