package service

import (
	"context"
	"google.golang.org/protobuf/types/known/structpb"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
)

func (d *jsonrpcDispatcher) handlePartner(ctx context.Context, method, id string, params *structpb.Struct) (string, *v1.JsonrpcResult, error) {
	account, err := biz.CurrentPartner(ctx)
	if err != nil {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	pm := params.AsMap()
	if d.partnerUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}
	switch method {
	case "me":
		if !jsonRPCParamsAllowed(pm) {
			return id, invalidParamResult(), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"partner": partnerAccountToMap(account)})}, nil
	case "list_purchase_orders":
		if res := d.requirePartnerOrderModule(ctx, account, biz.AccountKindSupplier, "purchase_orders"); res != nil {
			return id, res, nil
		}
		filter, valid := partnerOrderFilter(pm)
		if !valid {
			return id, invalidParamResult(), nil
		}
		orders, total, err := d.partnerUC.ListPurchaseOrders(ctx, filter)
		if err != nil {
			return id, d.mapPurchaseOrderError(ctx, err), nil
		}
		rows := make([]any, 0, len(orders))
		for _, order := range orders {
			rows = append(rows, partnerPurchaseOrderToMap(order))
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"purchase_orders": rows, "total": total})}, nil
	case "get_purchase_order":
		if res := d.requirePartnerOrderModule(ctx, account, biz.AccountKindSupplier, "purchase_orders"); res != nil {
			return id, res, nil
		}
		orderID, valid := getRequiredJSONRPCPositiveInt(pm, "id")
		if !valid || !jsonRPCParamsAllowed(pm, "id") {
			return id, invalidParamResult(), nil
		}
		result, err := d.partnerUC.GetPurchaseOrder(ctx, orderID)
		if err != nil {
			return id, d.mapPurchaseOrderError(ctx, err), nil
		}
		items := make([]any, 0, len(result.Items))
		for _, item := range result.Items {
			items = append(items, map[string]any{"id": item.ID, "line_no": item.LineNo, "unit_id": item.UnitID, "material_code": optionalStringValue(item.MaterialCodeSnapshot), "material_name": optionalStringValue(item.MaterialNameSnapshot), "color": optionalStringValue(item.ColorSnapshot), "quantity": item.PurchasedQuantity.String(), "unit_price": optionalDecimalString(item.UnitPrice), "amount": optionalDecimalString(item.Amount), "expected_arrival_date": optionalUnix(item.ExpectedArrivalDate)})
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"purchase_order": partnerPurchaseOrderToMap(result.Order), "items": items})}, nil
	case "list_sales_orders":
		if res := d.requirePartnerOrderModule(ctx, account, biz.AccountKindCustomer, "sales_orders"); res != nil {
			return id, res, nil
		}
		filter, valid := partnerOrderFilter(pm)
		if !valid {
			return id, invalidParamResult(), nil
		}
		orders, total, err := d.partnerUC.ListSalesOrders(ctx, filter)
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		rows := make([]any, 0, len(orders))
		for _, order := range orders {
			rows = append(rows, partnerSalesOrderToMap(order))
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_orders": rows, "total": total})}, nil
	case "get_sales_order":
		if res := d.requirePartnerOrderModule(ctx, account, biz.AccountKindCustomer, "sales_orders"); res != nil {
			return id, res, nil
		}
		orderID, valid := getRequiredJSONRPCPositiveInt(pm, "id")
		if !valid || !jsonRPCParamsAllowed(pm, "id") {
			return id, invalidParamResult(), nil
		}
		result, err := d.partnerUC.GetSalesOrder(ctx, orderID)
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		items := make([]any, 0, len(result.Items))
		for _, item := range result.Items {
			items = append(items, map[string]any{"id": item.ID, "line_no": item.LineNo, "unit_id": item.UnitID, "customer_product_no": optionalStringValue(item.CustomerProductNo), "product_name": optionalStringValue(item.ProductNameSnapshot), "requested_product_name": optionalStringValue(item.RequestedProductName), "color": optionalStringValue(item.ColorSnapshot), "quantity": item.OrderedQuantity.String(), "unit_price": optionalDecimalString(item.UnitPrice), "amount": optionalDecimalString(item.Amount), "planned_delivery_date": optionalTimeUnix(item.PlannedDeliveryDate)})
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_order": partnerSalesOrderToMap(result.Order), "items": items})}, nil
	}
	return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
}

func (d *jsonrpcDispatcher) requirePartnerOrderModule(ctx context.Context, account *biz.AdminUser, kind biz.AccountKind, module string) *v1.JsonrpcResult {
	if account.AccountKind != kind {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	return d.requireCustomerConfigModulesReadable(ctx, module)
}

func partnerOrderFilter(pm map[string]any) (biz.PartnerOrderFilter, bool) {
	f := biz.PartnerOrderFilter{Limit: 20}
	if !jsonRPCParamsAllowed(pm, "keyword", "limit", "offset") {
		return f, false
	}
	if value, exists := pm["keyword"]; exists {
		var valid bool
		f.Keyword, valid = value.(string)
		if !valid || len(f.Keyword) > 255 {
			return f, false
		}
		f.Keyword = strings.TrimSpace(f.Keyword)
	}
	if _, exists := pm["limit"]; exists {
		var valid bool
		f.Limit, valid = getRequiredJSONRPCPositiveInt(pm, "limit")
		if !valid || f.Limit > 100 {
			return f, false
		}
	}
	if _, exists := pm["offset"]; exists {
		var valid bool
		f.Offset, valid = getOptionalJSONRPCID(pm, "offset")
		if !valid {
			return f, false
		}
	}
	return f, true
}

func partnerAccountToMap(a *biz.AdminUser) map[string]any {
	return map[string]any{"id": a.ID, "username": a.Username, "display_name": a.DisplayName, "account_kind": a.AccountKind.String(), "supplier_id": optionalIntValue(a.SupplierID), "customer_id": optionalIntValue(a.CustomerID)}
}
func partnerPurchaseOrderToMap(a *biz.PurchaseOrder) map[string]any {
	return map[string]any{"id": a.ID, "order_no": a.PurchaseOrderNo, "supplier_purchase_order_no": optionalStringValue(a.SupplierPurchaseOrderNo), "currency": a.Currency, "purchase_date": a.PurchaseDate.Unix(), "expected_arrival_date": optionalUnix(a.ExpectedArrivalDate), "lifecycle_status": a.LifecycleStatus}
}
func partnerSalesOrderToMap(a *biz.SalesOrder) map[string]any {
	return map[string]any{"id": a.ID, "order_no": a.OrderNo, "customer_order_no": optionalStringValue(a.CustomerOrderNo), "currency": a.Currency, "order_date": a.OrderDate.Unix(), "planned_delivery_date": optionalTimeUnix(a.PlannedDeliveryDate), "lifecycle_status": a.LifecycleStatus}
}

func (d *jsonrpcDispatcher) handlePartnerAccountAdmin(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_partners":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserRead); res != nil {
			return id, res, nil
		}
		if !jsonRPCParamsAllowed(pm) {
			return id, invalidParamResult(), nil
		}
		if d.partnerUC == nil {
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		}
		accounts, err := d.partnerUC.ListAccounts(ctx)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		rows := make([]any, 0, len(accounts))
		for _, a := range accounts {
			row := partnerAccountToMap(a)
			row["disabled"] = a.Disabled
			row["status"] = string(a.AccountStatus())
			rows = append(rows, row)
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"partners": rows})}, nil
	case "create_partner":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserCreate); res != nil {
			return id, res, nil
		}
		if !jsonRPCParamsAllowed(pm, "display_name", "username", "password", "account_kind", "supplier_id", "customer_id") {
			return id, invalidParamResult(), nil
		}
		displayName, validDisplay := pm["display_name"].(string)
		username, validName := pm["username"].(string)
		password, validPassword := pm["password"].(string)
		kind, validKind := pm["account_kind"].(string)
		if !validDisplay || !validName || !validPassword || !validKind {
			return id, invalidParamResult(), nil
		}
		binding := biz.PartnerBinding{}
		switch kind {
		case "supplier":
			if _, exists := pm["customer_id"]; exists {
				return id, invalidParamResult(), nil
			}
			supplierID, valid := getRequiredJSONRPCPositiveInt(pm, "supplier_id")
			if !valid {
				return id, invalidParamResult(), nil
			}
			binding.Kind, binding.SupplierID = biz.AccountKindSupplier, &supplierID
		case "customer":
			if _, exists := pm["supplier_id"]; exists {
				return id, invalidParamResult(), nil
			}
			customerID, valid := getRequiredJSONRPCPositiveInt(pm, "customer_id")
			if !valid {
				return id, invalidParamResult(), nil
			}
			binding.Kind, binding.CustomerID = biz.AccountKindCustomer, &customerID
		default:
			return id, invalidParamResult(), nil
		}

		account, err := d.adminManageUC.CreatePartner(ctx, displayName, username, password, binding)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"partner": partnerAccountToMap(account)})}, nil
	}
	return id, invalidParamResult(), nil
}
