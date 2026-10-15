package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleOutsourcingOrderItem(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_outsourcing_order_items":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.outsourcingOrderUC.ListOutsourcingOrderItems(ctx, biz.OutsourcingOrderItemFilter{
			OutsourcingOrderID: getInt(pm, "outsourcing_order_id", 0),
			LineStatus:         getString(pm, "line_status"),
			Limit:              getInt(pm, "limit", 50),
			Offset:             getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapOutsourcingOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"outsourcing_order_items": outsourcingOrderItemsToAny(items),
			"total":                   total,
			"limit":                   normalizedLimit(pm),
			"offset":                  normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownOutsourcingOrderResult(method), nil
	}
}
