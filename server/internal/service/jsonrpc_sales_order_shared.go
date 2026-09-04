package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func unknownSalesOrderResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.UnknownMethod.Code,
		Message: fmt.Sprintf("未知 sales_order 接口 method=%s", method),
	}
}

func salesOrderMutationFromParams(pm map[string]any) (*biz.SalesOrderMutation, bool) {
	if !sourceOrderAllowsOnly(pm,
		"customer_key", "id", "expected_version", "order_no", "customer_id", "currency",
		"customer_order_no", "customer_snapshot", "sales_owner", "contact_snapshot",
		"delivery_snapshot", "payment_method", "payment_term_days", "price_condition_note",
		"tax_mode", "tax_rate", "freight_terms", "quoted_freight_amount", "order_date",
		"planned_delivery_date", "note", "items",
	) {
		return nil, false
	}
	orderDate, ok := getRequiredJSONRPCTime(pm, "order_date")
	if !ok {
		return nil, false
	}
	paymentTermDays, ok := getOptionalJSONRPCNonNegativeInt(pm, "payment_term_days")
	if !ok {
		return nil, false
	}
	plannedDeliveryDate, ok := getOptionalJSONRPCTime(pm, "planned_delivery_date")
	if !ok {
		return nil, false
	}
	taxRate, ok := getOptionalJSONRPCDecimalString(pm, "tax_rate")
	if !ok {
		return nil, false
	}
	quotedFreightAmount, ok := getOptionalJSONRPCDecimalString(pm, "quoted_freight_amount")
	if !ok {
		return nil, false
	}
	return &biz.SalesOrderMutation{
		OrderNo:             getString(pm, "order_no"),
		CustomerID:          getInt(pm, "customer_id", 0),
		Currency:            getString(pm, "currency"),
		CustomerOrderNo:     getWorkflowStringPtr(pm, "customer_order_no"),
		CustomerSnapshot:    getMap(pm, "customer_snapshot"),
		SalesOwner:          getWorkflowStringPtr(pm, "sales_owner"),
		ContactSnapshot:     getMap(pm, "contact_snapshot"),
		DeliverySnapshot:    getMap(pm, "delivery_snapshot"),
		PaymentMethod:       getWorkflowStringPtr(pm, "payment_method"),
		PaymentTermDays:     paymentTermDays,
		PriceConditionNote:  getWorkflowStringPtr(pm, "price_condition_note"),
		TaxMode:             getWorkflowStringPtr(pm, "tax_mode"),
		TaxRate:             taxRate,
		FreightTerms:        getWorkflowStringPtr(pm, "freight_terms"),
		QuotedFreightAmount: quotedFreightAmount,
		OrderDate:           orderDate,
		PlannedDeliveryDate: plannedDeliveryDate,
		Note:                getWorkflowStringPtr(pm, "note"),
	}, true
}

func salesOrderItemMutationFromParams(pm map[string]any) (*biz.SalesOrderItemMutation, bool) {
	quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "ordered_quantity")
	if !ok {
		return nil, false
	}
	unitPrice, ok := getOptionalJSONRPCDecimalString(pm, "unit_price")
	if !ok {
		return nil, false
	}
	amount, ok := getOptionalJSONRPCDecimalString(pm, "amount")
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
	case errors.Is(err, biz.ErrSalesOrderConflict):
		return &v1.JsonrpcResult{Code: errcode.ResourceVersionConflict.Code, Message: errcode.ResourceVersionConflict.Message}
	case errors.Is(err, biz.ErrSalesOrderCommercialTermsIncomplete):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请先补齐计税方式、税率和运费条件；报价不含运费时还需填写报价运费，再提交订单"}
	case errors.Is(err, biz.ErrSalesOrderItemPriceMissing):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "订单仍有未填写单价的产品明细，请补齐后再提交"}
	case errors.Is(err, biz.ErrIdempotencyConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: errcode.IdempotencyConflict.Message}
	case errors.Is(err, biz.ErrSourceOrderNormalCloseIncomplete):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单尚未全部出货；若确定不再履行剩余数量，请改用短关闭并填写原因"}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[sales_order] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrSalesOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单不存在"}
	case errors.Is(err, biz.ErrSalesOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单行不存在"}
	case errors.Is(err, biz.ErrSalesOrderCancellationShipmentDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单已有未取消的出货单，不能取消"}
	case errors.Is(err, biz.ErrSalesOrderCancellationReservationDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单仍有生效库存预留，请先释放后再取消"}
	case errors.Is(err, biz.ErrSalesOrderCancellationProductionDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单已有未取消的生产订单，不能取消"}
	case errors.Is(err, biz.ErrSalesOrderCancellationProcessDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单仍有进行中的审批流程，不能取消"}
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
		"currency":              item.Currency,
		"customer_order_no":     optionalStringValue(item.CustomerOrderNo),
		"customer_snapshot":     item.CustomerSnapshot,
		"sales_owner":           optionalStringValue(item.SalesOwner),
		"contact_snapshot":      item.ContactSnapshot,
		"delivery_snapshot":     item.DeliverySnapshot,
		"payment_method":        optionalStringValue(item.PaymentMethod),
		"payment_term_days":     optionalIntValue(item.PaymentTermDays),
		"price_condition_note":  optionalStringValue(item.PriceConditionNote),
		"tax_mode":              optionalStringValue(item.TaxMode),
		"tax_rate":              optionalDecimalString(item.TaxRate),
		"freight_terms":         optionalStringValue(item.FreightTerms),
		"quoted_freight_amount": optionalDecimalString(item.QuotedFreightAmount),
		"goods_amount":          optionalDecimalString(item.GoodsAmount),
		"tax_amount":            optionalDecimalString(item.TaxAmount),
		"order_total":           optionalDecimalString(item.OrderTotal),
		"order_date":            item.OrderDate.Unix(),
		"planned_delivery_date": optionalTimeUnix(item.PlannedDeliveryDate),
		"lifecycle_status":      item.LifecycleStatus,
		"version":               item.Version,
		"settlement_action":     optionalStringValue(item.SettlementAction),
		"settlement_mode":       optionalStringValue(item.SettlementMode),
		"settlement_reason":     optionalStringValue(item.SettlementReason),
		"settled_at":            optionalTimeUnix(item.SettledAt),
		"settled_by":            optionalIntValue(item.SettledBy),
		"note":                  optionalStringValue(item.Note),
		"created_at":            item.CreatedAt.Unix(),
		"updated_at":            item.UpdatedAt.Unix(),
	}
}

func salesOrdersToAny(items []*biz.SalesOrder, includeItemCount bool) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		mapped := salesOrderToMap(item)
		if includeItemCount && item != nil && item.ItemCount != nil {
			mapped["item_count"] = *item.ItemCount
		}
		out = append(out, mapped)
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
