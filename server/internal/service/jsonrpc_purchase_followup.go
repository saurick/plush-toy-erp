package service

import (
	"context"
	"encoding/json"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handlePurchaseFollowups(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptRead, biz.PermissionWarehouseInboundRead); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, "purchase_orders", "purchase_receipts"); res != nil {
		return id, res, nil
	}
	if !sourceOrderAllowsOnly(pm, "view", "kind", "keyword", "confirmation", "start_date", "selected_date", "supplier_id", "order_id", "limit", "offset") {
		return id, invalidParamResult(), nil
	}
	q := biz.PurchaseFollowupQuery{}
	for key, dest := range map[string]*string{"view": &q.View, "kind": &q.Kind, "keyword": &q.Keyword, "confirmation": &q.Confirmation, "start_date": &q.StartDate, "selected_date": &q.SelectedDate} {
		value, res := getOptionalWorkflowTaskBoardString(pm, key, 100)
		if res != nil {
			return id, res, nil
		}
		*dest = value
	}
	for key, dest := range map[string]*int{"supplier_id": &q.SupplierID, "order_id": &q.OrderID, "offset": &q.Offset} {
		value, ok := getOptionalWorkflowTaskBoardInteger(pm, key, 0, 0)
		if !ok {
			return id, invalidParamResult(), nil
		}
		*dest = value
	}
	var ok bool
	if q.Limit, ok = getOptionalWorkflowTaskBoardInteger(pm, "limit", 25, 1); !ok {
		return id, invalidParamResult(), nil
	}
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return id, res, nil
	}
	keys := biz.PermissionKeySet(permissions)
	q.Access.Quality = biz.PermissionSetHasAny(keys, biz.PermissionQualityInspectionRead) && d.requireCustomerConfigModulesReadable(ctx, "quality_inspections") == nil
	q.Access.Commercial = biz.PermissionSetHasAny(keys, biz.PermissionFieldProcurementCommercialRead)
	q.Access.Finance = q.Access.Quality && q.Access.Commercial && biz.PermissionSetHasAny(keys, biz.PermissionFinancePayableRead) && d.requireCustomerConfigModulesReadable(ctx, "finance") == nil
	q.WarehouseScope, res = d.currentWarehouseDataScope(ctx)
	if res != nil {
		return id, res, nil
	}
	result, err := d.purchaseOrderUC.ListPurchaseFollowups(ctx, q)
	if errors.Is(err, biz.ErrForbidden) {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	if err != nil {
		return id, d.mapPurchaseOrderError(ctx, err), nil
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return id, nil, err
	}
	data := map[string]any{}
	if err = json.Unmarshal(encoded, &data); err != nil {
		return id, nil, err
	}
	data["limit"], data["offset"] = q.Limit, q.Offset
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(data)}, nil
}
