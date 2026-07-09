package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func unknownOutsourcingOrderResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.UnknownMethod.Code,
		Message: fmt.Sprintf("未知 outsourcing_order 接口 method=%s", method),
	}
}

func outsourcingOrderMutationFromParams(pm map[string]any) (*biz.OutsourcingOrderMutation, bool) {
	orderDate, ok := getRequiredJSONRPCTime(pm, "order_date")
	if !ok {
		return nil, false
	}
	expectedReturnDate, ok := getOptionalJSONRPCTime(pm, "expected_return_date")
	if !ok {
		return nil, false
	}
	return &biz.OutsourcingOrderMutation{
		OutsourcingOrderNo:    getString(pm, "outsourcing_order_no"),
		SupplierID:            getInt(pm, "supplier_id", 0),
		SupplierSnapshot:      getMap(pm, "supplier_snapshot"),
		ContractPartySnapshot: getMap(pm, "contract_party_snapshot"),
		SourceOrderNo:         getWorkflowStringPtr(pm, "source_order_no"),
		SourceSalesOrderID:    getOptionalPositiveIntPtr(pm, "source_sales_order_id"),
		OrderDate:             orderDate,
		ExpectedReturnDate:    expectedReturnDate,
		Note:                  getWorkflowStringPtr(pm, "note"),
	}, true
}

func outsourcingOrderItemMutationFromParams(pm map[string]any) (*biz.OutsourcingOrderItemMutation, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "outsourcing_quantity")
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
	expectedReturnDate, ok := getOptionalJSONRPCTime(pm, "expected_return_date")
	if !ok {
		return nil, false
	}
	return &biz.OutsourcingOrderItemMutation{
		OutsourcingOrderID:      getInt(pm, "outsourcing_order_id", 0),
		LineNo:                  getInt(pm, "line_no", 0),
		ProductID:               getInt(pm, "product_id", 0),
		ProcessID:               getInt(pm, "process_id", 0),
		UnitID:                  getInt(pm, "unit_id", 0),
		ProductNoSnapshot:       getWorkflowStringPtr(pm, "product_no_snapshot"),
		ProductOrderNoSnapshot:  getWorkflowStringPtr(pm, "product_order_no_snapshot"),
		ProductNameSnapshot:     getWorkflowStringPtr(pm, "product_name_snapshot"),
		ProcessNameSnapshot:     getWorkflowStringPtr(pm, "process_name_snapshot"),
		ProcessCategorySnapshot: getWorkflowStringPtr(pm, "process_category_snapshot"),
		UnitNameSnapshot:        getWorkflowStringPtr(pm, "unit_name_snapshot"),
		OutsourcingQuantity:     quantity,
		UnitPrice:               unitPrice,
		Amount:                  amount,
		ExpectedReturnDate:      expectedReturnDate,
		Note:                    getWorkflowStringPtr(pm, "note"),
	}, true
}

func outsourcingOrderItemSaveMutationsFromParams(pm map[string]any) ([]*biz.OutsourcingOrderItemSaveMutation, bool) {
	raw, ok := pm["items"]
	if !ok || raw == nil {
		return []*biz.OutsourcingOrderItemSaveMutation{}, true
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	items := make([]*biz.OutsourcingOrderItemSaveMutation, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		mutation, ok := outsourcingOrderItemMutationFromParams(itemMap)
		if !ok {
			return nil, false
		}
		items = append(items, &biz.OutsourcingOrderItemSaveMutation{
			ID:                           getInt(itemMap, "id", 0),
			OutsourcingOrderItemMutation: *mutation,
		})
	}
	return items, true
}

func (d *jsonrpcDispatcher) mapOutsourcingOrderError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[outsourcing_order] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrOutsourcingOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同不存在"}
	case errors.Is(err, biz.ErrOutsourcingOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同明细不存在"}
	case errors.Is(err, biz.ErrSupplierNotFound), errors.Is(err, biz.ErrSupplierInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "加工厂不存在或已停用"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品不存在或已停用"}
	case errors.Is(err, biz.ErrProcessNotFound), errors.Is(err, biz.ErrProcessInactive), errors.Is(err, biz.ErrProcessNotOutsourcingEnabled):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "工序不存在、已停用或未启用委外"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "单位不存在或已停用"}
	default:
		l.Errorf("[outsourcing_order] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func outsourcingOrderMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.OutsourcingOrder, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOutsourcingOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"outsourcing_order": outsourcingOrderToMap(item)})}
}

func outsourcingOrderWithItemsMutationResult(ctx context.Context, d *jsonrpcDispatcher, result *biz.OutsourcingOrderWithItems, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOutsourcingOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"outsourcing_order":       outsourcingOrderToMap(result.Order),
		"outsourcing_order_items": outsourcingOrderItemsToAny(result.Items),
	})}
}

func outsourcingOrderToMap(item *biz.OutsourcingOrder) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                      item.ID,
		"outsourcing_order_no":    item.OutsourcingOrderNo,
		"supplier_id":             item.SupplierID,
		"supplier_snapshot":       item.SupplierSnapshot,
		"contract_party_snapshot": item.ContractPartySnapshot,
		"source_order_no":         optionalStringValue(item.SourceOrderNo),
		"source_sales_order_id":   optionalIntValue(item.SourceSalesOrderID),
		"order_date":              item.OrderDate.Unix(),
		"expected_return_date":    optionalUnix(item.ExpectedReturnDate),
		"lifecycle_status":        item.LifecycleStatus,
		"note":                    optionalStringValue(item.Note),
		"created_at":              item.CreatedAt.Unix(),
		"updated_at":              item.UpdatedAt.Unix(),
	}
}

func outsourcingOrdersToAny(items []*biz.OutsourcingOrder) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, outsourcingOrderToMap(item))
	}
	return out
}

func outsourcingOrderItemToMap(item *biz.OutsourcingOrderItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                        item.ID,
		"outsourcing_order_id":      item.OutsourcingOrderID,
		"line_no":                   item.LineNo,
		"product_id":                item.ProductID,
		"process_id":                item.ProcessID,
		"unit_id":                   item.UnitID,
		"product_no_snapshot":       optionalStringValue(item.ProductNoSnapshot),
		"product_order_no_snapshot": optionalStringValue(item.ProductOrderNoSnapshot),
		"product_name_snapshot":     optionalStringValue(item.ProductNameSnapshot),
		"process_name_snapshot":     optionalStringValue(item.ProcessNameSnapshot),
		"process_category_snapshot": optionalStringValue(item.ProcessCategorySnapshot),
		"unit_name_snapshot":        optionalStringValue(item.UnitNameSnapshot),
		"outsourcing_quantity":      item.OutsourcingQuantity.String(),
		"unit_price":                optionalDecimalString(item.UnitPrice),
		"amount":                    optionalDecimalString(item.Amount),
		"expected_return_date":      optionalUnix(item.ExpectedReturnDate),
		"line_status":               item.LineStatus,
		"note":                      optionalStringValue(item.Note),
		"created_at":                item.CreatedAt.Unix(),
		"updated_at":                item.UpdatedAt.Unix(),
	}
}

func outsourcingOrderItemsToAny(items []*biz.OutsourcingOrderItem) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, outsourcingOrderItemToMap(item))
	}
	return out
}
