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
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	dashboardDenial := d.RequireAdminPermission(ctx, biz.PermissionERPBusinessDashboardRead)
	salesDelivery := dashboardDenial != nil && dashboardDenial.Code == errcode.PermissionDenied.Code &&
		method == "list_progress" && getString(pm, "view") == "orders" && getString(pm, "display") == "lines"
	if dashboardDenial != nil && !salesDelivery {
		return id, dashboardDenial, nil
	}
	allowed := []string{"view", "keyword", "scope", "due_status", "blocked_only", "unlinked_only", "owner", "date_from", "date_to", "limit", "offset", "id", "customer_id", "display", "delivery_status"}
	if method == "list_progress" {
		allowed = append(allowed, "sort_by", "sort_direction", "owner_name")
	}
	if method == "list_progress_owner_options" {
		allowed = []string{"view"}
	}
	if method == "list_progress_tasks" {
		allowed = []string{"view", "id", "limit", "offset", "task_status", "owner_role_key"}
	}
	if res := rejectUnknownWorkflowTaskParams(pm, method, allowed...); res != nil {
		return id, res, nil
	}
	q := biz.BusinessProgressQuery{}
	if method == "list_progress_tasks" {
		var res *v1.JsonrpcResult
		if q.TaskStatus, res = getOptionalWorkflowTaskBoardString(pm, "task_status", 20); res != nil {
			return id, res, nil
		}
		if q.TaskRole, res = getOptionalWorkflowTaskBoardString(pm, "owner_role_key", 64); res != nil {
			return id, res, nil
		}
	}
	if method == "list_progress" {
		var res *v1.JsonrpcResult
		q.OwnerName, res = getOptionalWorkflowTaskBoardString(pm, "owner_name", 128)
		if res != nil {
			return id, res, nil
		}
		q.SortBy, res = getOptionalWorkflowTaskBoardString(pm, "sort_by", 32)
		if res != nil {
			return id, res, nil
		}
		q.SortDirection, res = getOptionalWorkflowTaskBoardString(pm, "sort_direction", 4)
		if res != nil {
			return id, res, nil
		}
	}
	for key, dest := range map[string]*string{"view": &q.View, "keyword": &q.Keyword, "scope": &q.Scope, "due_status": &q.DueStatus, "owner": &q.Owner, "date_from": &q.DateFrom, "date_to": &q.DateTo, "display": &q.Display, "delivery_status": &q.DeliveryStatus} {
		value, res := getOptionalWorkflowTaskBoardString(pm, key, 100)
		if res != nil {
			return id, res, nil
		}
		*dest = value
	}
	var ok bool
	for key, dest := range map[string]*bool{"blocked_only": &q.BlockedOnly, "unlinked_only": &q.UnlinkedOnly} {
		if value, exists := pm[key]; exists {
			if *dest, ok = value.(bool); !ok {
				return id, invalidParamResult(), nil
			}
		}
	}
	if q.Limit, ok = getOptionalWorkflowTaskBoardInteger(pm, "limit", biz.WorkCenterDefaultLimit, 1); !ok {
		return id, invalidParamResult(), nil
	}
	if q.Offset, ok = getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0); !ok {
		return id, invalidParamResult(), nil
	}
	if method == "list_progress" {
		q.ID, ok = getOptionalWorkflowTaskBoardInteger(pm, "id", 0, 0)
	} else if method != "list_progress_owner_options" {
		q.ID, ok = getRequiredJSONRPCPositiveInt(pm, "id")
	}
	if !ok {
		return id, invalidParamResult(), nil
	}
	if q.CustomerID, ok = getOptionalWorkflowTaskBoardInteger(pm, "customer_id", 0, 0); !ok {
		return id, invalidParamResult(), nil
	}
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return id, res, nil
	}
	keys := biz.PermissionKeySet(permissions)
	q.Access.Sales = biz.PermissionSetHasAny(keys, biz.PermissionSalesOrderRead) && biz.PermissionSetHasAny(keys, biz.PermissionSalesOrderItemRead) &&
		d.requireCustomerConfigModulesReadable(ctx, "sales_orders") == nil
	if salesDelivery {
		if !q.Access.Sales {
			return id, dashboardDenial, nil
		}
		if q.BlockedOnly || q.UnlinkedOnly || q.Owner != "" || q.OwnerName != "" {
			return id, invalidParamResult(), nil
		}
	} else {
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
	}
	if q.View == "" && q.Display == "" && q.CustomerID == 0 && !q.Access.Sales && q.Access.Production {
		q.View = "production"
	}
	var result any
	var err error
	switch method {
	case "list_progress_owner_options":
		result, err = d.businessProgressUC.Owners(ctx, q)
	case "get_progress":
		result, err = d.businessProgressUC.Detail(ctx, q)
	case "list_progress_tasks":
		result, err = d.businessProgressUC.Tasks(ctx, q)
	default:
		result, err = d.businessProgressUC.List(ctx, q)
	}
	if err != nil {
		if result := canceledRequestResult(ctx, err); result != nil {
			return id, result, nil
		}
		switch {
		case errors.Is(err, biz.ErrForbidden):
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		case errors.Is(err, biz.ErrBadParam):
			return id, invalidParamResult(), nil
		case errors.Is(err, biz.ErrSalesOrderNotFound), errors.Is(err, biz.ErrProductionOrderNotFound):
			return id, &v1.JsonrpcResult{Code: errcode.ResourceNotFound.Code, Message: "记录不存在，请刷新进度列表"}, nil
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
