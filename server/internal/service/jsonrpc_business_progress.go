package service

import (
	"context"
	"encoding/json"
	"errors"

	"google.golang.org/protobuf/types/known/structpb"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleBusinessProgress(ctx context.Context, method, id string, params *structpb.Struct) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionERPBusinessDashboardRead); res != nil {
		return id, res, nil
	}
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if res := rejectUnknownWorkflowTaskParams(pm, method, "view", "keyword", "scope", "risk", "owner", "date_from", "date_to", "limit", "offset", "id"); res != nil {
		return id, res, nil
	}
	q := biz.BusinessProgressQuery{}
	for key, dest := range map[string]*string{"view": &q.View, "keyword": &q.Keyword, "scope": &q.Scope, "risk": &q.Risk, "owner": &q.Owner, "date_from": &q.DateFrom, "date_to": &q.DateTo} {
		value, res := getOptionalWorkflowTaskBoardString(pm, key, 100)
		if res != nil {
			return id, res, nil
		}
		*dest = value
	}
	var ok bool
	if q.Limit, ok = getOptionalWorkflowTaskBoardInteger(pm, "limit", 20, 1); !ok {
		return id, invalidParamResult(), nil
	}
	if q.Offset, ok = getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0); !ok {
		return id, invalidParamResult(), nil
	}
	if q.ID, ok = getOptionalWorkflowTaskBoardInteger(pm, "id", 0, 0); !ok {
		return id, invalidParamResult(), nil
	}
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return id, res, nil
	}
	keys := biz.PermissionKeySet(permissions)
	q.Access.Sales = biz.PermissionSetHasAny(keys, biz.PermissionSalesOrderRead) && biz.PermissionSetHasAny(keys, biz.PermissionSalesOrderItemRead) &&
		d.requireCustomerConfigModulesReadable(ctx, "sales_orders") == nil
	q.Access.Production = biz.PermissionSetHasAny(keys, biz.PermissionPMCPlanRead, biz.PermissionProductionWIPRead) &&
		d.requireCustomerConfigModulesReadable(ctx, productionOrderModuleKey) == nil
	q.Access.WIP = q.Access.Production && biz.PermissionSetHasAny(keys, biz.PermissionProductionWIPRead) && d.requireCustomerConfigModulesReadable(ctx, "quality_inspections") == nil
	rbac, res := d.CurrentAdminPermissions(ctx)
	if res != nil {
		return id, res, nil
	}
	// Historical process revisions retain the task-board visibility contract.
	q.Access.Tasks = biz.PermissionSetHasAny(biz.PermissionKeySet(rbac), biz.PermissionWorkflowTaskRead)
	if q.Access.Tasks {
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		q.TaskVisibility, res = d.workflowTaskReadVisibilityScope(ctx, admin)
		if res != nil {
			return id, res, nil
		}
	}
	if q.View == "" && !q.Access.Sales && q.Access.Production {
		q.View = "production"
	}
	var result any
	var err error
	if method == "get_progress" {
		result, err = d.businessProgressUC.Detail(ctx, q)
	} else {
		result, err = d.businessProgressUC.List(ctx, q)
	}
	if err != nil {
		switch {
		case errors.Is(err, biz.ErrForbidden):
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		case errors.Is(err, biz.ErrBadParam):
			return id, invalidParamResult(), nil
		case errors.Is(err, biz.ErrSalesOrderNotFound), errors.Is(err, biz.ErrProductionOrderNotFound):
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "记录不存在，请刷新进度列表"}, nil
		default:
			d.log.WithContext(ctx).Errorf("[business] progress query failed method=%s err=%v", method, err)
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		}
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
