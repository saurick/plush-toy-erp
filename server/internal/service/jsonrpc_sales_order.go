package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleSalesOrder(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.salesOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_sales_order", "createSalesOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderCreate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.CreateSalesOrder(ctx, in)
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "update_sales_order", "updateSalesOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderUpdate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.UpdateSalesOrder(ctx, getInt(pm, "id", 0), in)
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "save_sales_order_with_items", "saveSalesOrderWithItems":
		orderID := getInt(pm, "id", 0)
		orderPermission := biz.PermissionSalesOrderCreate
		if orderID > 0 {
			orderPermission = biz.PermissionSalesOrderUpdate
		}
		if res := d.RequireAdminPermission(ctx, orderPermission); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		items, ok := salesOrderItemSaveMutationsFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := d.requireSalesOrderWithItemsPermissions(ctx, orderID, items); res != nil {
			return id, res, nil
		}
		result, err := d.salesOrderUC.SaveSalesOrderWithItems(ctx, orderID, in, items)
		return id, salesOrderWithItemsMutationResult(ctx, d, result, err), nil
	case "get_sales_order", "getSalesOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		item, err := d.salesOrderUC.GetSalesOrder(ctx, getInt(pm, "id", 0))
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "list_sales_orders", "listSalesOrders":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		items, total, err := d.salesOrderUC.ListSalesOrders(ctx, biz.SalesOrderFilter{
			Keyword:         getString(pm, "keyword"),
			CustomerID:      getInt(pm, "customer_id", 0),
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
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"sales_orders": salesOrdersToAny(items),
			"total":        total,
			"limit":        normalizedLimit(pm),
			"offset":       normalizedOffset(pm),
		})}, nil
	case "submit_sales_order", "submitSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderSubmit, d.salesOrderUC.SubmitSalesOrder)
	case "activate_sales_order", "activateSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderActivate, d.salesOrderUC.ActivateSalesOrder)
	case "close_sales_order", "closeSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderClose, d.salesOrderUC.CloseSalesOrder)
	case "cancel_sales_order", "cancelSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderCancel, d.salesOrderUC.CancelSalesOrder)
	case "add_sales_order_item", "addSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCreate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderItemMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.AddSalesOrderItem(ctx, in)
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "update_sales_order_item", "updateSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemUpdate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderItemMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.UpdateSalesOrderItem(ctx, getInt(pm, "id", 0), in)
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "remove_sales_order_item", "removeSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCancel); res != nil {
			return id, res, nil
		}
		item, err := d.salesOrderUC.RemoveSalesOrderItem(ctx, getInt(pm, "id", 0))
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "list_sales_order_items", "listSalesOrderItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.salesOrderUC.ListSalesOrderItems(ctx, biz.SalesOrderItemFilter{
			SalesOrderID: getInt(pm, "sales_order_id", 0),
			LineStatus:   getString(pm, "line_status"),
			Limit:        getInt(pm, "limit", 50),
			Offset:       getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"sales_order_items": salesOrderItemsToAny(items),
			"total":             total,
			"limit":             normalizedLimit(pm),
			"offset":            normalizedOffset(pm),
		})}, nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 sales_order 接口 method=%s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) handleSalesOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	permission string,
	action func(context.Context, int) (*biz.SalesOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	item, err := action(ctx, getInt(pm, "id", 0))
	return id, salesOrderMutationResult(ctx, d, item, err), nil
}

func (d *jsonrpcDispatcher) requireSalesOrderWithItemsPermissions(ctx context.Context, orderID int, items []*biz.SalesOrderItemSaveMutation) *v1.JsonrpcResult {
	needsItemCreate := false
	needsItemUpdate := false
	for _, item := range items {
		if item == nil {
			continue
		}
		if item.ID > 0 {
			needsItemUpdate = true
		} else {
			needsItemCreate = true
		}
	}
	if needsItemCreate {
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCreate); res != nil {
			return res
		}
	}
	if needsItemUpdate {
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemUpdate); res != nil {
			return res
		}
	}
	if orderID > 0 {
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCancel); res != nil {
			return res
		}
	}
	return nil
}

func salesOrderMutationFromParams(pm map[string]any) (*biz.SalesOrderMutation, bool) {
	orderDate, ok := getRequiredJSONRPCTime(pm, "order_date")
	if !ok {
		return nil, false
	}
	plannedDeliveryDate, ok := getOptionalJSONRPCTime(pm, "planned_delivery_date")
	if !ok {
		return nil, false
	}
	return &biz.SalesOrderMutation{
		OrderNo:             getString(pm, "order_no"),
		CustomerID:          getInt(pm, "customer_id", 0),
		CustomerOrderNo:     getWorkflowStringPtr(pm, "customer_order_no"),
		CustomerSnapshot:    getMap(pm, "customer_snapshot"),
		OrderDate:           orderDate,
		PlannedDeliveryDate: plannedDeliveryDate,
		Note:                getWorkflowStringPtr(pm, "note"),
	}, true
}

func salesOrderItemMutationFromParams(pm map[string]any) (*biz.SalesOrderItemMutation, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "ordered_quantity")
	if !ok {
		return nil, false
	}
	unitPrice, ok := getOptionalJSONRPCDecimal(pm, "unit_price")
	if !ok {
		return nil, false
	}
	amount, ok := getOptionalJSONRPCDecimal(pm, "amount")
	if !ok {
		return nil, false
	}
	plannedDeliveryDate, ok := getOptionalJSONRPCTime(pm, "planned_delivery_date")
	if !ok {
		return nil, false
	}
	return &biz.SalesOrderItemMutation{
		SalesOrderID:        getInt(pm, "sales_order_id", 0),
		LineNo:              getInt(pm, "line_no", 0),
		ProductID:           getInt(pm, "product_id", 0),
		ProductSkuID:        getOptionalPositiveIntPtr(pm, "product_sku_id"),
		UnitID:              getInt(pm, "unit_id", 0),
		ProductCodeSnapshot: getWorkflowStringPtr(pm, "product_code_snapshot"),
		ProductNameSnapshot: getWorkflowStringPtr(pm, "product_name_snapshot"),
		ColorSnapshot:       getWorkflowStringPtr(pm, "color_snapshot"),
		OrderedQuantity:     quantity,
		UnitPrice:           unitPrice,
		Amount:              amount,
		PlannedDeliveryDate: plannedDeliveryDate,
		Note:                getWorkflowStringPtr(pm, "note"),
	}, true
}

func salesOrderItemSaveMutationsFromParams(pm map[string]any) ([]*biz.SalesOrderItemSaveMutation, bool) {
	raw, ok := pm["items"]
	if !ok || raw == nil {
		return []*biz.SalesOrderItemSaveMutation{}, true
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	items := make([]*biz.SalesOrderItemSaveMutation, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		mutation, ok := salesOrderItemMutationFromParams(itemMap)
		if !ok {
			return nil, false
		}
		items = append(items, &biz.SalesOrderItemSaveMutation{
			ID:                     getInt(itemMap, "id", 0),
			SalesOrderItemMutation: *mutation,
		})
	}
	return items, true
}

func (d *jsonrpcDispatcher) mapSalesOrderError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[sales_order] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrSalesOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单不存在"}
	case errors.Is(err, biz.ErrSalesOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单行不存在"}
	case errors.Is(err, biz.ErrCustomerNotFound), errors.Is(err, biz.ErrCustomerInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "客户不存在或已停用"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品不存在或已停用"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "单位不存在或已停用"}
	default:
		l.Errorf("[sales_order] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func salesOrderMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.SalesOrder, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapSalesOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_order": salesOrderToMap(item)})}
}

func salesOrderItemMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.SalesOrderItem, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapSalesOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_order_item": salesOrderItemToMap(item)})}
}

func salesOrderWithItemsMutationResult(ctx context.Context, d *jsonrpcDispatcher, result *biz.SalesOrderWithItems, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapSalesOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"sales_order":       salesOrderToMap(result.Order),
		"sales_order_items": salesOrderItemsToAny(result.Items),
	})}
}

func salesOrderToMap(item *biz.SalesOrder) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                    item.ID,
		"order_no":              item.OrderNo,
		"customer_id":           item.CustomerID,
		"customer_order_no":     optionalStringValue(item.CustomerOrderNo),
		"customer_snapshot":     item.CustomerSnapshot,
		"order_date":            item.OrderDate.Unix(),
		"planned_delivery_date": optionalTimeUnix(item.PlannedDeliveryDate),
		"lifecycle_status":      item.LifecycleStatus,
		"note":                  optionalStringValue(item.Note),
		"created_at":            item.CreatedAt.Unix(),
		"updated_at":            item.UpdatedAt.Unix(),
	}
}

func salesOrdersToAny(items []*biz.SalesOrder) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, salesOrderToMap(item))
	}
	return out
}

func salesOrderItemToMap(item *biz.SalesOrderItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                    item.ID,
		"sales_order_id":        item.SalesOrderID,
		"line_no":               item.LineNo,
		"product_id":            item.ProductID,
		"product_sku_id":        optionalIntValue(item.ProductSkuID),
		"unit_id":               item.UnitID,
		"product_code_snapshot": optionalStringValue(item.ProductCodeSnapshot),
		"product_name_snapshot": optionalStringValue(item.ProductNameSnapshot),
		"color_snapshot":        optionalStringValue(item.ColorSnapshot),
		"ordered_quantity":      item.OrderedQuantity.String(),
		"unit_price":            optionalDecimalString(item.UnitPrice),
		"amount":                optionalDecimalString(item.Amount),
		"planned_delivery_date": optionalTimeUnix(item.PlannedDeliveryDate),
		"line_status":           item.LineStatus,
		"note":                  optionalStringValue(item.Note),
		"created_at":            item.CreatedAt.Unix(),
		"updated_at":            item.UpdatedAt.Unix(),
	}
}

func salesOrderItemsToAny(items []*biz.SalesOrderItem) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, salesOrderItemToMap(item))
	}
	return out
}
