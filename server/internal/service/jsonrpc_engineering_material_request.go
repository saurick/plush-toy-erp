package service

import (
	"context"
	"encoding/json"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"time"
)

func (d *jsonrpcDispatcher) handleEngineeringMaterialRequest(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := biz.PermissionEngineeringMaterialRead
	switch method {
	case "submit_engineering_material_request":
		permission = biz.PermissionEngineeringMaterialSubmit
	case "boss_review_engineering_material_request":
		permission = biz.PermissionEngineeringMaterialBossApprove
	case "finance_review_engineering_material_request":
		permission = biz.PermissionEngineeringMaterialFinanceApprove
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if method == "list_engineering_material_requests" || method == "get_engineering_material_request" || method == "finance_review_engineering_material_request" {
		if res := d.requireSourceActionReadPermissions(ctx, "sales_order", method); res != nil {
			return id, res, nil
		}
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders", "material_bom", "purchase_orders"); res != nil {
		return id, res, nil
	}
	var result any
	var err error
	taskID, taskVersion := 0, 0
	if _, exists := pm["task_id"]; exists {
		var ok bool
		taskID, ok = getRequiredJSONRPCPositiveInt(pm, "task_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		taskVersion, ok = getRequiredJSONRPCPositiveInt(pm, "expected_task_version")
		if !ok {
			return id, invalidParamResult(), nil
		}
	} else if _, exists := pm["expected_task_version"]; exists {
		return id, invalidParamResult(), nil
	}
	switch method {
	case "list_engineering_material_requests":
		if res := d.RequireAdminPermission(ctx, biz.PermissionERPWorkbenchRead); res != nil {
			return id, res, nil
		}
		if !sourceOrderAllowsOnly(pm, "customer_key", "keyword", "status", "page", "limit") {
			return id, invalidParamResult(), nil
		}
		filter := biz.EngineeringMaterialListFilter{Page: 1, Limit: 20}
		for key, target := range map[string]*int{"page": &filter.Page, "limit": &filter.Limit} {
			if _, exists := pm[key]; exists {
				value, ok := getRequiredJSONRPCPositiveInt(pm, key)
				if !ok {
					return id, invalidParamResult(), nil
				}
				*target = value
			}
		}
		for key, target := range map[string]*string{"keyword": &filter.Keyword, "status": &filter.Status} {
			if raw, exists := pm[key]; exists {
				value, ok := raw.(string)
				if !ok {
					return id, invalidParamResult(), nil
				}
				*target = value
			}
		}
		result, err = d.salesOrderUC.ListEngineeringMaterialRequests(ctx, filter)
	case "get_engineering_material_request":
		if !sourceOrderAllowsOnly(pm, "customer_key", "sales_order_id", "request_id", "preview") {
			return id, invalidParamResult(), nil
		}
		orderID, ok := getRequiredJSONRPCPositiveInt(pm, "sales_order_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		preview := false
		if value, exists := pm["preview"]; exists {
			var ok bool
			preview, ok = value.(bool)
			if !ok {
				return id, invalidParamResult(), nil
			}
		}
		if _, exists := pm["request_id"]; exists {
			requestID, ok := getRequiredJSONRPCPositiveInt(pm, "request_id")
			if !ok || preview {
				return id, invalidParamResult(), nil
			}
			result, err = d.salesOrderUC.GetEngineeringMaterialRequestByID(ctx, orderID, requestID)
		} else {
			result, err = d.salesOrderUC.GetEngineeringMaterialRequest(ctx, orderID, preview)
		}
	case "submit_engineering_material_request":
		if !sourceOrderAllowsOnly(pm, "customer_key", "sales_order_id", "expected_version", "expected_source_hash", "task_id", "expected_task_version") {
			return id, invalidParamResult(), nil
		}
		orderID, ok := getRequiredJSONRPCPositiveInt(pm, "sales_order_id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		version, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
		if !ok {
			return id, invalidParamResult(), nil
		}
		result, err = d.salesOrderUC.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: orderID, ExpectedVersion: version, ExpectedSourceHash: getString(pm, "expected_source_hash"), ActorID: actorID, WorkflowTaskID: taskID, ExpectedTaskVersion: taskVersion})
	default:
		if !sourceOrderAllowsOnly(pm, "customer_key", "id", "expected_version", "action", "note", "task_id", "expected_task_version") {
			return id, invalidParamResult(), nil
		}
		requestID, ok := getRequiredJSONRPCPositiveInt(pm, "id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		version, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
		if !ok {
			return id, invalidParamResult(), nil
		}
		action := getString(pm, "action")
		validAction := action == "REJECT" ||
			(method == "boss_review_engineering_material_request" && action == "BOSS_APPROVE") ||
			(method == "finance_review_engineering_material_request" && action == "FINANCE_APPROVE")
		if !validAction {
			return id, invalidParamResult(), nil
		}
		stage := "BOSS"
		if method == "finance_review_engineering_material_request" {
			stage = "FINANCE"
		}
		in := &biz.EngineeringMaterialReview{ReviewStage: stage, ID: requestID, ExpectedVersion: version, ActorID: actorID, Action: action, Note: getWorkflowStringPtr(pm, "note"), WorkflowTaskID: taskID, ExpectedTaskVersion: taskVersion}
		result, err = d.salesOrderUC.ReviewEngineeringMaterialRequest(ctx, in)
	}
	if err != nil {
		return id, d.mapSalesOrderError(ctx, err), nil
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return id, nil, err
	}
	data := map[string]any{}
	if err = json.Unmarshal(encoded, &data); err != nil {
		return id, nil, err
	}
	if request, ok := result.(*biz.EngineeringMaterialRequest); ok && method == "get_engineering_material_request" {
		data["inventory_reference"] = d.engineeringMaterialInventoryReference(ctx, pm, request)
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(data)}, nil
}

func (d *jsonrpcDispatcher) engineeringMaterialInventoryReference(ctx context.Context, pm map[string]any, request *biz.EngineeringMaterialRequest) map[string]any {
	if d.RequireAdminPermission(ctx, biz.PermissionWarehouseInventoryRead) != nil {
		return map[string]any{"status": "FORBIDDEN"}
	}
	if d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "inventory") != nil {
		return map[string]any{"status": "DISABLED"}
	}
	scope, denied := d.currentWarehouseDataScope(ctx)
	if denied != nil || biz.NormalizeWarehouseDataScope(scope).Mode == biz.DataScopeModeNone {
		return map[string]any{"status": "FORBIDDEN"}
	}
	ids := make([]int, 0, len(request.Items))
	for _, item := range request.Items {
		ids = append(ids, item.MaterialID)
	}
	items := []biz.MaterialStockSummary{}
	var err error
	asOf := time.Now().UTC()
	if len(ids) > 0 {
		items, err = d.inventoryUC.SummarizeMaterialStockForAccess(ctx, ids, scope)
	}
	if err != nil {
		if d.log != nil {
			d.log.WithContext(ctx).Warnw("event", "material_summary_stock_unavailable", "order_id", request.SalesOrderID)
		}
		return map[string]any{"status": "UNAVAILABLE"}
	}
	rows := make([]any, 0, len(items))
	for _, item := range items {
		rows = append(rows, map[string]any{"material_id": item.MaterialID, "unit_id": item.UnitID, "quantity": item.Quantity.String()})
	}
	return map[string]any{"status": "AVAILABLE", "scope": scope.Mode, "as_of": asOf.Format(time.RFC3339), "items": rows}
}
