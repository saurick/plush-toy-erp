package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handlePaymentMethodSuggestions(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if method == "list_payment_methods" {
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionCustomerRead, biz.PermissionSupplierRead, biz.PermissionSalesOrderRead, biz.PermissionPurchaseOrderRead, biz.PermissionPaymentMethodManage); res != nil {
			return id, res, nil
		}
		result, err := d.masterDataUC.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Keyword: getString(pm, "keyword")})
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		canManage, res := d.AdminHasPermission(ctx, biz.PermissionPaymentMethodManage)
		if res != nil {
			return id, res, nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"methods": toAnySliceString(result.Methods), "has_more": result.HasMore, "keyword_exists": result.KeywordExists, "keyword_inactive": result.KeywordInactive, "can_manage": canManage})}, nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionPaymentMethodManage); res != nil {
		return id, res, nil
	}
	if method == "list_payment_method_options" {
		active, valid := getRequiredJSONRPCBool(pm, "is_active")
		if !valid {
			return id, invalidParamResult(), nil
		}
		offset, valid := getOptionalJSONRPCNonNegativeInt(pm, "offset")
		if !valid {
			return id, invalidParamResult(), nil
		}
		filter := biz.PaymentMethodOptionFilter{Keyword: getString(pm, "keyword"), IsActive: active, Limit: getInt(pm, "limit", biz.PaymentMethodSuggestionLimit)}
		if offset != nil {
			filter.Offset = *offset
		}
		items, more, err := d.masterDataUC.ListPaymentMethodOptions(ctx, filter)
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		values := make([]any, 0, len(items))
		for _, item := range items {
			values = append(values, paymentMethodOptionToAny(item))
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"items": values, "has_more": more})}, nil
	}
	operator, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	var item *biz.PaymentMethodOption
	var err error
	switch method {
	case "create_payment_method":
		item, err = d.masterDataUC.CreatePaymentMethod(ctx, operator, getString(pm, "method"))
	case "update_payment_method", "delete_payment_method":
		optionID, valid := getRequiredJSONRPCNonNegativeInt(pm, "id")
		if !valid || optionID <= 0 {
			return id, invalidParamResult(), nil
		}
		version, valid := getRequiredJSONRPCNonNegativeInt(pm, "expected_version")
		if !valid || version <= 0 {
			return id, invalidParamResult(), nil
		}
		if method == "delete_payment_method" {
			err = d.masterDataUC.DeletePaymentMethod(ctx, operator, optionID, version)
			if err != nil {
				return id, d.mapMasterDataError(ctx, err), nil
			}
			return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"deleted_id": optionID})}, nil
		}
		active, valid := getRequiredJSONRPCBool(pm, "is_active")
		if !valid {
			return id, invalidParamResult(), nil
		}
		item, err = d.masterDataUC.UpdatePaymentMethod(ctx, operator, biz.PaymentMethodOptionChange{ID: optionID, Method: getString(pm, "method"), IsActive: active, ExpectedVersion: version})
	default:
		return id, unknownMasterDataResult(method), nil
	}
	if err != nil {
		return id, d.mapMasterDataError(ctx, err), nil
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"item": paymentMethodOptionToAny(*item)})}, nil
}

func paymentMethodOptionToAny(item biz.PaymentMethodOption) map[string]any {
	return map[string]any{"id": item.ID, "method": item.Method, "is_active": item.IsActive, "has_been_used": item.HasBeenUsed, "version": item.Version}
}
