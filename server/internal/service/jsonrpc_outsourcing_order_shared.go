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
	if !outsourcingOrderAllowsOnly(pm,
		"customer_key",
		"id",
		"expected_version",
		"outsourcing_order_no",
		"supplier_id",
		"supplier_snapshot",
		"contract_party_snapshot",
		"source_order_no",
		"order_date",
		"expected_return_date",
		"note",
		"items",
	) {
		return nil, false
	}
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
		OrderDate:             orderDate,
		ExpectedReturnDate:    expectedReturnDate,
		Note:                  getWorkflowStringPtr(pm, "note"),
	}, true
}

func outsourcingOrderItemMutationFromParams(pm map[string]any) (*biz.OutsourcingOrderItemMutation, bool) {
	if !outsourcingOrderAllowsOnly(pm,
		"id",
		"outsourcing_order_id",
		"line_no",
		"subject_type",
		"product_id",
		"product_sku_id",
		"material_id",
		"process_id",
		"unit_id",
		"product_no_snapshot",
		"sku_code_snapshot",
		"product_order_no_snapshot",
		"product_name_snapshot",
		"material_code_snapshot",
		"material_name_snapshot",
		"processing_item",
		"process_name_snapshot",
		"process_category_snapshot",
		"unit_name_snapshot",
		"outsourcing_quantity",
		"unit_price",
		"amount",
		"expected_return_date",
		"note",
	) {
		return nil, false
	}
	quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "outsourcing_quantity")
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
	expectedReturnDate, ok := getOptionalJSONRPCTime(pm, "expected_return_date")
	if !ok {
		return nil, false
	}
	return &biz.OutsourcingOrderItemMutation{
		OutsourcingOrderID:      getInt(pm, "outsourcing_order_id", 0),
		LineNo:                  getInt(pm, "line_no", 0),
		SubjectType:             getString(pm, "subject_type"),
		ProductID:               getOptionalPositiveIntPtr(pm, "product_id"),
		ProductSKUID:            getOptionalPositiveIntPtr(pm, "product_sku_id"),
		MaterialID:              getOptionalPositiveIntPtr(pm, "material_id"),
		ProcessID:               getInt(pm, "process_id", 0),
		UnitID:                  getInt(pm, "unit_id", 0),
		ProductNoSnapshot:       getWorkflowStringPtr(pm, "product_no_snapshot"),
		ProductOrderNoSnapshot:  getWorkflowStringPtr(pm, "product_order_no_snapshot"),
		ProductNameSnapshot:     getWorkflowStringPtr(pm, "product_name_snapshot"),
		MaterialCodeSnapshot:    getWorkflowStringPtr(pm, "material_code_snapshot"),
		MaterialNameSnapshot:    getWorkflowStringPtr(pm, "material_name_snapshot"),
		ProcessingItem:          getWorkflowStringPtr(pm, "processing_item"),
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

func outsourcingOrderAllowsOnly(pm map[string]any, keys ...string) bool {
	allowed := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		allowed[key] = struct{}{}
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
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
	case errors.Is(err, biz.ErrOutsourcingOrderConflict):
		return &v1.JsonrpcResult{Code: errcode.ResourceVersionConflict.Code, Message: errcode.ResourceVersionConflict.Message}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[outsourcing_order] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrOutsourcingOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同不存在"}
	case errors.Is(err, biz.ErrOutsourcingOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同明细不存在"}
	case errors.Is(err, biz.ErrOutsourcingOrderFactDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同仍有未结清的发料或回货记录；关闭前请完成或取消草稿，取消合同前请先取消或冲正相关记录"}
	case errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外合同已关联在制批次，完成相关生产办理前不能取消、关闭或改写"}
	case errors.Is(err, biz.ErrSupplierNotFound), errors.Is(err, biz.ErrSupplierInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "加工厂不存在或已停用"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品不存在或已停用"}
	case errors.Is(err, biz.ErrProductSKUNotFound), errors.Is(err, biz.ErrProductSKUInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品规格不存在、已停用，或与产品和单位不匹配"}
	case errors.Is(err, biz.ErrMaterialNotFound), errors.Is(err, biz.ErrMaterialInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "材料不存在或已停用"}
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
		"order_date":              item.OrderDate.Unix(),
		"expected_return_date":    optionalUnix(item.ExpectedReturnDate),
		"lifecycle_status":        item.LifecycleStatus,
		"version":                 item.Version,
		"note":                    optionalStringValue(item.Note),
		"created_at":              item.CreatedAt.Unix(),
		"updated_at":              item.UpdatedAt.Unix(),
	}
}

func outsourcingOrdersToAny(items []*biz.OutsourcingOrder) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		mapped := outsourcingOrderToMap(item)
		if item != nil && item.ItemCount != nil {
			mapped["item_count"] = *item.ItemCount
		}
		out = append(out, mapped)
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
		"subject_type":              item.SubjectType,
		"product_id":                optionalIntValue(item.ProductID),
		"product_sku_id":            optionalIntValue(item.ProductSKUID),
		"material_id":               optionalIntValue(item.MaterialID),
		"process_id":                item.ProcessID,
		"unit_id":                   item.UnitID,
		"product_no_snapshot":       optionalStringValue(item.ProductNoSnapshot),
		"sku_code_snapshot":         optionalStringValue(item.SKUCodeSnapshot),
		"product_order_no_snapshot": optionalStringValue(item.ProductOrderNoSnapshot),
		"product_name_snapshot":     optionalStringValue(item.ProductNameSnapshot),
		"material_code_snapshot":    optionalStringValue(item.MaterialCodeSnapshot),
		"material_name_snapshot":    optionalStringValue(item.MaterialNameSnapshot),
		"processing_item":           optionalStringValue(item.ProcessingItem),
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
