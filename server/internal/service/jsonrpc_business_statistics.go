package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"google.golang.org/protobuf/types/known/structpb"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleBusinessStatistics(ctx context.Context, method, id string, params *structpb.Struct) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionERPBusinessDashboardRead); res != nil {
		return id, res, nil
	}
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	allowed := []string{"group_by", "currency", "keyword", "period", "date_from", "date_to", "status", "sort", "direction", "limit", "offset"}
	sources := strings.HasSuffix(method, "_sources")
	if sources {
		allowed = append(allowed, "group_key", "source_status")
	}
	if res := rejectUnknownWorkflowTaskParams(pm, method, allowed...); res != nil {
		return id, res, nil
	}
	q := biz.BusinessStatisticsQuery{Report: "delivery"}
	if strings.Contains(method, "receivable") {
		q.Report = "receivables"
	}
	for key, dest := range map[string]*string{"group_by": &q.GroupBy, "currency": &q.Currency, "keyword": &q.Keyword, "period": &q.Period, "date_from": &q.DateFrom, "date_to": &q.DateTo, "status": &q.Status, "sort": &q.Sort, "direction": &q.Direction, "group_key": &q.GroupKey, "source_status": &q.SourceStatus} {
		value, res := getOptionalWorkflowTaskBoardString(pm, key, 100)
		if res != nil {
			return id, res, nil
		}
		*dest = value
	}
	var ok bool
	if q.Limit, ok = getOptionalWorkflowTaskBoardInteger(pm, "limit", 10, 1); !ok {
		return id, invalidParamResult(), nil
	}
	if q.Offset, ok = getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0); !ok {
		return id, invalidParamResult(), nil
	}
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return id, res, nil
	}
	keys := biz.PermissionKeySet(permissions)
	q.Access.Sales = biz.PermissionSetHasAny(keys, biz.PermissionSalesOrderRead) && biz.PermissionSetHasAny(keys, biz.PermissionSalesOrderItemRead) && d.requireCustomerConfigModulesReadable(ctx, "sales_orders") == nil
	q.Access.SalesAmounts = q.Access.Sales && biz.PermissionSetHasAny(keys, biz.PermissionFieldSalesCommercialRead)
	q.Access.Receivables = biz.PermissionSetHasAny(keys, biz.PermissionFinanceReceivableRead) && biz.PermissionSetHasAny(keys, biz.PermissionFieldFinanceSettlementRead) && d.requireCustomerConfigModulesReadable(ctx, "finance") == nil
	var result any
	var err error
	if sources {
		result, err = d.businessStatisticsUC.Sources(ctx, q)
	} else {
		result, err = d.businessStatisticsUC.Board(ctx, q)
	}
	if err != nil {
		switch {
		case errors.Is(err, biz.ErrForbidden):
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		case errors.Is(err, biz.ErrBadParam):
			return id, invalidParamResult(), nil
		default:
			d.log.WithContext(ctx).Errorf("[business] statistics query failed method=%s err=%v", method, err)
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
