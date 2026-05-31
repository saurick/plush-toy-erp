package data

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

func (d *JsonrpcData) handleMasterData(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.masterDataUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_customer", "createCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateCustomer(ctx, customerMutationFromParams(pm))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil
	case "update_customer", "updateCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateCustomer(ctx, getInt(pm, "id", 0), customerMutationFromParams(pm))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil
	case "get_customer", "getCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetCustomer(ctx, getInt(pm, "id", 0))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil
	case "list_customers", "listCustomers":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListCustomers(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"customers": customersToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_customer_active", "setCustomerActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetCustomerActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil

	case "create_supplier", "createSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateSupplier(ctx, supplierMutationFromParams(pm))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "update_supplier", "updateSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateSupplier(ctx, getInt(pm, "id", 0), supplierMutationFromParams(pm))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "get_supplier", "getSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetSupplier(ctx, getInt(pm, "id", 0))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "list_suppliers", "listSuppliers":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListSuppliers(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"suppliers": suppliersToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_supplier_active", "setSupplierActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetSupplierActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, supplierMutationResult(ctx, d, item, err), nil

	case "create_contact", "createContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateContact(ctx, contactMutationFromParams(pm))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "update_contact", "updateContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateContact(ctx, getInt(pm, "id", 0), contactMutationFromParams(pm))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "get_contact", "getContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "list_contacts_by_owner", "listContactsByOwner":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListContactsByOwner(ctx, biz.ContactFilter{
			OwnerType:  getString(pm, "owner_type"),
			OwnerID:    getInt(pm, "owner_id", 0),
			ActiveOnly: getBool(pm, "active_only", false),
			Limit:      getInt(pm, "limit", 50),
			Offset:     getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"contacts": contactsToAny(items),
			"total":    total,
			"limit":    normalizedLimit(pm),
			"offset":   normalizedOffset(pm),
		})}, nil
	case "set_primary_contact", "setPrimaryContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactSetPrimary); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetPrimaryContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "disable_contact", "disableContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.DisableContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 masterdata 接口 method=%s", method),
		}, nil
	}
}

func (d *JsonrpcData) handleSalesOrder(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.salesOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_sales_order", "createSalesOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderCreate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.CreateSalesOrder(ctx, in)
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "update_sales_order", "updateSalesOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderUpdate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.UpdateSalesOrder(ctx, getInt(pm, "id", 0), in)
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "get_sales_order", "getSalesOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		item, err := d.salesOrderUC.GetSalesOrder(ctx, getInt(pm, "id", 0))
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "list_sales_orders", "listSalesOrders":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.salesOrderUC.ListSalesOrders(ctx, biz.SalesOrderFilter{
			Keyword:         getString(pm, "keyword"),
			CustomerID:      getInt(pm, "customer_id", 0),
			LifecycleStatus: getString(pm, "lifecycle_status"),
			Limit:           getInt(pm, "limit", 50),
			Offset:          getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"sales_orders": salesOrdersToAny(items),
			"total":        total,
			"limit":        normalizedLimit(pm),
			"offset":       normalizedOffset(pm),
		})}, nil
	case "submit_sales_order", "submitSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderSubmit, d.salesOrderUC.SubmitSalesOrder)
	case "activate_sales_order", "activateSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderActivate, d.salesOrderUC.ActivateSalesOrder)
	case "close_sales_order", "closeSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderClose, d.salesOrderUC.CloseSalesOrder)
	case "cancel_sales_order", "cancelSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderCancel, d.salesOrderUC.CancelSalesOrder)
	case "add_sales_order_item", "addSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCreate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderItemMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.AddSalesOrderItem(ctx, in)
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "update_sales_order_item", "updateSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemUpdate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderItemMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.salesOrderUC.UpdateSalesOrderItem(ctx, getInt(pm, "id", 0), in)
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "remove_sales_order_item", "removeSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCancel); res != nil {
			return id, res, nil
		}
		item, err := d.salesOrderUC.RemoveSalesOrderItem(ctx, getInt(pm, "id", 0))
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "list_sales_order_items", "listSalesOrderItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.salesOrderUC.ListSalesOrderItems(ctx, biz.SalesOrderItemFilter{
			SalesOrderID: getInt(pm, "sales_order_id", 0),
			LineStatus:   getString(pm, "line_status"),
			Limit:        getInt(pm, "limit", 50),
			Offset:       getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"sales_order_items": salesOrderItemsToAny(items),
			"total":             total,
			"limit":             normalizedLimit(pm),
			"offset":            normalizedOffset(pm),
		})}, nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 sales_order 接口 method=%s", method),
		}, nil
	}
}

func (d *JsonrpcData) handleSalesOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	permission string,
	action func(context.Context, int) (*biz.SalesOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	item, err := action(ctx, getInt(pm, "id", 0))
	return id, salesOrderMutationResult(ctx, d, item, err), nil
}

func customerMutationFromParams(pm map[string]any) *biz.CustomerMutation {
	return &biz.CustomerMutation{
		Code:      getString(pm, "code"),
		Name:      getString(pm, "name"),
		ShortName: getWorkflowStringPtr(pm, "short_name"),
		TaxNo:     getWorkflowStringPtr(pm, "tax_no"),
		Note:      getWorkflowStringPtr(pm, "note"),
	}
}

func supplierMutationFromParams(pm map[string]any) *biz.SupplierMutation {
	return &biz.SupplierMutation{
		Code:         getString(pm, "code"),
		Name:         getString(pm, "name"),
		ShortName:    getWorkflowStringPtr(pm, "short_name"),
		SupplierType: getWorkflowStringPtr(pm, "supplier_type"),
		TaxNo:        getWorkflowStringPtr(pm, "tax_no"),
		Note:         getWorkflowStringPtr(pm, "note"),
	}
}

func contactMutationFromParams(pm map[string]any) *biz.ContactMutation {
	return &biz.ContactMutation{
		OwnerType: getString(pm, "owner_type"),
		OwnerID:   getInt(pm, "owner_id", 0),
		Name:      getString(pm, "name"),
		Phone:     getWorkflowStringPtr(pm, "phone"),
		Mobile:    getWorkflowStringPtr(pm, "mobile"),
		Email:     getWorkflowStringPtr(pm, "email"),
		Title:     getWorkflowStringPtr(pm, "title"),
		IsPrimary: getBool(pm, "is_primary", false),
		Note:      getWorkflowStringPtr(pm, "note"),
	}
}

func masterDataFilterFromParams(pm map[string]any) biz.MasterDataFilter {
	return biz.MasterDataFilter{
		Keyword:    getString(pm, "keyword"),
		ActiveOnly: getBool(pm, "active_only", false),
		Limit:      getInt(pm, "limit", 50),
		Offset:     getInt(pm, "offset", 0),
	}
}

func salesOrderMutationFromParams(pm map[string]any) (*biz.SalesOrderMutation, bool) {
	orderDate, ok := getRequiredJSONRPCTime(pm, "order_date")
	if !ok {
		return nil, false
	}
	plannedDeliveryDate, ok := getOptionalJSONRPCTime(pm, "planned_delivery_date")
	if !ok {
		return nil, false
	}
	return &biz.SalesOrderMutation{
		OrderNo:             getString(pm, "order_no"),
		CustomerID:          getInt(pm, "customer_id", 0),
		CustomerOrderNo:     getWorkflowStringPtr(pm, "customer_order_no"),
		CustomerSnapshot:    getMap(pm, "customer_snapshot"),
		OrderDate:           orderDate,
		PlannedDeliveryDate: plannedDeliveryDate,
		Note:                getWorkflowStringPtr(pm, "note"),
	}, true
}

func salesOrderItemMutationFromParams(pm map[string]any) (*biz.SalesOrderItemMutation, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "ordered_quantity")
	if !ok {
		return nil, false
	}
	unitPrice, ok := getOptionalJSONRPCDecimal(pm, "unit_price")
	if !ok {
		return nil, false
	}
	amount, ok := getOptionalJSONRPCDecimal(pm, "amount")
	if !ok {
		return nil, false
	}
	plannedDeliveryDate, ok := getOptionalJSONRPCTime(pm, "planned_delivery_date")
	if !ok {
		return nil, false
	}
	return &biz.SalesOrderItemMutation{
		SalesOrderID:        getInt(pm, "sales_order_id", 0),
		LineNo:              getInt(pm, "line_no", 0),
		ProductID:           getInt(pm, "product_id", 0),
		UnitID:              getInt(pm, "unit_id", 0),
		ProductCodeSnapshot: getWorkflowStringPtr(pm, "product_code_snapshot"),
		ProductNameSnapshot: getWorkflowStringPtr(pm, "product_name_snapshot"),
		ColorSnapshot:       getWorkflowStringPtr(pm, "color_snapshot"),
		OrderedQuantity:     quantity,
		UnitPrice:           unitPrice,
		Amount:              amount,
		PlannedDeliveryDate: plannedDeliveryDate,
		Note:                getWorkflowStringPtr(pm, "note"),
	}, true
}

func (d *JsonrpcData) mapMasterDataError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[masterdata] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrCustomerNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "客户不存在"}
	case errors.Is(err, biz.ErrSupplierNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "供应商不存在"}
	case errors.Is(err, biz.ErrContactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "联系人不存在"}
	default:
		l.Errorf("[masterdata] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func (d *JsonrpcData) mapSalesOrderError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[sales_order] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrSalesOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单不存在"}
	case errors.Is(err, biz.ErrSalesOrderItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单行不存在"}
	case errors.Is(err, biz.ErrCustomerNotFound), errors.Is(err, biz.ErrCustomerInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "客户不存在或已停用"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品不存在或已停用"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "单位不存在或已停用"}
	default:
		l.Errorf("[sales_order] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func masterDataMutationResult(ctx context.Context, d *JsonrpcData, key string, item *biz.Customer, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{key: customerToMap(item)})}
}

func supplierMutationResult(ctx context.Context, d *JsonrpcData, item *biz.Supplier, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"supplier": supplierToMap(item)})}
}

func contactMutationResult(ctx context.Context, d *JsonrpcData, item *biz.Contact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"contact": contactToMap(item)})}
}

func salesOrderMutationResult(ctx context.Context, d *JsonrpcData, item *biz.SalesOrder, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapSalesOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_order": salesOrderToMap(item)})}
}

func salesOrderItemMutationResult(ctx context.Context, d *JsonrpcData, item *biz.SalesOrderItem, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapSalesOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"sales_order_item": salesOrderItemToMap(item)})}
}

func customerToMap(item *biz.Customer) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"code":       item.Code,
		"name":       item.Name,
		"short_name": optionalStringValue(item.ShortName),
		"tax_no":     optionalStringValue(item.TaxNo),
		"is_active":  item.IsActive,
		"note":       optionalStringValue(item.Note),
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func customersToAny(items []*biz.Customer) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, customerToMap(item))
	}
	return out
}

func supplierToMap(item *biz.Supplier) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":            item.ID,
		"code":          item.Code,
		"name":          item.Name,
		"short_name":    optionalStringValue(item.ShortName),
		"supplier_type": optionalStringValue(item.SupplierType),
		"tax_no":        optionalStringValue(item.TaxNo),
		"is_active":     item.IsActive,
		"note":          optionalStringValue(item.Note),
		"created_at":    item.CreatedAt.Unix(),
		"updated_at":    item.UpdatedAt.Unix(),
	}
}

func suppliersToAny(items []*biz.Supplier) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, supplierToMap(item))
	}
	return out
}

func contactToMap(item *biz.Contact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"owner_type": item.OwnerType,
		"owner_id":   item.OwnerID,
		"name":       item.Name,
		"phone":      optionalStringValue(item.Phone),
		"mobile":     optionalStringValue(item.Mobile),
		"email":      optionalStringValue(item.Email),
		"title":      optionalStringValue(item.Title),
		"is_primary": item.IsPrimary,
		"is_active":  item.IsActive,
		"note":       optionalStringValue(item.Note),
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func contactsToAny(items []*biz.Contact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, contactToMap(item))
	}
	return out
}

func salesOrderToMap(item *biz.SalesOrder) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                    item.ID,
		"order_no":              item.OrderNo,
		"customer_id":           item.CustomerID,
		"customer_order_no":     optionalStringValue(item.CustomerOrderNo),
		"customer_snapshot":     item.CustomerSnapshot,
		"order_date":            item.OrderDate.Unix(),
		"planned_delivery_date": optionalTimeUnix(item.PlannedDeliveryDate),
		"lifecycle_status":      item.LifecycleStatus,
		"note":                  optionalStringValue(item.Note),
		"created_at":            item.CreatedAt.Unix(),
		"updated_at":            item.UpdatedAt.Unix(),
	}
}

func salesOrdersToAny(items []*biz.SalesOrder) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, salesOrderToMap(item))
	}
	return out
}

func salesOrderItemToMap(item *biz.SalesOrderItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                    item.ID,
		"sales_order_id":        item.SalesOrderID,
		"line_no":               item.LineNo,
		"product_id":            item.ProductID,
		"unit_id":               item.UnitID,
		"product_code_snapshot": optionalStringValue(item.ProductCodeSnapshot),
		"product_name_snapshot": optionalStringValue(item.ProductNameSnapshot),
		"color_snapshot":        optionalStringValue(item.ColorSnapshot),
		"ordered_quantity":      item.OrderedQuantity.String(),
		"unit_price":            optionalDecimalString(item.UnitPrice),
		"amount":                optionalDecimalString(item.Amount),
		"planned_delivery_date": optionalTimeUnix(item.PlannedDeliveryDate),
		"line_status":           item.LineStatus,
		"note":                  optionalStringValue(item.Note),
		"created_at":            item.CreatedAt.Unix(),
		"updated_at":            item.UpdatedAt.Unix(),
	}
}

func salesOrderItemsToAny(items []*biz.SalesOrderItem) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, salesOrderItemToMap(item))
	}
	return out
}

func getMap(pm map[string]any, key string) map[string]any {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return map[string]any{}
	}
	if value, ok := raw.(map[string]any); ok {
		return value
	}
	return map[string]any{}
}

func getRequiredJSONRPCTime(pm map[string]any, key string) (time.Time, bool) {
	if _, ok := pm[key]; !ok {
		return time.Time{}, false
	}
	return parseJSONRPCTime(pm[key])
}

func getOptionalJSONRPCTime(pm map[string]any, key string) (*time.Time, bool) {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil, true
	}
	parsed, ok := parseJSONRPCTime(raw)
	if !ok {
		return nil, false
	}
	return &parsed, true
}

func parseJSONRPCTime(raw any) (time.Time, bool) {
	switch value := raw.(type) {
	case float64:
		if value <= 0 {
			return time.Time{}, false
		}
		return time.Unix(int64(value), 0).UTC(), true
	case int:
		if value <= 0 {
			return time.Time{}, false
		}
		return time.Unix(int64(value), 0).UTC(), true
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return time.Time{}, false
		}
		for _, layout := range []string{time.RFC3339, "2006-01-02"} {
			if parsed, err := time.Parse(layout, text); err == nil {
				return parsed, true
			}
		}
		return time.Time{}, false
	default:
		return time.Time{}, false
	}
}

func getRequiredJSONRPCDecimal(pm map[string]any, key string) (decimal.Decimal, bool) {
	if _, ok := pm[key]; !ok {
		return decimal.Zero, false
	}
	return parseJSONRPCDecimal(pm[key])
}

func getOptionalJSONRPCDecimal(pm map[string]any, key string) (*decimal.Decimal, bool) {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil, true
	}
	parsed, ok := parseJSONRPCDecimal(raw)
	if !ok {
		return nil, false
	}
	return &parsed, true
}

func parseJSONRPCDecimal(raw any) (decimal.Decimal, bool) {
	switch value := raw.(type) {
	case float64:
		return decimal.NewFromFloat(value), true
	case int:
		return decimal.NewFromInt(int64(value)), true
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return decimal.Zero, false
		}
		parsed, err := decimal.NewFromString(text)
		return parsed, err == nil
	default:
		return decimal.Zero, false
	}
}

func optionalStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalDecimalString(value *decimal.Decimal) any {
	if value == nil {
		return nil
	}
	return value.String()
}

func optionalTimeUnix(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Unix()
}

func normalizedLimit(pm map[string]any) int {
	limit := getInt(pm, "limit", 50)
	if limit <= 0 || limit > 200 {
		return 50
	}
	return limit
}

func normalizedOffset(pm map[string]any) int {
	offset := getInt(pm, "offset", 0)
	if offset < 0 {
		return 0
	}
	return offset
}
