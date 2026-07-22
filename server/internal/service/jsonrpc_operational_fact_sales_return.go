package service

import (
	"context"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOperationalFactSalesReturn(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := map[string]string{"create_sales_return": biz.PermissionSalesReturnCreate, "approve_sales_return": biz.PermissionSalesReturnApprove, "receive_sales_return": biz.PermissionSalesReturnReceive, "cancel_sales_return": biz.PermissionSalesReturnCancel, "get_sales_return": biz.PermissionSalesReturnRead, "list_sales_returns": biz.PermissionSalesReturnRead}[method]
	if permission == "" {
		return id, unknownOperationalFactResult(method), nil
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if method != "get_sales_return" && method != "list_sales_returns" {
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments"); res != nil {
			return id, res, nil
		}
	} else if res := d.requireCustomerConfigModulesReadable(ctx, "shipments"); res != nil {
		return id, res, nil
	}
	switch method {
	case "create_sales_return":
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if !financeFactAllowsOnly(pm, "customer_key", "return_no", "shipment_id", "reason", "idempotency_key", "items") {
			return id, invalidParamResult(), nil
		}
		raw, ok := pm["items"].([]any)
		if !ok || len(raw) == 0 {
			return id, invalidParamResult(), nil
		}
		items := make([]biz.SalesReturnItemCreate, 0, len(raw))
		for _, value := range raw {
			item, ok := value.(map[string]any)
			if !ok || !financeFactAllowsOnly(item, "shipment_item_id", "quantity", "note") {
				return id, invalidParamResult(), nil
			}
			quantity, ok := getRequiredJSONRPCNumeric20Scale6(item, "quantity")
			if !ok {
				return id, invalidParamResult(), nil
			}
			items = append(items, biz.SalesReturnItemCreate{ShipmentItemID: getInt(item, "shipment_item_id", 0), Quantity: quantity, Note: getWorkflowStringPtr(item, "note")})
		}
		out, err := d.operationalFactUC.CreateSalesReturn(ctx, &biz.SalesReturnCreate{ReturnNo: getString(pm, "return_no"), ShipmentID: getInt(pm, "shipment_id", 0), Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key"), Items: items}, actorID)
		return id, salesReturnResult(d, ctx, out, err), nil
	case "approve_sales_return", "receive_sales_return", "cancel_sales_return":
		if !financeFactAllowsOnly(pm, "customer_key", "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		in := &biz.SalesReturnTransition{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), Reason: getString(pm, "reason")}
		var out *biz.SalesReturn
		var err error
		switch method {
		case "approve_sales_return":
			out, err = d.operationalFactUC.ApproveSalesReturn(ctx, in, actorID)
		case "receive_sales_return":
			out, err = d.operationalFactUC.ReceiveSalesReturn(ctx, in, actorID)
		default:
			out, err = d.operationalFactUC.CancelSalesReturn(ctx, in, actorID)
		}
		return id, salesReturnResult(d, ctx, out, err), nil
	case "get_sales_return":
		if !financeFactAllowsOnly(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		out, err := d.operationalFactUC.GetSalesReturn(ctx, getInt(pm, "id", 0))
		return id, salesReturnResult(d, ctx, out, err), nil
	case "list_sales_returns":
		if !financeFactAllowsOnly(pm, "customer_key", "status", "shipment_id", "customer_id", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListSalesReturns(ctx, biz.SalesReturnFilter{Status: strings.ToUpper(getString(pm, "status")), ShipmentID: getInt(pm, "shipment_id", 0), CustomerID: getInt(pm, "customer_id", 0), Limit: normalizedLimit(pm), Offset: normalizedOffset(pm)})
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		values := make([]any, 0, len(items))
		for _, item := range items {
			values = append(values, salesReturnToMap(item))
		}
		return id, okData(map[string]any{"sales_returns": values, "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	}
	return id, unknownOperationalFactResult(method), nil
}
func salesReturnResult(d *jsonrpcDispatcher, ctx context.Context, item *biz.SalesReturn, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"sales_return": salesReturnToMap(item)})
}
func salesReturnToMap(item *biz.SalesReturn) map[string]any {
	if item == nil {
		return nil
	}
	items := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		items = append(items, map[string]any{"id": line.ID, "line_no": line.LineNo, "shipment_item_id": line.ShipmentItemID, "product_id": line.ProductID, "product_sku_id": optionalIntValue(line.ProductSkuID), "warehouse_id": line.WarehouseID, "unit_id": line.UnitID, "lot_id": optionalIntValue(line.LotID), "quality_inspection_id": line.QualityInspectionID, "quantity": line.Quantity.String(), "condition": line.Condition, "note": optionalStringValue(line.Note)})
	}
	return map[string]any{"id": item.ID, "return_no": item.ReturnNo, "shipment_id": item.ShipmentID, "customer_id": item.CustomerID, "customer_name": item.CustomerNameSnapshot, "status": item.Status, "reason": item.Reason, "version": item.Version, "approved_at": optionalTimeUnix(item.ApprovedAt), "received_at": optionalTimeUnix(item.ReceivedAt), "cancelled_at": optionalTimeUnix(item.CancelledAt), "cancel_reason": optionalStringValue(item.CancelReason), "items": items}
}
