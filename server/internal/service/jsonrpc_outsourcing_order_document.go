package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleOutsourcingOrderDocument(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "save_outsourcing_order_with_items", "saveOutsourcingOrderWithItems":
		orderID := getInt(pm, "id", 0)
		permission := biz.PermissionOutsourcingOrderCreate
		if orderID > 0 {
			permission = biz.PermissionOutsourcingOrderUpdate
		}
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		in, ok := outsourcingOrderMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, ok := outsourcingOrderItemSaveMutationsFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		result, err := d.outsourcingOrderUC.SaveOutsourcingOrderWithItems(ctx, orderID, in, items)
		return id, outsourcingOrderWithItemsMutationResult(ctx, d, result, err), nil
	case "get_outsourcing_order", "getOutsourcingOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderRead); res != nil {
			return id, res, nil
		}
		item, err := d.outsourcingOrderUC.GetOutsourcingOrder(ctx, getInt(pm, "id", 0))
		return id, outsourcingOrderMutationResult(ctx, d, item, err), nil
	case "list_outsourcing_orders", "listOutsourcingOrders":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderRead); res != nil {
			return id, res, nil
		}
		dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
		if !ok {
			return id, invalidParamResult(), nil
		}
		dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.outsourcingOrderUC.ListOutsourcingOrders(ctx, biz.OutsourcingOrderFilter{
			Keyword:         getString(pm, "keyword"),
			SupplierID:      getInt(pm, "supplier_id", 0),
			LifecycleStatus: getString(pm, "lifecycle_status"),
			DateField:       getString(pm, "date_field"),
			DateFrom:        dateFrom,
			DateTo:          dateTo,
			SortBy:          getString(pm, "sort_by"),
			SortDirection:   getString(pm, "sort_direction"),
			Limit:           getInt(pm, "limit", 50),
			Offset:          getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapOutsourcingOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"outsourcing_orders": outsourcingOrdersToAny(items),
			"total":              total,
			"limit":              normalizedLimit(pm),
			"offset":             normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownOutsourcingOrderResult(method), nil
	}
}
