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

func (d *jsonrpcDispatcher) handlePurchaseOrder(
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
	if d.purchaseOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_purchase_order", "createPurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.purchaseOrderUC.CreatePurchaseOrder(ctx, in)
		return id, purchaseOrderMutationResult(ctx, d, item, err), nil
	case "update_purchase_order", "updatePurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.purchaseOrderUC.UpdatePurchaseOrder(ctx, getInt(pm, "id", 0), in)
		return id, purchaseOrderMutationResult(ctx, d, item, err), nil
	case "save_purchase_order_with_items", "savePurchaseOrderWithItems":
		orderID := getInt(pm, "id", 0)
		orderPermission := biz.PermissionPurchaseOrderCreate
		if orderID > 0 {
			orderPermission = biz.PermissionPurchaseOrderUpdate
		}
		if res := d.RequireAdminPermission(ctx, orderPermission); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		items, ok := purchaseOrderItemSaveMutationsFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		result, err := d.purchaseOrderUC.SavePurchaseOrderWithItems(ctx, orderID, in, items)
		return id, purchaseOrderWithItemsMutationResult(ctx, d, result, err), nil
	case "get_purchase_order", "getPurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
			return id, res, nil
		}
		item, err := d.purchaseOrderUC.GetPurchaseOrder(ctx, getInt(pm, "id", 0))
		return id, purchaseOrderMutationResult(ctx, d, item, err), nil
	case "list_purchase_orders", "listPurchaseOrders":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
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
		items, total, err := d.purchaseOrderUC.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{
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
			return id, d.mapPurchaseOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"purchase_orders": purchaseOrdersToAny(items),
			"total":           total,
			"limit":           normalizedLimit(pm),
			"offset":          normalizedOffset(pm),
		})}, nil
	case "submit_purchase_order", "submitPurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderUpdate, d.purchaseOrderUC.SubmitPurchaseOrder)
	case "approve_purchase_order", "approvePurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderApprove, d.purchaseOrderUC.ApprovePurchaseOrder)
	case "close_purchase_order", "closePurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderUpdate, d.purchaseOrderUC.ClosePurchaseOrder)
	case "cancel_purchase_order", "cancelPurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderUpdate, d.purchaseOrderUC.CancelPurchaseOrder)
	case "add_purchase_order_item", "addPurchaseOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderItemMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.purchaseOrderUC.AddPurchaseOrderItem(ctx, in)
		return id, purchaseOrderItemMutationResult(ctx, d, item, err), nil
	case "update_purchase_order_item", "updatePurchaseOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderItemMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.purchaseOrderUC.UpdatePurchaseOrderItem(ctx, getInt(pm, "id", 0), in)
		return id, purchaseOrderItemMutationResult(ctx, d, item, err), nil
	case "remove_purchase_order_item", "removePurchaseOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.purchaseOrderUC.RemovePurchaseOrderItem(ctx, getInt(pm, "id", 0))
		return id, purchaseOrderItemMutationResult(ctx, d, item, err), nil
	case "list_purchase_order_items", "listPurchaseOrderItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.purchaseOrderUC.ListPurchaseOrderItems(ctx, biz.PurchaseOrderItemFilter{
			PurchaseOrderID: getInt(pm, "purchase_order_id", 0),
			LineStatus:      getString(pm, "line_status"),
			Limit:           getInt(pm, "limit", 50),
			Offset:          getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapPurchaseOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"purchase_order_items": purchaseOrderItemsToAny(items),
			"total":                total,
			"limit":                normalizedLimit(pm),
			"offset":               normalizedOffset(pm),
		})}, nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 purchase_order 接口 method=%s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) handlePurchaseOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	permission string,
	action func(context.Context, int) (*biz.PurchaseOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	item, err := action(ctx, getInt(pm, "id", 0))
	return id, purchaseOrderMutationResult(ctx, d, item, err), nil
}

func purchaseOrderMutationFromParams(pm map[string]any) (*biz.PurchaseOrderMutation, bool) {
	purchaseDate, ok := getRequiredJSONRPCTime(pm, "purchase_date")
	if !ok {
		return nil, false
	}
	expectedArrivalDate, ok := getOptionalJSONRPCTime(pm, "expected_arrival_date")
	if !ok {
		return nil, false
	}
	return &biz.PurchaseOrderMutation{
		PurchaseOrderNo:         getString(pm, "purchase_order_no"),
		SupplierID:              getInt(pm, "supplier_id", 0),
		SupplierPurchaseOrderNo: getWorkflowStringPtr(pm, "supplier_purchase_order_no"),
		SupplierSnapshot:        getMap(pm, "supplier_snapshot"),
		PurchaseDate:            purchaseDate,
		ExpectedArrivalDate:     expectedArrivalDate,
		Note:                    getWorkflowStringPtr(pm, "note"),
	}, true
}

func purchaseOrderItemMutationFromParams(pm map[string]any) (*biz.PurchaseOrderItemMutation, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "purchased_quantity")
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
	expectedArrivalDate, ok := getOptionalJSONRPCTime(pm, "expected_arrival_date")
	if !ok {
		return nil, false
	}
	return &biz.PurchaseOrderItemMutation{
		PurchaseOrderID:      getInt(pm, "purchase_order_id", 0),
		LineNo:               getInt(pm, "line_no", 0),
		MaterialID:           getInt(pm, "material_id", 0),
		UnitID:               getInt(pm, "unit_id", 0),
		MaterialCodeSnapshot: getWorkflowStringPtr(pm, "material_code_snapshot"),
		MaterialNameSnapshot: getWorkflowStringPtr(pm, "material_name_snapshot"),
		ColorSnapshot:        getWorkflowStringPtr(pm, "color_snapshot"),
		PurchasedQuantity:    quantity,
		UnitPrice:            unitPrice,
		Amount:               amount,
		ExpectedArrivalDate:  expectedArrivalDate,
		Note:                 getWorkflowStringPtr(pm, "note"),
	}, true
}

func purchaseOrderItemSaveMutationsFromParams(pm map[string]any) ([]*biz.PurchaseOrderItemSaveMutation, bool) {
	raw, ok := pm["items"]
	if !ok || raw == nil {
		return []*biz.PurchaseOrderItemSaveMutation{}, true
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	items := make([]*biz.PurchaseOrderItemSaveMutation, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		mutation, ok := purchaseOrderItemMutationFromParams(itemMap)
		if !ok {
			return nil, false
		}
		items = append(items, &biz.PurchaseOrderItemSaveMutation{
			ID:                        getInt(itemMap, "id", 0),
			PurchaseOrderItemMutation: *mutation,
		})
	}
	return items, true
}

func (d *jsonrpcDispatcher) mapPurchaseOrderError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[purchase_order] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrPurchaseOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购订单不存在"}
	case errors.Is(err, biz.ErrPurchaseOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购订单行不存在"}
	case errors.Is(err, biz.ErrSupplierNotFound), errors.Is(err, biz.ErrSupplierInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "供应商不存在或已停用"}
	case errors.Is(err, biz.ErrMaterialNotFound), errors.Is(err, biz.ErrMaterialInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "材料不存在或已停用"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "单位不存在或已停用"}
	default:
		l.Errorf("[purchase_order] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func purchaseOrderMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseOrder, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"purchase_order": purchaseOrderToMap(item)})}
}

func purchaseOrderItemMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseOrderItem, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"purchase_order_item": purchaseOrderItemToMap(item)})}
}

func purchaseOrderWithItemsMutationResult(ctx context.Context, d *jsonrpcDispatcher, result *biz.PurchaseOrderWithItems, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"purchase_order":       purchaseOrderToMap(result.Order),
		"purchase_order_items": purchaseOrderItemsToAny(result.Items),
	})}
}

func purchaseOrderToMap(item *biz.PurchaseOrder) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                         item.ID,
		"purchase_order_no":          item.PurchaseOrderNo,
		"supplier_id":                item.SupplierID,
		"supplier_purchase_order_no": optionalStringValue(item.SupplierPurchaseOrderNo),
		"supplier_snapshot":          item.SupplierSnapshot,
		"purchase_date":              item.PurchaseDate.Unix(),
		"expected_arrival_date":      optionalUnix(item.ExpectedArrivalDate),
		"lifecycle_status":           item.LifecycleStatus,
		"note":                       optionalStringValue(item.Note),
		"created_at":                 item.CreatedAt.Unix(),
		"updated_at":                 item.UpdatedAt.Unix(),
	}
}

func purchaseOrdersToAny(items []*biz.PurchaseOrder) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, purchaseOrderToMap(item))
	}
	return out
}

func purchaseOrderItemToMap(item *biz.PurchaseOrderItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                     item.ID,
		"purchase_order_id":      item.PurchaseOrderID,
		"line_no":                item.LineNo,
		"material_id":            item.MaterialID,
		"unit_id":                item.UnitID,
		"material_code_snapshot": optionalStringValue(item.MaterialCodeSnapshot),
		"material_name_snapshot": optionalStringValue(item.MaterialNameSnapshot),
		"color_snapshot":         optionalStringValue(item.ColorSnapshot),
		"purchased_quantity":     item.PurchasedQuantity.String(),
		"unit_price":             optionalDecimalString(item.UnitPrice),
		"amount":                 optionalDecimalString(item.Amount),
		"expected_arrival_date":  optionalUnix(item.ExpectedArrivalDate),
		"line_status":            item.LineStatus,
		"note":                   optionalStringValue(item.Note),
		"created_at":             item.CreatedAt.Unix(),
		"updated_at":             item.UpdatedAt.Unix(),
	}
}

func purchaseOrderItemsToAny(items []*biz.PurchaseOrderItem) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, purchaseOrderItemToMap(item))
	}
	return out
}
