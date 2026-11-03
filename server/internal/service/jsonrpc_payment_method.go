package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handlePaymentMethodSuggestions(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_payment_methods":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionCustomerRead, biz.PermissionSupplierRead, biz.PermissionSalesOrderRead, biz.PermissionPurchaseOrderRead); res != nil {
			return id, res, nil
		}
		filter := biz.PaymentMethodFilter{Keyword: getString(pm, "keyword")}
		for _, source := range []struct {
			permission string
			allowed    *bool
		}{
			{biz.PermissionCustomerRead, &filter.Customers},
			{biz.PermissionSupplierRead, &filter.Suppliers},
			{biz.PermissionSalesOrderRead, &filter.SalesOrders},
			{biz.PermissionPurchaseOrderRead, &filter.PurchaseOrders},
		} {
			allowed, res := d.AdminHasPermission(ctx, source.permission)
			if res != nil {
				return id, res, nil
			}
			*source.allowed = allowed
		}
		result, err := d.masterDataUC.ListPaymentMethods(ctx, filter)
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		canManage, res := d.AdminHasPermission(ctx, biz.PermissionPaymentMethodManage)
		if res != nil {
			return id, res, nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"methods":                 toAnySliceString(result.Methods),
			"has_more":                result.HasMore,
			"keyword_not_recommended": result.KeywordNotRecommended,
			"can_manage":              canManage,
		})}, nil
	case "list_payment_method_recommendations":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPaymentMethodManage); res != nil {
			return id, res, nil
		}
		recommended, valid := getRequiredJSONRPCBool(pm, "is_recommended")
		if !valid {
			return id, invalidParamResult(), nil
		}
		offset, valid := getOptionalJSONRPCNonNegativeInt(pm, "offset")
		if !valid {
			return id, invalidParamResult(), nil
		}
		filter := biz.PaymentMethodRecommendationFilter{Keyword: getString(pm, "keyword"), IsRecommended: recommended, Limit: getInt(pm, "limit", biz.PaymentMethodSuggestionLimit)}
		if offset != nil {
			filter.Offset = *offset
		}
		items, more, err := d.masterDataUC.ListPaymentMethodRecommendations(ctx, filter)
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		values := make([]any, 0, len(items))
		for _, item := range items {
			values = append(values, paymentMethodRecommendationToAny(item))
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"items": values, "has_more": more})}, nil
	case "set_payment_method_recommendation":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPaymentMethodManage); res != nil {
			return id, res, nil
		}
		recommended, valid := getRequiredJSONRPCBool(pm, "is_recommended")
		if !valid {
			return id, invalidParamResult(), nil
		}
		version, valid := getRequiredJSONRPCNonNegativeInt(pm, "expected_version")
		if !valid {
			return id, invalidParamResult(), nil
		}
		operator, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetPaymentMethodRecommendation(ctx, operator, biz.PaymentMethodRecommendationChange{Method: getString(pm, "method"), IsRecommended: recommended, ExpectedVersion: version})
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"item": paymentMethodRecommendationToAny(*item)})}, nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func paymentMethodRecommendationToAny(item biz.PaymentMethodRecommendation) map[string]any {
	return map[string]any{"method": item.Method, "is_recommended": item.IsRecommended, "version": item.Version}
}
