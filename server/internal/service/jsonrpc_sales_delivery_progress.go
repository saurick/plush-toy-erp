package service

import (
	"context"
	"encoding/json"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleSalesDeliveryProgress(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemRead); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, "sales_orders"); res != nil {
		return id, res, nil
	}
	if !jsonRPCParamsAllowed(pm, "id", "limit", "offset") {
		return id, invalidParamResult(), nil
	}
	orderID, okID := getRequiredJSONRPCPositiveInt(pm, "id")
	limit, okLimit := getOptionalWorkflowTaskBoardInteger(pm, "limit", biz.WorkCenterDefaultLimit, 1)
	offset, okOffset := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !okID || !okLimit || !okOffset {
		return id, invalidParamResult(), nil
	}
	var scope *biz.WorkflowTaskVisibilityScope
	permissions, res := d.CurrentAdminPermissions(ctx)
	if res != nil {
		return id, res, nil
	}
	if biz.PermissionSetHasAny(biz.PermissionKeySet(permissions), biz.PermissionWorkflowTaskRead) {
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		scope, res = d.workflowTaskReadVisibilityScope(ctx, admin)
		if res != nil {
			return id, res, nil
		}
	}
	if d.businessProgressUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}
	payload, err := d.businessProgressUC.SalesDelivery(ctx, orderID, limit, offset, scope)
	if err != nil {
		if result := canceledRequestResult(ctx, err); result != nil {
			return id, result, nil
		}
		switch {
		case errors.Is(err, biz.ErrBadParam):
			return id, invalidParamResult(), nil
		case errors.Is(err, biz.ErrSalesOrderNotFound):
			return id, &v1.JsonrpcResult{Code: errcode.ResourceNotFound.Code, Message: "未找到对应的销售订单"}, nil
		case errors.Is(err, biz.ErrForbidden):
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		default:
			d.log.WithContext(ctx).Errorf("[sales_order] delivery progress read failed err=%v", err)
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return id, nil, err
	}
	var data map[string]any
	if err := json.Unmarshal(encoded, &data); err != nil {
		return id, nil, err
	}
	return id, okData(data), nil
}
