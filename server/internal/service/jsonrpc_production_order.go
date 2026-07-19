package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

const productionOrderModuleKey = "production_orders"

func (d *jsonrpcDispatcher) handleProductionOrder(ctx context.Context, method, id string, params *structpb.Struct) (string, *v1.JsonrpcResult, error) {
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.productionOrderUC == nil {
		return id, productionOrderInternalResult(), nil
	}
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	switch method {
	case "create_production_order":
		return id, d.createProductionOrder(ctx, pm), nil
	case "save_production_order":
		return id, d.saveProductionOrder(ctx, pm), nil
	case "release_production_order":
		return id, d.applyProductionOrderAction(ctx, pm, biz.ProductionOrderCommandRelease), nil
	case "close_production_order":
		return id, d.applyProductionOrderAction(ctx, pm, biz.ProductionOrderCommandClose), nil
	case "cancel_production_order":
		return id, d.applyProductionOrderAction(ctx, pm, biz.ProductionOrderCommandCancel), nil
	case "get_production_order":
		return id, d.getProductionOrder(ctx, pm), nil
	case "list_production_orders":
		return id, d.listProductionOrders(ctx, pm), nil
	case "list_production_order_reference_options":
		return id, d.listProductionOrderReferenceOptions(ctx, pm), nil
	default:
		return id, &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知生产订单接口 method=%s", method)}, nil
	}
}

func (d *jsonrpcDispatcher) createProductionOrder(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "order_no", "planned_start_at", "planned_end_at", "note", "items", "idempotency_key") {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPMCPlanCreate); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", productionOrderModuleKey); res != nil {
		return res
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	draft, key, ok := productionOrderDraftFromParams(pm)
	if !ok {
		return invalidParamResult()
	}
	if res := d.requireSourceActionReadPermissions(
		ctx,
		"production_order",
		"create_production_order",
		productionOrderDraftSourceReadConditions(draft)...,
	); res != nil {
		return res
	}
	aggregate, err := d.productionOrderUC.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: draft, ActorID: admin.ID, IdempotencyKey: key})
	return d.productionOrderAggregateResult(ctx, aggregate, err)
}

func (d *jsonrpcDispatcher) saveProductionOrder(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "production_order_id", "expected_version", "order_no", "planned_start_at", "planned_end_at", "note", "items", "idempotency_key") {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPMCPlanUpdate); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", productionOrderModuleKey); res != nil {
		return res
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	orderID, ok := productionOrderRequiredPositiveInt(pm, "production_order_id")
	if !ok {
		return invalidParamResult()
	}
	version, ok := productionOrderRequiredPositiveInt(pm, "expected_version")
	if !ok {
		return invalidParamResult()
	}
	draft, key, ok := productionOrderDraftFromParams(pm)
	if !ok {
		return invalidParamResult()
	}
	if res := d.requireSourceActionReadPermissions(
		ctx,
		"production_order",
		"save_production_order",
		productionOrderDraftSourceReadConditions(draft)...,
	); res != nil {
		return res
	}
	aggregate, err := d.productionOrderUC.SaveDraft(ctx, &biz.ProductionOrderSave{ID: orderID, ExpectedVersion: version, Draft: draft, ActorID: admin.ID, IdempotencyKey: key})
	return d.productionOrderAggregateResult(ctx, aggregate, err)
}

func (d *jsonrpcDispatcher) applyProductionOrderAction(ctx context.Context, pm map[string]any, command string) *v1.JsonrpcResult {
	allowed := []string{"production_order_id", "expected_version", "idempotency_key"}
	if command == biz.ProductionOrderCommandClose || command == biz.ProductionOrderCommandCancel {
		allowed = append(allowed, "reason")
	}
	if !productionOrderAllowsOnly(pm, allowed...) {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPMCPlanUpdate); res != nil {
		return res
	}
	// Release creates the source scheduling task. Close/cancel can read and
	// transition that task for RELEASED orders, so every action fails closed
	// when the Workflow module is not writable instead of pre-reading state in
	// the service and racing the repository transaction.
	modules := []string{productionOrderModuleKey, workflowModuleKeyTasks}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", modules...); res != nil {
		return res
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	orderID, ok := productionOrderRequiredPositiveInt(pm, "production_order_id")
	if !ok {
		return invalidParamResult()
	}
	version, ok := productionOrderRequiredPositiveInt(pm, "expected_version")
	if !ok {
		return invalidParamResult()
	}
	key, ok := productionOrderRequiredString(pm, "idempotency_key", 128)
	if !ok {
		return invalidParamResult()
	}
	reason, ok := productionOrderOptionalString(pm, "reason", 255)
	if !ok || (command == biz.ProductionOrderCommandCancel && reason == nil) {
		return invalidParamResult()
	}
	if command == biz.ProductionOrderCommandRelease {
		if res := d.requireSourceActionReadPermissions(ctx, "production_order", "release_production_order"); res != nil {
			return res
		}
	}
	in := &biz.ProductionOrderAction{ID: orderID, ExpectedVersion: version, ActorID: admin.ID, IdempotencyKey: key, Reason: reason}
	var aggregate *biz.ProductionOrderAggregate
	var err error
	switch command {
	case biz.ProductionOrderCommandRelease:
		aggregate, err = d.productionOrderUC.Release(ctx, in)
	case biz.ProductionOrderCommandClose:
		aggregate, err = d.productionOrderUC.Close(ctx, in)
	case biz.ProductionOrderCommandCancel:
		aggregate, err = d.productionOrderUC.Cancel(ctx, in)
	default:
		return invalidParamResult()
	}
	return d.productionOrderAggregateResult(ctx, aggregate, err)
}

func (d *jsonrpcDispatcher) getProductionOrder(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "production_order_id") {
		return invalidParamResult()
	}
	if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanRead, biz.PermissionProductionWIPRead); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, productionOrderModuleKey); res != nil {
		return res
	}
	orderID, ok := productionOrderRequiredPositiveInt(pm, "production_order_id")
	if !ok {
		return invalidParamResult()
	}
	aggregate, err := d.productionOrderUC.Get(ctx, orderID)
	return d.productionOrderAggregateResult(ctx, aggregate, err)
}

func (d *jsonrpcDispatcher) listProductionOrders(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "keyword", "status", "date_field", "date_from", "date_to", "sort_by", "sort_direction", "limit", "offset") {
		return invalidParamResult()
	}
	if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanRead, biz.PermissionProductionWIPRead); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, productionOrderModuleKey); res != nil {
		return res
	}
	filter, ok := productionOrderFilterFromParams(pm)
	if !ok {
		return invalidParamResult()
	}
	items, total, err := d.productionOrderUC.List(ctx, filter)
	if err != nil {
		return d.mapProductionOrderError(ctx, err)
	}
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, productionOrderToMap(item))
	}
	return okData(map[string]any{"production_orders": values, "total": total, "limit": filter.Limit, "offset": filter.Offset})
}

func (d *jsonrpcDispatcher) listProductionOrderReferenceOptions(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "reference_type", "keyword", "product_id", "product_sku_id", "unit_id", "selected_ids", "limit", "offset") {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPMCPlanRead); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, productionOrderModuleKey); res != nil {
		return res
	}
	filter, ok := productionOrderReferenceFilterFromParams(pm)
	if !ok {
		return invalidParamResult()
	}
	if res := d.requireSourceActionReadPermissions(
		ctx,
		"production_order",
		"list_production_order_reference_options",
		productionOrderReferenceSourceReadConditions(filter.ReferenceType)...,
	); res != nil {
		return res
	}
	options, total, err := d.productionOrderUC.ListReferenceOptions(ctx, filter)
	if err != nil {
		return d.mapProductionOrderError(ctx, err)
	}
	values := make([]any, 0, len(options))
	for _, option := range options {
		values = append(values, productionOrderReferenceOptionToMap(option))
	}
	return okData(map[string]any{"reference_type": filter.ReferenceType, "options": values, "total": total, "limit": filter.Limit, "offset": filter.Offset})
}

func productionOrderReferenceFilterFromParams(pm map[string]any) (biz.ProductionOrderReferenceFilter, bool) {
	referenceType, ok := productionOrderRequiredString(pm, "reference_type", 32)
	if !ok {
		return biz.ProductionOrderReferenceFilter{}, false
	}
	keyword, ok := productionOrderOptionalExactString(pm, "keyword")
	if !ok || len(keyword) > 100 {
		return biz.ProductionOrderReferenceFilter{}, false
	}
	limit, ok := productionOrderOptionalNonNegativeInt(pm, "limit", 20)
	if !ok || limit < 1 || limit > 50 {
		return biz.ProductionOrderReferenceFilter{}, false
	}
	offset, ok := productionOrderOptionalNonNegativeInt(pm, "offset", 0)
	if !ok {
		return biz.ProductionOrderReferenceFilter{}, false
	}
	filter := biz.ProductionOrderReferenceFilter{ReferenceType: referenceType, Keyword: keyword, Limit: limit, Offset: offset}
	for key, target := range map[string]*int{"product_id": &filter.ProductID, "product_sku_id": &filter.ProductSKUID, "unit_id": &filter.UnitID} {
		if raw, exists := pm[key]; exists {
			value, valid := productionOrderJSONSafeInt(raw)
			if !valid || value <= 0 {
				return biz.ProductionOrderReferenceFilter{}, false
			}
			*target = value
		}
	}
	if raw, exists := pm["selected_ids"]; exists {
		ids, valid := raw.([]any)
		if !valid || len(ids) == 0 || len(ids) > 50 {
			return biz.ProductionOrderReferenceFilter{}, false
		}
		seen := make(map[int]struct{}, len(ids))
		for _, rawID := range ids {
			id, valid := productionOrderJSONSafeInt(rawID)
			if !valid || id <= 0 {
				return biz.ProductionOrderReferenceFilter{}, false
			}
			if _, duplicate := seen[id]; duplicate {
				return biz.ProductionOrderReferenceFilter{}, false
			}
			seen[id] = struct{}{}
			filter.SelectedIDs = append(filter.SelectedIDs, id)
		}
		filter.Limit = len(filter.SelectedIDs)
	}
	return filter, true
}

func productionOrderReferenceOptionToMap(option *biz.ProductionOrderReferenceOption) map[string]any {
	if option == nil {
		return map[string]any{}
	}
	return map[string]any{
		"value": option.Value, "label": option.Label, "selectable": option.Selectable, "reason": optionalStringValue(option.Reason),
		"product_value": optionalIntValue(option.ProductValue), "sku_value": optionalIntValue(option.SKUValue), "unit_value": optionalIntValue(option.UnitValue),
		"code": optionalStringValue(option.Code), "name": optionalStringValue(option.Name), "style_no": optionalStringValue(option.StyleNo), "customer_style_no": optionalStringValue(option.CustomerStyleNo),
		"sku_code": optionalStringValue(option.SKUCode), "sku_name": optionalStringValue(option.SKUName), "color": optionalStringValue(option.Color), "color_no": optionalStringValue(option.ColorNo), "size": optionalStringValue(option.Size), "packaging_version": optionalStringValue(option.PackagingVersion),
		"unit_code": optionalStringValue(option.UnitCode), "unit_name": optionalStringValue(option.UnitName), "unit_precision": optionalIntValue(option.UnitPrecision),
		"sales_order_no": optionalStringValue(option.SalesOrderNo), "sales_line_no": optionalIntValue(option.SalesLineNo), "ordered_quantity": optionalStringValue(option.OrderedQuantity), "planned_delivery_at": optionalTimeUnix(option.PlannedDeliveryAt),
		"sales_order_status": optionalStringValue(option.SalesOrderStatus), "sales_line_status": optionalStringValue(option.SalesLineStatus), "bom_version": optionalStringValue(option.BOMVersion), "effective_from": optionalTimeUnix(option.EffectiveFrom), "effective_to": optionalTimeUnix(option.EffectiveTo),
	}
}

func productionOrderDraftFromParams(pm map[string]any) (biz.ProductionOrderDraft, string, bool) {
	orderNo, ok := productionOrderRequiredString(pm, "order_no", 64)
	if !ok {
		return biz.ProductionOrderDraft{}, "", false
	}
	key, ok := productionOrderRequiredString(pm, "idempotency_key", 128)
	if !ok {
		return biz.ProductionOrderDraft{}, "", false
	}
	start, ok := productionOrderOptionalUnixTime(pm, "planned_start_at")
	if !ok {
		return biz.ProductionOrderDraft{}, "", false
	}
	end, ok := productionOrderOptionalUnixTime(pm, "planned_end_at")
	if !ok {
		return biz.ProductionOrderDraft{}, "", false
	}
	note, ok := productionOrderOptionalString(pm, "note", 255)
	if !ok {
		return biz.ProductionOrderDraft{}, "", false
	}
	rawItems, exists := pm["items"]
	items, ok := rawItems.([]any)
	if !exists || !ok || len(items) == 0 {
		return biz.ProductionOrderDraft{}, "", false
	}
	draftItems := make([]biz.ProductionOrderDraftItem, 0, len(items))
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok || !productionOrderAllowsOnly(item, "line_no", "product_id", "product_sku_id", "unit_id", "planned_quantity", "sales_order_item_id", "bom_header_id", "route_code", "customer_inspection_required", "note") {
			return biz.ProductionOrderDraft{}, "", false
		}
		lineNo, ok1 := productionOrderRequiredPositiveInt(item, "line_no")
		productID, ok2 := productionOrderRequiredPositiveInt(item, "product_id")
		unitID, ok3 := productionOrderRequiredPositiveInt(item, "unit_id")
		quantity, ok4 := productionOrderRequiredDecimalString(item, "planned_quantity")
		skuID, ok5 := productionOrderOptionalPositiveInt(item, "product_sku_id")
		salesLineID, ok6 := productionOrderOptionalPositiveInt(item, "sales_order_item_id")
		bomID, ok7 := productionOrderOptionalPositiveInt(item, "bom_header_id")
		routeCode, ok8 := productionOrderOptionalString(item, "route_code", 64)
		customerInspectionRequired, ok9 := productionOrderOptionalBool(item, "customer_inspection_required", false)
		itemNote, ok10 := productionOrderOptionalString(item, "note", 255)
		if !ok1 || !ok2 || !ok3 || !ok4 || !ok5 || !ok6 || !ok7 || !ok8 || !ok9 || !ok10 {
			return biz.ProductionOrderDraft{}, "", false
		}
		draftItems = append(draftItems, biz.ProductionOrderDraftItem{
			LineNo: lineNo, ProductID: productID, ProductSKUID: skuID, UnitID: unitID,
			PlannedQuantity: quantity, SalesOrderItemID: salesLineID, BOMHeaderID: bomID,
			RouteCode: routeCode, CustomerInspectionRequired: customerInspectionRequired, Note: itemNote,
		})
	}
	return biz.ProductionOrderDraft{OrderNo: orderNo, PlannedStartAt: start, PlannedEndAt: end, Note: note, Items: draftItems}, key, true
}

func productionOrderFilterFromParams(pm map[string]any) (biz.ProductionOrderFilter, bool) {
	keyword, ok := productionOrderOptionalExactString(pm, "keyword")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	status, ok := productionOrderOptionalExactString(pm, "status")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	dateField, ok := productionOrderOptionalExactString(pm, "date_field")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	dateFrom, ok := productionOrderOptionalUnixTime(pm, "date_from")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	dateTo, ok := productionOrderOptionalUnixTime(pm, "date_to")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	sortBy, ok := productionOrderOptionalExactString(pm, "sort_by")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	sortDirection, ok := productionOrderOptionalExactString(pm, "sort_direction")
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	limit, ok := productionOrderOptionalNonNegativeInt(pm, "limit", 50)
	if !ok || limit < 1 || limit > 200 {
		return biz.ProductionOrderFilter{}, false
	}
	offset, ok := productionOrderOptionalNonNegativeInt(pm, "offset", 0)
	if !ok {
		return biz.ProductionOrderFilter{}, false
	}
	return biz.ProductionOrderFilter{Keyword: keyword, Status: status, DateField: dateField, DateFrom: dateFrom, DateTo: dateTo, SortBy: sortBy, SortDirection: sortDirection, Limit: limit, Offset: offset}, true
}

func productionOrderAllowsOnly(pm map[string]any, keys ...string) bool {
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

func productionOrderRPCLogSummary(pm map[string]any) map[string]any {
	out := map[string]any{}
	for _, key := range []string{"production_order_id", "expected_version", "status", "date_field", "sort_by", "sort_direction", "limit", "offset"} {
		if value, ok := pm[key]; ok {
			out[key] = value
		}
	}
	if items, ok := pm["items"].([]any); ok {
		out["item_count"] = len(items)
	}
	if _, ok := pm["idempotency_key"]; ok {
		out["idempotency_key"] = "<redacted>"
	}
	return out
}

func productionOrderRequiredString(pm map[string]any, key string, maxLen int) (string, bool) {
	raw, exists := pm[key]
	value, ok := raw.(string)
	if !exists || !ok || value != strings.TrimSpace(value) || value == "" || len(value) > maxLen {
		return "", false
	}
	return value, true
}

func productionOrderOptionalString(pm map[string]any, key string, maxLen int) (*string, bool) {
	raw, exists := pm[key]
	if !exists || raw == nil {
		return nil, true
	}
	value, ok := raw.(string)
	if !ok || value != strings.TrimSpace(value) || value == "" || len(value) > maxLen {
		return nil, false
	}
	return &value, true
}

func productionOrderOptionalBool(pm map[string]any, key string, fallback bool) (bool, bool) {
	raw, exists := pm[key]
	if !exists {
		return fallback, true
	}
	value, ok := raw.(bool)
	return value, ok
}

func productionOrderOptionalExactString(pm map[string]any, key string) (string, bool) {
	raw, exists := pm[key]
	if !exists {
		return "", true
	}
	value, ok := raw.(string)
	if !ok || value != strings.TrimSpace(value) {
		return "", false
	}
	return value, true
}

func productionOrderRequiredPositiveInt(pm map[string]any, key string) (int, bool) {
	value, ok := productionOrderJSONSafeInt(pm[key])
	return value, ok && value > 0
}

func productionOrderOptionalPositiveInt(pm map[string]any, key string) (*int, bool) {
	raw, exists := pm[key]
	if !exists || raw == nil {
		return nil, true
	}
	value, ok := productionOrderJSONSafeInt(raw)
	if !ok || value <= 0 {
		return nil, false
	}
	return &value, true
}

func productionOrderOptionalNonNegativeInt(pm map[string]any, key string, fallback int) (int, bool) {
	raw, exists := pm[key]
	if !exists {
		return fallback, true
	}
	value, ok := productionOrderJSONSafeInt(raw)
	return value, ok && value >= 0
}

func productionOrderJSONSafeInt(raw any) (int, bool) {
	const maxSafe = float64(9007199254740991)
	switch value := raw.(type) {
	case float64:
		if value < 0 || value > maxSafe || math.Trunc(value) != value {
			return 0, false
		}
		return int(value), true
	case int:
		if value < 0 || float64(value) > maxSafe {
			return 0, false
		}
		return value, true
	default:
		return 0, false
	}
}

func productionOrderOptionalUnixTime(pm map[string]any, key string) (*time.Time, bool) {
	raw, exists := pm[key]
	if !exists || raw == nil {
		return nil, true
	}
	seconds, ok := productionOrderJSONSafeInt(raw)
	if !ok || seconds <= 0 {
		return nil, false
	}
	value := time.Unix(int64(seconds), 0).UTC()
	return &value, true
}

func productionOrderRequiredDecimalString(pm map[string]any, key string) (decimal.Decimal, bool) {
	return getRequiredJSONRPCNumeric20Scale6(pm, key)
}

func (d *jsonrpcDispatcher) productionOrderAggregateResult(ctx context.Context, aggregate *biz.ProductionOrderAggregate, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapProductionOrderError(ctx, err)
	}
	if aggregate == nil || aggregate.Order == nil || aggregate.Order.ID <= 0 || aggregate.Order.Version <= 0 || len(aggregate.Items) == 0 {
		return productionOrderInternalResult()
	}
	items := make([]any, 0, len(aggregate.Items))
	for _, item := range aggregate.Items {
		items = append(items, productionOrderItemToMap(item))
	}
	return okData(map[string]any{
		"production_order":                 productionOrderToMap(aggregate.Order),
		"production_order_items":           items,
		"production_material_requirements": productionOrderMaterialRequirementsToAny(aggregate.MaterialRequirements),
		"material_requirements_state":      aggregate.MaterialRequirementsState,
	})
}

func productionOrderToMap(order *biz.ProductionOrder) map[string]any {
	if order == nil {
		return map[string]any{}
	}
	out := map[string]any{
		"id": order.ID, "order_no": order.OrderNo, "status": order.Status, "version": order.Version,
		"planned_start_at": optionalTimeUnix(order.PlannedStartAt), "planned_end_at": optionalTimeUnix(order.PlannedEndAt), "note": optionalStringValue(order.Note),
		"close_reason": optionalStringValue(order.CloseReason), "cancel_reason": optionalStringValue(order.CancelReason), "created_by": order.CreatedBy,
		"released_by": optionalIntValue(order.ReleasedBy), "closed_by": optionalIntValue(order.ClosedBy), "cancelled_by": optionalIntValue(order.CancelledBy),
		"released_at": optionalTimeUnix(order.ReleasedAt), "closed_at": optionalTimeUnix(order.ClosedAt), "cancelled_at": optionalTimeUnix(order.CancelledAt),
		"created_at": order.CreatedAt.Unix(), "updated_at": order.UpdatedAt.Unix(),
	}
	if order.ItemCount != nil {
		out["item_count"] = *order.ItemCount
	}
	return out
}

func productionOrderItemToMap(item *biz.ProductionOrderItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": item.ID, "production_order_id": item.ProductionOrderID, "line_no": item.LineNo, "product_id": item.ProductID,
		"product_sku_id": optionalIntValue(item.ProductSKUID), "unit_id": item.UnitID, "planned_quantity": item.PlannedQuantity.String(),
		"sales_order_item_id": optionalIntValue(item.SalesOrderItemID), "bom_header_id": optionalIntValue(item.BOMHeaderID),
		"route_code": optionalStringValue(item.RouteCode), "customer_inspection_required": item.CustomerInspectionRequired,
		"product_code_snapshot": optionalStringValue(item.ProductCodeSnapshot), "product_name_snapshot": optionalStringValue(item.ProductNameSnapshot),
		"sku_code_snapshot": optionalStringValue(item.SKUCodeSnapshot), "unit_name_snapshot": optionalStringValue(item.UnitNameSnapshot),
		"bom_version_snapshot": optionalStringValue(item.BOMVersionSnapshot), "note": optionalStringValue(item.Note),
		"created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix(),
	}
}

func (d *jsonrpcDispatcher) mapProductionOrderError(ctx context.Context, err error) *v1.JsonrpcResult {
	logger := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrProductionOrderConflict):
		return &v1.JsonrpcResult{Code: errcode.ResourceVersionConflict.Code, Message: errcode.ResourceVersionConflict.Message}
	case errors.Is(err, biz.ErrIdempotencyConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: errcode.IdempotencyConflict.Message}
	case errors.Is(err, biz.ErrProductionOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单不存在"}
	case errors.Is(err, biz.ErrProductionOrderReferenceInvalid), errors.Is(err, biz.ErrProductionOrderFactSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单引用的产品、规格、单位、销售明细或 BOM 已失效，请刷新后检查"}
	case errors.Is(err, biz.ErrProductionOrderHasPostedFacts):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该生产订单已有生效的生产入库记录，不能取消；请先按业务规则冲正或关闭"}
	case errors.Is(err, biz.ErrProductionOrderFactDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单仍有未过账或未取消的领料、完工或返工记录，请先处理后再关闭或取消"}
	case errors.Is(err, biz.ErrProductionOrderCloseReasonRequired):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产数量尚未全部完成，请填写短关闭原因"}
	case errors.Is(err, biz.ErrProductionOrderSchedulingTaskRequired):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该生产订单缺少来源生成的排产任务，不能继续；请检查订单发布链路"}
	case errors.Is(err, biz.ErrProductionOrderSchedulingTaskActive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "排产任务尚未结束，请先到生产订单或任务中心完成处理"}
	case errors.Is(err, biz.ErrProductionOrderWIPActive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "仍有未结束的在制批次，请先完成对应工序、外发回仓或质量处理后再关闭生产订单"}
	case errors.Is(err, biz.ErrProductionOrderQuantityExceeded), errors.Is(err, biz.ErrProductionOrderInvalidState), errors.Is(err, biz.ErrBadParam):
		return invalidParamResult()
	default:
		logger.Errorf("[production_order] operation failed classification=internal err=%v", err)
		return productionOrderInternalResult()
	}
}

func productionOrderInternalResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
}
