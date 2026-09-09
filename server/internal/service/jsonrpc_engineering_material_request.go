package service

import (
	"context"
	"encoding/json"
	"github.com/shopspring/decimal"
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
	if method == "get_engineering_material_request" || method == "finance_review_engineering_material_request" {
		if res := d.requireSourceActionReadPermissions(ctx, "sales_order", method); res != nil {
			return id, res, nil
		}
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders", "material_bom", "purchase_orders"); res != nil {
		return id, res, nil
	}
	var result *biz.EngineeringMaterialRequest
	var err error
	switch method {
	case "get_engineering_material_request":
		if !sourceOrderAllowsOnly(pm, "customer_key", "sales_order_id", "preview") {
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
		result, err = d.salesOrderUC.GetEngineeringMaterialRequest(ctx, orderID, preview)
	case "submit_engineering_material_request":
		if !sourceOrderAllowsOnly(pm, "customer_key", "sales_order_id", "expected_version", "expected_source_hash") {
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
		result, err = d.salesOrderUC.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: orderID, ExpectedVersion: version, ExpectedSourceHash: getString(pm, "expected_source_hash"), ActorID: actorID})
	default:
		if !sourceOrderAllowsOnly(pm, "customer_key", "id", "expected_version", "action", "note", "items") {
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
		in := &biz.EngineeringMaterialReview{ReviewStage: stage, ID: requestID, ExpectedVersion: version, ActorID: actorID, Action: action, Note: getWorkflowStringPtr(pm, "note")}
		if raw, exists := pm["items"]; exists {
			if action != "FINANCE_APPROVE" {
				return id, invalidParamResult(), nil
			}
			if res := d.RequireAdminPermission(ctx, biz.PermissionFieldProcurementCommercialRead); res != nil {
				return id, res, nil
			}
			items, ok := raw.([]any)
			if !ok {
				return id, invalidParamResult(), nil
			}
			for _, value := range items {
				fields, ok := value.(map[string]any)
				if !ok || !sourceOrderAllowsOnly(fields, "id", "purchase_quantity", "unit_price", "expected_arrival_date", "note") {
					return id, invalidParamResult(), nil
				}
				itemID, ok := getRequiredJSONRPCPositiveInt(fields, "id")
				if !ok {
					return id, invalidParamResult(), nil
				}
				quantity, e := decimal.NewFromString(getString(fields, "purchase_quantity"))
				if e != nil {
					return id, invalidParamResult(), nil
				}
				price, e := decimal.NewFromString(getString(fields, "unit_price"))
				if e != nil {
					return id, invalidParamResult(), nil
				}
				arrival, e := time.Parse("2006-01-02", getString(fields, "expected_arrival_date"))
				if e != nil {
					return id, invalidParamResult(), nil
				}
				in.Items = append(in.Items, biz.EngineeringMaterialFinanceLine{ID: itemID, PurchaseQuantity: quantity, UnitPrice: price, ExpectedArrivalDate: arrival, Note: getWorkflowStringPtr(fields, "note")})
			}
		}
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
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(data)}, nil
}
